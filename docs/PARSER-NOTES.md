# Parser notes

The parsers are deliberately tolerant and pattern-based, not full grammars. They target
**readable CLI text**, not binary exports. Expect to extend them as real configs arrive.

v4.0.0 (Sprint 1.5) で TypeScript に移植済。実体は `src/engine/parsers/cisco.ts` と
`src/engine/parsers/sonicwall.ts`。型は `src/engine/types.ts` の `CiscoParsed` /
`SonicWallParsed` / `ParsedInterface` を参照。挙動は v3.1.0 と完全互換
(`test/engine/engine.test.ts` の回帰スイート全 PASS で保証)。

Sprint 3 で IOS / IOS-XE / NX-OS の判別と SonicOS バージョン差対応を実装予定。
詳細は `ROADMAP.md`。

## プラットフォーム判別(Sprint 3 P3-2、2026-07-04 実装)

`parseCisco` の返り値 `platformHint.signals` に、選択機種の OS ファミリーと矛盾する
構文シグナルを列挙する(型は `types.ts` の `PlatformHint` 参照)。検出ロジックは
`src/engine/parsers/cisco.ts` の `detectPlatformHint()`(既存の抽出ロジックとは
完全に独立した追加スキャン)。`verify.ts` の CAP チェックが選択機種の
`SwitchCapabilities.osVersions` と突合し、矛盾があれば CAP err を発火する。

**根拠(2026-07-04 時点のウェブ調査、Cisco 公式ドキュメント中心):**

| シグナル | 判定根拠 | 確信度 |
|---|---|---|
| `nxos-feature` (`^feature \S+$`) | NX-OS のモジュール機能有効化構文。IOS/IOS-XE には存在しない(`license feature X` と紛れないよう3トークン形式は除外) | 高 |
| `nxos-feature-set` | `feature-set`(VDC スコープの機能バンドル) | 高 |
| `nxos-vdc` (`vdc <name> id <n>`) | Virtual Device Context。Nexus 7000/7700 のみに存在するため低再現率だが検出時は高確信度 | 高(出現時) |
| `nxos-mgmt0` (`interface mgmt0`) | NX-OS 全機種共通の管理ポート名(小文字・スラッシュ無し)。IOS-XE の `Management0/0` 等とは書式が異なる | 高 |
| `nxos-vrf-context` (`vrf context <name>`) | NX-OS の VRF 構文。IOS/IOS-XE は `vrf definition` / `ip vrf` | 高 |
| `nxos-boot` (`boot nxos\|kickstart bootflash:`) | NX-OS 固有の boot 動詞。`boot system bootflash:` 単体は IOS-XE でも使われるため対象外 | 高 |
| `iosxe-install-mode` (`packages.conf`) | Catalyst 9000 系の install mode はアーキテクチャ上 IOS-XE 専用 | 高 |
| `iosxe-license-tier` (`network-essentials\|network-advantage\|dna-*`) | Catalyst 9000 系のライセンス階層名。2960-X/1000 系は `lanbase`/`lanlite`/`ipservices` を使用 | 高(FACET のカタログ内限定) |
| `iosxe-smart-licensing` (`service call-home` + `license smart transport callhome` の両方) | Smart Licensing は他製品ラインにも存在するため単体では非決定的。2 行が揃って初めて FACET のカタログ内(2960-X 系は Smart Licensing 非対応)では実用的なシグナルとなる | 高(クラスタとしてのみ) |
| `iosxe-platform-fed` (`platform punt-keepalive\|qos\|ptp\|sudi\|tcam-limit`) | IOS-XE の FED(Forwarding Engine Driver)固有コマンド | 高 |
| `ios-classic-license-tier` (`lanbase\|lanlite\|ipservices`) | 2960-X/1000 系の Right-To-Use ライセンス階層名 | 高 |

**意図的に実装しなかったもの(判別不能と判断):**
- IOS vs IOS-XE の一般的な判別(FACET のカタログ外の機種を含む一般論としては、
  `spanning-tree mode`/ACL/AAA 等の主要構文が両者でほぼ同一のため信頼できる
  判別法が存在しない。上記シグナルは「FACET のカタログという閉じた集合の中でのみ」
  実用的な代理指標であり、一般則として拡大解釈しないこと)。
- **SonicOS 6 系 と 7 系(Classic Mode)の CLI テキストレベルでの判別**:
  公式の SonicOS/X 7 Command Line Interface Reference Guide が bot 対策
  (Imperva)で取得できず、信頼できる一次情報を確認できなかった。SonicOS 7 には
  Classic Mode(6.5 と概ね同じ `access-rule`/`address-object`/`nat-policy`/`zone`
  キーワード)と Policy Mode(SonicOSX、`Security Policy` 等の別体系)があり、
  ファームウェアバージョンだけではどちらのモードかも判定できないことが判明。
  確証の無い判別ロジックを実装しない方針を優先し、`SonicWallParsed` には
  `platformHint` を追加していない。Policy Mode 等の非対応方言が投入された場合は
  `ParseCoverage`(Sprint 3 P3-1)の認識率低下として自然に可視化される
  ため、実用上のセーフティネットは既に機能している。

