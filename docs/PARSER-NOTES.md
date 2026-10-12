# Parser notes / パーサに関するメモ

*English first, 日本語は後半にあります。*

The parsers are deliberately tolerant and pattern-based, not full grammars. They target
**readable CLI text**, not binary exports. Expect to extend them as real configs arrive.

Ported to TypeScript in v4.0.0 (Sprint 1.5): `src/engine/parsers/cisco.ts` and
`src/engine/parsers/sonicwall.ts`; types `CiscoParsed` / `SonicWallParsed` /
`ParsedInterface` in `src/engine/types.ts`. Behaviour is identical to v3.1.0 (guaranteed
by the regression suite in `test/engine/engine.test.ts`).

## Platform detection (Sprint 3, P3-2, implemented 2026-07-04)

`parseCisco` returns `platformHint.signals`: syntax signals that contradict the selected
model's OS family (type `PlatformHint` in `types.ts`). Detection is `detectPlatformHint()`
in `src/engine/parsers/cisco.ts`, an additional scan independent of the extraction
logic. The CAP check in `verify.ts` compares the signals with the selected model's
`SwitchCapabilities.osVersions` and raises a CAP `err` on contradiction.

**Evidence (web research as of 2026-07-04, mainly Cisco documentation):**

| Signal | Basis | Confidence |
|---|---|---|
| `nxos-feature` (`^feature \S+$`) | NX-OS module-enable syntax; absent from IOS / IOS-XE (three-token forms excluded to avoid `license feature X`) | high |
| `nxos-feature-set` | `feature-set` (VDC-scoped feature bundle) | high |
| `nxos-vdc` (`vdc <name> id <n>`) | Virtual Device Context; Nexus 7000/7700 only — rare, but conclusive when present | high (when present) |
| `nxos-mgmt0` (`interface mgmt0`) | NX-OS management port name on every model (lower case, no slash); IOS-XE uses `Management0/0` etc. | high |
| `nxos-vrf-context` (`vrf context <name>`) | NX-OS VRF syntax; IOS / IOS-XE use `vrf definition` / `ip vrf` | high |
| `nxos-boot` (`boot nxos\|kickstart bootflash:`) | NX-OS-specific boot verbs; plain `boot system bootflash:` also exists on IOS-XE and is excluded | high |
| `iosxe-install-mode` (`packages.conf`) | Catalyst 9000 install mode is IOS-XE only by architecture | high |
| `iosxe-license-tier` (`network-essentials\|network-advantage\|dna-*`) | Catalyst 9000 licence tiers; 2960-X / 1000 use `lanbase` / `lanlite` / `ipservices` | high (within FACET's catalog) |
| `iosxe-smart-licensing` (`service call-home` **and** `license smart transport callhome`) | Smart Licensing exists elsewhere too, so neither line is decisive alone; together they are a usable signal within the catalog (2960-X does not support Smart Licensing) | high (as a pair only) |
| `iosxe-platform-fed` (`platform punt-keepalive\|qos\|ptp\|sudi\|tcam-limit`) | IOS-XE FED (Forwarding Engine Driver) commands | high |
| `ios-classic-license-tier` (`lanbase\|lanlite\|ipservices`) | Right-To-Use licence tiers of the 2960-X / 1000 families | high |

**Deliberately not implemented (judged undecidable):**
- General IOS vs. IOS-XE detection. Outside FACET's catalog there is no reliable method:
  the main syntax (`spanning-tree mode`, ACLs, AAA, …) is practically identical. The
  signals above are useful proxies only within the closed set of catalog models and must
  not be read as a general rule.
- **SonicOS 6 vs. 7 (Classic Mode) from CLI text.** The official SonicOS/X 7 CLI reference
  could not be retrieved (bot protection), so no primary source was available. SonicOS 7
  also has a Classic Mode (roughly the 6.5 keywords: `access-rule` / `address-object` /
  `nat-policy` / `zone`) and a Policy Mode (SonicOSX, a different vocabulary such as
  `Security Policy`), and the firmware version alone does not reveal the mode. Following
  the rule of not implementing detection without evidence, `SonicWallParsed` has no
  `platformHint`. If an unsupported dialect such as Policy Mode is submitted, the drop in
  `ParseCoverage` (Sprint 3 P3-1) makes it visible — that safety net already works.

## Cisco (`parseCisco`) — IOS / IOS-XE running-config text
Handled: `hostname`, `vlan` + `name`, `interface` and `interface range` (expanded),
`switchport` access / trunk / native / allowed, `channel-group`, `ip address`
(+ secondary), `speed` / `duplex` / `mtu`, `spanning-tree mode` / `portfast` /
`bpduguard`, SVIs (`interface Vlan<n>`), `ip route` (static), `ip access-list` /
`access-list` (parsed, lightly used), `ip dhcp pool` (`network` + `default-router`),
`standby <group> ip <ip>` (HSRP; group and virtual IP only, no priority / preempt —
Sprint 5 SF5-7), `shutdown`, and security signals (`transport input`,
`enable secret` / `password`, `snmp-server community`, `service password-encryption`).

Known gaps and watch-outs:
- **NX-OS** differs (`feature` lines, different interface defaults). Not a target yet.
- ACLs are parsed but not simulated in `pathTrace` (the SonicWall is treated as the
  security boundary). Cisco ACL reachability is a future extension.
- Banner blocks and free text are skipped at the `!` boundary; multi-line constructs
  outside the patterns above are ignored, not reported.
- Default admin state: only an explicit `shutdown` marks a port down.
- **`standby <group> ip <ip>` (audit Medium-2).** `ParsedInterface.standby` holds a
  single value (`StandbyConfig | null`), so with several HSRP groups on one interface
  (load-sharing designs) only the last one survives and earlier groups are silently lost.
  `verify.ts` currently has no HSRP rule, so this causes no false finding, but a future
  HSRP rule must turn the field into an array.
- **`spanning-tree vlan <list> priority <n>` (audit Medium-3).** `stpPriority` is a single
  per-device value, so in per-VLAN load-sharing designs only the last VLAN's priority
  reaches the root election (Sprint 4 S4-4). Per-VLAN root election is not modelled — a
  deliberate simplification of the per-device model.

## SonicWall `.exp` (Settings Export): decoding and conversion (v4.21.0)

`.exp` is not an obfuscated binary. It is **a base64-encoded list of `key=value&key=value&…`
settings variables** (values are URL / percent-encoded; the file may end with `&&`). The
scheme is the same for SonicOS 6 and 7 (Gen7). Only certain values such as passwords are
stored encrypted by the device and cannot be decoded. Evidence:
- SonicWall KB "How to get the configurations of the firewall based on the exporting EXP
  (Settings) file" (`base64 -d` / `certutil -decode` makes it readable; includes a
  SonicOS 7.1.2 example)
