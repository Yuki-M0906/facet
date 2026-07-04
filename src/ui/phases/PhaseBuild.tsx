/**
 * Phase 03(build mode)— GUI でゼロからコンフィグを作成する。
 * 機器ごとに Cisco / SonicWall のビルダーフォームを表示し、「生成」ボタンで
 * generateCiscoConfig / generateSonicWallConfig → parseCisco / parseSonicWall
 * を通して device.config / device.parsed を確定させる(往復保証は engine 側で担保)。
 */

import { useEffect } from 'react';
import type { BuilderDraft, CiscoBuilderDraft, Device, SonicWallBuilderDraft } from '@engine/types';
import { useApp } from '../store';
import { CiscoBuilderForm } from '../components/builder/CiscoBuilderForm';
import { SonicWallBuilderForm } from '../components/builder/SonicWallBuilderForm';

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

export function PhaseBuild() {
  const { state, dispatch } = useApp();
  const router = state.router!;
  const devices: Device[] = [router, ...state.switches];

  useEffect(() => {
    dispatch({ type: 'INIT_BUILDER_DRAFTS' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allGenerated = devices.every((d) => !!d.config);

  return (
    <section className="phase">
      <div className="kicker">Phase 03 — Build Configuration</div>
      <h1 className="title">GUI でコンフィグを作成</h1>
      <p className="lede">
        VLAN・ポート設定・ファイアウォールルールなどを GUI で組み立てます。
        「生成」を押すと <b>Cisco IOS / SonicOS 形式のテキストに変換</b>され、そのまま検証パイプラインに乗ります。
        投入モードとの違いはコンフィグの入手経路だけで、以降の検証・出力は完全に共通です。
      </p>

      {devices.map((d) => {
        const draft = state.builderDrafts[d.key];
        if (!draft) return null;
        const roleLabel = d.role === 'router' ? 'ルータ — SonicWall' : 'スイッチ ' + d.unit + ' — Cisco';
        return (
          <div className="panel" key={d.key}>
            <div className="eyebrow">
              {roleLabel} ({d.name})
              {d.config && <span className="builder-generate-status ok">生成済み ✓</span>}
              {!d.config && <span className="builder-generate-status pending">未生成</span>}
            </div>

            {d.role === 'router' ? (
              <SonicWallBuilderForm
                draft={draft as SonicWallBuilderDraft}
                onChange={(next) => dispatch({ type: 'SET_BUILDER_DRAFT', key: d.key, draft: next as BuilderDraft })}
              />
            ) : (
              <CiscoBuilderForm
                device={d}
                draft={draft as CiscoBuilderDraft}
                onChange={(next) => dispatch({ type: 'SET_BUILDER_DRAFT', key: d.key, draft: next as BuilderDraft })}
              />
            )}

            {d.config && (
              <div style={{ marginTop: 14 }}>
                <button className="btn ghost sm" onClick={() => downloadCfg(d)}>⇩ ダウンロード</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="panel">
        <div className="eyebrow">生成</div>
        <p className="note" style={{ marginTop: 0 }}>
          すべての機器の設定が完了したら「すべて生成」を押してください。生成後にコンフィグの再編集・再生成も可能です。
        </p>
        <button className="btn primary" onClick={() => dispatch({ type: 'GENERATE_CONFIGS' })}>
          ◆ すべて生成
        </button>
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={() => dispatch({ type: 'NAV', phase: 'topo' })}>
          ← トポロジーへ
        </button>
        <button
          className="btn primary"
          disabled={!allGenerated}
          onClick={() => dispatch({ type: 'RUN_VERIFY' })}
        >
          検証を実行 →
        </button>
      </div>
    </section>
  );
}
