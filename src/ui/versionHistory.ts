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

export const CURRENT_VERSION = '4.4.0';

export const VERSION_HISTORY: VersionEntry[] = [
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
