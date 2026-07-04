# Changelog — FACET (Network Verification Atelier)

主要な変更のみ。詳細は git log と `docs/SPRINT-1.5-DESIGN.md` / `docs/ROADMAP.md` を参照。

---

## v4.0.0(継続)— 2026-07-04

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
- MVP スコープ外:capability 超過のリアルタイム入力制限、ACL/DHCP/HSRP ビルダー、
  address-object range 型(いずれも Sprint 5 フォローアップで対応予定)

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
