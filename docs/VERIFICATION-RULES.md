# Verification rules / 検証ルール

*English first, 日本語は後半にあります。*

Seven categories: L1 / L2 / STP / L3 / FW / SEC / CAP. Each finding is `err` (a clear
contradiction that must be fixed) or `lack` (missing configuration, needs confirmation,
or relies on a default that cannot be verified statically).
Score = `max(0, 100 − err×12 − lack×4)`.

Sprint 3 (P3-3, 2026-07-04) introduced the modelling of "default behaviour when a setting
is absent"; the evidence is in the platform-detection section of
`docs/PARSER-NOTES.md`. Because FACET is a static analyzer and cannot observe the running
device, any judgement based on a default is always `lack`, never a definitive `err`.

## L1 — Physical (per link)
- Speed mismatch on a link (both ends fixed, differing) → err
- Duplex mismatch → err
- MTU mismatch → lack
- EtherChannel mode incompatibility (e.g. `active`↔`on`, `passive`↔`passive`) → err
- **Effective LACP/EtherChannel bundle formation (Sprint 4, S4-5).** The checks above
  look at one declared link at a time. A separate pass (`verify.ts`, per channel-group)
  checks that all member ports of a `channel-group` are cabled to the same peer and that
  the peer treats them consistently as one channel group. Members cabled to different
  peers → err. A peer port without a channel-group → err. Peer ports spread over several
  channel groups → err. Asymmetric member counts → lack. If no member has a declared
  link, the check is skipped silently.
  **Known limitation (full audit, Medium-11):** the default `star` / `cascade` topologies
  from `autoLinks()` create one link per switch, so the physical members of a
  channel-group are never all cabled, and this check is effectively always skipped under
  default topologies. To verify a bundle, declare each member link explicitly in manual
  topology (`topoMode: 'manual'`).

## L2 — VLAN / trunk
- Access port references a VLAN missing from the VLAN database → lack (port → lack).
  VLAN 1 always exists as the device default and is excluded (full-audit re-check).
- Trunk without `allowed vlan` (implicitly all) → lack. An explicit empty list
  (`switchport trunk allowed vlan none` / all VLANs removed) is not flagged; `parseCisco`
  sets `trunkAllowedExplicit` to tell deliberate blocking from omission (audit High-1).
