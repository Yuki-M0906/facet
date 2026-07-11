/**
 * サブネット間到達性マトリクス。
 * 元: src/facet-core.js (legacy) の buildMatrix。
 * ロジックは無変更。
 */

import { evalFW } from './evalFW';
import { representativeHostIp } from './ip';
import type { AppState, BlockedPair, MatrixCell, ReachabilityMatrix, Subnet } from './types';

export function buildMatrix(state: AppState, subnets: Subnet[]): ReachabilityMatrix {
  const r = state.router;

  function reach(s: Subnet, d: Subnet): MatrixCell {
    if (s === d) return 'self';
    if (!s.gw || !d.gw) return 'nogw';
    /* 全機能監査 Medium-8: pathTrace.ts と同じ代表ホストIP算出ロジックを使い、
     * 宛先を特定ホストで絞るFWルールがある構成でもマトリクス表示と経路トレース
     * の判定が一致するようにする(以前はここだけゲートウェイIPそのものを使っていた)。 */
    const sIp = representativeHostIp(s.cidr, s.gw);
    const dIp = representativeHostIp(d.cidr, d.gw);
    const res = evalFW(r.parsed as never, s.zone || 'LAN', d.zone || 'LAN', sIp, dIp, 'any');
    return res.action === 'allow' ? 'ok' : 'deny';
  }

  const cells: Record<string, Record<string, MatrixCell>> = {};
  const blocked: BlockedPair[] = [];
  subnets.forEach((s) => {
    cells[s.cidr] = {};
    subnets.forEach((d) => {
      const v = reach(s, d);
      cells[s.cidr]![d.cidr] = v;
      if (v === 'deny') blocked.push({ from: s.cidr, to: d.cidr, fromZone: s.zone, toZone: d.zone });
    });
  });
  return { cells, blocked, subnets };
}
