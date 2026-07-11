/**
 * Phase 05 — 検証レポート(スコア / カテゴリ / 経路トレース / 構成図 / マトリクス / 指摘 + エクスポート)。
 * 元: v3.1.0 の renderResults および buildTrace / runTrace / renderMatrix / renderFindings。
 */

import { useState } from 'react';
import type { Device, FindingCategory, RuntimePort } from '@engine/types';
import { asEngineState, useApp } from '../store';
import { Faceplate, type PortHoverPos } from '../components/Faceplate';
import { TopologyGraph } from '../components/TopologyGraph';
import { Matrix } from '../components/Matrix';
import { PathTracePanel } from '../components/PathTracePanel';
import { FindingsList, sortFindings, CB, LV } from '../components/FindingsList';
import { ScoreRing } from '../components/ScoreRing';
import { PortTooltip, buildPortTipContent, type TipState } from '../components/PortTooltip';

const CAT_NAMES: Record<FindingCategory, [string, string]> = {
  L1: ['物理', 'LAYER 1'],
  L2: ['VLAN/トランク', 'LAYER 2'],
  STP: ['STP/ループ', 'SPANNING-TREE'],
  L3: ['L3到達性', 'LAYER 3'],
  FW: ['FWポリシー', 'FIREWALL'],
  SEC: ['堅牢化', 'HARDENING'],
  CAP: ['機器能力', 'CAPABILITY'],
};

interface StatProps { kind: 'tot' | 'ok' | 'lack' | 'err'; n: number; cap: string }
function Stat({ kind, n, cap }: StatProps) {
  return (
    <div className={'stat ' + kind}>
      <div className="num">{n}</div>
      <div className="cap">{cap}</div>
    </div>
  );
}

/** シャーシ区画の折り畳みサマリ用(機器ごとの ok/err/lack 集計) */
function countStatuses(d: Device): { ok: number; err: number; lack: number } {
  const c = { ok: 0, err: 0, lack: 0 };
  d.ports.forEach((p) => {
    if (p.cfg) {
      if (p.status === 'ok') c.ok++;
      else if (p.status === 'err') c.err++;
      else if (p.status === 'lack') c.lack++;
    }
  });
  return c;
}

