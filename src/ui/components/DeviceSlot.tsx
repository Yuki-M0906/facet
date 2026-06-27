/**
 * Phase 03 のスロット。各機器に対応する 1 行のカード。
 * 元: v3.1.0 の buildSlots + refreshSlots + parseSummary + downloadCfg。
 */

import { useRef } from 'react';
import type { CiscoParsed, Device, SonicWallParsed } from '@engine/types';

export type SlotStatus = 'locked' | 'ready' | 'loaded';

interface Props {
  device: Device;
  status: SlotStatus;
  onFile: (text: string) => void;
}

function parseSummary(d: Device): string {
  if (!d.parsed) return 'パース失敗';
  if (d.role === 'router') {
    const p = d.parsed as SonicWallParsed;
    return [
      Object.keys(p.interfaces).length + ' IF',
      (p.rules || []).length + ' rules',
      (p.nat || []).length + ' NAT',
      Object.keys(p.addr || {}).length + ' addr-obj',
      Object.keys(p.svc || {}).length + ' svc-obj',
    ].join(' · ');
  }
  const p = d.parsed as CiscoParsed;
  return [
    Object.keys(p.interfaces).length + ' IF',
    Object.keys(p.vlans || {}).length + ' VLAN',
    'STP=' + (p.stpMode || '未設定'),
  ].join(' · ');
}

function downloadCfg(d: Device): void {
  if (!d.config) return;
  const hostname = (d.parsed && (d.parsed as { hostname: string | null }).hostname) || d.key;
  const safe = String(hostname).replace(/[^\w.\-]+/g, '_');
  const ext = d.role === 'router' ? 'sonicos.txt' : 'ios.cfg';
  const blob = new Blob([d.config], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '.' + ext;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function DeviceSlot({ device, status, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const role = device.role === 'router' ? 'ルータ' : 'スイッチ ' + device.unit;
  const icon = device.role === 'router' ? '⬡' : '⬢';
  const isLoaded = status === 'loaded';
  const subText = isLoaded ? '投入完了 ✓ — ' + parseSummary(device)
    : status === 'ready' ? 'アップロード可能'
    : '前の機器の投入をお待ちください';

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onFile(String(r.result || ''));
    r.readAsText(f);
    e.target.value = '';
  }

  return (
    <div className={'slot ' + status}>
      <div className="ic">{icon}</div>
      <div className="info">
        <div className="n">{role} — {device.name}</div>
        <div className={'s' + (isLoaded ? ' ok' : '')}>
          {isLoaded ? <span className="ok">{subText}</span> : subText}
        </div>
      </div>
      {isLoaded && (
        <button className="btn ghost sm dl-cfg" onClick={() => downloadCfg(device)}>
          ⇩ ダウンロード
        </button>
      )}
      <label className="btn ghost">
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.cfg,.conf,.log,.exp"
          onChange={handleChange}
        />
        ファイル選択
      </label>
    </div>
  );
}
