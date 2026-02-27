import { Graphics, Text, TextStyle } from 'pixi.js';
import {
    DEFAULT_THEME,
    PIN_RADIUS,
    type CanvasNode,
    type Viewport,
} from '../types';

/**
 * Render a single component node as a rounded rectangle
 * with label and part number.
 */
export function renderNode(
    graphics: Graphics,
    node: CanvasNode,
    viewport: Viewport
): void {
    const { x: vx, y: vy, zoom } = viewport;
    const sx = node.position.x * zoom + vx;
    const sy = node.position.y * zoom + vy;
    const sw = node.size.width * zoom;
    const sh = node.size.height * zoom;

    const color = DEFAULT_THEME.nodeColors[node.type] ?? 0x9e9e9e;

    // Node body
    graphics.roundRect(sx, sy, sw, sh, 6 * zoom);

    // Fill
    graphics.fill({ color, alpha: 0.12 });

    // Border
    let borderColor = DEFAULT_THEME.nodeBorder;
    let borderWidth = 1.5;
    if (node.hasError) {
        borderColor = DEFAULT_THEME.nodeBorderError;
        borderWidth = 2.5;
    } else if (node.selected) {
        borderColor = DEFAULT_THEME.nodeBorderSelected;
        borderWidth = 2;
    }
    graphics.stroke({ width: borderWidth, color: borderColor });

    // Top accent bar
    const barHeight = 4 * zoom;
    graphics.roundRect(sx, sy, sw, barHeight, 6 * zoom);
    graphics.fill({ color, alpha: 0.8 });
}

/**
 * Create text labels for a node.
 * Returns an array of PIXI Text objects to be added to the stage.
 */
export function createNodeLabels(
    node: CanvasNode,
    viewport: Viewport
): Text[] {
    const { x: vx, y: vy, zoom } = viewport;
    const texts: Text[] = [];

    if (zoom < 0.3) return texts; // Too small to read

    const sx = node.position.x * zoom + vx;
    const sy = node.position.y * zoom + vy;

    // Node label
    const labelText = new Text({
        text: node.label,
        style: new TextStyle({
            fontSize: Math.max(10, 12 * zoom),
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: '600',
            fill: DEFAULT_THEME.text,
        }),
    });
    labelText.x = sx + 8 * zoom;
    labelText.y = sy + 10 * zoom;
    texts.push(labelText);

    // Part number
    if (zoom > 0.5) {
        const partText = new Text({
            text: node.partNumber,
            style: new TextStyle({
                fontSize: Math.max(8, 9 * zoom),
                fontFamily: 'JetBrains Mono, monospace',
                fill: DEFAULT_THEME.textMuted,
            }),
        });
        partText.x = sx + 8 * zoom;
        partText.y = sy + 24 * zoom;
        texts.push(partText);
    }

    return texts;
}

/**
 * Render pins for a node.
 */
export function renderPins(
    graphics: Graphics,
    node: CanvasNode,
    viewport: Viewport,
    hoveredPinId: string | null,
    snapPinId: string | null
): void {
    const { x: vx, y: vy, zoom } = viewport;

    for (const pin of node.pins) {
        const px = (node.position.x + pin.offset.x) * zoom + vx;
        const py = (node.position.y + pin.offset.y) * zoom + vy;
        const radius = PIN_RADIUS * zoom;

        // Pin circle
        let color = DEFAULT_THEME.pinDefault;
        if (snapPinId === pin.id) {
            color = DEFAULT_THEME.pinSnap;
        } else if (hoveredPinId === pin.id) {
            color = DEFAULT_THEME.pinHover;
        } else if (pin.connected) {
            color = DEFAULT_THEME.pinConnected;
        }

        // Outer ring for power/ground pins
        if (pin.signalType === 'power' || pin.signalType === 'ground') {
            graphics.circle(px, py, radius + 2 * zoom);
            graphics.stroke({ width: 1.5, color, alpha: 0.4 });
        }

        graphics.circle(px, py, radius);
        graphics.fill({ color, alpha: 0.9 });

        // Pin label
        if (zoom > 0.6) {
            // We'll handle pin labels through Text objects in the main renderer
        }
    }
}

/**
 * Create pin label Text objects.
 */
export function createPinLabels(
    node: CanvasNode,
    viewport: Viewport
): Text[] {
    const { x: vx, y: vy, zoom } = viewport;
    const texts: Text[] = [];

    if (zoom < 0.6) return texts;

    for (const pin of node.pins) {
        const px = (node.position.x + pin.offset.x) * zoom + vx;
        const py = (node.position.y + pin.offset.y) * zoom + vy;

        const isLeftSide = pin.offset.x < node.size.width / 2;

        const label = new Text({
            text: pin.label,
            style: new TextStyle({
                fontSize: Math.max(7, 8 * zoom),
                fontFamily: 'JetBrains Mono, monospace',
                fill: DEFAULT_THEME.textMuted,
            }),
        });

        if (isLeftSide) {
            label.x = px + 8 * zoom;
            label.y = py - 5 * zoom;
        } else {
            label.anchor.set(1, 0);
            label.x = px - 8 * zoom;
            label.y = py - 5 * zoom;
        }

        texts.push(label);
    }

    return texts;
}
