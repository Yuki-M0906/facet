/**
 * Phase 02 — 構成図と接続トポロジー。
 * フェイスプレート + モード切替(star/cascade/manual)+ リンク一覧 + 論理接続図。
 * 手動モードでは SVG ポートクリックで配線可。
 */

import { useState } from 'react';
import type { Device, RuntimePort } from '@engine/types';
import { useApp } from '../store';
import { Faceplate, type PortHoverPos } from '../components/Faceplate';
import { LinkList } from '../components/LinkList';
import { ManualLinkEditor } from '../components/ManualLinkEditor';
import { TopologyGraph } from '../components/TopologyGraph';
import { PortTooltip, buildPortTipContent, type TipState } from '../components/PortTooltip';

const HINTS: Record<'star' | 'cascade' | 'manual', string> = {
  star: 'スター:各スイッチのアップリンク(U1)がルータの X0 へ接続。最も一般的で、ループは生じません。',
  cascade: 'カスケード:ルータ→SW1→SW2…と数珠つなぎ。SW間リンクが追加されます。',
  manual: '手動:実配線に合わせてリンクを自由に追加します。',
};

export function PhaseTopology() {
  const { state, dispatch } = useApp();
  const router = state.router!;
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
  function handlePortLeave() {
    setTip((t) => ({ ...t, visible: false }));
  }

  const sel = state.topoMode === 'manual' ? state.topoSel : null;
  const selPort: RuntimePort | undefined = sel
    ? devices.find((d) => d.key === sel.key)?.ports.find((p) => p.iface === sel.iface)
    : undefined;

  return (
    <section className="phase">
      <div className="kicker">Phase 02 — Chassis & Topology</div>
      <h1 className="title">構成図と接続トポロジー</h1>
      <p className="lede">
        フェイスプレートを生成しました。<b>物理結線はコンフィグからは確定できない</b>ため、
        ここで実際の配線方式を指定します。これがSTP・到達性検証の前提になります。
      </p>

      <div className="panel">
        <div className="eyebrow">Chassis</div>
        <div>
          {devices.map((d) => (
            <Faceplate
              key={d.key}
              device={d}
              annot={false}
              onPortClick={state.topoMode === 'manual'
                ? (key, iface) => dispatch({ type: 'TOPO_PORT_CLICK', key, iface })
                : undefined}
              onPortHover={handlePortHover}
              onPortLeave={handlePortLeave}
              topoSel={state.topoMode === 'manual' ? state.topoSel : null}
            />
          ))}
        </div>
        <div className="legend">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>■ RJ45</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>◆ SFP/SFP+ (uplink)</span>
        </div>
        {state.topoMode === 'manual' && (
          <p className="topo-instruction">
            ▸ <b>手動モード</b>: フェイスプレート上のポートをクリックして 1 つ目を選択 → 別の機器のポートをクリックで接続。
            同じポートをもう一度クリックで取消。下のリストの <code>✕</code> で削除。
          </p>
        )}
        {selPort && sel && (
          <p className="topo-instruction">
            ● 選択中: <code>{sel.key} · {selPort.label}</code> ({selPort.type.toUpperCase()} {selPort.speed}) —
            別機器のポートをクリックで接続、同じポートをもう一度で取消。
          </p>
        )}
      </div>

      <div className="panel">
        <div className="eyebrow">Topology — 配線方式</div>
        <div className="toggle">
          {(['star', 'cascade', 'manual'] as const).map((m) => (
            <button
              key={m}
              className={state.topoMode === m ? 'on' : ''}
              onClick={() => dispatch({ type: 'SET_TOPO_MODE', mode: m })}
            >
              {m === 'star' ? 'スター' : m === 'cascade' ? 'カスケード' : '手動'}
            </button>
          ))}
        </div>
        <p className="note">{HINTS[state.topoMode]}</p>
        <LinkList
          links={state.links}
          devices={devices}
          canDelete={state.topoMode === 'manual'}
          onRemove={(i) => dispatch({ type: 'REMOVE_LINK', index: i })}
        />
        {state.topoMode === 'manual' && (
          <ManualLinkEditor
            devices={devices}
            onAdd={(link) => dispatch({ type: 'ADD_LINK', link })}
          />
        )}
        <div style={{ marginTop: 18 }}>
          <TopologyGraph
            router={router}
            switches={state.switches}
            links={state.links}
            annot={false}
            result={null}
          />
        </div>
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', phase: 'select' })}>
          ← 構成を変更
        </button>
        <button
          className="btn primary"
          onClick={() => dispatch({ type: 'NAV', phase: state.mode === 'build' ? 'build' : 'upload' })}
        >
          {state.mode === 'build' ? 'GUI で構成を作成 →' : 'コンフィグ投入へ →'}
        </button>
      </div>

      <PortTooltip tip={tip} />
    </section>
  );
}
