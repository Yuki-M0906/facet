/**
 * Cisco IOS / IOS-XE running-config パーサ。
 * 元: src/facet-core.js (legacy) の parseCisco。
 * ロジックは無変更(型注釈のみ追加)。
 *
 * 既知の制約は docs/PARSER-NOTES.md 参照。Sprint 3 で精度向上予定。
 */

import { expandIfRange, expandVlans } from '../canonIf';
import { subnetOf } from '../ip';
import type { AclLine, CiscoParsed, ParseCoverage, ParsedInterface, PlatformHint, PlatformSignal } from '../types';

interface CurIf extends Omit<ParsedInterface, 'name'> {
  /** interface range で複数 IF をまとめて構築するための一時 field */
  names: string[];
}

interface InternalParsed extends Omit<CiscoParsed, 'coverage' | 'platformHint'> {
  /** DHCP プール本文の取り込み中フラグ(キーは pool 名)。flush 時に削除する */
  _dhcp?: string | null;
}

/* ---- プラットフォーム判別(Sprint 3 P3-2) ----
 * 既存の抽出ロジックとは完全に独立した追加スキャン。out/cur 等の状態には一切
 * 触れず、生テキストを読むだけの純粋関数。判定根拠は docs/PARSER-NOTES.md と
 * types.ts の PlatformHint コメントを参照(2026-07-04 時点のウェブ調査に基づく)。
 */
const NXOS_PATTERNS: Array<{ signal: PlatformSignal; re: RegExp }> = [
  { signal: 'nxos-feature', re: /^feature\s+\S+\s*$/ },
  { signal: 'nxos-feature-set', re: /^(install\s+)?feature-set\s+\S+\s*$/ },
  { signal: 'nxos-vdc', re: /^vdc\s+\S+(\s+id\s+\d+)?\s*$/ },
  { signal: 'nxos-mgmt0', re: /^interface\s+mgmt0\b/ },
  { signal: 'nxos-vrf-context', re: /^(no\s+)?vrf\s+context\s+\S+\s*$/ },
  { signal: 'nxos-boot', re: /^boot\s+(nxos|kickstart)\s+bootflash:/ },
];
const IOSXE_PATTERNS: Array<{ signal: PlatformSignal; re: RegExp }> = [
  { signal: 'iosxe-install-mode', re: /^boot\s+system\s+(flash|bootflash):\S*packages\.conf\s*$/i },
  { signal: 'iosxe-license-tier', re: /^license\s+boot\s+level\s+(network-essentials|network-advantage|dna-essentials|dna-advantage)\b/i },
  { signal: 'iosxe-platform-fed', re: /^platform\s+(punt-keepalive|qos|ptp|sudi|tcam-limit)\b/i },
];
const IOS_CLASSIC_PATTERNS: Array<{ signal: PlatformSignal; re: RegExp }> = [
  { signal: 'ios-classic-license-tier', re: /^license\s+boot\s+level\s+(lanbase|lanlite|ipservices)\b/i },
];
const SIMPLE_PATTERNS = [...NXOS_PATTERNS, ...IOSXE_PATTERNS, ...IOS_CLASSIC_PATTERNS];

function detectPlatformHint(text: string): PlatformHint {
  const signals: PlatformHint['signals'] = [];
  let callHomeLine = -1;
  let smartTransportLine = -1;
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.replace(/\t/g, ' ').trim();
    if (!t) return;
    const hit = SIMPLE_PATTERNS.find((p) => p.re.test(t));
    if (hit) { signals.push({ lineNumber: i + 1, text: t, signal: hit.signal }); return; }
    if (/^service\s+call-home\s*$/i.test(t)) callHomeLine = i + 1;
    else if (/^license\s+smart\s+transport\s+callhome\s*$/i.test(t)) smartTransportLine = i + 1;
  });
  /* Smart Licensing はどちらか一方だけでは一般的な構文(他製品ラインでも使われる)
   * のため、クラスタ(service call-home + license smart transport callhome)が
   * 揃って初めて IOS-XE(Catalyst 9000系)のシグナルとして扱う。 */
  if (callHomeLine >= 0 && smartTransportLine >= 0) {
    signals.push({
      lineNumber: Math.min(callHomeLine, smartTransportLine),
      text: 'service call-home + license smart transport callhome',
      signal: 'iosxe-smart-licensing',
    });
  }
  return { signals };
}

function mkif(names: string[]): CurIf {
  return {
    names,
    sviVlan: (names[0]!.match(/^Vlan(\d+)/i) || [])[1] || null,
    mode: null,
    accessVlan: null,
    trunkNative: null,
    trunkAllowed: [],
    channel: null,
    ip: null,
    mask: null,
    secondary: [],
    speed: null,
    duplex: null,
    mtu: null,
    portfast: false,
    bpduguard: false,
    aclIn: null,
    aclOut: null,
    standby: null,
    description: null,
    shutdown: false,
    /* SonicWall 由来の field は Cisco では使わないが、型整合のために null/[] で埋めておく */
    vlanTag: null,
    zone: null,
  };
}

