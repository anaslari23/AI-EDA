/**
 * useWorker — Zustand store integration for Web Workers.
 *
 * Provides reactive state for worker results with
 * automatic re-validation on graph changes.
 *
 * Usage:
 *   const { validate, isValidating, validationResult } = useWorkerStore();
 *   validate(circuitGraph);
 */

import { create } from 'zustand';

import type {
    SerializableCircuitGraph,
    SerializableValidationIssue,
    SerializableNet,
    AnalyzeCurrentResponse,
    TraverseResponse,
} from './protocol';

import { getWorkerManager } from './WorkerManager';

// ─── State Shape ───

interface WorkerState {
    // Validation
    isValidating: boolean;
    validationIssues: SerializableValidationIssue[];
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    validationDurationMs: number;

    // Net merge
    isMerging: boolean;
    mergedNets: SerializableNet[];
    mergeCount: number;

    // Current analysis
    isAnalyzing: boolean;
    nodeCurrents: AnalyzeCurrentResponse['result']['nodeCurrents'];
    totalDrawMa: number;

    // Traverse
    isTraversing: boolean;
    traverseResult: TraverseResponse['result'] | null;

    // Meta
    lastError: string | null;
    usingFallback: boolean;
}

interface WorkerActions {
    validate(graph: SerializableCircuitGraph, checks?: string[]): Promise<void>;
    merge(graph: SerializableCircuitGraph): Promise<void>;
    analyzeCurrent(graph: SerializableCircuitGraph): Promise<void>;
    traverse(
        graph: SerializableCircuitGraph,
        startNodeId: string,
        direction?: 'upstream' | 'downstream' | 'both',
    ): Promise<void>;
    reset(): void;
}

export type WorkerStore = WorkerState & WorkerActions;

// ─── Initial State ───

const initialState: WorkerState = {
    isValidating: false,
    validationIssues: [],
    isValid: true,
    errorCount: 0,
    warningCount: 0,
    validationDurationMs: 0,

    isMerging: false,
    mergedNets: [],
    mergeCount: 0,

    isAnalyzing: false,
    nodeCurrents: [],
    totalDrawMa: 0,

    isTraversing: false,
    traverseResult: null,

    lastError: null,
    usingFallback: false,
};

// ─── Store ───

export const useWorkerStore = create<WorkerStore>((set) => ({
    ...initialState,

    validate: async (graph, checks) => {
        set({ isValidating: true, lastError: null });
        try {
            const mgr = getWorkerManager();
            const res = await mgr.validate(graph, checks);

            if ('error' in res) {
                set({
                    isValidating: false,
                    lastError: (res as { error: string }).error,
                    usingFallback: mgr.isUsingFallback,
                });
                return;
            }

            set({
                isValidating: false,
                validationIssues: res.result.issues,
                isValid: res.result.isValid,
                errorCount: res.result.errorCount,
                warningCount: res.result.warningCount,
                validationDurationMs: res.durationMs,
                usingFallback: mgr.isUsingFallback,
            });
        } catch (err) {
            set({
                isValidating: false,
                lastError: err instanceof Error ? err.message : String(err),
            });
        }
    },

    merge: async (graph) => {
        set({ isMerging: true, lastError: null });
        try {
            const mgr = getWorkerManager();
            const res = await mgr.merge(graph);

            if ('error' in res) {
                set({ isMerging: false, lastError: (res as { error: string }).error });
                return;
            }

            set({
                isMerging: false,
                mergedNets: res.result.nets,
                mergeCount: res.result.mergeCount,
                usingFallback: mgr.isUsingFallback,
            });
        } catch (err) {
            set({
                isMerging: false,
                lastError: err instanceof Error ? err.message : String(err),
            });
        }
    },

    analyzeCurrent: async (graph) => {
        set({ isAnalyzing: true, lastError: null });
        try {
            const mgr = getWorkerManager();
            const res = await mgr.analyzeCurrent(graph);

            if ('error' in res) {
                set({ isAnalyzing: false, lastError: (res as { error: string }).error });
                return;
            }

            set({
                isAnalyzing: false,
                nodeCurrents: res.result.nodeCurrents,
                totalDrawMa: res.result.totalDrawMa,
                usingFallback: mgr.isUsingFallback,
            });
        } catch (err) {
            set({
                isAnalyzing: false,
                lastError: err instanceof Error ? err.message : String(err),
            });
        }
    },

    traverse: async (graph, startNodeId, direction = 'both') => {
        set({ isTraversing: true, lastError: null });
        try {
            const mgr = getWorkerManager();
            const res = await mgr.traverse(graph, startNodeId, direction);

            if ('error' in res) {
                set({ isTraversing: false, lastError: (res as { error: string }).error });
                return;
            }

            set({
                isTraversing: false,
                traverseResult: res.result,
                usingFallback: mgr.isUsingFallback,
            });
        } catch (err) {
            set({
                isTraversing: false,
                lastError: err instanceof Error ? err.message : String(err),
            });
        }
    },

    reset: () => set(initialState),
}));
