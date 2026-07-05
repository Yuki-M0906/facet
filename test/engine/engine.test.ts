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
});

/* ===== full verify ===== */

const rm = CATALOG.router.filter((x) => x.id === 'TZ570')[0]!;
const sm = CATALOG.switch.filter((x) => x.id === 'C9300-24')[0]!;
const R = makeDev('R1', 'router', rm, sw);
const W1 = makeDev('SW1', 'switch', sm, c1);
const W2 = makeDev('SW2', 'switch', sm, c2);
[R, W1, W2].forEach((d) => mapToPorts(d));
const state: AppState = { router: R, switches: [W1, W2], devices: [R, W1, W2], topoMode: 'star', links: [] };
state.links = autoLinks(state);
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
