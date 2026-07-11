# Roadmap

優先順位は「**正確な機材シミュレーション再現**」(Yuki さん指定の最優先要件)に
直結する度合いで並べる。プレゼンや UI の見栄えは後回し。

## ✅ 完了

### Sprint 1 — 信頼回復(2026-05-24、v3.1.0)
- FW `svcMatch` を双方向 overlap 判定に修正(rule.service と request.service の
  プロトコル/ポート範囲交差)
- `pathTrace` 同一サブネット時に L2/GW/RT/FW を出さない構造に修正
- フォント Meiryo UI 統一、Google Fonts CDN 撤去
- Phase 00「モード選択」追加、手動トポロジーを SVG クリック式に刷新、
  Phase 03 にダウンロードボタン、`reIntake` 完全クリア
- テスト 46 ケース全 PASS

### Sprint 1.5 — TS / React ポート(2026-06-23、v4.0.0)
- エンジンを `src/engine/*.ts` に分割、全 public 型を定義
- UI を `src/ui/**/*.tsx` に React コンポーネント化(`useReducer` + Context)
- Vite + `vite-plugin-singlefile` で **配布物は単一 HTML 維持**(dist/index.html、~220KB)
- 46 テスト全 PASS、v3.1.0 とのパリティ(スコア / 件数 / 検出ルール)確認

### Sprint 2 — 機材カタログ実物化(2026-07-04、v4.1.0)
- SonicWall 全 7 SKU(TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700)を
  datasheet 精読し、正確な物理仕様を反映(v3.1.0 の誤ったポート構成を修正)
- Cisco 全 8 SKU(C1000-24/48、C2960-X 24/48、C9200-24/48、C9300-24/48)を同様に反映
- `RouterCapabilities` / `SwitchCapabilities` 型を新設、各 SKU に実データを格納
- **CAP カテゴリ**新設:VLAN/SVI/ACL 数上限超過、PAgP 非対応、STP variant 非対応を検出
- Phase 01 に capability chip 表示、ポート tooltip に PoE 情報
- テスト 50 ケース全 PASS(CAP 検証 4 ケース追加)

### Sprint 5 MVP — 「GUI でゼロから作成」モード(2026-07-04、v4.1.0)
> 当初計画では Sprint 3/4(パーサ精度・評価エンジン強化)の後に着手する予定だったが、
> ユーザーヒアリングで「これが FACET の核心機能」と判明したため優先度を繰り上げ、
> Sprint 2 完了直後に MVP 版として実装した。Sprint 3/4 は将来的にこの機能の精度を
> 底上げする位置づけに変わる。

- `generateCiscoConfig` / `generateSonicWallConfig`:draft(フォーム編集用の構造化
  データ)→ running-config / SonicOS CLI テキストへのジェネレータを新設
  (`src/engine/generators/`)。既存パーサの正規表現に厳密準拠
- **往復保証の構造的な担保**:生成したテキストは device.config に格納後、必ず
  既存の `parseCisco` / `parseSonicWall` で再パースして `device.parsed` を作る
  設計にした。生成ロジックとパースロジックの二重管理を避け、検証パイプラインは
  投入モードと完全共通
- Phase 00 の「② 作成モード」を有効化、Phase 03 が動的に
  投入フォーム(検証モード)/ GUI 構築フォーム(作成モード)に切り替わる
- Cisco: hostname/STP/VLAN一覧/ポート単位のaccess・trunk設定/portfast/bpduguard/
  shutdown/SVI/セキュリティ設定をフォームで構築
- SonicWall: hostname/インターフェース(VLANサブIF含む)/アドレスオブジェクト/
  サービスオブジェクト/アクセスルール/NATポリシーをフォームで構築
- 生成後は「⇩ ダウンロード」で即座に実機投入用テキストを取得可能
- 往復保証テスト 20 ケース(`test/engine/builder.test.ts`)、生成→verify までの
  フルパイプラインテストも追加。テスト計 70 ケース全 PASS
- **MVP スコープ外(次回以降)**:機種 capability を超える入力のリアルタイム制限
  (現状は生成後の CAP チェックで警告のみ)、ACL/DHCP プール/HSRP のビルダー UI、
  address-object の range 型

## 🚧 次フェーズ

### Sprint 3 — パーサ精度向上 + 暗黙既定値モデル化(進行中)
**所要:** 5〜7 日。

