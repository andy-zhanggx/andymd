use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use crate::error::{CommandError, CommandResult};

fn config_dir() -> CommandResult<PathBuf> {
    let base = dirs::data_dir()
        .ok_or_else(|| CommandError::Other("no Application Support dir".into()))?;
    let d = base.join("com.andyz.typora");
    fs::create_dir_all(&d)?;
    Ok(d)
}

fn config_path() -> CommandResult<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

#[tauri::command]
pub fn get_config() -> CommandResult<Value> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let content = fs::read_to_string(&path)?;
    let v: Value = serde_json::from_str(&content)?;
    Ok(v)
}

#[tauri::command]
pub fn save_config(config: Value) -> CommandResult<()> {
    let path = config_path()?;
    let tmp = path.with_extension("json.tmp");
    let pretty = serde_json::to_string_pretty(&config)?;
    fs::write(&tmp, pretty)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
