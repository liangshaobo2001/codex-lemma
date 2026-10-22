use axum::Json;

use super::to_error_response;
use crate::types::ErrorResponse;
use codexia_codex::stats::{UsageStats, collect_usage_stats};

pub(crate) async fn api_codex_usage_stats() -> Result<Json<UsageStats>, ErrorResponse> {
    let result = collect_usage_stats().await.map_err(to_error_response)?;
    Ok(Json(result))
}
