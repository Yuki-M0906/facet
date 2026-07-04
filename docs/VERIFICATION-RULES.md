# Verification rules

Seven categories(L1/L2/STP/L3/FW/SEC + CAP)。Each finding is `err` (clear
contradiction, must fix) or `lack` (missing config / needs confirmation / relies on an
unverifiable default). Score = `max(0, 100 − err×12 − lack×4)`.

Sprint 3 (P3-3) で「未指定時の既定挙動」のモデル化を反映(2026-07-04)。根拠は
`docs/PARSER-NOTES.md` のプラットフォーム判別セクション参照。FACET は静的解析であり
実機の稼働状態そのものは検証できないため、既定挙動に基づく判定は常に `lack`(断定
しない)で扱う方針。

## L1 — Physical (per link)
- Speed mismatch on a link (both ends fixed, differing) → err
- Duplex mismatch → err
- MTU mismatch → lack
- EtherChannel mode incompatibility (e.g. `active`↔`on`, `passive`↔`passive`) → err

## L2 — VLAN / Trunk
- Access port references a VLAN not in the VLAN DB → lack (port → lack)
- Trunk with no `allowed vlan` (implicit all) → lack
- `switchport mode` unset → lack(機種既定の DTP `dynamic auto` として動作。VLAN 設定
  の有無を問わず発火。Sprint 3 P3-3 で「VLAN 設定がある場合のみ」から拡張)
- shutdown port that is a declared link end → lack
- Per link: mode mismatch (access↔trunk) → err; native VLAN mismatch → err; no common
  allowed VLAN → err; switch-side VLAN not allowed on the router side → lack
- Link end with no interface config at all → lack

## STP
- L2 loop detected via union-find over `links`。常に lack(Sprint 3 P3-3 で修正:本
  カタログの全 SKU は `spanning-tree mode` 未指定時 Rapid-PVST+ が既定と判明したため、
  以前の「未設定なら err」判定を撤回。未設定でも既定でループが保護されている前提とし、
  明示設定を推奨するメッセージに変更)。
- `portfast` on a trunk port → lack

## L3 — Reachability
- An access VLAN in use has no L3 gateway (no subnet with a gateway for that VLAN) → lack
- Duplicate IP across interfaces → err
- DHCP pool `default-router` ≠ the actual gateway of that subnet → err

## FW — Firewall policy (SonicWall)
- For each non-WAN zone, if no rule allows it to reach WAN → lack (can't reach internet)
- Evaluated object-aware via `evalFW` (address-objects, service-objects, enable/disable,
  rule order; inter-zone default-deny, intra-zone allow).

## SEC — Hardening / policy hygiene
- Telnet enabled → err; `enable password` without `enable secret` → lack
- SNMP community `public`/`private` → err
- WAN-side ping allowed → lack; WAN-side management allowed → err
- Access port without `portfast` → lack; portfast without `bpduguard` → lack
- `any/any/any` allow rule (overly permissive) → lack
- Rule shadowed by an earlier broad same-zone allow → lack

## Reachability matrix
`buildMatrix` computes subnet→subnet via `evalFW` with service `any`:
`ok` (allowed) / `deny` (blocked or no permit) / `nogw` (no L3 gateway) / `self`.
Same-subnet (L2) pairs are out of scope.

## CAP — Equipment capability vs config(Sprint 2、2026-07-04 拡張)
`catalog.ts` の各 SKU の `capabilities`(`SwitchCapabilities` / `RouterCapabilities`)
が定義されていれば、その上限・対応範囲を config が超えていないかをチェックする。
capabilities が未定義の SKU は silent skip(何も発火しない)。
- VLAN 数が `maxVlansSupported` を超過 → err
- SVI 数が `maxSviCount` を超過 → err
- ACL 総エントリ数が `maxAclEntries` を超過(概算) → err
- `spanning-tree mode` が SKU の `stpVariants` に含まれない → err
- `channel-group mode desirable/auto`(PAgP)だが SKU が `supportsPagp: false` → err
- (SonicWall) VLAN サブインターフェイス数 / access-rule 数 / NAT ポリシー数が
  各上限(`maxVlanInterfaces`/`maxAccessRules`/`maxNatPolicies`)を超過 → err
- **プラットフォーム判別ヒント(Sprint 3 P3-2)**:`parseCisco` が返す
  `platformHint.signals` に NX-OS 固有シグナル(FACET のカタログ外機種)が含まれる
  → err。または選択機種の OS ファミリー(`osVersions`)と矛盾する classic
  IOS/IOS-XE シグナルが含まれる → err(機種選択・ファイル取り違えの早期発見)。
  詳細・判定根拠は `docs/PARSER-NOTES.md`。SonicWall 側は判別ロジック無し
  (同ドキュメント参照)。

## Path trace
`pathTrace(state, srcCidr, dstSpec, service)` walks SRC → L2 (access switch → trunk →
router) → GW (L3 gateway subif) → RT (connected route, or default route to WAN) → FW
(object-aware decision, reports the deciding rule index) → NAT (only for WAN egress) →
DST. Returns per-hop `ok|deny|info` and an overall `verdict`.

## Adding a rule
1. Add the check inside `verify()` in `src/engine/verify.ts`(use `add(cat, level,
   where, desc, why, fix)` and, for port-tied findings, `setPort(dev, iface, level,
   msg)`)。**`src/facet-core.js` / `app/facet.html` は v3.1.0 の履歴用で編集禁止**
   (`CLAUDE.md` 参照)。
2. Add an assertion in `test/engine/engine.test.ts`(Vitest)。Keep the
   intentionally-flawed sample(SW-02 has VLAN30-undefined / native-99 / telnet)as
   the fixture that exercises findings.
3. 挙動・機能を変更したらバージョンを更新する(`CLAUDE.md` のバージョン管理手順を参照)。
