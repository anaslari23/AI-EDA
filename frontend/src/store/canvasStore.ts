import { create } from 'zustand';
import type {
    CanvasNode,
    Edge,
    Pin,
    Position,
    Viewport,
    InteractionMode,
    WireDrawingState,
    TooltipState,
    SnapTarget,
    EdgeState,
} from '../canvas/types';
import { MIN_ZOOM, MAX_ZOOM } from '../canvas/types';
import { computeOrthogonalRoute } from '../canvas/utils/routing';

/* ─── State Shape ─── */

interface CanvasState {
    // Graph data
    nodes: CanvasNode[];
    edges: Edge[];

    // Viewport
    viewport: Viewport;

    // Interaction
    mode: InteractionMode;
    selectedNodeIds: Set<string>;
    hoveredPinId: string | null;

    // Wire drawing
    wireDrawing: WireDrawingState;

    // Tooltip
    tooltip: TooltipState;

    // Dirty flag (for re-render)
    renderTick: number;
}

interface CanvasActions {
    // ─── Graph mutations ───
    setNodes: (nodes: CanvasNode[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (node: CanvasNode) => void;
    removeNode: (nodeId: string) => void;
    moveNode: (nodeId: string, position: Position) => void;
    updateNodeError: (nodeId: string, hasError: boolean) => void;

    addEdge: (edge: Edge) => void;
    removeEdge: (edgeId: string) => void;
    setEdgeState: (edgeId: string, state: EdgeState) => void;
    recalculateEdgeRoutes: () => void;

    // ─── Viewport ───
    setViewport: (viewport: Partial<Viewport>) => void;
    zoomAt: (delta: number, center: Position) => void;
    panBy: (dx: number, dy: number) => void;
    resetViewport: () => void;

    // ─── Interaction ───
    setMode: (mode: InteractionMode) => void;
    selectNode: (nodeId: string, additive?: boolean) => void;
    deselectAll: () => void;
    setHoveredPin: (pinId: string | null) => void;

    // ─── Wire drawing ───
    startWire: (pinId: string, nodeId: string) => void;
    updateWirePath: (currentPos: Position) => void;
    setSnapTarget: (target: SnapTarget | null) => void;
    finishWire: (targetPinId: string, targetNodeId: string) => void;
    cancelWire: () => void;

    // ─── Tooltip ───
    showTooltip: (pin: Pin, screenPos: Position) => void;
    hideTooltip: () => void;

    // ─── Utility ───
    getPinWorldPosition: (pinId: string) => Position | null;
    getNodeById: (nodeId: string) => CanvasNode | undefined;
    getPinById: (pinId: string) => { pin: Pin; node: CanvasNode } | null;
    requestRender: () => void;
    clearAll: () => void;
}

export type CanvasStore = CanvasState & CanvasActions;

/* ─── Initial State ─── */

const initialWireDrawing: WireDrawingState = {
    active: false,
    sourcePinId: null,
    sourceNodeId: null,
    currentPath: [],
    snapTarget: null,
};

const initialTooltip: TooltipState = {
    visible: false,
    pin: null,
    screenPosition: { x: 0, y: 0 },
};

/* ─── Store ─── */

export const useCanvasStore = create<CanvasStore>((set, get) => ({
    // State
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    mode: 'select',
    selectedNodeIds: new Set<string>(),
    hoveredPinId: null,
    wireDrawing: initialWireDrawing,
    tooltip: initialTooltip,
    renderTick: 0,

    // ─── Graph Mutations ───

    setNodes: (nodes) => set({ nodes, renderTick: get().renderTick + 1 }),

    setEdges: (edges) =>
        set((s) => {
            const connected = new Set<string>();
            for (const edge of edges) {
                connected.add(edge.sourcePinId);
                connected.add(edge.targetPinId);
            }

            const nodes = s.nodes.map((node) => ({
                ...node,
                pins: node.pins.map((pin) => ({
                    ...pin,
                    connected: connected.has(pin.id),
                })),
            }));

            return { edges, nodes, renderTick: s.renderTick + 1 };
        }),

    addNode: (node) =>
        set((s) => ({ nodes: [...s.nodes, node], renderTick: s.renderTick + 1 })),

    removeNode: (nodeId) =>
        set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== nodeId),
            edges: s.edges.filter(
                (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
            ),
            renderTick: s.renderTick + 1,
        })),

    moveNode: (nodeId, position) =>
        set((s) => {
            const nodes = s.nodes.map((n) =>
                n.id === nodeId ? { ...n, position } : n
            );
            // Recalculate edges connected to this node
            const edges = s.edges.map((e) => {
                if (e.sourceNodeId === nodeId || e.targetNodeId === nodeId) {
                    const srcPin = findPin(nodes, e.sourcePinId);
                    const tgtPin = findPin(nodes, e.targetPinId);
                    if (srcPin && tgtPin) {
                        const srcWorld = pinToWorld(srcPin.pin, srcPin.node);
                        const tgtWorld = pinToWorld(tgtPin.pin, tgtPin.node);
                        const waypoints = computeOrthogonalRoute(srcWorld, tgtWorld);
                        return {
                            ...e,
                            waypoints,
                            segments: waypointsToSegments(waypoints),
                        };
                    }
                }
                return e;
            });
            return { nodes, edges, renderTick: s.renderTick + 1 };
        }),

    updateNodeError: (nodeId, hasError) =>
        set((s) => ({
            nodes: s.nodes.map((n) =>
                n.id === nodeId ? { ...n, hasError } : n
            ),
            renderTick: s.renderTick + 1,
        })),

    addEdge: (edge) => {
        const state = get();
        // Mark pins as connected
        const nodes = state.nodes.map((n) => ({
            ...n,
            pins: n.pins.map((p) =>
                p.id === edge.sourcePinId || p.id === edge.targetPinId
                    ? { ...p, connected: true }
                    : p
            ),
        }));
        set({
            edges: [...state.edges, edge],
            nodes,
            renderTick: state.renderTick + 1,
        });
    },

    removeEdge: (edgeId) =>
        set((s) => {
            const edge = s.edges.find((e) => e.id === edgeId);
            const remaining = s.edges.filter((e) => e.id !== edgeId);
            let nodes = s.nodes;
            if (edge) {
                // Check if pins still have other connections
                const srcStillConnected = remaining.some(
                    (e) => e.sourcePinId === edge.sourcePinId || e.targetPinId === edge.sourcePinId
                );
                const tgtStillConnected = remaining.some(
                    (e) => e.sourcePinId === edge.targetPinId || e.targetPinId === edge.targetPinId
                );
                nodes = nodes.map((n) => ({
                    ...n,
                    pins: n.pins.map((p) => {
                        if (p.id === edge.sourcePinId) return { ...p, connected: srcStillConnected };
                        if (p.id === edge.targetPinId) return { ...p, connected: tgtStillConnected };
                        return p;
                    }),
                }));
            }
            return { edges: remaining, nodes, renderTick: s.renderTick + 1 };
        }),

    setEdgeState: (edgeId, state) =>
        set((s) => ({
            edges: s.edges.map((e) => (e.id === edgeId ? { ...e, state } : e)),
            renderTick: s.renderTick + 1,
        })),

    recalculateEdgeRoutes: () =>
        set((s) => {
            const edges = s.edges.map((e) => {
                const srcPin = findPin(s.nodes, e.sourcePinId);
                const tgtPin = findPin(s.nodes, e.targetPinId);
                if (srcPin && tgtPin) {
                    const srcWorld = pinToWorld(srcPin.pin, srcPin.node);
                    const tgtWorld = pinToWorld(tgtPin.pin, tgtPin.node);
                    const waypoints = computeOrthogonalRoute(srcWorld, tgtWorld);
                    return { ...e, waypoints, segments: waypointsToSegments(waypoints) };
                }
                return e;
            });
            return { edges, renderTick: s.renderTick + 1 };
        }),

    // ─── Viewport ───

    setViewport: (viewport) =>
        set((s) => ({
            viewport: { ...s.viewport, ...viewport },
            renderTick: s.renderTick + 1,
        })),

    zoomAt: (delta, center) =>
        set((s) => {
            const oldZoom = s.viewport.zoom;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * (1 + delta)));
            const ratio = newZoom / oldZoom;
            return {
                viewport: {
                    x: center.x - (center.x - s.viewport.x) * ratio,
                    y: center.y - (center.y - s.viewport.y) * ratio,
                    zoom: newZoom,
                },
                renderTick: s.renderTick + 1,
            };
        }),

    panBy: (dx, dy) =>
        set((s) => ({
            viewport: {
                ...s.viewport,
                x: s.viewport.x + dx,
                y: s.viewport.y + dy,
            },
            renderTick: s.renderTick + 1,
        })),

    resetViewport: () =>
        set({ viewport: { x: 0, y: 0, zoom: 1 }, renderTick: get().renderTick + 1 }),

    // ─── Interaction ───

    setMode: (mode) => set({ mode }),

    selectNode: (nodeId, additive = false) =>
        set((s) => {
            const next = new Set(additive ? s.selectedNodeIds : []);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            const nodes = s.nodes.map((n) => ({
                ...n,
                selected: next.has(n.id),
            }));
            return { selectedNodeIds: next, nodes, renderTick: s.renderTick + 1 };
        }),

    deselectAll: () =>
        set((s) => ({
            selectedNodeIds: new Set<string>(),
            nodes: s.nodes.map((n) => ({ ...n, selected: false })),
            renderTick: s.renderTick + 1,
        })),

    setHoveredPin: (pinId) => set({ hoveredPinId: pinId }),

    // ─── Wire Drawing ───

    startWire: (pinId, nodeId) =>
        set({
            wireDrawing: {
                active: true,
                sourcePinId: pinId,
                sourceNodeId: nodeId,
                currentPath: [],
                snapTarget: null,
            },
            mode: 'wire',
        }),

    updateWirePath: (currentPos) =>
        set((s) => {
            if (!s.wireDrawing.active || !s.wireDrawing.sourcePinId) return s;
            const srcPin = findPin(s.nodes, s.wireDrawing.sourcePinId);
            if (!srcPin) return s;
            const srcWorld = pinToWorld(srcPin.pin, srcPin.node);
            const path = computeOrthogonalRoute(srcWorld, currentPos);
            return {
                wireDrawing: { ...s.wireDrawing, currentPath: path },
                renderTick: s.renderTick + 1,
            };
        }),

    setSnapTarget: (target) =>
        set((s) => ({
            wireDrawing: { ...s.wireDrawing, snapTarget: target },
        })),

    finishWire: (targetPinId, targetNodeId) => {
        const state = get();
        const wd = state.wireDrawing;
        if (!wd.sourcePinId || !wd.sourceNodeId) return;

        // Prevent self-connection
        if (wd.sourceNodeId === targetNodeId) {
            get().cancelWire();
            return;
        }

        // Prevent duplicate edges
        const exists = state.edges.some(
            (e) =>
                (e.sourcePinId === wd.sourcePinId && e.targetPinId === targetPinId) ||
                (e.sourcePinId === targetPinId && e.targetPinId === wd.sourcePinId)
        );
        if (exists) {
            get().cancelWire();
            return;
        }

        const srcPin = findPin(state.nodes, wd.sourcePinId);
        const tgtPin = findPin(state.nodes, targetPinId);

        if (!srcPin || !tgtPin) {
            get().cancelWire();
            return;
        }

        const srcWorld = pinToWorld(srcPin.pin, srcPin.node);
        const tgtWorld = pinToWorld(tgtPin.pin, tgtPin.node);
        const waypoints = computeOrthogonalRoute(srcWorld, tgtWorld);

        const edge: Edge = {
            id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            sourcePinId: wd.sourcePinId,
            targetPinId: targetPinId,
            sourceNodeId: wd.sourceNodeId,
            targetNodeId: targetNodeId,
            netName: `NET_${state.edges.length}`,
            signalType: srcPin.pin.signalType,
            state: 'valid',
            waypoints,
            segments: waypointsToSegments(waypoints),
        };

        get().addEdge(edge);
        set({
            wireDrawing: initialWireDrawing,
            mode: 'select',
        });
    },

    cancelWire: () =>
        set({
            wireDrawing: initialWireDrawing,
            mode: 'select',
            renderTick: get().renderTick + 1,
        }),

    // ─── Tooltip ───

    showTooltip: (pin, screenPos) =>
        set({ tooltip: { visible: true, pin, screenPosition: screenPos } }),

    hideTooltip: () =>
        set({ tooltip: initialTooltip }),

    // ─── Utility ───

    getPinWorldPosition: (pinId) => {
        const result = findPin(get().nodes, pinId);
        if (!result) return null;
        return pinToWorld(result.pin, result.node);
    },

    getNodeById: (nodeId) => get().nodes.find((n) => n.id === nodeId),

    getPinById: (pinId) => findPin(get().nodes, pinId),

    requestRender: () =>
        set((s) => ({ renderTick: s.renderTick + 1 })),

    clearAll: () =>
        set({
            nodes: [],
            edges: [],
            selectedNodeIds: new Set<string>(),
            wireDrawing: initialWireDrawing,
            tooltip: initialTooltip,
            renderTick: get().renderTick + 1,
        }),
}));

/* ─── Helpers ─── */

function findPin(
    nodes: CanvasNode[],
    pinId: string
): { pin: Pin; node: CanvasNode } | null {
    for (const node of nodes) {
        const pin = node.pins.find((p) => p.id === pinId);
        if (pin) return { pin, node };
    }
    return null;
}

function pinToWorld(pin: Pin, node: CanvasNode): Position {
    return {
        x: node.position.x + pin.offset.x,
        y: node.position.y + pin.offset.y,
    };
}

function waypointsToSegments(
    waypoints: Position[]
): { start: Position; end: Position }[] {
    const segments: { start: Position; end: Position }[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        segments.push({ start: waypoints[i], end: waypoints[i + 1] });
    }
    return segments;
}
