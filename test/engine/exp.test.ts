/**
 * SonicWall .exp 復号・変換(v4.21.0)の回帰テスト。
 *
 * フィクスチャは実物の .exp(pryorda/sonicwallRuleParser 同梱サンプルおよび SonicWall 公式 KB)
 * で確認した変数体系に合わせて、匿名データ(ACME-* / RFC1918 / TEST-NET)で組み立てる。
 * 実物と同じく「URL エンコードされた key=value を & で連結し base64 化」したものを入力にする。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  CATALOG, decodeExp, looksLikeExp, expToDecodedText, percentDecode, extractExpModel, expModelToCli,
  expModelToSheets, buildXlsx, crc32, parseSonicWall, mapToPorts, verify, pathTrace, switchPorts,
} from '@engine/index';
import type { AppState, Device } from '@engine/types';
import { SMP_SW, SMP_C1 } from '../../src/samples/index';

const KV: string[] = [
  'shortProdName=TZ 470', 'buildNum=7.1.2-7019', 'firewallName=ACME-EDGE-01',
  'zoneObjId_0=LAN', 'zoneObjZoneType_0=0', 'zoneObjId_1=WAN', 'zoneObjZoneType_1=1', 'zoneObjId_2=POS', 'zoneObjZoneType_2=0',
  /* X0: LAN, HTTPS/Ping 管理 ON(LAN なので SEC には影響しない) */
  'iface_ifnum_0=0', 'iface_name_0=X0', 'iface_phys_type_0=0', 'interface_Zone_0=LAN', 'iface_comment_0=LAN%20core',
  'iface_lan_ip_0=192.168.1.1', 'iface_lan_mask_0=255.255.255.0', 'iface_vlan_tag_0=0', 'iface_vlan_parent_0=-1',
  'iface_https_mgmt_0=1', 'iface_ping_mgmt_0=1', 'eth_mtu_0=1500',
  /* X1: WAN static、Ping と HTTPS 管理が WAN 側で有効(SEC で検出されるべき) */
  'iface_ifnum_1=1', 'iface_name_1=X1', 'iface_phys_type_1=0', 'interface_Zone_1=WAN', 'iface_comment_1=',
  'iface_lan_ip_1=0.0.0.0', 'iface_lan_mask_1=255.255.255.0', 'iface_static_ip_1=203.0.113.2', 'iface_static_mask_1=255.255.255.248',
  'iface_static_gateway_1=203.0.113.1', 'iface_vlan_tag_1=0', 'iface_vlan_parent_1=-1', 'iface_ping_mgmt_1=1', 'iface_https_mgmt_1=1',
  /* VLAN サブIF(名前は X0%3aV10 のように percent エンコードされる) */
  'iface_ifnum_2=268435466', 'iface_name_2=X0%3aV10', 'iface_phys_type_2=2', 'interface_Zone_2=LAN', 'iface_comment_2=Staff%20VLAN',
  'iface_lan_ip_2=192.168.10.1', 'iface_lan_mask_2=255.255.255.0', 'iface_vlan_tag_2=10', 'iface_vlan_parent_2=0',
  'iface_ifnum_3=268435476', 'iface_name_3=X0%3aV20', 'iface_phys_type_3=2', 'interface_Zone_3=POS', 'iface_comment_3=',
  'iface_lan_ip_3=192.168.20.1', 'iface_lan_mask_3=255.255.255.0', 'iface_vlan_tag_3=20', 'iface_vlan_parent_3=0',
  /* 未使用ポートと MGMT(CLI には出さない) */
  'iface_ifnum_5=5', 'iface_name_5=X5', 'iface_phys_type_5=0', 'interface_Zone_5=', 'iface_lan_ip_5=0.0.0.0',
  'iface_ifnum_18=18', 'iface_name_18=MGMT', 'iface_phys_type_18=0', 'interface_Zone_18=MGMT', 'iface_lan_ip_18=0.0.0.0', 'iface_mgmt_ip_18=192.168.1.254',
  /* address objects: network / host(スペース入り名) / range / group */
  'addrObjId_1=net-staff', 'addrObjType_1=4', 'addrObjZone_1=LAN', 'addrObjIp1_1=192.168.10.0', 'addrObjIp2_1=255.255.255.0',
  'addrObjId_2=POS%20Terminal%201', 'addrObjType_2=1', 'addrObjZone_2=POS', 'addrObjIp1_2=192.168.20.10', 'addrObjIp2_2=255.255.255.255',
  'addrObjId_3=Guest%20Range', 'addrObjType_3=2', 'addrObjZone_3=LAN', 'addrObjIp1_3=192.168.30.10', 'addrObjIp2_3=192.168.30.50',
  'addrObjId_4=POS%20Group', 'addrObjType_4=8', 'addrObjZone_4=POS', 'addrObjIp1_4=0.0.0.0', 'addrObjIp2_4=0.0.0.0',
  'addro_atomToGrp_1=POS%20Terminal%201', 'addro_grpToGrp_1=POS%20Group',
  /* services: tcp / icmp(ポート無し) / group / udp range */
  'svcObjId_1=svc-https', 'svcObjType_1=1', 'svcObjIpType_1=6', 'svcObjPort1_1=443', 'svcObjPort2_1=443',
  'svcObjId_2=svc-icmp', 'svcObjType_2=1', 'svcObjIpType_2=1', 'svcObjPort1_2=0', 'svcObjPort2_2=0',
  'svcObjId_3=Web%20Services', 'svcObjType_3=2', 'svcObjIpType_3=0', 'svcObjPort1_3=0', 'svcObjPort2_3=0',
  'svcObjId_4=svc-range', 'svcObjType_4=1', 'svcObjIpType_4=17', 'svcObjPort1_4=5000', 'svcObjPort2_4=5010',
  'so_atomToGrp_1=svc-https', 'so_grpToGrp_1=Web%20Services',
  /* access rules */
  'policyAction_0=2', 'policySrcZone_0=LAN', 'policyDstZone_0=WAN', 'policySrcNet_0=', 'policyDstNet_0=', 'policyDstSvc_0=', 'policyEnabled_0=1', 'policyComment_0=Default%20LAN%20to%20WAN',
  'policyAction_1=2', 'policySrcZone_1=POS', 'policyDstZone_1=WAN', 'policySrcNet_1=POS%20Terminal%201', 'policyDstNet_1=', 'policyDstSvc_1=svc-https', 'policyEnabled_1=1', 'policyComment_1=',
  'policyAction_2=1', 'policySrcZone_2=WAN', 'policyDstZone_2=LAN', 'policySrcNet_2=', 'policyDstNet_2=', 'policyDstSvc_2=', 'policyEnabled_2=1', 'policyComment_2=Auto-added',
  'policyAction_3=2', 'policySrcZone_3=LAN', 'policyDstZone_3=POS', 'policySrcNet_3=net-staff', 'policyDstNet_3=POS%20Group', 'policyDstSvc_3=svc-https', 'policyEnabled_3=0', 'policyComment_3=disabled%20rule',
  /* NAT: 有効(宛先IF = X1)と無効 */
  'natPolicyOrigSrc_0=', 'natPolicyOrigDst_0=', 'natPolicyOrigSvc_0=', 'natPolicyTransSrc_0=X1%20IP', 'natPolicyTransDst_0=', 'natPolicyTransSvc_0=',
  'natPolicySrcIface_0=0', 'natPolicyDstIface_0=1', 'natPolicyEnabled_0=1', 'natPolicyComment_0=Outbound%20SNAT',
  'natPolicyOrigSrc_1=net-staff', 'natPolicyOrigDst_1=', 'natPolicyOrigSvc_1=', 'natPolicyTransSrc_1=', 'natPolicyTransDst_1=', 'natPolicyTransSvc_1=',
  'natPolicySrcIface_1=-1', 'natPolicyDstIface_1=-1', 'natPolicyEnabled_1=0', 'natPolicyComment_1=old',
  /* DHCP scope */
  'prefs_dhdynIpStart_0=192.168.10.100', 'prefs_dhdynIpEnd_0=192.168.10.200', 'prefs_dhdynGateway_0=192.168.10.1', 'prefs_dhdynMask_0=255.255.255.0',
  'prefs_dhdyndns0_0=192.168.1.1', 'prefs_dhdyndns1_0=0.0.0.0', 'prefs_dhdynLeaseTime_0=1440', 'prefs_dhdynEnable_0=1', 'prefs_dhdynComment_0=Staff',
];
const DECODED = KV.join('&');
const EXP = btoa(DECODED);
/** 公式 KB の Windows 手順にある「末尾の && を除去」に相当する形 + 76 桁折り返し + BOM */
const EXP_WITH_TERMINATOR = '﻿' + EXP.replace(/(.{76})/g, '$1\r\n') + '&&';

