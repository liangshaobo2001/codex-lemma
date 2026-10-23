//! Discover metadata in the HTTP bridge; return executable calls to the CLI unchanged in identity.
use super::probe::Endpoint;
use super::protocol::{Inventory,Mode,search_call,search_result};
use super::wire::{Decoder,ResponseCapture};
use super::observation::{Observer,Timing};
use serde_json::{Value,json};
use std::collections::{BTreeMap,BTreeSet};
use std::sync::Arc;
use tokio::sync::{Mutex,mpsc};

const MAX_DISCOVERY_ROUNDS: usize=4;
const MAX_RETAINED_TOOLS: usize=16;

#[derive(Default)]
pub struct Session {
    pub loaded:BTreeSet<String>,
    pub selected:BTreeSet<String>,
    pub inventory:Inventory,
    pub wire_inventory:bool,
}

async fn emit(tx:&mpsc::Sender<Vec<u8>>,event:&Value) -> Result<(),String> {
    let kind=event["type"].as_str().unwrap_or("error");
    tx.send(format!("event: {kind}\ndata: {event}\n\n").into_bytes()).await.map_err(|_|"Request cancelled.".into())
}

fn executable(inventory:&Inventory,item:&Value,mode:Mode,declared:&BTreeSet<String>) -> Result<Value,String> {
    let result=inventory.decode_call(item,mode)?;
    if result["type"]=="function_call" || (result["type"]=="custom_tool_call"&&result["namespace"].is_string()) {
        let name=result["name"].as_str().ok_or("Executable call has no name.")?;
        let key=result["namespace"].as_str().map_or_else(||name.to_string(),|n|format!("{n}.{name}"));
        let tool=inventory.tools.get(&key).ok_or("The provider called an unavailable function.")?;
        if tool.deferred && !declared.contains(&key) { return Err("The provider called a tool before loading its definition.".into()); }
    }
    if result["type"]=="custom_tool_call" && result["namespace"].is_null() && !inventory.other.iter().any(|spec|spec["type"]=="custom"&&spec["name"]==result["name"]) {
        return Err("The provider called an unavailable custom tool.".into());
    }
    if result["type"]=="tool_search_call" { return Err("The provider returned an unnegotiated search call.".into()); }
    Ok(result)
}

fn is_search(item:&Value,mode:Mode) -> bool {
    if mode==Mode::Native { item["type"]=="tool_search_call" }
    else { item["type"]=="function_call" && item["name"]==super::protocol::SEARCH_NAME }
}

