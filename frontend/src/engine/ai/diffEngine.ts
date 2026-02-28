/**
 * Diff Engine — Computes differences between AI suggestion
 * and the current circuit graph.
 *
 * Never modifies state directly. Returns a pure diff result.
 * Pure TypeScript. No React dependency.
 */

import type {
    CircuitState,
    ComponentNode,
    GraphEdge,
    Net,
    GraphPin,
} from '../graph/models';

import type {
    AISuggestion,
    AISuggestedComponent,
    AISuggestedConnection,
    AISuggestedNet,
    SuggestionDiff,
    DiffItem,
    UserEditLog,
} from './types';

// ─── Main Diff ───

export function diffSuggestion(
    suggestion: AISuggestion,
    state: CircuitState,
    userEdits: UserEditLog,
): SuggestionDiff {
    const components = diffComponents(suggestion.components, state, userEdits);
    const nets = diffNets(suggestion.nets, state, userEdits);
    const connections = diffConnections(suggestion.connections, state, userEdits);

    let addCount = 0;
    let modifyCount = 0;
    let removeCount = 0;
    let conflictCount = 0;
    let keepCount = 0;

    const allItems = [
        ...components,
        ...nets,
        ...connections,
    ];

    for (const item of allItems) {
        switch (item.action) {
            case 'add': addCount++; break;
            case 'modify': modifyCount++; break;
            case 'remove': removeCount++; break;
            case 'keep': keepCount++; break;
        }
        if (item.conflictsWithUser) conflictCount++;
    }

    return {
        suggestionId: suggestion.id,
        components,
        nets,
        connections,
        stats: { addCount, modifyCount, removeCount, conflictCount, keepCount },
    };
}

// ─── Component Diffing ───

function diffComponents(
    suggested: AISuggestedComponent[],
    state: CircuitState,
    userEdits: UserEditLog,
): DiffItem<ComponentNode>[] {
    const results: DiffItem<ComponentNode>[] = [];

    for (const sc of suggested) {
        const existing = state.nodes[sc.id];

        if (!existing) {
            // New component — always safe to add
            const node = aiComponentToNode(sc);
            results.push({
                action: 'add',
                suggested: node,
                existing: null,
                conflictsWithUser: false,
                merged: node,
            });
        } else {
            // Component exists — check for conflicts
            const userModified = userEdits.modifiedNodeIds.has(sc.id);
            const userAdded = userEdits.addedNodeIds.has(sc.id);
            const conflicts = userModified || userAdded;

            if (conflicts) {
                // User edited this node — do NOT override
                results.push({
                    action: 'keep',
                    suggested: aiComponentToNode(sc),
                    existing,
                    conflictsWithUser: true,
                    merged: existing, // Keep user version
                });
            } else {
                // Safe to update (AI-generated, not user-modified)
                const merged = mergeComponent(existing, sc);
                results.push({
                    action: 'modify',
                    suggested: aiComponentToNode(sc),
                    existing,
                    conflictsWithUser: false,
                    merged,
                });
            }
        }
    }

    return results;
}

// ─── Net Diffing ───

function diffNets(
    suggested: AISuggestedNet[],
    state: CircuitState,
    userEdits: UserEditLog,
): DiffItem<Net>[] {
    const results: DiffItem<Net>[] = [];

    for (const sn of suggested) {
        // Find existing net by ID or by name
        const existing =
            state.nets[sn.id] ??
            Object.values(state.nets).find((n) => n.name === sn.name);

        if (!existing) {
            const net = aiNetToNet(sn);
            results.push({
                action: 'add',
                suggested: net,
                existing: null,
                conflictsWithUser: false,
                merged: net,
            });
        } else {
            const userRenamed = userEdits.renamedNetIds.has(existing.id);

            if (userRenamed) {
                results.push({
                    action: 'keep',
                    suggested: aiNetToNet(sn),
                    existing,
                    conflictsWithUser: true,
                    merged: existing,
                });
            } else {
                // Merge: add new pins, keep existing
                const merged = mergeNet(existing, sn);
                results.push({
                    action: 'modify',
                    suggested: aiNetToNet(sn),
                    existing,
                    conflictsWithUser: false,
                    merged,
                });
            }
        }
    }

    return results;
}

// ─── Connection Diffing ───

