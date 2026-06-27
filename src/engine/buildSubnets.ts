/**
 * state 全体から L3 サブネット一覧を構築する。
 * 元: src/facet-core.js (legacy) の buildSubnets。
 * ロジックは無変更。
 *
 * - ルータの interfaces から(SonicWall サブインターフェイス含む)サブネットを抽出
 * - 各スイッチの SVI(parsed.svis)からサブネットを抽出
 * - cidr + vlan の組で重複を除去
 */

import { subnetOf } from './ip';
import type { AppState, ParsedInterface, Subnet, CiscoParsed } from './types';

export function buildSubnets(state: AppState): Subnet[] {
  const subs: Subnet[] = [];
  const seen: Record<string, true> = {};

  function add(vlan: string | null, ip: string | null, mask: string | null, zone: string | null, dev: string, iface: string): void {
    if (!ip || !mask) return;
    const cidr = subnetOf(ip, mask);
    const key = cidr + '|' + (vlan || '');
    if (seen[key]) return;
    seen[key] = true;
    subs.push({ vlan: vlan || null, cidr, gw: ip, zone: zone || 'LAN', dev, iface });
  }

  const r = state.router;
  if (r.parsed) {
    Object.keys(r.parsed.interfaces).forEach((k) => {
      const i: ParsedInterface = (r.parsed!.interfaces as Record<string, ParsedInterface>)[k]!;
      add(i.vlanTag, i.ip, i.mask, i.zone, r.key, i.name);
    });
  }
  state.switches.forEach((sw) => {
    if (sw.parsed && 'svis' in sw.parsed) {
      const cp = sw.parsed as CiscoParsed;
      Object.keys(cp.svis).forEach((v) => {
        const o = cp.svis[v]!;
        add(v, o.ip, o.mask, 'LAN', sw.key, 'Vlan' + v);
      });
    }
  });
  return subs;
}
