/**
 * Bootstrap — App startup persistence integration.
 *
 * Call `initPersistence()` once during app initialization
 * (e.g., in main.tsx or App.tsx useEffect).
 *
 * It will:
 * 1. Open IndexedDB
 * 2. Restore last saved circuit state (if any)
 * 3. Start auto-save interval
 * 4. Register beforeunload handler for emergency save
 */

import { useCircuitStore } from '../engine/graph/circuitStore';
import { getPersistenceManager } from './PersistenceManager';
import type { PersistenceConfig } from './PersistenceManager';

let initialized = false;

export async function initPersistence(
    config?: Partial<PersistenceConfig>,
): Promise<{ restored: boolean; version: number | null }> {
    if (initialized) {
        return { restored: false, version: null };
    }

    const manager = getPersistenceManager(config);
    const store = useCircuitStore.getState();

    // Bind to Zustand store
    manager.bind(
        () => store.getSnapshot(),
        (snapshot) => useCircuitStore.getState().loadSnapshot(snapshot),
    );

    // Attempt restore
    let restored = false;
    let version: number | null = null;

    try {
        restored = await manager.restore();
        if (restored) {
            version = useCircuitStore.getState().version;
            console.info(
                `[Persistence] Restored circuit v${version}`,
            );
        } else {
            console.info('[Persistence] No saved state found, starting fresh');
        }
    } catch (err) {
        console.warn('[Persistence] Restore failed:', err);
    }

    // Start auto-save
    manager.startAutoSave();

    // Emergency save on tab close
    window.addEventListener('beforeunload', () => {
        // Synchronous save attempt — IndexedDB transactions
        // may not complete, but we try anyway
        try {
            manager.save();
        } catch {
            // Best effort
        }
    });

    // Save when app goes to background (more reliable than beforeunload)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            manager.save().catch(() => { });
        }
    });

    initialized = true;

    return { restored, version };
}

/**
 * Force a manual save with a custom label.
 * Use for explicit "Save" button clicks.
 */
export async function manualSave(label?: string): Promise<boolean> {
    const manager = getPersistenceManager();
    return manager.saveManual(label ?? `Manual save ${new Date().toLocaleTimeString()}`);
}

/**
 * Get the persistence manager for advanced operations
 * (list snapshots, restore specific version, etc.)
 */
export { getPersistenceManager } from './PersistenceManager';
