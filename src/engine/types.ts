/**
 * FACET 検証エンジン — 公開型定義
 *
 * 設計方針:
 * - DOM 非依存。React / window / document への参照禁止。
 * - パーサ AST は SonicWall と Cisco で共通の ParsedInterface を共有
 *   (どちらかにしかない field は optional 化)。
 * - Sprint 2 で機材カタログに capabilities を拡張する余地を残す
 *   (現在は ports / down / up / prefix / uplinkType の最小スキーマ)。
 */

/* ---- 基本列挙 ---- */
export type Vendor = 'SonicWall' | 'Cisco';
export type Role = 'router' | 'switch';
export type PortType = 'rj45' | 'sfp' | 'sfp+';
export type PortStatus = 'ok' | 'err' | 'lack' | 'idle';
export type TopoMode = 'star' | 'cascade' | 'manual';
export type Mode = 'verify' | 'build';
export type FindingLevel = 'err' | 'lack' | 'ok' | 'info';
export type FindingCategory = 'L1' | 'L2' | 'STP' | 'L3' | 'FW' | 'SEC' | 'CAP';
export type MatrixCell = 'ok' | 'deny' | 'nogw' | 'self';
export type HopStatus = 'ok' | 'deny' | 'info';
export type IfaceMode = 'access' | 'trunk' | 'vlan-subif';

/* ---- 機材カタログ ---- */

/** PoE 規格(802.3af = 15.4W, 802.3at = 30W = PoE+, 802.3bt = 60W/90W = PoE++) */
export type PoeClass = 'POE' | 'POE+' | 'POE++';

export interface PortSpec {
  label: string;            // 'X0', 'U1', '1', '24'
  iface: string;            // 'X0', 'GigabitEthernet1/0/1'
  type: PortType;
  speed: string;            // '1GbE', '2.5GbE', '10G' 等(数値整形に依存しないため string)
  poe?: PoeClass;           // ポート単体の PoE 給電クラス(該当ポートのみ)
}

/* ==== SonicWall ルータ capabilities ==== */
/* 出典は各 SKU の datasheet。catalog.ts のコメントに URL を明記する。 */
export interface RouterCapabilities {
  /** 対応 SonicOS メジャー版(空配列なら宣言なし) */
  osVersions: readonly string[];      // 例: ['SonicOS 7.x']
  /* スループット(datasheet 公称、Gbps) */
  firewallThroughputGbps?: number;    // Firewall inspection throughput
  threatPreventionGbps?: number;      // Threat Prevention (DPI on)
  ipsecVpnThroughputGbps?: number;
  /* 容量上限 */
  maxConcurrentSessions?: number;
  maxNewConnectionsPerSec?: number;
  maxSiteToSiteVpn?: number;
  maxSslVpnUsersBundled?: number;     // ライセンス付帯 SSL VPN ユーザ数
  maxVlanInterfaces?: number;         // サブインターフェイス数
  maxZones?: number;
  maxAddressObjects?: number;
  maxServiceObjects?: number;
  maxAccessRules?: number;
  maxNatPolicies?: number;
  /* 機能サポート */
  supportsBgp?: boolean;
  supportsOspf?: boolean;
  supportsSslVpn?: boolean;
  supportsHa?: boolean;
  supportsHaActiveActive?: boolean;
  supportsWifiCloud?: boolean;        // SonicWave/Wireless 統合管理
  poeTotalWatts?: number;             // 製品自体に PoE 出力があるなら(TZ シリーズの PoE+ モデル等)
}

export interface RouterCatalog {
  id: string;                         // 'TZ570'
  name: string;                       // 'SonicWall TZ570'
  vendor?: 'SonicWall';
  ports: PortSpec[];
  capabilities?: RouterCapabilities;
  /** datasheet 等の一次ソース URL(コメント用) */
  sourceUrls?: readonly string[];
}

/* ==== Cisco スイッチ capabilities ==== */
export type StpVariant = 'pvst' | 'rapid-pvst' | 'mst';
export type RoutingProtocol = 'static' | 'rip' | 'eigrp-stub' | 'eigrp' | 'ospf' | 'bgp';

export interface SwitchCapabilities {
  osVersions: readonly string[];      // 例: ['IOS-XE 17.x']
  /* レイヤサポート */
  l3Capable: boolean;                 // IP ルーティング/SVI が「使える」か(license 含む)
  routingProtocols?: readonly RoutingProtocol[];
  /* 容量上限(datasheet "Scale" セクション) */
  maxVlansSupported?: number;         // VLAN ID 数(activeでの数)
  maxStpInstances?: number;           // MST/PVST インスタンス数上限
  maxMacAddresses?: number;
  maxAclEntries?: number;             // ingress IPv4 ACL TCAM 想定
  maxSviCount?: number;
  maxRoutingEntries?: number;
  /* STP variant */
  stpVariants: readonly StpVariant[];
  /* リンクアグリゲーション / スタッキング */
  supportsLacp?: boolean;
  supportsPagp?: boolean;
  supportsStackwise?: boolean;
  stackwiseBandwidthGbps?: number;
  /* PoE(機種全体) */
  poeTotalWatts?: number;             // 総 PoE バジェット
  poePortsCount?: number;             // PoE 対応ポート数
  poeClass?: PoeClass;                // どの IEEE 規格まで(PoE / PoE+ / PoE++)
}