describe('decodeExp — .exp の復号', () => {
  it('base64 → & 分割 → percent デコードで全変数が取れる', () => {
    const r = decodeExp(EXP);
    expect(r.stats.pairCount).toBe(KV.length);
    expect(r.map['iface_name_2']).toBe('X0:V10');            // %3a → ':'
    expect(r.map['addrObjId_2']).toBe('POS Terminal 1');     // %20 → ' '
    expect(r.pairs.find((p) => p.key === 'iface_name_2')!.rawValue).toBe('X0%3aV10');
    expect(r.stats.strippedTerminator).toBe(false);
  });
  it('末尾の && ・改行折り返し・BOM があっても同じ結果になる(公式 KB の Windows 手順に対応)', () => {
    const a = decodeExp(EXP);
    const b = decodeExp(EXP_WITH_TERMINATOR);
    expect(b.map).toEqual(a.map);
    expect(b.stats.strippedTerminator).toBe(true);
    expect(b.notes.some((n) => n.includes('終端'))).toBe(true);
  });
  it('パディング不足の base64 は補完して復号する', () => {
    const noPad = EXP.replace(/=+$/, '');
    expect(decodeExp(noPad).stats.pairCount).toBe(KV.length);
  });
  it('base64 でない入力(CLI テキスト)は明確なエラーになる', () => {
    expect(() => decodeExp(SMP_SW)).toThrow(/base64/);
    expect(() => decodeExp('')).toThrow();
  });
  it('looksLikeExp は .exp を true、CLI テキスト/Cisco config を false と判定する', () => {
    expect(looksLikeExp(EXP)).toBe(true);
    expect(looksLikeExp(EXP_WITH_TERMINATOR)).toBe(true);
    expect(looksLikeExp(SMP_SW)).toBe(false);
    expect(looksLikeExp(SMP_C1)).toBe(false);
    expect(looksLikeExp('abcd')).toBe(false);
  });
  it('復号テキストは 1 行 1 変数(値は percent デコード済み)', () => {
    const txt = expToDecodedText(decodeExp(EXP));
    expect(txt.split('\n').filter(Boolean).length).toBe(KV.length);
    expect(txt).toContain('iface_name_2=X0:V10');
  });
  it('percentDecode は不正なシーケンスで例外を出さない', () => {
    expect(percentDecode('a%2')).toBe('a%2');
    expect(percentDecode('%E3%81%82')).toBe('あ');
    expect(percentDecode('a+b')).toBe('a+b');
  });
});