- [x] **P3-1**(v4.2.0、2026-07-04)認識行 / 未認識行を全行トラッキングし、
      パーサ網羅率を Phase 03 スロットに表示(`ParseCoverage`)
- [x] **P3-2**(v4.3.0、2026-07-04)IOS / IOS-XE / NX-OS の判別。FACET のカタログ
      という閉じた集合内での実用的なシグナル判定に限定(一般則ではない)。
      SonicOS 6 / 7 の判別は公式リファレンスが取得不能で調査の結果断念
      (`ParseCoverage` の認識率低下が実質的なセーフティネット)。詳細は
      `docs/PARSER-NOTES.md`
- [x] **P3-3**(v4.4.0、2026-07-04)各プラットフォームの「未指定時の既定挙動」を
      モデル化。`switchport mode` 未指定 → `dynamic auto`(本カタログ全 SKU 共通)
      として L2 で常時注意喚起するよう拡張。`spanning-tree mode` 未指定時の
      ループ検出を Rapid-PVST+ 既定を前提とした判定に修正(誤って `err` として
      いた過大評価を是正)。詳細は `docs/VERIFICATION-RULES.md`
- [ ] **P3-4** 実機 `show` 出力(匿名化)から **大量の test fixture** を作成

### Sprint 4 — 評価エンジンのリアリズム強化(完了)
**所要:** 4〜5 日。着手前にコード調査を行い、影響が大きい順に着手する方針で合意
(2026-07-05)。

- [x] **S4-1**(2026-07-05)Cisco: Port-channel(`interface Port-channel<N>`)の
      switchport/trunk 設定を、`channel-group <N>` を持つ物理メンバーポートへ継承。
      従来は canonIf() がどの物理ポートにも一致させられず、実務でよくある
      「L2 設定は Port-channel 側にのみ書く」パターンの設定がサイレントに
      読み捨てられていた(`mapToPorts.ts`)
- [x] **S4-2**(2026-07-05)SonicWall: NAT/route 評価の実質化。`pathTrace` の
      NAT ホップを、実際に該当する nat-policy をマッチさせて表示する方式に変更。
      これまで一切参照されていなかった静的ルート(`ip route`/`route-policy`)の
      next-hop 到達可否を verify() の L3 カテゴリで検出するようにした
- [x] **S4-3**(2026-07-05)SonicWall: 組み込みアドレスグループ `"<Zone> Subnets"`
      (例: "LAN Subnets")をゾーン内サブネットの和集合として動的解決するよう
      `objContains` を拡張。カスタム address-group / service-group のメンバー
      展開は、SonicOS 6.5 E-CLI Reference Guide を精読してもメンバー追加コマンドの
      構文を確認できなかったため意図的に見送り(確証の無い構文は実装しない方針。
      詳細は `docs/PARSER-NOTES.md`)
- [x] **S4-4**(2026-07-05)STP ルート選出(簡易モデル)。`spanning-tree priority`
      をパースに追加し、優先度最小のスイッチをルートブリッジと推定。BFS ホップ数で
      冗長エッジのブロック側を推定し、距離が同点で特定できない場合は「特定できず」
      と誠実に報告する(実リンクコスト・bridge ID 比較は非対応)
- [x] **S4-5**(2026-07-05)LACP/EtherChannel 束の実効フォーミング判定。
      channel-group の全メンバーが同一対向機器に接続されているか、対向側でも
      一貫して同じチャネルグループとして扱われているかを検証(err)、メンバー
      ポート数の非対称も検出(lack)。従来の単一リンク単位のモード互換性
      チェックでは見えなかった束全体の不整合を検出できるようになった
- [x] **S4-6**(2026-07-05)未使用の CAP フィールドを精査。`maxRoutingEntries` は
      直結ルート(SVI数)+ 静的ルート数の合計との比較で実装(err、下限見積り)。
      `maxMacAddresses` は「何台の端末が実際に接続されるか」が静的コンフィグから
      原理的に導出不能なため、意図的に未実装のまま(調査結果は
      `docs/VERIFICATION-RULES.md` に記録)。

**Sprint 4 完了(2026-07-05)**。着手前のコード調査で洗い出した6項目(S4-1〜S4-6)を
すべて実装・テスト・実地確認済み。テスト 101 → 119 ケース。

