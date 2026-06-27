# Sprint 1.5 設計図 — Vite + React + TypeScript ポート

> Author: Yuki (proposed by Claude)
> Status: **✅ COMPLETED** (2026-06-23、v4.0.0 リリース)
> Target: v3.1.0(現行 vanilla)→ v4.0.0(TS 化)
> 期間: 1 日(設計通りの 5 ステップで完遂、46 テスト全 PASS)
>
> 完了レポート:
> - Step 1 ✓ Vite + React + TS 雛形
> - Step 2 ✓ エンジン TS 化、46 テスト全 PASS
> - Step 3 ✓ UI を 16 コンポーネントに分解
> - Step 4 ✓ 単一 HTML ビルド出力(220KB、外部依存ゼロ)
> - Step 5 ✓ 旧版整理 + ドキュメント更新 + リリースノート

---

## 1. 設計の原則

このポートは **新機能のための作業ではない**。以下の 4 つの原則に厳格に従う:

1. **挙動完全互換** — Sprint 1 で確立した v3.1.0 の機能・UI・検証結果は 100% 維持。テスト 46 ケース全 PASS が完了条件。
2. **配布形態維持** — 成果物は単一 HTML(`vite-plugin-singlefile` で inline)。ユーザのダブルクリック起動・GitHub Pages 配布・「外部送信なし」のプライバシー保証は不変。
3. **型による契約** — 「正確な機材シミュレーション」が最優先である以上、Catalog / Parser AST / Finding / Capability を全て型で縛る。誤った文字列リテラルや shape ミスは**コンパイル時に弾く**。
4. **モジュール境界の固定** — エンジンは DOM-free を厳守。UI から engine への依存は片方向のみ。逆依存(engine から UI / React)は禁止。

---

## 2. 技術スタック(確定)

| レイヤ | 採用 | 理由 |
|---|---|---|
| 言語 | **TypeScript 5.x** (strict) | 型が「正確な機材シミュレーション」の屋台骨 |
| ビルド | **Vite 5.x** | 業界標準、起動高速、設定簡素 |
| UI | **React 18** | ROADMAP の意思、Yuki さんの既存 NetSim Pro スタックと一致 |
| 状態管理 | **React `useReducer` + Context** | ウィザード規模ならこれで十分。Zustand 等は追加しない |
| バンドル | **vite-plugin-singlefile** | 単一 HTML 出力(配布形態維持) |
| テスト | **Vitest** + **@testing-library/react** | 既存 plain-Node テストをほぼコピペで移植可 |
| Lint/Format | 任意(後付け可) | この段階では入れない(土台を簡素に) |

**追加しないもの**: Redux、Zustand、Tailwind、CSS-in-JS、Storybook、ESLint(後付け)、Prettier(後付け)。
ランタイム依存は `react` / `react-dom` のみ。devDependencies に Vite / TS / Vitest 系。

---

## 3. リポジトリ構造

