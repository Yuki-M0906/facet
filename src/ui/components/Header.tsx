/**
 * 上部固定ヘッダ(ブランド + バージョンチップ)+ Stepper。
 * バージョンチップは versionHistory.ts の CURRENT_VERSION から動的に描画され、
 * クリックするとバージョン履歴モーダルを開く(表示と実データのズレが起きない)。
 */

import { useRef, useState } from 'react';
import { Stepper } from './Stepper';
import { VersionHistoryModal } from './VersionHistoryModal';
import { CURRENT_VERSION } from '../versionHistory';
import { useApp } from '../store';

export function Header() {
  const { dispatch } = useApp();
  const [showHistory, setShowHistory] = useState(false);
  const verBtnRef = useRef<HTMLButtonElement>(null);

  function closeHistory() {
    setShowHistory(false);
    verBtnRef.current?.focus();
  }

  function goHome() {
    if (!window.confirm('ホームに戻ります。選択した機種・トポロジー・投入したコンフィグ・検証結果は' +
      'すべて破棄されます。よろしいですか?')) return;
    dispatch({ type: 'RESET' });
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
        <div className="headright">
          <span className="headmeta">Static Verification · L1–L3 + Firewall Policy + Hardening + Capability</span>
          <button
            className="home-btn"
            onClick={goHome}
            title="ホームに戻る(すべて破棄されます)"
          >
            ⌂ ホームに戻る
          </button>
        </div>
      </div>
      <Stepper />
      {showHistory && <VersionHistoryModal onClose={closeHistory} />}
    </header>
  );
}
