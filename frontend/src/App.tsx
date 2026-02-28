import { useDesignStore } from './store/designStore';
import DesignInput from './components/DesignInput';
import PipelineOutput from './components/PipelineOutput';
import SchematicCanvas from './canvas/SchematicCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

export default function App() {
  const { pipelineResult, error } = useDesignStore();

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__logo">
          <span className="app__logo-icon">⚡</span>
          <h1 className="app__title">AI EDA</h1>
          <span className="app__subtitle">AI-Native EDA</span>
        </div>
        <div className="app__toolbar">
          <span className="app__status">
            {pipelineResult ? `${pipelineResult.circuit.nodes.length} components` : 'No design loaded'}
          </span>
        </div>
      </header>

      <main className="app__main">
        <aside className="app__sidebar">
          <DesignInput />
          {error && (
            <div className="app__error">
              <strong>Error:</strong> {error}
            </div>
          )}
          <PipelineOutput result={pipelineResult} />
        </aside>

        <section className="app__canvas">
          <ErrorBoundary
            fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9999bb', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '18px', marginBottom: '8px' }}>⚠ Canvas failed to load</p>
                  <p style={{ fontSize: '13px', color: '#666688' }}>WebGL may not be available. Check browser console for details.</p>
                </div>
              </div>
            }
          >
            <SchematicCanvas />
          </ErrorBoundary>
        </section>
      </main>
    </div>
  );
}