- `switchport mode` unset → lack (the port runs the model default, DTP `dynamic auto`).
  Fires whether or not VLAN settings exist (widened in Sprint 3 P3-3 from "only when VLAN
  settings exist").
- Shut-down port → lack. Applies to every switch port, with or without a declared link —
  hardening-style shutdown of spare ports is reported by the same rule (audit Medium-20
  corrected an earlier "declared link ends only" description).
- Per link: mode mismatch (access↔trunk) → err; native VLAN mismatch → err; no common
  allowed VLAN → err; switch-side VLAN not allowed on the router side → lack
- Link end with no interface configuration at all → lack

## STP
- L2 loop detected by union-find over `links` → always lack. Sprint 3 P3-3 found that
  every SKU in the catalog defaults to Rapid-PVST+ when `spanning-tree mode` is unset, so
  the earlier "err if unset" was withdrawn; the message now assumes the loop is protected
  by the default and recommends explicit configuration.
- **Root election (Sprint 4, S4-4).** When a loop is detected,
  `electStpRootAndBlockingEdges()` (`verify.ts`) performs a simplified root-bridge
  election and blocked-port estimate and appends it to the finding's `why`. The root is
  the switch with the lowest priority (`spanning-tree priority` / `spanning-tree vlan
  <list> priority`; unset = IEEE/Cisco default 32768). Ties are broken by device-key
  string comparison — real devices compare MAC addresses, which FACET does not hold; this
  simplification is stated in the message. Distance is approximated by BFS hop count from
  the root; for a redundant edge whose ends are at different distances the blocked side
  is identified, and when they are equal the result honestly says "cannot determine"
  (real link cost and bridge-ID comparison would be needed).
- `portfast` on a trunk port → lack

## L3 — Reachability
- An access VLAN in use has no L3 gateway (no subnet with a gateway for that VLAN) → lack
- Duplicate IP across interfaces → err
- Duplicate CIDR across different VLANs / interfaces → err (audit Medium-9: the matrix and
  path trace identify subnets by CIDR, so a CIDR assigned twice cannot be told apart;
  the root cause is reported first)
- DHCP pool `default-router` ≠ the actual gateway of that subnet → err
- Static route (`ip route` / SonicWall route-policy) whose next hop is in no known subnet
  → lack (Sprint 4, S4-2). If the device has at least one WAN interface without an IP
  literal (DHCP-assigned), the ISP-side subnet cannot be known statically, so this check
  is skipped for all routes on that device (audit High-7).

## FW — Firewall policy (SonicWall)
- For each non-WAN zone, if no rule allows it to reach WAN → lack (no internet access)
- Evaluated object-aware via `evalFW` (address objects, service objects, enable/disable,
  rule order; inter-zone default deny, intra-zone allow)

## SEC — Hardening / policy hygiene
- Telnet enabled → err; `enable password` without `enable secret` → lack
- SNMP community `public` / `private` → err
- WAN-side ping allowed → lack; WAN-side management allowed → err
- Access port without `portfast` → lack; `portfast` without `bpduguard` → lack
- `any/any/any` allow rule (overly permissive) → lack
- Rule shadowed by an earlier broad rule → lack. Applies when the earlier rule is
  any/any/any with the same from→to zone pair, whatever its `action` (audit Medium-20
  corrected an earlier reading of "allow rules in the same zone only")

## Reachability matrix
`buildMatrix` computes subnet→subnet via `evalFW` with service `any`:
`ok` (allowed) / `deny` (blocked or no permit) / `nogw` (no L3 gateway) / `self`.
Same-subnet (L2) pairs are out of scope.

## CAP — Equipment capability vs. config (Sprint 2; extended 2026-07-04)
If a SKU in `catalog.ts` defines `capabilities` (`SwitchCapabilities` /
`RouterCapabilities`), the config is checked against those limits. SKUs without
capabilities are skipped silently.
- VLAN count exceeds `maxVlansSupported` → err
- STP instance count (equal to VLAN count under PVST / Rapid-PVST) exceeds
  `maxStpInstances` → err (audit Medium-13, added 2026-07-11; MST not covered)
- SVI count exceeds `maxSviCount` → err
- Total ACL entries exceed `maxAclEntries` (approximate) → err
- `spanning-tree mode` not in the SKU's `stpVariants` → err
- `channel-group mode desirable/auto` (PAgP) on a SKU with `supportsPagp: false` → err
- (SonicWall) VLAN sub-interfaces / access rules / NAT policies exceed
  `maxVlanInterfaces` / `maxAccessRules` / `maxNatPolicies` → err
- **Platform hint (Sprint 3, P3-2).** If `parseCisco`'s `platformHint.signals` contains
  NX-OS-specific signals (a platform outside FACET's catalog) → err; or classic
  IOS / IOS-XE signals that contradict the selected model's OS family (`osVersions`) →
  err. Catches a wrong model selection or a swapped file early. Details and evidence in
  `docs/PARSER-NOTES.md`. There is no detection on the SonicWall side (same document).
- **Static FIB entry count (Sprint 4, S4-6).** Connected routes (SVI count) + static
  routes (`ip route`) exceed `maxRoutingEntries` → err. Routes learned by OSPF / EIGRP /
  BGP are not counted, so the real number can only be higher; the figure is a lower
  bound and the check fires only when the limit is certainly exceeded.
- **`maxMacAddresses` is deliberately not implemented (investigated in S4-6).** MAC table
  usage depends on how many hosts are actually attached to which ports, which cannot be
  derived from configuration text (the config declares what *may* connect, not what
  *does*). Static entries (`mac address-table static`) could give a partial check later;
  they are rare in practice, so the value is kept in `catalog.ts` and unused for now.

## Path trace
`pathTrace(state, srcCidr, dstSpec, service)` walks SRC → L2 (access switch → trunk →
router) → GW (L3 gateway sub-interface) → RT (connected route, or default route to WAN) →
FW (object-aware decision, reporting the deciding rule index) → NAT (WAN egress only) →
DST. Returns `ok | deny | info` per hop and an overall `verdict`.

## Adding a rule
1. Add the check inside `verify()` in `src/engine/verify.ts` — use `add(cat, level,
   where, desc, why, fix)` and, for port-tied findings, `setPort(dev, iface, level, msg)`.
   **`src/facet-core.js` and `app/facet.html` are the v3.1.0 history and must not be
   edited** (see `CLAUDE.md`).
2. Add an assertion in `test/engine/engine.test.ts` (Vitest). Keep the intentionally
   flawed sample (SW-02: undefined VLAN 30, native VLAN 99, telnet) as the fixture that
   exercises findings.
3. Bump the version whenever behaviour changes (see the versioning procedure in
   `CLAUDE.md`).

---

# 日本語版

カテゴリは7つ：L1／L2／STP／L3／FW／SEC／CAP。各指摘は `err`（明確な矛盾。要修正）か `lack`（設定不足、要確認、
または静的には検証できない既定挙動に依存）。スコアは `max(0, 100 − err×12 − lack×4)`。

Sprint 3（P3-3、2026年7月4日）で「設定が無いときの既定挙動」のモデル化を取り入れた。根拠は `docs/PARSER-NOTES.md` の
プラットフォーム判別の節にある。FACET は静的解析であり実機の稼働状態は観測できないため、既定挙動に基づく判定は常に `lack` とし、
断定の `err` にはしない。

## L1 — 物理（リンク単位）
- リンク両端の速度が固定値で食い違う → err
- デュプレックスの不一致 → err
- MTU の不一致 → lack
- EtherChannel モードの非互換（例：`active`↔`on`、`passive`↔`passive`）→ err
- **LACP／EtherChannel 束の実効的なフォーミング判定（Sprint 4、S4-5）。** 上記は宣言された1本のリンクごとのモード互換性だけを見る。
  別の走査（`verify.ts`、channel-group 単位）で、`channel-group` の全メンバーポートが同じ対向機器に配線されているか、
  対向側でも一貫して同じチャネルグループとして扱われているかを確認する。メンバーが別々の機器に配線 → err。対向に channel-group
  未設定のポートが含まれる → err。対向側のポートが複数のチャネルグループにまたがる → err。メンバー数が非対称 → lack。
  どのメンバーにもリンクが宣言されていなければ、判定不能として黙って飛ばす。
  **既知の制約（全機能監査 Medium-11）：** `autoLinks()` の既定トポロジー（star／cascade）はスイッチ1台につきリンクを1本しか作らないため、
  channel-group の物理メンバーが全部配線された状態にはならず、既定トポロジーではこのチェックは事実上常に飛ばされる。
  束を検証したいときは、手動トポロジー（`topoMode: 'manual'`）でメンバーごとのリンクを明示的に宣言すること。

## L2 — VLAN／トランク
- アクセスポートが VLAN データベースに無い VLAN を参照 → lack（ポートも lack）。VLAN 1 は実機の既定 VLAN として常に存在するので対象外
  （全機能監査の再調査で対応）。
- `allowed vlan` の無いトランク（暗黙の全許可）→ lack。明示的な空リスト（`switchport trunk allowed vlan none`、全 VLAN を除去）は対象外。
  `parseCisco` が `trunkAllowedExplicit` フラグで「意図的な全遮断」と「未指定」を区別する（監査 High-1 対応）。
- `switchport mode` 未設定 → lack（機種既定の DTP `dynamic auto` で動作する）。VLAN 設定の有無にかかわらず発火
  （Sprint 3 P3-3 で「VLAN 設定があるときだけ」から拡張）。
- shutdown されたポート → lack。スイッチの全ポートが対象で、リンク宣言の有無は問わない。未使用の予備ポートをハードニング目的で
  shutdown している場合も同じ基準で検知する（全機能監査 Medium-20 で、以前の「宣言されたリンク端のみ」という誤記述を訂正）。
- リンク単位：モード不一致（access↔trunk）→ err、ネイティブ VLAN 不一致 → err、共通の許可 VLAN が無い → err、
  スイッチ側の VLAN がルータ側で許可されていない → lack
- インターフェイス設定がまったく無いリンク端 → lack

## STP
- `links` に対する union-find で L2 ループを検出 → 常に lack。Sprint 3 P3-3 で、本カタログの全 SKU は `spanning-tree mode`
  未設定時に Rapid-PVST+ が既定だと判明したため、以前の「未設定なら err」を撤回した。未設定でも既定でループは保護されている前提とし、
  明示設定を推奨するメッセージにしている。
- **ルート選出（Sprint 4、S4-4）。** ループ検出時、`electStpRootAndBlockingEdges()`（`verify.ts`）が簡易的なルートブリッジ選出と
  ブロックポートの推定を行い、指摘の `why` に付記する。ルートブリッジは priority（`spanning-tree priority`／
  `spanning-tree vlan <list> priority`、未設定は IEEE／Cisco 既定の 32768）が最小のスイッチ。同点のときは device key の文字列比較で
  決める（実機は MAC アドレスで比較するが FACET は保持していないための簡略化。メッセージに明記）。ルートからの BFS ホップ数で近さを近似し、
  スパニングツリーに含まれない冗長エッジのうち両端の距離が異なるものはブロック側を特定し、同距離なら「特定できず」と正直に報告する
  （実際のリンクコストや bridge ID の比較が必要なため）。
- トランクポートに `portfast` → lack

## L3 — 到達性
- 使用中のアクセス VLAN に L3 ゲートウェイが無い（その VLAN にゲートウェイ付きサブネットが無い）→ lack
- インターフェイス間で IP が重複 → err
- 異なる VLAN／インターフェイス間で CIDR が重複 → err（全機能監査 Medium-9。到達性マトリクスと経路トレースはサブネットを CIDR で
  識別するため、同じ CIDR が複数箇所に割り当てられていると区別できない。まず根本原因である重複割当そのものを指摘する）
- DHCP プールの `default-router` がそのサブネットの実際のゲートウェイと異なる → err
- 静的ルート（`ip route`／SonicWall の route-policy）のネクストホップが既知のどのサブネットにも属さない → lack（Sprint 4、S4-2）。
  ただし、そのデバイスに IP リテラルの無い WAN インターフェイス（DHCP 取得）が1つでもあれば、ISP 側のサブネットは静的に把握できないので、
  そのデバイスの全ルートについてこのチェックを飛ばす（全機能監査 High-7 対応）。

## FW — ファイアウォールポリシー（SonicWall）
- WAN 以外の各ゾーンについて、WAN への到達を許可するルールが1つも無い → lack（インターネットに出られない）
- `evalFW` によるオブジェクト解決付きの評価（アドレスオブジェクト、サービスオブジェクト、有効／無効、ルール順。ゾーン間は既定で deny、
  ゾーン内は allow）

## SEC — ハードニング／ポリシーの衛生
- Telnet 有効 → err。`enable secret` 無しの `enable password` → lack
- SNMP コミュニティが `public`／`private` → err
- WAN 側からの ping 許可 → lack。WAN 側からの管理アクセス許可 → err
- `portfast` の無いアクセスポート → lack。`bpduguard` の無い `portfast` → lack
- `any/any/any` の許可ルール（過剰に寛容）→ lack
- 先行する広いルールに隠れるルール → lack。先行ルールが同じ from→to ゾーン対の any/any/any であれば、`action` が allow でも deny でも対象
  （全機能監査 Medium-20 で「同一ゾーンの許可ルールのみ」と読める以前の記述を訂正）

## 到達性マトリクス
`buildMatrix` はサービス `any` で `evalFW` を呼び、サブネット→サブネットを `ok`（許可）／`deny`（遮断、または許可なし）／
`nogw`（L3 ゲートウェイ無し）／`self` に分類する。同一サブネット（L2）の組は対象外。

## CAP — 機材能力とコンフィグの突合（Sprint 2、2026年7月4日に拡張）
`catalog.ts` の SKU に `capabilities`（`SwitchCapabilities`／`RouterCapabilities`）が定義されていれば、その上限・対応範囲を
コンフィグが超えていないかを確認する。capabilities が無い SKU は黙って飛ばす。
- VLAN 数が `maxVlansSupported` を超過 → err
- STP インスタンス数（PVST／Rapid-PVST では VLAN 数と等しい）が `maxStpInstances` を超過 → err（全機能監査 Medium-13、2026年7月11日追加。MST は対象外）
- SVI 数が `maxSviCount` を超過 → err
- ACL のエントリ総数が `maxAclEntries` を超過（概算）→ err
- `spanning-tree mode` が SKU の `stpVariants` に無い → err
- `channel-group mode desirable/auto`（PAgP）なのに SKU が `supportsPagp: false` → err
- （SonicWall）VLAN サブインターフェイス数／アクセスルール数／NAT ポリシー数が `maxVlanInterfaces`／`maxAccessRules`／
  `maxNatPolicies` を超過 → err
- **プラットフォーム判別のヒント（Sprint 3、P3-2）。** `parseCisco` が返す `platformHint.signals` に NX-OS 固有のシグナル
  （FACET のカタログ外の機種）が含まれる → err。または選択機種の OS ファミリー（`osVersions`）と矛盾する classic IOS／IOS-XE の
  シグナルが含まれる → err（機種の選び間違いやファイルの取り違えを早く見つける）。詳細と根拠は `docs/PARSER-NOTES.md`。
  SonicWall 側に判別ロジックは無い（同文書参照）。
- **静的な FIB エントリ数（Sprint 4、S4-6）。** 直結ルート（SVI 数）＋静的ルート（`ip route`）の合計が `maxRoutingEntries` を超過 → err。
  OSPF／EIGRP／BGP で学習する経路は数えていないので実際の数はこれより多くなり得る。下限見積りとして扱い、確実に超過している場合だけ発火する。
- **`maxMacAddresses` は意図的に未実装（S4-6 で調査済み）。** MAC テーブルの使用量は「実際に何台の端末がどのポートにつながるか」に
  依存し、コンフィグのテキストからは原理的に導けない（コンフィグは「何がつながり得るか」を宣言するだけで、「何が実際につながるか」は含まない）。
  将来 `mac address-table static` などの静的エントリを解析すれば部分的な検査は可能だが、実務での出現頻度が低いため優先度は低く、
  現時点では `catalog.ts` に値だけ保持している。

## 経路トレース
`pathTrace(state, srcCidr, dstSpec, service)` は SRC → L2（アクセススイッチ → トランク → ルータ）→ GW（L3 ゲートウェイのサブインターフェイス）
→ RT（接続経路、または WAN へのデフォルトルート）→ FW（オブジェクト解決付きの判定。決め手になったルール番号を報告）→ NAT（WAN 向きのみ）
→ DST とたどる。ホップごとに `ok | deny | info` を、全体として `verdict` を返す。

## ルールの追加手順
1. `src/engine/verify.ts` の `verify()` にチェックを足す。`add(cat, level, where, desc, why, fix)` を使い、ポートに紐づく指摘は
   `setPort(dev, iface, level, msg)` も呼ぶ。**`src/facet-core.js` と `app/facet.html` は v3.1.0 の履歴であり編集禁止**（`CLAUDE.md` 参照）。
2. `test/engine/engine.test.ts`（Vitest）にアサーションを足す。意図的に欠陥を仕込んだサンプル（SW-02：未定義の VLAN 30、ネイティブ VLAN 99、
   telnet）は、指摘を発火させる fixture としてそのまま残す。
3. 挙動や機能を変えたら版を上げる（`CLAUDE.md` の版管理手順を参照）。
