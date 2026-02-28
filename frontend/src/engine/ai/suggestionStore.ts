/**
 * Suggestion Store — Zustand store for AI suggestion preview.
 *
 * Manages the preview lifecycle:
 * 1. Receive AI suggestion → compute diff → show preview
 * 2. User accepts/rejects individual items
 * 3. User confirms → merge into circuit graph
 * 4. Or user dismisses → clear preview
 */

import { create } from 'zustand';

import type { CircuitState } from '../graph/models';
import { useCircuitStore } from '../graph/circuitStore';

import type {
    AISuggestion,
    SuggestionDiff,
    SuggestionPreviewItem,
    SuggestionPreviewState,
    SuggestionItemStatus,
    UserEditLog,
} from './types';

import { diffSuggestion } from './diffEngine';
import {
    mergeSuggestion,
    getAcceptedIds,
    acceptAllSafe,
    rejectAll,
} from './mergeEngine';

// ─── Actions ───

interface SuggestionActions {
    /** Load an AI suggestion and compute diff against current graph */
    preview(suggestion: AISuggestion): void;

    /** Set the status of a single item */
    setItemStatus(itemId: string, status: SuggestionItemStatus): void;

    /** Accept all non-conflicting items */
    acceptAll(): void;

    /** Reject all items */
    rejectAll(): void;

    /** Commit accepted items to the circuit graph */
    commit(): void;

    /** Dismiss the suggestion without applying */
    dismiss(): void;

    /** Update the user edit log (call when user manually edits graph) */
    trackUserEdit(
        type: 'addNode' | 'modifyNode' | 'addEdge' | 'renameNet',
        id: string,
    ): void;
}

export type SuggestionStore = SuggestionPreviewState &
    SuggestionActions & {
        userEdits: UserEditLog;
    };

// ─── Initial State ───

const initialPreview: SuggestionPreviewState = {
    active: false,
    suggestion: null,
    diff: null,
    items: [],
    allReviewed: false,
    highlightNodeIds: new Set(),
    highlightEdgeIds: new Set(),
};

const initialUserEdits: UserEditLog = {
    addedNodeIds: new Set(),
    modifiedNodeIds: new Set(),
    addedEdgeIds: new Set(),
    renamedNetIds: new Set(),
};

// ─── Store ───

