/**
 * ErrorBoundary — React error boundary for graceful error handling.
 *
 * Catches render-time errors in child components and displays
 * a recovery UI instead of crashing the entire app.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary]', error, info);
        this.props.onError?.(error, info);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="error-boundary">
                    <div className="error-boundary__icon">⚠️</div>
                    <h3 className="error-boundary__title">
                        Something went wrong
                    </h3>
                    <p className="error-boundary__message">
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        className="error-boundary__retry"
                        onClick={this.handleRetry}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
