/**
 * device.parsed.interfaces を、その device の物理ポート配列(device.ports)に対応付ける。
 * 元: src/facet-core.js (legacy) の mapToPorts。
 * ロジックは無変更。
 */

import { canonIf, uniq } from './canonIf';
import type { Device, ParsedInterface, RuntimePort } from './types';

export function mapToPorts(dev: Device): void {
  dev.ports.forEach((p) => {
    p.cfg = null;
    p.status = 'idle';
    p.msg = null;
  });
  if (!dev.parsed) return;

  const byCanon: Record<string, RuntimePort> = {};
  dev.ports.forEach((p) => {
    byCanon[canonIf(p.iface)] = p;
  });

  Object.keys(dev.parsed.interfaces).forEach((k) => {
    const ifc: ParsedInterface = (dev.parsed!.interfaces as Record<string, ParsedInterface>)[k]!;
    if (/^Vlan/i.test(ifc.name)) return;
    const port = byCanon[canonIf(ifc.name)];
    if (!port) return;

    if (!port.cfg) {
      const c: ParsedInterface = {} as ParsedInterface;
      for (const kk in ifc) {
        (c as unknown as Record<string, unknown>)[kk] = (ifc as unknown as Record<string, unknown>)[kk];
      }
      port.cfg = c;
    } else {
      if (ifc.trunkAllowed) {
        port.cfg.trunkAllowed = uniq((port.cfg.trunkAllowed || []).concat(ifc.trunkAllowed));
      }
      if (ifc.vlanTag) {
        port.cfg.subVlans = (port.cfg.subVlans || []).concat(ifc.vlanTag);
      }
      if (ifc.zone && !port.cfg.zone) port.cfg.zone = ifc.zone;
    }
  });

  /* ---- Port-channel 論理 IF → 物理メンバーポートへの継承(Sprint 4 S4-1) ----
   * 実務では switchport/trunk 設定を `interface Port-channel<N>` 側にのみ書き、
   * 物理メンバー側には `channel-group <N> mode ...` しか書かないパターンが一般的。
   * `Port-channel<N>` は canonIf() でどの物理ポートラベルにも一致しないため、
   * 従来はこの設定がどの port.cfg にも反映されずサイレントに読み捨てられていた。
   * メンバー側が既に自分自身の値を持っている場合は上書きしない(実際に書かれた
   * 設定を尊重する。SonicWall の zone 継承と同じ「未設定のみ埋める」方針)。
   * SonicWall の ParsedInterface は channel が常に null のため、このブロックは
   * Cisco の port-channel 構成にのみ作用する。 */
  const channelIfs: Record<string, ParsedInterface> = {};
  Object.keys(dev.parsed.interfaces).forEach((k) => {
    const ifc = (dev.parsed!.interfaces as Record<string, ParsedInterface>)[k]!;
    const m = ifc.name.match(/^Port-channel(\d+)$/i);
    if (m) channelIfs[m[1]!] = ifc;
  });
  if (Object.keys(channelIfs).length) {
    dev.ports.forEach((p) => {
      if (!p.cfg || !p.cfg.channel) return;
      const src = channelIfs[p.cfg.channel.id];
      if (!src) return;
      const c = p.cfg;
      if (!c.mode && src.mode) c.mode = src.mode;
      if (!c.accessVlan && src.accessVlan) c.accessVlan = src.accessVlan;
      if (!c.trunkNative && src.trunkNative) c.trunkNative = src.trunkNative;
      if ((!c.trunkAllowed || !c.trunkAllowed.length) && src.trunkAllowed && src.trunkAllowed.length) {
        c.trunkAllowed = src.trunkAllowed.slice();
      }
      /* 全機能監査再調査: trunkAllowed が空配列のまま(`vlan none` で明示的に
       * 全遮断)のケースでは上の条件が成立せず、trunkAllowedExplicit だけが
       * 継承リストから漏れていた。結果、メンバー側は「未指定(全許可扱い)」の
       * lack 警告が誤って出ていた(実際は明示的な全VLAN遮断)。 */
      if (!c.trunkAllowed.length && !c.trunkAllowedExplicit && src.trunkAllowedExplicit) {
        c.trunkAllowedExplicit = true;
      }
      if (!c.mtu && src.mtu) c.mtu = src.mtu;
      if (!c.ip && src.ip) { c.ip = src.ip; c.mask = src.mask; }
      if (!c.description && src.description) c.description = src.description;
    });
  }
}