describe('extractExpModel — 変数群 → 構造化モデル', () => {
  const model = extractExpModel(decodeExp(EXP).map);
  it('機器情報とインターフェイス(スロット番号が飛んでいても全件)', () => {
    expect(model.product).toBe('TZ 470');
    expect(model.hostname).toBe('ACME-EDGE-01');
    expect(model.interfaces.map((i) => i.name)).toEqual(['X0', 'X1', 'X0:V10', 'X0:V20', 'X5', 'MGMT']);
    const x1 = model.interfaces.find((i) => i.name === 'X1')!;
    expect(x1.lanIp).toBe('');                 // 0.0.0.0 は未設定扱い
    expect(x1.staticIp).toBe('203.0.113.2');
    expect(x1.mgmt.ping && x1.mgmt.https).toBe(true);
    const v10 = model.interfaces.find((i) => i.name === 'X0:V10')!;
    expect(v10.vlanTag).toBe(10);
    expect(v10.physType).toBe(2);
  });
  it('アドレス/サービスオブジェクトと種別・グループ所属', () => {
    expect(model.addrObjs.map((a) => a.typeLabel)).toEqual(['network', 'host', 'range', 'group']);
    expect(model.addrGroups).toEqual([{ name: 'POS Group', members: ['POS Terminal 1'] }]);
    expect(model.svcObjs.map((s) => s.proto)).toEqual(['tcp', 'icmp', 'group', 'udp']);
    expect(model.svcGroups).toEqual([{ name: 'Web Services', members: ['svc-https'] }]);
  });
  it('アクセスルール(action 2 = allow、空 = any、無効フラグ)', () => {
    expect(model.policies.length).toBe(4);
    expect(model.policies[0]!.actionLabel).toBe('allow');
    expect(model.policies[2]!.actionLabel).toBe('deny');
    expect(model.policies[3]!.enabled).toBe(false);
    expect(model.policies[1]!.srcNet).toBe('POS Terminal 1');
  });
  it('NAT の iface 参照(ifnum)を名前に解決し、-1 は any', () => {
    expect(model.nats[0]!.dstIfaceName).toBe('X1');
    expect(model.nats[0]!.srcIfaceName).toBe('X0');
    expect(model.nats[1]!.dstIfaceName).toBe('');
    expect(model.nats[1]!.enabled).toBe(false);
  });
  it('ゾーンと DHCP スコープ', () => {
    expect(model.zones.map((z) => z.name)).toEqual(['LAN', 'WAN', 'POS']);
    expect(model.dhcpScopes[0]).toMatchObject({ ipStart: '192.168.10.100', ipEnd: '192.168.10.200', dns: ['192.168.1.1'], enabled: true });
  });
});

