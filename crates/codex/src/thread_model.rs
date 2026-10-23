//! A provider change must detach this connection before resuming the same thread.
use crate::CodexAppServer;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelParams {
    pub thread_id: String,
    pub model_provider: String,
    pub model: String,
    pub effort: Option<String>,
    pub context_window: Option<u64>,
    pub turn_id: Option<String>,
}

fn effective<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
        .or_else(|| value.get("thread")?.get(key)?.as_str().filter(|s| !s.is_empty()))
}

fn verify(value: &Value, params: &ModelParams) -> Result<(), String> {
    if effective(value, "modelProvider") != Some(params.model_provider.as_str())
        || effective(value, "model") != Some(params.model.as_str()) {
        return Err("The CLI did not confirm the selected provider and model.".into());
    }
    Ok(())
}

pub(crate) fn resume_params(old: &Value, params: &ModelParams) -> Result<Value, String> {
    let mut result = json!({"threadId":params.thread_id,"modelProvider":params.model_provider,
        "model":params.model,"excludeTurns":true,"serviceTier":null});
    if effective(old,"modelProvider") == Some(params.model_provider.as_str())
        && let Some(tier) = old.get("serviceTier") { result["serviceTier"] = tier.clone(); }
    for key in ["cwd", "runtimeWorkspaceRoots", "approvalPolicy", "approvalsReviewer"] {
        if let Some(value) = old.get(key).filter(|v| !v.is_null()) { result[key] = value.clone(); }
    }
    if let Some(profile) = old.pointer("/activePermissionProfile/id").and_then(Value::as_str) {
        result["permissions"] = json!(profile);
    } else {
        result["sandbox"] = json!(match old.pointer("/sandbox/type").and_then(Value::as_str) {
            Some("readOnly") => "read-only",
            Some("workspaceWrite") => "workspace-write",
            Some("dangerFullAccess") => "danger-full-access",
            _ => return Err("This sandbox cannot be preserved while switching providers.".into()),
        });
    }
    let mut config = json!({});
    if let Some(effort) = &params.effort { config["model_reasoning_effort"] = json!(effort); }
    if let Some(window) = params.context_window { config["model_context_window"] = json!(window); }
    // Preserve legacy workspace policy while the new connection initializes.
    if let Some(sandbox) = old.get("sandbox").filter(|s| s["type"] == "workspaceWrite") {
        config["sandbox_workspace_write"] = json!({"writable_roots":sandbox["writableRoots"],
            "network_access":sandbox["networkAccess"],"exclude_tmpdir_env_var":sandbox["excludeTmpdirEnvVar"],
            "exclude_slash_tmp":sandbox["excludeSlashTmp"]});
    }
    result["config"] = config;
    Ok(result)
}

