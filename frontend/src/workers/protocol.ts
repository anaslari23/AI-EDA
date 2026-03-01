/**
 * Worker Protocol — Message types for circuit analysis Web Worker.
 *
 * All messages use structured clone (no transferables needed
 * for JSON-serializable circuit data).
 */

// ─── Command Types ───

export type WorkerCommand = 'VALIDATE' | 'MERGE_NETS' | 'ANALYZE_CURRENT' | 'TRAVERSE';

// ─── Request Messages (Main → Worker) ───

export interface ValidateRequest {
    command: 'VALIDATE';
    id: string;
    payload: {
        graph: SerializableCircuitGraph;
        checks?: string[];
    };
}

export interface MergeRequest {
    command: 'MERGE_NETS';
    id: string;
    payload: {
        graph: SerializableCircuitGraph;
    };
}

export interface AnalyzeCurrentRequest {
    command: 'ANALYZE_CURRENT';
    id: string;
    payload: {
        graph: SerializableCircuitGraph;
    };
}

export interface TraverseRequest {
    command: 'TRAVERSE';
    id: string;
    payload: {
        graph: SerializableCircuitGraph;
        startNodeId: string;
        direction: 'upstream' | 'downstream' | 'both';
    };
}

export type WorkerRequest =
    | ValidateRequest
    | MergeRequest
    | AnalyzeCurrentRequest
    | TraverseRequest;

// ─── Response Messages (Worker → Main) ───

export interface WorkerResponseBase {
    command: WorkerCommand;
    id: string;
    durationMs: number;
}

export interface ValidateResponse extends WorkerResponseBase {
    command: 'VALIDATE';
    result: {
        issues: SerializableValidationIssue[];
        isValid: boolean;
        errorCount: number;
        warningCount: number;
    };
}

export interface MergeResponse extends WorkerResponseBase {
    command: 'MERGE_NETS';
    result: {
        nets: SerializableNet[];
        mergeCount: number;
    };
}

export interface AnalyzeCurrentResponse extends WorkerResponseBase {
    command: 'ANALYZE_CURRENT';
    result: {
        nodeCurrents: Array<{
            nodeId: string;
            estimatedDrawMa: number;
            maxSourceMa: number;
            overloaded: boolean;
        }>;
        totalDrawMa: number;
    };
}

export interface TraverseResponse extends WorkerResponseBase {
    command: 'TRAVERSE';
    result: {
        visitedNodeIds: string[];
        visitedEdgeIds: string[];
        path: string[];
    };
}

export interface WorkerErrorResponse extends WorkerResponseBase {
    error: string;
}

export type WorkerResponse =
    | ValidateResponse
    | MergeResponse
    | AnalyzeCurrentResponse
    | TraverseResponse
    | WorkerErrorResponse;

// ─── Serializable Graph Types (structured clone safe) ───

export interface SerializableCircuitGraph {
    nodes: SerializableNode[];
    edges: SerializableEdge[];
    power_rails: Array<{
        name: string;
        voltage: number;
        source_node: string;
        consumers: string[];
    }>;
    ground_net: string;
}

export interface SerializableNode {
    id: string;
    type: string;
    part_number: string;
    properties: Record<string, unknown>;
    pins: string[];
}

export interface SerializableEdge {
    id: string;
    source_node: string;
    source_pin: string;
    target_node: string;
    target_pin: string;
    net_name: string;
    signal_type: string;
}

export interface SerializableNet {
    id: string;
    name: string;
    pinIds: string[];
    signalType: string;
    voltage: number | null;
}

export interface SerializableValidationIssue {
    id: string;
    type: string;
    severity: 'warning' | 'error';
    message: string;
    affectedNodes: string[];
    suggestion?: string;
}

// ─── Helpers ───

let reqCounter = 0;

export function createRequestId(): string {
    return `req_${++reqCounter}_${Date.now()}`;
}
