//! Local-only Codex OTLP metadata: time the model stream, never the UI or tools.
use axum::{Json, Router, extract::{DefaultBodyLimit, State}, http::{HeaderMap, StatusCode}, routing::post};
use chrono::{DateTime, Utc};
use codexia_shared::event_sink::EventSink;
use serde_json::{Value, json};
use std::{collections::{HashMap, HashSet, VecDeque}, sync::{Arc, Mutex}};
use tokio::{net::TcpListener, process::Command, task::JoinHandle};

#[derive(Default)]
struct Request {
    start: i64,
    first: Option<i64>,
    reasoning_seen: bool,
}

#[derive(Default)]
struct Turn {
    id: String,
    start: i64,
    end: Option<i64>,
    output: u64,
    decode_ms: i64,
    ttft_ms: i64,
    requests: u64,
    seen: HashSet<(i64, i64, u64)>,
}

#[derive(Default)]
struct Thread {
    turns: VecDeque<Turn>,
    request: Option<Request>,
}

#[derive(Default)]
pub(crate) struct Metrics {
    managed: HashSet<String>,
    threads: HashMap<String, Thread>,
}

pub(crate) struct ExternalRequest<'a> {
    pub thread_id: &'a str, pub start: i64, pub headers: i64, pub first: Option<i64>,
    pub end: i64, pub usage: &'a Value, pub reasoning_seen: bool,
}

impl Metrics {
    pub(crate) fn manage(&mut self, thread: &str, enabled: bool) {
        if enabled { self.managed.insert(thread.into()); } else { self.managed.remove(thread); }
    }

    pub(crate) fn external(&mut self, request: ExternalRequest<'_>) -> Option<Value> {
        let first = request.first?;
        let output = request.usage["output_tokens"].as_u64()?;
        let reasoning = request.usage.pointer("/output_tokens_details/reasoning_tokens").and_then(Value::as_u64).unwrap_or(0);
        let record = |name: &str, at: i64, extras: Vec<(&str, Value)>| -> Option<Value> {
            let mut attributes = vec![
                json!({"key":"event.name","value":{"stringValue":name}}),
                json!({"key":"conversation.id","value":{"stringValue":request.thread_id}}),
                json!({"key":"event.timestamp","value":{"stringValue":DateTime::<Utc>::from_timestamp_millis(at)?.to_rfc3339()}}),
            ];
            attributes.extend(extras.into_iter().map(|(key,value)| json!({"key":key,"value":value})));
            Some(json!({"attributes":attributes}))
        };
        let api = record("codex.api_request",request.headers,vec![
            ("endpoint",json!({"stringValue":"/responses"})),
            ("http.response.status_code",json!({"intValue":"200"})),
            ("duration_ms",json!({"intValue":(request.headers-request.start).to_string()})),
        ])?;
        self.record_source(&api,true);
        let delta = record("codex.sse_event",first,vec![("event.kind",json!({"stringValue":if request.reasoning_seen {"response.reasoning_text.delta"} else {"response.output_text.delta"}}))])?;
        self.record_source(&delta,true);
        let completed = record("codex.sse_event",request.end,vec![
            ("event.kind",json!({"stringValue":"response.completed"})),
            ("output_token_count",json!({"intValue":output.to_string()})),
            ("reasoning_token_count",json!({"intValue":reasoning.to_string()})),
        ])?;
        self.record_source(&completed,true)
    }

