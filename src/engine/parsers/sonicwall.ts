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
import type { AccessRule, NatPolicy, ParseCoverage, ParsedInterface, SonicWallParsed } from '../types';

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
  const out: Omit<SonicWallParsed, 'coverage'> = {
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

  /* ---- カバレッジ計測(Sprint 3 P3-1) ----
   * Cisco と違い、この parser の nat/rule ブロックは内部の if/else-if がどれにも
   * マッチしなくても無条件で continue する(空行や end/exit がブロックの閉じ記号の
   * ため)。ping/mgmt の WAN 許可チェックは continue を伴わず後続の interface 判定へ
   * 素通りする。そのため continue の位置だけでは「その行が何かにマッチしたか」を
   * 判定できず、行ごとに recognized フラグを立てて末尾で判定する方式にする。
   * 全 continue は `break matchLine;`(ラベル付きブロックからの脱出)に置換した。
   * ネストしたループは存在しないため continue と break matchLine は完全に等価で、
   * 既存の分岐条件・実行順序は一切変えていない。空行は分母(totalLines)に含めない。
   */
  const unrecognized: Array<{ lineNumber: number; text: string }> = [];
  let totalLines = 0;

  for (let li = 0; li < lines.length; li++) {
    const t = lines[li]!.replace(/\t/g, ' ').trim();
    let m: RegExpMatchArray | null;
    let recognized = false;

    matchLine: {
      if ((m = t.match(/^(?:system\s+)?name\s+(\S+)/i))) {
        if (!out.hostname) out.hostname = m[1]!;
        recognized = true;
        break matchLine;
      }
      if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+host\s+([\d.]+)(?:\s+zone\s+(\S+))?/i))) {
        flushAll();
        out.addr[m[1]!] = { type: 'host', ip: m[2]!, zone: m[3] || null };
        recognized = true;
        break matchLine;
      }
      if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+network\s+([\d.]+)\s+([\d.]+)(?:\s+zone\s+(\S+))?/i))) {
        flushAll();
        out.addr[m[1]!] = { type: 'network', cidr: subnetOf(m[2]!, m[3]!), zone: m[4] || null };
        recognized = true;
        break matchLine;
      }
      if ((m = t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+range\s+([\d.]+)\s+([\d.]+)/i))) {
        flushAll();
        out.addr[m[1]!] = { type: 'range', from: m[2]!, to: m[3]! };
        recognized = true;
        break matchLine;
      }
      if ((m = t.match(/^service-object\s+(\S+)\s+(\S+)\s+(\d+)(?:\s*-\s*(\d+))?/i))) {
        out.svc[m[1]!] = { proto: m[2]!, from: Number(m[3]), to: m[4] ? Number(m[4]) : Number(m[3]) };
        recognized = true;
        break matchLine;
      }
      if (/^nat-policy/i.test(t)) {
        flushAll();
        nat = { raw: t, orig: null, trans: null, iface: null };
        recognized = true;
        break matchLine;
      }
      if (nat) {
        if ((m = t.match(/^original-source\s+(\S+)/i))) { nat.orig = m[1]!; recognized = true; }
        else if ((m = t.match(/^translated-source\s+(\S+)/i))) { nat.trans = m[1]!; recognized = true; }
        else if ((m = t.match(/^outbound-interface\s+(\S+)/i))) { nat.iface = m[1]!; recognized = true; }
        if (/^(end|exit)\s*$/i.test(t) || t === '') { flushNat(); recognized = true; }
        break matchLine;
      }
      if ((m = t.match(/^access-rule\s+from\s+(\S+)\s+to\s+(\S+)/i))) {
        flushAll();
        rule = { from: m[1]!, to: m[2]!, action: 'allow', src: 'any', dst: 'any', service: 'any', enabled: true };
        recognized = true;
        break matchLine;
      }
      if (rule) {
        if ((m = t.match(/^action\s+(\S+)/i))) { rule.action = m[1]!.toLowerCase(); recognized = true; }
        else if ((m = t.match(/^source\s+(.+)/i))) { rule.src = m[1]!.trim(); recognized = true; }
        else if ((m = t.match(/^destination\s+(.+)/i))) { rule.dst = m[1]!.trim(); recognized = true; }
        else if ((m = t.match(/^service\s+(.+)/i))) { rule.service = m[1]!.trim(); recognized = true; }
        else if (/^(disable|disabled|no\s+enable)/i.test(t)) { rule.enabled = false; recognized = true; }
        else if (/^(end|exit)\s*$/i.test(t) || t === '') { flushRule(); recognized = true; }
        break matchLine;
      }
      if ((m = t.match(/^dhcp-?(?:server|scope)\b.*?([\d.]+)\s*-\s*([\d.]+)/i))) {
        out.dhcp.push({ from: m[1]!, to: m[2]! });
        recognized = true;
        break matchLine;
      }
      if ((m = t.match(/^route-?policy.*?dest(?:ination)?\s+([\d.]+)\s+([\d.]+).*?gateway\s+([\d.]+)/i))) {
        out.routes.push({ dst: m[1]!, mask: m[2]!, nh: m[3]! });
        recognized = true;
        break matchLine;
      }
      if (/ping.*from\s+wan/i.test(t)) { out.sec.pingWanAllow = true; recognized = true; }
      if (/management.*(from\s+wan|wan.*allow)/i.test(t)) { out.sec.mgmtWanAllow = true; recognized = true; }
      if ((m = t.match(/^interface\s+(X\d+(?::?V?\d+)?)/i))) {
        flushAll();
        const name = m[1]!.replace(/:?V(\d+)/i, ':V$1');
        const vt = name.match(/V(\d+)/);
        cur = mkif(name, vt ? vt[1]! : null);
        recognized = true;
        break matchLine;
      }
      if (!cur) break matchLine;
      if ((m = t.match(/^zone\s+(\S+)/i))) {
        cur.zone = m[1]!;
        out.zonesByIf[cur.name] = m[1]!;
        recognized = true;
      } else if ((m = t.match(/^ip-?assignment\s+(\S+)/i))) {
        if (!cur.zone) cur.zone = m[1]!;
        recognized = true;
      } else if ((m = t.match(/^ip\s+([\d.]+)\s+netmask\s+([\d.]+)/i))) {
        cur.ip = m[1]!;
        cur.mask = m[2]!;
        recognized = true;
      } else if ((m = t.match(/^vlan\s+([\d,\-]+)/i))) {
        cur.trunkAllowed = cur.trunkAllowed.concat(expandVlans(m[1]!));
        cur.vlanTag = cur.vlanTag || expandVlans(m[1]!)[0] || null;
        recognized = true;
      } else if ((m = t.match(/^comment\s+(.+)/i))) {
        cur.description = m[1]!.replace(/^"|"$/g, '');
        recognized = true;
      }
    }

    if (t) {
      totalLines++;
      if (!recognized) unrecognized.push({ lineNumber: li + 1, text: t });
    }
  }
  flushAll();

  Object.keys(out.interfaces).forEach((k) => {
    const i = out.interfaces[k]!;
    if (i.vlanTag) out.vlans[i.vlanTag] = 'VLAN' + i.vlanTag;
  });

  const coverage: ParseCoverage = {
    totalLines,
    recognizedLines: totalLines - unrecognized.length,
    unrecognizedLines: unrecognized,
    coveragePercent: totalLines > 0 ? Math.round(((totalLines - unrecognized.length) / totalLines) * 100) : 100,
  };

  return { ...out, coverage };
}
