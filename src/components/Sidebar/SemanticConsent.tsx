import { useState } from 'react';
import { MODEL_DOWNLOAD_MB, MODEL_NAME } from '../../lib/semantic';

interface Props {
  /** Pre-filled from `config.semanticModelEndpoint`. */
  defaultEndpoint: string;
  onEnable: (endpoint: string) => void;
  onCancel: () => void;
}

/**
 * Shown the first time the semantic toggle is switched on. A ~100 MB model
 * download must be an explicit choice, and users on restricted networks need
 * a place to point at a mirror.
 */
export function SemanticConsent({ defaultEndpoint, onEnable, onCancel }: Props) {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [showMirror, setShowMirror] = useState(defaultEndpoint.trim() !== '');

  return (
    <div className="semantic-consent" role="dialog" aria-label="Enable semantic search">
      <h3 className="semantic-consent-title">Search by meaning</h3>
      <p>
        Semantic search finds notes that are <em>about</em> your query even when they use
        different words — in Chinese and English.
      </p>
      <p>
        It runs entirely on this Mac. Enabling it downloads the <code>{MODEL_NAME}</code> model
        once (about {MODEL_DOWNLOAD_MB} MB) and indexes this workspace in the background; your
        notes never leave the machine.
      </p>
      {showMirror ? (
        <label className="semantic-consent-field">
          <span>Model mirror (optional)</span>
          <input
            type="url"
            placeholder="https://hf-mirror.com"
            value={endpoint}
            spellCheck={false}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </label>
      ) : (
        <button type="button" className="semantic-consent-link" onClick={() => setShowMirror(true)}>
          Can't reach Hugging Face? Use a mirror…
        </button>
      )}
      <div className="semantic-consent-actions">
        <button type="button" className="sidebar-empty-action" onClick={() => onEnable(endpoint)}>
          Enable
        </button>
        <button type="button" className="semantic-consent-cancel" onClick={onCancel}>
          Not now
        </button>
      </div>
    </div>
  );
}
