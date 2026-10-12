# Architecture / アーキテクチャ

*English first, 日本語は後半にあります。Applies to v4.0.0 and later.*

## Two layers

```
┌─────────────────────────────────────────────┐
│  src/ui/        React components + Context   │
│  ↓ one-way dependency                        │
│  src/engine/index.ts   public API            │
│  ↓                                           │
│  src/engine/    parsers · verify · trace     │
└─────────────────────────────────────────────┘
```

- **Engine** (`src/engine/*.ts`) — pure logic with no DOM dependency. It runs in Node,
  React Native or React Server Components unchanged; Vitest calls it directly.
- **UI** (`src/ui/**/*.tsx`) — React 18. It uses the engine only through
  `engine/index.ts`. State is centralised in one `useReducer` + Context
  (`src/ui/store.tsx`).

**Forbidden:**
- importing `react`, `document` or `window` from `src/engine/*`;
- importing internal engine files (e.g. `parsers/cisco.ts`) from `src/ui/*` — always go
  through `@engine/*` (= `src/engine/index.ts`).

## Data model

```ts
// the state the engine works on (assembled by the UI at verification time)
interface AppState {
  router:   Device;
  switches: Device[];
  devices:  Device[];     // = [router, ...switches]
  topoMode: 'star' | 'cascade' | 'manual';
  links:    Link[];
}

interface Device {
  key:     string;            // 'R1' | 'SW1' | ...
  role:    'router' | 'switch';
  model:   RouterCatalog | SwitchCatalog;
  name:    string;
  unit?:   number;
  ports:   RuntimePort[];     // { label, iface, type, speed, status, cfg, msg }
  config:  string | null;     // raw text as submitted
  parsed:  CiscoParsed | SonicWallParsed | null;
}
```

`port.status` is one of `ok | err | lack | idle`. `port.cfg` is the parsed interface that
`mapToPorts` matched to the port by canonical interface name.

**Port-channel inheritance (Sprint 4, S4-1).** `interface Port-channel<N>` never matches a
physical port label, so `mapToPorts` copies the switchport / trunk / IP settings of
`Port-channel<N>` onto the physical member ports that carry `channel-group <N>` — only for
items the member does not set itself. Without this the common practice of writing L2
settings on the port-channel only was silently lost.

## Public API

Named exports re-exported from `src/engine/index.ts`:

| Name | Role |
|---|---|
| `CATALOG`, `switchPorts` | equipment catalog (15 SKUs) and port-list generation |
| `parseCisco(text)` | IOS / IOS-XE running-config → `CiscoParsed` |
| `parseSonicWall(text)` | readable SonicOS CLI text → `SonicWallParsed` |
| `mapToPorts(device)` | attach `device.parsed.interfaces` to `device.ports[].cfg` |
| `buildSubnets(state)` | extract the L3 subnet list |
| `evalFW(rparsed, sZone, dZone, sIp, dIp, svc)` | object-aware firewall decision |
| `WELL_KNOWN_SVC`, `resolveSvc`, `svcMatch`, `objContains` | firewall helpers (usable directly) |
| `buildMatrix(state, subnets)` | reachability matrix |
| `pathTrace(state, srcCidr, dstSpec, svc)` | hop list SRC → … → DST |
| `verify(state)` | full verification (`{findings, subnets, matrix, cats, loop, score, nErr, nLack}`) |
| `autoLinks(state)` | automatic star / cascade cabling |
| `generateCiscoConfig(draft)`, `generateSonicWallConfig(draft)` | build-mode generators (the inverse of the parsers) |
| `isCiscoPortConfigured(port)` | build-mode UI helper |
| `expandVlans`, `expandIfRange`, `canonIf`, `uniq` | parser helpers |
| `ipToInt` / `intToIp` / `maskBits` / `bitsToMaskInt` / `subnetOf` / `inSubnet` | IPv4 helpers |

Types are re-exported from the same file with `export type *`. `tsconfig` defines the
`@engine` / `@ui` path aliases.

## Finding shape

```ts
interface Finding {
  cat: 'L1' | 'L2' | 'STP' | 'L3' | 'FW' | 'SEC' | 'CAP';
  level: 'err' | 'lack' | 'ok' | 'info';
  where: string;
  desc: string;
  why?: string;
  fix?: string;
}
```

