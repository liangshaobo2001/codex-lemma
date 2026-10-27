//! Apply loopback transport only to a Lemma-owned thread; shared configuration stays unchanged.
use crate::CodexAppServer;
use serde_json::{Value,json};
use std::collections::BTreeMap;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct Bound { provider:String, base_url:String, address:String, attached:bool, providers:Value }
#[derive(Default)]
pub struct Bindings { entries:Mutex<BTreeMap<String,Bound>>, active:Mutex<BTreeMap<String,Option<String>>> }
pub struct PreparedStart { pending:String, bound:Bound }

fn provider(old:&Value) -> Option<&str> { old["modelProvider"].as_str().or_else(||old.pointer("/thread/modelProvider").and_then(Value::as_str)) }
fn idle(old:&Value) -> bool { old.pointer("/thread/status/type").and_then(Value::as_str)==Some("idle") }

fn toml_compatible(value:&Value) -> Value {
    match value {
        Value::Object(fields)=>Value::Object(fields.iter().filter(|(_,v)|!v.is_null()).map(|(key,v)|(key.clone(),toml_compatible(v))).collect()),
        Value::Array(items)=>Value::Array(items.iter().filter(|v|!v.is_null()).map(toml_compatible).collect()),
        value=>value.clone(),
    }
}

fn transport_config(config:&mut Value,provider:&str,address:&str,providers:&Value) {
    if !config.is_object() { *config=json!({}); }
    let mut combined=toml_compatible(providers);
    if let Some(existing)=config["model_providers"].as_object() { for (id,value) in existing { combined[id]=toml_compatible(value); } }
    combined[provider]["base_url"]=json!(address);combined[provider]["supports_websockets"]=json!(false);
    config["model_providers"]=combined;
    config["features.enable_request_compression"]=json!(false);
}

fn eligible(provider:&str,definition:&Value) -> bool {
    provider!="openai" && definition["base_url"].is_string() && definition.get("wire_api").is_none_or(|v|v=="responses")
        && definition["requires_openai_auth"]!=true && definition.get("aws").is_none_or(Value::is_null)
        && definition.get("gateway_oauth").is_none_or(Value::is_null)
}
fn auth_headers(definition:&Value) -> Vec<String> {
    let mut names=vec!["authorization".into(),"api-key".into(),"x-api-key".into()];
    for key in ["http_headers","env_http_headers"] {
        if let Some(headers)=definition[key].as_object() { names.extend(headers.keys().map(|k|k.to_lowercase())); }
    }
    names.sort();names.dedup();names
}

impl Bindings {
    pub async fn bound(&self,thread:&str)->bool {self.entries.lock().await.contains_key(thread)}
    pub async fn starting(&self,thread:&str) {self.active.lock().await.entry(thread.into()).or_insert(None);}
    pub async fn failed_start(&self,thread:&str) {let mut active=self.active.lock().await;if active.get(thread)==Some(&None){active.remove(thread);}}
    pub async fn busy(&self,thread:&str)->bool {self.active.lock().await.contains_key(thread)}
    pub async fn notification(&self,value:&Value) {
        let Some(thread)=value.pointer("/params/threadId").and_then(Value::as_str) else{return;};
        if value["method"]=="thread/closed" {self.active.lock().await.remove(thread);return;}
        let Some(turn)=value.pointer("/params/turn/id").and_then(Value::as_str) else{return;};
        let mut active=self.active.lock().await;
        if value["method"]=="turn/started" {active.insert(thread.into(),Some(turn.into()));}
        if value["method"]=="turn/completed"&&active.get(thread).is_some_and(|id|id.as_deref().is_none_or(|id|id==turn)){active.remove(thread);}
    }
    pub async fn detached(&self,thread:&str) { if let Some(bound)=self.entries.lock().await.get_mut(thread) { bound.attached=false; } }

