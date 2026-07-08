/**
 * バージョン履歴モーダル。ヘッダーのバージョンバッジから開く。
 * ウィザードの一部ではないため(どのフェーズからでも開ける)、グローバル state
 * (store.tsx の phase)には持ち込まず、Header 内のローカル state で完結させる。
 */

import { useEffect, useRef } from 'react';
import { VERSION_HISTORY } from '../versionHistory';

interface Props {
  onClose: () => void;
}

export function VersionHistoryModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="version-modal-backdrop" onClick={onClose}>
      <div
        className="version-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-modal-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeBtnRef} className="version-modal-close" onClick={onClose} aria-label="閉じる">✕</button>
        <div className="eyebrow">Version History</div>
        <h2 className="version-modal-title" id="version-modal-title">バージョン履歴</h2>
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