- Public implementations pryorda/sonicwallRuleParser (its bundled real `.exp` and decoded
  text were used to validate this implementation: all 507 variables match) and
  faridlav/SonicWallParser (.NET; key names and enumerations in Models / Parsing)

Implementation: `src/engine/expDecode.ts` (decode) → `src/engine/expToCli.ts`
(structure → CLI text / Excel sheets) → `src/engine/xlsx.ts` (minimal dependency-free
XLSX writer). The UI is the standalone "④ .exp convert" mode only
(`src/ui/phases/PhaseExp.tsx`, `expArtifacts.ts`, `components/ExpConvertPanel.tsx`).
Since v4.22.0 the upload slots (Phase 03 / quick check) do not accept `.exp`; the user
converts first and submits the `.txt` (conversion and verification are kept apart).

Confirmed variable families (N is a slot number, not contiguous):
- Interfaces `iface_ifnum_N` / `iface_name_N` (names are percent-encoded too, e.g.
  `X3%3aV3`) / `iface_phys_type_N` (0 = physical, 2 = VLAN) / `interface_Zone_N` /
  `iface_comment_N` / `iface_lan_ip_N` / `iface_lan_mask_N` / `iface_static_ip_N` (WAN
  static) / `iface_static_mask_N` / `iface_vlan_tag_N` / `iface_dhcp_enable_N` /
  `iface_port_disabled_N` / `iface_{https,http,ssh,ping,snmp}_mgmt_N` / `eth_mtu_N`
