# Changelog — FACET (Network Verification Atelier)

主要な変更のみ。詳細は git log と `docs/SPRINT-1.5-DESIGN.md` / `docs/ROADMAP.md` を参照。

---

## v4.4.0 — 2026-07-04

### Sprint 3 P3-3 — 暗黙既定値のモデル化

- **L2**: `switchport mode` 未指定ポートに対する注意喚起を拡張。従来は `accessVlan` /
  `trunkAllowed` が設定済みの場合のみ発火していたが(「VLAN は書いたがモードを
  忘れた」ケースのみ検出)、完全に未設定のポート(いわゆる bare interface)でも
  同様に発火するよう拡張した。メッセージも「機種既定の dynamic auto として動作する」
  ことを明示するように変更(本カタログの全 SKU — Catalyst 1000/2960-X/9200/9300 —
  は DTP 既定モードが `dynamic auto` であることをウェブ調査で確認。旧 2950/3550 等の
  `dynamic desirable` とは異なる)。
- **STP(過大評価の是正)**: L2 ループ検出において、`spanning-tree mode` 未設定の
  スイッチが含まれる場合に `err`(「STP 無し」)と判定していたロジックを修正。
  ウェブ調査により、本カタログの全 SKU は `spanning-tree mode` 未指定時
  Rapid-PVST+ が既定(2960-X/1000 は IOS 15.2(4)E 以降、9200/9300 は IOS-XE)である
  ことが判明したため、未設定 ≠ STP 無効という誤った前提を撤回。未設定でも
  既定動作でループが保護されている前提に修正し、判定を `lack`(明示設定を推奨)へ
  格下げした。FACET は静的解析であり実機の稼働状態そのものは検証できないため、
  断定は避けるメッセージにしている。
- **ドキュメント整合性の是正**: `docs/VERIFICATION-RULES.md` が TypeScript 移行
  (v4.0.0)以前の記述のまま放置されていたことが判明。CAP カテゴリ(Sprint 2 で
  追加済み)の記載が丸ごと欠落していたほか、`src/facet-core.js` / `app/facet.html`
  (いずれも deprecated)を参照する古い「ルールの追加方法」が残っていた。現状の
  `src/engine/verify.ts` / `test/engine/engine.test.ts` を参照する内容に是正し、
  P3-2/P3-3 の変更点も反映した。あわせて `docs/ROADMAP.md` の P3-2 完了バージョン
  表記の誤り(v4.2.0 → 正しくは v4.3.0)も修正。
- テスト 5 ケース追加(L2 dynamic auto 拡張の新旧比較、STP lack 化の新旧比較)。
  テスト計 93 → 98 ケース、全 PASS(既存ケースへの回帰なし。いずれの既存 fixture も
  bare interface / STP 未設定ループのシナリオを含んでいなかったため、拡張前の
  挙動を偶然にも壊していなかったことをテストで確認済み)。

---

## v4.3.0 — 2026-07-04

### Sprint 3 P3-2 — プラットフォーム判別(NX-OS/IOS-XE誤投入検知)

- `parseCisco` に `platformHint`(`PlatformHint` 型)を追加。投入コンフィグのテキストから、
  選択機種の OS ファミリー(`catalog.ts` の `SwitchCapabilities.osVersions`)と矛盾する
  構文シグナルが無いかを検出する。検出ロジック(`detectPlatformHint()`)は既存の抽出
  ロジックから完全に独立した追加スキャンで、`out`/`cur` 等の既存状態には一切触れない
  (ゼロ回帰)。
- **NX-OS 判別**: `feature <name>` / `feature-set` / `vdc <name> id <n>` /
  `interface mgmt0` / `vrf context <name>` / `boot nxos|kickstart bootflash:` を検出。
  FACET のカタログに NX-OS 機器は存在しないため、検出 = カタログ対象外の機種の
  コンフィグが投入された可能性が高いというシグナルとして扱う(CAP err)。