export interface SwitchCatalog {
  id: string;                         // 'C9300-24'
  name: string;
  vendor?: 'Cisco';
  down: number;                       // ダウンリンクポート数
  up: number;                         // アップリンクポート数
  prefix: string;                     // 'GigabitEthernet1/0/'
  uplinkType: 'sfp' | 'sfp+';
  capabilities?: SwitchCapabilities;
  sourceUrls?: readonly string[];
}

export interface Catalog {
  router: RouterCatalog[];
  switch: SwitchCatalog[];
}

/* ---- パーサ AST ---- */
export interface ChannelGroup {
  id: string;
  mode: string;             // 'active', 'passive', 'on', 'desirable', 'auto'
}

export interface SecondaryAddr {
  ip: string;
  mask: string;
}

/**
 * SonicWall と Cisco の両パーサが出力する interface AST の共通形。
 * どちらか一方でしか出ない field は optional / null 既定で扱う。
 */
export interface ParsedInterface {
  name: string;
  /* L1 共通 */
  ip: string | null;
  mask: string | null;
  description: string | null;
  shutdown: boolean;
  speed: string | null;
  duplex: string | null;
  mtu: string | null;
  /* L2 共通 */
  mode: IfaceMode | null;
  accessVlan: string | null;
  trunkNative: string | null;
  trunkAllowed: string[];
  /* Cisco 固有 */
  channel: ChannelGroup | null;
  sviVlan: string | null;
  secondary: SecondaryAddr[];
  portfast: boolean;
  bpduguard: boolean;
  aclIn: string | null;
  aclOut: string | null;
  standby: string | null;
  /* SonicWall 固有 */
  vlanTag: string | null;
  zone: string | null;
  /* mapToPorts() でのマージ結果 */
  subVlans?: string[];
}

/* ---- パーサ・カバレッジ(Sprint 3 P3-1) ----
 * 「投入したコンフィグのうち、パーサが何行を理解し、何行を無視したか」を可視化するための
 * 集計。parseCisco / parseSonicWall の両方が返す。空行は分母(totalLines)に含めない
 * (構造上の区切りであって「認識に失敗したコンテンツ」ではないため)。
 */
export interface ParseCoverage {
  totalLines: number;
  recognizedLines: number;
  unrecognizedLines: Array<{ lineNumber: number; text: string }>;
  coveragePercent: number;   // 0-100、totalLines=0 のときは 100
}

/* ---- プラットフォーム判別ヒント(Sprint 3 P3-2) ----
 * 投入された Cisco コンフィグのテキストに、選択機種の OS ファミリー
 * (catalog.ts の SwitchCapabilities.osVersions)と矛盾する構文シグナルが
 * 含まれていないかを検出する。あくまで「テキスト上の手がかり」であり、
 * 実機の OS を断定するものではない(FACET は静的解析ツールであり実機を検証できない)。
 *
 * 各シグナルの根拠(2026-07-04 時点でのウェブ調査、docs/PARSER-NOTES.md に詳細):
 * - nxos-*  : FACET のカタログに NX-OS 機器は存在しない。検出 = 対象外機種の
 *   コンフィグが投入された可能性が高い(高確信度、Cisco 公式ドキュメントで確認)。
 * - iosxe-* : Catalyst 9000 系(9200/9300)の Smart Licensing / install mode /
 *   platform(FED)固有の構文。IOS-XE を強く示唆する。
 * - ios-classic-* : 2960-X/1000 系の Right-To-Use ライセンス階層名
 *   (lanbase/lanlite/ipservices)。classic IOS を示唆する。
 *
 * SonicWall 側は SonicOS 6 と 7(Classic Mode)の CLI テキストに信頼できる判別法が
 * 見つからなかったため(公式リファレンスガイドがボット対策で取得不能、調査済)、
 * 本フィールドは Cisco 専用。SonicOS の非対応方言(Policy Mode 等)は
 * ParseCoverage の低い認識率として自然に可視化されるため、無理に判別ロジックを
 * 実装しない方針(FACET は確証の無い判定を主張しない)。
 */
