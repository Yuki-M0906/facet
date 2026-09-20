/**
 * SonicWall `.exp`(復号済み key=value 変数群)→ 構造化モデル → FACET 可読 CLI テキスト /
 * Excel 用シート、の変換器。
 *
 * 変数名・列挙値の根拠(推測ではなく公開実装と実物サンプルで確認したもの):
 *  - インターフェイス: iface_ifnum_N / iface_name_N / iface_phys_type_N(0=物理, 2=VLAN)/
 *    interface_Zone_N / iface_comment_N / iface_lan_ip_N / iface_lan_mask_N /
 *    iface_static_ip_N / iface_static_mask_N / iface_static_gateway_N / iface_vlan_tag_N /
 *    iface_vlan_parent_N / iface_dhcp_enable_N / iface_port_disabled_N / portShutdown_N /
 *    iface_https_mgmt_N / iface_http_mgmt_N / iface_ssh_mgmt_N / iface_ping_mgmt_N /
 *    iface_snmp_mgmt_N / eth_mtu_N。N はスロット番号で連番ではない(0,1,18,19 …)。
 *  - アドレスオブジェクト: addrObjId_N(名前)/ addrObjType_N(1=host, 2=range, 4=network,
 *    8=group)/ addrObjZone_N / addrObjIp1_N / addrObjIp2_N(network ではマスク、range では終端)。
 *    グループ所属: addro_atomToGrp_N(メンバー)= addro_grpToGrp_N(グループ)。
 *  - サービス: svcObjId_N / svcObjType_N(1=object, 2=group)/ svcObjIpType_N(6=tcp, 17=udp,
 *    1=icmp)/ svcObjPort1_N / svcObjPort2_N。グループ所属: so_atomToGrp_N / so_grpToGrp_N。
 *  - アクセスルール: policyAction_N(2=allow。1/0 は deny/discard で、公開実装間で 1 と 0 の
 *    割り当てが食い違うため本ツールでは「2 以外は遮断」とだけ解釈し、生の値を Excel に残す)/
 *    policySrcZone_N / policyDstZone_N / policySrcNet_N / policyDstNet_N / policyDstSvc_N
 *    (空文字 = any)/ policyEnabled_N / policyComment_N。
 *  - NAT: natPolicyOrigSrc_N / OrigDst / OrigSvc / TransSrc / TransDst / TransSvc(空 = any /
 *    original)/ natPolicySrcIface_N / natPolicyDstIface_N(iface_ifnum の値、-1 = any)/
 *    natPolicyEnabled_N / natPolicyComment_N。
 *  - ゾーン: zoneObjId_N / zoneObjZoneType_N。DHCP: prefs_dhdynIpStart_N / IpEnd / Gateway /
 *    Mask / dns0..2 / domainname / LeaseTime / Enable / Comment。
 *  - 機器情報: shortProdName / buildNum。
 * 静的ルート(route-policy 相当)は `.exp` 側のキー名を確認できていないため変換しない(注記に出す)。
 *
 * CLI テキストへの変換方針: FACET の parseSonicWall が読める構文だけを出力し、読めない
 * もの(アドレス/サービスグループ、FQDN、無効化された NAT など)は「省略した項目」として
 * 明示する。名前にスペースを含むオブジェクトは `"…"` で引用する(parseSonicWall 側が対応)。
 */

import type { XlsxSheet } from './xlsx';
import type { ExpDecodeResult } from './expDecode';

