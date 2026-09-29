//! Local semantic search: notes are chunked, embedded with a small on-device
//! model and searched by cosine similarity. See
//! `docs/features-semantic-search/spec.md`.

pub mod chunk;
pub mod embedder;
pub mod index;
pub mod state;
