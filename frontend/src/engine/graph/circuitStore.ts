/**
 * Circuit Graph Store — Zustand + Immer
 *
 * Manages the logical circuit graph state entirely in the frontend.
 * Instant local updates when connecting wires.
 * Backend only receives a full snapshot on explicit save.
 *
 * No backend dependency for graph updates.
 */

import { create } from 'zustand';
import { produce } from 'immer';

import type {
    CircuitState,
    CircuitSnapshot,
    ComponentNode,
    GraphPin,
    GraphEdge,
    Net,
    ConnectionCheckResult,
} from './models';

import {
    createNet,
    mergeNets,
    removePinFromNet,
    rebuildVoltageDomains,
    tagPinsWithDomain,
    generateNetId,
    generateNetName,
} from './netOperations';

import {
    checkConnection,
    validateNetPinDirections,
} from './pinValidation';

// ─── Store Actions ───

interface CircuitActions {
    // ─── Component CRUD ───
    addComponent(node: ComponentNode): void;
    removeComponent(nodeId: string): void;
    updateComponent(nodeId: string, updates: Partial<ComponentNode>): void;

    // ─── Connection ───
    /** Check if a connection is allowed before making it */
    canConnect(sourcePinId: string, targetPinId: string): ConnectionCheckResult;
    /** Connect two pins — creates edge, assigns/merges nets */
    connect(sourcePinId: string, targetPinId: string): boolean;
    /** Disconnect an edge — removes edge, splits nets if needed */
    disconnect(edgeId: string): void;

    // ─── Net Management ───
    renameNet(netId: string, name: string): void;

    // ─── Voltage Domains ───
    rebuildDomains(): void;

    // ─── Snapshot (for backend save) ───
    getSnapshot(): CircuitSnapshot;
    loadSnapshot(snapshot: CircuitSnapshot): void;

    // ─── Utility ───
    findPin(pinId: string): { pin: GraphPin; node: ComponentNode } | null;
    getNetForPin(pinId: string): Net | null;
    reset(): void;
}

export type CircuitStore = CircuitState & CircuitActions;

// ─── Initial State ───

const initialState: CircuitState = {
    nodes: {},
    nets: {},
    edges: {},
    voltageDomains: {},
    groundNetId: null,
    version: 0,
    isDirty: false,
};

// ─── Store ───

