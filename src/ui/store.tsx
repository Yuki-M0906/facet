/**
 * FACET UI 状態管理 — React Context + useReducer。
 * v3.1.0 では `var S = {...}` のグローバルだった状態をここに集約。
 *
 * 副作用(FileReader、Blob ダウンロード、setTimeout、navigator.clipboard 等)は
 * reducer の外、コンポーネント側のイベントハンドラ / useEffect で扱う。
 * reducer 内では engine の純関数(parseCisco/parseSonicWall/mapToPorts/autoLinks/verify)を呼ぶ。
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  CATALOG,
  autoLinks,
  generateCiscoConfig,
  generateSonicWallConfig,
  mapToPorts,
  parseCisco,
  parseSonicWall,
  switchPorts,
  verify,
} from '@engine/index';
import type {
  AppState,
  BuilderDraft,
  CiscoBuilderDraft,
  Device,
  FindingCategory,
  Link,
  Mode,
  RouterCatalog,
  SonicWallBuilderDraft,
  SwitchCatalog,
  TopoMode,
  VerifyResult,
} from '@engine/types';
import { SMP_C1, SMP_C2, SMP_SW } from '../samples';

export type PhaseId =
  | 'mode' | 'select' | 'topo' | 'upload' | 'build' | 'analyze' | 'results' | 'complete'
  | 'quick' | 'quickResults';

export const PHASE_STEP: Record<PhaseId, number> = {
  mode: 0,
  select: 1,
  topo: 2,
  upload: 3,
  build: 3,
  analyze: 4,
  results: 4,
  complete: 5,
  /* 簡易検証モードは6フェーズのステッパーと構造が対応しないため、
   * Header 側で mode==='quick' のときステッパー自体を非表示にする。
   * この2値は Record<PhaseId, number> を満たすためのダミー値。 */
  quick: 0,
  quickResults: 0,
};

export const STEPS: ReadonlyArray<{ label: string; en: string }> = [
  { label: 'モード', en: 'MODE' },
  { label: '構成', en: 'SELECT' },
  { label: 'トポロジー', en: 'TOPOLOGY' },
  { label: '投入', en: 'INTAKE' },
  { label: '検証', en: 'VERIFY' },
  { label: '完了', en: 'DONE' },
];

export interface UIState {
  phase: PhaseId;
  mode: Mode | null;
  /* Phase 01 — 機種選定中の SKU id と台数 */
  routerModelId: string;
  switchModelId: string;
  switchCount: number;
  /* Phase 02 以降 — 機器インスタンスとトポロジ(BUILD_TOPOLOGY 後に有効) */
  router: Device | null;
  switches: Device[];
  topoMode: TopoMode;
  links: Link[];
  topoSel: { key: string; iface: string } | null;
  /* Phase 03(build mode)— 機器キーごとの編集中 draft */
  builderDrafts: Record<string, BuilderDraft>;
  /* Phase 05 — 検証結果 */
  result: VerifyResult | null;
  filter: FindingCategory | 'all';
  /* 簡易検証モード — 単体機器のみを対象にした静的チェック(トポロジー/機種選定を
   * 経ずに直接ファイルを投入する)。verify-mode/build-mode の router/switches とは
   * 独立した state を持ち、モードを跨いでも互いに干渉しない。 */
  quickRole: 'router' | 'switch';
  quickModelId: string;
  quickDevice: Device | null;
  quickResult: VerifyResult | null;
}

export type Action =
  | { type: 'NAV'; phase: PhaseId }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_ROUTER_MODEL'; id: string }
  | { type: 'SET_SWITCH_MODEL'; id: string }
  | { type: 'SET_SWITCH_COUNT'; n: number }
  | { type: 'BUILD_TOPOLOGY' }
  | { type: 'SET_TOPO_MODE'; mode: TopoMode }
  | { type: 'SET_TOPO_SEL'; sel: { key: string; iface: string } | null }
  | { type: 'TOPO_PORT_CLICK'; key: string; iface: string }
  | { type: 'ADD_LINK'; link: Link }
  | { type: 'REMOVE_LINK'; index: number }
  | { type: 'INGEST'; key: string; text: string }
  | { type: 'LOAD_SAMPLES' }
  | { type: 'CLEAR_INTAKE' }
  | { type: 'INIT_BUILDER_DRAFTS' }
  | { type: 'SET_BUILDER_DRAFT'; key: string; draft: BuilderDraft }
  | { type: 'RESET_DEVICE_DRAFT'; key: string; draft: BuilderDraft }
  | { type: 'GENERATE_CONFIGS' }
  | { type: 'RUN_VERIFY' }
  | { type: 'SET_FILTER'; filter: FindingCategory | 'all' }
  | { type: 'SET_QUICK_ROLE'; role: 'router' | 'switch' }
  | { type: 'SET_QUICK_MODEL'; id: string }
  | { type: 'QUICK_VERIFY'; text: string }
  | { type: 'QUICK_RESET' }
  | { type: 'RESET' };

