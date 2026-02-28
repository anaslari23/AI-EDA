/**
 * Rule 7 — Pull-Up Resistor Requirements
 *
 * I2C buses (SDA/SCL) require pull-up resistors.
 * Checks for presence per line.
 */

import type { ValidationContext, ValidationIssue } from '../types';
import { makeIssueId } from '../types';

export function checkPullUpResistors(
    ctx: ValidationContext,
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Detect I2C usage
    const hasI2C = ctx.graph.edges.some(
        (e) =>
            e.net_name.toUpperCase().startsWith('I2C') ||
            ['SDA', 'SCL'].includes(e.source_pin.toUpperCase()) ||
            ['SDA', 'SCL'].includes(e.target_pin.toUpperCase()),
    );

    if (!hasI2C) return issues;

    // Find pull-up resistors and which pins they cover
    let hasSdaPullup = false;
    let hasSclPullup = false;

    for (const node of ctx.graph.nodes) {
        if (node.type !== 'passive') continue;
        const purpose = String(node.properties.purpose ?? '').toLowerCase();
        if (!purpose.includes('pull-up') && !purpose.includes('pullup')) continue;

        // Check connected pins
        const edges = ctx.edgesForNode.get(node.id) ?? [];
        for (const edge of edges) {
            const pins = [edge.source_pin.toUpperCase(), edge.target_pin.toUpperCase()];
            if (pins.includes('SDA') || purpose.includes('sda')) hasSdaPullup = true;
            if (pins.includes('SCL') || purpose.includes('scl')) hasSclPullup = true;
        }
    }

    if (!hasSdaPullup) {
        issues.push({
            id: makeIssueId('PU'),
            type: 'missing_pullup_sda',
            severity: 'warning',
            message: 'I2C SDA line has no pull-up resistor',
            affectedNodes: [],
            suggestion: 'Add 4.7kΩ pull-up resistor on SDA to VCC',
        });
    }

    if (!hasSclPullup) {
        issues.push({
            id: makeIssueId('PU'),
            type: 'missing_pullup_scl',
            severity: 'warning',
            message: 'I2C SCL line has no pull-up resistor',
            affectedNodes: [],
            suggestion: 'Add 4.7kΩ pull-up resistor on SCL to VCC',
        });
    }

    return issues;
}