- **classic IOS vs IOS-XE 判別**: 一般則としての判別は信頼できる方法が無いことを
  ウェブ調査で確認した上で、FACET のカタログという閉じた集合(Catalyst 9000系=IOS-XE、
  2960-X/1000系=classic IOS)の中でのみ実用的な代理指標を採用。
  `license boot level network-essentials|network-advantage|dna-*`(IOS-XE 側の
  ライセンス階層名)、`packages.conf`(install mode)、`platform punt-keepalive|qos|ptp|
  sudi|tcam-limit`(FED 固有コマンド)、`service call-home` + `license smart transport
  callhome` のクラスタ(Smart Licensing、単体では非決定的なため両方必須)を IOS-XE 側の
  シグナルとし、`license boot level lanbase|lanlite|ipservices` を classic IOS 側の
  シグナルとした。選択機種の OS ファミリーと矛盾する場合は CAP err を発火
  (機種選択・アップロードファイルの取り違えを早期発見)。
- **SonicOS 6/7 判別は実装を見送り**: 公式の SonicOS/X 7 Command Line Interface
  Reference Guide が bot 対策(Imperva)で取得できず、CLI テキストレベルでの信頼できる
  判別根拠が確認できなかった。加えて SonicOS 7 には Classic Mode(6.5 相当)と
  Policy Mode(SonicOSX、別体系)があり、ファームウェアバージョンだけではモードも
  判定できないことが判明。確証の無い判定ロジックを実装しない方針を優先し、
  `SonicWallParsed` には `platformHint` を追加していない。Policy Mode 等の非対応方言は
  既存の `ParseCoverage`(v4.2.0)の認識率低下として自然に可視化されるため、実用上の
  セーフティネットは既に機能している。調査結果は `docs/PARSER-NOTES.md` に記録。
- テスト 12 ケース追加(NX-OS/IOS-XE/classic IOS シグナル検出、CAP 突合の一致/不一致、
  誤検出防止 `license feature X` 等)。テスト計 81 → 93 ケース、全 PASS(既存ケースへの
  回帰なし)。

---

## v4.2.0 — 2026-07-04

### Sprint 3 P3-1 — パーサ・カバレッジの可視化

- `ParseCoverage` 型を新設(`totalLines` / `recognizedLines` / `unrecognizedLines` /
  `coveragePercent`)。`parseCisco` / `parseSonicWall` の両方が返り値に `coverage` を
  含めるようになった。空行は「認識に失敗したコンテンツ」ではなく構造上の区切りのため
  分母(`totalLines`)に含めない。
- **Cisco**: 制御フロー上「未認識」と判定できる箇所はちょうど2つ
  (`vlan`/`name` 待ちブロックの末尾フォールスルー、インターフェース本体
  if/else-if チェーンの末尾)。この2箇所にのみ計測ロジックを追加し、
  既存の抽出ロジック・正規表現は一切変更していない。
- **SonicWall**: `nat`/`rule` ブロックが内部の一致有無に関わらず無条件で `continue`
  する構造のため、行ごとに `recognized` フラグを立てるラベル付きブロック方式
  (`matchLine: { ...; break matchLine; }`)を採用。ネストしたループが存在しないため
  `continue` と `break matchLine` は完全に等価で、既存の分岐条件・実行順序は不変。
- **UI**: Phase 03 投入モードの各スロットに「認識率 92%(3行未対応)」のような
  カバレッジ表示を追加。100% 未満の場合は警告色(topaz)で強調し、
  未対応行の一覧(行番号+内容)をツールチップで確認できる。静的解析ツールとして
  「何を検証できていないか」を隠さない方針の一環。
- 既存の匿名サンプル(`SMP_C1`)を実際にパースしたところ `line vty 0 4` が
  未対応行として検出された(想定どおりの検出動作。この行自体は Sprint 3 の
  後続ステップで対応予定)。
- カバレッジ専用テストを 7 ケース追加(意図的に未認識行を仕込んだ Cisco/SonicWall
  フィクスチャを含む)。テスト計 74 → 81 ケース、全 PASS(既存ケースへの回帰なし)。

---

## v4.1.0 — 2026-07-04

> **プロセス注記**: このエントリは Sprint 2 / Sprint 5 MVP / GUI ハードニングの
> 3 つの作業をまとめて記録している。本来はそれぞれで `package.json` の version と
> `src/ui/versionHistory.ts` を更新すべきだったが、当時は更新せずコミットしており、
> 旧版の本ファイルでは同じ "v4.0.0" ラベルの下に日付違いのセクションが並存していた
> (バージョン表記のあいまいさ)。本エントリで正しいバージョン番号(4.1.0)に是正し、
> 以降は `test/version.test.ts` が `package.json` と `versionHistory.ts` の不一致を
> 機械的に検出するため、同じ事故は起きない(CLAUDE.md 参照)。

