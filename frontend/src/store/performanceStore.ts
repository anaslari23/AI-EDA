import { create } from 'zustand';

import type { WorkerCommand } from '../workers/protocol';

interface WorkerTelemetry {
  command: WorkerCommand;
  durationMs: number;
  queueDepth: number;
  timestamp: number;
}

interface RenderTelemetry {
  fps: number;
  frameDeltaMs: number;
  droppedFrames: number;
  lastFrameAt: number | null;
}

interface PerformanceState {
  worker: {
    lastByCommand: Partial<Record<WorkerCommand, WorkerTelemetry>>;
    totalJobs: number;
    maxQueueDepth: number;
  };
  render: RenderTelemetry;
}

interface PerformanceActions {
  recordWorker: (command: WorkerCommand, durationMs: number, queueDepth: number) => void;
  recordFrame: (frameDeltaMs: number) => void;
  reset: () => void;
}

const initialState: PerformanceState = {
  worker: {
    lastByCommand: {},
    totalJobs: 0,
    maxQueueDepth: 0,
  },
  render: {
    fps: 0,
    frameDeltaMs: 0,
    droppedFrames: 0,
    lastFrameAt: null,
  },
};

export const usePerformanceStore = create<PerformanceState & PerformanceActions>((set) => ({
  ...initialState,

  recordWorker: (command, durationMs, queueDepth) =>
    set((state) => ({
      worker: {
        lastByCommand: {
          ...state.worker.lastByCommand,
          [command]: { command, durationMs, queueDepth, timestamp: Date.now() },
        },
        totalJobs: state.worker.totalJobs + 1,
        maxQueueDepth: Math.max(state.worker.maxQueueDepth, queueDepth),
      },
      render: state.render,
    })),

  recordFrame: (frameDeltaMs) =>
    set((state) => ({
      worker: state.worker,
      render: {
        ...state.render,
        frameDeltaMs,
        fps: frameDeltaMs > 0 ? 1000 / frameDeltaMs : state.render.fps,
        droppedFrames: state.render.droppedFrames + (frameDeltaMs > 34 ? 1 : 0),
        lastFrameAt: Date.now(),
      },
    })),

  reset: () => set(initialState),
}));
