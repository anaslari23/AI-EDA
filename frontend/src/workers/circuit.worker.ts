/**
 * Circuit Worker — Heavy computation off the main thread.
 *
 * Handles:
 * 1. Full circuit validation (8 rules)
 * 2. Net merging / deduplication
 * 3. Current estimation per node
 * 4. Graph traversal (upstream/downstream)
 *
 * Designed for 2000+ node graphs.
 */

import type {
    WorkerRequest,
    WorkerResponse,
    WorkerErrorResponse,
    SerializableCircuitGraph,
    SerializableNode,
    SerializableEdge,
    SerializableValidationIssue,
    SerializableNet,
} from './protocol';

// ─── Message Handler ───

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    const start = performance.now();

    try {
        let response: WorkerResponse;

        switch (req.command) {
            case 'VALIDATE':
                response = handleValidate(req.id, req.payload.graph, req.payload.checks, start);
                break;
            case 'MERGE_NETS':
                response = handleMerge(req.id, req.payload.graph, start);
                break;
            case 'ANALYZE_CURRENT':
                response = handleAnalyzeCurrent(req.id, req.payload.graph, start);
                break;
            case 'TRAVERSE':
                response = handleTraverse(
                    req.id,
                    req.payload.graph,
                    req.payload.startNodeId,
                    req.payload.direction,
                    start,
                );
                break;
            default: {
                // Defensive fallback for malformed runtime payloads.
                const unknownReq = req as { command: string; id: string };
                response = {
                    command: unknownReq.command as WorkerErrorResponse['command'],
                    id: unknownReq.id,
                    durationMs: performance.now() - start,
                    error: `Unknown command: ${unknownReq.command}`,
                } as WorkerErrorResponse;
                break;
            }
        }

        self.postMessage(response);
    } catch (err) {
        const errorResponse: WorkerErrorResponse = {
            command: req.command,
            id: req.id,
            durationMs: performance.now() - start,
            error: err instanceof Error ? err.message : String(err),
        };
        self.postMessage(errorResponse);
    }
};

// ─── VALIDATE ───

