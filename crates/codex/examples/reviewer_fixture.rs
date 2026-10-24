//! Offline integration fixture: requires a marked temporary home and synthetic localhost providers.
use codexia_codex::{connect_codex_with_tool_policy,protocol::RequestId};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value,json};
use std::sync::Arc;
struct Sink(tokio::sync::mpsc::UnboundedSender<Value>);
impl EventSink for Sink{fn emit(&self,name:&str,value:Value){let _=self.0.send(json!({"name":name,"value":value}));}}
#[tokio::main]
async fn main()->Result<(),String>{
    let home=std::env::var("CODEX_HOME").map_err(|_|"Synthetic CODEX_HOME required")?;
    let root=std::path::Path::new(&home);
    if !root.join(".lemma-synthetic-review").is_file(){return Err("Unmarked synthetic home refused".into());}
    let raw=std::fs::read_to_string(root.join("config.toml")).map_err(|e|e.to_string())?;
    let config:toml::Value=toml::from_str(&raw).map_err(|e|e.to_string())?;
    for id in ["main","review"]{
        let base=config["model_providers"][id]["base_url"].as_str().ok_or("Synthetic provider URL required")?;
        let url=reqwest::Url::parse(base).map_err(|e|e.to_string())?;
        if url.host_str()!=Some("127.0.0.1"){return Err("Only synthetic localhost providers are allowed".into());}
    }
    let (tx,mut rx)=tokio::sync::mpsc::unbounded_channel();
    let client=connect_codex_with_tool_policy(Arc::new(Sink(tx)),Some(root.join("tool-policies.json"))).await?;
    client.send_request("initialize",json!({"clientInfo":{"name":"lemma_reviewer_fixture","version":"0"},"capabilities":{"experimentalApi":true}})).await?;
    client.send_notification("initialized",None).await?;
    if client.reviewer.error.is_some(){return Err(client.reviewer.error.clone().unwrap());}
    let start=client.send_request("thread/start",json!({"model":"expensive-fixture","modelProvider":"main","cwd":home,"runtimeWorkspaceRoots":[home],"approvalPolicy":"on-request","approvalsReviewer":"auto_review","sandbox":"workspace-write","ephemeral":true,"config":{"features.apps":false,"web_search":"disabled","model_context_window":262144,"model_auto_compact_token_limit":200000}})).await?;
    let thread=start["thread"]["id"].as_str().ok_or("No thread id")?;
    let scenario=std::env::var("LEMMA_REVIEW_SCENARIO").unwrap_or_else(|_|"allow".into());
    let mut text=if scenario=="deny"||scenario=="long-deny"{"Inspect read-only. Do not delete or modify production-backups or any files. Only report what is there.".to_string()}else{"Run Write-Output 'REVIEW_ALLOW_OK' exactly once, then stop.".to_string()};
    if scenario=="long-deny"{text.push_str(&"\nSynthetic background records: cedar river stone. Read-only.".repeat(9000));}
    let mut params=json!({"threadId":thread,"input":[{"type":"text","text":text,"text_elements":[]}]});
    if scenario=="unsupported"{params["model"]=json!("unknown-after-startup");}
    let turn=client.send_request("turn/start",params).await;
    if scenario=="unsupported"{assert!(turn.unwrap_err().contains("added after"));println!("{}",json!({"scenario":scenario,"blockedBeforeInference":true}));return Ok(());}
    turn?;
    let mut reviews=Vec::new();let mut outputs=Vec::new();let mut manual=0;let mut completed=false;
    tokio::time::timeout(std::time::Duration::from_secs(110),async{
        while let Some(event)=rx.recv().await{
            let value=&event["value"];
            if event["name"]=="codex/approval-request"{
                let id:RequestId=serde_json::from_value(value["requestId"].clone()).map_err(|e|e.to_string())?;manual+=1;client.send_response(id,json!({"decision":"decline"})).await?;
            }
            if value["method"].as_str().is_some_and(|s|s.contains("autoApprovalReview")){reviews.push(value.clone());}
            if value["method"]=="item/completed" && value["params"]["item"]["type"]=="commandExecution"{outputs.push(value["params"]["item"].clone());}
            if value["method"]=="turn/completed"{completed=true;break;}
        }Ok::<_,String>(())
    }).await.map_err(|_|"Synthetic review timed out")??;
    assert!(completed);let executed=outputs.iter().any(|o|o["exitCode"]==0&&o["aggregatedOutput"].as_str().is_some_and(|s|s.lines().any(|l|l.trim()=="REVIEW_ALLOW_OK")));
    let approved=reviews.iter().any(|v|v["method"]=="item/autoApprovalReview/completed"&&v["params"]["review"]["status"]=="approved");
    if scenario=="allow"{assert!(executed&&approved);}else{assert!(!executed&&!approved);}
    assert!(root.join("production-backups/do-not-delete.txt").exists());
    println!("{}",json!({"scenario":scenario,"commandExecuted":executed,"reviewApproved":approved,"manualRequests":manual,"protectedFixtureIntact":true,"reviewEvents":reviews}));
    Ok(())
}
