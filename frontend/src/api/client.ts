import type { PipelineResult } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
            },
            ...options,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }

        return response.json();
    }

    async runPipeline(description: string): Promise<PipelineResult> {
        return this.request<PipelineResult>('/api/pipeline/run', {
            method: 'POST',
            body: JSON.stringify({ description }),
        });
    }

    async parseIntent(description: string) {
        return this.request('/api/pipeline/parse', {
            method: 'POST',
            body: JSON.stringify({ description }),
        });
    }

    async getComponents() {
        return this.request('/api/components/');
    }

    async getMCUs() {
        return this.request('/api/components/mcus');
    }

    async getSensors() {
        return this.request('/api/components/sensors');
    }

    async healthCheck() {
        return this.request<{ status: string }>('/health');
    }
}

export const apiClient = new ApiClient();
export default ApiClient;
