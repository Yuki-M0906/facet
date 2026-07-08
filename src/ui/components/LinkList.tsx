/**
 * リンク一覧。manual モードのときのみ × アイコンで削除可。
 * 元: v3.1.0 の renderLinks。
 */

import type { Device, Link } from '@engine/types';

interface Props {
  links: Link[];
  devices: Device[];
  canDelete: boolean;
  onRemove: (index: number) => void;
}

function ifaceLabel(end: { key: string; iface: string }, devices: Device[]): string {
  const d = devices.filter((x) => x.key === end.key)[0];
  const p = d?.ports.filter((x) => x.iface === end.iface)[0];
  return p ? p.label : end.iface;
}

export function LinkList({ links, devices, canDelete, onRemove }: Props) {
  if (!links.length) {
    return (
      <div id="linkList" style={{ marginTop: 14 }}>
        <div className="linkrow">リンクなし</div>
      </div>
    );
  }
  return (
    <div id="linkList" style={{ marginTop: 14 }}>
      {links.map((L, i) => (
        <div key={i} className="linkrow">
          <b>{L.a.key}</b> {ifaceLabel(L.a, devices)}{' '}
          <span className="ar">↔</span>{' '}
          {ifaceLabel(L.b, devices)} <b>{L.b.key}</b>
          {canDelete && (
            <button type="button" className="x" onClick={() => onRemove(i)} aria-label="リンクを削除">✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