```
facet/
├── src/
│   ├── engine/                    # DOM-free、純粋ロジック
│   │   ├── types.ts               # 全公開型(Port, Device, Finding, Catalog, AST 等)
│   │   ├── catalog.ts             # 15 SKU の CATALOG 定数
│   │   ├── ip.ts                  # ipToInt, intToIp, subnetOf, inSubnet, maskBits 等
│   │   ├── canonIf.ts             # canonIf, expandVlans, expandIfRange
│   │   ├── parsers/
│   │   │   ├── cisco.ts           # parseCisco
│   │   │   └── sonicwall.ts       # parseSonicWall
│   │   ├── mapToPorts.ts
│   │   ├── buildSubnets.ts
│   │   ├── evalFW.ts              # resolveSvc + svcMatch + evalFW + WELL_KNOWN_SVC
│   │   ├── buildMatrix.ts
│   │   ├── pathTrace.ts
│   │   ├── autoLinks.ts
│   │   ├── verify.ts              # フル検証 + 6 カテゴリのルール
│   │   └── index.ts               # public re-export(これだけが UI から見える)
│   ├── ui/
│   │   ├── main.tsx               # ReactDOM root
│   │   ├── App.tsx                # 全体レイアウト + Phase ルーティング
│   │   ├── store.tsx              # AppContext + useReducer
│   │   ├── phases/
│   │   │   ├── PhaseMode.tsx      # Phase 00 — モード選択
│   │   │   ├── PhaseSelect.tsx    # Phase 01 — 構成の選定
│   │   │   ├── PhaseTopology.tsx  # Phase 02 — 構成図と接続トポロジー
│   │   │   ├── PhaseIntake.tsx    # Phase 03 — コンフィグの投入
│   │   │   ├── PhaseAnalyze.tsx   # Phase 04 — 検証中(過渡画面)
│   │   │   ├── PhaseResults.tsx   # Phase 05 — 検証レポート
│   │   │   └── PhaseComplete.tsx  # Phase 06 — 完了
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── Stepper.tsx
│   │   │   ├── ModeCard.tsx
│   │   │   ├── Faceplate.tsx           # 機器フェイスプレート SVG
│   │   │   ├── PortTooltip.tsx
│   │   │   ├── TopologyGraph.tsx       # 論理接続図 SVG
│   │   │   ├── LinkList.tsx
│   │   │   ├── ManualLinkEditor.tsx    # 代替セレクタ
│   │   │   ├── DeviceSlot.tsx          # Phase 03 のスロット
│   │   │   ├── ScoreRing.tsx
│   │   │   ├── SummaryStats.tsx
│   │   │   ├── CategoryChips.tsx
│   │   │   ├── Matrix.tsx
│   │   │   ├── PathTracePanel.tsx
│   │   │   └── FindingsList.tsx
│   │   └── styles/
│   │       └── global.css          # 現行 facet.html の <style> をそのまま移植
│   └── samples/                   # 内蔵デモコンフィグ(現 SMP_SW/C1/C2)
│       ├── acme-edge-01.sonicos.txt
│       ├── acme-sw-01.ios.cfg
│       └── acme-sw-02.ios.cfg
├── test/
│   ├── engine/
│   │   ├── parsers.test.ts        # 現 SMP_* fixture を流用
│   │   ├── evalFW.test.ts         # Sprint 1 の svcMatch ケース含む
│   │   ├── pathTrace.test.ts      # same-subnet ケース含む
│   │   ├── verify.test.ts
│   │   └── matrix.test.ts
│   └── (将来) ui/                  # React Testing Library
├── public/                        # Vite が dist にコピー(現状不要)
├── docs/                          # 既存ドキュメント(更新)
│   ├── ARCHITECTURE.md            # 全面書き直し
│   ├── VERIFICATION-RULES.md      # 維持(ルール変更なし)
│   ├── ROADMAP.md                 # Sprint 2 以降を再構成
│   ├── PARSER-NOTES.md            # TS 化に合わせ追記
│   ├── PUBLISHING.md              # ビルド手順追記
│   └── SPRINT-1.5-DESIGN.md       # 本ファイル
├── app/                           # ★ 旧版は参照用として保持(編集禁止)
│   ├── facet.html                 # 現行 v3.1.0(deprecated マーク追加)
│   └── legacy/                    # v1, v2 そのまま
├── dist/                          # Vite ビルド出力(.gitignore)
│   └── facet.html                 # ★ 配布用の単一 HTML
├── gas/                           # 維持(Apps Script レイヤ)
├── tools/                         # 維持(Word ガイド生成)
├── index.html                     # Vite エントリ(開発用)
├── vite.config.ts                 # vite-plugin-singlefile 設定
├── tsconfig.json                  # strict: true
├── package.json
├── .gitignore                     # node_modules/, dist/, *.tsbuildinfo 追加
├── CLAUDE.md                      # 更新(新構造を反映)
├── README.md                      # 更新
└── LICENSING.md                   # 維持
```

---

## 4. モジュール境界

```
┌─────────────────────────────────────────────────────────┐
│  src/ui/  React コンポーネント、Context、styles          │
│  ↓ 片方向依存                                            │
│  src/engine/index.ts  公開 API(named export のみ)      │
│  ↓                                                       │
│  src/engine/  パーサ・評価・経路・マトリクス・型         │
└─────────────────────────────────────────────────────────┘
```

**禁止事項:**
- `engine/*` から `react`, `react-dom`, `document`, `window` のいずれかを import すること
- `ui/*` から `engine/*` の内部ファイル(`engine/parsers/cisco.ts` 等)に直接アクセスすること(必ず `engine/index.ts` 経由)

`tsconfig.json` の `paths` で `@engine` / `@ui` alias を切る。
ESLint は今回入れないが、将来入れる時に `import/no-restricted-paths` で機械的に強制可能。

---

## 5. 型システムの中心(抜粋)

### 5.1 Catalog(Sprint 2 で本格運用)

