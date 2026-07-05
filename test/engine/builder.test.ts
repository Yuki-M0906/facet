/**
 * GUI 作成モード(Sprint 5 MVP)の往復保証テスト。
 *
 * 「generateCiscoConfig / generateSonicWallConfig が出力したテキストは、
 *  必ず parseCisco / parseSonicWall で正しく読み戻せる」ことを検証する。
 * これが崩れると「GUI で組んだのに検証が通らない」という致命的な壊れ方をする。
 */

import { describe, it, expect } from 'vitest';
import {
  generateCiscoConfig,
  generateSonicWallConfig,
  parseCisco,
  parseSonicWall,
} from '@engine/index';
import type { CiscoBuilderDraft, SonicWallBuilderDraft } from '@engine/types';

describe('generateCiscoConfig → parseCisco 往復保証', () => {
  const draft: CiscoBuilderDraft = {
    hostname: 'BUILD-SW-01',
    stpMode: 'rapid-pvst',
    stpPriority: 4096,
    vlans: [
      { id: '10', name: 'STAFF' },
      { id: '20', name: 'POS' },
    ],
    ports: [
      {
        iface: 'GigabitEthernet1/0/1', mode: 'access', accessVlan: '10',
        trunkNative: null, trunkAllowed: [], portfast: true, bpduguard: true, shutdown: false,
        aclIn: 'WEB-ACL', aclOut: null,
      },
      {
        iface: 'GigabitEthernet1/0/2', mode: 'access', accessVlan: '20',
        trunkNative: null, trunkAllowed: [], portfast: true, bpduguard: true, shutdown: false,
        aclIn: null, aclOut: null,
      },
      {
        iface: 'GigabitEthernet1/0/3', mode: null, accessVlan: null,
        trunkNative: null, trunkAllowed: [], portfast: false, bpduguard: false, shutdown: false,
        aclIn: null, aclOut: null,
      },
      {
        iface: 'GigabitEthernet1/1/1', mode: 'trunk', accessVlan: null,
        trunkNative: '1', trunkAllowed: ['10', '20'], portfast: false, bpduguard: false, shutdown: false,
        aclIn: null, aclOut: null,
      },
    ],
    svis: [{ vlan: '10', ip: '192.168.10.1', mask: '255.255.255.0' }],
    acls: [{
      name: 'WEB-ACL',
      lines: [
        { action: 'permit', rest: 'tcp any any eq 80' },
        { action: 'deny', rest: 'ip any any' },
      ],
    }],
    dhcpPools: [{ name: 'STAFF-POOL', network: '192.168.10.0', mask: '255.255.255.0', gw: '192.168.10.1' }],
    security: { sshOnly: true, enableSecret: true, pwEncrypt: true },
  };

  const text = generateCiscoConfig(draft);
  const parsed = parseCisco(text);

  it('hostname が読み戻せる', () => expect(parsed.hostname).toBe('BUILD-SW-01'));
  it('stpMode が読み戻せる', () => expect(parsed.stpMode).toBe('rapid-pvst'));
  it('stpPriority が読み戻せる(Sprint 5 SF5-2)', () => expect(parsed.stpPriority).toBe(4096));
  it('VLAN 名が読み戻せる', () => {
    expect(parsed.vlans['10']).toBe('STAFF');
    expect(parsed.vlans['20']).toBe('POS');
  });
  it('access ポートの accessVlan が読み戻せる', () => {
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.mode).toBe('access');
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.accessVlan).toBe('10');
  });
  it('未設定ポートは interfaces に現れない', () => {
    expect(parsed.interfaces['GigabitEthernet1/0/3']).toBeUndefined();
  });
  it('trunk ポートの native/allowed が読み戻せる', () => {
    const p = parsed.interfaces['GigabitEthernet1/1/1']!;
    expect(p.mode).toBe('trunk');
    expect(p.trunkNative).toBe('1');
    expect(p.trunkAllowed).toEqual(['10', '20']);
  });
  it('portfast / bpduguard が読み戻せる', () => {
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.portfast).toBe(true);
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.bpduguard).toBe(true);
  });
  it('SVI (Vlan10) が読み戻せる', () => {
    expect(parsed.svis['10']).toEqual({ ip: '192.168.10.1', mask: '255.255.255.0' });
  });
  it('security(sshOnly/enableSecret/pwEncrypt)が読み戻せる', () => {
    expect(parsed.sec.sshOnly).toBe(true);
    expect(parsed.sec.telnet).toBe(false);
    expect(parsed.sec.enableSecret).toBe(true);
    expect(parsed.sec.pwEncrypt).toBe(true);
  });
  it('ACL 本体(permit/deny の rest)が読み戻せる(Sprint 5 SF5-3)', () => {
    expect(parsed.acls['WEB-ACL']).toEqual([
      { action: 'permit', rest: 'tcp any any eq 80' },
      { action: 'deny', rest: 'ip any any' },
    ]);
  });
  it('ip access-group による ACL 適用が読み戻せる(Sprint 5 SF5-3)', () => {
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.aclIn).toBe('WEB-ACL');
    expect(parsed.interfaces['GigabitEthernet1/0/1']!.aclOut).toBeNull();
  });
  it('DHCP プール(network/default-router)が読み戻せる(Sprint 5 SF5-4)', () => {
    expect(parsed.dhcp['STAFF-POOL']).toEqual({ network: '192.168.10.0/24', gw: '192.168.10.1' });
  });
});

