//! Manual regression using a marked synthetic home and localhost providers only.
use std::sync::Arc;
use codexia_codex::{app_server::connect_codex_with_tool_policy, thread_model};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value, json};
struct Sink(tokio::sync::mpsc::UnboundedSender<Value>);
impl EventSink for Sink { fn emit(&self, name: &str, value: Value) { if name == "codex:stderr" || value["method"] == "error" { eprintln!("{name}: {value}"); } let _ = self.0.send(value); } }

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
    let config=codex.send_request("config/read",json!({"includeLayers":false})).await?;
    for endpoint in [config["config"]["openai_base_url"].as_str(),
        config.pointer("/config/model_providers/fixture_a/base_url").and_then(Value::as_str),
        config.pointer("/config/model_providers/fixture_b/base_url").and_then(Value::as_str)] {
        if !endpoint.is_some_and(|url|url.starts_with("http://127.0.0.1:")) { return Err("All fixture providers must use explicit loopback endpoints".into()); }
    }
    let sandbox=std::env::var("LEMMA_FIXTURE_SANDBOX").unwrap_or_else(|_|"read-only".into());
    let initial=std::env::var("LEMMA_FIXTURE_INITIAL_PROVIDER").unwrap_or_else(|_|"fixture_a".into());
    let start=codex.send_request("thread/start",json!({"cwd":home,"modelProvider":initial,"model":"gpt-6.1-sol",
        "approvalPolicy":"on-request","sandbox":sandbox,"config":{"web_search":"disabled"}})).await?;
    let id=start["thread"]["id"].as_str().unwrap();
    turn(&codex,id,&mut events).await?;
    let mut results=Vec::new();
    for (provider,model) in [("fixture_b","deepseek-v4.1-flash"),("fixture_a","qwen-fixture"),("fixture_a","qwen-fixture-2"),("openai","gpt-6.1-sol")] {
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
    let choice = |provider: &str, model: &str| serde_json::from_value(json!({"threadId":id,"modelProvider":provider,"model":model,"effort":"low"})).unwrap();
    let (first, second) = tokio::join!(
        thread_model::switch(&codex, choice("fixture_a", "qwen-concurrent")),
        thread_model::switch(&codex, choice("fixture_b", "deepseek-v4.1-flash"))
    );
    assert_eq!(first?["modelProvider"], "fixture_a");
    assert_eq!(second?["modelProvider"], "fixture_b");
    turn(&codex,id,&mut events).await?;
    let history=codex.send_request("thread/read",json!({"threadId":id,"includeTurns":true})).await?;
    let turns=history["thread"]["turns"].as_array().ok_or("No persisted turn history returned")?;
    assert_eq!(turns.len(),8);
    println!("{}",json!({"switches":results,"activeProviderSwitchBlocked":true,"activeAndFutureModelConfirmed":true,
        "concurrentSelectionsSerialized":true,"historyTurns":turns.len(),"sandbox":sandbox}));
    Ok(())
}
