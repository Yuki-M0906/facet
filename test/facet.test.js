/**
 * ⚠ DEPRECATED — Sprint 1.5 (2026-06-23) で本ファイルは
 * test/engine/engine.test.ts (Vitest) に全面移行しました。
 *
 * 本ファイルは package.json の "type": "module" 化により CommonJS
 * (require) が使えず、現状実行できません。テストの実行は `npm test`
 * (= vitest run) を使用してください。
 *
 * 履歴の参照用に残置しています。新しいテストケース追加は
 * test/engine/engine.test.ts に対して行ってください。
 * ---------------------------------------------------------------------------
 * FACET engine regression suite (no test framework; plain Node assertions).
 * Run: npm test    (or: node test/facet.test.js)
 *
 * These cover the behaviours that broke at least once during development:
 * interface-range expansion, object-aware firewall evaluation, path-trace
 * verdicts, security/hygiene findings, DHCP gateway mismatch, native-VLAN
 * mismatch. Add a case here whenever you fix a bug or add a rule.
 */
var F = require('../src/facet-core.js');

var SMP_SW = 'system name ACME-EDGE-01\n' +
'address-object ipv4 net-staff network 192.168.10.0 255.255.255.0 zone LAN\n' +
'address-object ipv4 net-pos network 192.168.20.0 255.255.255.0 zone POS\n' +
'service-object svc-https tcp 443\n' +
'interface X0\n zone LAN\n ip-assignment LAN static\n ip 192.168.1.1 netmask 255.255.255.0\n comment "LAN core uplink"\n' +
'interface X0:V10\n vlan 10\n zone LAN\n ip 192.168.10.1 netmask 255.255.255.0\n comment "Staff VLAN gateway"\n' +
'interface X0:V20\n vlan 20\n zone POS\n ip 192.168.20.1 netmask 255.255.255.0\n comment "POS VLAN gateway"\n' +
'interface X1\n zone WAN\n ip 203.0.113.2 netmask 255.255.255.248\n comment "WAN"\n' +
'access-rule from LAN to WAN\n action allow\n source any\n destination any\n service any\n' +
'access-rule from POS to WAN\n action allow\n source net-pos\n destination any\n service svc-https\n';

var SMP_C1 = 'hostname ACME-SW-01\n' +
'spanning-tree mode rapid-pvst\n' +
'service password-encryption\n' +
'enable secret 9 abc\n' +
'vlan 10\n name STAFF\n' +
'vlan 20\n name POS\n' +
'interface range GigabitEthernet1/0/1 - 4\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\n spanning-tree bpduguard enable\n!\n' +
'interface GigabitEthernet1/0/5\n switchport mode access\n switchport access vlan 20\n spanning-tree portfast\n spanning-tree bpduguard enable\n!\n' +
'interface GigabitEthernet1/1/1\n description Uplink to ACME-EDGE-01 X0\n switchport mode trunk\n switchport trunk native vlan 1\n switchport trunk allowed vlan 10,20\n!\n' +
'line vty 0 4\n transport input ssh\n!\n';

var SMP_C2 = 'hostname ACME-SW-02\n' +
'vlan 10\n name STAFF\n' +
'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 30\n!\n' +
'interface GigabitEthernet1/1/1\n description Uplink\n switchport mode trunk\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20\n!\n' +
'line vty 0 4\n transport input telnet\n!\n';

var pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

console.log('== expandIfRange ==');
var er = F.expandIfRange('GigabitEthernet1/0/1 - 4');
ok(er.length === 4 && er[0] === 'GigabitEthernet1/0/1' && er[3] === 'GigabitEthernet1/0/4', 'Gi1/0/1-4 -> 4 ifaces');
ok(F.expandIfRange('Gi1/0/1-3, Gi1/0/8').length === 4, 'comma+range -> 4');

