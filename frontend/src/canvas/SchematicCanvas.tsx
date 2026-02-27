import { useEffect, useRef, useCallback } from 'react';
import { Application, Graphics, Container } from 'pixi.js';
import { useCanvasStore } from '../store/canvasStore';
import { useDesignStore } from '../store/designStore';
import { renderGrid } from './renderer/GridRenderer';
import {
    renderNode,
    createNodeLabels,
    renderPins,
    createPinLabels,
} from './renderer/NodeRenderer';
import { renderEdges, renderDrawingWire } from './renderer/WireRenderer';
import { findSnapTarget, hitTestPin, hitTestNode } from './interaction/SnapEngine';
import { screenToWorld } from './utils/routing';
import { circuitGraphToCanvasNodes } from './utils/converter';
import { DEFAULT_THEME } from './types';

export default function SchematicCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);

    // Refs for render loop access (avoid stale closures)
    const storeRef = useRef(useCanvasStore.getState());

    // Layers
    const gridLayerRef = useRef<Graphics | null>(null);
    const wireLayerRef = useRef<Graphics | null>(null);
    const nodeLayerRef = useRef<Graphics | null>(null);
    const pinLayerRef = useRef<Graphics | null>(null);
    const drawingLayerRef = useRef<Graphics | null>(null);
    const textContainerRef = useRef<Container | null>(null);

    // Interaction state
    const isDragging = useRef(false);
    const isPanning = useRef(false);
    const dragStartWorld = useRef({ x: 0, y: 0 });
    const dragNodeId = useRef<string | null>(null);
    const lastPointerPos = useRef({ x: 0, y: 0 });

    // Sync pipeline result → canvas nodes
    const pipelineResult = useDesignStore((s) => s.pipelineResult);
    useEffect(() => {
        if (!pipelineResult?.circuit) return;
        const canvasNodes = circuitGraphToCanvasNodes(pipelineResult.circuit);
        useCanvasStore.getState().setNodes(canvasNodes);
        useCanvasStore.getState().recalculateEdgeRoutes();
    }, [pipelineResult]);

    // Subscribe to store changes
    useEffect(() => {
        const unsub = useCanvasStore.subscribe((state) => {
            storeRef.current = state;
        });
        return unsub;
    }, []);

    // ─── Initialize PixiJS ───
    useEffect(() => {
        if (!containerRef.current) return;

        const app = new Application();
        let destroyed = false;

        const init = async () => {
            await app.init({
                background: DEFAULT_THEME.background,
                resizeTo: containerRef.current!,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            if (destroyed) return;

            containerRef.current!.innerHTML = '';
            containerRef.current!.appendChild(app.canvas as HTMLCanvasElement);
            appRef.current = app;

            // Create render layers
            const gridLayer = new Graphics();
            const wireLayer = new Graphics();
            const nodeLayer = new Graphics();
            const pinLayer = new Graphics();
            const drawingLayer = new Graphics();
            const textContainer = new Container();

            app.stage.addChild(gridLayer);
            app.stage.addChild(wireLayer);
            app.stage.addChild(nodeLayer);
            app.stage.addChild(pinLayer);
            app.stage.addChild(drawingLayer);
            app.stage.addChild(textContainer);

            gridLayerRef.current = gridLayer;
            wireLayerRef.current = wireLayer;
            nodeLayerRef.current = nodeLayer;
            pinLayerRef.current = pinLayer;
            drawingLayerRef.current = drawingLayer;
            textContainerRef.current = textContainer;

            // Make stage interactive
            app.stage.eventMode = 'static';
            app.stage.hitArea = app.screen;

            // Attach interaction handlers
            attachInteraction(app);

            // Start render loop
            app.ticker.add(renderFrame);
        };

        init();

        return () => {
            destroyed = true;
            app.destroy(true);
            appRef.current = null;
        };
    }, []);

    // ─── Render Frame ───
    const renderFrame = useCallback(() => {
        const app = appRef.current;
        if (!app) return;

        const state = storeRef.current;
        const { viewport, nodes, edges, wireDrawing, hoveredPinId } = state;
        const snapPinId = wireDrawing.snapTarget?.pinId ?? null;

        // Grid
        if (gridLayerRef.current) {
            renderGrid(gridLayerRef.current, app.screen.width, app.screen.height, viewport);
        }

        // Wires
        if (wireLayerRef.current) {
            wireLayerRef.current.clear();
            renderEdges(wireLayerRef.current, edges, viewport);
        }

        // Nodes
        if (nodeLayerRef.current) {
            nodeLayerRef.current.clear();
            for (const node of nodes) {
                renderNode(nodeLayerRef.current, node, viewport);
            }
        }

        // Pins
        if (pinLayerRef.current) {
            pinLayerRef.current.clear();
            for (const node of nodes) {
                renderPins(pinLayerRef.current, node, viewport, hoveredPinId, snapPinId);
            }
        }

        // Drawing wire
        if (drawingLayerRef.current) {
            drawingLayerRef.current.clear();
            renderDrawingWire(drawingLayerRef.current, wireDrawing, viewport);
        }

        // Text labels (recreate each frame — PixiJS Text is expensive, could optimize with caching)
        if (textContainerRef.current) {
            textContainerRef.current.removeChildren();

            for (const node of nodes) {
                const nodeLabels = createNodeLabels(node, viewport);
                for (const label of nodeLabels) {
                    textContainerRef.current.addChild(label);
                }

                const pinLabels = createPinLabels(node, viewport);
                for (const label of pinLabels) {
                    textContainerRef.current.addChild(label);
                }
            }
        }
    }, []);

    // ─── Interaction Handlers ───
    const attachInteraction = useCallback((app: Application) => {
        const canvas = app.canvas as HTMLCanvasElement;

        // ─── Wheel → Zoom ───
        canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const center = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
            const delta = -e.deltaY * 0.001;
            useCanvasStore.getState().zoomAt(delta, center);
        }, { passive: false });

        // ─── Pointer Down ───
        canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const state = useCanvasStore.getState();
            const { viewport } = state;
            const world = screenToWorld(sx, sy, viewport.x, viewport.y, viewport.zoom);

            lastPointerPos.current = { x: sx, y: sy };

            // Middle-click or space+click → pan
            if (e.button === 1 || (e.button === 0 && state.mode === 'pan')) {
                isPanning.current = true;
                canvas.style.cursor = 'grabbing';
                return;
            }

            // Left click
            if (e.button === 0) {
                // Hit test pin first
                const pinHit = hitTestPin(world, state.nodes);
                if (pinHit) {
                    if (state.wireDrawing.active) {
                        // Finish wire
                        state.finishWire(pinHit.pin.id, pinHit.node.id);
                    } else {
                        // Start wire
                        state.startWire(pinHit.pin.id, pinHit.node.id);
                    }
                    return;
                }

                // Cancel wire if clicking empty space during wire drawing
                if (state.wireDrawing.active) {
                    state.cancelWire();
                    return;
                }

                // Hit test node
                const nodeHit = hitTestNode(world, state.nodes);
                if (nodeHit) {
                    state.selectNode(nodeHit.id, e.shiftKey);
                    isDragging.current = true;
                    dragNodeId.current = nodeHit.id;
                    dragStartWorld.current = {
                        x: world.x - nodeHit.position.x,
                        y: world.y - nodeHit.position.y,
                    };
                    canvas.style.cursor = 'move';
                    return;
                }

                // Click empty space → deselect
                state.deselectAll();
            }

            // Right click → pan
            if (e.button === 2) {
                isPanning.current = true;
                canvas.style.cursor = 'grabbing';
            }
        });

        // ─── Pointer Move ───
        canvas.addEventListener('pointermove', (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const state = useCanvasStore.getState();
            const { viewport } = state;
            const world = screenToWorld(sx, sy, viewport.x, viewport.y, viewport.zoom);

            // Panning
            if (isPanning.current) {
                const dx = sx - lastPointerPos.current.x;
                const dy = sy - lastPointerPos.current.y;
                state.panBy(dx, dy);
                lastPointerPos.current = { x: sx, y: sy };
                return;
            }

            // Dragging node
            if (isDragging.current && dragNodeId.current) {
                state.moveNode(dragNodeId.current, {
                    x: world.x - dragStartWorld.current.x,
                    y: world.y - dragStartWorld.current.y,
                });
                return;
            }

            // Wire drawing → update path + snap
            if (state.wireDrawing.active) {
                state.updateWirePath(world);
                const snap = findSnapTarget(
                    world,
                    state.nodes,
                    state.wireDrawing.sourcePinId,
                    state.wireDrawing.sourceNodeId
                );
                state.setSnapTarget(snap);
                canvas.style.cursor = snap ? 'crosshair' : 'default';
                return;
            }

            // Hover detection
            const pinHit = hitTestPin(world, state.nodes, 8);
            if (pinHit) {
                state.setHoveredPin(pinHit.pin.id);
                state.showTooltip(pinHit.pin, { x: sx + 16, y: sy - 10 });
                canvas.style.cursor = 'crosshair';
            } else {
                if (state.hoveredPinId) {
                    state.setHoveredPin(null);
                    state.hideTooltip();
                }
                // Check node hover
                const nodeHit = hitTestNode(world, state.nodes);
                canvas.style.cursor = nodeHit ? 'pointer' : 'default';
            }
        });

        // ─── Pointer Up ───
        canvas.addEventListener('pointerup', () => {
            isDragging.current = false;
            isPanning.current = false;
            dragNodeId.current = null;
            canvas.style.cursor = 'default';
        });

        // ─── Keyboard ───
        const keyHandler = (e: KeyboardEvent) => {
            const state = useCanvasStore.getState();

            if (e.key === 'Escape') {
                if (state.wireDrawing.active) {
                    state.cancelWire();
                } else {
                    state.deselectAll();
                }
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Delete selected nodes
                for (const nodeId of state.selectedNodeIds) {
                    state.removeNode(nodeId);
                }
            }

            // Ctrl+0 → reset viewport
            if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                state.resetViewport();
            }
        };

        window.addEventListener('keydown', keyHandler);

        // Prevent context menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }, []);

    // ─── Tooltip Overlay ───
    const tooltip = useCanvasStore((s) => s.tooltip);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                borderRadius: '12px',
                overflow: 'hidden',
            }}
        >
            {tooltip.visible && tooltip.pin && (
                <div
                    className="canvas-tooltip"
                    style={{
                        position: 'absolute',
                        left: tooltip.screenPosition.x,
                        top: tooltip.screenPosition.y,
                        pointerEvents: 'none',
                        zIndex: 100,
                    }}
                >
                    <div className="canvas-tooltip__name">{tooltip.pin.label}</div>
                    <div className="canvas-tooltip__meta">
                        {tooltip.pin.direction} · {tooltip.pin.signalType}
                        {tooltip.pin.voltage !== undefined && ` · ${tooltip.pin.voltage}V`}
                    </div>
                    {tooltip.pin.connected && (
                        <div className="canvas-tooltip__connected">● Connected</div>
                    )}
                </div>
            )}
        </div>
    );
}
