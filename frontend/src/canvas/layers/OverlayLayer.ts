/**
 * OverlayLayer — Selection box, tooltips, snap indicators.
 *
 * Always drawn on top. Redraws every frame when active
 * (selection drag, tooltip visible), otherwise skips.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { DEFAULT_THEME, type Pin } from '../types';
import type { Viewport } from '../core/Viewport';

export interface OverlayState {
    /** Selection rectangle (screen coords) */
    selectionRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;

    /** Tooltip pin + screen position */
    tooltip: {
        pin: Pin;
        screenX: number;
        screenY: number;
    } | null;

    /** Highlighted pin IDs (from validation errors) */
    errorPinIds: Set<string>;

    /** Highlighted node IDs */
    errorNodeIds: Set<string>;
}

export class OverlayLayer {
    readonly container = new Container();
    private selGfx = new Graphics();
    private tooltipContainer = new Container();
    private tooltipBg = new Graphics();
    private tooltipText: Text;
    private errorGfx = new Graphics();
    private dirty = true;

    private state: OverlayState = {
        selectionRect: null,
        tooltip: null,
        errorPinIds: new Set(),
        errorNodeIds: new Set(),
    };

    constructor() {
        this.tooltipText = new Text({
            text: '',
            style: new TextStyle({
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
                fill: 0xe8e8f0,
            }),
        });
        this.tooltipContainer.addChild(this.tooltipBg);
        this.tooltipContainer.addChild(this.tooltipText);
        this.tooltipContainer.visible = false;

        this.container.addChild(this.errorGfx);
        this.container.addChild(this.selGfx);
        this.container.addChild(this.tooltipContainer);
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

    // ─── State Update ───

    update(state: Partial<OverlayState>): void {
        Object.assign(this.state, state);
        this.dirty = true;
    }

    // ─── Render ───

    render(_viewport: Viewport): void {
        this.renderSelection();
        this.renderTooltip();
    }

    private renderSelection(): void {
        this.selGfx.clear();
        const rect = this.state.selectionRect;
        if (!rect) return;

        this.selGfx.rect(rect.x, rect.y, rect.width, rect.height);
        this.selGfx.fill({ color: DEFAULT_THEME.nodeBorderSelected, alpha: 0.08 });
        this.selGfx.stroke({
            width: 1,
            color: DEFAULT_THEME.nodeBorderSelected,
            alpha: 0.5,
        });
    }

    private renderTooltip(): void {
        const tip = this.state.tooltip;
        if (!tip) {
            this.tooltipContainer.visible = false;
            return;
        }

        const pin = tip.pin;
        const label = `${pin.label}\n${pin.direction} · ${pin.signalType}${pin.voltage != null ? ` · ${pin.voltage}V` : ''
            }`;

        this.tooltipText.text = label;

        // Background
        const padding = 8;
        const tw = this.tooltipText.width + padding * 2;
        const th = this.tooltipText.height + padding * 2;

        this.tooltipBg.clear();
        this.tooltipBg.roundRect(0, 0, tw, th, 4);
        this.tooltipBg.fill({ color: 0x1a1a2e, alpha: 0.95 });
        this.tooltipBg.stroke({ width: 1, color: 0x3a3a5a });

        this.tooltipText.x = padding;
        this.tooltipText.y = padding;

        this.tooltipContainer.x = tip.screenX + 12;
        this.tooltipContainer.y = tip.screenY - th / 2;
        this.tooltipContainer.visible = true;
    }
}
