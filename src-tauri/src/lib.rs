mod commands;
mod error;
mod menu;
mod watcher;

use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    // Updater + process control are desktop-only (mobile apps update through the
    // App Store and can't relaunch themselves), so their plugins only register
    // on desktop.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let app = builder
        .manage(WatcherState::new())
        .manage(commands::workspace_cmd::PendingOpensState::default())
        .setup(|_app| {
            // The native menu bar only exists on desktop.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                let menu_obj = menu::build_menu(_app.handle(), &[], &[])?;
                _app.set_menu(menu_obj)?;
                _app.on_menu_event(|h, event| menu::on_menu_event(h, event));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs_cmd::read_file,
            commands::fs_cmd::write_file,
            commands::fs_cmd::list_workspace,
            commands::fs_cmd::create_file,
            commands::fs_cmd::create_dir,
            commands::fs_cmd::rename_path,
            commands::fs_cmd::delete_to_trash,
            commands::fs_cmd::reveal_in_finder,
            commands::fs_cmd::import_image,
            commands::fs_cmd::import_image_bytes,
            commands::fs_cmd::find_vault_root,
            commands::fs_cmd::default_vault_dir,
            commands::backlinks_cmd::count_backlinks,
            commands::workspace_cmd::open_workspace,
            commands::workspace_cmd::pick_workspace_dir,
            commands::workspace_cmd::pick_markdown_file,
            commands::workspace_cmd::pick_image_file,
            commands::workspace_cmd::save_markdown_dialog,
            commands::workspace_cmd::save_export_dialog,
            commands::workspace_cmd::export_via_pandoc,
            commands::workspace_cmd::toggle_fullscreen,
            commands::workspace_cmd::take_pending_opens,
            commands::config_cmd::get_config,
            commands::config_cmd::save_config,
            commands::version_cmd::save_version,
            commands::version_cmd::list_versions,
            commands::version_cmd::read_version,
            menu::rebuild_recent_menu,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    run_app(app);
}

/// Desktop run loop. macOS delivers "open this file" via `RunEvent::Opened`
/// (an Apple-events-only variant that doesn't exist on Windows/Linux), so that
/// branch is gated to macOS; other desktop OSes just run.
#[cfg(desktop)]
fn run_app(app: tauri::App) {
    app.run(move |_handle, _event| {
        #[cfg(target_os = "macos")]
        handle_macos_open(_handle, _event);
    });
}

/// Forward macOS "open file" requests (Finder double-click, `open` CLI) to the
/// frontend, also stashing them for `take_pending_opens` to drain on startup.
#[cfg(all(desktop, target_os = "macos"))]
fn handle_macos_open(handle: &tauri::AppHandle, event: tauri::RunEvent) {
    use tauri::{Emitter, Manager, RunEvent};

    if let RunEvent::Opened { urls } = event {
        let paths: Vec<String> = urls
            .into_iter()
            .filter_map(|url| {
                url.to_file_path()
                    .ok()
                    .map(|path| path.to_string_lossy().into_owned())
            })
            .collect();

        if paths.is_empty() {
            return;
        }

        {
            let pending = handle.state::<commands::workspace_cmd::PendingOpensState>();
            let mut guard = pending.0.lock().unwrap();
            guard.extend(paths.iter().cloned());
        }

        for path in paths {
            let _ = handle.emit("open-file-request", path);
        }
    }
}

/// Mobile: there's no `RunEvent::Opened` file-open flow, so just run the app.
#[cfg(mobile)]
fn run_app(app: tauri::App) {
    app.run(|_handle, _event| {});
}
