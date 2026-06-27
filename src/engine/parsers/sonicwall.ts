/**
 * SonicWall SonicOS CLI(可読テキスト)パーサ。
 * 元: src/facet-core.js (legacy) の parseSonicWall。
 * ロジックは無変更(型注釈のみ追加)。
 *
 * 既知の制約は docs/PARSER-NOTES.md 参照。
 * .exp(難読化バイナリ)は意図的にサポートしない。
 */

import { expandVlans } from '../canonIf';
import { subnetOf } from '../ip';
import type { AccessRule, NatPolicy, ParsedInterface, SonicWallParsed } from '../types';

function mkif(name: string, vlanTag: string | null): ParsedInterface {
  return {
    name,
    vlanTag,
    zone: null,
    ip: null,
    mask: null,
    description: null,
    shutdown: false,
    mode: vlanTag ? 'vlan-subif' : null,
    trunkAllowed: vlanTag ? [vlanTag] : [],
    /* Cisco 固有 field の既定値(型整合のため) */
    speed: null,
    duplex: null,
    mtu: null,
    accessVlan: null,
    trunkNative: null,
    channel: null,
    sviVlan: null,
    secondary: [],
    portfast: false,
    bpduguard: false,
    aclIn: null,
    aclOut: null,
    standby: null,
  };
}

export function parseSonicWall(text: string): SonicWallParsed {
  const out: SonicWallParsed = {
    hostname: null,
    vlans: {},
    interfaces: {},
    zonesByIf: {},
    rules: [],
    nat: [],
    addr: {},
    svc: {},
    dhcp: [],
    routes: [],
    sec: { pingWanAllow: false, mgmtWanAllow: false },
  };

  const lines = text.split(/\r?\n/);
  let cur: ParsedInterface | null = null;
  let rule: AccessRule | null = null;
  let nat: NatPolicy | null = null;

  function flushIf() { if (cur) { out.interfaces[cur.name] = cur; cur = null; } }
  function flushRule() { if (rule) { out.rules.push(rule); rule = null; } }
  function flushNat() { if (nat) { out.nat.push(nat); nat = null; } }
  function flushAll() { flushIf(); flushRule(); flushNat(); }

  for (let li = 0; li < lines.length; li++) {
    const t = lines[li]!.replace(/\t/g, ' ').trim();
    let m: RegExpMatchArray | null;

    if ((m = t.match(/^(?:system\s+)?name\s+(\S+)/i))) {
      if (!out.hostname) out.hostname = m[1]!;
      continue;
    }
    if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+host\s+([\d.]+)(?:\s+zone\s+(\S+))?/i))) {
      flushAll();
      out.addr[m[1]!] = { type: 'host', ip: m[2]!, zone: m[3] || null };
      continue;
    }
    if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+network\s+([\d.]+)\s+([\d.]+)(?:\s+zone\s+(\S+))?/i))) {
      flushAll();
      out.addr[m[1]!] = { type: 'network', cidr: subnetOf(m[2]!, m[3]!), zone: m[4] || null };
      continue;
    }
    if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+range\s+([\d.]+)\s+([\d.]+)/i))) {
      flushAll();
      out.addr[m[1]!] = { type: 'range', from: m[2]!, to: m[3]! };
      continue;
    }
    if ((m = t.match(/^service-object\s+(\S+)\s+(\S+)\s+(\d+)(?:\s*-\s*(\d+))?/i))) {
      out.svc[m[1]!] = { proto: m[2]!, from: Number(m[3]), to: m[4] ? Number(m[4]) : Number(m[3]) };
      continue;
    }
    if (/^nat-policy/i.test(t)) {
      flushAll();
      nat = { raw: t, orig: null, trans: null, iface: null };
      continue;
    }
    if (nat) {
      if ((m = t.match(/^original-source\s+(\S+)/i))) nat.orig = m[1]!;
      else if ((m = t.match(/^translated-source\s+(\S+)/i))) nat.trans = m[1]!;
      else if ((m = t.match(/^outbound-interface\s+(\S+)/i))) nat.iface = m[1]!;
      if (/^(end|exit)\s*$/i.test(t) || t === '') flushNat();
      continue;
    }
    if ((m = t.match(/^access-rule\s+from\s+(\S+)\s+to\s+(\S+)/i))) {
      flushAll();
      rule = { from: m[1]!, to: m[2]!, action: 'allow', src: 'any', dst: 'any', service: 'any', enabled: true };
      continue;
    }
    if (rule) {
      if ((m = t.match(/^action\s+(\S+)/i))) rule.action = m[1]!.toLowerCase();
      else if ((m = t.match(/^source\s+(.+)/i))) rule.src = m[1]!.trim();
      else if ((m = t.match(/^destination\s+(.+)/i))) rule.dst = m[1]!.trim();
      else if ((m = t.match(/^service\s+(.+)/i))) rule.service = m[1]!.trim();
      else if (/^(disable|disabled|no\s+enable)/i.test(t)) rule.enabled = false;
      else if (/^(end|exit)\s*$/i.test(t) || t === '') flushRule();
      continue;
    }
    if ((m = t.match(/^dhcp-?(?:server|scope)\b.*?([\d.]+)\s*-\s*([\d.]+)/i))) {
      out.dhcp.push({ from: m[1]!, to: m[2]! });
      continue;
    }
    if ((m = t.match(/^route-?policy.*?dest(?:ination)?\s+([\d.]+)\s+([\d.]+).*?gateway\s+([\d.]+)/i))) {
      out.routes.push({ dst: m[1]!, mask: m[2]!, nh: m[3]! });
      continue;
    }
    if (/ping.*from\s+wan/i.test(t)) out.sec.pingWanAllow = true;
    if (/management.*(from\s+wan|wan.*allow)/i.test(t)) out.sec.mgmtWanAllow = true;
    if ((m = t.match(/^interface\s+(X\d+(?::?V?\d+)?)/i))) {
      flushAll();
      const name = m[1]!.replace(/:?V(\d+)/i, ':V$1');
      const vt = name.match(/V(\d+)/);
      cur = mkif(name, vt ? vt[1]! : null);
      continue;
    }
    if (!cur) continue;
    if ((m = t.match(/^zone\s+(\S+)/i))) {
      cur.zone = m[1]!;
      out.zonesByIf[cur.name] = m[1]!;
    } else if ((m = t.match(/^ip-?assignment\s+(\S+)/i))) {
      if (!cur.zone) cur.zone = m[1]!;
    } else if ((m = t.match(/^ip\s+([\d.]+)\s+netmask\s+([\d.]+)/i))) {
      cur.ip = m[1]!;
      cur.mask = m[2]!;
    } else if ((m = t.match(/^vlan\s+([\d,\-]+)/i))) {
      cur.trunkAllowed = cur.trunkAllowed.concat(expandVlans(m[1]!));
      cur.vlanTag = cur.vlanTag || expandVlans(m[1]!)[0] || null;
    } else if ((m = t.match(/^comment\s+(.+)/i))) {
      cur.description = m[1]!.replace(/^"|"$/g, '');
    }
  }
  flushAll();

  Object.keys(out.interfaces).forEach((k) => {
    const i = out.interfaces[k]!;
    if (i.vlanTag) out.vlans[i.vlanTag] = 'VLAN' + i.vlanTag;
  });

  return out;
}
