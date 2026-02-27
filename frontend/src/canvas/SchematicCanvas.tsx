import { useEffect, useRef } from 'react';
import { Application, Graphics, Text, TextStyle } from 'pixi.js';
import type { CircuitGraph, CircuitNode } from '../types';
import { useDesignStore } from '../store/designStore';

interface SchematicCanvasProps {
    circuit: CircuitGraph | null;
}

const NODE_COLORS: Record<string, number> = {
    mcu: 0x4fc3f7,
    sensor: 0x81c784,
    regulator: 0xffb74d,
    passive: 0xb0bec5,
    protection: 0xef5350,
};

const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;

function layoutNodes(nodes: CircuitNode[]): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const typeGroups: Record<string, CircuitNode[]> = {};

    for (const node of nodes) {
        if (!typeGroups[node.type]) typeGroups[node.type] = [];
        typeGroups[node.type].push(node);
    }

    const typeOrder = ['regulator', 'protection', 'mcu', 'sensor', 'passive'];
    let col = 0;

    for (const type of typeOrder) {
        const group = typeGroups[type] || [];
        let row = 0;
        for (const node of group) {
            positions.set(node.id, {
                x: 100 + col * 200,
                y: 80 + row * 100,
            });
            row++;
        }
        if (group.length > 0) col++;
    }

    return positions;
}

export default function SchematicCanvas({ circuit }: SchematicCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const setSelectedNode = useDesignStore((s) => s.setSelectedNode);

    useEffect(() => {
        if (!containerRef.current) return;

        const app = new Application();

        const initApp = async () => {
            await app.init({
                background: 0x1a1a2e,
                resizeTo: containerRef.current!,
                antialias: true,
            });

            containerRef.current!.innerHTML = '';
            containerRef.current!.appendChild(app.canvas as HTMLCanvasElement);
            appRef.current = app;

            if (circuit) {
                renderCircuit(app, circuit);
            } else {
                renderPlaceholder(app);
            }
        };

        initApp();

        return () => {
            app.destroy(true);
            appRef.current = null;
        };
    }, [circuit]);

    function renderPlaceholder(app: Application) {
        const text = new Text({
            text: 'Describe your hardware to generate a schematic',
            style: new TextStyle({
                fill: 0x666688,
                fontSize: 18,
                fontFamily: 'Inter, system-ui, sans-serif',
            }),
        });
        text.anchor.set(0.5);
        text.x = app.screen.width / 2;
        text.y = app.screen.height / 2;
        app.stage.addChild(text);
    }

    function renderCircuit(app: Application, graph: CircuitGraph) {
        const positions = layoutNodes(graph.nodes);

        // Draw edges first (behind nodes)
        for (const edge of graph.edges) {
            const from = positions.get(edge.source_node);
            const to = positions.get(edge.target_node);
            if (!from || !to) continue;

            const line = new Graphics();
            const color = edge.signal_type === 'power' ? 0xff6b6b :
                edge.signal_type === 'ground' ? 0x888888 : 0x64b5f6;
            line.moveTo(from.x + NODE_WIDTH / 2, from.y + NODE_HEIGHT / 2);
            line.lineTo(to.x + NODE_WIDTH / 2, to.y + NODE_HEIGHT / 2);
            line.stroke({ width: 2, color, alpha: 0.6 });
            app.stage.addChild(line);
        }

        // Draw nodes
        for (const node of graph.nodes) {
            const pos = positions.get(node.id);
            if (!pos) continue;

            const g = new Graphics();
            const color = NODE_COLORS[node.type] || 0x9e9e9e;

            // Node rectangle
            g.roundRect(pos.x, pos.y, NODE_WIDTH, NODE_HEIGHT, 8);
            g.fill({ color, alpha: 0.9 });
            g.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

            g.eventMode = 'static';
            g.cursor = 'pointer';
            g.on('pointerdown', () => setSelectedNode(node.id));

            app.stage.addChild(g);

            // Node label
            const label = new Text({
                text: `${node.id}\n${node.part_number}`,
                style: new TextStyle({
                    fill: 0x1a1a2e,
                    fontSize: 11,
                    fontFamily: 'Inter, monospace',
                    fontWeight: 'bold',
                    align: 'center',
                    wordWrap: true,
                    wordWrapWidth: NODE_WIDTH - 10,
                }),
            });
            label.x = pos.x + NODE_WIDTH / 2;
            label.y = pos.y + NODE_HEIGHT / 2;
            label.anchor.set(0.5);
            app.stage.addChild(label);
        }
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '500px',
                borderRadius: '12px',
                overflow: 'hidden',
            }}
        />
    );
}
