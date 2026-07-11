/**
 * 経路トレース。SRC → (L2) → GW → RT → FW → (NAT) → DST のホップ列を構築。
 * 元: src/facet-core.js (legacy) の pathTrace。
 * ロジックは無変更(Sprint 1 で同一サブネット時に L2/GW/RT/FW を出さない構造に修正済を維持)。
 */

import { buildSubnets } from './buildSubnets';
import { evalFW, objContains } from './evalFW';
import { intToIp, ipToInt, representativeHostIp } from './ip';
import type { AppState, NatPolicy, PathHop, PathTraceResult, SonicWallParsed } from './types';

/* ---- 該当 NAT ポリシーのマッチング(Sprint 4 S4-2) ----
 * パーサが抽出する NAT ポリシーは original-source / translated-source /
 * outbound-interface のみ(SonicOS の全条件の簡略化サブセット)。この範囲で
 * 判定できる限り、最初に条件を満たしたポリシーを採用する(SonicOS のルール評価は
 * 上から順に最初の一致を採用する方式に準拠)。 */
function findMatchingNat(
  natList: NatPolicy[],
  rp: SonicWallParsed,
  srcIp: string,
  outboundIface: string | null,
): NatPolicy | null {
  for (const n of natList) {
    if (n.orig && !objContains(rp, n.orig, srcIp)) continue;
    if (n.iface && outboundIface && n.iface.toUpperCase() !== outboundIface.toUpperCase()) continue;
    return n;
  }
  return null;
}

export function pathTrace(
  state: AppState,
  srcCidr: string,
  dstSpec: string,
  service?: string,
): PathTraceResult {
  const subs = buildSubnets(state);
  const r = state.router;

  function finalize(h: PathHop[], v: 'ok' | 'deny', msg: string): PathTraceResult {
    return { ok: v === 'ok', hops: h, verdict: v, message: msg };
  }

  const src = subs.filter((s) => s.cidr === srcCidr)[0];
  if (!src) {
    return finalize(
      [{ node: '?', detail: '送信元サブネットが見つかりません', status: 'deny' }],
      'deny',
      '送信元サブネットが見つかりません',
    );
  }

  const hops: PathHop[] = [];
  hops.push({
    node: 'SRC',
    detail: src.dev + ' の VLAN' + (src.vlan || '-') + ' 内ホスト (' + src.cidr + ')',
    status: 'ok',
  });

  let dst: typeof src | undefined;
  let dstZone = '';
  let dstIp = '';
  let wan = false;
  let wsub: typeof src | undefined;

  if (dstSpec === '__WAN__') {
    wan = true;
    dstZone = 'WAN';
    wsub = subs.filter((s) => /WAN/i.test(s.zone))[0];
    if (!wsub) return finalize(hops, 'deny', 'WAN インターフェイスが検出されません');
    dstIp = intToIp(ipToInt(wsub.gw) + 1);
  } else {
    dst = subs.filter((s) => s.cidr === dstSpec)[0];
    if (!dst) return finalize(hops, 'deny', '宛先サブネットが見つかりません');

    /* 同一サブネット: L3 を経由しないので L2 で完結 (GW/RT/FW は経路に含めない) */
    if (src.cidr === dst.cidr) {
      hops.push({
        node: 'DST',
        detail: '同一サブネット内のホスト (' + dst.cidr + ')',
        status: 'ok',
      });
      return finalize(hops, 'ok', '同一サブネット内 — L2 で完結(ルータ・FW は通らない)');
    }
    dstZone = dst.zone || 'LAN';
    /* 全機能監査 Medium-8: buildMatrix.ts と共通の代表ホストIP算出ロジックを使う
     * (以前はここだけ独自の +20 オフセット計算をしており、buildMatrix.ts 側の
     * ゲートウェイIPそのものを使う実装と食い違いうる不整合があった)。 */
    dstIp = representativeHostIp(dst.cidr, dst.gw);
  }

  /* L3 経路 */
  if (src.dev !== r.key) {
    hops.push({
      node: 'L2',
      detail:
        src.dev + ' → トランク → ' + r.key + '(VLAN' + (src.vlan || '-') + ' タグ付き転送)',
      status: 'ok',
    });
  }
  hops.push({
    node: 'GW',
    detail: 'L3 ゲートウェイ ' + src.gw + ' (' + r.key + ':' + src.iface + ')',
    status: 'ok',
  });
  if (wan) {
    hops.push({
      node: 'RT',
      detail: 'デフォルトルートで WAN へ (' + wsub!.iface + ')',
      status: 'ok',
    });
  } else {
    hops.push({
      node: 'RT',
      detail:
        r.key + ' が VLAN' + (dst!.vlan || '-') + ' (' + dst!.cidr + ') へルーティング(接続済)',
      status: 'ok',
    });
  }

  /* FW */
  const fw = evalFW(
    r.parsed as never,
    src.zone || 'LAN',
    dstZone,
    src.gw,
    dstIp,
    service || 'any',
  );
  const fwd: 'ok' | 'deny' = fw.action === 'allow' ? 'ok' : 'deny';
  const rdesc =
    fw.reason === 'rule'
      ? 'ルール #' + ((fw.index ?? 0) + 1) + ' ' + fw.rule!.from + '→' + fw.rule!.to + ' (' + fw.rule!.action + ', svc=' + fw.rule!.service + ')'
      : fw.reason === 'intra-zone'
      ? '同一ゾーン内(既定許可)'
      : fw.reason === 'default-deny'
      ? '該当ルールなし(ゾーン間既定遮断)'
      : '既定';
  hops.push({
    node: 'FW',
    detail: (src.zone || 'LAN') + ' → ' + dstZone + ' : ' + rdesc,
    status: fwd,
  });
  if (fwd === 'deny') return finalize(hops, 'deny', 'ファイアウォールポリシーで遮断');

  /* NAT(Sprint 4 S4-2: 該当ポリシーの実質評価。従来は nat ポリシーが1件でも
   * 定義されていれば無条件に「NAT ポリシーで変換」と表示しており、実際にこの
   * 通信に一致するかどうかを見ていなかった) */
  if (wan) {
    const rp = r.parsed as SonicWallParsed | null;
    const natList = rp?.nat || [];
    const matched = natList.length ? findMatchingNat(natList, rp!, src.gw, wsub!.iface) : null;
    hops.push({
      node: 'NAT',
      detail: matched
        ? '該当 NAT ポリシー(original-source=' + (matched.orig || 'any') + ' → translated-source=' +
          (matched.trans || '不明') + ', outbound=' + (matched.iface || wsub!.iface) + ')で送元変換'
        : natList.length
        ? '定義済み NAT ポリシー ' + natList.length + ' 件はあるが、この通信(送元 ' + src.gw +
          ')に一致する条件(original-source / outbound-interface)が見つからない。既定 SNAT(WAN IP へ)を想定'
        : 'NAT ポリシー未定義。デフォルト SNAT(WAN IP へ)を想定',
      status: 'info',
    });
  }
  hops.push({
    node: 'DST',
    detail: wan
      ? 'インターネット'
      : (dst!.dev + ' VLAN' + (dst!.vlan || '-') + ' (' + dst!.cidr + ')'),
    status: 'ok',
  });
  return finalize(hops, 'ok', '設定上は到達可能');
}