- Address objects `addrObjId_N` / `addrObjType_N` (1 = host, 2 = range, 4 = network,
  8 = group) / `addrObjZone_N` / `addrObjIp1_N` / `addrObjIp2_N` (mask for network, end
  for range). Group membership `addro_atomToGrp_N` (member) = `addro_grpToGrp_N` (group)
- Service objects `svcObjId_N` / `svcObjType_N` (1 = object, 2 = group) /
  `svcObjIpType_N` (6 = tcp, 17 = udp, 1 = icmp) / `svcObjPort1_N` / `svcObjPort2_N`.
  Group membership `so_atomToGrp_N` / `so_grpToGrp_N`
- Access rules `policyAction_N` (2 = allow; 1 / 0 are deny / discard but the public
  implementations disagree on which, so anything other than 2 is treated as blocking and
  the raw value is kept in the Excel) / `policySrcZone_N` / `policyDstZone_N` /
  `policySrcNet_N` / `policyDstNet_N` / `policyDstSvc_N` (empty = any) /
  `policyEnabled_N` / `policyComment_N`
- NAT `natPolicyOrigSrc_N` / `OrigDst` / `OrigSvc` / `TransSrc` / `TransDst` / `TransSvc`
  (empty = any / original) / `natPolicySrcIface_N` / `natPolicyDstIface_N` (an
  `iface_ifnum` value, −1 = any) / `natPolicyEnabled_N` / `natPolicyComment_N`
- Zones `zoneObjId_N` / `zoneObjZoneType_N`. DHCP `prefs_dhdynIpStart_N` / `IpEnd` /
  `Gateway` / `Mask` / `dns0..2` / `domainname` / `LeaseTime` / `Enable` / `Comment`.
  Device info `shortProdName` / `buildNum`

Deliberately omitted from the CLI conversion (stated in the panel and in the Excel):
address / service groups (FACET does not expand custom group members), FQDN objects,
disabled NAT policies, interfaces other than `X*` (MGMT / U0 …), static routes (the
`.exp` key is unconfirmed). The hostname key is also unconfirmed; `firewallName` /
`hostname` / `sysName` is used if present, otherwise no `system name` is emitted.

## SonicWall (`parseSonicWall`) — readable SonicOS CLI text
`.exp` is converted to CLI text in "④ .exp convert" and the user submits that `.txt`;
neither the parser nor the upload slots read `.exp` directly. Object names containing
spaces are accepted in `"…"` quotes, and `!` / `#` lines count as recognised comments
(v4.21.0). The parser expects a normalised, readable form derived from `show` output or
the documented CLI. Handled: `interface X#` / `X#:V#` with `zone` / `ip … netmask` /
`vlan` / `comment`, `address-object` (host / network / range, optional zone),
`service-object`, `access-rule from <z> to <z>` with `action` / `source` /
`destination` / `service` and enable / disable, `nat-policy` (original / translated /
outbound-interface), DHCP scopes, `route-policy`, and WAN ping / management hints.

Known gaps and watch-outs:
- Real SonicOS syntax varies by version; the accepted form is a clean superset, not
  byte-exact SonicOS. The UI calls it "CLI readable text". Any real-export parsing must
  live behind a clearly separate path.
- **WAN ping / management detection (audit Medium-6; `!` / `#` lines now excluded as
  well).** `ping.*from\s+wan` / `management.*(from\s+wan|wan.*allow)` are loose partial
  matches. `comment` lines and `!` / `#` lines are excluded (the false-positive side is
  handled), but whether these patterns match the exact SonicOS syntax
  (`https-management` / `ssh-management` / `ping from WAN` …) is unverified, so misses
  remain possible. Checking against real devices or the official reference is an open
  task.
