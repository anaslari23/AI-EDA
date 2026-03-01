import { produce } from 'immer';

import type {
  ComponentNode,
  CircuitSnapshot,
  CircuitState,
  GraphPin,
  Net,
} from '../engine/graph/models';

import {
  mergeNets,
  rebuildVoltageDomains,
} from '../engine/graph/netOperations';

import { checkConnection } from '../engine/graph/pinValidation';

export type CircuitAction =
  | { type: 'ADD_COMPONENT'; node: ComponentNode }
  | { type: 'REMOVE_COMPONENT'; nodeId: string }
  | { type: 'UPDATE_COMPONENT'; nodeId: string; updates: Partial<ComponentNode> }
  | { type: 'CONNECT_PINS'; sourcePinId: string; targetPinId: string }
  | { type: 'DISCONNECT_EDGE'; edgeId: string }
  | { type: 'RENAME_NET'; netId: string; name: string }
  | { type: 'REBUILD_DOMAINS' }
  | { type: 'LOAD_SNAPSHOT'; snapshot: CircuitSnapshot }
  | { type: 'RESET' };

export const initialCircuitState: CircuitState = {
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

function applyConnect(
  draft: CircuitState,
  sourcePinId: string,
  targetPinId: string,
): void {
  const src = findPinInState(draft, sourcePinId);
  const tgt = findPinInState(draft, targetPinId);
  if (!src || !tgt) return;

  const check = checkConnection(src.pin, tgt.pin, draft);
  if (!check.allowed || !check.mergeInfo) return;

  const mi = check.mergeInfo;

  let resultNet: Net;
  if (mi.sourceNetId && mi.targetNetId) {
    const netA = draft.nets[mi.sourceNetId];
    const netB = draft.nets[mi.targetNetId];
    resultNet = mergeNets(netA, netB);
    draft.nets[mi.sourceNetId] = resultNet;

    for (const pinId of netB.pinIds) {
      const pinRef = findPinInState(draft, pinId);
      if (pinRef) pinRef.pin.netId = resultNet.id;
    }
    delete draft.nets[mi.targetNetId];
  } else if (mi.sourceNetId) {
    resultNet = draft.nets[mi.sourceNetId];
    resultNet.pinIds = [...new Set([...resultNet.pinIds, targetPinId])];
    resultNet.dirty = true;
  } else if (mi.targetNetId) {
    resultNet = draft.nets[mi.targetNetId];
    resultNet.pinIds = [...new Set([...resultNet.pinIds, sourcePinId])];
    resultNet.dirty = true;
  } else {
    resultNet = {
      id: mi.resultNetId,
      name: mi.resultNetName,
      pinIds: [sourcePinId, targetPinId],
      signalType: src.pin.signalType,
      voltage: src.pin.voltage ?? tgt.pin.voltage,
      voltageDomain: src.pin.voltageDomain ?? tgt.pin.voltageDomain,
      dirty: true,
    };
    draft.nets[resultNet.id] = resultNet;
  }

  src.pin.netId = resultNet.id;
  tgt.pin.netId = resultNet.id;

  if (resultNet.voltage != null) {
    for (const pinId of resultNet.pinIds) {
      const pinRef = findPinInState(draft, pinId);
      if (pinRef) pinRef.pin.voltage = resultNet.voltage;
    }
  }

  const edgeId = `edge_${draft.version}_${sourcePinId.slice(-4)}`;
  draft.edges[edgeId] = {
    id: edgeId,
    sourcePinId,
    targetPinId,
    sourceNodeId: src.node.id,
    targetNodeId: tgt.node.id,
    netId: resultNet.id,
  };

  if (resultNet.signalType === 'ground' && !draft.groundNetId) {
    draft.groundNetId = resultNet.id;
  }

  draft.version++;
  draft.isDirty = true;
}

function applyDisconnect(draft: CircuitState, edgeId: string): void {
  const edge = draft.edges[edgeId];
  if (!edge) return;

  const net = draft.nets[edge.netId];
  delete draft.edges[edgeId];

  if (net) {
    const usedPinIds = new Set<string>();
    for (const e of Object.values(draft.edges)) {
      if (e.netId === net.id) {
        usedPinIds.add(e.sourcePinId);
        usedPinIds.add(e.targetPinId);
      }
    }

    net.pinIds = net.pinIds.filter((pinId) => usedPinIds.has(pinId));

    if (net.pinIds.length === 0) {
      if (draft.groundNetId === net.id) draft.groundNetId = null;
      delete draft.nets[net.id];
    } else {
      net.dirty = true;
    }
  }

  const src = findPinInState(draft, edge.sourcePinId);
  const tgt = findPinInState(draft, edge.targetPinId);
  if (src && src.pin.netId === edge.netId) src.pin.netId = null;
  if (tgt && tgt.pin.netId === edge.netId) tgt.pin.netId = null;

  draft.version++;
  draft.isDirty = true;
}

export function circuitReducer(state: CircuitState, action: CircuitAction): CircuitState {
  return produce(state, (draft) => {
    switch (action.type) {
      case 'ADD_COMPONENT':
        draft.nodes[action.node.id] = action.node;
        draft.version++;
        draft.isDirty = true;
        break;

      case 'REMOVE_COMPONENT': {
        const node = draft.nodes[action.nodeId];
        if (!node) break;

        for (const [edgeId, edge] of Object.entries(draft.edges)) {
          if (edge.sourceNodeId === action.nodeId || edge.targetNodeId === action.nodeId) {
            delete draft.edges[edgeId];
          }
        }

        for (const pin of node.pins) {
          if (pin.netId && draft.nets[pin.netId]) {
            const net = draft.nets[pin.netId];
            net.pinIds = net.pinIds.filter((id) => id !== pin.id);
            if (net.pinIds.length === 0) {
              delete draft.nets[pin.netId];
            } else {
              net.dirty = true;
            }
          }
        }

        delete draft.nodes[action.nodeId];
        draft.version++;
        draft.isDirty = true;
        break;
      }

      case 'UPDATE_COMPONENT': {
        const node = draft.nodes[action.nodeId];
        if (!node) break;
        Object.assign(node, action.updates);
        draft.version++;
        draft.isDirty = true;
        break;
      }

      case 'CONNECT_PINS':
        applyConnect(draft, action.sourcePinId, action.targetPinId);
        break;

      case 'DISCONNECT_EDGE':
        applyDisconnect(draft, action.edgeId);
        break;

      case 'RENAME_NET': {
        const net = draft.nets[action.netId];
        if (!net) break;
        net.name = action.name;
        net.dirty = true;
        draft.version++;
        draft.isDirty = true;
        break;
      }

      case 'REBUILD_DOMAINS':
        draft.voltageDomains = rebuildVoltageDomains(draft);
        draft.version++;
        draft.isDirty = true;
        break;

      case 'LOAD_SNAPSHOT':
        draft.nodes = Object.fromEntries(action.snapshot.nodes.map((node) => [node.id, node]));
        draft.nets = Object.fromEntries(action.snapshot.nets.map((net) => [net.id, net]));
        draft.edges = Object.fromEntries(action.snapshot.edges.map((edge) => [edge.id, edge]));
        draft.voltageDomains = Object.fromEntries(
          action.snapshot.voltageDomains.map((domain) => [domain.id, domain]),
        );
        draft.groundNetId = action.snapshot.groundNetId;
        draft.version = action.snapshot.version;
        draft.isDirty = false;
        break;

      case 'RESET':
        draft.nodes = {};
        draft.nets = {};
        draft.edges = {};
        draft.voltageDomains = {};
        draft.groundNetId = null;
        draft.version = 0;
        draft.isDirty = false;
        break;
    }
  });
}