export type PlatformSignal =
  | 'nxos-feature'
  | 'nxos-feature-set'
  | 'nxos-vdc'
  | 'nxos-mgmt0'
  | 'nxos-vrf-context'
  | 'nxos-boot'
  | 'iosxe-install-mode'
  | 'iosxe-license-tier'
  | 'iosxe-smart-licensing'
  | 'iosxe-platform-fed'
  | 'ios-classic-license-tier';

export interface PlatformHint {
  signals: Array<{ lineNumber: number; text: string; signal: PlatformSignal }>;
}

/* ---- SonicWall AST ---- */
export type AddressObject =
  | { type: 'host'; ip: string; zone: string | null }
  | { type: 'network'; cidr: string; zone: string | null }
  | { type: 'range'; from: string; to: string };

export interface ServiceObject {
  proto: string;
  from: number;
  to: number;
}

export interface AccessRule {
  from: string;
  to: string;
  action: string;           // 'allow' | 'deny' を主に想定。仕様変動を許容して string
  src: string;
  dst: string;
  service: string;
  enabled: boolean;
}

export interface NatPolicy {
  raw: string;
  orig: string | null;
  trans: string | null;
  iface: string | null;
}

export interface SonicWallSec {
  pingWanAllow: boolean;
  mgmtWanAllow: boolean;
}

export interface SonicWallParsed {
  hostname: string | null;
  vlans: Record<string, string>;
  interfaces: Record<string, ParsedInterface>;
  zonesByIf: Record<string, string>;
  rules: AccessRule[];
  nat: NatPolicy[];
  addr: Record<string, AddressObject>;
  svc: Record<string, ServiceObject>;
  dhcp: Array<{ from: string; to: string }>;
  routes: Array<{ dst: string; mask: string; nh: string }>;
  sec: SonicWallSec;
  coverage: ParseCoverage;
}

/* ---- Cisco AST ---- */
export interface AclLine {
  action: string;           // 'permit' | 'deny'
  rest: string;
}

export interface DhcpPool {
  network: string | null;   // 'a.b.c.0/24'
  gw: string | null;
}

export interface CiscoSec {
  telnet: boolean;
  sshOnly: boolean;
  enableSecret: boolean;
  enablePassword: boolean;
  snmpWeak: boolean;
  pwEncrypt: boolean;
}

export interface CiscoParsed {
  hostname: string | null;
  vlans: Record<string, string>;
  interfaces: Record<string, ParsedInterface>;
  svis: Record<string, { ip: string; mask: string | null }>;
  stpMode: string | null;
  /** `spanning-tree priority` / `spanning-tree vlan <list> priority` の値。
   * 未設定なら null(root election では IEEE/Cisco 既定値 32768 を適用する側で解釈する。
   * Sprint 4 S4-4)。 */
  stpPriority: number | null;
  defaultGw: string | null;
  routes: Array<{ dst: string; mask: string; nh: string }>;
  acls: Record<string, AclLine[]>;
  dhcp: Record<string, DhcpPool>;
  sec: CiscoSec;
  coverage: ParseCoverage;
  platformHint: PlatformHint;
}

/* ---- 実行時オブジェクト ---- */
export interface RuntimePort {
  label: string;
  iface: string;
  type: PortType;
  speed: string;
  poe?: PoeClass;
  status: PortStatus;
  cfg: ParsedInterface | null;
  msg: string | null;
}

export interface Device {
  key: string;              // 'R1', 'SW1'...
  role: Role;
  model: RouterCatalog | SwitchCatalog;
  name: string;
  unit?: number;            // switch unit number (R1 は 0 or 未設定)
  ports: RuntimePort[];
  config: string | null;
  parsed: CiscoParsed | SonicWallParsed | null;
}

export interface LinkEnd {
  key: string;
  iface: string;
}

export interface Link {
  a: LinkEnd;
  b: LinkEnd;
}

export interface AppState {
  router: Device;
  switches: Device[];
  devices: Device[];
  topoMode: TopoMode;
  links: Link[];
}

/* ---- 検証結果 ---- */
export interface Finding {
  cat: FindingCategory;
  level: FindingLevel;
  where: string;
  desc: string;
  why?: string;
  fix?: string;
}

export interface Subnet {
  vlan: string | null;
  cidr: string;
  gw: string;
  zone: string;
  dev: string;
  iface: string;
}

export interface BlockedPair {
  from: string;
  to: string;
  fromZone: string;
  toZone: string;
}

export interface ReachabilityMatrix {
  cells: Record<string, Record<string, MatrixCell>>;
  blocked: BlockedPair[];
  subnets: Subnet[];
}

export interface CategoryCount {
  err: number;
  lack: number;
}

export interface VerifyResult {
  findings: Finding[];
  subnets: Subnet[];
  matrix: ReachabilityMatrix;
  cats: Record<FindingCategory, CategoryCount>;
  loop: boolean;
  score: number;
  nErr: number;
  nLack: number;
}

