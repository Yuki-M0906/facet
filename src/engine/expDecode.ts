/**
 * SonicWall `.exp`(Settings Export)デコーダ。
 *
 * `.exp` は「難読化バイナリ」ではなく、`key=value&key=value&…` 形式の設定変数リストを
 * base64 エンコードしただけのテキスト(値は URL(percent)エンコード)。パスワード等の
 * 一部の値だけは機器側で暗号化されたまま格納される。SonicOS 6 系・7 系(Gen7)とも
 * 同一方式であることを SonicWall 公式 KB(certutil / base64 -d による復号手順)と
 * 公開実装(pryorda/sonicwallRuleParser、faridlav/SonicWallParser)で確認済み。
 * 本モジュールは実物の `.exp` サンプルで「同梱の復号済みテキストと完全一致」を検証した
 * 手順をそのまま実装する:
 *   1. 前後の空白と、ファイル末尾に付くことがある終端 `&&` を除去
 *   2. base64 デコード(改行等の空白は無視、パディング不足は補完)
 *   3. UTF-8 として文字列化し `&`(または改行)で分割
 *   4. 各要素を最初の `=` で key / value に分割し、value を percent デコード
 * base64 でなく「復号済みの key=value テキスト」が渡された場合は 2 を飛ばしてそのまま読む
 * (v4.22.1。本ツールの復号テキスト出力や公式 KB の手順で復号したファイルを再投入できる)。
 *
 * DOM 非依存(atob / TextDecoder は Node 20+ とブラウザ双方のグローバル)。
 */

export interface ExpPair {
  key: string;
  /** percent デコード済みの値 */
  value: string;
  /** デコード前の生の値(`%3a` 等をそのまま保持) */
  rawValue: string;
}

export interface ExpDecodeResult {
  pairs: ExpPair[];
  /** 同じ key が複数回出た場合は最後の値を採用(公開実装と同じ規約) */
  map: Record<string, string>;
  /** 復号中の注記(終端除去、パディング補完、重複キー等)。エラーではない。 */
  notes: string[];
  stats: {
    pairCount: number;
    percentDecodedCount: number;
    duplicateKeyCount: number;
    strippedTerminator: boolean;
    /** base64 ではなく「復号済みの key=value テキスト」をそのまま読んだ場合 true */
    alreadyDecoded: boolean;
  };
}

const B64_RE = /^[A-Za-z0-9+/=]+$/;
const PAIR_RE = /^[A-Za-z0-9_.\-]+=/;

/** 「復号済み key=value テキスト」(本ツールの復号テキスト出力や、公式 KB の手順で
 *  certutil / base64 -d した結果)らしいか。CLI 可読テキストや Cisco config は `=` 始まりの
 *  行がほぼ無いので誤判定しない。 */
function looksLikeDecodedPairs(body: string): boolean {
  const segs = body.replace(/\r\n?/g, '\n').split(body.indexOf('\n') >= 0 ? '\n' : '&').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 3) return false;
  const n = segs.filter((s) => PAIR_RE.test(s)).length;
  return n / segs.length >= 0.8;
}

