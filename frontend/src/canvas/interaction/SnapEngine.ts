import type { CanvasNode, Pin, Position, SnapTarget } from '../types';
import { PIN_SNAP_DISTANCE } from '../types';
import { distance } from '../utils/routing';

/**
 * Magnetic snap engine.
 * Finds the nearest compatible pin within snap distance.
 */
export function findSnapTarget(
    worldPos: Position,
    nodes: CanvasNode[],
    excludePinId: string | null,
    excludeNodeId: string | null
): SnapTarget | null {
    let nearest: SnapTarget | null = null;
    let minDist = PIN_SNAP_DISTANCE;

    for (const node of nodes) {
        // Don't snap to pins on the same node
        if (node.id === excludeNodeId) continue;

        for (const pin of node.pins) {
            if (pin.id === excludePinId) continue;

            const pinWorld: Position = {
                x: node.position.x + pin.offset.x,
                y: node.position.y + pin.offset.y,
            };

            const dist = distance(worldPos, pinWorld);
            if (dist < minDist) {
                minDist = dist;
                nearest = {
                    pinId: pin.id,
                    nodeId: node.id,
                    worldPosition: pinWorld,
                    distance: dist,
                };
            }
        }
    }

    return nearest;
}

/**
 * Check if a world position is over a pin.
 * Returns the pin and its parent node if hit.
 */
export function hitTestPin(
    worldPos: Position,
    nodes: CanvasNode[],
    hitRadius: number = 10
): { pin: Pin; node: CanvasNode } | null {
    for (const node of nodes) {
        for (const pin of node.pins) {
            const pinWorld: Position = {
                x: node.position.x + pin.offset.x,
                y: node.position.y + pin.offset.y,
            };
            if (distance(worldPos, pinWorld) < hitRadius) {
                return { pin, node };
            }
        }
    }
    return null;
}

/**
 * Check if a world position is over a node body.
 */
export function hitTestNode(
    worldPos: Position,
    nodes: CanvasNode[]
): CanvasNode | null {
    // Iterate in reverse so topmost node is picked first
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (
            worldPos.x >= node.position.x &&
            worldPos.x <= node.position.x + node.size.width &&
            worldPos.y >= node.position.y &&
            worldPos.y <= node.position.y + node.size.height
        ) {
            return node;
        }
    }
    return null;
}
