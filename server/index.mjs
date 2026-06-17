// AndyMD collaboration relay.
//
// A thin Hocuspocus (Yjs WebSocket) server with SQLite persistence. Each room is
// keyed by `documentName`, which AndyMD sets to the share *code*. The server
// keeps each room's binary Yjs state in SQLite so disconnects, reconnects, and
// late joiners all converge on the full document. Awareness (presence + remote
// cursors) is relayed natively by Hocuspocus.
//
// Security model (MVP): knowing the code grants edit access, exactly like a
// Google Docs link. We only validate that the room name *looks* like a code, so
// random scanners can't squat arbitrary names. A real password/token check is a
// later iteration (wire it into `onAuthenticate`).

import { Hocuspocus } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

const PORT = Number(process.env.PORT ?? 1234);
const DB_PATH = process.env.COLLAB_DB ?? 'andymd-collab.sqlite';

// Must match the client generator in src/collab/roomCode.ts:
// 8 chars of Crockford base32 (no I, L, O, U).
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

const server = new Hocuspocus({
  port: PORT,
  name: 'andymd-collab',
  extensions: [new SQLite({ database: DB_PATH })],

  async onAuthenticate({ documentName }) {
    if (!CODE_RE.test(documentName)) {
      throw new Error('Invalid room code');
    }
    // Reserved for future per-room passwords:
    //   if (token !== expectedFor(documentName)) throw new Error('Forbidden');
  },

  async onConnect({ documentName }) {
    console.log(`[collab] connect room=${documentName}`);
  },

  async onDisconnect({ documentName, clientsCount }) {
    console.log(`[collab] disconnect room=${documentName} remaining=${clientsCount}`);
  },
});

server
  .listen()
  .then(() => console.log(`[collab] listening on ws://0.0.0.0:${PORT} (db=${DB_PATH})`))
  .catch((err) => {
    console.error('[collab] failed to start:', err);
    process.exit(1);
  });
