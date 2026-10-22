use tauri::{AppHandle, Emitter, Manager};

pub fn show_window(app: &AppHandle, args: Vec<String>) {
    let windows = app.webview_windows();
    let main_window = match windows.values().next() {
        Some(window) => window,
        None => return,
    };

    let _ = main_window.set_focus();

    if args.len() > 1 {
        let url = args[1].clone();

        if url.starts_with("codex-lemma://") {
            let _ = main_window.emit("deep-link-received", url);
        }
    }
}
