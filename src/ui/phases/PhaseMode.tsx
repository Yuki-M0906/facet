/**
 * Phase 00 — モード選択。
 * ① 既存コンフィグを検証 / ② GUI でゼロから作成(Sprint 2 で実装)
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
        作成モードは Sprint 2 で実装予定です。
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
        <div className="panel modecard disabled">
          <div className="eyebrow">
            ② 作成モード <span className="ph-tag">COMING SOON</span>
          </div>
          <div className="modecard-h">ゼロから GUI で作成</div>
          <p className="modecard-p">
            VLAN・インターフェース・FW ルール・NAT・DHCP を GUI で組み立て、Cisco IOS / SonicOS CLI 形式で出力します。
            出力後にそのまま検証パスを通せます。
          </p>
          <div className="modecard-bullets">
            <span>・ 機種選定 → トポロジー指定 → GUI で構成 → 生成 → 検証</span>
            <span>・ 自己往復テスト(生成テキストを自分でパース可)を保証</span>
            <span>・ Sprint 2 (Cisco) → Sprint 3 (SonicWall) で実装</span>
          </div>
          <button className="btn primary" disabled style={{ marginTop: 18 }}>
            Sprint 2 で実装予定
          </button>
        </div>
      </div>
    </section>
  );
}