describe('expModelToCli → parseSonicWall — 変換テキストは FACET が 100% 読み戻せる', () => {
  const decoded = decodeExp(EXP);
  const cli = expModelToCli(extractExpModel(decoded.map), 'acme-edge-01.exp');
  const sp = parseSonicWall(cli.text);

  it('未対応行ゼロ(注釈行を含めて全行認識)', () => {
    expect(sp.coverage.unrecognizedLines).toEqual([]);
    expect(sp.coverage.coveragePercent).toBe(100);
  });
  it('hostname / インターフェイス(VLAN サブIF・WAN static)。MGMT と未使用ポートは出さない', () => {
    expect(sp.hostname).toBe('ACME-EDGE-01');
    expect(Object.keys(sp.interfaces).sort()).toEqual(['X0', 'X0:V10', 'X0:V20', 'X1']);
    expect(sp.interfaces['X0']).toMatchObject({ zone: 'LAN', ip: '192.168.1.1', mask: '255.255.255.0', description: 'LAN core' });
    expect(sp.interfaces['X1']).toMatchObject({ zone: 'WAN', ip: '203.0.113.2', mask: '255.255.255.248' });
    expect(sp.interfaces['X0:V10']).toMatchObject({ zone: 'LAN', ip: '192.168.10.1', vlanTag: '10' });
    expect(sp.interfaces['X0:V20']!.zone).toBe('POS');
    expect(cli.counts.interfaces).toBe(4);
  });
  it('アドレス/サービスオブジェクト(スペース入り名は引用符経由で復元、グループは省略として明示)', () => {
    expect(sp.addr['net-staff']).toEqual({ type: 'network', cidr: '192.168.10.0/24', zone: 'LAN' });
    expect(sp.addr['POS Terminal 1']).toEqual({ type: 'host', ip: '192.168.20.10', zone: 'POS' });
    expect(sp.addr['Guest Range']).toEqual({ type: 'range', from: '192.168.30.10', to: '192.168.30.50' });
    expect(sp.addr['POS Group']).toBeUndefined();
    expect(sp.svc['svc-https']).toEqual({ proto: 'tcp', from: 443, to: 443 });
    expect(sp.svc['svc-icmp']).toEqual({ proto: 'icmp', from: null, to: null });
    expect(sp.svc['svc-range']).toEqual({ proto: 'udp', from: 5000, to: 5010 });
    expect(sp.svc['Web Services']).toBeUndefined();
    expect(cli.omitted.some((o) => o.includes('POS Group'))).toBe(true);
    expect(cli.omitted.some((o) => o.includes('Web Services'))).toBe(true);
  });
  it('アクセスルール(any 補完・deny・disable・スペース入り参照)', () => {
    expect(sp.rules.length).toBe(4);
    expect(sp.rules[0]).toMatchObject({ from: 'LAN', to: 'WAN', action: 'allow', src: 'any', dst: 'any', service: 'any', enabled: true });
    expect(sp.rules[1]).toMatchObject({ from: 'POS', to: 'WAN', src: 'POS Terminal 1', service: 'svc-https' });
    expect(sp.rules[2]!.action).toBe('deny');
    expect(sp.rules[3]).toMatchObject({ enabled: false, dst: 'POS Group' });
  });
  it('NAT は有効なものだけ、outbound-interface を名前で出力', () => {
    expect(sp.nat.length).toBe(1);
    expect(sp.nat[0]).toMatchObject({ orig: 'any', trans: 'X1 IP', iface: 'X1' });
    expect(cli.omitted.some((o) => o.includes('NAT ポリシー #1'))).toBe(true);
  });
  it('DHCP スコープと WAN 管理/Ping 許可のヒント行', () => {
    expect(sp.dhcp).toEqual([{ from: '192.168.10.100', to: '192.168.10.200' }]);
    expect(sp.sec.pingWanAllow).toBe(true);
    expect(sp.sec.mgmtWanAllow).toBe(true);
  });
  it('変換テキストで verify() / pathTrace() が成立する(FW 評価まで含めて)', () => {
    const rm = CATALOG.router.filter((x) => x.id === 'TZ470')[0]!;
    const sm = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r: Device = { key: 'R1', role: 'router', model: rm, name: rm.name, unit: 0,
      ports: rm.ports.map((p) => ({ ...p, status: 'idle' as const, cfg: null, msg: null })), config: cli.text, parsed: sp };
    const sw: Device = { key: 'SW1', role: 'switch', model: sm, name: sm.name, unit: 1,
      ports: switchPorts(sm).map((p) => ({ ...p, status: 'idle' as const, cfg: null, msg: null })), config: 'x', parsed: null };
    [r].forEach((d) => mapToPorts(d));
    const st: AppState = { router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] };
    const V = verify(st);
    expect(V.subnets.map((s) => s.cidr).sort()).toEqual(['192.168.1.0/24', '192.168.10.0/24', '192.168.20.0/24', '203.0.113.0/29']);
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('Ping'))).toBe(true);
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('管理アクセス'))).toBe(true);
    expect(pathTrace(st, '192.168.1.0/24', '__WAN__', 'any').verdict).toBe('ok');          // rule #0 LAN→WAN any/any/any
    expect(pathTrace(st, '192.168.10.0/24', '__WAN__', 'any').verdict).toBe('ok');         // V10 も LAN ゾーン
    /* rule #1 は送信元が特定ホスト(POS Terminal 1 = .10)に限定されており、FACET の代表ホスト
     * (.20)はそのホストではないため deny になるのが正しい(ホスト単位の絞り込みを反映) */
    expect(pathTrace(st, '192.168.20.0/24', '__WAN__', 'svc-https').verdict).toBe('deny');
    expect(pathTrace(st, '192.168.20.0/24', '192.168.1.0/24', 'any').verdict).toBe('deny'); // POS → LAN ルール無し
  });
  it('未設定 hostname / 静的ルート非対応は注記として明示される', () => {
    const noHost = extractExpModel(decodeExp(btoa(KV.filter((k) => !k.startsWith('firewallName')).join('&'))).map);
    expect(noHost.hostname).toBe('');
    const cli2 = expModelToCli(noHost);
    expect(cli2.text).not.toContain('system name');
    expect(cli2.omitted.some((o) => o.includes('route-policy'))).toBe(true);
  });
});