describe('generateCiscoConfig: shutdown ポートは interfaces に現れる', () => {
  const draft: CiscoBuilderDraft = {
    hostname: 'X', stpMode: null, stpPriority: null, vlans: [],
    ports: [{
      iface: 'GigabitEthernet1/0/5', mode: null, accessVlan: null,
      trunkNative: null, trunkAllowed: [], portfast: false, bpduguard: false, shutdown: true,
      aclIn: null, aclOut: null,
    }],
    svis: [], acls: [], dhcpPools: [], security: { sshOnly: false, enableSecret: false, pwEncrypt: false },
  };
  const parsed = parseCisco(generateCiscoConfig(draft));
  it('shutdown フラグが読み戻せる', () => {
    expect(parsed.interfaces['GigabitEthernet1/0/5']!.shutdown).toBe(true);
  });
});

describe('generateSonicWallConfig → parseSonicWall 往復保証', () => {
  const draft: SonicWallBuilderDraft = {
    hostname: 'BUILD-EDGE-01',
    interfaces: [
      {
        iface: 'X0', enabled: true, zone: 'LAN', ip: '192.168.1.1', mask: '255.255.255.0',
        comment: 'LAN core',
        vlanSubs: [
          { vlanTag: '10', zone: 'LAN', ip: '192.168.10.1', mask: '255.255.255.0', comment: 'Staff' },
          { vlanTag: '20', zone: 'POS', ip: '192.168.20.1', mask: '255.255.255.0', comment: 'POS' },
        ],
      },
      {
        iface: 'X1', enabled: true, zone: 'WAN', ip: '203.0.113.2', mask: '255.255.255.248',
        comment: 'WAN', vlanSubs: [],
      },
      {
        iface: 'X2', enabled: false, zone: 'DMZ', ip: '', mask: '', comment: '', vlanSubs: [],
      },
    ],
    addressObjects: [
      { name: 'net-staff', type: 'network', ip: '192.168.10.0', mask: '255.255.255.0', zone: 'LAN' },
      { name: 'host-srv1', type: 'host', ip: '192.168.10.50', mask: '', zone: 'LAN' },
    ],
    serviceObjects: [{ name: 'svc-https', proto: 'tcp', from: '443', to: '443' }],
    rules: [
      { from: 'LAN', to: 'WAN', action: 'allow', src: 'any', dst: 'any', service: 'any', enabled: true },
      { from: 'POS', to: 'WAN', action: 'allow', src: 'net-staff', dst: 'any', service: 'svc-https', enabled: true },
      { from: 'DMZ', to: 'LAN', action: 'deny', src: 'any', dst: 'any', service: 'any', enabled: false },
    ],
    natPolicies: [{ orig: 'net-staff', trans: 'WAN Primary IP', iface: 'X1' }],
  };

  const text = generateSonicWallConfig(draft);
  const parsed = parseSonicWall(text);

  it('hostname が読み戻せる', () => expect(parsed.hostname).toBe('BUILD-EDGE-01'));
  it('X0 の zone/ip が読み戻せる', () => {
    expect(parsed.interfaces['X0']!.zone).toBe('LAN');
    expect(parsed.interfaces['X0']!.ip).toBe('192.168.1.1');
  });
  it('無効化(enabled=false)インターフェイスは出力されない', () => {
    expect(parsed.interfaces['X2']).toBeUndefined();
  });
  it('VLAN サブインターフェイスが読み戻せる', () => {
    expect(parsed.interfaces['X0:V10']!.zone).toBe('LAN');
    expect(parsed.interfaces['X0:V10']!.ip).toBe('192.168.10.1');
    expect(parsed.interfaces['X0:V20']!.zone).toBe('POS');
  });
  it('address-object (network/host) が読み戻せる', () => {
    const netObj = parsed.addr['net-staff']!;
    expect(netObj.type).toBe('network');
    if (netObj.type === 'network') expect(netObj.cidr).toBe('192.168.10.0/24');
    const hostObj = parsed.addr['host-srv1']!;
    expect(hostObj.type).toBe('host');
    if (hostObj.type === 'host') expect(hostObj.ip).toBe('192.168.10.50');
  });
  it('service-object が読み戻せる', () => {
    expect(parsed.svc['svc-https']).toEqual({ proto: 'tcp', from: 443, to: 443 });
  });
  it('access-rule 数と内容が読み戻せる', () => {
    expect(parsed.rules.length).toBe(3);
    expect(parsed.rules[1]!.src).toBe('net-staff');
    expect(parsed.rules[1]!.service).toBe('svc-https');
  });
  it('disable ルールが読み戻せる', () => {
    expect(parsed.rules[2]!.enabled).toBe(false);
  });
  it('nat-policy が読み戻せる', () => {
    expect(parsed.nat.length).toBe(1);
    expect(parsed.nat[0]!.orig).toBe('net-staff');
    expect(parsed.nat[0]!.iface).toBe('X1');
  });
});

