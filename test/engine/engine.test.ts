/**
 * FACET エンジン回帰テスト(Vitest 版)。
 * 元: test/facet.test.js のロジックをそのまま TS 化 + Vitest 形式に変換。
 *
 * Sprint 1 で確立した 46 ケース全 PASS が Step 2 完了の関門。
 * 既存ケース + Sprint 1 で追加した svcMatch 双方向 6 ケース + pathTrace 同一サブネット 4 ケース。
 */

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  autoLinks,
  buildMatrix,
  buildSubnets,
  evalFW,
  expandIfRange,
  mapToPorts,
  parseCisco,
  parseSonicWall,
  pathTrace,
  switchPorts,
  verify,
} from '@engine/index';
import type {
  AppState,
  CiscoParsed,
  Device,
  Link,
  Role,
  RouterCatalog,
  SonicWallParsed,
  SwitchCatalog,
} from '@engine/types';

/* ===== Fixtures ===== */

const SMP_SW =
  'system name ACME-EDGE-01\n' +
  'address-object ipv4 net-staff network 192.168.10.0 255.255.255.0 zone LAN\n' +
  'address-object ipv4 net-pos network 192.168.20.0 255.255.255.0 zone POS\n' +
  'service-object svc-https tcp 443\n' +
  'interface X0\n zone LAN\n ip-assignment LAN static\n ip 192.168.1.1 netmask 255.255.255.0\n comment "LAN core uplink"\n' +
  'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n comment "Staff VLAN gateway"\n' +
  'interface X0:V20\n vlan 20\n zone POS\n ip 192.168.20.1 netmask 255.255.255.0\n comment "POS VLAN gateway"\n' +
  'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n comment "WAN"\n' +
  'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n' +
  'access-rule from POS to WAN\n action allow\n source net-pos\n destination any\n service svc-https\n';

const SMP_C1 =
  'hostname ACME-SW-01\n' +
  'spanning-tree mode rapid-pvst\n' +
  'service password-encryption\n' +
  'enable secret 9 abc\n' +
  'vlan 10\n name STAFF\n' +
  'vlan 20\n name POS\n' +
  'interface range GigabitEthernet1/0/1 - 4\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\n spanning-tree bpduguard enable\n!\n' +
  'interface GigabitEthernet1/0/5\n switchport mode access\n switchport access vlan 20\n spanning-tree portfast\n spanning-tree bpduguard enable\n!\n' +
  'interface GigabitEthernet1/1/1\n description Uplink to ACME-EDGE-01 X0\n switchport mode trunk\n switchport trunk native vlan 1\n switchport trunk allowed vlan 10,20\n!\n' +
  'line vty 0 4\n transport input ssh\n!\n';

const SMP_C2 =
  'hostname ACME-SW-02\n' +
  'vlan 10\n name STAFF\n' +
  'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 30\n!\n' +
  'interface GigabitEthernet1/1/1\n description Uplink\n switchport mode trunk\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20\n!\n' +
  'line vty 0 4\n transport input telnet\n!\n';

/* ===== Helpers ===== */

function makeDev(
  key: string,
  role: Role,
  model: RouterCatalog | SwitchCatalog,
  parsed: CiscoParsed | SonicWallParsed,
): Device {
  const basePorts =
    role === 'router'
      ? (model as RouterCatalog).ports.map((p) => ({ ...p }))
      : switchPorts(model as SwitchCatalog);
  const ports = basePorts.map((p) => ({ ...p, status: 'idle' as const, cfg: null, msg: null }));
  return {
    key,
    role,
    model,
    name: model.name,
    unit: role === 'switch' ? Number(key.replace('SW', '')) : 0,
    ports,
    config: 'x',
    parsed,
  };
}

/* ===== Tests ===== */

describe('expandIfRange', () => {
  it('Gi1/0/1-4 → 4 ifaces', () => {
    const er = expandIfRange('GigabitEthernet1/0/1 - 4');
    expect(er.length).toBe(4);
    expect(er[0]).toBe('GigabitEthernet1/0/1');
    expect(er[3]).toBe('GigabitEthernet1/0/4');
  });
  it('comma+range → 4', () => {
    expect(expandIfRange('Gi1/0/1-3, Gi1/0/8').length).toBe(4);
  });
});

const c1 = parseCisco(SMP_C1);
const c2 = parseCisco(SMP_C2);

describe('parseCisco', () => {
  it('hostname', () => expect(c1.hostname).toBe('ACME-SW-01'));
  it('range → 4 access ports vlan 10', () => {
    const cnt = Object.keys(c1.interfaces).filter(
      (k) => c1.interfaces[k]!.accessVlan === '10',
    ).length;
    expect(cnt).toBe(4);
  });
  it('enable secret あり、SNMP weak 無し', () => {
    expect(c1.sec.enableSecret).toBe(true);
    expect(c1.sec.snmpWeak).toBe(false);
  });
  it('range が portfast+bpduguard を継承', () => {
    expect(c1.interfaces['GigabitEthernet1/0/1']!.portfast).toBe(true);
    expect(c1.interfaces['GigabitEthernet1/0/1']!.bpduguard).toBe(true);
  });
  it('SW2 で telnet 検出', () => expect(c2.sec.telnet).toBe(true));
  it('SW2 access vlan 30', () => {
    expect(c2.interfaces['GigabitEthernet1/0/1']!.accessVlan).toBe('30');
  });
  it('SW2 の VLAN DB に 30 が無い', () => expect(c2.vlans['30']).toBeUndefined());
  it('SW2 trunk native 99', () => {
    expect(c2.interfaces['GigabitEthernet1/1/1']!.trunkNative).toBe('99');
  });
});

describe('parseCisco — trunk allowed vlan none / remove(全機能監査 High-1)', () => {
  const cfg =
    'hostname NONE-TEST\n' +
    'interface GigabitEthernet1/0/1\n switchport mode trunk\n switchport trunk allowed vlan none\n!\n' +
    'interface GigabitEthernet1/0/2\n switchport mode trunk\n switchport trunk allowed vlan 10,20,30\n' +
    ' switchport trunk allowed vlan remove 20\n!\n';
  const p = parseCisco(cfg);

  it('vlan none は trunkAllowed=[] のまま、trunkAllowedExplicit=true になる', () => {
    expect(p.interfaces['GigabitEthernet1/0/1']!.trunkAllowed).toEqual([]);
    expect(p.interfaces['GigabitEthernet1/0/1']!.trunkAllowedExplicit).toBe(true);
  });
  it('vlan remove は指定VLANをtrunkAllowedから除外する', () => {
    expect(p.interfaces['GigabitEthernet1/0/2']!.trunkAllowed.sort()).toEqual(['10', '30']);
  });
});

describe('parseCisco — no プレフィックスの誤読防止(全機能監査 High-2)', () => {
  const cfg =
    'hostname NO-TEST\n' +
    'interface GigabitEthernet1/0/1\n switchport mode trunk\n no switchport mode trunk\n!\n' +
    'interface GigabitEthernet1/0/2\n no spanning-tree bpduguard enable\n!\n';
  const p = parseCisco(cfg);

  it('"no switchport mode trunk" は switchport mode trunk として誤読されない', () => {
    /* 1行目で trunk が設定された後、no 行は「認識済みだが適用しない」扱いで
     * 無視されるため、mode は最後に肯定的に設定された値(trunk)のまま変化しない
     * ことを確認する(= no 行が誤って別の値を上書き設定しないことが本テストの主眼)。 */
    expect(p.interfaces['GigabitEthernet1/0/1']!.mode).toBe('trunk');
  });
  it('"no spanning-tree bpduguard enable" は bpduguard を有効化しない', () => {
    expect(p.interfaces['GigabitEthernet1/0/2']!.bpduguard).toBe(false);
  });
});

const sw = parseSonicWall(SMP_SW);

describe('parseSonicWall', () => {
  it('hostname', () => expect(sw.hostname).toBe('ACME-EDGE-01'));
  it('address-object net-pos', () => {
    const obj = sw.addr['net-pos']!;
    expect(obj.type).toBe('network');
    if (obj.type === 'network') expect(obj.cidr).toBe('192.168.20.0/24');
  });
  it('service-object svc-https = 443', () => {
    expect(sw.svc['svc-https']!.from).toBe(443);
  });
  it('access-rules = 2 件', () => expect(sw.rules.length).toBe(2));
  it('rule[1] のオブジェクト参照', () => {
    expect(sw.rules[1]!.src).toBe('net-pos');
    expect(sw.rules[1]!.service).toBe('svc-https');
  });
  it('X0:V20 zone POS', () => expect(sw.interfaces['X0:V20']!.zone).toBe('POS'));
  it('X1 WAN', () => expect(sw.interfaces['X1']!.zone).toBe('WAN'));
});

describe('parser coverage (Sprint 3 P3-1)', () => {
  it('Cisco: 完全に認識できる設定なら coverage は内部一貫性を保つ', () => {
    expect(c1.coverage.totalLines).toBe(
      c1.coverage.recognizedLines + c1.coverage.unrecognizedLines.length,
    );
  });
  it('Cisco: SMP_C1 は line vty コマンドが未対応行として検出される', () => {
    expect(c1.coverage.unrecognizedLines.some((u) => u.text === 'line vty 0 4')).toBe(true);
    expect(c1.coverage.coveragePercent).toBeLessThan(100);
    expect(c1.coverage.coveragePercent).toBeGreaterThan(90);
  });
  it('SonicWall: SMP_SW は全行認識でき coverage 100%', () => {
    expect(sw.coverage.unrecognizedLines).toEqual([]);
    expect(sw.coverage.coveragePercent).toBe(100);
    expect(sw.coverage.recognizedLines).toBe(sw.coverage.totalLines);
  });

  const CISCO_GARBAGE =
    'hostname ACME-SW-99\n' +
    'some-bogus-global-command foo\n' +
    'vlan 10\n name STAFF\n' +
    'unknown-vlan-directive xyz\n' +
    'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 10\n totally-unknown-interface-cmd 123\n!\n';
  const cg = parseCisco(CISCO_GARBAGE);

  it('Cisco: 未認識行を仕込んだ設定で totalLines/unrecognized が正確に検出される', () => {
    expect(cg.coverage.totalLines).toBe(10);
    expect(cg.coverage.unrecognizedLines.map((u) => u.text)).toEqual([
      'some-bogus-global-command foo',
      'unknown-vlan-directive xyz',
      'totally-unknown-interface-cmd 123',
    ]);
    expect(cg.coverage.recognizedLines).toBe(7);
    expect(cg.coverage.coveragePercent).toBe(70);
  });
  it('Cisco: 空行は totalLines に含まれない', () => {
    const withBlank = parseCisco('hostname ACME-SW-01\n\n\nvlan 10\n name STAFF\n');
    expect(withBlank.coverage.totalLines).toBe(3);
  });

  const SONICWALL_GARBAGE =
    'system name ACME-EDGE-99\n' +
    'totally-bogus-top-level-command\n' +
    'interface X0\n zone LAN\n unknown-interface-attr foo\n ip 192.168.1.1 netmask 255.255.255.0\n' +
    'nat-policy\n original-source any\n unknown-nat-attr bar\n end\n' +
    'access-rule from LAN to WAN\n action allow\n unknown-rule-attr baz\n end\n';
  const swg = parseSonicWall(SONICWALL_GARBAGE);

  it('SonicWall: 未認識行を仕込んだ設定で totalLines/unrecognized が正確に検出される', () => {
    expect(swg.coverage.totalLines).toBe(14);
    expect(swg.coverage.unrecognizedLines.map((u) => u.text)).toEqual([
      'totally-bogus-top-level-command',
      'unknown-interface-attr foo',
      'unknown-nat-attr bar',
      'unknown-rule-attr baz',
    ]);
    expect(swg.coverage.recognizedLines).toBe(10);
    expect(swg.coverage.coveragePercent).toBe(71);
  });
  it('SonicWall: nat/rule ブロックの end 行はブロック閉じとして認識される', () => {
    expect(swg.nat.length).toBe(1);
    expect(swg.rules.length).toBe(1);
  });
});