### プロセス — バージョン管理の厳格化
- `src/ui/versionHistory.ts` を新設(バージョン履歴の単一ソース・オブ・トゥルース)。
  ヘッダーのバージョンバッジをクリックするとバージョン履歴モーダルを表示。
- `test/version.test.ts` で `package.json` の version と `versionHistory.ts` の
  整合性を自動チェック。ずれると `npm test` が失敗する。テスト計 70 → 74 ケース。

### Sprint 2 — 機材カタログ実物化
- SonicWall 全 7 SKU / Cisco 全 8 SKU の物理仕様を datasheet 精読で正確化
  (v3.1.0 で誤っていた TZ370/470/570/670 のポート構成を修正)
- `RouterCapabilities` / `SwitchCapabilities` 型を新設、Firewall/VPN throughput、
  Max VLAN/MAC/ACL、STP variant、PoE 等を SKU ごとに保持
- **CAP カテゴリ**新設:機材能力を超える設定(VLAN数超過、PAgP非対応、
  STP variant非対応等)を検出
- Phase 01 に capability chip、ポート tooltip に PoE 情報を表示
- テスト 46 → 50 ケース

### Sprint 5 MVP — 「GUI でゼロから作成」モード
- 当初計画(Sprint 3/4 の後に着手)を前倒し。ユーザーヒアリングでこれが
  FACET の核心機能と判明したため優先度を繰り上げ
- `src/engine/generators/{cisco,sonicwall}.ts` — draft(フォーム編集用データ)
  → running-config / SonicOS CLI テキストのジェネレータを新設
- 往復保証を構造で担保:生成テキストは既存の `parseCisco`/`parseSonicWall` で
  再パースして `device.parsed` を作るため、検証パイプラインは投入モードと完全共通
- Phase 00「作成モード」を有効化、Phase 03 が投入フォーム/GUI構築フォームに
  動的切替
- Cisco/SonicWall 双方の GUI フォーム(VLAN・ポート・FWルール・NAT等)を実装
- 「⇩ ダウンロード」で生成テキストをそのまま実機投入可能
- 往復保証テスト 20 ケース追加(`test/engine/builder.test.ts`)。テスト計 70 ケース

### GUI ハードニング — Sprint 5 MVP のフォローアップ
- **入力検証**(`src/ui/components/builder/validation.ts`):IP/マスク/VLAN ID/
  hostname の形式チェック、赤枠+エラー文でインライン表示、不正時は生成ボタン無効化
- **機種上限のリアルタイム警告**:VLAN数/SVI数(Cisco)、VLANサブIF数(SonicWall)を
  capabilities と比較し、生成前にその場で警告
- **バグ修正**:トポロジー再構成(`BUILD_TOPOLOGY`)時に古い `builderDrafts` が
  残存し、実ポート数と不整合を起こす問題を修正
- **データロス防止**:機種/台数変更で既存データが失われる唯一の箇所に確認ダイアログ、
  機器ごとの個別リセットボタンを追加
- **GUI デザイン刷新**:セクション見出しを `.eyebrow` と同じ金線トリートメントに統一、
  ポート行をステータス色分け(access=emerald / trunk=gold / shutdown=garnet)、
  カスタムチェックボックス、CSS Grid による整列、機器ごとの完成度サマリ表示

---

## v4.0.0 — 2026-06-23

### Sprint 1.5 — Vite + React + TypeScript ポート

#### アーキテクチャ
- **TypeScript 5(strict)+ Vite 5 + React 18** に全面移行。
- エンジンを `src/engine/*.ts` に分割(types / catalog / ip / canonIf / parsers / 
  mapToPorts / buildSubnets / evalFW / buildMatrix / pathTrace / verify / autoLinks)。
- UI を `src/ui/**/*.tsx` に React コンポーネント化(`useReducer` + Context の中央
  集権 store)。Phase 7 個 + 共有コンポーネント 13 個。
