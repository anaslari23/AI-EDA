/**
 * AI Suggestion Types — Schema for AI-returned circuit suggestions
 * and diff/merge result structures.
 *
 * Pure TypeScript. No React dependency.
 */

import type {
    ComponentNode,
    GraphPin,
    GraphEdge,
    Net,
    ComponentType,
    PinDirection,
    PinSignalType,
} from '../graph/models';

// ─── AI Response Schema ───

/** Structured JSON the AI returns */
export interface AISuggestion {
    /** Unique ID for this suggestion batch */
    id: string;
    /** Human-readable description of what the AI is suggesting */
    description: string;
    /** Suggested components to add */
    components: AISuggestedComponent[];
    /** Suggested nets to create or extend */
    nets: AISuggestedNet[];
    /** Suggested connections (edges) between pins */
    connections: AISuggestedConnection[];
    /** Confidence score (0-1) */
    confidence: number;
    /** Timestamp */
    timestamp: number;
}

export interface AISuggestedComponent {
    id: string;
    type: ComponentType;
    label: string;
    partNumber: string;
    pins: AISuggestedPin[];
    properties: Record<string, unknown>;
}

export interface AISuggestedPin {
    id: string;
    label: string;
    direction: PinDirection;
    signalType: PinSignalType;
    voltage: number | null;
}

export interface AISuggestedNet {
    id: string;
    name: string;
    signalType: PinSignalType;
    voltage: number | null;
    pinIds: string[];
}

export interface AISuggestedConnection {
    id: string;
    sourcePinId: string;
    targetPinId: string;
    sourceNodeId: string;
    targetNodeId: string;
    netName: string;
}

// ─── Diff Result ───

export type DiffAction = 'add' | 'modify' | 'remove' | 'keep';

export interface DiffItem<T> {
    action: DiffAction;
    /** The item from the suggestion (for add/modify) */
    suggested: T | null;
    /** The existing item in the graph (for modify/remove/keep) */
    existing: T | null;
    /** Whether this conflicts with a user edit */
    conflictsWithUser: boolean;
    /** Auto-resolved merge result (null if conflict) */
    merged: T | null;
}

export interface SuggestionDiff {
    suggestionId: string;
    components: DiffItem<ComponentNode>[];
    nets: DiffItem<Net>[];
    connections: DiffItem<GraphEdge>[];
    /** Summary stats */
    stats: {
        addCount: number;
        modifyCount: number;
        removeCount: number; // AI never removes, but tracked
        conflictCount: number;
        keepCount: number;
    };
}

// ─── Preview State ───

export type SuggestionItemStatus =
    | 'pending'    // Awaiting user decision
    | 'accepted'   // User accepted
    | 'rejected'   // User rejected
    | 'conflict';  // Cannot auto-merge

export interface SuggestionPreviewItem {
    id: string;
    kind: 'component' | 'net' | 'connection';
    action: DiffAction;
    status: SuggestionItemStatus;
    label: string;
    description: string;
    affectedNodeIds: string[];
    /** The diff detail for this item */
    diff: DiffItem<unknown>;
}

export interface SuggestionPreviewState {
    /** Whether a suggestion is being previewed */
    active: boolean;
    /** The original AI suggestion */
    suggestion: AISuggestion | null;
    /** Computed diff against current graph */
    diff: SuggestionDiff | null;
    /** Preview items with user accept/reject status */
    items: SuggestionPreviewItem[];
    /** Whether the user has reviewed all items */
    allReviewed: boolean;
    /** IDs of nodes/edges to highlight in the overlay */
    highlightNodeIds: Set<string>;
    highlightEdgeIds: Set<string>;
}

// ─── User Edit Tracking ───

export interface UserEditLog {
    /** Node IDs the user has manually added */
    addedNodeIds: Set<string>;
    /** Node IDs the user has manually modified */
    modifiedNodeIds: Set<string>;
    /** Edge IDs the user has manually created */
    addedEdgeIds: Set<string>;
    /** Net IDs the user has manually renamed */
    renamedNetIds: Set<string>;
}
