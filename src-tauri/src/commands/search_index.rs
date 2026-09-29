//! In-memory search index behind the file-tree search box.
//!
//! The ⇧⌘F vault search (`search_cmd.rs`) walks the disk on every query. The
//! file-tree filter instead needs *instant* per-keystroke results, so the vault
//! is indexed once when the workspace opens — on a background thread, so a big
//! vault never blocks the webview — and the index is then kept fresh by the
//! file watcher (`watcher.rs`) applying create / modify / remove events to it.
//!
//! The index is deliberately simple: one lowercased copy of every searchable
//! file's relative path and content. A query is a substring scan over those
//! strings, which is comfortably sub-millisecond-per-thousand-notes and needs
//! no tokenizer, so CJK text works exactly like Latin text.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;

/// Caps the IPC payload for a one-letter query in a huge vault; the frontend
/// shows a `+` hint when hit.
pub const MAX_HITS: usize = 2000;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexHit {
    pub path: String,
    pub rel_path: String,
    /// The query occurs in the file's relative path.
    pub name_hit: bool,
    /// The query occurs in the file's text.
    pub content_hit: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexSearchResults {
    /// False while the index for this root is still being built (or belongs
    /// to another root); `files` is then empty and the caller should retry
    /// once `search-index-ready` fires.
    pub ready: bool,
    pub files: Vec<IndexHit>,
    /// True when more than `MAX_HITS` files matched.
    pub truncated: bool,
}

struct IndexedDoc {
    rel_path: String,
    rel_lower: String,
    content_lower: String,
    /// Obsidian `#tags` in the note (inline and frontmatter), original case,
    /// deduplicated case-insensitively.
    tags: Vec<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    /// Display form (the first spelling seen).
    pub tag: String,
    /// Number of notes carrying the tag.
    pub count: usize,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagList {
    pub ready: bool,
    pub tags: Vec<TagCount>,
}

struct SearchIndex {
    root: PathBuf,
    /// Bumped on every rebuild so a slow, superseded build can't swap its
    /// stale result in.
    generation: u64,
    ready: bool,
    docs: HashMap<PathBuf, IndexedDoc>,
    /// Paths the watcher touched while a build was in flight. The build read
    /// those files at an unknown moment, so the watcher's fresher view wins.
    touched: HashSet<PathBuf>,
}

pub struct SearchIndexState {
    inner: Arc<Mutex<Option<SearchIndex>>>,
}

impl Default for SearchIndexState {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchIndexState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    /// The root the index currently belongs to (ready or not).
    pub fn root(&self) -> Option<PathBuf> {
        self.inner.lock().unwrap().as_ref().map(|i| i.root.clone())
    }

    /// Is the index for `root` built and queryable?
    #[cfg(test)]
    pub fn is_ready(&self, root: &Path) -> bool {
        matches!(self.inner.lock().unwrap().as_ref(), Some(i) if i.ready && i.root == root)
    }

    /// Rebuild the index for `root` on a background thread. `on_ready` runs
    /// (on that thread) once the index is queryable; it is skipped when the
    /// build was superseded by a newer one.
    pub fn rebuild(&self, root: PathBuf, on_ready: impl FnOnce() + Send + 'static) {
        let generation = self.begin(root.clone());
        let inner = Arc::clone(&self.inner);
        std::thread::spawn(move || {
            let docs = build_docs(&root);
            if finish(&inner, &root, generation, docs) {
                on_ready();
            }
        });
    }

    /// Synchronous rebuild — for tests.
    #[cfg(test)]
    pub fn rebuild_blocking(&self, root: PathBuf) {
        let generation = self.begin(root.clone());
        let docs = build_docs(&root);
        finish(&self.inner, &root, generation, docs);
    }

    fn begin(&self, root: PathBuf) -> u64 {
        let mut guard = self.inner.lock().unwrap();
        let generation = guard.as_ref().map(|i| i.generation + 1).unwrap_or(1);
        *guard = Some(SearchIndex {
            root,
            generation,
            ready: false,
            docs: HashMap::new(),
            touched: HashSet::new(),
        });
        generation
    }

    /// Fold a filesystem change into the index. `removed` is true for delete
    /// events; anything else is treated as "re-read this path". Paths outside
    /// the indexed root, dotted entries and non-text files are ignored.
    pub fn apply(&self, path: &Path, removed: bool) {
        let mut guard = self.inner.lock().unwrap();
        let Some(index) = guard.as_mut() else { return };
        let Ok(rel) = path.strip_prefix(&index.root) else { return };
        if rel.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.')) {
            return;
        }
        if removed {
            // A removed folder takes every entry under it with it.
            let under: Vec<PathBuf> = index
                .docs
                .keys()
                .filter(|k| *k == path || k.starts_with(path))
                .cloned()
                .collect();
            for k in under {
                index.docs.remove(&k);
                if !index.ready {
                    index.touched.insert(k);
                }
            }
            return;
        }
        if !is_searchable(path) {
            return;
        }
        if !index.ready {
            index.touched.insert(path.to_path_buf());
        }
        match read_doc(&index.root, path) {
            Some(doc) => {
                index.docs.insert(path.to_path_buf(), doc);
            }
            None => {
                index.docs.remove(path);
            }
        }
    }

    /// Query the index for `root`. Returns `ready: false` when the index is
    /// for another root or still building.
    pub fn query(&self, root: &Path, query: &str) -> IndexSearchResults {
        let needle = query.trim().to_lowercase();
        let guard = self.inner.lock().unwrap();
        let index = match guard.as_ref() {
            Some(i) if i.root == root => i,
            _ => return not_ready(),
        };
        if !index.ready {
            return not_ready();
        }
        let mut files = Vec::new();
        if needle.is_empty() {
            return IndexSearchResults {
                ready: true,
                files,
                truncated: false,
            };
        }
        // `#tag` matches notes carrying the tag (or a nested `tag/…`), not
        // the literal text — so `#ai` doesn't match `#air` or `#aim`.
        if let Some(tag) = needle.strip_prefix('#').filter(|t| is_tag_body(t)) {
            let nested = format!("{tag}/");
            for (path, doc) in &index.docs {
                if doc.tags.iter().any(|t| {
                    let t = t.to_lowercase();
                    t == tag || t.starts_with(&nested)
                }) {
                    files.push(IndexHit {
                        path: path.to_string_lossy().into_owned(),
                        rel_path: doc.rel_path.clone(),
                        name_hit: false,
                        content_hit: true,
                    });
                }
            }
            files.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
            let truncated = files.len() > MAX_HITS;
            files.truncate(MAX_HITS);
            return IndexSearchResults {
                ready: true,
                files,
                truncated,
            };
        }
        for (path, doc) in &index.docs {
            let name_hit = doc.rel_lower.contains(&needle);
            let content_hit = doc.content_lower.contains(&needle);
            if name_hit || content_hit {
                files.push(IndexHit {
                    path: path.to_string_lossy().into_owned(),
                    rel_path: doc.rel_path.clone(),
                    name_hit,
                    content_hit,
                });
            }
        }
        files.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        let truncated = files.len() > MAX_HITS;
        files.truncate(MAX_HITS);
        IndexSearchResults {
            ready: true,
            files,
            truncated,
        }
    }
}

impl SearchIndexState {
    /// Every tag in the vault with the number of notes carrying it, most
    /// used first. `ready: false` while the index is building or belongs to
    /// another root.
    pub fn tags(&self, root: &Path) -> TagList {
        let guard = self.inner.lock().unwrap();
        let index = match guard.as_ref() {
            Some(i) if i.root == root && i.ready => i,
            _ => {
                return TagList {
                    ready: false,
                    tags: Vec::new(),
                }
            }
        };
        let mut by_key: HashMap<String, TagCount> = HashMap::new();
        for doc in index.docs.values() {
            for tag in &doc.tags {
                by_key
                    .entry(tag.to_lowercase())
                    .or_insert_with(|| TagCount {
                        tag: tag.clone(),
                        count: 0,
                    })
                    .count += 1;
            }
        }
        let mut tags: Vec<TagCount> = by_key.into_values().collect();
        tags.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| a.tag.to_lowercase().cmp(&b.tag.to_lowercase()))
        });
        TagList { ready: true, tags }
    }
}

