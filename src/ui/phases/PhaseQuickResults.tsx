/**
 * 簡易検証モードの結果画面。
 * 元: このモード自体が新規(v4.19.0)。ScoreRing / FindingsList / Faceplate は
 * 検証モード側のコンポーネントをそのまま再利用する(表示ロジックの二重管理を避ける)。
 * マトリクス・経路トレース・トポロジー図など複数機器前提のセクションは
 * 単体機器のみのこのモードでは意味を持たないため、意図的に含めない。
 */

import { useState } from 'react';
import type { FindingCategory, RuntimePort } from '@engine/types';
import { useApp } from '../store';
import { Faceplate, type PortHoverPos } from '../components/Faceplate';
import { FindingsList } from '../components/FindingsList';
import { ScoreRing } from '../components/ScoreRing';
import { PortTooltip, buildPortTipContent, type TipState } from '../components/PortTooltip';

export function PhaseQuickResults() {
  const { state, dispatch } = useApp();
  const result = state.quickResult!;
  const device = state.quickDevice!;
  const [filter, setFilter] = useState<FindingCategory | 'all'>('all');
  const [tip, setTip] = useState<TipState>({ content: null, x: 0, y: 0, visible: false });

  function handlePortHover(_d: typeof device, port: RuntimePort, e: PortHoverPos) {
    const content = buildPortTipContent({
      devKey: device.key, iface: port.iface,
      type: port.type, speed: port.speed, poe: port.poe,
      cfg: port.cfg, status: port.status, msg: port.msg,
    });
    let x = e.clientX + 14;
    const y = e.clientY + 14;
    if (x + 330 > window.innerWidth) x = e.clientX - 330;
    setTip({ content, x, y, visible: true });
  }
  function handlePortLeave() { setTip((t) => ({ ...t, visible: false })); }

  return (
    <section className="phase">
      <div className="kicker">Quick Check — Result</div>
      <h1 className="title">簡易検証レポート — {device.name}</h1>
      <div className="disclaimer">
        これは<b>単体機器のみ</b>を対象にした静的チェックです。機器間の配線不一致・スパニングツリーの
        ループ検出・到達性マトリクス・経路トレースなど、複数機器にまたがるチェックはこのモードでは
        実行されていません。総合的な検証には「① 検証モード」をご利用ください。
      </div>

      <div className="panel tier-hero">
        <div className="score">
          <ScoreRing score={result.score} />
          <div className="verdicttxt">
            <b>
              {result.nErr ? `要修正:エラー ${result.nErr} 件`
                : result.nLack ? `要確認:不足 ${result.nLack} 件`
                : '良好:重大な指摘なし(単体機器チェックの範囲内)'}
            </b>
            エラー {result.nErr} / コンフィグ不足 {result.nLack} 件を検出。スコアは重要度加重の目安です。
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">Chassis — {device.key}</div>
        <Faceplate
          device={device}
          annot={true}
          onPortHover={handlePortHover}
          onPortLeave={handlePortLeave}
        />
        <div className="legend">
          <span className="lg-ok"><i />確認</span>
          <span className="lg-lack"><i />コンフィグ不足</span>
          <span className="lg-err"><i />エラー</span>
          <span className="lg-idle"><i />未使用</span>
        </div>
      </div>

      <div className="panel">
        <div className="eyebrow">Findings</div>
        <FindingsList result={result} filter={filter} onFilter={setFilter} />
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={() => dispatch({ type: 'QUICK_RESET' })}>
          ← 別のファイルを検証
        </button>
      </div>

      <PortTooltip tip={tip} />
    </section>
  );
}
