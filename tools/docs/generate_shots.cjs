/**
 * FACET ユーザーガイド用スクリーンショット生成(Sprint 5.5 で実写化)。
 *
 * 旧 generate_shots.py は Pillow で手描きした「モックアップ画像」であり、実際の UI では
 * なかった上に Linux 専用フォントパス(/usr/share/fonts/...)に依存しており Windows では
 * 動作しなかった。本スクリプトは Playwright で本番ビルド(`vite preview`)を実際に操作し、
 * 実写のスクリーンショットを撮る。
 *
 * 実行手順(いずれも `npm run` 経由):
 *   1. npm run build        — dist/index.html を最新化
 *   2. npm run guide:shots  — 本スクリプト。vite preview を内部起動し、実写PNGを
 *                             tools/docs/shots/ に保存する
 *   3. npm run guide        — build_guide.js が上記PNGを docx に埋め込み、
 *                             プロジェクトルートに FACET_User_Guide.docx を生成する
 */
const { chromium } = require('playwright');
const { preview } = require('vite');
const path = require('path');
const fs = require('fs');

const PORT = 4319;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'shots');

/* child_process 経由の `npx vite preview` は Windows で spawn EINVAL になることがあるため、
 * Vite の Node API を直接呼ぶ(プラットフォーム非依存で確実)。 */
function startPreviewServer() {
  return preview({ root: ROOT, preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
}

/** 失敗しても撮影全体を止めない(フォーム要素の有無はバージョンで変わり得るため)。 */
async function safe(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.warn(`  [skip] ${label}: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('vite preview を起動中...');
  let server = await startPreviewServer();
  const browser = await chromium.launch();

  /* ===== ① 検証モード一式:モード選択 → 構成 → トポロジー → 投入 → 検証レポート ===== */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    console.log('検証モードのフローを撮影中...');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, '00_mode.png') });

    await page.getByRole('button', { name: /このモードで進む/ }).first().click();
    await page.waitForSelector('text=PHASE 01');
    await page.screenshot({ path: path.join(OUT, '01_select.png') });

    await page.getByRole('button', { name: /トポロジーへ/ }).click();
    await page.waitForSelector('text=PHASE 02');
    await safe('スター選択', () => page.getByRole('button', { name: 'スター', exact: true }).click());
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '02_topology.png') });

    await page.getByRole('button', { name: /コンフィグ投入へ/ }).click();
    await page.waitForSelector('text=PHASE 03');
    await page.screenshot({ path: path.join(OUT, '03_intake.png') });

    await page.getByRole('button', { name: /サンプルコンフィグを読み込む/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /検証を実行/ }).click();
    await page.waitForSelector('text=PHASE 05');
    await page.waitForTimeout(500);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, '04_report_overview.png') });

    /* position:sticky のヘッダーが要素単体スクリーンショットの上端に被るため、
     * この撮影中だけ一時的に無効化する(表示上の見た目のみ、機能には影響しない)。 */
    await page.addStyleTag({ content: 'header.facet-header{position:static !important}' });

    /* 経路トレースは既定選択のまま「トレース」を押し、実際のホップ結果を見せる */
    await safe('経路トレース実行', () => page.getByRole('button', { name: 'トレース', exact: true }).click());
    await page.waitForTimeout(200);
    const panelFiles = [
      '05_report_trace.png',
      '06_report_topology.png',
      '07_report_chassis.png',
      '08_report_matrix.png',
      '09_report_findings.png',
    ];
    const panels = page.locator('.panel');
    for (let i = 0; i < panelFiles.length; i++) {
      await safe(panelFiles[i], () => panels.nth(i).screenshot({ path: path.join(OUT, panelFiles[i]) }));
    }
    await page.close();
  }
  await server.close();

  /* ===== ② 作成モード(GUIビルダー)一式 ===== */
  {
    server = await startPreviewServer();
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
    console.log('作成モード(GUIビルダー)を撮影中...');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /このモードで進む/ }).nth(1).click();
    await page.waitForSelector('text=PHASE 01');

    // スイッチ台数を1台にして画面をシンプルに
    await safe('スイッチ台数を1に変更', async () => {
      const spin = page.getByRole('spinbutton', { name: '台数' });
      await spin.fill('1');
    });

    await page.getByRole('button', { name: /トポロジーへ/ }).click();
    await page.waitForSelector('text=PHASE 02');
    await safe('スター選択', () => page.getByRole('button', { name: 'スター', exact: true }).click());
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /GUI で構成を作成/ }).click();
    await page.waitForSelector('text=PHASE 03');

    const panels = page.locator('.panel');
    const sonicPanel = panels.nth(0);
    const ciscoPanel = panels.nth(1);

    /* SonicWall: X0 を有効化して IP/マスクを入れる(フォームの見え方が伝わる程度) */
    await safe('SonicWall X0 有効化', async () => {
      await sonicPanel.getByRole('checkbox', { name: 'X0' }).check();
      await sonicPanel.locator('input[placeholder="192.168.1.1"]').first().fill('192.168.1.1');
    });
    await safe('SonicWall アドレスオブジェクト追加', async () => {
      await sonicPanel.getByRole('button', { name: '+ アドレスオブジェクト追加' }).click();
      await sonicPanel.locator('input[placeholder="net-staff"]').first().fill('net-staff');
      await sonicPanel.locator('input[placeholder="192.168.10.0"]').first().fill('192.168.10.0');
      await sonicPanel.locator('input[placeholder="255.255.255.0"]').first().fill('255.255.255.0');
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, '10_build_sonicwall.png') });

    /* Cisco: VLAN を1つ追加してポートを1つ access に設定 */
    await safe('Cisco VLAN 追加', async () => {
      await ciscoPanel.getByRole('button', { name: '+ VLAN 追加' }).click();
      await ciscoPanel.locator('input[placeholder="10"]').first().fill('10');
      await ciscoPanel.locator('input[placeholder="STAFF"]').first().fill('STAFF');
    });
    await safe('Cisco ポート設定', async () => {
      const modeSelects = ciscoPanel.locator('.builder-portrow select').first();
      await modeSelects.selectOption('access');
    });
    await ciscoPanel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, '11_build_cisco.png') });

    await page.close();
  }
  await server.close();

  await browser.close();
  console.log('完了:', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
