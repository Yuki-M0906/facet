/**
 * 機材カタログ — v4.0.0 から SKU 別の正確な物理仕様 + capabilities を持つ。
 *
 * 元: src/facet-core.js (legacy) の CATALOG / rrow / rrj / rsfp / switchPorts。
 * 出典: 各 SKU のコメント `sourceUrls` 参照(主に SonicWall datasheet と Cisco datasheet)。
 *
 * 設計方針:
 * - 数値は datasheet 公称値。実機ベンチ値ではない。
 * - 利用ライセンス(SonicOS の AGSS / Cisco の Network Essentials/Advantage)で機能差が
 *   あるが、本カタログは「最大グレード(SonicWall = AGSS、Cisco = Network Advantage)」
 *   を前提に capabilities を埋める。CAP 検証ルールはこの最大値に対する超過を検出する。
 * - v3.1.0 との互換性(iface 命名規則、port label 体系)は維持。
 *   ただし v3.1.0 で誤っていた TZ370/470/570/670 の RJ45 速度を datasheet 準拠に修正:
 *     旧: TZ370 = 8×1GbE(SFP+ 無し)
 *     新: TZ370 = 8×1GbE RJ45 + 2×2.5G SFP+
 *     旧: TZ470 = 8×2.5GbE RJ45
 *     新: TZ470 = 8×1GbE RJ45 + 2×2.5G SFP+
 *     旧: TZ570 = 8×2.5GbE RJ45 + 2×SFP+
 *     新: TZ570 = 8×1GbE RJ45 + 2×5G SFP+
 *     旧: TZ670 = 8×2.5GbE RJ45 + 2×SFP+
 *     新: TZ670 = 8×1GbE RJ45 + 2×10G SFP+
 */

import type {
  Catalog,
  PortSpec,
  PortType,
  RouterCapabilities,
  SwitchCapabilities,
  SwitchCatalog,
} from './types';

/* ---- ヘルパ ---- */

function rrow(n: number, t: PortType, s: string): PortSpec[] {
  const a: PortSpec[] = [];
  for (let i = 0; i < n; i++) a.push({ label: 'X' + i, type: t, speed: s, iface: 'X' + i });
  return a;
}
function rsfp(st: number, n: number, s: string): PortSpec[] {
  const a: PortSpec[] = [];
  for (let i = 0; i < n; i++) a.push({ label: 'X' + (st + i), type: 'sfp+', speed: s, iface: 'X' + (st + i) });
  return a;
}
function rrj(st: number, n: number, s: string): PortSpec[] {
  const a: PortSpec[] = [];
  for (let i = 0; i < n; i++) a.push({ label: 'X' + (st + i), type: 'rj45', speed: s, iface: 'X' + (st + i) });
  return a;
}

export function switchPorts(m: SwitchCatalog): PortSpec[] {
  const p: PortSpec[] = [];
  const downSpeed: string = '1GbE';
  /* PoE 対応ポートは capabilities.poePortsCount にしたがって先頭から付与する */
  const poePortsCount = m.capabilities?.poePortsCount ?? 0;
  const poeClass = m.capabilities?.poeClass;
  for (let i = 1; i <= m.down; i++) {
    const port: PortSpec = {
      label: String(i), type: 'rj45', speed: downSpeed,
      iface: m.prefix + i,
    };
    if (i <= poePortsCount && poeClass) port.poe = poeClass;
    p.push(port);
  }
  for (let i = 1; i <= m.up; i++) {
    p.push({
      label: 'U' + i,
      type: m.uplinkType,
      speed: m.uplinkType === 'sfp+' ? '10G' : '1G',
      iface: (m.uplinkType === 'sfp+' ? 'TenGigabitEthernet1/1/' : 'GigabitEthernet1/1/') + i,
    });
  }
  return p;
}

/* ==========================================================================
 *  SonicWall (Gen 7) Routers
 *  出典: SonicWall Gen 7 TZ Series Datasheet および sonicguard.com 製品ページ
 *  全 SKU で SonicOS 7.x を前提。BGP/OSPF は TZ 系では非対応(NSa 系で対応)。
 * ========================================================================== */

