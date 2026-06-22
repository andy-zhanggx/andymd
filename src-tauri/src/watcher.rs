//! Filesystem watcher.
//!
//! On desktop we use `notify` to emit `workspace-changed` events when files in
//! the open vault change underneath us. iOS has no equivalent always-on FS
//! watcher (and the `notify` crate doesn't build for it), so the mobile build
//! ships a no-op `WatcherState` with the same API — the app simply relies on its
//! own writes plus pull-to-refresh instead of live external-change events.

#[cfg(desktop)]
mod imp {
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
            Self {
                inner: Mutex::new(None),
            }
        }

        pub fn start(&self, app: AppHandle, root: PathBuf) -> CommandResult<()> {
            let mut guard = self.inner.lock().unwrap();
            *guard = None; // drop previous watcher

            let handle = app.clone();
            let mut watcher =
                notify::recommended_watcher(move |res: Result<Event, notify::Error>| match res {
                    Ok(ev) => {
                        if let Some(fs_ev) = map_event(&ev) {
                            let _ = handle.emit("workspace-changed", fs_ev);
                        }
                    }
                    Err(e) => {
                        let _ = handle.emit("workspace-watch-error", format!("{}", e));
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
        if path
            .file_name()
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
}

#[cfg(mobile)]
mod imp {
    use std::path::PathBuf;
    use tauri::AppHandle;

    use crate::error::CommandResult;

    /// No-op watcher for mobile: there is no `notify` backend, so we keep the
    /// same shape as the desktop watcher but never emit change events.
    pub struct WatcherState;

    impl WatcherState {
        pub fn new() -> Self {
            Self
        }

        pub fn start(&self, _app: AppHandle, _root: PathBuf) -> CommandResult<()> {
            Ok(())
        }
    }
}

pub use imp::WatcherState;