    pub async fn prepare_start(&self,client:&CodexAppServer,params:&mut Value) -> Result<Option<PreparedStart>,String> {
        let config=client.send_raw_request("config/read",json!({"includeLayers":false,"cwd":params.get("cwd")})).await?;
        let id=params["modelProvider"].as_str().or_else(||config["config"]["model_provider"].as_str());
        let Some(id)=id.map(str::to_string) else { return Ok(None); };
        let definition=&config["config"]["model_providers"][&id];
        if !eligible(&id,definition) { return Ok(None); }
        let base=definition["base_url"].as_str().unwrap();
        let pending=format!("new:{}",uuid::Uuid::new_v4());
        let address=client.tool_discovery.register(&pending,&id,base,auth_headers(definition)).await?;
        transport_config(&mut params["config"],&id,&address,&config["config"]["model_providers"]);
        Ok(Some(PreparedStart{pending,bound:Bound{provider:id,base_url:base.into(),address,attached:true,providers:config["config"]["model_providers"].clone()}}))
    }

    pub async fn finish_start(&self,client:&CodexAppServer,start:PreparedStart,result:&Value) -> Result<(),String> {
        let thread=result.pointer("/thread/id").and_then(Value::as_str).ok_or("The CLI did not return a chat id.")?;
        client.tool_discovery.relabel(&start.pending,thread).await?;
        self.entries.lock().await.insert(thread.into(),start.bound);Ok(())
    }

    pub async fn prepare_resume(&self,client:&CodexAppServer,params:&mut Value) -> Result<(),String> {
        if params["history"].is_array() || params["path"].as_str().is_some_and(|p|!p.is_empty()) { return Ok(()); }
        let Some(thread)=params["threadId"].as_str().map(str::to_string) else { return Ok(()); };
        let existing=self.entries.lock().await.get(&thread).cloned();
        let metadata=client.send_raw_request("thread/read",json!({"threadId":thread,"includeTurns":false})).await?;
        let status=metadata.pointer("/thread/status/type").and_then(Value::as_str);
        if matches!(status,Some("active"|"systemError")) {
            if let Some(bound)=existing { transport_config(&mut params["config"],&bound.provider,&bound.address,&bound.providers); }
            return Ok(());
        }
        let id=params["modelProvider"].as_str().or_else(||existing.as_ref().map(|b|b.provider.as_str())).or_else(||provider(&metadata));
        let Some(id)=id.map(str::to_string) else { return Ok(()); };
        if id=="openai" {client.tool_discovery.unmanage(&thread).await;return Ok(());}
        let config=client.send_raw_request("config/read",json!({"includeLayers":false,"cwd":params.get("cwd").or_else(||metadata.pointer("/thread/cwd"))})).await?;
        let definition=&config["config"]["model_providers"][&id];
        if !eligible(&id,definition) {client.tool_discovery.unmanage(&thread).await;return Ok(());}
        let base=definition["base_url"].as_str().unwrap();
        let address=client.tool_discovery.register(&thread,&id,base,auth_headers(definition)).await?;
        let attached=existing.as_ref().is_some_and(|b|b.attached&&b.provider==id&&b.base_url==base&&b.address==address);
        self.entries.lock().await.insert(thread,Bound{provider:id.clone(),base_url:base.into(),address:address.clone(),attached,providers:config["config"]["model_providers"].clone()});
        transport_config(&mut params["config"],&id,&address,&config["config"]["model_providers"]);
        Ok(())
    }

