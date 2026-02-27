import type { Position, CanvasNode, Pin, Size, NodeType } from '../types';
import { PIN_SPACING, NODE_MIN_WIDTH, NODE_MIN_HEIGHT } from '../types';
import type { CircuitGraph } from '../../types/schema';

/**
 * Convert backend CircuitGraph into canvas CanvasNode[] with calculated pin layouts.
 */
export function circuitGraphToCanvasNodes(
    graph: CircuitGraph
): CanvasNode[] {
    const nodes: CanvasNode[] = [];
    const typeLayout = layoutByType(graph.nodes.length);

    for (let i = 0; i < graph.nodes.length; i++) {
        const gNode = graph.nodes[i];
        const nodeType = mapNodeType(gNode.type);
        const pins = generatePinLayout(gNode.pins, nodeType);
        const size = calculateNodeSize(pins.length);

        // Place pins with calculated offsets on the node
        const laidOutPins = layoutPins(pins, gNode.id, size);

        nodes.push({
            id: gNode.id,
            type: nodeType,
            label: gNode.id,
            partNumber: gNode.part_number,
            position: typeLayout[i],
            size,
            pins: laidOutPins,
            properties: gNode.properties,
            hasError: false,
            selected: false,
            rotation: 0,
        });
    }

    return nodes;
}

function mapNodeType(backendType: string): NodeType {
    const map: Record<string, NodeType> = {
        mcu: 'mcu',
        sensor: 'sensor',
        regulator: 'regulator',
        passive: 'passive',
        protection: 'protection',
    };
    return map[backendType] ?? 'connector';
}

function generatePinLayout(
    pinNames: string[],
    nodeType: NodeType
): Array<{ label: string; direction: Pin['direction']; signalType: Pin['signalType'] }> {
    return pinNames.map((name) => ({
        label: name,
        direction: inferPinDirection(name),
        signalType: inferSignalType(name),
    }));
}

function inferPinDirection(name: string): Pin['direction'] {
    const upper = name.toUpperCase();
    if (upper === 'VCC' || upper === 'VIN' || upper === 'VOUT') return 'power';
    if (upper === 'GND') return 'ground';
    if (upper.startsWith('MISO') || upper.startsWith('RX') || upper === 'AOUT' || upper === 'DOUT') return 'output';
    if (upper.startsWith('MOSI') || upper.startsWith('TX') || upper === 'CS') return 'input';
    return 'bidirectional';
}

function inferSignalType(name: string): Pin['signalType'] {
    const upper = name.toUpperCase();
    if (upper === 'VCC' || upper === 'VIN' || upper === 'VOUT') return 'power';
    if (upper === 'GND') return 'ground';
    if (upper.startsWith('GPIO') || upper.startsWith('SDA') || upper.startsWith('SCL')) return 'digital';
    if (upper === 'AOUT' || upper.startsWith('ADC')) return 'analog';
    return 'digital';
}

function calculateNodeSize(pinCount: number): Size {
    const pinsPerSide = Math.ceil(pinCount / 2);
    const height = Math.max(NODE_MIN_HEIGHT, pinsPerSide * PIN_SPACING + 40);
    const width = Math.max(NODE_MIN_WIDTH, 140);
    return { width, height };
}

function layoutPins(
    pinDefs: Array<{ label: string; direction: Pin['direction']; signalType: Pin['signalType'] }>,
    nodeId: string,
    nodeSize: Size
): Pin[] {
    const pins: Pin[] = [];
    const leftPins: typeof pinDefs = [];
    const rightPins: typeof pinDefs = [];

    // Power/ground/input on left, output/bidirectional on right
    for (const pd of pinDefs) {
        if (pd.direction === 'power' || pd.direction === 'ground' || pd.direction === 'input') {
            leftPins.push(pd);
        } else {
            rightPins.push(pd);
        }
    }

    // Balance sides
    while (leftPins.length - rightPins.length > 2) {
        rightPins.push(leftPins.pop()!);
    }
    while (rightPins.length - leftPins.length > 2) {
        leftPins.push(rightPins.pop()!);
    }

    const topOffset = 36;

    // Left side pins
    leftPins.forEach((pd, i) => {
        pins.push({
            id: `${nodeId}_${pd.label}`,
            nodeId,
            label: pd.label,
            direction: pd.direction,
            signalType: pd.signalType,
            offset: { x: 0, y: topOffset + i * PIN_SPACING },
            connected: false,
        });
    });

    // Right side pins
    rightPins.forEach((pd, i) => {
        pins.push({
            id: `${nodeId}_${pd.label}`,
            nodeId,
            label: pd.label,
            direction: pd.direction,
            signalType: pd.signalType,
            offset: { x: nodeSize.width, y: topOffset + i * PIN_SPACING },
            connected: false,
        });
    });

    return pins;
}

function layoutByType(count: number): Position[] {
    const positions: Position[] = [];
    const cols = Math.ceil(Math.sqrt(count));
    const spacingX = 250;
    const spacingY = 200;

    for (let i = 0; i < count; i++) {
        positions.push({
            x: 100 + (i % cols) * spacingX,
            y: 100 + Math.floor(i / cols) * spacingY,
        });
    }

    return positions;
}
