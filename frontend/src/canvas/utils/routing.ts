import type { Position } from '../types';

/**
 * Compute orthogonal (Manhattan) route between two points.
 * Produces a path with only horizontal and vertical segments.
 * Uses a midpoint-split strategy for clean right-angle routing.
 */
export function computeOrthogonalRoute(
    start: Position,
    end: Position
): Position[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Same point
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        return [start, end];
    }

    // Purely horizontal or vertical
    if (Math.abs(dy) < 1) return [start, end];
    if (Math.abs(dx) < 1) return [start, end];

    // Standard L-route: go horizontal first, then vertical
    // Use midpoint for a cleaner Z-route when pins face each other
    const midX = start.x + dx / 2;

    return [
        start,
        { x: midX, y: start.y },
        { x: midX, y: end.y },
        end,
    ];
}

/**
 * Compute snapped position to grid.
 */
export function snapToGrid(pos: Position, gridSize: number): Position {
    return {
        x: Math.round(pos.x / gridSize) * gridSize,
        y: Math.round(pos.y / gridSize) * gridSize,
    };
}

/**
 * Screen coordinates → world coordinates.
 */
export function screenToWorld(
    screenX: number,
    screenY: number,
    viewportX: number,
    viewportY: number,
    zoom: number
): Position {
    return {
        x: (screenX - viewportX) / zoom,
        y: (screenY - viewportY) / zoom,
    };
}

/**
 * World coordinates → screen coordinates.
 */
export function worldToScreen(
    worldX: number,
    worldY: number,
    viewportX: number,
    viewportY: number,
    zoom: number
): Position {
    return {
        x: worldX * zoom + viewportX,
        y: worldY * zoom + viewportY,
    };
}

/**
 * Distance between two points.
 */
export function distance(a: Position, b: Position): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
