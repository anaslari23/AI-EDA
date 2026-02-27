import { useDesignStore } from './store/designStore';
import DesignInput from './components/DesignInput';
import PipelineOutput from './components/PipelineOutput';
import SchematicCanvas from './canvas/SchematicCanvas';
import './styles/index.css';

export default function App() {
  const { pipelineResult, error } = useDesignStore();

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__logo">
          <span className="app__logo-icon">⚡</span>
          <h1 className="app__title">ANTIGRAVITY</h1>
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
          <SchematicCanvas />
        </section>
      </main>
    </div>
  );
}
