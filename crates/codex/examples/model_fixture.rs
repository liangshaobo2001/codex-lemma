//! Manual regression using a marked synthetic home and localhost providers only.
use std::sync::Arc;
use codexia_codex::{app_server::connect_codex_with_tool_policy, thread_model};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value, json};
struct Sink(tokio::sync::mpsc::UnboundedSender<Value>);
impl EventSink for Sink { fn emit(&self, _: &str, value: Value) { let _ = self.0.send(value); } }

async fn turn(codex: &codexia_codex::CodexAppServer, id: &str, events: &mut tokio::sync::mpsc::UnboundedReceiver<Value>) -> Result<(),String> {
    codex.send_request("turn/start", json!({"threadId":id,"input":[{"type":"text","text":"Synthetic model routing fixture.","text_elements":[]}]})).await?;
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        while let Some(value)=events.recv().await {
            if value["method"]=="turn/completed" { assert_eq!(value["params"]["turn"]["status"],"completed");break; }
        }
    }).await.map_err(|e|e.to_string())?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(),String> {
    let home=std::env::var("CODEX_HOME").map_err(|_|"Synthetic CODEX_HOME required")?;
    if !std::path::Path::new(&home).join(".lemma-synthetic-history").is_file() { return Err("Unmarked home refused".into()); }
    let (tx,mut events)=tokio::sync::mpsc::unbounded_channel();
    let codex=connect_codex_with_tool_policy(Arc::new(Sink(tx)),Some(std::path::Path::new(&home).join("tool-policies.json"))).await?;
    codex.send_request("initialize",json!({"clientInfo":{"name":"lemma_model_regression","version":"0"},"capabilities":{"experimentalApi":true}})).await?;
    codex.send_notification("initialized",None).await?;
    let sandbox=std::env::var("LEMMA_FIXTURE_SANDBOX").unwrap_or_else(|_|"read-only".into());
    let start=codex.send_request("thread/start",json!({"cwd":home,"modelProvider":"fixture_a","model":"gpt-6.1-sol",
        "approvalPolicy":"never","sandbox":sandbox,"config":{"web_search":"disabled"}})).await?;
    let id=start["thread"]["id"].as_str().unwrap();
    turn(&codex,id,&mut events).await?;
    let mut results=Vec::new();
    for (provider,model) in [("fixture_b","deepseek-v4.1-flash"),("fixture_a","qwen-fixture"),("fixture_a","qwen-fixture-2")] {
        let result=thread_model::switch(&codex,serde_json::from_value(json!({"threadId":id,"modelProvider":provider,
            "model":model,"effort":"medium","contextWindow":262144})).unwrap()).await?;
        assert_eq!(result["thread"]["id"],id);assert_eq!(result["modelProvider"],provider);assert_eq!(result["model"],model);
        assert_eq!(result["approvalPolicy"],start["approvalPolicy"]);assert_eq!(result["sandbox"],start["sandbox"]);
        results.push(json!({"model":result["model"],"provider":result["modelProvider"],"sameThread":true,"permissionsPreserved":true}));
        turn(&codex,id,&mut events).await?;
    }
    thread_model::switch(&codex,serde_json::from_value(json!({"threadId":id,"modelProvider":"fixture_a","model":"gpt-6.1-sol","effort":"medium"})).unwrap()).await?;
    let active=codex.send_request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":"HOLD_ACTIVE_FIXTURE","text_elements":[]}]})).await?;
    let blocked=thread_model::switch(&codex,serde_json::from_value(json!({"threadId":id,"modelProvider":"fixture_b",
        "model":"deepseek-v4.1-flash","turnId":active["turn"]["id"],"effort":"low"})).unwrap()).await;
    assert!(blocked.is_err());
    let changed=thread_model::switch(&codex,serde_json::from_value(json!({"threadId":id,"modelProvider":"fixture_a",
        "model":"gpt-6-astra","turnId":active["turn"]["id"],"effort":"low"})).unwrap()).await?;
    assert_eq!(changed["model"],"gpt-6-astra");
    tokio::time::timeout(std::time::Duration::from_secs(10),async {
        while let Some(value)=events.recv().await { if value["method"]=="turn/completed" { break; } }
    }).await.map_err(|e|e.to_string())?;
    turn(&codex,id,&mut events).await?;
    println!("{}",json!({"switches":results,"activeProviderSwitchBlocked":true,"activeAndFutureModelConfirmed":true,"sandbox":sandbox}));
    Ok(())
}
