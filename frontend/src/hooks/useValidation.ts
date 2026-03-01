/**
 * useValidation — local worker-backed circuit validation.
 *
 * No backend validation endpoint usage.
 */

import { useCallback, useRef, useState } from 'react';

import type { CircuitGraph, ValidationResult } from '../types/schema';
import type { SerializableCircuitGraph } from '../workers/protocol';
import { useWorkerStore } from '../workers/useWorker';

const DEBOUNCE_MS = 300;

export interface ValidationState {
  status: 'idle' | 'validating' | 'done' | 'error';
  result: ValidationResult | null;
  lastValidated: number | null;
  wsConnected: boolean;
  error: string | null;
}

function toSerializableGraph(graph: CircuitGraph): SerializableCircuitGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    power_rails: graph.power_rails,
    ground_net: graph.ground_net,
  };
}

function toLegacyValidationResult(
  issues: Array<{ type: string; severity: 'warning' | 'error'; message: string; affectedNodes: string[] }>,
): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error').map((i) => ({
    code: i.type,
    severity: 'error' as const,
    message: i.message,
    node_ids: i.affectedNodes,
    suggestion: null,
  }));

  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => ({
    code: i.type,
    severity: 'warning' as const,
    message: i.message,
    node_ids: i.affectedNodes,
    suggestion: null,
  }));

  return {
    status: errors.length > 0 ? 'INVALID' : 'VALID',
    errors,
    warnings,
    checks_passed: Math.max(0, 8 - errors.length - warnings.length),
    checks_total: 8,
  };
}

export function useValidation() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<ValidationState>({
    status: 'idle',
    result: null,
    lastValidated: null,
    wsConnected: false,
    error: null,
  });

  const validateGraph = useCallback((graph: CircuitGraph) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setState((s) => ({ ...s, status: 'validating', error: null }));

      try {
        const worker = useWorkerStore.getState();
        await worker.validate(toSerializableGraph(graph));

        const workerState = useWorkerStore.getState();
        if (workerState.lastError) {
          setState((s) => ({ ...s, status: 'error', error: workerState.lastError }));
          return;
        }

        setState((s) => ({
          ...s,
          status: 'done',
          result: toLegacyValidationResult(workerState.validationIssues),
          lastValidated: Date.now(),
          error: null,
        }));
      } catch (error) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }, DEBOUNCE_MS);
  }, []);

  const validatePersisted = useCallback(async (graph: CircuitGraph) => {
    validateGraph(graph);
    return null;
  }, [validateGraph]);

  const connect = useCallback(() => {
    setState((s) => ({ ...s, wsConnected: false }));
  }, []);

  const disconnect = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setState((s) => ({ ...s, status: 'idle', wsConnected: false }));
  }, []);

  return {
    ...state,
    validateGraph,
    validatePersisted,
    connect,
    disconnect,
  };
}

export default useValidation;