console.log('== parseCisco ==');
var c1 = F.parseCisco(SMP_C1), c2 = F.parseCisco(SMP_C2);
ok(c1.hostname === 'ACME-SW-01', 'hostname');
ok(Object.keys(c1.interfaces).filter(function (k) { return c1.interfaces[k].accessVlan === '10'; }).length === 4, '4 access ports vlan10 from range');
ok(c1.sec.enableSecret === true && c1.sec.snmpWeak === false, 'enable secret, no weak snmp');
ok(c1.interfaces['GigabitEthernet1/0/1'].portfast && c1.interfaces['GigabitEthernet1/0/1'].bpduguard, 'range applied portfast+bpduguard');
ok(c2.sec.telnet === true, 'SW2 telnet detected');
ok(c2.interfaces['GigabitEthernet1/0/1'].accessVlan === '30', 'SW2 access vlan 30');
ok(!c2.vlans['30'], 'VLAN30 not in SW2 vlan DB');
ok(c2.interfaces['GigabitEthernet1/1/1'].trunkNative === '99', 'SW2 native 99');

console.log('== parseSonicWall ==');
var sw = F.parseSonicWall(SMP_SW);
ok(sw.hostname === 'ACME-EDGE-01', 'sonicwall hostname');
ok(sw.addr['net-pos'] && sw.addr['net-pos'].cidr === '192.168.20.0/24', 'address-object net-pos');
ok(sw.svc['svc-https'] && sw.svc['svc-https'].from === 443, 'service-object 443');
ok(sw.rules.length === 2, '2 access-rules');
ok(sw.rules[1].src === 'net-pos' && sw.rules[1].service === 'svc-https', 'rule1 object refs');
ok(sw.interfaces['X0:V20'] && sw.interfaces['X0:V20'].zone === 'POS', 'X0:V20 zone POS');
ok(sw.interfaces['X1'].zone === 'WAN', 'X1 WAN');

console.log('== evalFW (object-aware) ==');
ok(F.evalFW(sw, 'LAN', 'WAN', '192.168.10.5', '203.0.113.5', 'any').action === 'allow', 'LAN->WAN allow');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'svc-https').action === 'allow', 'POS->WAN https allow');
var f3 = F.evalFW(sw, 'POS', 'LAN', '192.168.20.5', '192.168.10.5', 'any');
ok(f3.action === 'deny' && f3.reason === 'default-deny', 'POS->LAN default deny');
ok(F.evalFW(sw, 'LAN', 'LAN', '192.168.10.5', '192.168.1.5', 'any').reason === 'intra-zone', 'intra-zone allow');

console.log('== svcMatch (bidirectional overlap) ==');
// 旧 svcMatch のバグ: rule.service=svc-https のとき任意の service が match していた
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'ftp').action === 'deny',
  'POS->WAN ftp denied (rule allows svc-https only, no ftp overlap)');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', '443').action === 'allow',
  'POS->WAN 443 allowed (matches svc-https port)');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'any').action === 'allow',
  'POS->WAN any allowed against restricted rule (matrix mode)');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'tcp/443').action === 'allow',
  'POS->WAN tcp/443 allowed');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'tcp/80').action === 'deny',
  'POS->WAN tcp/80 denied (no overlap with 443)');
ok(F.evalFW(sw, 'POS', 'WAN', '192.168.20.5', '203.0.113.5', 'udp/443').action === 'deny',
  'POS->WAN udp/443 denied (proto mismatch with tcp)');

console.log('== full verify ==');
var rm = F.CATALOG.router.filter(function (x) { return x.id === 'TZ570'; })[0];
var sm = F.CATALOG.switch.filter(function (x) { return x.id === 'C9300-24'; })[0];
function dev(key, role, model, parsed) {
  var ports = (role === 'router' ? model.ports.map(function (p) { return Object.assign({}, p); }) : F.switchPorts(model))
    .map(function (p) { return Object.assign({}, p, { status: 'idle', cfg: null }); });
  return { key: key, role: role, model: model, name: model.name, unit: role === 'switch' ? +key.replace('SW', '') : 0, ports: ports, config: 'x', parsed: parsed };
}
var R = dev('R1', 'router', rm, sw), W1 = dev('SW1', 'switch', sm, c1), W2 = dev('SW2', 'switch', sm, c2);
[R, W1, W2].forEach(function (d) { F.mapToPorts(d); });
var state = { router: R, switches: [W1, W2], devices: [R, W1, W2], topoMode: 'star', links: [] };
state.links = F.autoLinks(state);
var V = F.verify(state);
console.log('   findings=' + V.findings.length + ' err=' + V.nErr + ' lack=' + V.nLack + ' score=' + V.score);
function has(cat, sub) { return V.findings.some(function (f) { return f.cat === cat && f.desc.indexOf(sub) >= 0; }); }
ok(has('L2', 'Access VLAN 30'), 'SW2 VLAN30 undefined (L2)');
ok(has('L2', 'Native VLAN'), 'SW2 native mismatch (L2)');
ok(has('L3', 'VLAN 30'), 'VLAN30 no L3 gw (L3)');
ok(has('SEC', 'Telnet'), 'SW2 telnet (SEC)');
ok(V.subnets.length >= 3, '>=3 subnets');
ok(V.subnets.some(function (s) { return s.zone === 'POS'; }), 'POS subnet present');
ok(V.score < 100 && V.score > 0, 'score in range (' + V.score + ')');

