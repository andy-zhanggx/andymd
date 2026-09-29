import { useConfigStore } from '../../stores/configStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useSemanticStore } from '../../stores/semanticStore';
import { useRelatedStore } from '../../stores/relatedStore';
import { useUIStore } from '../../stores/uiStore';
import { getActiveView } from '../Editor/activeView';
import { revealHeading } from '../Editor/reveal';
import { SemanticConsent } from './SemanticConsent';
import { SemanticNotice } from './SemanticResults';
import { scoreToBar } from '../../lib/semantic';
import { flattenFiles } from '../../lib/quickOpen';
import { linkTextFor } from '../../lib/linkSuggest';
import type { LinkSuggestion } from '../../lib/related';

const baseName = (p: string) => (p.split('/').pop() ?? p).replace(/\.(md|markdown)$/i, '');

/** Insert `[[target]]` at the editor caret (with a separating space). */
function insertLink(path: string): void {
  const view = getActiveView();
  const ws = useWorkspaceStore.getState().workspace;
  if (!view || !ws) return;
  const files = flattenFiles(ws.tree, ws.root);
  const file = files.find((f) => f.path === path);
  if (!file) return;
  const { state } = view;
  const type = state.schema.nodes.wikilink;
  if (!type) return;
  let { from, to } = state.selection;
  const { $from } = state.selection;
  const before = from > $from.start() ? state.doc.textBetween(from - 1, from, undefined, '\ufffc') : '';
  let tr = state.tr;
  if (before && !/\s/.test(before)) {
    tr = tr.insertText(' ', from, to);
    from += 1;
    to = from;
  }
  tr = tr.replaceWith(from, to, type.create({ target: linkTextFor(file, files), alias: null }));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

async function openHit(path: string, heading: string, newTab: boolean) {
  const prev = getActiveView();
  const docs = useDocumentStore.getState();
  if (newTab) await docs.openInNewTab(path);
  else await docs.open(path);
  revealHeading(heading, prev);
}

function Suggestion({ s, from }: { s: LinkSuggestion; from: string }) {
  const dismiss = useRelatedStore((st) => st.dismiss);
  return (
    <div className="related-suggestion">
      <div className="related-suggestion-text" title={s.snippet}>
        <span className="related-suggestion-name">{baseName(s.path)}</span>
        {s.heading && <span className="related-suggestion-heading"> › {s.heading}</span>}
      </div>
      <button type="button" className="related-btn primary" onClick={() => insertLink(s.path)} title="Insert a [[link]] at the caret">
        Link
      </button>
      <button
        type="button"
        className="related-btn"
        aria-label={`Don't suggest ${baseName(s.path)} here again`}
        title="Don't suggest this note for this one again"
        onClick={() => dismiss(from, s.path)}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Sidebar "Related" tab: notes close in meaning to the open note (or the
 * caret's section), plus link suggestions for the paragraph being written.
 * Everything comes from the local semantic index; nothing leaves the Mac.
 */
export function RelatedPanel() {
  const root = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const doc = useDocumentStore((s) => s.doc);
  const enabled = useConfigStore((s) => s.config.semanticSearch);
  const endpoint = useConfigStore((s) => s.config.semanticModelEndpoint);
  const status = useSemanticStore((s) => s.status);
  const enable = useSemanticStore((s) => s.enable);
  const start = useSemanticStore((s) => s.start);
  const { mode, setMode, hits, loading, suggestions } = useRelatedStore();
  const openDuplicates = () => useUIStore.getState().setDuplicatesOpen(true);

  if (!root) {
    return (
      <div className="sidebar-empty">
        <p>Open a folder to see related notes</p>
      </div>
    );
  }
  if (!enabled) {
    return (
      <div className="related-panel">
        <SemanticConsent
          defaultEndpoint={endpoint}
          onEnable={(ep) => void enable(root, ep)}
          onCancel={() => useUIStore.getState().setSidebarTab('files')}
        />
      </div>
    );
  }
  if (status.phase !== 'ready' || status.root !== root) {
    return (
      <div className="related-panel">
        <SemanticNotice status={status} query="" searching={false} hasHits={false} onRetry={() => void start(root)} />
      </div>
    );
  }

  return (
    <div className="related-panel">
      <div className="related-mode" role="radiogroup" aria-label="Related to">
        {(['note', 'section'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`related-mode-btn${mode === m ? ' active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'note' ? 'This note' : 'This section'}
          </button>
        ))}
      </div>

      {!doc?.path ? (
        <p className="related-empty">Open a saved note to see what relates to it.</p>
      ) : (
        <>
          {suggestions.length > 0 && (
            <section className="related-section" aria-label="Link suggestions">
              <h4 className="related-heading">Link this paragraph to…</h4>
              {suggestions.map((s) => (
                <Suggestion key={s.path} s={s} from={doc.path!} />
              ))}
            </section>
          )}
          <section className="related-section" aria-label="Related notes">
            <h4 className="related-heading">Related notes</h4>
            {loading && hits.length === 0 && <p className="related-empty">Finding related notes…</p>}
            {!loading && hits.length === 0 && <p className="related-empty">Nothing related yet.</p>}
            {hits.map((h) => (
              <button
                key={h.path}
                type="button"
                className="semantic-hit related-hit"
                title={`${h.relPath} · similarity ${h.score.toFixed(2)} · ⌘-click opens in a new tab`}
                onClick={(e) => void openHit(h.path, h.heading, e.metaKey)}
              >
                <span className="semantic-hit-head">
                  <span className="semantic-hit-heading">{baseName(h.path)}</span>
                  <span className="semantic-score" aria-hidden="true">
                    <span className="semantic-score-bar" style={{ width: `${Math.round(scoreToBar(h.score) * 100)}%` }} />
                  </span>
                </span>
                {h.heading && <span className="related-hit-section">{h.heading}</span>}
                <span className="semantic-hit-snippet">{h.snippet}</span>
              </button>
            ))}
          </section>
        </>
      )}
      <button type="button" className="related-footer-btn" onClick={openDuplicates}>
        Find duplicate notes…
      </button>
    </div>
  );
}
