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
    trunkAllowedExplicit: false,
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
  let route: { dst: string | null; mask: string | null; nh: string | null } | null = null;

  function flushIf() { if (cur) { out.interfaces[cur.name] = cur; cur = null; } }
  function flushRule() { if (rule) { out.rules.push(rule); rule = null; } }
  function flushNat() { if (nat) { out.nat.push(nat); nat = null; } }
  function flushRoute() {
    if (route && route.dst && route.mask && route.nh) {
      out.routes.push({ dst: route.dst, mask: route.mask, nh: route.nh });
    }
    route = null;
  }
  function flushAll() { flushIf(); flushRule(); flushNat(); flushRoute(); }

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
      if (/^route-?policy\b/i.test(t)) {
        /* 全機能監査 Medium-12: 以前は単一行完結パターンのみ対応しており、
         * nat-policy/access-rule と同様の実際のステートフルな複数行ブロック構文
         * (route-policy の次行以降に destination / gateway が続く形)には非対応
         * だった。単一行完結パターン(後方互換)も引き続き受け付ける。 */
        flushAll();
        route = { dst: null, mask: null, nh: null };
        const inline = t.match(/^route-?policy.*?dest(?:ination)?\s+([\d.]+)\s+([\d.]+).*?gateway\s+([\d.]+)/i);
        if (inline) { route.dst = inline[1]!; route.mask = inline[2]!; route.nh = inline[3]!; }
        recognized = true;
        break matchLine;
      }
      if (route) {
        if ((m = t.match(/^dest(?:ination)?\s+([\d.]+)\s+([\d.]+)/i))) {
          route.dst = m[1]!; route.mask = m[2]!; recognized = true;
        } else if ((m = t.match(/^gateway\s+([\d.]+)/i))) {
          route.nh = m[1]!; recognized = true;
        }
        if (/^(end|exit)\s*$/i.test(t) || t === '') { flushRoute(); recognized = true; }
        break matchLine;
      }
      /* 全機能監査 Medium-6: 行頭アンカー・文脈判定が無い緩い部分一致のため、
       * 例えば `comment "no ping from wan - blocked by policy"` のような
       * コメント行でも誤マッチしていた。コメント行(`comment ...`)を対象外にする。
       * (実際のSonicOS CLI構文自体との厳密な照合は別途要検証、既知の制約として
       * PARSER-NOTES.md に記載する。) */
      if (!/^comment\b/i.test(t) && /ping.*from\s+wan/i.test(t)) { out.sec.pingWanAllow = true; recognized = true; }
      if (!/^comment\b/i.test(t) && /management.*(from\s+wan|wan.*allow)/i.test(t)) { out.sec.mgmtWanAllow = true; recognized = true; }
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
      } else if (/^ip-?assignment\s+\S+/i.test(t)) {
        /* 全機能監査 Medium-7: 以前は「zone未設定ならip-assignmentの引数をzone名として
         * 採用する」フォールバックがあったが、この引数の実際の意味は割当モード
         * (static/dhcp等)であり zone 名ではない。zone行がip-assignment行より先に
         * 来る通常の構成では zone 設定済みのためこのフォールバック自体は発火せず
         * 隠蔽されていたが、zone行が無い/後に来る構成では誤ったゾーン名(モード名)が
         * isWan() 等の判定に使われてしまう。ゾーン推定には使わず、行の認識のみ行う。 */
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
