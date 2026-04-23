use std::path::PathBuf;
use tauri::{AppHandle, State};

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
