/**
 * Phase 05 の経路トレース UI(送信元 / 宛先 / サービス + ホップ列表示)。
 * 元: v3.1.0 の buildTrace + runTrace。
 */

import { useEffect, useState } from 'react';
import { pathTrace } from '@engine/index';
import type { AppState, PathTraceResult, Subnet } from '@engine/types';

interface Props {
  engineState: AppState;
  subnets: Subnet[];
}

const WAN_VALUE = '__WAN__';

export function PathTracePanel({ engineState, subnets }: Props) {
  const [src, setSrc] = useState<string>('');
  const [dst, setDst] = useState<string>('');
  const [svc, setSvc] = useState<string>('');
  const [trace, setTrace] = useState<PathTraceResult | null>(null);

  useEffect(() => {
    if (!subnets.length) return;
    setSrc(subnets[0]!.cidr);
    if (subnets.length > 1) setDst(subnets[1]!.cidr);
    else setDst(WAN_VALUE);
    setTrace(null);
  }, [subnets]);

  function run() {
    const result = pathTrace(engineState, src, dst, svc.trim() || 'any');
    setTrace(result);
  }

  return (
    <>
      <div className="trace">
        <label className="fld">
          <span>送信元</span>
          <select value={src} onChange={(e) => setSrc(e.target.value)}>
            {subnets.map((s) => (
              <option key={s.cidr} value={s.cidr}>
                {(s.vlan ? 'V' + s.vlan + ' ' : '') + s.cidr + ' (' + s.zone + ')'}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          <span>宛先</span>
          <select value={dst} onChange={(e) => setDst(e.target.value)}>
            {subnets.map((s) => (
              <option key={s.cidr + 'd'} value={s.cidr}>
                {(s.vlan ? 'V' + s.vlan + ' ' : '') + s.cidr + ' (' + s.zone + ')'}
              </option>
            ))}
            <option value={WAN_VALUE}>インターネット (WAN)</option>
          </select>
        </label>
        <label className="fld" style={{ flex: '0 0 130px' }}>
          <span>サービス</span>
          <input
            type="text"
            value={svc}
            placeholder="any / https / 443"
            onChange={(e) => setSvc(e.target.value)}
          />
        </label>
        <button className="btn primary" onClick={run} style={{ marginBottom: 0 }}>
          トレース
        </button>
      </div>
      {trace && (
        <>
          <div className="hops">
            {trace.hops.map((h, i) => (
              <div key={i} className={'hop ' + h.status}>
                <div className="node">
                  <div className="o">{h.node}</div>
                </div>
                <div className="line" />
                <div className="body">
                  <div className="hn">{h.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={'verdictline ' + (trace.verdict === 'ok' ? 'ok' : 'deny')}>
            {trace.verdict === 'ok' ? '○ ' : '× '}
            {trace.message}
          </div>
        </>
      )}
    </>
  );
}
