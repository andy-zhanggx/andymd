//! Tauri-managed semantic search state: model lifetime, background index
//! build with progress events, watcher-driven refresh, and the commands.
//!
//! Locking discipline: the build runs on its own thread against a *local*
//! index and only takes the shared `index` lock to swap the result in, so a
//! query never waits on a long build. The embedder lock is taken per
//! `embed` call (one file at a time), so query embedding interleaves with
//! indexing at file granularity.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::embedder::{Embedder, FastEmbedder, MODEL_ID};
use super::index::{Hit, SemanticIndex};

/// Event carrying a `Status` on every phase change.
pub const STATUS_EVENT: &str = "semantic-status";
const DEFAULT_LIMIT: usize = 30;
const MAX_LIMIT: usize = 100;
/// Watcher events are coalesced for this long before re-embedding.
const REFRESH_DEBOUNCE: Duration = Duration::from_secs(1);
/// Progress events are rate-limited to keep the IPC channel quiet.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Off,
    LoadingModel,
    Indexing,
    Ready,
    Error,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub root: Option<String>,
    pub phase: Phase,
    /// Files embedded so far / to embed (indexing only).
    pub done: usize,
    pub total: usize,
    /// Index size once ready.
    pub files: usize,
    pub chunks: usize,
    pub message: Option<String>,
}

impl Status {
    fn off() -> Self {
        Self {
            root: None,
            phase: Phase::Off,
            done: 0,
            total: 0,
            files: 0,
            chunks: 0,
            message: None,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub status: Status,
    pub hits: Vec<Hit>,
}

/// Locks the shared model per call so a long build and a query interleave.
struct SharedEmbedder(Arc<Mutex<Option<FastEmbedder>>>);

impl Embedder for SharedEmbedder {
    fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let mut guard = self.0.lock().unwrap();
        guard
            .as_mut()
            .ok_or_else(|| "model not loaded".to_string())?
            .embed(texts)
    }
}

pub struct SemanticState {
    status: Arc<Mutex<Status>>,
    index: Arc<Mutex<Option<SemanticIndex>>>,
    embedder: Arc<Mutex<Option<FastEmbedder>>>,
    dirty: Arc<Mutex<HashSet<PathBuf>>>,
    refresher_running: Arc<AtomicBool>,
    /// Bumped per `start`; a build whose generation is stale discards itself.
    generation: Arc<AtomicU64>,
}

impl Default for SemanticState {
    fn default() -> Self {
        Self::new()
    }
}

impl SemanticState {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(Status::off())),
            index: Arc::new(Mutex::new(None)),
            embedder: Arc::new(Mutex::new(None)),
            dirty: Arc::new(Mutex::new(HashSet::new())),
            refresher_running: Arc::new(AtomicBool::new(false)),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn status(&self) -> Status {
        self.status.lock().unwrap().clone()
    }

    fn set_status(&self, app: &AppHandle, update: impl FnOnce(&mut Status)) {
        let snapshot = {
            let mut s = self.status.lock().unwrap();
            update(&mut s);
            s.clone()
        };
        let _ = app.emit(STATUS_EVENT, snapshot);
    }

