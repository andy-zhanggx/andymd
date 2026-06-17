// Owns the network side of one collaborative document: a Y.Doc, the Hocuspocus
// provider that syncs it with the relay, and the awareness channel for presence.
// The editor side (binding the Milkdown collab service to this doc/awareness) is
// wired in MarkdownEditor once the editor instance exists.
import { Doc } from 'yjs';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import type { CollabUser } from './identity';

export type CollabStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface Peer {
  clientId: number;
  name: string;
  color: string;
  /** True for the local client. */
  self: boolean;
}

export interface CollabSessionOpts {
  serverUrl: string;
  code: string;
  user: CollabUser;
  onStatus: (status: CollabStatus) => void;
  onPeers: (peers: Peer[]) => void;
  onAuthFailed: (reason: string) => void;
}

export class CollabSession {
  readonly doc: Doc;
  readonly provider: HocuspocusProvider;
  readonly user: CollabUser;
  private hadConnection = false;
  private destroyed = false;
  private readonly emitPeers: (peers: Peer[]) => void;
  private awarenessHandler?: () => void;

  constructor(opts: CollabSessionOpts) {
    this.emitPeers = opts.onPeers;
    this.user = opts.user;
    this.doc = new Doc();
    this.provider = new HocuspocusProvider({
      url: opts.serverUrl,
      name: opts.code,
      document: this.doc,
      // MVP: the code is the credential. The server only checks code shape.
      token: opts.code,
      onStatus: ({ status }) => {
        if (this.destroyed) return;
        if (status === WebSocketStatus.Connected) {
          this.hadConnection = true;
          opts.onStatus('connected');
        } else if (status === WebSocketStatus.Connecting) {
          // A reconnect after a prior successful connection vs. the first attempt.
          opts.onStatus(this.hadConnection ? 'reconnecting' : 'connecting');
        }
      },
      onConnect: () => this.setupAwareness(),
      onAuthenticationFailed: ({ reason }) => {
        if (this.destroyed) return;
        opts.onStatus('error');
        opts.onAuthFailed(reason || 'Authentication failed');
      },
    });

    // The provider's awareness may not exist until it connects, so try now and
    // again on connect (setupAwareness is idempotent).
    this.setupAwareness();
  }

  /**
   * Attach the awareness listener and broadcast our identity. We listen on the
   * awareness object's `update` event (fires for both local and remote changes)
   * rather than the provider's onAwarenessChange (remote only), so a solo host
   * still sees themselves in the roster. Idempotent.
   */
  private setupAwareness() {
    if (this.destroyed) return;
    const aw = this.provider.awareness;
    if (!aw) return;
    if (!this.awarenessHandler) {
      this.awarenessHandler = () => {
        if (!this.destroyed) this.emitPeers(this.peers());
      };
      aw.on('update', this.awarenessHandler);
    }
    this.provider.setAwarenessField('user', this.user);
    this.emitPeers(this.peers());
  }

  get awareness(): Awareness | null {
    return this.provider.awareness;
  }

  get isSynced(): boolean {
    return this.provider.isSynced;
  }

  /** Resolves once the initial server sync completes. */
  whenSynced(): Promise<void> {
    if (this.provider.isSynced) return Promise.resolve();
    return new Promise((resolve) => {
      const handler = ({ state }: { state: boolean }) => {
        if (state) {
          this.provider.off('synced', handler);
          resolve();
        }
      };
      this.provider.on('synced', handler);
    });
  }

  private peers(): Peer[] {
    const states = this.awareness?.getStates();
    const localId = this.awareness?.clientID;
    if (!states) return [];
    const out: Peer[] = [];
    states.forEach((state, clientId) => {
      const user = (state as { user?: CollabUser }).user;
      if (!user) return;
      out.push({
        clientId,
        name: user.name,
        color: user.color,
        self: clientId === localId,
      });
    });
    return out;
  }

  destroy() {
    this.destroyed = true;
    try {
      if (this.awarenessHandler) this.awareness?.off('update', this.awarenessHandler);
      this.awareness?.setLocalState(null);
    } catch {
      /* awareness may already be torn down */
    }
    this.provider.destroy();
    this.doc.destroy();
  }
}