    pub(crate) fn notification(&mut self, raw: &Value) {
        let method = raw["method"].as_str().unwrap_or_default();
        let p = &raw["params"];
        let (Some(thread_id), Some(turn_id)) = (p["threadId"].as_str(), p["turn"]["id"].as_str()) else { return };
        if method == "turn/started" {
            // Bound state even if an app-server process stays alive for months.
            if self.threads.len() >= 128 && !self.threads.contains_key(thread_id) {
                let oldest = self.threads.iter().min_by_key(|(_, t)| t.turns.back().map(|v| v.start)).map(|(id, _)| id.clone());
                if let Some(id) = oldest { self.threads.remove(&id); }
            }
            let thread = self.threads.entry(thread_id.to_string()).or_default();
            if thread.turns.iter().any(|t| t.id == turn_id) { return }
            thread.turns.push_back(Turn { id: turn_id.to_string(), start: Utc::now().timestamp_millis(), ..Turn::default() });
            if thread.turns.len() > 16 { thread.turns.pop_front(); }
        } else if method == "turn/completed"
            && let Some(thread) = self.threads.get_mut(thread_id)
            && let Some(turn) = thread.turns.iter_mut().find(|t| t.id == turn_id) {
                turn.end = Some(Utc::now().timestamp_millis());
            }
    }

    fn record(&mut self, record: &Value) -> Option<Value> {
        self.record_source(record,false)
    }

    fn record_source(&mut self, record: &Value, external: bool) -> Option<Value> {
        let attrs = record["attributes"].as_array()?;
        // Whitelist access only: prompts, arguments, tools, headers and identifiers from
        // provider metadata are neither retained nor emitted.
        let attr = |key: &str| attrs.iter().find(|a| a["key"].as_str() == Some(key)).map(|a| &a["value"]);
        let string = |key: &str| attr(key).and_then(|v| v["stringValue"].as_str());
        let integer = |key: &str| attr(key).and_then(|v| v["intValue"].as_str().or_else(|| v["stringValue"].as_str()).and_then(|s| s.parse::<i64>().ok()).or_else(|| v["intValue"].as_i64()));
        let name = string("event.name")?;
        if name != "codex.api_request" && name != "codex.sse_event" { return None }
        let id = string("conversation.id")?;
        if !external && self.managed.contains(id) { return None; }
        let timestamp = DateTime::parse_from_rfc3339(string("event.timestamp")?).ok()?.timestamp_millis();
        let thread = self.threads.get_mut(id)?;
        if name == "codex.api_request" {
            if string("endpoint") != Some("/responses") { return None }
            thread.request = None;
            let status = integer("http.response.status_code")?;
            if !(200..300).contains(&status) { return None }
            let duration = integer("duration_ms")?;
            if duration < 0 { return None }
            thread.request = Some(Request { start: timestamp.checked_sub(duration)?, first: None, reasoning_seen: false });
            return None;
        }
        let kind = string("event.kind")?;
        if matches!(kind, "error" | "response.failed" | "response.incomplete") {
            thread.request = None;
            return None;
        }
        let is_delta = matches!(kind,
            "response.output_text.delta" | "response.reasoning_text.delta" |
            "response.reasoning_summary_text.delta" | "response.function_call_arguments.delta" |
            "response.custom_tool_call_input.delta");
        if is_delta && let Some(request) = thread.request.as_mut() {
            request.first.get_or_insert(timestamp);
            request.reasoning_seen |= kind.starts_with("response.reasoning_");
        }
        if kind != "response.completed" { return None }
        // Codex logs response.completed twice. Only the second record carries usage.
        let output = u64::try_from(integer("output_token_count")?).ok()?;
        let request = thread.request.take()?;
        // A provider may count hidden reasoning without streaming it. Starting the
        // clock at visible text in that case would recreate the inflated-rate bug.
        if integer("reasoning_token_count").is_some_and(|n| n > 0) && !request.reasoning_seen { return None }
        let first = request.first?;
        let decode = timestamp.checked_sub(first)?;
        let ttft = first.checked_sub(request.start)?;
        if decode < 300 || ttft < 0 || output == 0 { return None }
        // Join on event time, not batch receipt time: exports can arrive after tools
        // finished or even after the next user turn has already started.
        let turn = thread.turns.iter_mut().rev().find(|t| timestamp >= t.start && t.end.is_none_or(|end| timestamp <= end))?;
        if turn.seen.len() >= 4096 || !turn.seen.insert((request.start, timestamp, output)) { return None }
        turn.output = turn.output.checked_add(output)?;
        turn.decode_ms = turn.decode_ms.checked_add(decode)?;
        turn.ttft_ms = turn.ttft_ms.checked_add(ttft)?;
        turn.requests += 1;
        Some(json!({
            "threadId": id, "turnId": turn.id, "requests": turn.requests,
            "outputTokens": turn.output, "decodeMs": turn.decode_ms,
            "ttftMs": turn.ttft_ms as f64 / turn.requests as f64,
            "tokensPerSec": turn.output as f64 * 1000.0 / turn.decode_ms as f64,
        }))
    }