- **Built-in address groups (Sprint 4, S4-3).** `"<Zone> Subnets"` (e.g. `"LAN Subnets"`)
  is resolved dynamically by `objContains()` (`evalFW.ts`) as the union of all subnets on
  interfaces in that zone. That these built-in groups exist is confirmed in several places
  in the SonicOS 6.5 E-CLI Reference Guide (e.g. `show address-group ipv4 "LAN Subnets"`).
- **Custom address-group / service-group member expansion is not supported
  (deliberately).** The SonicOS 6.5 E-CLI Reference Guide documents creating and deleting
  a group (`address-group ipv4 "<name>"`) but not the command that adds members. Rather
  than invent unconfirmed syntax (the same rule that deferred SonicOS 6/7 detection), this
  waits for real data (the P3-4 fixtures).
- Unknown object names in a rule are treated as no-match (conservative — avoids false
  allows).

## When extending
- Keep additions inside `src/engine/parsers/{cisco,sonicwall}.ts`, within the existing
  flush / `!`-boundary structure. **`src/facet-core.js` and `app/facet.html` are the
  v3.1.0 history and must not be edited** (see `CLAUDE.md`).
- Add a focused fixture and assertion to `test/engine/engine.test.ts` (Vitest).
- Bump the version whenever behaviour changes (see the versioning procedure in
  `CLAUDE.md`).

---

# 日本語版

パーサは意図的に寛容で、完全な文法ではなくパターンベースです。対象は**人が読める CLI テキスト**であり、バイナリのエクスポートではありません。
実機のコンフィグが集まるにつれて拡張していく前提です。

v4.0.0（Sprint 1.5）で TypeScript に移植済み。実体は `src/engine/parsers/cisco.ts` と `src/engine/parsers/sonicwall.ts`、型は
`src/engine/types.ts` の `CiscoParsed`／`SonicWallParsed`／`ParsedInterface`。挙動は v3.1.0 と完全互換
（`test/engine/engine.test.ts` の回帰スイートが保証）。

## プラットフォーム判別（Sprint 3、P3-2、2026年7月4日実装）

`parseCisco` の返り値 `platformHint.signals` に、選択機種の OS ファミリーと矛盾する構文シグナルを列挙する（型は `types.ts` の
`PlatformHint`）。検出ロジックは `src/engine/parsers/cisco.ts` の `detectPlatformHint()` で、既存の抽出ロジックとは独立した追加の走査。
`verify.ts` の CAP チェックが選択機種の `SwitchCapabilities.osVersions` と突き合わせ、矛盾があれば CAP の `err` を出す。

**根拠（2026年7月4日時点のウェブ調査。主に Cisco の公式文書）：**

| シグナル | 根拠 | 確信度 |
|---|---|---|
| `nxos-feature`（`^feature \S+$`） | NX-OS のモジュール機能を有効化する構文。IOS／IOS-XE には無い（`license feature X` と紛れないよう3トークン形式は除外） | 高 |
| `nxos-feature-set` | `feature-set`（VDC スコープの機能バンドル） | 高 |
| `nxos-vdc`（`vdc <name> id <n>`） | Virtual Device Context。Nexus 7000／7700 だけにあるため出現は稀だが、出れば決定的 | 高（出現時） |
| `nxos-mgmt0`（`interface mgmt0`） | NX-OS 全機種共通の管理ポート名（小文字、スラッシュ無し）。IOS-XE の `Management0/0` などとは書式が違う | 高 |
| `nxos-vrf-context`（`vrf context <name>`） | NX-OS の VRF 構文。IOS／IOS-XE は `vrf definition`／`ip vrf` | 高 |
| `nxos-boot`（`boot nxos\|kickstart bootflash:`） | NX-OS 固有の boot 動詞。`boot system bootflash:` 単体は IOS-XE にもあるので除外 | 高 |
| `iosxe-install-mode`（`packages.conf`） | Catalyst 9000 系の install mode はアーキテクチャ上 IOS-XE 専用 | 高 |
| `iosxe-license-tier`（`network-essentials\|network-advantage\|dna-*`） | Catalyst 9000 系のライセンス階層名。2960-X／1000 系は `lanbase`／`lanlite`／`ipservices` | 高（FACET のカタログ内に限る） |
| `iosxe-smart-licensing`（`service call-home` **と** `license smart transport callhome` の両方） | Smart Licensing は他製品にもあるので単体では決め手にならない。2行が揃えばカタログ内（2960-X 系は Smart Licensing 非対応）では実用的なシグナル | 高（組としてのみ） |
| `iosxe-platform-fed`（`platform punt-keepalive\|qos\|ptp\|sudi\|tcam-limit`） | IOS-XE の FED（Forwarding Engine Driver）固有コマンド | 高 |
| `ios-classic-license-tier`（`lanbase\|lanlite\|ipservices`） | 2960-X／1000 系の Right-To-Use ライセンス階層名 | 高 |

