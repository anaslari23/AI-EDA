import type { PipelineResult } from '../types';

interface PipelineOutputProps {
    result: PipelineResult | null;
}

export default function PipelineOutput({ result }: PipelineOutputProps) {
    if (!result) return null;

    const { intent, validation, bom, pcb_constraints, corrections_applied, pipeline_status } = result;

    return (
        <div className="pipeline-output">
            <h3 className="pipeline-output__title">Pipeline Results</h3>

            {/* Status Badge */}
            <div className={`pipeline-output__status pipeline-output__status--${pipeline_status}`}>
                {pipeline_status === 'completed' ? '✓ Design Valid' : '⚠ Completed with Errors'}
            </div>

            {/* Intent Summary */}
            <section className="pipeline-output__section">
                <h4>Parsed Intent</h4>
                <div className="pipeline-output__grid">
                    <span className="pipeline-output__label">Device:</span>
                    <span>{intent.intent.device_type || '—'}</span>
                    <span className="pipeline-output__label">Power:</span>
                    <span>{intent.intent.power_source || '—'}</span>
                    <span className="pipeline-output__label">Environment:</span>
                    <span>{intent.intent.environment || '—'}</span>
                    <span className="pipeline-output__label">Confidence:</span>
                    <span>{(intent.confidence * 100).toFixed(0)}%</span>
                </div>
                {intent.intent.sensors.length > 0 && (
                    <div className="pipeline-output__tags">
                        {intent.intent.sensors.map((s) => (
                            <span key={s} className="pipeline-output__tag pipeline-output__tag--sensor">{s}</span>
                        ))}
                    </div>
                )}
                {intent.intent.connectivity.length > 0 && (
                    <div className="pipeline-output__tags">
                        {intent.intent.connectivity.map((c) => (
                            <span key={c} className="pipeline-output__tag pipeline-output__tag--conn">{c}</span>
                        ))}
                    </div>
                )}
            </section>

            {/* Validation (optional — may not be present after backend refactor) */}
            {validation && (
                <section className="pipeline-output__section">
                    <h4>Validation ({validation.checks_passed}/{validation.checks_total} passed)</h4>
                    {validation.errors.length > 0 && (
                        <ul className="pipeline-output__errors">
                            {validation.errors.map((e, i) => (
                                <li key={i} className="pipeline-output__error">
                                    <code>{e.code}</code>: {e.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {validation.warnings.length > 0 && (
                        <ul className="pipeline-output__warnings">
                            {validation.warnings.map((w, i) => (
                                <li key={i} className="pipeline-output__warning">
                                    <code>{w.code}</code>: {w.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {validation.errors.length === 0 && validation.warnings.length === 0 && (
                        <p className="pipeline-output__success">All checks passed.</p>
                    )}
                </section>
            )}

            {/* Corrections */}
            {corrections_applied && corrections_applied.length > 0 && (
                <section className="pipeline-output__section">
                    <h4>Auto-Corrections Applied</h4>
                    <ul>
                        {corrections_applied.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </section>
            )}

            {/* PCB Constraints */}
            {pcb_constraints && (
                <section className="pipeline-output__section">
                    <h4>PCB Constraints</h4>
                    <div className="pipeline-output__grid">
                        <span className="pipeline-output__label">Trace Width:</span>
                        <span>{pcb_constraints.trace_width}</span>
                        <span className="pipeline-output__label">Copper:</span>
                        <span>{pcb_constraints.copper_thickness}</span>
                        <span className="pipeline-output__label">Layers:</span>
                        <span>{pcb_constraints.layer_count}</span>
                        <span className="pipeline-output__label">Clearance:</span>
                        <span>{pcb_constraints.clearance}</span>
                    </div>
                </section>
            )}

            {/* BOM */}
            {bom && bom.bom.length > 0 && (
                <section className="pipeline-output__section">
                    <h4>Bill of Materials ({bom.component_count} components)</h4>
                    <table className="pipeline-output__table">
                        <thead>
                            <tr>
                                <th>Ref</th>
                                <th>Part Number</th>
                                <th>Qty</th>
                                <th>Package</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bom.bom.map((entry, i) => (
                                <tr key={i}>
                                    <td>{entry.reference_designator}</td>
                                    <td><code>{entry.part_number}</code></td>
                                    <td>{entry.quantity}</td>
                                    <td>{entry.package}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