export const useCircuitStore = create<CircuitStore>((set, get) => ({
    ...initialState,

    // ─── Component CRUD ───

    addComponent: (node) =>
        set(
            produce((draft: CircuitState) => {
                draft.nodes[node.id] = node;
                draft.version++;
                draft.isDirty = true;
            }),
        ),

    removeComponent: (nodeId) =>
        set(
            produce((draft: CircuitState) => {
                const node = draft.nodes[nodeId];
                if (!node) return;

                // Remove all edges connected to this component
                for (const [edgeId, edge] of Object.entries(draft.edges)) {
                    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
                        delete draft.edges[edgeId];
                    }
                }

                // Remove pins from their nets
                for (const pin of node.pins) {
                    if (pin.netId && draft.nets[pin.netId]) {
                        const net = draft.nets[pin.netId];
                        net.pinIds = net.pinIds.filter((id) => id !== pin.id);
                        if (net.pinIds.length === 0) {
                            delete draft.nets[pin.netId];
                        } else {
                            net.dirty = true;
                        }
                    }
                }

                delete draft.nodes[nodeId];
                draft.version++;
                draft.isDirty = true;
            }),
        ),

    updateComponent: (nodeId, updates) =>
        set(
            produce((draft: CircuitState) => {
                const node = draft.nodes[nodeId];
                if (!node) return;
                Object.assign(node, updates);
                draft.version++;
                draft.isDirty = true;
            }),
        ),

    // ─── Connection Check ───

    canConnect: (sourcePinId, targetPinId) => {
        const state = get();
        const src = findPinInState(state, sourcePinId);
        const tgt = findPinInState(state, targetPinId);

        if (!src || !tgt) {
            return { allowed: false, reason: 'Pin not found', mergeInfo: null };
        }

        return checkConnection(src.pin, tgt.pin, state);
    },

    // ─── Connect ───

    connect: (sourcePinId, targetPinId) => {
        const state = get();
        const check = state.canConnect(sourcePinId, targetPinId);
        if (!check.allowed || !check.mergeInfo) return false;

        set(
            produce((draft: CircuitState) => {
                const src = findPinInState(draft, sourcePinId);
                const tgt = findPinInState(draft, targetPinId);
                if (!src || !tgt) return;

                const mi = check.mergeInfo!;

                // Resolve net
                let resultNet: Net;
                if (mi.sourceNetId && mi.targetNetId) {
                    // Merge two existing nets
                    const netA = draft.nets[mi.sourceNetId];
                    const netB = draft.nets[mi.targetNetId];
                    resultNet = mergeNets(netA, netB);
                    draft.nets[mi.sourceNetId] = resultNet;
                    // Update all pins from netB to point to merged net
                    for (const pinId of netB.pinIds) {
                        const p = findPinInState(draft, pinId);
                        if (p) p.pin.netId = resultNet.id;
                    }
                    delete draft.nets[mi.targetNetId];
                } else if (mi.sourceNetId) {
                    resultNet = draft.nets[mi.sourceNetId];
                    resultNet.pinIds.push(targetPinId);
                    resultNet.dirty = true;
                } else if (mi.targetNetId) {
                    resultNet = draft.nets[mi.targetNetId];
                    resultNet.pinIds.push(sourcePinId);
                    resultNet.dirty = true;
                } else {
                    // Create new net
                    resultNet = {
                        id: mi.resultNetId,
                        name: mi.resultNetName,
                        pinIds: [sourcePinId, targetPinId],
                        signalType: src.pin.signalType,
                        voltage: src.pin.voltage ?? tgt.pin.voltage,
                        voltageDomain: src.pin.voltageDomain ?? tgt.pin.voltageDomain,
                        dirty: true,
                    };
                    draft.nets[resultNet.id] = resultNet;
                }

                // Update pin net assignments
                src.pin.netId = resultNet.id;
                tgt.pin.netId = resultNet.id;

                // Propagate voltage if one pin has it
                if (resultNet.voltage != null) {
                    for (const pinId of resultNet.pinIds) {
                        const p = findPinInState(draft, pinId);
                        if (p) p.pin.voltage = resultNet.voltage;
                    }
                }

                // Create edge
                const edgeId = `edge_${draft.version}_${sourcePinId.slice(-4)}`;
                draft.edges[edgeId] = {
                    id: edgeId,
                    sourcePinId,
                    targetPinId,
                    sourceNodeId: src.node.id,
                    targetNodeId: tgt.node.id,
                    netId: resultNet.id,
                };

                // Track ground net
                if (
                    resultNet.signalType === 'ground' &&
                    !draft.groundNetId
                ) {
                    draft.groundNetId = resultNet.id;
                }

                draft.version++;
                draft.isDirty = true;
            }),
        );

        return true;
    },

    // ─── Disconnect ───

    disconnect: (edgeId) =>
        set(
            produce((draft: CircuitState) => {
                const edge = draft.edges[edgeId];
                if (!edge) return;

                const netId = edge.netId;
                const net = draft.nets[netId];

                // Remove edge
                delete draft.edges[edgeId];

                if (!net) {
                    draft.version++;
                    return;
                }

                // Check if pins still have other edges on this net
                const srcStillConnected = Object.values(draft.edges).some(
                    (e) =>
                        e.netId === netId &&
                        (e.sourcePinId === edge.sourcePinId ||
                            e.targetPinId === edge.sourcePinId),
                );
                const tgtStillConnected = Object.values(draft.edges).some(
                    (e) =>
                        e.netId === netId &&
                        (e.sourcePinId === edge.targetPinId ||
                            e.targetPinId === edge.targetPinId),
                );

                if (!srcStillConnected) {
                    net.pinIds = net.pinIds.filter((id) => id !== edge.sourcePinId);
                    const srcP = findPinInState(draft, edge.sourcePinId);
                    if (srcP) srcP.pin.netId = null;
                }

                if (!tgtStillConnected) {
                    net.pinIds = net.pinIds.filter((id) => id !== edge.targetPinId);
                    const tgtP = findPinInState(draft, edge.targetPinId);
                    if (tgtP) tgtP.pin.netId = null;
                }

                // Clean up empty net
                if (net.pinIds.length === 0) {
                    delete draft.nets[netId];
                    if (draft.groundNetId === netId) {
                        draft.groundNetId = null;
                    }
                } else {
                    net.dirty = true;
                }

                draft.version++;
                draft.isDirty = true;
            }),
        ),

    // ─── Net Management ───

    renameNet: (netId, name) =>
        set(
            produce((draft: CircuitState) => {
                if (draft.nets[netId]) {
                    draft.nets[netId].name = name;
                    draft.version++;
                }
            }),
        ),

    // ─── Voltage Domains ───

    rebuildDomains: () =>
        set(
            produce((draft: CircuitState) => {
                draft.voltageDomains = rebuildVoltageDomains(draft);

                // Tag nets and pins with voltage domains
                for (const domain of Object.values(draft.voltageDomains)) {
                    for (const netId of domain.netIds) {
                        tagPinsWithDomain(draft, netId, domain.name);
                    }
                    // Tag consumer nodes
                    for (const nodeId of domain.consumerNodeIds) {
                        const node = draft.nodes[nodeId];
                        if (node && !node.voltageDomains.includes(domain.name)) {
                            node.voltageDomains.push(domain.name);
                        }
                    }
                }

                draft.version++;
            }),
        ),

    // ─── Snapshot (for backend save) ───

    getSnapshot: () => {
        const s = get();
        return {
            nodes: Object.values(s.nodes),
            nets: Object.values(s.nets),
            edges: Object.values(s.edges),
            voltageDomains: Object.values(s.voltageDomains),
            groundNetId: s.groundNetId,
            version: s.version,
        };
    },

    loadSnapshot: (snapshot) =>
        set(
            produce((draft: CircuitState) => {
                draft.nodes = {};
                for (const n of snapshot.nodes) draft.nodes[n.id] = n;
                draft.nets = {};
                for (const n of snapshot.nets) draft.nets[n.id] = n;
                draft.edges = {};
                for (const e of snapshot.edges) draft.edges[e.id] = e;
                draft.voltageDomains = {};
                for (const d of snapshot.voltageDomains) draft.voltageDomains[d.id] = d;
                draft.groundNetId = snapshot.groundNetId;
                draft.version = snapshot.version;
                draft.isDirty = false;
            }),
        ),

    // ─── Utility ───

    findPin: (pinId) => findPinInState(get(), pinId),

    getNetForPin: (pinId) => {
        const state = get();
        const result = findPinInState(state, pinId);
        if (!result || !result.pin.netId) return null;
        return state.nets[result.pin.netId] ?? null;
    },

    reset: () => set(initialState),
}));

// ─── Helper ───

function findPinInState(
    state: CircuitState,
    pinId: string,
): { pin: GraphPin; node: ComponentNode } | null {
    for (const node of Object.values(state.nodes)) {
        const pin = node.pins.find((p) => p.id === pinId);
        if (pin) return { pin, node };
    }
    return null;
}
