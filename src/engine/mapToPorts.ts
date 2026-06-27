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
}
