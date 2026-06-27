/**
 * ポート上ホバーで表示する固定位置のツールチップ。
 * Faceplate からのコールバックで内容と位置を更新する。
 *
 * v3.1.0 では global <div id="tip"> を mousemove で innerHTML 更新していたが、
 * React 版では state 制御に置き換え。
 */

import type { ReactNode } from 'react';

export interface TipState {
  content: ReactNode;
  x: number;
  y: number;
  visible: boolean;
}

interface Props {
  tip: TipState;
}

export function PortTooltip({ tip }: Props) {
  return (
    <div
      className={'tip' + (tip.visible ? ' on' : '')}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.content}
    </div>
  );
}

/** 1 行(項目 / 値) */
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/** Faceplate 側から呼ばれる、ポート情報を JSX に整形するヘルパ */
export function buildPortTipContent(args: {
  devKey: string;
  iface: string;
  type: string;
  speed: string;
  poe?: string;
  cfg: import('@engine/types').ParsedInterface | null;
  status: string;
  msg: string | null;
}): ReactNode {
  const { devKey, iface, type, speed, poe, cfg, status, msg } = args;
  const statusLabel: Record<string, string> = {
    ok: '確認', err: 'エラー', lack: 'コンフィグ不足', idle: '未使用',
  };
  const statusColor: Record<string, string> = {
    ok: '#8fd6b6', err: '#e88a82', lack: '#ecc06a', idle: 'rgba(201,168,106,.25)',
  };
  return (
    <>
      <div className="t">{devKey} · {iface}</div>
      <Row k="種別" v={`${type.toUpperCase()} ${speed}`} />
      {poe && <Row k="PoE" v={poe} />}
      {cfg && (
        <>
          {cfg.mode && <Row k="モード" v={cfg.mode} />}
          {cfg.accessVlan && <Row k="Access VLAN" v={cfg.accessVlan} />}
          {cfg.trunkNative && <Row k="Native" v={cfg.trunkNative} />}
          {cfg.trunkAllowed && cfg.trunkAllowed.length > 0 && (
            <Row k="Allowed" v={Array.from(new Set(cfg.trunkAllowed)).join(',')} />
          )}
          {cfg.zone && <Row k="Zone" v={cfg.zone} />}
          {cfg.ip && <Row k="IP" v={cfg.ip} />}
          {cfg.speed && <Row k="Speed" v={cfg.speed} />}
          {cfg.duplex && <Row k="Duplex" v={cfg.duplex} />}
          {cfg.shutdown && (
            <div className="row">
              <span>状態</span>
              <b style={{ color: 'var(--garnet)' }}>shutdown</b>
            </div>
          )}
        </>
      )}
      <div className="row">
        <span>判定</span>
        <b style={{ color: statusColor[status] || 'var(--muted)' }}>
          {statusLabel[status] || '—'}
        </b>
      </div>
      {msg && <div className="msg">{msg}</div>}
    </>
  );
}