function handleValidate(
    id: string,
    graph: SerializableCircuitGraph,
    checks: string[] | undefined,
    start: number,
): WorkerResponse {
    const nodeMap = buildNodeMap(graph);
    const edgesForNode = buildEdgesForNode(graph);
    const issues: SerializableValidationIssue[] = [];
    let issueIdx = 0;

    const shouldRun = (name: string) => !checks || checks.includes(name);

    // 1. Voltage compatibility
    if (shouldRun('voltage')) {
        for (const rail of graph.power_rails) {
            for (const consumerId of rail.consumers) {
                const node = nodeMap.get(consumerId);
                if (!node) continue;
                const vMin = Number(node.properties.operating_voltage_min ?? 0);
                const vMax = Number(node.properties.operating_voltage_max ?? 5.5);
                if (rail.voltage < vMin || rail.voltage > vMax) {
                    issues.push({
                        id: `W_VOLT_${++issueIdx}`,
                        type: 'voltage_mismatch',
                        severity: 'error',
                        message: `${node.id} requires ${vMin}–${vMax}V but rail "${rail.name}" is ${rail.voltage}V`,
                        affectedNodes: [node.id],
                    });
                }
            }
        }
    }

    // 2. Missing ground
    if (shouldRun('ground')) {
        const grounded = new Set<string>();
        for (const edge of graph.edges) {
            if (edge.net_name === graph.ground_net || edge.signal_type === 'ground') {
                grounded.add(edge.source_node);
                grounded.add(edge.target_node);
            }
        }
        const icTypes = new Set(['mcu', 'sensor', 'regulator']);
        for (const node of graph.nodes) {
            if (icTypes.has(node.type) && !grounded.has(node.id)) {
                issues.push({
                    id: `W_GND_${++issueIdx}`,
                    type: 'missing_ground',
                    severity: 'error',
                    message: `${node.id} has no ground connection`,
                    affectedNodes: [node.id],
                });
            }
        }
    }

    // 3. Short circuits
    if (shouldRun('short')) {
        const powerPins = new Set(['VCC', 'VOUT']);
        const gndPins = new Set(['GND']);
        for (const edge of graph.edges) {
            if (edge.signal_type === 'ground' || edge.net_name === graph.ground_net) continue;
            const src = edge.source_pin.toUpperCase();
            const tgt = edge.target_pin.toUpperCase();
            if ((powerPins.has(src) && gndPins.has(tgt)) || (gndPins.has(src) && powerPins.has(tgt))) {
                issues.push({
                    id: `W_SHORT_${++issueIdx}`,
                    type: 'short_circuit',
                    severity: 'error',
                    message: `Short: ${edge.source_node}.${edge.source_pin} → ${edge.target_node}.${edge.target_pin}`,
                    affectedNodes: [edge.source_node, edge.target_node],
                });
            }
        }
    }

    // 4. Multiple outputs on same net
    if (shouldRun('multiout')) {
        const netOutputs = new Map<string, string[]>();
        const outputPins = new Set(['VOUT', 'TX', 'MOSI', 'SCK']);
        for (const edge of graph.edges) {
            if (outputPins.has(edge.source_pin.toUpperCase()) || edge.signal_type === 'power') {
                const list = netOutputs.get(edge.net_name) ?? [];
                const key = `${edge.source_node}.${edge.source_pin}`;
                if (!list.includes(key)) list.push(key);
                netOutputs.set(edge.net_name, list);
            }
        }
        for (const [netName, outputs] of netOutputs) {
            if (outputs.length > 1) {
                issues.push({
                    id: `W_MOUT_${++issueIdx}`,
                    type: 'multiple_outputs',
                    severity: 'error',
                    message: `Net "${netName}" has ${outputs.length} drivers: ${outputs.join(', ')}`,
                    affectedNodes: outputs.map((o) => o.split('.')[0]),
                });
            }
        }
    }

    // 5. Floating inputs
    if (shouldRun('floating')) {
        const connectedPins = new Set<string>();
        for (const edge of graph.edges) {
            connectedPins.add(`${edge.source_node}:${edge.source_pin}`);
            connectedPins.add(`${edge.target_node}:${edge.target_pin}`);
        }
        const inputPatterns = ['SDA', 'SCL', 'MISO', 'RX', 'CS', 'EN', 'RST', 'INT'];
        const excludePins = new Set(['VCC', 'VIN', 'GND', 'VOUT']);
        const icTypes = new Set(['mcu', 'sensor', 'regulator']);
        for (const node of graph.nodes) {
            if (!icTypes.has(node.type)) continue;
            for (const pin of node.pins) {
                const upper = pin.toUpperCase();
                if (excludePins.has(upper)) continue;
                const isInput = inputPatterns.some((p) => upper.includes(p)) || upper.startsWith('GPIO');
                if (isInput && !connectedPins.has(`${node.id}:${pin}`)) {
                    issues.push({
                        id: `W_FLOAT_${++issueIdx}`,
                        type: 'floating_input',
                        severity: 'warning',
                        message: `${node.id}.${pin} appears unconnected`,
                        affectedNodes: [node.id],
                    });
                }
            }
        }
    }

    // 6. Decoupling caps
    if (shouldRun('decoupling')) {
        const decoupledICs = new Set<string>();
        const icTypes = new Set(['mcu', 'sensor', 'regulator']);
        for (const node of graph.nodes) {
            if (node.type !== 'passive') continue;
            const purpose = String(node.properties.purpose ?? '').toLowerCase();
            if (!purpose.includes('decoupling')) continue;
            const edges = edgesForNode.get(node.id) ?? [];
            for (const edge of edges) {
                const peerId = edge.source_node === node.id ? edge.target_node : edge.source_node;
                const peer = nodeMap.get(peerId);
                if (peer && icTypes.has(peer.type)) decoupledICs.add(peer.id);
            }
        }
        const uncovered: string[] = [];
        for (const node of graph.nodes) {
            if (icTypes.has(node.type) && !decoupledICs.has(node.id)) uncovered.push(node.id);
        }
        if (uncovered.length > 0) {
            issues.push({
                id: `W_DCAP_${++issueIdx}`,
                type: 'missing_decoupling',
                severity: 'warning',
                message: `${uncovered.length} IC(s) without decoupling cap: ${uncovered.join(', ')}`,
                affectedNodes: uncovered,
            });
        }
    }

    // 7. Pull-up resistors
    if (shouldRun('pullup')) {
        const hasI2C = graph.edges.some(
            (e) => ['SDA', 'SCL'].includes(e.source_pin.toUpperCase()) ||
                ['SDA', 'SCL'].includes(e.target_pin.toUpperCase()),
        );
        if (hasI2C) {
            let hasSda = false;
            let hasScl = false;
            for (const node of graph.nodes) {
                if (node.type !== 'passive') continue;
                const purpose = String(node.properties.purpose ?? '').toLowerCase();
                if (!purpose.includes('pull-up') && !purpose.includes('pullup')) continue;
                if (purpose.includes('sda')) hasSda = true;
                if (purpose.includes('scl')) hasScl = true;
                const edges = edgesForNode.get(node.id) ?? [];
                for (const edge of edges) {
                    if ([edge.source_pin, edge.target_pin].some((p) => p.toUpperCase() === 'SDA')) hasSda = true;
                    if ([edge.source_pin, edge.target_pin].some((p) => p.toUpperCase() === 'SCL')) hasScl = true;
                }
            }
            if (!hasSda) issues.push({ id: `W_PU_${++issueIdx}`, type: 'missing_pullup_sda', severity: 'warning', message: 'I2C SDA has no pull-up', affectedNodes: [] });
            if (!hasScl) issues.push({ id: `W_PU_${++issueIdx}`, type: 'missing_pullup_scl', severity: 'warning', message: 'I2C SCL has no pull-up', affectedNodes: [] });
        }
    }

    // 8. GPIO current
    if (shouldRun('gpio')) {
        for (const node of graph.nodes) {
            if (node.type !== 'mcu') continue;
            const maxMa = Number(node.properties.gpio_max_current_mA ?? 20);
            const edges = edgesForNode.get(node.id) ?? [];
            for (const edge of edges) {
                if (edge.source_node !== node.id || edge.signal_type !== 'signal') continue;
                const target = nodeMap.get(edge.target_node);
                if (!target) continue;
                const drawMa = Number(target.properties.current_draw_mA ?? 0);
                if (drawMa > maxMa) {
                    issues.push({
                        id: `W_GPIO_${++issueIdx}`,
                        type: 'gpio_overcurrent',
                        severity: 'error',
                        message: `${target.id} draws ${drawMa}mA, ${node.id} GPIO max ${maxMa}mA`,
                        affectedNodes: [node.id, target.id],
                    });
                }
            }
        }
    }

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
        command: 'VALIDATE',
        id,
        durationMs: performance.now() - start,
        result: {
            issues,
            isValid: errors.length === 0,
            errorCount: errors.length,
            warningCount: warnings.length,
        },
    };
}

