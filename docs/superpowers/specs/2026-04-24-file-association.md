# macOS `.md` File Association

**Date:** 2026-04-24
**Branch:** `feature/v0.1-mvp`
**Status:** Approved (Andy, 2026-04-24)

## Goal

Make "Typora Clone" show up in Finder's **Open With** menu for `.md` / `.markdown` files; when the user chooses it, open the file in the app. Both scenarios work:

1. **Cold launch**: app not running → double-click / Open With → app starts and opens the file
2. **Warm**: app already running → Open With → app receives the file and opens it in the current window

## Architecture

```
Finder ── NSOpenURL AppleEvent ──▶ Tauri RunEvent::Opened ──▶
  ┌─────────────────────────────────────────────────┐
  │ Rust: push path to PendingOpensState            │
  │       emit("open-file-request", path)           │
  └─────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴─────────────────────┐
          ▼                                         ▼
  JS listen("open-file-request")          JS boot: invoke("take_pending_opens")
  → docStore.open(path)                   → for each, docStore.open(path)
```

Two sinks because of a race: on cold launch, the event may fire before the Webview's JS listener is attached. The buffered-state approach catches anything the live listener missed.

## Implementation

### 1. `src-tauri/tauri.conf.json` — declare file association

Add to `bundle`:

```json
"fileAssociations": [
  {
    "ext": ["md", "markdown", "mdown", "mkd"],
    "name": "Markdown Document",
    "description": "Markdown document",
    "role": "Editor",
    "mimeType": "text/markdown"
  }
]
```

This causes Tauri to emit the proper `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` entries into the macOS `Info.plist` during bundling.

### 2. `src-tauri/src/commands/workspace_cmd.rs` — pending opens state + command

Add:

```rust
use std::sync::Mutex;

pub struct PendingOpensState(pub Mutex<Vec<String>>);

impl Default for PendingOpensState {
    fn default() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

#[tauri::command]
pub fn take_pending_opens(state: tauri::State<'_, PendingOpensState>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}
```

### 3. `src-tauri/src/lib.rs` — handle `RunEvent::Opened`

Currently uses `.run(tauri::generate_context!()).expect(...)`. Switch to the `build().run(closure)` pattern to get access to the run-loop event callback:

```rust
use tauri::RunEvent;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::new())
        .manage(commands::workspace_cmd::PendingOpensState::default())
        .setup(|app| {
            let menu_obj = menu::build_menu(app.handle())?;
            app.set_menu(menu_obj)?;
            app.on_menu_event(|h, event| menu::on_menu_event(h, event));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs_cmd::read_file,
            commands::fs_cmd::write_file,
            commands::fs_cmd::list_workspace,
            commands::fs_cmd::create_file,
            commands::fs_cmd::create_dir,
            commands::fs_cmd::rename_path,
            commands::fs_cmd::delete_to_trash,
            commands::fs_cmd::reveal_in_finder,
            commands::workspace_cmd::open_workspace,
            commands::workspace_cmd::pick_workspace_dir,
            commands::workspace_cmd::pick_markdown_file,
            commands::workspace_cmd::save_markdown_dialog,
            commands::workspace_cmd::take_pending_opens,
            commands::config_cmd::get_config,
            commands::config_cmd::save_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Opened { urls } = event {
            let pending = handle.state::<commands::workspace_cmd::PendingOpensState>();
            let mut guard = pending.0.lock().unwrap();
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let s = path.to_string_lossy().into_owned();
                    guard.push(s.clone());
                    let _ = handle.emit("open-file-request", s);
                }
            }
        }
    });
}
```

`tauri::RunEvent::Opened { urls }` fires for file-open Apple Events on macOS. Each URL is a `file://` URL pointing at the picked file.

Note: `handle.emit` requires `Emitter` to be in scope — `use tauri::{Emitter, RunEvent};` at the top of lib.rs.

### 4. Frontend `src/services/fsService.ts` — add `onOpenFileRequest` + `takePendingOpens`

Add near the existing `onWorkspaceChanged`:

```ts
export function onOpenFileRequest(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>('open-file-request', (e) => cb(e.payload));
}
```

Extend the `fsService` object:

```ts
  takePendingOpens: () =>
    invoke<string[]>('take_pending_opens'),
```

### 5. Frontend boot in `src/main.tsx` — drain pending opens after workspace load

After the existing lastWorkspace open block, add:

```ts
try {
  const pending = await (await import('./services/fsService')).fsService.takePendingOpens();
  if (pending.length > 0) {
    const { useDocumentStore } = await import('./stores/documentStore');
    // If multiple paths come in, open the last one (window only holds one document in v0.1)
    await useDocumentStore.getState().open(pending[pending.length - 1]);
  }
} catch { /* ignore */ }
```

### 6. Frontend hook `src/hooks/useOpenFileRequest.ts` — listen while running

```ts
import { useEffect } from 'react';
import { onOpenFileRequest } from '../services/fsService';
import { useDocumentStore } from '../stores/documentStore';

export function useOpenFileRequest() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await onOpenFileRequest(async (path) => {
          try {
            await useDocumentStore.getState().open(path);
          } catch (e) {
            console.error('open-file-request failed', e);
          }
        });
      } catch (e) {
        console.warn('open-file-request listener not available', e);
      }
    })();
    return () => { unlisten?.(); };
  }, []);
}
```

Call from `App.tsx` alongside existing hooks:

```tsx
import { useOpenFileRequest } from './hooks/useOpenFileRequest';
// inside App()
useOpenFileRequest();
```

### 7. Dirty-state consideration

If the user has unsaved changes and an Open File request comes in, v0.1 keeps it simple: `docStore.open(path)` replaces the current document. The existing save/close logic doesn't prompt in this path. Acceptable for v0.1 (user can Undo via Cmd+Z on source if needed; improving this is a v0.2 follow-up).

## Verification

### Automated

- `cargo build` clean
- `tsc --noEmit` clean
- `pnpm test` — existing 29 pass (this feature mostly integration-tested manually)

### Manual (requires rebuild + reinstall)

After rebuilding:

1. In Finder, right-click a `.md` file → **Open With** menu should list "Typora Clone"
2. Test cold launch: quit the app, then from Finder double-click a `.md` file → app launches, the file is loaded
3. Test warm: app running on a different file / empty state → Finder drag another `.md` onto the Dock icon → file opens in existing window

Because of the Tauri rebuild required, **this verification is manual only** — CI/test automation of macOS file associations is not in scope for v0.1.

## Commit

```
feat(v0.1): macOS .md file association (Open With)

Declare Markdown as a document type in Info.plist via Tauri's
fileAssociations, and handle RunEvent::Opened to either emit a live
event or queue the path for frontend pickup on boot.

Spec: docs/superpowers/specs/2026-04-24-file-association.md
```

## Post-merge step

After commit, rebuild and reinstall so the `Info.plist` changes take effect:

```bash
pnpm tauri build
rm -rf "/Applications/Typora Clone.app"
cp -R "src-tauri/target/release/bundle/macos/Typora Clone.app" "/Applications/Typora Clone.app"
xattr -dr com.apple.quarantine "/Applications/Typora Clone.app"

# Tell Launch Services about the new associations (forces Finder to refresh)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/Typora Clone.app"
```