/** 入力テキストが base64 の `.exp` らしいか(拡張子に依存しない判定)。 */
export function looksLikeExp(text: string): boolean {
  const t = text.replace(/^﻿/, '').trim().replace(/&+$/, '').replace(/\s+/g, '');
  if (t.length < 16) return false;
  if (!B64_RE.test(t)) return false;
  /* CLI 可読テキストは空白・記号を含み base64 の文字集合に収まらないので、
   * ここまで来れば `.exp` と見なしてよい。念のため復号して `=` を含むことを確認する。 */
  try {
    const head = base64ToString(t.slice(0, Math.min(t.length - (t.length % 4), 4000)));
    return head.indexOf('=') >= 0;
  } catch {
    return false;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToString(b64: string): string {
  return new TextDecoder('utf-8').decode(base64ToBytes(b64));
}

/** decodeURIComponent 相当だが、不正なシーケンスで例外を出さず生のまま残す。
 *  `+` はスペースに変換しない(SonicOS はスペースを %20 で書き、公開実装も unquote 準拠)。 */
export function percentDecode(s: string): string {
  if (s.indexOf('%') < 0) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s.replace(/%([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
}

export function decodeExp(text: string): ExpDecodeResult {
  const notes: string[] = [];
  let body = text.replace(/^﻿/, '').trim();
  if (!body) throw new Error('ファイルが空です。');

  let strippedTerminator = false;
  if (/&+$/.test(body)) {
    body = body.replace(/&+$/, '');
    strippedTerminator = true;
    notes.push('ファイル末尾の終端記号(&)を除去しました。');
  }
  const compact = body.replace(/\s+/g, '');
  let decoded: string;
  let alreadyDecoded = false;
  if (B64_RE.test(compact)) {
    if (compact.length !== body.length) notes.push('base64 本文中の改行・空白を無視しました。');
    let padded = compact;
    const rem = padded.length % 4;
    if (rem === 1) throw new Error('base64 の長さが不正です(ファイルが途中で切れている可能性)。');
    if (rem > 0) {
      padded = padded + '='.repeat(4 - rem);
      notes.push('base64 のパディング(=)を補完しました。');
    }
    try {
      decoded = base64ToString(padded);
    } catch {
      throw new Error('base64 の復号に失敗しました。ファイルが破損しているか .exp ではありません。');
    }
  } else if (looksLikeDecodedPairs(body)) {
    /* 既に復号済みのテキスト(本ツールの「復号テキスト」出力、または公式 KB の手順で
     * certutil / base64 -d した結果)はそのまま読む。値に `&` や改行を含み得るため、
     * 複数行なら改行のみ、1 行なら `&` のみで区切る。 */
    decoded = body;
    alreadyDecoded = true;
    notes.push('base64 ではなく、復号済みの key=value テキストとして読み込みました。');
  } else {
    throw new Error(
      'base64 として解釈できない文字を含みます。SonicOS の Settings Export(.exp)でも、' +
      'その復号済みテキスト(key=value の並び)でもないようです。',
    );
  }

  const pairs: ExpPair[] = [];
  const map: Record<string, string> = {};
  let percentDecodedCount = 0;
  let duplicateKeyCount = 0;
  const normalized = decoded.replace(/\r\n?/g, '\n');
  const segs = alreadyDecoded
    ? normalized.split(normalized.indexOf('\n') >= 0 ? '\n' : '&')
    : normalized.split(/[&\n]/);
  segs.forEach((seg) => {
    if (!seg.trim()) return;
    const eq = seg.indexOf('=');
    if (eq <= 0) { notes.push('"=" を含まない要素をスキップしました: ' + seg.slice(0, 60)); return; }
    const key = seg.slice(0, eq);
    const rawValue = seg.slice(eq + 1);
    const value = percentDecode(rawValue);
    if (value !== rawValue) percentDecodedCount++;
    if (Object.prototype.hasOwnProperty.call(map, key)) duplicateKeyCount++;
    map[key] = value;
    pairs.push({ key, value, rawValue });
  });
  if (!pairs.length) throw new Error('復号結果に設定変数(key=value)が含まれていません。');
  if (duplicateKeyCount) notes.push('重複するキーが ' + duplicateKeyCount + ' 件あり、後勝ちで採用しました。');

  return {
    pairs, map, notes,
    stats: { pairCount: pairs.length, percentDecodedCount, duplicateKeyCount, strippedTerminator, alreadyDecoded },
  };
}

/** 「復号済みテキスト」ダウンロード用: 1 行 1 変数(値は percent デコード済み)。 */
export function expToDecodedText(res: ExpDecodeResult): string {
  return res.pairs.map((p) => p.key + '=' + p.value).join('\n') + '\n';
}