```ts
export type PortType = 'rj45' | 'sfp' | 'sfp+';
export type Speed = '100M' | '1GbE' | '2.5GbE' | '5GbE' | '10G';
export type Vendor = 'SonicWall' | 'Cisco';

export interface PortSpec {
  label: string;       // 'X0', 'U1', '1'...
  iface: string;       // 'X0', 'GigabitEthernet1/0/1'...
  type: PortType;
  speed: Speed;
  poe?: boolean;       // Sprint 2 で埋める
}

export interface RouterCatalog {
  id: string;          // 'TZ570'
  name: string;        // 'SonicWall TZ570'
  vendor: 'SonicWall';
  ports: PortSpec[];
  capabilities?: {     // Sprint 2 で埋める
    maxVLAN?: number;
    maxVPN?: number;
    osVersions?: readonly string[];
    supports?: readonly RouterFeature[];
  };
}

export interface SwitchCatalog {
  id: string;
  name: string;
  vendor: 'Cisco';
  down: number;
  up: number;
  prefix: string;
  uplinkType: PortType;
  capabilities?: {     // Sprint 2 で埋める
    l3?: boolean;
    maxVLAN?: number;
    maxMAC?: number;
    maxACL?: number;
    stpVariants?: readonly StpVariant[];
    poe?: boolean;
    osVersions?: readonly string[];
    supports?: readonly SwitchFeature[];
  };
}

export interface Catalog {
  router: readonly RouterCatalog[];
  switch: readonly SwitchCatalog[];
}
```

### 5.2 ランタイム状態

```ts
export type PortStatus = 'ok' | 'err' | 'lack' | 'idle';

export interface RuntimePort {
  spec: PortSpec;
  status: PortStatus;
  cfg: ParsedInterface | null;
  msg: string | null;
}

export interface Device {
  key: 'R1' | `SW${number}`;
  role: 'router' | 'switch';
  model: RouterCatalog | SwitchCatalog;
  unit?: number;
  ports: RuntimePort[];
  config: string | null;
  parsed: CiscoParsed | SonicWallParsed | null;
}
```

### 5.3 Finding

```ts
export type FindingCategory = 'L1' | 'L2' | 'STP' | 'L3' | 'FW' | 'SEC' | 'CAP';
// CAP は Sprint 2 で導入:機材能力(Capability)の不一致
export type FindingLevel = 'err' | 'lack' | 'ok' | 'info';

export interface Finding {
  cat: FindingCategory;
  level: FindingLevel;
  where: string;
  desc: string;
  why?: string;
  fix?: string;
}
```

---

## 6. 状態管理(UI 層)

中央集権 1 つの reducer。React Context で配布。

```ts
interface UIState {
  phase: PhaseId;          // 'mode'|'select'|'topo'|'upload'|'analyze'|'results'|'complete'
  mode: 'verify' | 'build' | null;
  catalog: Catalog;
  router: Device | null;
  switches: Device[];
  topoMode: 'star' | 'cascade' | 'manual';
  topoSel: { key: string; iface: string } | null;
  links: Link[];
  result: VerifyResult | null;
  filter: FindingCategory | 'all';
}

type Action =
  | { type: 'NAV'; phase: PhaseId }
  | { type: 'SET_MODE'; mode: 'verify' | 'build' }
  | { type: 'CONFIGURE'; routerModel: RouterCatalog; switchModel: SwitchCatalog; count: number }
  | { type: 'SET_TOPO_MODE'; mode: 'star' | 'cascade' | 'manual' }
  | { type: 'SET_TOPO_SEL'; sel: { key: string; iface: string } | null }
  | { type: 'ADD_LINK'; link: Link }
  | { type: 'REMOVE_LINK'; index: number }
  | { type: 'SET_LINKS'; links: Link[] }
  | { type: 'INGEST'; key: string; text: string }
  | { type: 'LOAD_SAMPLES' }
  | { type: 'CLEAR_INTAKE' }
  | { type: 'VERIFY' }
  | { type: 'SET_FILTER'; filter: FindingCategory | 'all' }
  | { type: 'RESET' };
```

reducer 内で engine の関数を呼ぶ(`parseCisco`, `parseSonicWall`, `verify`, `mapToPorts`, `autoLinks`)。
副作用(downloadCfg のような Blob 生成)は reducer 外、コンポーネント内で処理。

---

## 7. ビルドと配布

### 7.1 開発時

```
npm install
npm run dev       # Vite 開発サーバ(HMR、http://localhost:5173)
npm test          # Vitest(watch モード)
```

### 7.2 本番ビルド

