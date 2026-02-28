/**
 * PersistenceManager — Auto-save, snapshots, and restore.
 *
 * Features:
 * - Auto-save every 10 seconds (configurable)
 * - Version snapshots (manual + auto on significant changes)
 * - Restore project state on reload
 * - Offline mode support (all data in IndexedDB)
 * - Prunes old snapshots to limit storage (default: keep 50)
 *
 * No React dependency. Pure TypeScript.
 */

import type { CircuitSnapshot } from '../engine/graph/models';
import { getDatabase } from './db';
import type { SnapshotRecord } from './db';

// ─── Config ───

export interface PersistenceConfig {
    /** Auto-save interval in milliseconds (default: 10000) */
    autoSaveIntervalMs: number;
    /** Maximum snapshots to keep (default: 50) */
    maxSnapshots: number;
    /** Whether auto-save is enabled (default: true) */
    autoSaveEnabled: boolean;
    /** Callback when save completes */
    onSave?: (version: number, durationMs: number) => void;
    /** Callback on save error */
    onError?: (error: Error) => void;
    /** Callback when state is restored */
    onRestore?: (version: number) => void;
}

const DEFAULT_CONFIG: PersistenceConfig = {
    autoSaveIntervalMs: 10_000,
    maxSnapshots: 50,
    autoSaveEnabled: true,
};

// ─── State Keys ───

const KEY_CURRENT = 'current_circuit';
const KEY_PROJECT_NAME = 'project_name';
const KEY_LAST_SAVE = 'last_save_timestamp';

// ─── Manager ───

export class PersistenceManager {
    private config: PersistenceConfig;
    private timer: ReturnType<typeof setInterval> | null = null;
    private lastSavedVersion = -1;
    private getSnapshot: (() => CircuitSnapshot) | null = null;
    private loadSnapshotFn: ((snapshot: CircuitSnapshot) => void) | null = null;

    constructor(config: Partial<PersistenceConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ─── Bind to Store ───

    /**
     * Connect the persistence manager to the circuit store.
     * @param getSnapshot Function that returns current CircuitSnapshot
     * @param loadSnapshot Function that loads a CircuitSnapshot into store
     */
    bind(
        getSnapshot: () => CircuitSnapshot,
        loadSnapshot: (snapshot: CircuitSnapshot) => void,
    ): void {
        this.getSnapshot = getSnapshot;
        this.loadSnapshotFn = loadSnapshot;
    }

    // ─── Auto-Save ───

    startAutoSave(): void {
        if (this.timer) return;
        if (!this.config.autoSaveEnabled) return;

        this.timer = setInterval(() => {
            this.save().catch((err) => {
                this.config.onError?.(err instanceof Error ? err : new Error(String(err)));
            });
        }, this.config.autoSaveIntervalMs);
    }

    stopAutoSave(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // ─── Save ───

    async save(label?: string): Promise<boolean> {
        if (!this.getSnapshot) return false;

        const start = performance.now();
        const snapshot = this.getSnapshot();

        // Skip if version hasn't changed
        if (snapshot.version === this.lastSavedVersion) return false;

        const db = getDatabase();

        try {
            // Save current state
            await db.saveState(KEY_CURRENT, snapshot);
            await db.setMeta(KEY_LAST_SAVE, Date.now());

            // Create version snapshot
            const dataStr = JSON.stringify(snapshot);
            const snapshotRecord: SnapshotRecord = {
                id: `snap_${snapshot.version}_${Date.now()}`,
                version: snapshot.version,
                timestamp: Date.now(),
                label: label ?? `Auto-save v${snapshot.version}`,
                data: snapshot,
                sizeBytes: new Blob([dataStr]).size,
            };
            await db.saveSnapshot(snapshotRecord);

            // Prune old snapshots
            await db.pruneSnapshots(this.config.maxSnapshots);

            this.lastSavedVersion = snapshot.version;
            const durationMs = performance.now() - start;

            this.config.onSave?.(snapshot.version, durationMs);
            return true;
        } catch (err) {
            this.config.onError?.(
                err instanceof Error ? err : new Error(String(err)),
            );
            return false;
        }
    }

    // ─── Manual Save with Label ───

    async saveManual(label: string): Promise<boolean> {
        return this.save(label);
    }

    // ─── Restore ───

    async restore(): Promise<boolean> {
        if (!this.loadSnapshotFn) return false;

        const db = getDatabase();

        try {
            const snapshot = await db.loadState<CircuitSnapshot>(KEY_CURRENT);
            if (!snapshot) return false;

            this.loadSnapshotFn(snapshot);
            this.lastSavedVersion = snapshot.version;
            this.config.onRestore?.(snapshot.version);
            return true;
        } catch (err) {
            this.config.onError?.(
                err instanceof Error ? err : new Error(String(err)),
            );
            return false;
        }
    }

    /**
     * Restore from a specific snapshot by ID.
     */
    async restoreSnapshot(snapshotId: string): Promise<boolean> {
        if (!this.loadSnapshotFn) return false;

        const db = getDatabase();

        try {
            const record = await db.getSnapshot(snapshotId);
            if (!record) return false;

            const snapshot = record.data as CircuitSnapshot;
            this.loadSnapshotFn(snapshot);
            this.lastSavedVersion = snapshot.version;
            this.config.onRestore?.(snapshot.version);
            return true;
        } catch (err) {
            this.config.onError?.(
                err instanceof Error ? err : new Error(String(err)),
            );
            return false;
        }
    }

    // ─── Snapshot Management ───

    async listSnapshots(): Promise<SnapshotRecord[]> {
        const db = getDatabase();
        return db.listSnapshots();
    }

    async deleteSnapshot(id: string): Promise<void> {
        const db = getDatabase();
        return db.deleteSnapshot(id);
    }

    // ─── Project Metadata ───

    async setProjectName(name: string): Promise<void> {
        const db = getDatabase();
        await db.setMeta(KEY_PROJECT_NAME, name);
    }

    async getProjectName(): Promise<string> {
        const db = getDatabase();
        return (await db.getMeta<string>(KEY_PROJECT_NAME)) ?? 'Untitled Project';
    }

    async getLastSaveTime(): Promise<number | null> {
        const db = getDatabase();
        return (await db.getMeta<number>(KEY_LAST_SAVE)) ?? null;
    }

    // ─── Lifecycle ───

    async clearAll(): Promise<void> {
        const db = getDatabase();
        await db.clear();
        this.lastSavedVersion = -1;
    }

    destroy(): void {
        this.stopAutoSave();
        this.getSnapshot = null;
        this.loadSnapshotFn = null;
    }
}

// ─── Singleton ───

let instance: PersistenceManager | null = null;

export function getPersistenceManager(
    config?: Partial<PersistenceConfig>,
): PersistenceManager {
    if (!instance) {
        instance = new PersistenceManager(config);
    }
    return instance;
}
