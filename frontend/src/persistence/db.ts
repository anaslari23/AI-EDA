/**
 * IndexedDB Wrapper — Low-level database operations.
 *
 * Provides a simple key-value + versioned snapshot store
 * built on raw IndexedDB (no external dependencies).
 *
 * Database schema:
 *   - "state"     : key-value store for current circuit state
 *   - "snapshots" : versioned circuit snapshots with timestamps
 *   - "meta"      : project metadata (name, last opened, etc.)
 */

const DB_NAME = 'ai-eda';
const DB_VERSION = 1;

const STORE_STATE = 'state';
const STORE_SNAPSHOTS = 'snapshots';
const STORE_META = 'meta';

// ─── Snapshot Record ───

export interface SnapshotRecord {
    id: string;
    version: number;
    timestamp: number;
    label: string;
    data: unknown;
    sizeBytes: number;
}

export interface MetaRecord {
    key: string;
    value: unknown;
}

// ─── Database Class ───

export class EDADatabase {
    private db: IDBDatabase | null = null;
    private opening: Promise<IDBDatabase> | null = null;

    // ─── Open ───

    async open(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.opening) return this.opening;

        this.opening = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // State store: single key-value pairs
                if (!db.objectStoreNames.contains(STORE_STATE)) {
                    db.createObjectStore(STORE_STATE);
                }

                // Snapshots: auto-incrementing with timestamp index
                if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                    const store = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('version', 'version', { unique: false });
                }

                // Meta: key-value pairs for project info
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                this.opening = null;
                resolve(this.db);
            };

            request.onerror = () => {
                this.opening = null;
                reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
            };
        });

        return this.opening;
    }

    // ─── State Store (current circuit) ───

    async saveState(key: string, value: unknown): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_STATE, 'readwrite');
            tx.objectStore(STORE_STATE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async loadState<T>(key: string): Promise<T | undefined> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_STATE, 'readonly');
            const req = tx.objectStore(STORE_STATE).get(key);
            req.onsuccess = () => resolve(req.result as T | undefined);
            req.onerror = () => reject(req.error);
        });
    }

    async deleteState(key: string): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_STATE, 'readwrite');
            tx.objectStore(STORE_STATE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ─── Snapshots ───

    async saveSnapshot(snapshot: SnapshotRecord): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
            tx.objectStore(STORE_SNAPSHOTS).put(snapshot);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getSnapshot(id: string): Promise<SnapshotRecord | undefined> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
            const req = tx.objectStore(STORE_SNAPSHOTS).get(id);
            req.onsuccess = () => resolve(req.result as SnapshotRecord | undefined);
            req.onerror = () => reject(req.error);
        });
    }

    async listSnapshots(): Promise<SnapshotRecord[]> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
            const idx = tx.objectStore(STORE_SNAPSHOTS).index('timestamp');
            const req = idx.openCursor(null, 'prev'); // newest first
            const results: SnapshotRecord[] = [];

            req.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    results.push(cursor.value as SnapshotRecord);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteSnapshot(id: string): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
            tx.objectStore(STORE_SNAPSHOTS).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async pruneSnapshots(keepCount: number): Promise<number> {
        const all = await this.listSnapshots();
        if (all.length <= keepCount) return 0;

        const toDelete = all.slice(keepCount);
        const db = await this.open();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
            const store = tx.objectStore(STORE_SNAPSHOTS);
            for (const snap of toDelete) {
                store.delete(snap.id);
            }
            tx.oncomplete = () => resolve(toDelete.length);
            tx.onerror = () => reject(tx.error);
        });
    }

    // ─── Meta ───

    async setMeta(key: string, value: unknown): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_META, 'readwrite');
            tx.objectStore(STORE_META).put({ key, value });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMeta<T>(key: string): Promise<T | undefined> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_META, 'readonly');
            const req = tx.objectStore(STORE_META).get(key);
            req.onsuccess = () => {
                const record = req.result as MetaRecord | undefined;
                resolve(record?.value as T | undefined);
            };
            req.onerror = () => reject(req.error);
        });
    }

    // ─── Utility ───

    async clear(): Promise<void> {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(
                [STORE_STATE, STORE_SNAPSHOTS, STORE_META],
                'readwrite',
            );
            tx.objectStore(STORE_STATE).clear();
            tx.objectStore(STORE_SNAPSHOTS).clear();
            tx.objectStore(STORE_META).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    close(): void {
        this.db?.close();
        this.db = null;
    }
}

// ─── Singleton ───

let instance: EDADatabase | null = null;

export function getDatabase(): EDADatabase {
    if (!instance) {
        instance = new EDADatabase();
    }
    return instance;
}
