/**
 * Rule 2 — Missing Ground Net
 *
 * Every IC (MCU, sensor, regulator) must have at least one edge
 * connected to the ground net.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

export function checkMissingGround(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const grounded = new Set<string>();

    for (const edge of ctx.graph.edges) {
        if (edge.net_name === ctx.groundNet || edge.signal_type === 'ground') {
            grounded.add(edge.source_node);
            grounded.add(edge.target_node);
        }
    }

    for (const node of ctx.graph.nodes) {
        if (ctx.icTypes.has(node.type) && !grounded.has(node.id)) {
            issues.push({
                id: makeIssueId('GND'),
                type: 'missing_ground',
                severity: 'error',
                message: `${node.id} (${node.part_number}) has no ground connection`,
                affectedNodes: [node.id],
                suggestion: `Connect ${node.id}.GND to ${ctx.groundNet}`,
            });
        }
    }

    return issues;
}
