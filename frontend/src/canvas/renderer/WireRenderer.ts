import { Graphics } from 'pixi.js';
import {
    DEFAULT_THEME,
    type Edge,
    type EdgeState,
    type Viewport,
    type WireDrawingState,
} from '../types';

const WIRE_COLORS: Record<EdgeState, number> = {
    valid: DEFAULT_THEME.wireValid,
    invalid: DEFAULT_THEME.wireInvalid,
    drawing: DEFAULT_THEME.wireDrawing,
    highlighted: DEFAULT_THEME.wireHighlight,
};

const WIRE_WIDTHS: Record<EdgeState, number> = {
    valid: 2,
    invalid: 2.5,
    drawing: 1.5,
    highlighted: 3,
};

/**
 * Render all committed wires (edges).
 */
export function renderEdges(
    graphics: Graphics,
    edges: Edge[],
    viewport: Viewport
): void {
    const { x: vx, y: vy, zoom } = viewport;

    for (const edge of edges) {
        if (edge.waypoints.length < 2) continue;

        const color = WIRE_COLORS[edge.state];
        const width = WIRE_WIDTHS[edge.state] * zoom;
        const alpha = edge.state === 'invalid' ? 0.8 : 1;

        const first = edge.waypoints[0];
        graphics.moveTo(first.x * zoom + vx, first.y * zoom + vy);

        for (let i = 1; i < edge.waypoints.length; i++) {
            const wp = edge.waypoints[i];
            graphics.lineTo(wp.x * zoom + vx, wp.y * zoom + vy);
        }

        graphics.stroke({ width, color, alpha });

        // Draw junction dots at waypoints
        for (const wp of edge.waypoints) {
            graphics.circle(wp.x * zoom + vx, wp.y * zoom + vy, 2.5 * zoom);
            graphics.fill({ color, alpha: 0.5 });
        }
    }
}

/**
 * Render the wire currently being drawn.
 */
export function renderDrawingWire(
    graphics: Graphics,
    wireDrawing: WireDrawingState,
    viewport: Viewport
): void {
    if (!wireDrawing.active || wireDrawing.currentPath.length < 2) return;

    const { x: vx, y: vy, zoom } = viewport;
    const color = DEFAULT_THEME.wireDrawing;
    const snapColor = DEFAULT_THEME.pinSnap;
    const hasSnap = wireDrawing.snapTarget !== null;

    const first = wireDrawing.currentPath[0];
    graphics.moveTo(first.x * zoom + vx, first.y * zoom + vy);

    for (let i = 1; i < wireDrawing.currentPath.length; i++) {
        const wp = wireDrawing.currentPath[i];
        graphics.lineTo(wp.x * zoom + vx, wp.y * zoom + vy);
    }

    graphics.stroke({
        width: 2 * zoom,
        color: hasSnap ? snapColor : color,
        alpha: 0.8,
    });

    // Animated snap indicator
    if (hasSnap) {
        const target = wireDrawing.snapTarget!;
        const sx = target.worldPosition.x * zoom + vx;
        const sy = target.worldPosition.y * zoom + vy;

        // Outer pulse ring
        graphics.circle(sx, sy, 12 * zoom);
        graphics.stroke({ width: 2, color: snapColor, alpha: 0.4 });

        // Inner dot
        graphics.circle(sx, sy, 4 * zoom);
        graphics.fill({ color: snapColor, alpha: 0.9 });
    }
}
