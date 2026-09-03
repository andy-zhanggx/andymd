//! Per-workspace vector index: chunks + unit vectors, persisted with bincode.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use super::chunk::chunk_markdown;
use super::embedder::Embedder;
use crate::commands::search_index::{collect_searchable, is_searchable};

/// Bump when the on-disk layout changes.
const FORMAT_VERSION: u32 = 1;
/// A single note never contributes more than this many hits.
const MAX_HITS_PER_FILE: usize = 3;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StoredChunk {
    pub heading: String,
    pub line: usize,
    pub snippet: String,
    pub vec: Vec<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub mtime_ms: u64,
    pub chunks: Vec<StoredChunk>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SemanticIndex {
    version: u32,
    model_id: String,
    root: PathBuf,
    files: HashMap<PathBuf, FileEntry>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub path: String,
    pub rel_path: String,
    pub heading: String,
    pub line: usize,
    pub snippet: String,
    /// Cosine similarity in [-1, 1] (vectors are unit length).
    pub score: f32,
}

impl SemanticIndex {
    pub fn new(root: PathBuf, model_id: &str) -> Self {
        Self {
            version: FORMAT_VERSION,
            model_id: model_id.to_string(),
            root,
            files: HashMap::new(),
        }
    }

    /// Load a persisted index, or `None` when missing, unreadable, or built
    /// for another root / model / format.
    pub fn load(file: &Path, root: &Path, model_id: &str) -> Option<Self> {
        let bytes = fs::read(file).ok()?;
        let idx: SemanticIndex = bincode::deserialize(&bytes).ok()?;
        (idx.version == FORMAT_VERSION && idx.model_id == model_id && idx.root == root).then_some(idx)
    }

    pub fn save(&self, file: &Path) -> Result<(), String> {
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let bytes = bincode::serialize(self).map_err(|e| e.to_string())?;
        let tmp = file.with_extension("idx.tmp");
        fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
        fs::rename(&tmp, file).map_err(|e| e.to_string())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn file_count(&self) -> usize {
        self.files.len()
    }

    pub fn chunk_count(&self) -> usize {
        self.files.values().map(|f| f.chunks.len()).sum()
    }

    /// Bring the index in line with the disk: drop vanished files, keep
    /// files whose mtime is unchanged, re-embed the rest. `progress(done,
    /// total)` counts files that needed embedding; returning `false` from it
    /// aborts the sync (the index is then partially updated but consistent).
    pub fn sync(
        &mut self,
        embedder: &mut dyn Embedder,
        progress: &mut dyn FnMut(usize, usize) -> bool,
    ) -> Result<(), String> {
        let mut on_disk = Vec::new();
        collect_searchable(&self.root, &mut on_disk);
        on_disk.sort();
        let present: HashSet<&PathBuf> = on_disk.iter().collect();
        self.files.retain(|p, _| present.contains(p));

        let todo: Vec<PathBuf> = on_disk
            .iter()
            .filter(|p| match (self.files.get(*p), mtime_ms(p)) {
                (Some(entry), Some(m)) => entry.mtime_ms != m,
                _ => true,
            })
            .cloned()
            .collect();
        let total = todo.len();
        if !progress(0, total) {
            return Ok(());
        }
        for (i, path) in todo.iter().enumerate() {
            self.embed_path(path, embedder)?;
            if !progress(i + 1, total) {
                return Ok(());
            }
        }
        Ok(())
    }

    /// Re-embed (or drop, when gone / not searchable) specific paths.
    pub fn refresh(&mut self, paths: &[PathBuf], embedder: &mut dyn Embedder) -> Result<(), String> {
        for path in paths {
            // A removed folder takes its files with it.
            if path.is_dir() || !path.exists() {
                self.files.retain(|p, _| p != path && !p.starts_with(path));
                if path.is_dir() {
                    let mut under = Vec::new();
                    collect_searchable(path, &mut under);
                    for p in under {
                        self.embed_path(&p, embedder)?;
                    }
                }
                continue;
            }
            if !is_searchable(path) || !path.starts_with(&self.root) {
                continue;
            }
            self.embed_path(path, embedder)?;
        }
        Ok(())
    }

    fn embed_path(&mut self, path: &Path, embedder: &mut dyn Embedder) -> Result<(), String> {
        if path
            .strip_prefix(&self.root)
            .map(|rel| rel.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.')))
            .unwrap_or(true)
        {
            return Ok(());
        }
        let (Ok(content), Some(mtime)) = (fs::read_to_string(path), mtime_ms(path)) else {
            self.files.remove(path);
            return Ok(());
        };
        let chunks = chunk_markdown(&content);
        let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
        let vecs = if texts.is_empty() { Vec::new() } else { embedder.embed(&texts)? };
        let stored = chunks
            .into_iter()
            .zip(vecs)
            .map(|(c, vec)| StoredChunk {
                heading: c.heading,
                line: c.line,
                snippet: c.snippet,
                vec,
            })
            .collect();
        self.files.insert(
            path.to_path_buf(),
            FileEntry {
                mtime_ms: mtime,
                chunks: stored,
            },
        );
        Ok(())
    }

    /// Top-`limit` chunks by cosine similarity, at most `MAX_HITS_PER_FILE`
    /// per note, best first.
    pub fn search(&self, query: &[f32], limit: usize) -> Vec<Hit> {
        let mut scored: Vec<(f32, &PathBuf, &StoredChunk)> = Vec::new();
        for (path, entry) in &self.files {
            for chunk in &entry.chunks {
                if chunk.vec.len() != query.len() {
                    continue;
                }
                let score: f32 = chunk.vec.iter().zip(query).map(|(a, b)| a * b).sum();
                scored.push((score, path, chunk));
            }
        }
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let mut per_file: HashMap<&PathBuf, usize> = HashMap::new();
        let mut out = Vec::new();
        for (score, path, chunk) in scored {
            let n = per_file.entry(path).or_insert(0);
            if *n >= MAX_HITS_PER_FILE {
                continue;
            }
            *n += 1;
            out.push(Hit {
                path: path.to_string_lossy().into_owned(),
                rel_path: path
                    .strip_prefix(&self.root)
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| path.to_string_lossy().into_owned()),
                heading: chunk.heading.clone(),
                line: chunk.line,
                snippet: chunk.snippet.clone(),
                score,
            });
            if out.len() >= limit {
                break;
            }
        }
        out
    }
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let m = fs::metadata(path).ok()?.modified().ok()?;
    Some(m.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::semantic::embedder::FakeEmbedder;
    use std::time::Duration;

    fn write(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    const NOTE_A: &str = "# Recall regression\n\nRecall dropped after the release because the feature pipeline lost a column.\n";
    const NOTE_B: &str = "# 周末菜谱\n\n西红柿炒鸡蛋，先炒鸡蛋再放西红柿，最后加一点糖。\n";

    #[test]
    fn sync_builds_skips_unchanged_reembeds_modified_and_drops_removed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", NOTE_A);
        write(root, "food/b.md", NOTE_B);
        write(root, ".obsidian/x.md", NOTE_A);
        let mut e = FakeEmbedder::new();
        let mut idx = SemanticIndex::new(root.to_path_buf(), "fake");

        let mut ticks = Vec::new();
        idx.sync(&mut e, &mut |d, t| {
            ticks.push((d, t));
            true
        }).unwrap();
        assert_eq!(idx.file_count(), 2);
        assert_eq!(idx.chunk_count(), 2);
        assert_eq!(ticks, vec![(0, 2), (1, 2), (2, 2)]);
        assert_eq!(e.calls, 2);

        // Nothing changed → no embedding calls.
        idx.sync(&mut e, &mut |_, _| true).unwrap();
        assert_eq!(e.calls, 2);

        // Modified (bump mtime explicitly — same-second writes can collide).
        std::thread::sleep(Duration::from_millis(5));
        write(root, "a.md", "# Recall regression\n\nCompletely different body about coffee beans and grinders.\n");
        let f = fs::File::open(root.join("a.md")).unwrap();
        f.set_modified(std::time::SystemTime::now() + Duration::from_secs(2)).unwrap();
        idx.sync(&mut e, &mut |_, _| true).unwrap();
        assert_eq!(e.calls, 3);

        // Removed.
        fs::remove_file(root.join("a.md")).unwrap();
        idx.sync(&mut e, &mut |_, _| true).unwrap();
        assert_eq!(idx.file_count(), 1);
    }

    #[test]
    fn search_ranks_the_related_note_first_and_caps_per_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", NOTE_A);
        write(root, "food/b.md", NOTE_B);
        let mut e = FakeEmbedder::new();
        let mut idx = SemanticIndex::new(root.to_path_buf(), "fake");
        idx.sync(&mut e, &mut |_, _| true).unwrap();

        let q = e.embed_query("西红柿 鸡蛋 菜谱").unwrap();
        let hits = idx.search(&q, 10);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].rel_path, "food/b.md");
        assert_eq!(hits[0].heading, "周末菜谱");
        assert_eq!(hits[0].line, 3);
        assert!(hits[0].snippet.starts_with("西红柿炒鸡蛋"));
        assert!(hits[0].score > hits[1].score);
        assert_eq!(hits[0].path, root.join("food/b.md").to_string_lossy());

        // Many chunks in one file: at most MAX_HITS_PER_FILE from it.
        let many = (0..6).map(|i| format!("## Section {i}\n\nrecall recall recall recall {i}\n")).collect::<String>();
        write(root, "many.md", &many);
        idx.sync(&mut e, &mut |_, _| true).unwrap();
        let q = e.embed_query("recall").unwrap();
        let hits = idx.search(&q, 10);
        assert_eq!(hits.iter().filter(|h| h.rel_path == "many.md").count(), MAX_HITS_PER_FILE);
        assert_eq!(idx.search(&q, 2).len(), 2);
    }

    #[test]
    fn refresh_updates_removes_and_ignores_noise() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", NOTE_A);
        let mut e = FakeEmbedder::new();
        let mut idx = SemanticIndex::new(root.to_path_buf(), "fake");
        idx.sync(&mut e, &mut |_, _| true).unwrap();

        write(root, "sub/c.md", NOTE_B);
        idx.refresh(&[root.join("sub/c.md")], &mut e).unwrap();
        assert_eq!(idx.file_count(), 2);

        write(root, "pic.png", "x");
        write(root, ".git/h.md", NOTE_A);
        idx.refresh(&[root.join("pic.png"), root.join(".git/h.md"), root.join("missing.md")], &mut e)
            .unwrap();
        assert_eq!(idx.file_count(), 2);

        fs::remove_dir_all(root.join("sub")).unwrap();
        idx.refresh(&[root.join("sub")], &mut e).unwrap();
        assert_eq!(idx.file_count(), 1);

        // A folder that (re)appears is walked.
        write(root, "sub/d.md", NOTE_B);
        idx.refresh(&[root.join("sub")], &mut e).unwrap();
        assert_eq!(idx.file_count(), 2);
    }

    #[test]
    fn save_and_load_roundtrip_with_validation() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", NOTE_A);
        let mut e = FakeEmbedder::new();
        let mut idx = SemanticIndex::new(root.to_path_buf(), "fake");
        idx.sync(&mut e, &mut |_, _| true).unwrap();

        let file = dir.path().join("cache/ws.idx");
        idx.save(&file).unwrap();
        let loaded = SemanticIndex::load(&file, root, "fake").unwrap();
        assert_eq!(loaded.chunk_count(), 1);
        let q = e.embed_query("recall release").unwrap();
        assert_eq!(loaded.search(&q, 5)[0].rel_path, "a.md");

        assert!(SemanticIndex::load(&file, root, "other-model").is_none());
        assert!(SemanticIndex::load(&file, Path::new("/elsewhere"), "fake").is_none());
        assert!(SemanticIndex::load(&dir.path().join("nope.idx"), root, "fake").is_none());
    }
}