pub async fn switch(codex: &CodexAppServer, params: ModelParams) -> Result<Value, String> {
    if params.model.trim().is_empty() || params.model_provider.trim().is_empty() {
        return Err("Select a provider and model.".into());
    }
    let _guard = codex.lock_thread_configuration(&params.thread_id).await;
    let read = json!({"threadId":params.thread_id,"excludeTurns":true});
    let old = codex.send_request("thread/resume", read.clone()).await?;
    let provider_changed = effective(&old, "modelProvider") != Some(params.model_provider.as_str());
    let active = old.pointer("/thread/status/type").and_then(Value::as_str) == Some("active");
    match old.pointer("/thread/status/type").and_then(Value::as_str) {
        Some("idle") => {},
        Some("active") if !provider_changed && params.turn_id.is_some() => {
            if params.context_window.is_some() && effective(&old,"model") != Some(params.model.as_str()) {
                return Err("Wait for the current task to finish before changing a custom model's context window.".into());
            }
            let update = codex.send_request("turn/settings/update",json!({"threadId":params.thread_id,
                "turnId":params.turn_id,"model":params.model,"effort":params.effort})).await?;
            if update["status"] != "applied" { return Err("The running turn could not be updated.".into()); }
        },
        _ => return Err("Wait for the current task to finish before switching providers.".into()),
    }
    if !active {
        let resume = resume_params(&old, &params)?;
        codex.send_request("thread/unsubscribe", json!({"threadId":params.thread_id})).await?;
        let changed = codex.send_request("thread/resume", resume).await?;
        verify(&changed, &params)?;
    }
    // Persist idle model/effort choices too, so queued turns use the same model as the picker.
    let mut settings = json!({"threadId":params.thread_id,"model":params.model});
    if let Some(effort) = &params.effort { settings["effort"] = json!(effort); }
    if !active {
        for (source, target) in [("sandbox","sandboxPolicy"),("disabledPluginIds","disabledPluginIds")] {
            if let Some(value) = old.get(source).filter(|v| !v.is_null()) { settings[target] = value.clone(); }
        }
        if let Some(mut mode) = old.get("collaborationMode").filter(|v| v.is_object()).cloned() {
            mode["settings"]["model"] = json!(params.model);
            if let Some(effort) = &params.effort { mode["settings"]["reasoning_effort"] = json!(effort); }
            settings["collaborationMode"] = mode;
        }
    }
    codex.send_request("thread/settings/update", settings).await?;
    let result = codex.send_request("thread/resume", read).await?;
    verify(&result, &params)?;
    for key in ["cwd","approvalPolicy","approvalsReviewer","sandbox","runtimeWorkspaceRoots","disabledPluginIds"] {
        if let Some(expected) = old.get(key)
            && result.get(key) != Some(expected) {
            return Err(format!("The CLI did not preserve {key} while switching models."));
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn params() -> ModelParams { ModelParams { thread_id:"fixture".into(),model_provider:"local".into(),
        model:"qwen".into(),effort:Some("medium".into()),context_window:Some(262144),turn_id:None } }
    #[test]
    fn effective_response_wins_over_stale_thread_metadata() {
        assert!(verify(&json!({"model":"qwen","modelProvider":"local","thread":{"model":"old","modelProvider":"openai"}}),&params()).is_ok());
        assert!(verify(&json!({"model":"old","modelProvider":"openai"}),&params()).is_err());
    }
    #[test]
    fn reconnect_preserves_permissions_workspace_and_limits() {
        let r=resume_params(&json!({"cwd":"D:/fixture","approvalPolicy":"on-request","approvalsReviewer":"user",
            "activePermissionProfile":{"id":":workspace"},"runtimeWorkspaceRoots":["D:/fixture"]}),&params()).unwrap();
        assert_eq!(r["permissions"],":workspace");assert!(r.get("sandbox").is_none());
        assert_eq!(r["cwd"],"D:/fixture");assert_eq!(r["approvalPolicy"],"on-request");
        assert_eq!(r["config"]["model_context_window"],262144);assert_eq!(r["config"]["model_reasoning_effort"],"medium");
        assert!(r["serviceTier"].is_null());assert_eq!(r["excludeTurns"],true);
    }
    #[test]
    fn inherited_effort_is_not_an_explicit_none_override() {
        let mut inherited=params(); inherited.effort=None;
        let old=json!({"sandbox":{"type":"readOnly"}});
        assert!(resume_params(&old,&inherited).unwrap()["config"].get("model_reasoning_effort").is_none());
        inherited.effort=Some("none".into());
        assert_eq!(resume_params(&old,&inherited).unwrap()["config"]["model_reasoning_effort"],"none");
    }
    #[test]
    fn unsupported_sandbox_fails_before_detaching() {
        assert!(resume_params(&json!({"sandbox":{"type":"externalSandbox"}}),&params()).is_err());
        assert_eq!(resume_params(&json!({"sandbox":{"type":"readOnly"}}),&params()).unwrap()["sandbox"],"read-only");
    }
}
