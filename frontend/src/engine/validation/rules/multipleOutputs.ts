/**
 * Rule 5 — Multiple Outputs Connected
 *
 * Detects nets where more than one output-type pin is connected,
 * which causes bus contention.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

const OUTPUT_PINS = new Set(['VOUT', 'TX', 'MOSI', 'SCK']);
const OUTPUT_SIGNAL_TYPES = new Set(['power']);

export function checkMultipleOutputs(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Group edges by net_name
    const netPins = new Map<string, Array<{ nodeId: string; pin: string }>>();

    for (const edge of ctx.graph.edges) {
        const net = edge.net_name;
        if (!netPins.has(net)) netPins.set(net, []);

        const isSourceOutput =
            OUTPUT_PINS.has(edge.source_pin.toUpperCase()) ||
            OUTPUT_SIGNAL_TYPES.has(edge.signal_type);

        if (isSourceOutput) {
            const list = netPins.get(net)!;
            const exists = list.some(
                (p) => p.nodeId === edge.source_node && p.pin === edge.source_pin,
            );
            if (!exists) {
                list.push({ nodeId: edge.source_node, pin: edge.source_pin });
            }
        }
    }

    for (const [netName, outputs] of netPins) {
        if (outputs.length > 1) {
            const names = outputs.map((o) => `${o.nodeId}.${o.pin}`).join(', ');
            issues.push({
                id: makeIssueId('MOUT'),
                type: 'multiple_outputs',
                severity: 'error',
                message: `Net "${netName}" has ${outputs.length} output drivers: ${names}`,
                affectedNodes: outputs.map((o) => o.nodeId),
                suggestion: 'Only one output should drive a net. Use a mux or bus switch.',
            });
        }
    }

    return issues;
}