    fn batch(&mut self, value: &Value) -> Vec<Value> {
        let mut updates = Vec::new();
        for resource in value["resourceLogs"].as_array().into_iter().flatten() {
            for scope in resource["scopeLogs"].as_array().into_iter().flatten() {
                for record in scope["logRecords"].as_array().into_iter().flatten() {
                    if let Some(update) = self.record(record) { updates.push(update); }
                }
            }
        }
        updates
    }
}

#[derive(Clone)]
struct CollectorState {
    key: String,
    metrics: Arc<Mutex<Metrics>>,
    sink: Arc<dyn EventSink>,
}

async fn collect(State(state): State<CollectorState>, headers: HeaderMap, Json(value): Json<Value>) -> (StatusCode, Json<Value>) {
    if headers.get("x-lemma-metrics").and_then(|v| v.to_str().ok()) != Some(state.key.as_str()) {
        return (StatusCode::UNAUTHORIZED, Json(json!({})));
    }
    let updates = match state.metrics.lock() {
        Ok(mut metrics) => metrics.batch(&value),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({}))),
    };
    for update in updates { state.sink.emit("codex:request-metrics", update); }
    (StatusCode::OK, Json(json!({})))
}

pub(crate) struct Collector {
    pub(crate) metrics: Arc<Mutex<Metrics>>,
    task: JoinHandle<()>,
}

impl Drop for Collector {
    fn drop(&mut self) { self.task.abort(); }
}

impl Collector {
    pub(crate) async fn start(command: &mut Command, sink: Arc<dyn EventSink>) -> Option<Self> {
        // Preserve a configured exporter, including one chosen in a profile. Timing
        // is optional; never replace another observer or rewrite config.toml.
        let config = crate::config::get_config_path().ok()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|text| toml::from_str::<toml::Value>(&text).ok());
        if config.as_ref().is_some_and(custom_exporter) { return None }
        Self::bind(command, sink).await
    }

    async fn bind(command: &mut Command, sink: Arc<dyn EventSink>) -> Option<Self> {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) => { log::warn!("Local request timing unavailable: {error}"); return None }
        };
        let port = listener.local_addr().ok()?.port();
        let key = uuid::Uuid::new_v4().to_string();
        command.args(["-c", &format!("otel.exporter={{otlp-http={{endpoint=\"http://127.0.0.1:{port}/v1/logs\",protocol=\"json\",headers={{x-lemma-metrics=\"{key}\"}}}}}}")]);
        command.args(["-c", "otel.log_user_prompt=false"]);
        command.env("OTEL_BLRP_SCHEDULE_DELAY", "300");
        let metrics = Arc::new(Mutex::new(Metrics::default()));
        let state = CollectorState { key, metrics: Arc::clone(&metrics), sink };
        let app = Router::new().route("/v1/logs", post(collect))
            .layer(DefaultBodyLimit::max(2 * 1024 * 1024)).with_state(state);
        let task = tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, app).await { log::warn!("Local request timing stopped: {error}"); }
        });
        Some(Self { metrics, task })
    }
}

