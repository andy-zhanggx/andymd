mod error;
mod commands;
mod watcher;

use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::fs_cmd::read_file,
            commands::fs_cmd::write_file,
            commands::fs_cmd::list_workspace,
            commands::fs_cmd::create_file,
            commands::fs_cmd::create_dir,
            commands::fs_cmd::rename_path,
            commands::fs_cmd::delete_to_trash,
            commands::fs_cmd::reveal_in_finder,
            commands::workspace_cmd::open_workspace,
            commands::workspace_cmd::pick_workspace_dir,
            commands::workspace_cmd::pick_markdown_file,
            commands::workspace_cmd::save_markdown_dialog,
            commands::config_cmd::get_config,
            commands::config_cmd::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
