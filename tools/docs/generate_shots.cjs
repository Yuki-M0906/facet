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

    /* v4.21.0: ルータ枠に匿名の .exp(base64 の key=value 群)を投入し、変換結果パネルを撮る。
     * 撮影後は「クリア」で元に戻し、続くサンプル読込フローに影響させない。 */
    await safe('.exp 変換パネル', async () => {
      const KV = [
        'shortProdName=TZ 470', 'buildNum=7.1.2-7019', 'firewallName=ACME-EDGE-01',
        'iface_ifnum_0=0', 'iface_name_0=X0', 'iface_phys_type_0=0', 'interface_Zone_0=LAN', 'iface_comment_0=LAN%20core',
        'iface_lan_ip_0=192.168.1.1', 'iface_lan_mask_0=255.255.255.0', 'iface_vlan_tag_0=0', 'iface_vlan_parent_0=-1',
        'iface_ifnum_1=1', 'iface_name_1=X1', 'iface_phys_type_1=0', 'interface_Zone_1=WAN', 'iface_lan_ip_1=0.0.0.0',
        'iface_static_ip_1=203.0.113.2', 'iface_static_mask_1=255.255.255.248', 'iface_vlan_tag_1=0',
        'iface_ifnum_2=268435466', 'iface_name_2=X0%3aV10', 'iface_phys_type_2=2', 'interface_Zone_2=LAN',
        'iface_lan_ip_2=192.168.10.1', 'iface_lan_mask_2=255.255.255.0', 'iface_vlan_tag_2=10', 'iface_vlan_parent_2=0',
        'addrObjId_1=net-staff', 'addrObjType_1=4', 'addrObjZone_1=LAN', 'addrObjIp1_1=192.168.10.0', 'addrObjIp2_1=255.255.255.0',
        'svcObjId_1=svc-https', 'svcObjType_1=1', 'svcObjIpType_1=6', 'svcObjPort1_1=443', 'svcObjPort2_1=443',
        'policyAction_0=2', 'policySrcZone_0=LAN', 'policyDstZone_0=WAN', 'policySrcNet_0=', 'policyDstNet_0=',
        'policyDstSvc_0=', 'policyEnabled_0=1', 'policyComment_0=LAN%20to%20WAN',
      ];
      const exp = Buffer.from(KV.join('&'), 'utf8').toString('base64') + '&&';
      await page.locator('input[type=file]').first().setInputFiles({ name: 'acme-edge-01.exp', mimeType: 'application/octet-stream', buffer: Buffer.from(exp, 'utf8') });
      await page.waitForSelector('.exp-panel');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, '13_exp_convert.png') });
      /* 「クリア」は投入済みデータがあると window.confirm を出す(v4.20.0 Medium-15)。
       * Playwright は既定で confirm を「キャンセル」扱いにするため、明示的に受諾する。 */
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: 'クリア', exact: true }).click();
      await page.waitForTimeout(200);
    });

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

    /* v4.17.0 以降、診断パネル(経路トレース/論理接続図/シャーシ/マトリクス)は
     * 折りたたみ式 <details> に入っている。撮影前にすべて展開しないと、パネル単体
     * スクリーンショットが「畳まれた見出しバー」だけになってしまう。 */
    await page.evaluate(() => document.querySelectorAll('#diagnostics details').forEach((d) => { d.open = true; }));
    await page.waitForTimeout(200);

    /* 経路トレースは既定選択のまま「トレース」を押し、実際のホップ結果を見せる
     * (展開後でないとボタンが非表示でクリックできない)。 */
    await safe('経路トレース実行', () => page.getByRole('button', { name: 'トレース', exact: true }).click());
    await page.waitForTimeout(300);

    /* .panel の並び順: 0=概要ヒーロー(04で全画面撮影済), 1=指摘一覧,
     * 2=経路トレース, 3=論理接続図, 4=シャーシ, 5=マトリクス。
     * v4.17.0 の結果画面再構成で hero/findings パネルが増え、診断が <details> 化した
     * ため、旧来の 0〜4 連番マッピングでは中身が撮れていなかった。実インデックスに修正。 */
    const shotByPanel = [
      { file: '05_report_trace.png', idx: 2 },
      { file: '06_report_topology.png', idx: 3 },
      { file: '07_report_chassis.png', idx: 4 },
      { file: '08_report_matrix.png', idx: 5 },
      { file: '09_report_findings.png', idx: 1 },
    ];
    const panels = page.locator('.panel');
    for (const s of shotByPanel) {
      await safe(s.file, () => panels.nth(s.idx).screenshot({ path: path.join(OUT, s.file) }));
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

  /* ===== ③ 簡易検証モード(単体機器のクイックチェック)の入口 ===== */
  {
    server = await startPreviewServer();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    console.log('簡易検証モードを撮影中...');

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /このモードで進む/ }).nth(2).click();
    await page.waitForSelector('text=機器の種類・機種');
    await safe('スイッチ種別へ切替', () => page.getByRole('button', { name: /スイッチ/ }).click());
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '12_quick.png') });

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
