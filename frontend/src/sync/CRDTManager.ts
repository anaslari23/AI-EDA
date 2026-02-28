/**
 * CRDTManager — Last-Writer-Wins Element Set with Hybrid Logical Clock.
 *
 * Provides conflict-free merge for circuit state diffs from multiple peers.
 * Each field path has an associated HLC timestamp. On conflict, the
 * higher timestamp wins. Ties broken by peer ID (lexicographic).
 *
 * Pure TypeScript. No React dependency.
 */

import type { HLCTimestamp, DiffOp } from './protocol';

// ─── HLC Operations ───

export function createHLC(peerId: string): HLCTimestamp {
    return { wall: Date.now(), logical: 0, peerId };
}

export function tickHLC(clock: HLCTimestamp): HLCTimestamp {
    const now = Date.now();
    if (now > clock.wall) {
        return { wall: now, logical: 0, peerId: clock.peerId };
    }
    return { wall: clock.wall, logical: clock.logical + 1, peerId: clock.peerId };
}

/**
 * Merge local clock with received remote clock.
 * Ensures monotonicity across peers.
 */
export function mergeHLC(
    local: HLCTimestamp,
    remote: HLCTimestamp,
    peerId: string,
): HLCTimestamp {
    const now = Date.now();
    const maxWall = Math.max(now, local.wall, remote.wall);

    let logical = 0;
    if (maxWall === local.wall && maxWall === remote.wall) {
        logical = Math.max(local.logical, remote.logical) + 1;
    } else if (maxWall === local.wall) {
        logical = local.logical + 1;
    } else if (maxWall === remote.wall) {
        logical = remote.logical + 1;
    }

    return { wall: maxWall, logical, peerId };
}

/**
 * Compare two HLC timestamps. Returns:
 *  < 0 : a happened before b
 *    0 : concurrent (same wall+logical)
 *  > 0 : a happened after b
 */
export function compareHLC(a: HLCTimestamp, b: HLCTimestamp): number {
    if (a.wall !== b.wall) return a.wall - b.wall;
    if (a.logical !== b.logical) return a.logical - b.logical;
    return a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0;
}

// ─── LWW Register Map ───

interface LWWEntry {
    value: unknown;
    clock: HLCTimestamp;
    tombstone: boolean;
}

/**
 * CRDTManager maintains a LWW-Element-Set over JSON diff paths.
 * Each path (e.g. "nodes.mcu1.label") has a timestamped value.
 */
export class CRDTManager {
    private entries = new Map<string, LWWEntry>();
    private clock: HLCTimestamp;
    private peerId: string;

    constructor(peerId: string) {
        this.peerId = peerId;
        this.clock = createHLC(peerId);
    }

    // ─── Local Operations ───

    /**
     * Apply a local change. Returns the diff to broadcast.
     */
    applyLocal(diffs: DiffOp[]): { diffs: DiffOp[]; clock: HLCTimestamp } {
        this.clock = tickHLC(this.clock);

        const applied: DiffOp[] = [];

        for (const diff of diffs) {
            const entry: LWWEntry = {
                value: diff.op === 'remove' ? undefined : (diff as { value: unknown }).value,
                clock: { ...this.clock },
                tombstone: diff.op === 'remove',
            };

            this.entries.set(diff.path, entry);
            applied.push(diff);
        }

        return { diffs: applied, clock: { ...this.clock } };
    }

    /**
     * Apply remote diffs. Returns which diffs were accepted (won LWW).
     */
    applyRemote(
        diffs: DiffOp[],
        remoteClock: HLCTimestamp,
    ): { accepted: DiffOp[]; rejected: string[] } {
        this.clock = mergeHLC(this.clock, remoteClock, this.peerId);

        const accepted: DiffOp[] = [];
        const rejected: string[] = [];

        for (const diff of diffs) {
            const existing = this.entries.get(diff.path);

            if (!existing || compareHLC(remoteClock, existing.clock) > 0) {
                // Remote wins — apply
                this.entries.set(diff.path, {
                    value: diff.op === 'remove' ? undefined : (diff as { value: unknown }).value,
                    clock: { ...remoteClock },
                    tombstone: diff.op === 'remove',
                });
                accepted.push(diff);
            } else {
                // Local wins — reject remote
                rejected.push(diff.path);
            }
        }

        return { accepted, rejected };
    }

    // ─── State Reconstruction ───

    /**
     * Build a plain object from all live (non-tombstoned) entries.
     */
    toState(): Record<string, unknown> {
        const state: Record<string, unknown> = {};

        for (const [path, entry] of this.entries) {
            if (entry.tombstone) continue;
            setNestedValue(state, path, entry.value);
        }

        return state;
    }

    /**
     * Load full state from server (replaces all entries).
     */
    loadFullState(state: Record<string, unknown>, clock: HLCTimestamp): void {
        this.entries.clear();
        this.clock = mergeHLC(this.clock, clock, this.peerId);

        const flat = flattenObject(state);
        for (const [path, value] of Object.entries(flat)) {
            this.entries.set(path, {
                value,
                clock: { ...clock },
                tombstone: false,
            });
        }
    }

    // ─── Diff Generation ───

    /**
     * Compute diffs between old and new state snapshots.
     */
    static computeDiffs(
        oldState: Record<string, unknown>,
        newState: Record<string, unknown>,
    ): DiffOp[] {
        const oldFlat = flattenObject(oldState);
        const newFlat = flattenObject(newState);
        const diffs: DiffOp[] = [];

        // Added or updated keys
        for (const [path, value] of Object.entries(newFlat)) {
            if (!(path in oldFlat)) {
                diffs.push({ op: 'add', path, value });
            } else if (JSON.stringify(oldFlat[path]) !== JSON.stringify(value)) {
                diffs.push({ op: 'update', path, value, oldValue: oldFlat[path] });
            }
        }

        // Removed keys
        for (const path of Object.keys(oldFlat)) {
            if (!(path in newFlat)) {
                diffs.push({ op: 'remove', path, oldValue: oldFlat[path] });
            }
        }

        return diffs;
    }

    // ─── Accessors ───

    getClock(): HLCTimestamp {
        return { ...this.clock };
    }

    getEntryCount(): number {
        return this.entries.size;
    }
}

// ─── Utility: Flatten/Unflatten JSON ───

function flattenObject(
    obj: Record<string, unknown>,
    prefix = '',
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            Object.assign(result, flattenObject(value as Record<string, unknown>, path));
        } else {
            result[path] = value;
        }
    }

    return result;
}

function setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
}