### Sprint 5 フォローアップ — GUI 作成モードの精度向上(完了)
**所要:** 2〜3 日。MVP は完了済み(上記参照)。影響度・使用頻度順に着手(2026-07-05)。

- [x] **SF5-1**(2026-07-05)機材 capability を超える設定は GUI 上でリアルタイム
      制限(VLAN数/SVI数/VLANサブIF数が上限到達で追加ボタンを disabled 化。
      従来の H-2 は警告表示のみだった)
- [x] **SF5-2**(2026-07-05)spanning-tree priority 入力欄をフォームに追加
      (S4-4 の root election 推定と対応。4096刻み16段階の select で不正値を
      作れない設計)
- [x] **SF5-3**(2026-07-05)ACL ビルダー UI(Cisco)。名前付き ACL の
      permit/deny 行を GUI で組み立て、ポートの ip access-group(in/out)として
      適用可能に。ACL 削除時は参照ポートの適用も自動解除
- [x] **SF5-4**(2026-07-05)DHCP プールビルダー UI(Cisco)。プール名・
      ネットワーク・マスク・default-router を GUI で設定可能に
- [x] **SF5-5**(2026-07-05)address-object の range 型対応(SonicWall)。
      開始/終了 IP を GUI で指定して `address-object ipv4 <name> range` を
      生成可能に。パース/評価側(evalFW)は既に対応済みで、ビルダー UI 側の
      抜けを埋めた形
- [x] **SF5-6**(2026-07-05)Port-channel/channel-group ビルダー UI(Cisco)。
      channel-group 番号・LACP モード・switchport 設定を一括定義し、ポート側で
      メンバーとして束ねられるように(S4-1 の継承・S4-5 の束コンシステンシ
      チェックに対応する GUI 側の実装)。メンバー化したポートは個別の L2 設定を
      GUI から編集できない設計にし、矛盾した状態を作れないようにした
- [x] **SF5-7**(2026-07-05)HSRP(standby)ビルダー UI(Cisco)。SVI に
      standby group・仮想 IP を設定可能に。往復保証のため parseCisco の
      standby 正規表現をグループ番号も捕捉するよう拡張(`ParsedInterface.standby`
      を `string | null` から `{group, ip} | null` に変更)。priority/preempt は
      パース未対応のため意図的に対象外

**Sprint 5 フォローアップ完了(2026-07-05)**。SF5-1〜SF5-7 の全 7 項目を実装・
テスト・実地確認済み。テスト 119 → 128 ケース。

### Sprint 5.5 — 全体 UI/UX デザイン刷新
**所要:** 3〜4 日。Sprint 5 フォローアップ(作成モードのフォームに限定)とは別に、
アプリ全体(投入モード・トポロジー・検証結果画面含む全 Phase)の見た目・使い勝手を
横断的に磨き直す。v3.1.0 の Meiryo UI 統一、v4.1.0 の GUI ハードニング(主に作成
モードのフォーム部品)以降、アプリ全体を対象にした見直しは未実施。

- [x] **Step 1**(2026-07-06)現状のスクリーンショット/レイアウト計測ベースの
      レビューを実施。3件の問題を確認:①ヘッダーが幅640px未満で横漏れ
      (ページ全体が横スクロール)、②大型スイッチ(24ポート以上)のシャーシ
      SVGがモバイル幅で表示崩れ(`overflow-x:visible` のまま固定幅描画)、
      ③補足テキスト色 `--faint` が WCAG AA コントラスト基準未達(実測 約2.83:1)。
      影響度・使用頻度順に着手する方針で合意
- [x] **v4.16.1**(2026-07-06)①③を修正(レスポンシブ対応 + アクセシビリティ)。
      ヘッダーのタグラインを幅640px未満で非表示化してページ全体の横漏れを解消、
      `--faint` を明るくしてコントラスト比を約4.6:1(WCAG AA クリア)に改善
- [x] **②の再調査**(2026-07-06)①の修正後に再検証した結果、誤検知と判明。
      シャーシ SVG の親要素 `.chassis` は元々 `overflow-x:auto` を持っており、
      `.svgwrap` 自体が `overflow-x:visible` なのは正しい設計(`.matrix` と同じ
      パターンで、子要素が広いままでも親がスクロールを担う)。Step 1 で
      `.svgwrap` 単体の `overflowX` だけを見て誤って不具合と判定していた
      (親の `.chassis` を見ていなかった)。①修正後の実機検証で
      docOverflow=0(28ポートスイッチ2台を含む構成でも)を確認、対応不要
