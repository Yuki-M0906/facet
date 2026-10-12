# Publishing and deployment / 公開とデプロイ

*English first, 日本語は後半にあります。*

## Pre-publish checklist (every release)

- [ ] **IP / ownership** — see `../LICENSING.md`. Cleared on 2026-06-23.
- [ ] **No real data** — hostnames, IPs, site names and the employer's actual security
      architecture are scrubbed. Samples (`src/samples/*.ts`) use `ACME-*` names and
      RFC 1918 / TEST-NET (203.0.113.x) ranges only.
- [ ] `npm test` is green (all cases; the count is whatever it prints.
      `test/version.test.ts` also checks that `package.json`, `versionHistory.ts` and
      `CHANGELOG.md` agree on the version).
- [ ] `npm run build` succeeds and the version shown inside `dist/index.html` matches
      `package.json`.
- [ ] `npm run preview`: walk ① verify through Phase 00–06, ② build → generate → verify,
      and ③ quick check with one upload.

## Build and distribution flow (v4.0.0 and later)

```
[developer]
  edit src/
       │
       ▼
  npm run build
       │
       ▼
  dist/index.html  (single HTML, ~330 KB, no external dependency)
       │
       ▼
[distribute]  Cloudflare Workers (current) / Cloudflare Pages / GitHub Pages / send the file / shared drive
       │
       ▼
[user]  open the bookmarked URL, or double-click the .html
```

## Current production deployment: Cloudflare Workers (static assets, free, auto-deploy)

**Production URL:** https://facet.yuki-mats.workers.dev

This is Cloudflare *Workers*, not Cloudflare *Pages* — an earlier version of this document
described Pages, and following it would create a second, separate deployment.

- Deployment is defined by `wrangler.jsonc` at the repository root. There is no Worker
  script; `assets.directory: ./dist` serves the build output as static files. FACET is one
  `index.html`, so no routing is needed.
- **Workers Builds is connected to GitHub** and builds and deploys on every push to `main`.
  Day to day, "`npm test` green → commit → `git push`" is the whole release; it is live in
  about 1–2 minutes. `curl -s https://facet.yuki-mats.workers.dev | grep -o "4\.[0-9]*\.[0-9]*"`
  shows the deployed version.
- Manual deploy, if ever needed: `npm run build` then `npx wrangler deploy` (requires a
  Cloudflare login). Local `.wrangler/` state is git-ignored.

To restrict access to "anyone with the URL" you can put Cloudflare Access (free for up to
50 users) in front and require Google / Microsoft sign-in.

### Alternative: a fresh Cloudflare Pages project

1. Cloudflare dashboard → Pages → Connect to Git → this repository
2. Build settings: framework preset `Vite`, build command `npm run build`, output
   directory `dist`
3. Deploy → `https://<project>.pages.dev`; later pushes deploy automatically

## Other hosting options

- **GitHub Pages** (public repo) — push `dist/` to a `gh-pages` branch or use GitHub
  Actions. Private repos need GitHub Pro.
- **Netlify / Vercel** — same idea as Cloudflare Pages.
- **SharePoint** — M365 Business / Enterprise can serve the HTML as a web part.
- **Direct** — send `dist/index.html` by mail, chat or USB; the recipient double-clicks it.

## What the user needs

**A browser.** Chrome / Edge / Firefox / Safari, current versions. No Node.js, no npm,
no installer, no account, no internet connection.

`vite-plugin-singlefile` inlines every asset into `<script>` / `<style>`, so
`dist/index.html` is completely self-contained.

## About the v3.1.0 deliverable (`app/facet.html`)

Kept for history. Since v4.0.0 the deliverable is `dist/index.html`. Use the old file only
if an old bookmark points at it; never for new distribution.

## Why Google Apps Script is not used for the public site

The `gas/` directory is an optional delivery layer for an internal Google Workspace. It is
a poor fit for a public site (sandboxed iframe, fixed `script.google.com` URL, execution
quotas, sign-in friction). Use static hosting for anything public.

---

# 日本語版

## 公開前チェックリスト（リリースのたびに）

- [ ] **知的財産／所有権** — `../LICENSING.md` 参照。2026年6月23日に公開可と確認済み。
- [ ] **実データが混入していない** — ホスト名、IP、拠点名、雇用主の実際のセキュリティ構成は除去済み。
      サンプル（`src/samples/*.ts`）は `ACME-*` の架空名と RFC 1918／TEST-NET（203.0.113.x）の帯だけを使う。
