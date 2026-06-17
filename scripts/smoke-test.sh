#!/usr/bin/env bash
# Automated smoke test for the release AndyMD.app bundle.
#
# Launches the built app against a document that exercises every parser/plugin
# (headings, GFM, highlight/super/subscript, math, mermaid, wikilinks, tables)
# and asserts the process survives startup — which catches menu-accelerator
# panics, plugin-init failures, and webview crashes. Scans macOS crash reports.
#
# Usage: scripts/smoke-test.sh [--keep]
#   --keep  leave the app running for visual inspection (default: quit it)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/AndyMD.app"
PROC="AndyMD.app/Contents/MacOS"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

[ -d "$APP" ] || { echo "FAIL: app not found at $APP — run 'pnpm tauri build' first"; exit 1; }

WORK="$(mktemp -d)"
DOC="$WORK/smoke.md"
cat > "$DOC" <<'MD'
# AndyMD Smoke Test

## Formatting
**bold** *italic* ~~strike~~ ==highlight== `code` H~2~O E=mc^2^

## Lists
- [ ] task one
- [x] task two
1. ordered

## Table
| Col A | Col B |
|-------|-------|
| 1     | 2     |

## Math
Inline $a^2 + b^2 = c^2$ and block:
$$\int_0^1 x^2 \, dx$$

## Mermaid
```mermaid
graph TD; A-->B; B-->C;
```

> A blockquote with a [[Wikilink]] and a [link](https://example.com).
MD

echo "→ app:  $APP"
echo "→ doc:  $DOC"

# Clean slate.
pkill -f "$PROC" 2>/dev/null || true
sleep 1

CRASH_DIR="$HOME/Library/Logs/DiagnosticReports"
before=$(ls -1 "$CRASH_DIR" 2>/dev/null | grep -ci andymd || true)

# Re-sign ad-hoc (harmless if already signed) and launch this specific bundle.
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
open -a "$APP" "$DOC"
echo "→ launched; waiting 7s for startup…"
sleep 7

fail() { echo "FAIL: $1"; exit 1; }

if ! pgrep -f "$PROC" >/dev/null; then
  recent=$(ls -1t "$CRASH_DIR" 2>/dev/null | grep -i andymd | head -1 || true)
  [ -n "$recent" ] && { echo "--- crash report: $recent ---"; tail -50 "$CRASH_DIR/$recent"; }
  fail "process not running — crashed on startup"
fi
echo "✓ process alive after startup (menu built, plugins initialized, document opened)"

after=$(ls -1 "$CRASH_DIR" 2>/dev/null | grep -ci andymd || true)
[ "$after" -gt "$before" ] && fail "a new AndyMD crash report appeared"
echo "✓ no new crash reports"

# A second beat to catch delayed renderer crashes.
sleep 3
pgrep -f "$PROC" >/dev/null || fail "process died shortly after startup"
echo "✓ still alive after 10s total"

if [ "$KEEP" -eq 1 ]; then
  echo "✓ leaving app running (--keep)"
else
  pkill -f "$PROC" 2>/dev/null || true
  echo "✓ quit app"
fi

echo "SMOKE TEST PASSED"
