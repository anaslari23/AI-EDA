/**
 * ComponentLayer — Dirty-tracked component node rendering.
 *
 * Each node gets its own Container with cached Graphics.
 * Only the changed nodes are re-rendered.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
    DEFAULT_THEME,
    PIN_RADIUS,
    type CanvasNode,
} from '../types';
import type { Viewport } from '../core/Viewport';

interface NodeSprite {
    container: Container;
    body: Graphics;
    pins: Graphics;
    labels: Text[];
    nodeId: string;
    version: number;
}

export class ComponentLayer {
    readonly container = new Container();
    private sprites = new Map<string, NodeSprite>();
    private dirtyNodeIds = new Set<string>();
    private dirty = true;
    private nodes: CanvasNode[] = [];

    // ─── RenderLoop Integration ───

    isDirty(): boolean {
        return this.dirty;
    }

    clearDirty(): void {
        this.dirty = false;
        this.dirtyNodeIds.clear();
    }

    markDirty(): void {
        this.dirty = true;
    }

    markNodeDirty(nodeId: string): void {
        this.dirtyNodeIds.add(nodeId);
        this.dirty = true;
    }

    // ─── Data Update ───

    setNodes(nodes: CanvasNode[]): void {
        this.nodes = nodes;

        // Detect added/removed
        const currentIds = new Set(nodes.map((n) => n.id));
        for (const id of this.sprites.keys()) {
            if (!currentIds.has(id)) {
                this.removeSprite(id);
            }
        }

        // Mark all as dirty on full update
        this.dirty = true;
    }

    // ─── Render ───

    render(viewport: Viewport): void {
        for (const node of this.nodes) {
            let sprite = this.sprites.get(node.id);

            if (!sprite) {
                sprite = this.createSprite(node);
                this.sprites.set(node.id, sprite);
                this.container.addChild(sprite.container);
            }

            // Only re-render if globally dirty or node specifically dirty
            if (this.dirty || this.dirtyNodeIds.has(node.id)) {
                this.renderNode(sprite, node, viewport);
            }
        }
    }

    // ─── Private ───

    private createSprite(node: CanvasNode): NodeSprite {
        const container = new Container();
        return {
            container,
            body: new Graphics(),
            pins: new Graphics(),
            labels: [],
            nodeId: node.id,
            version: 0,
        };
    }

    private removeSprite(nodeId: string): void {
        const sprite = this.sprites.get(nodeId);
        if (sprite) {
            this.container.removeChild(sprite.container);
            sprite.container.destroy({ children: true });
            this.sprites.delete(nodeId);
        }
    }

    private renderNode(
        sprite: NodeSprite,
        node: CanvasNode,
        viewport: Viewport,
    ): void {
        const { zoom } = viewport;
        const sc = viewport.worldToScreen(node.position.x, node.position.y);
        const sw = node.size.width * zoom;
        const sh = node.size.height * zoom;

        const color = DEFAULT_THEME.nodeColors[node.type] ?? 0x9e9e9e;

        // Clear and redraw body
        sprite.body.clear();
        sprite.body.roundRect(0, 0, sw, sh, 6 * zoom);
        sprite.body.fill({ color, alpha: 0.12 });

        let borderColor = DEFAULT_THEME.nodeBorder;
        let borderWidth = 1.5;
        if (node.hasError) {
            borderColor = DEFAULT_THEME.nodeBorderError;
            borderWidth = 2.5;
        } else if (node.selected) {
            borderColor = DEFAULT_THEME.nodeBorderSelected;
            borderWidth = 2;
        }
        sprite.body.stroke({ width: borderWidth, color: borderColor });

        // Top accent bar
        sprite.body.roundRect(0, 0, sw, 4 * zoom, 6 * zoom);
        sprite.body.fill({ color, alpha: 0.8 });

        // Pins
        sprite.pins.clear();
        for (const pin of node.pins) {
            const px = pin.offset.x * zoom;
            const py = pin.offset.y * zoom;
            const r = PIN_RADIUS * zoom;

            let pinColor = DEFAULT_THEME.pinDefault;
            if (pin.connected) pinColor = DEFAULT_THEME.pinConnected;

            if (pin.signalType === 'power' || pin.signalType === 'ground') {
                sprite.pins.circle(px, py, r + 2 * zoom);
                sprite.pins.stroke({ width: 1.5, color: pinColor, alpha: 0.4 });
            }

            sprite.pins.circle(px, py, r);
            sprite.pins.fill({ color: pinColor, alpha: 0.9 });
        }

        // Remove old labels
        for (const label of sprite.labels) {
            sprite.container.removeChild(label);
            label.destroy();
        }
        sprite.labels = [];

        // Node labels
        if (zoom > 0.3) {
            const labelText = new Text({
                text: node.label,
                style: new TextStyle({
                    fontSize: Math.max(10, 12 * zoom),
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: '600',
                    fill: DEFAULT_THEME.text,
                }),
            });
            labelText.x = 8 * zoom;
            labelText.y = 10 * zoom;
            sprite.labels.push(labelText);

            if (zoom > 0.5) {
                const partText = new Text({
                    text: node.partNumber,
                    style: new TextStyle({
                        fontSize: Math.max(8, 9 * zoom),
                        fontFamily: 'JetBrains Mono, monospace',
                        fill: DEFAULT_THEME.textMuted,
                    }),
                });
                partText.x = 8 * zoom;
                partText.y = 24 * zoom;
                sprite.labels.push(partText);
            }
        }

        // Assemble container
        sprite.container.removeChildren();
        sprite.container.addChild(sprite.body);
        sprite.container.addChild(sprite.pins);
        for (const label of sprite.labels) {
            sprite.container.addChild(label);
        }

        sprite.container.x = sc.x;
        sprite.container.y = sc.y;
        sprite.version++;
    }
}
