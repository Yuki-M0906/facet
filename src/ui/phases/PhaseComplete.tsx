/**
 * Phase 06 — 検証完了画面。
 * 元: v3.1.0 の p-complete セクション。
 */

import { useApp } from '../store';

export function PhaseComplete() {
  const { state, dispatch } = useApp();
  const router = state.router!;
  const devices = [router, ...state.switches];
  let ok = 0;
  devices.forEach((d) => d.ports.forEach((p) => { if (p.cfg && p.status === 'ok') ok++; }));

  return (
    <section className="phase">
      <div className="complete">
        <div className="gem">◆</div>
        <h2>検証完了</h2>
        <p>重要度の高い指摘が解消されました。</p>
        <div className="summary" style={{ maxWidth: 560, margin: '34px auto 0' }}>
          <div className="stat tot">
            <div className="num">{devices.length}</div>
            <div className="cap">検証機器</div>
          </div>
          <div className="stat ok">
            <div className="num">{ok}</div>
            <div className="cap">確認ポート</div>
          </div>
        </div>
        <div className="actions" style={{ justifyContent: 'center', marginTop: 30 }}>
          <button className="btn ghost" onClick={() => dispatch({ type: 'RESET' })}>
            新しい検証を開始
          </button>
        </div>
      </div>
    </section>
  );
}
