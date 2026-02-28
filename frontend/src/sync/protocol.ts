/**
 * Sync Protocol — Message types for collaborative real-time sync.
 *
 * Uses state diffs (not full state) over WebSocket.
 * CRDT clocks for conflict-free merge ordering.
 */

// ─── Hybrid Logical Clock (HLC) ───

export interface HLCTimestamp {
    /** Physical wall-clock millis */
    wall: number;
    /** Logical counter for same-wall events */
    logical: number;
    /** Peer ID that generated this timestamp */
    peerId: string;
}

// ─── Diff Operations ───

export type DiffOp =
    | { op: 'add'; path: string; value: unknown }
    | { op: 'update'; path: string; value: unknown; oldValue?: unknown }
    | { op: 'remove'; path: string; oldValue?: unknown };

// ─── Sync Messages (Client ↔ Server) ───

/** Client sends diffs to server */
export interface SyncPushMessage {
    type: 'SYNC_PUSH';
    circuitId: string;
    peerId: string;
    clock: HLCTimestamp;
    diffs: DiffOp[];
    /** Base version this diff applies to */
    baseVersion: number;
}

/** Server broadcasts merged diffs to peers */
export interface SyncPullMessage {
    type: 'SYNC_PULL';
    circuitId: string;
    sourcePeerId: string;
    clock: HLCTimestamp;
    diffs: DiffOp[];
    /** New authoritative version after applying diffs */
    version: number;
}

/** Client requests full state (on join or after offline) */
export interface SyncRequestFull {
    type: 'SYNC_REQUEST_FULL';
    circuitId: string;
    peerId: string;
}

/** Server sends full authoritative state */
export interface SyncFullState {
    type: 'SYNC_FULL_STATE';
    circuitId: string;
    version: number;
    state: unknown;
    clock: HLCTimestamp;
    connectedPeers: PeerInfo[];
}

/** Peer presence events */
export interface SyncPeerJoin {
    type: 'PEER_JOIN';
    peer: PeerInfo;
}

export interface SyncPeerLeave {
    type: 'PEER_LEAVE';
    peerId: string;
}

/** Acknowledgement from server */
export interface SyncAck {
    type: 'SYNC_ACK';
    version: number;
    clock: HLCTimestamp;
    /** Number of diffs accepted */
    acceptedCount: number;
    /** Diffs rejected (conflict that couldn't auto-resolve) */
    rejectedPaths: string[];
}

/** Error from server */
export interface SyncError {
    type: 'SYNC_ERROR';
    code: string;
    message: string;
}

// ─── Union Type ───

export type SyncMessage =
    | SyncPushMessage
    | SyncPullMessage
    | SyncRequestFull
    | SyncFullState
    | SyncPeerJoin
    | SyncPeerLeave
    | SyncAck
    | SyncError;

// ─── Peer Info ───

export interface PeerInfo {
    peerId: string;
    displayName: string;
    color: string;
    joinedAt: number;
    /** Cursor position in world coordinates (optional live cursor) */
    cursor?: { x: number; y: number } | null;
}

// ─── Helper: Generate Peer ID ───

export function generatePeerId(): string {
    return `peer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