/* ---- Device 生成 ---- */

function makeDevice(key: string, role: 'router' | 'switch', model: RouterCatalog | SwitchCatalog): Device {
  const basePorts =
    role === 'router'
      ? (model as RouterCatalog).ports.map((p) => ({ ...p }))
      : switchPorts(model as SwitchCatalog);
  const ports = basePorts.map((p) => ({
    label: p.label, iface: p.iface, type: p.type, speed: p.speed,
    ...(p.poe ? { poe: p.poe } : {}),
    status: 'idle' as const, cfg: null, msg: null,
  }));
  return {
    key,
    role,
    model,
    name: model.name,
    unit: role === 'switch' ? Number(key.replace('SW', '')) : 0,
    ports,
    config: null,
    parsed: null,
  };
}

/* ---- Builder draft 初期化ヘルパ ---- */

/** device の実ポート一覧から、未設定状態の CiscoBuilderDraft を組み立てる */
export function initCiscoDraft(d: Device): CiscoBuilderDraft {
  return {
    hostname: d.key,
    stpMode: 'rapid-pvst',
    stpPriority: null,
    vlans: [],
    ports: d.ports.map((p) => ({
      iface: p.iface, mode: null, accessVlan: null,
      trunkNative: null, trunkAllowed: [], portfast: false, bpduguard: false, shutdown: false,
      aclIn: null, aclOut: null, channelGroup: null,
    })),
    svis: [],
    acls: [],
    dhcpPools: [],
    portChannels: [],
    security: { sshOnly: true, enableSecret: true, pwEncrypt: true },
  };
}

/** device の実ポート一覧から、未設定状態の SonicWallBuilderDraft を組み立てる */
export function initSonicWallDraft(d: Device): SonicWallBuilderDraft {
  return {
    hostname: d.key,
    interfaces: d.ports.map((p) => ({
      iface: p.iface, enabled: false, zone: 'LAN', ip: '', mask: '255.255.255.0', comment: '', vlanSubs: [],
    })),
    addressObjects: [],
    serviceObjects: [],
    rules: [],
    natPolicies: [],
  };
}

/* AppState を UIState から組み立てる(engine 関数に渡す形) */
export function asEngineState(s: UIState): AppState | null {
  if (!s.router) return null;
  return {
    router: s.router,
    switches: s.switches,
    devices: [s.router, ...s.switches],
    topoMode: s.topoMode,
    links: s.links,
  };
}

/* ---- 初期状態 ---- */

const initial: UIState = {
  phase: 'mode',
  mode: null,
  routerModelId: CATALOG.router[0]!.id,
  switchModelId: CATALOG.switch[0]!.id,
  switchCount: 2,
  router: null,
  switches: [],
  topoMode: 'star',
  links: [],
  topoSel: null,
  builderDrafts: {},
  result: null,
  filter: 'all',
  quickRole: 'router',
  quickModelId: CATALOG.router[0]!.id,
  quickDevice: null,
  quickResult: null,
};

/* ---- 副作用ヘルパ(reducer 内で呼ぶ純粋なもののみ) ---- */

/* 全機能監査 Medium-14: 1物理ポートは1本のケーブルしか挿さらないため、
 * 既存リンクのどちらかの端に同じポートが既に使われていないか確認する。 */
function portInUse(links: Link[], key: string, iface: string): boolean {
  return links.some(
    (L) =>
      (L.a.key === key && L.a.iface === iface) ||
      (L.b.key === key && L.b.iface === iface),
  );
}

function ingest(d: Device, text: string): void {
  d.config = text;
  d.parsed = d.role === 'router' ? parseSonicWall(text) : parseCisco(text);
  mapToPorts(d);
}

/**
 * 簡易検証モード用: 単体機器だけを持つ最小限の AppState を組み立てる。
 * verify() はリンク間チェック(L1/L2の両端不一致・STPループ・到達性)を
 * `state.links` が空なら自然にスキップするため、専用の検証ロジックを別途持たず
 * 既存の verify() をそのまま呼べる(単一の正 = engine 側のルールと常に一致する)。
 * スイッチのみをアップロードした場合でも AppState.router は必須のため、
 * parsed:null の無害なプレースホルダを立てる(router.parsed を参照する全チェックは
 * 既存コードが軒並み `if (router.parsed)` で守られているため、これだけで
 * ルータ関連チェックが静かにスキップされる)。
 */
