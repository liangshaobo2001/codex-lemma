use axum::{Json, extract::State as AxumState, http::StatusCode, response::IntoResponse};
use serde::{Deserialize};
use serde_json::{json, Value};
use codexia_codex::env::set_env;
use codexia_codex::providers::{load_env_keys, load_and_fetch_models};

use super::types::{ErrorResponse, WebServerState};

mod claude_usage;
mod custom_models;
mod reviewer;
mod codex;
mod file;
mod git;
mod openapp;
mod automation;
mod stats;
mod mcp_unified;
mod skills;
mod settings;
mod skillssh;
mod terminal;
mod types;

pub(super) use claude_usage::*;
pub(super) use custom_models::*;
pub(super) use reviewer::*;
pub(super) use codex::*;
pub(super) use file::*;
pub(super) use git::*;
pub(super) use openapp::*;
pub(super) use automation::*;
pub(super) use stats::*;
pub(super) use skills::*;
pub(super) use settings::*;
pub(super) use skillssh::*;
pub(super) use terminal::*;
pub(super) use types::*;

pub(super) async fn api_prevent_sleep(
    AxumState(state): AxumState<WebServerState>,
    Json(params): Json<SleepParams>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .sleep_state
        .prevent_sleep(params.conversation_id)
        .await
        .map_err(to_error_response)?;
    Ok(StatusCode::OK)
}

pub(super) async fn api_allow_sleep(
    AxumState(state): AxumState<WebServerState>,
    Json(params): Json<SleepParams>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .sleep_state
        .allow_sleep(params.conversation_id)
        .await
        .map_err(to_error_response)?;
    Ok(StatusCode::OK)
}

pub(super) async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok"
    }))
}

fn to_error_response(err: impl ToString) -> ErrorResponse {
    ErrorResponse {
        error: err.to_string(),
    }
}

#[derive(Deserialize)]
pub struct SetEnvPayload {
    key: String,
    value: String,
}

pub(super) async fn api_model_list_other() -> Result<Json<Value>, ErrorResponse> {
    match load_and_fetch_models().await {
        Ok(models) => Ok(Json(json!(models))),
        Err(e) => Err(ErrorResponse { error: e }),
    }
}

#[derive(Deserialize)]
pub struct AddProviderPayload {
    provider: String,
    base_url: String,
    #[serde(default)]
    env_key: String,
    /// New API key; absent keeps the stored one, empty stores none.
    #[serde(default)]
    api_key: Option<String>,
}

pub(super) async fn api_list_provider_presets() -> Result<Json<Value>, ErrorResponse> {
    match codexia_codex::providers::list_provider_presets() {
        Ok(presets) => Ok(Json(json!(presets))),
        Err(e) => Err(ErrorResponse { error: e }),
    }
}

pub(super) async fn api_add_model_provider(
    AxumState(state): AxumState<WebServerState>,
    Json(payload): Json<AddProviderPayload>,
) -> Result<StatusCode, ErrorResponse> {
    let codex = state.codex_state.as_deref().ok_or_else(|| ErrorResponse {
        error: "codex backend is not available (codex binary not found in PATH)".to_string(),
    })?;
    codexia_codex::config::provider::write_model_provider(
        &codex.codex,
        &payload.provider,
        &payload.base_url,
        &payload.env_key,
        payload.api_key.as_deref(),
    )
    .await
    .map_err(|e| ErrorResponse { error: e })?;
    Ok(StatusCode::OK)
}

pub(super) async fn api_list_config_providers(
    AxumState(state): AxumState<WebServerState>,
) -> Result<Json<Value>, ErrorResponse> {
    let codex = state.codex_state.as_deref().ok_or_else(|| ErrorResponse {
        error: "codex backend is not available (codex binary not found in PATH)".to_string(),
    })?;
    match codexia_codex::config::provider::read_model_providers(&codex.codex).await {
        Ok(providers) => Ok(Json(json!(providers))),
        Err(e) => Err(ErrorResponse { error: e }),
    }
}

#[derive(Deserialize)]
pub struct RemoveProviderPayload {
    provider: String,
}

pub(super) async fn api_remove_model_provider(
    Json(payload): Json<RemoveProviderPayload>,
) -> Result<StatusCode, ErrorResponse> {
    codexia_codex::config::provider::remove_model_provider(&payload.provider)
        .map_err(|e| ErrorResponse { error: e })?;
    Ok(StatusCode::OK)
}

pub(super) async fn api_load_env_keys() -> Result<Json<Value>, ErrorResponse> {
    match load_env_keys().await {
        Ok(items) => Ok(Json(json!(items))),
        Err(e) => Err(ErrorResponse { error: e }),
    }
}

pub(super) async fn api_set_env(
    AxumState(_state): AxumState<WebServerState>,
    Json(payload): Json<SetEnvPayload>,
) -> Result<StatusCode, ErrorResponse> {
    // Delegate to the same implementation used by the Tauri command
    set_env(payload.key, payload.value)
        .map_err(|e| ErrorResponse { error: e })?;
    Ok(StatusCode::OK)
}

