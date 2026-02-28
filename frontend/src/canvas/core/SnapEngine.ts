/**
 * SnapEngine — UI-independent pin snapping system.
 *
 * Given a world-space cursor position, finds the nearest
 * unoccupied pin within snap distance.
 *
 * No PixiJS dependency. No React dependency.
 */

import type { CanvasNode, Pin, Position, Edge } from '../types';

export interface SnapResult {
    pinId: string;
    nodeId: string;
    worldPosition: Position;
    distance: number;
    pin: Pin;
}

export class SnapEngine {
    private nodes: CanvasNode[] = [];
    private edges: Edge[] = [];
    private snapDistance = 20; // world units

    setNodes(nodes: CanvasNode[]): void {
        this.nodes = nodes;
    }

    setEdges(edges: Edge[]): void {
        this.edges = edges;
    }

    setSnapDistance(distance: number): void {
        this.snapDistance = distance;
    }

    /**
     * Find the best snap target for a wire being drawn
     * from `sourcePinId` to the current cursor position.
     */
    findSnap(
        worldX: number,
        worldY: number,
        sourcePinId: string,
        sourceNodeId: string,
    ): SnapResult | null {
        let best: SnapResult | null = null;

        for (const node of this.nodes) {
            // Cannot snap to same node
            if (node.id === sourceNodeId) continue;

            for (const pin of node.pins) {
                // Skip already-connected pins (if not bidirectional)
                if (pin.connected && pin.direction !== 'bidirectional') continue;

                // Skip if already connected to source
                if (this.isAlreadyConnected(sourcePinId, pin.id)) continue;

                const px = node.position.x + pin.offset.x;
                const py = node.position.y + pin.offset.y;
                const dx = worldX - px;
                const dy = worldY - py;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this.snapDistance && (!best || dist < best.distance)) {
                    best = {
                        pinId: pin.id,
                        nodeId: node.id,
                        worldPosition: { x: px, y: py },
                        distance: dist,
                        pin,
                    };
                }
            }
        }

        return best;
    }

    /**
     * Check if two pins are already connected by an edge.
     */
    private isAlreadyConnected(pinA: string, pinB: string): boolean {
        return this.edges.some(
            (e) =>
                (e.sourcePinId === pinA && e.targetPinId === pinB) ||
                (e.sourcePinId === pinB && e.targetPinId === pinA),
        );
    }
}
