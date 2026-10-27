use axum::{body::Bytes, extract::Query, Json};
use serde::Deserialize;
use codexia_shared::fs::attachments::{self, Attachment};
use super::to_error_response;
use crate::types::ErrorResponse;

#[derive(Deserialize)]
pub(crate) struct AttachmentQuery { name: String }
pub(crate) async fn api_save_attachment(Query(query): Query<AttachmentQuery>, bytes: Bytes) -> Result<Json<Attachment>, ErrorResponse> {
    let result=tokio::task::spawn_blocking(move || attachments::save(&query.name,&bytes)).await
        .map_err(|_| to_error_response("Attachment save was interrupted."))?
        .map_err(to_error_response)?;
    Ok(Json(result))
}