export function parseCisco(text: string): CiscoParsed {
  const out: InternalParsed = {
    hostname: null,
    vlans: {},
    interfaces: {},
    svis: {},
    stpMode: null,
    stpPriority: null,
    defaultGw: null,
    routes: [],
    acls: {},
    dhcp: {},
    sec: {
      telnet: false,
      sshOnly: false,
      enableSecret: false,
      enablePassword: false,
      snmpWeak: false,
      pwEncrypt: false,
    },
  };

  const lines = text.split(/\r?\n/);
  let cur: CurIf | null = null;
  let vl: string | null = null;
  let curAcl: string | null = null;

  /* ---- カバレッジ計測(Sprint 3 P3-1) ----
   * 「未認識」と判定できるのは制御フロー上ちょうど 2 箇所だけ:
   *   (a) if(!cur){...} 内、vlan/name のどちらにもマッチしなかった末尾の continue
   *   (b) インターフェース本体の if/else-if チェーンのどれにもマッチしなかった場合
   * それ以外の全 continue は「何らかのパターンに一致して処理した」ことを意味するため
   * 個別に recognized フラグを立てる必要はない。空行は構造上のセパレータであり
   * 「認識に失敗したコンテンツ」ではないため分母(totalLines)に含めない
   * (どの正規表現も空文字列にはマッチしないため、この早期 continue は既存ロジックに
   * 一切影響しない)。
   */
  const unrecognized: Array<{ lineNumber: number; text: string }> = [];
  let totalLines = 0;

  function flush(): void {
    if (cur) {
      cur.names.forEach((nm) => {
        const c: ParsedInterface = { name: nm } as ParsedInterface;
        for (const k in cur!) {
          if (k === 'names') continue;
          // shallow copy; 配列だけ複製
          const val = (cur as unknown as Record<string, unknown>)[k];
          (c as unknown as Record<string, unknown>)[k] = Array.isArray(val) ? val.slice() : val;
        }
        out.interfaces[nm] = c;
      });
      cur = null;
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const t = raw.replace(/\t/g, ' ').trim();
    if (!t) continue;   // 空行はカバレッジ対象外(既存の抽出ロジックは空文字列に一切マッチしないため無害)
    totalLines++;
    let m: RegExpMatchArray | null;

    if ((m = t.match(/^hostname\s+(\S+)/))) { out.hostname = m[1]!; continue; }
    if ((m = t.match(/^spanning-tree\s+mode\s+(\S+)/))) { out.stpMode = m[1]!; continue; }
    if ((m = t.match(/^spanning-tree\s+(?:vlan\s+[\d,\-]+\s+)?priority\s+(\d+)/))) {
      out.stpPriority = Number(m[1]);
      continue;
    }
    if ((m = t.match(/^ip\s+default-gateway\s+([\d.]+)/))) { out.defaultGw = m[1]!; continue; }
    if ((m = t.match(/^ip\s+route\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/))) {
      out.routes.push({ dst: m[1]!, mask: m[2]!, nh: m[3]! });
      continue;
    }
    if (/^no\s+service\s+password-encryption/.test(t)) { out.sec.pwEncrypt = false; continue; }
    if (/^service\s+password-encryption/.test(t)) { out.sec.pwEncrypt = true; continue; }
    if (/^enable\s+secret\b/.test(t)) { out.sec.enableSecret = true; continue; }
    if (/^enable\s+password\b/.test(t)) { out.sec.enablePassword = true; continue; }
    if ((m = t.match(/^snmp-server\s+community\s+(\S+)/))) {
      if (/^(public|private)$/i.test(m[1]!)) out.sec.snmpWeak = true;
      continue;
    }
    if ((m = t.match(/^transport\s+input\s+(.+)/))) {
      if (/telnet/i.test(m[1]!)) out.sec.telnet = true;
      if (/^ssh\s*$/i.test(m[1]!.trim())) out.sec.sshOnly = true;
      continue;
    }
    if ((m = t.match(/^ip\s+access-list\s+\w+\s+(\S+)/))) {
      curAcl = m[1]!;
      out.acls[curAcl] = out.acls[curAcl] || [];
      flush();
      continue;
    }
    if ((m = t.match(/^access-list\s+(\S+)\s+(permit|deny)\s+(.+)/))) {
      const id = m[1]!;
      out.acls[id] = out.acls[id] || [];
      out.acls[id]!.push({ action: m[2]!, rest: m[3]! });
      continue;
    }
    if (curAcl && (m = t.match(/^(permit|deny)\s+(.+)/))) {
      const acl: AclLine[] = out.acls[curAcl] || [];
      acl.push({ action: m[1]!, rest: m[2]! });
      out.acls[curAcl] = acl;
      continue;
    }
    if ((m = t.match(/^ip\s+dhcp\s+pool\s+(\S+)/))) {
      flush();
      curAcl = null;
      out._dhcp = m[1]!;
      out.dhcp[m[1]!] = { network: null, gw: null };
      continue;
    }
    if (out._dhcp) {
      if ((m = t.match(/^network\s+([\d.]+)\s+([\d.]+)/))) {
        out.dhcp[out._dhcp]!.network = subnetOf(m[1]!, m[2]!);
        continue;
      }
      if ((m = t.match(/^default-router\s+([\d.]+)/))) {
        out.dhcp[out._dhcp]!.gw = m[1]!;
        continue;
      }
    }
    if ((m = t.match(/^interface\s+range\s+(.+)/))) {
      flush();
      curAcl = null;
      out._dhcp = null;
      cur = mkif(expandIfRange(m[1]!));
      continue;
    }
    if ((m = t.match(/^interface\s+(\S+)/))) {
      flush();
      curAcl = null;
      out._dhcp = null;
      cur = mkif([m[1]!]);
      continue;
    }
    if (/^!/.test(t)) {
      flush();
      vl = null;
      curAcl = null;
      out._dhcp = null;
      continue;
    }
    if (!cur) {
      if ((m = t.match(/^vlan\s+([\d,\-]+)\s*$/))) {
        vl = m[1]!;
        expandVlans(m[1]!).forEach((v) => { if (!out.vlans[v]) out.vlans[v] = 'VLAN' + v; });
        continue;
      }
      if ((m = t.match(/^name\s+(\S+)/)) && vl) {
        const nm = m[1]!;
        expandVlans(vl).forEach((v) => { out.vlans[v] = nm; });
        vl = null;
        continue;
      }
      unrecognized.push({ lineNumber: li + 1, text: t });
      continue;
    }
    if ((m = t.match(/^description\s+(.+)/))) cur.description = m[1]!;
    else if (/switchport mode access/.test(t)) cur.mode = 'access';
    else if (/switchport mode trunk/.test(t)) cur.mode = 'trunk';
    else if ((m = t.match(/switchport access vlan\s+(\d+)/))) cur.accessVlan = m[1]!;
    else if ((m = t.match(/switchport trunk native vlan\s+(\d+)/))) cur.trunkNative = m[1]!;
    else if ((m = t.match(/switchport trunk allowed vlan\s+(?:add\s+)?([\d,\-]+)/))) {
      cur.trunkAllowed = cur.trunkAllowed.concat(expandVlans(m[1]!));
    } else if ((m = t.match(/channel-group\s+(\d+)\s+mode\s+(\S+)/))) {
      cur.channel = { id: m[1]!, mode: m[2]! };
    } else if ((m = t.match(/ip address\s+([\d.]+)\s+([\d.]+)\s+secondary/))) {
      cur.secondary.push({ ip: m[1]!, mask: m[2]! });
    } else if ((m = t.match(/ip address\s+([\d.]+)\s+([\d.]+)/))) {
      cur.ip = m[1]!;
      cur.mask = m[2]!;
    } else if ((m = t.match(/^speed\s+(\d+|auto)/))) cur.speed = m[1]!;
    else if ((m = t.match(/^duplex\s+(\S+)/))) cur.duplex = m[1]!;
    else if ((m = t.match(/^mtu\s+(\d+)/))) cur.mtu = m[1]!;
    else if ((m = t.match(/ip access-group\s+(\S+)\s+(in|out)/))) {
      if (m[2] === 'in') cur.aclIn = m[1]!;
      else cur.aclOut = m[1]!;
    } else if ((m = t.match(/^standby\s+(\d+)\s+ip\s+([\d.]+)/))) {
      cur.standby = { group: m[1]!, ip: m[2]! };
    } else if (/spanning-tree portfast/.test(t) && !/disable/.test(t)) cur.portfast = true;
    else if (/spanning-tree bpduguard enable/.test(t)) cur.bpduguard = true;
    else if (/^shutdown$/.test(t)) cur.shutdown = true;
    else unrecognized.push({ lineNumber: li + 1, text: t });
  }
  flush();

  Object.keys(out.interfaces).forEach((k) => {
    const i = out.interfaces[k]!;
    if (i.sviVlan && i.ip) out.svis[i.sviVlan] = { ip: i.ip, mask: i.mask };
  });

  delete out._dhcp;
  // 型から _dhcp を切り落として返す
  const { _dhcp: _, ...clean } = out;
  void _;

  const coverage: ParseCoverage = {
    totalLines,
    recognizedLines: totalLines - unrecognized.length,
    unrecognizedLines: unrecognized,
    coveragePercent: totalLines > 0 ? Math.round(((totalLines - unrecognized.length) / totalLines) * 100) : 100,
  };
  const platformHint = detectPlatformHint(text);
  return { ...clean, coverage, platformHint };
}
