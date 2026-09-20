/**
 * 依存ライブラリなしの最小 XLSX(SpreadsheetML)ライタ。
 *
 * FACET は「ランタイム依存は react / react-dom のみ」「配布物は単一 HTML」を維持する
 * 方針のため、SheetJS / exceljs 等を追加しない。XLSX は「XML 群を ZIP に格納したもの」
 * なので、ZIP を無圧縮(STORED)で自前生成すれば deflate 実装も不要。
 *  - セルは inlineStr(共有文字列テーブル不要)と数値のみ
 *  - 1 ワークブック複数シート、先頭行を見出しとして固定(freeze pane)
 *  - 列幅は内容長からの概算
 * 生成物は Excel / LibreOffice で開けることを確認する(test/engine/exp.test.ts で ZIP 構造と
 * XML 妥当性を機械検証、加えて Excel COM での実開き確認を実施済み)。
 * DOM 非依存(TextEncoder は Node 20+ とブラウザ双方のグローバル)。
 */

export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
  /** シート名(31 文字以内、\ / ? * [ ] : は使用不可 — 自動で置換) */
  name: string;
  /** 先頭行を見出しとして扱う */
  rows: XlsxCell[][];
}

/* ---------- XML helpers ---------- */

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* XML 1.0 で許容されない制御文字は除去(Excel が「修復」ダイアログを出す原因になる) */
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function colLetter(idx: number): string {
  let n = idx + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function safeSheetName(name: string, used: Set<string>): string {
  let n = name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
  let i = 2;
  while (used.has(n)) { const suf = '(' + i++ + ')'; n = n.slice(0, 31 - suf.length) + suf; }
  used.add(n);
  return n;
}

function sheetXml(rows: XlsxCell[][]): string {
  const widths: number[] = [];
  const rowXml: string[] = [];
  rows.forEach((row, ri) => {
    const cells: string[] = [];
    row.forEach((v, ci) => {
      if (v === null || v === undefined || v === '') return;
      const ref = colLetter(ci) + (ri + 1);
      const text = String(v);
      /* 幅の概算: 全角は 2 文字分 */
      let w = 0; for (const ch of text) w += ch.charCodeAt(0) > 0xff ? 2 : 1;
      widths[ci] = Math.max(widths[ci] || 0, Math.min(w, 60));
      if (typeof v === 'number' && Number.isFinite(v)) {
        cells.push('<c r="' + ref + '"' + (ri === 0 ? ' s="1"' : '') + '><v>' + v + '</v></c>');
      } else {
        const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
        cells.push('<c r="' + ref + '" t="inlineStr"' + (ri === 0 ? ' s="1"' : '') +
          '><is><t' + preserve + '>' + xmlEsc(text) + '</t></is></c>');
      }
    });
    rowXml.push('<row r="' + (ri + 1) + '">' + cells.join('') + '</row>');
  });
  const cols = widths.length
    ? '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (Math.max(w, 8) + 2) + '" customWidth="1"/>').join('') + '</cols>'
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    cols + '<sheetData>' + rowXml.join('') + '</sheetData></worksheet>';
}

/* ---------- ZIP (STORED) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Uint8Array }

function u16(v: number): number[] { return [v & 0xff, (v >>> 8) & 0xff]; }
function u32(v: number): number[] { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  /* 固定の DOS 日時(2026-01-01 00:00)。再現性のため実時刻は使わない */
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  entries.forEach((e) => {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const hdr = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nameBytes.length), ...u16(0),
    ];
    local.push(...hdr, ...nameBytes, ...e.data);
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
    );
    offset += hdr.length + nameBytes.length + e.data.length;
  });
  const eocd = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(offset), ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...eocd]);
}

/* ---------- workbook ---------- */

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error('シートがありません。');
  const enc = new TextEncoder();
  const used = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, used));

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((_s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '</Types>';
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + names.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
    '</workbook>';
  const wbRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names.map((_n, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  /* s=0 既定、s=1 見出し(太字・薄い塗り) */
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Meiryo UI"/></font><font><b/><sz val="11"/><name val="Meiryo UI"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEDE6D3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(styles) },
    ...sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(sheetXml(s.rows)) })),
  ];
  return buildZip(entries);
}
