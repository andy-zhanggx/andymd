use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_VERSIONS: usize = 50;

#[derive(Serialize)]
pub struct Version {
    pub ts: u64, // unix millis
    pub file: String,
}

fn versions_dir(app: &AppHandle, source: &str) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    Ok(base.join("versions").join(format!("{:016x}", hasher.finish())))
}

fn read_entries(dir: &PathBuf) -> Vec<Version> {
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(stem) = name.strip_suffix(".md") {
                if let Ok(ts) = stem.parse::<u64>() {
                    out.push(Version { ts, file: name });
                }
            }
        }
    }
    out.sort_by(|a, b| b.ts.cmp(&a.ts));
    out
}

/// Snapshot `content` for `path` into the app's version store (deduped against
/// the latest snapshot, pruned to the most recent MAX_VERSIONS).
#[tauri::command]
pub fn save_version(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let dir = versions_dir(&app, &path)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let entries = read_entries(&dir);
    if let Some(latest) = entries.first() {
        if let Ok(prev) = fs::read_to_string(dir.join(&latest.file)) {
            if prev == content {
                return Ok(()); // unchanged since last snapshot
            }
        }
    }

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    fs::write(dir.join(format!("{ts}.md")), &content).map_err(|e| e.to_string())?;

    for old in read_entries(&dir).into_iter().skip(MAX_VERSIONS) {
        let _ = fs::remove_file(dir.join(old.file));
    }
    Ok(())
}

#[tauri::command]
pub fn list_versions(app: AppHandle, path: String) -> Result<Vec<Version>, String> {
    Ok(read_entries(&versions_dir(&app, &path)?))
}

#[tauri::command]
pub fn read_version(app: AppHandle, path: String, file: String) -> Result<String, String> {
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("invalid version file".to_string());
    }
    let dir = versions_dir(&app, &path)?;
    fs::read_to_string(dir.join(file)).map_err(|e| e.to_string())
}
