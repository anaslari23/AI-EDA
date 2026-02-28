export { SyncClient } from './SyncClient';
export type { SyncClientConfig, SyncClientCallbacks } from './SyncClient';
export { CRDTManager, createHLC, tickHLC, mergeHLC, compareHLC } from './CRDTManager';
export { useSyncStore } from './useSyncStore';
export type { SyncStore } from './useSyncStore';
export { generatePeerId } from './protocol';
export type {
    HLCTimestamp,
    DiffOp,
    SyncMessage,
    SyncPushMessage,
    SyncPullMessage,
    SyncFullState,
    SyncAck,
    SyncPeerJoin,
    SyncPeerLeave,
    SyncError,
    PeerInfo,
} from './protocol';
