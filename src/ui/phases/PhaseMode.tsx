/**
 * Phase 00 — モード選択。
 * ① 既存コンフィグを検証(実装済) / ② GUI でゼロから作成(Sprint 5 MVP、実装済)
 */

import { useApp } from '../store';

export function PhaseMode() {
  const { dispatch } = useApp();
  return (
    <section className="phase">
      <div className="kicker">Phase 00 — Mode</div>
      <h1 className="title">モード選択</h1>
      <p className="lede">
        既存のコンフィグを<b>検証</b>するか、GUI でゼロから<b>作成</b>するかを選んでください。
      </p>
      <div className="grid2">
        <div className="panel modecard">
          <div className="eyebrow">① 検証モード</div>
          <div className="modecard-h">既存コンフィグを検証</div>
          <p className="modecard-p">
            手元の Cisco running-config / SonicOS CLI 出力を投入し、L1〜L3・FW・ハードニングを 6 カテゴリで静的検証します。
            経路トレースと到達性マトリクスも生成。
          </p>
          <div className="modecard-bullets">
            <span>・ 機種選定 → トポロジー指定 → コンフィグ投入 → 検証</span>
            <span>・ JSON / Markdown / PDF 出力対応</span>
            <span>・ 投入したコンフィグはダウンロードで取り出し可</span>
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 18 }}
            onClick={() => {
              dispatch({ type: 'SET_MODE', mode: 'verify' });
              dispatch({ type: 'NAV', phase: 'select' });
            }}
          >
            このモードで進む →
          </button>
        </div>
        <div className="panel modecard">
          <div className="eyebrow">② 作成モード</div>
          <div className="modecard-h">ゼロから GUI で作成</div>
          <p className="modecard-p">
            VLAN・ポート設定・ファイアウォールルール・NAT を GUI で組み立て、Cisco IOS / SonicOS CLI 形式で出力します。
            コンフィグ経験が無くても、フォームに入力するだけで実機に投入できるテキストが手に入ります。
          </p>
          <div className="modecard-bullets">
            <span>・ 機種選定 → トポロジー指定 → GUI で構成 → 生成 → 検証</span>
            <span>・ 生成テキストは自パーサで往復保証(検証パイプラインと共通)</span>
            <span>・ 生成後はダウンロードでそのまま実機投入可</span>
          </div>
          <button
            className="btn primary"
            style={{ marginTop: 18 }}
            onClick={() => {
              dispatch({ type: 'SET_MODE', mode: 'build' });
              dispatch({ type: 'NAV', phase: 'select' });
            }}
          >
            このモードで進む →
          </button>
        </div>
      </div>
    </section>
  );
}
