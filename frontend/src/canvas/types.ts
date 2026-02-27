/* ─── Canvas Type Definitions ─── */

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

/* ─── Pin ─── */

export type PinDirection = 'input' | 'output' | 'bidirectional' | 'power' | 'ground';

export type PinSignalType = 'power' | 'ground' | 'digital' | 'analog' | 'bus';

export interface Pin {
    id: string;
    nodeId: string;
    label: string;
    direction: PinDirection;
    signalType: PinSignalType;
    /** Offset relative to the parent node's top-left corner */
    offset: Position;
    /** Whether currently connected */
    connected: boolean;
    /** Voltage level at this pin (for validation) */
    voltage?: number;
}

/* ─── Node ─── */

export type NodeType = 'mcu' | 'sensor' | 'regulator' | 'passive' | 'protection' | 'connector';

export interface CanvasNode {
    id: string;
    type: NodeType;
    label: string;
    partNumber: string;
    position: Position;
    size: Size;
    pins: Pin[];
    properties: Record<string, unknown>;
    /** Whether this node has validation errors */
    hasError: boolean;
    /** Whether this node is currently selected */
    selected: boolean;
    /** Rotation in degrees (0, 90, 180, 270) */
    rotation: number;
}

/* ─── Edge (Wire) ─── */

export type EdgeState = 'valid' | 'invalid' | 'drawing' | 'highlighted';

export interface WireSegment {
    start: Position;
    end: Position;
}

export interface Edge {
    id: string;
    sourcePinId: string;
    targetPinId: string;
    sourceNodeId: string;
    targetNodeId: string;
    netName: string;
    signalType: PinSignalType;
    state: EdgeState;
    /** Orthogonal routing waypoints */
    waypoints: Position[];
    /** Calculated wire segments from waypoints */
    segments: WireSegment[];
}

/* ─── Snap ─── */

export interface SnapTarget {
    pinId: string;
    nodeId: string;
    worldPosition: Position;
    distance: number;
}

/* ─── Interaction State ─── */

export type InteractionMode = 'select' | 'pan' | 'wire' | 'move';

export interface WireDrawingState {
    active: boolean;
    sourcePinId: string | null;
    sourceNodeId: string | null;
    currentPath: Position[];
    snapTarget: SnapTarget | null;
}

export interface TooltipState {
    visible: boolean;
    pin: Pin | null;
    screenPosition: Position;
}

/* ─── Theme ─── */

export interface CanvasTheme {
    background: number;
    gridMajor: number;
    gridMinor: number;
    gridMajorAlpha: number;
    gridMinorAlpha: number;
    nodeColors: Record<NodeType, number>;
    nodeBorder: number;
    nodeBorderSelected: number;
    nodeBorderError: number;
    pinDefault: number;
    pinConnected: number;
    pinHover: number;
    pinSnap: number;
    wireValid: number;
    wireInvalid: number;
    wireDrawing: number;
    wireHighlight: number;
    text: number;
    textMuted: number;
}

export const DEFAULT_THEME: CanvasTheme = {
    background: 0x0d0d1a,
    gridMajor: 0x2a2a4a,
    gridMinor: 0x1a1a2e,
    gridMajorAlpha: 0.6,
    gridMinorAlpha: 0.3,
    nodeColors: {
        mcu: 0x4fc3f7,
        sensor: 0x81c784,
        regulator: 0xffb74d,
        passive: 0x78909c,
        protection: 0xef5350,
        connector: 0xb39ddb,
    },
    nodeBorder: 0x3a3a5a,
    nodeBorderSelected: 0x4fc3f7,
    nodeBorderError: 0xef5350,
    pinDefault: 0x9e9e9e,
    pinConnected: 0x81c784,
    pinHover: 0xffffff,
    pinSnap: 0xffeb3b,
    wireValid: 0x64b5f6,
    wireInvalid: 0xef5350,
    wireDrawing: 0xffeb3b,
    wireHighlight: 0x4fc3f7,
    text: 0xe8e8f0,
    textMuted: 0x666688,
};

/* ─── Constants ─── */

export const GRID_SIZE = 20;
export const GRID_MAJOR_EVERY = 5;
export const PIN_RADIUS = 5;
export const PIN_SNAP_DISTANCE = 20;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
export const NODE_MIN_WIDTH = 120;
export const NODE_MIN_HEIGHT = 60;
export const PIN_SPACING = 24;