const SONICOS_7: readonly string[] = ['SonicOS 7.x'];

/* TZ 系で共通する capabilities ベース */
function tzBase(): Partial<RouterCapabilities> {
  return {
    osVersions: SONICOS_7,
    /* TZ 系の access-rule 数や address-object 数の datasheet 公称は明示が乏しいため、
       未確定値は埋めない(undefined のまま)。CAP 検証は値ありの項目のみ検査する。 */
    supportsBgp: false,
    supportsOspf: false,
    supportsSslVpn: true,
    supportsHa: true,
    supportsHaActiveActive: false,
    supportsWifiCloud: true,
  };
}

/* NSa 系で共通する capabilities ベース(ダイナミックルーティング全対応) */
function nsaBase(): Partial<RouterCapabilities> {
  return {
    osVersions: SONICOS_7,
    supportsBgp: true,
    supportsOspf: true,
    supportsSslVpn: true,
    supportsHa: true,
    supportsHaActiveActive: true,
    supportsWifiCloud: true,
  };
}

const TZ_DATASHEET_URL = 'https://www.sonicwall.com/resources/datasheet/sonicwall-gen-7-tz-series';
const NSA_DATASHEET_URL = 'https://www.sonicwall.com/resources/datasheet/sonicwall-gen-7-nsa-series';

/* ==========================================================================
 *  Cisco Catalyst Switches
 *  出典: Cisco Catalyst 公式 Series Data Sheet
 *  ライセンスは Network Advantage 相当(Cat 1000 は LAN Lite/Base のみ)を前提。
 * ========================================================================== */

const IOS_15_2: readonly string[] = ['IOS 15.2.7Ex'];
const IOS_XE_17: readonly string[] = ['IOS-XE 17.x'];
const STP_FULL: readonly ('pvst' | 'rapid-pvst' | 'mst')[] = ['pvst', 'rapid-pvst', 'mst'];

const C1000_URL = 'https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-1000-series-switches/nb-06-cat1k-ser-switch-ds-cte-en.html';
const C2960X_URL = 'https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-2960-x-series-switches/datasheet_c78-728232.html';
const C9200_URL = 'https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9200-series-switches/nb-06-cat9200-ser-data-sheet-cte-en.html';
const C9300_URL = 'https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html';

/* ==========================================================================
 *  CATALOG 本体
 * ========================================================================== */

