import { useDesignStore } from './store/designStore';
import DesignInput from './components/DesignInput';
import PipelineOutput from './components/PipelineOutput';
import SchematicCanvas from './canvas/SchematicCanvas';
import './styles/index.css';

export default function App() {
  const { pipelineResult, error } = useDesignStore();
  const circuit = pipelineResult?.circuit ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__logo">
          <span className="app__logo-icon">⚡</span>
          <h1 className="app__title">AI EDA</h1>
          <span className="app__subtitle">AI-Native EDA</span>
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
          <SchematicCanvas circuit={circuit} />
        </section>
      </main>
    </div>
  );
}
