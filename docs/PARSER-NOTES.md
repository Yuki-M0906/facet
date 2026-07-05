# Parser notes

The parsers are deliberately tolerant and pattern-based, not full grammars. They target
**readable CLI text**, not binary exports. Expect to extend them as real configs arrive.

v4.0.0 (Sprint 1.5) で TypeScript に移植済。実体は `src/engine/parsers/cisco.ts` と
`src/engine/parsers/sonicwall.ts`。型は `src/engine/types.ts` の `CiscoParsed` /
`SonicWallParsed` / `ParsedInterface` を参照。挙動は v3.1.0 と完全互換
(46 ケース全 PASS で保証)。

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
`ip dhcp pool` (`network` + `default-router`), `standby` (HSRP, basic), `shutdown`,
and security signals (`transport input`, `enable secret`/`password`, `snmp-server
community`, `service password-encryption`).

Known gaps / watch-outs:
- **NX-OS** differs (e.g. `feature` lines, different interface defaults). Not a target yet.
- ACLs are parsed but not fully simulated in `pathTrace` (SonicWall is treated as the
  security boundary). Cisco ACL reachability is a future extension.
- Banner blocks and free-text are skipped on the `!` boundary; multi-line constructs
  outside the patterns above are ignored, not errored.
- Default admin state: only an explicit `shutdown` marks a port down.

## SonicWall (`parseSonicWall`) — readable SonicOS CLI text (NOT `.exp`)
`.exp` exports are obfuscated and are intentionally unsupported. The parser expects a
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
