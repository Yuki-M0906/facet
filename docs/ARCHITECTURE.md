# Architecture (v4.0.0)

## 2 層構成

```
┌─────────────────────────────────────────────┐
│  src/ui/  React コンポーネント + Context     │
│  ↓ 片方向依存                                │
│  src/engine/index.ts  公開 API(named export)│
│  ↓                                           │
│  src/engine/  パーサ・評価・経路・マトリクス │
└─────────────────────────────────────────────┘
```

- **エンジン**(`src/engine/*.ts`)— DOM 非依存の純粋ロジック。Node でも React Native でも
  React Server Components でも実行できる。Vitest が直接呼んでテストする。
- **UI**(`src/ui/**/*.tsx`)— React 18。`engine/index.ts` 経由でのみエンジンを使う。
  状態は `useReducer` + Context(`src/ui/store.tsx`)に中央集権。

**禁止事項:**
- `src/engine/*` から `react` / `document` / `window` を import すること
- `src/ui/*` から `src/engine` の内部ファイル(parsers/cisco.ts 等)を直接 import すること
  → 必ず `@engine/*` (= `src/engine/index.ts`)経由

## データモデル

```ts
// engine が扱う state(検証時に UI が組み立てて渡す)
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
  config:  string | null;     // 投入された生テキスト
  parsed:  CiscoParsed | SonicWallParsed | null;
}
```

`port.status` ∈ `ok | err | lack | idle`。`port.cfg` は `mapToPorts` で
canonical-iface マッチして対応付けられたパース済 IF。

**Port-channel 継承(Sprint 4 S4-1)**: `interface Port-channel<N>` は物理ポート
ラベルに直接一致しないため、`mapToPorts` は `channel-group <N>` を持つ物理
メンバーポートへ、対応する `Port-channel<N>` の switchport/trunk/IP 設定を
(メンバー側が自分自身の値を持たない項目に限り)継承する。実務で多い
「L2 設定は Port-channel 側にのみ書く」パターンを取りこぼさないための拡張。

## 公開 API

`src/engine/index.ts` から re-export される名前付きエクスポート群:

| 名前 | 役割 |
|---|---|
| `CATALOG`, `switchPorts` | 機材カタログ(15 SKU)とポート列生成 |
| `parseCisco(text)` | IOS / IOS-XE running-config → `CiscoParsed` |
| `parseSonicWall(text)` | SonicOS CLI 可読テキスト → `SonicWallParsed` |
| `mapToPorts(device)` | `device.parsed.interfaces` を `device.ports[].cfg` に対応付け |
| `buildSubnets(state)` | L3 サブネット一覧を抽出 |
| `evalFW(rparsed, sZone, dZone, sIp, dIp, svc)` | オブジェクト対応 FW 判定 |
| `WELL_KNOWN_SVC`, `resolveSvc`, `svcMatch`, `objContains` | FW 内部ヘルパ(必要なら直接使用可) |
| `buildMatrix(state, subnets)` | 到達性マトリクス |
| `pathTrace(state, srcCidr, dstSpec, svc)` | SRC→...→DST のホップ列 |
| `verify(state)` | フル検証(`{findings, subnets, matrix, cats, loop, score, nErr, nLack}`) |
| `autoLinks(state)` | star / cascade 自動配線 |
| `generateCiscoConfig(draft)`, `generateSonicWallConfig(draft)` | 作成モード用ジェネレータ(parseCisco/parseSonicWall の逆方向) |
| `isCiscoPortConfigured(port)` | 作成モード UI 用ヘルパ(ポートに設定済み内容があるか) |
| `expandVlans`, `expandIfRange`, `canonIf`, `uniq` | パーサ用ヘルパ |
| `ipToInt` / `intToIp` / `maskBits` / `bitsToMaskInt` / `subnetOf` / `inSubnet` | IPv4 ヘルパ |

型定義は同じく `src/engine/index.ts` から `export type *` で再公開。
TS の `paths` で `@engine` / `@ui` alias を切ってある。

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

