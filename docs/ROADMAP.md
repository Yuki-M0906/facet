# Roadmap / ロードマップ

*English first, 日本語は後半にあります。*

Priorities are ordered by how directly an item serves the owner's top requirement,
**accurate reproduction of real equipment behaviour**. Presentation and UI polish come
after that.

## Done

### Sprint 1 — restoring trust (2026-05-24, v3.1.0)
- Firewall `svcMatch` fixed to a bidirectional overlap test (protocol / port-range
  intersection between rule service and requested service)
- `pathTrace` no longer emits L2 / GW / RT / FW hops for same-subnet traffic
- Fonts unified on Meiryo UI; Google Fonts CDN removed
- Phase 00 "mode select" added; manual topology rebuilt as click-on-SVG; download button
  in Phase 03; `reIntake` clears completely
- 46 tests passing

### Sprint 1.5 — TypeScript / React port (2026-06-23, v4.0.0)
- Engine split into `src/engine/*.ts` with all public types defined
- UI rebuilt as React components in `src/ui/**/*.tsx` (`useReducer` + Context)
- Vite + `vite-plugin-singlefile`; **the deliverable stays a single HTML**
  (`dist/index.html`, ~220 KB at the time)
- 46 tests passing; parity with v3.1.0 (score / counts / rules) confirmed

### Sprint 2 — real equipment catalog (2026-07-04, v4.1.0)
- All 7 SonicWall SKUs (TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700)
  re-specified from datasheets, correcting v3.1.0's port layouts
- All 8 Cisco SKUs (C1000-24/48, C2960-X 24/48, C9200-24/48, C9300-24/48) likewise
- New `RouterCapabilities` / `SwitchCapabilities` types with real data per SKU
- **New CAP category**: VLAN / SVI / ACL limit overruns, PAgP not supported, STP variant
  not supported
- Capability chips in Phase 01; PoE in port tooltips
- 50 tests passing (4 CAP cases added)

### Sprint 5 MVP — "build from scratch in a GUI" mode (2026-07-04, v4.1.0)
> Originally planned after Sprints 3/4 (parser accuracy, engine realism). User interviews
> showed this is FACET's core feature, so it was pulled forward and shipped as an MVP
> right after Sprint 2. Sprints 3/4 now serve to raise its accuracy.

- `generateCiscoConfig` / `generateSonicWallConfig`: generators from a draft (structured
  form data) to running-config / SonicOS CLI text (`src/engine/generators/`), strictly
  matching the parsers' regular expressions
- **Round-trip guaranteed structurally**: generated text is stored in `device.config` and
  always re-parsed by `parseCisco` / `parseSonicWall` to produce `device.parsed`. No
  duplicated logic; the verification pipeline is identical to upload mode
- Phase 00 "② build" enabled; Phase 03 switches between the upload form (verify) and the
  GUI builder (build)
- Cisco: hostname / STP / VLAN list / per-port access & trunk / portfast / bpduguard /
  shutdown / SVI / security settings
- SonicWall: hostname / interfaces (incl. VLAN sub-interfaces) / address objects /
  service objects / access rules / NAT policies
- "⇩ Download" gives device-ready text immediately after generation
- 20 round-trip tests (`test/engine/builder.test.ts`) plus a generate → verify pipeline
  test; 70 tests in total
- **Out of MVP scope (done later)**: real-time limits for inputs beyond the model's
  capability (then only a post-generation CAP warning), ACL / DHCP pool / HSRP builders,
  range-type address objects

## Next phases

### Sprint 3 — parser accuracy and implicit defaults (in progress)
**Estimate:** 5–7 days.

- [x] **P3-1** (v4.2.0, 2026-07-04) Track every recognised / unrecognised line and show
      parser coverage in the Phase 03 slot (`ParseCoverage`)
