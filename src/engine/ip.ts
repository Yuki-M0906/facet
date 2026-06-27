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
