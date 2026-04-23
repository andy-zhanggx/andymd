use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::error::{CommandError, CommandResult};

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FsEvent {
    Created { path: String },
    Modified { path: String },
    Removed { path: String },
    Renamed { from: String, to: String },
}

pub struct WatcherState {
    inner: Mutex<Option<(RecommendedWatcher, PathBuf)>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub fn start(&self, app: AppHandle, root: PathBuf) -> CommandResult<()> {
        let mut guard = self.inner.lock().unwrap();
        *guard = None; // drop previous watcher

        let handle = app.clone();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(ev) => {
                    if let Some(fs_ev) = map_event(&ev) {
                        let _ = handle.emit("workspace-changed", fs_ev);
                    }
                }
                Err(e) => {
                    let _ = handle.emit(
                        "workspace-watch-error",
                        format!("{}", e),
                    );
                }
            }
        })
        .map_err(|e| CommandError::Notify(e.to_string()))?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| CommandError::Notify(e.to_string()))?;
        *guard = Some((watcher, root));
        Ok(())
    }
}

fn map_event(ev: &Event) -> Option<FsEvent> {
    let path = ev.paths.first()?;
    if path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.ends_with(".tmp"))
        .unwrap_or(false)
    {
        return None;
    }
    let p = path.to_string_lossy().into_owned();
    match ev.kind {
        EventKind::Create(_) => Some(FsEvent::Created { path: p }),
        EventKind::Modify(_) => Some(FsEvent::Modified { path: p }),
        EventKind::Remove(_) => Some(FsEvent::Removed { path: p }),
        _ => None,
    }
}
