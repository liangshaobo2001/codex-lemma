use axum::{Json,extract::State};
use serde_json::Value;
use crate::types::{ErrorResponse,WebServerState};
use super::to_error_response;
fn runtime(state:&WebServerState)->Result<&codexia_codex::reviewer::Runtime,ErrorResponse>{
    state.codex_state.as_deref().map(|s|s.codex.reviewer.as_ref()).ok_or_else(||to_error_response("Codex backend is unavailable."))
}
pub(crate) async fn api_reviewer_settings(State(state):State<WebServerState>)->Result<Json<Value>,ErrorResponse>{runtime(&state)?.status().map(Json).map_err(to_error_response)}
pub(crate) async fn api_save_reviewer_settings(State(state):State<WebServerState>,Json(settings):Json<codexia_codex::reviewer::Settings>)->Result<Json<Value>,ErrorResponse>{runtime(&state)?.save(&settings).map(Json).map_err(to_error_response)}
