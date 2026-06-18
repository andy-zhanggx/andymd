import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Release } from '../lib/changelog';
import { renderInline } from '../lib/inlineMarkdown';

/** Pure presentational popup. Render-tested in isolation. */
export function WhatsNewView({
  releases,
  onClose,
}: {
  releases: Release[];
  onClose: () => void;
}) {
  return (
    <div className="whatsnew-backdrop" onClick={onClose}>
      <div
        className="whatsnew-card"
        role="dialog"
        aria-modal="true"
        aria-label="What's New"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="whatsnew-head">
          <h2>What&apos;s New</h2>
          <button className="whatsnew-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="whatsnew-body">
          {releases.map((r) => (
            <section key={r.version} className="whatsnew-release">
              <h3>
                {r.version}
                {r.date ? <span className="whatsnew-date"> · {r.date}</span> : null}
              </h3>
              {r.sections.map((s) => (
                <div key={s.label} className="whatsnew-section">
                  <h4>{s.label}</h4>
                  <ul>
                    {s.items.map((item, i) => (
                      <li key={i}>{renderInline(item, `${r.version}-${s.label}-${i}`)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer className="whatsnew-foot">
          <button className="whatsnew-ok" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Store-connected container. */
export function WhatsNew() {
  const open = useUIStore((s) => s.whatsNewOpen);
  const releases = useUIStore((s) => s.whatsNewReleases);
  const close = useUIStore((s) => s.closeWhatsNew);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!open) return null;
  return <WhatsNewView releases={releases} onClose={close} />;
}
