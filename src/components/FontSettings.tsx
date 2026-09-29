import { useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore';
import { useUIStore } from '../stores/uiStore';
import {
  CODE_FONT_PRESETS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_FONT_FAMILY,
  FONT_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  clampFontSize,
  clampLineHeight,
  findCodeFontPreset,
  findFontPreset,
  normalizeCustomFamily,
} from '../lib/fonts';
import { DEFAULT_CONFIG } from '../types';

const SAMPLE_TEXT = '永和九年，岁在癸丑 — The quick brown fox jumps over the lazy dog. 0123456789';

export interface FontSettingsViewProps {
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  lineHeight: number;
  onChange: (patch: {
    fontFamily?: string;
    codeFontFamily?: string;
    fontSize?: number;
    lineHeight?: number;
  }) => void;
  onClose: () => void;
}

/** Pure, store-free view so it can be rendered in tests. */
export function FontSettingsView({
  fontFamily,
  codeFontFamily,
  fontSize,
  lineHeight,
  onChange,
  onClose,
}: FontSettingsViewProps) {
  const activePreset = findFontPreset(fontFamily);
  const activeCodePreset = findCodeFontPreset(codeFontFamily);

  // Free-text inputs keep their own draft so typing doesn't thrash the config
  // on every keystroke; commit on blur / Enter.
  const [customDraft, setCustomDraft] = useState(activePreset ? '' : fontFamily);
  const [codeDraft, setCodeDraft] = useState(activeCodePreset ? '' : codeFontFamily);
  useEffect(() => {
    if (!activePreset) setCustomDraft(fontFamily);
  }, [fontFamily, activePreset]);
  useEffect(() => {
    if (!activeCodePreset) setCodeDraft(codeFontFamily);
  }, [codeFontFamily, activeCodePreset]);

  const commitCustom = () => {
    const v = customDraft.trim();
    if (!v) return;
    const family = normalizeCustomFamily(v, 'sans-serif');
    if (family !== fontFamily) onChange({ fontFamily: family });
  };
  const commitCode = () => {
    const v = codeDraft.trim();
    if (!v) return;
    const family = normalizeCustomFamily(v, 'monospace');
    if (family !== codeFontFamily) onChange({ codeFontFamily: family });
  };

  const isDefault =
    fontFamily === DEFAULT_FONT_FAMILY &&
    codeFontFamily === DEFAULT_CODE_FONT_FAMILY &&
    fontSize === DEFAULT_CONFIG.fontSize &&
    lineHeight === DEFAULT_CONFIG.lineHeight;

  return (
    <div className="update-backdrop" onClick={onClose}>
      <div
        className="update-card font-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Font Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="update-head">
          <h2>Font</h2>
          <button className="update-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="update-body font-settings-body">
          <section>
            <span className="update-label">Body font</span>
            <div className="font-preset-list" role="radiogroup" aria-label="Body font">
              {FONT_PRESETS.map((p) => {
                const active = activePreset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`font-preset${active ? ' active' : ''}`}
                    onClick={() => onChange({ fontFamily: p.family })}
                  >
                    <span className="font-preset-title">
                      <span className="font-preset-label">{p.label}</span>
                      {p.id === findFontPreset(DEFAULT_FONT_FAMILY)?.id && (
                        <span className="font-preset-badge">Default</span>
                      )}
                    </span>
                    <span className="font-preset-sample" style={{ fontFamily: p.family }}>
                      {SAMPLE_TEXT}
                    </span>
                    <span className="font-preset-desc">{p.description}</span>
                  </button>
                );
              })}
              <label className={`font-preset font-preset-custom${activePreset ? '' : ' active'}`}>
                <span className="font-preset-title">
                  <span className="font-preset-label">Custom</span>
                </span>
                <input
                  className="update-token"
                  type="text"
                  placeholder='e.g. "LXGW WenKai", Georgia'
                  aria-label="Custom body font"
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onBlur={commitCustom}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitCustom();
                    }
                  }}
                  spellCheck={false}
                />
                <span className="font-preset-desc">Any installed font family. Separate fallbacks with commas.</span>
              </label>
            </div>
          </section>

          <section className="font-settings-row">
            <label className="font-settings-field">
              <span className="update-label">Size</span>
              <span className="font-settings-control">
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={fontSize}
                  aria-label="Font size"
                  onChange={(e) => onChange({ fontSize: clampFontSize(Number(e.target.value)) })}
                />
                <span className="font-settings-value">{fontSize}px</span>
              </span>
            </label>
            <label className="font-settings-field">
              <span className="update-label">Line height</span>
              <span className="font-settings-control">
                <input
                  type="range"
                  min={LINE_HEIGHT_MIN}
                  max={LINE_HEIGHT_MAX}
                  step={0.05}
                  value={lineHeight}
                  aria-label="Line height"
                  onChange={(e) => onChange({ lineHeight: clampLineHeight(Number(e.target.value)) })}
                />
                <span className="font-settings-value">{lineHeight.toFixed(2)}</span>
              </span>
            </label>
          </section>

          <section>
            <span className="update-label">Code font</span>
            <div className="font-code-presets" role="radiogroup" aria-label="Code font">
              {CODE_FONT_PRESETS.map((p) => {
                const active = activeCodePreset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`font-chip${active ? ' active' : ''}`}
                    style={{ fontFamily: p.family }}
                    onClick={() => onChange({ codeFontFamily: p.family })}
                  >
                    {p.label}
                  </button>
                );
              })}
              <input
                className={`update-token font-code-custom${activeCodePreset ? '' : ' active'}`}
                type="text"
                placeholder="Custom"
                aria-label="Custom code font"
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                onBlur={commitCode}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitCode();
                  }
                }}
                spellCheck={false}
              />
            </div>
          </section>

          <p className="font-settings-preview" style={{ fontFamily, fontSize, lineHeight }}>
            {SAMPLE_TEXT}
            <br />
            <code style={{ fontFamily: codeFontFamily }}>const answer = 42; // code 代码</code>
          </p>
        </div>

        <footer className="update-foot">
          <button
            className="update-secondary"
            disabled={isDefault}
            onClick={() =>
              onChange({
                fontFamily: DEFAULT_FONT_FAMILY,
                codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
                fontSize: DEFAULT_CONFIG.fontSize,
                lineHeight: DEFAULT_CONFIG.lineHeight,
              })
            }
          >
            Reset to Defaults
          </button>
          <button className="update-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

export function FontSettings() {
  const open = useUIStore((s) => s.fontSettingsOpen);
  const { fontFamily, codeFontFamily, fontSize, lineHeight } = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useUIStore.getState().setFontSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <FontSettingsView
      fontFamily={fontFamily}
      codeFontFamily={codeFontFamily}
      fontSize={fontSize}
      lineHeight={lineHeight}
      onChange={(patch) => void update(patch)}
      onClose={() => useUIStore.getState().setFontSettingsOpen(false)}
    />
  );
}
