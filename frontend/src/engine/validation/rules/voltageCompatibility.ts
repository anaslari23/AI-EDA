/**
 * Rule 1 — Voltage Compatibility
 *
 * Verifies every consumer on a power rail operates within its
 * rated voltage range.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

export function checkVoltageCompatibility(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const rail of ctx.graph.power_rails) {
        for (const consumerId of rail.consumers) {
            const node = ctx.nodeMap.get(consumerId);
            if (!node) {
                issues.push({
                    id: makeIssueId('VOLT'),
                    type: 'voltage_unknown_consumer',
                    severity: 'error',
                    message: `Rail "${rail.name}": consumer "${consumerId}" not found`,
                    affectedNodes: [consumerId],
                });
                continue;
            }

            const vMin = Number(node.properties.operating_voltage_min ?? 0);
            const vMax = Number(node.properties.operating_voltage_max ?? 5.5);

            if (rail.voltage < vMin || rail.voltage > vMax) {
                issues.push({
                    id: makeIssueId('VOLT'),
                    type: 'voltage_mismatch',
                    severity: 'error',
                    message:
                        `${node.id} (${node.part_number}) requires ${vMin}–${vMax}V ` +
                        `but rail "${rail.name}" supplies ${rail.voltage}V`,
                    affectedNodes: [node.id],
                    suggestion: `Add level shifter or select a ${rail.voltage}V compatible part`,
                });
            }
        }
    }

    return issues;
}
