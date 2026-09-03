# Semantic search (local embeddings)

## Goal

Let the file-tree search box find notes **by meaning**, not only by substring:
"为什么召回率下降" should surface a note titled "Recall regression post-mortem".
Everything runs on the user's Mac — the vault never leaves the machine — using
a small local embedding model, and the index is built ahead of time and kept
fresh by the file watcher, like the substring index it sits beside.

## Decisions

- **Model:** `bge-small-zh-v1.5` (fastembed `EmbeddingModel::BGESmallZHV15`,
  512-dim, ~95 MB ONNX). The target vault is Chinese-heavy with English mixed
  in; this model is strong on Chinese, adequate on English, and 5× smaller
  than `multilingual-e5-small` (470 MB). The model id is written into the
  on-disk index so switching models later simply invalidates it.
- **Runtime:** `fastembed` 6 (ONNX Runtime via `ort`, statically linked on
  macOS through `ort`'s `download-binaries`; the release workflow needs no
  changes). The model itself is fetched from Hugging Face on first use into
  `<Application Support>/com.andyz.andymd/models/`. `HF_ENDPOINT` is honoured
  by `hf-hub`, so a mirror (e.g. `https://hf-mirror.com`) can be set for
  restricted networks; the app exposes it as `semanticModelEndpoint` in
  config and sets the env var before loading.
- **Opt-in.** Default off (`semanticSearch: false`). A 95 MB download must
  not happen silently: the first click on the semantic toggle shows an
  inline consent panel; enabling persists the config and starts indexing.
- **Vectors in memory, brute force.** 10k chunks × 512 floats = 20 MB and a
  dot-product scan over them is sub-millisecond, so no ANN library.
- **Persisted between launches** (bincode file per workspace) so a restart
  re-embeds only files whose mtime changed.

## Architecture

### Rust: `src-tauri/src/semantic/`

- `chunk.rs` — pure `chunk_markdown(content) -> Vec<Chunk>`: strip YAML
  frontmatter; split at ATX headings; a section longer than `MAX_CHUNK_CHARS`
  (800) is split further at blank lines; each chunk records `heading` (the
  nearest heading text, may be empty), 1-based `line`, and `text`
  (`heading + "\n" + body`, which is what gets embedded). Chunks shorter than
  `MIN_CHUNK_CHARS` (20) are dropped. Unit-tested.
- `embedder.rs` — `trait Embedder { fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>> }`
  with `FastEmbedder` (wraps `TextEmbedding`, normalises to unit length,
  batch 32, lazy model load on first use) and a test `FakeEmbedder`
  (hashes characters into a fixed vector) so index logic is testable offline.
  Query embedding prepends BGE's retrieval instruction
  (`为这个句子生成表示以用于检索相关文章：`), passages are embedded raw.
- `index.rs` — `SemanticIndex { model_id, root, files: HashMap<PathBuf, FileEntry{mtime, chunks: Vec<StoredChunk>}> }`
  where `StoredChunk { heading, line, snippet (first 160 chars of body), vec }`.
  - `load(path)` / `save(path)` via `bincode`; a file whose `model_id` or
    format version differs is ignored.
  - `sync(root, embedder, progress)` walks the vault (same traversal as the
    substring index), drops entries for vanished files, keeps entries whose
    mtime is unchanged, re-chunks and re-embeds the rest, calling `progress(done, total)`.
  - `refresh(paths, embedder)` re-embeds or removes specific paths (watcher).
  - `search(query_vec, limit) -> Vec<Hit{path, rel_path, heading, line, snippet, score}>`
    — dot product over all chunks, top-`limit`, at most 3 chunks per file.
  Unit-tested with `FakeEmbedder` and a tempdir: sync builds, unchanged mtime
  skips, modified file re-embeds, removal drops, save/load roundtrip, search
  ranks the matching chunk first.
- `state.rs` — `SemanticState` (Tauri-managed):
  - `status: Mutex<Status>` where `Status { root, phase: Off|LoadingModel|Indexing{done,total}|Ready|Error(msg) }`.
  - `index: Mutex<Option<SemanticIndex>>`, `embedder: Mutex<Option<FastEmbedder>>`.
  - `dirty: Mutex<HashSet<PathBuf>>` + a debounced refresher thread (1 s)
    fed by the watcher.
  - `start(app, root, endpoint)` spawns the build thread: set
    `LoadingModel`, load the embedder (download if needed), load the persisted
    index, `sync` with progress events, save, set `Ready`. Every phase change
    is emitted as `semantic-status` with the `Status` payload; the frontend
    keeps it in a store. A build superseded by a newer root is discarded.
- Commands: `semantic_start(root, endpoint)`, `semantic_status(root)`,
  `semantic_search(root, query, limit) -> { status, hits }`.
- Watcher hook: `SemanticState::apply(path, removed)` marks the path dirty
  (only when the index for that root is `Ready`).
- Index file: `<data_dir>/com.andyz.andymd/semantic/<fnv-hash-of-root>.idx`.

### Frontend

- `AppConfig`: `semanticSearch: boolean` (false), `semanticModelEndpoint: string` ("").
- `semanticStore.ts` (zustand): `status` (mirrors the Rust `Status`),
  `results`, `start(root)`, `search(root, query)`; subscribes to
  `semantic-status` once. `workspaceStore.open` calls `start` when
  `config.semanticSearch` is on, so the index is built ahead of time.
- `TreeSearch`: a mode toggle (`≈`, title "Semantic search") inside the field.
  In semantic mode the placeholder becomes "Search by meaning…", the query is
  debounced 300 ms into `semanticStore.search`, and the hint shows the phase
  ("Downloading model…", "Indexing 120/900", "Ready", or the hit count).
  `onFilter` is not used in this mode; instead `onMode('semantic')` tells the
  sidebar to render results.
- `SemanticResults.tsx` (new): flat ranked list — rel path, heading, snippet,
  score bar — grouped per file in score order; click opens the file and
  scrolls to the chunk's heading (polling for the rebuilt editor like
  `revealInEditor`); `↑↓` + `↵` keyboard navigation inside the list.
- `SemanticConsent.tsx` (new): inline panel shown in the tree area when the
  toggle is switched on while `semanticSearch` is off — what it does, the
  download size, "runs entirely on this Mac", an optional mirror field
  (pre-filled from `semanticModelEndpoint`), **Enable** / **Not now**.
- `Sidebar`: chooses between `FileTree`, the substring empty state,
  `SemanticConsent` and `SemanticResults` from `mode` + config + store phase.
- Errors (download failure, model load failure) show inline in the results
  area with the message and a "Retry" button that calls `start` again.

### Testing

- Rust: `chunk.rs`, `index.rs` with `FakeEmbedder` (offline, tempdir); the
  real model is exercised only by hand.
- Vitest: `semanticStore` reducer behaviour with stubbed service, static
  render of `SemanticResults` and `SemanticConsent`, `TreeSearch` toggle
  markup.
- Manual: debug `.app` against andykb — enable, watch the download +
  indexing progress, query in Chinese and English, edit a note in Obsidian
  and confirm the refreshed result.

## Build sequence

1. Cargo deps (`fastembed`, `bincode`) + `chunk.rs` with tests.
2. `embedder.rs` (trait, fake, fastembed impl) + `index.rs` with tests.
3. `state.rs`, commands, watcher hook, `lib.rs` wiring; `cargo test`.
4. Config fields, `semanticStore`, service bindings.
5. `TreeSearch` toggle, `SemanticConsent`, `SemanticResults`, `Sidebar`, CSS.
6. README / CHANGELOG; debug build; manual verification.