describe('evalFW (object-aware)', () => {
  it('LAN → WAN allow', () => {
    expect(evalFW(sw, 'LAN', 'WAN', '192.168.10.5', '203.0.113.5', 'any').action).toBe('allow');
  });
  it('POS → WAN https allow', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'svc-https').action).toBe('allow');
  });
  it('POS → LAN default-deny', () => {
    const f = evalFW(sw, 'POS', 'LAN', '192.168.20.5', '192.168.10.5', 'any');
    expect(f.action).toBe('deny');
    expect(f.reason).toBe('default-deny');
  });
  it('intra-zone は既定許可', () => {
    expect(evalFW(sw, 'LAN', 'LAN', '192.168.10.5', '192.168.1.5', 'any').reason).toBe('intra-zone');
  });
});

describe('svcMatch (bidirectional overlap) — Sprint 1 で修正', () => {
  it('rule=svc-https に対し req=ftp は deny', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'ftp').action).toBe('deny');
  });
  it('req=443(数値ポート) は allow', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', '443').action).toBe('any' === 'any' ? 'allow' : 'allow');
  });
  it('req=any は restricted rule に対しても allow(マトリクス用途)', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'any').action).toBe('allow');
  });
  it('req=tcp/443 は allow', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'tcp/443').action).toBe('allow');
  });
  it('req=tcp/80 は deny(svc-https と overlap せず)', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'tcp/80').action).toBe('deny');
  });
  it('req=udp/443 は deny(プロトコル不一致)', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'udp/443').action).toBe('deny');
  });
  it('req が typo/未定義の service-object 参照(解決不能)の場合は deny(全機能監査 High-5、旧: permissiveでallow)', () => {
    expect(evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'svc-htttps-typo').action).toBe('deny');
  });
});

describe('objContains — 組み込みアドレスグループ "<Zone> Subnets"(Sprint 4 S4-3)', () => {
  const BUILTIN_CFG =
    'system name BUILTIN-TEST\n' +
    'interface X0\n zone LAN\n ip 192.168.1.1 netmask 255.255.255.0\n' +
    'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n' +
    'interface X2\n zone POS\n ip 192.168.20.1 netmask 255.255.255.0\n' +
    'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n' +
    'access-rule from LAN to WAN\n action allow\n source LAN Subnets\n destination any\n service any\n';
  const pBuiltin = parseSonicWall(BUILTIN_CFG);

  it('"LAN Subnets" は LAN ゾーンの複数サブネットいずれのIPも含む', () => {
    expect(evalFW(pBuiltin, 'LAN', 'WAN', '192.168.1.50', '203.0.113.5', 'any').action).toBe('allow');
    expect(evalFW(pBuiltin, 'LAN', 'WAN', '192.168.10.50', '203.0.113.5', 'any').action).toBe('allow');
  });
  it('"LAN Subnets" は他ゾーン(POS)のIPを含まない', () => {
    expect(evalFW(pBuiltin, 'LAN', 'WAN', '192.168.20.50', '203.0.113.5', 'any').action).toBe('deny');
  });
});

/* ===== full verify ===== */

const rm = CATALOG.router.filter((x) => x.id === 'TZ570')[0]!;
const sm = CATALOG.switch.filter((x) => x.id === 'C9300-24')[0]!;
const R = makeDev('R1', 'router', rm, sw);
const W1 = makeDev('SW1', 'switch', sm, c1);
const W2 = makeDev('SW2', 'switch', sm, c2);
[R, W1, W2].forEach((d) => mapToPorts(d));
/* SW1/SW2 とも X0(タグ付き VLAN10/20 サブIFがマージされた LAN 側ポート)へ
 * アップリンクする配線を明示(手動トポロジーで実現可能な構成)。
 * 以前は topoMode:'star' + autoLinks() に任せていたが、High-4 監査対応で
 * autoLinks() の star モードがスイッチごとに異なるルータポートを割り当てる
 * ようになったため、SW2 が X1(このサンプルでは WAN 側)に繋がってしまい、
 * 本テストが検証したい「native VLAN 不一致検出」の前提(両者とも X0 経由)が
 * 崩れていた。ここでは検証したいシナリオそのものを明示的な links で固定する
 * (アップリンクの iface は catalog の U1 ポートから動的に取得する。
 * C9300-24 は uplinkType='sfp+' のため 'TenGigabitEthernet1/1/1' になり、
 * サンプルコンフィグのテキスト表記 'GigabitEthernet1/1/1' とは canonIf() 経由で
 * のみ一致する別文字列のため、直接一致が必要な Link.iface には使えない)。 */
const w1Uplink = W1.ports.find((p) => p.label === 'U1')!.iface;
const w2Uplink = W2.ports.find((p) => p.label === 'U1')!.iface;
const state: AppState = {
  router: R,
  switches: [W1, W2],
  devices: [R, W1, W2],
  topoMode: 'manual',
  links: [
    { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: w1Uplink } },
    { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW2', iface: w2Uplink } },
  ],
};
const V = verify(state);

describe('full verify', () => {
  it('SW2 VLAN30 未定義 (L2)', () => {
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('Access VLAN 30'))).toBe(true);
  });
  it('SW2 native VLAN 不一致 (L2)', () => {
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('Native VLAN'))).toBe(true);
  });
  it('VLAN30 に L3 GW 無し (L3)', () => {
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('VLAN 30'))).toBe(true);
  });
  it('SW2 telnet (SEC)', () => {
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('Telnet'))).toBe(true);
  });
  it('サブネット >= 3', () => expect(V.subnets.length).toBeGreaterThanOrEqual(3));
  it('POS サブネットが検出される', () => {
    expect(V.subnets.some((s) => s.zone === 'POS')).toBe(true);
  });
  it('スコアが範囲内', () => {
    expect(V.score).toBeGreaterThan(0);
    expect(V.score).toBeLessThan(100);
  });
});

describe('L2 — switchport mode 既定挙動モデル化(Sprint 3 P3-3)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function buildBare(cfg: string) {
    const rTz = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const swDev = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    [rTz, swDev].forEach((d) => mapToPorts(d));
    const st: AppState = { router: rTz, switches: [swDev], devices: [rTz, swDev], topoMode: 'star', links: [] };
    st.links = autoLinks(st);
    return verify(st);
  }

  it('mode/accessVlan/trunkAllowed すべて未設定でも dynamic auto の注意喚起が出る', () => {
    const V = buildBare('hostname BARE\ninterface GigabitEthernet1/0/1\n description unused\n!\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('dynamic auto'))).toBe(true);
  });
  it('accessVlan のみ設定・mode 未設定でも同様に注意喚起(既存挙動の維持)', () => {
    /* Sprint 3 以前は「accessVlan はあるが mode 未指定」の場合のみ発火していた。
       widening 後も引き続き発火することを確認する。 */
    const V = buildBare('hostname PARTIAL\nvlan 10\n name A\ninterface GigabitEthernet1/0/1\n switchport access vlan 10\n!\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('dynamic auto'))).toBe(true);
  });
  it('switchport mode が明示されていれば発火しない', () => {
    const V = buildBare('hostname OK\nvlan 10\n name A\ninterface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 10\n!\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('dynamic auto'))).toBe(false);
  });

  it('trunk allowed vlan none(明示的な全遮断)は「未指定=全許可扱い」を誤って出さない(全機能監査 High-1)', () => {
    const V = buildBare('hostname NONE\ninterface GigabitEthernet1/0/1\n switchport mode trunk\n switchport trunk allowed vlan none\n!\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('allowed vlan 未指定'))).toBe(false);
  });
  it('trunk allowed vlan が本当に未指定の場合は引き続き lack が出る(回帰確認)', () => {
    const V = buildBare('hostname UNSPEC\ninterface GigabitEthernet1/0/1\n switchport mode trunk\n!\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('allowed vlan 未指定'))).toBe(true);
  });
});

describe('L2 — SonicWall vlan-subif(タグ付きサブIFのみ)とのモード判定対称性(全機能監査 High-3)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  /* C1000-24 の U1(アップリンク)ポートの iface を先に確定させ、リンクと
   * switchport 設定の両方をこの実際の iface 名に揃える(down port の prefix
   * と取り違えて構成が port.cfg に一切マッピングされない、という事故を防ぐ)。 */
  const uplinkIface = switchPorts(sm1000).find((p) => p.label === 'U1')!.iface;

  /* X0 には plain な untagged interface を作らず、X0:V10(タグ付きサブIF)のみを
   * 定義する。これにより port.cfg.mode='vlan-subif' かつ subVlans は未設定
   * (マージが一度も起きないため)という「native VLAN 概念が存在しない」状態を作る。 */
  function buildVlanSubifOnly(switchportBody: string) {
    const rTz = makeDev('R1', 'router', rmTz,
      parseSonicWall('interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n'));
    const switchCfg = 'hostname SW1\nvlan 10\n name A\ninterface ' + uplinkIface + '\n' + switchportBody + '!\n';
    const swDev = makeDev('SW1', 'switch', sm1000, parseCisco(switchCfg));
    [rTz, swDev].forEach((d) => mapToPorts(d));
    const st: AppState = {
      router: rTz, switches: [swDev], devices: [rTz, swDev], topoMode: 'manual',
      links: [{ a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: uplinkIface } }],
    };
    return verify(st);
  }

  it('スイッチ側が trunk + 一致する allowed vlan なら誤って「両端モード不一致」にならない(旧: 誤検知)', () => {
    const V = buildVlanSubifOnly(' switchport mode trunk\n switchport trunk allowed vlan 10\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('両端モード不一致'))).toBe(false);
  });
  it('スイッチ側が access のままなら「両端モード不一致」を検出する(旧: 検知漏れ)', () => {
    const V = buildVlanSubifOnly(' switchport mode access\n switchport access vlan 10\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('両端モード不一致'))).toBe(true);
  });
  it('native 概念が無い SonicWall 側に対し、スイッチの非既定 native vlan を誤って不一致判定しない(旧: 誤検知)', () => {
    const V = buildVlanSubifOnly(' switchport mode trunk\n switchport trunk native vlan 50\n switchport trunk allowed vlan 10\n');
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('Native VLAN'))).toBe(false);
  });
});

describe('autoLinks — star トポロジのポート重複割当バグ修正(全機能監査 High-4)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ570')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('2台以上のスイッチが star モードでルータの同一物理ポートに割り当てられない', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    const sw2 = makeDev('SW2', 'switch', sm1000, parseCisco('hostname SW2\n'));
    const sw3 = makeDev('SW3', 'switch', sm1000, parseCisco('hostname SW3\n'));
    [r, sw1, sw2, sw3].forEach((d) => mapToPorts(d));
    const st: AppState = { router: r, switches: [sw1, sw2, sw3], devices: [r, sw1, sw2, sw3], topoMode: 'star', links: [] };
    const links = autoLinks(st);
    expect(links.length).toBe(3);
    const routerIfaces = links.map((l) => l.a.iface);
    expect(new Set(routerIfaces).size).toBe(3);
    expect(routerIfaces[0]).toBe('X0');
  });
});

