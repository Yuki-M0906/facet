/**
 * SonicWall ルータの GUI 構成フォーム(Phase 03 build mode)。
 * device.ports(実カタログのポート列)をそのまま編集対象にする。
 *
 * 入力検証(H-1): validateSonicWallDraft の結果をフィールド単位で表示。
 * 機種上限のリアルタイム警告(H-2): capabilities.maxVlanInterfaces を生成前に警告。
 */

import type { RouterCapabilities, SonicWallBuilderDraft } from '@engine/types';
import { validateSonicWallDraft } from './validation';

interface Props {
  draft: SonicWallBuilderDraft;
  onChange: (draft: SonicWallBuilderDraft) => void;
  capabilities?: RouterCapabilities;
  modelId?: string;
}

export function SonicWallBuilderForm({ draft, onChange, capabilities, modelId }: Props) {
  const errors = validateSonicWallDraft(draft);
  function errCls(key: string): string {
    return errors[key] ? 'builder-field-error' : '';
  }

  function update(patch: Partial<SonicWallBuilderDraft>) {
    onChange({ ...draft, ...patch });
  }

  function updateIf(i: number, patch: Partial<SonicWallBuilderDraft['interfaces'][number]>) {
    const interfaces = draft.interfaces.map((x, idx) => (idx === i ? { ...x, ...patch } : x));
    update({ interfaces });
  }
  function addVlanSub(i: number) {
    const iface = draft.interfaces[i]!;
    updateIf(i, { vlanSubs: [...iface.vlanSubs, { vlanTag: '', zone: 'LAN', ip: '', mask: '255.255.255.0', comment: '' }] });
  }
  function updateVlanSub(i: number, j: number, patch: Partial<SonicWallBuilderDraft['interfaces'][number]['vlanSubs'][number]>) {
    const iface = draft.interfaces[i]!;
    const vlanSubs = iface.vlanSubs.map((v, idx) => (idx === j ? { ...v, ...patch } : v));
    updateIf(i, { vlanSubs });
  }
  function removeVlanSub(i: number, j: number) {
    const iface = draft.interfaces[i]!;
    updateIf(i, { vlanSubs: iface.vlanSubs.filter((_, idx) => idx !== j) });
  }

  function addAddrObj() {
    update({ addressObjects: [...draft.addressObjects, { name: '', type: 'network', ip: '', mask: '255.255.255.0', from: '', to: '', zone: 'LAN' }] });
  }
  function updateAddrObj(i: number, patch: Partial<SonicWallBuilderDraft['addressObjects'][number]>) {
    update({ addressObjects: draft.addressObjects.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });
  }
  function removeAddrObj(i: number) {
    update({ addressObjects: draft.addressObjects.filter((_, idx) => idx !== i) });
  }

  function addSvcObj() {
    update({ serviceObjects: [...draft.serviceObjects, { name: '', proto: 'tcp', from: '', to: '' }] });
  }
  function updateSvcObj(i: number, patch: Partial<SonicWallBuilderDraft['serviceObjects'][number]>) {
    update({ serviceObjects: draft.serviceObjects.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }
  function removeSvcObj(i: number) {
    update({ serviceObjects: draft.serviceObjects.filter((_, idx) => idx !== i) });
  }

  function addRule() {
    update({ rules: [...draft.rules, { from: 'LAN', to: 'WAN', action: 'allow', src: 'any', dst: 'any', service: 'any', enabled: true }] });
  }
  function updateRule(i: number, patch: Partial<SonicWallBuilderDraft['rules'][number]>) {
    update({ rules: draft.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }
  function removeRule(i: number) {
    update({ rules: draft.rules.filter((_, idx) => idx !== i) });
  }

  function addNat() {
    update({ natPolicies: [...draft.natPolicies, { orig: '', trans: 'WAN Primary IP', iface: draft.interfaces.find((i) => i.zone === 'WAN')?.iface ?? draft.interfaces[0]?.iface ?? '' }] });
  }
  function updateNat(i: number, patch: Partial<SonicWallBuilderDraft['natPolicies'][number]>) {
    update({ natPolicies: draft.natPolicies.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) });
  }
  function removeNat(i: number) {
    update({ natPolicies: draft.natPolicies.filter((_, idx) => idx !== i) });
  }

  const totalVlanSubs = draft.interfaces.reduce((sum, i) => sum + (i.enabled ? i.vlanSubs.length : 0), 0);
  const vlanSubAtLimit = !!(capabilities?.maxVlanInterfaces && totalVlanSubs >= capabilities.maxVlanInterfaces);

  return (
    <div>
      <div className="builder-section">
        <div className="builder-section-title">基本設定</div>
        <div className="builder-row">
          <span className="lbl">hostname</span>
          <input
            type="text" value={draft.hostname} className={errCls('hostname')}
            onChange={(e) => update({ hostname: e.target.value })}
          />
          {errors['hostname'] && <span className="builder-errmsg">{errors['hostname']}</span>}
        </div>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">
          インターフェース({draft.interfaces.length} ポート・{draft.interfaces.filter((i) => i.enabled).length} 有効)
        </div>
        <div className="builder-legend">
          <span className="bl-access"><i />有効</span>
          <span className="bl-idle"><i />無効</span>
        </div>
        <div className="builder-scroll">
          {draft.interfaces.map((iface, i) => (
            <div key={iface.iface}>
              <div className={'builder-row ' + (iface.enabled ? 'cfg-access' : 'cfg-idle')}>
                <label className="inline">
                  <input type="checkbox" checked={iface.enabled} onChange={(e) => updateIf(i, { enabled: e.target.checked })} />
                  <span className="lbl">{iface.iface}</span>
                </label>
                {iface.enabled && (
                  <>
                    <span className="lbl">Zone</span>
                    <input type="text" value={iface.zone} placeholder="LAN / WAN / DMZ" onChange={(e) => updateIf(i, { zone: e.target.value })} style={{ maxWidth: 90 }} />
                    <span className="lbl">IP</span>
                    <input
                      type="text" value={iface.ip} placeholder="192.168.1.1" className={errCls(`iface.${i}.ip`)}
                      onChange={(e) => updateIf(i, { ip: e.target.value })}
                    />
                    {errors[`iface.${i}.ip`] && <span className="builder-errmsg">{errors[`iface.${i}.ip`]}</span>}
                    <span className="lbl">Mask</span>
                    <input
                      type="text" value={iface.mask} placeholder="255.255.255.0" className={errCls(`iface.${i}.mask`)}
                      onChange={(e) => updateIf(i, { mask: e.target.value })}
                    />
                    {errors[`iface.${i}.mask`] && <span className="builder-errmsg">{errors[`iface.${i}.mask`]}</span>}
                    <button className="btn ghost sm" onClick={() => addVlanSub(i)} disabled={vlanSubAtLimit}>+ VLAN サブIF</button>
                  </>
                )}
              </div>
              {iface.enabled && iface.vlanSubs.map((v, j) => (
                <div className="builder-row" key={j} style={{ marginLeft: 24 }}>
                  <span className="lbl">{iface.iface}:V</span>
                  <input
                    type="text" value={v.vlanTag} placeholder="10" className={errCls(`iface.${i}.vlanSub.${j}.tag`)}
                    onChange={(e) => updateVlanSub(i, j, { vlanTag: e.target.value })} style={{ maxWidth: 60 }}
                  />
                  {errors[`iface.${i}.vlanSub.${j}.tag`] && <span className="builder-errmsg">{errors[`iface.${i}.vlanSub.${j}.tag`]}</span>}
                  <span className="lbl">Zone</span>
                  <input type="text" value={v.zone} onChange={(e) => updateVlanSub(i, j, { zone: e.target.value })} style={{ maxWidth: 90 }} />
                  <span className="lbl">IP</span>
                  <input
                    type="text" value={v.ip} placeholder="192.168.10.1" className={errCls(`iface.${i}.vlanSub.${j}.ip`)}
                    onChange={(e) => updateVlanSub(i, j, { ip: e.target.value })}
                  />
                  {errors[`iface.${i}.vlanSub.${j}.ip`] && <span className="builder-errmsg">{errors[`iface.${i}.vlanSub.${j}.ip`]}</span>}
                  <span className="lbl">Mask</span>
                  <input
                    type="text" value={v.mask} className={errCls(`iface.${i}.vlanSub.${j}.mask`)}
                    onChange={(e) => updateVlanSub(i, j, { mask: e.target.value })}
                  />
                  {errors[`iface.${i}.vlanSub.${j}.mask`] && <span className="builder-errmsg">{errors[`iface.${i}.vlanSub.${j}.mask`]}</span>}
                  <button type="button" className="x" onClick={() => removeVlanSub(i, j)} aria-label="VLANサブインターフェイスを削除">✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        {capabilities?.maxVlanInterfaces && (
          <div className={vlanSubAtLimit ? 'builder-warn' : 'builder-summary-bar'}>
            {vlanSubAtLimit
              ? <>⚠ VLAN サブインターフェイス数 <b>{totalVlanSubs}</b> が {modelId} の上限(<b>{capabilities.maxVlanInterfaces}</b>)に到達しているため、これ以上追加できません。</>
              : <>VLAN サブインターフェイス数 <b>{totalVlanSubs}</b> / 上限 {capabilities.maxVlanInterfaces}</>}
          </div>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-section-title">アドレスオブジェクト</div>
        {draft.addressObjects.map((a, i) => (
          <div className="builder-row" key={i}>
            <input
              type="text" value={a.name} placeholder="net-staff" className={errCls(`addr.${i}.name`)}
              onChange={(e) => updateAddrObj(i, { name: e.target.value })}
            />
            {errors[`addr.${i}.name`] && <span className="builder-errmsg">{errors[`addr.${i}.name`]}</span>}
            <select value={a.type} onChange={(e) => updateAddrObj(i, { type: e.target.value as 'host' | 'network' | 'range' })}>
              <option value="host">host</option>
              <option value="network">network</option>
              <option value="range">range</option>
            </select>
            {a.type === 'range' ? (
              <>
                <span className="lbl">From</span>
                <input
                  type="text" value={a.from} placeholder="192.168.10.100" className={errCls(`addr.${i}.from`)}
                  onChange={(e) => updateAddrObj(i, { from: e.target.value })}
                />
                {errors[`addr.${i}.from`] && <span className="builder-errmsg">{errors[`addr.${i}.from`]}</span>}
                <span className="lbl">To</span>
                <input
                  type="text" value={a.to} placeholder="192.168.10.150" className={errCls(`addr.${i}.to`)}
                  onChange={(e) => updateAddrObj(i, { to: e.target.value })}
                />
                {errors[`addr.${i}.to`] && <span className="builder-errmsg">{errors[`addr.${i}.to`]}</span>}
              </>
            ) : (
              <>
                <span className="lbl">IP</span>
                <input
                  type="text" value={a.ip} placeholder="192.168.10.0" className={errCls(`addr.${i}.ip`)}
                  onChange={(e) => updateAddrObj(i, { ip: e.target.value })}
                />
                {errors[`addr.${i}.ip`] && <span className="builder-errmsg">{errors[`addr.${i}.ip`]}</span>}
                {a.type === 'network' && (
                  <>
                    <input
                      type="text" value={a.mask} placeholder="255.255.255.0" className={errCls(`addr.${i}.mask`)}
                      onChange={(e) => updateAddrObj(i, { mask: e.target.value })}
                    />
                    {errors[`addr.${i}.mask`] && <span className="builder-errmsg">{errors[`addr.${i}.mask`]}</span>}
                  </>
                )}
                <span className="lbl">Zone</span>
                <input type="text" value={a.zone} placeholder="LAN" onChange={(e) => updateAddrObj(i, { zone: e.target.value })} style={{ maxWidth: 90 }} />
              </>
            )}
            <button type="button" className="x" onClick={() => removeAddrObj(i)} aria-label="アドレスオブジェクトを削除">✕</button>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addAddrObj}>+ アドレスオブジェクト追加</button>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">サービスオブジェクト</div>
        {draft.serviceObjects.map((s, i) => (
          <div className="builder-row" key={i}>
            <input
              type="text" value={s.name} placeholder="svc-https" className={errCls(`svc.${i}.name`)}
              onChange={(e) => updateSvcObj(i, { name: e.target.value })}
            />
            {errors[`svc.${i}.name`] && <span className="builder-errmsg">{errors[`svc.${i}.name`]}</span>}
            <select value={s.proto} onChange={(e) => updateSvcObj(i, { proto: e.target.value })}>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="icmp">icmp</option>
            </select>
            <span className="lbl">Port</span>
            <input
              type="text" value={s.from} placeholder="443" className={errCls(`svc.${i}.from`)}
              onChange={(e) => updateSvcObj(i, { from: e.target.value, to: e.target.value })} style={{ maxWidth: 70 }}
            />
            {errors[`svc.${i}.from`] && <span className="builder-errmsg">{errors[`svc.${i}.from`]}</span>}
            <button type="button" className="x" onClick={() => removeSvcObj(i)} aria-label="サービスオブジェクトを削除">✕</button>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addSvcObj}>+ サービスオブジェクト追加</button>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">アクセスルール</div>
        {draft.rules.map((r, i) => (
          <div className="builder-row" key={i}>
            <span className="lbl">from</span>
            <input
              type="text" value={r.from} placeholder="LAN" className={errCls(`rule.${i}.from`)}
              onChange={(e) => updateRule(i, { from: e.target.value })} style={{ maxWidth: 80 }}
            />
            <span className="lbl">to</span>
            <input
              type="text" value={r.to} placeholder="WAN" className={errCls(`rule.${i}.to`)}
              onChange={(e) => updateRule(i, { to: e.target.value })} style={{ maxWidth: 80 }}
            />
            <select value={r.action} onChange={(e) => updateRule(i, { action: e.target.value as 'allow' | 'deny' })}>
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </select>
            <span className="lbl">src</span>
            <input type="text" value={r.src} placeholder="any" onChange={(e) => updateRule(i, { src: e.target.value })} style={{ maxWidth: 90 }} />
            <span className="lbl">dst</span>
            <input type="text" value={r.dst} placeholder="any" onChange={(e) => updateRule(i, { dst: e.target.value })} style={{ maxWidth: 90 }} />
            <span className="lbl">svc</span>
            <input type="text" value={r.service} placeholder="any" onChange={(e) => updateRule(i, { service: e.target.value })} style={{ maxWidth: 90 }} />
            <label className="inline">
              <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(i, { enabled: e.target.checked })} />
              有効
            </label>
            <button type="button" className="x" onClick={() => removeRule(i)} aria-label="アクセスルールを削除">✕</button>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addRule}>+ ルール追加</button>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">NAT ポリシー</div>
        {draft.natPolicies.map((n, i) => (
          <div className="builder-row" key={i}>
            <span className="lbl">送元</span>
            <input
              type="text" value={n.orig} placeholder="net-staff / any" className={errCls(`nat.${i}.orig`)}
              onChange={(e) => updateNat(i, { orig: e.target.value })}
            />
            <span className="lbl">変換先</span>
            <input
              type="text" value={n.trans} placeholder="WAN Primary IP" className={errCls(`nat.${i}.trans`)}
              onChange={(e) => updateNat(i, { trans: e.target.value })}
            />
            <span className="lbl">出力IF</span>
            <select value={n.iface} onChange={(e) => updateNat(i, { iface: e.target.value })}>
              {draft.interfaces.map((iface) => <option key={iface.iface} value={iface.iface}>{iface.iface}</option>)}
            </select>
            <button type="button" className="x" onClick={() => removeNat(i)} aria-label="NATポリシーを削除">✕</button>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addNat}>+ NAT ポリシー追加</button>
      </div>
    </div>
  );
}
