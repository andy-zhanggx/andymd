# AndyMD collaboration relay

A small [Hocuspocus](https://hocuspocus.dev) (Yjs WebSocket) server that powers
real-time collaboration in AndyMD. Rooms are keyed by the share **code**;
document state is persisted to SQLite so reconnects and late joiners converge on
the full document.

## Run locally

```bash
cd server
npm install
npm start          # ws://localhost:1234
```

Then in AndyMD: Settings → set the collaboration server URL to
`ws://localhost:1234` (this is the default), open a document, and click **协作 /
Share**.

## Run with Docker

```bash
cd server
docker build -t andymd-collab .
docker run -d --name andymd-collab \
  -p 1234:1234 \
  -v andymd-collab-data:/data \
  andymd-collab
```

Point the client at `ws://YOUR_SERVER:1234` (or `wss://...` behind a TLS proxy —
recommended for anything beyond localhost).

## Environment

| Var         | Default                 | Meaning                          |
|-------------|-------------------------|----------------------------------|
| `PORT`      | `1234`                  | WebSocket listen port            |
| `COLLAB_DB` | `andymd-collab.sqlite`  | SQLite file path for persistence |

## TLS

Hocuspocus speaks plain `ws://`. For `wss://` (required by production webviews),
terminate TLS in front of it (Caddy/Nginx/Traefik) and proxy to port 1234.

## Security

MVP: anyone with a valid-format code can join and edit that room (like a Google
Docs link). `onAuthenticate` only checks the code shape. Add a real token/password
check there before exposing this to untrusted networks.
