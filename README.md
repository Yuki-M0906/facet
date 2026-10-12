# FACET — Network Verification Atelier

*English first, 日本語は後半にあります。*

A **static** configuration verification tool for a small network of **one SonicWall
router and up to eight Cisco switches**. Load the device configs, declare the topology,
and get a faceplate-mapped audit in seven categories (L1 / L2 / STP / L3 / Firewall /
Hardening / Capability), a subnet reachability matrix and a hop-by-hop path trace — all
**in the browser**. Nothing is uploaded anywhere.

> **It is a static analyzer, not a live verifier.** It checks the config text against a
> declared topology. A green result means "no config contradiction found", not "the
> network works". Confirm physical connectivity on real devices. This framing is
> load-bearing — keep it.

## What it does

| Area | Features |
|---|---|
| Verification | Seven categories of checks; each finding is `err` (contradiction) or `lack` (missing / unverifiable), with a score, a reason and a suggested fix |
| Capability (CAP) | Config checked against each SKU's real limits (VLAN / SVI / ACL counts, STP variants, PAgP, routing entries) from a 15-SKU catalog |
| Reachability | Subnet-to-subnet matrix through the firewall's object-aware rule evaluation, and a hop-by-hop path trace (L2 → gateway → route → firewall → NAT) |
| Build mode | Build a Cisco or SonicWall configuration in a GUI and generate the text; the result is re-parsed by the same parsers, so verification is identical to the upload path |
| Quick check | One device, no topology: pick the type and model, upload, get results |
| `.exp` convert | Decode a SonicWall Settings Export in the browser and turn it into FACET-readable text, decoded text and an Excel workbook (conversion only, no verification) |
| Output | JSON, Markdown, print-to-PDF |

## Why it is built this way

- **Static by design.** A review tool that runs before deployment must not depend on
  reaching the devices. The limitation is stated in the product name and in every result.
- **Nothing leaves the browser.** Configs contain addresses, rules and sometimes
  credentials. The build has zero external requests, no storage, and ships as one file.
- **One file to distribute.** The deliverable is a single HTML (~330 KB). Double-click it,
  host it anywhere, or send it as an attachment; there is nothing to install.
- **Types are the contract.** "Accurate equipment simulation" is the top requirement, so
  catalog, parser output, findings and capabilities are all typed; shape mistakes fail at
  compile time.
- **The engine does not know about the DOM.** It runs in Node under Vitest exactly as it
  runs in the page, which is what makes 200+ regression cases cheap to keep.

## Quickstart — users

Open the built single HTML and double-click. No Node.js, no network.

```
1. Open dist/index.html (or the hosted URL) in a browser
2. Phase 00: choose a mode — ① Verify / ② Build in GUI / ③ Quick check / ④ .exp convert
   → ① ② continue to Phase 01–02 (devices and topology)
   → ③ pick type and model, upload one device, see results immediately
   → ④ decode a SonicWall .exp into FACET text / decoded text / Excel (no verification;
     feed the converted .txt into ① or ③). Phases 01–04 are skipped; cross-device checks
     such as cabling and reachability are out of scope here
3. Phase 03: paste or upload running-config / SonicOS CLI text (② builds it in a form)
4. Phase 04 runs the checks → Phase 05 shows the report (score / matrix / path trace / findings)
5. Export as JSON / Markdown / print-to-PDF
```

## Quickstart — developers

```bash
npm install
npm run dev       # dev server with HMR, http://localhost:5173
npm test          # Vitest regression suite (version / engine / builder / exp)
npm run build     # produces dist/index.html (the deliverable)
npm run preview   # serves dist/ locally for a final check
```

Node.js 20+. Same steps on Windows, macOS and Linux.

## Languages and stack

