/**
 * SonicWall `.exp` アップロード時の変換(UI 側の薄いラッパ)と、生成物のダウンロード。
 * 復号・変換ロジック本体は engine(expDecode / expToCli / xlsx)にあり、ここでは
 * 「1 ファイル → 3 つの成果物(FACET 用 CLI テキスト / 復号済みテキスト / Excel)」に
 * 束ねるだけ。すべてブラウザ内で完結し、外部送信は行わない。
 */

import {
  looksLikeExp, decodeExp, expToDecodedText, extractExpModel, expModelToCli, expModelToSheets, buildXlsx,
} from '@engine/index';
import type { ExpCliResult } from '@engine/index';

export interface ExpArtifacts {
  fileName: string;
  baseName: string;
  product: string;
  cliText: string;
  decodedText: string;
  xlsx: Uint8Array;
  omitted: string[];
  notes: string[];
  counts: ExpCliResult['counts'];
  pairCount: number;
}

/** 拡張子が .exp、または中身が base64 の .exp らしければ変換対象。 */
export function isExpUpload(fileName: string, text: string): boolean {
  return /\.exp$/i.test(fileName) || looksLikeExp(text);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'sonicwall';
}

export function convertExp(text: string, fileName: string): ExpArtifacts {
  const decoded = decodeExp(text);
  const model = extractExpModel(decoded.map);
  const cli = expModelToCli(model, fileName);
  const sheets = expModelToSheets(model, decoded, fileName);
  return {
    fileName,
    baseName: baseName(fileName),
    product: [model.product, model.buildNum].filter(Boolean).join(' / '),
    cliText: cli.text,
    decodedText: expToDecodedText(decoded),
    xlsx: buildXlsx(sheets),
    omitted: cli.omitted,
    notes: decoded.notes,
    counts: cli.counts,
    pairCount: decoded.stats.pairCount,
  };
}

export function downloadBlob(name: string, data: string | Uint8Array, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