export const useSuggestionStore = create<SuggestionStore>((set, get) => ({
    ...initialPreview,
    userEdits: { ...initialUserEdits },

    // ─── Preview ───

    preview: (suggestion) => {
        const circuitState = useCircuitStore.getState();
        const state: CircuitState = {
            nodes: circuitState.nodes,
            nets: circuitState.nets,
            edges: circuitState.edges,
            voltageDomains: circuitState.voltageDomains,
            groundNetId: circuitState.groundNetId,
            version: circuitState.version,
            isDirty: circuitState.isDirty,
        };

        const diff = diffSuggestion(suggestion, state, get().userEdits);
        const items = buildPreviewItems(diff);

        // Collect all affected node IDs for highlighting
        const highlightNodeIds = new Set<string>();
        const highlightEdgeIds = new Set<string>();
        for (const item of items) {
            for (const nodeId of item.affectedNodeIds) {
                highlightNodeIds.add(nodeId);
            }
        }

        set({
            active: true,
            suggestion,
            diff,
            items,
            allReviewed: false,
            highlightNodeIds,
            highlightEdgeIds,
        });
    },

    // ─── Item Status ───

    setItemStatus: (itemId, status) => {
        set((s) => {
            const items = s.items.map((item) =>
                item.id === itemId ? { ...item, status } : item,
            );
            const allReviewed = items.every(
                (item) => item.status !== 'pending',
            );
            return { items, allReviewed };
        });
    },

    acceptAll: () => {
        set((s) => {
            const items = acceptAllSafe(s.items);
            return { items, allReviewed: true };
        });
    },

    rejectAll: () => {
        set((s) => {
            const items = rejectAll(s.items);
            return { items, allReviewed: true };
        });
    },

    // ─── Commit ───

    commit: () => {
        const { diff, items } = get();
        if (!diff) return;

        const circuitState = useCircuitStore.getState();
        const state: CircuitState = {
            nodes: circuitState.nodes,
            nets: circuitState.nets,
            edges: circuitState.edges,
            voltageDomains: circuitState.voltageDomains,
            groundNetId: circuitState.groundNetId,
            version: circuitState.version,
            isDirty: circuitState.isDirty,
        };

        const acceptedIds = getAcceptedIds(items);
        const result = mergeSuggestion(state, diff, acceptedIds);

        // Apply new state to circuit store via loadSnapshot
        useCircuitStore.getState().loadSnapshot({
            nodes: Object.values(result.newState.nodes),
            nets: Object.values(result.newState.nets),
            edges: Object.values(result.newState.edges),
            voltageDomains: Object.values(result.newState.voltageDomains),
            groundNetId: result.newState.groundNetId,
            version: result.newState.version,
        });

        // Clear preview
        set({ ...initialPreview });
    },

    // ─── Dismiss ───

    dismiss: () => {
        set({ ...initialPreview });
    },

    // ─── User Edit Tracking ───

    trackUserEdit: (type, id) => {
        set((s) => {
            const edits = { ...s.userEdits };
            switch (type) {
                case 'addNode':
                    edits.addedNodeIds = new Set(edits.addedNodeIds).add(id);
                    break;
                case 'modifyNode':
                    edits.modifiedNodeIds = new Set(edits.modifiedNodeIds).add(id);
                    break;
                case 'addEdge':
                    edits.addedEdgeIds = new Set(edits.addedEdgeIds).add(id);
                    break;
                case 'renameNet':
                    edits.renamedNetIds = new Set(edits.renamedNetIds).add(id);
                    break;
            }
            return { userEdits: edits };
        });
    },
}));

// ─── Preview Item Builder ───

function buildPreviewItems(
    diff: SuggestionDiff,
): SuggestionPreviewItem[] {
    const items: SuggestionPreviewItem[] = [];

    for (const d of diff.components) {
        const id = d.merged?.id ?? d.suggested?.id ?? '';
        items.push({
            id,
            kind: 'component',
            action: d.action,
            status: d.conflictsWithUser ? 'conflict' : 'pending',
            label: d.suggested?.label ?? d.existing?.label ?? id,
            description: describeAction(d.action, 'component', d.conflictsWithUser),
            affectedNodeIds: id ? [id] : [],
            diff: d,
        });
    }

    for (const d of diff.nets) {
        const id = d.merged?.id ?? d.suggested?.id ?? '';
        items.push({
            id,
            kind: 'net',
            action: d.action,
            status: d.conflictsWithUser ? 'conflict' : 'pending',
            label: d.suggested?.name ?? d.existing?.name ?? id,
            description: describeAction(d.action, 'net', d.conflictsWithUser),
            affectedNodeIds: [],
            diff: d,
        });
    }

    for (const d of diff.connections) {
        const id = d.merged?.id ?? d.suggested?.id ?? '';
        const nodes = d.suggested
            ? [d.suggested.sourceNodeId, d.suggested.targetNodeId]
            : [];
        items.push({
            id,
            kind: 'connection',
            action: d.action,
            status: d.conflictsWithUser ? 'conflict' : 'pending',
            label: id,
            description: describeAction(d.action, 'connection', d.conflictsWithUser),
            affectedNodeIds: nodes,
            diff: d,
        });
    }

    return items;
}

function describeAction(
    action: string,
    kind: string,
    conflict: boolean,
): string {
    if (conflict) return `⚠ Conflicts with your manual edits — ${kind} kept as-is`;
    switch (action) {
        case 'add': return `Add new ${kind}`;
        case 'modify': return `Update existing ${kind}`;
        case 'keep': return `${kind} already exists`;
        case 'remove': return `Remove ${kind}`;
        default: return action;
    }
}