fn custom_exporter(value: &toml::Value) -> bool {
    let Some(table) = value.as_table() else { return false };
    table.get("otel").and_then(|v| v.get("exporter")).is_some_and(|v| v.as_str() != Some("none")) ||
        table.values().any(custom_exporter)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(name: &str, time: i64, extra: &[(&str, Value)]) -> Value {
        let mut fields = vec![("event.name", json!(name)), ("event.timestamp", json!(DateTime::from_timestamp_millis(time).unwrap().to_rfc3339())), ("conversation.id", json!("thread"))];
        fields.extend_from_slice(extra);
        json!({"attributes": fields.into_iter().map(|(key, value)| json!({"key":key,"value":if value.is_string(){json!({"stringValue":value})}else{json!({"intValue":value.to_string()})}})).collect::<Vec<_>>()})
    }
    fn state() -> Metrics {
        let mut m = Metrics::default();
        m.threads.insert("thread".into(), Thread { turns: VecDeque::from([Turn { id: "turn1".into(), start: 1000, end: Some(20000), ..Turn::default() }, Turn { id: "turn2".into(), start: 21000, ..Turn::default() }]), request: None });
        m
    }
    fn request(m: &mut Metrics, headers: i64, first: i64, end: i64, output: u64, kind: &str) -> Value {
        m.record(&event("codex.api_request", headers, &[("endpoint",json!("/responses")),("duration_ms",json!(500)),("http.response.status_code",json!(200))]));
        m.record(&event("codex.sse_event", first, &[("event.kind",json!(kind))]));
        // The raw completion has no usage and must not consume the request.
        assert!(m.record(&event("codex.sse_event", end, &[("event.kind",json!("response.completed"))])).is_none());
        m.record(&event("codex.sse_event", end, &[("event.kind",json!("response.completed")),("output_token_count",json!(output)),("reasoning_token_count",json!(if kind.contains("reasoning") { output/2 } else { 0 }))])).unwrap()
    }
    #[test]
    fn reasoning_and_tools_are_weighted_without_double_counting_or_tool_wait() {
        let mut m = state();
        let a = request(&mut m, 2000, 2500, 4500, 160, "response.reasoning_text.delta");
        assert_eq!(a["tokensPerSec"],80.0);
        assert_eq!(a["ttftMs"],1000.0);
        let b = request(&mut m, 12000, 12500, 13500, 40, "response.function_call_arguments.delta");
        assert!((b["tokensPerSec"].as_f64().unwrap()-200.0/3.0).abs()<0.001);
        assert_eq!(b["requests"],2);
        // Batched delivery after turn2 starts still belongs to turn1.
        assert_eq!(b["turnId"],"turn1");
        assert!(m.record(&event("codex.sse_event", 13500, &[("event.kind",json!("response.completed")),("output_token_count",json!(40))])).is_none());
    }
    #[test]
    fn unknown_or_incomplete_streams_do_not_fabricate_speed() {
        let mut m = state();
        assert!(m.record(&event("codex.sse_event", 5000, &[("event.kind",json!("response.completed")),("output_token_count",json!(10))])).is_none());
        m.record(&event("codex.api_request", 2000, &[("endpoint",json!("/responses")),("duration_ms",json!(500)),("http.response.status_code",json!(200))]));
        assert!(m.record(&event("codex.sse_event", 5000, &[("event.kind",json!("response.completed")),("output_token_count",json!(10))])).is_none());
    }
    #[test]
    fn reported_hidden_reasoning_requires_an_observed_reasoning_stream() {
        let mut m = state();
        m.record(&event("codex.api_request", 2000, &[("endpoint",json!("/responses")),("duration_ms",json!(500)),("http.response.status_code",json!(200))]));
        m.record(&event("codex.sse_event", 17000, &[("event.kind",json!("response.output_text.delta"))]));
        assert!(m.record(&event("codex.sse_event", 19000, &[("event.kind",json!("response.completed")),("output_token_count",json!(1600)),("reasoning_token_count",json!(1200))])).is_none());
    }

    #[test]
    fn recorded_codex_0163_wire_metadata() {
        let value: Value = serde_json::from_str(include_str!("../tests/fixtures/request-metrics.json")).unwrap();
        let records = value["resourceLogs"][0]["scopeLogs"][0]["logRecords"].as_array().unwrap();
        let stamp = |record: &Value| DateTime::parse_from_rfc3339(record["attributes"].as_array().unwrap().iter().find(|a| a["key"] == "event.timestamp").unwrap()["value"]["stringValue"].as_str().unwrap()).unwrap().timestamp_millis();
        let mut m = Metrics::default();
        m.threads.insert("thread".into(), Thread { turns: VecDeque::from([Turn { id: "fixture".into(), start: stamp(&records[0])-1000, ..Turn::default() }]), request: None });
        let updates = m.batch(&value);
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0]["outputTokens"], 160);
        assert!((updates[0]["tokensPerSec"].as_f64().unwrap()-80.0).abs()<2.0);
        assert!(m.batch(&value).is_empty());
    }

    #[tokio::test]
    async fn authenticated_loopback_transport() {
        struct Sink(Mutex<Vec<Value>>);
        impl EventSink for Sink {
            fn emit(&self, event: &str, payload: Value) {
                assert_eq!(event, "codex:request-metrics");
                self.0.lock().unwrap().push(payload);
            }
        }
        let sink = Arc::new(Sink(Mutex::new(Vec::new())));
        let mut command = Command::new("not-spawned");
        let collector = Collector::bind(&mut command, sink.clone()).await.unwrap();
        let args: Vec<_> = command.as_std().get_args().map(|s| s.to_string_lossy().to_string()).collect();
        let config: toml::Value = toml::from_str(args.iter().find(|s| s.starts_with("otel.exporter=")).unwrap()).unwrap();
        let exporter = &config["otel"]["exporter"]["otlp-http"];
        let url = exporter["endpoint"].as_str().unwrap();
        let key = exporter["headers"]["x-lemma-metrics"].as_str().unwrap();
        let value: Value = serde_json::from_str(include_str!("../tests/fixtures/request-metrics.json")).unwrap();
        collector.metrics.lock().unwrap().threads.insert("thread".into(), Thread { turns: VecDeque::from([Turn { id: "http".into(), start: 0, ..Turn::default() }]), request: None });
        let client = reqwest::Client::new();
        assert_eq!(client.post(url).json(&value).send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
        assert!(sink.0.lock().unwrap().is_empty());
        let response = client.post(url).header("x-lemma-metrics", key).json(&value).send().await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        assert_eq!(response.json::<Value>().await.unwrap(), json!({}));
        assert_eq!(sink.0.lock().unwrap().len(), 1);
        client.post(url).header("x-lemma-metrics", key).json(&value).send().await.unwrap();
        assert_eq!(sink.0.lock().unwrap().len(), 1);
    }

    #[test]
    fn respect_custom_exporters() {
        assert!(custom_exporter(&toml::from_str("[profiles.work.otel]\nexporter={otlp-http={endpoint='http://example.test'}}").unwrap()));
        assert!(!custom_exporter(&toml::from_str("[otel]\nexporter='none'").unwrap()));
    }
    #[test]
    fn bridge_timing_uses_actual_requests_without_double_counting_native_otlp() {
        let mut metrics=Metrics::default();
        metrics.threads.insert("thread".into(),Thread{turns:VecDeque::from([Turn{id:"turn".into(),start:0,..Default::default()}]),request:None});
        metrics.manage("thread",true);
        let usage=json!({"output_tokens":80,"output_tokens_details":{"reasoning_tokens":0}});
        let update=metrics.external(ExternalRequest{thread_id:"thread",start:1000,headers:1100,first:Some(1200),end:2200,usage:&usage,reasoning_seen:false}).unwrap();
        assert_eq!(update["tokensPerSec"],80.0);assert_eq!(update["requests"],1);
        let fixture:Value=serde_json::from_str(include_str!("../tests/fixtures/request-metrics.json")).unwrap();
        assert!(metrics.batch(&fixture).is_empty());assert_eq!(metrics.threads["thread"].turns[0].requests,1);
        let hidden=json!({"output_tokens":80,"output_tokens_details":{"reasoning_tokens":30}});
        assert!(metrics.external(ExternalRequest{thread_id:"thread",start:3000,headers:3100,first:Some(3200),end:4200,usage:&hidden,reasoning_seen:false}).is_none());
        metrics.manage("thread",false);assert!(!metrics.managed.contains("thread"));
    }

}
