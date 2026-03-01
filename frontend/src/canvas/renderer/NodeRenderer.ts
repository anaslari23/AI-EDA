import { Graphics, Text, TextStyle } from 'pixi.js';
import {
    DEFAULT_THEME,
    PIN_RADIUS,
    type CanvasNode,
    type Viewport,
} from '../types';

function clamp(v: number): number {
    return Math.max(0, Math.min(255, v));
}

function adjustColor(color: number, amount: number): number {
    const r = clamp(((color >> 16) & 0xff) + amount);
    const g = clamp(((color >> 8) & 0xff) + amount);
    const b = clamp((color & 0xff) + amount);
    return (r << 16) | (g << 8) | b;
}

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
    const faceColor = adjustColor(color, -35);
    const topColor = adjustColor(color, 24);
    const edgeLight = adjustColor(color, 46);
    const edgeDark = adjustColor(color, -60);
    const depth = Math.max(1.8, 3 * zoom);
    const radius = 7 * zoom;

    // Soft drop shadow under the package.
    graphics.roundRect(sx + 3 * zoom, sy + 4 * zoom, sw, sh, radius);
    graphics.fill({ color: 0x000000, alpha: 0.25 });

    // Side wall for package thickness.
    graphics.roundRect(sx + depth, sy + depth, sw, sh, radius);
    graphics.fill({ color: edgeDark, alpha: 0.9 });

    // Main top package face.
    graphics.roundRect(sx, sy, sw, sh, radius);
    graphics.fill({ color: faceColor, alpha: 0.96 });

    // Inner top face highlight plate.
    graphics.roundRect(sx + 3 * zoom, sy + 3 * zoom, sw - 6 * zoom, sh * 0.44, 5 * zoom);
    graphics.fill({ color: topColor, alpha: 0.28 });

    // Left and top edge highlights for bevel.
    graphics.roundRect(sx + 1 * zoom, sy + 1 * zoom, sw - 2 * zoom, 2.5 * zoom, 3 * zoom);
    graphics.fill({ color: edgeLight, alpha: 0.36 });
    graphics.roundRect(sx + 1 * zoom, sy + 1 * zoom, 2.5 * zoom, sh - 2 * zoom, 3 * zoom);
    graphics.fill({ color: edgeLight, alpha: 0.24 });

    // Bottom and right edge darkening for depth.
    graphics.roundRect(sx + 1 * zoom, sy + sh - 2.5 * zoom, sw - 2 * zoom, 2.2 * zoom, 2 * zoom);
    graphics.fill({ color: edgeDark, alpha: 0.42 });
    graphics.roundRect(sx + sw - 2.5 * zoom, sy + 1 * zoom, 2.2 * zoom, sh - 2 * zoom, 2 * zoom);
    graphics.fill({ color: edgeDark, alpha: 0.32 });

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
    graphics.roundRect(sx, sy, sw, sh, radius);
    graphics.stroke({ width: borderWidth, color: borderColor });

    // Top accent/silk strip.
    const barHeight = 4 * zoom;
    graphics.roundRect(sx + 1.5 * zoom, sy + 1.5 * zoom, sw - 3 * zoom, barHeight, 5 * zoom);
    graphics.fill({ color: adjustColor(color, 18), alpha: 0.86 });

    // Pin-1 marker dot (silkscreen cue).
    graphics.circle(sx + 8 * zoom, sy + 8 * zoom, 1.8 * zoom);
    graphics.fill({ color: 0xf0f0f0, alpha: 0.86 });
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

        const metalTop = adjustColor(color, 65);
        const metalBase = adjustColor(color, -25);
        const metalDark = adjustColor(color, -70);

        // Pin stem that looks soldered into the package.
        const stemWidth = Math.max(1.2, 2.2 * zoom);
        const stemLen = Math.max(2, 4 * zoom);
        const isLeft = pin.offset.x <= node.size.width / 2;
        const sx = isLeft ? px + radius * 0.35 : px - radius * 0.35 - stemLen;
        graphics.roundRect(sx, py - stemWidth / 2, stemLen, stemWidth, stemWidth / 2);
        graphics.fill({ color: metalDark, alpha: 0.72 });

        // Outer ring for power/ground pins
        if (pin.signalType === 'power' || pin.signalType === 'ground') {
            graphics.circle(px, py, radius + 2 * zoom);
            graphics.stroke({ width: 1.5, color, alpha: 0.4 });
        }

        // Base metal pad.
        graphics.circle(px, py, radius);
        graphics.fill({ color: metalBase, alpha: 0.96 });

        // Top metallic shine.
        graphics.circle(px - radius * 0.22, py - radius * 0.24, radius * 0.62);
        graphics.fill({ color: metalTop, alpha: 0.85 });

        // Tiny occlusion ring to push depth.
        graphics.circle(px, py, radius);
        graphics.stroke({ width: Math.max(0.8, 1.1 * zoom), color: metalDark, alpha: 0.45 });

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
