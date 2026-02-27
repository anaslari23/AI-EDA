import { Graphics } from 'pixi.js';
import {
    GRID_SIZE,
    GRID_MAJOR_EVERY,
    DEFAULT_THEME,
    type Viewport,
} from '../types';

/**
 * Renders an infinite dot/line grid that adapts to zoom level.
 * Major gridlines appear every GRID_MAJOR_EVERY cells.
 */
export function renderGrid(
    graphics: Graphics,
    width: number,
    height: number,
    viewport: Viewport
): void {
    graphics.clear();

    const { x: vx, y: vy, zoom } = viewport;
    const cellSize = GRID_SIZE * zoom;

    // Hide grid when zoomed out too far
    if (cellSize < 4) return;

    const majorEvery = GRID_MAJOR_EVERY;
    const majorSize = GRID_SIZE * majorEvery;

    // Calculate visible world bounds
    const worldLeft = -vx / zoom;
    const worldTop = -vy / zoom;
    const worldRight = (width - vx) / zoom;
    const worldBottom = (height - vy) / zoom;

    // Snap to grid boundaries
    const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
    const endX = Math.ceil(worldRight / GRID_SIZE) * GRID_SIZE;
    const endY = Math.ceil(worldBottom / GRID_SIZE) * GRID_SIZE;

    // Draw minor grid dots
    if (cellSize >= 8) {
        for (let wx = startX; wx <= endX; wx += GRID_SIZE) {
            for (let wy = startY; wy <= endY; wy += GRID_SIZE) {
                // Skip major intersections
                if (wx % majorSize === 0 && wy % majorSize === 0) continue;

                const sx = wx * zoom + vx;
                const sy = wy * zoom + vy;
                graphics.circle(sx, sy, 1);
            }
        }
        graphics.fill({ color: DEFAULT_THEME.gridMinor, alpha: DEFAULT_THEME.gridMinorAlpha });
    }

    // Draw major grid lines
    const majorStartX = Math.floor(worldLeft / majorSize) * majorSize;
    const majorStartY = Math.floor(worldTop / majorSize) * majorSize;

    for (let wx = majorStartX; wx <= endX; wx += majorSize) {
        const sx = wx * zoom + vx;
        graphics.moveTo(sx, 0);
        graphics.lineTo(sx, height);
    }
    for (let wy = majorStartY; wy <= endY; wy += majorSize) {
        const sy = wy * zoom + vy;
        graphics.moveTo(0, sy);
        graphics.lineTo(width, sy);
    }
    graphics.stroke({
        width: 1,
        color: DEFAULT_THEME.gridMajor,
        alpha: DEFAULT_THEME.gridMajorAlpha,
    });
}
