/**
 * インターフェイス名の正規化と VLAN / IF レンジ展開。
 * 元: src/facet-core.js (legacy) の canonIf / expandVlans / expandIfRange / uniq。
 * ロジックは無変更。
 */

/**
 * インターフェイス名を正規化する。
 * - SonicWall: `X0`, `X0:V10` のような名前は `:V<n>` を剥がして大文字化。
 * - Cisco: `Gi1/0/1` `GigabitEthernet1/0/1` `TenGigabitEthernet1/1/1` のような名前は
 *   末尾の階層数値 (`N/M/L` or `N/M`) を取り出し `P` プレフィックスを付けて正規化。
 * - これにより `X0:V10` と `X0`、`Gi1/1/1` と `TenGigabitEthernet1/1/1` が同じ物理ポートに対応付く。
 */
export function canonIf(name: string): string {
  if (/^X\d/i.test(name)) return name.replace(/:?V\d+$/i, '').toUpperCase();
  const m = name.match(/(\d+\/\d+\/\d+|\d+\/\d+)\s*$/);
  return m ? 'P' + m[1] : name.toUpperCase();
}

/**
 * VLAN リスト記法をフラットな配列に展開する。
 *   '10'        -> ['10']
 *   '10,20-22'  -> ['10','20','21','22']
 */
export function expandVlans(str: string | number): string[] {
  const out: string[] = [];
  String(str).split(',').forEach((part) => {
    const r = part.match(/(\d+)\s*-\s*(\d+)/);
    if (r) {
      for (let i = Number(r[1]); i <= Number(r[2]); i++) out.push(String(i));
    } else if (/^\d+$/.test(part.trim())) {
      out.push(part.trim());
    }
  });
  return out;
}

/**
 * IOS の `interface range` 記法を展開する。
 *   'GigabitEthernet1/0/1 - 4'                 -> ['GigabitEthernet1/0/1', ..., 'GigabitEthernet1/0/4']
 *   'Gi1/0/1-3, Gi1/0/8'                       -> ['Gi1/0/1','Gi1/0/2','Gi1/0/3','Gi1/0/8']
 *   '1-5' (prefix が与えられている場合)         -> [<prefix>+'1', ..., <prefix>+'5']
 */
export function expandIfRange(spec: string, prefix?: string): string[] {
  const out: string[] = [];
  spec.split(',').forEach((rawSeg) => {
    const seg = rawSeg.trim();
    const m =
      seg.match(/^(\D*?)(\d+\/\d+\/)(\d+)\s*-\s*(\d+)$/) ||
      seg.match(/^(\D*?)(\d+\/)(\d+)\s*-\s*(\d+)$/);
    if (m) {
      for (let i = Number(m[3]); i <= Number(m[4]); i++) out.push((prefix || (m[1] + m[2])) + i);
      return;
    }
    const s = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (s && prefix) {
      for (let j = Number(s[1]); j <= Number(s[2]); j++) out.push(prefix + j);
      return;
    }
    if (seg) out.push(seg);
  });
  return out;
}

/** 配列から重複を除去(順序保持) */
export function uniq<T>(a: T[]): T[] {
  return a.filter((v, i) => a.indexOf(v) === i);
}
