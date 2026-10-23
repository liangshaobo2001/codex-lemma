//! Manual end-to-end fixture. Requires a marked temporary home and localhost provider.
use codexia_codex::{app_server::connect_codex_with_tool_policy,protocol::RequestId,tool_discovery::session_tools};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value,json};
use std::sync::Arc;
struct Sink(tokio::sync::mpsc::UnboundedSender<(String,Value)>);
impl EventSink for Sink {fn emit(&self,name:&str,value:Value){let _=self.0.send((name.into(),value));}}
#[tokio::main]
async fn main()->Result<(),String>{
    let home=std::env::var("CODEX_HOME").map_err(|e|e.to_string())?;
    if !std::path::Path::new(&home).join(".lemma-synthetic-history").is_file(){return Err("Unmarked home refused".into());}
    let (tx,mut events)=tokio::sync::mpsc::unbounded_channel();let client=connect_codex_with_tool_policy(Arc::new(Sink(tx)),Some(std::path::Path::new(&home).join("tool-policies.json"))).await?;
    client.send_request("initialize",json!({"clientInfo":{"name":"lemma_discovery_fixture","version":"0"},"capabilities":{"experimentalApi":true}})).await?;
    client.send_notification("initialized",None).await?;
    let model=std::env::var("LEMMA_FIXTURE_REAL_MODEL").unwrap_or_else(|_|"qwen-fixture".into());
    let command=std::env::var("LEMMA_FIXTURE_COMMAND").is_ok();
    let sandbox=std::env::var("LEMMA_FIXTURE_SANDBOX").unwrap_or_else(|_|"workspace-write".into());
    let start=client.send_request("thread/start",json!({"cwd":home,"runtimeWorkspaceRoots":[home],"modelProvider":"fixture","model":model,
        "approvalPolicy":"on-request","sandbox":sandbox,"config":{"web_search":"disabled","features.apps":false,"model_reasoning_effort":"none",
            "sandbox_workspace_write":{"exclude_tmpdir_env_var":true,"exclude_slash_tmp":true}}})).await?;
    let id=start["thread"]["id"].as_str().unwrap();
    let inventory=client.send_request("mcpServerStatus/list",json!({"threadId":id,"detail":"full"})).await?;
    assert!(inventory["data"].as_array().unwrap().iter().any(|s|s["name"]=="fixture"&&s["runtimeStatus"]=="connected"));
    let policy=session_tools::manage(&client,"read",session_tools::Params{thread_id:id.into(),selected:None}).await?;
    assert!(policy["tools"].as_array().unwrap().iter().any(|t|t["id"]=="mcp__fixture.fixture_tool"));
    if std::env::var("LEMMA_FIXTURE_DIRECT").is_ok(){
        session_tools::manage(&client,"select",session_tools::Params{thread_id:id.into(),selected:Some(std::collections::BTreeSet::from(["mcp__fixture.fixture_tool".into()]))}).await?;
    }
    let prompt=if command {"Use exec_command to run PowerShell: Write-Output 'LEMMA_EXEC_OK'. Report the actual command output. Do not call other tools."}
        else {"Search for the installed fixture_tool, invoke it with an empty object, then report the actual returned marker. Do not simulate its result or call other execution tools."};
    client.send_request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":prompt,"text_elements":[]}]})).await?;
    let rejected=session_tools::manage(&client,"select",session_tools::Params{thread_id:id.into(),selected:Some(std::collections::BTreeSet::new())}).await;
    assert!(rejected.is_err(),"Tool selection must remain unchanged while this chat is active");
    let mut approvals=0;let mut modes=Vec::new();let mut failures=Vec::new();let mut last_input=Value::Null;let mut tool_called=false;
    tokio::time::timeout(std::time::Duration::from_secs(180),async{
        while let Some((name,value))=events.recv().await{
            if name=="codex/elicitation-request" {
                assert_eq!(value["serverName"].as_str().or_else(||value["server"].as_str()),Some("fixture"));
                let request:RequestId=serde_json::from_value(value["requestId"].clone()).unwrap();
                client.send_response(request,json!({"action":"accept","content":{}})).await?;approvals+=1;
            }
            if name=="codex:toolDiscovery" {modes.push(value.clone());}
            if name=="codex/approval-request"||name=="codex/permissions-request" {return Err("Unexpected execution approval requested by fixture".into());}
            if value["method"]=="item/completed" {
                let item=&value["params"]["item"];
                if command && item["type"]=="commandExecution" && item["exitCode"]!=0 {return Err(format!("Synthetic command failed: {}",item["aggregatedOutput"]));}
                tool_called|=if command {item["type"]=="commandExecution"&&item["exitCode"]==0&&item["aggregatedOutput"].as_str().is_some_and(|s|s.contains("LEMMA_EXEC_OK"))}
                    else {item["type"]=="mcpToolCall"&&item["server"]=="fixture"&&item["tool"]=="fixture_tool"&&item["result"].to_string().contains("PREFILL_TOOL_OK")};
            }
            if value["method"]=="error"{failures.push(value["params"]["error"]["message"].clone());}
            if value["method"]=="thread/tokenUsage/updated"{last_input=value["params"]["tokenUsage"]["last"]["inputTokens"].clone();}
            if value["method"]=="turn/completed"{
                if value["params"]["turn"]["status"]!="completed"{return Err(format!("Fixture failed: {failures:?}; adapter: {modes:?}"));}
                break;
            }
        }
        Ok::<_,String>(())
    }).await.map_err(|e|format!("Timed out: {e}; adapter: {modes:?}"))??;
    assert!(tool_called,"A real CLI tool must return the expected marker");
    if std::env::var("LEMMA_FIXTURE_REAL_MODEL").is_err(){assert_eq!(last_input,100,"Hidden discovery requests must not inflate context occupancy");}
    let extras=client.tool_discovery.usage(id).await?;
    if std::env::var("LEMMA_FIXTURE_REAL_MODEL").is_err(){assert_eq!(extras["usage"]["inputTokens"],if command||std::env::var("LEMMA_FIXTURE_DIRECT").is_ok(){0}else{100});}
    println!("{}",json!({"completed":true,"actualToolReturnedMarker":tool_called,"approvals":approvals,"status":modes,"contextInput":last_input,"extraUsage":extras["usage"]}));
    Ok(())
}