console.log('== matrix ==');
var posSub = V.subnets.filter(function (s) { return s.zone === 'POS'; })[0];
var lanSub = V.subnets.filter(function (s) { return s.vlan === '10'; })[0];
var wanSub = V.subnets.filter(function (s) { return /WAN/i.test(s.zone); })[0];
ok(V.matrix.cells[posSub.cidr][lanSub.cidr] === 'deny', 'POS->LAN deny in matrix');
ok(wanSub && V.matrix.cells[lanSub.cidr][wanSub.cidr] === 'ok', 'LAN->WAN ok in matrix');

console.log('== pathTrace ==');
var t1 = F.pathTrace(state, lanSub.cidr, '__WAN__', 'any');
ok(t1.verdict === 'ok', 'LAN->WAN trace OK');
ok(t1.hops.some(function (h) { return h.node === 'NAT'; }), 'NAT hop present');
var t2 = F.pathTrace(state, posSub.cidr, lanSub.cidr, 'any');
ok(t2.verdict === 'deny', 'POS->LAN denied by FW');
ok(t2.hops.some(function (h) { return h.node === 'FW' && h.status === 'deny'; }), 'FW deny hop');
ok(F.pathTrace(state, posSub.cidr, '__WAN__', 'svc-https').verdict === 'ok', 'POS->WAN https OK');
ok(F.pathTrace(state, lanSub.cidr, posSub.cidr, 'any').verdict === 'deny', 'LAN->POS denied (no rule)');

console.log('== pathTrace same-subnet (no L3 hops) ==');
var t3 = F.pathTrace(state, lanSub.cidr, lanSub.cidr, 'any');
ok(t3.verdict === 'ok', 'same-subnet trace ok');
ok(t3.hops.length === 2, 'same-subnet returns exactly SRC + DST (no L2/GW/RT/FW)');
ok(t3.hops[0].node === 'SRC' && t3.hops[1].node === 'DST', 'hops are SRC then DST');
ok(t3.hops.every(function (h) { return h.node !== 'GW' && h.node !== 'L2' && h.node !== 'FW' && h.node !== 'RT'; }),
  'no L3 hops emitted for same-subnet');

console.log('== shadowed / permissive ==');
var sw2 = F.parseSonicWall(
  'interface X0\n zone LAN\n ip 10.0.0.1 netmask 255.255.255.0\n' +
  'interface X2\n zone DMZ\n ip 10.0.9.1 netmask 255.255.255.0\n' +
  'access-rule from LAN to DMZ\n action allow\n source any\n destination any\n service any\n' +
  'access-rule from LAN to DMZ\n action deny\n source 10.0.0.50\n destination any\n service any\n');
var Rp = dev('R1', 'router', rm, sw2);
var W = dev('SW1', 'switch', sm, F.parseCisco('hostname X\nspanning-tree mode rapid-pvst\nvlan 10\n name A\ninterface GigabitEthernet1/1/1\n switchport mode trunk\n switchport trunk allowed vlan 10\n!\n'));
[Rp, W].forEach(function (d) { F.mapToPorts(d); });
var st2 = { router: Rp, switches: [W], devices: [Rp, W], topoMode: 'star', links: [] }; st2.links = F.autoLinks(st2);
var V2 = F.verify(st2);
ok(V2.findings.some(function (f) { return f.cat === 'SEC' && f.desc.indexOf('any/any/any') >= 0; }), 'permissive any/any/any flagged');
ok(V2.findings.some(function (f) { return f.cat === 'SEC' && f.desc.indexOf('\u30B7\u30E3\u30C9\u30A6') >= 0; }), 'shadowed rule flagged');

console.log('\n========== ' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail ? 1 : 0);
