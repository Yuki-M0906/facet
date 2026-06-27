/**
 * メイン検証エンジン。6 カテゴリ(L1/L2/STP/L3/FW/SEC)+ 必要に応じて CAP の findings を生成。
 * 元: src/facet-core.js (legacy) の verify。
 * ロジックは無変更(Sprint 1 のバグ修正済 svcMatch/evalFW を経由)。
 */

import { buildMatrix } from './buildMatrix';
import { buildSubnets } from './buildSubnets';
import { uniq } from './canonIf';
import type {
  AccessRule,
  AppState,
  CategoryCount,
  Device,
  Finding,
  FindingCategory,
  FindingLevel,
  Link,
  ParsedInterface,
  ReachabilityMatrix,
  RuntimePort,
  SonicWallParsed,
  Subnet,
  VerifyResult,
} from './types';

export function verify(state: AppState): VerifyResult {
  const F: Finding[] = [];
  const devs: Device[] = state.devices;
  const router: Device = state.router;

  /* port.status を idle にリセット */
  devs.forEach((d) => d.ports.forEach((p) => { p.status = 'idle'; p.msg = null; }));

  function setPort(dev: Device | undefined, iface: string, level: FindingLevel, msg?: string): void {
    if (!dev) return;
    const p: RuntimePort | undefined = dev.ports.filter((x) => x.iface === iface)[0];
    if (p && (level === 'err' || (level === 'lack' && p.status !== 'err'))) {
      p.status = level;
      p.msg = msg ?? null;
    }
  }
  function add(cat: FindingCategory, level: FindingLevel, where: string, desc: string, why: string, fix: string): void {
    F.push({ cat, level, where, desc, why, fix });
  }

  /* ---- L2 個別 IF ---- */
  devs.forEach((d) => {
    if (d.role !== 'switch') return;
    const vlans: Record<string, string> = d.parsed ? (d.parsed as { vlans: Record<string, string> }).vlans : {};
    d.ports.forEach((p) => {
      const c: ParsedInterface | null = p.cfg;
      if (!c) return;
      if (c.shutdown) {
        add('L2', 'lack', d.key + ':' + p.iface,
          p.iface + ' が shutdown です。',
          'リンク予定ポートが無効だと疎通しません。',
          'no shutdown を投入。');
        setPort(d, p.iface, 'lack');
      }
      if (c.mode === 'access' && c.accessVlan && !vlans[c.accessVlan]) {
        add('L2', 'lack', d.key + ':' + p.iface,
          'Access VLAN ' + c.accessVlan + ' が未定義。',
          'VLAN DB に無いVLANは通信に使えません。',
          'vlan ' + c.accessVlan + ' を定義。');
        setPort(d, p.iface, 'lack');
      }
      if (c.mode === 'trunk' && (!c.trunkAllowed || !c.trunkAllowed.length)) {
        add('L2', 'lack', d.key + ':' + p.iface,
          'トランクの allowed vlan 未指定(全許可扱い)。',
          '明示しないと意図しないVLANが透過します。',
          'allowed vlan を明示。');
        setPort(d, p.iface, 'lack');
      }
      if (!c.mode && (c.accessVlan || (c.trunkAllowed && c.trunkAllowed.length))) {
        add('L2', 'lack', d.key + ':' + p.iface,
          'switchport mode 未指定。',
          'モード未定義は機種既定動作依存で不安定。',
          'access / trunk を明示。');
        setPort(d, p.iface, 'lack');
      }
    });
  });

  /* ---- リンク(L1 / L2) ---- */
  const links: Link[] = state.links || [];
  function port(key: string, iface: string): RuntimePort | null {
    const d = devs.filter((x) => x.key === key)[0];
    return d ? (d.ports.filter((p) => p.iface === iface)[0] || null) : null;
  }
  function cfgOf(key: string, iface: string): ParsedInterface | null {
    const p = port(key, iface);
    return p ? p.cfg : null;
  }

  links.forEach((L) => {
    const ca = cfgOf(L.a.key, L.a.iface);
    const cb = cfgOf(L.b.key, L.b.iface);
    const da = devs.filter((x) => x.key === L.a.key)[0];
    const db = devs.filter((x) => x.key === L.b.key)[0];
    const tag = L.a.key + ':' + L.a.iface + ' ↔ ' + L.b.key + ':' + L.b.iface;
    if (!ca || !cb) {
      const miss = !ca ? L.a : L.b;
      add('L2', 'lack', tag,
        'リンク端 ' + miss.key + ':' + miss.iface + ' に構成がありません。',
        '指定した配線に対応するインターフェース設定が無い。',
        '該当ポートをトランクとして構成。');
      setPort(da, L.a.iface, 'lack');
      setPort(db, L.b.iface, 'lack');
      return;
    }
    const ma = ca.mode || (ca.subVlans ? 'trunk' : null);
    const mb = cb.mode;
    if (ma && mb && ((ma === 'trunk') !== (mb === 'trunk'))) {
      add('L2', 'err', tag,
        '両端モード不一致(' + ma + ' ↔ ' + mb + ')。',
        '片側access/片側trunkはVLANタグ処理が食い違い疎通不可。',
        '両端を trunk に統一。');
      setPort(da, L.a.iface, 'err');
      setPort(db, L.b.iface, 'err');
    }
    const na = ca.trunkNative || '1';
    const nb = cb.trunkNative || '1';
    if ((ca.mode === 'trunk' || ca.subVlans) && cb.mode === 'trunk' && na !== nb) {
      add('L2', 'err', tag,
        'Native VLAN 不一致(' + na + ' ↔ ' + nb + ')。',
        'ネイティブVLAN不一致はタグ無しフレームが別VLANへ漏れる典型ミス。',
        '両端の native vlan を一致させる。');
      setPort(da, L.a.iface, 'err');
      setPort(db, L.b.iface, 'err');
    }
    const aa = ca.trunkAllowed || [];
    const bb = cb.trunkAllowed || [];
    if (aa.length && bb.length) {
      const inter = bb.filter((v) => aa.indexOf(v) >= 0);
      if (!inter.length) {
        add('L2', 'err', tag,
          '許可VLANに共通項なし([' + aa + '] ↔ [' + bb + '])。',
          '共通VLANが無いとどのVLANも通過できません。',
          '共通VLANを双方の allowed に含める。');
        setPort(da, L.a.iface, 'err');
        setPort(db, L.b.iface, 'err');
      } else {
        const onlyB = bb.filter((v) => aa.indexOf(v) < 0);
        if (onlyB.length) {
          add('L2', 'lack', tag,
            'VLAN ' + onlyB.join(',') + ' がルータ側で未許可。',
            'スイッチ側のVLANがルータに無いとL3ゲートウェイが存在しない。',
            'SonicWall に VLAN ' + onlyB.join(',') + ' のサブIFを追加。');
          setPort(da, L.a.iface, 'lack');
          setPort(db, L.b.iface, 'lack');
        }
      }
    }
    /* L1 */
    if (ca.speed && cb.speed && ca.speed !== 'auto' && cb.speed !== 'auto' && ca.speed !== cb.speed) {
      add('L1', 'err', tag,
        '速度不一致(' + ca.speed + ' ↔ ' + cb.speed + ')。',
        '固定速度の不一致はリンクダウンの原因。',
        '速度を一致 or 両端 auto。');
      setPort(da, L.a.iface, 'err');
      setPort(db, L.b.iface, 'err');
    }
    if (ca.duplex && cb.duplex && ca.duplex !== cb.duplex) {
      add('L1', 'err', tag,
        'Duplex 不一致(' + ca.duplex + ' ↔ ' + cb.duplex + ')。',
        'デュプレックス不一致は遅延・パケロスの典型原因。',
        '両端を full に統一。');
      setPort(da, L.a.iface, 'err');
      setPort(db, L.b.iface, 'err');
    }
    if (ca.mtu && cb.mtu && ca.mtu !== cb.mtu) {
      add('L1', 'lack', tag,
        'MTU 不一致(' + ca.mtu + ' ↔ ' + cb.mtu + ')。',
        'MTU差は大きいフレームの破棄を招く。',
        'MTUを一致させる。');
    }
    if (ca.channel && cb.channel) {
      const x = ca.channel.mode;
      const y = cb.channel.mode;
      const bad =
        (x === 'active' && y === 'on') ||
        (x === 'on' && y === 'active') ||
        (x === 'passive' && y === 'passive') ||
        (x === 'passive' && y === 'on') ||
        (x === 'on' && y === 'passive');
      if (bad) {
        add('L1', 'err', tag,
          'EtherChannel モード非互換(' + x + ' ↔ ' + y + ')。',
          'LACPネゴシエーションが成立しない組合せ。',
          'active/active・active/passive・on/on のいずれかに。');
        setPort(da, L.a.iface, 'err');
        setPort(db, L.b.iface, 'err');
      }
    }
  });

  /* ---- STP ---- */
  const parent: Record<string, string> = {};
  devs.forEach((d) => { parent[d.key] = d.key; });
  function find(x: string): string {
    return parent[x] === x ? x : (parent[x] = find(parent[x]!));
  }
  let loop = false;
  // クロージャ内代入の TS 5 narrowing 回避のため as 経由で宣言時に広い型を確定させる
  let loopEdge = null as Link | null;
  links.forEach((L) => {
    const ra = find(L.a.key);
    const rb = find(L.b.key);
    if (ra === rb) { loop = true; loopEdge = L; }
    else parent[ra] = rb;
  });
  if (loop) {
    const noStp = devs.filter((d) => d.role === 'switch' && d.parsed && !(d.parsed as { stpMode?: string }).stpMode);
    const edge = loopEdge as Link | null;
    add('STP', noStp.length ? 'err' : 'lack',
      edge ? edge.a.key + ' ↔ ' + edge.b.key : 'topology',
      'L2ループが存在します' + (noStp.length ? '(STP未設定のスイッチあり)' : '(STPで1ポートがブロック)') + '。',
      '冗長配線はループを生み、STP無しではブロードキャストストームに直結。',
      noStp.length
        ? noStp.map((s) => s.key).join(',') + ' に spanning-tree mode rapid-pvst 等を設定。'
        : 'STPが片側ポートをブロックします。意図的な冗長か確認を。',
    );
  }
  devs.forEach((d) => {
    if (d.role === 'switch' && d.parsed) {
      d.ports.forEach((p) => {
        if (p.cfg && p.cfg.mode === 'trunk' && p.cfg.portfast) {
          add('STP', 'lack', d.key + ':' + p.iface,
            'トランクに portfast。',
            'トランクへのportfastはループ即時発生のリスク。',
            'トランクの portfast を外す。');
        }
      });
    }
  });

  /* ---- L3 ---- */
  const subnets: Subnet[] = buildSubnets(state);
  devs.forEach((d) => {
    if (d.role !== 'switch') return;
    const used: Record<string, 1> = {};
    d.ports.forEach((p) => {
      if (p.cfg && p.cfg.mode === 'access' && p.cfg.accessVlan) used[p.cfg.accessVlan] = 1;
    });
    Object.keys(used).forEach((v) => {
      const has = subnets.some((s) => s.vlan === v && s.gw);
      if (!has) {
        add('L3', 'lack', d.key + ' / VLAN ' + v,
          'VLAN ' + v + ' に L3 ゲートウェイがありません。',
          'ゲートウェイ無しでは同一サブネット内しか通信できない。',
          'SonicWall に VLAN ' + v + ' のサブIF(ゲートウェイIP)を作成。');
      }
    });
  });
  const ipseen: Record<string, string[]> = {};
  devs.forEach((d) => {
    if (d.parsed) {
      const ifs: Record<string, ParsedInterface> = (d.parsed as { interfaces: Record<string, ParsedInterface> }).interfaces;
      Object.keys(ifs).forEach((k) => {
        const i = ifs[k]!;
        if (i.ip) (ipseen[i.ip] = ipseen[i.ip] || []).push(d.key + ':' + i.name);
      });
    }
  });
  Object.keys(ipseen).forEach((ip) => {
    const u = uniq(ipseen[ip]!);
    if (u.length > 1) {
      add('L3', 'err', u.join(', '),
        'IP ' + ip + ' が重複。',
        '重複IPはARP競合で双方が不安定化。',
        'いずれかを再採番。');
    }
  });
  /* DHCP default-router 不一致(Cisco) */
  devs.forEach((d) => {
    if (!d.parsed) return;
    const dhcp = (d.parsed as { dhcp?: Record<string, { network: string | null; gw: string | null }> }).dhcp;
    if (!dhcp) return;
    Object.keys(dhcp).forEach((pool) => {
      const dp = dhcp[pool]!;
      if (dp.network && dp.gw) {
        const match = subnets.some((s) => s.cidr === dp.network && s.gw === dp.gw);
        const sub = subnets.filter((s) => s.cidr === dp.network)[0];
        if (sub && !match) {
          add('L3', 'err', d.key + ' / DHCP ' + pool,
            'DHCP配布の default-router (' + dp.gw + ') が実ゲートウェイ (' + sub.gw + ') と不一致。',
            'クライアントは誤ったゲートウェイを掴み、外部へ出られない。',
            'default-router を ' + sub.gw + ' に修正。');
        }
      }
    });
  });

  /* ---- FW ---- */
  const matrix: ReachabilityMatrix = buildMatrix(state, subnets);
  function isWan(z: string | undefined | null): boolean { return /WAN/i.test(z || ''); }
  const hasWan = subnets.some((s) => isWan(s.zone));
  if (hasWan) {
    subnets.forEach((s) => {
      if (isWan(s.zone)) return;
      const reachesWan = subnets.some((d) => isWan(d.zone) && matrix.cells[s.cidr]![d.cidr] === 'ok');
      if (!reachesWan) {
        add('FW', 'lack',
          (s.vlan ? 'VLAN ' + s.vlan + ' ' : '') + s.cidr + ' (' + s.zone + ')',
          s.zone + ' から WAN への許可ルールがありません。',
          '内部→WANのallowルールが無いとインターネットへ出られません。',
          'access-rule from ' + s.zone + ' to WAN action allow を追加。');
      }
    });
  }

  /* ---- SEC ---- */
  devs.forEach((d) => {
    if (!d.parsed) return;
    /* CiscoSec と SonicWallSec の field の和集合に sec を縮退して扱う(両方とも boolean field のみ) */
    const s = (d.parsed as unknown as { sec?: Record<string, boolean | undefined> }).sec;
    if (!s) return;
    if (s.telnet) add('SEC', 'err', d.key, 'Telnet が有効です。', '平文プロトコルで資格情報が盗聴されます。', 'transport input ssh のみにする。');
    if (s.enablePassword && !s.enableSecret) add('SEC', 'lack', d.key, 'enable password(可逆)が使われています。', 'enable passwordは弱い可逆暗号で復元されます。', 'enable secret に置き換える。');
    if (s.snmpWeak) add('SEC', 'err', d.key, 'SNMP コミュニティが public/private です。', '推測容易なコミュニティ名は情報漏えいの原因。', 'SNMPv3 またはユニークなコミュニティ名へ。');
    if (s.pingWanAllow) add('SEC', 'lack', d.key, 'WANからのPingが許可されています。', '外部からの存在確認を容易にします。', 'WANインターフェイスのPing応答を無効化。');
    if (s.mgmtWanAllow) add('SEC', 'err', d.key, 'WANからの管理アクセスが許可されています。', '管理面の外部公開は侵入リスクが高い。', '管理アクセスをLAN/VPNに限定。');
  });
  /* access port の portfast/bpduguard */
  devs.forEach((d) => {
    if (d.role !== 'switch' || !d.parsed) return;
    d.ports.forEach((p) => {
      const c = p.cfg;
      if (!c || c.mode !== 'access') return;
      if (!c.portfast) {
        add('SEC', 'lack', d.key + ':' + p.iface,
          'アクセスポートに portfast がありません。',
          '端末ポートのportfast無しは接続毎にSTP収束待ちが生じます。',
          'アクセスポートに spanning-tree portfast。');
      }
      if (c.portfast && !c.bpduguard) {
        add('SEC', 'lack', d.key + ':' + p.iface,
          'portfastありだがBPDU guardがありません。',
          'portfastポートにBPDUが入るとループ・不正接続の原因に。',
          'spanning-tree bpduguard enable を併用。');
      }
    });
  });
  /* 過剰許可ルール + シャドウされたルール */
  if (router.parsed && (router.parsed as SonicWallParsed).rules) {
    const rules: AccessRule[] = (router.parsed as SonicWallParsed).rules;
    rules.forEach((rl, i) => {
      if (rl.enabled === false) return;
      if (
        rl.action === 'allow' &&
        /^any$/i.test(rl.src) &&
        /^any$/i.test(rl.dst) &&
        /^any$/i.test(rl.service) &&
        !isWan(rl.from) &&
        isWan(rl.to) === false &&
        rl.from.toUpperCase() !== rl.to.toUpperCase()
      ) {
        add('SEC', 'lack',
          'ルール #' + (i + 1) + ' ' + rl.from + '→' + rl.to,
          'any/any/any の許可ルールです。',
          '全許可はセグメンテーションを無効化します。',
          '必要なサービス・宛先に絞る。');
      }
    });
    const seen: Record<string, { broad: true }> = {};
    rules.forEach((rl, i) => {
      if (rl.enabled === false) return;
      const key = rl.from.toUpperCase() + '>' + rl.to.toUpperCase();
      if (seen[key] && seen[key]!.broad) {
        add('SEC', 'lack',
          'ルール #' + (i + 1) + ' ' + rl.from + '→' + rl.to,
          'より上位の包括ルールにシャドウされています。',
          '上位にany/anyの同ゾーンルールがあり、このルールは評価されません。',
          'ルール順を見直すか不要なら削除。');
      }
      if (/^any$/i.test(rl.src) && /^any$/i.test(rl.dst) && /^any$/i.test(rl.service)) {
        seen[key] = { broad: true };
      }
    });
  }

  /* ==================================================================
   *  CAP — 機材 capabilities と config の整合性
   *  catalog.ts の各 SKU の capabilities フィールドが埋まっていれば、
   *  その上限を config が超えていないかをチェックする。
   *  capabilities が未定義の SKU では検査をスキップ(silent skip)。
   * ================================================================== */

  /* スイッチ側の CAP チェック */
  devs.forEach((d) => {
    if (d.role !== 'switch' || !d.parsed) return;
    const cp = d.parsed as { vlans?: Record<string, string>; svis?: Record<string, unknown>; stpMode?: string | null; acls?: Record<string, unknown[]>; interfaces?: Record<string, ParsedInterface> };
    const cap = (d.model as { capabilities?: import('./types').SwitchCapabilities }).capabilities;
    if (!cap) return;

    /* VLAN 上限 */
    if (cap.maxVlansSupported && cp.vlans) {
      const n = Object.keys(cp.vlans).length;
      if (n > cap.maxVlansSupported) {
        add('CAP', 'err', d.key,
          'VLAN 数 ' + n + ' が SKU 上限 ' + cap.maxVlansSupported + ' を超過。',
          d.model.id + ' は最大 ' + cap.maxVlansSupported + ' VLAN まで対応(datasheet 公称)。超過すると一部 VLAN が機能しない可能性。',
          '上位機種への置換 / 不要 VLAN の削減 / VLAN を分散。');
      }
    }
    /* SVI 上限 */
    if (cap.maxSviCount && cp.svis) {
      const n = Object.keys(cp.svis).length;
      if (n > cap.maxSviCount) {
        add('CAP', 'err', d.key,
          'SVI 数 ' + n + ' が SKU 上限 ' + cap.maxSviCount + ' を超過。',
          d.model.id + ' は最大 ' + cap.maxSviCount + ' SVI まで対応。',
          'SVI を別スイッチに分散 / 上位機種へ置換。');
      }
    }
    /* ACL エントリ概算 */
    if (cap.maxAclEntries && cp.acls) {
      let total = 0;
      Object.keys(cp.acls).forEach((k) => { total += (cp.acls![k] || []).length; });
      if (total > cap.maxAclEntries) {
        add('CAP', 'err', d.key,
          'ACL 総エントリ数 ' + total + ' が SKU 上限 ' + cap.maxAclEntries + ' を超過。',
          d.model.id + ' の ACL TCAM 概算上限を超えており、ハードウェアでオフロードされない可能性。',
          'ACL の整理・統合 / 上位機種への置換。');
      }
    }
    /* STP variant の非対応 */
    if (cap.stpVariants && cp.stpMode) {
      const m = cp.stpMode.toLowerCase();
      const normalized: 'pvst' | 'rapid-pvst' | 'mst' | null =
        m === 'rapid-pvst' || m === 'rapid_pvst' ? 'rapid-pvst'
        : m === 'mst' ? 'mst'
        : m === 'pvst' ? 'pvst'
        : null;
      if (normalized && !cap.stpVariants.includes(normalized)) {
        add('CAP', 'err', d.key,
          'STP モード "' + cp.stpMode + '" は ' + d.model.id + ' で非対応。',
          'datasheet 上の対応 STP variant: ' + cap.stpVariants.join(' / ') + '。設定が機種でサポートされていない。',
          '対応 variant に変更するか、対応機種へ置換。');
      }
    }
    /* PAgP 利用判定: channel-group mode が desirable / auto なら PAgP */
    if (cap.supportsPagp === false && cp.interfaces) {
      const ifs = cp.interfaces;
      const usesPagp = Object.keys(ifs).some((k) => {
        const ch = ifs[k]!.channel;
        return !!ch && (ch.mode === 'desirable' || ch.mode === 'auto');
      });
      if (usesPagp) {
        add('CAP', 'err', d.key,
          'PAgP (channel-group mode desirable/auto) が設定されているが ' + d.model.id + ' は PAgP 非対応。',
          'Cat 1000 等は LACP のみ対応で PAgP は使えない。リンク集約が成立しない。',
          'channel-group mode を active/passive(LACP)に変更。');
      }
    }
  });

  /* ルータ(SonicWall)側の CAP チェック */
  if (router.parsed) {
    const rp = router.parsed as SonicWallParsed;
    const rcap = (router.model as { capabilities?: import('./types').RouterCapabilities }).capabilities;
    if (rcap) {
      /* VLAN サブインターフェイス数(vlanTag を持つ interface 数) */
      if (rcap.maxVlanInterfaces) {
        const n = Object.values(rp.interfaces).filter((i) => i.vlanTag).length;
        if (n > rcap.maxVlanInterfaces) {
          add('CAP', 'err', router.key,
            'VLAN サブインターフェイス数 ' + n + ' が SKU 上限 ' + rcap.maxVlanInterfaces + ' を超過。',
            router.model.id + ' は最大 ' + rcap.maxVlanInterfaces + ' VLAN サブインターフェイスまで対応。',
            '上位機種へ置換 / VLAN 数を削減。');
        }
      }
      /* access-rule 数 */
      if (rcap.maxAccessRules && rp.rules) {
        const n = rp.rules.length;
        if (n > rcap.maxAccessRules) {
          add('CAP', 'err', router.key,
            'access-rule 数 ' + n + ' が SKU 上限 ' + rcap.maxAccessRules + ' を超過。',
            router.model.id + ' は最大 ' + rcap.maxAccessRules + ' ルールまで対応。',
            'ルール統合 / 上位機種へ置換。');
        }
      }
      /* NAT ポリシー数 */
      if (rcap.maxNatPolicies && rp.nat) {
        const n = rp.nat.length;
        if (n > rcap.maxNatPolicies) {
          add('CAP', 'err', router.key,
            'NAT ポリシー数 ' + n + ' が SKU 上限 ' + rcap.maxNatPolicies + ' を超過。',
            router.model.id + ' は最大 ' + rcap.maxNatPolicies + ' NAT ポリシーまで対応。',
            'NAT ポリシー統合 / 上位機種へ置換。');
        }
      }
    }
  }

  /* ---- 残りを ok に ---- */
  devs.forEach((d) => d.ports.forEach((p) => { if (p.cfg && p.status === 'idle') p.status = 'ok'; }));

  /* ---- カテゴリ別集計 + スコア ---- */
  const cats: Record<FindingCategory, CategoryCount> = {
    L1: { err: 0, lack: 0 },
    L2: { err: 0, lack: 0 },
    STP: { err: 0, lack: 0 },
    L3: { err: 0, lack: 0 },
    FW: { err: 0, lack: 0 },
    SEC: { err: 0, lack: 0 },
    CAP: { err: 0, lack: 0 },
  };
  F.forEach((f) => {
    if (cats[f.cat]) {
      if (f.level === 'err') cats[f.cat].err++;
      else if (f.level === 'lack') cats[f.cat].lack++;
    }
  });
  const nErr = F.filter((f) => f.level === 'err').length;
  const nLack = F.filter((f) => f.level === 'lack').length;
  const score = Math.max(0, Math.round(100 - nErr * 12 - nLack * 4));

  return { findings: F, subnets, matrix, cats, loop, score, nErr, nLack };
}
