/**
 * バージョン履歴 — 単一ソース・オブ・トゥルース。
 *
 * このファイルが FACET の「現在のバージョン」と「変更履歴」の正典。
 * - CURRENT_VERSION は package.json の version と必ず一致させる
 *   (test/version.test.ts が機械的にチェックする。ずれると npm test が落ちる)。
 * - VERSION_HISTORY[0] が常に最新版(降順)。
 * - ヘッダーのバージョンバッジ(Header.tsx)とバージョン履歴モーダルの両方が
 *   ここから直接データを読む — 表示のズレが構造的に起きない。
 * - CHANGELOG.md にはプローズ形式の詳細版を書く。番号と日付はここと必ず揃える。
 *
 * 変更を加えるたびに、ここに新しいエントリを先頭に追加すること(CLAUDE.md 参照)。
 */

export interface VersionEntry {
  version: string;
  date: string;    // YYYY-MM-DD
  title: string;
  changes: string[];
}

export const CURRENT_VERSION = '4.11.0';

export const VERSION_HISTORY: VersionEntry[] = [
  {
    version: '4.11.0',
    date: '2026-07-05',
    title: 'Sprint 5 フォローアップ SF5-2 — STP priority 入力欄',
    changes: [
      '[機能追加] Cisco ビルダーフォームに spanning-tree priority の選択欄を追加。' +
        'Sprint 4 S4-4 で実装した STP root election 推定と対応させ、GUI から' +
        'ルートブリッジになりやすさを制御できるようにした。',
      '実機で有効な16段階(0, 4096, ..., 61440)のみを select の選択肢とし、' +
        '不正な値を入力できない設計にした(既存の「存在しないポートは作れない」' +
        '設計哲学と同じ考え方)。',
      'テスト 1 ケース追加(stpPriority の往復保証)。テスト計 119 → 120 ケース。',
    ],
  },
  {
    version: '4.10.1',
    date: '2026-07-05',
    title: 'Sprint 5 フォローアップ SF5-1 — 機種上限のリアルタイム制限',
    changes: [
      '[UX改善] Cisco/SonicWall のビルダーフォームで、VLAN数・SVI数・VLANサブ' +
        'インターフェイス数が機種上限に到達すると「追加」ボタンを無効化する' +
        'ようにした。従来(H-2)は上限超過を警告表示するのみで、生成後の' +
        'CAP検証まで問題に気づけなかった。',
    ],
  },
  {
    version: '4.10.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-6 — ルーティングテーブル上限チェック(Sprint 4 完了)',
    changes: [
      '[検証精度] 直結ルート(SVI数)+ 静的ルート(ip route)の合計が SKU の' +
        '`maxRoutingEntries` を超過していないかを CAP カテゴリで検出するように' +
        'した。動的ルーティングプロトコルの学習経路は計算していないため下限' +
        '見積りとして扱う(過大評価を避け、確実に超過している場合のみ発火)。',
      '[誠実性] `maxMacAddresses`(MACアドレステーブル容量)は「実際に何台の' +
        '端末が接続されるか」が静的コンフィグから原理的に導出できないため、' +
        '調査の上で意図的に未実装とした(docs/VERIFICATION-RULES.md に記録)。',
      'Sprint 4(評価エンジンのリアリズム強化)が S4-1〜S4-6 の全項目で完了。' +
        'テスト 2 ケース追加。テスト計 117 → 119 ケース。',
    ],
  },
  {
    version: '4.9.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-5 — LACP/EtherChannel 束の実効フォーミング判定',
    changes: [
      '[検証精度] 従来の「1リンク単位のチャネルモード互換性チェック」に加え、' +
        'channel-group の全メンバーポートが実際に同一の対向機器に接続されて' +
        'いるか、対向側でも一貫して同じチャネルグループとして扱われているかを' +
        '検証するようにした。',
      '[検出内容] メンバーポートが複数の異なる機器に接続 → err。対向に' +
        'channel-group 未設定のポートが含まれる → err。対向側のポートが複数の' +
        '異なる channel-group にまたがる → err。メンバーポート数が対向と' +
        '非対称 → lack。どのメンバーにもリンク宣言が無ければ判定不能として' +
        'silent skip。',
      'テスト 5 ケース追加(対称構成での非発火、複数機器接続、対向側の' +
        'channel-group 未設定、対向側の channel-group 不一致、メンバー数の' +
        '非対称)。テスト計 112 → 117 ケース。',
    ],
  },
  {
    version: '4.8.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-4 — STP root election + UI文言改善',
    changes: [
      '[検証精度] STP ループ検出時に、簡易的なルートブリッジ選出とブロックポート' +
        '推定を追加。`spanning-tree priority` のパースに対応し、優先度最小の' +
        'スイッチをルートブリッジと推定(同点時は device key でタイブレーク)。' +
        'ルートからのホップ数で冗長エッジのブロック側を推定し、距離が同点で' +
        '判定できない場合は「特定できず」と誠実に報告する。',
      '[UI改善] 「GUI でコンフィグを作成」画面の説明文を短い文に分割し、' +
        '読みやすく改善。',
      'テスト 4 ケース追加(priority による root 選出、device key タイブレーク、' +
        '4台リングでのブロック側特定、対称トポロジーでの「特定できず」報告)。' +
        'テスト計 108 → 112 ケース。',
    ],
  },
  {
    version: '4.7.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-3 — SonicWall 組み込みアドレスグループ',
    changes: [
      '[検証精度] objContains(FW評価の中核ヘルパ)を拡張し、SonicOS の組み込み' +
        'アドレスグループ "<Zone> Subnets"(例: "LAN Subnets")を、そのゾーンに' +
        '割り当てられた全インターフェイスのサブネットの和集合として動的に解決' +
        'するようにした。SonicOS 6.5 E-CLI Reference Guide の複数箇所' +
        '(show address-group ipv4 "LAN Subnets" 等)で実在を確認済み。',
      '[誠実性] カスタム address-group / service-group のメンバー展開は実装を' +
        '見送り。同リファレンスガイドを精読したが、グループへメンバーを追加する' +
        'CLI コマンドの構文を確認できなかったため、確証の無い構文を実装しない' +
        '方針を優先(SonicOS 6/7 判別を見送った判断と同じ理由。詳細は' +
        'docs/PARSER-NOTES.md)。',
      'テスト 2 ケース追加(複数 LAN サブネットいずれも "LAN Subnets" に含まれる' +
        'こと、他ゾーンは含まれないこと)。テスト計 106 → 108 ケース。',
    ],
  },
  {
    version: '4.6.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-2 — SonicWall NAT/静的ルート評価の実質化',
    changes: [
      '[検証精度] pathTrace の NAT ホップを実質評価に変更。従来は NAT ポリシーが' +
        '1件でも定義されていれば無条件に「NAT ポリシーで変換」と表示しており、' +
        '実際にその通信に一致するか(original-source/outbound-interface)を' +
        '見ていなかった。該当ポリシーが無い場合はその旨を明示するようにした。',
      '[検証精度] parseCisco/parseSonicWall がパースする静的ルート(ip route /' +
        'route-policy)が verify() で一切参照されていなかった問題を修正。' +
        'next-hop が既知のどのサブネットにも属さない静的ルート(機能しない設定)を' +
        'L3 カテゴリで検出する。',
      'テスト 5 ケース追加(NAT一致/不一致/未定義の3パターン、静的ルート到達可否の' +
        '2パターン)。テスト計 101 → 106 ケース。',
    ],
  },
  {
    version: '4.5.0',
    date: '2026-07-05',
    title: 'Sprint 4 S4-1 — Cisco Port-channel 設定の継承',
    changes: [
      '[検証精度] mapToPorts に Port-channel 継承ロジックを追加。実務でよくある' +
        '「switchport/trunk 設定を interface Port-channel<N> 側にのみ書き、物理' +
        'メンバー側には channel-group <N> mode ... しか書かない」構成で、従来は' +
        'Port-channel の設定がどの物理ポートにも対応付かずサイレントに読み捨てられていた' +
        '(canonIf() が論理IF名を物理ポートラベルに一致させられないため)。',
      '[挙動] channel-group を持つ物理ポートに対応する Port-channel<N> インターフェイスが' +
        '存在する場合、mode/accessVlan/trunkNative/trunkAllowed/ip・mask/description のうち' +
        'メンバー側が未設定の項目のみ継承する(メンバー側に明示設定があれば上書きしない)。',
      'テスト 3 ケース追加(継承の基本動作、明示設定の非上書き、存在しないチャネル番号での' +
        '非クラッシュ確認)。テスト計 98 → 101 ケース。',
    ],
  },
  {
    version: '4.4.0',
    date: '2026-07-04',
    title: 'Sprint 3 P3-3 — 暗黙既定値のモデル化',
    changes: [
      '[検証精度] switchport mode 未指定ポートの L2 チェックを拡張。以前は accessVlan/' +
        'trunkAllowed が設定済みの場合のみ発火していたが、完全に未設定の場合も含めて' +
        '「機種既定の dynamic auto として動作する」ことを常に注意喚起するよう変更' +
        '(本カタログ全 SKU が dynamic auto 既定であることをウェブ調査で確認)。',
      '[過大評価の是正] STP ループ検出で spanning-tree mode 未設定のスイッチを' +
        '「STP無し」として err 扱いしていた判定を修正。本カタログの全 SKU は' +
        'spanning-tree mode 未指定時 Rapid-PVST+ が既定であることが判明したため、' +
        '未設定でも既定動作で保護されている前提に変更し lack へ格下げ' +
        '(FACET は静的解析であり実機の稼働状態そのものは断定できないため)。',
      '[ドキュメント] docs/VERIFICATION-RULES.md が TS 移行前(v3.1.0 時代)の記述の' +
        'まま放置されていたのを是正。CAP カテゴリ(Sprint 2 で追加済)の記載漏れ、' +
        'deprecated ファイルへの参照を修正し、現状の検証ルールと一致させた。',
      'テスト 5 ケース追加(dynamic auto 拡張、STP lack 化の新旧両パターン)。' +
        'テスト計 93 → 98 ケース。',
    ],
  },
  {
    version: '4.3.0',
    date: '2026-07-04',
    title: 'Sprint 3 P3-2 — プラットフォーム判別(NX-OS/IOS-XE誤投入検知)',
    changes: [
      '[パーサ精度] parseCisco に platformHint(PlatformHint 型)を追加。投入コンフィグの' +
        '構文シグナルから、選択機種の OS ファミリー(catalog.ts の osVersions)と矛盾しないかを検出。' +
        '既存の抽出ロジックとは独立した追加スキャンで、ゼロ回帰を維持。',
      '[検出内容] NX-OS 固有構文(feature / vdc / mgmt0 / vrf context / boot nxos 等、' +
        'FACET のカタログに NX-OS 機器は無いため検出=対象外機種)、および Catalyst 9000系' +
        '(IOS-XE)と 2960-X/1000系(classic IOS)を判別するライセンス階層名・Smart Licensing ' +
        'クラスタ等。選択機種と矛盾する場合は CAP カテゴリで err を発火(機種取り違え・' +
        'ファイル取り違えの早期発見)。',
      '[誠実性] SonicOS 6/7 の CLI テキストレベルでの判別は、公式リファレンスガイドが取得不能で' +
        '信頼できる根拠が見つからなかったため実装を見送り(docs/PARSER-NOTES.md に調査結果を明記)。' +
        '確証の無い判定を主張しない方針を優先。非対応方言は既存の ParseCoverage の認識率低下で' +
        '自然に可視化される。',
      'テスト 12 ケース追加(NX-OS/IOS-XE/classic シグナル検出、CAP 突合、誤検出防止)。' +
        'テスト計 81 → 93 ケース。',
    ],
  },
  {
    version: '4.2.0',
    date: '2026-07-04',
    title: 'Sprint 3 P3-1 — パーサ・カバレッジの可視化',
    changes: [
      '[パーサ精度] parseCisco / parseSonicWall の両方に「投入したコンフィグのうち何行を ' +
        '理解できたか」を計測するカバレッジ機能を追加(ParseCoverage 型: totalLines / ' +
        'recognizedLines / unrecognizedLines / coveragePercent)。空行は分母に含めない。',
      '[誠実性] 静的解析ツールとして「何を検証できていないか」を隠さない方針に基づき、' +
        'Phase 03 投入モードの各スロットに「認識率 92%(3行未対応)」のような表示を追加。' +
        '未対応行は行番号付きでツールチップに一覧表示する。',
      'Cisco / SonicWall それぞれの制御フローを変更せず(ゼロ回帰)、未認識と判定できる ' +
        '分岐点のみに計測ロジックを追加。カバレッジ専用テスト 7 ケース追加(テスト計 74→81 ケース)。',
    ],
  },
  {
    version: '4.1.0',
    date: '2026-07-04',
    title: 'Sprint 2・Sprint 5 MVP・GUI ハードニング・バージョン管理プロセス導入',
    changes: [
      '[プロセス] バージョン番号とバージョン履歴の管理を厳格化。package.json の version と ' +
        'versionHistory.ts(このファイル)の先頭エントリが一致するかを test/version.test.ts で ' +
        '自動チェックするようにした(npm test で検知)。',
      '[プロセス注記] v4.0.0 タグ以降、本エントリまでの間に複数の機能追加(下記)が ' +
        'バージョン番号を更新せずコミットされていた。本エントリでまとめて記録し、これ以降は ' +
        '再発しない運用にする。',
      '[Sprint 2] 機材カタログ実物化 — SonicWall 全7SKU・Cisco 全8SKU の物理仕様を ' +
        'datasheet 精読で正確化(v3.1.0 の誤ったポート構成も修正)。RouterCapabilities / ' +
        'SwitchCapabilities 型を新設。CAP カテゴリ新設(VLAN/SVI/ACL数上限・PAgP・STP variant ' +
        'の機種適合チェック)。テスト 46→50 ケース。',
      '[Sprint 5 MVP] 「GUI でゼロから作成」モード — Cisco/SonicWall の設定を GUI フォームで ' +
        '組み立て、実機投入可能なコンフィグを生成。生成テキストは既存パーサ(parseCisco/' +
        'parseSonicWall)で再パースする構造的な往復保証。ダウンロード機能付き。テスト 50→70 ケース。',
      '[GUI ハードニング] 入力検証(IP/マスク/VLAN/hostname、不正時は生成ボタン無効化)、' +
        '機種上限のリアルタイム警告、トポロジー再構成時に古い draft が残存するバグの修正、' +
        'データロス防止の確認ダイアログ、ポート行のステータス色分け・カスタムチェックボックス等 ' +
        'GUI デザイン刷新。',
    ],
  },
  {
    version: '4.0.0',
    date: '2026-06-23',
    title: 'Sprint 1.5 — Vite + React + TypeScript ポート',
    changes: [
      'エンジンを src/engine/*.ts に分割、全 public 型を定義。',
      'UI を src/ui/**/*.tsx に React コンポーネント化(useReducer + Context)。',
      'vite-plugin-singlefile で配布物は単一 HTML を維持(~220KB)。',
      '既存 46 テストを Vitest に移行、全 PASS。v3.1.0 とのパリティ(スコア・件数・検出ルール)確認。',
    ],
  },
  {
    version: '3.1.0',
    date: '2026-05-24',
    title: 'Sprint 1 — 信頼回復 & UX 整備',
    changes: [
      '[重大バグ修正] svcMatch を双方向 overlap 判定に修正。旧来はルールが svc-https のとき ' +
        '任意のサービスが match してしまい、FW評価・到達性マトリクス・経路トレースが過剰に ' +
        '「許可」を出す致命的な不具合があった。',
      '[バグ修正] pathTrace が同一サブネット通信時に実在しない GW ホップを出す問題を修正。',
      'フォントを Meiryo UI に統一、Google Fonts CDN への外部依存を撤去。',
      'Phase 00「モード選択」を新設、手動トポロジーを SVG クリック式に刷新。',
      'Phase 03 にコンフィグダウンロードボタンを追加、reIntake の不完全クリアを修正。',
    ],
  },
  {
    version: '3.0',
    date: '2026-05-20',
    title: '初期リリース',
    changes: [
      '単一ファイル配信版。Phase 01〜05 ウィザード、Cisco/SonicWall パーサ、' +
        '6 カテゴリ検証(L1/L2/STP/L3/FW/SEC)、到達性マトリクス、経路トレース。',
    ],
  },
];
