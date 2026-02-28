// ─── Public API ───

export { EDADatabase, getDatabase } from './db';
export type { SnapshotRecord, MetaRecord } from './db';

export { PersistenceManager, getPersistenceManager } from './PersistenceManager';
export type { PersistenceConfig } from './PersistenceManager';

export { initPersistence, manualSave } from './bootstrap';
