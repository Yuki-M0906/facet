/**
 * メイン検証エンジン。6 カテゴリ(L1/L2/STP/L3/FW/SEC)+ 必要に応じて CAP の findings を生成。
 * 元: src/facet-core.js (legacy) の verify。
 * ロジックは無変更(Sprint 1 のバグ修正済 svcMatch/evalFW を経由)。
 */

import { buildMatrix } from './buildMatrix';
import { buildSubnets } from './buildSubnets';
import { uniq } from './canonIf';
import { inSubnet } from './ip';
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

/* ---- STP root election + ブロックポート推定(Sprint 4 S4-4) ----
 * 簡易モデル。ルートブリッジは priority(未設定は IEEE/Cisco 既定値 32768)が
 * 最小のスイッチとする。同点の場合、実機は MAC アドレスで比較するが FACET は
 * それを保持していないため device key の文字列比較で決定論的にタイブレークする
 * (実機と一致しない可能性がある簡易化)。
 * ルートからの BFS 最短距離(ホップ数)で各デバイスの「近さ」を近似し、
 * スパニングツリーに含まれない冗長エッジについて、ルートから遠い側のポートが
 * ブロックされると推定する。両端が同じ距離の場合は実際のリンクコストや
 * bridge ID 比較が必要になり本モデルでは決定できないため "ambiguous" とする。
 * router も L2 配線グラフのノードとして扱う(union-find のループ検出と同じグラフ)が、
 * STP はスイッチ間のプロトコルのためルート候補にはしない。
 */
function electStpRootAndBlockingEdges(
  devs: Device[],
  links: Link[],
): {
  root: Device | null;
  blockingEdges: Array<{ link: Link; blockedSide: 'a' | 'b' | 'ambiguous' }>;
} {
  const switches = devs.filter((d) => d.role === 'switch');
  if (!switches.length) return { root: null, blockingEdges: [] };

  const priorityOf = (d: Device): number => {
    const p = d.parsed as { stpPriority?: number | null } | null;
    return p && typeof p.stpPriority === 'number' ? p.stpPriority : 32768;
  };
  const root = switches.slice().sort((a, b) => {
    const diff = priorityOf(a) - priorityOf(b);
    return diff !== 0 ? diff : a.key.localeCompare(b.key);
  })[0]!;

  const adjacency: Record<string, Array<{ neighbor: string; link: Link }>> = {};
  devs.forEach((d) => { adjacency[d.key] = []; });
  links.forEach((L) => {
    (adjacency[L.a.key] ||= []).push({ neighbor: L.b.key, link: L });
    (adjacency[L.b.key] ||= []).push({ neighbor: L.a.key, link: L });
  });

  const dist: Record<string, number> = { [root.key]: 0 };
  const visitedEdges = new Set<Link>();
  const queue: string[] = [root.key];
  while (queue.length) {
    const cur = queue.shift()!;
    (adjacency[cur] || []).forEach(({ neighbor, link }) => {
      if (dist[neighbor] === undefined) {
        dist[neighbor] = dist[cur]! + 1;
        visitedEdges.add(link);
        queue.push(neighbor);
      }
    });
  }

  const blockingEdges: Array<{ link: Link; blockedSide: 'a' | 'b' | 'ambiguous' }> = [];
  links.forEach((L) => {
    if (visitedEdges.has(L)) return;
    const da = dist[L.a.key];
    const db = dist[L.b.key];
    if (da === undefined || db === undefined) return;
    blockingEdges.push({ link: L, blockedSide: da === db ? 'ambiguous' : da > db ? 'a' : 'b' });
  });

  return { root, blockingEdges };
}

/* ---- High-3 監査対応: trunk/access モード判定を a/b 対称にするヘルパー ----
 * SonicWall のタグ付き VLAN サブインターフェイスは mode==='vlan-subif'(mkif 参照)
 * または mapToPorts() でのマージ結果として subVlans が付く。以前は `ca.mode ||
 * (ca.subVlans ? 'trunk' : null)` という補完が Link の a 側にしか適用されず、
 * かつ 'vlan-subif' という文字列自体は 'trunk' と一致しないため、b 側に来た場合や
 * ca.mode が既に 'vlan-subif' で埋まっている場合(補完式が短絡評価で素通りする)に
 * 判定が食い違っていた。isTrunkLike() で両側を同一基準にする。 */
