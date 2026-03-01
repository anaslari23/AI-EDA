/**
 * Pin Direction Validation — checks connection legality.
 *
 * Rules:
 * 1. Two output pins cannot connect (bus contention)
 * 2. Two ground pins CAN connect (ground routing)
 * 3. Two power pins CAN connect (power distribution)
 * 4. Output → Input is always allowed
 * 5. Bidirectional connects to anything
 * 6. Power → Ground = short circuit
 *
 * Pure TypeScript. No React dependency.
 */

import type { GraphPin, ConnectionCheckResult, CircuitState, Net } from './models';
import { generateNetId, generateNetName } from './netOperations';

// ─── Direction Compatibility Matrix ───

type DirPair = `${GraphPin['direction']}-${GraphPin['direction']}`;

const BLOCKED_PAIRS: Record<string, string> = {
    'output-output': 'Two outputs cannot drive the same net (bus contention)',
    'power-ground': 'Cannot connect power directly to ground (short circuit)',
    'ground-power': 'Cannot connect ground directly to power (short circuit)',
};

// ─── Main Check ───

export function checkConnection(
    sourcePin: GraphPin,
    targetPin: GraphPin,
    state: CircuitState,
): ConnectionCheckResult {
    // Self-connection
    if (sourcePin.id === targetPin.id) {
        return { allowed: false, reason: 'Cannot connect a pin to itself', mergeInfo: null };
    }

    // Same-node connection
    if (sourcePin.nodeId === targetPin.nodeId) {
        return { allowed: false, reason: 'Cannot connect pins on the same component', mergeInfo: null };
    }

    // Direction check
    const pair: DirPair = `${sourcePin.direction}-${targetPin.direction}`;
    if (pair in BLOCKED_PAIRS) {
        return { allowed: false, reason: BLOCKED_PAIRS[pair], mergeInfo: null };
    }

    // Already connected check
    const srcNet = sourcePin.netId;
    const tgtNet = targetPin.netId;
    if (srcNet && tgtNet && srcNet === tgtNet) {
        return { allowed: false, reason: 'Pins are already on the same net', mergeInfo: null };
    }

    // Compute merge info
    const mergeInfo = computeMergeInfo(sourcePin, targetPin, state);

    return { allowed: true, reason: null, mergeInfo };
}

// ─── Merge Info ───

function computeMergeInfo(
    sourcePin: GraphPin,
    targetPin: GraphPin,
    state: CircuitState,
) {
    const srcNetId = sourcePin.netId;
    const tgtNetId = targetPin.netId;

    // Both pins already on nets — merge them
    if (srcNetId && tgtNetId) {
        return {
            sourceNetId: srcNetId,
            targetNetId: tgtNetId,
            resultNetId: srcNetId, // source wins
            resultNetName: state.nets[srcNetId]?.name ?? `NET_merged`,
        };
    }

    // Only source has a net — target joins it
    if (srcNetId && !tgtNetId) {
        return {
            sourceNetId: srcNetId,
            targetNetId: null,
            resultNetId: srcNetId,
            resultNetName: state.nets[srcNetId]?.name ?? `NET_join`,
        };
    }

    // Only target has a net — source joins it
    if (!srcNetId && tgtNetId) {
        return {
            sourceNetId: null,
            targetNetId: tgtNetId,
            resultNetId: tgtNetId,
            resultNetName: state.nets[tgtNetId]?.name ?? `NET_join`,
        };
    }

    // Neither has a net — create new
    const newId = generateNetId();
    const newName = generateNetName(sourcePin.signalType);
    return {
        sourceNetId: null,
        targetNetId: null,
        resultNetId: newId,
        resultNetName: newName,
    };
}

// ─── Batch Validation ───

/**
 * Check if a net has any output-output conflict.
 * Used for re-validation after merges.
 */
export function validateNetPinDirections(
    net: Net,
    state: CircuitState,
): { valid: boolean; reason: string | null } {
    const outputPins: GraphPin[] = [];

    for (const pinId of net.pinIds) {
        for (const node of Object.values(state.nodes)) {
            const pin = node.pins.find((p) => p.id === pinId);
            if (pin && pin.direction === 'output') {
                outputPins.push(pin);
            }
        }
    }

    if (outputPins.length > 1) {
        const names = outputPins.map((p) => `${p.nodeId}.${p.label}`).join(', ');
        return {
            valid: false,
            reason: `Multiple outputs on net "${net.name}": ${names}`,
        };
    }

    return { valid: true, reason: null };
}