// ─── MERGE ───

function handleMerge(
    id: string,
    graph: SerializableCircuitGraph,
    start: number,
): WorkerResponse {
    // Build nets from edges: group edges by net_name
    const netMap = new Map<string, Set<string>>();
    const netSignals = new Map<string, string>();
    const netVoltages = new Map<string, number | null>();

    for (const edge of graph.edges) {
        if (!netMap.has(edge.net_name)) {
            netMap.set(edge.net_name, new Set());
            netSignals.set(edge.net_name, edge.signal_type);
        }
        const pins = netMap.get(edge.net_name)!;
        pins.add(`${edge.source_node}:${edge.source_pin}`);
        pins.add(`${edge.target_node}:${edge.target_pin}`);
    }

    // Assign voltage from power rails
    for (const rail of graph.power_rails) {
        netVoltages.set(rail.name, rail.voltage);
    }

    // Build serializable nets
    const nets: SerializableNet[] = [];
    let mergeCount = 0;

    // Detect and merge nets that share pins
    const pinToNet = new Map<string, string>();
    const mergedNets = new Map<string, { name: string; pins: Set<string>; signal: string; voltage: number | null }>();

    for (const [netName, pins] of netMap) {
        let targetNet: string | null = null;

        for (const pin of pins) {
            if (pinToNet.has(pin)) {
                targetNet = pinToNet.get(pin)!;
                break;
            }
        }

        if (targetNet && mergedNets.has(targetNet)) {
            // Merge into existing net
            const existing = mergedNets.get(targetNet)!;
            for (const pin of pins) {
                existing.pins.add(pin);
                pinToNet.set(pin, targetNet);
            }
            existing.voltage = existing.voltage ?? netVoltages.get(netName) ?? null;
            mergeCount++;
        } else {
            // New net
            mergedNets.set(netName, {
                name: netName,
                pins: new Set(pins),
                signal: netSignals.get(netName) ?? 'digital',
                voltage: netVoltages.get(netName) ?? null,
            });
            for (const pin of pins) {
                pinToNet.set(pin, netName);
            }
        }
    }

    let netIdx = 0;
    for (const [, net] of mergedNets) {
        nets.push({
            id: `net_${++netIdx}`,
            name: net.name,
            pinIds: [...net.pins],
            signalType: net.signal,
            voltage: net.voltage,
        });
    }

    return {
        command: 'MERGE_NETS',
        id,
        durationMs: performance.now() - start,
        result: { nets, mergeCount },
    };
}

