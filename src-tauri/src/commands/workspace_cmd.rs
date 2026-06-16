use std::path::PathBuf;
use std::sync::Mutex;
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
    // macOS NSOpenPanel grays out .md when the extension isn't a registered UTI.
    // Provide an All Files escape hatch so users can always pick what they want.
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
        .add_filter("All Files", &["*"])
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

#[tauri::command]
pub async fn save_export_dialog(
    app: AppHandle,
    default_name: String,
    extension: String,
) -> CommandResult<Option<String>> {
    let ext = extension.clone();
    let picked = app
        .dialog()
        .file()
        .set_title("Export")
        .add_filter(extension.to_uppercase(), &[ext.as_str()])
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(picked.map(|p| p.to_string()))
}

pub struct PendingOpensState(pub Mutex<Vec<String>>);

impl Default for PendingOpensState {
    fn default() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

#[tauri::command]
pub fn take_pending_opens(state: State<'_, PendingOpensState>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}
