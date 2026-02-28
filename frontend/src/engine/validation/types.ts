/**
 * Validation Engine — Core Types
 *
 * Pure TypeScript. No React dependencies.
 */

import type { CircuitGraph, CircuitNode, CircuitEdge } from '../../types/schema';

// ─── Validation Issue ───

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
    id: string;
    type: string;
    severity: Severity;
    message: string;
    affectedNodes: string[];
    suggestion?: string;
}

// ─── Validator Function Signature ───

export type ValidatorFn = (
    ctx: ValidationContext,
) => ValidationIssue[];

// ─── Validation Context ───

/**
 * Read-only context passed to every rule.
 * Pre-computed lookups avoid redundant computation across rules.
 */
export interface ValidationContext {
    graph: CircuitGraph;
    nodeMap: Map<string, CircuitNode>;
    edgesForNode: Map<string, CircuitEdge[]>;
    groundNet: string;
    icTypes: ReadonlySet<string>;
}

// ─── Incremental Diff ───

export interface GraphDiff {
    addedNodeIds: string[];
    removedNodeIds: string[];
    changedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
}

// ─── Validation Result ───

export interface ValidationResult {
    issues: ValidationIssue[];
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    isValid: boolean;
    checkedAt: number;
}

// ─── Helpers ───

export function buildContext(graph: CircuitGraph): ValidationContext {
    const nodeMap = new Map<string, CircuitNode>();
    for (const node of graph.nodes) {
        nodeMap.set(node.id, node);
    }

    const edgesForNode = new Map<string, CircuitEdge[]>();
    for (const edge of graph.edges) {
        if (!edgesForNode.has(edge.source_node)) {
            edgesForNode.set(edge.source_node, []);
        }
        edgesForNode.get(edge.source_node)!.push(edge);

        if (!edgesForNode.has(edge.target_node)) {
            edgesForNode.set(edge.target_node, []);
        }
        edgesForNode.get(edge.target_node)!.push(edge);
    }

    return {
        graph,
        nodeMap,
        edgesForNode,
        groundNet: graph.ground_net || 'GND',
        icTypes: new Set(['mcu', 'sensor', 'regulator']),
    };
}

let issueCounter = 0;

export function makeIssueId(prefix: string): string {
    return `${prefix}_${++issueCounter}`;
}

export function resetIssueCounter(): void {
    issueCounter = 0;
}

export function computeGraphDiff(
    prev: CircuitGraph | null,
    next: CircuitGraph,
): GraphDiff {
    const prevNodeIds = new Set(prev?.nodes.map((n) => n.id) ?? []);
    const nextNodeIds = new Set(next.nodes.map((n) => n.id));
    const prevEdgeIds = new Set(prev?.edges.map((e) => e.id) ?? []);
    const nextEdgeIds = new Set(next.edges.map((e) => e.id));

    return {
        addedNodeIds: [...nextNodeIds].filter((id) => !prevNodeIds.has(id)),
        removedNodeIds: [...prevNodeIds].filter((id) => !nextNodeIds.has(id)),
        changedNodeIds: [], // Could compare properties for deep diff
        addedEdgeIds: [...nextEdgeIds].filter((id) => !prevEdgeIds.has(id)),
        removedEdgeIds: [...prevEdgeIds].filter((id) => !nextEdgeIds.has(id)),
    };
}
