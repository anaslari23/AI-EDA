/**
 * Circuit Graph Engine — Public API
 *
 * Re-exports all models, operations, and the Zustand store.
 */

// ─── Models ───
export type {
    PinDirection,
    PinSignalType,
    GraphPin,
    ComponentType,
    ComponentNode,
    Net,
    GraphEdge,
    VoltageDomain,
    ConnectionCheckResult,
    CircuitState,
    CircuitSnapshot,
} from './models';

// ─── Store ───
export { useCircuitStore } from './circuitStore';
export type { CircuitStore } from './circuitStore';

// ─── Operations ───
export {
    createNet,
    mergeNets,
    removePinFromNet,
    rebuildVoltageDomains,
} from './netOperations';

// ─── Validation ───
export {
    checkConnection,
    validateNetPinDirections,
} from './pinValidation';
