import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FontSettingsView } from './FontSettings';
import { DEFAULT_CODE_FONT_FAMILY, DEFAULT_FONT_FAMILY, FONT_PRESETS } from '../lib/fonts';

const noop = () => {};

function render(over: Partial<Parameters<typeof FontSettingsView>[0]> = {}) {
  return renderToStaticMarkup(
    <FontSettingsView
      fontFamily={DEFAULT_FONT_FAMILY}
      codeFontFamily={DEFAULT_CODE_FONT_FAMILY}
      fontSize={16}
      lineHeight={1.7}
      onChange={noop}
      onClose={noop}
      {...over}
    />,
  );
}

describe('FontSettingsView', () => {
  it('lists every preset with a live sample in that font and marks the active one', () => {
    const html = render();
    for (const p of FONT_PRESETS) {
      expect(html).toContain(p.label);
      expect(html).toContain(`font-family:${p.family.replace(/"/g, "&quot;")}`);
    }
    const checked = html.match(/aria-checked="true"/g) ?? [];
    // one body preset + one code preset
    expect(checked).toHaveLength(2);
    expect(html).toContain('font-preset active');
    expect(html).toContain('>Default<');
  });

  it('shows the size and line-height values and disables Reset at defaults', () => {
    const html = render();
    expect(html).toContain('16px');
    expect(html).toContain('1.70');
    expect(html).toMatch(/<button class="update-secondary" disabled=""/);
  });

  it('selects the Custom row (with the family pre-filled) for a non-preset font', () => {
    const html = render({ fontFamily: '"Comic Sans MS", cursive', fontSize: 18 });
    expect(html).toContain('font-preset font-preset-custom active');
    expect(html).toContain('value="&quot;Comic Sans MS&quot;, cursive"');
    expect(html).not.toMatch(/<button class="update-secondary" disabled=""/);
  });
});
