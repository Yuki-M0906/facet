/**
 * 簡易検証モード — 機種選定・トポロジー指定を経ず、単体機器のコンフィグを
 * 直接アップロードしてその場で静的チェックする。
 * 元: このモード自体が新規(v4.19.0)。verify() は既存のものをそのまま呼ぶ
 * (store.tsx の buildQuickAppState 参照)。
 */

import { useState } from 'react';
import { CATALOG } from '@engine/index';
import { useApp } from '../store';

export function PhaseQuick() {
  const { state, dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  const models = state.quickRole === 'router' ? CATALOG.router : CATALOG.switch;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result || '');
      if (!text.trim()) { setError('ファイルが空です。中身のあるコンフィグファイルを選択してください。'); return; }
      setError(null);
      dispatch({ type: 'QUICK_VERIFY', text });
    };
    r.onerror = () => setError('ファイルの読み込みに失敗しました。');
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
            onClick={() => dispatch({ type: 'SET_QUICK_ROLE', role: 'router' })}
          >
            ルータ(SonicWall)
          </button>
          <button
            className={state.quickRole === 'switch' ? 'on' : ''}
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
            ? 'SonicOS の CLI 可読テキストを投入してください(難読化された .exp は非対応)。'
            : 'Cisco の running-config テキストを投入してください。'}
        </p>
        <div className="slot ready" style={{ marginTop: 10 }}>
          <div className="ic">{state.quickRole === 'router' ? '⬡' : '⬢'}</div>
          <div className="info">
            <div className="n">{state.quickRole === 'router' ? 'ルータ' : 'スイッチ'} — {models.filter((m) => m.id === state.quickModelId)[0]?.name}</div>
            <div className="s">アップロードすると即座に検証します</div>
          </div>
          <label className="btn ghost">
            <input
              type="file"
              accept=".txt,.cfg,.conf,.log,.exp"
              onChange={handleFile}
            />
            ファイル選択
          </label>
        </div>
        {error && <div className="builder-warn" style={{ marginTop: 10 }}>⚠ {error}</div>}
      </div>
    </section>
  );
}
