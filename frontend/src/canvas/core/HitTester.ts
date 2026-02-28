/**
 * HitTester — Spatial query abstraction for canvas objects.
 *
 * Provides fast lookups for what's under a screen/world coordinate.
 * No PixiJS dependency. Operates on bounding boxes.
 */

import type { CanvasNode, Pin, Position } from '../types';
import type { Viewport } from './Viewport';

// ─── Hit Results ───

export interface NodeHit {
    kind: 'node';
    nodeId: string;
    node: CanvasNode;
}

export interface PinHit {
    kind: 'pin';
    pinId: string;
    nodeId: string;
    pin: Pin;
    worldPosition: Position;
    distance: number;
}

export type HitResult = NodeHit | PinHit | null;

// ─── HitTester ───

export class HitTester {
    private nodes: CanvasNode[] = [];

    /** Update the node list (call when nodes change) */
    setNodes(nodes: CanvasNode[]): void {
        this.nodes = nodes;
    }

    // ─── Point queries ───

    /**
     * Find the topmost node at a world coordinate.
     * Tests in reverse order (last drawn = on top).
     */
    hitTestNode(wx: number, wy: number): NodeHit | null {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (
                wx >= node.position.x &&
                wx <= node.position.x + node.size.width &&
                wy >= node.position.y &&
                wy <= node.position.y + node.size.height
            ) {
                return { kind: 'node', nodeId: node.id, node };
            }
        }
        return null;
    }

    /**
     * Find the closest pin within `radius` world units.
     */
    hitTestPin(
        wx: number,
        wy: number,
        radius: number,
    ): PinHit | null {
        let best: PinHit | null = null;

        for (const node of this.nodes) {
            for (const pin of node.pins) {
                const px = node.position.x + pin.offset.x;
                const py = node.position.y + pin.offset.y;
                const dx = wx - px;
                const dy = wy - py;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= radius && (!best || dist < best.distance)) {
                    best = {
                        kind: 'pin',
                        pinId: pin.id,
                        nodeId: node.id,
                        pin,
                        worldPosition: { x: px, y: py },
                        distance: dist,
                    };
                }
            }
        }

        return best;
    }

    /**
     * Test a screen-space point, converting via viewport.
     */
    hitTestScreen(
        sx: number,
        sy: number,
        viewport: Viewport,
        pinRadius = 20,
    ): HitResult {
        const world = viewport.screenToWorld(sx, sy);

        // Pins take priority (smaller target)
        const pin = this.hitTestPin(
            world.x,
            world.y,
            pinRadius / viewport.zoom,
        );
        if (pin) return pin;

        // Then nodes
        return this.hitTestNode(world.x, world.y);
    }

    /**
     * Find all nodes within a world-space rectangle (for box selection).
     */
    queryRect(
        left: number,
        top: number,
        right: number,
        bottom: number,
    ): CanvasNode[] {
        return this.nodes.filter((node) => {
            const nl = node.position.x;
            const nt = node.position.y;
            const nr = nl + node.size.width;
            const nb = nt + node.size.height;

            return nl < right && nr > left && nt < bottom && nb > top;
        });
    }
}