```
npm run build
# → dist/facet.html  (CSS/JS/Asset 全てインライン化された単一 HTML)
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,  // 全 asset を inline
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

### 7.3 配布

- 開発者: `npm run build` → `dist/facet.html` をコミット or リリース添付
- ユーザ: `facet.html` をダブルクリック / GitHub Pages 上に置く

体験は **現状と完全一致**。

---

## 8. テスト戦略

| 層 | フレームワーク | 対象 |
|---|---|---|
| エンジン単体 | Vitest | パーサ、evalFW、pathTrace、verify、matrix、各ヘルパ |
| エンジン統合 | Vitest | フル検証フロー(現 `test/facet.test.js` 相当)|
| UI スモーク | (将来)RTL | Phase 遷移、ボタンクリックで状態が動くこと |

**初期スコープでは UI テストは入れない**(現状もない)。エンジンテストの 46 ケース PASS を完了条件とする。

```
npm test           # 全テスト 1 回
npm run test:watch # watch
npm run coverage   # カバレッジ(v8)
```

---

## 9. 移行計画(段階別)

各ステップは独立してコミット可能。

### Step 1 — 雛形作成(0.5 日)
- `package.json` 更新(scripts、devDependencies)
- `vite.config.ts`、`tsconfig.json`、`index.html`
- `src/ui/main.tsx` で "Hello FACET" 表示
- `npm run dev`、`npm run build` がそれぞれ動くことを確認

### Step 2 — エンジン移植(0.75 日)
- `src/facet-core.js` を `src/engine/*.ts` に**機械的に分割**
- 関数のロジックは 1 行も変更しない。型注釈の追加のみ
- `src/engine/index.ts` で public API を再エクスポート
- 旧 `test/facet.test.js` を `test/engine/*.test.ts` に分割、import 先を `@engine` に変更
- **`npm test` で 46 ケース PASS を確認** ← Step 2 の完了条件

### Step 3 — UI 移植(1 日)
- 現 `app/facet.html` の `<style>` を `src/ui/styles/global.css` にコピー(無変更)
- 7 Phase を各 `phases/*.tsx` に分解
- 共通要素(Faceplate、TopologyGraph、Tooltip、Matrix 等)を `components/*.tsx` に分解
- `store.tsx` に reducer + Context
- 各ハンドラを engine 関数呼び出しに置換
- ブラウザで全 Phase を通し、v3.1.0 と挙動同等を目視確認

### Step 4 — 配布物確認(0.25 日)
- `npm run build` → `dist/facet.html` を生成
- ダブルクリックで開いて Phase 00〜06 を通す(サンプル投入 → 検証 → 結果出力)
- ファイルサイズ確認(目標: 300〜500 KB 程度)

### Step 5 — 旧版整理(0.25 日)
- `app/facet.html` の冒頭コメントに `DEPRECATED — use dist/facet.html (built from src/)` を明記
- `CLAUDE.md`、`README.md`、`docs/ARCHITECTURE.md` を全面更新
- v4.0.0 リリースノートを HTML コメントヘッダに追加

### Step 6 — タグ付け
- git タグ `v4.0.0`(本移行完了)
- 旧版を必要なら `v3.1.0` タグで保護

---

## 10. 既存 v3.1.0 との互換性保証

| 項目 | 保証方法 |
|---|---|
| 検証結果(findings) | engine 46 テストケース全 PASS |
| UI 動作 | 全 Phase を手動通しテスト |
| サンプルコンフィグの結果 | findings の件数・カテゴリ分布が v3.1.0 と一致することを確認 |
| エクスポート JSON 形式 | スキーマ互換(field 追加は可、既存 field は不変) |
| 配布形態 | 単一 HTML、外部依存なし、ダブルクリック起動 |

---

## 11. ご準備いただきたいもの

実は **ほぼゼロ**です。

### 必須
1. **Node.js LTS をインストール**
   - https://nodejs.org/ から **20.x** または **22.x**(どちらも LTS)を入れてください
   - インストール後、新しいターミナルで `node -v` と `npm -v` がそれぞれ表示されることを確認
   - インストールに当たって特別な設定は不要(全て既定値で OK)

### 任意(あると Sprint 2 以降の精度が桁違いになる)
2. **匿名化済 `show` 出力**(前回お聞きしたもの)
   - 1〜3 機種分でも大歓迎です
   - SonicOS なら `show interface` `show access-rules` `show address-objects` 等
   - Cisco なら `show running-config` `show version` `show vlan brief` `show interfaces status` `show spanning-tree` 等
   - **本ポート(Sprint 1.5)では不要**。Sprint 2(機材カタログ実物化)以降の test fixture に使います

### 不要なもの
- IDE 特定(VS Code でも何でも)
- Git / GitHub アカウント設定
- API キー
- 何らかの登録
- 課金

---

## 12. 承認後の進め方

1. この設計図をご確認 → 承認・修正コメント
2. Yuki さん側で **Node.js LTS インストール** → `node -v` を確認
3. インストール完了の合図をいただいたら、Step 1 から順に着手
4. 各 Step 完了ごとに「次行きます」と報告(中断・修正指示の余地を残す)

不明点・修正したい点をお知らせください。