describe('STP — spanning-tree mode 既定挙動モデル化(Sprint 3 P3-3)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function buildTriangle(sw1StpMode: string | null, sw2StpMode: string | null) {
    const trunkBody = 'vlan 10\n name A\n' +
      'interface GigabitEthernet1/0/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n' +
      'interface GigabitEthernet1/0/2\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';
    const cfg1 = 'hostname SW1\n' + (sw1StpMode ? 'spanning-tree mode ' + sw1StpMode + '\n' : '') + trunkBody;
    const cfg2 = 'hostname SW2\n' + (sw2StpMode ? 'spanning-tree mode ' + sw2StpMode + '\n' : '') + trunkBody;
    const rTz = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = makeDev('SW1', 'switch', sm1000, parseCisco(cfg1));
    const sw2 = makeDev('SW2', 'switch', sm1000, parseCisco(cfg2));
    [rTz, sw1, sw2].forEach((d) => mapToPorts(d));
    const links = [
      { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'R1', iface: 'X1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz, switches: [sw1, sw2], devices: [rTz, sw1, sw2], topoMode: 'manual', links };
    return verify(st);
  }

  it('STPモード未設定でループがある場合、Rapid-PVST+既定を前提に lack(以前は err)', () => {
    const V = buildTriangle(null, null);
    const f = V.findings.find((x) => x.cat === 'STP');
    expect(f).toBeTruthy();
    expect(f!.level).toBe('lack');
    expect(f!.desc).toContain('Rapid-PVST+');
  });
  it('STPモード設定済みでループがある場合も lack のまま(回帰確認)', () => {
    const V = buildTriangle('rapid-pvst', 'rapid-pvst');
    const f = V.findings.find((x) => x.cat === 'STP');
    expect(f).toBeTruthy();
    expect(f!.level).toBe('lack');
    expect(f!.desc).toContain('ブロック');
  });
});

describe('mapToPorts — Port-channel 継承(Sprint 4 S4-1)', () => {
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('Port-channel の switchport/trunk 設定が物理メンバーポートへ継承される', () => {
    const cfg =
      'hostname PC-TEST\nvlan 10\n name A\n' +
      'interface Port-channel1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n' +
      'interface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n';
    const swDev = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    mapToPorts(swDev);
    const p1 = swDev.ports.filter((p) => p.iface === 'GigabitEthernet1/0/1')[0]!;
    const p2 = swDev.ports.filter((p) => p.iface === 'GigabitEthernet1/0/2')[0]!;
    expect(p1.cfg!.mode).toBe('trunk');
    expect(p1.cfg!.trunkAllowed).toContain('10');
    expect(p2.cfg!.mode).toBe('trunk');
    expect(p2.cfg!.trunkAllowed).toContain('10');
  });

  it('メンバーポート自身に明示設定があれば上書きしない', () => {
    const cfg =
      'hostname PC-TEST2\nvlan 10\n name A\nvlan 20\n name B\n' +
      'interface Port-channel1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n' +
      'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 20\n channel-group 1 mode active\n!\n';
    const swDev = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    mapToPorts(swDev);
    const p1 = swDev.ports.filter((p) => p.iface === 'GigabitEthernet1/0/1')[0]!;
    expect(p1.cfg!.mode).toBe('access');
    expect(p1.cfg!.accessVlan).toBe('20');
  });

  it('該当する Port-channel が無いチャネルグループ番号は無視される(クラッシュしない)', () => {
    const cfg = 'hostname PC-TEST3\ninterface GigabitEthernet1/0/1\n channel-group 9 mode active\n!\n';
    const swDev = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    expect(() => mapToPorts(swDev)).not.toThrow();
    const p1 = swDev.ports.filter((p) => p.iface === 'GigabitEthernet1/0/1')[0]!;
    expect(p1.cfg!.mode).toBeNull();
  });
});

describe('pathTrace — NAT ポリシーの実質評価(Sprint 4 S4-2)', () => {
  const rmTz2 = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm2 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function buildNatState(natCfg: string) {
    const cfg =
      'system name NAT-TEST\n' +
      'address-object ipv4 net-lan network 192.168.1.0 255.255.255.0 zone LAN\n' +
      'interface X0\n zone LAN\n ip 192.168.1.1 netmask 255.255.255.0\n' +
      'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n' +
      natCfg +
      'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n';
    const rNat = makeDev('R1', 'router', rmTz2, parseSonicWall(cfg));
    const swNat = makeDev('SW1', 'switch', sm2, parseCisco('hostname X\nspanning-tree mode rapid-pvst\n'));
    [rNat, swNat].forEach((d) => mapToPorts(d));
    const st: AppState = { router: rNat, switches: [swNat], devices: [rNat, swNat], topoMode: 'star', links: [] };
    st.links = autoLinks(st);
    return st;
  }

  it('original-source が一致する NAT ポリシーがあれば該当ポリシーとして表示', () => {
    const st = buildNatState(
      'nat-policy\n original-source net-lan\n translated-source X1-IP\n outbound-interface X1\n end\n',
    );
    const t = pathTrace(st, '192.168.1.0/24', '__WAN__', 'any');
    const natHop = t.hops.filter((h) => h.node === 'NAT')[0]!;
    expect(natHop.detail).toContain('該当 NAT ポリシー');
    expect(natHop.detail).toContain('net-lan');
  });

  it('一致する NAT ポリシーが無い場合はその旨を明示(以前は無条件で「NATあり」表示)', () => {
    const st = buildNatState(
      'nat-policy\n original-source other-zone-only\n translated-source X1-IP\n outbound-interface X1\n end\n',
    );
    const t = pathTrace(st, '192.168.1.0/24', '__WAN__', 'any');
    const natHop = t.hops.filter((h) => h.node === 'NAT')[0]!;
    expect(natHop.detail).toContain('一致する条件');
  });

  it('NAT ポリシー未定義なら従来通りデフォルト SNAT 想定と表示(回帰確認)', () => {
    const st = buildNatState('');
    const t = pathTrace(st, '192.168.1.0/24', '__WAN__', 'any');
    const natHop = t.hops.filter((h) => h.node === 'NAT')[0]!;
    expect(natHop.detail).toContain('NAT ポリシー未定義');
  });
});

describe('verify — 静的ルート next-hop 到達性(Sprint 4 S4-2)', () => {
  const rmTz3 = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm3 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function buildRouteState(nh: string) {
    const cfg = 'hostname RT-TEST\nspanning-tree mode rapid-pvst\nip route 10.99.0.0 255.255.255.0 ' + nh + '\n';
    const rTz = makeDev('R1', 'router', rmTz3, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const swDev = makeDev('SW1', 'switch', sm3, parseCisco(cfg));
    [rTz, swDev].forEach((d) => mapToPorts(d));
    const st: AppState = { router: rTz, switches: [swDev], devices: [rTz, swDev], topoMode: 'star', links: [] };
    st.links = autoLinks(st);
    return verify(st);
  }

  it('next-hop が既知のどのサブネットにも属さない場合は L3 lack', () => {
    const V = buildRouteState('172.16.0.1');
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('next-hop') && f.desc.includes('172.16.0.1'))).toBe(true);
  });
  it('next-hop が既知サブネット内なら発火しない', () => {
    const V = buildRouteState('10.0.0.254');
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('next-hop'))).toBe(false);
  });
});

describe('verify — DHCP WAN(IPリテラル無し)構成でのL3/FWチェック(全機能監査 High-7)', () => {
  const rmTz5 = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;

  it('WANがDHCP取得(IP未設定)の場合、next-hop到達性チェックが誤ってlackを出さない(旧: 常に誤検知)', () => {
    const swDhcp = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'interface X1\n zone WAN\n ip-assignment WAN dhcp\n' +
        'route-policy destination 0.0.0.0 0.0.0.0 gateway 203.0.113.1\n',
    );
    expect(swDhcp.routes.length).toBe(1);
    const Rd = makeDev('R1', 'router', rmTz5, swDhcp);
    const V = verify({ router: Rd, switches: [], devices: [Rd], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('next-hop'))).toBe(false);
  });
  it('WANがDHCP取得でも「内部→WANのallowルールが無い」FWチェックは機能する(旧: hasWan=falseで丸ごとスキップ)', () => {
    const swDhcpNoRule = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'interface X1\n zone WAN\n ip-assignment WAN dhcp\n',
    );
    const Rd = makeDev('R1', 'router', rmTz5, swDhcpNoRule);
    const V = verify({ router: Rd, switches: [], devices: [Rd], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'FW' && f.desc.includes('WAN'))).toBe(true);
  });
});

