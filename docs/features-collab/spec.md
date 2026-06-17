# Feature: Online Collaborative Editing (`collab`)

Google-Docs-style real-time multi-user editing for AndyMD. Users share a short
**code** (ToDesk-like join experience); collaborators see each other's presence
and live cursors/selections (Google-Docs-like). We aim to stay as close to the
Google Docs experience as the desktop app allows.

## Decisions (locked)

- **Network model:** central **cloud relay** (not literal host-as-server P2P).
  P2P / NAT hole-punching was rejected as too complex. The "host" is a *role*,
  not a machine.
- **Persistence:** server-side. The room's document state lives on the server
  (survives disconnects; late joiners get full content).
- **MVP scope:** real-time text sync + online presence (who's editing) + remote
  cursors/selections. Comments, permissions/roles, doc lists, @-mentions are
  out of scope for v1.
- **Deployment:** user's own cloud server (Docker).

## Reconciliation: "host = role"

The person who clicks **Share** becomes the document **owner/host** for that
room: they seed the room from their local `.md` and they are the one who can
save the collaborative result back to a local file. Everyone else is a **guest**
editing online only. All traffic and persistence flow through the cloud relay —
the host's machine is never a server.

## Architecture

```
  Host (sharer)            Cloud server              Guest(s)
  AndyMD desktop           Hocuspocus + SQLite       AndyMD desktop
  Milkdown + collab  <-WS->  room = code        <-WS->  Milkdown + collab
  Y.Doc <-> local .md       persistence/auth          Y.Doc (online only)
  + awareness (cursors)     awareness relay           + awareness
```

- **Room = documentName = share code.** Hocuspocus separates state by
  `documentName`; we set it to the code.
- **Persistence:** `@hocuspocus/extension-sqlite`; `onStoreDocument` persists the
  binary Yjs state automatically.
- **Auth:** `onAuthenticate` validates the code (MVP: the code is the token;
  optional room password reserved for later).

## Components

### Server (`server/`, standalone Node service)
- `server/index.mjs` — Hocuspocus instance: port, SQLite extension, code
  validation, `onAuthenticate`.
- `server/Dockerfile`, `server/package.json`, `server/README.md` — deployment.

### Client (`src/collab/`)
- `roomCode.ts` — generate/validate codes (8-char Crockford base32, no ambiguous
  chars).
- `identity.ts` — local display name (from config, else generated) + per-session
  color from a fixed palette.
- `cursor.ts` — `cursorBuilder` for a colored caret + name label.
- `collabSession.ts` — owns the `HocuspocusProvider`, `Y.Doc`, awareness, and the
  status lifecycle; exposes connect/disconnect + status/peers callbacks.
- `collabStore.ts` (zustand) — `status` (`idle | connecting | connected |
  reconnecting | error`), `role` (`host | guest`), `roomCode`, `peers[]`,
  `error`. Actions: `host()`, `join(code)`, `leave()`.

### Editor integration
- `milkdownConfig.ts` — `buildEditor` gains an opt to include the `collab`
  plugin. In collab mode `defaultValueCtx` is left empty; content comes from the
  Y.Doc.
- `MarkdownEditor.tsx` — rebuilds the editor when entering/leaving collab (add
  collab-active to the rebuild deps). After create: `bindDoc` + `setAwareness`;
  on provider `synced` the **host** calls `applyTemplate(localMarkdown, isEmpty)`
  then `connect()`; the **guest** just `connect()`. The existing
  `markdownUpdated` listener still mirrors to `documentStore.setDraft`, so the
  host's autosave writes the live doc back to disk; guests with no path don't
  autosave.

### UI
- `ShareDialog.tsx` — modal with Share (show code + copy) and Join (enter code).
- `PresenceBar.tsx` — avatar row from awareness states, in the TitleBar.
- A "Collab/Share" entry point in the TitleBar.
- Remote cursor/selection CSS (colored caret + floating name label).

### Config additions (`types.ts`)
- `collabServerUrl: string` — WebSocket URL of the relay (default empty → user
  must set it; can default to `ws://localhost:1234` for local testing).
- `displayName: string` — name shown to collaborators.

## Data flow

- **Host:** open `.md` → Share → `collabStore.host()` generates a code, opens the
  provider with `name = code`, role = host. Editor rebuilds with collab; on
  `synced`, seeds from `doc.draft` only if the server doc is empty.
- **Guest:** Join → enter code → `collabStore.join(code)` ensures a draft doc
  exists, opens the provider with `name = code`, role = guest. Editor rebuilds;
  content arrives from the Y.Doc.
- **Presence:** each client sets `awareness` `user = {name, color}`; y-prosemirror
  renders remote carets/selections; `PresenceBar` lists peers from awareness.
- **Save (host):** Y.Doc change → markdown → `setDraft` → existing autosave.

## The three sharp edges

1. **Seed de-dup (critical):** only the host seeds, guarded by `applyTemplate`'s
   empty-doc condition. Guests never seed. Prevents duplicated content when a host
   reconnects to a persisted room.
2. **Local file write-back:** host mirrors Y.Doc → markdown → `setDraft`; guests
   don't write local files.
3. **Editor rebuild race:** fold collab-active into the rebuild effect deps; reuse
   the known Milkdown teardown guards (listener race) to avoid
   "Context editorView not found".

## Error handling

- Invalid code → server rejects auth → dialog shows an error.
- Disconnect → provider auto-reconnects, status shows "reconnecting", Yjs merges
  offline edits on reconnect.
- Server down → `error` status with retry; local editing continues and syncs on
  recovery.

## Testing

- Unit: `collabStore` transitions, `roomCode` gen/validate, seed-guard logic,
  `identity` color assignment.
- Integration: two `Y.Doc`s over an in-memory connector verify convergence +
  awareness (mirrors existing PM integration tests; y-prosemirror's PM deps need
  the known vitest dedupe).
- Server: auth + persistence round-trip smoke test.

## Security

MVP: anyone with the code can edit (like a Google Docs link). Codes carry enough
entropy to resist guessing. Optional room password is reserved for a later
iteration.

## Explicitly out of scope (v1)

Comments/annotations, permission roles (view-only), document list/history,
@-mentions, complex offline-first conflict UI.
