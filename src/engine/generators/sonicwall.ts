/**
 * SonicOS CLI(可読テキスト)ジェネレータ(GUI 作成モード用)。
 * parseSonicWall の逆方向:SonicWallBuilderDraft → SonicOS CLI テキスト。
 *
 * 往復保証:出力される全構文は src/engine/parsers/sonicwall.ts の正規表現に
 * 厳密準拠する。test/engine/builder.test.ts でこの保証を機械的に検証する。
 *
 * 意図的に省いているもの(Sprint 5 MVP スコープ外):
 * - DHCP スコープ、route-policy、WAN ping/mgmt 許可設定 — 対応する
 *   フォームフィールドを足せばこの生成関数にも数行足すだけで対応可能。
 *   address-object の range 型は Sprint 5 SF5-5 で対応済み。
 */

import type { SonicWallBuilderDraft } from '../types';

export function generateSonicWallConfig(draft: SonicWallBuilderDraft): string {
  const out: string[] = [];

  out.push('system name ' + (draft.hostname || 'ROUTER'));

  draft.addressObjects.forEach((a) => {
    if (a.type === 'host') {
      out.push('address-object ipv4 ' + a.name + ' host ' + a.ip + (a.zone ? ' zone ' + a.zone : ''));
    } else if (a.type === 'range') {
      out.push('address-object ipv4 ' + a.name + ' range ' + a.from + ' ' + a.to);
    } else {
      out.push('address-object ipv4 ' + a.name + ' network ' + a.ip + ' ' + a.mask + (a.zone ? ' zone ' + a.zone : ''));
    }
  });

  draft.serviceObjects.forEach((s) => {
    const range = s.to && s.to !== s.from ? s.from + '-' + s.to : s.from;
    out.push('service-object ' + s.name + ' ' + s.proto + ' ' + range);
  });

  draft.interfaces
    .filter((i) => i.enabled)
    .forEach((i) => {
      out.push('interface ' + i.iface);
      out.push(' zone ' + (i.zone || 'LAN'));
      if (i.ip) out.push(' ip ' + i.ip + ' netmask ' + i.mask);
      if (i.comment) out.push(' comment "' + i.comment.replace(/"/g, '') + '"');

      i.vlanSubs.forEach((v) => {
        out.push('interface ' + i.iface + ':V' + v.vlanTag);
        out.push(' vlan ' + v.vlanTag);
        out.push(' zone ' + (v.zone || 'LAN'));
        if (v.ip) out.push(' ip ' + v.ip + ' netmask ' + v.mask);
        if (v.comment) out.push(' comment "' + v.comment.replace(/"/g, '') + '"');
      });
    });

  draft.rules.forEach((r) => {
    out.push('access-rule from ' + r.from + ' to ' + r.to);
    out.push(' action ' + r.action);
    out.push(' source ' + (r.src || 'any'));
    out.push(' destination ' + (r.dst || 'any'));
    out.push(' service ' + (r.service || 'any'));
    if (!r.enabled) out.push(' disable');
  });

  draft.natPolicies.forEach((n) => {
    out.push('nat-policy');
    out.push(' original-source ' + n.orig);
    out.push(' translated-source ' + n.trans);
    out.push(' outbound-interface ' + n.iface);
  });

  return out.join('\n') + '\n';
}
