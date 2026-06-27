/**
 * FACET — Network Verification Atelier
 * GAS 配信レイヤ
 *
 * 役割（検証ロジックそのものは Index.html 内の JS が担う）:
 *   1. Webアプリとして FACET を社内URLで配信する
 *   2. 検証結果をスプレッドシートに保存し、監査ログ/履歴として残す
 *   3. （任意）機種マスタを Models シートで一元管理する
 *
 * 配置: スプレッドシートにバインドした Apps Script プロジェクトを推奨。
 */

var SESSIONS_SHEET = 'Sessions';
var MODELS_SHEET   = 'Models';

/** Webアプリのエントリポイント。Index.html を配信する。 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('FACET — Network Verification Atelier')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 検証結果の保存。
 * クライアント側 google.script.run.saveSession(json) から呼ばれる。
 * payload: { ts, name, router, switches, topo, findings }
 */
function saveSession(json) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SESSIONS_SHEET);
    if (!sh) {
      sh = ss.insertSheet(SESSIONS_SHEET);
      sh.appendRow(['ID', '保存日時', 'サイト', 'ルータ', 'スイッチ台数', 'トポロジー', '指摘件数', 'JSON']);
      sh.setFrozenRows(1);
      sh.getRange('1:1').setFontWeight('bold');
    }
    var d  = JSON.parse(json);
    var id = 'S' + Date.now();
    sh.appendRow([
      id,
      d.ts || new Date().toISOString(),
      d.name || '',
      d.router || '',
      d.switches || '',
      d.topo || '',
      (d.findings != null ? d.findings : 0),
      json
    ]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

/** 直近 n 件の検証セッション一覧を返す（新しい順）。 */
function listSessions(limit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SESSIONS_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var n    = Math.min(limit || 20, sh.getLastRow() - 1);
  var rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
  return rows.reverse().map(function (r) {
    return { id: r[0], ts: r[1], site: r[2], router: r[3], switches: r[4], topo: r[5], findings: r[6] };
  });
}

/** ID 指定で 1 件の生JSONを取得（UIへの再読込用）。 */
function loadSession(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SESSIONS_SHEET);
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) return data[i][7];
  }
  return null;
}

/**
 * （任意）機種マスタを Models シートから取得。
 * シートが無ければ null を返し、HTML 内蔵カタログがそのまま使われる。
 * シート構造例（1行目=ヘッダ）:
 *   role | id | name | down | up | prefix | uplinkType
 *   switch | C9300-24 | Catalyst 9300-24P | 24 | 4 | GigabitEthernet1/0/ | sfp+
 * 利用する場合は Index.html 側の起動時に google.script.run.getModelCatalog() を
 * 呼んで FACET.CATALOG を差し替える数行を追加する（README 参照）。
 */
function getModelCatalog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MODELS_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getDataRange().getValues();
  var head = rows[0];
  return rows.slice(1).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}
