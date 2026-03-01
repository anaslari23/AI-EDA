import { create } from 'zustand';
import type { CircuitState } from '../engine/graph/models';
import { circuitReducer, initialCircuitState } from './operations';
import type { CircuitAction } from './operations';

interface CircuitOperationStore {
  state: CircuitState;
  lastAction: CircuitAction | null;
  actionCount: number;
  dispatch: (action: CircuitAction) => void;
  dispatchBatch: (actions: CircuitAction[]) => void;
}

export const useCircuitOperationStore = create<CircuitOperationStore>((set) => ({
  state: initialCircuitState,
  lastAction: null,
  actionCount: 0,

  dispatch: (action) =>
    set((current) => ({
      state: circuitReducer(current.state, action),
      lastAction: action,
      actionCount: current.actionCount + 1,
    })),

  dispatchBatch: (actions) =>
    set((current) => ({
      state: actions.reduce(circuitReducer, current.state),
      lastAction: actions.length > 0 ? actions[actions.length - 1] : current.lastAction,
      actionCount: current.actionCount + actions.length,
    })),
}));
