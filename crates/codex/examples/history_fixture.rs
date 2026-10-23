//! Manual large-history regression, restricted to explicitly marked synthetic homes.
//! CODEX_HOME=<fixture home> LEMMA_HISTORY_FIXTURE_THREAD=<uuid> cargo run -p codexia-codex --example history_fixture
use std::{sync::Arc, time::Instant};
use codexia_codex::{connect_codex, history};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value, json};
struct Sink;
impl EventSink for Sink { fn emit(&self,_event:&str,_payload:Value) {} }

#[tokio::main]
async fn main() -> Result<(),String> {
    let home=std::env::var("CODEX_HOME").map_err(|_|"Synthetic CODEX_HOME required")?;
    if !std::path::Path::new(&home).join(".lemma-synthetic-history").is_file() {
        return Err("Refusing to read an unmarked home".into());
    }
    let id=std::env::var("LEMMA_HISTORY_FIXTURE_THREAD").map_err(|_|"Fixture thread required")?;
    let server=connect_codex(Arc::new(Sink)).await?;
    server.send_request("initialize",json!({"clientInfo":{"name":"lemma_history_regression","version":"0"},"capabilities":{"experimentalApi":true}})).await?;
    server.send_notification("initialized",None).await?;
    let start=Instant::now();
    let resume=server.send_request("thread/resume",json!({"threadId":id,"excludeTurns":true})).await?;
    let resume_ms=start.elapsed().as_millis();
    assert!(resume["thread"]["turns"].as_array().unwrap().is_empty());
    let resume_bytes=serde_json::to_vec(&resume).unwrap().len();
    assert!(resume_bytes<64*1024);
    let mut cursor:Option<String>=None;
    let mut pages=Vec::new();
    for _ in 0..5 {
        let start=Instant::now();
        let page=history::page(&server,serde_json::from_value(json!({"threadId":id,"cursor":cursor})).unwrap()).await?;
        let value=serde_json::to_value(page).unwrap();
        let bytes=serde_json::to_vec(&value).unwrap().len();
        let entries=value["entries"].as_array().unwrap();
        assert!(entries.len()<=40);assert!(bytes<2*1024*1024);
        pages.push(json!({"milliseconds":start.elapsed().as_millis(),"bytes":bytes,"entries":entries.len()}));
        if let Some(entry)=entries.iter().find(|e|e["truncated"]==true) {
            let detail=history::detail(&server,serde_json::from_value(json!({"threadId":id,"cursor":entry["detailCursor"],"offset":0})).unwrap()).await?;
            assert!(detail["text"].as_str().unwrap().len()<=64*1024);
        }
        cursor=value["nextCursor"].as_str().map(str::to_owned);
        if cursor.is_none() { break; }
    }
    println!("{}",json!({"resumeMs":resume_ms,"resumeBytes":resume_bytes,"pages":pages}));
    Ok(())
}
