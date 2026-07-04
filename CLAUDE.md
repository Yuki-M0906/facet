# CLAUDE.md — FACET (Network Verification Atelier)

> Claude Code reads this file at the start of every session. Keep it concise
> and factual. Deep detail lives in `docs/` — open those when working in that area.

## What FACET is

A **static** configuration analyzer for a network of **1 × SonicWall router + N × Cisco
switches** (N ≤ 8). The user uploads device configs; FACET parses them, maps interfaces
to a faceplate, and runs 6 categories of checks (L1/L2/STP/L3/Firewall/Hardening) +
a 7th category (CAP, reserved for Sprint 2 capability checks), a subnet reachability
matrix, and a hop-by-hop path trace. Audience: IT engineers doing **pre-deployment
config review**. Aesthetic: dark charcoal + platinum-gold luxury. Runs **entirely in
the browser** — configs are never uploaded anywhere.

## The single most important invariant — DO NOT BLUR THIS

FACET is a **static analyzer, not a live verifier.** It validates the *config text* +
a *declared topology*. It CANNOT confirm physical cabling, real connectivity, speed,
or that the live network works. A green result means "no config contradiction found,"
NOT "the network works." Never add a feature, label, or doc line that implies otherwise.

## Tech stack (since v4.0.0)

- **TypeScript 5** strict
- **Vite 5** + **React 18**
- **vite-plugin-singlefile** → 配布物は単一 HTML(`dist/index.html`)に inline
- **Vitest** for tests
- ランタイム依存は `react` / `react-dom` のみ。Google Fonts CDN への外部リクエスト
  は撤去済(フォントは Meiryo UI + Consolas のシステムフォント)。

## Repo layout

```
src/
├── engine/                      ← DOM-free 検証エンジン (TypeScript)
│   ├── types.ts                 ← 全公開型 (Port, Device, Finding, Catalog 等)
│   ├── catalog.ts               ← 15 SKU の機材カタログ
│   ├── ip.ts / canonIf.ts       ← IP / インターフェイス名ヘルパ
│   ├── parsers/{cisco,sonicwall}.ts
│   ├── mapToPorts.ts / buildSubnets.ts
│   ├── evalFW.ts                ← FW 評価 (svcMatch 双方向 overlap)
│   ├── buildMatrix.ts / pathTrace.ts / verify.ts / autoLinks.ts
│   └── index.ts                 ← 公開 API(UI からの唯一の窓口)
├── ui/
│   ├── App.tsx / main.tsx / store.tsx
│   ├── phases/{Mode,Select,Topology,Intake,Analyze,Results,Complete}.tsx
│   ├── components/{Header,Stepper,Faceplate,TopologyGraph,...}.tsx
│   └── styles/global.css
└── samples/                     ← デモ用匿名コンフィグ
test/engine/engine.test.ts       ← Vitest 46 ケース
dist/index.html                  ← ビルド成果物 (配布する単一 HTML)
docs/                            ← ARCHITECTURE / VERIFICATION-RULES / ROADMAP /
                                   PARSER-NOTES / PUBLISHING / SPRINT-1.5-DESIGN
app/facet.html                   ← ⚠ DEPRECATED (v3.1.0 履歴用、編集禁止)
src/facet-core.js                ← ⚠ DEPRECATED (v3.1.0 履歴用、編集禁止)
test/facet.test.js               ← ⚠ DEPRECATED (v3.1.0 履歴用、編集禁止)
gas/                             ← オプション GAS 配信(v3.1.0 互換、参考保持)
tools/docs/                      ← Word ユーザガイド生成ツール
```

## Commands

```
npm install         # 初回のみ
npm run dev         # 開発(HMR、http://localhost:5173)
npm test            # Vitest 全 46 ケース
npm run build       # dist/index.html を生成(単一 HTML、〜220KB)
npm run preview     # dist/ をローカル配信して動作確認
```

## エンジン公開 API(`src/engine/index.ts` 経由)

