# FACET — Network Verification Atelier

A **static** configuration verification tool for a network of **1 × SonicWall router +
N × Cisco switches**. Upload device configs, get a faceplate-mapped, 7-category audit
(L1 / L2 / STP / L3 / Firewall / Hardening / Capability) plus a subnet reachability
matrix and a hop-by-hop path trace — all **in the browser**, nothing uploaded anywhere.

> **It is a static analyzer, not a live verifier.** It checks the config text against a
> declared topology. A green result means "no config contradiction found," not "the
> network works." Confirm physical connectivity on real devices. This framing is
> load-bearing — keep it.

## Quickstart (利用者 — 検証作業をする人)

ビルド済み単一 HTML を入手して**ダブルクリックするだけ**。
Node.js などのインストールは不要、ネットも不要(完全自己完結)。

```
1. dist/index.html (またはホスティング先 URL) をブラウザで開く
2. Phase 00 でモードを選択 → Phase 01〜02 で機器/トポロジー指定
3. Phase 03 で running-config / SonicOS CLI 出力を投入
4. Phase 04 で検証実行 → Phase 05 でレポート(score / matrix / path trace / findings)
5. JSON / Markdown / 印刷-PDF で出力
```

## Quickstart (開発者 — コードを修正する人)

```bash
npm install
npm run dev       # 開発サーバ (HMR、http://localhost:5173)
npm test          # Vitest 回帰スイート全ケース(version/engine/builder の3ファイル)
npm run build     # dist/index.html を生成(配布物)
npm run preview   # dist/ をローカル配信して最終確認
```

Node.js 20+ が必要。Windows / macOS / Linux で同じ手順。

## Tech stack (v4.0.0 以降)

- TypeScript 5(strict)+ Vite 5 + React 18
- vite-plugin-singlefile で配布物を**単一 HTML**にビルド
- Vitest でエンジンを単体テスト
- ランタイム依存は `react` / `react-dom` のみ(外部 CDN 依存ゼロ)

## Repo map

| Path | What |
|---|---|
| `src/engine/` | DOM-free 検証エンジン (TypeScript) — Catalog / Parser / Verify / PathTrace / EvalFW |
| `src/ui/` | React UI — Phase 0〜6 のコンポーネント、状態管理(useReducer + Context) |
| `src/samples/` | デモ用匿名コンフィグ |
| `test/engine/` | Vitest 回帰スイート(46 ケース) |
| `dist/index.html` | ビルド成果物 — これが「配布する FACET」(〜220KB) |
| `docs/` | ARCHITECTURE / VERIFICATION-RULES / ROADMAP / PARSER-NOTES / PUBLISHING |
| `CLAUDE.md` | Claude Code 向けプロジェクトメモ |
| `LICENSING.md` | IP/ライセンス状況 |
| `app/facet.html` | ⚠ DEPRECATED:v3.1.0 単一 HTML 版(履歴) |
| `src/facet-core.js` | ⚠ DEPRECATED:v3.1.0 エンジン IIFE(履歴) |
| `gas/` | オプションの Google Apps Script 配信レイヤ |
| `tools/docs/` | Word ユーザガイド生成スクリプト |

## バージョン

現行バージョンは `src/ui/versionHistory.ts` の `CURRENT_VERSION`(= `package.json`
の `version` と機械的に一致、`test/version.test.ts` が保証)が正典。ここには
バージョン番号を重複して書かない(過去に本ファイルの記載が実際のバージョンから
取り残された経緯があるため)。詳細な変更履歴は [`CHANGELOG.md`](CHANGELOG.md)。

## For Claude Code

Start with `CLAUDE.md`, then `docs/ARCHITECTURE.md`。エンジン修正は `src/engine/*.ts`、
UI 修正は `src/ui/**/*.tsx`。必ず `npm test` が緑のまま PR を作る。

## License

`LICENSING.md` 参照。2026-06-23 時点で公開 OK(個人プロジェクト or 雇用主確認済)。
正式なライセンス文の付与は次回コミット予定。