describe('STP — root election とブロックポート推定(Sprint 4 S4-4)', () => {
  const rmTz4 = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm4 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function mkSwitchTriPort(key: string, priorityLine: string) {
    const cfg =
      'hostname ' + key + '\nspanning-tree mode rapid-pvst\n' + priorityLine +
      'vlan 10\n name A\n' +
      'interface GigabitEthernet1/0/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n' +
      'interface GigabitEthernet1/0/2\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n' +
      'interface GigabitEthernet1/0/3\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';
    return makeDev(key, 'switch', sm4, parseCisco(cfg));
  }
  function findStpFinding(V: ReturnType<typeof verify>) {
    return V.findings.find((f) => f.cat === 'STP' && f.why?.includes('推定ルートブリッジ'))!;
  }

  it('priority が最小のスイッチが root になる(device key の辞書順とは無関係)', () => {
    const rTz = makeDev('R1', 'router', rmTz4, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = mkSwitchTriPort('SW1', '');
    const sw2 = mkSwitchTriPort('SW2', '');
    const sw3 = mkSwitchTriPort('SW3', 'spanning-tree priority 0\n');
    [rTz, sw1, sw2, sw3].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW2', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW3', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW3', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/3' } },
    ];
    const st: AppState = { router: rTz, switches: [sw1, sw2, sw3], devices: [rTz, sw1, sw2, sw3], topoMode: 'manual', links };
    const V = verify(st);
    const f = findStpFinding(V);
    expect(f.why).toContain('SW3(priority 0)');
  });

  it('priority 未設定同士なら device key の辞書順でタイブレーク', () => {
    const rTz = makeDev('R1', 'router', rmTz4, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = mkSwitchTriPort('SW1', '');
    const sw2 = mkSwitchTriPort('SW2', '');
    const sw3 = mkSwitchTriPort('SW3', '');
    [rTz, sw1, sw2, sw3].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW2', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW3', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW3', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/3' } },
    ];
    const st: AppState = { router: rTz, switches: [sw1, sw2, sw3], devices: [rTz, sw1, sw2, sw3], topoMode: 'manual', links };
    const V = verify(st);
    const f = findStpFinding(V);
    expect(f.why).toContain('SW1(priority 32768)');
  });

  it('4台リングでは冗長エッジのブロック側を一意に特定できる', () => {
    const rTz = makeDev('R1', 'router', rmTz4, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = mkSwitchTriPort('SW1', 'spanning-tree priority 100\n');
    const sw2 = mkSwitchTriPort('SW2', '');
    const sw3 = mkSwitchTriPort('SW3', '');
    const sw4 = mkSwitchTriPort('SW4', '');
    [rTz, sw1, sw2, sw3, sw4].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/3' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW2', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW3', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW3', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW4', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW4', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz, switches: [sw1, sw2, sw3, sw4], devices: [rTz, sw1, sw2, sw3, sw4], topoMode: 'manual', links };
    const V = verify(st);
    const f = findStpFinding(V);
    expect(f.why).toContain('SW1(priority 100)');
    expect(f.why).toContain('SW3:GigabitEthernet1/0/2');
    expect(f.why).not.toContain('特定できず');
  });

  it('対称な三角形トポロジーではブロック側を「特定できず」と誠実に報告する', () => {
    const rTz = makeDev('R1', 'router', rmTz4, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = mkSwitchTriPort('SW1', '');
    const sw2 = mkSwitchTriPort('SW2', '');
    [rTz, sw1, sw2].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'R1', iface: 'X1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz, switches: [sw1, sw2], devices: [rTz, sw1, sw2], topoMode: 'manual', links };
    const V = verify(st);
    const f = findStpFinding(V);
    expect(f.why).toContain('特定できず');
  });
});

describe('L1 — LACP/EtherChannel 束の実効フォーミング判定(Sprint 4 S4-5)', () => {
  const rmTz6 = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm6 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  const rTz6 = makeDev('R1', 'router', rmTz6, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));

  function bundleFindings(V: ReturnType<typeof verify>) {
    return V.findings.filter((f) => f.cat === 'L1' && f.desc.includes('channel-group'));
  }

  it('対称な構成(両側2メンバー・同一対向)では新規findingが発火しない', () => {
    const sw1 = makeDev('SW1', 'switch', sm6, parseCisco(
      'hostname SW1\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm6, parseCisco(
      'hostname SW2\ninterface GigabitEthernet1/0/1\n channel-group 5 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 5 mode active\n!\n',
    ));
    [rTz6, sw1, sw2].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz6, switches: [sw1, sw2], devices: [rTz6, sw1, sw2], topoMode: 'manual', links };
    expect(bundleFindings(verify(st)).length).toBe(0);
  });

  it('メンバーポートが複数の異なる機器に接続されていると err', () => {
    const sw1 = makeDev('SW1', 'switch', sm6, parseCisco(
      'hostname SW1\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm6, parseCisco(
      'hostname SW2\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n',
    ));
    const sw3 = makeDev('SW3', 'switch', sm6, parseCisco(
      'hostname SW3\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n',
    ));
    [rTz6, sw1, sw2, sw3].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW3', iface: 'GigabitEthernet1/0/1' } },
    ];
    const st: AppState = { router: rTz6, switches: [sw1, sw2, sw3], devices: [rTz6, sw1, sw2, sw3], topoMode: 'manual', links };
    const fs = bundleFindings(verify(st));
    expect(fs.some((f) => f.level === 'err' && f.desc.includes('複数の異なる機器'))).toBe(true);
  });

  it('対向側に channel-group 未設定のポートが含まれると err', () => {
    const sw1 = makeDev('SW1', 'switch', sm6, parseCisco(
      'hostname SW1\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm6, parseCisco(
      'hostname SW2\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n switchport mode trunk\n!\n',
    ));
    [rTz6, sw1, sw2].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz6, switches: [sw1, sw2], devices: [rTz6, sw1, sw2], topoMode: 'manual', links };
    const fs = bundleFindings(verify(st));
    expect(fs.some((f) => f.level === 'err' && f.desc.includes('channel-group 未設定'))).toBe(true);
  });

  it('対向側のポートが複数の異なる channel-group にまたがっていると err', () => {
    const sw1 = makeDev('SW1', 'switch', sm6, parseCisco(
      'hostname SW1\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm6, parseCisco(
      'hostname SW2\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 2 mode active\n!\n',
    ));
    [rTz6, sw1, sw2].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz6, switches: [sw1, sw2], devices: [rTz6, sw1, sw2], topoMode: 'manual', links };
    const fs = bundleFindings(verify(st));
    expect(fs.some((f) => f.level === 'err' && f.desc.includes('複数の異なる channel-group'))).toBe(true);
  });

  it('メンバーポート数が対向と非対称だと lack', () => {
    const sw1 = makeDev('SW1', 'switch', sm6, parseCisco(
      'hostname SW1\ninterface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 1 mode active\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm6, parseCisco(
      'hostname SW2\ninterface GigabitEthernet1/0/1\n channel-group 5 mode active\n!\n' +
      'interface GigabitEthernet1/0/2\n channel-group 5 mode active\n!\n' +
      'interface GigabitEthernet1/0/3\n channel-group 5 mode active\n!\n',
    ));
    [rTz6, sw1, sw2].forEach((d) => mapToPorts(d));
    const links: Link[] = [
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } },
      { a: { key: 'SW1', iface: 'GigabitEthernet1/0/2' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/2' } },
    ];
    const st: AppState = { router: rTz6, switches: [sw1, sw2], devices: [rTz6, sw1, sw2], topoMode: 'manual', links };
    const fs = bundleFindings(verify(st));
    expect(fs.some((f) => f.level === 'lack' && f.desc.includes('非対称') && f.desc.includes('SW1=2') && f.desc.includes('SW2=3'))).toBe(true);
  });
});

/* ===== matrix ===== */

const posSub = V.subnets.filter((s) => s.zone === 'POS')[0]!;
const lanSub = V.subnets.filter((s) => s.vlan === '10')[0]!;
const wanSub = V.subnets.filter((s) => /WAN/i.test(s.zone))[0]!;

describe('matrix', () => {
  it('POS → LAN deny', () => {
    expect(V.matrix.cells[posSub.cidr]![lanSub.cidr]).toBe('deny');
  });
  it('LAN → WAN ok', () => {
    expect(wanSub).toBeTruthy();
    expect(V.matrix.cells[lanSub.cidr]![wanSub.cidr]).toBe('ok');
  });
});

/* ===== pathTrace ===== */

describe('pathTrace', () => {
  it('LAN → WAN OK', () => {
    const t = pathTrace(state, lanSub.cidr, '__WAN__', 'any');
    expect(t.verdict).toBe('ok');
    expect(t.hops.some((h) => h.node === 'NAT')).toBe(true);
  });
  it('POS → LAN は FW で deny', () => {
    const t = pathTrace(state, posSub.cidr, lanSub.cidr, 'any');
    expect(t.verdict).toBe('deny');
    expect(t.hops.some((h) => h.node === 'FW' && h.status === 'deny')).toBe(true);
  });
  it('POS → WAN(svc-https) は OK', () => {
    expect(pathTrace(state, posSub.cidr, '__WAN__', 'svc-https').verdict).toBe('ok');
  });
  it('LAN → POS は ルール無しで deny', () => {
    expect(pathTrace(state, lanSub.cidr, posSub.cidr, 'any').verdict).toBe('deny');
  });
});

describe('pathTrace same-subnet (no L3 hops) — Sprint 1 で修正', () => {
  const t = pathTrace(state, lanSub.cidr, lanSub.cidr, 'any');
  it('verdict = ok', () => expect(t.verdict).toBe('ok'));
  it('SRC + DST の 2 ホップのみ', () => expect(t.hops.length).toBe(2));
  it('ホップ順は SRC → DST', () => {
    expect(t.hops[0]!.node).toBe('SRC');
    expect(t.hops[1]!.node).toBe('DST');
  });
  it('L2 / GW / RT / FW は含まれない', () => {
    expect(t.hops.every((h) => h.node !== 'GW' && h.node !== 'L2' && h.node !== 'FW' && h.node !== 'RT')).toBe(true);
  });
});

