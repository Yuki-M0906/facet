/**
 * FACET v4.0.0 — トップレベルアプリ。
 * AppProvider で状態を供給し、Header + 現在の Phase + Footer を描画する。
 */

import { useEffect } from 'react';
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
import { PhaseQuick } from './phases/PhaseQuick';
import { PhaseQuickResults } from './phases/PhaseQuickResults';

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
    case 'quick': return <PhaseQuick />;
    case 'quickResults': return <PhaseQuickResults />;
  }
}

function Shell() {
  const { state } = useApp();
  /* 全機能監査再調査: main には独自のスクロールコンテナが無く(ページ全体が
   * window/body スクロール)、フェーズ遷移時にスクロール位置がリセットされない。
   * 長いResultsページを下までスクロールした状態で「⟲ 再投入」等を押すと、
   * 遷移先の短いフェーズが同じピクセルオフセットのまま(=途中から)表示される。 */
  useEffect(() => { window.scrollTo(0, 0); }, [state.phase]);
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