pub async fn run(client:&reqwest::Client,endpoint:&Endpoint,body:Value,mode:Mode,session:Arc<Mutex<Session>>,tx:&mpsc::Sender<Vec<u8>>) -> Result<(),String> {
    run_observed(client,endpoint,body,mode,session,tx,None).await
}
pub(crate) async fn run_observed(client:&reqwest::Client,endpoint:&Endpoint,mut body:Value,mode:Mode,session:Arc<Mutex<Session>>,tx:&mpsc::Sender<Vec<u8>>,observer:Option<&Observer>) -> Result<(),String> {
    let specs=body["tools"].as_array().ok_or("Request has no tool declarations.")?;
    if specs.iter().any(|spec|spec["type"]=="tool_search") {
        return cli_owned(client,endpoint,body,mode,session,tx,observer).await;
    }
    let inventory=Inventory::parse(specs)?;
    let mut loaded={let mut state=session.lock().await;state.inventory=inventory.clone();state.wire_inventory=true;state.loaded.clone()};
    // Restored conversations contain canonical CLI calls, even when an old bridge no longer exists.
    if mode!=Mode::Direct {
        let mut restored=Vec::new();
        for item in body["input"].as_array().into_iter().flatten().rev() {
            if item["type"]!="function_call" { continue; }
            if let Some(name)=item["name"].as_str() {
                let key=item["namespace"].as_str().map_or_else(||name.to_string(),|n|format!("{n}.{name}"));
                if inventory.tools.get(&key).is_some_and(|tool|tool.deferred) && !restored.contains(&key) { restored.push(key); }
                if restored.len()==MAX_RETAINED_TOOLS { break; }
            }
        }
        loaded.extend(restored);
        while loaded.len()>MAX_RETAINED_TOOLS { loaded.pop_first(); }
    } else {
        loaded=session.lock().await.selected.clone();
        if loaded.iter().any(|key|!inventory.tools.get(key).is_some_and(|tool|tool.deferred)) {return Err("A selected tool is unavailable in this chat. Open Tools, clear unavailable selections and retry.".into());}
    }
    loaded.retain(|key|inventory.tools.contains_key(key));
    let input=body["input"].as_array().ok_or("Request input must be an array.")?;
    body["input"]=json!(super::cli_search::normalize_history(input,&inventory,mode)?);
    let mut normal_output=Vec::new();let mut outer_id=None;
    for round in 0..MAX_DISCOVERY_ROUNDS {
        let declared=loaded.clone();
        let mut tools=inventory.declarations(mode,&declared);
        if mode!=Mode::Direct { tools.push(Inventory::search_declaration(mode)); }
        body["tools"]=json!(tools);body["stream"]=json!(true);
        let mut timing=Timing::start();
        let mut response=client.post(&endpoint.url).headers(endpoint.headers.clone()).json(&body).send().await
            .map_err(|_|"The model request could not reach the provider.")?;
        timing.headers();
        if !response.status().is_success() {
            return Err(if round==0 {format!("Provider rejected the initial request (HTTP {}).",response.status().as_u16())}
                else {format!("Provider returned HTTP {} after discovery started.",response.status().as_u16())});
        }
        let mut decoder=Decoder::default();let mut capture=ResponseCapture::default();
        let mut indices:BTreeMap<u64,u64>=BTreeMap::new();let mut hidden=BTreeSet::new();
        let mut round_done:BTreeMap<u64,Value>=BTreeMap::new();
        while let Some(chunk)=response.chunk().await.map_err(|_|"The provider stream could not be read.")? {
            for mut event in decoder.push(&chunk)? {
                timing.event(&event);
                capture.observe(&event)?;
                let kind=event["type"].as_str().unwrap_or("").to_string();
                if kind=="response.created" {
                    if outer_id.is_none() { outer_id=Some(event["response"]["id"].clone());emit(tx,&event).await?; }
                    continue;
                }
                if matches!(kind.as_str(),"response.completed"|"response.in_progress"|"response.queued") { continue; }
                if kind.starts_with("response.function_call_arguments.") && !event["output_index"].is_u64() {return Err("The provider streamed function arguments without an output index.".into());}
                if let Some(index)=event["output_index"].as_u64() {
                    if event["item"].is_object() {
                        if is_search(&event["item"],mode) { hidden.insert(index); }
                        else if !indices.contains_key(&index) { let offset=indices.len() as u64+normal_output.len() as u64;indices.insert(index,offset); }
                    }
                    if hidden.contains(&index) { continue; }
                    if !indices.contains_key(&index) { return Err("The provider streamed output before identifying its item.".into()); }
                    if let Some(mapped)=indices.get(&index) { event["output_index"]=json!(mapped); }
                    if event["item"].is_object() {
                        event["item"]=executable(&inventory,&event["item"],mode,&declared)?;
                        if kind=="response.output_item.done" { round_done.insert(index,event["item"].clone()); }
                    }
                }
                // The original CLI, not the bridge, performs the returned tool calls and approvals.
                emit(tx,&event).await?;
            }
        }
        decoder.finish()?;let mut completed=capture.finish()?;
        let mut searches=Vec::new();let mut has_executable=false;
        for (index,item) in completed["output"].as_array().unwrap().iter().enumerate() {
            if let Some(call)=search_call(item,mode)? { searches.push(call);continue; }
            let decoded=executable(&inventory,item,mode,&declared)?;
            has_executable|=matches!(decoded["type"].as_str(),Some("function_call"|"custom_tool_call"));
            if !round_done.contains_key(&(index as u64)) {
                emit(tx,&json!({"type":"response.output_item.done","output_index":normal_output.len(),"item":decoded})).await?;
            }
            normal_output.push(decoded);
        }
        let mut results=Vec::new();
        for call in searches {
            if mode==Mode::Direct { return Err("Tool discovery is unavailable for this request.".into()); }
            let found=BTreeSet::from_iter(inventory.search(&call.query,8));
            loaded.extend(found.iter().cloned());
            results.push(search_result(&call,mode,inventory.discoveries(mode,&found)));
        }
        if let Some(observer)=observer {observer.completed(&timing,&completed["usage"],!results.is_empty()&&!has_executable).await;}
        { session.lock().await.loaded=loaded.iter().rev().take(MAX_RETAINED_TOOLS).cloned().collect(); }
        if results.is_empty() || has_executable {
            if let Some(id)=outer_id { completed["id"]=id; }
            completed["output"]=json!(normal_output);
            // Context and compaction use only the final request's usage. Hidden search usage is separate.
            emit(tx,&json!({"type":"response.completed","response":completed})).await?;
            return Ok(());
        }
        if round+1==MAX_DISCOVERY_ROUNDS { return Err("The model exhausted the tool discovery limit. Check the provider compatibility and retry.".into()); }
        let input=body["input"].as_array_mut().unwrap();input.extend(completed["output"].as_array().unwrap().iter().cloned());input.extend(results);
    }
    Err("Tool discovery ended unexpectedly.".into())
}

