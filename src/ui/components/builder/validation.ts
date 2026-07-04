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
    } else {
      if (!isValidIp(a.ip)) errors[`addr.${i}.ip`] = 'ネットワークアドレスの形式が不正です';
      if (!isValidMask(a.mask)) errors[`addr.${i}.mask`] = 'サブネットマスクの形式が不正です';
    }
  });

  draft.serviceObjects.forEach((s, i) => {
    if (!isNonEmpty(s.name)) errors[`svc.${i}.name`] = '名前を入力してください';
    if (!isValidPort(s.from)) errors[`svc.${i}.from`] = 'ポート番号は 1〜65535';
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
