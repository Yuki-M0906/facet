/**
 * Phase 04 — 検証中(過渡画面)。
 * 検証自体は RUN_VERIFY アクションで同期実行済。ここでは演出 2.5 秒を消化して results へ遷移。
 *
 * NOTE: この演出時間は v3.1.0 と同等(=互換性のため維持)。
 * Sprint 2 以降で「演出を消す」または「実所要時間表示」に置き換える候補。
 */

import { useEffect, useState } from 'react';
import { useApp } from '../store';

const MSGS = [
  'parsing configuration',
  'mapping interfaces to ports',
  'validating L1/L2',
  'checking spanning-tree',
  'computing L3 reachability',
  'evaluating firewall policy',
  'running hardening checks',
];

export function PhaseAnalyze() {
  const { dispatch } = useApp();
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setMsgIdx((i) => (i + 1) % MSGS.length), 420);
    const done = setTimeout(() => dispatch({ type: 'NAV', phase: 'results' }), 2500);
    return () => { clearInterval(tick); clearTimeout(done); };
  }, [dispatch]);

  return (
    <section className="phase">
      <div className="analyzing">
        <div className="shim">V E R I F Y I N G</div>
        <p>{MSGS[msgIdx]}</p>
      </div>
    </section>
  );
}