`CAP` カテゴリは Sprint 2(機材カタログ実物化)で本格運用開始済み。
`catalog.ts` の各 SKU の `capabilities` フィールド(VLAN/SVI/ACL 数上限、
STP variant 対応可否等)と config を突合し、超過・非対応を検出する。

## CATALOG はデータ、ロジックではない

`src/engine/catalog.ts` の `CATALOG` 定数は 15 SKU の代表ポート構成に加え、
Sprint 2 で追加した `capabilities` フィールド(L3 対応、Max VLAN、PoE、
STP variant、対応 OS バージョン等)を持つ TypeScript リテラル。
CAP カテゴリ(`verify.ts`)がこのデータと config を突合して検証する。

ルータ:TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700。
スイッチ:C1000-24/48 / C2960X-24/48 / C9200-24/48 / C9300-24/48。

## UI 状態管理(`src/ui/store.tsx`)

中央集権 1 つの `reducer` + `Context`。コンポーネントは `useApp()` フック経由で
`state` と `dispatch` を取る。

ウィザード遷移は `phase: PhaseId`(`mode|select|topo|upload|build|analyze|results|
complete|quick|quickResults`)。`PhaseRouter` が現在の phase 名に応じて該当
コンポーネントを描画する。`quick`/`quickResults`(簡易検証モード、v4.19.0)は
機種選定・トポロジー指定を経ないため、通常の 6 段階ステッパー(`PHASE_STEP`)
とは対応せず、Header 側でステッパー自体を非表示にする。

副作用(FileReader、Blob ダウンロード、setTimeout、navigator.clipboard、window.print)
は reducer の外、コンポーネントのイベントハンドラ / `useEffect` で扱う。
reducer は engine の純関数のみを呼ぶ。

## ビルドと配布

```
npm run build
  → tsc -p tsconfig.json   (型チェック、emit なし)
  → vite build              (バンドル + minify + vite-plugin-singlefile で inline 化)
  → dist/index.html         (CSS/JS/Asset すべて inline された単一 HTML、〜220KB)
```

配布物は **完全自己完結の HTML 1 ファイル**:
- 外部 HTTP リクエストゼロ(Google Fonts CDN も撤去済、フォントはシステムフォント)
- localStorage / sessionStorage 不使用
- ダブルクリック起動 / GitHub Pages / Cloudflare Pages / ファイル共有、どれでも動く

## レンダリングと SVG

フェイスプレートと論理接続図は手書き SVG(`src/ui/components/Faceplate.tsx` /
`TopologyGraph.tsx`)。SVG 内 `font-family` は `Meiryo UI, sans-serif`(機器名)と
`Consolas, monospace`(技術ラベル)。

色は次の宝石テーマ(CSS 変数 `--emerald / --garnet / --topaz / --steel / --sapphire`):
- emerald = ok
- garnet = err
- topaz = lack
- steel = idle
- sapphire = info(将来用)

## 経路トレースのロジック

`pathTrace(state, srcCidr, dstSpec, service)`:

1. **送信元検証** — `srcCidr` が `buildSubnets(state)` に存在するか
2. **同一サブネット早期 return** — 送信元と宛先が同じ CIDR なら SRC + DST だけ返す
   (L2 で完結、ルータ・FW は通らない)
3. **L3 経路構築** — SRC → (L2 アクセススイッチ→トランク) → GW (ルータの SVI) →
   RT (接続済ルート or デフォルトルート WAN へ) → FW (`evalFW` 判定) →
   (NAT、WAN 宛のみ) → DST

`evalFW` は service spec の双方向 overlap 判定(`svcMatch`)を経由するので、
ルールが `svc-https` で要求が `ftp` の場合は正しく `deny` を返す
(Sprint 1 で修正済の挙動)。

## テスト

```
test/engine/engine.test.ts    ← エンジン本体(パーサ・verify・matrix・pathTrace 等)
test/engine/builder.test.ts   ← 作成モード(generator の往復保証)
test/version.test.ts          ← バージョン表記の整合性
```

3 ファイル合計 Vitest 156 ケース(2026-07-11 時点。件数は増え続けるため、正確な
最新値は `npm test` の出力を参照)。新ルール追加 / バグ修正のたびにケース追加。
`npm test` が緑のままを維持する。