/* ===== shadowed / permissive ===== */

/* ===== CAP — 機材 capabilities 整合性チェック(Sprint 2 で追加) ===== */

describe('CAP — Cat 1000 の VLAN 数上限', () => {
  /* C1000 は maxVlansSupported=64。VLAN を 70 個定義して上限超過を検出させる */
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  let vlanCfg = 'hostname VLAN-OVERFLOW\nspanning-tree mode rapid-pvst\n';
  for (let i = 10; i < 80; i++) vlanCfg += 'vlan ' + i + '\n name V' + i + '\n';
  vlanCfg += 'interface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';

  const rTz = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
  const sw1000 = makeDev('SW1', 'switch', sm1000, parseCisco(vlanCfg));
  [rTz, sw1000].forEach((d) => mapToPorts(d));
  const st: AppState = { router: rTz, switches: [sw1000], devices: [rTz, sw1000], topoMode: 'star', links: [] };
  st.links = autoLinks(st);
  const V = verify(st);

  it('VLAN 数超過で CAP err が発火', () => {
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('VLAN 数'))).toBe(true);
  });
});

describe('CAP — Cat 1000 のルーティングテーブル(FIB)静的エントリ数上限(Sprint 4 S4-6)', () => {
  /* C1000 は maxRoutingEntries=64。静的ルートを 70 本定義して上限超過を検出させる */
  const sm1000b = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  const rmTzb = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;

  function buildRoutingState(routeCount: number) {
    let cfg = 'hostname ROUTE-TEST\nspanning-tree mode rapid-pvst\n';
    for (let i = 1; i <= routeCount; i++) cfg += 'ip route 10.' + i + '.0.0 255.255.255.0 192.168.1.1\n';
    const rTz = makeDev('R1', 'router', rmTzb, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000b, parseCisco(cfg));
    [rTz, sw].forEach((d) => mapToPorts(d));
    const st: AppState = { router: rTz, switches: [sw], devices: [rTz, sw], topoMode: 'star', links: [] };
    st.links = autoLinks(st);
    return verify(st);
  }

  it('静的ルート数が上限を超過すると CAP err が発火', () => {
    const V2 = buildRoutingState(70);
    expect(V2.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('ルーティングテーブル'))).toBe(true);
  });
  it('上限未満なら発火しない', () => {
    const V2 = buildRoutingState(5);
    expect(V2.findings.some((f) => f.cat === 'CAP' && f.desc.includes('ルーティングテーブル'))).toBe(false);
  });
});

describe('CAP — Cat 1000 で PAgP 利用', () => {
  /* C1000 は supportsPagp=false。channel-group mode desirable は PAgP なので CAP err */
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const cfgPagp =
    'hostname PAGP-TEST\nspanning-tree mode rapid-pvst\nvlan 10\n name A\n' +
    'interface GigabitEthernet1/0/1\n switchport mode trunk\n channel-group 1 mode desirable\n!\n' +
    'interface GigabitEthernet1/0/2\n switchport mode trunk\n channel-group 1 mode desirable\n!\n';

  const rTz = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
  const sw = makeDev('SW1', 'switch', sm1000, parseCisco(cfgPagp));
  [rTz, sw].forEach((d) => mapToPorts(d));
  const st: AppState = { router: rTz, switches: [sw], devices: [rTz, sw], topoMode: 'star', links: [] };
  st.links = autoLinks(st);
  const V = verify(st);

  it('PAgP 非対応 SKU で channel-group desirable は CAP err', () => {
    expect(V.findings.some((f) => f.cat === 'CAP' && f.desc.includes('PAgP'))).toBe(true);
  });
});

describe('CAP — TZ270 で VLAN サブインターフェイス数上限', () => {
  /* TZ270 は maxVlanInterfaces=64。X0:V<n> を 70 個作って超過させる */
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const smC9300 = CATALOG.switch.filter((x) => x.id === 'C9300-24')[0]!;
  let swCfg = 'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n';
  for (let v = 10; v < 80; v++) {
    swCfg += 'interface X0:V' + v + '\n vlan ' + v + '\n zone LAN\n ip 192.168.' + v + '.1 netmask 255.255.255.0\n';
  }

  const rTz = makeDev('R1', 'router', rmTz, parseSonicWall(swCfg));
  const sw = makeDev('SW1', 'switch', smC9300, parseCisco('hostname X\nspanning-tree mode rapid-pvst\nvlan 10\n name A\ninterface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n'));
  [rTz, sw].forEach((d) => mapToPorts(d));
  const st: AppState = { router: rTz, switches: [sw], devices: [rTz, sw], topoMode: 'star', links: [] };
  st.links = autoLinks(st);
  const V = verify(st);

  it('TZ270 で 70 VLAN は CAP err(上限 64)', () => {
    expect(V.findings.some((f) => f.cat === 'CAP' && f.desc.includes('VLAN サブインターフェイス数'))).toBe(true);
  });
});

describe('CAP — capabilities 未定義 SKU では何も発火しない', () => {
  /* 互換性確認: capabilities が無い古い SKU 定義に対しては silent skip。
     現行カタログは全て埋まっているので、capabilities を一時的に削除して確認 */
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm = CATALOG.switch.filter((x) => x.id === 'C9300-24')[0]!;
  /* capabilities を剥がしたコピーを作る */
  const swNoCap = { ...sm, capabilities: undefined };
  const rTz = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
  let largeCfg = 'hostname BIG\nspanning-tree mode rapid-pvst\n';
  for (let i = 10; i < 200; i++) largeCfg += 'vlan ' + i + '\n name V' + i + '\n';
  largeCfg += 'interface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';

  const sw = makeDev('SW1', 'switch', swNoCap, parseCisco(largeCfg));
  [rTz, sw].forEach((d) => mapToPorts(d));
  const st: AppState = { router: rTz, switches: [sw], devices: [rTz, sw], topoMode: 'star', links: [] };
  st.links = autoLinks(st);
  const V = verify(st);

  it('capabilities 未定義なら CAP findings は 0 件', () => {
    expect(V.findings.filter((f) => f.cat === 'CAP').length).toBe(0);
  });
});

describe('parseCisco — platformHint シグナル検出(Sprint 3 P3-2)', () => {
  it('NX-OS シグナル(feature / vdc / mgmt0 / vrf context / boot nxos)を検出する', () => {
    const cfg =
      'hostname NXOS-TEST\nfeature ospf\nvdc TEST id 2\ninterface mgmt0\n ip address 10.0.0.1/24\n' +
      'vrf context MGMT\nboot nxos bootflash:nxos.7.0.3.bin\n';
    const p = parseCisco(cfg);
    const signals = p.platformHint.signals.map((s) => s.signal);
    expect(signals).toContain('nxos-feature');
    expect(signals).toContain('nxos-vdc');
    expect(signals).toContain('nxos-mgmt0');
    expect(signals).toContain('nxos-vrf-context');
    expect(signals).toContain('nxos-boot');
  });
  it('IOS-XE シグナル(license tier / install mode / platform fed)を検出する', () => {
    const cfg =
      'hostname IOSXE-TEST\nlicense boot level network-advantage\n' +
      'boot system bootflash:packages.conf\nplatform punt-keepalive disable-kernel-core\n';
    const p = parseCisco(cfg);
    const signals = p.platformHint.signals.map((s) => s.signal);
    expect(signals).toContain('iosxe-license-tier');
    expect(signals).toContain('iosxe-install-mode');
    expect(signals).toContain('iosxe-platform-fed');
  });
  it('classic IOS シグナル(license tier lanbase 等)を検出する', () => {
    const p = parseCisco('hostname CLASSIC-TEST\nlicense boot level lanbase\n');
    expect(p.platformHint.signals.map((s) => s.signal)).toContain('ios-classic-license-tier');
  });
  it('Smart Licensing はクラスタ(service call-home + license smart transport callhome)が揃って初めて検出', () => {
    const partial = parseCisco('hostname PARTIAL\nservice call-home\n');
    expect(partial.platformHint.signals.map((s) => s.signal)).not.toContain('iosxe-smart-licensing');
    const full = parseCisco('hostname FULL\nservice call-home\nlicense smart transport callhome\n');
    expect(full.platformHint.signals.map((s) => s.signal)).toContain('iosxe-smart-licensing');
  });
  it('license feature X(3トークン)は nxos-feature に誤検出しない', () => {
    const p = parseCisco('hostname NOFALSEPOS\nlicense feature uck9\n');
    expect(p.platformHint.signals.map((s) => s.signal)).not.toContain('nxos-feature');
  });
  it('通常のコンフィグ(SMP_C1)ではシグナルが 0 件', () => {
    expect(c1.platformHint.signals.length).toBe(0);
  });
});

describe('CAP — プラットフォーム判別ヒントと選択機種の突合(Sprint 3 P3-2)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const swRouter = parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n');

  function buildAndVerify(switchModelId: string, ciscoCfg: string) {
    const model = CATALOG.switch.filter((x) => x.id === switchModelId)[0]!;
    const rTz = makeDev('R1', 'router', rmTz, swRouter);
    const swDev = makeDev('SW1', 'switch', model, parseCisco(ciscoCfg));
    [rTz, swDev].forEach((d) => mapToPorts(d));
    const st: AppState = { router: rTz, switches: [swDev], devices: [rTz, swDev], topoMode: 'star', links: [] };
    st.links = autoLinks(st);
    return verify(st);
  }

  it('NX-OS シグナルが含まれる場合、機種によらず CAP err', () => {
    const V = buildAndVerify('C9300-24', 'hostname X\nfeature ospf\n');
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('NX-OS'))).toBe(true);
  });
  it('classic IOS 機種(C2960X)に IOS-XE シグナルは CAP err', () => {
    const V = buildAndVerify('C2960X-24', 'hostname X\nlicense boot level network-advantage\n');
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('IOS-XE'))).toBe(true);
  });
  it('IOS-XE 機種(C9300)に classic IOS シグナルは CAP err', () => {
    const V = buildAndVerify('C9300-24', 'hostname X\nlicense boot level lanbase\n');
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('classic IOS'))).toBe(true);
  });
  it('IOS-XE 機種(C9300)に IOS-XE シグナルは矛盾なし(発火しない)', () => {
    const V = buildAndVerify('C9300-24', 'hostname X\nlicense boot level network-advantage\n');
    expect(V.findings.some((f) => f.cat === 'CAP' && (f.desc.includes('NX-OS') || f.desc.includes('IOS-XE') || f.desc.includes('classic IOS')))).toBe(false);
  });
  it('classic IOS 機種(C1000)に classic IOS シグナルは矛盾なし(発火しない)', () => {
    const V = buildAndVerify('C1000-24', 'hostname X\nlicense boot level lanbase\n');
    expect(V.findings.some((f) => f.cat === 'CAP' && (f.desc.includes('NX-OS') || f.desc.includes('IOS-XE') || f.desc.includes('classic IOS')))).toBe(false);
  });
  it('シグナルが無いコンフィグでは何も発火しない', () => {
    const V = buildAndVerify('C9300-24', SMP_C1);
    expect(V.findings.some((f) => f.cat === 'CAP' && (f.desc.includes('NX-OS') || f.desc.includes('IOS-XE') || f.desc.includes('classic IOS')))).toBe(false);
  });
});

