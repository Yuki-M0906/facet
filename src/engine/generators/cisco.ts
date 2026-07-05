/**
 * Cisco IOS running-config ジェネレータ(GUI 作成モード用)。
 * parseCisco の逆方向:CiscoBuilderDraft → running-config テキスト。
 *
 * 往復保証:出力される全構文は src/engine/parsers/cisco.ts の正規表現に
 * 厳密準拠する。test/engine/builder.test.ts でこの保証を機械的に検証する。
 *
 * 意図的に省いているもの(Sprint 5 MVP スコープ外):
 * - description 行、DHCP プール、standby(HSRP)、secondary IP、
 *   speed/duplex/mtu の個別指定 — GUI フォームにフィールドを追加すれば
 *   この生成関数にも数行足すだけで対応可能(ParsedInterface 側は既に対応済)。
 *   ACL 本体・ip access-group の適用は Sprint 5 SF5-3 で対応済み。
 */

import type { CiscoBuilderDraft, CiscoBuilderPort } from '../types';

function portLines(p: CiscoBuilderPort): string[] {
  const lines: string[] = [];
  if (p.mode === 'access') {
    lines.push(' switchport mode access');
    if (p.accessVlan) lines.push(' switchport access vlan ' + p.accessVlan);
  } else if (p.mode === 'trunk') {
    lines.push(' switchport mode trunk');
    if (p.trunkNative) lines.push(' switchport trunk native vlan ' + p.trunkNative);
    if (p.trunkAllowed.length) lines.push(' switchport trunk allowed vlan ' + p.trunkAllowed.join(','));
  }
  if (p.aclIn) lines.push(' ip access-group ' + p.aclIn + ' in');
  if (p.aclOut) lines.push(' ip access-group ' + p.aclOut + ' out');
  if (p.portfast) lines.push(' spanning-tree portfast');
  if (p.bpduguard) lines.push(' spanning-tree bpduguard enable');
  if (p.shutdown) lines.push(' shutdown');
  return lines;
}

export function generateCiscoConfig(draft: CiscoBuilderDraft): string {
  const out: string[] = [];

  out.push('hostname ' + (draft.hostname || 'SWITCH'));
  if (draft.stpMode) out.push('spanning-tree mode ' + draft.stpMode);
  if (draft.stpPriority !== null) out.push('spanning-tree priority ' + draft.stpPriority);
  if (draft.security.pwEncrypt) out.push('service password-encryption');
  if (draft.security.enableSecret) out.push('enable secret 9 $facet$generated$');
  out.push('!');

  draft.vlans.forEach((v) => {
    out.push('vlan ' + v.id);
    if (v.name) out.push(' name ' + v.name);
  });
  if (draft.vlans.length) out.push('!');

  draft.acls.forEach((a) => {
    out.push('ip access-list extended ' + a.name);
    a.lines.forEach((l) => out.push(' ' + l.action + ' ' + l.rest));
    out.push('!');
  });

  /* configured なポートのみ interface ブロックを出力(未設定ポートは行を出さない) */
  draft.ports
    .filter((p) => p.mode !== null || p.shutdown || p.aclIn || p.aclOut)
    .forEach((p) => {
      out.push('interface ' + p.iface);
      out.push(...portLines(p));
      out.push('!');
    });

  draft.svis.forEach((s) => {
    out.push('interface Vlan' + s.vlan);
    out.push(' ip address ' + s.ip + ' ' + s.mask);
    out.push('!');
  });

  out.push('line vty 0 4');
  out.push(' transport input ' + (draft.security.sshOnly ? 'ssh' : 'telnet'));
  out.push('!');

  return out.join('\n') + '\n';
}