`CAP` has been live since Sprint 2 (real catalog data). It compares each SKU's
`capabilities` (VLAN / SVI / ACL limits, supported STP variants, …) with the config and
reports exceeded limits and unsupported features.

## The catalog is data, not logic

`CATALOG` in `src/engine/catalog.ts` is a TypeScript literal: the representative port
layout of 15 SKUs plus the `capabilities` added in Sprint 2 (L3 support, max VLANs, PoE,
STP variants, supported OS versions, …). The CAP checks in `verify.ts` read this data.

Routers: TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700.
Switches: C1000-24/48 / C2960X-24/48 / C9200-24/48 / C9300-24/48.

## UI state (`src/ui/store.tsx`)

One reducer, one Context. Components obtain `state` and `dispatch` through `useApp()`.

Wizard position is `phase: PhaseId` (`mode | select | topo | upload | build | analyze |
results | complete | quick | quickResults | exp`). `PhaseRouter` renders the component for
the current phase. `quick` / `quickResults` (quick check, v4.19.0) and `exp` (`.exp`
convert, v4.22.0) skip device selection and topology, so they do not map onto the six-step
stepper (`PHASE_STEP`); the header hides the stepper for them. `exp` never enters the
verification pipeline; its results live in `expResults` (`EXP_ADD_RESULTS` /
`EXP_CLEAR`) and are discarded by `RESET`.

Side effects (FileReader, Blob downloads, `setTimeout`, `navigator.clipboard`,
`window.print`) live outside the reducer, in event handlers and `useEffect`. The reducer
calls only pure engine functions.

## Build and distribution

```
npm run build
  → tsc -p tsconfig.json   (type check, no emit)
  → vite build              (bundle + minify + inline via vite-plugin-singlefile)
  → dist/index.html         (CSS / JS / assets all inlined, ~330 KB)
```

The deliverable is **one self-contained HTML file**:
- zero external HTTP requests (Google Fonts removed; system fonts only);
- no `localStorage` / `sessionStorage`;
- works by double-click, on GitHub Pages, on Cloudflare Pages, or from a file share.

## Rendering and SVG

Faceplates and the logical topology diagram are hand-written SVG
(`src/ui/components/Faceplate.tsx`, `TopologyGraph.tsx`). SVG text uses
`Meiryo UI, sans-serif` for device names and `Consolas, monospace` for technical labels.

Colours follow a gem theme (CSS variables `--emerald / --garnet / --topaz / --steel /
--sapphire`): emerald = ok, garnet = err, topaz = lack, steel = idle, sapphire = info
(reserved).

## Path-trace logic

`pathTrace(state, srcCidr, dstSpec, service)`:

1. **Validate the source** — `srcCidr` must exist in `buildSubnets(state)`.
2. **Same-subnet early return** — if source and destination share a CIDR, return SRC and
   DST only (pure L2; no router, no firewall).
3. **Build the L3 path** — SRC → (L2 access switch → trunk) → GW (router SVI) → RT
   (connected route, or default route to WAN) → FW (`evalFW`) → (NAT, WAN egress only)
   → DST.

`evalFW` goes through the bidirectional service-overlap check (`svcMatch`), so a rule
for `svc-https` correctly returns `deny` for an `ftp` request (fixed in Sprint 1).

## Tests

```
test/engine/engine.test.ts    ← engine (parsers, verify, matrix, pathTrace, …)
test/engine/builder.test.ts   ← build mode (generator round-trip guarantee)
test/engine/exp.test.ts       ← .exp decode / convert / XLSX
test/version.test.ts          ← version consistency
```

The case count keeps growing; `npm test` prints the current number. Every new rule and
every bug fix adds a case. `npm test` must stay green.

---

# 日本語版

*v4.0.0 以降に適用。*

## 2層構成

```
┌─────────────────────────────────────────────┐
│  src/ui/        React コンポーネント＋Context │
│  ↓ 一方向の依存                              │
│  src/engine/index.ts   公開 API              │
│  ↓                                           │
│  src/engine/    パーサ · verify · 経路        │
└─────────────────────────────────────────────┘
```

- **エンジン**（`src/engine/*.ts`）— DOM に依存しない純粋なロジック。Node でも React Native でも React Server Components でも
  そのまま動く。Vitest は直接これを呼んでテストする。