    pub async fn after_resume(&self,client:&CodexAppServer,method:&str,params:&Value,old:Value) -> Result<Value,String> {
        let Some(thread)=old.pointer("/thread/id").and_then(Value::as_str) else { return Ok(old); };
        if !idle(&old) { return Ok(old); }
        let Some(id)=provider(&old) else { return Ok(old); };
        if id=="openai" {client.tool_discovery.unmanage(thread).await;return Ok(old);}
        let config=client.send_raw_request("config/read",json!({"includeLayers":false,"cwd":old["cwd"]})).await?;
        let definition=&config["config"]["model_providers"][id];
        if !eligible(id,definition) {client.tool_discovery.unmanage(thread).await;return Ok(old);}
        let base=definition["base_url"].as_str().unwrap();
        if method=="thread/resume" && self.entries.lock().await.get(thread).is_some_and(|b|b.attached&&b.provider==id&&b.base_url==base) { return Ok(old); }
        // A warm resume can ignore configuration overrides. Reconnect once while idle, preserving policy.
        let model=old["model"].as_str().ok_or("The CLI did not report this chat's effective model.")?;
        let options=crate::thread_model::ModelParams{thread_id:thread.into(),model_provider:id.into(),model:model.into(),
            effort:old["reasoningEffort"].as_str().map(str::to_string),context_window:None,turn_id:None};
        let mut resume=crate::thread_model::resume_params(&old,&options)?;
        if let Some(overrides)=params["config"].as_object() {
            for (key,value) in overrides { resume["config"][key]=value.clone(); }
        }
        let mut closing=client.detach_for_reconnect(thread).await?;
        let address=client.tool_discovery.register(thread,id,base,auth_headers(definition)).await?;
        transport_config(&mut resume["config"],id,&address,&config["config"]["model_providers"]);
        let changed=closing.resume(||client.send_raw_request("thread/resume",resume.clone())).await?;
        if changed["modelProvider"]!=id || changed["model"]!=model { return Err("Tool discovery could not preserve the chat's provider and model.".into()); }
        let mut settings=json!({"threadId":thread});
        for key in ["disabledPluginIds","collaborationMode"] { if let Some(value)=old.get(key).filter(|v|!v.is_null()) { settings[key]=value.clone(); } }
        if settings.as_object().unwrap().len()>1 { client.send_raw_request("thread/settings/update",settings).await?; }
        let confirmed=client.send_raw_request("thread/resume",json!({"threadId":thread,"excludeTurns":true})).await?;
        for key in ["model","modelProvider","cwd","approvalPolicy","approvalsReviewer","sandbox","runtimeWorkspaceRoots","disabledPluginIds"] {
            if let Some(expected)=old.get(key) && confirmed.get(key)!=Some(expected) { return Err(format!("Tool discovery could not preserve {key}.")); }
        }
        self.entries.lock().await.insert(thread.into(),Bound{provider:id.into(),base_url:base.into(),address,attached:true,providers:config["config"]["model_providers"].clone()});
        Ok(confirmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn official_and_signed_auth_transports_are_not_rerouted() {
        let ordinary=json!({"base_url":"http://127.0.0.1:1/v1","wire_api":"responses"});
        assert!(eligible("custom",&ordinary));assert!(!eligible("openai",&ordinary));
        let mut signed=ordinary;signed["aws"]=json!({});assert!(!eligible("custom",&signed));
    }
    #[test]
    fn runtime_overrides_quote_provider_ids_and_preserve_unrelated_selection() {
        let mut config=json!({"features.apps":false,"model_context_window":262144});
        transport_config(&mut config,"provider.with.dots","http://127.0.0.1:1/fixture",&json!({"provider.with.dots":{"name":"Fixture"},"other":{"name":"Other"}}));
        assert_eq!(config["model_providers"]["provider.with.dots"]["base_url"],"http://127.0.0.1:1/fixture");
        assert_eq!(config["model_providers"]["other"]["name"],"Other");
        assert_eq!(config["features.apps"],false);assert_eq!(config["model_context_window"],262144);
    }
    #[test]
    fn nullable_api_metadata_does_not_become_invalid_toml_authentication() {
        let value=toml_compatible(&json!({"name":"Fixture","auth":null,"headers":{"authorization":"fixture"},"aws":null}));
        assert!(value.get("auth").is_none());assert!(value.get("aws").is_none());assert_eq!(value["headers"]["authorization"],"fixture");
    }
}
