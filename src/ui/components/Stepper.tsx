/**
 * 6 フェーズステッパ。現在の Phase に応じて active / done を切替表示。
 */

import { PHASE_STEP, STEPS, useApp } from '../store';

export function Stepper() {
  const { state } = useApp();
  const active = PHASE_STEP[state.phase];
  return (
    <div className="stepper">
      <div className="wrap">
        {STEPS.map((s, i) => {
          const cls = i < active ? 'done' : i === active ? 'active' : '';
          return (
            <div key={s.en} className={`step ${cls}`}>
              <span className="dot">{i < active ? '✓' : i + 1}</span>
              <span className="lbl">
                {s.label}
                <small>{s.en}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