- **UI**（`src/ui/**/*.tsx`）— React 18。エンジンは `engine/index.ts` 経由でのみ使う。状態は1つの `useReducer`＋Context
  （`src/ui/store.tsx`）に集約する。

**禁止事項：**
- `src/engine/*` から `react`、`document`、`window` を import すること
- `src/ui/*` からエンジンの内部ファイル（`parsers/cisco.ts` など）を直接 import すること。必ず `@engine/*`（＝`src/engine/index.ts`）を通す

## データモデル

```ts
// エンジンが扱う状態（検証時に UI が組み立てて渡す）
interface AppState {
  router:   Device;
  switches: Device[];
  devices:  Device[];     // = [router, ...switches]
  topoMode: 'star' | 'cascade' | 'manual';
  links:    Link[];
}

interface Device {
  key:     string;            // 'R1' | 'SW1' | ...
  role:    'router' | 'switch';
  model:   RouterCatalog | SwitchCatalog;
  name:    string;
  unit?:   number;
  ports:   RuntimePort[];     // { label, iface, type, speed, status, cfg, msg }
  config:  string | null;     // 投入された生のテキスト
  parsed:  CiscoParsed | SonicWallParsed | null;
}
```

`port.status` は `ok | err | lack | idle` のいずれか。`port.cfg` は、`mapToPorts` が正規化したインターフェイス名で
そのポートに対応付けたパース済みインターフェイス。

**Port-channel の継承（Sprint 4、S4-1）。** `interface Port-channel<N>` は物理ポートのラベルには一致しないため、
`mapToPorts` は `channel-group <N>` を持つ物理メンバーポートへ、`Port-channel<N>` の switchport／trunk／IP 設定を複写する
（メンバー側が自分で値を持たない項目に限る）。これが無いと、実務でよくある「L2 設定は Port-channel 側にだけ書く」構成が黙って読み捨てられていた。

## 公開 API

`src/engine/index.ts` から再エクスポートされる名前付きエクスポート：

| 名前 | 役割 |
|---|---|
| `CATALOG`、`switchPorts` | 機材カタログ（15 SKU）とポート列の生成 |
| `parseCisco(text)` | IOS／IOS-XE の running-config → `CiscoParsed` |
| `parseSonicWall(text)` | SonicOS CLI の可読テキスト → `SonicWallParsed` |
| `mapToPorts(device)` | `device.parsed.interfaces` を `device.ports[].cfg` に対応付ける |
| `buildSubnets(state)` | L3 サブネット一覧を抽出 |
| `evalFW(rparsed, sZone, dZone, sIp, dIp, svc)` | オブジェクトを解決した FW 判定 |
| `WELL_KNOWN_SVC`、`resolveSvc`、`svcMatch`、`objContains` | FW 内部のヘルパ（直接使ってもよい） |
| `buildMatrix(state, subnets)` | 到達性マトリクス |
| `pathTrace(state, srcCidr, dstSpec, svc)` | SRC → … → DST のホップ列 |
| `verify(state)` | フル検証（`{findings, subnets, matrix, cats, loop, score, nErr, nLack}`） |
| `autoLinks(state)` | star／cascade の自動配線 |
| `generateCiscoConfig(draft)`、`generateSonicWallConfig(draft)` | 作成モード用のジェネレータ（パーサの逆方向） |
| `isCiscoPortConfigured(port)` | 作成モード UI 用のヘルパ |
| `expandVlans`、`expandIfRange`、`canonIf`、`uniq` | パーサ用のヘルパ |
| `ipToInt` / `intToIp` / `maskBits` / `bitsToMaskInt` / `subnetOf` / `inSubnet` | IPv4 のヘルパ |

型も同じファイルから `export type *` で再公開する。`tsconfig` の `paths` で `@engine`／`@ui` の別名を定義している。

## 指摘（Finding）の形

```ts
interface Finding {
  cat: 'L1' | 'L2' | 'STP' | 'L3' | 'FW' | 'SEC' | 'CAP';
  level: 'err' | 'lack' | 'ok' | 'info';
  where: string;
  desc: string;
  why?: string;
  fix?: string;
}
```

`CAP` カテゴリは Sprint 2（機材カタログの実物化）から本格運用している。各 SKU の `capabilities`（VLAN／SVI／ACL 数の上限、
対応する STP 方式など）とコンフィグを突合し、上限超過と非対応機能を検出する。