export interface ExpInterface {
  slot: number;
  ifnum: string;
  name: string;
  zone: string;
  comment: string;
  physType: number;
  lanIp: string;
  lanMask: string;
  staticIp: string;
  staticMask: string;
  staticGw: string;
  vlanTag: number;
  vlanParent: string;
  dhcpEnabled: boolean;
  portDisabled: boolean;
  mgmt: { https: boolean; http: boolean; ssh: boolean; ping: boolean; snmp: boolean };
  mtu: string;
}
export interface ExpAddrObj { index: number; name: string; type: number; typeLabel: string; zone: string; ip1: string; ip2: string }
export interface ExpGroup { name: string; members: string[] }
export interface ExpSvcObj { index: number; name: string; type: number; ipType: number; proto: string; port1: number; port2: number }
export interface ExpPolicy {
  index: number; action: number; actionLabel: string; srcZone: string; dstZone: string;
  srcNet: string; dstNet: string; dstSvc: string; enabled: boolean; comment: string;
}
export interface ExpNat {
  index: number; origSrc: string; origDst: string; origSvc: string; transSrc: string; transDst: string;
  transSvc: string; srcIface: string; dstIface: string; srcIfaceName: string; dstIfaceName: string;
  enabled: boolean; comment: string;
}
export interface ExpDhcpScope {
  index: number; ipStart: string; ipEnd: string; gateway: string; mask: string;
  dns: string[]; domain: string; leaseTime: string; enabled: boolean; comment: string;
}
export interface ExpZone { index: number; name: string; zoneType: string }

export interface ExpModel {
  product: string;
  buildNum: string;
  hostname: string;
  interfaces: ExpInterface[];
  zones: ExpZone[];
  addrObjs: ExpAddrObj[];
  addrGroups: ExpGroup[];
  svcObjs: ExpSvcObj[];
  svcGroups: ExpGroup[];
  policies: ExpPolicy[];
  nats: ExpNat[];
  dhcpScopes: ExpDhcpScope[];
  /** 変換上の注記(値が読めなかった、未対応など) */
  warnings: string[];
}

const ZERO_IP = '0.0.0.0';
const isOn = (v: string | undefined): boolean => v === '1' || v === 'on' || v === 'true';
const nz = (v: string | undefined): string => (v && v !== ZERO_IP ? v : '');

function indicesOf(map: Record<string, string>, prefix: string): number[] {
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  const out: number[] = [];
  Object.keys(map).forEach((k) => { const m = k.match(re); if (m) out.push(Number(m[1])); });
  return out.sort((a, b) => a - b);
}
const g = (map: Record<string, string>, k: string): string => map[k] ?? '';

function groupsOf(map: Record<string, string>, atomPrefix: string, grpPrefix: string): ExpGroup[] {
  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  indicesOf(map, atomPrefix).forEach((i) => {
    const member = g(map, atomPrefix + i);
    const grp = g(map, grpPrefix + i);
    if (!grp) return;
    if (!groups[grp]) { groups[grp] = []; order.push(grp); }
    if (member) groups[grp]!.push(member);
  });
  return order.map((name) => ({ name, members: groups[name]! }));
}

