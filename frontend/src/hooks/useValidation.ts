/**
 * useValidation — WebSocket hook for live circuit validation.
 *
 * Features:
 * - Persistent WebSocket connection to backend
 * - Auto-reconnect with exponential backoff
 * - Debounced graph sending (avoids flooding on rapid edits)
 * - Typed validation results pushed to canvas store
 * - Fallback to HTTP polling if WebSocket unavailable
 */

import { useEffect, useRef, useCallback, useState } from 'react';

import { apiClient } from '../api/client';
import { WS_BASE } from '../api/client';
import type { CircuitGraph, ValidationResult } from '../types/schema';

// ─── Config ───

const WS_VALIDATION_PATH = '/ws/validate';
const DEBOUNCE_MS = 500;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RETRIES = 10;

// ─── Types ───

export interface ValidationState {
    status: 'idle' | 'connecting' | 'validating' | 'done' | 'error';
    result: ValidationResult | null;
    lastValidated: number | null;
    wsConnected: boolean;
    error: string | null;
}

interface WsValidationMessage {
    type: 'validation_result' | 'error';
    data: ValidationResult | { message: string };
}

// ─── Hook ───

export function useValidation(_circuitId?: string) {
    const wsRef = useRef<WebSocket | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [state, setState] = useState<ValidationState>({
        status: 'idle',
        result: null,
        lastValidated: null,
        wsConnected: false,
        error: null,
    });

    // ─ Connect WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setState((s) => ({ ...s, status: 'connecting', error: null }));

        const url = `${WS_BASE}${WS_VALIDATION_PATH}`;
        const ws = new WebSocket(url);

        ws.onopen = () => {
            retryCountRef.current = 0;
            setState((s) => ({
                ...s,
                status: 'idle',
                wsConnected: true,
                error: null,
            }));
        };

        ws.onmessage = (event) => {
            try {
                const msg: WsValidationMessage = JSON.parse(event.data);

                if (msg.type === 'validation_result') {
                    const result = msg.data as ValidationResult;
                    setState((s) => ({
                        ...s,
                        status: 'done',
                        result,
                        lastValidated: Date.now(),
                        error: null,
                    }));
                } else if (msg.type === 'error') {
                    const errData = msg.data as { message: string };
                    setState((s) => ({
                        ...s,
                        status: 'error',
                        error: errData.message,
                    }));
                }
            } catch {
                // Ignore malformed messages
            }
        };

        ws.onerror = () => {
            setState((s) => ({
                ...s,
                status: 'error',
                wsConnected: false,
                error: 'WebSocket connection error',
            }));
        };

        ws.onclose = () => {
            wsRef.current = null;
            setState((s) => ({ ...s, wsConnected: false }));

            // Auto-reconnect with exponential backoff
            if (retryCountRef.current < MAX_RETRIES) {
                const delay = Math.min(
                    RECONNECT_BASE_MS * 2 ** retryCountRef.current,
                    RECONNECT_MAX_MS
                );
                retryCountRef.current++;
                reconnectTimerRef.current = setTimeout(connect, delay);
            }
        };

        wsRef.current = ws;
    }, []);

    // ─ Disconnect
    const disconnect = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        retryCountRef.current = MAX_RETRIES; // Prevent reconnect
        setState((s) => ({ ...s, wsConnected: false, status: 'idle' }));
    }, []);

    // ─ Send graph for validation (debounced)
    const validateGraph = useCallback(
        (graph: CircuitGraph) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            debounceRef.current = setTimeout(() => {
                setState((s) => ({ ...s, status: 'validating' }));

                // Try WebSocket first
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(
                        JSON.stringify({ type: 'validate', data: graph })
                    );
                    return;
                }

                // Fallback: HTTP inline validation
                apiClient
                    .validateInline(graph)
                    .then((result) => {
                        setState((s) => ({
                            ...s,
                            status: 'done',
                            result,
                            lastValidated: Date.now(),
                            error: null,
                        }));
                    })
                    .catch((err) => {
                        setState((s) => ({
                            ...s,
                            status: 'error',
                            error: err.message || 'Validation failed',
                        }));
                    });
            }, DEBOUNCE_MS);
        },
        []
    );

    // ─ Validate persisted circuit by ID
    const validatePersisted = useCallback(
        async (id: string) => {
            setState((s) => ({ ...s, status: 'validating' }));
            try {
                const response = await apiClient.validateCircuit(id);
                setState((s) => ({
                    ...s,
                    status: 'done',
                    result: response.validation,
                    lastValidated: Date.now(),
                    error: null,
                }));
                return response;
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : 'Validation failed';
                setState((s) => ({
                    ...s,
                    status: 'error',
                    error: message,
                }));
                return null;
            }
        },
        []
    );

    // ─ Lifecycle
    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return {
        ...state,
        validateGraph,
        validatePersisted,
        connect,
        disconnect,
    };
}

export default useValidation;
