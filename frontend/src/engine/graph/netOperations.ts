/**
 * Net Operations — merging, splitting, voltage domain tagging.
 *
 * Pure TypeScript. No React dependency.
 */

import type {
    Net,
    GraphPin,
    CircuitState,
    VoltageDomain,
    PinSignalType,
} from './models';

let netCounter = 0;
let domainCounter = 0;

export function generateNetId(): string {
    return `net_${++netCounter}`;
}

export function generateNetName(signalType: PinSignalType): string {
    if (signalType === 'power') return `VCC_${netCounter}`;
    if (signalType === 'ground') return `GND`;
    return `NET_${netCounter}`;
}

export function generateDomainId(): string {
    return `domain_${++domainCounter}`;
}

// ─── Net Creation ───

export function createNet(
    pin: GraphPin,
    overrideName?: string,
): Net {
    const id = generateNetId();
    const name = overrideName ?? generateNetName(pin.signalType);
    return {
        id,
        name,
        pinIds: [pin.id],
        signalType: pin.signalType,
        voltage: pin.voltage,
        voltageDomain: pin.voltageDomain,
        dirty: true,
    };
}

// ─── Net Merging ───

/**
 * Merge two nets into one. All pins from netB join netA.
 * Returns the merged net and the removed net ID.
 */
export function mergeNets(netA: Net, netB: Net): Net {
    // Use netA as the base (keeps its name unless netB is more specific)
    const name = pickNetName(netA, netB);
    const voltage = netA.voltage ?? netB.voltage;
    const domain = netA.voltageDomain ?? netB.voltageDomain;
    const signalType = pickSignalType(netA.signalType, netB.signalType);

    // De-duplicate pin IDs
    const pinIds = [...new Set([...netA.pinIds, ...netB.pinIds])];

    return {
        ...netA,
        name,
        pinIds,
        signalType,
        voltage,
        voltageDomain: domain,
        dirty: true,
    };
}

function pickNetName(a: Net, b: Net): string {
    // Prefer named nets (VCC, GND) over generic NET_N
    if (b.name.startsWith('VCC') || b.name === 'GND') return b.name;
    if (a.name.startsWith('VCC') || a.name === 'GND') return a.name;
    return a.name;
}

function pickSignalType(a: PinSignalType, b: PinSignalType): PinSignalType {
    // Power/ground take priority
    if (a === 'power' || b === 'power') return 'power';
    if (a === 'ground' || b === 'ground') return 'ground';
    return a;
}

// ─── Net Splitting ───

/**
 * Remove a pin from a net. If the net becomes empty, returns null
 * to signal it should be deleted.
 */
export function removePinFromNet(
    net: Net,
    pinId: string,
): Net | null {
    const pinIds = net.pinIds.filter((id) => id !== pinId);
    if (pinIds.length === 0) return null;
    return { ...net, pinIds, dirty: true };
}

// ─── Voltage Domain Tagging ───

/**
 * Rebuild voltage domains from current state.
 * A voltage domain is a group of nets sharing a common voltage
 * sourced by a regulator or power source.
 */
export function rebuildVoltageDomains(
    state: CircuitState,
): Record<string, VoltageDomain> {
    const domains: Record<string, VoltageDomain> = {};

    for (const node of Object.values(state.nodes)) {
        if (node.type !== 'regulator' && node.type !== 'power_source') continue;

        // Find output pins with known voltage
        for (const pin of node.pins) {
            if (
                pin.direction !== 'output' &&
                pin.direction !== 'power'
            ) continue;
            if (pin.voltage == null) continue;

            const domainId = generateDomainId();
            const domainName = `${pin.voltage}V`;

            // Find all nets reachable from this pin's net
            const netIds: string[] = [];
            const consumerNodeIds: string[] = [];

            if (pin.netId && state.nets[pin.netId]) {
                netIds.push(pin.netId);
                const net = state.nets[pin.netId];

                // Find all nodes connected to this net
                for (const pId of net.pinIds) {
                    for (const n of Object.values(state.nodes)) {
                        const found = n.pins.find((p) => p.id === pId);
                        if (found && n.id !== node.id) {
                            consumerNodeIds.push(n.id);
                        }
                    }
                }
            }

            domains[domainId] = {
                id: domainId,
                name: domainName,
                voltage: pin.voltage,
                sourceNodeId: node.id,
                netIds: [...new Set(netIds)],
                consumerNodeIds: [...new Set(consumerNodeIds)],
            };
        }
    }

    return domains;
}

/**
 * Tag all pins on a net with the net's voltage domain.
 * Mutates pins in place (call within Immer produce).
 */
export function tagPinsWithDomain(
    state: CircuitState,
    netId: string,
    domain: string | null,
): void {
    const net = state.nets[netId];
    if (!net) return;

    net.voltageDomain = domain;

    for (const pinId of net.pinIds) {
        for (const node of Object.values(state.nodes)) {
            const pin = node.pins.find((p) => p.id === pinId);
            if (pin) {
                pin.voltageDomain = domain;
            }
        }
    }
}