**意図的に実装しなかったもの（判別不能と判断）：**
- IOS と IOS-XE の一般的な判別。FACET のカタログ外の機種まで含めた一般論としては、`spanning-tree mode`、ACL、AAA などの主要構文が
  両者でほぼ同一なので信頼できる方法が無い。上のシグナルは「FACET のカタログという閉じた集合の中でだけ」実用的な代理指標であり、
  一般則として拡大解釈してはいけない。
- **SonicOS 6 系と 7 系（Classic Mode）の CLI テキストでの判別。** 公式の SonicOS/X 7 CLI リファレンスが bot 対策で取得できず、
  信頼できる一次情報が得られなかった。SonicOS 7 には Classic Mode（6.5 とおおむね同じ `access-rule`／`address-object`／`nat-policy`／`zone`）と
  Policy Mode（SonicOSX。`Security Policy` など別の体系）があり、ファームウェアの版だけではどちらのモードかも分からない。
  確証の無い判別ロジックは実装しない方針に従い、`SonicWallParsed` には `platformHint` を付けていない。Policy Mode のような非対応の方言が
  投入されれば `ParseCoverage`（Sprint 3 P3-1）の認識率低下として自然に見えるので、実用上の安全網は既に働いている。

## Cisco（`parseCisco`）— IOS／IOS-XE の running-config テキスト
対応：`hostname`、`vlan`＋`name`、`interface` と `interface range`（展開）、`switchport` の access／trunk／native／allowed、
`channel-group`、`ip address`（secondary 含む）、`speed`／`duplex`／`mtu`、`spanning-tree mode`／`portfast`／`bpduguard`、
SVI（`interface Vlan<n>`）、`ip route`（静的）、`ip access-list`／`access-list`（パースはするが利用は限定的）、`ip dhcp pool`
（`network`＋`default-router`）、`standby <group> ip <ip>`（HSRP。グループと仮想 IP のみ。priority／preempt は非対応 — Sprint 5 SF5-7）、
`shutdown`、セキュリティ関連（`transport input`、`enable secret`／`password`、`snmp-server community`、`service password-encryption`）。

既知の制約と注意点：
- **NX-OS** は構文が違う（`feature` 行、インターフェイスの既定値）。まだ対象外。
- ACL はパースするが `pathTrace` では評価しない（SonicWall をセキュリティ境界として扱う）。Cisco の ACL 到達性は将来の拡張。
- バナーブロックや自由記述は `!` 境界で読み飛ばす。上記パターン外の複数行構文は無視され、エラーにはならない。
- 既定の管理状態：明示的な `shutdown` だけがポートを down とみなす。
- **`standby <group> ip <ip>`（全機能監査 Medium-2）。** `ParsedInterface.standby` は単一値（`StandbyConfig | null`）なので、
  同じインターフェイスに複数の HSRP グループがある構成（負荷分散）では最後のグループしか残らず、前のグループは黙って失われる。
  現状 `verify.ts` に HSRP のルールは無いので誤判定にはならないが、将来 HSRP のルールを足すときは配列化が必要。
- **VLAN 別の `spanning-tree vlan <list> priority <n>`（全機能監査 Medium-3）。** `stpPriority` はデバイス単位の単一値なので、
  VLAN ごとに優先度を変える負荷分散構成では最後の VLAN の値だけがルート選出（Sprint 4 S4-4）に反映される。VLAN 別のルート選出は
  モデル化していない（デバイス単位の簡易モデルとしての意図的な簡略化）。

