/**
 * WireLayer — Object-pooled wire rendering.
 *
 * Maintains a pool of Graphics objects so wires don't
 * allocate/deallocate every frame. Only redraws when
 * edges change or viewport moves.
 */

import { Container, Graphics } from 'pixi.js';
import {
    DEFAULT_THEME,
    type Edge,
    type EdgeState,
    type WireDrawingState,
} from '../types';
import type { Viewport } from '../core/Viewport';

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

// ─── Object Pool ───

class GraphicsPool {
    private available: Graphics[] = [];
    private inUse: Graphics[] = [];
    private parent: Container;

    constructor(parent: Container) {
        this.parent = parent;
    }

    acquire(): Graphics {
        let gfx = this.available.pop();
        if (!gfx) {
            gfx = new Graphics();
            this.parent.addChild(gfx);
        }
        gfx.visible = true;
        this.inUse.push(gfx);
        return gfx;
    }

    releaseAll(): void {
        for (const gfx of this.inUse) {
            gfx.clear();
            gfx.visible = false;
        }
        this.available.push(...this.inUse);
        this.inUse = [];
    }

    get activeCount(): number {
        return this.inUse.length;
    }
}

// ─── WireLayer ───

export class WireLayer {
    readonly container = new Container();
    private pool: GraphicsPool;
    private drawingGfx = new Graphics();
    private dirty = true;
    private edges: Edge[] = [];
    private wireDrawing: WireDrawingState | null = null;

    constructor() {
        this.pool = new GraphicsPool(this.container);
        this.container.addChild(this.drawingGfx);
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

    // ─── Data Update ───

    setEdges(edges: Edge[]): void {
        this.edges = edges;
        this.dirty = true;
    }

    setWireDrawing(state: WireDrawingState | null): void {
        this.wireDrawing = state;
        this.dirty = true;
    }

    // ─── Render ───

    render(viewport: Viewport): void {
        this.pool.releaseAll();
        this.renderEdges(viewport);
        this.renderDrawingWire(viewport);
    }

    private renderEdges(viewport: Viewport): void {
        const { x: vx, y: vy, zoom } = viewport;

        for (const edge of this.edges) {
            if (edge.waypoints.length < 2) continue;

            const gfx = this.pool.acquire();
            const color = WIRE_COLORS[edge.state];
            const width = WIRE_WIDTHS[edge.state] * zoom;
            const alpha = edge.state === 'invalid' ? 0.8 : 1;

            const first = edge.waypoints[0];
            gfx.moveTo(first.x * zoom + vx, first.y * zoom + vy);

            for (let i = 1; i < edge.waypoints.length; i++) {
                const wp = edge.waypoints[i];
                gfx.lineTo(wp.x * zoom + vx, wp.y * zoom + vy);
            }
            gfx.stroke({ width, color, alpha });

            // Junction dots
            for (const wp of edge.waypoints) {
                gfx.circle(wp.x * zoom + vx, wp.y * zoom + vy, 2.5 * zoom);
                gfx.fill({ color, alpha: 0.5 });
            }
        }
    }

    private renderDrawingWire(viewport: Viewport): void {
        this.drawingGfx.clear();

        const wd = this.wireDrawing;
        if (!wd || !wd.active || wd.currentPath.length < 2) return;

        const { x: vx, y: vy, zoom } = viewport;
        const color = DEFAULT_THEME.wireDrawing;
        const snapColor = DEFAULT_THEME.pinSnap;
        const hasSnap = wd.snapTarget !== null;

        const first = wd.currentPath[0];
        this.drawingGfx.moveTo(first.x * zoom + vx, first.y * zoom + vy);

        for (let i = 1; i < wd.currentPath.length; i++) {
            const wp = wd.currentPath[i];
            this.drawingGfx.lineTo(wp.x * zoom + vx, wp.y * zoom + vy);
        }
        this.drawingGfx.stroke({
            width: 2 * zoom,
            color: hasSnap ? snapColor : color,
            alpha: 0.8,
        });

        if (hasSnap) {
            const target = wd.snapTarget!;
            const sx = target.worldPosition.x * zoom + vx;
            const sy = target.worldPosition.y * zoom + vy;

            this.drawingGfx.circle(sx, sy, 12 * zoom);
            this.drawingGfx.stroke({ width: 2, color: snapColor, alpha: 0.4 });
            this.drawingGfx.circle(sx, sy, 4 * zoom);
            this.drawingGfx.fill({ color: snapColor, alpha: 0.9 });
        }
    }
}
