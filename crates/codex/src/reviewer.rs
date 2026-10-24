//! Lemma-only approval reviewer. Credentials never enter the settings API or catalog.
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{collections::BTreeSet,path::{Path,PathBuf}};
use reqwest::header::{HeaderMap,HeaderName,HeaderValue};

pub const ALIAS:&str="lemma-internal-approval-reviewer";
#[derive(Clone,Debug,Default,PartialEq,Eq,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Settings { pub independent:bool, pub provider:String, pub model:String, pub context_window:u64, pub effort:String }
impl Settings {
    pub fn validate(&self)->Result<(),String>{
        if !self.independent{return Ok(());}
        if self.provider.trim().is_empty() || self.provider=="openai" || self.model.trim().is_empty() || self.model.starts_with("lemma-internal-") {return Err("Choose a custom Responses provider and reviewer model.".into());}
        if self.model.len()>256 || self.provider.len()>256 || !(1024..=1_048_576).contains(&self.context_window) {return Err("Reviewer context must be between 1,024 and 1,048,576 tokens.".into());}
        if !["none","minimal","low","medium","high","xhigh"].contains(&self.effort.as_str()){return Err("Choose a supported reasoning effort.".into());}
        Ok(())
    }
}
#[derive(Clone)]
pub struct Target {pub provider:String,pub model:String,pub base_url:String,pub effort:String,pub headers:HeaderMap}
pub struct Runtime {
    confirmed:tokio::sync::Mutex<std::collections::BTreeMap<String,Value>>,
    pub path:PathBuf, pub active:Settings, pub error:Option<String>, pub target:Option<Target>,
    pub catalog:Option<tempfile::NamedTempFile>, pub parent_models:BTreeSet<String>,
}
fn read_settings(path:&Path)->Result<Settings,String>{
    match std::fs::read(path) {
        Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"Reviewer settings could not be read.".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(Settings{context_window:32768,effort:"low".into(),..Default::default()}),
        Err(_)=>Err("Reviewer settings are unavailable.".into()),
    }
}
fn base_config()->Result<Value,String>{
    let path=crate::config::get_config_path()?;
    let text=std::fs::read_to_string(path).map_err(|_|"Cannot read the provider configuration.")?;
    let config:toml::Value=toml::from_str(&text).map_err(|_|"Cannot parse the provider configuration.")?;
    serde_json::to_value(config).map_err(|e|e.to_string())
}
pub fn eligible(provider:&str,definition:&Value)->bool{
    provider!="openai" && definition["base_url"].is_string() && definition.get("wire_api").is_none_or(|v|v=="responses")
        && definition["requires_openai_auth"]!=true && definition.get("aws").is_none_or(Value::is_null)
        && definition.get("gateway_oauth").is_none_or(Value::is_null)
}
fn header(headers:&mut HeaderMap,name:&str,value:&str)->Result<(),String>{
    headers.insert(HeaderName::from_bytes(name.as_bytes()).map_err(|_|"Invalid reviewer header name.")?,HeaderValue::from_str(value).map_err(|_|"Invalid reviewer header value.")?);Ok(())
}
fn environment(name:&str)->Result<String,String>{crate::env::get_env(name.to_string()).map_err(|_|"A reviewer credential environment variable is missing.".into())}
fn target(settings:&Settings,config:&Value)->Result<Target,String>{
    settings.validate()?;
    let definition=&config["model_providers"][&settings.provider];
    if !eligible(&settings.provider,definition){return Err("Independent approval review requires a custom Responses provider with API-key or local authentication.".into());}
    let base=definition["base_url"].as_str().unwrap();
    let url=reqwest::Url::parse(base).map_err(|_|"Invalid reviewer URL.")?;
    if !matches!(url.scheme(),"http"|"https") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some(){return Err("Reviewer URL must be an HTTP base URL without credentials, query or fragment.".into());}
    let mut headers=HeaderMap::new();
    header(&mut headers,"content-type","application/json")?;header(&mut headers,"accept","text/event-stream")?;
    header(&mut headers,"user-agent",&format!("codex-lemma/{}",env!("CARGO_PKG_VERSION")))?;
    if let Some(values)=definition["http_headers"].as_object(){for (name,value) in values{header(&mut headers,name,value.as_str().ok_or("Invalid reviewer header." )?)?;}}
    if let Some(values)=definition["env_http_headers"].as_object(){for (name,value) in values{header(&mut headers,name,&environment(value.as_str().ok_or("Invalid reviewer environment header.")?)?)?;}}
    let token=if let Some(token)=definition["experimental_bearer_token"].as_str().filter(|s|!s.is_empty()){Some(token.to_string())}
        else if let Some(name)=definition["env_key"].as_str().filter(|s|!s.is_empty()){Some(environment(name)?)}else{None};
    if let Some(token)=token{header(&mut headers,"authorization",&format!("Bearer {token}"))?;}
    // Construct from the target's configuration only. Parent account/auth headers never cross providers.
    Ok(Target{provider:settings.provider.clone(),model:settings.model.clone(),base_url:base.into(),effort:settings.effort.clone(),headers})
}
fn fallback(slug:&str)->Value{
    json!({"slug":slug,"display_name":slug,"description":null,"supported_reasoning_levels":[],"shell_type":"unified_exec","visibility":"hide","supported_in_api":true,"priority":99,
        "availability_nux":null,"upgrade":null,"model_messages":{"instructions_template":include_str!("../assets/codex-0.163.0/prompt.md")},
        "include_apps_usage_instructions":false,"support_verbosity":false,"default_verbosity":null,"apply_patch_tool_type":null,"truncation_policy":{"mode":"bytes","limit":10000},
        "context_window":272000,"max_context_window":272000,"experimental_supported_tools":[],"supports_search_tool":false})
}
fn catalog(config:&Value,settings:&Settings,custom:&Value)->Result<Value,String>{
    let mut source=if let Some(path)=config["model_catalog_json"].as_str(){
        let path=Path::new(path);let path=if path.is_absolute(){path.to_path_buf()}else{crate::codex_home().join(path)};
        serde_json::from_slice::<Value>(&std::fs::read(path).map_err(|_|"The configured model catalog could not be read.")?).map_err(|_|"The configured model catalog is invalid.")?
    }else{
        let cache=std::fs::read(crate::codex_home().join("models_cache.json")).ok().and_then(|b|serde_json::from_slice::<Value>(&b).ok()).filter(|v|v["models"].as_array().is_some_and(|m|!m.is_empty()));
        cache.unwrap_or_else(||serde_json::from_str(include_str!("../assets/codex-0.163.0/models.json")).unwrap())
    };
    let models=source["models"].as_array_mut().filter(|models|!models.is_empty()).ok_or("The model catalog has no model entries.")?;
    if let Some(providers)=custom.as_object(){for list in providers.values().filter_map(Value::as_array){for model in list {
        if let Some(id)=model["id"].as_str().filter(|id|!id.starts_with("lemma-internal-")) && !models.iter().any(|m|m["slug"]==id){
            let mut entry=fallback(id);if let Some(context)=model["contextWindow"].as_u64(){entry["context_window"]=json!(context);entry["max_context_window"]=json!(context);}models.push(entry);
        }
    }}}
    if let Some(id)=config["model"].as_str() && !models.iter().any(|m|m["slug"]==id){models.push(fallback(id));}
    let known=models.iter().find(|model|model["slug"]==settings.model);
    if known.and_then(|m|m["max_context_window"].as_u64().or_else(||m["context_window"].as_u64())).is_some_and(|limit|settings.context_window>limit){return Err("The approval budget exceeds this model's declared context window.".into());}
    let mut reviewer=known.cloned().unwrap_or_else(||fallback(&settings.model));
    reviewer["slug"]=json!(ALIAS);reviewer["display_name"]=json!("Approval reviewer (internal)");reviewer["visibility"]=json!("hide");
    reviewer["context_window"]=json!(settings.context_window);reviewer["max_context_window"]=json!(settings.context_window);
    reviewer["auto_compact_token_limit"]=Value::Null;reviewer["auto_review_model_override"]=Value::Null;
    reviewer["supported_reasoning_levels"]=json!([{"effort":settings.effort,"description":"Configured approval-review effort"}]);reviewer["default_reasoning_level"]=json!(settings.effort);
    for model in models.iter_mut(){model["auto_review_model_override"]=json!(ALIAS);}
    models.push(reviewer);Ok(source)
}
impl Runtime {
    pub fn prepare(path:PathBuf)->Self{
        let read=read_settings(&path);
        let mut result=Self{confirmed:tokio::sync::Mutex::new(std::collections::BTreeMap::new()),path,active:read.clone().unwrap_or_default(),error:read.err(),target:None,catalog:None,parent_models:BTreeSet::new()};
        if result.error.is_some() || !result.active.independent{return result;}
        let setup=(||{
            let config=base_config()?;let target=target(&result.active,&config)?;
            let custom_path=result.path.parent().unwrap().join("custom-models.json");
            let custom=match std::fs::read(custom_path){Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"The custom model list is invalid.")?,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>json!({}),Err(_)=>return Err("The custom model list cannot be read.".into())};
            let data=catalog(&config,&result.active,&custom)?;
            let parents=data["models"].as_array().unwrap().iter().filter_map(|m|m["slug"].as_str()).filter(|s|*s!=ALIAS).map(str::to_string).collect();
            let mut file=tempfile::NamedTempFile::new().map_err(|_|"Cannot create a private reviewer catalog.")?;
            std::io::Write::write_all(&mut file,&serde_json::to_vec(&data).map_err(|e|e.to_string())?).map_err(|_|"Cannot write the private reviewer catalog.")?;
            Ok::<_,String>((target,file,parents))
        })();
        match setup {Ok((target,file,parents))=>{result.target=Some(target);result.catalog=Some(file);result.parent_models=parents;},Err(error)=>result.error=Some(error)}
        result
    }
    pub fn default_path()->Result<PathBuf,String>{dirs::home_dir().map(|h|h.join(".codex-lemma/reviewer.json")).ok_or("Application settings directory is unavailable.".into())}
    pub fn status(&self)->Result<Value,String>{let saved=read_settings(&self.path)?;Ok(json!({"saved":saved,"active":self.active,"restartRequired":saved!=self.active,"error":self.error,"routingReady":self.target.is_some()}))}
    pub fn save(&self,settings:&Settings)->Result<Value,String>{
        settings.validate()?;if settings.independent{target(settings,&base_config()?)?;}
        let parent=self.path.parent().ok_or("Invalid reviewer settings directory.")?;std::fs::create_dir_all(parent).map_err(|_|"Cannot create the reviewer settings directory.")?;
        let mut temporary=tempfile::NamedTempFile::new_in(parent).map_err(|_|"Cannot save reviewer settings.")?;
        std::io::Write::write_all(&mut temporary,&serde_json::to_vec_pretty(settings).map_err(|e|e.to_string())?).map_err(|_|"Cannot save reviewer settings.")?;
        temporary.persist(&self.path).map_err(|_|"Cannot save reviewer settings.")?;self.status()
    }
    pub async fn observe(&self,method:&str,params:&Value,result:&Value){
        if !self.active.independent && self.error.is_none(){return;}
        let mut confirmed=self.confirmed.lock().await;
        if method=="thread/unsubscribe" {if let Some(id)=params["threadId"].as_str(){confirmed.remove(id);}return;}
        if matches!(method,"thread/start"|"thread/resume"|"thread/fork"){
            if let Some(id)=result.pointer("/thread/id").and_then(Value::as_str){
                let mut entry=json!({});for key in ["model","modelProvider","cwd","approvalsReviewer"]{if let Some(value)=result.get(key){entry[key]=value.clone();}}
                confirmed.insert(id.into(),entry);
            }
        }else if matches!(method,"turn/start"|"thread/settings/update"|"turn/settings/update") && result.get("status").is_none_or(|s|s=="applied")
            && let Some(id)=params["threadId"].as_str() && let Some(entry)=confirmed.get_mut(id){
            for key in ["model","cwd","approvalsReviewer"]{if let Some(value)=params.get(key).filter(|v|!v.is_null()){entry[key]=value.clone();}}
            if let Some(model)=params.pointer("/collaborationMode/settings/model").filter(|v|v.is_string()){entry["model"]=model.clone();}
        }
    }
    pub async fn guard(&self,client:&crate::CodexAppServer,method:&str,params:&Value)->Result<(),String>{
        if !self.active.independent && self.error.is_none(){return Ok(());}
        if !matches!(method,"turn/start"|"turn/settings/update"|"thread/settings/update"|"thread/start"){return Ok(());}
        if params["approvalsReviewer"]=="user" {return Ok(());}
        let current=if let Some(id)=params["threadId"].as_str(){
            let cached=self.confirmed.lock().await.get(id).cloned();
            match cached{Some(value)=>value,None=>client.send_raw_request("thread/resume",json!({"threadId":id,"excludeTurns":true})).await?}
        }else{json!({})};
        let reviewer=params["approvalsReviewer"].as_str().or_else(||current["approvalsReviewer"].as_str());
        if reviewer!=Some("auto_review"){return Ok(());}
        if let Some(error)=&self.error{return Err(format!("Independent approval review is unavailable: {error} Select manual approval or correct the settings and restart Lemma."));}
        let config=client.send_raw_request("config/read",json!({"includeLayers":false,"cwd":params.get("cwd").or_else(||current.get("cwd"))})).await?;
        let provider=params["modelProvider"].as_str().or_else(||current["modelProvider"].as_str()).or_else(||config["config"]["model_provider"].as_str()).unwrap_or("openai");
        if !eligible(provider,&config["config"]["model_providers"][provider]){return Err("Independent approval review is unavailable for this main provider. Choose manual approval or a custom Responses provider.".into());}
        let model=params["model"].as_str().or_else(||params.pointer("/collaborationMode/settings/model").and_then(Value::as_str)).or_else(||current["model"].as_str()).or_else(||config["config"]["model"].as_str()).unwrap_or("");
        if !self.parent_models.contains(model){return Err("This main model was added after the reviewer catalog loaded. Restart Lemma or use manual approval.".into());}
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn settings()->Settings{Settings{independent:true,provider:"review".into(),model:"cheap".into(),context_window:32768,effort:"none".into()}}
    #[test] fn credentials_are_target_only_and_signed_auth_is_rejected(){
        let config=json!({"model_providers":{"review":{"base_url":"http://127.0.0.1:1/v1","experimental_bearer_token":"review-only","http_headers":{"x-review-key":"target"}}}});
        let target=target(&settings(),&config).unwrap();assert_eq!(target.headers["authorization"],"Bearer review-only");assert_eq!(target.headers["x-review-key"],"target");assert!(!target.headers.contains_key("chatgpt-account-id"));
        let mut signed=config;signed["model_providers"]["review"]["requires_openai_auth"]=json!(true);assert!(super::target(&settings(),&signed).is_err());
    }
    #[test] fn separate_budget_and_effort_do_not_change_main_metadata(){
        let data=catalog(&json!({"model":"expensive"}),&settings(),&json!({"main":[{"id":"expensive","contextWindow":262144}]})).unwrap();
        let models=data["models"].as_array().unwrap();let main=models.iter().find(|m|m["slug"]=="expensive").unwrap();let review=models.iter().find(|m|m["slug"]==ALIAS).unwrap();
        assert_eq!(main["context_window"],262144);assert_eq!(main["auto_review_model_override"],ALIAS);assert_eq!(review["context_window"],32768);assert_eq!(review["visibility"],"hide");assert_eq!(review["supported_reasoning_levels"][0]["effort"],"none");assert!(review["auto_review_model_override"].is_null());
    }
    #[test] fn invalid_settings_and_internal_models_fail_closed(){let mut s=settings();s.context_window=0;assert!(s.validate().is_err());s=settings();s.model=ALIAS.into();assert!(s.validate().is_err());}
    #[test] fn default_and_pending_restart_are_distinct(){
        let dir=tempfile::tempdir().unwrap();let runtime=Runtime::prepare(dir.path().join("reviewer.json"));assert!(!runtime.status().unwrap()["restartRequired"].as_bool().unwrap());
        let changed=Settings{effort:"none".into(),context_window:65536,..runtime.active.clone()};let saved=runtime.save(&changed).unwrap();assert_eq!(saved["restartRequired"],true);assert_eq!(saved["active"]["contextWindow"],32768);
    }
    #[tokio::test] async fn ephemeral_configuration_tracks_confirmed_changes_without_storing_history(){
        let dir=tempfile::tempdir().unwrap();let mut runtime=Runtime::prepare(dir.path().join("reviewer.json"));runtime.active.independent=true;
        runtime.observe("thread/start",&json!({}),&json!({"thread":{"id":"ephemeral","turns":["private history"]},"model":"first","modelProvider":"main","approvalsReviewer":"auto_review"})).await;
        assert!(runtime.confirmed.lock().await["ephemeral"].get("thread").is_none());
        runtime.observe("thread/settings/update",&json!({"threadId":"ephemeral","model":"second"}),&json!({})).await;
        assert_eq!(runtime.confirmed.lock().await["ephemeral"]["model"],"second");
        runtime.observe("turn/settings/update",&json!({"threadId":"ephemeral","model":"rejected"}),&json!({"status":"rejected"})).await;
        assert_eq!(runtime.confirmed.lock().await["ephemeral"]["model"],"second");
        runtime.observe("thread/unsubscribe",&json!({"threadId":"ephemeral"}),&json!({})).await;assert!(runtime.confirmed.lock().await.is_empty());
    }
    #[test] fn budget_cannot_exceed_a_declared_reviewer_context(){
        let custom=json!({"review":[{"id":"cheap","contextWindow":16384}]});
        assert!(catalog(&json!({}),&settings(),&custom).unwrap_err().contains("exceeds"));
    }

}
