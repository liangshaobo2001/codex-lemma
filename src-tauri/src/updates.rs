//! Manual-only updates. Registration and status never perform network requests.
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

const ENDPOINT: &str = "https://github.com/liangshaobo2001/codex-lemma/releases/latest/download/latest.json";
const PUBLIC_KEY: &str = include_str!("../updater.pub");
#[derive(Default)]
pub struct Updates(Mutex<Pending>);
#[derive(Default)]
struct Pending { update: Option<Update>, bytes: Option<Vec<u8>> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Release { version: String, notes: Option<String> }
fn failure(context: &str, error: impl std::fmt::Display) -> String { format!("{context}: {error}") }

#[tauri::command]
pub async fn check_lemma_update(app: tauri::AppHandle, state: State<'_, Updates>) -> Result<Option<Release>, String> {
    let mut pending=state.0.try_lock().map_err(|_|"An update operation is already in progress.")?;
    *pending=Pending::default();
    if PUBLIC_KEY.trim().is_empty() {return Err("Signed updates are not configured in this build. Use the releases page.".into());}
    let update=app.updater_builder().pubkey(PUBLIC_KEY.trim()).endpoints(vec![ENDPOINT.parse().map_err(|e|failure("Invalid update endpoint",e))?])
        .map_err(|e|failure("Cannot configure updates",e))?.timeout(std::time::Duration::from_secs(30)).build()
        .map_err(|e|failure("Cannot configure updates",e))?.check().await.map_err(|e|failure("Cannot check for updates",e))?;
    if let Some(update)=&update {
        let url=&update.download_url;
        if url.scheme()!="https" || url.host_str()!=Some("github.com") || !url.path().starts_with("/liangshaobo2001/codex-lemma/releases/download/") {
            return Err("The release download does not belong to Codex Lemma.".into());
        }
    }
    let release=update.as_ref().map(|u|Release{version:u.version.clone(),notes:u.body.clone()});
    pending.update=update;Ok(release)
}
#[tauri::command]
pub async fn download_lemma_update(state: State<'_, Updates>) -> Result<(),String> {
    let mut pending=state.0.try_lock().map_err(|_|"An update operation is already in progress.")?;
    pending.bytes=None;
    let update=pending.update.as_ref().ok_or("Check for updates first.")?;
    let bytes=update.download(|_,_|{},||{}).await.map_err(|e|failure("Cannot download or verify update",e))?;
    pending.bytes=Some(bytes);Ok(())
}
#[tauri::command]
pub async fn install_lemma_update(app:tauri::AppHandle,state:State<'_,Updates>) -> Result<(),String> {
    let pending=state.0.try_lock().map_err(|_|"An update operation is already in progress.")?;
    let update=pending.update.as_ref().ok_or("Check for updates first.")?;
    let bytes=pending.bytes.as_ref().ok_or("Download and verify the update first.")?;
    let backend=app.try_state::<codexia_codex::AppState>().ok_or("Cannot confirm whether tasks are idle. Reopen Lemma before installing.")?;
    let _guard=backend.codex.maintenance.write().await;
    backend.codex.ensure_idle().await?;
    // The plugin verifies the package again before launching the installer.
    update.install(bytes).map_err(|e|failure("Cannot install update",e))
}

