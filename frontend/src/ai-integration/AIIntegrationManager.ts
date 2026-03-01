import { useCircuitStore } from '../engine/graph/circuitStore';
import { diffSuggestion } from '../engine/ai/diffEngine';
import { getAcceptedIds, mergeSuggestion } from '../engine/ai/mergeEngine';
import type { AISuggestion, SuggestionPreviewItem, UserEditLog } from '../engine/ai/types';
import type { CircuitState } from '../engine/graph/models';

function getCircuitState(): CircuitState {
  const state = useCircuitStore.getState();
  return {
    nodes: state.nodes,
    nets: state.nets,
    edges: state.edges,
    voltageDomains: state.voltageDomains,
    groundNetId: state.groundNetId,
    version: state.version,
    isDirty: state.isDirty,
  };
}

export class AIIntegrationManager {
  preview(suggestion: AISuggestion, userEdits: UserEditLog) {
    const current = getCircuitState();
    return diffSuggestion(suggestion, current, userEdits);
  }

  commitAccepted(diff: ReturnType<typeof diffSuggestion>, items: SuggestionPreviewItem[]): void {
    const current = getCircuitState();
    const acceptedIds = getAcceptedIds(items);
    const mergeResult = mergeSuggestion(current, diff, acceptedIds);

    useCircuitStore.getState().loadSnapshot({
      nodes: Object.values(mergeResult.newState.nodes),
      nets: Object.values(mergeResult.newState.nets),
      edges: Object.values(mergeResult.newState.edges),
      voltageDomains: Object.values(mergeResult.newState.voltageDomains),
      groundNetId: mergeResult.newState.groundNetId,
      version: mergeResult.newState.version,
    });
  }
}
