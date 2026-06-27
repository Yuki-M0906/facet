/**
 * デモ用の匿名化済コンフィグ。Phase 03「サンプルコンフィグを読み込む」が読む。
 * ACME-* / RFC1918 / TEST-NET 203.0.113.x のみで構成。実機名・実 IP・実拠点名は含めない。
 *
 * 元: app/facet.html v3.1.0 内の SMP_SW / SMP_C1 / SMP_C2。
 */

export const SMP_SW =
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

export const SMP_C1 =
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

export const SMP_C2 =
  'hostname ACME-SW-02\n' +
  'vlan 10\n name STAFF\n' +
  'interface GigabitEthernet1/0/1\n switchport mode access\n switchport access vlan 30\n!\n' +
  'interface GigabitEthernet1/1/1\n description Uplink\n switchport mode trunk\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20\n!\n' +
  'line vty 0 4\n transport input telnet\n!\n';
