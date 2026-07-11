/**
 * Phase 03(build mode)— GUI でゼロからコンフィグを作成する。
 * 機器ごとに Cisco / SonicWall のビルダーフォームを表示し、「生成」ボタンで
 * generateCiscoConfig / generateSonicWallConfig → parseCisco / parseSonicWall
 * を通して device.config / device.parsed を確定させる(往復保証は engine 側で担保)。
 *
 * 入力検証(H-1)は各フォームコンポーネント内でインライン表示するが、
 * 「生成できるか」の可否判定はここ(親)で validateCiscoDraft/validateSonicWallDraft を
 * 直接呼んで集約する(子の render 中に親の state を更新するアンチパターンを避けるため)。
 */

import { useEffect } from 'react';
import type {
  BuilderDraft, CiscoBuilderDraft, Device, RouterCapabilities, SonicWallBuilderDraft,
} from '@engine/types';
import { useApp, initCiscoDraft, initSonicWallDraft } from '../store';
import { CiscoBuilderForm } from '../components/builder/CiscoBuilderForm';
import { SonicWallBuilderForm } from '../components/builder/SonicWallBuilderForm';
import { validateCiscoDraft, validateSonicWallDraft } from '../components/builder/validation';

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

function draftErrorCount(d: Device, draft: BuilderDraft): number {
  const errors = d.role === 'router'
    ? validateSonicWallDraft(draft as SonicWallBuilderDraft)
    : validateCiscoDraft(draft as CiscoBuilderDraft);
  return Object.keys(errors).length;
}

/** パネルの eyebrow に添える一行サマリ("VLAN 2 · ポート 3/28 設定済み" 等) */
function draftSummary(d: Device, draft: BuilderDraft): string {
  if (d.role === 'router') {
    const sw = draft as SonicWallBuilderDraft;
    const enabled = sw.interfaces.filter((i) => i.enabled).length;
    return `IF ${enabled}/${sw.interfaces.length} 有効 · アドレスOBJ ${sw.addressObjects.length} · ルール ${sw.rules.length}`;
  }
  const cs = draft as CiscoBuilderDraft;
  const configured = cs.ports.filter((p) => p.mode !== null || p.shutdown).length;
  return `VLAN ${cs.vlans.length} · ポート ${configured}/${cs.ports.length} 設定済み`;
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
  const anyInvalid = devices.some((d) => {
    const draft = state.builderDrafts[d.key];
    return draft ? draftErrorCount(d, draft) > 0 : false;
  });

  return (
    <section className="phase">
      <div className="kicker">Phase 03 — Build Configuration</div>
      <h1 className="title">GUI でコンフィグを作成</h1>
      <p className="lede">
        VLAN・ポート設定・ファイアウォールルールなどを、画面のフォームに入力します。
        入力が終わったら「生成」を押してください。
        すると<b>Cisco IOS / SonicOS 形式の実際のコンフィグテキスト</b>が作られます。
        あとは、コンフィグをアップロードした場合とまったく同じ流れで検証されます。
      </p>

      {devices.map((d) => {
        const draft = state.builderDrafts[d.key];
        if (!draft) return null;
        const roleLabel = d.role === 'router' ? 'ルータ — SonicWall' : 'スイッチ ' + d.unit + ' — Cisco';
        const errCount = draftErrorCount(d, draft);
        return (
          <div className="panel" key={d.key}>
            <div className="eyebrow">
              {roleLabel} ({d.name})
              {errCount > 0 && <span className="builder-generate-status error">入力エラー {errCount} 件</span>}
              {errCount === 0 && d.config && <span className="builder-generate-status ok">生成済み ✓</span>}
              {errCount === 0 && !d.config && <span className="builder-generate-status pending">未生成</span>}
              <span className="builder-progress">{draftSummary(d, draft)}</span>
              <button
                className="btn ghost sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  if (!window.confirm('この機器の入力内容と生成済みコンフィグをすべてリセットします。よろしいですか?')) return;
                  const fresh = d.role === 'router' ? initSonicWallDraft(d) : initCiscoDraft(d);
                  dispatch({ type: 'RESET_DEVICE_DRAFT', key: d.key, draft: fresh });
                }}
              >
                ⟲ この機器をリセット
              </button>
            </div>

            {d.role === 'router' ? (
              <SonicWallBuilderForm
                draft={draft as SonicWallBuilderDraft}
                capabilities={(d.model as { capabilities?: RouterCapabilities }).capabilities}
                modelId={d.model.id}
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
        {anyInvalid && (
          <div className="builder-warn" style={{ marginBottom: 12 }}>
            ⚠ 入力エラーがある機器があります。上記のエラー箇所を修正してから生成してください。
          </div>
        )}
        <button className="btn primary" disabled={anyInvalid} onClick={() => dispatch({ type: 'GENERATE_CONFIGS' })}>
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
