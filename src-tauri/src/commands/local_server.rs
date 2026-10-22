use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::sync::broadcast;

use codexia_codex::AppState;

/// Loopback port the desktop app's own webview talks to: always up on `127.0.0.1`, so the frontend
/// calls the same HTTP handlers for every endpoint instead of a parallel `#[tauri::command]` each.
pub const LOCAL_PORT: u16 = 7419;

/// Starts the loopback API server for the app's own lifetime.
///
/// Shares the codex and automation state the desktop already manages; it is not a second set of
/// sessions. Runs until the process exits, so a never-resolving shutdown future is correct here.
pub fn start_local_server(app: &AppHandle, event_tx: broadcast::Sender<(String, Value)>) {
    let codex = app
        .try_state::<AppState>()
        .map(|s| Arc::new(AppState { codex: s.codex.clone() }));
    // Managed as `AutomationState` (an `Option`), not as a bare handle — asking
    // for the handle type directly always misses and silently leaves the
    // automation endpoints reporting "automation runtime is not available".
    let automation = app
        .try_state::<super::automation::AutomationState>()
        .and_then(|s| s.inner().clone());

    tauri::async_runtime::spawn(async move {
        let result = codexia_web::serve_api(
            codex,
            automation,
            event_tx,
            "127.0.0.1",
            LOCAL_PORT,
            std::future::pending(),
        )
        .await;

        if let Err(err) = result {
            log::error!("[local-server] {err}");
        }
    });
}
