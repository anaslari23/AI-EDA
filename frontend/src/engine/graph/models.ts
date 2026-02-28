/**
 * Circuit Graph Engine — Core Models
 *
 * Defines the logical data structures for the circuit graph.
 * These are independent of the visual canvas representation.
 * Pure TypeScript. No React dependency.
 */

// ─── Pin Direction ───

export type PinDirection = 'input' | 'output' | 'bidirectional' | 'power' | 'ground';

// ─── Pin Signal Type ───

export type PinSignalType = 'power' | 'ground' | 'digital' | 'analog' | 'bus' | 'clock';

// ─── Pin Model ───

export interface GraphPin {
    id: string;
    nodeId: string;
    label: string;
    direction: PinDirection;
    signalType: PinSignalType;
    /** Nominal voltage at this pin (if known) */
    voltage: number | null;
    /** Voltage domain this pin belongs to */
    voltageDomain: string | null;
    /** Net this pin is connected to */
    netId: string | null;
    /** Max current this pin can source/sink (mA) */
    maxCurrentMa: number | null;
}

// ─── Component Node Model ───

export type ComponentType =
    | 'mcu'
    | 'sensor'
    | 'regulator'
    | 'passive'
    | 'protection'
    | 'connector'
    | 'power_source';

export interface ComponentNode {
    id: string;
    type: ComponentType;
    label: string;
    partNumber: string;
    pins: GraphPin[];
    properties: Record<string, unknown>;
    /** Voltage domains this component operates in */
    voltageDomains: string[];
}

// ─── Net Model ───

export interface Net {
    id: string;
    name: string;
    /** IDs of all pins connected to this net */
    pinIds: string[];
    /** Signal type inferred from connected pins */
    signalType: PinSignalType;
    /** Voltage on this net (derived from power/output pins) */
    voltage: number | null;
    /** Voltage domain this net belongs to */
    voltageDomain: string | null;
    /** Whether this net has been validated */
    dirty: boolean;
}

// ─── Edge Model ───

export interface GraphEdge {
    id: string;
    sourcePinId: string;
    targetPinId: string;
    sourceNodeId: string;
    targetNodeId: string;
    netId: string;
}

// ─── Voltage Domain ───

export interface VoltageDomain {
    id: string;
    name: string;
    voltage: number;
    sourceNodeId: string;
    /** Net IDs that carry this voltage */
    netIds: string[];
    /** Node IDs powered by this domain */
    consumerNodeIds: string[];
}

// ─── Connection Validation ───

export interface ConnectionCheckResult {
    allowed: boolean;
    reason: string | null;
    /** If allowed, net merging info */
    mergeInfo: {
        sourceNetId: string | null;
        targetNetId: string | null;
        resultNetId: string;
        resultNetName: string;
    } | null;
}

// ─── Circuit State ───

export interface CircuitState {
    /** All component nodes */
    nodes: Record<string, ComponentNode>;
    /** All nets (keyed by net ID) */
    nets: Record<string, Net>;
    /** All edges (keyed by edge ID) */
    edges: Record<string, GraphEdge>;
    /** Voltage domains */
    voltageDomains: Record<string, VoltageDomain>;
    /** Global ground net ID */
    groundNetId: string | null;
    /** Monotonic version counter for snapshot comparison */
    version: number;
    /** Whether any net is dirty (needs revalidation) */
    isDirty: boolean;
}

// ─── Serialisation (for backend snapshot) ───

export interface CircuitSnapshot {
    nodes: ComponentNode[];
    nets: Net[];
    edges: GraphEdge[];
    voltageDomains: VoltageDomain[];
    groundNetId: string | null;
    version: number;
}
