/**
 * ④ .exp コンバート(v4.22.0)— SonicWall の Settings Export(.exp)を復号し、
 * FACET 用テキスト(.txt)/ 復号テキスト / Excel(.xlsx)に変換してダウンロードする
 * 独立機能。検証パイプラインとは統合しない(変換した .txt を ① 検証モード / ③ 簡易検証
 * モードに投入するかどうかはユーザの操作に委ねる)。処理はすべてブラウザ内で完結する。
 *
 * 変換結果は store(`expResults`)に置く(v4.22.1)。Header の「ホームに戻る」と本画面の
 * 「← ホームに戻る」が同じ判定(結果が残っていれば確認ダイアログ)を共有するため。
 */

import { useState } from 'react';
import { useApp } from '../store';
import { convertExp, type ExpArtifacts } from '../expArtifacts';
import { ExpConvertPanel } from '../components/ExpConvertPanel';

interface Failed {
  fileName: string;
  message: string;
}

export const EXP_HOME_CONFIRM =
  'ホームに戻ります。画面上の .exp 変換結果は破棄されます(ダウンロード済みのファイルは残ります)。よろしいですか?';

export function PhaseExp() {
  const { state, dispatch } = useApp();
  const items = state.expResults;
  const [failed, setFailed] = useState<Failed[]>([]);
  const [reading, setReading] = useState(false);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setReading(true);
    /* 複数ファイルを選んだ場合も 1 つずつ順に読む。 */
    const okList: ExpArtifacts[] = [];
    const ngList: Failed[] = [];
    let idx = 0;
    const next = () => {
      if (idx >= files.length) {
        if (okList.length) dispatch({ type: 'EXP_ADD_RESULTS', items: okList });
        setFailed(ngList);
        setReading(false);
        return;
      }
      const f = files[idx++]!;
      const r = new FileReader();
      r.onload = () => {
        const text = String(r.result || '');
        try {
          if (!text.trim()) throw new Error('ファイルが空です。');
          okList.push(convertExp(text, f.name));
        } catch (err) {
          ngList.push({ fileName: f.name, message: err instanceof Error ? err.message : String(err) });
        }
        next();
      };
      r.onerror = () => { ngList.push({ fileName: f.name, message: 'ファイルの読み込みに失敗しました。' }); next(); };
      r.readAsText(f);
    };
    next();
  }

  function goHome() {
    if (items.length && !window.confirm(EXP_HOME_CONFIRM)) return;
    dispatch({ type: 'RESET' });
  }

  return (
    <section className="phase">
      <div className="kicker">Exp Convert</div>
      <h1 className="title">.exp コンバート</h1>
      <p className="lede">
        SonicWall の管理画面から書き出した <b>Settings Export(<code>.exp</code>)</b>を、
        FACET に投入できる <b>CLI 可読テキスト(.txt)</b>と、人が読み合わせるための <b>Excel(.xlsx)</b>に変換します。
        このモードでは<b>検証は行いません</b>。変換した .txt は「① 検証モード」「③ 簡易検証モード」のルータ枠に投入できます。
        復号・変換はすべてブラウザ内で完結し、ファイルは外部に送信されません。
      </p>

      <div className="panel">
        <div className="eyebrow">Settings Export(.exp)ファイル</div>
        <p className="note">
          SonicOS 6 系・7 系(Gen7)の .exp に対応。複数ファイルをまとめて選択できます。
          既に復号済みの key=value テキスト(本画面の「復号テキスト」出力など)も読めます。
          パスワード等の暗号化された値は復号できません。
        </p>
        <div className="slot ready" style={{ marginTop: 10 }}>
          <div className="ic">⬡</div>
          <div className="info">
            <div className="n">SonicWall — Settings Export(.exp)</div>
            <div className="s">選択するとその場で復号・変換します</div>
          </div>
          {reading && <span className="builder-generate-status pending">変換中…</span>}
          <label className="btn ghost" aria-disabled={reading}>
            <input type="file" accept=".exp,.txt" multiple onChange={handleFiles} disabled={reading} />
            ファイル選択
          </label>
        </div>
        {failed.map((f) => (
          <div key={f.fileName} className="builder-warn" style={{ marginTop: 10 }}>
            ⚠ {f.fileName}: .exp の復号に失敗しました — {f.message}
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="panel">
          <div className="eyebrow">変換結果({items.length} ファイル)</div>
          {items.map((it) => <ExpConvertPanel key={it.fileName} exp={it} />)}
          <p className="note" style={{ marginTop: 6 }}>
            「FACET用テキスト(.txt)」を保存し、「① 検証モード」の Phase 03 ルータ枠、または
            「③ 簡易検証モード」(ルータ)に投入すると静的検証できます。
          </p>
        </div>
      )}

      <div className="actions">
        <button className="btn ghost" onClick={goHome}>
          ← ホームに戻る
        </button>
        {items.length > 0 && (
          <button className="btn ghost" onClick={() => { dispatch({ type: 'EXP_CLEAR' }); setFailed([]); }}>
            変換結果をクリア
          </button>
        )}
      </div>
    </section>
  );
}
