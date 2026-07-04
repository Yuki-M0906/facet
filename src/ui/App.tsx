/**
 * FACET v4.0.0 — トップレベルアプリ。
 * AppProvider で状態を供給し、Header + 現在の Phase + Footer を描画する。
 */

import { AppProvider, useApp, type PhaseId } from './store';
import { Header } from './components/Header';
import { PhaseMode } from './phases/PhaseMode';
import { PhaseSelect } from './phases/PhaseSelect';
import { PhaseTopology } from './phases/PhaseTopology';
import { PhaseIntake } from './phases/PhaseIntake';
import { PhaseBuild } from './phases/PhaseBuild';
import { PhaseAnalyze } from './phases/PhaseAnalyze';
import { PhaseResults } from './phases/PhaseResults';
import { PhaseComplete } from './phases/PhaseComplete';

function PhaseRouter() {
  const { state } = useApp();
  switch (state.phase satisfies PhaseId) {
    case 'mode': return <PhaseMode />;
    case 'select': return <PhaseSelect />;
    case 'topo': return <PhaseTopology />;
    case 'upload': return <PhaseIntake />;
    case 'build': return <PhaseBuild />;
    case 'analyze': return <PhaseAnalyze />;
    case 'results': return <PhaseResults />;
    case 'complete': return <PhaseComplete />;
  }
}

function Shell() {
  return (
    <>
      <Header />
      <main className="wrap">
        <PhaseRouter />
      </main>
      <footer>
        FACET — Network Verification Atelier · static config analysis · runs entirely in your browser
      </footer>
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
