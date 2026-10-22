#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Runtime,
};

/// Build the macOS application menu (app + Edit submenus).
#[cfg(target_os = "macos")]
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let about = MenuItem::with_id(app, "app-about", "About Codex Lemma", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "app-quit", "Quit Codex Lemma", true, Some("CmdOrControl+Q"))?;
    let app_submenu = Submenu::with_items(app, "Codex Lemma", true, &[&about, &separator, &quit])?;

    let edit_submenu = Submenu::with_items(app, "Edit", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;

    Menu::with_items(app, &[&app_submenu, &edit_submenu])
}

/// Handle macOS menu events.
#[cfg(target_os = "macos")]
pub fn on_menu_event(app: &tauri::AppHandle, event: &tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "app-quit" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("quit-requested", ());
        }
        "app-about" => {
            if let Some(window) = app.get_webview_window("about") {
                let _ = window.show();
                let _ = window.set_focus();
            } else if let Err(e) = tauri::WebviewWindowBuilder::new(
                app,
                "about",
                tauri::WebviewUrl::App("/about".into()),
            )
            .title("")
            .inner_size(360.0, 360.0)
            .resizable(false)
            .decorations(true)
            .focused(true)
            .build()
            {
                eprintln!("Failed to open about window: {e}");
            }
        }
        _ => {}
    }
}
