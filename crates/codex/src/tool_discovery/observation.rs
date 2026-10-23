//! Keep model-request accounting separate from the final request's context occupancy.
use codexia_shared::event_sink::EventSink;
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{collections::BTreeMap,path::{Path,PathBuf},sync::{Arc,Mutex}};
use tokio::sync::Mutex as AsyncMutex;
use crate::request_metrics::{Metrics,ExternalRequest};

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ExtraUsage {pub input_tokens:u64,pub cached_input_tokens:u64,pub complete:bool}
impl Default for ExtraUsage {fn default()->Self {Self{input_tokens:0,cached_input_tokens:0,complete:true}}}
static USAGE_LOCK:AsyncMutex<()>=AsyncMutex::const_new(());
fn read(path:&Path)->Result<BTreeMap<String,ExtraUsage>,String>{
    match std::fs::read(path){
        Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"Extra tool usage could not be read.".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(BTreeMap::new()),
        Err(_)=>Err("Extra tool usage is unavailable.".into()),
    }
}
pub async fn totals(path:&Path,thread:&str)->Result<ExtraUsage,String>{let _guard=USAGE_LOCK.lock().await;Ok(read(path)?.remove(thread).unwrap_or_default())}
async fn add(path:&Path,thread:&str,usage:&Value)->Result<ExtraUsage,String>{
    let _guard=USAGE_LOCK.lock().await;let mut all=read(path)?;
    if !all.contains_key(thread)&&all.len()>=10_000{return Err("Extra tool usage storage is full.".into());}
    let total=all.entry(thread.into()).or_default();
    let counts=usage["input_tokens"].as_u64().zip(usage.pointer("/input_tokens_details/cached_tokens").and_then(Value::as_u64));
    if let Some((input,cached))=counts.filter(|(input,cached)|cached<=input)
        && let (Some(input),Some(cached))=(total.input_tokens.checked_add(input),total.cached_input_tokens.checked_add(cached)) {
        total.input_tokens=input;total.cached_input_tokens=cached;
    } else {total.complete=false;}
    let result=total.clone();let directory=path.parent().ok_or("Usage directory is unavailable.")?;
    std::fs::create_dir_all(directory).map_err(|_|"Extra tool usage could not be saved.")?;
    let mut temporary=tempfile::NamedTempFile::new_in(directory).map_err(|_|"Extra tool usage could not be saved.")?;
    std::io::Write::write_all(&mut temporary,&serde_json::to_vec(&all).map_err(|e|e.to_string())?).map_err(|_|"Extra tool usage could not be saved.")?;
    temporary.persist(path).map_err(|_|"Extra tool usage could not be saved.")?;Ok(result)
}

pub(crate) struct Observer {
    pub thread_id:String,pub usage_path:PathBuf,pub events:Arc<dyn EventSink>,pub metrics:Option<Arc<Mutex<Metrics>>>,
}
#[derive(Default)]
pub(crate) struct Timing {start:i64,headers:i64,first:Option<i64>,reasoning_seen:bool}
impl Timing {
    pub fn start()->Self{Self{start:chrono::Utc::now().timestamp_millis(),..Default::default()}}
    pub fn headers(&mut self){self.headers=chrono::Utc::now().timestamp_millis();}
    pub fn event(&mut self,event:&Value){
        let kind=event["type"].as_str().unwrap_or("");
        if event["delta"].as_str().is_some_and(|delta|!delta.is_empty()) && matches!(kind,"response.output_text.delta"|"response.reasoning_text.delta"|"response.reasoning_summary_text.delta"|"response.function_call_arguments.delta"|"response.custom_tool_call_input.delta") {
            self.first.get_or_insert_with(||chrono::Utc::now().timestamp_millis());self.reasoning_seen|=kind.starts_with("response.reasoning_");
        }
    }
}
impl Observer {
    pub async fn completed(&self,timing:&Timing,usage:&Value,extra:bool){
        let end=chrono::Utc::now().timestamp_millis();
        let update=self.metrics.as_ref().and_then(|metrics|metrics.lock().ok()?.external(ExternalRequest{
            thread_id:&self.thread_id,start:timing.start,headers:timing.headers,first:timing.first,end,usage,reasoning_seen:timing.reasoning_seen,
        }));
        if let Some(update)=update {self.events.emit("codex:request-metrics",update);}
        if extra {
            let total=add(&self.usage_path,&self.thread_id,usage).await.unwrap_or(ExtraUsage{complete:false,..Default::default()});
            self.events.emit("codex:tool-usage",json!({"threadId":self.thread_id,"usage":total}));
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn extra_usage_is_durable_and_missing_or_impossible_counts_stay_unknown(){
        let directory=tempfile::tempdir().unwrap();let path=directory.path().join("usage.json");
        let usage=json!({"input_tokens":100,"input_tokens_details":{"cached_tokens":80}});
        add(&path,"a",&usage).await.unwrap();add(&path,"a",&usage).await.unwrap();
        let result=totals(&path,"a").await.unwrap();assert_eq!(result.input_tokens,200);assert_eq!(result.cached_input_tokens,160);assert!(result.complete);
        assert_eq!(totals(&path,"b").await.unwrap().input_tokens,0);
        add(&path,"a",&json!({"input_tokens":1,"input_tokens_details":{"cached_tokens":2}})).await.unwrap();
        add(&path,"a",&usage).await.unwrap();assert!(!totals(&path,"a").await.unwrap().complete);
    }
}
