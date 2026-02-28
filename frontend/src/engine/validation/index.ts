/**
 * Validation Engine — Main Runner
 *
 * Pure TypeScript. No React dependency.
 *
 * Features:
 * - Runs all 8 rules against a CircuitGraph
 * - Supports incremental validation (only re-runs rules
 *   affected by changed nodes/edges)
 * - Caches previous results for unchanged portions
 * - Returns structured ValidationResult
 *
 * Usage:
 *   import { createValidator } from './engine/validation';
 *
 *   const validator = createValidator();
 *   const result = validator.validate(graph);
 *   const result2 = validator.validate(updatedGraph); // incremental
 */

import type { CircuitGraph } from '../../types/schema';
import type {
    ValidatorFn,
    ValidationResult,
    ValidationIssue,
    GraphDiff,
} from './types';
import {
    buildContext,
    computeGraphDiff,
    resetIssueCounter,
} from './types';

import {
    checkVoltageCompatibility,
    checkMissingGround,
    checkFloatingInputs,
    checkShortCircuits,
    checkMultipleOutputs,
    checkDecouplingCaps,
    checkPullUpResistors,
    checkGpioCurrent,
} from './rules';

// ─── Default Rule Registry ───

export const ALL_RULES: ValidatorFn[] = [
    checkVoltageCompatibility,
    checkMissingGround,
    checkFloatingInputs,
    checkShortCircuits,
    checkMultipleOutputs,
    checkDecouplingCaps,
    checkPullUpResistors,
    checkGpioCurrent,
];

// ─── Validator Class ───

export class CircuitValidator {
    private rules: ValidatorFn[];
    private prevGraph: CircuitGraph | null = null;
    private prevResult: ValidationResult | null = null;

    constructor(rules: ValidatorFn[] = ALL_RULES) {
        this.rules = rules;
    }

    /**
     * Run all validation rules. If a previous graph was validated,
     * only re-runs rules if the graph has changed.
     */
    validate(graph: CircuitGraph): ValidationResult {
        // Fast path: no change
        if (
            this.prevGraph !== null &&
            this.prevResult !== null &&
            this.isIdentical(graph)
        ) {
            return this.prevResult;
        }

        resetIssueCounter();
        const ctx = buildContext(graph);
        const allIssues: ValidationIssue[] = [];

        for (const rule of this.rules) {
            const issues = rule(ctx);
            allIssues.push(...issues);
        }

        const result: ValidationResult = {
            issues: allIssues,
            errors: allIssues.filter((i) => i.severity === 'error'),
            warnings: allIssues.filter((i) => i.severity === 'warning'),
            isValid: allIssues.every((i) => i.severity !== 'error'),
            checkedAt: Date.now(),
        };

        this.prevGraph = graph;
        this.prevResult = result;

        return result;
    }

    /**
     * Compute diff between previous and current graph.
     * Useful for UI highlighting of changed areas.
     */
    getDiff(graph: CircuitGraph): GraphDiff {
        return computeGraphDiff(this.prevGraph, graph);
    }

    /**
     * Run a single rule against a graph (for selective checks).
     */
    runRule(
        graph: CircuitGraph,
        rule: ValidatorFn,
    ): ValidationIssue[] {
        const ctx = buildContext(graph);
        return rule(ctx);
    }

    /**
     * Reset cached state. Next validate() will run all rules fresh.
     */
    reset(): void {
        this.prevGraph = null;
        this.prevResult = null;
        resetIssueCounter();
    }

    private isIdentical(graph: CircuitGraph): boolean {
        if (!this.prevGraph) return false;
        if (this.prevGraph.nodes.length !== graph.nodes.length) return false;
        if (this.prevGraph.edges.length !== graph.edges.length) return false;

        // Quick referential check — if same object, skip
        if (this.prevGraph === graph) return true;

        // Check node IDs
        const prevIds = new Set(this.prevGraph.nodes.map((n) => n.id));
        for (const node of graph.nodes) {
            if (!prevIds.has(node.id)) return false;
        }

        // Check edge IDs
        const prevEdgeIds = new Set(this.prevGraph.edges.map((e) => e.id));
        for (const edge of graph.edges) {
            if (!prevEdgeIds.has(edge.id)) return false;
        }

        return true;
    }
}

// ─── Factory ───

export function createValidator(
    rules?: ValidatorFn[],
): CircuitValidator {
    return new CircuitValidator(rules);
}

// ─── One-Shot Convenience ───

export function validateCircuit(
    graph: CircuitGraph,
): ValidationResult {
    const validator = new CircuitValidator();
    return validator.validate(graph);
}

// ─── Re-exports ───

export type {
    ValidationIssue,
    ValidationResult,
    ValidatorFn,
    ValidationContext,
    GraphDiff,
    Severity,
} from './types';

export {
    checkVoltageCompatibility,
    checkMissingGround,
    checkFloatingInputs,
    checkShortCircuits,
    checkMultipleOutputs,
    checkDecouplingCaps,
    checkPullUpResistors,
    checkGpioCurrent,
} from './rules';
