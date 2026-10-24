// Core modules — the command surface exists only on desktop, where the agent
// backend actually runs. Mobile talks to a paired desktop over HTTP instead.
#[cfg(desktop)]
mod commands;
#[cfg(desktop)]
mod updates;
#[cfg(desktop)]
pub mod dictation;
#[cfg(desktop)]
mod event_sink;
#[cfg(target_os = "macos")]
mod menu;
#[cfg(target_os = "macos")]
mod usage_tray;
#[cfg(any(windows, target_os = "linux"))]
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Mobile: a webview shell. Every backend call is HTTP to the paired
    // desktop, so there are no commands and no managed agent state here.
    #[cfg(mobile)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_barcode_scanner::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        );

    // Desktop: full app with all plugins, commands, and setup.
    #[cfg(desktop)]
    let builder = {
        use dictation::DictationState;
        use codexia_shared::terminal::TerminalState;
        use codexia_shared::sleep::SleepState;
        use codexia_shared::state::WatchState;
        use codexia_codex as codex;
        use std::sync::Arc;
        use std::time::Instant;
        use tauri::Manager;

        let builder = tauri::Builder::default()
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_deep_link::init())
            .plugin(
                tauri_plugin_log::Builder::new()
                    .level(log::LevelFilter::Info)
                    .build(),
            )
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_screenshots::init());

        #[cfg(any(windows, target_os = "linux"))]
        let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            crate::window::show_window(app, argv);
        }));

        #[cfg(target_os = "macos")]
        let builder = builder
            .menu(|app| {
                crate::menu::build_menu(app)
            })
            .on_menu_event(|app, event| {
                crate::menu::on_menu_event(app, &event)
            });

        builder
            .manage(updates::Updates::default())
            .manage(WatchState::new())
            .manage(TerminalState::default())
            .manage(SleepState::default())
            .manage(DictationState::default())
            .invoke_handler(tauri::generate_handler![
                commands::codex::initialize_codex_async,
                commands::dictation::dictation_model_status,
                commands::dictation::dictation_download_model,
                commands::dictation::dictation_cancel_download,
                commands::dictation::dictation_remove_model,
                commands::dictation::dictation_start,
                commands::dictation::dictation_request_permission,
                commands::dictation::dictation_stop,
                commands::dictation::dictation_cancel,
                updates::check_lemma_update,
                updates::download_lemma_update,
                updates::install_lemma_update,
                quit_app,
            ])
            .setup(|app| {
                // fix_path_env::fix() ran in main() before the logger existed
                // to record its result — log the PATH it left behind here,
                // now that tauri_plugin_log is up, so a spawned agent's
                // mysterious "Internal error" can be checked against it.
                log::info!(
                    "PATH after fix_path_env: {}",
                    std::env::var("PATH").unwrap_or_default()
                );
                let app_handle = app.handle().clone();

                // Fan out to the webview and to the loopback server's channel (its SSE stream
                // carries the file-system watcher and replays events after a reconnect).
                let (local_event_tx, _) = tokio::sync::broadcast::channel(4096);
                let event_sink: Arc<dyn codexia_shared::event_sink::EventSink> =
                    Arc::new(event_sink::FanOutEventSink::new(vec![
                        Arc::new(event_sink::TauriEventSink::new(app_handle)),
                        Arc::new(event_sink::BroadcastEventSink::new(local_event_tx.clone())),
                    ]));

                let codex_init_started_at = Instant::now();
                let init_result = tauri::async_runtime::block_on(async {
                    let connect_started_at = Instant::now();
                    let codex_client = codex::connect_codex(Arc::clone(&event_sink)).await?;
                    log::info!(
                        "codex startup timing: connect_codex finished in {:?}",
                        connect_started_at.elapsed()
                    );
                    Ok::<_, String>(codex_client)
                });

                let codex_runner_client = init_result.as_ref().ok().cloned();

                match init_result {
                    Ok(codex_client) => {
                        log::info!(
                            "codex startup timing: total connect during setup took {:?}",
                            codex_init_started_at.elapsed()
                        );
                        app.handle().manage(codex::AppState { codex: codex_client });
                        app.handle().manage(codex::CodexInitializationState::new(
                            Arc::clone(&event_sink),
                        ));
                        // Providers are written to config.toml only when the user
                        // adds one explicitly (see `add_model_provider`).
                    }
                    Err(err) => {
                        log::warn!(
                            "codex app-server init failed after {:?}, app will continue without codex backend: {}",
                            codex_init_started_at.elapsed(),
                            err,
                        );
                    }
                }

                // Start the scheduler here rather than on the first frontend call, so
                // cron tasks fire even if the UI is never opened.
                let codex_runner = Arc::new(codex::CodexAgentRunner::new(codex_runner_client));
                let automation = match tauri::async_runtime::block_on(
                    codexia_automation::AutomationHandle::start(
                        vec![codex_runner],
                        Arc::clone(&event_sink),
                    ),
                ) {
                    Ok(handle) => Some(handle),
                    Err(err) => {
                        log::error!("failed to start automation runtime: {}", err);
                        None
                    }
                };
                app.manage::<commands::automation::AutomationState>(automation);

                // Runs left as 'running' belong to a previous process and can never finish.
                if let Err(err) = codexia_db::automation_runs::fail_orphaned_runs() {
                    log::warn!("failed to clean up orphaned automation runs: {}", err);
                }

                // The loopback API: the frontend calls the HTTP handlers for most endpoints.
                commands::local_server::start_local_server(app.handle(), local_event_tx);

                tauri::async_runtime::spawn(async {
                    tokio::task::spawn_blocking(codexia_git::scan_all_orphan_worktrees)
                        .await
                        .ok();
                });

                if let Some(main_window) = app.get_webview_window("main") {
                    let app_handle = app.handle().clone();
                    main_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            // Windows: closing the window quits (a hidden window could not be brought back by
                            // launching again). Elsewhere it hides, as before.
                            if cfg!(windows) {
                                app_handle.exit(0);
                                return;
                            }
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    });
                }

                #[cfg(target_os = "macos")]
                usage_tray::setup(app.handle())?;

                #[cfg(any(windows, target_os = "linux"))]
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    app.deep_link().register_all()?;
                }

                Ok(())
            })
    };

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: clicking the Dock icon when the main window is hidden should show it.
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let tauri::RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } = &_event
                    && !has_visible_windows
                    && let Some(window) = _app.get_webview_window("main")
                {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

#[cfg(desktop)]
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
