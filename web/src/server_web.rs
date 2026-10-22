use std::sync::Arc;

use tokio::sync::broadcast;

use super::{router::create_router, types::WebServerState};
use crate::auth::DeviceToken;
use codexia_codex::AppState;
use codexia_shared::sleep::SleepState;
use crate::watcher::WebWatchState;

/// Serves the HTTP API against state the caller already owns.
///
/// Used by the desktop app for its own loopback API. It starts no runtimes of
/// its own: the caller passes in the automation runtime it already owns.
///
/// Returns once `shutdown` resolves, releasing the port.
#[allow(clippy::too_many_arguments)]
pub async fn serve_api<F>(
    codex_state: Option<Arc<AppState>>,
    automation: Option<codexia_automation::AutomationHandle>,
    event_tx: broadcast::Sender<(String, serde_json::Value)>,
    host: &str,
    port: u16,
    shutdown: F,
) -> Result<(), String>
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    let device_token = DeviceToken::load_or_create()?;

    let state = WebServerState::new(
        codex_state,
        automation,
        Arc::new(SleepState::default()),
        Arc::new(super::terminal::WebTerminalState::default()),
        Arc::new(WebWatchState::default()),
        event_tx,
        device_token,
        port,
    );

    let app = create_router(state);
    // A just-exited previous process can hold this port for a moment after
    // its own process has already disappeared (the OS hasn't released the
    // socket yet), so a bind failure right after launch isn't necessarily
    // another instance still running — give it a few seconds to clear before
    // giving up for good.
    let addr = format!("{host}:{port}");
    let mut attempt = 0;
    let listener = loop {
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => break listener,
            Err(e) if attempt < 9 => {
                attempt += 1;
                log::warn!(
                    "[remote] bind {addr} failed ({e}), retrying ({attempt}/9)"
                );
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            Err(e) => return Err(format!("Failed to bind {addr}: {e}")),
        }
    };

    // The bound address is what actually matters: binding to a tailnet IP that
    // Tailscale later tears down leaves a socket nothing can connect to.
    match listener.local_addr() {
        Ok(addr) => log::info!("[remote] serving on http://{addr} (requested {host}:{port})"),
        Err(e) => log::warn!("[remote] serving on {host}:{port}, local_addr unavailable: {e}"),
    }

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await
    .map_err(|e| format!("Remote server stopped with an error: {e}"))?;

    log::info!("[remote] stopped");
    Ok(())
}
