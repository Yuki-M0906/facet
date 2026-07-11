/**
 * Phase 03 — コンフィグ投入。
 * 機器ごとにスロットを表示し、ルータ → スイッチの順番で投入を促す。
 */

import type { Device } from '@engine/types';
import { useApp } from '../store';
import { DeviceSlot, type SlotStatus } from '../components/DeviceSlot';

export function PhaseIntake() {
  const { state, dispatch } = useApp();
  const router = state.router!;
  const devices: Device[] = [router, ...state.switches];
  const allLoaded = devices.every((d) => !!d.config);
  const anyLoaded = devices.some((d) => !!d.config);

  /* 全機能監査 Medium-15: 「サンプルコンフィグを読み込む」「クリア」は以前は
   * 確認なしに即座に既存データを上書き/消去していた。同じ画面の他ボタン
   * (PhaseSelect.tsx の構成変更確認、PhaseBuild.tsx の機器リセット確認)と
   * 同様に、既に投入済みのデータがある場合のみ確認ダイアログを出す。 */
  function loadSamples() {
    if (anyLoaded && !window.confirm('投入済みのコンフィグをすべてサンプルデータで上書きします。よろしいですか?')) return;
    dispatch({ type: 'LOAD_SAMPLES' });
  }
  function clearIntake() {
    if (anyLoaded && !window.confirm('投入済みのコンフィグをすべてクリアします。よろしいですか?')) return;
    dispatch({ type: 'CLEAR_INTAKE' });
  }

  /* スロット状態:loaded / ready / locked。未投入の最初の機器のみ ready、それより後は locked */
  let firstU = -1;
  const statuses: SlotStatus[] = devices.map((d, i) => {
    if (d.config) return 'loaded';
    if (firstU === -1) { firstU = i; return 'ready'; }
    return 'locked';
  });

  return (
    <section className="phase">
      <div className="kicker">Phase 03 — Configuration Intake</div>
      <h1 className="title">コンフィグの投入</h1>
      <p className="lede">
        <b>ルータ → スイッチ(台数分)</b>の順で投入します。SonicWall は <code>.exp</code> ではなく
        <b> CLI の可読テキスト</b>を。アクセスルール・アドレスオブジェクト・NAT を含めると FW検証が有効になります。
      </p>
      <div className="panel">
        <div className="eyebrow">Intake Sequence</div>
        <div>
          {devices.map((d, i) => (
            <DeviceSlot
              key={d.key}
              device={d}
              status={statuses[i]!}
              onFile={(text) => dispatch({ type: 'INGEST', key: d.key, text })}
            />
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={loadSamples}>
            ◆ サンプルコンフィグを読み込む
          </button>
          <button className="btn ghost" onClick={clearIntake}>
            クリア
          </button>
        </div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', phase: 'topo' })}>
          ← トポロジーへ
        </button>
        <button
          className="btn primary"
          disabled={!allLoaded}
          onClick={() => dispatch({ type: 'RUN_VERIFY' })}
        >
          検証を実行 →
        </button>
      </div>
    </section>
  );
}
