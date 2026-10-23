//! Session-scoped metadata and fallback selection; no account or MCP configuration writes.
use crate::CodexAppServer;
use super::gateway::Policy;
use serde::Deserialize;
use serde_json::{Value,json};

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Params {pub thread_id:String, pub selected:Option<std::collections::BTreeSet<String>>}

pub async fn manage(client:&CodexAppServer,action:&str,params:Params)->Result<Value,String>{
    if params.thread_id.is_empty(){return Err("Select a chat first.".into());}
    let _guard=client.lock_thread_configuration(&params.thread_id).await;
    let metadata=client.send_request("thread/read",json!({"threadId":params.thread_id,"includeTurns":false})).await?;
    let busy=client.has_running_turn(&params.thread_id).await || metadata.pointer("/thread/status/type").and_then(Value::as_str)!=Some("idle");
    let snapshot=client.tool_discovery.snapshot(&params.thread_id).await;
    if snapshot["phase"]=="unavailable" {return Ok(snapshot);}
    if action!="read"&&busy {return Err("Wait for this chat to finish before changing its tools.".into());}
    if action=="select" {
        let selection=params.selected.ok_or("Select a fallback tool set.")?;
        return client.tool_discovery.select(&params.thread_id,Policy{selected:selection}).await;
    }
    if action=="recheck" {return client.tool_discovery.retry(&params.thread_id).await;}
    if !busy && snapshot["catalogReady"]!=true {
        let mut servers=Vec::new();let mut cursor=Value::Null;
        let deadline=tokio::time::Instant::now()+std::time::Duration::from_secs(30);
        for page in 0..32 {
            let result=tokio::time::timeout_at(deadline,client.send_request("mcpServerStatus/list",json!({"threadId":params.thread_id,"detail":"toolsAndAuthOnly","cursor":cursor,"limit":100}))).await
                .map_err(|_|"Tool discovery timed out. Refresh to try again.")??;
            for server in result["data"].as_array().ok_or("The CLI did not return a tool inventory.")? {
                let name=server["name"].as_str().ok_or("A tool connection has no name.")?;
                servers.push(name.to_string());
            }
            cursor=result["nextCursor"].clone();if cursor.is_null(){break;}
            if page==31 {return Err("The tool inventory exceeds its paging limit.".into());}
        }
        if servers.len()>128 {return Err("Too many tool connections to display.".into());}
        // A thread id alone uses status-only discovery in CLI 0.163.0. A server name is required
        // to query the selected thread's own connection and permission snapshot.
        let requests=servers.iter().map(|name|client.send_request("mcpServerStatus/list",json!({"threadId":params.thread_id,"serverName":name,"detail":"toolsAndAuthOnly","limit":1})));
        let results=tokio::time::timeout_at(deadline,futures::future::join_all(requests)).await.map_err(|_|"Tool discovery timed out. Refresh to try again.")?;
        let mut runtime=Vec::new();
        for result in results {runtime.extend(result?["data"].as_array().ok_or("The CLI did not return a connection inventory.")?.iter().cloned());}
        let config=client.send_request("config/read",json!({"includeLayers":false,"cwd":metadata.pointer("/thread/cwd")})).await?;
        let specs=initial_catalog(&runtime,&config["config"])?;
        client.tool_discovery.catalog(&params.thread_id,&specs).await?;
    }
    let mut snapshot=client.tool_discovery.snapshot(&params.thread_id).await;snapshot["busy"]=json!(busy);Ok(snapshot)
}

fn sanitize(value:&str)->String {value.chars().map(|c|if c.is_ascii_alphanumeric()||c=='_'{c}else{'_'}).collect()}
fn initial_catalog(servers:&[Value],config:&Value)->Result<Vec<Value>,String> {
    let feature=&config["features"]["non_prefixed_mcp_tool_names"];
    let opted=feature==true || feature["enabled"]==true;
    let listed=feature["server_names"].as_array();
    let mut result=Vec::new();
    for server in servers {
        if server["runtimeStatus"]!="connected" {continue;}
        let name=server["name"].as_str().ok_or("A tool connection has no name.")?;
        // Apps use connector identities that this public RPC does not expose. Their exact
        // declarations become selectable after the first wire request; never invent those names.
        if name=="codex_apps" || name.starts_with("codex_apps__") {continue;}
        let normalized=sanitize(name);
        if normalized.is_empty() || normalized.len()>120 || servers.iter().filter(|s|s["name"].as_str().is_some_and(|name|sanitize(name)==normalized)).count()!=1 {continue;}
        let unprefixed=opted && listed.is_none_or(|names|names.iter().any(|value|value==name));
        let namespace=if unprefixed {normalized}else{format!("mcp__{normalized}")};
        let tools=server["tools"].as_object().ok_or("A tool connection has no inventory.")?;
        let mut children=Vec::new();
        for tool in tools.values() {
            let raw=tool["name"].as_str().ok_or("A connected tool has no name.")?;
            let name=sanitize(raw);
            if name.is_empty() || name.len()>128 || tools.values().filter(|tool|tool["name"].as_str().is_some_and(|raw|sanitize(raw)==name)).count()!=1 {continue;}
            children.push(json!({"type":"function","name":name,"description":tool["description"].as_str().unwrap_or(""),"parameters":tool["inputSchema"]}));
        }
        result.push(json!({"type":"namespace","name":namespace,"tools":children}));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(name:&str)->Value {json!({"name":name,"runtimeStatus":"connected","tools":{"read":{"name":"read-file","inputSchema":{"type":"object"}}}})}
    #[test]
    fn initial_catalog_avoids_fabricated_connector_and_colliding_names() {
        let tools=initial_catalog(&[server("fixture"),server("codex_apps"),server("a-b"),server("a_b")],&json!({})).unwrap();
        assert_eq!(tools.len(),1);assert_eq!(tools[0]["name"],"mcp__fixture");assert_eq!(tools[0]["tools"][0]["name"],"read_file");
        let tools=initial_catalog(&[server("fixture")],&json!({"features":{"non_prefixed_mcp_tool_names":true}})).unwrap();
        assert_eq!(tools[0]["name"],"fixture");
    }
}