function buildQuickAppState(device: Device): AppState {
  if (device.role === 'router') {
    return { router: device, switches: [], devices: [device], topoMode: 'star', links: [] };
  }
  const placeholder: Device = {
    key: '__NONE__', role: 'router', model: CATALOG.router[0]!, name: '(未指定)',
    unit: 0, ports: [], config: null, parsed: null,
  };
  return { router: placeholder, switches: [device], devices: [placeholder, device], topoMode: 'star', links: [] };
}

function clearDevice(d: Device): void {
  d.config = null;
  d.parsed = null;
  d.ports.forEach((p) => { p.cfg = null; p.status = 'idle'; p.msg = null; });
}

/* ---- reducer ---- */

function reducer(s: UIState, a: Action): UIState {
  switch (a.type) {
    case 'NAV':
      return { ...s, phase: a.phase };

    case 'SET_MODE':
      return { ...s, mode: a.mode };

    case 'SET_ROUTER_MODEL':
      return { ...s, routerModelId: a.id };
    case 'SET_SWITCH_MODEL':
      return { ...s, switchModelId: a.id };
    case 'SET_SWITCH_COUNT': {
      const n = Math.max(1, Math.min(8, a.n | 0));
      return { ...s, switchCount: n };
    }

    case 'BUILD_TOPOLOGY': {
      const rm = CATALOG.router.filter((x) => x.id === s.routerModelId)[0]!;
      const sm = CATALOG.switch.filter((x) => x.id === s.switchModelId)[0]!;
      const router = makeDevice('R1', 'router', rm);
      const switches: Device[] = [];
      for (let i = 1; i <= s.switchCount; i++) switches.push(makeDevice('SW' + i, 'switch', sm));
      const engineState: AppState = { router, switches, devices: [router, ...switches], topoMode: 'star', links: [] };
      const links = autoLinks(engineState);
      return {
        ...s,
        router, switches,
        topoMode: 'star',
        links,
        topoSel: null,
        phase: 'topo',
        result: null,
        /* 機種/台数が変わると実ポート数も変わるため、古い builderDrafts を持ち越すと
           不整合(存在しないポートを参照する draft)を起こす。トポロジー再生成のたびに
           クリアし、Phase 03 の INIT_BUILDER_DRAFTS で新しい device.ports から作り直す。 */
        builderDrafts: {},
      };
    }

    case 'SET_TOPO_MODE': {
      if (!s.router) return s;
      const next: UIState = { ...s, topoMode: a.mode, topoSel: null };
      if (a.mode === 'manual') return next;  // manual: 既存の links を維持
      // star / cascade は自動再生成
      const eng: AppState = { router: s.router, switches: s.switches, devices: [s.router, ...s.switches], topoMode: a.mode, links: [] };
      return { ...next, links: autoLinks(eng) };
    }

    case 'SET_TOPO_SEL':
      return { ...s, topoSel: a.sel };

    case 'TOPO_PORT_CLICK': {
      const cur = s.topoSel;
      // 未選択 → 選択
      if (!cur) return { ...s, topoSel: { key: a.key, iface: a.iface } };
      // 同一ポート再クリック → 取消
      if (cur.key === a.key && cur.iface === a.iface) return { ...s, topoSel: null };
      // 同一機器の別ポート → 選択切替
      if (cur.key === a.key) return { ...s, topoSel: { key: a.key, iface: a.iface } };
      // 別機器のポート → リンク作成(重複・ポート使い回しは無視)
      const exists = s.links.some(
        (L) =>
          (L.a.key === cur.key && L.a.iface === cur.iface && L.b.key === a.key && L.b.iface === a.iface) ||
          (L.b.key === cur.key && L.b.iface === cur.iface && L.a.key === a.key && L.a.iface === a.iface),
      );
      /* 全機能監査 Medium-14: 1物理ポートは1本のケーブルしか挿さらないため、
       * どちらかの端が既存リンクで使用済みなら新規作成を弾く。 */
      const reused = portInUse(s.links, cur.key, cur.iface) || portInUse(s.links, a.key, a.iface);
      const links = (exists || reused) ? s.links : [...s.links, { a: cur, b: { key: a.key, iface: a.iface } }];
      return { ...s, links, topoSel: null };
    }

    case 'ADD_LINK': {
      const exists = s.links.some(
        (L) =>
          (L.a.key === a.link.a.key && L.a.iface === a.link.a.iface && L.b.key === a.link.b.key && L.b.iface === a.link.b.iface) ||
          (L.b.key === a.link.a.key && L.b.iface === a.link.a.iface && L.a.key === a.link.b.key && L.a.iface === a.link.b.iface),
      );
      const sameDevice = a.link.a.key === a.link.b.key;
      const reused = portInUse(s.links, a.link.a.key, a.link.a.iface) || portInUse(s.links, a.link.b.key, a.link.b.iface);
      if (exists || sameDevice || reused) return s;
      return { ...s, links: [...s.links, a.link] };
    }
    case 'REMOVE_LINK':
      return { ...s, links: s.links.filter((_, i) => i !== a.index) };

    case 'INGEST': {
      if (!s.router) return s;
      const all: Device[] = [s.router, ...s.switches];
      const d = all.filter((x) => x.key === a.key)[0];
      if (!d) return s;
      ingest(d, a.text);
      // device の中身を mutate しただけだと React は気づかないので新 state を返す
      return { ...s };
    }
    case 'LOAD_SAMPLES': {
      if (!s.router) return s;
      ingest(s.router, SMP_SW);
      s.switches.forEach((sw, i) => ingest(sw, i === 0 ? SMP_C1 : SMP_C2));
      return { ...s };
    }
    case 'CLEAR_INTAKE': {
      if (!s.router) return s;
      [s.router, ...s.switches].forEach(clearDevice);
      return { ...s, result: null, filter: 'all' };
    }

    case 'INIT_BUILDER_DRAFTS': {
      if (!s.router) return s;
      const drafts: Record<string, BuilderDraft> = { ...s.builderDrafts };
      if (!drafts[s.router.key]) drafts[s.router.key] = initSonicWallDraft(s.router);
      s.switches.forEach((sw) => {
        if (!drafts[sw.key]) drafts[sw.key] = initCiscoDraft(sw);
      });
      return { ...s, builderDrafts: drafts };
    }

    case 'SET_BUILDER_DRAFT': {
      return { ...s, builderDrafts: { ...s.builderDrafts, [a.key]: a.draft } };
    }

    case 'RESET_DEVICE_DRAFT': {
      /* High-8 監査対応: 従来の「⟲ この機器をリセット」は SET_BUILDER_DRAFT のみを
       * dispatch し、device.config/parsed/ports は残留していた。「生成済み ✓」表示や
       * RUN_VERIFY は d.config を直接見るため、リセット後も古い設定に基づく検証・
       * ダウンロードがサイレントに続いてしまっていた。builderDrafts の初期化と同時に
       * 対象 device の生成済みコンフィグも clearDevice() で消す。 */
      const dev = [s.router, ...s.switches].filter((d): d is Device => !!d).find((d) => d.key === a.key);
      if (dev) clearDevice(dev);
      return { ...s, builderDrafts: { ...s.builderDrafts, [a.key]: a.draft } };
    }

    case 'GENERATE_CONFIGS': {
      if (!s.router) return s;
      const all: Device[] = [s.router, ...s.switches];
      all.forEach((d) => {
        const draft = s.builderDrafts[d.key];
        if (!draft) return;
        const text = d.role === 'router'
          ? generateSonicWallConfig(draft as SonicWallBuilderDraft)
          : generateCiscoConfig(draft as CiscoBuilderDraft);
        ingest(d, text);
      });
      return { ...s };
    }

    case 'RUN_VERIFY': {
      const eng = asEngineState(s);
      if (!eng) return s;
      const result = verify(eng);
      return { ...s, result, phase: 'analyze' };
    }

    case 'SET_FILTER':
      return { ...s, filter: a.filter };

    case 'SET_QUICK_ROLE': {
      const models = a.role === 'router' ? CATALOG.router : CATALOG.switch;
      return {
        ...s, quickRole: a.role, quickModelId: models[0]!.id,
        quickDevice: null, quickResult: null,
      };
    }
    case 'SET_QUICK_MODEL':
      return { ...s, quickModelId: a.id };

    case 'QUICK_VERIFY': {
      const model = s.quickRole === 'router'
        ? CATALOG.router.filter((x) => x.id === s.quickModelId)[0]!
        : CATALOG.switch.filter((x) => x.id === s.quickModelId)[0]!;
      const device = makeDevice(s.quickRole === 'router' ? 'R1' : 'SW1', s.quickRole, model);
      ingest(device, a.text);
      const result = verify(buildQuickAppState(device));
      return { ...s, quickDevice: device, quickResult: result, phase: 'quickResults' };
    }
    case 'QUICK_RESET':
      /* 機種・種別の選択はそのまま残し、投入済みデータだけクリアする
       * (同じ種別の別ファイルをもう一度チェックしたいケースが多いため)。 */
      return { ...s, quickDevice: null, quickResult: null, phase: 'quick' };

    case 'RESET':
      return { ...initial };
  }
}

/* ---- Context / Provider / Hook ---- */

interface Ctx {
  state: UIState;
  dispatch: React.Dispatch<Action>;
}
const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside <AppProvider>');
  return c;
}
