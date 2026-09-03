import { useMemo } from 'react';
import { useSemanticStore } from '../../stores/semanticStore';
import { useDocumentStore } from '../../stores/documentStore';
import { getActiveView } from '../Editor/activeView';
import { groupHits, scoreToBar, type SemanticStatus } from '../../lib/semantic';

interface Props {
  root: string;
  height: number;
}

/**
 * After a hit opens, scroll the (possibly rebuilt) editor to the chunk's
 * heading. Mirrors `revealInEditor` in GlobalSearch: the view is re-created
 * asynchronously when the document changes, so poll briefly for it.
 */
function revealHeading(heading: string, prevView: unknown) {
  if (!heading) return;
  const deadline = Date.now() + 2000;
  const tick = () => {
    const view = getActiveView();
    if (view && (view !== prevView || Date.now() > deadline - 1500)) {
      const els = Array.from(view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));
      const el = els.find((h) => (h.textContent ?? '').trim() === heading);
      el?.scrollIntoView({ block: 'start' });
      return;
    }
    if (Date.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Progress / error / empty states for the results area. */
export function SemanticNotice({
  status,
  query,
  searching,
  hasHits,
  onRetry,
}: {
  status: SemanticStatus;
  query: string;
  searching: boolean;
  hasHits: boolean;
  onRetry: () => void;
}) {
  if (status.phase === 'error') {
    return (
      <div className="semantic-notice">
        <p className="semantic-notice-title">Semantic search unavailable</p>
        <p className="semantic-notice-msg">{status.message ?? 'Unknown error'}</p>
        <button type="button" className="sidebar-empty-action" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (status.phase === 'loading-model') {
    return (
      <div className="semantic-notice">
        <p>Loading model…</p>
        <p className="semantic-notice-msg">First run downloads it; this can take a minute.</p>
      </div>
    );
  }
  if (status.phase === 'indexing') {
    const pct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
    return (
      <div className="semantic-notice">
        <p>
          Indexing workspace…{' '}
          {status.total > 0 && (
            <span className="semantic-notice-msg">
              {status.done}/{status.total}
            </span>
          )}
        </p>
        <div className="semantic-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="semantic-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (status.phase === 'off') {
    return (
      <div className="semantic-notice">
        <p>Semantic search is off</p>
      </div>
    );
  }
  if (!query) {
    return (
      <div className="semantic-notice">
        <p>Type to search by meaning</p>
        <p className="semantic-notice-msg">
          {status.files} notes · {status.chunks} passages indexed
        </p>
      </div>
    );
  }
  if (searching) {
    return (
      <div className="semantic-notice">
        <p>Searching…</p>
      </div>
    );
  }
  if (!hasHits) {
    return (
      <div className="semantic-notice">
        <p>No related notes</p>
      </div>
    );
  }
  return null;
}

export function SemanticResults({ root, height }: Props) {
  const status = useSemanticStore((s) => s.status);
  const hits = useSemanticStore((s) => s.hits);
  const query = useSemanticStore((s) => s.query);
  const searching = useSemanticStore((s) => s.searching);
  const start = useSemanticStore((s) => s.start);
  const openDoc = useDocumentStore((s) => s.open);
  const groups = useMemo(() => groupHits(hits), [hits]);

  const showList = status.phase === 'ready' && query && hits.length > 0;

  const activate = async (path: string, heading: string) => {
    const prevView = getActiveView();
    await openDoc(path);
    revealHeading(heading, prevView);
  };

  return (
    <div className="semantic-results" style={{ height }} role="list" aria-label="Semantic search results">
      {!showList && (
        <SemanticNotice
          status={status}
          query={query}
          searching={searching}
          hasHits={hits.length > 0}
          onRetry={() => void start(root)}
        />
      )}
      {showList &&
        groups.map((g) => (
          <div key={g.path} className="semantic-file" role="listitem">
            <div className="semantic-filehead" title={g.relPath}>
              {g.relPath}
            </div>
            {g.hits.map((h) => (
              <button
                key={`${h.path}:${h.line}`}
                type="button"
                className="semantic-hit"
                title={`${h.relPath}:${h.line} · similarity ${h.score.toFixed(2)}`}
                onClick={() => void activate(h.path, h.heading)}
              >
                <span className="semantic-hit-head">
                  {h.heading ? <span className="semantic-hit-heading">{h.heading}</span> : null}
                  <span className="semantic-score" aria-hidden="true">
                    <span className="semantic-score-bar" style={{ width: `${Math.round(scoreToBar(h.score) * 100)}%` }} />
                  </span>
                </span>
                <span className="semantic-hit-snippet">{h.snippet}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