describe('生成 → verify までのフルパイプライン(Cisco + SonicWall)', () => {
  /* 生成したコンフィグをそのまま verify() に通し、findings が正常に出ることを確認 */
  it('往復生成したコンフィグで verify が例外なく完走する', async () => {
    const { CATALOG, switchPorts, mapToPorts, autoLinks, verify } = await import('@engine/index');
    const rm = CATALOG.router.filter((x) => x.id === 'TZ570')[0]!;
    const sm = CATALOG.switch.filter((x) => x.id === 'C9300-24')[0]!;

    const swDraft: CiscoBuilderDraft = {
      hostname: 'GEN-SW', stpMode: 'rapid-pvst', stpPriority: null,
      vlans: [{ id: '10', name: 'STAFF' }],
      ports: [{
        iface: 'GigabitEthernet1/1/1', mode: 'trunk', accessVlan: null,
        trunkNative: '1', trunkAllowed: ['10'], portfast: false, bpduguard: false, shutdown: false,
        aclIn: null, aclOut: null,
      }],
      svis: [], acls: [], dhcpPools: [], security: { sshOnly: true, enableSecret: true, pwEncrypt: true },
    };
    const rDraft: SonicWallBuilderDraft = {
      hostname: 'GEN-EDGE',
      interfaces: [{
        iface: 'X0', enabled: true, zone: 'LAN', ip: '192.168.1.1', mask: '255.255.255.0',
        comment: '', vlanSubs: [{ vlanTag: '10', zone: 'LAN', ip: '192.168.10.1', mask: '255.255.255.0', comment: '' }],
      }],
      addressObjects: [], serviceObjects: [], rules: [], natPolicies: [],
    };

    const router = {
      key: 'R1', role: 'router' as const, model: rm, name: rm.name,
      ports: rm.ports.map((p) => ({ ...p, status: 'idle' as const, cfg: null, msg: null })),
      config: generateSonicWallConfig(rDraft),
      parsed: parseSonicWall(generateSonicWallConfig(rDraft)),
    };
    const sw = {
      key: 'SW1', role: 'switch' as const, model: sm, name: sm.name, unit: 1,
      ports: switchPorts(sm).map((p) => ({ ...p, status: 'idle' as const, cfg: null, msg: null })),
      config: generateCiscoConfig(swDraft),
      parsed: parseCisco(generateCiscoConfig(swDraft)),
    };
    [router, sw].forEach((d) => mapToPorts(d));
    const state: import('@engine/types').AppState = {
      router, switches: [sw], devices: [router, sw], topoMode: 'star', links: [],
    };
    state.links = autoLinks(state);

    expect(() => verify(state)).not.toThrow();
    const result = verify(state);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
