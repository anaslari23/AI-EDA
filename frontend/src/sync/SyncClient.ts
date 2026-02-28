/**
 * SyncClient — WebSocket client with offline queue and auto-reconnect.
 *
 * Sends state diffs (not full state) to the server.
 * Buffers diffs while offline and replays on reconnect.
 * Integrates with CRDTManager for conflict resolution.
 */

import type {
    SyncMessage,
    SyncPushMessage,
    SyncRequestFull,
    SyncPullMessage,
    SyncFullState,
    SyncAck,
    SyncPeerJoin,
    SyncPeerLeave,
    SyncError,
    DiffOp,
    PeerInfo,
} from './protocol';
import { generatePeerId } from './protocol';
import { CRDTManager } from './CRDTManager';

// ─── Config ───

export interface SyncClientConfig {
    url: string;
    circuitId: string;
    displayName: string;
    color?: string;
    reconnectIntervalMs?: number;
    maxReconnectAttempts?: number;
    maxOfflineQueueSize?: number;
}

// ─── Event Callbacks ───

export interface SyncClientCallbacks {
    onRemoteDiffs?: (diffs: DiffOp[], sourcePeerId: string) => void;
    onFullState?: (state: unknown, version: number) => void;
    onPeerJoin?: (peer: PeerInfo) => void;
    onPeerLeave?: (peerId: string) => void;
    onAck?: (version: number, rejectedPaths: string[]) => void;
    onError?: (code: string, message: string) => void;
    onConnectionChange?: (connected: boolean) => void;
}

// ─── Client ───

export class SyncClient {
    private ws: WebSocket | null = null;
    private config: Required<SyncClientConfig>;
    private callbacks: SyncClientCallbacks;
    private crdt: CRDTManager;

    readonly peerId: string;
    private connected = false;
    private reconnectCount = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /** Offline buffer: diffs queued while disconnected */
    private offlineQueue: SyncPushMessage[] = [];
    private version = 0;

    constructor(config: SyncClientConfig, callbacks: SyncClientCallbacks = {}) {
        this.config = {
            color: '#4FC3F7',
            reconnectIntervalMs: 2000,
            maxReconnectAttempts: 20,
            maxOfflineQueueSize: 500,
            ...config,
        };
        this.callbacks = callbacks;
        this.peerId = generatePeerId();
        this.crdt = new CRDTManager(this.peerId);
    }

    // ─── Connection ───

    connect(): void {
        if (this.ws) return;

        try {
            const url = `${this.config.url}?circuitId=${this.config.circuitId}&peerId=${this.peerId}&name=${encodeURIComponent(this.config.displayName)}&color=${encodeURIComponent(this.config.color)}`;

            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected = true;
                this.reconnectCount = 0;
                this.callbacks.onConnectionChange?.(true);

                // Request full state on connect
                this.sendRaw({
                    type: 'SYNC_REQUEST_FULL',
                    circuitId: this.config.circuitId,
                    peerId: this.peerId,
                });

                // Flush offline queue
                this.flushOfflineQueue();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data) as SyncMessage;
                    this.handleMessage(msg);
                } catch {
                    // Ignore parse errors
                }
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.ws = null;
                this.callbacks.onConnectionChange?.(false);
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                // onclose will fire after this
            };
        } catch {
            this.scheduleReconnect();
        }
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectCount = this.config.maxReconnectAttempts; // Prevent auto-reconnect
        this.ws?.close();
        this.ws = null;
        this.connected = false;
    }

    // ─── Send Diffs ───

    /**
     * Push local diffs to server. If offline, queued for replay.
     */
    pushDiffs(diffs: DiffOp[]): void {
        if (diffs.length === 0) return;

        const { diffs: applied, clock } = this.crdt.applyLocal(diffs);

        const msg: SyncPushMessage = {
            type: 'SYNC_PUSH',
            circuitId: this.config.circuitId,
            peerId: this.peerId,
            clock,
            diffs: applied,
            baseVersion: this.version,
        };

        if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
            this.sendRaw(msg);
        } else {
            // Offline buffer
            if (this.offlineQueue.length < this.config.maxOfflineQueueSize) {
                this.offlineQueue.push(msg);
            }
        }
    }

    // ─── Message Handling ───

    private handleMessage(msg: SyncMessage): void {
        switch (msg.type) {
            case 'SYNC_PULL': {
                const pull = msg as SyncPullMessage;
                if (pull.sourcePeerId === this.peerId) break; // Ignore own echo

                const { accepted } = this.crdt.applyRemote(pull.diffs, pull.clock);
                this.version = pull.version;

                if (accepted.length > 0) {
                    this.callbacks.onRemoteDiffs?.(accepted, pull.sourcePeerId);
                }
                break;
            }

            case 'SYNC_FULL_STATE': {
                const full = msg as SyncFullState;
                this.crdt.loadFullState(
                    full.state as Record<string, unknown>,
                    full.clock,
                );
                this.version = full.version;
                this.callbacks.onFullState?.(full.state, full.version);
                break;
            }

            case 'SYNC_ACK': {
                const ack = msg as SyncAck;
                this.version = ack.version;
                this.callbacks.onAck?.(ack.version, ack.rejectedPaths);
                break;
            }

            case 'PEER_JOIN': {
                const join = msg as SyncPeerJoin;
                if (join.peer.peerId !== this.peerId) {
                    this.callbacks.onPeerJoin?.(join.peer);
                }
                break;
            }

            case 'PEER_LEAVE': {
                const leave = msg as SyncPeerLeave;
                this.callbacks.onPeerLeave?.(leave.peerId);
                break;
            }

            case 'SYNC_ERROR': {
                const err = msg as SyncError;
                this.callbacks.onError?.(err.code, err.message);
                break;
            }
        }
    }

    // ─── Reconnect ───

    private scheduleReconnect(): void {
        if (this.reconnectCount >= this.config.maxReconnectAttempts) return;

        const delay = this.config.reconnectIntervalMs * Math.pow(1.5, this.reconnectCount);
        this.reconnectCount++;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, Math.min(delay, 30_000));
    }

    private flushOfflineQueue(): void {
        const queue = [...this.offlineQueue];
        this.offlineQueue = [];

        for (const msg of queue) {
            // Re-base to current version
            msg.baseVersion = this.version;
            this.sendRaw(msg);
        }
    }

    // ─── Raw Send ───

    private sendRaw(msg: SyncMessage | SyncRequestFull | SyncPushMessage): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    // ─── Accessors ───

    get isConnected(): boolean {
        return this.connected;
    }

    get currentVersion(): number {
        return this.version;
    }

    get offlineQueueSize(): number {
        return this.offlineQueue.length;
    }

    getCRDT(): CRDTManager {
        return this.crdt;
    }
}