## カタログはデータであってロジックではない

`src/engine/catalog.ts` の `CATALOG` は TypeScript のリテラルで、15 SKU の代表的なポート構成に加え、Sprint 2 で追加した
`capabilities`（L3 対応、最大 VLAN 数、PoE、STP 方式、対応 OS バージョンなど）を持つ。`verify.ts` の CAP チェックはこのデータを読む。

ルータ：TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700。
スイッチ：C1000-24/48 / C2960X-24/48 / C9200-24/48 / C9300-24/48。

## UI の状態管理（`src/ui/store.tsx`）

reducer は1つ、Context も1つ。コンポーネントは `useApp()` フックから `state` と `dispatch` を受け取る。

ウィザードの位置は `phase: PhaseId`（`mode | select | topo | upload | build | analyze | results | complete | quick | quickResults | exp`）。
`PhaseRouter` が現在の phase に対応するコンポーネントを描画する。`quick`／`quickResults`（簡易検証、v4.19.0）と `exp`
（`.exp` コンバート、v4.22.0）は機種選定とトポロジー指定を通らないので、6段階のステッパー（`PHASE_STEP`）には対応せず、
ヘッダー側でステッパーを非表示にする。`exp` は検証パイプラインを一切通らない変換専用の画面で、結果は `expResults` に保持し
（`EXP_ADD_RESULTS`／`EXP_CLEAR`）、`RESET` で破棄する。

副作用（FileReader、Blob のダウンロード、`setTimeout`、`navigator.clipboard`、`window.print`）は reducer の外、
イベントハンドラと `useEffect` で扱う。reducer が呼ぶのはエンジンの純関数だけ。

## ビルドと配布

```
npm run build
  → tsc -p tsconfig.json   （型チェック。出力はしない）
  → vite build              （バンドル＋minify＋vite-plugin-singlefile でインライン化）
  → dist/index.html         （CSS / JS / アセットをすべて埋め込んだ単一 HTML、約330KB）
```

配布物は**完全に自己完結した HTML 1ファイル**：
- 外部への HTTP リクエストはゼロ（Google Fonts は撤去済み。フォントはシステムフォント）
- `localStorage`／`sessionStorage` は使わない
- ダブルクリック、GitHub Pages、Cloudflare Pages、ファイル共有のどれでも動く

## 描画と SVG

フェイスプレートと論理接続図は手書きの SVG（`src/ui/components/Faceplate.tsx`、`TopologyGraph.tsx`）。SVG 内の文字は、
機器名が `Meiryo UI, sans-serif`、技術的なラベルが `Consolas, monospace`。

色は宝石のテーマ（CSS 変数 `--emerald / --garnet / --topaz / --steel / --sapphire`）：emerald＝ok、garnet＝err、topaz＝lack、
steel＝idle、sapphire＝info（将来用）。

## 経路トレースのロジック

`pathTrace(state, srcCidr, dstSpec, service)`：

1. **送信元の検証** — `srcCidr` が `buildSubnets(state)` に存在すること。
2. **同一サブネットなら早期 return** — 送信元と宛先が同じ CIDR なら SRC と DST だけを返す（L2 で完結し、ルータも FW も通らない）。
3. **L3 経路の構築** — SRC →（L2 アクセススイッチ → トランク）→ GW（ルータの SVI）→ RT（接続経路、または WAN へのデフォルトルート）
   → FW（`evalFW`）→（NAT。WAN 向きのみ）→ DST。

`evalFW` はサービス仕様の双方向オーバーラップ判定（`svcMatch`）を通るので、ルールが `svc-https` で要求が `ftp` の場合は正しく `deny` を返す
（Sprint 1 で修正済み）。

## テスト

```
test/engine/engine.test.ts    ← エンジン本体（パーサ、verify、マトリクス、pathTrace など）
test/engine/builder.test.ts   ← 作成モード（ジェネレータの往復保証）
test/engine/exp.test.ts       ← .exp の復号／変換／XLSX
test/version.test.ts          ← バージョン表記の整合性
```

件数は増え続けるので、現在の数は `npm test` の出力を見ること。ルールの追加やバグ修正のたびにケースを足す。`npm test` は常に緑に保つ。
