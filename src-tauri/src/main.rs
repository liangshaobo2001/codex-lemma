// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    set_taskbar_identity();
    // `fix()` only restores PATH. A GUI-launched process on macOS/Linux gets
    // none of the shell's other env vars either — agents that read API keys
    // straight from the environment (e.g. keke reading NVIDIA_API_KEY) see
    // them as unset even though they're exported in the user's shell rc.
    let _ = fix_path_env::fix_all_vars();
    codex_lemma_lib::run();
}

#[cfg(windows)]
const TASKBAR_APP_ID: &str = "app.codexlemma";

#[cfg(windows)]
fn set_taskbar_identity() {
    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }
    // Match the NSIS shortcut's AppUserModelID (the Tauri bundle identifier).
    // Set this before creating windows so Explorer groups launches consistently.
    let id: Vec<u16> = TASKBAR_APP_ID.encode_utf16().chain(Some(0)).collect();
    // SAFETY: the null-terminated UTF-16 buffer remains alive for the call.
    let result = unsafe { SetCurrentProcessExplicitAppUserModelID(id.as_ptr()) };
    if result < 0 { eprintln!("Could not set taskbar identity: {result:#x}"); }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn taskbar_identity_matches_installer_shortcuts() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["identifier"], super::TASKBAR_APP_ID);
    }
}