async fn cli_owned(client:&reqwest::Client,endpoint:&Endpoint,body:Value,mode:Mode,session:Arc<Mutex<Session>>,tx:&mpsc::Sender<Vec<u8>>,observer:Option<&Observer>) -> Result<(),String> {
    let selected=session.lock().await.selected.clone();
    let fallback_specs=session.lock().await.inventory.canonical_discoveries(&selected);
    let (mut adapter,mut body)=super::cli_search::Adapter::prepare(body,mode,&selected,&fallback_specs)?;
    {let mut state=session.lock().await;state.inventory.tools.extend(adapter.inventory.tools.clone());state.inventory.assign_aliases();state.wire_inventory=true;}
    body["stream"]=json!(true);
    let mut timing=Timing::start();
    let mut response=client.post(&endpoint.url).headers(endpoint.headers.clone()).json(&body).send().await.map_err(|_|"The model request could not reach the provider.")?;timing.headers();
    if !response.status().is_success() { return Err(format!("Provider rejected the initial request (HTTP {}).",response.status().as_u16())); }
    let mut decoder=Decoder::default();let mut capture=ResponseCapture::default();
    while let Some(chunk)=response.chunk().await.map_err(|_|"The provider stream could not be read.")? {
        for event in decoder.push(&chunk)? {
            timing.event(&event);
            capture.observe(&event)?;
            if event["type"]=="response.completed" && let Some(observer)=observer {observer.completed(&timing,&event["response"]["usage"],false).await;}
            if let Some(event)=adapter.event(event)? { emit(tx,&event).await?; }
        }
    }
    decoder.finish()?;capture.finish()?;
    Ok(())
}

