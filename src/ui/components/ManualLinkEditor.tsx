/**
 * 手動モード時のフォールバック:2 つのドロップダウンからポートを選んでリンク追加する代替 UI。
 * 元: v3.1.0 の #manualEditor。
 */

import { useState } from 'react';
import type { Device, Link } from '@engine/types';

interface Props {
  devices: Device[];
  links: Link[];
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

/* 全機能監査 Medium-14: 既存の links のどちらかの端に同じポートが
 * 既に使われていないか確認する(1物理ポートは1本のケーブルしか挿さらない)。
 * PhaseTopology.tsx のフェイスプレートクリック経路でも同じ判定が必要なため export する。 */
export function portInUse(links: Link[], key: string, iface: string): boolean {
  return links.some(
    (L) =>
      (L.a.key === key && L.a.iface === iface) ||
      (L.b.key === key && L.b.iface === iface),
  );
}

export function ManualLinkEditor({ devices, links, onAdd }: Props) {
  const options = buildOptions(devices);
  const initial = options[0]?.value ?? '';
  const [a, setA] = useState(initial);
  const [b, setB] = useState(options[1]?.value ?? initial);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const [aKey, aIface] = a.split('|');
    const [bKey, bIface] = b.split('|');
    if (!aKey || !aIface || !bKey || !bIface) return;
    /* 全機能監査 Medium-14: 以前は「両端完全一致」のみを弾いており、同一機器の
     * 異なるポート同士を接続する(物理的にありえない)リンクを作成できた。 */
    if (aKey === bKey) { setError('同一機器のポート同士は接続できません。'); return; }
    if (portInUse(links, aKey, aIface) || portInUse(links, bKey, bIface)) {
      setError('選択したポートのどちらかは既に別のリンクで使用されています。先に既存のリンクを削除してください。');
      return;
    }
    setError(null);
    onAdd({ a: { key: aKey, iface: aIface }, b: { key: bKey, iface: bIface } });
  }

  return (
    <div className="editor">
      <div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
          セレクタから追加(代替):
        </span>
        <select value={a} onChange={(e) => { setA(e.target.value); setError(null); }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="ar" style={{ color: 'var(--gold)' }}>↔</span>
        <select value={b} onChange={(e) => { setB(e.target.value); setError(null); }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="btn sm" onClick={handleAdd}>+ リンク追加</button>
      </div>
      {error && (
        <div className="builder-warn" style={{ marginTop: 8 }}>⚠ {error}</div>
      )}
    </div>
  );
}