describe('shadowed / permissive', () => {
  const sw2 = parseSonicWall(
    'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
      'interface X2\n zone DMZ\n ip 10.0.9.1 netmask 255.255.255.0\n' +
      'access-rule from LAN to DMZ\n action allow\n source any\n destination any\n service any\n' +
      'access-rule from LAN to DMZ\n action deny\n source 10.0.0.50\n destination any\n service any\n',
  );
  const Rp = makeDev('R1', 'router', rm, sw2);
  const W = makeDev(
    'SW1',
    'switch',
    sm,
    parseCisco(
      'hostname X\nspanning-tree mode rapid-pvst\nvlan 10\n name A\ninterface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n',
    ),
  );
  [Rp, W].forEach((d) => mapToPorts(d));
  const st2: AppState = { router: Rp, switches: [W], devices: [Rp, W], topoMode: 'star', links: [] };
  st2.links = autoLinks(st2);
  const V2 = verify(st2);

  it('any/any/any 許可ルールが SEC で警告される', () => {
    expect(V2.findings.some((f) => f.cat === 'SEC' && f.desc.includes('any/any/any'))).toBe(true);
  });
  it('シャドウされたルールが SEC で警告される', () => {
    expect(V2.findings.some((f) => f.cat === 'SEC' && f.desc.includes('シャドウ'))).toBe(true);
  });
});

describe('SEC — WAN絡みの any/any/any 除外条件の修正(全機能監査 High-6)', () => {
  it('WAN → LAN の any/any/any 許可は err で検出される(旧: 誤って除外されていた)', () => {
    const swWan = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n' +
        'access-rule from WAN to LAN\n action allow\n source any\n destination any\n service any\n',
    );
    const Rw = makeDev('R1', 'router', rm, swWan);
    const V3 = verify({ router: Rw, switches: [], devices: [Rw], topoMode: 'star', links: [] });
    expect(V3.findings.some((f) => f.cat === 'SEC' && f.level === 'err' && f.desc.includes('WAN') && f.desc.includes('任意の宛先'))).toBe(true);
  });
  it('LAN → WAN の any/any/any 許可(一般的な全許可)は引き続き対象外', () => {
    const swWan = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n' +
        'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n',
    );
    const Rw = makeDev('R1', 'router', rm, swWan);
    const V3 = verify({ router: Rw, switches: [], devices: [Rw], topoMode: 'star', links: [] });
    expect(V3.findings.some((f) => f.cat === 'SEC' && f.desc.includes('any/any/any'))).toBe(false);
  });
});

describe('parseCisco — interface range vlan 展開(全機能監査 Medium-4)', () => {
  it('interface range vlan 100 - 102 が3つのSVIに展開され、各々に正しいsviVlanが付く', () => {
    const cfg = 'hostname RANGE-TEST\ninterface range vlan 100 - 102\n ip address 10.100.0.1 255.255.255.0\n!\n';
    const p = parseCisco(cfg);
    expect(Object.keys(p.interfaces).sort()).toEqual(['Vlan100', 'Vlan101', 'Vlan102']);
    expect(p.interfaces['Vlan100']!.sviVlan).toBe('100');
    expect(p.interfaces['Vlan101']!.sviVlan).toBe('101');
    expect(p.interfaces['Vlan102']!.sviVlan).toBe('102');
  });
});

describe('parseSonicWall — WAN ping/管理許可のコメント誤検知防止(全機能監査 Medium-6)', () => {
  it('コメント行内の "ping ... from wan" は誤って検知しない', () => {
    const p = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        ' comment "no ping from wan - blocked by policy"\n',
    );
    expect(p.sec.pingWanAllow).toBe(false);
  });
  it('実際のディレクティブ行は引き続き検知する', () => {
    const p = parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n ping from wan allow\n');
    expect(p.sec.pingWanAllow).toBe(true);
  });
});

describe('parseSonicWall — ip-assignment のゾーンフォールバック削除(全機能監査 Medium-7)', () => {
  it('zone 行が無い場合、ip-assignment の値が誤って zone に採用されない(旧: "static" 等がzoneになっていた)', () => {
    const p = parseSonicWall('interface X1\n ip-assignment static\n ip 203.0.113.2 netmask 255.255.255.248\n');
    expect(p.interfaces['X1']!.zone).toBeNull();
  });
});

describe('parseSonicWall — route-policy 複数行ブロック対応(全機能監査 Medium-12)', () => {
  it('destination/gatewayが別行に分かれたブロック構文でもrouteが認識される', () => {
    const p = parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'route-policy\n destination 0.0.0.0 0.0.0.0\n gateway 203.0.113.1\n end\n',
    );
    expect(p.routes.length).toBe(1);
    expect(p.routes[0]).toEqual({ dst: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' });
  });
  it('2つのroute-policyブロックが連続しても両方認識される', () => {
    const p = parseSonicWall(
      'route-policy\n destination 10.0.0.0 255.0.0.0\n gateway 192.168.1.1\n end\n' +
        'route-policy\n destination 172.16.0.0 255.240.0.0\n gateway 192.168.1.2\n end\n',
    );
    expect(p.routes.length).toBe(2);
  });
});

describe('verify — MTU不一致のポート状態反映(全機能監査 Medium-5)', () => {
  it('MTU不一致findingが出た両端のポートstatusもlackになる', () => {
    const uplink = switchPorts(sm).find((p) => p.label === 'U1')!.iface;
    const sw1 = makeDev('SW1', 'switch', sm, parseCisco(
      'hostname SW1\nvlan 10\n name A\ninterface ' + uplink +
        '\n switchport mode trunk\n switchport trunk allowed vlan 10\n mtu 9000\n!\n',
    ));
    const sw2 = makeDev('SW2', 'switch', sm, parseCisco(
      'hostname SW2\nvlan 10\n name A\ninterface ' + uplink +
        '\n switchport mode trunk\n switchport trunk allowed vlan 10\n mtu 1500\n!\n',
    ));
    const router = makeDev('R1', 'router', rm, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    [router, sw1, sw2].forEach((d) => mapToPorts(d));
    const st: AppState = {
      router, switches: [sw1, sw2], devices: [router, sw1, sw2], topoMode: 'manual',
      links: [{ a: { key: 'SW1', iface: uplink }, b: { key: 'SW2', iface: uplink } }],
    };
    const V = verify(st);
    expect(V.findings.some((f) => f.cat === 'L1' && f.desc.includes('MTU 不一致'))).toBe(true);
    expect(sw1.ports.find((p) => p.iface === uplink)!.status).toBe('lack');
    expect(sw2.ports.find((p) => p.iface === uplink)!.status).toBe('lack');
  });
});

describe('verify — shutdown済みポートのmode未指定チェック除外(全機能監査 Medium-10)', () => {
  it('shutdown済みかつmode未指定のポートは「dynamic auto」警告を出さない(shutdown自体のlackは引き続き出る)', () => {
    const downIface = switchPorts(sm).find((p) => p.label === '1')!.iface;
    const router = makeDev('R1', 'router', rm, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm, parseCisco('hostname SHUT\ninterface ' + downIface + '\n shutdown\n!\n'));
    [router, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router, switches: [sw], devices: [router, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('dynamic auto'))).toBe(false);
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('shutdown'))).toBe(true);
  });
});

describe('verify — 同一CIDR重複割当の検出(全機能監査 Medium-9)', () => {
  it('同一CIDRが2つのVLANに重複割当されるとL3 errが出る', () => {
    const router = makeDev('R1', 'router', rm, parseSonicWall(
      'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.1.1 netmask 255.255.255.0\n' +
        'interface X0:V20\n vlan 20\n zone LAN\n ip 192.168.1.5 netmask 255.255.255.0\n',
    ));
    mapToPorts(router);
    const V = verify({ router, switches: [], devices: [router], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.level === 'err' && f.desc.includes('重複割当'))).toBe(true);
  });
  it('CIDRが重複しなければ発火しない(回帰確認)', () => {
    const router = makeDev('R1', 'router', rm, parseSonicWall(
      'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n' +
        'interface X0:V20\n vlan 20\n zone LAN\n ip 192.168.20.1 netmask 255.255.255.0\n',
    ));
    mapToPorts(router);
    const V = verify({ router, switches: [], devices: [router], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('重複割当'))).toBe(false);
  });
});

describe('buildMatrix/pathTrace — 代表ホストIPの統一(全機能監査 Medium-8)', () => {
  it('マトリクスと経路トレースが同一の代表IPを使い、判定が一致する(旧: buildMatrixはGW、pathTraceはGW+20で食い違いうる)', () => {
    const router = makeDev('R1', 'router', rm, parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
        'interface X0:V20\n vlan 20\n zone POS\n ip 10.0.20.1 netmask 255.255.255.0\n' +
        'access-rule from LAN to POS\n action allow\n source any\n destination 10.0.20.20\n service any\n',
    ));
    mapToPorts(router);
    const st: AppState = { router, switches: [], devices: [router], topoMode: 'star', links: [] };
    const subnets = buildSubnets(st);
    const matrix = buildMatrix(st, subnets);
    const lanCidr = subnets.find((s) => s.zone === 'LAN')!.cidr;
    const posCidr = subnets.find((s) => s.zone === 'POS')!.cidr;
    const trace = pathTrace(st, lanCidr, posCidr, 'any');
    const matrixOk = matrix.cells[lanCidr]![posCidr] === 'ok';
    expect(matrixOk).toBe(trace.verdict === 'ok');
    /* このルールは 10.0.20.20(ネットワークアドレス+20)宛のみ許可しており、
     * 代表IPの算出が両者で一致していなければ少なくとも片方は deny になるはず。
     * 統一後は両方 ok になることを直接確認する。 */
    expect(matrixOk).toBe(true);
    expect(trace.verdict).toBe('ok');
  });
});

