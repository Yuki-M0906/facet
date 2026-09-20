/**
 * `.exp` 変換結果のサマリと成果物ダウンロード(v4.21.0)。
 * Phase 03 のルータスロット直下、および簡易検証モードの結果画面で使う。
 */

import type { ExpArtifacts } from '../expArtifacts';
import { downloadBlob } from '../expArtifacts';

interface Props {
  exp: ExpArtifacts;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function ExpConvertPanel({ exp }: Props) {
  const c = exp.counts;
  return (
    <div className="exp-panel">
      <div className="exp-head">
        <span className="badge cat">.exp 変換</span>
        <span className="exp-title">{exp.fileName}</span>
        {exp.product && <span className="exp-meta">{exp.product}</span>}
      </div>
      <p className="exp-summary">
        設定変数 {exp.pairCount} 件を復号し、FACET が解釈できる形に変換しました —
        インターフェイス {c.interfaces} / アドレスオブジェクト {c.addrObjs} / サービス {c.svcObjs} /
        アクセスルール {c.rules} / NAT {c.nats} / DHCP {c.dhcp}。
        検証にはこの変換テキストが使われます(元ファイルは外部に送信されません)。
      </p>
      <div className="exp-actions">
        <button
          className="btn ghost sm"
          onClick={() => downloadBlob(exp.baseName + '.facet.sonicos.txt', exp.cliText, 'text/plain;charset=utf-8')}
          title="FACET / 簡易検証モードにそのまま投入できる CLI 可読テキスト"
        >
          ⇩ FACET用テキスト(.txt)
        </button>
        <button
          className="btn ghost sm"
          onClick={() => downloadBlob(exp.baseName + '.decoded.txt', exp.decodedText, 'text/plain;charset=utf-8')}
          title="復号した全設定変数を 1 行 1 変数で並べたテキスト"
        >
          ⇩ 復号テキスト(全変数)
        </button>
        <button
          className="btn ghost sm"
          onClick={() => downloadBlob(exp.baseName + '.xlsx', exp.xlsx, XLSX_MIME)}
          title="概要・インターフェイス・オブジェクト・ルール・NAT・DHCP・全変数をシート分けした Excel"
        >
          ⇩ Excel(.xlsx)
        </button>
      </div>
      {(exp.omitted.length > 0 || exp.notes.length > 0) && (
        <details className="exp-details">
          <summary>変換で省略・注記した項目({exp.omitted.length + exp.notes.length})</summary>
          <ul>
            {exp.notes.map((n, i) => <li key={'n' + i}>{n}</li>)}
            {exp.omitted.map((o, i) => <li key={'o' + i}>{o}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