export function extractExpModel(map: Record<string, string>): ExpModel {
  const warnings: string[] = [];

  const interfaces: ExpInterface[] = indicesOf(map, 'iface_name_').map((slot) => {
    const p = (k: string) => g(map, k + '_' + slot);
    return {
      slot,
      ifnum: p('iface_ifnum') || String(slot),
      name: p('iface_name'),
      zone: p('interface_Zone'),
      comment: p('iface_comment'),
      physType: Number(p('iface_phys_type') || '0'),
      lanIp: nz(p('iface_lan_ip')),
      lanMask: p('iface_lan_mask'),
      staticIp: nz(p('iface_static_ip')),
      staticMask: p('iface_static_mask'),
      staticGw: nz(p('iface_static_gateway')),
      vlanTag: Number(p('iface_vlan_tag') || '0'),
      vlanParent: p('iface_vlan_parent'),
      dhcpEnabled: isOn(p('iface_dhcp_enable')),
      portDisabled: isOn(p('iface_port_disabled')) || isOn(p('portShutdown')),
      mgmt: {
        https: isOn(p('iface_https_mgmt')), http: isOn(p('iface_http_mgmt')),
        ssh: isOn(p('iface_ssh_mgmt')), ping: isOn(p('iface_ping_mgmt')), snmp: isOn(p('iface_snmp_mgmt')),
      },
      mtu: p('eth_mtu'),
    };
  }).filter((i) => i.name);

  const zones: ExpZone[] = indicesOf(map, 'zoneObjId_').map((i) => ({
    index: i, name: g(map, 'zoneObjId_' + i), zoneType: g(map, 'zoneObjZoneType_' + i),
  })).filter((z) => z.name);

  const ADDR_TYPE: Record<number, string> = { 1: 'host', 2: 'range', 4: 'network', 8: 'group' };
  const addrObjs: ExpAddrObj[] = indicesOf(map, 'addrObjId_').map((i) => {
    const type = Number(g(map, 'addrObjType_' + i) || '0');
    return {
      index: i, name: g(map, 'addrObjId_' + i), type, typeLabel: ADDR_TYPE[type] || ('type' + type),
      zone: g(map, 'addrObjZone_' + i), ip1: g(map, 'addrObjIp1_' + i), ip2: g(map, 'addrObjIp2_' + i),
    };
  }).filter((a) => a.name);
  const addrGroups = groupsOf(map, 'addro_atomToGrp_', 'addro_grpToGrp_');

  const PROTO: Record<number, string> = { 6: 'tcp', 17: 'udp', 1: 'icmp' };
  const svcObjs: ExpSvcObj[] = indicesOf(map, 'svcObjId_').map((i) => {
    const type = Number(g(map, 'svcObjType_' + i) || '0');
    const ipType = Number(g(map, 'svcObjIpType_' + i) || '0');
    return {
      index: i, name: g(map, 'svcObjId_' + i), type, ipType,
      proto: type === 2 ? 'group' : (PROTO[ipType] || ('ip-proto-' + ipType)),
      port1: Number(g(map, 'svcObjPort1_' + i) || '0'), port2: Number(g(map, 'svcObjPort2_' + i) || '0'),
    };
  }).filter((s) => s.name);
  const svcGroups = groupsOf(map, 'so_atomToGrp_', 'so_grpToGrp_');

  const policies: ExpPolicy[] = indicesOf(map, 'policyAction_').map((i) => {
    const action = Number(g(map, 'policyAction_' + i) || '-1');
    return {
      index: i, action, actionLabel: action === 2 ? 'allow' : 'deny',
      srcZone: g(map, 'policySrcZone_' + i), dstZone: g(map, 'policyDstZone_' + i),
      srcNet: g(map, 'policySrcNet_' + i), dstNet: g(map, 'policyDstNet_' + i), dstSvc: g(map, 'policyDstSvc_' + i),
      enabled: isOn(g(map, 'policyEnabled_' + i)), comment: g(map, 'policyComment_' + i),
    };
  });

  const byIfnum: Record<string, string> = {};
  interfaces.forEach((i) => { byIfnum[i.ifnum] = i.name; });
  const ifaceName = (v: string): string => (!v || v === '-1' ? '' : (byIfnum[v] || ''));
  const nats: ExpNat[] = indicesOf(map, 'natPolicyOrigSrc_').map((i) => {
    const s = g(map, 'natPolicySrcIface_' + i), d = g(map, 'natPolicyDstIface_' + i);
    return {
      index: i,
      origSrc: g(map, 'natPolicyOrigSrc_' + i), origDst: g(map, 'natPolicyOrigDst_' + i), origSvc: g(map, 'natPolicyOrigSvc_' + i),
      transSrc: g(map, 'natPolicyTransSrc_' + i), transDst: g(map, 'natPolicyTransDst_' + i), transSvc: g(map, 'natPolicyTransSvc_' + i),
      srcIface: s, dstIface: d, srcIfaceName: ifaceName(s), dstIfaceName: ifaceName(d),
      enabled: isOn(g(map, 'natPolicyEnabled_' + i)), comment: g(map, 'natPolicyComment_' + i),
    };
  });

  const dhcpScopes: ExpDhcpScope[] = indicesOf(map, 'prefs_dhdynIpStart_').map((i) => ({
    index: i,
    ipStart: g(map, 'prefs_dhdynIpStart_' + i), ipEnd: g(map, 'prefs_dhdynIpEnd_' + i),
    gateway: g(map, 'prefs_dhdynGateway_' + i), mask: g(map, 'prefs_dhdynMask_' + i),
    dns: [g(map, 'prefs_dhdyndns0_' + i), g(map, 'prefs_dhdyndns1_' + i), g(map, 'prefs_dhdyndns2_' + i)].filter((x) => x && x !== ZERO_IP),
    domain: g(map, 'prefs_dhdyndomainname_' + i), leaseTime: g(map, 'prefs_dhdynLeaseTime_' + i),
    enabled: isOn(g(map, 'prefs_dhdynEnable_' + i)), comment: g(map, 'prefs_dhdynComment_' + i),
  })).filter((d) => d.ipStart && d.ipStart !== ZERO_IP);

  const hostname = g(map, 'firewallName') || g(map, 'hostname') || g(map, 'sysName') || '';
  if (!hostname) warnings.push('機器名(hostname)に相当する変数が見つからなかったため system name は出力していません。');
  if (!interfaces.length) warnings.push('インターフェイス変数(iface_name_N)が見つかりません。');
  if (!policies.length) warnings.push('アクセスルール変数(policyAction_N)が見つかりません。');

  return {
    product: g(map, 'shortProdName'), buildNum: g(map, 'buildNum'), hostname,
    interfaces, zones, addrObjs, addrGroups, svcObjs, svcGroups, policies, nats, dhcpScopes, warnings,
  };
}

