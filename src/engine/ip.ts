/**
 * IPv4 アドレス操作の純関数群。
 * 元: src/facet-core.js (legacy) の ipToInt / intToIp / maskBits / bitsToMaskInt / subnetOf / inSubnet。
 * ロジックは無変更。
 */

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function maskBits(mask: string): number {
  return mask.split('.').reduce(
    (a, o) => a + ((Number(o).toString(2).match(/1/g) || []).length),
    0,
  );
}

export function bitsToMaskInt(b: number): number {
  return b === 0 ? 0 : ((0xffffffff << (32 - b)) >>> 0);
}

export function subnetOf(ip: string, mask: string): string {
  const net = (ipToInt(ip) & ipToInt(mask)) >>> 0;
  return intToIp(net) + '/' + maskBits(mask);
}

export function inSubnet(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;
  const p = cidr.split('/');
  const net = ipToInt(p[0]!);
  const m = bitsToMaskInt(Number(p[1]));
  return ((ipToInt(ip) & m) >>> 0) === ((net & m) >>> 0);
}

/**
 * サブネット内の「代表ホストIP」(ゲートウェイそのものではなく、実際の端末を
 * 模した1台を代表させる)。全機能監査 Medium-8 対応: 以前は buildMatrix.ts が
 * ゲートウェイIPそのものを、pathTrace.ts がネットワークアドレス+20オフセットを
 * それぞれ独立に計算しており、宛先を特定ホストで絞るFWルールがある構成では
 * マトリクス表示と経路トレース結果が食い違いうる不整合があった。両者から
 * 共通してこの関数を使うことで統一する。
 * 小サブネット(/28 以下、ホストビット4未満)ではオフセット20がサブネット範囲を
 * 越えうるため、その場合はネットワークアドレス+1にフォールバックする。
 */
export function representativeHostIp(cidr: string, gw: string): string {
  const bits = Number(cidr.split('/')[1]);
  const hostBits = 32 - bits;
  if (hostBits === 0) return gw;   // /32: ホストビットが無くオフセットの余地がない
  const offset = hostBits >= 5 ? 20 : 1;
  const netInt = (ipToInt(gw) & bitsToMaskInt(bits)) >>> 0;
  return intToIp(netInt + offset);
}
