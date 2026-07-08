/**
 * 上部固定ヘッダ(ブランド + バージョンチップ)+ Stepper。
 * バージョンチップは versionHistory.ts の CURRENT_VERSION から動的に描画され、
 * クリックするとバージョン履歴モーダルを開く(表示と実データのズレが起きない)。
 */

import { useRef, useState } from 'react';
import { Stepper } from './Stepper';
import { VersionHistoryModal } from './VersionHistoryModal';
import { CURRENT_VERSION } from '../versionHistory';

export function Header() {
  const [showHistory, setShowHistory] = useState(false);
  const verBtnRef = useRef<HTMLButtonElement>(null);

  function closeHistory() {
    setShowHistory(false);
    verBtnRef.current?.focus();
  }

  return (
    <header className="facet-header">
      <div className="wrap bar">
        <div className="brand">
          <span className="mark">FACET</span>
          <span className="sub">Network Verification Atelier</span>
          <button
            ref={verBtnRef}
            className="ver"
            title={`FACET v${CURRENT_VERSION} — クリックでバージョン履歴を表示`}
            onClick={() => setShowHistory(true)}
          >
            v{CURRENT_VERSION}
          </button>
        </div>
        <span className="headmeta">Static Verification · L1–L3 + Firewall Policy + Hardening</span>
      </div>
      <Stepper />
      {showHistory && <VersionHistoryModal onClose={closeHistory} />}
    </header>
  );
}