- `vite-plugin-singlefile` で配布物は引き続き **単一 HTML**(`dist/index.html`、
  約 220KB、外部依存ゼロ)。利用者の体験は v3.1.0 と同等(ダブルクリック起動)。
- Path alias `@engine/*` / `@ui/*` で UI → エンジン内部直接 import を防止。

#### 解消した負債
- **エンジン二重化解消**:旧 `src/facet-core.js` と `app/facet.html` 内コピーの手動
  同期が不要に。今後は `src/engine/` のみが正典。
- **型システム導入**:Port/Device/Finding/Catalog/AST 等の全公開型を `types.ts` に
  定義し、機材カタログとパーサ AST の型安全性を担保。Sprint 2 以降の機材精度向上の
  土台。
- **Google Fonts CDN 撤去**:Sprint 1 で既に開始した外部依存撤去を完了。SVG 内の
  `font-family` も Meiryo UI / Consolas に置換。

#### テスト
- 旧 `test/facet.test.js`(plain-Node)→ `test/engine/engine.test.ts`(Vitest)に移行。
  既存 46 ケース全 PASS、Sprint 1 で追加した svcMatch 双方向 / pathTrace 同一サブネット
  のケースも維持。
- `npm test` で 7ms 実行(エンジン純関数のみ、jsdom 不要)。

#### DEPRECATED
- `app/facet.html`(v3.1.0 単一 HTML 版)
- `src/facet-core.js`(v3.1.0 エンジン IIFE)
- `test/facet.test.js`(v3.1.0 plain-Node テスト)

履歴用に残置、編集禁止。新側を編集する。

#### ドキュメント
- `CLAUDE.md` を v4.0.0 構成で全面書き直し
- `README.md` を利用者/開発者の 2 視点で書き直し
- `docs/ARCHITECTURE.md` を v4.0.0 アーキテクチャに更新
- `docs/ROADMAP.md` を Sprint 1.5 完了 → Sprint 2(機材カタログ実物化)最優先に再構成
- `docs/PUBLISHING.md` を新ビルドフロー(`npm run build`)+ Cloudflare Pages 推奨に更新
- `docs/PARSER-NOTES.md` に TS 移行注記
- `docs/SPRINT-1.5-DESIGN.md` を ✅ COMPLETED に

---

## v3.1.0 — 2026-05-24

### Sprint 1 — 信頼回復 & UX 整備

#### エンジンバグ修正
- **`svcMatch` を双方向 overlap 判定に修正**:旧来「rule.service が定義されているか」
  しか見ておらず、ルールが `svc-https` のとき任意の service が match する致命バグを
  解消。マトリクスと経路トレースの allow 判定が正しくなる。
- **`pathTrace` 同一サブネット時に L2/GW/RT/FW を出さない構造に修正**:同一サブネット
  通信で存在しない GW ホップが出る UX バグを解消。

#### UI
- フォントを **Meiryo UI に統一**(等幅のみ Consolas)、Google Fonts CDN への外部依存を撤去
- **Phase 00「モード選択」**を新設(① 検証モード / ② 作成モード = Coming Soon)
- 手動トポロジーを **SVG クリック式**に刷新(ポートクリック→別機器ポートクリックで配線)
- Phase 03 に **「⇩ ダウンロード」**を機器毎に設置(投入済コンフィグを取り出し可)
- スロットに **パース概要**(IF/VLAN/rules/NAT 件数)を表示
- `reIntake` を完全クリア(config / parsed / port 状態 / 結果すべて初期化)

#### テスト
- svcMatch 双方向 6 ケース + pathTrace 同一サブネット 3 ケースを追加(計 46 ケース)

#### 文字化け修正
- HTML 本文に直書きされていた `\uXXXX` エスケープが文字列のまま表示される問題を修正
  (本文領域のみ実 Unicode 文字へデコード)
- 1958 個のエスケープを処理、`<script>` 内 JS リテラルも全面デコードしてレビュー可能化

---

## v3.0 — initial

単一ファイル配信版 v3。Phase 01〜05 ウィザード、Cisco / SonicWall パーサ、6 カテゴリ検証、
到達性マトリクス、経路トレース。

---

## v2 / v1

`app/legacy/facet_v1.html` / `facet_v2.html` に履歴のみ保存。
