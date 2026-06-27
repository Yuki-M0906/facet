/**
 * 上部固定ヘッダ(ブランド + バージョンチップ)+ Stepper。
 */

import { Stepper } from './Stepper';

export function Header() {
  return (
    <header className="facet-header">
      <div className="wrap bar">
        <div className="brand">
          <span className="mark">FACET</span>
          <span className="sub">Network Verification Atelier</span>
          <span className="ver" title="FACET v4.0.0 — Yuki">v4.0.0</span>
        </div>
        <span className="headmeta">Static Verification · L1–L3 + Firewall Policy + Hardening</span>
      </div>
      <Stepper />
    </header>
  );
}
