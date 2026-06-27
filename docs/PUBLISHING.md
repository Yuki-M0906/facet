# Publishing & deployment

## Pre-publish checklist(公開前に毎回)
- [ ] **IP/ownership 確認** — `../LICENSING.md`。2026-06-23 時点で「公開 OK」確定済。
- [ ] **実データ混入なし** — ホスト名、IP、拠点名、雇用主の実セキュリティ構成は
      スクラブ済。サンプル(`src/samples/*.ts`)は ACME-* / RFC1918 / TEST-NET
      (203.0.113.x)のみ。
- [ ] `npm test` 緑(46 / 46 PASS)
- [ ] `npm run build` 成功
- [ ] `npm run preview` で `dist/index.html` を実際に動かし、Phase 00〜06 通せる

## ビルド & 配布フロー(v4.0.0 以降)

```
[開発者の手元]
  src/ を編集
       │
       ▼
  npm run build
       │
       ▼
  dist/index.html  (単一 HTML、~220KB、外部依存ゼロ)
       │
       ▼
[配布]  Cloudflare Pages / GitHub Pages / 直接ファイル送付 / 共有ドライブ
       │
       ▼
[利用者]  ブックマーク URL を開く、または .html をダブルクリック
```

## 推奨ホスティング:Cloudflare Pages(無料、自動デプロイ)

1. GitHub に private リポジトリを作成し、push
2. Cloudflare ダッシュボード → Pages → Connect to Git → 該当リポジトリ
3. ビルド設定:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Deploy → `https://facet-xxx.pages.dev` が発行される
5. 以降は git push するだけで自動デプロイ

公開範囲を「URL を知る人だけ」に絞りたい場合は Cloudflare Access(無料 50 ユーザ枠)で
Google / Microsoft アカウント認証必須化が可能。

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
