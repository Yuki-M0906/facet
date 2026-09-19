# Publishing & deployment

## Pre-publish checklist(公開前に毎回)
- [ ] **IP/ownership 確認** — `../LICENSING.md`。2026-06-23 時点で「公開 OK」確定済。
- [ ] **実データ混入なし** — ホスト名、IP、拠点名、雇用主の実セキュリティ構成は
      スクラブ済。サンプル(`src/samples/*.ts`)は ACME-* / RFC1918 / TEST-NET
      (203.0.113.x)のみ。
- [ ] `npm test` 緑(全ケース PASS。件数は出力が正。`test/version.test.ts` が
      package.json / versionHistory.ts / CHANGELOG.md のバージョン整合も検証する)
- [ ] `npm run build` 成功(`dist/index.html` 内のバージョン表記が package.json と一致)
- [ ] `npm run preview` で `dist/index.html` を実際に動かし、①検証モードで Phase 00〜06、
      ②作成モードで生成→検証、③簡易検証モードで1台アップロード→結果、をそれぞれ通せる

## ビルド & 配布フロー(v4.0.0 以降)

```
[開発者の手元]
  src/ を編集
       │
       ▼
  npm run build
       │
       ▼
  dist/index.html  (単一 HTML、~330KB、外部依存ゼロ)
       │
       ▼
[配布]  Cloudflare Workers(現行) / Cloudflare Pages / GitHub Pages / 直接ファイル送付 / 共有ドライブ
       │
       ▼
[利用者]  ブックマーク URL を開く、または .html をダブルクリック
```

## 現行の本番デプロイ:Cloudflare Workers(静的アセット配信、無料、自動デプロイ)

**本番 URL:** https://facet.yuki-mats.workers.dev

実際に稼働している配信方式はこちらです(Cloudflare *Pages* ではない点に注意 —
過去の本書は Pages 手順を案内していましたが、それに従うと現行とは別の配信を
新設してしまいます)。

- **デプロイ設定の本体はリポジトリ直下の `wrangler.jsonc`**。Worker スクリプトは持たず、
  `assets.directory: ./dist` で `npm run build` の成果物をそのまま静的配信する。
  FACET は単一 `index.html` のためルーティング処理は不要。
- **GitHub 連携(Workers Builds)で `main` への push を検知して自動ビルド&デプロイ**。
  通常の作業は「`npm test` 緑 → commit → `git push`」だけで反映される(反映まで概ね
  1〜2 分。`curl -s https://facet.yuki-mats.workers.dev | grep -o "4\.[0-9]*\.[0-9]*"`
  でバージョン表記を確認できる)。
- 手動デプロイが必要な場合は `npm run build` の後に `npx wrangler deploy`(要 Cloudflare
  ログイン)。`.wrangler/` のローカル状態は `.gitignore` 済み。

公開範囲を「URL を知る人だけ」に絞りたい場合は Cloudflare Access(無料 50 ユーザ枠)で
Google / Microsoft アカウント認証必須化が可能。

### 代替:Cloudflare Pages で新規に立てる場合

1. Cloudflare ダッシュボード → Pages → Connect to Git → 該当リポジトリ
2. ビルド設定:Framework preset `Vite` / Build command `npm run build` /
   Build output directory `dist`
3. Deploy → `https://<project>.pages.dev` が発行され、以降は git push で自動デプロイ

## その他のホスティング

- **GitHub Pages**(public repo)— `dist/` を `gh-pages` ブランチに push、
  または GitHub Actions で自動デプロイ。private repo の場合は GitHub Pro 必須。
- **Netlify / Vercel** — Cloudflare Pages と同様。GitHub 連携で自動デプロイ。
- **社内 SharePoint** — M365 Business / Enterprise で HTML を Web パーツとして配信。
- **直接配布** — `dist/index.html` をメール/Slack/USB で送付。受け取り側は単にダブルクリック。

## 利用者側に必要なもの

**ブラウザだけ**(Chrome / Edge / Firefox / Safari、モダン版)。
Node.js / npm / インストーラ / アカウント / インターネット接続、すべて不要。

これは `vite-plugin-singlefile` で全アセットを `<script>` / `<style>` に inline 化して
いるため。`dist/index.html` は完全自己完結の HTML 1 ファイル。

## v3.1.0 配布物(`app/facet.html`)について

履歴用に残置していますが、v4.0.0 では `dist/index.html` が正規の配布物です。
古い URL ブックマークがある場合のみ参照可、新規配布には使わないでください。

## なぜ Google Apps Script は公開向けに不適か(変更なし)

`gas/` ディレクトリは社内 Google Workspace 配信用のオプションです。公開サイトには
GAS は不向き(サンドボックス iframe、固定 `script.google.com` URL、実行クォータ、
サインインのフリクション)。公開には静的ホスティングを使用してください。
