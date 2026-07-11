/**
 * 論理接続図(R1 が上、SW が下に並んで線で接続)。
 * 元: v3.1.0 の renderTopoGraph。
 * annot=true のときリンク色を最悪状態(err/lack/ok)で着色し、ループあり時は破線化。
 */

import type { Device, Link, RuntimePort, VerifyResult } from '@engine/types';

const NW = 140;
const NH = 46;

interface Props {
  router: Device;
  switches: Device[];
  links: Link[];
  annot: boolean;
  result: VerifyResult | null;
}

type Worst = 'err' | 'lack' | 'ok' | 'idle';

function portObj(end: { key: string; iface: string }, all: Device[]): RuntimePort | undefined {
  const d = all.filter((x) => x.key === end.key)[0];
  return d?.ports.filter((p) => p.iface === end.iface)[0];
}

function worst(a: string | undefined, b: string | undefined): Worst {
  const rank: Record<string, number> = { err: 3, lack: 2, ok: 1, idle: 0 };
  const aR = rank[a || 'idle'] ?? 0;
  const bR = rank[b || 'idle'] ?? 0;
  const winner = aR >= bR ? (a || 'idle') : (b || 'idle');
  return (winner as Worst);
}

export function TopologyGraph({ router, switches, links, annot, result }: Props) {
  const sw = switches;
  const W = Math.max(560, sw.length * 180);
  const H = 240;
  const pos: Record<string, { x: number; y: number }> = {};
  pos[router.key] = { x: W / 2 - NW / 2, y: 24 };
  sw.forEach((s, i) => {
    pos[s.key] = { x: (W / (sw.length + 1)) * (i + 1) - NW / 2, y: 150 };
  });
  const allDevices = [router, ...switches];

  return (
    <div className="topograph">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: '100%' }}>
        {links.map((L, i) => {
          const a = pos[L.a.key];
          const b = pos[L.b.key];
          if (!a || !b) return null;
          /* 全機能監査再調査: 従来は常に「aの下辺→bの上辺」で結んでいたため、
           * カスケード/手動配線の同一行(スイッチ同士)リンクが下に一度膨らんでから
           * 戻る不自然な線になっていた。同じ行(y座標が同じ)同士は左右の辺を
           * 直接つなぐ。 */
          let x1: number, y1: number, x2: number, y2: number;
          if (a.y === b.y) {
            const [left, right] = a.x <= b.x ? [a, b] : [b, a];
            x1 = left.x + NW; y1 = left.y + NH / 2;
            x2 = right.x; y2 = right.y + NH / 2;
          } else {
            x1 = a.x + NW / 2; y1 = a.y + NH;
            x2 = b.x + NW / 2; y2 = b.y;
          }
          let col = 'var(--gold-dim)';
          let dash: string | undefined;
          if (annot && result) {
            const pa = portObj(L.a, allDevices);
            const pb = portObj(L.b, allDevices);
            const st = worst(pa?.status, pb?.status);
            col = st === 'err' ? 'var(--garnet)' : st === 'lack' ? 'var(--topaz)' : 'var(--emerald)';
            if (result.loop) dash = '4 4';
          }
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={col} strokeWidth={1.5}
              strokeDasharray={dash}
            />
          );
        })}
        {allDevices.map((d) => {
          const p = pos[d.key];
          if (!p) return null;
          return (
            <g key={d.key}>
              <rect x={p.x} y={p.y} width={NW} height={NH} rx={9} fill="#1c1c24" stroke="var(--hair-strong)" />
              <text x={p.x + NW / 2} y={p.y + 20} textAnchor="middle" fontFamily="Meiryo UI, sans-serif" fontSize="14" fontWeight="600" fill="var(--ink)">
                {d.key}
              </text>
              <text x={p.x + NW / 2} y={p.y + 36} textAnchor="middle" fontFamily="Consolas, monospace" fontSize="9" fill="var(--faint)">
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
