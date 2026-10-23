//! Capability negotiation uses synthetic metadata tools only, never a user's task or real tools.
use super::protocol::{Inventory,Mode,SearchCall,search_call,search_result};
use super::wire;
use reqwest::header::HeaderMap;
use serde_json::{Value,json};

pub struct Endpoint { pub url:String, pub headers:HeaderMap }

async fn request(client:&reqwest::Client, endpoint:&Endpoint, body:&Value) -> Result<Option<Value>,String> {
    let response=client.post(&endpoint.url).headers(endpoint.headers.clone()).json(body).send().await
        .map_err(|_|"Tool capability probe could not reach the provider.")?;
    let status=response.status().as_u16();
    if matches!(status,400|404|405|415|422) { return Ok(None); }
    if !response.status().is_success() { return Err(format!("Tool capability probe returned HTTP {status}.")); }
    wire::collect(response).await.map(Some)
}

pub async fn verify(client:&reqwest::Client, endpoint:&Endpoint, model:&str, reasoning:Option<&Value>, mode:Mode) -> Result<bool,String> {
    let marker=format!("LEMMA_PROBE_{}",uuid::Uuid::new_v4().simple());
    let mut body=json!({"model":model,"stream":true,"store":false,"max_output_tokens":512,
        "input":[{"role":"user","content":"This is a tool-protocol self-test. First search for lemma_probe_read, then call that tool with the required nonce. Finally repeat exactly the marker returned by the tool. Do not answer without performing these steps."}],
        "tools":[Inventory::search_declaration(mode)]});
    if let Some(reasoning)=reasoning { body["reasoning"]=reasoning.clone(); }
    let Some(first)=request(client,endpoint,&body).await? else { return Ok(false); };
    let calls=match first["output"].as_array().unwrap().iter().filter_map(|item|search_call(item,mode).transpose()).collect::<Result<Vec<_>,_>>() {
        Ok(calls)=>calls,Err(_)=>return Ok(false),
    };
    if calls.len()!=1 { return Ok(false); }
    let call=&calls[0];
    let definition=json!({"type":"function","name":"lemma_probe_read","description":"Return the synthetic marker. This probe does not access files, accounts, services or user data.",
        "parameters":{"type":"object","properties":{"nonce":{"type":"string","enum":[marker]}},"required":["nonce"],"additionalProperties":false}});
    let input=body["input"].as_array_mut().unwrap();input.extend(first["output"].as_array().unwrap().iter().cloned());
    input.push(search_result(&SearchCall{call_id:call.call_id.clone(),query:call.query.clone()},mode,vec![definition.clone()]));
    if mode==Mode::Function { body["tools"].as_array_mut().unwrap().push(definition); }
    let Some(second)=request(client,endpoint,&body).await? else { return Ok(false); };
    let calls:Vec<_>=second["output"].as_array().unwrap().iter().filter(|i|i["type"]=="function_call").collect();
    if calls.len()!=1 || calls[0]["name"]!="lemma_probe_read" { return Ok(false); }
    let call=calls[0];
    let Some(call_id)=call["call_id"].as_str().filter(|s|!s.is_empty()) else { return Ok(false); };
    let args:Value=match serde_json::from_str(call["arguments"].as_str().unwrap_or("")) { Ok(value)=>value,Err(_)=>return Ok(false) };
    if args["nonce"]!=marker { return Ok(false); }
    let input=body["input"].as_array_mut().unwrap();input.extend(second["output"].as_array().unwrap().iter().cloned());
    input.push(json!({"type":"function_call_output","call_id":call_id,"output":marker}));
    let Some(third)=request(client,endpoint,&body).await? else { return Ok(false); };
    Ok(third["output"].as_array().unwrap().iter().filter(|i|i["type"]=="message").flat_map(|i|i["content"].as_array().into_iter().flatten()).any(|c|c["text"].as_str().is_some_and(|s|s.contains(&marker))))
}

