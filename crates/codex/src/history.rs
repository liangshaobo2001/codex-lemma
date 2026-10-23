//! Bounded display pages. The engine retains its own history/context unchanged.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use crate::CodexAppServer;

const PAGE_ITEMS: usize = 40;
const PREVIEW_BYTES: usize = 16 * 1024;
const DETAIL_BYTES: usize = 64 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Cursor {
    mode: String,
    native: Option<String>,
    end: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageParams {
    thread_id: String,
    cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    entries: Vec<Value>,
    turns: Vec<Value>,
    next_cursor: Option<String>,
    reload_cursor: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetailCursor {
    source: Cursor,
    turn_id: String,
    item_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailParams {
    thread_id: String,
    cursor: String,
    offset: Option<usize>,
}

fn decode<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, String> {
    if text.len() > 16 * 1024 { return Err("Invalid history cursor".into()); }
    serde_json::from_str(text).map_err(|_| "Invalid history cursor".into())
}

// A preview is deliberately bounded in bytes AND structure. Exact data remains
// available through the paged detail reader; truncation never changes engine data.
fn preview(value: &Value, budget: &mut usize, nodes: &mut usize, lines: &mut usize, clipped: &mut bool) -> Value {
    if *nodes == 0 { *clipped = true; return Value::Null; }
    *nodes -= 1;
    match value {
        Value::String(text) => {
            let line_end = if *lines == 0 { 0 } else { text.match_indices('\n').nth(lines.saturating_sub(1)).map(|(i, _)| i).unwrap_or(text.len()) };
            let mut end = text.len().min(*budget).min(line_end);
            while !text.is_char_boundary(end) { end -= 1; }
            *budget -= end;
            *lines = lines.saturating_sub(text[..end].bytes().filter(|b|*b == b'\n').count() + usize::from(end > 0));
            if end < text.len() { *clipped = true; }
            Value::String(text[..end].to_owned())
        }
        Value::Array(values) => {
            let mut out = Vec::new();
            for value in values {
                if *nodes == 0 || *budget == 0 { *clipped = true; break; }
                out.push(preview(value, budget, nodes, lines, clipped));
            }
            Value::Array(out)
        }
        Value::Object(values) => {
            let mut out = serde_json::Map::new();
            // Keep small engine identity fields before spending the preview budget.
            for key in ["id", "type", "status"] {
                if let Some(value) = values.get(key) {
                    out.insert(key.to_owned(), preview(value, budget, nodes, lines, clipped));
                }
            }
            for (key, value) in values {
                if matches!(key.as_str(), "id" | "type" | "status") { continue; }
                if *nodes == 0 || *budget <= key.len() { *clipped = true; break; }
                *budget -= key.len();
                out.insert(key.clone(), preview(value, budget, nodes, lines, clipped));
            }
            Value::Object(out)
        }
        _ => value.clone(),
    }
}

fn entry(turn_id: &str, item: &Value, source: &Cursor) -> Result<Value, String> {
    let mut clipped = false;
    let mut budget = PREVIEW_BYTES;
    let mut nodes = 512;
    let mut lines = 100;
    let item_preview = preview(item, &mut budget, &mut nodes, &mut lines, &mut clipped);
    let detail = DetailCursor { source: source.clone(), turn_id: turn_id.to_owned(),
        item_id: item["id"].as_str().unwrap_or("").to_owned() };
    Ok(json!({"turnId": turn_id, "item": item_preview, "truncated": clipped,
        "detailCursor": if clipped { Some(serde_json::to_string(&detail).map_err(|e| e.to_string())?) } else { None }}))
}

async fn legacy_turn(server: &CodexAppServer, thread_id: &str, cursor: &Cursor) -> Result<Value, String> {
    server.send_request("thread/turns/list", json!({"threadId":thread_id,
        "cursor":cursor.native,"limit":1,"sortDirection":"desc","itemsView":"full"})).await
}

pub async fn page(server: &CodexAppServer, params: PageParams) -> Result<Page, String> {
    let cursor: Cursor = if let Some(cursor) = params.cursor { decode(&cursor)? } else {
        let meta = server.send_request("thread/read", json!({"threadId":params.thread_id,"includeTurns":false})).await?;
        Cursor { mode: meta["thread"]["historyMode"].as_str().unwrap_or("legacy").to_owned(), native:None, end:None }
    };
    if cursor.mode == "paginated" {
        let result = server.send_request("thread/items/list", json!({"threadId":params.thread_id,
            "cursor":cursor.native,"limit":PAGE_ITEMS,"sortDirection":"desc"})).await?;
        let data = result["data"].as_array().ok_or("Invalid history page")?;
        let entries = data.iter().rev().map(|e| entry(e["turnId"].as_str().unwrap_or(""), &e["item"], &cursor)).collect::<Result<_,_>>()?;
        let next_cursor = result["nextCursor"].as_str().map(|s| serde_json::to_string(&Cursor {
            native:Some(s.to_owned()), end:None, ..cursor.clone() })).transpose().map_err(|e|e.to_string())?;
        let turn_ids: std::collections::HashSet<&str> = data.iter().filter_map(|e|e["turnId"].as_str()).collect();
        let metadata = server.send_request("thread/turns/list", json!({"threadId":params.thread_id,
            "limit":PAGE_ITEMS,"sortDirection":"desc","itemsView":"notLoaded"})).await?;
        let turns = metadata["data"].as_array().ok_or("Invalid turn metadata")?.iter()
            .filter(|t|t["id"].as_str().is_some_and(|id|turn_ids.contains(id)))
            .map(turn_metadata).collect();
        let reload_cursor = Some(serde_json::to_string(&Cursor {
            native:result["backwardsCursor"].as_str().map(str::to_owned).or(cursor.native.clone()),
            ..cursor.clone()
        }).map_err(|e|e.to_string())?);
        return Ok(Page { entries, turns, next_cursor, reload_cursor });
    }
    if cursor.mode != "legacy" { return Err("Unsupported history format".into()); }
    // Legacy engines can only project a whole turn. Split it here before it
    // crosses HTTP/WebView; never fall back to an entire thread/read response.
    let mut current = cursor;
    let mut combined = Page { entries:vec![], turns:vec![], next_cursor:None, reload_cursor:None };
    for _ in 0..5 {
        let result = legacy_turn(server, &params.thread_id, &current).await?;
        let mut part = legacy_page(result, current, PAGE_ITEMS - combined.entries.len())?;
        if combined.reload_cursor.is_none() { combined.reload_cursor = part.reload_cursor.clone(); }
        part.entries.append(&mut combined.entries);
        combined.entries = part.entries;
        part.turns.append(&mut combined.turns);
        combined.turns = part.turns;
        combined.next_cursor = part.next_cursor;
        if combined.entries.len() == PAGE_ITEMS { break; }
        let Some(next) = &combined.next_cursor else { break };
        current = decode(next)?;
    }
    Ok(combined)
}

fn turn_metadata(turn:&Value) -> Value {
    json!({"id":turn["id"],"rootTurnId":turn["rootTurnId"],"items":[],"itemsView":"notLoaded",
        "status":turn["status"],"error":null,"startedAt":turn["startedAt"],
        "completedAt":turn["completedAt"],"durationMs":turn["durationMs"]})
}

fn legacy_page(result: Value, mut cursor: Cursor, limit:usize) -> Result<Page, String> {
    let Some(turn) = result["data"].as_array().and_then(|a|a.first()) else {
        return Ok(Page { entries:vec![], turns:vec![], next_cursor:None, reload_cursor:None });
    };
    let items = turn["items"].as_array().ok_or("Invalid turn items")?;
    let end = cursor.end.unwrap_or(items.len()).min(items.len());
    cursor.native = result["backwardsCursor"].as_str().map(str::to_owned).or(cursor.native);
    cursor.end = Some(end);
    let reload_cursor = Some(serde_json::to_string(&cursor).map_err(|e|e.to_string())?);
    let start = end.saturating_sub(limit);
    let entries = items[start..end].iter().map(|item|entry(turn["id"].as_str().unwrap_or(""),item,&cursor)).collect::<Result<_,_>>()?;
    let next = if start > 0 { Some(Cursor { end:Some(start), ..cursor }) }
        else { result["nextCursor"].as_str().map(|s| Cursor { native:Some(s.to_owned()),end:None,..cursor }) };
    Ok(Page { entries, turns:vec![turn_metadata(turn)], reload_cursor, next_cursor:next.map(|c|serde_json::to_string(&c)).transpose().map_err(|e|e.to_string())? })
}

// Serializes only one text window without allocating the complete JSON string.
struct TextWindow { offset:usize, position:usize, bytes:Vec<u8> }
impl std::io::Write for TextWindow {
    fn write(&mut self, bytes:&[u8]) -> std::io::Result<usize> {
        let start = self.offset.saturating_sub(self.position).min(bytes.len());
        let take = (DETAIL_BYTES + 4).saturating_sub(self.bytes.len()).min(bytes.len()-start);
        self.bytes.extend_from_slice(&bytes[start..start+take]);
        self.position += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> { Ok(()) }
}

pub async fn detail(server:&CodexAppServer, params:DetailParams) -> Result<Value,String> {
    let cursor:DetailCursor = decode(&params.cursor)?;
    let result = if cursor.source.mode == "paginated" {
        server.send_request("thread/items/read",json!({"threadId":params.thread_id,
            "turnId":cursor.turn_id,"itemIds":[cursor.item_id]})).await?
    } else if cursor.source.mode == "legacy" {
        legacy_turn(server,&params.thread_id,&cursor.source).await?
    } else { return Err("Invalid history cursor".into()); };
    let items:Vec<&Value> = if cursor.source.mode == "paginated" {
        result["data"].as_array().ok_or("Invalid history detail")?.iter().map(|e|&e["item"]).collect()
    } else {
        let turn = result["data"].as_array().and_then(|v|v.first()).ok_or("History changed; reopen the session")?;
        if turn["id"].as_str() != Some(&cursor.turn_id) { return Err("History changed; reopen the session".into()); }
        turn["items"].as_array().ok_or("Invalid history detail")?.iter().collect()
    };
    let item = items.into_iter().find(|i|i["id"].as_str()==Some(&cursor.item_id)).ok_or("History changed; reopen the session")?;
    text_page(item,params.offset.unwrap_or(0))
}

fn text_page(item:&Value, offset:usize) -> Result<Value,String> {
    let mut window = TextWindow { offset,position:0,bytes:Vec::with_capacity(DETAIL_BYTES+4) };
    serde_json::to_writer_pretty(&mut window,item).map_err(|e|e.to_string())?;
    // Continuation offsets always end at a UTF-8 boundary. Reject forged offsets.
    let text = std::str::from_utf8(&window.bytes).or_else(|e| {
        if e.error_len().is_none() { std::str::from_utf8(&window.bytes[..e.valid_up_to()]) } else { Err(e) }
    }).map_err(|_|"Invalid text offset".to_owned())?;
    let mut end = text.len().min(DETAIL_BYTES);
    while !text.is_char_boundary(end) { end -= 1; }
    Ok(json!({"text":&text[..end],"nextOffset":if offset+end<window.position { Some(offset+end) } else { None }}))
}

/// Live state already arrives item-by-item. Do not resend its full history graph.
pub(crate) fn trim_notification(raw:&mut Value) {
    match raw["method"].as_str() {
        Some("turn/completed") => {
            if let Some(turn) = raw.pointer_mut("/params/turn").and_then(Value::as_object_mut) {
                turn.insert("items".into(),json!([]));
            }
        }
        Some("thread/started") => {
            if let Some(thread) = raw.pointer_mut("/params/thread").and_then(Value::as_object_mut) {
                thread.insert("turns".into(),json!([]));
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_turn_is_paged_without_losing_item_boundaries() {
        let items:Vec<_>=(0..123).map(|i|json!({"type":"agentMessage","id":format!("i{i}"),"text":format!("answer {i}")})).collect();
        let result=json!({"data":[{"id":"turn","items":items}],"nextCursor":"older"});
        let mut cursor=Cursor{mode:"legacy".into(),native:None,end:None};
        let mut ids=Vec::new();
        loop {
            let page=legacy_page(result.clone(),cursor,PAGE_ITEMS).unwrap();
            assert!(page.entries.len()<=PAGE_ITEMS);
            ids.splice(0..0,page.entries.iter().map(|e|e["item"]["id"].as_str().unwrap().to_owned()));
            cursor=decode(&page.next_cursor.unwrap()).unwrap();
            if cursor.native.is_some() { break; }
        }
        assert_eq!(ids,(0..123).map(|i|format!("i{i}")).collect::<Vec<_>>());
        assert_eq!(cursor.native.as_deref(),Some("older"));
    }
    #[test]
    fn giant_record_preview_is_bounded_and_exact_detail_is_pageable() {
        let text="中文abc\n".repeat(200_000);
        let item=json!({"type":"agentMessage","id":"huge","text":text});
        let cursor=Cursor{mode:"legacy".into(),native:None,end:None};
        let p=entry("turn",&item,&cursor).unwrap();
        assert_eq!(p["truncated"],true);
        assert_eq!(p["item"]["type"],"agentMessage");
        assert!(serde_json::to_vec(&p).unwrap().len()<PREVIEW_BYTES+2000);
        let expected=serde_json::to_string_pretty(&item).unwrap();
        let mut actual=String::new();let mut offset=0;
        loop {let p=text_page(&item,offset).unwrap();let text=p["text"].as_str().unwrap();
            assert!(text.len()<=DETAIL_BYTES); actual.push_str(text);
            if let Some(next)=p["nextOffset"].as_u64(){assert!(next as usize>offset);offset=next as usize;}else{break;}}
        assert_eq!(actual,expected);
    }
    #[test]
    fn completion_notifications_preserve_status_without_full_graphs() {
        let mut event=json!({"method":"turn/completed","params":{"threadId":"t","turn":{"id":"turn","status":"interrupted","items":[{"output":"x".repeat(100_000)}]}}});
        trim_notification(&mut event);
        assert_eq!(event["params"]["turn"]["status"],"interrupted");
        assert_eq!(event["params"]["turn"]["items"],json!([]));
        assert!(serde_json::to_vec(&event).unwrap().len()<300);
    }
    #[test]
    fn deeply_structured_outputs_cannot_bypass_the_preview_budget() {
        let fields:serde_json::Map<String,Value>=(0..10_000).map(|i|(format!("key-{i}"),json!({"id":"x".repeat(1000),"text":"y".repeat(1000)}))).collect();
        let item=json!({"type":"mcpToolCall","id":"fixture","result":fields});
        let p=entry("t",&item,&Cursor{mode:"legacy".into(),native:None,end:None}).unwrap();
        assert!(serde_json::to_vec(&p).unwrap().len()<PREVIEW_BYTES+4000);
        assert_eq!(p["truncated"],true);
    }
    #[test]
    fn hostile_cursors_and_extreme_offsets_are_bounded() {
        assert!(decode::<Cursor>(&"x".repeat(20_000)).is_err());
        let page=text_page(&json!({"text":"abc"}),usize::MAX).unwrap();
        assert_eq!(page["text"],"");assert_eq!(page["nextOffset"],Value::Null);
    }
}
