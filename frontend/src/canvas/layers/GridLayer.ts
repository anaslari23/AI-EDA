/**
 * GridLayer — Viewport-aware infinite grid.
 *
 * Only redraws when viewport changes (pan/zoom).
 * Uses a single Graphics object, no per-frame allocation.
 */

import { Container, Graphics } from 'pixi.js';
import {
    GRID_SIZE,
    GRID_MAJOR_EVERY,
    DEFAULT_THEME,
} from '../types';
import type { Viewport } from '../core/Viewport';

export class GridLayer {
    readonly container = new Container();
    private gfx = new Graphics();
    private dirty = true;

    private screenW = 0;
    private screenH = 0;

    constructor() {
        this.container.addChild(this.gfx);
    }

    // ─── RenderLoop Integration ───

    isDirty(): boolean {
        return this.dirty;
    }

    clearDirty(): void {
        this.dirty = false;
    }

    markDirty(): void {
        this.dirty = true;
    }

    setSize(w: number, h: number): void {
        this.screenW = w;
        this.screenH = h;
        this.dirty = true;
    }

    // ─── Render ───

    render(viewport: Viewport): void {
        const g = this.gfx;
        g.clear();

        const { x: vx, y: vy, zoom } = viewport;
        const cellSize = GRID_SIZE * zoom;

        if (cellSize < 4) return; // Too zoomed out

        const majorSize = GRID_SIZE * GRID_MAJOR_EVERY;

        // Visible world bounds
        const worldLeft = -vx / zoom;
        const worldTop = -vy / zoom;
        const worldRight = (this.screenW - vx) / zoom;
        const worldBottom = (this.screenH - vy) / zoom;

        const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
        const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
        const endX = Math.ceil(worldRight / GRID_SIZE) * GRID_SIZE;
        const endY = Math.ceil(worldBottom / GRID_SIZE) * GRID_SIZE;

        // Minor grid dots (only when zoomed enough to see)
        if (cellSize >= 8) {
            for (let wx = startX; wx <= endX; wx += GRID_SIZE) {
                for (let wy = startY; wy <= endY; wy += GRID_SIZE) {
                    if (wx % majorSize === 0 && wy % majorSize === 0) continue;
                    g.circle(wx * zoom + vx, wy * zoom + vy, 1);
                }
            }
            g.fill({
                color: DEFAULT_THEME.gridMinor,
                alpha: DEFAULT_THEME.gridMinorAlpha,
            });
        }

        // Major grid lines
        const majorStartX = Math.floor(worldLeft / majorSize) * majorSize;
        const majorStartY = Math.floor(worldTop / majorSize) * majorSize;

        for (let wx = majorStartX; wx <= endX; wx += majorSize) {
            const sx = wx * zoom + vx;
            g.moveTo(sx, 0);
            g.lineTo(sx, this.screenH);
        }
        for (let wy = majorStartY; wy <= endY; wy += majorSize) {
            const sy = wy * zoom + vy;
            g.moveTo(0, sy);
            g.lineTo(this.screenW, sy);
        }
        g.stroke({
            width: 1,
            color: DEFAULT_THEME.gridMajor,
            alpha: DEFAULT_THEME.gridMajorAlpha,
        });
    }
}