function isTrunkLike(cfg: ParsedInterface): boolean {
  return cfg.mode === 'trunk' || cfg.mode === 'vlan-subif' || !!(cfg.subVlans && cfg.subVlans.length);
}

/* ---- High-3 監査対応: native VLAN(タグ無しフレームが属するVLAN)の比較対象を
 * 正しく絞るヘルパー。「Cisco の明示的 trunk」または「SonicWall の素の(vlanTag
 * 無しの)物理/VLANインターフェイスに、mapToPorts() で1つ以上のタグ付き
 * サブインターフェイスがマージされている」場合のみ native VLAN 概念が成立する
 * (前者は native vlan コマンド、後者は untagged な素インターフェイス自体が
 * 暗黙の native に相当)。cfg.mode==='vlan-subif' はタグ付きサブインターフェイス
 * 自身が port.cfg の起点になった(＝untaggedな素インターフェイスが存在しない)
 * ケースを指し、この場合は native という概念自体が無いため対象外とする。 */
function hasNativeVlan(cfg: ParsedInterface): boolean {
  return cfg.mode === 'trunk' || (cfg.mode === null && !!(cfg.subVlans && cfg.subVlans.length));
}

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
      if (c.mode === 'access' && c.accessVlan && c.accessVlan !== '1' && !vlans[c.accessVlan]) {
        /* VLAN 1 は実機の既定VLANとして常に存在し、running-config に明示的な
         * `vlan 1` ブロックが無いのが通常(むしろ書かれていない方が普通)。
         * vlans{} は明示行からのみ構築されるため、除外しないとVLAN1に割り当てた
         * 極めて標準的な構成が誤って「未定義」判定になっていた。 */
        add('L2', 'lack', d.key + ':' + p.iface,
          'Access VLAN ' + c.accessVlan + ' が未定義。',
          'VLAN DB に無いVLANは通信に使えません。',
          'vlan ' + c.accessVlan + ' を定義。');
        setPort(d, p.iface, 'lack');
      }
      if (c.mode === 'trunk' && (!c.trunkAllowed || !c.trunkAllowed.length) && !c.trunkAllowedExplicit) {
        /* High-1 監査対応: `switchport trunk allowed vlan none` で明示的に全遮断
         * されている場合は trunkAllowedExplicit=true になり、ここに来ない
         * (「未指定=全許可扱い」という正反対の警告を出さないため)。 */
        add('L2', 'lack', d.key + ':' + p.iface,
          'トランクの allowed vlan 未指定(全許可扱い)。',
          '明示しないと意図しないVLANが透過します。',
          'allowed vlan を明示。');
        setPort(d, p.iface, 'lack');
      }
      if (!c.mode && !c.shutdown) {
        /* Sprint 3 P3-3: switchport mode 未指定時の既定挙動モデル化。
         * 本カタログの全 SKU(Catalyst 1000/2960-X/9200/9300)は DTP 既定モードが
         * dynamic auto(ウェブ調査で確認、docs/PARSER-NOTES.md 参照。旧 2950/3550 等の
         * dynamic desirable とは異なる)。access/trunk 明示が無いのは「機種既定に依存した
         * 不安定な状態」であり、accessVlan/trunkAllowed が設定済みでも未設定でも
         * 同様に注意喚起する。
         * 全機能監査 Medium-10: このチェックの論拠(対向ポートがtrunk化を要求すると
         * DTPネゴシエーションでaccessとして動作してしまうリスク)は、リンクが
         * administratively down の間は成立しない。shutdown 済みポートは対象外にする
         * (shutdown 自体の lack は上の別チェックで既に検出済み)。 */
        add('L2', 'lack', d.key + ':' + p.iface,
          'switchport mode 未指定(機種既定の dynamic auto として動作)。',
          '本カタログの全 SKU は DTP 既定モードが dynamic auto です。対向ポートが trunk 化を' +
            '要求しない限り access(native VLAN)として動作するため、意図した構成か不明確です。',
          'access / trunk を明示して意図を明確にする。');
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
    const maLabel = ca.mode || (ca.subVlans && ca.subVlans.length ? 'vlan-subif' : null);
    const mbLabel = cb.mode || (cb.subVlans && cb.subVlans.length ? 'vlan-subif' : null);
    if (maLabel && mbLabel && (isTrunkLike(ca) !== isTrunkLike(cb))) {
      add('L2', 'err', tag,
        '両端モード不一致(' + maLabel + ' ↔ ' + mbLabel + ')。',
        '片側access/片側trunkはVLANタグ処理が食い違い疎通不可。',
        '両端を trunk に統一。');
      setPort(da, L.a.iface, 'err');
      setPort(db, L.b.iface, 'err');
    }
    const na = ca.trunkNative || '1';
    const nb = cb.trunkNative || '1';
    if (hasNativeVlan(ca) && hasNativeVlan(cb) && na !== nb) {
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
            'ルータ側に VLAN ' + onlyB.join(',') + ' のサブインターフェイスを追加。');
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
      /* 全機能監査 Medium-5: 同じ forEach 内の速度/Duplex/EtherChannelモード不一致は
       * add() 直後に setPort() を呼ぶが、MTU不一致だけこれが抜けていた。findings一覧
       * には出るのにシャーシ図では該当ポートが緑のまま、という表示の食い違いを修正。 */
      setPort(da, L.a.iface, 'lack');
      setPort(db, L.b.iface, 'lack');
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

  /* ---- LACP/EtherChannel 束の実効フォーミング判定(Sprint 4 S4-5) ----
   * 上の links.forEach は「宣言された1本のリンクの両端モードが互換か」しか見ておらず、
   * channel-group の全メンバーポートが実際に同一の対向機器に向いているか、
   * 対向側でも一貫して同じチャネルグループとして扱われているかは検証していなかった。
   * これらが崩れていると、個々のリンクのモードが互換でも LACP バンドルは意図通りに
   * 形成されない。どのメンバーにもリンクが宣言されていない場合は判定不能として
   * silent skip(既存の CAP capabilities 未定義時と同じ方針)。
   */
  devs.forEach((d) => {
    if (d.role !== 'switch') return;
    const channelGroups: Record<string, RuntimePort[]> = {};
    d.ports.forEach((p) => {
      if (p.cfg && p.cfg.channel) {
        (channelGroups[p.cfg.channel.id] ||= []).push(p);
      }
    });
    Object.keys(channelGroups).forEach((chId) => {
      const members = channelGroups[chId]!;
      if (members.length < 2) return;
      const linked = members
        .map((p) => {
          const l = links.find((L) =>
            (L.a.key === d.key && L.a.iface === p.iface) || (L.b.key === d.key && L.b.iface === p.iface));
          if (!l) return null;
          const peerEnd = l.a.key === d.key ? l.b : l.a;
          return { peerKey: peerEnd.key, peerIface: peerEnd.iface };
        })
        .filter((x): x is { peerKey: string; peerIface: string } => x !== null);
      if (linked.length < 2) return;

      const where = d.key + ':channel-group ' + chId;
      const distinctPeers = uniq(linked.map((x) => x.peerKey));
      if (distinctPeers.length > 1) {
        add('L1', 'err', where,
          'channel-group ' + chId + ' のメンバーポートが複数の異なる機器(' + distinctPeers.join(', ') + ')に接続されています。',
          'LACP/EtherChannel は同一の対向機器へ接続された物理リンクの束である必要があり、異なる機器への接続は束として成立しません。',
          'メンバーポートの配線または channel-group 割当を見直してください。');
        return;
      }
      const peerDev = devs.filter((x) => x.key === distinctPeers[0]!)[0];
      if (!peerDev) return;

      const peerChannelIdsOrNull = linked.map((x) => {
        const pp = peerDev.ports.filter((pd) => pd.iface === x.peerIface)[0];
        return pp && pp.cfg && pp.cfg.channel ? pp.cfg.channel.id : null;
      });
      if (peerChannelIdsOrNull.some((id) => id === null)) {
        add('L1', 'err', where,
          d.key + ' の channel-group ' + chId + ' に対し、対向 ' + peerDev.key + ' 側に channel-group 未設定のポートが含まれています。',
          '片側だけ EtherChannel を構成しても対向が個別リンクとして扱うため、LACP バンドルが成立しません。',
          peerDev.key + ' 側の対応ポートにも channel-group を設定してください。');
        return;
      }
      const distinctPeerChannelIds = uniq(peerChannelIdsOrNull as string[]);
      if (distinctPeerChannelIds.length > 1) {
        add('L1', 'err', where,
          d.key + ' の channel-group ' + chId + ' に対応する ' + peerDev.key + ' 側のポートが複数の異なる channel-group にまたがっています。',
          '対向側のチャネルグループが不揃いだと LACP バンドルが正しく形成されません。',
          peerDev.key + ' 側のチャネルグループ割当を統一してください。');
        return;
      }
      const peerChannelId = distinctPeerChannelIds[0]!;
      const peerMemberCount = peerDev.ports.filter((pp) => pp.cfg && pp.cfg.channel && pp.cfg.channel.id === peerChannelId).length;
      if (peerMemberCount !== members.length) {
        add('L1', 'lack', where,
          'channel-group ' + chId + ' のメンバーポート数が対向と非対称です(' + d.key + '=' + members.length + ' / ' + peerDev.key + '=' + peerMemberCount + ')。',
          'LACP はメンバー数が不揃いでも一部は束になり得ますが、意図した帯域・冗長性が得られない可能性があります。',
          '双方のメンバーポート数を一致させてください。');
      }
    });
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
    /* Sprint 3 P3-3: spanning-tree mode 未指定時の既定挙動モデル化。
     * ウェブ調査により、本カタログの全 SKU(Catalyst 1000/2960-X は IOS 15.2(4)E 以降、
     * 9200/9300 は IOS-XE)は spanning-tree mode 未指定時 Rapid-PVST+ が既定と確認できた
     * (docs/PARSER-NOTES.md 参照)。つまり stpMode 未設定 ≠ "STP無し" であり、以前の
     * err 判定は既定挙動を無視した過大評価だった。未設定でも既定でループが保護されている
     * 前提に修正し、lack(明示設定の推奨)へ格下げする。ただし FACET は静的解析であり
     * 実機の稼働状態そのものは検証できないため、断定はしない。 */
    const stpUnset = devs.filter((d) => d.role === 'switch' && d.parsed && !(d.parsed as { stpMode?: string }).stpMode);
    const edge = loopEdge as Link | null;
    const { root: stpRoot, blockingEdges } = electStpRootAndBlockingEdges(devs, links);
    const rootNote = stpRoot
      ? ' 推定ルートブリッジ: ' + stpRoot.key + '(priority ' +
        (((stpRoot.parsed as { stpPriority?: number | null } | null)?.stpPriority) ?? 32768) + ')。' +
        '推定ブロックポート: ' +
        (blockingEdges.length
          ? blockingEdges.map((b) => {
              if (b.blockedSide === 'ambiguous') {
                return b.link.a.key + ' ↔ ' + b.link.b.key + '(優先度・距離が同点のため側を特定できず)';
              }
              const blocked = b.blockedSide === 'a' ? b.link.a : b.link.b;
              return blocked.key + ':' + blocked.iface;
            }).join(' / ')
          : '特定不可') +
        '(簡易モデル:priority比較 + ホップ数近似。実機のMACアドレス・実リンクコストは考慮していません)'
      : '';
    add('STP', 'lack',
      edge ? edge.a.key + ' ↔ ' + edge.b.key : 'topology',
      'L2ループが存在します' +
        (stpUnset.length
          ? '(STPモード未設定のスイッチあり。機種既定の Rapid-PVST+ で保護されていると推定されます)'
          : '(STPで1ポートがブロック)') + '。',
      (stpUnset.length
        ? '本カタログの全 SKU は spanning-tree mode 未指定時 Rapid-PVST+ が既定のため、通常はSTPがループを保護します。ただし FACET は静的解析であり実機の稼働状態そのものは検証できません。'
        : '冗長配線はループを生み、STP無しではブロードキャストストームに直結。') + rootNote,
      stpUnset.length
        ? stpUnset.map((s) => s.key).join(',') + ' に spanning-tree mode を明示設定し、既定動作への依存を無くすことを推奨。'
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
  function isWan(z: string | undefined | null): boolean { return /WAN/i.test(z || ''); }
  /* 全機能監査 Medium-9: 同一CIDRが異なるVLANに重複割当されている場合、
   * buildMatrix()のセルキー(cidr単体)・UI(Matrix.tsx/PathTracePanel.tsx)の
   * React key/<option>のvalueがすべてcidr単体のため、片方のVLANの行が
   * もう片方に上書きされたり選択不能になったりする。これはVLAN設計ミス
   * (同一CIDRの二重割当)そのものが根本原因であるため、まずそれ自体を
   * L3の指摘として明示的に検出する(表示側の衝突を個別に直すよりも、
   * 根本の誤設定を気づかせる方が実効性が高いため)。 */
  const cidrGroups: Record<string, Subnet[]> = {};
  subnets.forEach((s) => { (cidrGroups[s.cidr] ||= []).push(s); });
  Object.keys(cidrGroups).forEach((cidr) => {
    const grp = cidrGroups[cidr]!;
    if (grp.length > 1) {
      add('L3', 'err',
        grp.map((s) => s.dev + (s.vlan ? '/VLAN' + s.vlan : '')).join(', '),
        '同一サブネット ' + cidr + ' が複数箇所(' + grp.map((s) => s.dev + (s.vlan ? ' VLAN' + s.vlan : '')).join(' / ') + ')に重複割当されています。',
        '同一CIDRの二重割当はIPアドレス設計として不正で、到達性マトリクス・経路トレースの表示も正しく区別できません。',
        'いずれかのVLAN/インターフェイスに別のサブネットを割り当てる。');
    }
  });
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
          'ルータ側に VLAN ' + v + ' のサブインターフェイス、または L3 スイッチに SVI を作成(ゲートウェイIP)。');
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

  /* ---- 静的ルート(ip route / route-policy)の next-hop 到達性(Sprint 4 S4-2) ----
   * これまで parseCisco / parseSonicWall がパースする routes は一切参照されていなかった。
   * next-hop が既知のどのサブネット(構成済み IF から導出)にも属さない場合、
   * その静的ルートはパケットを送り出せず機能しない。
   * High-7 監査対応: WAN側がDHCP取得(IPリテラルがconfig上に無い)の場合、buildSubnets()
   * はそのインターフェイスを一切 subnets に含めない(ip/maskが無いため)。この状態で
   * 「正当な ip route 0.0.0.0 0.0.0.0 <ISPゲートウェイ>」を評価すると、ISP側の
   * サブネットがそもそも既知データに存在しないため常に誤って lack 判定になっていた。
   * DHCP WAN(zone=WAN かつ ip未設定)のインターフェイスが1つでもある機器では、
   * そのISP側サブネットが未知である以上、next-hop到達性を静的には判定できないため、
   * その機器の静的ルートについてはこのチェック自体をスキップする。 */
  devs.forEach((d) => {
    if (!d.parsed) return;
    const routes = (d.parsed as { routes?: Array<{ dst: string; mask: string; nh: string }> }).routes;
    if (!routes || !routes.length) return;
    const ifs = (d.parsed as { interfaces: Record<string, ParsedInterface> }).interfaces;
    const hasDhcpWan = Object.keys(ifs).some((k) => isWan(ifs[k]!.zone) && !ifs[k]!.ip);
    if (hasDhcpWan) return;
    routes.forEach((rt) => {
      /* next-hop がインターフェイス名(例: `ip route 0.0.0.0 0.0.0.0 Vlan99`)の
       * 場合、それはIPアドレスではないため「既知のサブネットに属するか」という
       * 判定自体が無意味(送出インターフェイス指定は定義上ローカルに有効)。
       * IPv4 リテラルの形をしている場合のみ到達性チェックを行う。 */
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(rt.nh)) return;
      const reachable = subnets.some((s) => inSubnet(rt.nh, s.cidr));
      if (!reachable) {
        add('L3', 'lack', d.key,
          '静的ルート ' + rt.dst + '/' + rt.mask + ' の next-hop ' + rt.nh + ' が既知のどのサブネットにも属しません。',
          'next-hop に到達できない静的ルートは機能せず、対応する宛先への通信ができません。',
          'next-hop が正しいか、対応するインターフェイス/サブネットが構成されているか確認してください。');
      }
    });
  });

  /* ---- FW ---- */
  const matrix: ReachabilityMatrix = buildMatrix(state, subnets);
  /* High-7 監査対応: hasWan を subnets(IPリテラルがあるIFのみ)基準にすると、DHCP WAN
   * (IPリテラルなし)しか無い構成では「WANが存在する」という事実そのものを検知できず、
   * 「内部→WANのallowルールが無い」という主要チェックが丸ごと無音でスキップされていた。
   * ルータの生の interfaces(IPの有無を問わない)からも WAN ゾーンの有無を見る。 */
  const routerIfs = router.parsed ? (router.parsed.interfaces as Record<string, ParsedInterface>) : {};
  const hasWan =
    subnets.some((s) => isWan(s.zone)) ||
    Object.keys(routerIfs).some((k) => isWan(routerIfs[k]!.zone));
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
      const broad =
        rl.action === 'allow' &&
        /^any$/i.test(rl.src) &&
        /^any$/i.test(rl.dst) &&
        /^any$/i.test(rl.service);
      if (!broad) return;
      /* High-6 監査対応: 従来は `!isWan(rl.from) && isWan(rl.to)===false` という
       * 除外条件のため、from・toどちらか一方でもWANが絡めば式全体がfalseになり、
       * WAN→LAN(外部から社内への全許可、最悪級の設定ミス)も一緒に除外されていた。
       * LAN→WAN(一般的なインターネット向け全許可)だけを除外対象とし、
       * WANが送信元の場合は独立して常にerrで検知する。 */
      if (isWan(rl.from)) {
        add('SEC', 'err',
          'ルール #' + (i + 1) + ' ' + rl.from + '→' + rl.to,
          'WANから任意の宛先・サービスへの許可ルールです。',
          '外部から社内ネットワークへの実質無制限アクセスを許可しています。',
          'source/destination/service を必要な範囲に限定するか、ルールを無効化。');
        return;
      }
      if (isWan(rl.to)) return;
      /* 全機能監査再調査: evalFW() はゾーン値 'ANY' を全ゾーンにマッチする
       * ワイルドカードとして扱うが、ここではその特別扱いが無く、from===to==='ANY'
       * (最も広範な全許可)まで「同一ゾーンの無害なルール」として素通りしていた。
       * ANY はワイルドカードとして扱い、除外対象から外す。 */
      if (rl.from.toUpperCase() === rl.to.toUpperCase() && rl.from.toUpperCase() !== 'ANY') return;
      add('SEC', 'lack',
        'ルール #' + (i + 1) + ' ' + rl.from + '→' + rl.to,
        'any/any/any の許可ルールです。',
        '全許可はセグメンテーションを無効化します。',
        '必要なサービス・宛先に絞る。');
    });
    const seen: Record<string, { broad: true }> = {};
    let seenAnyAny = false;
    rules.forEach((rl, i) => {
      if (rl.enabled === false) return;
      const fromU = rl.from.toUpperCase();
      const toU = rl.to.toUpperCase();
      const key = fromU + '>' + toU;
      /* ANY→ANY の包括ルールは evalFW() 上、後続のどの from/to 組み合わせよりも
       * 先にマッチするため、文字列完全一致の key だけでなく seenAnyAny でも
       * シャドウ判定する。 */
      if (seenAnyAny || (seen[key] && seen[key]!.broad)) {
        add('SEC', 'lack',
          'ルール #' + (i + 1) + ' ' + rl.from + '→' + rl.to,
          'より上位の包括ルールにシャドウされています。',
          '上位にany/anyの同ゾーンルールがあり、このルールは評価されません。',
          'ルール順を見直すか不要なら削除。');
      }
      if (/^any$/i.test(rl.src) && /^any$/i.test(rl.dst) && /^any$/i.test(rl.service)) {
        seen[key] = { broad: true };
        if (fromU === 'ANY' && toU === 'ANY') seenAnyAny = true;
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
    const cp = d.parsed as { vlans?: Record<string, string>; svis?: Record<string, unknown>; stpMode?: string | null; acls?: Record<string, unknown[]>; interfaces?: Record<string, ParsedInterface>; platformHint?: import('./types').PlatformHint; routes?: Array<{ dst: string; mask: string; nh: string }> };
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
    /* STP インスタンス数上限(全機能監査 Medium-13: catalog.ts に既に存在するが
     * どこからも参照されていなかった maxStpInstances を配線)。PVST/Rapid-PVST
     * 系は VLAN 毎に1インスタンスを消費するため、VLAN 数がそのままインスタンス数
     * に等しい。MST は複数 VLAN を少数のインスタンスに束ねるため本チェックの
     * 対象外(この静的パーサは MST インスタンス構成までは読み取っていない)。 */
    if (cap.maxStpInstances && cp.vlans && cp.stpMode && /pvst/i.test(cp.stpMode)) {
      const n = Object.keys(cp.vlans).length;
      if (n > cap.maxStpInstances) {
        add('CAP', 'err', d.key,
          'STP インスタンス数 ' + n + ' が SKU 上限 ' + cap.maxStpInstances + ' を超過。',
          d.model.id + ' は ' + cp.stpMode + ' で最大 ' + cap.maxStpInstances +
            ' インスタンスまで対応(datasheet 公称)。PVST/Rapid-PVST は VLAN 毎に' +
            '1インスタンスを消費するため、VLAN 数がそのままインスタンス数になります。',
          '上位機種への置換 / 不要 VLAN の削減 / MST への切替を検討。');
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
    /* ルーティングテーブル(FIB)静的エントリ数 概算(Sprint 4 S4-6) ----
     * 直結ルート(SVI 数)+ 静的ルート(ip route)の合計を下限見積りとして比較する。
     * OSPF/EIGRP/BGP 等の動的プロトコルで学習される経路は FACET では計算していない
     * ため、実際のエントリ数はこれ以上になり得る(過小評価はあっても過大評価は
     * しない設計。誤検知を避けるため超過が確実な場合のみ発火)。 */
    if (cap.maxRoutingEntries) {
      const directlyConnected = cp.svis ? Object.keys(cp.svis).length : 0;
      const staticRoutes = (cp.routes || []).length;
      const total = directlyConnected + staticRoutes;
      if (total > cap.maxRoutingEntries) {
        add('CAP', 'err', d.key,
          'ルーティングテーブルの静的エントリ数(直結 ' + directlyConnected + ' + 静的ルート ' +
            staticRoutes + ' = ' + total + ')が SKU 上限 ' + cap.maxRoutingEntries + ' を超過。',
          d.model.id + ' は最大 ' + cap.maxRoutingEntries + ' エントリまで対応。動的ルーティング' +
            'プロトコルで学習する経路を含めるとさらに超過幅が広がる可能性がある。',
          'SVI・静的ルートの整理 / 経路集約 / 上位機種への置換。');
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
    /* プラットフォーム判別ヒントと選択機種の OS ファミリーの突合(Sprint 3 P3-2) */
    if (cp.platformHint) {
      const signals = cp.platformHint.signals;
      const nxosHits = signals.filter((s) => s.signal.startsWith('nxos-'));
      const iosXeHits = signals.filter((s) => s.signal.startsWith('iosxe-'));
      const iosClassicHits = signals.filter((s) => s.signal.startsWith('ios-classic-'));
      if (nxosHits.length) {
        add('CAP', 'err', d.key,
          'コンフィグに NX-OS 固有の構文(例:"' + nxosHits[0]!.text + '")が検出されました。',
          'FACET のカタログは Catalyst シリーズ(IOS/IOS-XE)のみ対応で、NX-OS 機器はモデル化されていません。パース結果全体の信頼性が低い可能性があります。',
          '投入したコンフィグと選択機種が正しいか確認してください。NX-OS 機器は現時点で FACET の対象外です。');
      } else {
        const skuIsIosXe = cap.osVersions.some((v) => /ios-xe/i.test(v));
        if (skuIsIosXe && iosClassicHits.length && !iosXeHits.length) {
          add('CAP', 'err', d.key,
            '選択機種 ' + d.model.id + '(IOS-XE 系)に対し、コンフィグには classic IOS 系のライセンス階層(例:"' + iosClassicHits[0]!.text + '")が含まれています。',
            'lanbase / lanlite / ipservices は 2960-X・Catalyst 1000 系のライセンス階層名で、Catalyst 9000 系(IOS-XE)には存在しません。機種選択とコンフィグの組み合わせが一致していない可能性があります。',
            '投入したコンフィグファイル、または選択機種が正しいか確認してください。');
        } else if (!skuIsIosXe && iosXeHits.length) {
          add('CAP', 'err', d.key,
            '選択機種 ' + d.model.id + '(classic IOS 系)に対し、コンフィグには IOS-XE 系(Catalyst 9000)固有の構文(例:"' + iosXeHits[0]!.text + '")が含まれています。',
            'Smart Licensing / install mode / platform(FED)構文は Catalyst 9000 系(IOS-XE)特有で、2960-X・Catalyst 1000 系には存在しません。機種選択とコンフィグの組み合わせが一致していない可能性があります。',
            '投入したコンフィグファイル、または選択機種が正しいか確認してください。');
        }
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
