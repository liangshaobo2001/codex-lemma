//! Bounded Responses SSE decoding, shared by capability probes and the live relay.
use serde_json::Value;
use std::collections::BTreeMap;

pub const MAX_FRAME_BYTES: usize=2*1024*1024;
pub const MAX_RESPONSE_BYTES: usize=16*1024*1024;
pub fn failure(message:&str)->Value {
    serde_json::json!({"type":"response.failed","response":{"id":"lemma-tool-adapter-error","status":"failed","output":[],"error":{"code":"tool_discovery_error","message":message}}})
}


// Some Responses-compatible servers omit output_index while retaining stable item IDs.
// Repair those events per response; never merge distinct items or overwrite an explicit index.
#[derive(Default)]
struct OutputIndices {
    ids:BTreeMap<String,u64>, calls:BTreeMap<String,u64>,
    occupied:BTreeMap<u64,(Option<String>,Option<String>)>,
}
impl OutputIndices {
    fn explicit(event:&Value)->Result<Option<u64>,String> {
        match event.get("output_index").filter(|value|!value.is_null()) {
            Some(value)=>value.as_u64().map(Some).ok_or("Output index must be a non-negative integer.".into()),
            None=>Ok(None),
        }
    }
    fn known(&self,id:Option<&str>,call:Option<&str>)->Result<Option<u64>,String> {
        let item=id.and_then(|id|self.ids.get(id)).copied();
        let call=call.and_then(|id|self.calls.get(id)).copied();
        if item.zip(call).is_some_and(|(a,b)|a!=b) {return Err("Output item identities disagree about their index.".into());}
        Ok(item.or(call))
    }
    fn normalize(&mut self,event:&mut Value)->Result<(),String> {
        let kind=event["type"].as_str().unwrap_or("");
        if matches!(kind,"response.output_item.added"|"response.output_item.done") {
            let item=event["item"].as_object().ok_or("Output event has no item.")?;
            let id=item.get("id").and_then(Value::as_str).filter(|id|!id.is_empty()).map(str::to_string);
            let call=item.get("call_id").and_then(Value::as_str).filter(|id|!id.is_empty()).map(str::to_string);
            let explicit=Self::explicit(event)?;
            let known=self.known(id.as_deref(),call.as_deref())?;
            if explicit.zip(known).is_some_and(|(a,b)|a!=b) {return Err("Provider changed an output item's index.".into());}
            let index=match explicit.or(known) {
                Some(index)=>index,
                None=>{
                    if id.is_none()&&call.is_none() {return Err("Output event has neither an index nor a stable item identity.".into());}
                    let mut index=0;while self.occupied.contains_key(&index) {index+=1;}index
                },
            };
            let occupied=self.occupied.entry(index).or_default();
            if occupied.0.as_ref().zip(id.as_ref()).is_some_and(|(a,b)|a!=b)
                ||occupied.1.as_ref().zip(call.as_ref()).is_some_and(|(a,b)|a!=b) {
                return Err("Provider reused an output index for different items.".into());
            }
            if let Some(id)=id {self.ids.insert(id.clone(),index);occupied.0=Some(id);}
            if let Some(call)=call {self.calls.insert(call.clone(),index);occupied.1=Some(call);}
            event["output_index"]=Value::from(index);
        } else if kind.starts_with("response.") {
            let id=event["item_id"].as_str();let call=event["call_id"].as_str();
            if let Some(index)=self.known(id,call)? {
                if Self::explicit(event)?.is_some_and(|explicit|explicit!=index) {return Err("Output delta index disagrees with its item identity.".into());}
                event["output_index"]=Value::from(index);
            }
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct Decoder { buffer:Vec<u8>, total:usize, indices:OutputIndices }
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
                let mut value:Value=serde_json::from_str(&data).map_err(|_|"Invalid Responses event JSON.")?;
                if !value["type"].is_string() { return Err("Responses event has no type.".into()); }
                self.indices.normalize(&mut value)?;
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

    fn decode_events(events:&[Value])->Result<Vec<Value>,String> {
        let wire=events.iter().map(|event|format!("data: {event}\n\n")).collect::<String>();
        Decoder::default().push(wire.as_bytes())
    }
    #[test]
    fn recorded_bonsai_stream_without_indices_completes_with_stable_message_identity() {
        let wire=include_bytes!("../../tests/fixtures/bonsai-responses-missing-indices.sse");
        for width in [1,7,64,wire.len()] {
            let mut decoder=Decoder::default();let mut capture=ResponseCapture::default();let mut deltas=0;
            for chunk in wire.chunks(width) {
                for event in decoder.push(chunk).unwrap() {
                    if event["type"]=="response.output_text.delta" {assert_eq!(event["output_index"],0);deltas+=1;}
                    capture.observe(&event).unwrap();
                }
            }
            decoder.finish().unwrap();let response=capture.finish().unwrap();
            assert_eq!(response["status"],"completed");assert_eq!(response["output"][0]["content"][0]["text"],"OK");assert_eq!(deltas,1);
        }
    }
    #[test]
    fn missing_indices_keep_interleaved_tool_arguments_and_reverse_completions_separate() {
        let a=json!({"id":"a","type":"function_call","call_id":"call-a","name":"one","arguments":"{}"});
        let b=json!({"id":"b","type":"function_call","call_id":"call-b","name":"two","arguments":"{}"});
        let events=decode_events(&[
            json!({"type":"response.output_item.added","item":a}),
            json!({"type":"response.output_item.added","item":b}),
            json!({"type":"response.function_call_arguments.delta","item_id":"b","delta":"{}"}),
            json!({"type":"response.function_call_arguments.delta","call_id":"call-a","delta":"{}"}),
            json!({"type":"response.output_item.done","item":b}),
            json!({"type":"response.output_item.done","item":a}),
            json!({"type":"response.completed","response":{"status":"completed","output":[a,b]}}),
        ]).unwrap();
        for (event,index) in events.iter().zip([0,1,1,0,1,0]) {assert_eq!(event["output_index"],index);}
        assert_eq!(events[0]["item"]["call_id"],"call-a");assert_eq!(events[1]["item"]["call_id"],"call-b");
        let mut capture=ResponseCapture::default();for event in events {capture.observe(&event).unwrap();}assert_eq!(capture.finish().unwrap()["output"].as_array().unwrap().len(),2);
    }
    #[test]
    fn explicit_indices_are_preserved_and_conflicting_or_unidentifiable_events_fail() {
        let item=json!({"id":"a","type":"message","content":[]});
        let added=json!({"type":"response.output_item.added","output_index":4,"item":item});
        let events=decode_events(&[added.clone(),json!({"type":"response.output_item.done","item":item})]).unwrap();
        assert_eq!(events[0]["output_index"],4);assert_eq!(events[1]["output_index"],4);
        for next in [
            json!({"type":"response.output_item.done","output_index":3,"item":item}),
            json!({"type":"response.output_item.added","output_index":4,"item":{"id":"different","type":"message"}}),
            json!({"type":"response.output_text.delta","item_id":"a","output_index":0,"delta":"wrong"}),
        ] {assert!(decode_events(&[added.clone(),next]).is_err());}
        for index in [json!(-1),json!("0"),json!(0.5)] {assert!(decode_events(&[json!({"type":"response.output_item.added","output_index":index,"item":item})]).is_err());}
        assert!(decode_events(&[json!({"type":"response.output_item.done","item":{"type":"message"}})]).is_err());
        let mut capture=ResponseCapture::default();
        let events=decode_events(&[json!({"type":"response.output_item.done","item":item}),json!({"type":"response.completed","response":{"output":[{"id":"different","type":"message","content":[]}]}})]).unwrap();
        assert!(events.into_iter().try_for_each(|event|capture.observe(&event)).is_err());
    }
}
