/**
 * Circuit Graph Store — operation-dispatch facade.
 *
 * All graph writes go through `useCircuitOperationStore` reducer actions.
 * This store remains the compatibility layer for existing callers.
 */

import { create } from 'zustand';

import type {
  CircuitState,
  CircuitSnapshot,
  ComponentNode,
  GraphPin,
  Net,
  ConnectionCheckResult,
} from './models';

import { checkConnection } from './pinValidation';
import { useCircuitOperationStore } from '../../store/operationStore';
import type { CircuitAction } from '../../store/operations';

interface CircuitActions {
  addComponent(node: ComponentNode): void;
  removeComponent(nodeId: string): void;
  updateComponent(nodeId: string, updates: Partial<ComponentNode>): void;

  canConnect(sourcePinId: string, targetPinId: string): ConnectionCheckResult;
  connect(sourcePinId: string, targetPinId: string): boolean;
  disconnect(edgeId: string): void;

  renameNet(netId: string, name: string): void;
  rebuildDomains(): void;

  getSnapshot(): CircuitSnapshot;
  loadSnapshot(snapshot: CircuitSnapshot): void;

  findPin(pinId: string): { pin: GraphPin; node: ComponentNode } | null;
  getNetForPin(pinId: string): Net | null;
  reset(): void;
}

export type CircuitStore = CircuitState & CircuitActions;

const initialState: CircuitState = {
  nodes: {},
  nets: {},
  edges: {},
  voltageDomains: {},
  groundNetId: null,
  version: 0,
  isDirty: false,
};

function findPinInState(
  state: CircuitState,
  pinId: string,
): { pin: GraphPin; node: ComponentNode } | null {
  for (const node of Object.values(state.nodes)) {
    const pin = node.pins.find((p) => p.id === pinId);
    if (pin) return { pin, node };
  }
  return null;
}

function pullReducerState(): CircuitState {
  return useCircuitOperationStore.getState().state;
}

function dispatchAction(action: CircuitAction): CircuitState {
  const opStore = useCircuitOperationStore.getState();
  opStore.dispatch(action);
  return useCircuitOperationStore.getState().state;
}

export const useCircuitStore = create<CircuitStore>((set, get) => ({
  ...initialState,

  addComponent: (node) => {
    const next = dispatchAction({ type: 'ADD_COMPONENT', node });
    set(next);
  },

  removeComponent: (nodeId) => {
    const next = dispatchAction({ type: 'REMOVE_COMPONENT', nodeId });
    set(next);
  },

  updateComponent: (nodeId, updates) => {
    const next = dispatchAction({ type: 'UPDATE_COMPONENT', nodeId, updates });
    set(next);
  },

  canConnect: (sourcePinId, targetPinId) => {
    const state = pullReducerState();
    const src = findPinInState(state, sourcePinId);
    const tgt = findPinInState(state, targetPinId);

    if (!src || !tgt) {
      return { allowed: false, reason: 'Pin not found', mergeInfo: null };
    }

    return checkConnection(src.pin, tgt.pin, state);
  },

  connect: (sourcePinId, targetPinId) => {
    const before = pullReducerState().version;
    const allowed = get().canConnect(sourcePinId, targetPinId);
    if (!allowed.allowed) return false;

    const next = dispatchAction({ type: 'CONNECT_PINS', sourcePinId, targetPinId });
    set(next);
    return next.version !== before;
  },

  disconnect: (edgeId) => {
    const next = dispatchAction({ type: 'DISCONNECT_EDGE', edgeId });
    set(next);
  },

  renameNet: (netId, name) => {
    const next = dispatchAction({ type: 'RENAME_NET', netId, name });
    set(next);
  },

  rebuildDomains: () => {
    const next = dispatchAction({ type: 'REBUILD_DOMAINS' });
    set(next);
  },

  getSnapshot: () => {
    const state = pullReducerState();
    return {
      nodes: Object.values(state.nodes),
      nets: Object.values(state.nets),
      edges: Object.values(state.edges),
      voltageDomains: Object.values(state.voltageDomains),
      groundNetId: state.groundNetId,
      version: state.version,
    };
  },

  loadSnapshot: (snapshot) => {
    const next = dispatchAction({ type: 'LOAD_SNAPSHOT', snapshot });
    set(next);
  },

  findPin: (pinId) => {
    return findPinInState(pullReducerState(), pinId);
  },

  getNetForPin: (pinId) => {
    const found = findPinInState(pullReducerState(), pinId);
    if (!found || !found.pin.netId) return null;
    return pullReducerState().nets[found.pin.netId] ?? null;
  },

  reset: () => {
    const next = dispatchAction({ type: 'RESET' });
    set(next);
  },
}));