export const CATALOG: Catalog = {
  router: [
    {
      id: 'TZ270', name: 'SonicWall TZ270',
      vendor: 'SonicWall',
      sourceUrls: [TZ_DATASHEET_URL],
      ports: rrow(8, 'rj45', '1GbE'),
      capabilities: {
        ...tzBase(),
        firewallThroughputGbps: 2.0,
        threatPreventionGbps: 0.75,
        ipsecVpnThroughputGbps: 0.75,
        maxConcurrentSessions: 750_000,
        maxNewConnectionsPerSec: 6_000,
        maxSiteToSiteVpn: 50,
        maxSslVpnUsersBundled: 1,    // SSL VPN ライセンス 1 同梱、最大 50
        maxVlanInterfaces: 64,
      } as RouterCapabilities,
    },
    {
      id: 'TZ370', name: 'SonicWall TZ370',
      vendor: 'SonicWall',
      sourceUrls: [TZ_DATASHEET_URL],
      /* v3.1.0 catalog では 8×1GbE のみだったが、datasheet 通り 2×2.5G SFP+ を追加 */
      ports: rrow(8, 'rj45', '1GbE').concat(rsfp(8, 2, '2.5G')),
      capabilities: {
        ...tzBase(),
        firewallThroughputGbps: 3.0,
        threatPreventionGbps: 1.0,
        ipsecVpnThroughputGbps: 1.38,
        maxConcurrentSessions: 900_000,
        maxNewConnectionsPerSec: 9_000,
        maxSiteToSiteVpn: 100,
        maxSslVpnUsersBundled: 2,
        maxVlanInterfaces: 128,
      } as RouterCapabilities,
    },
    {
      id: 'TZ470', name: 'SonicWall TZ470',
      vendor: 'SonicWall',
      sourceUrls: [TZ_DATASHEET_URL],
      /* v3.1.0 では 8×2.5GbE RJ45 になっていたが、実機は 8×1GbE RJ45 + 2×2.5G SFP+ */
      ports: rrow(8, 'rj45', '1GbE').concat(rsfp(8, 2, '2.5G')),
      capabilities: {
        ...tzBase(),
        firewallThroughputGbps: 3.5,
        threatPreventionGbps: 1.5,
        ipsecVpnThroughputGbps: 1.5,
        maxConcurrentSessions: 1_000_000,
        maxNewConnectionsPerSec: 12_000,
        maxSiteToSiteVpn: 150,
        maxSslVpnUsersBundled: 2,
        maxVlanInterfaces: 128,
      } as RouterCapabilities,
    },
    {
      id: 'TZ570', name: 'SonicWall TZ570',
      vendor: 'SonicWall',
      sourceUrls: [TZ_DATASHEET_URL],
      /* v3.1.0 では 8×2.5GbE RJ45 になっていたが、実機は 8×1GbE RJ45 + 2×5G SFP+ */
      ports: rrow(8, 'rj45', '1GbE').concat(rsfp(8, 2, '5G')),
      capabilities: {
        ...tzBase(),
        firewallThroughputGbps: 4.0,
        threatPreventionGbps: 2.0,
        ipsecVpnThroughputGbps: 1.8,
        maxConcurrentSessions: 1_250_000,
        maxNewConnectionsPerSec: 16_000,
        maxSiteToSiteVpn: 200,
        maxSslVpnUsersBundled: 2,
        maxVlanInterfaces: 256,
      } as RouterCapabilities,
    },
    {
      id: 'TZ670', name: 'SonicWall TZ670',
      vendor: 'SonicWall',
      sourceUrls: [TZ_DATASHEET_URL],
      /* v3.1.0 では 8×2.5GbE RJ45 になっていたが、実機は 8×1GbE RJ45 + 2×10G SFP+ */
      ports: rrow(8, 'rj45', '1GbE').concat(rsfp(8, 2, '10G')),
      capabilities: {
        ...tzBase(),
        firewallThroughputGbps: 5.0,
        threatPreventionGbps: 2.5,
        ipsecVpnThroughputGbps: 2.1,
        maxConcurrentSessions: 1_500_000,
        maxNewConnectionsPerSec: 25_000,
        maxSiteToSiteVpn: 250,
        maxSslVpnUsersBundled: 2,
        maxVlanInterfaces: 256,
      } as RouterCapabilities,
    },
    {
      id: 'NSa2700', name: 'SonicWall NSa 2700',
      vendor: 'SonicWall',
      sourceUrls: [NSA_DATASHEET_URL],
      /* NSa 2700 は 16×1GbE RJ45 + 3×10G SFP+(v3.1.0 catalog は近似だったため精度向上) */
      ports: rrow(8, 'rj45', '1GbE')
        .concat(rrj(8, 8, '1GbE'))      // 9〜16 番目の 1GbE RJ45
        .concat(rsfp(16, 3, '10G')),    // X16,X17,X18 の 10G SFP+
      capabilities: {
        ...nsaBase(),
        firewallThroughputGbps: 5.5,
        threatPreventionGbps: 3.0,
        ipsecVpnThroughputGbps: 2.1,
        maxConcurrentSessions: 1_500_000,
        maxNewConnectionsPerSec: 21_500,
        maxSiteToSiteVpn: 250,
        maxVlanInterfaces: 256,
      } as RouterCapabilities,
    },
    {
      id: 'NSa3700', name: 'SonicWall NSa 3700',
      vendor: 'SonicWall',
      sourceUrls: [NSA_DATASHEET_URL],
      /* NSa 3700 は 24×1GbE RJ45 + 4×5G SFP+ + 6×10G SFP+(計 34 ポート) */
      ports: rrow(8, 'rj45', '1GbE')
        .concat(rrj(8, 16, '1GbE'))      // 計 24×1GbE RJ45
        .concat(rsfp(24, 4, '5G'))       // 5G SFP+
        .concat(rsfp(28, 6, '10G')),     // 10G SFP+
      capabilities: {
        ...nsaBase(),
        firewallThroughputGbps: 5.5,
        threatPreventionGbps: 3.5,
        ipsecVpnThroughputGbps: 2.2,
        maxConcurrentSessions: 2_000_000,
        maxNewConnectionsPerSec: 22_500,
        maxSiteToSiteVpn: 3_000,
        maxVlanInterfaces: 256,
      } as RouterCapabilities,
    },
  ],

  switch: [
    /* ==================================================================
     *  Catalyst 1000 — L2 のみ、static + RIP まで。LAN Lite ライセンス。
     *  IOS 15.2.7Ex、StackWise 非対応、PoE は P バリアント。
     * ================================================================== */
    {
      id: 'C1000-24', name: 'Catalyst 1000-24T',
      vendor: 'Cisco',
      sourceUrls: [C1000_URL],
      down: 24, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp',
      capabilities: {
        osVersions: IOS_15_2,
        l3Capable: true,           // SVI + 静的経路 + RIP まで(限定的)
        routingProtocols: ['static', 'rip'],
        maxVlansSupported: 64,     // datasheet "Maximum number of active VLANs: 64"
        maxStpInstances: 64,
        maxMacAddresses: 8_000,
        maxAclEntries: 1_000,
        maxSviCount: 16,
        maxRoutingEntries: 64,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: false,       // Cat 1000 は PAgP 非対応(LACP のみ)
        supportsStackwise: false,
      } as SwitchCapabilities,
    },
    {
      id: 'C1000-48', name: 'Catalyst 1000-48T',
      vendor: 'Cisco',
      sourceUrls: [C1000_URL],
      down: 48, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp',
      capabilities: {
        osVersions: IOS_15_2,
        l3Capable: true,
        routingProtocols: ['static', 'rip'],
        maxVlansSupported: 64,
        maxStpInstances: 64,
        maxMacAddresses: 8_000,
        maxAclEntries: 1_000,
        maxSviCount: 16,
        maxRoutingEntries: 64,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: false,
        supportsStackwise: false,
      } as SwitchCapabilities,
    },

    /* ==================================================================
     *  Catalyst 2960-X — L2 with limited L3 (RIP/OSPF for Routed Access)。
     *  LAN Base、IOS 15.x。FlexStack-Plus 80 Gbps(別売モジュール)。
     *  EOL 製品だが現場残存のため維持。
     * ================================================================== */
    {
      id: 'C2960X-24', name: 'Catalyst 2960-X 24',
      vendor: 'Cisco',
      sourceUrls: [C2960X_URL],
      down: 24, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp',
      capabilities: {
        osVersions: ['IOS 15.2(x)'],
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'eigrp-stub', 'ospf'], // OSPF は "for Routed Access"
        maxVlansSupported: 1_023,
        maxStpInstances: 128,
        maxMacAddresses: 16_000,
        maxAclEntries: 1_500,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,     // FlexStack-Plus
        stackwiseBandwidthGbps: 80,
      } as SwitchCapabilities,
    },
    {
      id: 'C2960X-48', name: 'Catalyst 2960-X 48',
      vendor: 'Cisco',
      sourceUrls: [C2960X_URL],
      down: 48, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp',
      capabilities: {
        osVersions: ['IOS 15.2(x)'],
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'eigrp-stub', 'ospf'],
        maxVlansSupported: 1_023,
        maxStpInstances: 128,
        maxMacAddresses: 16_000,
        maxAclEntries: 1_500,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,
        stackwiseBandwidthGbps: 80,
      } as SwitchCapabilities,
    },

    /* ==================================================================
     *  Catalyst 9200 — IOS-XE、L3 完全対応(Network Advantage)。
     *  9200(非 L)は MAC 32K、9200L は MAC 16K。SKU の "P" は PoE+。
     *  StackWise-160(160 Gbps)。
     * ================================================================== */
    {
      id: 'C9200-24', name: 'Catalyst 9200-24P',
      vendor: 'Cisco',
      sourceUrls: [C9200_URL],
      down: 24, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp+',
      capabilities: {
        osVersions: IOS_XE_17,
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'ospf', 'eigrp', 'bgp'],
        maxVlansSupported: 4_094,
        maxStpInstances: 128,       // PVST/RPVST 上限
        maxMacAddresses: 32_000,
        maxAclEntries: 5_000,
        maxSviCount: 256,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,
        stackwiseBandwidthGbps: 160,
        poeTotalWatts: 600,         // PoE+ バジェット(代表値、PSU 構成で可変)
        poePortsCount: 24,
        poeClass: 'POE+',
      } as SwitchCapabilities,
    },
    {
      id: 'C9200-48', name: 'Catalyst 9200-48P',
      vendor: 'Cisco',
      sourceUrls: [C9200_URL],
      down: 48, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp+',
      capabilities: {
        osVersions: IOS_XE_17,
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'ospf', 'eigrp', 'bgp'],
        maxVlansSupported: 4_094,
        maxStpInstances: 128,
        maxMacAddresses: 32_000,
        maxAclEntries: 5_000,
        maxSviCount: 256,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,
        stackwiseBandwidthGbps: 160,
        poeTotalWatts: 740,
        poePortsCount: 48,
        poeClass: 'POE+',
      } as SwitchCapabilities,
    },

    /* ==================================================================
     *  Catalyst 9300 — IOS-XE、フラッグシップ。L3 完全対応 + IS-IS。
     *  MAC 32K(EM)、ACL TCAM 5120、StackWise-480(480 Gbps)。
     *  StackPower、UPoE/UPoE+ 対応(SKU 別)。
     *  -24P/-48P は標準 PoE+(802.3at)。-24U/-48U が UPoE。
     * ================================================================== */
    {
      id: 'C9300-24', name: 'Catalyst 9300-24P',
      vendor: 'Cisco',
      sourceUrls: [C9300_URL],
      down: 24, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp+',
      capabilities: {
        osVersions: IOS_XE_17,
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'ospf', 'eigrp', 'bgp'],
        maxVlansSupported: 4_094,
        maxStpInstances: 128,
        maxMacAddresses: 32_000,
        maxAclEntries: 5_120,
        maxSviCount: 1_000,
        maxRoutingEntries: 32_000,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,
        stackwiseBandwidthGbps: 480,
        poeTotalWatts: 445,         // 715W PSU、PoE バジェット 445W
        poePortsCount: 24,
        poeClass: 'POE+',
      } as SwitchCapabilities,
    },
    {
      id: 'C9300-48', name: 'Catalyst 9300-48P',
      vendor: 'Cisco',
      sourceUrls: [C9300_URL],
      down: 48, up: 4,
      prefix: 'GigabitEthernet1/0/',
      uplinkType: 'sfp+',
      capabilities: {
        osVersions: IOS_XE_17,
        l3Capable: true,
        routingProtocols: ['static', 'rip', 'ospf', 'eigrp', 'bgp'],
        maxVlansSupported: 4_094,
        maxStpInstances: 128,
        maxMacAddresses: 32_000,
        maxAclEntries: 5_120,
        maxSviCount: 1_000,
        maxRoutingEntries: 32_000,
        stpVariants: STP_FULL,
        supportsLacp: true,
        supportsPagp: true,
        supportsStackwise: true,
        stackwiseBandwidthGbps: 480,
        poeTotalWatts: 437,         // 715W PSU、PoE バジェット 437W
        poePortsCount: 48,
        poeClass: 'POE+',
      } as SwitchCapabilities,
    },
  ],
};
