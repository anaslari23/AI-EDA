/**
 * Rule 3 — Floating Digital Inputs
 *
 * Detects IC pins that have no incoming edge (no driver/source),
 * which would leave them in an undefined logic state.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

const INPUT_PIN_PATTERNS = ['SDA', 'SCL', 'MISO', 'RX', 'CS', 'EN', 'RST', 'INT'];
const EXCLUDED_PINS = new Set(['VCC', 'VIN', 'GND', 'VOUT']);

export function checkFloatingInputs(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Build set of connected pins: "nodeId:pinName"
    const connectedPins = new Set<string>();
    for (const edge of ctx.graph.edges) {
        connectedPins.add(`${edge.source_node}:${edge.source_pin}`);
        connectedPins.add(`${edge.target_node}:${edge.target_pin}`);
    }

    for (const node of ctx.graph.nodes) {
        if (!ctx.icTypes.has(node.type)) continue;

        for (const pin of node.pins) {
            const upper = pin.toUpperCase();
            if (EXCLUDED_PINS.has(upper)) continue;

            const isInputLike =
                INPUT_PIN_PATTERNS.some((p) => upper.includes(p)) ||
                upper.startsWith('GPIO');

            if (isInputLike && !connectedPins.has(`${node.id}:${pin}`)) {
                issues.push({
                    id: makeIssueId('FLOAT'),
                    type: 'floating_input',
                    severity: 'warning',
                    message: `${node.id}.${pin} appears unconnected (floating input)`,
                    affectedNodes: [node.id],
                    suggestion: `Connect ${pin} to a driver, or add a pull-up/pull-down resistor`,
                });
            }
        }
    }

    return issues;
}
