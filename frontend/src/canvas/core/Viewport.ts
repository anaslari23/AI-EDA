/**
 * Viewport — Infinite zoom + pan transform manager.
 *
 * Translates between screen coordinates and world coordinates.
 * No PixiJS dependency. Pure math.
 */

export interface ViewportState {
    /** World offset X (screen pixels) */
    x: number;
    /** World offset Y (screen pixels) */
    y: number;
    /** Zoom factor (1 = 100%) */
    zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export class Viewport {
    x = 0;
    y = 0;
    zoom = 1;

    private _dirty = true;

    get isDirty(): boolean {
        return this._dirty;
    }

    clearDirty(): void {
        this._dirty = false;
    }

    // ─── Transforms ───

    screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.x) / this.zoom,
            y: (sy - this.y) / this.zoom,
        };
    }

    worldToScreen(wx: number, wy: number): { x: number; y: number } {
        return {
            x: wx * this.zoom + this.x,
            y: wy * this.zoom + this.y,
        };
    }

    // ─── Mutations ───

    pan(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
        this._dirty = true;
    }

    /**
     * Zoom toward/away from a screen-space point.
     * Keeps the world point under the cursor fixed.
     */
    zoomAt(delta: number, screenX: number, screenY: number): void {
        const oldZoom = this.zoom;
        const newZoom = clamp(oldZoom * (1 + delta), MIN_ZOOM, MAX_ZOOM);
        const ratio = newZoom / oldZoom;

        this.x = screenX - (screenX - this.x) * ratio;
        this.y = screenY - (screenY - this.y) * ratio;
        this.zoom = newZoom;
        this._dirty = true;
    }

    setZoom(zoom: number): void {
        this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
        this._dirty = true;
    }

    reset(): void {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this._dirty = true;
    }

    // ─── Visible bounds (world coords) ───

    getVisibleBounds(
        screenW: number,
        screenH: number,
    ): { left: number; top: number; right: number; bottom: number } {
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(screenW, screenH);
        return { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
    }

    toState(): ViewportState {
        return { x: this.x, y: this.y, zoom: this.zoom };
    }
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
