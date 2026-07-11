/**
 * GUI 作成モードの入力検証ヘルパー。
 * フォームの各フィールドを純関数で検証し、エラー文字列(なければ null)を返す。
 * reducer には持ち込まず、コンポーネント側で描画時に都度計算する(派生 state)。
 */

import type { CiscoBuilderDraft, SonicWallBuilderDraft } from '@engine/types';

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIp(s: string): boolean {
  const m = s.match(IPV4_RE);
  if (!m) return false;
  return m.slice(1, 5).every((oct) => {
    const n = Number(oct);
    return n >= 0 && n <= 255 && String(n) === oct.replace(/^0+(?=\d)/, '');
  });
}

/** サブネットマスクとして妥当か(連続した 1 の後に連続した 0、という2進数制約まではチェックしない簡易版) */
export function isValidMask(s: string): boolean {
  if (!isValidIp(s)) return false;
  const octets = s.split('.').map(Number);
  const bin = octets.map((o) => o.toString(2).padStart(8, '0')).join('');
  // 1 が連続したあと 0 が連続する(途中で 1 に戻らない)形のみ有効
  return /^1*0*$/.test(bin);
}

export function isValidVlanId(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= 1 && n <= 4094;
}

export function isValidHostname(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,62}$/.test(s.trim());
}

export function isValidPort(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return n >= 1 && n <= 65535;
}

export function isNonEmpty(s: string): boolean {
  return s.trim().length > 0;
}

/** 2つの IPv4 アドレスを比較する(呼び出し側で isValidIp 済みであることを前提とする)。 */
function ipLessOrEqual(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if (pa[i] !== pb[i]) return pa[i]! < pb[i]!;
  }
  return true;
}

export interface FieldError {
  path: string;   // 'ports[3].accessVlan' のような識別子(表示はしないが将来のフォーカス連携用)
  message: string;
}

/** フィールドキー("vlan.0.id" 等) → エラーメッセージ のマップ */
export type ErrorMap = Record<string, string>;

/**
 * Cisco draft の構文検証。ここで弾くのは「値として不正」(IP形式・VLAN範囲・重複ID等)
 * のみで、「trunk なのに許可VLANが空」のような意味的な未完成さは対象外
 * (H-2 のリアルタイム機種上限警告 / verify() 側の lack finding に委ねる)。
 */
export function validateCiscoDraft(draft: CiscoBuilderDraft): ErrorMap {
  const errors: ErrorMap = {};

  if (!isValidHostname(draft.hostname)) {
    errors['hostname'] = 'hostname は英数字・-_. のみ、1〜63文字で入力してください';
  }

  const seenVlanIds = new Map<string, number>();
  draft.vlans.forEach((v, i) => {
    if (!isValidVlanId(v.id)) {
      errors[`vlan.${i}.id`] = 'VLAN ID は 1〜4094 の数値';
    } else {
      const prev = seenVlanIds.get(v.id);
      if (prev !== undefined) {
        errors[`vlan.${i}.id`] = 'VLAN ID が重複しています';
        errors[`vlan.${prev}.id`] = 'VLAN ID が重複しています';
      }
      seenVlanIds.set(v.id, i);
    }
    if (!isNonEmpty(v.name)) {
      errors[`vlan.${i}.name`] = 'VLAN 名を入力してください';
    }
  });

  draft.svis.forEach((s, i) => {
    if (!isValidVlanId(s.vlan)) errors[`svi.${i}.vlan`] = 'VLAN を選択してください';
    if (!isValidIp(s.ip)) errors[`svi.${i}.ip`] = 'IP アドレスの形式が不正です';
    if (!isValidMask(s.mask)) errors[`svi.${i}.mask`] = 'サブネットマスクの形式が不正です';
    /* HSRP(SF5-7): 片方だけ入力された「未完成」な状態のみ弾く。両方空なら
     * 単に「HSRP 未設定」として扱う(必須フィールドではない)。 */
    const hasGroup = isNonEmpty(s.standbyGroup ?? '');
    const hasIp = isNonEmpty(s.standbyIp ?? '');
    if (hasGroup || hasIp) {
      /* HSRP(v1、standby version 2 は本ビルダーでは未対応)のグループ番号は
       * 0〜255。 */
      if (!/^\d+$/.test(s.standbyGroup ?? '') || Number(s.standbyGroup) > 255) {
        errors[`svi.${i}.standbyGroup`] = 'HSRP グループ番号は 0〜255 の整数で入力してください';
      }
      if (!isValidIp(s.standbyIp ?? '')) {
        errors[`svi.${i}.standbyIp`] = '仮想 IP アドレスの形式が不正です';
      }
    }
  });

  const seenAclNames = new Map<string, number>();
  draft.acls.forEach((a, i) => {
    if (!isNonEmpty(a.name)) {
      errors[`acl.${i}.name`] = 'ACL 名を入力してください';
    } else {
      const prev = seenAclNames.get(a.name);
      if (prev !== undefined) {
        errors[`acl.${i}.name`] = 'ACL 名が重複しています';
        errors[`acl.${prev}.name`] = 'ACL 名が重複しています';
      }
      seenAclNames.set(a.name, i);
    }
    a.lines.forEach((l, j) => {
      if (!isNonEmpty(l.rest)) errors[`acl.${i}.line.${j}.rest`] = '内容を入力してください(例: tcp any any eq 80)';
    });
  });

  draft.dhcpPools.forEach((d, i) => {
    if (!isNonEmpty(d.name)) errors[`dhcp.${i}.name`] = 'プール名を入力してください';
    if (!isValidIp(d.network)) errors[`dhcp.${i}.network`] = 'ネットワークアドレスの形式が不正です';
    if (!isValidMask(d.mask)) errors[`dhcp.${i}.mask`] = 'サブネットマスクの形式が不正です';
    if (!isValidIp(d.gw)) errors[`dhcp.${i}.gw`] = 'IP アドレスの形式が不正です';
  });

  const seenChannelIds = new Map<string, number>();
  draft.portChannels.forEach((c, i) => {
    if (!/^\d+$/.test(c.id) || Number(c.id) < 1) {
      errors[`pc.${i}.id`] = 'channel-group 番号は 1 以上の整数で入力してください';
    } else {
      const prev = seenChannelIds.get(c.id);
      if (prev !== undefined) {
        errors[`pc.${i}.id`] = 'channel-group 番号が重複しています';
        errors[`pc.${prev}.id`] = 'channel-group 番号が重複しています';
      }
      seenChannelIds.set(c.id, i);
    }
  });

  return errors;
}

