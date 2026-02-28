/**
 * Rule 6 — Missing Decoupling Capacitors
 *
 * Every IC should have a decoupling capacitor connected
 * to its VCC/VIN pin.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

export function checkDecouplingCaps(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Find which ICs have a decoupling cap connected
    const decoupledICs = new Set<string>();

    for (const node of ctx.graph.nodes) {
        if (node.type !== 'passive') continue;
        const purpose = String(node.properties.purpose ?? '').toLowerCase();
        if (!purpose.includes('decoupling')) continue;

        // Find ICs connected to this cap
        const edges = ctx.edgesForNode.get(node.id) ?? [];
        for (const edge of edges) {
            const peerId =
                edge.source_node === node.id ? edge.target_node : edge.source_node;
            const peer = ctx.nodeMap.get(peerId);
            if (peer && ctx.icTypes.has(peer.type)) {
                decoupledICs.add(peer.id);
            }
        }
    }

    // Check each IC
    const uncovered: string[] = [];
    for (const node of ctx.graph.nodes) {
        if (ctx.icTypes.has(node.type) && !decoupledICs.has(node.id)) {
            uncovered.push(node.id);
        }
    }

    if (uncovered.length > 0) {
        issues.push({
            id: makeIssueId('DCAP'),
            type: 'missing_decoupling',
            severity: 'warning',
            message:
                `${uncovered.length} IC(s) without decoupling capacitor: ` +
                uncovered.join(', '),
            affectedNodes: uncovered,
            suggestion: 'Add 100nF (0.1µF) ceramic capacitor between VCC and GND per IC',
        });
    }

    return issues;
}
