use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::CommandResult;
use crate::watcher::WatcherState;

#[tauri::command]
pub fn open_workspace(
    root: String,
    app: AppHandle,
    state: State<'_, WatcherState>,
) -> CommandResult<()> {
    state.start(app, PathBuf::from(root))?;
    Ok(())
}

#[tauri::command]
pub async fn pick_workspace_dir(app: AppHandle) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select Workspace Folder")
        .blocking_pick_folder();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_markdown_file(app: AppHandle) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_file();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn save_markdown_dialog(
    app: AppHandle,
    default_name: String,
) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Save As")
        .add_filter("Markdown", &["md"])
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(picked.map(|p| p.to_string()))
}