`CATALOG` / `switchPorts` / `parseCisco` / `parseSonicWall` / `mapToPorts` / `verify` /
`buildSubnets` / `buildMatrix` / `autoLinks` / `pathTrace` / `evalFW` /
`WELL_KNOWN_SVC` / `resolveSvc` / `svcMatch` / `objContains` / `expandVlans` /
`expandIfRange` / `subnetOf` / `inSubnet` / `canonIf` / `uniq` / `ipToInt` / `intToIp` /
`maskBits` / `bitsToMaskInt`。型は `export type *` で再公開済。

Key facts: status = `ok` / `err` / `lack` / `idle`。Score = `max(0, 100 − err×12 − lack×4)`。
Path-trace hop order: SRC → (L2) → GW → RT → FW → (NAT) → DST(同一サブネット時は SRC + DST のみ)。
Matrix cells: `ok` / `deny` / `nogw` / `self`(UI は ○/×/△/—)。

## Conventions / always-do rules

- **エンジンは DOM-free を厳守**。`src/engine/*` から `react` / `document` / `window`
  への参照は禁止。
- **UI から engine 内部ファイルへの直接 import 禁止**。必ず `@engine/*` (= `src/engine/index.ts`)
  経由。`tsconfig.json` の path alias で機械的に強制可能。
- **ランタイム依存追加は慎重に**。配布物の単一 HTML サイズに直接効く。
  Google Fonts や他 CDN への外部依存は追加禁止("nothing leaves the browser" の保証維持)。
- **localStorage / sessionStorage は使用禁止**(プライバシー story 維持)。
- **検証ルール追加 / バグ修正ごとに `test/engine/engine.test.ts` にケース追加**。
- **SonicWall は CLI 可読テキスト入力**。`.exp`(難読化バイナリ)は意図的に非対応。
- **サンプルは匿名化維持**(`src/samples/`):ACME-*、RFC1918、TEST-NET (203.0.113.x)。
  実機名・実 IP・実拠点名・実セキュリティ構成は絶対にコミットしない。
- **ASCII-only filenames** for any committed file.
- **ユーザ向けの挙動・機能を変更したら必ずバージョンを更新する**(過去に Sprint 2 /
  Sprint 5 MVP / GUI ハードニングがバージョン番号を更新せずコミットされ、
  CHANGELOG.md 上で同じ "v4.0.0" の下に異なる日付・内容が並存する事故があった)。
  手順:
  1. `package.json` の `version` を semver で更新(新機能=MINOR、修正/微調整=PATCH、
     破壊的変更=MAJOR)。
  2. `src/ui/versionHistory.ts` の `CURRENT_VERSION` と `VERSION_HISTORY` 配列の
     **先頭に**新エントリを追加(両者は同じ値でなければならない)。
  3. `CHANGELOG.md` に対応するプローズ形式のエントリを追加(番号・日付を揃える)。
  4. `test/version.test.ts` が 1〜2 の整合性を機械的に検証する。ここが緑にならない
     限り「更新し忘れ」は成立しない — この保証を壊すような変更(テストの緩和等)はしない。

## DEPRECATED されているもの(編集禁止、削除予定なし)

| ファイル | 状態 | 理由 |
|---|---|---|
| `app/facet.html` | v3.1.0 単一 HTML 版 | エンジン二重化解消 + React 化のため引退 |
| `src/facet-core.js` | v3.1.0 エンジン IIFE | `src/engine/*.ts` に移行 |
| `test/facet.test.js` | v3.1.0 plain-Node テスト | `test/engine/engine.test.ts` (Vitest) に移行 |

これらは履歴用に残置しています。エンジン挙動・UI を変えたい場合は必ず新側
(`src/engine/*.ts`、`src/ui/**/*.tsx`)を編集してください。

## Before publishing anything publicly

Read `LICENSING.md` first. IP ownership clarification は Yuki さん側で「公開 OK」が確認済
(2026-06-23)。Sprint 1.5 完了時点で Cloudflare Pages にデプロイする方向。
公開先 URL とリポジトリ設定が決まり次第、本ドキュメントに追記する。

## Where to continue

`docs/ROADMAP.md` を参照。Sprint 1.5 (TS port) が完了したので、次の最重要は
**Sprint 2:機材カタログ実物化**(各 SKU の正確な物理仕様 + capability matrix)。
これが「正確な機材シミュレーション再現」という最優先要件への直接投資。