## Cisco (`parseCisco`) — assumes IOS / IOS-XE running-config text
Handled: `hostname`, `vlan` + `name`, `interface` and `interface range` (expanded),
`switchport` access/trunk/native/allowed, `channel-group`, `ip address` (+secondary),
`speed`/`duplex`/`mtu`, `spanning-tree mode`/`portfast`/`bpduguard`, SVIs (`interface
Vlan<n>`), `ip route` (static), `ip access-list` / `access-list` (parsed, lightly used),
`ip dhcp pool` (`network` + `default-router`), `standby <group> ip <ip>` (HSRP;
group + virtual IP only, no priority/preempt — Sprint 5 SF5-7), `shutdown`,
and security signals (`transport input`, `enable secret`/`password`, `snmp-server
community`, `service password-encryption`).

Known gaps / watch-outs:
- **NX-OS** differs (e.g. `feature` lines, different interface defaults). Not a target yet.
- ACLs are parsed but not fully simulated in `pathTrace` (SonicWall is treated as the
  security boundary). Cisco ACL reachability is a future extension.
- Banner blocks and free-text are skipped on the `!` boundary; multi-line constructs
  outside the patterns above are ignored, not errored.
- Default admin state: only an explicit `shutdown` marks a port down.
- **`standby <group> ip <ip>`(全機能監査 Medium-2)**: `ParsedInterface.standby` は
  単一値(`StandbyConfig | null`)のため、同一インターフェイスに複数の HSRP グループ
  (負荷分散構成等)がある場合、最後に出現したグループのみが保持され、それ以前の
  グループ情報はサイレントに失われる。現状 `verify.ts` は `standby` を一切参照
  しない(検証ルールが無い)ため誤判定には繋がらないが、将来 HSRP 系のルールを
  追加する際はこの制約を踏まえる(配列化が必要)こと。
- **VLAN 別 `spanning-tree vlan <list> priority <n>`(全機能監査 Medium-3)**:
  `stpPriority` はデバイス単位の単一値のため、VLAN 毎に優先度を変える負荷分散
  構成では最後に出現した VLAN の値のみが `verify.ts` の STP root election
  (Sprint 4 S4-4)に反映される。per-VLAN root election はモデル化されていない
  (デバイス単位の簡易モデルのため、これは意図的な簡略化)。

## SonicWall `.exp`(Settings Export)の復号と変換(v4.21.0)

`.exp` は「難読化バイナリ」ではなく、**`key=value&key=value&…` の設定変数リストを
base64 エンコードしたテキスト**(値は URL/percent エンコード。ファイル末尾に終端 `&&` が
付く場合がある)。SonicOS 6 系・7 系(Gen7)とも同一方式。パスワード等の一部の値だけは機器側で
暗号化されたまま格納され復号できない。根拠:
- SonicWall 公式 KB「How to get the configurations of the firewall based on the exporting EXP
  (Settings) file」(`base64 -d` / `certutil -decode` で可読化。SonicOS 7.1.2 の例あり)
- 公開実装 pryorda/sonicwallRuleParser(同梱の実物 `.exp` とその復号テキストで本実装を検証:
  507 変数が完全一致)、faridlav/SonicWallParser(.NET、Models/Parsing のキー名・列挙値)

実装: `src/engine/expDecode.ts`(復号)→ `src/engine/expToCli.ts`(構造化 → CLI テキスト /
Excel シート)→ `src/engine/xlsx.ts`(依存ライブラリなしの最小 XLSX ライタ)。UI は
`src/ui/expArtifacts.ts` / `components/ExpConvertPanel.tsx`。

確認済みの変数体系(N はスロット番号で連番ではない):
- インターフェイス `iface_ifnum_N` / `iface_name_N`(`X3%3aV3` のように名前も percent
  エンコード)/ `iface_phys_type_N`(0=物理, 2=VLAN)/ `interface_Zone_N` / `iface_comment_N` /
  `iface_lan_ip_N` / `iface_lan_mask_N` / `iface_static_ip_N`(WAN 静的)/ `iface_static_mask_N` /
  `iface_vlan_tag_N` / `iface_dhcp_enable_N` / `iface_port_disabled_N` /
  `iface_{https,http,ssh,ping,snmp}_mgmt_N` / `eth_mtu_N`
- アドレス `addrObjId_N` / `addrObjType_N`(1=host, 2=range, 4=network, 8=group)/
  `addrObjZone_N` / `addrObjIp1_N` / `addrObjIp2_N`(network ではマスク、range では終端)。
  グループ所属 `addro_atomToGrp_N`(メンバー)= `addro_grpToGrp_N`(グループ)
- サービス `svcObjId_N` / `svcObjType_N`(1=object, 2=group)/ `svcObjIpType_N`(6=tcp, 17=udp,
  1=icmp)/ `svcObjPort1_N` / `svcObjPort2_N`。グループ所属 `so_atomToGrp_N` / `so_grpToGrp_N`