describe('parseSonicWall — 引用符付き名前と注釈行(v4.21.0 拡張)', () => {
  it('"…" で囲んだスペース入り名前を address/service/rule/nat で読める', () => {
    const sp = parseSonicWall(
      'address-object ipv4 "Blaze Meter" host 10.0.0.5 zone "Trusted Zone"\n' +
      'service-object "Web Ports" tcp 80-443\n' +
      'access-rule from "Trusted Zone" to WAN\n action allow\n source "Blaze Meter"\n destination any\n service "Web Ports"\n\n' +
      'nat-policy\n original-source "Blaze Meter"\n translated-source "WAN Primary IP"\n outbound-interface X1\nend\n',
    );
    expect(sp.addr['Blaze Meter']).toEqual({ type: 'host', ip: '10.0.0.5', zone: 'Trusted Zone' });
    expect(sp.svc['Web Ports']).toEqual({ proto: 'tcp', from: 80, to: 443 });
    expect(sp.rules[0]).toMatchObject({ from: 'Trusted Zone', src: 'Blaze Meter', service: 'Web Ports' });
    expect(sp.nat[0]).toMatchObject({ orig: 'Blaze Meter', trans: 'WAN Primary IP', iface: 'X1' });
  });
  it('引用符なしの従来構文はそのまま読める(回帰)', () => {
    const sp = parseSonicWall(SMP_SW);
    expect(Object.keys(sp.addr)).toEqual(['net-staff', 'net-pos']);
    expect(sp.rules.length).toBe(2);
  });
  it('! / # の注釈行は認識済みとして扱い、ブロック(rule/nat/interface)を閉じない', () => {
    const sp = parseSonicWall(
      '! header\n# another\n' +
      'access-rule from LAN to WAN\n action deny\n ! inside rule\n source any\n\n' +
      'interface X0\n zone LAN\n ! inside iface\n ip 10.0.0.1 netmask 255.255.255.0\n',
    );
    expect(sp.coverage.unrecognizedLines).toEqual([]);
    expect(sp.rules[0]).toMatchObject({ action: 'deny', src: 'any' });
    expect(sp.interfaces['X0']).toMatchObject({ zone: 'LAN', ip: '10.0.0.1' });
  });
});