- [x] **P3-2** (v4.3.0, 2026-07-04) IOS / IOS-XE / NX-OS detection, limited to signals
      that are practical within FACET's closed catalog (not a general rule). SonicOS 6 / 7
      detection abandoned after research: the official reference was unobtainable
      (`ParseCoverage`'s drop in recognition is the practical safety net). Details in
      `docs/PARSER-NOTES.md`
- [x] **P3-3** (v4.4.0, 2026-07-04) Model each platform's default when a setting is
      absent. `switchport mode` unset → `dynamic auto` (all catalog SKUs), always flagged
      in L2. Loop detection with `spanning-tree mode` unset now assumes the Rapid-PVST+
      default (the earlier `err` was an over-statement). Details in
      `docs/VERIFICATION-RULES.md`
- [ ] **P3-4** Build **a large fixture set** from anonymised real `show` output

### Sprint 4 — engine realism (done)
**Estimate:** 4–5 days. A code survey preceded it and items were taken in order of
impact (agreed 2026-07-05).

- [x] **S4-1** (2026-07-05) Cisco: `interface Port-channel<N>` switchport / trunk settings
      inherited by the physical members carrying `channel-group <N>`. Previously
      `canonIf()` matched no physical port and the common "L2 settings on the
      port-channel only" pattern was silently dropped (`mapToPorts.ts`)
- [x] **S4-2** (2026-07-05) SonicWall: NAT / route evaluation made real. `pathTrace`'s
      NAT hop now shows the matching nat-policy. Static routes (`ip route` /
      `route-policy`), previously never consulted, now have their next-hop reachability
      checked in L3
- [x] **S4-3** (2026-07-05) SonicWall: built-in address groups `"<Zone> Subnets"` resolved
      dynamically as the union of the zone's subnets (`objContains`). Custom
      address-group / service-group expansion deliberately deferred: the SonicOS 6.5
      E-CLI Reference Guide does not document the member-add command, and unconfirmed
      syntax is not implemented (see `docs/PARSER-NOTES.md`)
- [x] **S4-4** (2026-07-05) STP root election (simple model). `spanning-tree priority`
      parsed; lowest priority is the root; blocked side of redundant edges estimated by
      BFS hop count; ties reported honestly as "cannot determine" (no link cost /
      bridge-ID comparison)
- [x] **S4-5** (2026-07-05) Effective LACP / EtherChannel bundle check: all members on the
      same peer, peer consistent (err), asymmetric member counts (lack). Bundle-wide
      inconsistencies were invisible to the single-link mode check
- [x] **S4-6** (2026-07-05) Unused CAP fields reviewed. `maxRoutingEntries` implemented as
      connected (SVI count) + static routes (err, lower bound). `maxMacAddresses`
      deliberately left unimplemented: host count cannot be derived from static config
      (recorded in `docs/VERIFICATION-RULES.md`)

**Sprint 4 complete (2026-07-05).** All six items from the survey implemented, tested and
checked by hand. Tests 101 → 119.

### Sprint 5 follow-up — build-mode accuracy (done)
**Estimate:** 2–3 days. MVP already shipped (above). Taken in order of impact and
frequency (2026-07-05).

- [x] **SF5-1** (2026-07-05) Inputs beyond the model's capability are limited live in the
      GUI (add buttons disabled when VLAN / SVI / VLAN sub-interface counts reach the
      limit; previously only a warning)
- [x] **SF5-2** (2026-07-05) `spanning-tree priority` field (16 steps of 4096 in a select,
      so invalid values cannot be entered), matching the S4-4 root election
- [x] **SF5-3** (2026-07-05) ACL builder (Cisco): named ACL permit / deny lines in the GUI,
      applied as `ip access-group` in / out on ports; deleting an ACL detaches it
- [x] **SF5-4** (2026-07-05) DHCP pool builder (Cisco): name, network, mask, default-router
- [x] **SF5-5** (2026-07-05) Range-type address objects (SonicWall): start / end IP in the
      GUI → `address-object ipv4 <name> range`. Parsing and evaluation already supported
      it; this filled the builder gap
- [x] **SF5-6** (2026-07-05) Port-channel / channel-group builder (Cisco): group number,
      LACP mode and switchport settings defined once, ports bundled as members. Member
      ports cannot be edited individually, so inconsistent states cannot be built
      (GUI counterpart of S4-1 inheritance and S4-5 bundle check)
- [x] **SF5-7** (2026-07-05) HSRP (`standby`) builder (Cisco): group and virtual IP on an
      SVI. `parseCisco`'s standby regex extended to capture the group
      (`ParsedInterface.standby`: `string | null` → `{group, ip} | null`). Priority /
      preempt out of scope (not parsed)

**Sprint 5 follow-up complete (2026-07-05).** All seven items implemented, tested and
checked by hand. Tests 119 → 128.

### Sprint 5.5 — whole-app UI/UX refresh
**Estimate:** 3–4 days. Unlike the Sprint 5 follow-up (build-mode forms only), this
looked across every phase. No whole-app review had happened since the v3.1.0 font
unification and the v4.1.0 GUI hardening.

- [x] **Step 1** (2026-07-06) Review from screenshots and layout measurements. Three
      findings: ① header overflows below 640 px (whole page scrolls sideways); ② large
      switch (24+ ports) chassis SVG breaks at mobile widths (fixed-width drawing with
      `overflow-x: visible`); ③ secondary text colour `--faint` fails WCAG AA (measured
      ≈2.83:1). Agreed to take them in order of impact
- [x] **v4.16.1** (2026-07-06) ① and ③ fixed (responsive + accessibility): tagline hidden
      below 640 px; `--faint` lightened to ≈4.6:1 (AA)
- [x] **② re-investigated** (2026-07-06) and found to be a false positive: the chassis SVG's
      parent `.chassis` already has `overflow-x: auto`, and `.svgwrap` being `visible` is
      the intended pattern (same as `.matrix`). Step 1 had looked at `.svgwrap` alone.
      After ①, `docOverflow = 0` was confirmed even with two 28-port switches. No change
- [x] **v4.17.0** (2026-07-07) Results page (Phase 05) information density reworked,
      judging and merging three independent proposals: Findings moved to second place
      (right after score / categories), merged into a summary panel (score + totals +
      categories + top findings); path trace, topology, chassis and matrix grouped into
      a collapsible "diagnostics" area; sticky sub-navigation; per-device collapsible
      chassis to limit page height; category chips fixed to 7 columns (were 6). The
      rejected idea (a real serif for `--serif`) is explained in CHANGELOG.md
- [x] Phase transition animation and loading states unified — **v4.20.0** (2026-07-11):
      `.phase` entry animation, `.analyzing .shim` and `.complete .gem` all disabled
      under `prefers-reduced-motion: reduce`; the only real loading sequence
      (PhaseAnalyze, 2.5 s) shortened under that setting; the only unhandled async step
      (PhaseQuick file read) given a light indicator reusing
      `.builder-generate-status.pending`. Policy stated: the full-screen "verifying…"
      effect is reserved for verify → results; other async work uses inline badges
- [x] Remaining accessibility items (keyboard; contrast done above) — **v4.17.1**
      (2026-07-08): twelve delete controls span → button, file inputs visually hidden,
      keyboard operation of Faceplate SVG ports, focus trap in the version-history
      modal, unified `:focus-visible`

### Full-feature audit — bug fixes (2026-07-11)
After Sprint 5.5, at the user's request, a cross-cutting audit of every feature: 13
areas investigated in parallel and verified independently, 53 findings after merging
duplicates. The nine High items first.

- [x] **v4.17.2** (2026-07-11) Cisco `trunk allowed vlan none` / `no` prefix misread,
      SonicWall⇄Cisco mode-check asymmetry, duplicate port assignment in star topology,
      unresolved FW services treated as no-match, SEC WAN exclusion condition, missing
      L3 / FW checks with DHCP WAN, build-mode reset inconsistency, stale documentation
      (9 items)
- [x] Medium: 19 items (22 originally; 3 fixed alongside the High batch) — **v4.18.1**
      (2026-07-11): `interface range vlan` expansion and `sviVlan` bug, SonicWall WAN
      false positives / zone fallback / multi-line route-policy, MTU mismatch not
      reaching `setPort`, false shutdown + mode-unset finding, duplicate CIDR detection,
      representative-IP alignment between `buildMatrix` and `pathTrace`,
      `maxStpInstances` wiring, build-mode UI inconsistencies (configured-port count, ACL
      limit, service-object ranges), manual-topology confirmation dialog and duplicate
      prevention, confirmation on sample load / clear, disabled state of locked slots,
      VERIFICATION-RULES.md corrections
- [x] The remainder (Low / minor / some held Medium) re-surveyed in parallel, verified
      independently and all addressed — **v4.20.0** (2026-07-11). Details in
      CHANGELOG.md: about 44 findings across parser, engine, build-mode UI, topology UI,
      accessibility, documentation and test coverage (3 re-rated Medium and treated as
      such). Supporting notes not in CHANGELOG.md live in the session's workflow record
      (individual tickets are not persisted by policy)

### SonicWall `.exp` support (2026-09-20, v4.21.0 → standalone mode in v4.22.0)
- [x] `.exp` confirmed, via the official KB, public implementations and a real sample, to
      be base64 + URL-encoded `key=value&…`; decoded in the browser and converted to
      FACET-readable CLI text. Decoded text / FACET text / Excel (11 sheets, dependency-free
      XLSX writer) downloadable. Omitted items (groups, FQDN, disabled NAT, static routes,
      …) are stated in the panel and the Excel. Details in `docs/PARSER-NOTES.md`
- [x] v4.22.0: by the user's decision, "④ .exp convert" became a standalone Phase 00 mode
      and automatic `.exp` conversion was removed from the upload slots (① / ③) —
      conversion and verification are not mixed
- [ ] Static routes and hostname: `.exp` key names unconfirmed, so not converted. Add when
      a real `.exp` shows the variables (candidate: `firewallName`)

### Sprint 6 — live collector (true "theory → live")
**Estimate:** 1 week.

- A separate Node / Python tool connects to devices over SSH
- Collects `show cdp/lldp neighbors`, `show interfaces status`, `show spanning-tree`
- Compares FACET's model with the live state and reports intent-vs-actual drift
- No in-browser SSH; a separate runner is required

## Far future

7. **Engine as an npm package** — shared by web UI, CLI and collector
8. **Batfish-class analysis** — multi-vendor, OSPF / BGP route reconstruction, formal ACL
   shadow verification, golden-config compliance, diff / impact analysis

## Out of scope (a different product)

Live / active verification — real pings, throughput, SNMP polling, real-time monitoring —
needs an always-on, network-connected backend; that is PRTG / LibreNMS / Zabbix
territory. FACET will not be extended there.

## The real bottleneck

Not algorithms but **parser maintenance**. Differences between IOS, IOS-XE and NX-OS, and
between SonicOS versions, are where things break. The mechanism for accumulating
anonymised real configs as test fixtures is the heart of Sprint 3.

---

# 日本語版

優先順位は、オーナーが最優先に指定した要件である**「実機の挙動を正確に再現すること」**にどれだけ直結するかで並べる。
見栄えや UI の磨き込みはその後。

## 完了

### Sprint 1 — 信頼の回復（2026年5月24日、v3.1.0）
- FW の `svcMatch` を双方向のオーバーラップ判定に修正（rule.service と request.service のプロトコル／ポート範囲の交差）
- `pathTrace` が同一サブネットのとき L2／GW／RT／FW を出さない構造に修正
- フォントを Meiryo UI に統一、Google Fonts CDN を撤去
- Phase 00「モード選択」を追加、手動トポロジーを SVG クリック式に刷新、Phase 03 にダウンロードボタン、`reIntake` の完全クリア
- テスト46件すべて合格

### Sprint 1.5 — TypeScript／React への移植（2026年6月23日、v4.0.0）
- エンジンを `src/engine/*.ts` に分割し、公開型をすべて定義
- UI を `src/ui/**/*.tsx` の React コンポーネントに（`useReducer`＋Context）
- Vite＋`vite-plugin-singlefile` で**配布物は単一 HTML のまま**（`dist/index.html`、当時約220KB）
- テスト46件すべて合格。v3.1.0 との同等性（スコア／件数／検出ルール）を確認

### Sprint 2 — 機材カタログの実物化（2026年7月4日、v4.1.0）
- SonicWall 全7 SKU（TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700）をデータシートから再定義し、v3.1.0 の誤ったポート構成を修正
- Cisco 全8 SKU（C1000-24/48、C2960-X 24/48、C9200-24/48、C9300-24/48）も同様に
- `RouterCapabilities`／`SwitchCapabilities` 型を新設し、各 SKU に実データを格納
- **CAP カテゴリを新設**：VLAN／SVI／ACL 数の上限超過、PAgP 非対応、STP 方式非対応を検出
- Phase 01 に capability チップ、ポートのツールチップに PoE 情報
- テスト50件すべて合格（CAP 4件追加）

### Sprint 5 MVP — 「GUI でゼロから作成」モード（2026年7月4日、v4.1.0）
> 当初は Sprint 3／4（パーサ精度・エンジンのリアリズム）の後に予定していたが、利用者へのヒアリングで「これが FACET の核心機能」と分かり、
> 優先度を繰り上げて Sprint 2 直後に MVP として実装した。Sprint 3／4 はこの機能の精度を底上げする位置づけに変わった。

- `generateCiscoConfig`／`generateSonicWallConfig`：draft（フォーム編集用の構造化データ）から running-config／SonicOS CLI テキストを
  生成するジェネレータを新設（`src/engine/generators/`）。既存パーサの正規表現に厳密に準拠
- **往復保証を構造で担保**：生成したテキストは `device.config` に格納したうえで、必ず既存の `parseCisco`／`parseSonicWall` で読み直して
  `device.parsed` を作る。生成とパースの二重管理を避け、検証パイプラインは投入モードと完全に共通
- Phase 00 の「② 作成モード」を有効化。Phase 03 が投入フォーム（検証）と GUI 構築フォーム（作成）を切り替える
- Cisco：hostname／STP／VLAN 一覧／ポート単位の access・trunk／portfast／bpduguard／shutdown／SVI／セキュリティ設定
- SonicWall：hostname／インターフェイス（VLAN サブ IF 含む）／アドレスオブジェクト／サービスオブジェクト／アクセスルール／NAT ポリシー
- 生成後は「⇩ ダウンロード」で実機投入用テキストをすぐ取得できる
- 往復保証テスト20件（`test/engine/builder.test.ts`）と、生成→verify のフルパイプラインテストを追加。テスト合計70件
- **MVP のスコープ外（後に対応）**：機種能力を超える入力のリアルタイム制限（当時は生成後の CAP 警告のみ）、ACL／DHCP プール／HSRP のビルダー、
  range 型のアドレスオブジェクト

## 次のフェーズ

### Sprint 3 — パーサ精度の向上と暗黙の既定値のモデル化（進行中）
**所要：** 5〜7日。

- [x] **P3-1**（v4.2.0、2026年7月4日）認識行／未認識行を全行追跡し、パーサの網羅率を Phase 03 のスロットに表示（`ParseCoverage`）
- [x] **P3-2**（v4.3.0、2026年7月4日）IOS／IOS-XE／NX-OS の判別。FACET のカタログという閉じた集合の中で実用的なシグナルに限定（一般則ではない）。
      SonicOS 6／7 の判別は公式リファレンスが取得できず調査の末に断念（`ParseCoverage` の認識率低下が実質的な安全網）。詳細は `docs/PARSER-NOTES.md`
- [x] **P3-3**（v4.4.0、2026年7月4日）各プラットフォームの「未指定時の既定挙動」をモデル化。`switchport mode` 未指定 → `dynamic auto`
      （本カタログ全 SKU 共通）として L2 で常に注意喚起。`spanning-tree mode` 未指定時のループ検出を Rapid-PVST+ 既定の前提に修正
      （誤って `err` としていた過大評価を是正）。詳細は `docs/VERIFICATION-RULES.md`
- [ ] **P3-4** 実機の `show` 出力（匿名化）から**大量の test fixture** を作る

### Sprint 4 — 評価エンジンのリアリズム強化（完了）
**所要：** 4〜5日。着手前にコードを調査し、影響の大きい順に取り組む方針で合意（2026年7月5日）。

- [x] **S4-1**（2026年7月5日）Cisco：`interface Port-channel<N>` の switchport／trunk 設定を、`channel-group <N>` を持つ物理メンバーポートへ継承。
      従来は `canonIf()` がどの物理ポートにも一致させられず、実務でよくある「L2 設定は Port-channel 側にだけ書く」構成が黙って読み捨てられていた
      （`mapToPorts.ts`）
- [x] **S4-2**（2026年7月5日）SonicWall：NAT／経路評価の実質化。`pathTrace` の NAT ホップで実際に該当する nat-policy を表示。
      これまで一切参照していなかった静的ルート（`ip route`／`route-policy`）のネクストホップ到達可否を L3 で検出
- [x] **S4-3**（2026年7月5日）SonicWall：組み込みアドレスグループ `"<Zone> Subnets"`（例：`"LAN Subnets"`）をゾーン内サブネットの和集合として
      動的に解決するよう `objContains` を拡張。カスタムの address-group／service-group のメンバー展開は、SonicOS 6.5 E-CLI Reference Guide を
      精読してもメンバー追加コマンドの構文を確認できなかったため意図的に見送り（確証の無い構文は実装しない。詳細は `docs/PARSER-NOTES.md`）
- [x] **S4-4**（2026年7月5日）STP ルート選出（簡易モデル）。`spanning-tree priority` をパースし、優先度最小のスイッチをルートブリッジと推定。
      BFS ホップ数で冗長エッジのブロック側を推定し、同点で特定できなければ「特定できず」と正直に報告（リンクコストと bridge ID の比較は非対応）
- [x] **S4-5**（2026年7月5日）LACP／EtherChannel 束の実効的なフォーミング判定。全メンバーが同じ対向機器につながり、対向側でも同じ
      チャネルグループとして一貫しているかを検証（err）。メンバー数の非対称も検出（lack）。単一リンク単位のモード互換チェックでは見えなかった
      束全体の不整合を検出できるようになった
- [x] **S4-6**（2026年7月5日）未使用の CAP フィールドを精査。`maxRoutingEntries` は直結ルート（SVI 数）＋静的ルート数との比較で実装（err、下限見積り）。
      `maxMacAddresses` は「何台の端末が実際につながるか」が静的コンフィグから原理的に導けないため、意図的に未実装のまま
      （調査結果は `docs/VERIFICATION-RULES.md` に記録）

**Sprint 4 完了（2026年7月5日）。** 事前調査で洗い出した S4-1〜S4-6 の6項目をすべて実装・テスト・実地確認済み。テスト101件 → 119件。

### Sprint 5 フォローアップ — GUI 作成モードの精度向上（完了）
**所要：** 2〜3日。MVP は完了済み（上記）。影響度と使用頻度の順に着手（2026年7月5日）。

- [x] **SF5-1**（2026年7月5日）機材能力を超える設定を GUI 上でリアルタイムに制限（VLAN 数／SVI 数／VLAN サブ IF 数が上限に達したら追加ボタンを無効化。
      従来は警告表示のみ）
- [x] **SF5-2**（2026年7月5日）`spanning-tree priority` の入力欄を追加（S4-4 のルート選出に対応。4096刻み16段階の select で不正値を作れない）
- [x] **SF5-3**（2026年7月5日）ACL ビルダー（Cisco）。名前付き ACL の permit／deny 行を GUI で組み立て、ポートの `ip access-group`（in／out）として
      適用できる。ACL を削除すると参照ポートの適用も自動で外れる
- [x] **SF5-4**（2026年7月5日）DHCP プールビルダー（Cisco）。プール名・ネットワーク・マスク・default-router を GUI で設定
- [x] **SF5-5**（2026年7月5日）range 型のアドレスオブジェクト（SonicWall）。開始／終了 IP を GUI で指定して `address-object ipv4 <name> range` を生成。
      パースと評価（evalFW）は既に対応済みで、ビルダー側の抜けを埋めた形
- [x] **SF5-6**（2026年7月5日）Port-channel／channel-group ビルダー（Cisco）。channel-group 番号・LACP モード・switchport 設定を一括定義し、
      ポート側でメンバーとして束ねる。メンバー化したポートは個別の L2 設定を編集できないようにし、矛盾した状態を作れない
      （S4-1 の継承と S4-5 の束の整合チェックに対応する GUI 側の実装）
- [x] **SF5-7**（2026年7月5日）HSRP（`standby`）ビルダー（Cisco）。SVI に standby グループと仮想 IP を設定。往復保証のため `parseCisco` の
      standby 正規表現をグループ番号も捕捉するよう拡張（`ParsedInterface.standby`：`string | null` → `{group, ip} | null`）。
      priority／preempt はパース非対応のため対象外

**Sprint 5 フォローアップ完了（2026年7月5日）。** SF5-1〜SF5-7 の全7項目を実装・テスト・実地確認済み。テスト119件 → 128件。

### Sprint 5.5 — アプリ全体の UI/UX 刷新
**所要：** 3〜4日。Sprint 5 フォローアップ（作成モードのフォームに限定）とは別に、全 Phase の見た目と使い勝手を横断的に見直す。
v3.1.0 の Meiryo UI 統一と v4.1.0 の GUI ハードニング以降、アプリ全体を対象にした見直しは行っていなかった。

- [x] **Step 1**（2026年7月6日）スクリーンショットとレイアウト計測に基づくレビュー。3件の問題：① ヘッダーが幅 640px 未満で横にはみ出す
      （ページ全体が横スクロール）、② 大型スイッチ（24ポート以上）のシャーシ SVG がモバイル幅で崩れる（`overflow-x: visible` のまま固定幅で描画）、
      ③ 補足テキスト色 `--faint` が WCAG AA のコントラスト基準に届かない（実測 約2.83:1）。影響度・使用頻度順に着手する方針で合意
- [x] **v4.16.1**（2026年7月6日）① ③ を修正（レスポンシブとアクセシビリティ）。幅 640px 未満でタグラインを非表示にして横漏れを解消、
      `--faint` を明るくしてコントラスト比を約4.6:1（AA）に
- [x] **② の再調査**（2026年7月6日）① の修正後に再検証したところ誤検知と判明。シャーシ SVG の親要素 `.chassis` はもともと `overflow-x: auto` を持ち、
      `.svgwrap` が `visible` なのは正しい設計（`.matrix` と同じパターン）。Step 1 では `.svgwrap` 単体だけを見て誤判定していた。
      ① 修正後の実機検証で、28ポートスイッチ2台の構成でも `docOverflow = 0` を確認。対応不要
- [x] **v4.17.0**（2026年7月7日）結果画面（Phase 05）の情報密度を見直し。3方向の独立した設計案を判定・統合して実施。Findings をスコア／
      カテゴリの直後（2番目）へ移動し、概要パネル（スコア＋集計＋カテゴリ＋上位の指摘プレビュー）に統合。経路トレース・トポロジー図・
      シャーシ・マトリクスは折りたたみ式の「診断」領域にまとめ、スティッキーなサブナビを追加。シャーシは機器ごとに折りたためるようにして
      台数が増えても縦に伸びすぎないように。カテゴリチップを7列に修正（7カテゴリなのに6列だった表示バグ）。見送った案（`--serif` を本物の
      セリフにする）の理由は CHANGELOG.md に記載
- [x] Phase 間の遷移アニメーションとローディング状態の統一 — **v4.20.0**（2026年7月11日）。`.phase`（全フェーズ共通の入場アニメーション）、
      `.analyzing .shim`、`.complete .gem` を `prefers-reduced-motion: reduce` 時に一括で無効化。唯一の実運用中ローディング
      （PhaseAnalyze の演出 2.5秒）も同設定時は大幅に短縮。唯一未処理だった非同期処理（PhaseQuick のファイル読込）に
      `.builder-generate-status.pending` を再利用した軽量インジケータを追加。フルスクリーンの「検証中…」演出は verify→results の1箇所に限る、
      という方針を明文化（他の非同期処理は今後もインラインのバッジで対応）
- [x] アクセシビリティの残項目（キーボード操作。コントラスト比は上記で対応済み）— **v4.17.1**（2026年7月8日）。削除ボタン12箇所を span から
      button に、ファイル選択を visually-hidden に、Faceplate SVG のポートをキーボードで操作可能に、バージョン履歴モーダルにフォーカストラップ、
      `:focus-visible` によるフォーカス可視化の統一

### 全機能監査 — バグ修正（2026年7月11日）
Sprint 5.5 のあと、利用者の依頼で全機能を対象にした横断監査を実施。13領域を並行して調査し独立に検証、重複を統合して53件の指摘。
まず重要度 High の9件に対応。

- [x] **v4.17.2**（2026年7月11日）Cisco の `trunk allowed vlan none`／`no` プレフィックスの誤読、SonicWall⇄Cisco のモード判定の非対称、
      star トポロジーでのポート重複割当、FW の未解決サービスの no-match 化、SEC の WAN 除外条件、DHCP WAN 構成での L3／FW チェック欠落、
      作成モードのリセット不整合、文書の陳腐化（9件）を修正
- [x] 重要度 Medium 19件（元は22件。うち3件は High 対応時に併せて修正済み）— **v4.18.1**（2026年7月11日）。`interface range vlan` の展開と
      `sviVlan` 付与のバグ、SonicWall WAN 検知の誤検知・ゾーンのフォールバック・route-policy の複数行対応、MTU 不一致の `setPort` 漏れ、
      shutdown＋mode 未指定の誤発火、重複 CIDR の検出、`buildMatrix`／`pathTrace` の代表 IP 統一、`maxStpInstances` の配線、作成モードの
      各種 UI 不整合（設定済みポート数・ACL 上限・サービスオブジェクトの範囲）、手動トポロジーの確認ダイアログとポート重複防止、
      サンプル読込／クリアの確認ダイアログ、ロックされたスロットの無効化、VERIFICATION-RULES.md の訂正
- [x] 残り（Low／些末／一部保留の Medium）を並行監査で洗い直し、独立に検証したうえで全件対応 — **v4.20.0**（2026年7月11日）。詳細は CHANGELOG.md。
      パーサ・検証エンジン・作成モード UI・トポロジー UI・アクセシビリティ・文書・テストカバレッジにまたがる約44件（うち3件は再調査で
      Medium 相当と判明し格上げして対応）。CHANGELOG.md に載せていない詳細な根拠は当該セッションのワークフロー記録にある（個票は永続化しない方針）

### SonicWall `.exp` 対応（2026年9月20日、v4.21.0 → v4.22.0 で独立モード化）
- [x] `.exp` が base64＋URL エンコードの `key=value&…` であることを公式 KB、公開実装、実物サンプルで裏取りし、ブラウザ内で復号 → FACET の
      可読 CLI テキストへ変換。復号テキスト／FACET 用テキスト／Excel（11シート、依存ライブラリなしの自前 XLSX ライタ）をダウンロード可。
      省略項目（グループ、FQDN、無効な NAT、静的ルートなど）はパネルと Excel に明示。詳細は `docs/PARSER-NOTES.md`
- [x] v4.22.0：利用者の判断で「④ .exp コンバート」を Phase 00 の独立モードにし、投入枠（①／③）から `.exp` の自動変換を撤去（変換と検証を混ぜない）
- [ ] 静的ルートと機器名（hostname）は `.exp` 側のキー名が未確認のため未変換。実機の `.exp` で該当変数を確認できたら追加する（候補：`firewallName`）

### Sprint 6 — ライブコレクタ（本当の「理論 → 実機」）
**所要：** 1週間。

- 別の Node／Python ツールが SSH で実機に接続
- `show cdp/lldp neighbors`、`show interfaces status`、`show spanning-tree` を取得
- FACET の理論モデルと実機の状態を照合し、意図と実態のずれを出す
- ブラウザ内 SSH は試みない（別のランナーが必須）

## 遠い将来

7. **エンジンの npm パッケージ化** — Web UI、CLI、コレクタで共有
8. **Batfish 級の分析** — マルチベンダー、OSPF／BGP の経路再構築、ACL shadow の形式検証、golden-config への準拠、構成差分と影響解析

## 対象外（別の製品）

ライブ／能動的な検証 — 実際の ping、スループット、SNMP ポーリング、リアルタイム監視 — は常時稼働でネットワークにつながったバックエンドが要る。
それは PRTG／LibreNMS／Zabbix の領域で、FACET をそこへ広げることはしない。

## 本当のボトルネック

アルゴリズムではなく**パーサの保守**。IOS と IOS-XE と NX-OS の差、SonicOS の版差は壊れやすい箇所の宝庫。
匿名化した実機コンフィグを test fixture として蓄える仕組みが Sprint 3 の本丸。
