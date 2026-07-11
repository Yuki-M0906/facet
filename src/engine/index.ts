/**
 * FACET 検証エンジン — 公開 API。
 * UI 側からは必ずこのファイル経由でアクセスすること。
 * src/engine 内部のファイルを直接 import しないこと(モジュール境界違反)。
 */

export type * from './types';

export { CATALOG, switchPorts } from './catalog';

export { ipToInt, intToIp, maskBits, bitsToMaskInt, subnetOf, inSubnet } from './ip';
export { canonIf, expandVlans, expandIfRange, uniq } from './canonIf';

export { parseCisco } from './parsers/cisco';
export { parseSonicWall } from './parsers/sonicwall';

export { generateCiscoConfig, isCiscoPortConfigured } from './generators/cisco';
export { generateSonicWallConfig } from './generators/sonicwall';

export { mapToPorts } from './mapToPorts';
export { buildSubnets } from './buildSubnets';
export { WELL_KNOWN_SVC, resolveSvc, svcMatch, objContains, evalFW } from './evalFW';
export { buildMatrix } from './buildMatrix';
export { pathTrace } from './pathTrace';
export { verify } from './verify';
export { autoLinks } from './autoLinks';