export function PhaseResults() {
  const { state, dispatch } = useApp();
  const result = state.result!;
  const router = state.router!;
  const engineState = asEngineState(state)!;
  const devices: Device[] = [router, ...state.switches];

  const [tip, setTip] = useState<TipState>({ content: null, x: 0, y: 0, visible: false });

  function handlePortHover(device: Device, port: RuntimePort, e: PortHoverPos) {
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

  /* サマリ集計(構成ポート / ok / lack / err) */
  let ok = 0, err = 0, lack = 0, tot = 0;
  devices.forEach((d) => d.ports.forEach((p) => {
    if (p.cfg) {
      tot++;
      if (p.status === 'ok') ok++;
      else if (p.status === 'err') err++;
      else if (p.status === 'lack') lack++;
    }
  }));
  const clean = err === 0 && lack === 0 && tot > 0;

  /* 上位の指摘(概要パネルでのプレビュー用、上位3件) */
  const topIssues = sortFindings(result.findings)
    .filter((f) => f.level === 'err' || f.level === 'lack')
    .slice(0, 3);

  /* エクスポート */
  function exportJson() {
    const payload = {
      generated: new Date().toISOString(),
      composition: {
        router: router.model.id,
        switches: state.switches.map((s) => s.model.id),
        topology: state.topoMode,
      },
      score: result.score,
      counts: { err: result.nErr, lack: result.nLack },
      categories: result.cats,
      subnets: result.subnets,
      findings: result.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'facet-report.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const [mdCopied, setMdCopied] = useState(false);
  function copyMd() {
    let md = '# FACET 検証レポート\n\n';
    md += '- 生成: ' + new Date().toLocaleString() + '\n';
    md += '- 構成: ' + router.model.id + ' + ' +
      state.switches.map((s) => s.model.id).join(', ') +
      ' (' + state.topoMode + ')\n';
    md += '- スコア: ' + result.score + ' / 100  (エラー ' + result.nErr + ' / 不足 ' + result.nLack + ')\n\n';
    md += '## Findings\n\n';
    result.findings.forEach((f) => {
      md += '- [' + f.level.toUpperCase() + '/' + f.cat + '] ' + f.where + ' — ' + f.desc +
        (f.fix ? ' / 提案: ' + f.fix : '') + '\n';
    });
    navigator.clipboard.writeText(md).then(() => {
      setMdCopied(true);
      setTimeout(() => setMdCopied(false), 1600);
    });
  }

  return (
    <section className="phase">
      <div className="kicker">Phase 05 — Verification Report</div>
      <h1 className="title">検証レポート</h1>
      <div className="disclaimer">
        これは<b>静的解析</b>です。設定上の不整合・脳閃・リスクを高精度に洗い出しますが、
        実機の物理疎通そのものを保証するものではありません。配備前監査・設定レビューの一次防衛線としてご利用ください。
      </div>

      {/* サブナビ */}
      <nav className="subnav">
        <div className="subnav-links">
          <a href="#hero">概要</a>
          <a href="#findings">指摘{result.nErr + result.nLack > 0 ? ` ${result.nErr + result.nLack}` : ''}</a>
          <a href="#diagnostics">診断</a>
        </div>
      </nav>

      {/* 概要(スコア・サマリ・カテゴリ・上位の指摘) */}
      <div className="panel tier-hero" id="hero">
        <div className="score">
          <ScoreRing score={result.score} />
          <div className="verdicttxt">
            <b>
              {result.nErr ? `要修正:エラー ${result.nErr} 件`
                : result.nLack ? `要確認:不足 ${result.nLack} 件`
                : '良好:重大な指摘なし'}
            </b>
            エラー {result.nErr} / コンフィグ不足 {result.nLack} 件を検出。スコアは重要度加重の目安です。
          </div>
        </div>

        <div className="summary">
          <Stat kind="tot" n={tot} cap="構成ポート" />
          <Stat kind="ok" n={ok} cap="確認" />
          <Stat kind="lack" n={lack} cap="不足" />
          <Stat kind="err" n={err} cap="エラー" />
        </div>

        <div className="cats" style={{ marginBottom: 0 }}>
          {(Object.keys(CAT_NAMES) as FindingCategory[]).map((c) => {
            const x = result.cats[c];
            const cls = x.err ? 'err' : x.lack ? 'lack' : 'ok';
            const txt = x.err ? 'エラー ' + x.err : x.lack ? '不足 ' + x.lack : '問題なし';
            return (
              <button
                type="button"
                key={c}
                className={'cat ' + cls + (state.filter === c ? ' active' : '')}
                aria-pressed={state.filter === c}
                onClick={() => {
                  dispatch({ type: 'SET_FILTER', filter: c });
                  document.getElementById('findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="cn">
                  {CAT_NAMES[c][0]}
                  <small>{CAT_NAMES[c][1]}</small>
                </div>
                <span className="pill">{txt}</span>
              </button>
            );
          })}
        </div>

        {topIssues.length > 0 && (
          <div className="topissues">
            <div className="topissues-label">上位の指摘</div>
            {topIssues.map((f, i) => (
              <a key={i} href="#findings" className={'finding compact ' + f.level}>
                <span className={'badge ' + f.level}>{LV[f.level]}</span>
                <span className="badge cat">{CB[f.cat] || f.cat}</span>
                <span className="loc">{f.where}</span>
                <span className="desc">{f.desc}</span>
              </a>
            ))}
            <a href="#findings" className="topissues-more">
              指摘 {result.nErr + result.nLack} 件をすべて見る ▸
            </a>
          </div>
        )}
      </div>

      {/* 指摘 */}
      <div className="panel tier-hero" id="findings">
        <div className="eyebrow">Findings & Suggestions</div>
        <FindingsList
          result={result}
          filter={state.filter}
          onFilter={(f) => dispatch({ type: 'SET_FILTER', filter: f })}
        />
      </div>

      {/* 診断(経路トレース・論理接続図・シャーシ・マトリクス、既定で折り畳み) */}
      <div id="diagnostics">
        <details className="panel tier-ref">
          <summary className="eyebrow-collapsible">Reachability — 経路トレース</summary>
          <div className="panel-body">
            <PathTracePanel engineState={engineState} subnets={result.subnets} />
            <p className="note">
              送信元サブネットから宛先までをホップ単位で追跡し、ゲートウェイ・ルーティング・FWポリシー・NATのどこで許可/遮断されるかを表示します。
            </p>
          </div>
        </details>

        <details className="panel tier-ref">
          <summary className="eyebrow-collapsible">Topology — 論理接続図</summary>
          <div className="panel-body">
            <TopologyGraph
              router={router}
              switches={state.switches}
              links={state.links}
              annot={true}
              result={result}
            />
          </div>
        </details>

        <details className="panel tier-ref">
          <summary className="eyebrow-collapsible">Chassis — ポート別ステータス</summary>
          <div className="panel-body">
            {devices.map((d, i) => {
              const c = countStatuses(d);
              return (
                <details className="devblock-details" key={d.key} open={i === 0}>
                  <summary className="devblock-summary">
                    <span>{d.name}</span>
                    <span className="dvdots">
                      {c.err > 0 && <span className="dvdot err">エラー {c.err}</span>}
                      {c.lack > 0 && <span className="dvdot lack">不足 {c.lack}</span>}
                      {c.err === 0 && c.lack === 0 && <span className="dvdot ok">確認 {c.ok}</span>}
                    </span>
                  </summary>
                  <Faceplate
                    device={d}
                    annot={true}
                    onPortHover={handlePortHover}
                    onPortLeave={handlePortLeave}
                  />
                </details>
              );
            })}
            <div className="legend">
              <span className="lg-ok"><i />確認</span>
              <span className="lg-err"><i />エラー</span>
              <span className="lg-lack"><i />コンフィグ不足</span>
              <span className="lg-idle"><i />未使用</span>
            </div>
          </div>
        </details>

        <details className="panel tier-ref">
          <summary className="eyebrow-collapsible">Reachability Matrix — サブネット間到達性</summary>
          <div className="panel-body">
            <Matrix matrix={result.matrix} />
            <p className="note">○=通過 / ×=ポリシーで遮断・未許可 / △=L3ゲートウェイ無し。同一サブネット内(L2)は対象外。</p>
          </div>
        </details>
      </div>

      {/* 操作 */}
      <div className="actions">
        <span className="left">
          {clean ? '全レイヤ「確認」— 検証完了が可能' : `未解決:エラー ${err} / 不足 ${lack}`}
        </span>
        <button className="btn ghost" onClick={exportJson}>⇩ JSON</button>
        <button className="btn ghost" onClick={copyMd}>
          {mdCopied ? 'コピーしました ✓' : '⇩ Markdownコピー'}
        </button>
        <button className="btn ghost" onClick={() => window.print()}>⇩ 印刷/PDF</button>
        {!clean && (
          <button
            className="btn ghost"
            onClick={() => {
              if (state.mode !== 'build') dispatch({ type: 'CLEAR_INTAKE' });
              dispatch({ type: 'NAV', phase: state.mode === 'build' ? 'build' : 'upload' });
            }}
          >
            {state.mode === 'build' ? '⟲ 再編集' : '⟲ 再投入'}
          </button>
        )}
        {clean && (
          <button className="btn primary" onClick={() => dispatch({ type: 'NAV', phase: 'complete' })}>
            検証完了 →
          </button>
        )}
      </div>

      <PortTooltip tip={tip} />
    </section>
  );
}
