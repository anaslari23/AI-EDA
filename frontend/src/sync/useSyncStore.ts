/**
 * useSyncStore — Zustand store for collaborative sync state.
 *
 * Bridges SyncClient ↔ CircuitStore:
 * - Watches circuit state changes → pushes diffs
 * - Receives remote diffs → applies to circuit state
 * - Tracks connected peers
 */

import { create } from 'zustand';

import { useCircuitStore } from '../engine/graph/circuitStore';

import type { DiffOp, PeerInfo } from './protocol';
import { SyncClient } from './SyncClient';
import type { SyncClientConfig } from './SyncClient';
import { CRDTManager } from './CRDTManager';

// ─── State ───

interface SyncState {
    connected: boolean;
    peers: PeerInfo[];
    version: number;
    offlineQueueSize: number;
    lastError: string | null;
    syncing: boolean;
}

interface SyncActions {
    /** Start sync session for a circuit */
    startSync(config: SyncClientConfig): void;
    /** Stop sync session */
    stopSync(): void;
    /** Push local changes */
    pushLocalChanges(): void;
    /** Get the sync client for advanced use */
    getClient(): SyncClient | null;
}

export type SyncStore = SyncState & SyncActions;

// ─── Initial State ───

const initialState: SyncState = {
    connected: false,
    peers: [],
    version: 0,
    offlineQueueSize: 0,
    lastError: null,
    syncing: false,
};

// ─── Store ───

let client: SyncClient | null = null;
let previousStateSnapshot: Record<string, unknown> | null = null;
let unsubscribeCircuitStore: (() => void) | null = null;

export const useSyncStore = create<SyncStore>((set, get) => ({
    ...initialState,

    startSync: (config) => {
        // Clean up existing
        get().stopSync();

        client = new SyncClient(config, {
            onConnectionChange: (connected) => {
                set({
                    connected,
                    offlineQueueSize: client?.offlineQueueSize ?? 0,
                });
            },

            onRemoteDiffs: (diffs, _sourcePeerId) => {
                // Apply remote diffs to circuit state
                applyRemoteDiffsToCircuit(diffs);
                set({ version: client?.currentVersion ?? 0 });
            },

            onFullState: (state, version) => {
                // Load full state into circuit store
                const circuitStore = useCircuitStore.getState();
                if (state && typeof state === 'object') {
                    try {
                        const snapshot = state as {
                            nodes?: unknown[];
                            nets?: unknown[];
                            edges?: unknown[];
                            voltageDomains?: unknown[];
                            groundNetId?: string | null;
                            version?: number;
                        };
                        circuitStore.loadSnapshot({
                            nodes: (snapshot.nodes ?? []) as any[],
                            nets: (snapshot.nets ?? []) as any[],
                            edges: (snapshot.edges ?? []) as any[],
                            voltageDomains: (snapshot.voltageDomains ?? []) as any[],
                            groundNetId: snapshot.groundNetId ?? null,
                            version: snapshot.version ?? version,
                        });
                    } catch {
                        // State format mismatch — ignore
                    }
                }
                set({ version, syncing: false });
            },

            onPeerJoin: (peer) => {
                set((s) => ({ peers: [...s.peers, peer] }));
            },

            onPeerLeave: (peerId) => {
                set((s) => ({
                    peers: s.peers.filter((p) => p.peerId !== peerId),
                }));
            },

            onAck: (version, rejectedPaths) => {
                set({
                    version,
                    offlineQueueSize: client?.offlineQueueSize ?? 0,
                });
                if (rejectedPaths.length > 0) {
                    console.warn('[Sync] Rejected paths:', rejectedPaths);
                }
            },

            onError: (code, message) => {
                set({ lastError: `${code}: ${message}` });
            },
        });

        // Subscribe to circuit store changes → push diffs
        previousStateSnapshot = captureCircuitSnapshot();

        unsubscribeCircuitStore = useCircuitStore.subscribe(() => {
            const current = captureCircuitSnapshot();
            if (!previousStateSnapshot || !current) return;

            const diffs = CRDTManager.computeDiffs(previousStateSnapshot, current);
            if (diffs.length > 0 && client) {
                client.pushDiffs(diffs);
            }
            previousStateSnapshot = current;
        });

        client.connect();
        set({ syncing: true });
    },

    stopSync: () => {
        client?.disconnect();
        client = null;

        unsubscribeCircuitStore?.();
        unsubscribeCircuitStore = null;
        previousStateSnapshot = null;

        set(initialState);
    },

    pushLocalChanges: () => {
        if (!client) return;

        const current = captureCircuitSnapshot();
        if (!previousStateSnapshot || !current) return;

        const diffs = CRDTManager.computeDiffs(previousStateSnapshot, current);
        if (diffs.length > 0) {
            client.pushDiffs(diffs);
        }
        previousStateSnapshot = current;
    },

    getClient: () => client,
}));

// ─── Helpers ───

function captureCircuitSnapshot(): Record<string, unknown> | null {
    try {
        const state = useCircuitStore.getState();
        return {
            nodes: state.nodes,
            nets: state.nets,
            edges: state.edges,
            voltageDomains: state.voltageDomains,
            groundNetId: state.groundNetId,
            version: state.version,
        } as Record<string, unknown>;
    } catch {
        return null;
    }
}

function applyRemoteDiffsToCircuit(diffs: DiffOp[]): void {
    const circuitStore = useCircuitStore.getState();

    for (const diff of diffs) {
        const parts = diff.path.split('.');

        // Handle node-level operations: nodes.<id>
        if (parts[0] === 'nodes' && parts.length >= 2) {
            const nodeId = parts[1];

            if (diff.op === 'add' && parts.length === 2 && diff.value) {
                circuitStore.addComponent(diff.value as any);
            } else if (diff.op === 'remove' && parts.length === 2) {
                circuitStore.removeComponent(nodeId);
            } else if (diff.op === 'update' && parts.length > 2) {
                const node = circuitStore.nodes[nodeId];
                if (node) {
                    const updates: Record<string, unknown> = {};
                    const field = parts.slice(2).join('.');
                    updates[field] = diff.value;
                    circuitStore.updateComponent(nodeId, updates);
                }
            }
        }

        // Handle net operations: nets.<id>
        if (parts[0] === 'nets' && parts.length === 2) {
            if (diff.op === 'update' && diff.value) {
                circuitStore.renameNet(parts[1], (diff.value as { name?: string }).name ?? '');
            }
        }
    }

    // Re-snapshot after remote apply to prevent echo
    previousStateSnapshot = captureCircuitSnapshot();
}
