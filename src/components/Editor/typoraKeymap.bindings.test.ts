// @vitest-environment happy-dom

// Verifies that the Typora binding strings actually PARSE and RESOLVE against
// realistic keyboard events through prosemirror-keymap's own keydownHandler —
// the exact dispatch path the editor uses. This catches malformed binding
// strings (which would silently never fire) that the command-level unit tests
// in typoraKeymap.test.ts cannot, since those call the commands directly.

import { keydownHandler } from '@milkdown/prose/keymap';
import type { EditorView } from '@milkdown/prose/view';
import { describe, expect, it } from 'vitest';

const fakeView = { state: {}, dispatch: () => {} } as unknown as EditorView;

// prosemirror-keymap decides whether "Mod" means Meta or Control from the
// platform; in this headless env it's typically Control. Fire BOTH so the test
// asserts "the string resolves" without depending on platform detection.
function press(
  handler: (view: EditorView, event: KeyboardEvent) => boolean,
  opts: { key: string; code?: string; keyCode?: number; shift?: boolean; alt?: boolean; ctrl?: boolean },
): boolean {
  const base = {
    key: opts.key,
    code: opts.code,
    keyCode: opts.keyCode,
    shiftKey: !!opts.shift,
    altKey: !!opts.alt,
  };
  const metaEvt = new KeyboardEvent('keydown', { ...base, metaKey: true, ctrlKey: !!opts.ctrl });
  const ctrlEvt = new KeyboardEvent('keydown', { ...base, ctrlKey: true });
  return handler(fakeView, metaEvt) || handler(fakeView, ctrlEvt);
}

describe('typoraKeymap — binding strings resolve to events', () => {
  it('resolves digit, equals and minus heading bindings', () => {
    const hits: string[] = [];
    const handler = keydownHandler({
      'Mod-2': () => (hits.push('h2'), true),
      'Mod-0': () => (hits.push('p'), true),
      'Mod-=': () => (hits.push('inc'), true),
      'Mod--': () => (hits.push('dec'), true),
    });
    expect(press(handler, { key: '2', keyCode: 50, code: 'Digit2' })).toBe(true);
    expect(press(handler, { key: '0', keyCode: 48, code: 'Digit0' })).toBe(true);
    expect(press(handler, { key: '=', keyCode: 187, code: 'Equal' })).toBe(true);
    expect(press(handler, { key: '-', keyCode: 189, code: 'Minus' })).toBe(true);
    expect(hits.sort()).toEqual(['dec', 'h2', 'inc', 'p']);
  });

  it('resolves the backslash and letter bindings', () => {
    const hits: string[] = [];
    const handler = keydownHandler({
      'Mod-\\': () => (hits.push('clear'), true),
      'Mod-k': () => (hits.push('link'), true),
      'Mod-l': () => (hits.push('line'), true),
      'Mod-Ctrl-i': () => (hits.push('image'), true),
    });
    expect(press(handler, { key: '\\', keyCode: 220, code: 'Backslash' })).toBe(true);
    expect(press(handler, { key: 'k', keyCode: 75, code: 'KeyK' })).toBe(true);
    expect(press(handler, { key: 'l', keyCode: 76, code: 'KeyL' })).toBe(true);
    // ⌘⌃I — both Cmd(Mod) and Control held. On real macOS Mod=Meta so the event
    // carries meta+ctrl; in this headless env Mod collapses to Ctrl, so a
    // ctrl-only event matches. Accept either so the assertion is platform-robust.
    const imageHandler = keydownHandler({ 'Mod-Ctrl-i': () => (hits.push('image'), true) });
    const imageResolved =
      imageHandler(fakeView, new KeyboardEvent('keydown', { key: 'i', keyCode: 73, code: 'KeyI', metaKey: true, ctrlKey: true })) ||
      imageHandler(fakeView, new KeyboardEvent('keydown', { key: 'i', keyCode: 73, code: 'KeyI', ctrlKey: true }));
    expect(imageResolved).toBe(true);
    expect(hits.sort()).toEqual(['clear', 'image', 'line', 'link']);
  });

  it('resolves the shifted-backtick code and strike bindings', () => {
    const inline: string[] = [];
    const codeHandler = keydownHandler({ 'Mod-Shift-`': () => (inline.push('code'), true) });
    // ⌘⇧` — base key is "`" (keyCode 192); shift yields "~" as event.key.
    expect(
      codeHandler(
        fakeView,
        new KeyboardEvent('keydown', { key: '~', keyCode: 192, code: 'Backquote', metaKey: true, shiftKey: true }),
      ) ||
        codeHandler(
          fakeView,
          new KeyboardEvent('keydown', { key: '~', keyCode: 192, code: 'Backquote', ctrlKey: true, shiftKey: true }),
        ),
    ).toBe(true);

    const strike: string[] = [];
    const strikeHandler = keydownHandler({ 'Ctrl-Shift-`': () => (strike.push('strike'), true) });
    expect(
      strikeHandler(
        fakeView,
        new KeyboardEvent('keydown', { key: '~', keyCode: 192, code: 'Backquote', ctrlKey: true, shiftKey: true }),
      ),
    ).toBe(true);

    expect(inline).toEqual(['code']);
    expect(strike).toEqual(['strike']);
  });
});