/// A tag body (after `#`): letters of any script, digits, `_`, `-`, `/`,
/// with at least one non-digit (`#2024` is not a tag in Obsidian).
pub fn is_tag_body(s: &str) -> bool {
    !s.is_empty()
        && s.chars().all(is_tag_char)
        && s.chars().any(|c| !c.is_ascii_digit())
        && !s.starts_with('/')
        && !s.ends_with('/')
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-' || c == '/'
}

/// Tags in a note: inline `#tag`s outside code, plus the frontmatter `tags:`
/// / `tag:` field (list or inline form). Deduplicated case-insensitively,
/// first spelling wins, in order of appearance.
pub fn extract_tags(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut push = |t: &str| {
        let t = t.trim().trim_start_matches('#').trim_matches(|c| c == '"' || c == '\'');
        if is_tag_body(t) && seen.insert(t.to_lowercase()) {
            out.push(t.to_string());
        }
    };

    let mut lines = content.lines().peekable();
    // Frontmatter.
    if lines.peek().map(|l| l.trim_end() == "---").unwrap_or(false) {
        lines.next();
        let mut in_tags = false;
        for line in lines.by_ref() {
            let t = line.trim_end();
            if t == "---" || t == "..." {
                break;
            }
            if let Some(rest) = t
                .strip_prefix("tags:")
                .or_else(|| t.strip_prefix("tag:"))
            {
                let rest = rest.trim();
                in_tags = rest.is_empty();
                let rest = rest.trim_start_matches('[').trim_end_matches(']');
                for part in rest.split([',', ' ']) {
                    push(part);
                }
                continue;
            }
            if in_tags {
                if let Some(item) = t.trim_start().strip_prefix("- ") {
                    push(item);
                    continue;
                }
                in_tags = false;
            }
        }
    }

    // Body.
    let mut fence: Option<(char, usize)> = None;
    for line in lines {
        let trimmed = line.trim_start();
        let ticks = trimmed.chars().take_while(|c| *c == '`').count();
        let tildes = trimmed.chars().take_while(|c| *c == '~').count();
        let (ch, n) = if ticks >= 3 { ('`', ticks) } else if tildes >= 3 { ('~', tildes) } else { (' ', 0) };
        if n >= 3 && line.len() - trimmed.len() <= 3 {
            match fence {
                None => fence = Some((ch, n)),
                Some((fc, fnum)) if fc == ch && n >= fnum && trimmed.trim_end().len() == n => fence = None,
                _ => {}
            }
            continue;
        }
        if fence.is_some() {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        let mut in_code = false;
        while i < chars.len() {
            let c = chars[i];
            if c == '`' {
                in_code = !in_code;
            } else if c == '#' && !in_code && (i == 0 || chars[i - 1].is_whitespace()) {
                let start = i + 1;
                let mut end = start;
                while end < chars.len() && is_tag_char(chars[end]) {
                    end += 1;
                }
                // Trailing `/` isn't part of a tag.
                let mut body: String = chars[start..end].iter().collect();
                while body.ends_with('/') {
                    body.pop();
                }
                push(&body);
                i = end;
                continue;
            }
            i += 1;
        }
    }
    out
}

/// Tags of the vault at `root`; kicks off a build (and answers `ready:
/// false`) when the index belongs to another root, like `search_index`.
#[tauri::command]
pub fn list_tags(
    root: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SearchIndexState>,
) -> TagList {
    let root_path = PathBuf::from(&root);
    if state.root().as_deref() != Some(root_path.as_path()) {
        rebuild_for(&app, &state, root_path.clone());
    }
    state.tags(&root_path)
}

/// Event emitted (payload: the root path) once a background build finishes.
pub const READY_EVENT: &str = "search-index-ready";

/// Start a background (re)build for `root` and announce it to the webview
/// when done. Called when a workspace opens, so the index is ready before the
/// user reaches for the search box.
pub fn rebuild_for(app: &tauri::AppHandle, state: &SearchIndexState, root: PathBuf) {
    use tauri::Emitter;
    let handle = app.clone();
    let root_str = root.to_string_lossy().into_owned();
    state.rebuild(root, move || {
        let _ = handle.emit(READY_EVENT, root_str);
    });
}

/// File-tree search over the pre-built index. If the index belongs to another
/// root (workspace opened without `open_workspace`, or the app restarted its
/// state), a rebuild is kicked off and `ready: false` is returned so the UI
/// can wait for `search-index-ready` instead of blocking.
#[tauri::command]
pub fn search_index(
    root: String,
    query: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, SearchIndexState>,
) -> IndexSearchResults {
    let root_path = PathBuf::from(&root);
    if state.root().as_deref() != Some(root_path.as_path()) {
        rebuild_for(&app, &state, root_path);
        return not_ready();
    }
    state.query(&root_path, &query)
}

fn not_ready() -> IndexSearchResults {
    IndexSearchResults {
        ready: false,
        files: Vec::new(),
        truncated: false,
    }
}

/// Install a finished build unless it was superseded. Returns whether it was
/// installed. Entries the watcher touched mid-build are kept as-is.
fn finish(
    inner: &Mutex<Option<SearchIndex>>,
    root: &Path,
    generation: u64,
    built: HashMap<PathBuf, IndexedDoc>,
) -> bool {
    let mut guard = inner.lock().unwrap();
    let Some(index) = guard.as_mut() else { return false };
    if index.root != root || index.generation != generation {
        return false;
    }
    for (path, doc) in built {
        if !index.touched.contains(&path) {
            index.docs.insert(path, doc);
        }
    }
    index.touched.clear();
    index.ready = true;
    true
}

fn build_docs(root: &Path) -> HashMap<PathBuf, IndexedDoc> {
    let mut files = Vec::new();
    collect_searchable(root, &mut files);
    files
        .into_iter()
        .filter_map(|p| read_doc(root, &p).map(|d| (p, d)))
        .collect()
}

fn read_doc(root: &Path, path: &Path) -> Option<IndexedDoc> {
    let content = fs::read_to_string(path).ok()?;
    let rel_path = path
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string_lossy().into_owned());
    Some(IndexedDoc {
        rel_lower: rel_path.to_lowercase(),
        rel_path,
        content_lower: content.to_lowercase(),
        tags: extract_tags(&content),
    })
}