pub async fn stream(client:reqwest::Client,endpoint:Endpoint,body:Value,mode:Mode,session:Arc<Mutex<Session>>,tx:mpsc::Sender<Vec<u8>>) {
    let task=async {
        if let Err(error)=run(&client,&endpoint,body,mode,session,&tx).await {
            let _=emit(&tx,&json!({"type":"error","error":{"type":"tool_discovery_error","message":error}})).await;
        }
    };
    tokio::select! { _=tx.closed()=>{}, _=task=>{} }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsearched_connector_calls_cannot_be_smuggled_into_execution() {
        let inventory=Inventory::parse(&[json!({"type":"namespace","name":"mcp__mail","tools":[{"type":"function","name":"send","parameters":{}}]})]).unwrap();
        let alias=&inventory.tools["mcp__mail.send"].alias;
        let call=json!({"type":"function_call","name":alias,"call_id":"call","arguments":"{}"});
        assert!(executable(&inventory,&call,Mode::Function,&BTreeSet::new()).is_err());
        let result=executable(&inventory,&call,Mode::Function,&BTreeSet::from(["mcp__mail.send".into()])).unwrap();
        assert_eq!(result["namespace"],"mcp__mail");assert_eq!(result["call_id"],"call");
    }

    async fn fixture(axum::Json(body):axum::Json<Value>) -> ([( &'static str,&'static str);1],String) {
        let native=body["tools"].as_array().unwrap().iter().any(|t|t["type"]=="tool_search");
        let found=body["input"].as_array().unwrap().iter().any(|i|i["type"]=="tool_search_output"||i["type"]=="function_call_output");
        let output=if !found {
            let call=if native { json!({"id":"search-item","type":"tool_search_call","call_id":"search-exact","execution":"client","arguments":{"query":"node javascript"}}) }
                else { json!({"id":"search-item","type":"function_call","name":super::super::protocol::SEARCH_NAME,"call_id":"search-exact","arguments":"{\"query\":\"node javascript\"}"}) };
            vec![json!({"id":"intro","type":"message","role":"assistant","content":[{"type":"output_text","text":"Looking up the tool."}]}),call]
        } else {
            let tool=body["tools"].as_array().unwrap().iter().find(|t|t["description"].as_str().is_some_and(|d|d.starts_with("mcp__node_repl.js"))).unwrap();
            vec![json!({"id":"execute","type":"function_call","name":tool["name"],"call_id":"execute-exact","arguments":"{}"})]
        };
        let response=json!({"id":"upstream","status":"completed","output":output,"usage":{"input_tokens":100,"output_tokens":5,"total_tokens":105,"input_tokens_details":{"cached_tokens":80},"output_tokens_details":{"reasoning_tokens":2}}});
        let mut events=vec![json!({"type":"response.created","response":{"id":"upstream","status":"in_progress","output":[]}})];
        for (index,item) in output.into_iter().enumerate() {
            events.push(json!({"type":"response.output_item.added","output_index":index,"item":item}));
            events.push(json!({"type":"response.output_item.done","output_index":index,"item":item}));
        }
        events.push(json!({"type":"response.completed","response":response}));
        ([("content-type","text/event-stream")],events.into_iter().map(|e|format!("event: {}\ndata: {e}\n\n",e["type"].as_str().unwrap())).collect())
    }
    #[tokio::test]
    async fn search_load_and_call_are_relayed_without_leaking_internal_calls_or_changing_ids() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint=Endpoint{url:format!("http://{}/responses",listener.local_addr().unwrap()),headers:reqwest::header::HeaderMap::new()};
        let server=tokio::spawn(async move { axum::serve(listener,axum::Router::new().route("/responses",axum::routing::post(fixture))).await.unwrap(); });
        for mode in [Mode::Native,Mode::Function] {
            let body=json!({"model":"synthetic","input":[{"role":"user","content":"Use JavaScript."}],"tools":[{"type":"namespace","name":"mcp__node_repl","tools":[{"type":"function","name":"js","description":"Execute JavaScript in Node","parameters":{"type":"object"}}]}]});
            let session=Arc::new(Mutex::new(Session::default()));
            let (tx,mut rx)=mpsc::channel(32);
            run(&reqwest::Client::new(),&endpoint,body,mode,session.clone(),&tx).await.unwrap();drop(tx);
            let mut decoder=Decoder::default();let mut events=Vec::new();while let Some(bytes)=rx.recv().await { events.extend(decoder.push(&bytes).unwrap()); }
            let output=&events.last().unwrap()["response"]["output"];
            assert_eq!(output.as_array().unwrap().len(),2);assert_eq!(output[1]["namespace"],"mcp__node_repl");assert_eq!(output[1]["name"],"js");assert_eq!(output[1]["call_id"],"execute-exact");
            assert!(!serde_json::to_string(&events).unwrap().contains("search-exact"));
            assert_eq!(events.last().unwrap()["response"]["usage"]["input_tokens"],100);
            assert!(session.lock().await.loaded.contains("mcp__node_repl.js"));
        }
        server.abort();
    }
    #[tokio::test]
    async fn cancellation_stops_a_pending_model_request() {
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint=Endpoint{url:format!("http://{}/responses",listener.local_addr().unwrap()),headers:reqwest::header::HeaderMap::new()};
        let router=axum::Router::new().route("/responses",axum::routing::post(||async { tokio::time::sleep(std::time::Duration::from_secs(30)).await;"" }));
        let server=tokio::spawn(async move { axum::serve(listener,router).await.unwrap(); });
        let (tx,rx)=mpsc::channel(1);
        let worker=tokio::spawn(stream(reqwest::Client::new(),endpoint,json!({"model":"synthetic","input":[],"tools":[]}),Mode::Direct,Arc::new(Mutex::new(Session::default())),tx));
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;drop(rx);
        tokio::time::timeout(std::time::Duration::from_secs(1),worker).await.unwrap().unwrap();server.abort();
    }
}
