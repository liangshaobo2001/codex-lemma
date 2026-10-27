//! Endpoint-specific request compatibility, without rewriting stored CLI history.
use serde_json::Value;

/// OpenCode Go currently rejects `original` on DeepSeek tool-result images,
/// although its user-message image path accepts it. `high` is the highest
/// detail accepted by that tool-result path. Keep every image byte/call ID.
pub(super) fn normalize_tool_images(endpoint: &str, body: &mut Value) {
    if body["model"] != "deepseek-v4.1-flash" {
        return;
    }
    let Ok(url) = reqwest::Url::parse(endpoint) else { return };
    if url.scheme() != "https" || url.host_str() != Some("opencode.ai") {
        return;
    }
    let Some(items) = body.get_mut("input").and_then(Value::as_array_mut) else { return };
    for item in items {
        if !matches!(item["type"].as_str(), Some("function_call_output" | "custom_tool_call_output")) {
            continue;
        }
        if let Some(parts) = item.get_mut("output").and_then(Value::as_array_mut) {
            for part in parts {
                if part["type"] == "input_image" && part["detail"] == "original" {
                    part["detail"] = Value::String("high".into());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const ENDPOINT: &str = "https://opencode.ai/inference/go/openai/v1/responses";
    fn fixture() -> Value {
        json!({"model":"deepseek-v4.1-flash", "input":[
            {"type":"message","role":"user","content":[{"type":"input_image","detail":"original","image_url":"data:image/png;base64,USER"}]},
            {"type":"function_call","call_id":"a","name":"view_image","arguments":"{\"detail\":\"original\"}"},
            {"type":"function_call_output","call_id":"a","output":[{"type":"input_image","detail":"original","image_url":"data:image/jpeg;base64,TOOL"},{"type":"input_text","text":"original"}]},
            {"type":"custom_tool_call_output","call_id":"b","output":[{"type":"input_image","detail":"original","image_url":"data:image/png;base64,SECOND"}]},
            {"type":"function_call_output","call_id":"c","output":"original"},
            {"type":"function_call_output","call_id":"d","output":[{"type":"input_image","detail":"low","image_url":"data:image/png;base64,LOW"},{"type":"input_image","image_url":"data:image/png;base64,DEFAULT"}]}
        ]})
    }
    #[test]
    fn changes_only_unsupported_tool_image_detail_including_replayed_history() {
        let original = fixture();
        let mut expected = original.clone();
        expected["input"][2]["output"][0]["detail"] = json!("high");
        expected["input"][3]["output"][0]["detail"] = json!("high");
        let mut request = original.clone();
        normalize_tool_images(ENDPOINT, &mut request);
        assert_eq!(request, expected);
        assert_eq!(original["input"][2]["output"][0]["detail"], "original");
        normalize_tool_images(ENDPOINT, &mut request);
        assert_eq!(request, expected);
    }
    #[test]
    fn does_not_change_other_models_or_endpoints() {
        for endpoint in ["http://127.0.0.1:11333/v1/responses", "https://api.deepseek.com/responses", "https://api.openai.com/v1/responses", "https://opencode.ai.example.test/responses", "not-a-url"] {
            let mut request = fixture();
            normalize_tool_images(endpoint, &mut request);
            assert_eq!(request, fixture());
        }
        let mut request = fixture();
        request["model"] = json!("qwen3.8-flash-next");
        let original = request.clone();
        normalize_tool_images(ENDPOINT, &mut request);
        assert_eq!(request, original);
    }
    #[test]
    fn accepts_string_input_and_non_image_outputs_unchanged() {
        let mut request = json!({"model":"deepseek-v4.1-flash","input":"hello"});
        let original = request.clone();
        normalize_tool_images(ENDPOINT, &mut request);
        assert_eq!(request, original);
    }
}