// ─── ANALYZE_CURRENT ───

function handleAnalyzeCurrent(
    id: string,
    graph: SerializableCircuitGraph,
    start: number,
): WorkerResponse {
    const nodeMap = buildNodeMap(graph);

    const nodeCurrents: Array<{
        nodeId: string;
        estimatedDrawMa: number;
        maxSourceMa: number;
        overloaded: boolean;
    }> = [];

    let totalDrawMa = 0;

    for (const node of graph.nodes) {
        // Estimate current draw
        let drawMa = Number(node.properties.current_draw_mA ?? 0);
        if (drawMa === 0) {
            drawMa = estimateCurrentByType(node.type);
        }

        // Estimate max source current (for regulators/power sources)
        let maxSourceMa = 0;
        if (node.type === 'regulator' || node.type === 'power_source') {
            maxSourceMa = Number(node.properties.max_output_current_mA ?? 500);
        }

        // Calculate downstream draw
        let downstreamDraw = 0;
        if (maxSourceMa > 0) {
            const downstream = getDownstream(node.id, graph);
            for (const nodeId of downstream) {
                const dNode = nodeMap.get(nodeId);
                if (dNode) {
                    downstreamDraw += Number(dNode.properties.current_draw_mA ?? estimateCurrentByType(dNode.type));
                }
            }
        }

        const overloaded = maxSourceMa > 0 && downstreamDraw > maxSourceMa;

        nodeCurrents.push({
            nodeId: node.id,
            estimatedDrawMa: drawMa,
            maxSourceMa,
            overloaded,
        });

        totalDrawMa += drawMa;
    }

    return {
        command: 'ANALYZE_CURRENT',
        id,
        durationMs: performance.now() - start,
        result: { nodeCurrents, totalDrawMa },
    };
}

// ─── TRAVERSE ───

function handleTraverse(
    id: string,
    graph: SerializableCircuitGraph,
    startNodeId: string,
    direction: 'upstream' | 'downstream' | 'both',
    start: number,
): WorkerResponse {
    const visited = new Set<string>();
    const visitedEdges = new Set<string>();
    const path: string[] = [];
    const queue: string[] = [startNodeId];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        path.push(nodeId);

        for (const edge of graph.edges) {
            const isSource = edge.source_node === nodeId;
            const isTarget = edge.target_node === nodeId;

            if (direction === 'downstream' && isSource) {
                visitedEdges.add(edge.id);
                queue.push(edge.target_node);
            } else if (direction === 'upstream' && isTarget) {
                visitedEdges.add(edge.id);
                queue.push(edge.source_node);
            } else if (direction === 'both' && (isSource || isTarget)) {
                visitedEdges.add(edge.id);
                queue.push(isSource ? edge.target_node : edge.source_node);
            }
        }
    }

    return {
        command: 'TRAVERSE',
        id,
        durationMs: performance.now() - start,
        result: {
            visitedNodeIds: [...visited],
            visitedEdgeIds: [...visitedEdges],
            path,
        },
    };
}

// ─── Helpers ───

function buildNodeMap(graph: SerializableCircuitGraph): Map<string, SerializableNode> {
    const map = new Map<string, SerializableNode>();
    for (const node of graph.nodes) map.set(node.id, node);
    return map;
}

function buildEdgesForNode(graph: SerializableCircuitGraph): Map<string, SerializableEdge[]> {
    const map = new Map<string, SerializableEdge[]>();
    for (const edge of graph.edges) {
        if (!map.has(edge.source_node)) map.set(edge.source_node, []);
        map.get(edge.source_node)!.push(edge);
        if (!map.has(edge.target_node)) map.set(edge.target_node, []);
        map.get(edge.target_node)!.push(edge);
    }
    return map;
}

function estimateCurrentByType(type: string): number {
    switch (type) {
        case 'mcu': return 80;
        case 'sensor': return 5;
        case 'regulator': return 2;
        case 'passive': return 0;
        case 'protection': return 0;
        default: return 10;
    }
}

function getDownstream(nodeId: string, graph: SerializableCircuitGraph): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const edge of graph.edges) {
            if (edge.source_node === current && !visited.has(edge.target_node)) {
                queue.push(edge.target_node);
            }
        }
    }
    visited.delete(nodeId);
    return [...visited];
}