/**
 * SonicWall draft の構文検証。有効化(enabled)されているインターフェイスのみを対象にする。
 */
export function validateSonicWallDraft(draft: SonicWallBuilderDraft): ErrorMap {
  const errors: ErrorMap = {};

  if (!isValidHostname(draft.hostname)) {
    errors['hostname'] = 'hostname は英数字・-_. のみ、1〜63文字で入力してください';
  }

  draft.interfaces.forEach((iface, i) => {
    if (!iface.enabled) return;
    if (!isValidIp(iface.ip)) errors[`iface.${i}.ip`] = 'IP アドレスの形式が不正です';
    if (!isValidMask(iface.mask)) errors[`iface.${i}.mask`] = 'サブネットマスクの形式が不正です';
    iface.vlanSubs.forEach((v, j) => {
      if (!isValidVlanId(v.vlanTag)) errors[`iface.${i}.vlanSub.${j}.tag`] = 'VLAN ID は 1〜4094 の数値';
      if (!isValidIp(v.ip)) errors[`iface.${i}.vlanSub.${j}.ip`] = 'IP アドレスの形式が不正です';
      if (!isValidMask(v.mask)) errors[`iface.${i}.vlanSub.${j}.mask`] = 'サブネットマスクの形式が不正です';
    });
  });

  draft.addressObjects.forEach((a, i) => {
    if (!isNonEmpty(a.name)) errors[`addr.${i}.name`] = '名前を入力してください';
    if (a.type === 'host') {
      if (!isValidIp(a.ip)) errors[`addr.${i}.ip`] = 'IP アドレスの形式が不正です';
    } else if (a.type === 'range') {
      const fromOk = isValidIp(a.from);
      const toOk = isValidIp(a.to);
      if (!fromOk) errors[`addr.${i}.from`] = '開始 IP アドレスの形式が不正です';
      if (!toOk) errors[`addr.${i}.to`] = '終了 IP アドレスの形式が不正です';
      if (fromOk && toOk && !ipLessOrEqual(a.from, a.to)) {
        errors[`addr.${i}.to`] = '終了 IP は開始 IP 以上にしてください';
      }
    } else {
      if (!isValidIp(a.ip)) errors[`addr.${i}.ip`] = 'ネットワークアドレスの形式が不正です';
      if (!isValidMask(a.mask)) errors[`addr.${i}.mask`] = 'サブネットマスクの形式が不正です';
    }
  });

  draft.serviceObjects.forEach((s, i) => {
    if (!isNonEmpty(s.name)) errors[`svc.${i}.name`] = '名前を入力してください';
    if (!isValidPort(s.from)) errors[`svc.${i}.from`] = 'ポート番号は 1〜65535';
    /* 全機能監査 Medium-17: from/to を別々の入力欄に分離したのに合わせて to も検証。
     * to が空なら from と同一(単一ポート)とみなし、from を入力していれば OK。 */
    if (isNonEmpty(s.to) && !isValidPort(s.to)) errors[`svc.${i}.to`] = 'ポート番号は 1〜65535';
    if (isNonEmpty(s.to) && isValidPort(s.from) && isValidPort(s.to) && Number(s.to) < Number(s.from)) {
      errors[`svc.${i}.to`] = 'To は From 以上にしてください';
    }
  });

  draft.rules.forEach((r, i) => {
    if (!isNonEmpty(r.from)) errors[`rule.${i}.from`] = 'ゾーン名を入力してください';
    if (!isNonEmpty(r.to)) errors[`rule.${i}.to`] = 'ゾーン名を入力してください';
  });

  draft.natPolicies.forEach((n, i) => {
    if (!isNonEmpty(n.orig)) errors[`nat.${i}.orig`] = '送元を入力してください';
    if (!isNonEmpty(n.trans)) errors[`nat.${i}.trans`] = '変換先を入力してください';
  });

  return errors;
}