export interface PathHop {
  node: string;             // 'SRC' | 'L2' | 'GW' | 'RT' | 'FW' | 'NAT' | 'DST' | '?'
  detail: string;
  status: HopStatus;
}

export interface PathTraceResult {
  ok: boolean;
  hops: PathHop[];
  verdict: 'ok' | 'deny';
  message?: string;
}

export interface EvalFWResult {
  action: string;           // 'allow' | 'deny'
  rule: AccessRule | null;
  reason: 'rule' | 'intra-zone' | 'default-deny' | 'default';
  index?: number;
}

/* ---- evalFW 内部 (service spec 解決) ---- */
export interface ResolvedSvc {
  proto: string | null;
  from: number | null;
  to: number | null;
}

/* ==========================================================================
 *  Builder(GUI 作成モード)— draft 型
 *
 *  設計方針: draft は「フォームで編集しやすい形」であって ParsedInterface と
 *  同一である必要はない。generateCiscoConfig / generateSonicWallConfig が
 *  draft → テキストに変換し、そのテキストを実際の parseCisco / parseSonicWall
 *  で読み戻して device.parsed を作る。これにより生成ロジックとパースロジックの
 *  二重管理を避け、「生成したものは必ず自分のパーサで読める」という往復保証が
 *  構造的に成立する。
 * ========================================================================== */

/* ---- Cisco Builder ---- */
export interface CiscoBuilderVlan {
  id: string;      // '10'
  name: string;    // 'STAFF'
}

export interface CiscoBuilderPort {
  iface: string;                       // device.ports[].iface と一致
  mode: IfaceMode | null;              // null = 未設定(config を出力しない)
  accessVlan: string | null;
  trunkNative: string | null;
  trunkAllowed: string[];
  portfast: boolean;
  bpduguard: boolean;
  shutdown: boolean;
  /** `ip access-group <name> in/out`。null = 未適用(Sprint 5 SF5-3、draft.acls の name を参照) */
  aclIn: string | null;
  aclOut: string | null;
}

export interface CiscoBuilderSvi {
  vlan: string;
  ip: string;
  mask: string;
}

export interface CiscoBuilderSecurity {
  sshOnly: boolean;       // true → transport input ssh
  enableSecret: boolean;  // true → enable secret 9 <placeholder>
  pwEncrypt: boolean;     // true → service password-encryption
}

/** 名前付き ACL(Sprint 5 SF5-3)。行の形は CiscoParsed.acls と同じ {action, rest} を再利用 */
export interface CiscoBuilderAcl {
  name: string;
  lines: AclLine[];
}

export interface CiscoBuilderDraft {
  hostname: string;
  stpMode: StpVariant | null;
  /** `spanning-tree priority`。null = 未設定(IEEE/Cisco 既定値 32768 が適用される。
   * Sprint 4 S4-4 の root election 推定と対応)。 */
  stpPriority: number | null;
  vlans: CiscoBuilderVlan[];
  ports: CiscoBuilderPort[];
  svis: CiscoBuilderSvi[];
  acls: CiscoBuilderAcl[];
  security: CiscoBuilderSecurity;
}

/* ---- SonicWall Builder ---- */
export interface SonicWallBuilderVlanSub {
  vlanTag: string;
  zone: string;
  ip: string;
  mask: string;
  comment: string;
}

export interface SonicWallBuilderInterface {
  iface: string;                          // device.ports[].iface と一致(X0 等)
  enabled: boolean;
  zone: string;
  ip: string;
  mask: string;
  comment: string;
  vlanSubs: SonicWallBuilderVlanSub[];
}

export interface SonicWallBuilderAddrObj {
  name: string;
  type: 'host' | 'network';
  ip: string;        // host: このIP / network: ネットワークアドレス
  mask: string;       // network のときのみ使用
  zone: string;
}

export interface SonicWallBuilderSvcObj {
  name: string;
  proto: string;      // 'tcp' | 'udp' | 'icmp' 等
  from: string;
  to: string;
}

export interface SonicWallBuilderRule {
  from: string;
  to: string;
  action: 'allow' | 'deny';
  src: string;
  dst: string;
  service: string;
  enabled: boolean;
}

export interface SonicWallBuilderNat {
  orig: string;
  trans: string;
  iface: string;
}

export interface SonicWallBuilderDraft {
  hostname: string;
  interfaces: SonicWallBuilderInterface[];
  addressObjects: SonicWallBuilderAddrObj[];
  serviceObjects: SonicWallBuilderSvcObj[];
  rules: SonicWallBuilderRule[];
  natPolicies: SonicWallBuilderNat[];
}

export type BuilderDraft = CiscoBuilderDraft | SonicWallBuilderDraft;