pub async fn negotiate(client:&reqwest::Client,endpoint:&Endpoint,model:&str,reasoning:Option<&Value>) -> Result<Mode,String> {
    for mode in [Mode::Native,Mode::Function] {
        if verify(client,endpoint,model,reasoning,mode).await? { return Ok(mode); }
    }
    Ok(Mode::Direct)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json,Router,routing::post,http::StatusCode,response::{IntoResponse,Response}};
    use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};
    use super::super::protocol::SEARCH_NAME;
    async fn fixture(Json(body):Json<Value>) -> Response {
        if body["model"]=="unauthorized" { return StatusCode::UNAUTHORIZED.into_response(); }
        if body["model"]=="throttled" { return StatusCode::TOO_MANY_REQUESTS.into_response(); }
        let native=body["tools"][0]["type"]=="tool_search";
        let supported=body["model"]=="native" || (body["model"]=="function" && !native);
        let input=body["input"].as_array().unwrap();
        let result=input.iter().find(|i|i["type"]=="function_call_output" && i["output"].as_str().is_some_and(|s|s.starts_with("LEMMA_PROBE_")));
        let search=input.iter().find(|i|i["type"]=="tool_search_output" || (i["type"]=="function_call_output" && i["output"].as_str().is_some_and(|s|s.contains("lemma_probe_read"))));
        let item=if !supported { json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":"I cannot see a search tool."}]}) }
        else if let Some(result)=result { json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":result["output"]}]}) }
        else if let Some(search)=search {
            let definitions=if native { search["tools"].clone() } else { serde_json::from_str::<Value>(search["output"].as_str().unwrap()).unwrap()["tools"].clone() };
            let nonce=&definitions[0]["parameters"]["properties"]["nonce"]["enum"][0];
            json!({"type":"function_call","name":"lemma_probe_read","call_id":"read_exact","arguments":json!({"nonce":nonce}).to_string()})
        } else if native { json!({"type":"tool_search_call","call_id":"search_exact","execution":"client","arguments":{"query":"lemma_probe_read"}}) }
        else { json!({"type":"function_call","name":SEARCH_NAME,"call_id":"search_exact","arguments":"{\"query\":\"lemma_probe_read\"}"}) };
        let event=json!({"type":"response.completed","response":{"status":"completed","output":[item]}});
        ([("content-type","text/event-stream")],format!("event: response.completed\ndata: {event}\n\n")).into_response()
    }
    async fn server() -> (Endpoint,Arc<AtomicUsize>,tokio::task::JoinHandle<()>) {
        let count=Arc::new(AtomicUsize::new(0));let calls=Arc::clone(&count);
        let router=Router::new().route("/responses",post(move |body:Json<Value>| { calls.fetch_add(1,Ordering::SeqCst);fixture(body) }));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint=Endpoint{url:format!("http://{}/responses",listener.local_addr().unwrap()),headers:HeaderMap::new()};
        let task=tokio::spawn(async move { axum::serve(listener,router).await.unwrap(); });
        (endpoint,count,task)
    }
    #[tokio::test]
    async fn negotiation_verifies_three_rounds_and_falls_back_on_http_200_without_calls() {
        let (endpoint,count,server)=server().await;let client=reqwest::Client::new();
        for (model,expected,requests) in [("native",Mode::Native,3),("function",Mode::Function,4),("direct",Mode::Direct,2)] {
            let before=count.load(Ordering::SeqCst);
            assert_eq!(negotiate(&client,&endpoint,model,None).await.unwrap(),expected);
            assert_eq!(count.load(Ordering::SeqCst)-before,requests);
        }
        server.abort();
    }
    #[tokio::test]
    async fn authentication_and_rate_limits_are_not_cached_as_missing_capabilities() {
        let (endpoint,count,server)=server().await;let client=reqwest::Client::new();
        for model in ["unauthorized","throttled"] {
            let before=count.load(Ordering::SeqCst);assert!(negotiate(&client,&endpoint,model,None).await.is_err());
            assert_eq!(count.load(Ordering::SeqCst)-before,1);
        }
        server.abort();
    }
}
