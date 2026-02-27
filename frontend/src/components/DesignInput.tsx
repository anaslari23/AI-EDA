import { useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { apiClient } from '../api/client';

export default function DesignInput() {
    const { description, setDescription, setPipelineResult, setRunning, setError, isRunning } =
        useDesignStore();
    const [localInput, setLocalInput] = useState(description);

    const handleSubmit = async () => {
        if (!localInput.trim() || localInput.length < 10) return;

        setDescription(localInput);
        setRunning(true);
        setError(null);

        try {
            const result = await apiClient.runPipeline(localInput);
            setPipelineResult(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Pipeline execution failed');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="design-input">
            <h3 className="design-input__title">Describe Your Hardware</h3>
            <textarea
                className="design-input__textarea"
                value={localInput}
                onChange={(e) => setLocalInput(e.target.value)}
                placeholder="e.g., A battery-powered weather station that measures temperature, humidity, and pressure. It should send data over WiFi every 15 minutes and log to an SD card. Budget under $50."
                rows={4}
                disabled={isRunning}
            />
            <button
                className="design-input__button"
                onClick={handleSubmit}
                disabled={isRunning || localInput.length < 10}
            >
                {isRunning ? 'Running Pipeline...' : 'Generate Design'}
            </button>
        </div>
    );
}
