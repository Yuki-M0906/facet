/**
 * Cisco スイッチの GUI 構成フォーム(Phase 03 build mode)。
 * device.ports(実カタログのポート列)をそのまま編集対象にする — 存在しないポートは
 * 作れない/選べないので、機種の物理制約を自然に守れる。
 *
 * 入力検証(H-1): validateCiscoDraft の結果をフィールド単位で表示、赤枠+エラー文で警告。
 * 機種上限のリアルタイム警告(H-2): capabilities.maxVlansSupported / maxSviCount を
 * 生成前にその場で警告(生成後の CAP チェック任せにしない)。
 */

import type { CiscoBuilderDraft, Device, StpVariant, SwitchCapabilities } from '@engine/types';
import { validateCiscoDraft } from './validation';

interface Props {
  device: Device;
  draft: CiscoBuilderDraft;
  onChange: (draft: CiscoBuilderDraft) => void;
}

const STP_OPTIONS: { value: StpVariant; label: string }[] = [
  { value: 'rapid-pvst', label: 'rapid-pvst' },
  { value: 'pvst', label: 'pvst' },
  { value: 'mst', label: 'mst' },
];

export function CiscoBuilderForm({ device, draft, onChange }: Props) {
  const caps = (device.model as { capabilities?: SwitchCapabilities }).capabilities;
  const stpOptions = caps?.stpVariants ? STP_OPTIONS.filter((o) => caps.stpVariants!.includes(o.value)) : STP_OPTIONS;

  const errors = validateCiscoDraft(draft);
  function errCls(key: string): string {
    return errors[key] ? 'builder-field-error' : '';
  }

  function update(patch: Partial<CiscoBuilderDraft>) {
    onChange({ ...draft, ...patch });
  }

  function addVlan() {
    update({ vlans: [...draft.vlans, { id: '', name: '' }] });
  }
  function updateVlan(i: number, patch: Partial<CiscoBuilderDraft['vlans'][number]>) {
    const vlans = draft.vlans.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    update({ vlans });
  }
  function removeVlan(i: number) {
    update({ vlans: draft.vlans.filter((_, idx) => idx !== i) });
  }

  function updatePort(i: number, patch: Partial<CiscoBuilderDraft['ports'][number]>) {
    const ports = draft.ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    update({ ports });
  }
  function toggleAllowedVlan(i: number, vlanId: string) {
    const p = draft.ports[i]!;
    const has = p.trunkAllowed.includes(vlanId);
    const trunkAllowed = has ? p.trunkAllowed.filter((v) => v !== vlanId) : [...p.trunkAllowed, vlanId];
    updatePort(i, { trunkAllowed });
  }

  function addSvi() {
    update({ svis: [...draft.svis, { vlan: draft.vlans[0]?.id ?? '', ip: '', mask: '255.255.255.0' }] });
  }
  function updateSvi(i: number, patch: Partial<CiscoBuilderDraft['svis'][number]>) {
    const svis = draft.svis.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    update({ svis });
  }
  function removeSvi(i: number) {
    update({ svis: draft.svis.filter((_, idx) => idx !== i) });
  }

  const vlanOverLimit = caps?.maxVlansSupported && draft.vlans.length > caps.maxVlansSupported;
  const sviOverLimit = caps?.maxSviCount && draft.svis.length > caps.maxSviCount;
  const configuredPortCount = draft.ports.filter((p) => p.mode !== null || p.shutdown).length;

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
          <span className="lbl">STP</span>
          <select value={draft.stpMode ?? ''} onChange={(e) => update({ stpMode: (e.target.value || null) as StpVariant | null })}>
            <option value="">未設定</option>
            {stpOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="inline">
            <input type="checkbox" checked={draft.security.sshOnly} onChange={(e) => update({ security: { ...draft.security, sshOnly: e.target.checked } })} />
            SSH のみ許可
          </label>
          <label className="inline">
            <input type="checkbox" checked={draft.security.enableSecret} onChange={(e) => update({ security: { ...draft.security, enableSecret: e.target.checked } })} />
            enable secret 設定
          </label>
          <label className="inline">
            <input type="checkbox" checked={draft.security.pwEncrypt} onChange={(e) => update({ security: { ...draft.security, pwEncrypt: e.target.checked } })} />
            パスワード暗号化
          </label>
        </div>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">VLAN 一覧</div>
        {draft.vlans.map((v, i) => (
          <div className="builder-row" key={i}>
            <span className="lbl">ID</span>
            <input
              type="text" value={v.id} placeholder="10" className={errCls(`vlan.${i}.id`)}
              onChange={(e) => updateVlan(i, { id: e.target.value })} style={{ maxWidth: 70 }}
            />
            {errors[`vlan.${i}.id`] && <span className="builder-errmsg">{errors[`vlan.${i}.id`]}</span>}
            <span className="lbl">名前</span>
            <input
              type="text" value={v.name} placeholder="STAFF" className={errCls(`vlan.${i}.name`)}
              onChange={(e) => updateVlan(i, { name: e.target.value })}
            />
            {errors[`vlan.${i}.name`] && <span className="builder-errmsg">{errors[`vlan.${i}.name`]}</span>}
            <span className="x" onClick={() => removeVlan(i)}>✕</span>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addVlan}>+ VLAN 追加</button>
        {caps?.maxVlansSupported && (
          <div className={vlanOverLimit ? 'builder-warn' : 'builder-summary-bar'}>
            {vlanOverLimit
              ? <>⚠ VLAN 数 <b>{draft.vlans.length}</b> が {device.model.id} の上限(<b>{caps.maxVlansSupported}</b>)を超えています。生成は可能ですが検証で CAP エラーになります。</>
              : <>VLAN 数 <b>{draft.vlans.length}</b> / 上限 {caps.maxVlansSupported}</>}
          </div>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-section-title">
          ポート設定({draft.ports.length} ポート・{configuredPortCount}/{draft.ports.length} 設定済み)
        </div>
        <div className="builder-legend">
          <span className="bl-access"><i />access</span>
          <span className="bl-trunk"><i />trunk</span>
          <span className="bl-shutdown"><i />shutdown</span>
          <span className="bl-idle"><i />未設定</span>
        </div>
        <div className="builder-scroll">
          {draft.ports.map((p, i) => {
            const rowCls = p.shutdown ? 'cfg-shutdown' : p.mode === 'access' ? 'cfg-access' : p.mode === 'trunk' ? 'cfg-trunk' : 'cfg-idle';
            return (
              <div className={'builder-row builder-portrow ' + rowCls} key={p.iface}>
                <span className="lbl">{p.iface.replace(/GigabitEthernet|TenGigabitEthernet/, '')}</span>
                <select value={p.mode ?? ''} onChange={(e) => updatePort(i, { mode: (e.target.value || null) as 'access' | 'trunk' | null })}>
                  <option value="">未設定</option>
                  <option value="access">access</option>
                  <option value="trunk">trunk</option>
                </select>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.mode === 'access' && (
                    <>
                      <select value={p.accessVlan ?? ''} onChange={(e) => updatePort(i, { accessVlan: e.target.value || null })}>
                        <option value="">VLAN 選択</option>
                        {draft.vlans.map((v) => <option key={v.id} value={v.id}>{v.id} {v.name}</option>)}
                      </select>
                      <label className="inline">
                        <input type="checkbox" checked={p.portfast} onChange={(e) => updatePort(i, { portfast: e.target.checked })} />
                        portfast
                      </label>
                      <label className="inline">
                        <input type="checkbox" checked={p.bpduguard} onChange={(e) => updatePort(i, { bpduguard: e.target.checked })} />
                        bpduguard
                      </label>
                    </>
                  )}
                  {p.mode === 'trunk' && (
                    <>
                      <select value={p.trunkNative ?? ''} onChange={(e) => updatePort(i, { trunkNative: e.target.value || null })}>
                        <option value="">native</option>
                        {draft.vlans.map((v) => <option key={v.id} value={v.id}>native {v.id}</option>)}
                      </select>
                      <div className="builder-vlanchecks">
                        {draft.vlans.map((v) => (
                          <label key={v.id}>
                            <input type="checkbox" checked={p.trunkAllowed.includes(v.id)} onChange={() => toggleAllowedVlan(i, v.id)} />
                            {v.id}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <label className="inline">
                  <input type="checkbox" checked={p.shutdown} onChange={(e) => updatePort(i, { shutdown: e.target.checked })} />
                  shutdown
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">SVI(VLAN 内 IP、任意)</div>
        {draft.svis.map((s, i) => (
          <div className="builder-row" key={i}>
            <span className="lbl">VLAN</span>
            <select value={s.vlan} onChange={(e) => updateSvi(i, { vlan: e.target.value })}>
              {draft.vlans.map((v) => <option key={v.id} value={v.id}>{v.id} {v.name}</option>)}
            </select>
            <span className="lbl">IP</span>
            <input
              type="text" value={s.ip} placeholder="192.168.10.1" className={errCls(`svi.${i}.ip`)}
              onChange={(e) => updateSvi(i, { ip: e.target.value })}
            />
            {errors[`svi.${i}.ip`] && <span className="builder-errmsg">{errors[`svi.${i}.ip`]}</span>}
            <span className="lbl">Mask</span>
            <input
              type="text" value={s.mask} placeholder="255.255.255.0" className={errCls(`svi.${i}.mask`)}
              onChange={(e) => updateSvi(i, { mask: e.target.value })}
            />
            {errors[`svi.${i}.mask`] && <span className="builder-errmsg">{errors[`svi.${i}.mask`]}</span>}
            <span className="x" onClick={() => removeSvi(i)}>✕</span>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addSvi} disabled={!draft.vlans.length}>+ SVI 追加</button>
        {!draft.vlans.length && <p className="note" style={{ marginTop: 8 }}>先に VLAN を追加してください。</p>}
        {caps?.maxSviCount && (
          <div className={sviOverLimit ? 'builder-warn' : 'builder-summary-bar'}>
            {sviOverLimit
              ? <>⚠ SVI 数 <b>{draft.svis.length}</b> が {device.model.id} の上限(<b>{caps.maxSviCount}</b>)を超えています。</>
              : <>SVI 数 <b>{draft.svis.length}</b> / 上限 {caps.maxSviCount}</>}
          </div>
        )}
      </div>
    </div>
  );
}