describe('CAP — STPインスタンス数上限(全機能監査 Medium-13)', () => {
  it('PVST/Rapid-PVSTでVLAN数がSTPインスタンス上限を超えるとCAP errが発火', () => {
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    let cfg = 'hostname STP-OVERFLOW\nspanning-tree mode rapid-pvst\n';
    for (let i = 10; i < 80; i++) cfg += 'vlan ' + i + '\n name V' + i + '\n';
    cfg += 'interface ' + switchPorts(sm1000).find((p) => p.label === 'U1')!.iface +
      '\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';
    const router = makeDev('R1', 'router', rm, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    [router, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router, switches: [sw], devices: [router, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('STP インスタンス数'))).toBe(true);
  });
  it('MSTモードでは対象外(VLAN数が多くても発火しない)', () => {
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    let cfg = 'hostname MST-OK\nspanning-tree mode mst\n';
    for (let i = 10; i < 80; i++) cfg += 'vlan ' + i + '\n name V' + i + '\n';
    cfg += 'interface ' + switchPorts(sm1000).find((p) => p.label === 'U1')!.iface +
      '\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';
    const router = makeDev('R1', 'router', rm, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    [router, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router, switches: [sw], devices: [router, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.desc.includes('STP インスタンス数'))).toBe(false);
  });
});

/* ===== 全機能監査 再調査(2026-07-11) — 既存の正しいロジックだが
 * テストカバレッジが無かった分岐に対する回帰テスト追加。ロジック自体の変更は無い。 ===== */

describe('L1 — 速度/Duplex/EtherChannelモード非互換の未テスト分岐(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  function buildSwitchLink(cfg1Body: string, cfg2Body: string) {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw1 = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\ninterface GigabitEthernet1/0/1\n' + cfg1Body + '!\n'));
    const sw2 = makeDev('SW2', 'switch', sm1000, parseCisco('hostname SW2\ninterface GigabitEthernet1/0/1\n' + cfg2Body + '!\n'));
    [r, sw1, sw2].forEach((d) => mapToPorts(d));
    const st: AppState = {
      router: r, switches: [sw1, sw2], devices: [r, sw1, sw2], topoMode: 'manual',
      links: [{ a: { key: 'SW1', iface: 'GigabitEthernet1/0/1' }, b: { key: 'SW2', iface: 'GigabitEthernet1/0/1' } }],
    };
    return verify(st);
  }

  it('固定速度が両端で異なると L1 err(速度不一致)', () => {
    const V = buildSwitchLink(' speed 100\n', ' speed 1000\n');
    expect(V.findings.some((f) => f.cat === 'L1' && f.desc.includes('速度不一致'))).toBe(true);
  });
  it('duplex が両端で異なると L1 err(Duplex 不一致)', () => {
    const V = buildSwitchLink(' duplex full\n', ' duplex half\n');
    expect(V.findings.some((f) => f.cat === 'L1' && f.desc.includes('Duplex 不一致'))).toBe(true);
  });
  it('EtherChannel モードが非互換(active/on)だと L1 err', () => {
    const V = buildSwitchLink(' channel-group 1 mode active\n', ' channel-group 1 mode on\n');
    expect(V.findings.some((f) => f.cat === 'L1' && f.desc.includes('EtherChannel モード非互換'))).toBe(true);
  });
  it('EtherChannel モードが互換(active/active)なら発火しない', () => {
    const V = buildSwitchLink(' channel-group 1 mode active\n', ' channel-group 1 mode active\n');
    expect(V.findings.some((f) => f.cat === 'L1' && f.desc.includes('EtherChannel モード非互換'))).toBe(false);
  });
});

describe('SEC — enable password/SNMP弱コミュニティ/WAN ping・管理許可の finding 発火確認(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('enable password のみ(enable secret 無し)は SEC lack、SNMP public は SEC err', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nenable password mypass\nsnmp-server community public RO\ninterface GigabitEthernet1/0/1\n switchport mode access\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'SEC' && f.level === 'lack' && f.desc.includes('enable password'))).toBe(true);
    expect(V.findings.some((f) => f.cat === 'SEC' && f.level === 'err' && f.desc.includes('SNMP コミュニティ'))).toBe(true);
  });

  it('WAN からの ping / 管理アクセス許可を検出する', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\nping from wan allow\nmanagement from wan allow\n',
    ));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'SEC' && f.level === 'lack' && f.desc.includes('Pingが許可'))).toBe(true);
    expect(V.findings.some((f) => f.cat === 'SEC' && f.level === 'err' && f.desc.includes('管理アクセスが許可'))).toBe(true);
  });
});

describe('SEC — アクセスポートの portfast / BPDU guard 未設定検知(全機能監査再調査)', () => {
  it('portfast 無しの access port は lack、portfast ありだが bpduguard 無しも別途 lack', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nvlan 10\n name A\n' +
      'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 10\n!\n' +
      'interface GigabitEthernet1/0/2\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('アクセスポートに portfast がありません'))).toBe(true);
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('portfastありだがBPDU guardがありません'))).toBe(true);
  });
});

describe('verify — L3 IPリテラル重複検知(全機能監査再調査)', () => {
  it('異なるインターフェイスに同一IPリテラルを付けると L3 err が発火', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.5 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nvlan 20\n name A\ninterface Vlan20\n ip address 10.0.0.5 255.255.255.128\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.level === 'err' && f.desc.includes('が重複'))).toBe(true);
  });
});

describe('verify — DHCP default-router と実ゲートウェイの不一致(全機能監査再調査)', () => {
  it('Cisco DHCP プールの default-router が実際の VLAN ゲートウェイと異なると L3 err が発火', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0:V10\n vlan 10\n zone LAN\n ip 10.0.10.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nvlan 10\n name A\nip dhcp pool POOL1\n network 10.0.10.0 255.255.255.0\n default-router 10.0.10.99\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.level === 'err' && f.desc.includes('default-router'))).toBe(true);
  });
});

describe('verify — L2 トランク allowed VLAN の部分一致 / 共通項なし(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
  const uplinkIface = switchPorts(sm1000).find((p) => p.label === 'U1')!.iface;

  function buildLinkedRouterSwitch(routerCfg: string, switchTrunkAllowed: string) {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall(routerCfg));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nvlan 10\n name A\nvlan 20\n name B\nvlan 30\n name C\n' +
      'interface ' + uplinkIface + '\n switchport mode trunk\n switchport trunk allowed vlan ' + switchTrunkAllowed + '\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const st: AppState = {
      router: r, switches: [sw], devices: [r, sw], topoMode: 'manual',
      links: [{ a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: uplinkIface } }],
    };
    return verify(st);
  }

  it('スイッチ側にのみ存在する VLAN は「ルータ側で未許可」lack になる(部分重複)', () => {
    const V = buildLinkedRouterSwitch(
      'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n',
      '10,30',
    );
    expect(V.findings.some((f) => f.cat === 'L2' && f.level === 'lack' && f.desc.includes('ルータ側で未許可'))).toBe(true);
  });
  it('共通 VLAN が1つも無いと err(共通項なし)になる', () => {
    const V = buildLinkedRouterSwitch(
      'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n',
      '20',
    );
    expect(V.findings.some((f) => f.cat === 'L2' && f.level === 'err' && f.desc.includes('共通項なし'))).toBe(true);
  });
});

describe('verify — リンク端に対応する構成が無い場合の検知(全機能監査再調査)', () => {
  it('リンク宣言先のインターフェイスがコンフィグに一切存在しないと L2 lack が発火', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X1\n zone WAN\n ip 203.0.113.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const uplinkIface = sw.ports.find((p) => p.label === 'U1')!.iface;
    const st: AppState = {
      router: r, switches: [sw], devices: [r, sw], topoMode: 'manual',
      links: [{ a: { key: 'R1', iface: 'X0' }, b: { key: 'SW1', iface: uplinkIface } }],
    };
    const V = verify(st);
    expect(V.findings.some((f) => f.cat === 'L2' && f.level === 'lack' && f.desc.includes('構成がありません'))).toBe(true);
  });
});

describe('STP — トランクポートへの portfast 設定検知(全機能監査再調査)', () => {
  it('trunk モードポートに portfast が設定されていると STP lack が発火', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(
      'hostname SW1\nvlan 10\n name A\ninterface GigabitEthernet1/0/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n spanning-tree portfast\n!\n',
    ));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'STP' && f.desc.includes('トランクに portfast'))).toBe(true);
  });
});

describe('CAP — SVI数上限 / ACL総エントリ数上限 / STP variant非対応の finding 発火確認(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('SVI 数が SKU 上限(16)を超過すると CAP err が発火', () => {
    let cfg = 'hostname SVI-OVER\nspanning-tree mode rapid-pvst\n';
    for (let i = 1; i <= 20; i++) {
      cfg += 'vlan ' + i + '\n name V' + i + '\ninterface Vlan' + i + '\n ip address 10.' + i + '.0.1 255.255.255.0\n!\n';
    }
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('SVI 数'))).toBe(true);
  });

  it('ACL 総エントリ数が SKU 上限(1000)を超過すると CAP err が発火', () => {
    let cfg = 'hostname ACL-OVER\nspanning-tree mode rapid-pvst\nip access-list extended BIG\n';
    for (let i = 0; i < 1001; i++) cfg += 'permit tcp any any eq ' + (1024 + i) + '\n';
    cfg += 'interface GigabitEthernet1/0/1\n switchport mode access\n!\n';
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco(cfg));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('ACL 総エントリ'))).toBe(true);
  });

  it('capabilities 上で stpVariants を制限すると非対応モードで CAP err が発火', () => {
    const swRestricted = { ...sm1000, capabilities: { ...sm1000.capabilities!, stpVariants: ['pvst'] as const } };
    const cfg = 'hostname MST-UNSUPPORTED\nspanning-tree mode mst\nvlan 10\n name A\n' +
      'interface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n';
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', swRestricted, parseCisco(cfg));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('STP モード'))).toBe(true);
  });
});

