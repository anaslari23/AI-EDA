import { create } from 'zustand';
import type { PipelineResult, CircuitGraph } from '../types';

interface DesignState {
    // Pipeline state
    description: string;
    isRunning: boolean;
    pipelineResult: PipelineResult | null;
    error: string | null;

    // Canvas state
    selectedNodeId: string | null;
    zoom: number;
    panX: number;
    panY: number;

    // Actions
    setDescription: (description: string) => void;
    setPipelineResult: (result: PipelineResult | null) => void;
    setRunning: (running: boolean) => void;
    setError: (error: string | null) => void;
    setSelectedNode: (nodeId: string | null) => void;
    setZoom: (zoom: number) => void;
    setPan: (x: number, y: number) => void;
    reset: () => void;
}

const initialState = {
    description: '',
    isRunning: false,
    pipelineResult: null,
    error: null,
    selectedNodeId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
};

export const useDesignStore = create<DesignState>((set) => ({
    ...initialState,

    setDescription: (description) => set({ description }),
    setPipelineResult: (pipelineResult) => set({ pipelineResult, error: null }),
    setRunning: (isRunning) => set({ isRunning }),
    setError: (error) => set({ error, isRunning: false }),
    setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
    setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
    setPan: (panX, panY) => set({ panX, panY }),
    reset: () => set(initialState),
}));