/* ---------- CLI text ---------- */

/** FACET パーサは `"..."` で引用された名前を受け付ける(スペース入り名前用)。 */
function q(name: string): string {
  const clean = name.replace(/"/g, '');
  return /\s/.test(clean) ? '"' + clean + '"' : (clean || 'any');
}
const orAny = (v: string): string => (v ? q(v) : 'any');

export interface ExpCliResult {
  text: string;
  /** CLI へ変換できず省略した項目の説明(ユーザに明示する) */
  omitted: string[];
  counts: { interfaces: number; addrObjs: number; svcObjs: number; rules: number; nats: number; dhcp: number };
}

const CLI_IFACE_RE = /^X\d+(?::V\d+)?$/i;

export function expModelToCli(model: ExpModel, sourceName?: string): ExpCliResult {
  const out: string[] = [];
  const omitted: string[] = [];
  const counts = { interfaces: 0, addrObjs: 0, svcObjs: 0, rules: 0, nats: 0, dhcp: 0 };

  out.push('! FACET: SonicWall Settings Export(.exp)から自動変換した CLI 可読テキスト');
  if (sourceName) out.push('! 元ファイル: ' + sourceName.replace(/[\r\n]/g, ' '));
  if (model.product || model.buildNum) out.push('! 機器: ' + [model.product, model.buildNum].filter(Boolean).join(' / '));
  out.push('! パスワード等の暗号化された値は含まれません。FACET が解釈する構文のみを出力しています。');
  out.push('');
  if (model.hostname) { out.push('system name ' + model.hostname.replace(/\s+/g, '-')); out.push(''); }

  /* address objects */
  model.addrObjs.forEach((a) => {
    if (a.type === 8) { omitted.push('アドレスグループ「' + a.name + '」(FACET はカスタムグループのメンバー展開に未対応)'); return; }
    const zone = a.zone ? ' zone ' + q(a.zone) : '';
    if (a.type === 1 && a.ip1) out.push('address-object ipv4 ' + q(a.name) + ' host ' + a.ip1 + zone);
    else if (a.type === 4 && a.ip1) out.push('address-object ipv4 ' + q(a.name) + ' network ' + a.ip1 + ' ' + (a.ip2 || '255.255.255.255') + zone);
    else if (a.type === 2 && a.ip1) out.push('address-object ipv4 ' + q(a.name) + ' range ' + a.ip1 + ' ' + (a.ip2 || a.ip1));
    else { omitted.push('アドレスオブジェクト「' + a.name + '」(種別 ' + a.typeLabel + ' は未対応)'); return; }
    counts.addrObjs++;
  });
  if (model.addrObjs.length) out.push('');

  /* service objects */
  model.svcObjs.forEach((s) => {
    if (s.type === 2) { omitted.push('サービスグループ「' + s.name + '」(FACET はグループのメンバー展開に未対応)'); return; }
    let ports = '';
    if (s.port1 || s.port2) ports = ' ' + (s.port1 || s.port2) + (s.port2 && s.port2 !== s.port1 ? '-' + s.port2 : '');
    out.push('service-object ' + q(s.name) + ' ' + s.proto + ports);
    counts.svcObjs++;
  });
  if (model.svcObjs.length) out.push('');

  /* interfaces */
  model.interfaces.forEach((i) => {
    if (!CLI_IFACE_RE.test(i.name)) return;                 // MGMT / U0 / WWAN 等は対象外
    if (!i.zone && !i.lanIp && !i.staticIp && !i.dhcpEnabled) return;   // 未使用ポート
    out.push('interface ' + i.name.toUpperCase());
    if (i.vlanTag > 0) out.push(' vlan ' + i.vlanTag);
    if (i.zone) out.push(' zone ' + q(i.zone));
    if (i.lanIp) out.push(' ip ' + i.lanIp + ' netmask ' + (i.lanMask || '255.255.255.0'));
    else if (i.staticIp) out.push(' ip ' + i.staticIp + ' netmask ' + (i.staticMask || '255.255.255.0'));
    else if (i.dhcpEnabled) out.push(' ip-assignment ' + (i.zone || 'WAN') + ' dhcp');
    if (i.comment) out.push(' comment "' + i.comment.replace(/"/g, '') + '"');
    if (i.portDisabled) out.push(' ! port disabled');
    counts.interfaces++;
    out.push('');
  });

  /* WAN 管理/Ping 許可 → FACET の SEC ヒューリスティックが読む定型行 */
  const wanIfs = model.interfaces.filter((i) => /WAN/i.test(i.zone) && CLI_IFACE_RE.test(i.name));
  if (wanIfs.some((i) => i.mgmt.ping)) out.push('ping from wan allow   ! (' + wanIfs.filter((i) => i.mgmt.ping).map((i) => i.name).join(',') + ' の Ping 応答が有効)');
  if (wanIfs.some((i) => i.mgmt.https || i.mgmt.http || i.mgmt.ssh)) {
    out.push('management from wan allow   ! (' + wanIfs.filter((i) => i.mgmt.https || i.mgmt.http || i.mgmt.ssh).map((i) => i.name).join(',') + ' の HTTPS/HTTP/SSH 管理が有効)');
  }
  if (wanIfs.length) out.push('');

  /* access rules */
  model.policies.forEach((p) => {
    if (!p.srcZone || !p.dstZone) { omitted.push('アクセスルール #' + p.index + '(ゾーンが空)'); return; }
    if (p.comment) out.push('! rule #' + p.index + ': ' + p.comment.replace(/[\r\n]/g, ' '));
    out.push('access-rule from ' + q(p.srcZone) + ' to ' + q(p.dstZone));
    out.push(' action ' + p.actionLabel);
    out.push(' source ' + orAny(p.srcNet));
    out.push(' destination ' + orAny(p.dstNet));
    out.push(' service ' + orAny(p.dstSvc));
    if (!p.enabled) out.push(' disable');
    out.push('');
    counts.rules++;
  });

  /* NAT */
  model.nats.forEach((n) => {
    if (!n.enabled) { omitted.push('NAT ポリシー #' + n.index + '(無効化されているため出力しない)'); return; }
    if (n.comment) out.push('! nat #' + n.index + ': ' + n.comment.replace(/[\r\n]/g, ' '));
    out.push('nat-policy');
    out.push(' original-source ' + (n.origSrc ? n.origSrc.replace(/"/g, '') : 'any'));
    out.push(' translated-source ' + (n.transSrc ? n.transSrc.replace(/"/g, '') : 'original'));
    out.push(' ! original-destination ' + (n.origDst || 'any') + ' / translated-destination ' + (n.transDst || 'original') +
      ' / original-service ' + (n.origSvc || 'any') + ' / translated-service ' + (n.transSvc || 'original'));
    if (n.dstIfaceName) out.push(' outbound-interface ' + n.dstIfaceName.toUpperCase());
    else if (n.dstIface && n.dstIface !== '-1') out.push(' ! outbound-interface ifnum ' + n.dstIface + '(名前を解決できず)');
    out.push('end');
    out.push('');
    counts.nats++;
  });

  /* DHCP scopes */
  model.dhcpScopes.forEach((d) => {
    if (!d.enabled) return;
    out.push('dhcp-scope ' + d.ipStart + ' - ' + d.ipEnd + (d.comment ? '   ! ' + d.comment.replace(/[\r\n]/g, ' ') : ''));
    counts.dhcp++;
  });
  if (counts.dhcp) out.push('');

  omitted.push('静的ルート(route-policy)は .exp 側の変数名を確認できていないため変換していません。');
  model.warnings.forEach((w) => omitted.push(w));

  return { text: out.join('\n') + '\n', omitted, counts };
}

/* ---------- Excel sheets ---------- */

const yn = (b: boolean): string => (b ? '有効' : '無効');

export function expModelToSheets(model: ExpModel, decoded: ExpDecodeResult, sourceName?: string): XlsxSheet[] {
  const summary: XlsxSheet = {
    name: '概要',
    rows: [
      ['項目', '値'],
      ['元ファイル', sourceName || ''],
      ['製品', model.product],
      ['ビルド', model.buildNum],
      ['機器名', model.hostname],
      ['設定変数の総数', decoded.stats.pairCount],
      ['インターフェイス数', model.interfaces.length],
      ['ゾーン数', model.zones.length],
      ['アドレスオブジェクト数', model.addrObjs.length],
      ['アドレスグループ数', model.addrGroups.length],
      ['サービスオブジェクト数', model.svcObjs.length],
      ['サービスグループ数', model.svcGroups.length],
      ['アクセスルール数', model.policies.length],
      ['NATポリシー数', model.nats.length],
      ['DHCPスコープ数', model.dhcpScopes.length],
      ['注記', [...decoded.notes, ...model.warnings].join(' / ')],
      ['備考', 'パスワード等の暗号化された値は復号できません。本ファイルは FACET(静的解析ツール)が .exp を復号して生成したものです。'],
    ],
  };
  const interfaces: XlsxSheet = {
    name: 'インターフェイス',
    rows: [
      ['名前', 'ゾーン', 'IP', 'マスク', 'VLANタグ', '親IF(ifnum)', '種別', '静的IP', '静的マスク', '静的GW', 'DHCPクライアント', 'ポート無効', 'HTTPS管理', 'HTTP管理', 'SSH管理', 'Ping', 'SNMP', 'MTU', 'ifnum', 'コメント'],
      ...model.interfaces.map((i) => [
        i.name, i.zone, i.lanIp, i.lanIp ? i.lanMask : '', i.vlanTag || '', i.vlanParent === '-1' ? '' : i.vlanParent,
        i.physType === 2 ? 'VLAN' : i.physType === 0 ? '物理' : String(i.physType),
        i.staticIp, i.staticIp ? i.staticMask : '', i.staticGw, yn(i.dhcpEnabled), yn(i.portDisabled),
        yn(i.mgmt.https), yn(i.mgmt.http), yn(i.mgmt.ssh), yn(i.mgmt.ping), yn(i.mgmt.snmp), i.mtu, i.ifnum, i.comment,
      ]),
    ],
  };
  const zones: XlsxSheet = { name: 'ゾーン', rows: [['名前', 'ゾーン種別'], ...model.zones.map((z) => [z.name, z.zoneType])] };
  const addr: XlsxSheet = {
    name: 'アドレスオブジェクト',
    rows: [['名前', '種別', 'ゾーン', 'IP1', 'IP2(マスク/終端)', '表現'],
      ...model.addrObjs.map((a) => [a.name, a.typeLabel, a.zone, a.ip1, a.ip2,
        a.type === 1 ? a.ip1 : a.type === 2 ? a.ip1 + ' - ' + a.ip2 : a.type === 4 ? a.ip1 + ' / ' + a.ip2 : '(group)'])],
  };
  const addrGrp: XlsxSheet = { name: 'アドレスグループ', rows: [['グループ名', 'メンバー'], ...model.addrGroups.flatMap((gr) => gr.members.map((m) => [gr.name, m]))] };
  const svc: XlsxSheet = {
    name: 'サービスオブジェクト',
    rows: [['名前', '種別', 'プロトコル', '開始ポート', '終了ポート'],
      ...model.svcObjs.map((s) => [s.name, s.type === 2 ? 'group' : 'object', s.proto, s.type === 2 ? '' : s.port1, s.type === 2 ? '' : s.port2])],
  };
  const svcGrp: XlsxSheet = { name: 'サービスグループ', rows: [['グループ名', 'メンバー'], ...model.svcGroups.flatMap((gr) => gr.members.map((m) => [gr.name, m]))] };
  const rules: XlsxSheet = {
    name: 'アクセスルール',
    rows: [['#', '送信元ゾーン', '宛先ゾーン', '送信元', '宛先', 'サービス', 'アクション', 'アクション(生値)', '有効', 'コメント'],
      ...model.policies.map((p) => [p.index, p.srcZone, p.dstZone, p.srcNet || 'any', p.dstNet || 'any', p.dstSvc || 'any', p.actionLabel, p.action, yn(p.enabled), p.comment])],
  };
  const nats: XlsxSheet = {
    name: 'NATポリシー',
    rows: [['#', '元送信元', '元宛先', '元サービス', '変換後送信元', '変換後宛先', '変換後サービス', '送信元IF', '宛先IF', '有効', 'コメント'],
      ...model.nats.map((n) => [n.index, n.origSrc || 'any', n.origDst || 'any', n.origSvc || 'any', n.transSrc || 'original', n.transDst || 'original', n.transSvc || 'original',
        n.srcIfaceName || (n.srcIface === '-1' || !n.srcIface ? 'any' : n.srcIface), n.dstIfaceName || (n.dstIface === '-1' || !n.dstIface ? 'any' : n.dstIface), yn(n.enabled), n.comment])],
  };
  const dhcp: XlsxSheet = {
    name: 'DHCPスコープ',
    rows: [['#', '開始', '終了', 'ゲートウェイ', 'マスク', 'DNS', 'ドメイン', 'リース', '有効', 'コメント'],
      ...model.dhcpScopes.map((d) => [d.index, d.ipStart, d.ipEnd, d.gateway, d.mask, d.dns.join(', '), d.domain, d.leaseTime, yn(d.enabled), d.comment])],
  };
  const all: XlsxSheet = { name: '全変数', rows: [['キー', '値', '生の値'], ...decoded.pairs.map((p) => [p.key, p.value, p.rawValue === p.value ? '' : p.rawValue])] };
  return [summary, interfaces, zones, addr, addrGrp, svc, svcGrp, rules, nats, dhcp, all];
}
