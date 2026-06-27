/**
 * Phase 01 — 構成の選定(ルータ機種、スイッチ機種、台数)。
 * 元: v3.1.0 の p-select セクションと rSpec / sSpec / sumSel 関数群。
 */

import { CATALOG, switchPorts } from '@engine/index';
import type { PortSpec, RouterCapabilities, SwitchCapabilities } from '@engine/types';
import { useApp } from '../store';

function portSummary(ports: PortSpec[]): string {
  const c: Record<string, number> = {};
  ports.forEach((p) => { c[p.type] = (c[p.type] || 0) + 1; });
  return Object.keys(c).map((k) => c[k] + '×' + k.toUpperCase()).join(' + ');
}

/** ルータ capabilities から表示用のサマリ行を組み立てる */
function routerCapSummary(cap?: RouterCapabilities): string[] {
  if (!cap) return [];
  const out: string[] = [];
  if (cap.firewallThroughputGbps) out.push('Firewall ' + cap.firewallThroughputGbps + ' Gbps');
  if (cap.ipsecVpnThroughputGbps) out.push('IPSec VPN ' + cap.ipsecVpnThroughputGbps + ' Gbps');
  if (cap.maxConcurrentSessions) out.push(cap.maxConcurrentSessions.toLocaleString() + ' sessions');
  if (cap.maxSiteToSiteVpn) out.push('S2S VPN ' + cap.maxSiteToSiteVpn);
  if (cap.maxVlanInterfaces) out.push('VLAN ≤ ' + cap.maxVlanInterfaces);
  const rt: string[] = [];
  if (cap.supportsBgp) rt.push('BGP');
  if (cap.supportsOspf) rt.push('OSPF');
  if (rt.length) out.push('Routing: ' + rt.join(' + '));
  return out;
}

/** スイッチ capabilities から表示用のサマリ行を組み立てる */
function switchCapSummary(cap?: SwitchCapabilities): string[] {
  if (!cap) return [];
  const out: string[] = [];
  out.push(cap.l3Capable ? 'L3 可' : 'L2 のみ');
  if (cap.maxVlansSupported) out.push('VLAN ≤ ' + cap.maxVlansSupported);
  if (cap.maxMacAddresses) out.push('MAC ' + cap.maxMacAddresses.toLocaleString());
  if (cap.stpVariants?.length) out.push('STP: ' + cap.stpVariants.join('/'));
  if (cap.routingProtocols?.length) out.push('RP: ' + cap.routingProtocols.join('/'));
  if (cap.supportsStackwise && cap.stackwiseBandwidthGbps) {
    out.push('Stack ' + cap.stackwiseBandwidthGbps + ' Gbps');
  }
  if (cap.poeTotalWatts) out.push('PoE ' + cap.poeTotalWatts + 'W (' + (cap.poeClass || 'PoE') + ')');
  return out;
}

export function PhaseSelect() {
  const { state, dispatch } = useApp();
  const routerModel = CATALOG.router.filter((x) => x.id === state.routerModelId)[0]!;
  const switchModel = CATALOG.switch.filter((x) => x.id === state.switchModelId)[0]!;
  const switchPortsArr = switchPorts(switchModel);

  const routerSpec = routerModel.ports.length + ' ports — ' + portSummary(routerModel.ports);
  const switchSpec = switchPortsArr.length + ' ports/unit — ' +
    switchModel.down + '×RJ45 + ' + switchModel.up + '×' + switchModel.uplinkType.toUpperCase();

  const routerCaps = routerCapSummary(routerModel.capabilities);
  const switchCaps = switchCapSummary(switchModel.capabilities);

  return (
    <section className="phase">
      <div className="kicker">Phase 01 — Composition</div>
      <h1 className="title">構成の選定</h1>
      <p className="lede">
        <b>SonicWall ルータ</b>と<b>Cisco スイッチ</b>の機種・台数を指定します。
        ポート構成はマスタから自動展開されます。
      </p>
      <div className="grid2">
        <div className="panel">
          <div className="eyebrow">Router — SonicWall</div>
          <label className="fld">
            <span>機種</span>
            <select
              value={state.routerModelId}
              onChange={(e) => dispatch({ type: 'SET_ROUTER_MODEL', id: e.target.value })}
            >
              {CATALOG.router.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div className="spec">{routerSpec}</div>
          {routerCaps.length > 0 && (
            <div className="caps">
              {routerCaps.map((c, i) => <span key={i} className="capchip">{c}</span>)}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="eyebrow">Switch — Cisco</div>
          <label className="fld">
            <span>機種</span>
            <select
              value={state.switchModelId}
              onChange={(e) => dispatch({ type: 'SET_SWITCH_MODEL', id: e.target.value })}
            >
              {CATALOG.switch.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>台数</span>
            <input
              type="number"
              min={1} max={8}
              value={state.switchCount}
              onChange={(e) => dispatch({ type: 'SET_SWITCH_COUNT', n: Number(e.target.value) })}
            />
          </label>
          <div className="spec">{switchSpec}</div>
          {switchCaps.length > 0 && (
            <div className="caps">
              {switchCaps.map((c, i) => <span key={i} className="capchip">{c}</span>)}
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', phase: 'mode' })}>
          ← モード選択
        </button>
        <span className="left">Router ×1 · Switch ×{state.switchCount}</span>
        <button
          className="btn primary"
          onClick={() => dispatch({ type: 'BUILD_TOPOLOGY' })}
        >
          構成図・トポロジーへ →
        </button>
      </div>
    </section>
  );
}