/// `.md` / `.markdown` / `.txt` — the same set the vault search scans.
pub fn is_searchable(path: &Path) -> bool {
    path.extension()
        .map(|e| {
            e.eq_ignore_ascii_case("md")
                || e.eq_ignore_ascii_case("markdown")
                || e.eq_ignore_ascii_case("txt")
        })
        .unwrap_or(false)
}

/// Recursively collect searchable files, skipping dotted entries
/// (`.git`, `.obsidian`, …).
pub(crate) fn collect_searchable(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_searchable(&path, out);
        } else if is_searchable(&path) {
            out.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    fn rel_paths(res: &IndexSearchResults) -> Vec<&str> {
        res.files.iter().map(|f| f.rel_path.as_str()).collect()
    }

    #[test]
    fn finds_by_name_and_content_and_skips_noise() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "Projects/roadmap.md", "# Plans\nship the Search feature");
        write(root, "notes/misc.markdown", "nothing here");
        write(root, "todo.txt", "search later");
        write(root, "img.png", "search binary"); // wrong extension
        write(root, ".obsidian/search.md", "search hidden"); // dotted dir

        let state = SearchIndexState::new();
        assert!(!state.is_ready(root));
        state.rebuild_blocking(root.to_path_buf());
        assert!(state.is_ready(root));

        let res = state.query(root, "SEARCH");
        assert!(res.ready);
        assert!(!res.truncated);
        assert_eq!(rel_paths(&res), vec!["Projects/roadmap.md", "todo.txt"]);
        let roadmap = &res.files[0];
        assert!(!roadmap.name_hit);
        assert!(roadmap.content_hit);
        assert_eq!(roadmap.path, root.join("Projects/roadmap.md").to_string_lossy());

        // Name matches include the folder part of the relative path.
        let res = state.query(root, "projects/");
        assert_eq!(rel_paths(&res), vec!["Projects/roadmap.md"]);
        assert!(res.files[0].name_hit);
        assert!(!res.files[0].content_hit);
    }

    #[test]
    fn cjk_queries_match() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "会议记录.md", "今天讨论了索引方案");
        let state = SearchIndexState::new();
        state.rebuild_blocking(root.to_path_buf());
        assert_eq!(rel_paths(&state.query(root, "会议")), vec!["会议记录.md"]);
        assert_eq!(rel_paths(&state.query(root, "索引方案")), vec!["会议记录.md"]);
        assert!(state.query(root, "不存在").files.is_empty());
    }

    #[test]
    fn empty_query_wrong_root_or_unbuilt_index() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "x");
        let state = SearchIndexState::new();

        let res = state.query(root, "x");
        assert!(!res.ready);

        state.rebuild_blocking(root.to_path_buf());
        assert!(state.query(root, "   ").files.is_empty());
        assert!(state.query(root, "   ").ready);
        assert!(!state.query(Path::new("/elsewhere"), "x").ready);
    }

    #[test]
    fn apply_upserts_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "alpha");
        write(root, "sub/b.md", "beta");
        let state = SearchIndexState::new();
        state.rebuild_blocking(root.to_path_buf());

        // Modified: content changes are picked up.
        write(root, "a.md", "gamma");
        state.apply(&root.join("a.md"), false);
        assert!(state.query(root, "alpha").files.is_empty());
        assert_eq!(rel_paths(&state.query(root, "gamma")), vec!["a.md"]);

        // Created: a brand-new file shows up.
        write(root, "sub/c.md", "delta");
        state.apply(&root.join("sub/c.md"), false);
        assert_eq!(rel_paths(&state.query(root, "delta")), vec!["sub/c.md"]);

        // Non-searchable and dotted paths are ignored even when "created".
        write(root, "pic.png", "delta");
        state.apply(&root.join("pic.png"), false);
        write(root, ".git/x.md", "delta");
        state.apply(&root.join(".git/x.md"), false);
        assert_eq!(rel_paths(&state.query(root, "delta")), vec!["sub/c.md"]);

        // Removed file.
        fs::remove_file(root.join("a.md")).unwrap();
        state.apply(&root.join("a.md"), true);
        assert!(state.query(root, "gamma").files.is_empty());

        // Removed folder drops everything under it.
        fs::remove_dir_all(root.join("sub")).unwrap();
        state.apply(&root.join("sub"), true);
        assert!(state.query(root, "beta").files.is_empty());
        assert!(state.query(root, "delta").files.is_empty());

        // A modify event for a file that vanished before we could read it
        // (editor temp-file dance) drops the entry instead of erroring.
        write(root, "gone.md", "epsilon");
        state.apply(&root.join("gone.md"), false);
        fs::remove_file(root.join("gone.md")).unwrap();
        state.apply(&root.join("gone.md"), false);
        assert!(state.query(root, "epsilon").files.is_empty());
    }

    #[test]
    fn watcher_updates_during_a_build_win_over_the_build() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "old");
        let state = SearchIndexState::new();

        // Simulate: build started, walked the disk (read "old"), and before it
        // finishes the watcher reports the file changed to "new".
        let generation = state.begin(root.to_path_buf());
        let built = build_docs(root);
        write(root, "a.md", "new");
        state.apply(&root.join("a.md"), false);
        assert!(finish(&state.inner, root, generation, built));

        assert!(state.is_ready(root));
        assert_eq!(rel_paths(&state.query(root, "new")), vec!["a.md"]);
        assert!(state.query(root, "old").files.is_empty());
    }

    #[test]
    fn superseded_build_is_discarded() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "one");
        let state = SearchIndexState::new();

        let stale_gen = state.begin(root.to_path_buf());
        let stale = build_docs(root);
        // A newer rebuild for the same root starts and completes first.
        state.rebuild_blocking(root.to_path_buf());
        assert!(!finish(&state.inner, root, stale_gen, stale));
        assert!(state.is_ready(root));

        // …and a build for a root we've since left is dropped too.
        let gen = state.begin(root.to_path_buf());
        let built = build_docs(root);
        state.rebuild_blocking(PathBuf::from("/nowhere"));
        assert!(!finish(&state.inner, root, gen, built));
        assert_eq!(state.root(), Some(PathBuf::from("/nowhere")));
    }

    #[test]
    fn background_rebuild_notifies_when_ready() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "hello");
        let state = SearchIndexState::new();
        let (tx, rx) = std::sync::mpsc::channel();
        state.rebuild(root.to_path_buf(), move || tx.send(()).unwrap());
        rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
        assert_eq!(rel_paths(&state.query(root, "hello")), vec!["a.md"]);
    }

    #[test]
    fn caps_hits() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for i in 0..(MAX_HITS + 5) {
            write(root, &format!("n{i:05}.md"), "common");
        }
        let state = SearchIndexState::new();
        state.rebuild_blocking(root.to_path_buf());
        let res = state.query(root, "common");
        assert_eq!(res.files.len(), MAX_HITS);
        assert!(res.truncated);
        assert!(!state.query(root, "n00001").truncated);
    }

    #[test]
    fn extract_tags_inline_frontmatter_and_code() {
        let md = "---\ntitle: x\ntags: [Project, \"idea\"]\naliases:\n  - y\n---\n\
#project #todo/later and #标签, not a#b or #2024 or `#code`\n\
# Heading\n##lenient\n```\n#include <x>\n```\nend #todo/";
        assert_eq!(
            extract_tags(md),
            vec!["Project", "idea", "todo/later", "标签", "todo"]
        );
        let list = "---\ntags:\n  - a\n  - b/c\nother: 1\n---\nbody";
        assert_eq!(extract_tags(list), vec!["a", "b/c"]);
    }

    #[test]
    fn tag_queries_and_tag_list() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("a.md"), "#ai notes #Project/alpha").unwrap();
        fs::write(root.join("b.md"), "#air and #project").unwrap();
        fs::write(root.join("c.md"), "no tags, just text #").unwrap();
        let state = SearchIndexState::new();
        state.rebuild_blocking(root.to_path_buf());

        let hits = |q: &str| -> Vec<String> {
            state.query(root, q).files.into_iter().map(|f| f.rel_path).collect()
        };
        assert_eq!(hits("#ai"), vec!["a.md"]);
        assert_eq!(hits("#project"), vec!["a.md", "b.md"]);
        assert_eq!(hits("#project/alpha"), vec!["a.md"]);
        // Not a tag query → plain substring search.
        assert_eq!(hits("#"), vec!["a.md", "b.md", "c.md"]);

        let tags = state.tags(root);
        assert!(tags.ready);
        let flat: Vec<(String, usize)> = tags.tags.into_iter().map(|t| (t.tag, t.count)).collect();
        assert_eq!(
            flat,
            vec![
                ("ai".to_string(), 1),
                ("air".to_string(), 1),
                ("project".to_string(), 1),
                ("Project/alpha".to_string(), 1)
            ]
        );
        assert!(!state.tags(Path::new("/elsewhere")).ready);
    }
}