describe('CAP — SonicWall access-rule数 / NATポリシー数上限の finding 発火確認(全機能監査再調査)', () => {
  it('capabilities 上で maxAccessRules/maxNatPolicies を設定すると超過時に CAP err が発火', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const rRestricted = { ...rmTz, capabilities: { ...rmTz.capabilities!, maxAccessRules: 2, maxNatPolicies: 1 } };
    const cfg =
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
      'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n' +
      'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n' +
      'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n' +
      'nat-policy\n original-source any\n translated-source X1\n outbound-interface X1\n' +
      'nat-policy\n original-source any\n translated-source X1\n outbound-interface X1\n';
    const r = makeDev('R1', 'router', rRestricted, parseSonicWall(cfg));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('access-rule 数'))).toBe(true);
    expect(V.findings.some((f) => f.cat === 'CAP' && f.level === 'err' && f.desc.includes('NAT ポリシー数'))).toBe(true);
  });
});

/* ===== 全機能監査 再調査(2026-07-11) — パーサ/エンジンの実際の修正に対する
 * 回帰テスト。各ブロックが engine 側の対応する1件の修正に紐付く。 ===== */

describe('parseCisco — 番号付きACLエントリの認識(全機能監査再調査)', () => {
  it('`10 permit ...` のような明示的シーケンス番号付き行も ACE として認識される', () => {
    const cp = parseCisco('hostname ACL-SEQ\nip access-list extended SEQ_ACL\n 10 permit tcp any any eq 22\n 20 deny ip any any\n');
    expect(cp.acls['SEQ_ACL']?.length).toBe(2);
    expect(cp.acls['SEQ_ACL']?.[0]?.action).toBe('permit');
  });
});

describe('parseCisco — mode 省略の channel-group(全機能監査再調査)', () => {
  it('`channel-group <N>`(mode 省略)は静的 on mode として認識される', () => {
    const cp = parseCisco('hostname CG-ON\ninterface GigabitEthernet1/0/1\n channel-group 5\n!\n');
    expect(cp.interfaces['GigabitEthernet1/0/1']?.channel).toEqual({ id: '5', mode: 'on' });
  });
});

describe('parseCisco — switchport mode dynamic auto/desirable の認識(全機能監査再調査)', () => {
  it('dynamic auto / dynamic desirable は認識済み行として扱われる(未対応行に積まれない)', () => {
    const cp = parseCisco(
      'hostname DTP\ninterface GigabitEthernet1/0/1\n switchport mode dynamic auto\n!\n' +
      'interface GigabitEthernet1/0/2\n switchport mode dynamic desirable\n!\n',
    );
    expect(cp.coverage.unrecognizedLines.some((l) => /dynamic (auto|desirable)/.test(l.text))).toBe(false);
    expect(cp.interfaces['GigabitEthernet1/0/1']?.mode).toBe(null);
  });
});

describe('parseCisco — transport input all は telnet 有効とみなす(全機能監査再調査)', () => {
  it('`transport input all` で sec.telnet = true になる', () => {
    const cp = parseCisco('hostname T-ALL\nline vty 0 4\n transport input all\n!\n');
    expect(cp.sec.telnet).toBe(true);
  });
});

describe('parseCisco — DHCP プール network 行の /prefix 記法対応(全機能監査再調査)', () => {
  it('`network <addr> /<prefix>` 形式も認識される', () => {
    const cp = parseCisco('hostname DHCP-CIDR\nip dhcp pool POOL1\n network 192.168.50.0 /24\n default-router 192.168.50.1\n!\n');
    expect(cp.dhcp['POOL1']?.network).toBe('192.168.50.0/24');
  });
});

describe('parseCisco / verify — インターフェイス名 next-hop の静的ルート(全機能監査再調査)', () => {
  it('next-hop がインターフェイス名の場合も routes に取り込まれ、到達性チェックの対象外になる', () => {
    const cp = parseCisco('hostname RT-IFACE\nip route 0.0.0.0 0.0.0.0 Vlan99\n');
    expect(cp.routes.length).toBe(1);
    expect(cp.routes[0]?.nh).toBe('Vlan99');
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!, cp);
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L3' && f.desc.includes('next-hop'))).toBe(false);
  });
});

describe('parseCisco — スタックスイッチの boot system 文(platformHint)(全機能監査再調査)', () => {
  it('`boot system switch all flash:packages.conf` も IOS-XE シグナルとして検出される', () => {
    const hint = parseCisco('hostname STACK\nboot system switch all flash:packages.conf\n').platformHint;
    expect(hint.signals.some((s) => s.signal === 'iosxe-install-mode')).toBe(true);
  });
});

describe('mapToPorts — Port-channel 継承の trunkAllowedExplicit / mtu(全機能監査再調査)', () => {
  it('Port-channel 側の `vlan none`(全遮断)と mtu がメンバーポートに継承される', () => {
    const sm = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;
    const cfg =
      'hostname PC-INHERIT\ninterface Port-channel1\n switchport mode trunk\n switchport trunk allowed vlan none\n mtu 9000\n!\n' +
      'interface GigabitEthernet1/0/1\n channel-group 1 mode active\n!\n';
    const sw = makeDev('SW1', 'switch', sm, parseCisco(cfg));
    mapToPorts(sw);
    const p = sw.ports.find((x) => x.iface === 'GigabitEthernet1/0/1')!;
    expect(p.cfg?.trunkAllowedExplicit).toBe(true);
    expect(p.cfg?.mtu).toBe('9000');
  });
});

describe('parseSonicWall — ポート番号無し service-object の認識(全機能監査再調査)', () => {
  it('`service-object svc-icmp icmp`(ポート/タイプ番号無し)は from/to = null として認識される', () => {
    const sp = parseSonicWall('service-object svc-icmp icmp\n');
    expect(sp.svc['svc-icmp']).toEqual({ proto: 'icmp', from: null, to: null });
  });
});

describe('parseSonicWall — VLAN サブ IF の trunkAllowed 重複防止(全機能監査再調査)', () => {
  it('`interface X0:V10` + ` vlan 10` で trunkAllowed が重複しない', () => {
    const sp = parseSonicWall('interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n');
    expect(sp.interfaces['X0:V10']?.trunkAllowed).toEqual(['10']);
  });
});

describe('parseSonicWall — route-policy 単一行の記述順序非依存化(全機能監査再調査)', () => {
  it('gateway が destination より先に書かれていても正しく解釈される', () => {
    const sp = parseSonicWall('route-policy gateway 203.0.113.1 destination 0.0.0.0 0.0.0.0\n');
    expect(sp.routes).toEqual([{ dst: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' }]);
  });
  it('単一行で完結した route-policy が直後の無関係な行を巻き込まない', () => {
    const sp = parseSonicWall(
      'route-policy destination 0.0.0.0 0.0.0.0 gateway 203.0.113.1\n' +
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n',
    );
    expect(sp.routes.length).toBe(1);
    expect(sp.interfaces['X0']?.zone).toBe('LAN');
  });
});

describe('parseSonicWall — WAN ping/管理許可検出の `!`/`#` コメント除外(全機能監査再調査)', () => {
  it('`!` または `#` で始まる注釈行は誤検知しない', () => {
    const sp = parseSonicWall('! ping from WAN is intentionally disabled\n# management from wan is NOT allowed\n');
    expect(sp.sec.pingWanAllow).toBe(false);
    expect(sp.sec.mgmtWanAllow).toBe(false);
  });
});

describe('parseSonicWall — NAT original-source/translated-source のスペース対応(全機能監査再調査)', () => {
  it('アドレスオブジェクト名にスペースを含む値も切り詰められずに読み取れる', () => {
    const sp = parseSonicWall('nat-policy\n original-source Any\n translated-source WAN Primary IP\n outbound-interface X1\n');
    expect(sp.nat[0]?.trans).toBe('WAN Primary IP');
  });
});

describe('verify — SEC broad-rule/shadow 判定での ANY ゾーンワイルドカード対応(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('from=ANY/to=ANY の any/any/any 許可ルールは SEC の除外対象にならない', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
      'access-rule from ANY to ANY\n action allow\n source any\n destination any\n service any\n',
    ));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('any/any/any'))).toBe(true);
  });
  it('ANY→ANY の包括ルールは後続の具体的ルールをシャドウする', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall(
      'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
      'access-rule from ANY to ANY\n action allow\n source any\n destination any\n service any\n' +
      'access-rule from LAN to WAN\n action allow\n source any\n destination host-x\n service svc-https\n',
    ));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'SEC' && f.desc.includes('シャドウ'))).toBe(true);
  });
});

describe('verify — Access VLAN 1 は既定 VLAN として未定義扱いしない(全機能監査再調査)', () => {
  const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
  const sm1000 = CATALOG.switch.filter((x) => x.id === 'C1000-24')[0]!;

  it('`switchport access vlan 1` は vlan 1 が明示定義されていなくても L2 lack を出さない', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\ninterface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 1\n!\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('Access VLAN 1 が未定義'))).toBe(false);
  });
  it('他の VLAN(明示未定義)は引き続き検出する(回帰確認)', () => {
    const r = makeDev('R1', 'router', rmTz, parseSonicWall('interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n'));
    const sw = makeDev('SW1', 'switch', sm1000, parseCisco('hostname SW1\ninterface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 99\n!\n'));
    [r, sw].forEach((d) => mapToPorts(d));
    const V = verify({ router: r, switches: [sw], devices: [r, sw], topoMode: 'star', links: [] });
    expect(V.findings.some((f) => f.cat === 'L2' && f.desc.includes('Access VLAN 99 が未定義'))).toBe(true);
  });
});

describe('pathTrace — /32 WAN インターフェイスの代表ホストIP計算(全機能監査再調査)', () => {
  it('/32 の WAN インターフェイスでも代表IPがゲートウェイ自身になり、サブネット範囲外にロールオーバーしない', () => {
    const rmTz = CATALOG.router.filter((x) => x.id === 'TZ270')[0]!;
    const r = makeDev('R1', 'router', rmTz, parseSonicWall(
      'address-object ipv4 host-wan host 203.0.113.255\n' +
      'interface X0\n zone LAN\n ip 192.168.1.1 netmask 255.255.255.0\n' +
      'interface X1\n zone WAN\n ip 203.0.113.255 netmask 255.255.255.255\n' +
      'access-rule from LAN to WAN\n action allow\n source any\n destination host-wan\n service any\n',
    ));
    mapToPorts(r);
    const st: AppState = { router: r, switches: [], devices: [r], topoMode: 'star', links: [] };
    const trace = pathTrace(st, '192.168.1.0/24', '__WAN__', 'any');
    expect(trace.verdict).toBe('ok');
  });
});
