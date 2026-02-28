/**
 * API Client — Axios-based typed HTTP client for ANTIGRAVITY EDA.
 *
 * Features:
 * - Environment-based API URL (VITE_API_URL)
 * - Typed request/response for every endpoint
 * - Request/response interceptors for error handling
 * - Automatic JSON serialization
 * - Centralized error normalization
 */

import axios, {
    type AxiosInstance,
    type AxiosError,
} from 'axios';

import type {
    PipelineResult,
    CircuitGraph,
    ValidationResult,
    BOMEntry,
    PCBConstraints,
} from '../types/schema';

// ─── Config ───

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

// ─── Error Types ───

export interface ApiErrorDetail {
    status: number;
    message: string;
    detail: string | null;
    code: string | null;
}

export class ApiError extends Error {
    status: number;
    detail: string | null;
    code: string | null;

    constructor(info: ApiErrorDetail) {
        super(info.message);
        this.name = 'ApiError';
        this.status = info.status;
        this.detail = info.detail;
        this.code = info.code;
    }
}

// ─── Response Types ───

export interface ProjectResponse {
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    circuits: CircuitSummary[];
}

export interface CircuitSummary {
    id: string;
    name: string;
    version: number;
    is_valid: boolean;
    updated_at: string;
}

export interface ProjectListResponse {
    projects: ProjectListItem[];
    total: number;
}

export interface ProjectListItem {
    id: string;
    name: string;
    status: string;
    circuit_count: number;
    created_at: string;
    updated_at: string;
}

export interface CircuitResponse {
    id: string;
    project_id: string;
    name: string;
    version: number;
    graph_data: CircuitGraph | null;
    is_valid: boolean;
    validation_errors: ValidationResult | null;
    intent_data: Record<string, unknown> | null;
    components_data: Record<string, unknown> | null;
    bom_data: {
        bom: BOMEntry[];
        total_estimated_cost: string;
        component_count: number;
    } | null;
    pcb_constraints_data: PCBConstraints | null;
    source_description: string | null;
    created_at: string;
    updated_at: string;
}

export interface CircuitValidationResponse {
    circuit_id: string;
    validation: ValidationResult;
    bom: {
        bom: BOMEntry[];
        total_estimated_cost: string;
        component_count: number;
    } | null;
    pcb_constraints: PCBConstraints | null;
}

export interface HealthResponse {
    status: string;
    service: string;
    version: string;
}

// ─── Client Factory ───

function createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
        baseURL: API_BASE,
        timeout: 60_000,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    // ─ Response interceptor: normalize errors
    instance.interceptors.response.use(
        (response) => response,
        (error: AxiosError<{ detail?: string }>) => {
            const status = error.response?.status ?? 0;
            const detail = error.response?.data?.detail ?? null;
            const message =
                detail || error.message || `Request failed (${status})`;

            return Promise.reject(
                new ApiError({
                    status,
                    message,
                    detail,
                    code: error.code ?? null,
                })
            );
        }
    );

    return instance;
}

// ─── Client Class ───

class ApiClient {
    private http: AxiosInstance;

    constructor() {
        this.http = createAxiosInstance();
    }

    // ─── Health ───

    async healthCheck(): Promise<HealthResponse> {
        const { data } = await this.http.get<HealthResponse>('/health');
        return data;
    }

    // ─── Pipeline (Stateless) ───

    async runPipeline(description: string): Promise<PipelineResult> {
        const { data } = await this.http.post<PipelineResult>(
            '/api/pipeline/run',
            { description }
        );
        return data;
    }

    async parseIntent(description: string) {
        const { data } = await this.http.post(
            '/api/pipeline/parse',
            { description }
        );
        return data;
    }

    // ─── Projects ───

    async createProject(
        name: string,
        description?: string
    ): Promise<ProjectResponse> {
        const { data } = await this.http.post<ProjectResponse>(
            '/api/projects/',
            { name, description }
        );
        return data;
    }

    async getProject(projectId: string): Promise<ProjectResponse> {
        const { data } = await this.http.get<ProjectResponse>(
            `/api/projects/${projectId}`
        );
        return data;
    }

    async listProjects(
        offset = 0,
        limit = 50
    ): Promise<ProjectListResponse> {
        const { data } = await this.http.get<ProjectListResponse>(
            '/api/projects/',
            { params: { offset, limit } }
        );
        return data;
    }

    async updateProject(
        projectId: string,
        updates: { name?: string; description?: string; status?: string }
    ): Promise<ProjectResponse> {
        const { data } = await this.http.patch<ProjectResponse>(
            `/api/projects/${projectId}`,
            updates
        );
        return data;
    }

    async deleteProject(projectId: string): Promise<void> {
        await this.http.delete(`/api/projects/${projectId}`);
    }

    // ─── Circuits ───

    async createCircuit(
        projectId: string,
        name = 'Main',
        sourceDescription?: string
    ): Promise<CircuitResponse> {
        const { data } = await this.http.post<CircuitResponse>(
            `/api/circuits/projects/${projectId}/circuits`,
            { name, source_description: sourceDescription }
        );
        return data;
    }

    async getCircuit(circuitId: string): Promise<CircuitResponse> {
        const { data } = await this.http.get<CircuitResponse>(
            `/api/circuits/${circuitId}`
        );
        return data;
    }

    async listCircuits(
        projectId: string
    ): Promise<CircuitResponse[]> {
        const { data } = await this.http.get<CircuitResponse[]>(
            `/api/circuits/projects/${projectId}/circuits`
        );
        return data;
    }

    async updateCircuitGraph(
        circuitId: string,
        graph: CircuitGraph
    ): Promise<CircuitResponse> {
        const { data } = await this.http.put<CircuitResponse>(
            `/api/circuits/${circuitId}/graph`,
            { graph }
        );
        return data;
    }

    async generateCircuit(
        circuitId: string,
        description: string
    ): Promise<CircuitResponse> {
        const { data } = await this.http.post<CircuitResponse>(
            `/api/circuits/${circuitId}/generate`,
            { description }
        );
        return data;
    }

    async deleteCircuit(circuitId: string): Promise<void> {
        await this.http.delete(`/api/circuits/${circuitId}`);
    }

    // ─── Validation ───

    async validateCircuit(
        circuitId: string
    ): Promise<CircuitValidationResponse> {
        const { data } = await this.http.post<CircuitValidationResponse>(
            `/api/validate/circuits/${circuitId}`
        );
        return data;
    }

    async validateInline(
        graph: CircuitGraph
    ): Promise<ValidationResult> {
        const { data } = await this.http.post<ValidationResult>(
            '/api/validate/inline',
            graph
        );
        return data;
    }

    // ─── Components ───

    async getComponents() {
        const { data } = await this.http.get('/api/components/');
        return data;
    }

    async getMCUs() {
        const { data } = await this.http.get('/api/components/mcus');
        return data;
    }

    async getSensors() {
        const { data } = await this.http.get('/api/components/sensors');
        return data;
    }

    async getRegulators() {
        const { data } = await this.http.get('/api/components/regulators');
        return data;
    }
}

// ─── Singleton Export ───

export const apiClient = new ApiClient();
export { API_BASE, WS_BASE };
export default ApiClient;
