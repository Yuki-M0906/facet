/**
 * 簡易検証モード — 機種選定・トポロジー指定を経ず、単体機器のコンフィグを
 * 直接アップロードしてその場で静的チェックする。
 * 元: このモード自体が新規(v4.19.0)。verify() は既存のものをそのまま呼ぶ
 * (store.tsx の buildQuickAppState 参照)。
 */

import { useState } from 'react';
import { CATALOG } from '@engine/index';
import { useApp } from '../store';
import { convertExp, isExpUpload } from '../expArtifacts';

export function PhaseQuick() {
  const { state, dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const models = state.quickRole === 'router' ? CATALOG.router : CATALOG.switch;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const name = f.name;
    setReading(true);
    const r = new FileReader();
    r.onload = () => {
      setReading(false);
      const text = String(r.result || '');
      if (!text.trim()) { setError('ファイルが空です。中身のあるコンフィグファイルを選択してください。'); return; }
      /* v4.21.0: ルータ種別で .exp(Settings Export)を投入したら自動変換し、変換後の
       * CLI テキストで検証する。成果物は結果画面からダウンロードできるよう store に渡す。 */
      if (state.quickRole === 'router' && isExpUpload(name, text)) {
        try {
          const art = convertExp(text, name);
          setError(null);
          dispatch({ type: 'QUICK_VERIFY', text: art.cliText, exp: art });
        } catch (err) {
          setError('.exp の復号に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
        }
        return;
      }
      setError(null);
      dispatch({ type: 'QUICK_VERIFY', text });
    };
    r.onerror = () => { setReading(false); setError('ファイルの読み込みに失敗しました。'); };
    r.readAsText(f);
    e.target.value = '';
  }

  return (
    <section className="phase">
      <div className="kicker">Quick Check</div>
      <h1 className="title">簡易検証</h1>
      <p className="lede">
        機器を1台分だけアップロードして、その場で静的チェックします。
        <b>機器間の配線不一致・スパニングツリーのループ検出・到達性マトリクス・経路トレースなど、
        複数機器にまたがるチェックはこのモードでは実行されません。</b>
        総合的な検証には「① 検証モード」をご利用ください。
      </p>

      <div className="panel">
        <div className="eyebrow">機器の種類・機種</div>
        <div className="toggle" style={{ marginTop: 4 }}>
          <button
            className={state.quickRole === 'router' ? 'on' : ''}
            aria-pressed={state.quickRole === 'router'}
            onClick={() => dispatch({ type: 'SET_QUICK_ROLE', role: 'router' })}
          >
            ルータ(SonicWall)
          </button>
          <button
            className={state.quickRole === 'switch' ? 'on' : ''}
            aria-pressed={state.quickRole === 'switch'}
            onClick={() => dispatch({ type: 'SET_QUICK_ROLE', role: 'switch' })}
          >
            スイッチ(Cisco)
          </button>
        </div>
        <label className="fld" style={{ marginTop: 14 }}>
          <span>機種</span>
          <select
            value={state.quickModelId}
            onChange={(e) => dispatch({ type: 'SET_QUICK_MODEL', id: e.target.value })}
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <p className="note" style={{ marginTop: 8 }}>
          機種を指定すると、VLAN数・ACLエントリ数などの機材容量チェック(CAPカテゴリ)も対象になります。
        </p>
      </div>

      <div className="panel">
        <div className="eyebrow">コンフィグファイル</div>
        <p className="note">
          {state.quickRole === 'router'
            ? 'SonicOS の CLI 可読テキスト、または Settings Export(.exp)を投入してください(.exp はその場で復号・変換し、変換テキストと Excel を結果画面からダウンロードできます)。'
            : 'Cisco の running-config テキストを投入してください。'}
        </p>
        <div className="slot ready" style={{ marginTop: 10 }}>
          <div className="ic">{state.quickRole === 'router' ? '⬡' : '⬢'}</div>
          <div className="info">
            <div className="n">{state.quickRole === 'router' ? 'ルータ' : 'スイッチ'} — {models.filter((m) => m.id === state.quickModelId)[0]?.name}</div>
            <div className="s">アップロードすると即座に検証します</div>
          </div>
          {reading && <span className="builder-generate-status pending">読み込み中…</span>}
          <label className="btn ghost" aria-disabled={reading}>
            <input
              type="file"
              accept={state.quickRole === 'router' ? '.txt,.cfg,.conf,.log,.exp' : '.txt,.cfg,.conf,.log'}
              onChange={handleFile}
              disabled={reading}
            />
            ファイル選択
          </label>
        </div>
        {error && <div className="builder-warn" style={{ marginTop: 10 }}>⚠ {error}</div>}
      </div>
    </section>
  );
}