    /// Start (or restart) the background build for `root`.
    pub fn start(&self, app: &AppHandle, root: PathBuf, endpoint: Option<String>) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut idx = self.index.lock().unwrap();
            if idx.as_ref().map(|i| i.root() != root).unwrap_or(false) {
                *idx = None;
            }
        }
        self.dirty.lock().unwrap().clear();
        let root_str = root.to_string_lossy().into_owned();
        self.set_status(app, |s| {
            *s = Status::off();
            s.root = Some(root_str);
            s.phase = Phase::LoadingModel;
        });

        let worker = Worker {
            app: app.clone(),
            status: Arc::clone(&self.status),
            index: Arc::clone(&self.index),
            embedder: Arc::clone(&self.embedder),
            dirty: Arc::clone(&self.dirty),
            refresher_running: Arc::clone(&self.refresher_running),
            generation: Arc::clone(&self.generation),
        };
        std::thread::spawn(move || worker.build(gen, root, endpoint));
    }

    /// Watcher hook: queue `path` for re-embedding once the index is ready.
    pub fn apply(&self, app: &AppHandle, path: &Path) {
        {
            let status = self.status.lock().unwrap();
            let under_root = status
                .root
                .as_deref()
                .map(|r| path.starts_with(r))
                .unwrap_or(false);
            if status.phase != Phase::Ready || !under_root {
                return;
            }
        }
        self.dirty.lock().unwrap().insert(path.to_path_buf());
        if self.refresher_running.swap(true, Ordering::SeqCst) {
            return; // one already scheduled; it drains the set
        }
        let worker = Worker {
            app: app.clone(),
            status: Arc::clone(&self.status),
            index: Arc::clone(&self.index),
            embedder: Arc::clone(&self.embedder),
            dirty: Arc::clone(&self.dirty),
            refresher_running: Arc::clone(&self.refresher_running),
            generation: Arc::clone(&self.generation),
        };
        std::thread::spawn(move || worker.refresh_loop());
    }

    pub fn search(&self, root: &Path, query: &str, limit: usize) -> SearchResponse {
        let status = self.status();
        let same_root = status.root.as_deref() == Some(root.to_string_lossy().as_ref());
        let q = query.trim();
        if status.phase != Phase::Ready || !same_root || q.is_empty() {
            return SearchResponse {
                status,
                hits: Vec::new(),
            };
        }
        let qvec = {
            let mut guard = self.embedder.lock().unwrap();
            match guard.as_mut().map(|e| e.embed_query(q)) {
                Some(Ok(v)) => v,
                Some(Err(msg)) => {
                    return SearchResponse {
                        status: Status {
                            message: Some(msg),
                            ..status
                        },
                        hits: Vec::new(),
                    }
                }
                None => {
                    return SearchResponse {
                        status,
                        hits: Vec::new(),
                    }
                }
            }
        };
        let hits = self
            .index
            .lock()
            .unwrap()
            .as_ref()
            .map(|i| i.search(&qvec, limit.clamp(1, MAX_LIMIT)))
            .unwrap_or_default();
        SearchResponse { status, hits }
    }
}

/// Everything a background thread needs; cloned Arcs of the state.
struct Worker {
    app: AppHandle,
    status: Arc<Mutex<Status>>,
    index: Arc<Mutex<Option<SemanticIndex>>>,
    embedder: Arc<Mutex<Option<FastEmbedder>>>,
    dirty: Arc<Mutex<HashSet<PathBuf>>>,
    refresher_running: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
}

impl Worker {
    fn stale(&self, gen: u64) -> bool {
        self.generation.load(Ordering::SeqCst) != gen
    }

    fn set_status(&self, update: impl FnOnce(&mut Status)) {
        let snapshot = {
            let mut s = self.status.lock().unwrap();
            update(&mut s);
            s.clone()
        };
        let _ = self.app.emit(STATUS_EVENT, snapshot);
    }

    fn fail(&self, msg: String) {
        self.set_status(|s| {
            s.phase = Phase::Error;
            s.message = Some(msg);
        });
    }

    fn build(self, gen: u64, root: PathBuf, endpoint: Option<String>) {
        // 1. Model (downloaded on first use).
        {
            let mut guard = self.embedder.lock().unwrap();
            if guard.is_none() {
                match FastEmbedder::load(models_dir(), endpoint.as_deref()) {
                    Ok(e) => *guard = Some(e),
                    Err(msg) => {
                        drop(guard);
                        if !self.stale(gen) {
                            self.fail(msg);
                        }
                        return;
                    }
                }
            }
        }
        if self.stale(gen) {
            return;
        }

        // 2. Sync a local copy (persisted → disk) with progress.
        let file = index_file(&root);
        let mut idx = SemanticIndex::load(&file, &root, MODEL_ID)
            .unwrap_or_else(|| SemanticIndex::new(root.clone(), MODEL_ID));
        self.set_status(|s| {
            s.phase = Phase::Indexing;
            s.done = 0;
            s.total = 0;
        });
        let mut shared = SharedEmbedder(Arc::clone(&self.embedder));
        let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
        let mut aborted = false;
        let result = idx.sync(&mut shared, &mut |done, total| {
            if self.stale(gen) {
                aborted = true;
                return false;
            }
            if done == total || last_emit.elapsed() >= PROGRESS_INTERVAL {
                last_emit = Instant::now();
                self.set_status(|s| {
                    s.done = done;
                    s.total = total;
                });
            }
            true
        });
        if aborted || self.stale(gen) {
            return;
        }
        if let Err(msg) = result {
            self.fail(msg);
            return;
        }
        if let Err(msg) = idx.save(&file) {
            // Not fatal: the index works for this session, just won't persist.
            eprintln!("semantic index save failed: {msg}");
        }

        // 3. Publish.
        let (files, chunks) = (idx.file_count(), idx.chunk_count());
        *self.index.lock().unwrap() = Some(idx);
        self.set_status(|s| {
            s.phase = Phase::Ready;
            s.files = files;
            s.chunks = chunks;
            s.message = None;
        });
        // Changes that arrived mid-build were dropped by `apply` (phase was
        // not Ready); a follow-up sync would catch them, so run one cheaply:
        // unchanged mtimes cost nothing.
        self.refresher_running.store(true, Ordering::SeqCst);
        self.refresh_loop();
    }

