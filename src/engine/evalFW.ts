/**
 * SonicWall ファイアウォール評価。
 * 元: src/facet-core.js (legacy) の WELL_KNOWN_SVC / resolveSvc / svcMatch / objContains / evalFW。
 * ロジックは無変更(Sprint 1 で svcMatch を双方向 overlap 判定に修正した状態を維持)。
 */

import { inSubnet, ipToInt, subnetOf } from './ip';
import type {
  AddressObject,
  EvalFWResult,
  ParsedInterface,
  ResolvedSvc,
  ServiceObject,
  SonicWallParsed,
} from './types';

/* well-known な service 名 → port (小さく抑える。名前付き svc-object があれば優先) */
export const WELL_KNOWN_SVC: Record<string, ResolvedSvc> = {
  http:   { proto: 'tcp',  from: 80,   to: 80 },
  https:  { proto: 'tcp',  from: 443,  to: 443 },
  ssh:    { proto: 'tcp',  from: 22,   to: 22 },
  telnet: { proto: 'tcp',  from: 23,   to: 23 },
  ftp:    { proto: 'tcp',  from: 21,   to: 21 },
  smtp:   { proto: 'tcp',  from: 25,   to: 25 },
  dns:    { proto: null,   from: 53,   to: 53 },
  ping:   { proto: 'icmp', from: null, to: null },
  icmp:   { proto: 'icmp', from: null, to: null },
};

/**
 * "any" は null、未知は undefined、それ以外は {proto, from, to} を返す。
 * service-object として定義されていればそちらを優先、なければ "tcp/443" 形式 / 数値ポート /
 * WELL_KNOWN_SVC の順にフォールバック。
 */
export function resolveSvc(
  svc: Record<string, ServiceObject> | null | undefined,
  spec: string | null | undefined,
): ResolvedSvc | null | undefined {
  if (!spec || /^any$/i.test(spec)) return null;
  if (svc && svc[spec]) {
    const s = svc[spec]!;
    return { proto: (s.proto || '').toLowerCase() || null, from: s.from, to: s.to };
  }
  if (/^\d+$/.test(spec)) return { proto: null, from: Number(spec), to: Number(spec) };
  const m = spec.match(/^(tcp|udp|icmp)\s*\/\s*(\d+)(?:\s*-\s*(\d+))?$/i);
  if (m) {
    return { proto: m[1]!.toLowerCase(), from: Number(m[2]), to: m[3] ? Number(m[3]) : Number(m[2]) };
  }
  const w = WELL_KNOWN_SVC[spec.toLowerCase()];
  if (w) return { proto: w.proto, from: w.from, to: w.to };
  return undefined;
}

/**
 * ルール側 service spec と要求側 service spec の双方向 overlap 判定。
 * - どちらか any → match
 * - どちらか未知 → 過剰拒否を避けて permissive(従来挙動を踏襲)
 * - 両方解決済み → プロトコル一致(どちらか null は wildcard)+ ポート範囲 overlap
 */
export function svcMatch(
  svc: Record<string, ServiceObject> | null | undefined,
  ruleSpec: string | null | undefined,
  reqSpec: string | null | undefined,
): boolean {
  const r = resolveSvc(svc, ruleSpec);
  const q = resolveSvc(svc, reqSpec);
  if (r === null || q === null) return true;
  if (r === undefined || q === undefined) return true;
  if (r.proto && q.proto && r.proto !== q.proto) return false;
  if (r.from == null || q.from == null) return true;
  return !(r.to! < q.from || q.to! < r.from);
}

/**
 * address-object 解決:`name` で参照されるオブジェクトが `ip` を含むか。
 * - "any" → 常に true
 * - host / network / range / 生 CIDR / 生 IP 文字列に対応
 * - "<Zone> Subnets"(例: "LAN Subnets")は SonicOS の組み込みアドレスグループ
 *   (Sprint 4 S4-3)。ゾーンに割り当てられた全インターフェイスのサブネットの
 *   和集合として動的に解決する(ユーザーが明示的に同名オブジェクトを定義している
 *   場合はそちらを優先)。カスタム address-group / service-group のメンバー展開は
 *   実装していない — SonicOS 6.5 E-CLI Reference Guide を精読したが、グループへの
 *   メンバー追加コマンドの構文を確認できなかったため(docs/PARSER-NOTES.md 参照)。
 * - 未知名は false(caller 側で no match として扱う、保守的)
 */
export function objContains(
  rparsed: { addr: Record<string, AddressObject>; interfaces?: Record<string, ParsedInterface> },
  name: string | null | undefined,
  ip: string,
): boolean {
  if (!name || /^any$/i.test(name)) return true;
  const zoneMatch = name.match(/^(.+?)\s+Subnets$/i);
  if (zoneMatch && rparsed.interfaces && !rparsed.addr[name]) {
    const zone = zoneMatch[1]!.toUpperCase();
    return Object.values(rparsed.interfaces).some((i) => {
      if (!i.ip || !i.mask) return false;
      if ((i.zone || '').toUpperCase() !== zone) return false;
      return inSubnet(ip, subnetOf(i.ip, i.mask));
    });
  }
  const o = rparsed.addr[name];
  if (!o) {
    if (/^[\d.]+\/\d+$/.test(name)) return inSubnet(ip, name);
    if (/^[\d.]+$/.test(name)) return ip === name;
    return false;
  }
  if (o.type === 'host') return ip === o.ip;
  if (o.type === 'network') return inSubnet(ip, o.cidr);
  if (o.type === 'range') return ipToInt(ip) >= ipToInt(o.from) && ipToInt(ip) <= ipToInt(o.to);
  return false;
}

export function evalFW(
  rparsed: SonicWallParsed | null,
  srcZone: string,
  dstZone: string,
  srcIp: string | null | undefined,
  dstIp: string | null | undefined,
  service: string | null | undefined,
): EvalFWResult {
  if (!rparsed) {
    return { action: srcZone === dstZone ? 'allow' : 'deny', rule: null, reason: 'default' };
  }
  const rules = rparsed.rules || [];
  for (let i = 0; i < rules.length; i++) {
    const rl = rules[i]!;
    if (rl.enabled === false) continue;
    if (rl.from.toUpperCase() !== srcZone.toUpperCase() && rl.from.toUpperCase() !== 'ANY') continue;
    if (rl.to.toUpperCase() !== dstZone.toUpperCase() && rl.to.toUpperCase() !== 'ANY') continue;
    if (srcIp && !objContains(rparsed, rl.src, srcIp)) continue;
    if (dstIp && !objContains(rparsed, rl.dst, dstIp)) continue;
    if (!svcMatch(rparsed.svc, rl.service, service)) continue;
    return { action: rl.action, rule: rl, reason: 'rule', index: i };
  }
  const intra = srcZone.toUpperCase() === dstZone.toUpperCase();
  return {
    action: intra ? 'allow' : 'deny',
    rule: null,
    reason: intra ? 'intra-zone' : 'default-deny',
  };
}
