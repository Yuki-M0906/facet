/**
 * 機器フェイスプレート(SVG)。
 * 元: v3.1.0 の devBlock / faceplate / portSVG / sFill / sStroke。
 * - annot=false: 物理レイアウトのみ(灰色)
 * - annot=true : ポート status に応じて配色(検証後の結果画面で使用)
 * - onPortClick が渡されたとき: クリック有効、cursor=crosshair
 * - topoSel が渡されたとき: 該当ポートに topo-selected クラスを付与してハイライト
 */

import { type MouseEvent } from 'react';
import type { Device, PortStatus, RuntimePort } from '@engine/types';

const PW = 30, PH = 30, GAP = 6, PAD = 4;

interface Props {
  device: Device;
  annot: boolean;
  onPortClick?: (key: string, iface: string) => void;
  onPortHover?: (device: Device, port: RuntimePort, e: MouseEvent) => void;
  onPortLeave?: () => void;
  topoSel?: { key: string; iface: string } | null;
}

function sFill(s: PortStatus): string {
  return s === 'ok' ? 'var(--emerald)'
    : s === 'err' ? 'var(--garnet)'
    : s === 'lack' ? 'var(--topaz)'
    : '#2c2c34';
}
function sStroke(s: PortStatus): string {
  return s === 'ok' ? '#8fd6b6'
    : s === 'err' ? '#e88a82'
    : s === 'lack' ? '#ecc06a'
    : 'rgba(201,168,106,.25)';
}

interface PortBoxLayout {
  port: RuntimePort;
  c: number;
  r: number;
}

function layoutPorts(d: Device): { ports: PortBoxLayout[]; cols: number; rows: number } {
  if (d.role === 'switch') {
    const rj = d.ports.filter((p) => p.type === 'rj45');
    const up = d.ports.filter((p) => p.type !== 'rj45');
    const per = Math.ceil(rj.length / 2);
    const out: PortBoxLayout[] = [];
    rj.forEach((p, i) => out.push({ port: p, c: i % per, r: Math.floor(i / per) }));
    up.forEach((p, i) => out.push({ port: p, c: per + 1 + Math.floor(i / 2), r: i % 2 }));
    return { ports: out, cols: per + 1 + Math.ceil(up.length / 2), rows: 2 };
  }
  return {
    ports: d.ports.map((p, i) => ({ port: p, c: i, r: 0 })),
    cols: d.ports.length,
    rows: 1,
  };
}

export function Faceplate({ device, annot, onPortClick, onPortHover, onPortLeave, topoSel }: Props) {
  const tag = device.role === 'switch' ? 'SW · ' + device.unit : 'ROUTER';
  const { ports, cols, rows } = layoutPorts(device);
  const W = PAD * 2 + cols * (PW + GAP) - GAP + 10;
  const H = PAD * 2 + rows * (PH + GAP) - GAP + 16;
  const isInteractive = !!onPortClick;
  return (
    <div className="deviceblock">
      <div className="dvhead">
        <div className="dvname">
          {device.name}
          <em>{tag}</em>
        </div>
        <div className="dvmeta">
          {device.ports.length} ports · {device.key}
          {device.parsed && ' · parsed ✓'}
        </div>
      </div>
      <div className="chassis">
        <div className="svgwrap">
          <svg width={W} height={H + 10} viewBox={`0 0 ${W} ${H + 10}`}>
            {ports.map((o) => {
              const p = o.port;
              const x = PAD + o.c * (PW + GAP);
              const y = PAD + o.r * (PH + GAP) + 4;
              const fill = annot ? sFill(p.status) : '#23232b';
              const stroke = annot ? sStroke(p.status) : 'rgba(201,168,106,.28)';
              const isSfp = p.type !== 'rj45';
              const isSelected = topoSel && topoSel.key === device.key && topoSel.iface === p.iface;
              const className = 'port' + (isSelected ? ' topo-selected' : '');
              return (
                <g
                  key={p.iface}
                  className={className}
                  data-dev={device.key}
                  data-if={p.iface}
                  style={{ cursor: isInteractive ? 'crosshair' : 'pointer' }}
                  onClick={isInteractive ? () => onPortClick!(device.key, p.iface) : undefined}
                  onMouseMove={onPortHover ? (e) => onPortHover(device, p, e) : undefined}
                  onMouseLeave={onPortLeave}
                >
                  {isSfp ? (
                    <rect
                      x={x + 3} y={y + 8}
                      width={PW - 6} height={PH - 16} rx={2}
                      fill={fill} stroke={stroke}
                    />
                  ) : (
                    <>
                      <rect x={x} y={y} width={PW} height={PH} rx={3} fill={fill} stroke={stroke} />
                      <rect x={x + 5} y={y + 4} width={PW - 10} height={PH - 13} rx={1.5} fill="rgba(0,0,0,.35)" />
                    </>
                  )}
                  <text
                    x={x + PW / 2} y={y + PH + 9}
                    textAnchor="middle"
                    fontFamily="Consolas, monospace" fontSize="8" fill="var(--faint)"
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
