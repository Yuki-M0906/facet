/**
 * Phase 04 — 検証中(過渡画面)。
 * 検証自体は RUN_VERIFY アクションで同期実行済。ここでは意匠上の固定長ウェイトを
 * 消化して results へ遷移する(実際の処理進捗を示すプログレス表示ではない —
 * メッセージ一覧は演出目的の装飾で、実処理のどの段階かとは対応しない)。
 *
 * 全機能監査再調査(Phase間遷移・ローディング状態の統一): OS の
 * 「視差効果を減らす」設定時はウェイトを大幅短縮する(短い固定遅延のみ確保し、
 * 画面の瞬間切り替わりによる違和感を避けつつ長時間の静止画面を強制しない)。
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
  'checking device capability limits',
];

export function PhaseAnalyze() {
  const { dispatch } = useApp();
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 150 : 2500;
    const tick = setInterval(() => setMsgIdx((i) => (i + 1) % MSGS.length), 420);
    const done = setTimeout(() => dispatch({ type: 'NAV', phase: 'results' }), duration);
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