- [ ] `npm test` が緑（全ケース。件数は出力が正。`test/version.test.ts` が `package.json`／`versionHistory.ts`／`CHANGELOG.md` の
      版の一致も検証する）。
- [ ] `npm run build` が成功し、`dist/index.html` 内の版表記が `package.json` と一致する。
- [ ] `npm run preview` で `dist/index.html` を実際に動かし、① 検証モードで Phase 00〜06、② 作成モードで生成→検証、
      ③ 簡易検証で1台アップロード→結果、をそれぞれ通す。

## ビルドと配布の流れ（v4.0.0 以降）

```
[開発者の手元]
  src/ を編集
       │
       ▼
  npm run build
       │
       ▼
  dist/index.html  （単一 HTML、約330KB、外部依存ゼロ）
       │
       ▼
[配布]  Cloudflare Workers（現行）/ Cloudflare Pages / GitHub Pages / ファイル送付 / 共有ドライブ
       │
       ▼
[利用者]  ブックマークした URL を開く、または .html をダブルクリック
```

## 現行の本番デプロイ：Cloudflare Workers（静的配信、無料、自動デプロイ）

**本番 URL：** https://facet.yuki-mats.workers.dev

実際に稼働しているのは Cloudflare *Workers* で、Cloudflare *Pages* ではありません。以前の本書は Pages の手順を案内していましたが、
それに従うと現行とは別の配信を新設してしまいます。

- デプロイ設定の本体はリポジトリ直下の `wrangler.jsonc`。Worker スクリプトは持たず、`assets.directory: ./dist` で
  ビルド成果物をそのまま静的配信する。FACET は `index.html` 1枚なのでルーティングは不要。
- **GitHub 連携（Workers Builds）が `main` への push を検知して自動でビルドとデプロイを行う。** 日常の作業は
  「`npm test` 緑 → commit → `git push`」だけで反映される（おおむね1〜2分）。
  `curl -s https://facet.yuki-mats.workers.dev | grep -o "4\.[0-9]*\.[0-9]*"` で配信中の版を確認できる。
- 手動デプロイが必要なら `npm run build` のあと `npx wrangler deploy`（Cloudflare へのログインが必要）。`.wrangler/` のローカル状態は
  `.gitignore` 済み。

公開範囲を「URL を知る人だけ」に絞りたい場合は、Cloudflare Access（50ユーザーまで無料）で Google／Microsoft アカウントの認証を必須にできます。

### 代替：Cloudflare Pages で新規に立てる場合

1. Cloudflare ダッシュボード → Pages → Connect to Git → このリポジトリ
2. ビルド設定：Framework preset `Vite`、Build command `npm run build`、Build output directory `dist`
3. Deploy → `https://<project>.pages.dev` が発行され、以降は push で自動デプロイ

## その他のホスティング

- **GitHub Pages**（公開リポジトリ）— `dist/` を `gh-pages` ブランチに push するか、GitHub Actions で自動デプロイ。
  非公開リポジトリでは GitHub Pro が必要。
- **Netlify / Vercel** — Cloudflare Pages と同じ要領。
- **SharePoint** — M365 Business／Enterprise なら HTML を Web パーツとして配信できる。
- **直接配布** — `dist/index.html` をメール、チャット、USB で渡す。受け取った側はダブルクリックするだけ。

## 利用者に必要なもの

**ブラウザだけ。** Chrome / Edge / Firefox / Safari の現行版。Node.js、npm、インストーラ、アカウント、インターネット接続はいずれも不要。

`vite-plugin-singlefile` がすべてのアセットを `<script>`／`<style>` に埋め込むため、`dist/index.html` は完全に自己完結しています。

## v3.1.0 の配布物（`app/facet.html`）について

履歴として残しています。v4.0.0 以降の正規の配布物は `dist/index.html` です。古いブックマークが残っている場合に参照する程度にとどめ、
新規の配布には使わないでください。

## 公開サイトに Google Apps Script を使わない理由

`gas/` ディレクトリは社内の Google Workspace 向けの任意の配信層です。公開サイトには向きません（サンドボックスの iframe、
固定の `script.google.com` URL、実行クォータ、サインインの手間）。公開するものには静的ホスティングを使ってください。
