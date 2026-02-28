/**
 * Merge Engine — Applies accepted suggestion items to the circuit graph.
 *
 * Only commits items the user has explicitly accepted.
 * Never overrides user manual edits.
 *
 * Pure TypeScript. No React dependency.
 */

import type {
    CircuitState,
    ComponentNode,
    GraphEdge,
    Net,
} from '../graph/models';

import type {
    SuggestionDiff,
    DiffItem,
    SuggestionPreviewItem,
} from './types';

// ─── Merge Result ───

export interface MergeResult {
    /** Number of components added/modified */
    componentsApplied: number;
    /** Number of nets added/modified */
    netsApplied: number;
    /** Number of connections added */
    connectionsApplied: number;
    /** Items that were skipped (rejected or conflict) */
    skippedCount: number;
    /** The new circuit state after merge */
    newState: CircuitState;
}

// ─── Main Merge ───

/**
 * Apply accepted suggestion items to a circuit state.
 * Returns a new state — does NOT mutate the input.
 */
export function mergeSuggestion(
    state: CircuitState,
    diff: SuggestionDiff,
    acceptedIds: Set<string>,
): MergeResult {
    // Deep clone state for immutable merge
    const newState: CircuitState = {
        nodes: { ...state.nodes },
        nets: { ...state.nets },
        edges: { ...state.edges },
        voltageDomains: { ...state.voltageDomains },
        groundNetId: state.groundNetId,
        version: state.version + 1,
        isDirty: true,
    };

    let componentsApplied = 0;
    let netsApplied = 0;
    let connectionsApplied = 0;
    let skippedCount = 0;

    // Apply components
    for (const item of diff.components) {
        const itemId = item.merged?.id ?? item.suggested?.id;
        if (!itemId || !acceptedIds.has(itemId)) {
            skippedCount++;
            continue;
        }
        if (item.conflictsWithUser) {
            skippedCount++;
            continue;
        }
        if (item.merged) {
            newState.nodes[item.merged.id] = cloneNode(item.merged);
            componentsApplied++;
        }
    }

    // Apply nets
    for (const item of diff.nets) {
        const itemId = item.merged?.id ?? item.suggested?.id;
        if (!itemId || !acceptedIds.has(itemId)) {
            skippedCount++;
            continue;
        }
        if (item.conflictsWithUser) {
            skippedCount++;
            continue;
        }
        if (item.merged) {
            newState.nets[item.merged.id] = { ...item.merged };

            // Update pin.netId for all pins on this net
            for (const pinId of item.merged.pinIds) {
                for (const node of Object.values(newState.nodes)) {
                    const pin = node.pins.find((p) => p.id === pinId);
                    if (pin) {
                        pin.netId = item.merged.id;
                    }
                }
            }

            // Track ground net
            if (item.merged.signalType === 'ground' && !newState.groundNetId) {
                newState.groundNetId = item.merged.id;
            }

            netsApplied++;
        }
    }

    // Apply connections
    for (const item of diff.connections) {
        const itemId = item.merged?.id ?? item.suggested?.id;
        if (!itemId || !acceptedIds.has(itemId)) {
            skippedCount++;
            continue;
        }
        if (item.conflictsWithUser || !item.merged) {
            skippedCount++;
            continue;
        }

        const edge = item.merged;

        // Assign net ID: find or create net
        let netId = edge.netId;
        if (!netId) {
            // Look for an existing net containing either pin
            for (const net of Object.values(newState.nets)) {
                if (
                    net.pinIds.includes(edge.sourcePinId) ||
                    net.pinIds.includes(edge.targetPinId)
                ) {
                    netId = net.id;
                    // Add missing pin
                    if (!net.pinIds.includes(edge.sourcePinId)) {
                        net.pinIds.push(edge.sourcePinId);
                    }
                    if (!net.pinIds.includes(edge.targetPinId)) {
                        net.pinIds.push(edge.targetPinId);
                    }
                    break;
                }
            }

            // Create new net if none found
            if (!netId) {
                netId = `net_ai_${edge.id}`;
                newState.nets[netId] = {
                    id: netId,
                    name: `NET_AI_${connectionsApplied}`,
                    pinIds: [edge.sourcePinId, edge.targetPinId],
                    signalType: 'digital',
                    voltage: null,
                    voltageDomain: null,
                    dirty: true,
                };
            }
        }

        newState.edges[edge.id] = { ...edge, netId };
        connectionsApplied++;
    }

    return {
        componentsApplied,
        netsApplied,
        connectionsApplied,
        skippedCount,
        newState,
    };
}

// ─── Accept/Reject Helpers ───

/**
 * Build the set of accepted IDs from preview items.
 */
export function getAcceptedIds(
    items: SuggestionPreviewItem[],
): Set<string> {
    const ids = new Set<string>();
    for (const item of items) {
        if (item.status === 'accepted') {
            ids.add(item.id);
        }
    }
    return ids;
}

/**
 * Accept all non-conflicting items.
 */
export function acceptAllSafe(
    items: SuggestionPreviewItem[],
): SuggestionPreviewItem[] {
    return items.map((item) => ({
        ...item,
        status: item.status === 'conflict' ? 'conflict' : 'accepted',
    }));
}

/**
 * Reject all items.
 */
export function rejectAll(
    items: SuggestionPreviewItem[],
): SuggestionPreviewItem[] {
    return items.map((item) => ({
        ...item,
        status: item.status === 'conflict' ? 'conflict' : 'rejected',
    }));
}

// ─── Helpers ───

function cloneNode(node: ComponentNode): ComponentNode {
    return {
        ...node,
        pins: node.pins.map((p) => ({ ...p })),
        properties: { ...node.properties },
        voltageDomains: [...node.voltageDomains],
    };
}
