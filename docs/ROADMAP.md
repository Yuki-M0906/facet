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

### Sprint 2 — 機材カタログ実物化(2026-07-04、v4.0.0)
- SonicWall 全 7 SKU(TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700)を
  datasheet 精読し、正確な物理仕様を反映(v3.1.0 の誤ったポート構成を修正)
- Cisco 全 8 SKU(C1000-24/48、C2960-X 24/48、C9200-24/48、C9300-24/48)を同様に反映
- `RouterCapabilities` / `SwitchCapabilities` 型を新設、各 SKU に実データを格納
- **CAP カテゴリ**新設:VLAN/SVI/ACL 数上限超過、PAgP 非対応、STP variant 非対応を検出
- Phase 01 に capability chip 表示、ポート tooltip に PoE 情報
- テスト 50 ケース全 PASS(CAP 検証 4 ケース追加)

### Sprint 5 MVP — 「GUI でゼロから作成」モード(2026-07-04、v4.0.0)
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

### Sprint 4 — 評価エンジンのリアリズム強化
**所要:** 4〜5 日。

- SonicWall: 組み込みオブジェクト(LAN Subnets、WAN Subnets 等)、サービスグループ展開、
  NAT/route/policy 評価順
- Cisco: SVI ↔ portchannel ↔ trunk の継承、LACP 両端モード解決結果のシミュレート、
  STP ルート選出
- ハードウェア制約警告(MAC table、ACL TCAM 等)

### Sprint 5 フォローアップ — GUI 作成モードの精度向上
**所要:** 2〜3 日。MVP は完了済み(上記参照)。残作業:

- 機材 capability を超える設定は GUI 上でリアルタイム制限(現状は生成後の警告のみ)
- ACL / DHCP プール / HSRP のビルダー UI 追加
- address-object の range 型対応
- Sprint 3/4 のパーサ精度・評価エンジン強化の成果をフォームに反映

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