| Layer | What | Why |
|---|---|---|
| Language | TypeScript 5 (strict) | the catalog, parser AST, findings and capabilities are all typed |
| UI | React 18, `useReducer` + Context, hand-written SVG for faceplates and topology | a wizard of this size needs no state library |
| Build | Vite 5 + `vite-plugin-singlefile` | one self-contained HTML as the deliverable |
| Tests | Vitest | the engine is DOM-free, so it is tested directly |
| Runtime dependencies | `react`, `react-dom` only; no CDN, no fonts fetched | zero external requests |
| Tooling | Node scripts for the Word user guide; an optional Apps Script delivery layer | never shipped to users |

## Repository map

| Path | What |
|---|---|
| `src/engine/` | DOM-free verification engine (TypeScript): catalog, parsers, verify, path trace, firewall evaluation, `.exp` decoding |
| `src/ui/` | React UI: Phase 0–6 components, state (`useReducer` + Context) |
| `src/samples/` | Anonymised demo configs |
| `test/` | Vitest suites (version / engine / builder / exp; the count is whatever `npm test` prints) |
| `dist/index.html` | Build output — the FACET that is distributed (~330 KB) |
| `docs/` | ARCHITECTURE / VERIFICATION-RULES / PARSER-NOTES / ROADMAP / PUBLISHING / SPRINT-1.5-DESIGN |
| `CLAUDE.md` | Project notes for Claude Code |
| `LICENSING.md` | IP and licence status |
| `app/facet.html`, `src/facet-core.js` | Deprecated v3.1.0 single-file version and engine (kept for history, do not edit) |
| `gas/` | Optional Google Apps Script delivery layer |
| `tools/docs/` | Word user-guide generator |

## Documents

| File | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Two-layer structure, data model, public engine API, finding shape, state management, build, rendering, path-trace logic, tests |
| [docs/VERIFICATION-RULES.md](docs/VERIFICATION-RULES.md) | Every check in the seven categories, with its level and the reasoning behind defaults |
| [docs/PARSER-NOTES.md](docs/PARSER-NOTES.md) | What the Cisco and SonicWall parsers accept, platform detection signals, `.exp` variable scheme, known gaps |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Completed sprints, open items, what is out of scope |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | Pre-publish checklist, build and deployment |
| [docs/SPRINT-1.5-DESIGN.md](docs/SPRINT-1.5-DESIGN.md) | Archived design of the TypeScript / React port (v3.1.0 → v4.0.0) |
| [CHANGELOG.md](CHANGELOG.md) | Per-version changes |

## At a glance

```
┌──────────────────────────────────────────────────────────────┐
│  src/ui/        React components, Context, styles            │
│    ↓ one-way dependency                                      │
│  src/engine/index.ts   public API (named exports only)       │
│    ↓                                                         │
│  src/engine/    parsers · verify · path trace · matrix       │
│                 catalog (data) · evalFW · .exp decode        │
└──────────────────────────────────────────────────────────────┘
          npm run build → dist/index.html (one file, no network)
```

## Version

The current version is `CURRENT_VERSION` in `src/ui/versionHistory.ts`, which
`test/version.test.ts` keeps equal to `package.json`. The number is deliberately not
repeated here (it once drifted). See [CHANGELOG.md](CHANGELOG.md) for history.

## For Claude Code

Start with `CLAUDE.md`, then `docs/ARCHITECTURE.md`. Engine changes go in
`src/engine/*.ts`, UI changes in `src/ui/**/*.tsx`. `npm test` must stay green.

## License

See [LICENSING.md](LICENSING.md). Publication was cleared on 2026-06-23; a formal licence
text is still to be added.

---

# 日本語版

**SonicWall ルータ1台と Cisco スイッチ最大8台**という小規模ネットワークを対象にした、**静的な**コンフィグ検証ツールです。
機器のコンフィグを読み込み、トポロジーを宣言すると、フェイスプレートに対応付けた7カテゴリ（L1／L2／STP／L3／ファイアウォール／
ハードニング／機材能力）の監査、サブネット間の到達性マトリクス、ホップ単位の経路トレースが得られます。処理はすべて**ブラウザの中**で完結し、
どこにも送信しません。

