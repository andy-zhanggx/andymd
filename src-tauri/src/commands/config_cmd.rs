use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::error::{CommandError, CommandResult};

/// App config directory. Uses Tauri's per-platform resolver so it works the same
/// on desktop (Application Support / XDG config) and on iOS (the app sandbox),
/// instead of the desktop-only `dirs` crate.
fn config_dir(app: &AppHandle) -> CommandResult<PathBuf> {
    let d = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::Other(format!("no config dir: {e}")))?;
    fs::create_dir_all(&d)?;
    Ok(d)
}

fn config_path(app: &AppHandle) -> CommandResult<PathBuf> {
    Ok(config_dir(app)?.join("config.json"))
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> CommandResult<Value> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let content = fs::read_to_string(&path)?;
    let v: Value = serde_json::from_str(&content)?;
    Ok(v)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Value) -> CommandResult<()> {
    let path = config_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    let pretty = serde_json::to_string_pretty(&config)?;
    fs::write(&tmp, pretty)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