## SonicWall `.exp`（Settings Export）の復号と変換（v4.21.0）

`.exp` は難読化されたバイナリではなく、**`key=value&key=value&…` という設定変数の並びを base64 でエンコードしたテキスト**
（値は URL／percent エンコード。末尾に `&&` が付くことがある）。SonicOS 6 系・7 系（Gen7）とも同じ方式。パスワードなど一部の値だけは
機器側で暗号化されたまま格納されており復号できない。根拠：
- SonicWall 公式 KB「How to get the configurations of the firewall based on the exporting EXP (Settings) file」
  （`base64 -d`／`certutil -decode` で可読化。SonicOS 7.1.2 の例あり）
- 公開実装 pryorda/sonicwallRuleParser（同梱の実物 `.exp` とその復号テキストで本実装を検証：507変数が完全一致）、
  faridlav/SonicWallParser（.NET。Models／Parsing のキー名と列挙値）

実装：`src/engine/expDecode.ts`（復号）→ `src/engine/expToCli.ts`（構造化 → CLI テキスト／Excel シート）→ `src/engine/xlsx.ts`
（依存ライブラリなしの最小 XLSX ライタ）。UI は独立モード「④ .exp コンバート」（`src/ui/phases/PhaseExp.tsx`、`expArtifacts.ts`、
`components/ExpConvertPanel.tsx`）だけ。v4.22.0 以降、投入枠（Phase 03／簡易検証）は `.exp` を受け付けず、変換した `.txt` を投入する
（変換と検証を混ぜない）。

確認済みの変数体系（N はスロット番号で連番ではない）：
- インターフェイス `iface_ifnum_N`／`iface_name_N`（`X3%3aV3` のように名前も percent エンコード）／`iface_phys_type_N`（0＝物理、2＝VLAN）／
  `interface_Zone_N`／`iface_comment_N`／`iface_lan_ip_N`／`iface_lan_mask_N`／`iface_static_ip_N`（WAN 静的）／`iface_static_mask_N`／
  `iface_vlan_tag_N`／`iface_dhcp_enable_N`／`iface_port_disabled_N`／`iface_{https,http,ssh,ping,snmp}_mgmt_N`／`eth_mtu_N`
- アドレス `addrObjId_N`／`addrObjType_N`（1＝host、2＝range、4＝network、8＝group）／`addrObjZone_N`／`addrObjIp1_N`／`addrObjIp2_N`
  （network ではマスク、range では終端）。グループ所属は `addro_atomToGrp_N`（メンバー）＝`addro_grpToGrp_N`（グループ）
- サービス `svcObjId_N`／`svcObjType_N`（1＝object、2＝group）／`svcObjIpType_N`（6＝tcp、17＝udp、1＝icmp）／`svcObjPort1_N`／`svcObjPort2_N`。
  グループ所属は `so_atomToGrp_N`／`so_grpToGrp_N`
- アクセスルール `policyAction_N`（2＝allow。1／0 は deny／discard だが公開実装の間で割り当てが食い違うため「2 以外は遮断」とだけ解釈し、
  生の値を Excel に残す）／`policySrcZone_N`／`policyDstZone_N`／`policySrcNet_N`／`policyDstNet_N`／`policyDstSvc_N`（空＝any）／
  `policyEnabled_N`／`policyComment_N`
- NAT `natPolicyOrigSrc_N`／`OrigDst`／`OrigSvc`／`TransSrc`／`TransDst`／`TransSvc`（空＝any／original）／`natPolicySrcIface_N`／
  `natPolicyDstIface_N`（`iface_ifnum` の値。−1＝any）／`natPolicyEnabled_N`／`natPolicyComment_N`
- ゾーン `zoneObjId_N`／`zoneObjZoneType_N`。DHCP `prefs_dhdynIpStart_N`／`IpEnd`／`Gateway`／`Mask`／`dns0..2`／`domainname`／
  `LeaseTime`／`Enable`／`Comment`。機器情報 `shortProdName`／`buildNum`