> **これは静的解析ツールであって、実機の稼働を確認するものではありません。** コンフィグのテキストを、宣言されたトポロジーと突き合わせます。
> 緑の結果は「コンフィグに矛盾が見つからなかった」という意味で、「ネットワークが動く」という意味ではありません。
> 物理的な接続は実機で確認してください。この位置づけは設計の土台であり、崩してはいけません。

## 何ができるか

| 領域 | 機能 |
|---|---|
| 検証 | 7カテゴリのチェック。各指摘は `err`（明確な矛盾）か `lack`（設定不足／確認が必要）で、スコア・理由・修正案を付ける |
| 機材能力（CAP） | 15 SKU のカタログが持つ実際の上限（VLAN／SVI／ACL 数、STP 方式、PAgP、経路数）とコンフィグを突合 |
| 到達性 | ファイアウォールのオブジェクトを解決したルール評価によるサブネット間マトリクスと、ホップ単位の経路トレース（L2 → ゲートウェイ → 経路 → FW → NAT） |
| 作成モード | Cisco／SonicWall のコンフィグを GUI で組み立ててテキストを生成。生成物は同じパーサで読み直すので、検証は投入モードと完全に共通 |
| 簡易検証 | 機器1台・トポロジーなし。種別と機種を選んでアップロードするだけで結果が出る |
| `.exp` コンバート | SonicWall の Settings Export をブラウザ内で復号し、FACET 用テキスト／復号テキスト／Excel に変換（変換のみ。検証はしない） |
| 出力 | JSON、Markdown、印刷→PDF |

## なぜこの作りなのか

- **静的であること。** 導入前のレビューに使う道具は、機器に到達できることに依存してはいけない。この制約は製品名と、すべての結果画面に明記している。
- **ブラウザの外に出さない。** コンフィグにはアドレス、ルール、ときには認証情報が含まれる。外部リクエストはゼロ、保存もせず、1ファイルで配る。
- **配布物は1ファイル。** 成果物は単一の HTML（約330KB）。ダブルクリックしても、どこかに置いても、添付で送ってもよい。インストールするものはない。
- **型が契約。** 「正確な機材シミュレーション」が最優先要件なので、カタログ、パーサの出力、指摘、機材能力はすべて型で縛る。形の間違いはコンパイル時に落ちる。
- **エンジンは DOM を知らない。** ページ上と同じコードが Node 上の Vitest でそのまま動く。200件を超える回帰テストを安く維持できる理由はこれ。

## クイックスタート — 利用者

ビルド済みの単一 HTML をダブルクリックするだけ。Node.js もネットワークも不要。

```
1. dist/index.html（またはホスティング先の URL）をブラウザで開く
2. Phase 00 でモードを選ぶ — ① 検証 / ② GUI で作成 / ③ 簡易検証 / ④ .exp コンバート
   → ① ② は Phase 01〜02 で機器とトポロジーを指定
   → ③ は種別・機種を選んで機器1台分をアップロードすれば即結果
   → ④ は SonicWall の .exp をブラウザ内で復号し、FACET 用テキスト / 復号テキスト / Excel に変換
     （検証はしない。変換した .txt を ① か ③ に投入する）。Phase 01〜04 は通らず、
     配線や到達性など複数機器にまたがるチェックは対象外
3. Phase 03 で running-config / SonicOS CLI のテキストを投入（② はフォームで作成→生成）
4. Phase 04 で検証 → Phase 05 でレポート（スコア / マトリクス / 経路トレース / 指摘一覧）
5. JSON / Markdown / 印刷→PDF で出力
```

## クイックスタート — 開発者

```bash
npm install
npm run dev       # 開発サーバ（HMR、http://localhost:5173）
npm test          # Vitest 回帰スイート（version / engine / builder / exp）
npm run build     # dist/index.html を生成（これが配布物）
npm run preview   # dist/ をローカル配信して最終確認
```

Node.js 20以上。Windows / macOS / Linux で手順は同じ。

## 言語と構成

