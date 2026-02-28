/**
 * Rule 8 — GPIO Current Estimation
 *
 * Detects actuators or high-draw loads connected directly to
 * MCU GPIO pins without a driver transistor, which risks overcurrent.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

const DEFAULT_GPIO_MAX_MA = 20;

export function checkGpioCurrent(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of ctx.graph.nodes) {
        if (node.type !== 'mcu') continue;

        const maxMa = Number(node.properties.gpio_max_current_mA ?? DEFAULT_GPIO_MAX_MA);
        const edges = ctx.edgesForNode.get(node.id) ?? [];

        for (const edge of edges) {
            if (edge.source_node !== node.id) continue;
            if (edge.signal_type !== 'signal') continue;

            const target = ctx.nodeMap.get(edge.target_node);
            if (!target) continue;

            // Actuators should never be driven directly from GPIO
            if (target.type === 'actuator') {
                issues.push({
                    id: makeIssueId('GPIO'),
                    type: 'gpio_overcurrent_risk',
                    severity: 'warning',
                    message:
                        `Actuator ${target.id} connected directly to ` +
                        `${node.id} GPIO (max ${maxMa}mA)`,
                    affectedNodes: [node.id, target.id],
                    suggestion: 'Add MOSFET or transistor driver between GPIO and actuator',
                });
            }

            // Any load exceeding GPIO current limit
            const drawMa = Number(target.properties.current_draw_mA ?? 0);
            if (drawMa > maxMa) {
                issues.push({
                    id: makeIssueId('GPIO'),
                    type: 'gpio_overcurrent',
                    severity: 'error',
                    message:
                        `${target.id} draws ${drawMa}mA but ` +
                        `${node.id} GPIO max is ${maxMa}mA`,
                    affectedNodes: [node.id, target.id],
                    suggestion: `Add driver circuit — GPIO can only source ${maxMa}mA`,
                });
            }
        }
    }

    return issues;
}