function diffConnections(
    suggested: AISuggestedConnection[],
    state: CircuitState,
    userEdits: UserEditLog,
): DiffItem<GraphEdge>[] {
    const results: DiffItem<GraphEdge>[] = [];

    // Build set of existing connections for quick lookup
    const existingConnections = new Set<string>();
    for (const edge of Object.values(state.edges)) {
        existingConnections.add(connectionKey(edge.sourcePinId, edge.targetPinId));
    }

    for (const sc of suggested) {
        const key = connectionKey(sc.sourcePinId, sc.targetPinId);
        const alreadyExists = existingConnections.has(key);

        if (alreadyExists) {
            // Connection already exists — keep
            const existing = Object.values(state.edges).find(
                (e) =>
                    connectionKey(e.sourcePinId, e.targetPinId) === key,
            )!;
            results.push({
                action: 'keep',
                suggested: aiConnectionToEdge(sc),
                existing,
                conflictsWithUser: false,
                merged: existing,
            });
        } else {
            // New connection — check if user manually handled either pin
            const userEdge = userEdits.addedEdgeIds.size > 0;
            // If a user-created edge involves the same pins, mark conflict
            const conflicts = [...userEdits.addedEdgeIds].some((edgeId) => {
                const edge = state.edges[edgeId];
                if (!edge) return false;
                return (
                    edge.sourcePinId === sc.sourcePinId ||
                    edge.targetPinId === sc.targetPinId ||
                    edge.sourcePinId === sc.targetPinId ||
                    edge.targetPinId === sc.sourcePinId
                );
            });

            const edge = aiConnectionToEdge(sc);
            results.push({
                action: 'add',
                suggested: edge,
                existing: null,
                conflictsWithUser: conflicts,
                merged: conflicts ? null : edge,
            });
        }
    }

    return results;
}

// ─── Conversion Helpers ───

function aiComponentToNode(sc: AISuggestedComponent): ComponentNode {
    return {
        id: sc.id,
        type: sc.type,
        label: sc.label,
        partNumber: sc.partNumber,
        pins: sc.pins.map((p) => ({
            id: p.id,
            nodeId: sc.id,
            label: p.label,
            direction: p.direction,
            signalType: p.signalType,
            voltage: p.voltage,
            voltageDomain: null,
            netId: null,
            maxCurrentMa: null,
        })),
        properties: sc.properties,
        voltageDomains: [],
    };
}

function aiNetToNet(sn: AISuggestedNet): Net {
    return {
        id: sn.id,
        name: sn.name,
        pinIds: sn.pinIds,
        signalType: sn.signalType,
        voltage: sn.voltage,
        voltageDomain: null,
        dirty: true,
    };
}

function aiConnectionToEdge(sc: AISuggestedConnection): GraphEdge {
    return {
        id: sc.id,
        sourcePinId: sc.sourcePinId,
        targetPinId: sc.targetPinId,
        sourceNodeId: sc.sourceNodeId,
        targetNodeId: sc.targetNodeId,
        netId: '', // Assigned during merge
    };
}

// ─── Merge Helpers ───

function mergeComponent(
    existing: ComponentNode,
    suggested: AISuggestedComponent,
): ComponentNode {
    // Keep existing structure, update properties AI might enhance
    return {
        ...existing,
        properties: {
            ...existing.properties,
            ...suggested.properties,
        },
        // Add new pins if missing
        pins: mergePins(existing.pins, suggested.pins, existing.id),
    };
}

function mergePins(
    existingPins: GraphPin[],
    suggestedPins: AISuggestedComponent['pins'],
    nodeId: string,
): GraphPin[] {
    const pinMap = new Map(existingPins.map((p) => [p.id, p]));

    for (const sp of suggestedPins) {
        if (!pinMap.has(sp.id)) {
            pinMap.set(sp.id, {
                id: sp.id,
                nodeId,
                label: sp.label,
                direction: sp.direction,
                signalType: sp.signalType,
                voltage: sp.voltage,
                voltageDomain: null,
                netId: null,
                maxCurrentMa: null,
            });
        }
    }

    return [...pinMap.values()];
}

function mergeNet(existing: Net, suggested: AISuggestedNet): Net {
    // Add suggested pins not already present
    const pinSet = new Set(existing.pinIds);
    for (const pinId of suggested.pinIds) {
        pinSet.add(pinId);
    }

    return {
        ...existing,
        pinIds: [...pinSet],
        voltage: existing.voltage ?? suggested.voltage,
        dirty: true,
    };
}

function connectionKey(pinA: string, pinB: string): string {
    return [pinA, pinB].sort().join('::');
}
