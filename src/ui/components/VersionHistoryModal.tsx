/**
 * バージョン履歴モーダル。ヘッダーのバージョンバッジから開く。
 * ウィザードの一部ではないため(どのフェーズからでも開ける)、グローバル state
 * (store.tsx の phase)には持ち込まず、Header 内のローカル state で完結させる。
 */

import { useEffect } from 'react';
import { VERSION_HISTORY } from '../versionHistory';

interface Props {
  onClose: () => void;
}

export function VersionHistoryModal({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="version-modal-backdrop" onClick={onClose}>
      <div className="version-modal" onClick={(e) => e.stopPropagation()}>
        <button className="version-modal-close" onClick={onClose} aria-label="閉じる">✕</button>
        <div className="eyebrow">Version History</div>
        <h2 className="version-modal-title">バージョン履歴</h2>
        <div className="version-modal-list">
          {VERSION_HISTORY.map((v) => (
            <div className="version-entry" key={v.version}>
              <div className="version-entry-head">
                <span className="version-badge">v{v.version}</span>
                <span className="version-date">{v.date}</span>
                <span className="version-title">{v.title}</span>
              </div>
              <ul className="version-changes">
                {v.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
