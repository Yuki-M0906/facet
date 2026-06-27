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
          <button className="btn ghost" onClick={() => dispatch({ type: 'LOAD_SAMPLES' })}>
            ◆ サンプルコンフィグを読み込む
          </button>
          <button className="btn ghost" onClick={() => dispatch({ type: 'CLEAR_INTAKE' })}>
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