    /// Drain the dirty set (debounced) until it stays empty.
    fn refresh_loop(self) {
        loop {
            std::thread::sleep(REFRESH_DEBOUNCE);
            let paths: Vec<PathBuf> = {
                let mut d = self.dirty.lock().unwrap();
                d.drain().collect()
            };
            if paths.is_empty() {
                // Re-check after releasing the flag so an insert racing with
                // the drain is not lost.
                self.refresher_running.store(false, Ordering::SeqCst);
                if self.dirty.lock().unwrap().is_empty()
                    || self.refresher_running.swap(true, Ordering::SeqCst)
                {
                    return;
                }
                continue;
            }
            let mut shared = SharedEmbedder(Arc::clone(&self.embedder));
            let mut guard = self.index.lock().unwrap();
            let Some(idx) = guard.as_mut() else {
                self.refresher_running.store(false, Ordering::SeqCst);
                return;
            };
            let outcome = idx.refresh(&paths, &mut shared);
            let (files, chunks) = (idx.file_count(), idx.chunk_count());
            let save = idx.save(&index_file(idx.root()));
            drop(guard);
            match outcome.and(save) {
                Ok(()) => self.set_status(|s| {
                    if s.phase == Phase::Ready {
                        s.files = files;
                        s.chunks = chunks;
                    }
                }),
                Err(msg) => eprintln!("semantic refresh failed: {msg}"),
            }
        }
    }
}

fn data_dir() -> PathBuf {
    crate::commands::config_cmd::config_dir().unwrap_or_else(|_| std::env::temp_dir().join("andymd"))
}

fn models_dir() -> PathBuf {
    data_dir().join("models")
}

/// One index file per workspace, keyed by a hash of the root path.
fn index_file(root: &Path) -> PathBuf {
    let s = root.to_string_lossy();
    // FNV-1a: stable, dependency-free.
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    data_dir().join("semantic").join(format!("{h:016x}.idx"))
}

#[tauri::command]
pub fn semantic_start(
    root: String,
    endpoint: Option<String>,
    app: AppHandle,
    state: State<'_, SemanticState>,
) {
    state.start(&app, PathBuf::from(root), endpoint);
}

#[tauri::command]
pub fn semantic_status(state: State<'_, SemanticState>) -> Status {
    state.status()
}

#[tauri::command]
pub fn semantic_search(
    root: String,
    query: String,
    limit: Option<usize>,
    state: State<'_, SemanticState>,
) -> SearchResponse {
    state.search(Path::new(&root), &query, limit.unwrap_or(DEFAULT_LIMIT))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_file_is_stable_and_distinct_per_root() {
        let a = index_file(Path::new("/vault/a"));
        let b = index_file(Path::new("/vault/b"));
        assert_eq!(a, index_file(Path::new("/vault/a")));
        assert_ne!(a, b);
        assert!(a.to_string_lossy().ends_with(".idx"));
        assert!(a.parent().unwrap().ends_with("semantic"));
    }

    #[test]
    fn search_before_ready_returns_status_only() {
        let state = SemanticState::new();
        let res = state.search(Path::new("/v"), "hello", 10);
        assert_eq!(res.status.phase, Phase::Off);
        assert!(res.hits.is_empty());
    }

    #[test]
    fn status_serializes_with_kebab_phase() {
        let s = Status::off();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["phase"], "off");
        assert_eq!(json["root"], serde_json::Value::Null);
    }
}
