//! Text → unit vector, behind a trait so the index logic is testable offline.

use std::path::PathBuf;

/// Identifies the model an index was built with; a mismatch invalidates the
/// persisted index.
pub const MODEL_ID: &str = "bge-small-zh-v1.5";
/// BGE retrieval models are trained with this instruction on the query side.
pub const QUERY_INSTRUCTION: &str = "为这个句子生成表示以用于检索相关文章：";
/// Approximate download size, surfaced in the consent UI.
pub const MODEL_DOWNLOAD_MB: u32 = 95;

const BATCH: usize = 32;

pub trait Embedder: Send {
    /// Embed passages; every returned vector has unit length.
    fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String>;

    /// Embed a search query (applies the model's query instruction).
    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
        let mut v = self.embed(&[format!("{QUERY_INSTRUCTION}{query}")])?;
        v.pop().ok_or_else(|| "empty embedding".to_string())
    }
}

pub fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

/// ONNX-backed embedder (fastembed). Loading downloads the model on first use.
pub struct FastEmbedder {
    model: fastembed::TextEmbedding,
}

impl FastEmbedder {
    /// `endpoint` overrides the Hugging Face host (mirror) for the download.
    pub fn load(cache_dir: PathBuf, endpoint: Option<&str>) -> Result<Self, String> {
        use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};
        if let Some(ep) = endpoint.map(str::trim).filter(|s| !s.is_empty()) {
            // hf-hub reads this at client construction; process-global but
            // the app only ever talks to one hub.
            std::env::set_var("HF_ENDPOINT", ep);
        }
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let model = TextEmbedding::try_new(
            TextInitOptions::new(EmbeddingModel::BGESmallZHV15)
                .with_cache_dir(cache_dir)
                .with_show_download_progress(false),
        )
        .map_err(|e| format!("model load failed: {e}"))?;
        Ok(Self { model })
    }
}

impl Embedder for FastEmbedder {
    fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let mut out = Vec::with_capacity(texts.len());
        for batch in texts.chunks(BATCH) {
            let refs: Vec<&str> = batch.iter().map(String::as_str).collect();
            let vecs = self
                .model
                .embed(refs, Some(BATCH))
                .map_err(|e| format!("embedding failed: {e}"))?;
            for mut v in vecs {
                normalize(&mut v);
                out.push(v);
            }
        }
        Ok(out)
    }
}

/// Deterministic bag-of-characters embedder for tests: texts sharing
/// characters land close together, so ranking is predictable offline.
#[cfg(test)]
pub struct FakeEmbedder {
    pub calls: usize,
}

#[cfg(test)]
impl FakeEmbedder {
    pub const DIM: usize = 64;
    pub fn new() -> Self {
        Self { calls: 0 }
    }
}

#[cfg(test)]
impl Embedder for FakeEmbedder {
    fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        self.calls += 1;
        Ok(texts
            .iter()
            .map(|t| {
                let mut v = vec![0f32; Self::DIM];
                for c in t.chars().filter(|c| !c.is_whitespace()) {
                    v[(c as usize) % Self::DIM] += 1.0;
                }
                normalize(&mut v);
                v
            })
            .collect())
    }

    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
        // No instruction prefix for the fake — keep queries comparable.
        self.embed(&[query.to_string()]).map(|mut v| v.pop().unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_yields_unit_length() {
        let mut v = vec![3.0, 4.0];
        normalize(&mut v);
        assert!((v[0] - 0.6).abs() < 1e-6 && (v[1] - 0.8).abs() < 1e-6);
        let mut z = vec![0.0, 0.0];
        normalize(&mut z);
        assert_eq!(z, vec![0.0, 0.0]);
    }

    #[test]
    fn fake_embedder_ranks_similar_text_closer() {
        let mut e = FakeEmbedder::new();
        let v = e.embed(&["召回率下降".into(), "召回率上升".into(), "apple pie".into()]).unwrap();
        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        assert!(dot(&v[0], &v[1]) > dot(&v[0], &v[2]));
    }
}