CLI テキストへの変換で**意図的に省略**するもの（変換パネルと Excel に明示）：アドレス／サービスのグループ（FACET はカスタムグループの
メンバー展開に未対応）、FQDN オブジェクト、無効化された NAT ポリシー、`X*` 以外のインターフェイス（MGMT／U0 など）、静的ルート
（`.exp` 側のキー名が未確認）。機器名（hostname）のキーも公式資料で確認できていないため、`firewallName`／`hostname`／`sysName` が
あれば使い、無ければ `system name` を出力しない。

## SonicWall（`parseSonicWall`）— SonicOS CLI の可読テキスト
`.exp` は「④ .exp コンバート」で CLI テキストに変換し、利用者がその `.txt` を投入する（パーサも投入枠も `.exp` を直接は読まない）。
スペースを含むオブジェクト名は `"…"` で引用された形を受け付け、`!`／`#` の行は注釈として認識済み扱いにする（v4.21.0）。
パーサが期待するのは、`show` の出力や文書化された CLI から導いた、正規化された可読形式。対応：`zone`／`ip … netmask`／`vlan`／
`comment` を伴う `interface X#`／`X#:V#`、`address-object`（host／network／range、任意で zone）、`service-object`、
`action`／`source`／`destination`／`service` と有効／無効を伴う `access-rule from <z> to <z>`、`nat-policy`（original／translated／
outbound-interface）、DHCP スコープ、`route-policy`、WAN の ping／管理に関するヒント。

既知の制約と注意点：
- 実際の SonicOS の構文は版によって異なる。受け付ける形式はきれいな上位集合であり、バイト単位で SonicOS に一致するものではない
  （UI では「CLI 可読テキスト」と案内）。実エクスポートの解析を足すなら、明確に別の経路に置くこと。
- **WAN の ping／管理許可の検出（全機能監査 Medium-6。再調査で `!`／`#` 行も除外に拡張）。** `ping.*from\s+wan`／
  `management.*(from\s+wan|wan.*allow)` は緩い部分一致。`comment` 行と `!`／`#` で始まる行は除外済み（誤検知の方向は対応済み）だが、
  これらの正規表現が実際の SonicOS CLI の表記（`https-management`／`ssh-management`／`ping from WAN` など）と一致するかは未検証で、
  見逃しの方向のリスクが残る。実機または公式リファレンスとの照合が今後の課題。
- **組み込みのアドレスグループ（Sprint 4、S4-3）。** `"<Zone> Subnets"`（例：`"LAN Subnets"`）は `objContains()`（`evalFW.ts`）が、
  そのゾーンに割り当てられた全インターフェイスのサブネットの和集合として動的に解決する。実在する組み込みグループであることは
  SonicOS 6.5 E-CLI Reference Guide の複数箇所（`show address-group ipv4 "LAN Subnets"` など）で確認済み。
- **カスタムの address-group／service-group のメンバー展開は未対応（意図的）。** SonicOS 6.5 E-CLI Reference Guide には
  グループの作成・削除（`address-group ipv4 "<name>"`）はあるが、メンバーを追加するコマンドの構文が見当たらなかった。
  確証の無い構文をでっち上げて実装しない方針（SonicOS 6／7 の判別を見送ったのと同じ理由）を優先し、実データ（P3-4 の実機 fixture）が
  手に入ったときに再調査する。
- ルール内の未知のオブジェクト名は一致なしとして扱う（保守的。誤って許可にしない）。

## 拡張するときは
- 追加は `src/engine/parsers/{cisco,sonicwall}.ts` の中、既存の flush／`!` 境界の構造の内側に行う。**`src/facet-core.js` と
  `app/facet.html` は v3.1.0 の履歴であり編集禁止**（`CLAUDE.md` 参照）。
- `test/engine/engine.test.ts`（Vitest）に、狙いを絞った fixture とアサーションを足す。
- 挙動や機能を変えたら版を上げる（`CLAUDE.md` の版管理手順を参照）。
