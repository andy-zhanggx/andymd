/**
 * Semantic search — types mirroring the Rust `semantic` module plus pure
 * helpers for the sidebar UI.
 */

export type SemanticPhase = 'off' | 'loading-model' | 'indexing' | 'ready' | 'error';

export interface SemanticStatus {
  root: string | null;
  phase: SemanticPhase;
  /** Files embedded so far / to embed (indexing). */
  done: number;
  total: number;
  /** Index size once ready. */
  files: number;
  chunks: number;
  message: string | null;
}

export interface SemanticHit {
  path: string;
  relPath: string;
  heading: string;
  line: number;
  snippet: string;
  /** Cosine similarity, roughly 0.3 (unrelated) … 0.9 (near-duplicate). */
  score: number;
}

export interface SemanticSearchResponse {
  status: SemanticStatus;
  hits: SemanticHit[];
}

export const OFF_STATUS: SemanticStatus = {
  root: null,
  phase: 'off',
  done: 0,
  total: 0,
  files: 0,
  chunks: 0,
  message: null,
};

/** Model shown in the consent panel; keep in sync with `embedder.rs`. */
export const MODEL_NAME = 'bge-small-zh-v1.5';
export const MODEL_DOWNLOAD_MB = 95;

/** Short label for the search-box hint. */
export function statusLabel(status: SemanticStatus, hits: number | null): string {
  switch (status.phase) {
    case 'off':
      return 'Off';
    case 'loading-model':
      return 'Loading model…';
    case 'indexing':
      return status.total > 0 ? `Indexing ${status.done}/${status.total}` : 'Indexing…';
    case 'error':
      return 'Error';
    case 'ready':
      if (hits === null) return 'Ready';
      return hits === 1 ? '1 hit' : `${hits} hits`;
  }
}

export interface HitGroup {
  path: string;
  relPath: string;
  hits: SemanticHit[];
}

/** Group hits by file, files ordered by their best hit (input is best-first). */
export function groupHits(hits: SemanticHit[]): HitGroup[] {
  const groups: HitGroup[] = [];
  const byPath = new Map<string, HitGroup>();
  for (const h of hits) {
    let g = byPath.get(h.path);
    if (!g) {
      g = { path: h.path, relPath: h.relPath, hits: [] };
      byPath.set(h.path, g);
      groups.push(g);
    }
    g.hits.push(h);
  }
  return groups;
}

/**
 * Map a cosine score onto a 0–1 bar. Scores below ~0.3 are noise for this
 * model family and anything above ~0.85 is a near-duplicate, so stretch that
 * band across the bar instead of the raw [-1, 1].
 */
export function scoreToBar(score: number): number {
  const lo = 0.3;
  const hi = 0.85;
  return Math.min(1, Math.max(0, (score - lo) / (hi - lo)));
}
