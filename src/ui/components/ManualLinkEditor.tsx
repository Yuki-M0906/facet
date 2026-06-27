/**
 * 手動モード時のフォールバック:2 つのドロップダウンからポートを選んでリンク追加する代替 UI。
 * 元: v3.1.0 の #manualEditor。
 */

import { useState } from 'react';
import type { Device, Link } from '@engine/types';

interface Props {
  devices: Device[];
  onAdd: (link: Link) => void;
}

interface Option {
  value: string;
  label: string;
}

function buildOptions(devices: Device[]): Option[] {
  const out: Option[] = [];
  devices.forEach((d) => {
    d.ports.forEach((p) => {
      out.push({ value: d.key + '|' + p.iface, label: d.key + ' · ' + p.label });
    });
  });
  return out;
}

export function ManualLinkEditor({ devices, onAdd }: Props) {
  const options = buildOptions(devices);
  const initial = options[0]?.value ?? '';
  const [a, setA] = useState(initial);
  const [b, setB] = useState(options[1]?.value ?? initial);

  function handleAdd() {
    const [aKey, aIface] = a.split('|');
    const [bKey, bIface] = b.split('|');
    if (!aKey || !aIface || !bKey || !bIface) return;
    if (aKey === bKey && aIface === bIface) return;
    onAdd({ a: { key: aKey, iface: aIface }, b: { key: bKey, iface: bIface } });
  }

  return (
    <div className="editor">
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
        セレクタから追加(代替):
      </span>
      <select value={a} onChange={(e) => setA(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="ar" style={{ color: 'var(--gold)' }}>↔</span>
      <select value={b} onChange={(e) => setB(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button className="btn sm" onClick={handleAdd}>+ リンク追加</button>
    </div>
  );
}