| 層 | 実体 | 理由 |
|---|---|---|
| 言語 | TypeScript 5（strict） | カタログ、パーサの AST、指摘、機材能力をすべて型で縛る |
| UI | React 18、`useReducer`＋Context、フェイスプレートとトポロジー図は手書き SVG | この規模のウィザードに状態管理ライブラリは要らない |
| ビルド | Vite 5＋`vite-plugin-singlefile` | 自己完結の HTML 1ファイルを配布物にする |
| テスト | Vitest | エンジンが DOM に依存しないので直接テストできる |
| 実行時の依存 | `react`、`react-dom` のみ。CDN もフォント取得もなし | 外部リクエストをゼロにする |
| ツール | Word 使用者ガイドを生成する Node スクリプト、任意の Apps Script 配信層 | 利用者には配布しない |

## リポジトリ構成

| パス | 内容 |
|---|---|
| `src/engine/` | DOM に依存しない検証エンジン（TypeScript）：カタログ、パーサ、verify、経路トレース、FW 評価、`.exp` 復号 |
| `src/ui/` | React UI：Phase 0〜6 のコンポーネント、状態管理（`useReducer`＋Context） |
| `src/samples/` | 匿名化したデモ用コンフィグ |
| `test/` | Vitest スイート（version / engine / builder / exp。件数は `npm test` の出力が正） |
| `dist/index.html` | ビルド成果物。配布する FACET そのもの（約330KB） |
| `docs/` | ARCHITECTURE / VERIFICATION-RULES / PARSER-NOTES / ROADMAP / PUBLISHING / SPRINT-1.5-DESIGN |
| `CLAUDE.md` | Claude Code 向けのプロジェクトメモ |
| `LICENSING.md` | 知的財産とライセンスの状況 |
| `app/facet.html`、`src/facet-core.js` | 廃止済みの v3.1.0 単一ファイル版とそのエンジン（履歴として保持。編集禁止） |
| `gas/` | 任意の Google Apps Script 配信層 |
| `tools/docs/` | Word 使用者ガイドの生成ツール |

## 資料一覧

| ファイル | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 2層構成、データモデル、エンジンの公開 API、指摘の形、状態管理、ビルド、描画、経路トレースのロジック、テスト |
| [docs/VERIFICATION-RULES.md](docs/VERIFICATION-RULES.md) | 7カテゴリの全チェック項目と判定レベル、既定挙動の根拠 |
| [docs/PARSER-NOTES.md](docs/PARSER-NOTES.md) | Cisco／SonicWall パーサが受け付ける構文、プラットフォーム判別のシグナル、`.exp` の変数体系、既知の制約 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 完了したスプリント、未着手、対象外 |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | 公開前チェックリスト、ビルドとデプロイ |
| [docs/SPRINT-1.5-DESIGN.md](docs/SPRINT-1.5-DESIGN.md) | TypeScript／React 移植（v3.1.0 → v4.0.0）の設計書（アーカイブ） |
| [CHANGELOG.md](CHANGELOG.md) | 版ごとの変更内容 |

## 全体像

```
┌──────────────────────────────────────────────────────────────┐
│  src/ui/        React コンポーネント、Context、スタイル       │
│    ↓ 一方向の依存                                            │
│  src/engine/index.ts   公開 API（名前付きエクスポートのみ）  │
│    ↓                                                         │
│  src/engine/    パーサ · verify · 経路トレース · マトリクス  │
│                 カタログ（データ）· evalFW · .exp 復号       │
└──────────────────────────────────────────────────────────────┘
          npm run build → dist/index.html（1ファイル、通信なし）
```

## バージョン

現在の版は `src/ui/versionHistory.ts` の `CURRENT_VERSION` が正で、`test/version.test.ts` が `package.json` と一致することを保証しています。
この README には版番号を書きません（過去に取り残されたことがあるため）。変更履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

## Claude Code 向け

`CLAUDE.md` から読み始め、次に `docs/ARCHITECTURE.md` へ。エンジンの修正は `src/engine/*.ts`、UI の修正は `src/ui/**/*.tsx`。`npm test` を常に緑に保つこと。

## ライセンス

[LICENSING.md](LICENSING.md) を参照。2026年6月23日時点で公開は可。正式なライセンス文はこれから付与します。