- アクセスルール `policyAction_N`(2=allow。1/0 は deny/discard で公開実装間で割り当てが
  食い違うため「2 以外は遮断」とだけ解釈し、生の値を Excel に残す)/ `policySrcZone_N` /
  `policyDstZone_N` / `policySrcNet_N` / `policyDstNet_N` / `policyDstSvc_N`(空 = any)/
  `policyEnabled_N` / `policyComment_N`
- NAT `natPolicyOrigSrc_N` / `OrigDst` / `OrigSvc` / `TransSrc` / `TransDst` / `TransSvc`
  (空 = any / original)/ `natPolicySrcIface_N` / `natPolicyDstIface_N`(`iface_ifnum` の値、
  -1 = any)/ `natPolicyEnabled_N` / `natPolicyComment_N`
- ゾーン `zoneObjId_N` / `zoneObjZoneType_N`。DHCP `prefs_dhdynIpStart_N` / `IpEnd` /
  `Gateway` / `Mask` / `dns0..2` / `domainname` / `LeaseTime` / `Enable` / `Comment`。
  機器情報 `shortProdName` / `buildNum`

CLI テキストへの変換で**意図的に省略**するもの(変換パネルと Excel に明示される):
アドレス/サービスグループ(FACET はカスタムグループのメンバー展開に未対応)、FQDN
オブジェクト、無効化された NAT ポリシー、`X*` 以外のインターフェイス(MGMT / U0 等)、
静的ルート(`.exp` 側のキー名を確認できていない)。機器名(hostname)のキーも公式資料で
確認できていないため、`firewallName` / `hostname` / `sysName` があれば採用し、無ければ
`system name` を出力しない。

## SonicWall (`parseSonicWall`) — readable SonicOS CLI text
`.exp` は上記の変換を経て CLI テキストになってからこのパーサに渡される(直接は読まない)。
スペースを含むオブジェクト名は `"…"` で引用された形を受け付け、`!` / `#` 行は注釈として
認識済み扱いにする(v4.21.0)。 The parser expects a
normalized, readable form derived from `show` output / documented CLI. Handled:
`interface X#`/`X#:V#` with `zone`/`ip ... netmask`/`vlan`/`comment`,
`address-object` (host/network/range, optional zone), `service-object`,
`access-rule from <z> to <z>` with `action`/`source`/`destination`/`service` and
enable/disable, `nat-policy` (original/translated/outbound-interface), DHCP scopes,
`route-policy`, and WAN ping/management hints.

Known gaps / watch-outs:
- Real SonicOS syntax varies by version; the accepted form is a clean superset, not
  byte-exact SonicOS. Document the accepted format for users (the UI says "CLI readable
  text"). If you add real-export parsing, do it behind a clearly separate path.
- **WAN ping/管理許可の検出(全機能監査 Medium-6、再調査で `!`/`#` 行も除外に拡張)**:
  `ping.*from\s+wan` / `management.*(from\s+wan|wan.*allow)` は緩い部分一致で、
  `comment` 行・`!`/`#` で始まる行(cisco.ts の慣習に合わせた自由記述の注釈)は
  除外済み(誤検知方向は対応済み)だが、これらの正規表現が実際の SonicOS CLI 構文
  (`https-management`/`ssh-management`/`ping from WAN` 等の正確な表記)と
  一致しているかは未検証。見逃し方向(実際の許可設定を検出し損なう)のリスクが
  残っている可能性があるため、実機/公式リファレンスでの照合が今後の課題。
- **組み込みアドレスグループ(Sprint 4 S4-3、2026-07-05 対応)**: `"<Zone> Subnets"`
  (例: `"LAN Subnets"`)は `objContains()`(`evalFW.ts`)がゾーンに割り当てられた
  全インターフェイスのサブネットの和集合として動的に解決する。実在する SonicOS の
  組み込みグループであることは SonicOS 6.5 E-CLI Reference Guide の複数箇所
  (`show address-group ipv4 "LAN Subnets"` 等)で確認済み。
- **カスタム address-group / service-group のメンバー展開は未対応**(意図的)。
  SonicOS 6.5 E-CLI Reference Guide を精読したが、グループへメンバーを追加する
  CLI コマンドの構文(`address-group ipv4 "<name>"` でグループ自体の作成/削除は
  文書化されているが、メンバー追加コマンドが見当たらない)を確認できなかった。
  確証の無い構文をでっち上げて実装しない方針を優先(SonicOS 6/7 判別を見送った
  判断と同じ理由)。実データ(P3-4 の実機 fixture)が手に入った際に再調査する。
- Unknown object names in a rule are treated as no-match (conservative — avoids false allows).

## When extending
- Keep additions inside `src/engine/parsers/{cisco,sonicwall}.ts`(既存の
  flush / `!`-boundary 構造の中に追加する)。**`src/facet-core.js` /
  `app/facet.html` は v3.1.0 の履歴用で編集禁止**(`CLAUDE.md` 参照)。
- Add a focused fixture + assertion to `test/engine/engine.test.ts`(Vitest)。
- 挙動・機能を変更したらバージョンを更新する(`CLAUDE.md` のバージョン管理手順を参照)。
