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

## 🚧 次フェーズ

### Sprint 2 — 機材カタログ実物化(★最優先)
**目的:**「全 SKU 同一」の代表値仮定を脱し、SKU 別の実物理仕様で挙動を分岐させる。
**所要:** 5〜7 日。

- SonicWall 全 7 SKU(TZ270 / TZ370 / TZ470 / TZ570 / TZ670 / NSa2700 / NSa3700)を
  datasheet 精読し、正確な物理仕様を反映
  - ポート種別 / 速度 / PoE 対応
  - Max throughput, Max sessions, Max VPN, Max VLAN
- Cisco 全 8 SKU(C1000-24/48、C2960-X 24/48、C9200-24/48、C9300-24/48)を同様に
  - ポート構成 / アップリンクオプション / L2 vs L3 / Max ACL / STP variant 対応 / PoE
- 各 SKU の `capabilities` を型付き定数として持つ
- 「SKU が対応していない機能を config が要求した場合」を **CAP カテゴリ**で警告
- 内部に capability matrix を持ち、verify() 内で SKU と config の整合チェックを追加

### Sprint 3 — パーサ精度向上 + 暗黙既定値モデル化
**所要:** 5〜7 日。

- IOS / IOS-XE / NX-OS の判別とバージョン別構文差対応
- SonicOS 6 / 7 の判別
- 各プラットフォームの「未指定時の既定挙動」をモデル化
  - 例:Cisco 旧 IOS の `switchport mode` 未指定 → `dynamic auto` として L2 リンクシミュレーション
- 認識行 / 未認識行を全行トラッキングし、パーサ網羅率を表示
- 実機 `show` 出力(匿名化)から **大量の test fixture** を作成

### Sprint 4 — 評価エンジンのリアリズム強化
**所要:** 4〜5 日。

- SonicWall: 組み込みオブジェクト(LAN Subnets、WAN Subnets 等)、サービスグループ展開、
  NAT/route/policy 評価順
- Cisco: SVI ↔ portchannel ↔ trunk の継承、LACP 両端モード解決結果のシミュレート、
  STP ルート選出
- ハードウェア制約警告(MAC table、ACL TCAM 等)

### Sprint 5 — 「GUI でゼロから作成」モード
**所要:** 3〜4 日(Sprint 2〜4 の機材精度に乗る前提)。

- Cisco スイッチ用 GUI(VLAN/IF/STP/SEC のフォーム)
- Cisco config テキストジェネレータ
- 生成 → パーサ往復テスト(自分の出力を自分が読めることを保証)
- SonicWall 版も同様(Sprint 5 後半)
- 機材 capability を超える設定は GUI で入力不可能化

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
