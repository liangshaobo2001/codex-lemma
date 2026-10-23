//! Bounded Responses SSE decoding, shared by capability probes and the live relay.
use serde_json::Value;
use std::collections::BTreeMap;

pub const MAX_FRAME_BYTES: usize=2*1024*1024;
pub const MAX_RESPONSE_BYTES: usize=16*1024*1024;
pub fn failure(message:&str)->Value {
    serde_json::json!({"type":"response.failed","response":{"id":"lemma-tool-adapter-error","status":"failed","output":[],"error":{"code":"tool_discovery_error","message":message}}})
}

#[derive(Default)]
pub struct Decoder { buffer:Vec<u8>, total:usize }
impl Decoder {
    pub fn push(&mut self, bytes:&[u8]) -> Result<Vec<Value>,String> {
        self.total=self.total.checked_add(bytes.len()).ok_or("Response is too large.")?;
        if self.total>MAX_RESPONSE_BYTES { return Err("Response exceeds the compatibility limit.".into()); }
        self.buffer.extend_from_slice(bytes);
        let mut events=Vec::new();
        loop {
            let separator=self.buffer.windows(2).position(|w|w==b"\n\n").map(|i|(i,2))
                .or_else(||self.buffer.windows(4).position(|w|w==b"\r\n\r\n").map(|i|(i,4)));
            let Some((end,width))=separator else { break };
            if end>MAX_FRAME_BYTES { return Err("Response frame is too large.".into()); }
            let frame=std::str::from_utf8(&self.buffer[..end]).map_err(|_|"Response frame is not UTF-8.")?;
            let data=frame.lines().filter_map(|line|line.strip_prefix("data:").map(|v|v.strip_prefix(' ').unwrap_or(v)))
                .collect::<Vec<_>>().join("\n");
            if !data.is_empty() && data!="[DONE]" {
                let value:Value=serde_json::from_str(&data).map_err(|_|"Invalid Responses event JSON.")?;
                if !value["type"].is_string() { return Err("Responses event has no type.".into()); }
                events.push(value);
            }
            self.buffer.drain(..end+width);
        }
        if self.buffer.len()>MAX_FRAME_BYTES { return Err("Response frame is too large.".into()); }
        Ok(events)
    }
    pub fn finish(&self) -> Result<(),String> {
        if self.buffer.iter().any(|c|!c.is_ascii_whitespace()) { return Err("The Responses stream ended inside an event.".into()); }
        Ok(())
    }
}

#[derive(Default)]
pub struct ResponseCapture { items:BTreeMap<u64,Value>, response:Option<Value>, ids:BTreeMap<String,u64>, calls:BTreeMap<String,u64> }
impl ResponseCapture {
    fn identity(&mut self,index:u64,item:&Value)->Result<(),String> {
        for (field,seen) in [("id",&mut self.ids),("call_id",&mut self.calls)] {
            if let Some(id)=item[field].as_str() {
                if id.is_empty() || seen.get(id).is_some_and(|previous|*previous!=index) {return Err("Provider reused an output identity for different items.".into());}
                seen.insert(id.into(),index);
            }
        }
        if matches!(item["type"].as_str(),Some("function_call"|"custom_tool_call"|"tool_search_call")) && item["call_id"].as_str().is_none_or(str::is_empty) {
            return Err("Executable output has no call identity.".into());
        }
        if let Some(previous)=self.items.get(&index) && previous!=item {return Err("Provider changed an already completed output item.".into());}
        Ok(())
    }
    pub fn observe(&mut self, event:&Value) -> Result<(),String> {
        match event["type"].as_str().unwrap_or("") {
            "response.output_item.added" => {
                let index=event["output_index"].as_u64().ok_or("Output event has no index.")?;
                self.identity(index,&event["item"])?;
            },
            "response.output_item.done" => {
                let index=event["output_index"].as_u64().ok_or("Output event has no index.")?;
                if !event["item"].is_object() { return Err("Output event has no item.".into()); }
                self.identity(index,&event["item"])?;self.items.insert(index,event["item"].clone());
            },
            "response.completed" => {
                if !event["response"].is_object() { return Err("Completion event has no response.".into()); }
                if let Some(items)=event.pointer("/response/output").and_then(Value::as_array) {
                    for (index,item) in items.iter().enumerate() {self.identity(index as u64,item)?;}
                }
                self.response=Some(event["response"].clone());
            },
            "error" | "response.failed" | "response.incomplete" => return Err("The provider did not complete the Responses stream.".into()),
            _ => {},
        }
        Ok(())
    }
    pub fn finish(mut self) -> Result<Value,String> {
        let mut response=self.response.take().ok_or("The provider ended without response.completed.")?;
        let output=response.get_mut("output").ok_or("Completed response has no output.")?;
        if !output.is_array() { return Err("Completed response output is not an array.".into()); }
        if output.as_array().unwrap().is_empty() && !self.items.is_empty() { *output=Value::Array(self.items.into_values().collect()); }
        Ok(response)
    }
}