- [x] **v4.17.0**(2026-07-07)結果画面(Phase 05)の情報密度の見直し。3方向の独立設計
      提案を判定・統合する形で実施。Findings をスコア/カテゴリの直後(2番目)へ移動、
      概要パネル(スコア+集計+カテゴリ+上位の指摘プレビュー)に統合、経路トレース・
      トポロジー図・シャーシ・マトリクスは折りたたみ式の「診断」領域にまとめ、
      スティッキーサブナビを追加。シャーシは機器ごとに折りたたみ可能にし機器台数
      増加時の縦の長さを抑制。カテゴリチップを7列に修正(7カテゴリなのに6列だった
      表示バグ)。見送った案(`--serif` の実セリフ化)は CHANGELOG.md に理由を記載
- [ ] Phase 間の遷移アニメーション・ローディング状態の統一
- [ ] ダークモード以外のテーマ需要があれば検討(現状はダーク基調で固定)
- [x] アクセシビリティの残項目点検(キーボード操作。コントラスト比は上記で対応済み)
      — **v4.17.1**(2026-07-08)削除ボタン12箇所のspan→button化、ファイル選択の
      visually-hidden化、Faceplate SVGポートのキーボード操作対応、バージョン履歴
      モーダルのフォーカストラップ、フォーカス可視化(:focus-visible)の統一

### 全機能監査 — バグ修正(2026-07-11)
Sprint 5.5 完了後、ユーザ依頼で全機能を対象にした横断監査を実施。13領域を並行
調査・独立検証し、53件の指摘(重複統合後)を得た。まずHigh重要度9件に対応。

- [x] **v4.17.2**(2026-07-11)Cisco `trunk allowed vlan none`/`no`プレフィックス
      誤読、SonicWall⇄Ciscoモード判定非対称性、starトポロジのポート重複割当、
      FW未解決serviceのno-match化、SEC WANの除外条件、DHCP WAN構成でのL3/FW
      チェック欠落、作成モードのリセット不整合、ドキュメント陳腐化(9件)を修正
- [x] Medium重要度19件(元22件、うち3件はHigh対応時に一緒に修正済み)
      — **v4.18.1**(2026-07-11)interface range vlan展開・sviVlan付与バグ、
      SonicWall WAN検知の誤検知・zoneフォールバック・route-policy複数行対応、
      MTU不一致のsetPort漏れ・shutdown+mode未指定の誤発火・重複CIDR検出、
      buildMatrix/pathTraceの代表IP統一、maxStpInstances配線、作成モードの
      各種UI不整合(設定済みポート数・ACL上限・サービスオブジェクトレンジ)、
      手動トポロジーの確認ダイアログ・ポート重複防止、サンプル読込/クリアの
      確認ダイアログ、ロックスロットのdisabled化、VERIFICATION-RULES.md訂正
- [ ] 残り25件(Low 17件・些末5件・Medium一部保留分)は今後の対応候補として
      記録済み(優先度・対応方針は都度相談)

### Sprint 6 — ライブコレクタ(真の "theory → live")
**所要:** 1 週間。

- 別 Node / Python ツールが SSH で実機に接続
- `show cdp/lldp neighbors`、`show interfaces status`、`show spanning-tree` を取得
- FACET の理論モデルと実機状態を照合し intent-vs-actual drift を出す
- ブラウザ内 SSH は試みない(別ランナー必須)

## 遠い未来

7. **エンジンを npm パッケージ化** — Web UI + CLI + コレクタで共有
8. **Batfish 級分析** — 多ベンダー、OSPF/BGP 経路再構築、ACL shadow 形式検証、
   golden-config compliance、構成差分 / 影響解析

## 範囲外(別プロダクト)

ライブ / 能動的検証 — 実 ping、スループット、SNMP ポーリング、リアルタイム監視 —
これは常時稼働 + ネット接続のバックエンドが必要で、PRTG / LibreNMS / Zabbix の領域。
FACET をそこへ拡張しない。

## 実質的なボトルネック

アルゴリズムではなく、**パーサ保守**。IOS と IOS-XE と NX-OS の差、SonicOS の
バージョン差は壊れポイントの宝庫。実機の(匿名化済)config を test fixture として
ためる仕組みが Sprint 3 の本丸。