describe('buildXlsx — 依存なし XLSX ライタ', () => {
  const decoded = decodeExp(EXP);
  const sheets = expModelToSheets(extractExpModel(decoded.map), decoded, 'acme.exp');
  const bytes = buildXlsx(sheets);
  const text = new TextDecoder('latin1').decode(bytes);

  it('ZIP 構造(ローカルヘッダ・セントラルディレクトリ・EOCD)とエントリ数', () => {
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const eocdIdx = bytes.length - 22;
    expect(Array.from(bytes.slice(eocdIdx, eocdIdx + 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const entries = bytes[eocdIdx + 10]! | (bytes[eocdIdx + 11]! << 8);
    expect(entries).toBe(5 + sheets.length);
    expect((text.match(/PK\x01\x02/g) || []).length).toBe(5 + sheets.length);
  });
  it('必須パーツとシート名(11 シート、日本語名)を含む', () => {
    ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet11.xml']
      .forEach((p) => expect(text).toContain(p));
    const wb = new TextDecoder('utf-8').decode(bytes);
    ['概要', 'インターフェイス', 'アクセスルール', 'NATポリシー', '全変数'].forEach((n) => expect(wb).toContain('name="' + n + '"'));
  });
  it('セルは inlineStr / 数値で、XML 特殊文字はエスケープされる', () => {
    const out = buildXlsx([{ name: 'a<b>&"c', rows: [['h<1>', '&'], [5, 'x&y "q"']] }]);
    const s = new TextDecoder('utf-8').decode(out);
    expect(s).toContain('<t>h&lt;1&gt;</t>');
    expect(s).toContain('<t>x&amp;y &quot;q&quot;</t>');
    expect(s).toContain('<c r="A2"><v>5</v></c>');
    /* Excel のシート名禁止文字は : \ / ? * [ ] のみ。< > & " は許容されるので XML エスケープだけ行う */
    expect(s).toContain('name="a&lt;b&gt;&amp;&quot;c"');
    const bad = buildXlsx([{ name: 'a:b/c?d*e[f]g\\h', rows: [['x']] }]);
    expect(new TextDecoder('utf-8').decode(bad)).toContain('name="a_b_c_d_e_f_g_h"');
  });
  it('列参照とシート名の制約(27 列目 = AA、31 文字超は切詰、重複は連番)', () => {
    const wide = buildXlsx([{ name: 'w', rows: [Array.from({ length: 27 }, (_, i) => 'c' + i)] }]);
    expect(new TextDecoder('utf-8').decode(wide)).toContain('<c r="AA1"');
    const dup = buildXlsx([{ name: 'x'.repeat(40), rows: [['a']] }, { name: 'x'.repeat(40), rows: [['b']] }]);
    const s = new TextDecoder('utf-8').decode(dup);
    expect(s).toContain('name="' + 'x'.repeat(31) + '"');
    expect(s).toContain('name="' + 'x'.repeat(28) + '(2)"');
  });
  it('crc32 が既知値と一致する(ZIP の整合性の根拠)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

/* v4.21.0 で実際に踏んだ事故の再発防止。xlsx.ts の XML 制御文字フィルタが `\x00` の
 * エスケープではなく「生の制御文字」でソースに書き込まれており、Node(vitest)と
 * dev サーバでは動くのに、単一 HTML に inline された本番ビルドではブラウザが NUL を
 * U+FFFD に置換して正規表現が "Range out of order" で落ち、アプリ全体が起動しなかった。
 * 生の制御文字はソースに存在してはならない。 */
describe('ソース衛生 — 生の制御文字がソースに混入していない', () => {
  it('src / test / tools のテキストファイルに NUL 等の制御文字が無い', () => {
    const roots = ['src', 'test', 'tools/docs'];
    const exts = new Set(['.ts', '.tsx', '.cjs', '.js', '.css', '.md']);
    const ctrl = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'node_modules' && ent.name !== 'shots') walk(full); continue; }
        if (!exts.has(extname(ent.name))) continue;
        const text = readFileSync(full, 'utf8');
        const m = ctrl.exec(text);
        if (m) offenders.push(`${full} (0x${m[0].charCodeAt(0).toString(16)} at ${m.index})`);
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