pub async fn collect(mut response:reqwest::Response) -> Result<Value,String> {
    if !response.status().is_success() { return Err(format!("Provider returned HTTP {}.",response.status().as_u16())); }
    let is_stream=response.headers().get("content-type").and_then(|v|v.to_str().ok()).is_some_and(|v|v.contains("text/event-stream"));
    let mut decoder=Decoder::default();let mut capture=ResponseCapture::default();let mut json=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_|"Provider response could not be read.")? {
        if is_stream { for event in decoder.push(&chunk)? { capture.observe(&event)?; } }
        else {
            if json.len()+chunk.len()>MAX_RESPONSE_BYTES { return Err("Provider response is too large.".into()); }
            json.extend_from_slice(&chunk);
        }
    }
    if is_stream { decoder.finish()?;capture.finish() }
    else {
        let value:Value=serde_json::from_slice(&json).map_err(|_|"Invalid provider response JSON.")?;
        if value["status"]!="completed" || !value["output"].is_array() { return Err("Provider returned no completed Responses output.".into()); }
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn fragments_crlf_comments_and_utf8_roundtrip() {
        let event=json!({"type":"response.output_text.delta","delta":"工具 ✓"});
        let wire=format!(": heartbeat\r\n\r\nevent: response.output_text.delta\r\ndata: {event}\r\n\r\ndata: [DONE]\r\n\r\n");
        for width in 1..=wire.len() {
            let mut decoder=Decoder::default();let mut actual=Vec::new();
            for chunk in wire.as_bytes().chunks(width) { actual.extend(decoder.push(chunk).unwrap()); }
            decoder.finish().unwrap();assert_eq!(actual,vec![event.clone()]);
        }
    }
    #[test]
    fn truncation_and_fake_success_are_errors() {
        let mut decoder=Decoder::default();decoder.push(b"data: {\"type\":\"response.created\"}").unwrap();assert!(decoder.finish().is_err());
        let mut capture=ResponseCapture::default();capture.observe(&json!({"type":"response.created","response":{}})).unwrap();assert!(capture.finish().is_err());
        for kind in ["error","response.failed","response.incomplete"] { assert!(ResponseCapture::default().observe(&json!({"type":kind})).is_err()); }
    }
    #[test]
    fn completed_items_supply_output_when_provider_omits_it_in_final_array() {
        let mut capture=ResponseCapture::default();let item=json!({"type":"function_call","name":"probe","call_id":"exact","arguments":"{}"});
        capture.observe(&json!({"type":"response.output_item.done","output_index":0,"item":item})).unwrap();
        capture.observe(&json!({"type":"response.completed","response":{"status":"completed","output":[]}})).unwrap();
        assert_eq!(capture.finish().unwrap()["output"],json!([item]));
    }
    #[test]
    fn malformed_frames_fail_instead_of_becoming_empty_output() {
        for bytes in [b"data: {bad}\n\n".as_slice(),b"data: {}\n\n".as_slice()] { assert!(Decoder::default().push(bytes).is_err()); }
        assert!(Decoder::default().push(&vec![b'x';MAX_FRAME_BYTES+1]).is_err());
    }
    #[test]
    fn duplicate_or_changing_execution_identities_are_rejected() {
        let item=json!({"type":"function_call","id":"item","call_id":"call","name":"exec_command","arguments":"{}"});
        let mut capture=ResponseCapture::default();
        capture.observe(&json!({"type":"response.output_item.done","output_index":0,"item":item})).unwrap();
        assert!(capture.observe(&json!({"type":"response.output_item.added","output_index":1,"item":item})).is_err());
        let mut changed=item;changed["arguments"]=json!("{\"changed\":true}");
        assert!(capture.observe(&json!({"type":"response.completed","response":{"output":[changed]}})).is_err());
    }
}
