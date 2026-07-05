/**
 * Cisco スイッチの GUI 構成フォーム(Phase 03 build mode)。
 * device.ports(実カタログのポート列)をそのまま編集対象にする — 存在しないポートは
 * 作れない/選べないので、機種の物理制約を自然に守れる。
 *
 * 入力検証(H-1): validateCiscoDraft の結果をフィールド単位で表示、赤枠+エラー文で警告。
 * 機種上限のリアルタイム警告(H-2): capabilities.maxVlansSupported / maxSviCount を
 * 生成前にその場で警告(生成後の CAP チェック任せにしない)。
 */

import type { ChannelGroupMode, CiscoBuilderDraft, Device, StpVariant, SwitchCapabilities } from '@engine/types';
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

/* channel-group の実機で有効な5モードのみ(select で不正値を作れない設計)。 */
const CHANNEL_MODE_OPTIONS: ChannelGroupMode[] = ['active', 'passive', 'on', 'desirable', 'auto'];

/* Cisco の spanning-tree priority は 4096 刻みの16値のみが実機で有効
 * (0, 4096, 8192, ..., 61440)。select で不正値そのものを作れなくする
 * (Sprint 4 S4-4 の root election 推定と対応させるため Sprint 5 で追加)。 */
const STP_PRIORITY_OPTIONS: number[] = Array.from({ length: 16 }, (_, i) => i * 4096);

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
  /** channel-group への所属を切り替える。所属させる場合はポート個別の L2 設定を
   * クリアする(L2 は Port-channel 側が正になるため、矛盾した状態を GUI 上で
   * 作れないようにする。Sprint 5 SF5-6)。 */
  function setPortChannelGroup(i: number, channelGroup: string | null) {
    if (channelGroup) {
      updatePort(i, { channelGroup, mode: null, accessVlan: null, trunkNative: null, trunkAllowed: [], portfast: false, bpduguard: false });
    } else {
      updatePort(i, { channelGroup: null });
    }
  }

  function addAcl() {
    update({ acls: [...draft.acls, { name: '', lines: [] }] });
  }
  function updateAcl(i: number, patch: Partial<CiscoBuilderDraft['acls'][number]>) {
    update({ acls: draft.acls.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });
  }
  function removeAcl(i: number) {
    const removedName = draft.acls[i]?.name;
    update({
      acls: draft.acls.filter((_, idx) => idx !== i),
      /* 削除された ACL を参照しているポートの適用も一緒に外す(存在しない ACL 名が
       * 生成テキストに残るのを防ぐ) */
      ports: draft.ports.map((p) => ({
        ...p,
        aclIn: p.aclIn === removedName ? null : p.aclIn,
        aclOut: p.aclOut === removedName ? null : p.aclOut,
      })),
    });
  }
  function addAclLine(i: number) {
    const acl = draft.acls[i]!;
    updateAcl(i, { lines: [...acl.lines, { action: 'permit', rest: '' }] });
  }
  function updateAclLine(i: number, j: number, patch: Partial<CiscoBuilderDraft['acls'][number]['lines'][number]>) {
    const acl = draft.acls[i]!;
    const lines = acl.lines.map((l, idx) => (idx === j ? { ...l, ...patch } : l));
    updateAcl(i, { lines });
  }
  function removeAclLine(i: number, j: number) {
    const acl = draft.acls[i]!;
    updateAcl(i, { lines: acl.lines.filter((_, idx) => idx !== j) });
  }

  function addSvi() {
    update({ svis: [...draft.svis, { vlan: draft.vlans[0]?.id ?? '', ip: '', mask: '255.255.255.0', standbyGroup: null, standbyIp: null }] });
  }
  function updateSvi(i: number, patch: Partial<CiscoBuilderDraft['svis'][number]>) {
    const svis = draft.svis.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    update({ svis });
  }
  function removeSvi(i: number) {
    update({ svis: draft.svis.filter((_, idx) => idx !== i) });
  }

  function addPortChannel() {
    update({ portChannels: [...draft.portChannels, { id: '', mode: 'active', portMode: null, accessVlan: null, trunkNative: null, trunkAllowed: [] }] });
  }
  function updatePortChannel(i: number, patch: Partial<CiscoBuilderDraft['portChannels'][number]>) {
    update({ portChannels: draft.portChannels.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  }
  function removePortChannel(i: number) {
    const removedId = draft.portChannels[i]?.id;
    update({
      portChannels: draft.portChannels.filter((_, idx) => idx !== i),
      /* 削除された channel-group を参照しているポートのメンバー設定も一緒に外す
       * (存在しない channel-group 番号が生成テキストに残るのを防ぐ、SF5-3 の
       * ACL 削除時のクリーンアップと同じ考え方) */
      ports: draft.ports.map((p) => ({
        ...p,
        channelGroup: p.channelGroup === removedId ? null : p.channelGroup,
      })),
    });
  }
  function togglePortChannelAllowedVlan(i: number, vlanId: string) {
    const c = draft.portChannels[i]!;
    const has = c.trunkAllowed.includes(vlanId);
    const trunkAllowed = has ? c.trunkAllowed.filter((v) => v !== vlanId) : [...c.trunkAllowed, vlanId];
    updatePortChannel(i, { trunkAllowed });
  }

  function addDhcpPool() {
    update({ dhcpPools: [...draft.dhcpPools, { name: '', network: '', mask: '255.255.255.0', gw: '' }] });
  }
  function updateDhcpPool(i: number, patch: Partial<CiscoBuilderDraft['dhcpPools'][number]>) {
    update({ dhcpPools: draft.dhcpPools.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });
  }
  function removeDhcpPool(i: number) {
    update({ dhcpPools: draft.dhcpPools.filter((_, idx) => idx !== i) });
  }

  const vlanAtLimit = !!(caps?.maxVlansSupported && draft.vlans.length >= caps.maxVlansSupported);
  const sviAtLimit = !!(caps?.maxSviCount && draft.svis.length >= caps.maxSviCount);
  const configuredPortCount = draft.ports.filter((p) => p.mode !== null || p.shutdown || p.channelGroup).length;

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
          <span className="lbl">Priority</span>
          <select
            value={draft.stpPriority ?? ''}
            onChange={(e) => update({ stpPriority: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">既定(32768)</option>
            {STP_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
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
        <button className="btn ghost sm builder-add" onClick={addVlan} disabled={vlanAtLimit}>+ VLAN 追加</button>
        {caps?.maxVlansSupported && (
          <div className={vlanAtLimit ? 'builder-warn' : 'builder-summary-bar'}>
            {vlanAtLimit
              ? <>⚠ VLAN 数 <b>{draft.vlans.length}</b> が {device.model.id} の上限(<b>{caps.maxVlansSupported}</b>)に到達しているため、これ以上追加できません。</>
              : <>VLAN 数 <b>{draft.vlans.length}</b> / 上限 {caps.maxVlansSupported}</>}
          </div>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-section-title">ACL 一覧(任意、ポートに適用すると ip access-group で有効化)</div>
        {draft.acls.map((a, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div className="builder-row">
              <span className="lbl">名前</span>
              <input
                type="text" value={a.name} placeholder="WEB-ACL" className={errCls(`acl.${i}.name`)}
                onChange={(e) => updateAcl(i, { name: e.target.value })}
              />
              {errors[`acl.${i}.name`] && <span className="builder-errmsg">{errors[`acl.${i}.name`]}</span>}
              <span className="x" onClick={() => removeAcl(i)}>✕</span>
            </div>
            {a.lines.map((l, j) => (
              <div className="builder-row" key={j} style={{ marginLeft: 24 }}>
                <select value={l.action} onChange={(e) => updateAclLine(i, j, { action: e.target.value })}>
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
                <input
                  type="text" value={l.rest} placeholder="tcp any any eq 80" className={errCls(`acl.${i}.line.${j}.rest`)}
                  onChange={(e) => updateAclLine(i, j, { rest: e.target.value })}
                />
                {errors[`acl.${i}.line.${j}.rest`] && <span className="builder-errmsg">{errors[`acl.${i}.line.${j}.rest`]}</span>}
                <span className="x" onClick={() => removeAclLine(i, j)}>✕</span>
              </div>
            ))}
            <button className="btn ghost sm builder-add" style={{ marginLeft: 24 }} onClick={() => addAclLine(i)}>+ ルール行追加</button>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addAcl}>+ ACL 追加</button>
      </div>

      <div className="builder-section">
        <div className="builder-section-title">
          Port-channel / channel-group(任意、LACP/EtherChannel 束)
        </div>
        <p className="note" style={{ marginBottom: 8 }}>
          複数の物理ポートを1本の論理リンクとして束ねます。switchport 設定はここで
          一括指定し、下のポート設定で各ポートの channel-group を選択してください。
        </p>
        {draft.portChannels.map((c, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div className="builder-row">
              <span className="lbl">channel-group</span>
              <input
                type="text" value={c.id} placeholder="1" className={errCls(`pc.${i}.id`)}
                onChange={(e) => updatePortChannel(i, { id: e.target.value })} style={{ maxWidth: 60 }}
              />
              {errors[`pc.${i}.id`] && <span className="builder-errmsg">{errors[`pc.${i}.id`]}</span>}
              <span className="lbl">mode</span>
              <select value={c.mode} onChange={(e) => updatePortChannel(i, { mode: e.target.value as ChannelGroupMode })}>
                {CHANNEL_MODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={c.portMode ?? ''} onChange={(e) => updatePortChannel(i, { portMode: (e.target.value || null) as 'access' | 'trunk' | null })}>
                <option value="">switchport 未設定</option>
                <option value="access">access</option>
                <option value="trunk">trunk</option>
              </select>
              {c.portMode === 'access' && (
                <select value={c.accessVlan ?? ''} onChange={(e) => updatePortChannel(i, { accessVlan: e.target.value || null })}>
                  <option value="">VLAN 選択</option>
                  {draft.vlans.map((v) => <option key={v.id} value={v.id}>{v.id} {v.name}</option>)}
                </select>
              )}
              {c.portMode === 'trunk' && (
                <>
                  <select value={c.trunkNative ?? ''} onChange={(e) => updatePortChannel(i, { trunkNative: e.target.value || null })}>
                    <option value="">native</option>
                    {draft.vlans.map((v) => <option key={v.id} value={v.id}>native {v.id}</option>)}
                  </select>
                  <div className="builder-vlanchecks">
                    {draft.vlans.map((v) => (
                      <label key={v.id}>
                        <input type="checkbox" checked={c.trunkAllowed.includes(v.id)} onChange={() => togglePortChannelAllowedVlan(i, v.id)} />
                        {v.id}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <span className="x" onClick={() => removePortChannel(i)}>✕</span>
            </div>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addPortChannel}>+ Port-channel 追加</button>
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
            const rowCls = p.channelGroup ? 'cfg-channel' : p.shutdown ? 'cfg-shutdown' : p.mode === 'access' ? 'cfg-access' : p.mode === 'trunk' ? 'cfg-trunk' : 'cfg-idle';
            return (
              <div className={'builder-row builder-portrow ' + rowCls} key={p.iface}>
                <span className="lbl">{p.iface.replace(/GigabitEthernet|TenGigabitEthernet/, '')}</span>
                {p.channelGroup ? (
                  <span className="note">channel-group {p.channelGroup} のメンバー(L2 設定は Port-channel 側)</span>
                ) : (
                  <>
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
                  </>
                )}
                {draft.portChannels.length > 0 && (
                  <>
                    <span className="lbl">channel-group</span>
                    <select value={p.channelGroup ?? ''} onChange={(e) => setPortChannelGroup(i, e.target.value || null)}>
                      <option value="">なし</option>
                      {draft.portChannels.filter((c) => c.id).map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
                    </select>
                  </>
                )}
                {draft.acls.length > 0 && (
                  <>
                    <span className="lbl">ACL in</span>
                    <select value={p.aclIn ?? ''} onChange={(e) => updatePort(i, { aclIn: e.target.value || null })}>
                      <option value="">未適用</option>
                      {draft.acls.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                    <span className="lbl">ACL out</span>
                    <select value={p.aclOut ?? ''} onChange={(e) => updatePort(i, { aclOut: e.target.value || null })}>
                      <option value="">未適用</option>
                      {draft.acls.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                  </>
                )}
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
            <span className="lbl">HSRP group</span>
            <input
              type="text" value={s.standbyGroup ?? ''} placeholder="1" className={errCls(`svi.${i}.standbyGroup`)}
              onChange={(e) => updateSvi(i, { standbyGroup: e.target.value || null })} style={{ maxWidth: 60 }}
            />
            {errors[`svi.${i}.standbyGroup`] && <span className="builder-errmsg">{errors[`svi.${i}.standbyGroup`]}</span>}
            <span className="lbl">HSRP 仮想IP</span>
            <input
              type="text" value={s.standbyIp ?? ''} placeholder="192.168.10.254" className={errCls(`svi.${i}.standbyIp`)}
              onChange={(e) => updateSvi(i, { standbyIp: e.target.value || null })}
            />
            {errors[`svi.${i}.standbyIp`] && <span className="builder-errmsg">{errors[`svi.${i}.standbyIp`]}</span>}
            <span className="x" onClick={() => removeSvi(i)}>✕</span>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addSvi} disabled={!draft.vlans.length || sviAtLimit}>+ SVI 追加</button>
        {!draft.vlans.length && <p className="note" style={{ marginTop: 8 }}>先に VLAN を追加してください。</p>}
        {caps?.maxSviCount && (
          <div className={sviAtLimit ? 'builder-warn' : 'builder-summary-bar'}>
            {sviAtLimit
              ? <>⚠ SVI 数 <b>{draft.svis.length}</b> が {device.model.id} の上限(<b>{caps.maxSviCount}</b>)に到達しているため、これ以上追加できません。</>
              : <>SVI 数 <b>{draft.svis.length}</b> / 上限 {caps.maxSviCount}</>}
          </div>
        )}
      </div>

      <div className="builder-section">
        <div className="builder-section-title">DHCP プール(任意)</div>
        {draft.dhcpPools.map((d, i) => (
          <div className="builder-row" key={i}>
            <span className="lbl">名前</span>
            <input
              type="text" value={d.name} placeholder="STAFF-POOL" className={errCls(`dhcp.${i}.name`)}
              onChange={(e) => updateDhcpPool(i, { name: e.target.value })}
            />
            {errors[`dhcp.${i}.name`] && <span className="builder-errmsg">{errors[`dhcp.${i}.name`]}</span>}
            <span className="lbl">Network</span>
            <input
              type="text" value={d.network} placeholder="192.168.10.0" className={errCls(`dhcp.${i}.network`)}
              onChange={(e) => updateDhcpPool(i, { network: e.target.value })}
            />
            {errors[`dhcp.${i}.network`] && <span className="builder-errmsg">{errors[`dhcp.${i}.network`]}</span>}
            <span className="lbl">Mask</span>
            <input
              type="text" value={d.mask} placeholder="255.255.255.0" className={errCls(`dhcp.${i}.mask`)}
              onChange={(e) => updateDhcpPool(i, { mask: e.target.value })}
            />
            {errors[`dhcp.${i}.mask`] && <span className="builder-errmsg">{errors[`dhcp.${i}.mask`]}</span>}
            <span className="lbl">default-router</span>
            <input
              type="text" value={d.gw} placeholder="192.168.10.1" className={errCls(`dhcp.${i}.gw`)}
              onChange={(e) => updateDhcpPool(i, { gw: e.target.value })}
            />
            {errors[`dhcp.${i}.gw`] && <span className="builder-errmsg">{errors[`dhcp.${i}.gw`]}</span>}
            <span className="x" onClick={() => removeDhcpPool(i)}>✕</span>
          </div>
        ))}
        <button className="btn ghost sm builder-add" onClick={addDhcpPool}>+ DHCP プール追加</button>
      </div>
    </div>
  );
}
