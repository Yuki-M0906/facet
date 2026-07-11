/**
 * トポロジー(star / cascade)の自動配線生成。
 * 元: src/facet-core.js (legacy) の autoLinks。
 * ロジックは無変更。
 *
 * - star  : 各スイッチの U1 ↔ ルータの X0
 * - cascade: ルータ X0 → SW1:U1、以降 SW(i-1):U2 ↔ SW(i):U1
 * - manual: 空の links を返す(UI 側で操作)
 */

import type { AppState, Device, Link, RuntimePort } from './types';

export function autoLinks(state: AppState): Link[] {
  const mode = state.topoMode || 'star';
  const links: Link[] = [];
  const sw = state.switches;
  const r = state.router;

  function upOf(d: Device): string {
    const u: RuntimePort | undefined = d.ports.filter((p) => /^U1$/.test(p.label))[0];
    return u ? u.iface : d.ports[d.ports.length - 1]!.iface;
  }
  function up2Of(d: Device): string {
    const u: RuntimePort | undefined = d.ports.filter((p) => /^U2$/.test(p.label))[0];
    return u ? u.iface : upOf(d);
  }
  const rLan = r.ports.filter((p) => p.label === 'X0')[0] ? 'X0' : r.ports[0]!.iface;
  /* High-4 監査対応: 以前は rLan(常に同一の1ポート)を全スイッチが共有しており、
   * star トポロジで2台以上のスイッチが「ルータの同一物理ポートに接続」という
   * 物理的にありえない配線が生成されていた。ルータのポートを台数分だけ順番に
   * 割り当てる(0番目は従来通り X0 優先、以降は r.ports の並び順)。ルータの
   * ポート数よりスイッチ台数が多い極端なケースのみ rLan にフォールバックする
   * (その場合は手動トポロジーでの配線指定が必要)。 */
  function lanPortAt(i: number): string {
    if (i === 0) return rLan;
    const p = r.ports[i];
    return p ? p.iface : rLan;
  }

  if (mode === 'star') {
    sw.forEach((s, i) => {
      links.push({ a: { key: r.key, iface: lanPortAt(i) }, b: { key: s.key, iface: upOf(s) } });
    });
  } else if (mode === 'cascade') {
    if (sw[0]) {
      links.push({ a: { key: r.key, iface: rLan }, b: { key: sw[0].key, iface: upOf(sw[0]) } });
    }
    for (let i = 1; i < sw.length; i++) {
      links.push({
        a: { key: sw[i - 1]!.key, iface: up2Of(sw[i - 1]!) },
        b: { key: sw[i]!.key, iface: upOf(sw[i]!) },
      });
    }
  }
  return links;
}
