/**
 * Rule 4 — Short Circuit Detection
 *
 * Detects edges where a power output pin (VCC/VOUT) connects
 * directly to a ground pin (GND) on a non-ground net.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

const POWER_PINS = new Set(['VCC', 'VOUT']);
const GROUND_PINS = new Set(['GND']);

export function checkShortCircuits(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const edge of ctx.graph.edges) {
        // Ground routing is legitimate, not a short
        if (edge.signal_type === 'ground' || edge.net_name === ctx.groundNet) {
            continue;
        }

        const srcPin = edge.source_pin.toUpperCase();
        const tgtPin = edge.target_pin.toUpperCase();

        const isShort =
            (POWER_PINS.has(srcPin) && GROUND_PINS.has(tgtPin)) ||
            (GROUND_PINS.has(srcPin) && POWER_PINS.has(tgtPin));

        if (isShort) {
            issues.push({
                id: makeIssueId('SHORT'),
                type: 'short_circuit',
                severity: 'error',
                message:
                    `Short circuit: ${edge.source_node}.${edge.source_pin}` +
                    ` → ${edge.target_node}.${edge.target_pin} on net ${edge.net_name}`,
                affectedNodes: [edge.source_node, edge.target_node],
                suggestion: 'Remove direct power-to-ground connection or add a load',
            });
        }
    }

    return issues;
}
