/**
 * RenderLoop — requestAnimationFrame rendering pipeline.
 *
 * Only re-renders when dirty flags are set.
 * Each layer registers a render callback; the loop calls
 * only dirty layers per frame.
 */

export interface LayerCallback {
    /** Returns true if this layer needs redraw */
    isDirty: () => boolean;
    /** Perform the render */
    render: () => void;
    /** Clear the dirty flag */
    clearDirty: () => void;
    /** Layer z-order (lower = drawn first) */
    order: number;
}

export class RenderLoop {
    private layers: LayerCallback[] = [];
    private rafId: number | null = null;
    private running = false;
    private globalDirty = true;

    // ─── Layer Registration ───

    addLayer(layer: LayerCallback): void {
        this.layers.push(layer);
        this.layers.sort((a, b) => a.order - b.order);
    }

    removeLayer(layer: LayerCallback): void {
        this.layers = this.layers.filter((l) => l !== layer);
    }

    // ─── Dirty Flagging ───

    markDirty(): void {
        this.globalDirty = true;
    }

    // ─── Lifecycle ───

    start(): void {
        if (this.running) return;
        this.running = true;
        this.tick();
    }

    stop(): void {
        this.running = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    // ─── Frame ───

    private tick = (): void => {
        if (!this.running) return;

        // Check if any layer is dirty
        const needsRender =
            this.globalDirty ||
            this.layers.some((l) => l.isDirty());

        if (needsRender) {
            for (const layer of this.layers) {
                if (this.globalDirty || layer.isDirty()) {
                    layer.render();
                    layer.clearDirty();
                }
            }
            this.globalDirty = false;
        }

        this.rafId = requestAnimationFrame(this.tick);
    };
}
