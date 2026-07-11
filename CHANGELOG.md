# Changelog — FACET (Network Verification Atelier)

主要な変更のみ。詳細は git log と `docs/SPRINT-1.5-DESIGN.md` / `docs/ROADMAP.md` を参照。

---

## v4.20.0 — 2026-07-11

### 全機能監査 再調査完了 + Phase間遷移・ローディング状態の統一

v4.17.2(High 9件)・v4.18.1(Medium 19件)に続き、残っていた Low 17件・些末5件・
一部保留 Medium の再洗い出しを並行監査(パーサ/検証エンジン/作成モードUI/UI-UX/
ドキュメント・テストカバレッジの5系統)で実施し、47件の候補を独立検証。全件が
有効な指摘と確認され(却下0件)、うち3件は再調査でMedium相当と判明し格上げ対応。
実質約44件のユニークな指摘を全て修正。

**パーサ(Cisco)**
- 番号付きACLエントリ(`10 permit ...`)、mode省略の`channel-group <N>`(静的on
  扱い)、`switchport mode dynamic auto/desirable`、`transport input all`
  (telnet有効とみなす)、DHCPプール`network`行の`/prefix`記法、`ip route`の
  インターフェイス名next-hop、スタックスイッチの`boot system switch all ...`
  (platformHint)を認識するよう拡張。
- Port-channel継承(S4-1)に`trunkAllowedExplicit`(`vlan none`の明示的全遮断)と
  `mtu`を追加(従来は誤って「未指定=全許可扱い」のlackが出ていた)。

**パーサ(SonicWall)**
- ポート番号無し`service-object`(ICMP等プロトコル丸ごとのオブジェクト)を
  from/to=nullとして認識。VLANサブIFの`trunkAllowed`重複を`uniq()`で解消。
  `route-policy`単一行の記述順序(destination/gatewayどちらが先でも可)に対応し、
  単一行完結時は即座にflushして後続行を巻き込まないよう修正。NAT
  `original-source`/`translated-source`がスペースを含む値で切り詰められる
  バグを修正。WAN ping/管理許可検出の誤検知除外を`!`/`#`行にも拡張。

**検証エンジン**
- SECのbroad-rule/shadow判定でゾーン値`ANY`をワイルドカードとして扱うよう
  修正(evalFW()との非対称性を解消)。Access VLAN 1を実機の既定VLANとして
  暗黙定義済み扱いにし、誤った「未定義」lackを解消。`/32`サブネットの
  代表ホストIP計算(buildMatrix/pathTrace共通)がサブネット範囲外にロール
  オーバーするバグを修正。

**作成モードUI**
- フォーム編集後に再生成せず「検証を実行」すると古いコンフィグのまま検証が
  通ってしまうバグ(High-8で対応した明示的リセット時と同型の欠落)を修正。
  VLAN削除時にポート/Port-channel/SVIの参照が残るバグ、SVI・DHCPプール名の
  重複チェック漏れを修正(いずれも既存のACL名/channel-group番号の重複防止
  パターンに揃える形)。

**トポロジー/その他UI**
- 手動配線で使用済みポートを選んでも無言で無視されるバグを修正(下部の
  セレクタ版UIと同じ警告を表示)。配線済みポートのハイライト(`.topo-linked`)
  が未配線だったCSSを実装。論理接続図でスイッチ同士のリンクが不自然に
  膨らむバグを修正(同じ行の場合は左右の辺同士を直接つなぐ)。ホームボタンの
  不要な確認ダイアログ(失うものが無い状態でも表示)、フェーズ遷移時に
  スクロール位置がリセットされない問題を解消。

**アクセシビリティ**
- 到達性マトリクスに`scope`属性、検証結果フィルタ・トポロジーモード切替・
  簡易検証モードの種別トグル・カテゴリチップに`aria-pressed`を追加。
  `.exp`拡張子(意図的に非対応)をファイル選択ダイアログの対象から除去。

**テストカバレッジ / ドキュメント**
- L1速度/Duplex/EtherChannelモード非互換、SEC各種(enable password/SNMP/
  WAN ping・管理許可/portfast・BPDU guard)、L2(リンク端構成無し/共通VLAN無し)、
  L3(IP重複/DHCP default-router不一致)、STP(トランクportfast)、CAP
  (SVI/ACL/STP variant/access-rule数/NATポリシー数)の既存ルールのうち
  未テストだった分岐に回帰テストを追加。パーサ/検証エンジンの実修正17件にも
  それぞれ対応するテストを追加(合計36ケース追加、192ケース全PASS)。
  ARCHITECTURE.md(テスト件数・公開APIテーブル・PhaseId列挙の陳腐化)、
  VERIFICATION-RULES.md(trunk allowed vlan noneの例外未記載)、
  PARSER-NOTES.md(WAN ping/管理許可コメント除外の拡張)を訂正。

### Phase間の遷移アニメーション・ローディング状態の統一

Sprint 5.5 の残項目。フェーズ切替(`.phase` の入場アニメーション)はすでに
全フェーズ共通で一貫していたが、OS の「視差効果を減らす」設定に一切対応
しておらず、また唯一の非同期処理(簡易検証モードのファイル読込)にローディング
表示が無かった。

- `.phase`(全フェーズ共通)・`.analyzing .shim`(検証中のシマー)・
  `.complete .gem`(完了画面のスピン)を `prefers-reduced-motion: reduce` 時に
  一括で無効化する `@media` ブロックを追加。`.phase` は全フェーズ共通のため
  1箇所の対応で全画面に効く。
- PhaseAnalyze の演出待機(通常2.5秒)は視差効果を減らす設定時に150msへ短縮。
  このタイマーは検証の実処理進捗ではなく固定長の意匠上の待機である旨をコード
  コメントで明文化(検証自体は同期的に完了済み)。
- PhaseQuick(簡易検証モード)のファイル読込中、作成モードの生成ステータスと
  同じ `.builder-generate-status.pending` を再利用した「読み込み中…」バッジを
  表示し、読込完了までファイル選択を無効化。
- フルスクリーンの「検証中…」演出は verify→results の1箇所限定という方針を
  `docs/ROADMAP.md` に明文化(他の非同期処理は今後もインラインバッジで対応)。

---

## v4.19.1 — 2026-07-11

### Phase 00/01 のカードの縦高さが揃わないバグを修正

`.panel + .panel { margin-top: 22px }`(単体パネルを縦に積んだときの間隔用)が
CSS Gridの横並びカード(Phase 00のモードカード3枚、Phase 01の機種選定カード
2枚)にも隣接セレクタとして意図せずマッチし、2枚目以降のカードだけ22px分
低くstretchされて見た目の高さが揃わないバグを修正。`.grid2>.panel,
.grid3>.panel{margin-top:0}`で打ち消し、モードカードは`display:flex;
flex-direction:column`+CTAボタンに`margin-top:auto`を与えることで、
カードの高さだけでなく「このモードで進む→」ボタンの位置も全カードで
完全に一致するようにした。

---

## v4.19.0 — 2026-07-11

### 簡易検証モード追加 — 単体機器を直接アップロードして即時チェック

Phase 00(モード選択)に3つ目の選択肢「③ 簡易検証モード」を新設。既存の
①検証モード(機種選定→トポロジー指定→コンフィグ投入→検証)、②作成モード
に続く、単体機器1台分だけをサッと確認したいときのための軽量フロー。

**フロー**
- 種別(ルータ=SonicWall / スイッチ=Cisco)と機種を選び、コンフィグファイルを
  1個アップロードするだけで即座に検証結果画面へ遷移。トポロジー指定・機種の
  組み合わせ検討は不要。
- 結果画面はスコアリング(ScoreRing)+シャーシ図(Faceplate、ポートホバーで
  詳細ツールチップ)+指摘一覧(FindingsList)を検証モードと共通コンポーネント
  で再利用。「← 別のファイルを検証」で同じ種別・機種のまま再チェック可能。

**エンジン再利用の設計**
- 新しい検証ロジックは一切追加していない。単体機器のみ・リンクなしの最小限の
  `AppState`を組み立てて既存の`verify()`にそのまま渡すことで、リンク間チェック
  (L1/L2両端不一致・STPループ・到達性マトリクス・経路トレース)は`state.links`
  が空のため自然にスキップされ、単体機器チェック(SEC・CAP・per-portのL2・
  単体L3)はそのまま動作する。検証ルールの正が常にひとつ(engine側)に保たれる。
- スイッチのみをアップロードした場合、型上必須の`AppState.router`には
  `parsed:null`の無害なプレースホルダを補う。ルータに依存する既存チェックは
  すべて`if (router.parsed)`等のガードで守られているため、プレースホルダに
  よる誤検知は起きない。

**スコープの明示**
- 「これは単体機器のみを対象にした静的チェックで、機器間の配線不一致・STP
  ループ検出・到達性マトリクス・経路トレースなど複数機器にまたがるチェックは
  実行されていない」旨の注記バナーを、アップロード画面・結果画面の両方に常時
  表示。FACETが「静的アナライザであり実機の疎通を保証するものではない」という
  製品の核となる性質を、このモードでも誤解なく伝えるため。

---

## v4.18.1 — 2026-07-11

### 全機能監査 — Medium重要度19件のバグ修正

v4.17.2(High重要度9件対応)に続き、同じ全機能監査の指摘のうちMedium重要度
19件に対応(元は22件だったが、うちM1・M21・M22はHigh対応時に一緒に修正済み)。

**パーサ**
- Cisco: `interface range vlan <a> - <b>`(SVI range構文)が展開されずIP情報が
  迷子になるバグを修正。複数SVI展開時、全メンバーのsviVlanが先頭の値をコピー
  してしまうバグも合わせて修正。HSRP複数グループ・VLAN別STP priorityの
  制約(いずれも現状verify.tsから未参照/簡易モデルのため実害は限定的)は
  `docs/PARSER-NOTES.md`に既知の制約として明記。
- SonicWall: WAN ping/管理許可検出(`ping.*from\s+wan`等)がコメント行でも
  誤マッチしていたバグを修正。zone未設定時に`ip-assignment`の値(モード名)が
  誤ってゾーン名として採用されるバグを修正(フォールバック自体を削除)。
  `route-policy`を単一行完結パターンに加え、`nat-policy`/`access-rule`と同様の
  実際のステートフルな複数行ブロック構文にも対応。

**検証エンジン**
- MTU不一致findingだけ`setPort()`が抜けており、findings一覧とシャーシ図の
  表示が食い違うバグを修正。
- shutdown済みポートにも「switchport mode未指定」警告が誤発火するバグを
  修正(shutdown中はDTPネゴシエーションのリスクが成立しないため対象外に)。
- 同一CIDRが複数VLAN/インターフェイスに重複割当されている場合のL3検出
  (err)を新設。マトリクス・経路トレースの表示衝突の根本原因を直接指摘する。
- `buildMatrix.ts`と`pathTrace.ts`が異なる代表ホストIP(ゲートウェイ vs
  ネットワークアドレス+20オフセット)を使っており、宛先を特定ホストで絞る
  FWルールがある構成でマトリクス表示と経路トレース結果が食い違いうる
  バグを修正。共通ヘルパー`representativeHostIp()`(`ip.ts`)に統一、
  小サブネット(/28以下)でのオフセット越え対策も追加。
- `catalog.ts`に存在するが未配線だった`maxStpInstances`(STPインスタンス数
  上限)をCAP検証に配線(PVST/Rapid-PVST時、VLAN数と等価)。機種選定画面にも
  表示を追加。SonicWallルータのThreat Prevention/新規接続数/SSL VPN同梱数の
  表示も追加。

**作成モード(GUI)**
- 「設定済みポート数」の判定条件がパーサ(実際の出力条件)・
  CiscoBuilderForm・PhaseBuildの3箇所で食い違っていたのを、共通ヘルパー
  `isCiscoPortConfigured()`(`generators/cisco.ts`、`@engine/index`から公開)に
  統一。
- VLAN/SVIと同様のリアルタイム上限ガードをACL総エントリ数にも追加。
- SonicWallサービスオブジェクトのPort入力が単一欄で常にFrom=Toに強制されて
  いたのを、From/To別々の入力欄に分離しレンジ型サービスオブジェクトを
  作成可能に(ジェネレータ側は既にレンジ出力に対応済みだった)。

**トポロジー**
- 手動配線から star/cascade へ切り替える際、既存の手動配線を確認なしに
  `autoLinks()`の結果で上書きしていたのを、既存配線がある場合は確認
  ダイアログを表示するよう修正。
- 同一機器の異なるポート同士を接続できてしまうバグ(セレクタ型UI)、
  1物理ポートが複数リンクで重複使用できてしまうバグ(SVGクリックUI・
  セレクタ型UI両方)を修正。reducerレベル(`store.tsx`)でも防御を追加。

**コンフィグ投入 / その他UI**
- 「サンプルコンフィグを読み込む」「クリア」ボタンが投入済みデータを確認
  なしに上書き/消去していたのを、既存データがある場合のみ確認ダイアログを
  出すよう修正(他フェーズの破壊的操作と同様のパターンに統一)。
- ロック中スロットのファイル選択が見た目(グレーアウト)は無効化されている
  のに実際には操作できてしまうバグを修正(`disabled`属性を追加)。

**ドキュメント**
- `docs/VERIFICATION-RULES.md`のshutdown検知範囲(「リンク宣言済みのみ」→
  実際は全ポート対象)、シャドウルール判定基準(「同一ゾーンの許可ルールのみ」→
  実際はfrom/toゾーンペア一致かつallow/deny問わず)の記述を実装に合わせて訂正。

- 実地確認: 新規13テストケース追加(既存含め全156件PASS)。ブラウザで手動配線の
  確認ダイアログ・ポート重複防止(同一機器/使用済みポート双方)・サンプル読込
  確認・ロックスロット無効化・サービスオブジェクトのレンジ生成(実際に
  ダウンロードしたコンフィグに`8000-8010`形式で出力されることを確認)を実施。
  コンソールエラー0件。

---

## v4.18.0 — 2026-07-11

### ヘッダーに「ホームに戻る」ボタンを常時設置

どのフェーズからでも一気にPhase 00(モード選択)まで戻れる「⌂ ホームに戻る」
ボタンをヘッダー(`Header.tsx`)に追加。全フェーズで常に表示される(印刷時は
ヘッダーごと非表示になる既存挙動を継承)。

- クリック時に `window.confirm` で「選択した機種・トポロジー・投入したコンフィグ・
  検証結果はすべて破棄されます。よろしいですか?」と確認し、キャンセルすれば
  現在のフェーズのまま何も変わらない。承諾すると `RESET` アクション(store.tsx に
  既存定義済みだったが、これまでUIのどこからもdispatchされていなかった)を
  発行し、初期状態(Phase 00)に戻す。
- モバイル幅(375px)でもヘッダーからはみ出さず、横スクロールを発生させないことを
  確認。focus-visibleのゴールド枠も付与済み。
- 実地確認: ブラウザでキャンセル/承諾の両方の分岐、確認メッセージの文言、
  リセット後にPhase 00へ戻ることを確認。コンソールエラー0件。

---

## v4.17.2 — 2026-07-11

### 全機能監査 — High重要度9件のバグ修正

ユーザから「全ての現機能の総点検」の依頼を受け、Workflowツールで13領域(Cisco/
SonicWallパーサ、L1/L2/STP、L3/FW/SEC/CAP、マトリクス/経路トレース、FW評価、
ビルダー往復整合性、カタログ整合性、UI状態管理、結果画面、ドキュメント整合性、
プライバシー不変条件、バージョン履歴)を並行監査し、各領域を独立エージェントが
再検証(誤検知はREFUTEDとして除外)。さらに機能横断の矛盾を3つの観点(命名一貫性・
上限値整合性・暗黙前提の矛盾)で追加調査し、REFUTED除外後で53件の指摘を得た。
このうちHigh重要度9件すべてに対応した。

- **Cisco: `switchport trunk allowed vlan none` の誤解釈を修正**。正規表現が
  `none` にマッチせず未認識行として無視され、明示的な全VLAN遮断が「未指定=
  全許可扱い」という正反対の警告文で表示されていた。`trunkAllowedExplicit`
  フラグを追加して区別できるようにし、あわせて `vlan remove/except` にも対応。
- **Cisco: `no` プレフィックスの誤読を修正**。`switchport mode trunk` 等の
  正規表現に行頭アンカーが無く、`no switchport mode trunk` のような巻き戻し
  コマンドを肯定設定として誤って適用していた。`no ` 始まりの行を専用ガードで
  一括して「認識済みだが意図的に適用しない」扱いにした。
- **SonicWall⇄Cisco間のtrunk/access・native VLAN判定の非対称性を修正**。
  タグ付きVLANサブインターフェイスのみ(`mode==='vlan-subif'`)の構成が
  `'trunk'` という文字列と一致しないために、正しい構成でも誤ってエラー、
  逆に明確な設定ミスが検知漏れになる、という2方向のバグがあった。
  `isTrunkLike()` / `hasNativeVlan()` ヘルパーでLinkのa/b両側に対称適用する
  ように修正。
- **`autoLinks.ts`: starトポロジのポート重複割当バグを修正**。以前は全スイッチが
  ルータの同一物理ポート(`rLan`)を共有しており、2台以上のスイッチ構成では
  物理的にありえない配線がverify()に渡っていた。台数分の異なるポートを順番に
  割り当てるよう修正。
- **`evalFW.ts`: 未解決serviceの挙動をpermissiveからno-matchに変更**。typo・
  大文字小文字違い・未対応のservice-group参照などでservice specが解決できない
  場合、従来は「過剰拒否を避けてpermissive(マッチ扱い=許可)」という挙動だったが、
  address-object側(`objContains`)は未知名をno-match(安全側)で扱っており非対称
  だった。FWレビューが主目的のツールとして、過剰許可ルールがtypoによって
  検出をすり抜けるのは方針と逆行するため、address側と統一。
- **SEC「any/any/any過剰許可」チェックのWAN除外条件を修正**。除外条件が
  `!isWan(rl.from) && isWan(rl.to)===false` となっており、from・toどちらか
  一方でもWANが絡めば式全体が除外されるため、`WAN→LAN`の全許可ルール
  (外部から社内への実質無制限アクセス、最悪級の設定ミス)も一緒に見逃していた。
  宛先WAN(一般的なインターネット向け全許可)のみ除外し、送信元WANは独立して
  常にerrで検知するよう修正。
- **DHCP WAN構成でのL3/FWチェック欠落を修正**。WAN側のインターフェイスに
  IPリテラルが無い(DHCP取得)場合、`buildSubnets()` がそのインターフェイスを
  一切拾わないため、①正当な `route-policy destination 0.0.0.0 0.0.0.0
  gateway <ISPゲートウェイ>` が常に誤ってnext-hop到達不能(lack)と判定され、
  ②「内部→WANのallowルールが無い」というFWカテゴリの中核チェックが丸ごと
  無音でスキップされていた。DHCP WANインターフェイスがある機器では①を
  スキップし、②はルータの生interfacesからも判定するよう修正。
- **作成モードの「⟲ この機器をリセット」の不整合を修正**。従来は
  `SET_BUILDER_DRAFT` のみをdispatchし、`device.config/parsed` 等は残留して
  いたため、リセット後も「生成済み✓」表示のまま古い設定に基づく検証・
  ダウンロードが続くというサイレントな不整合があった。`RESET_DEVICE_DRAFT`
  アクションを新設し、builderDraftsの初期化と同時にdevice側もクリアする
  ように修正。
- **ドキュメント/UI文言の陳腐化を是正**。CLAUDE.mdの「Where to continue」が
  今も「次はSprint 2」と案内していた(実際はSprint 5.5完了・当時v4.17.1)ほか、
  README.md・docs/ARCHITECTURE.mdのバージョン/テスト件数/CAPカテゴリの説明が
  広範に古いままだった。UI側もモード選択画面・ヘッダー・検証中メッセージの
  「6カテゴリ」表記がCAP追加後の実態(7カテゴリ)に追随していなかった。
  docs/VERIFICATION-RULES.mdにS4-2(静的ルートnext-hop到達性)ルールの記載を
  追加、docs/ROADMAP.mdのSprint2/5 MVPのバージョンラベル誤記(v4.0.0→v4.1.0)
  も是正。今後の陳腐化を防ぐため、バージョン番号・テスト件数はできる限り
  「正典を参照」という記述に置き換えた。
- 実地確認: 新規15テストケースを追加(既存回帰含め全143件PASS)。ブラウザで
  作成モードのリセット動作(生成済みバッジが正しく「未生成」に戻る、
  ダウンロードボタンが消える)を確認、コンソールエラー0件。
- 残り44件(Medium 22件・Low 17件・些末5件)は今後の対応候補として記録済み。

---

## v4.17.1 — 2026-07-08

### Sprint 5.5 — キーボード操作のアクセシビリティ改善

Sprint 5.5 の残項目のうち「アクセシビリティの残項目点検(キーボード操作)」に着手。
専用の監査エージェントで全画面をコンポーネント単位で洗い出し、file:line 精度の
指摘リストを先に作った上で、一括で修正した。

- **削除ボタン12箇所を `<button>` 化**: `LinkList.tsx`(リンク削除)、
  `CiscoBuilderForm.tsx`(VLAN・ACL・ACL行・Port-channel・SVI・DHCPプールの削除、
  計6箇所)、`SonicWallBuilderForm.tsx`(VLANサブインターフェイス・アドレスオブジェクト・
  サービスオブジェクト・アクセスルール・NATポリシーの削除、計5箇所)で、クリック専用の
  `<span onClick>` になっておりキーボードで到達不能だった削除アイコンを、
  `aria-label` 付きの `<button type="button">` に変更。CSS側もボタンのブラウザ既定
  スタイルをリセットした上で `:focus-visible` の縁取りを追加。
- **ファイル選択のキーボード到達性を修正**: コンフィグ投入枠の実体
  `input[type=file]` が `display:none` でタブ順序から完全に除外されており、
  キーボードのみではファイル選択ダイアログを開く手段がなかった。視覚的には隠すが
  フォーカス・キー入力は受け付ける「visually-hidden」パターン(`position:absolute;
  width:1px;height:1px;clip:rect(0,0,0,0)` 等)に変更し、ラベルに
  `:focus-within` の縁取りを追加。
- **シャーシ図(Faceplate)のSVGポートにキーボード操作を追加**: `tabindex="0"` /
  `role="button"`(クリック可能時)/ `aria-label`(機器名・ポート・種別・速度・
  判定を含む説明文)を付与。Enter/Space でのポート選択(手動トポロジー配線モード)、
  フォーカス時のツールチップ表示(マウスホバーと同じ内容)に対応した。
  マウス由来の `MouseEvent` とキーボードフォーカス由来の合成座標の両方を受け付ける
  よう `onPortHover` のシグネチャを `{clientX, clientY}` の最小構造型に広げている。
- **バージョン履歴モーダルにフォーカストラップを実装**: 開いたときに閉じるボタンへ
  自動フォーカスし、モーダル内で Tab / Shift+Tab がループするようにした
  (フォーカスがモーダル外の背後のページへ漏れない)。閉じた際は呼び出し元の
  バージョンバッジ(ヘッダー)へフォーカスを戻す。`role="dialog"` /
  `aria-modal="true"` / `aria-labelledby` も付与。
- **フォーカス可視化の統一**: トポロジーモード切替ボタン(`.toggle button`)・
  検証レポートのサブナビリンク(`.subnav-links a`)・指摘の絞り込みフィルタバー
  (`.filterbar button`)・上位の指摘プレビュー行(`.finding.compact` /
  `.topissues-more`)・折りたたみパネルの見出し(経路トレース/トポロジー/シャーシ/
  マトリクス、および機器別シャーシ区画)・汎用ボタン(`.btn`)に `:focus-visible` の
  ゴールド縁取りが欠けていた箇所を洗い出し、統一的に追加した。ピル型で
  `overflow:hidden` のコンテナ内にあるボタン(`.toggle button` 等)は外側に
  はみ出すアウトラインだとクリップされてしまうため `outline-offset` を負値にして
  内側に描画している。
- 実地確認: ブラウザでキーボード単独操作を確認 — バージョン履歴モーダルの
  フォーカストラップ・フォーカス復帰、Faceplate ポートの Tab到達→フォーカス時
  ツールチップ表示→Enterでの選択、コンソール/window エラー 0 件。既存128テスト・
  型チェック・ビルドとも回帰なし(検証エンジン側は無変更のため)。

---

## v4.17.0 — 2026-07-07

### Sprint 5.5 — 検証レポート画面(Phase 05)の情報密度改善 + 見た目の磨き上げ

Sprint 5.5 の残項目のうち「結果画面の情報密度の見直し」に着手。設計は3方向の独立提案
(アクション最優先 / 段階的開示 / 視覚クラフト)をそれぞれ判定させ、最も評価の高い要素を
統合する形で最終案を作成した。

- **指摘一覧の位置を変更**: 従来は経路トレース・トポロジー図・シャーシ図・マトリクスの
  4セクションの後(全体で9番目)にあった Findings & Suggestions を、スコア/集計/カテゴリの
  直後(2番目)へ移動。機器台数が増えるほど本題(何が壊れていて、どう直すか)にたどり
  着くまでが長くなる問題を解消した。
- **概要パネルの統合**: スコアリング・集計スタット・カテゴリチップを1枚の
  `panel.tier-hero` にまとめ、直下に「上位の指摘」(エラー/コンフィグ不足の上位3件)の
  プレビューを追加。ページ最上部だけで状況の概要と最重要課題が掴める。
- **カテゴリチップをクリック可能に**: 従来は表示専用の div だったカテゴリチップを
  button 化。クリックすると指摘一覧を該当カテゴリで絞り込み、指摘セクションへ
  自動スクロールする(`FindingsList` 側の絞り込みフィルターバーと状態を共有するため、
  互いに矛盾なく同期する)。
- **診断セクションの折りたたみ化**: 経路トレース・論理接続図・シャーシ・到達性マトリクス
  の4セクションを `<details>` による折りたたみ式(既定で閉)にまとめ、「診断」領域として
  分離。ページ上部に概要・指摘・診断へジャンプするスティッキーサブナビを追加した。
- **シャーシ区画の機器別折りたたみ**: シャーシ(ポート別ステータス)は機器ごとに
  個別の `<details>` にし、先頭の1台のみ既定で展開、他は「機器名 + 確認/エラー/不足の
  色分け件数」の要約行に折りたたむ。機器台数が増えても一覧の縦の長さが機器数に比例する
  だけで済み、色分けで優先度の高い機器をすぐに見分けられる。印刷/PDF出力時は
  折りたたみ状態に関わらず全項目を強制的に展開して出力する。
- **バグ修正**: カテゴリチップの CSS が `grid-template-columns:repeat(6,1fr)` の
  ままだったため、実際には7カテゴリ(CAP追加後)あるのに末尾の1枠だけ半端な行に
  なっていた。7列に修正。
- パネルの縁取り・影を「主要(概要・指摘)」「補助(診断内の各セクション)」の2階層に
  分け、ゴールドの縁取りを主要パネルに限定することで視覚的な優先度を明確にした。
- 検討はしたが見送った項目: `--serif` 変数を実際のセリフ体に変更する案(判定では
  好評だったが、Sprint 1 で「フォントを Meiryo UI に統一し外部依存を作らない」という
  意図的な決定がすでにされており(CLAUDE.md に明記)、変更するとその方針と矛盾する
  ため見送り)。2カラムの概要レイアウト・スタットタイルの縮小(`PhaseComplete.tsx` と
  スタイルを共有しているため副作用リスクがある)も同様に見送った。
- 実地確認: デスクトップ・モバイル(375px)幅の両方でスクリーンショット確認、
  カテゴリチップのクリック→絞り込み→スクロール動作、シャーシの機器別展開/折りたたみ
  動作、コンソール/window エラー 0 件を確認。テスト128件・型チェック・ビルドとも
  既存どおり回帰なし(UI層のみの変更で DOM 非依存のエンジン側は無変更のため)。

---

## v4.16.1 — 2026-07-06

### Sprint 5.5 着手 — ヘッダー横漏れ修正 + コントラスト比改善

Sprint 5.5(全体UI/UXデザイン刷新)の Step 1 として、現状の全フェーズを
スクリーンショット/レイアウト計測ベースでレビューし、3件の問題を確認した:
①ヘッダーのモバイル横漏れ、②大型スイッチのシャーシSVGがモバイルで破綻、
③補足テキストのコントラスト比不足。影響度・リスクの低さから①③を先行修正。

- [修正] `.wrap.bar`(ロゴ + タグライン行)が `display:flex; flex-wrap:nowrap` で
  あったため、幅640px未満の画面ではタグライン(`.headmeta`)が画面外まで
  押し出され、**ページ全体が横スクロールする**不具合があった
  (実測: 375px 幅で scrollWidth 516px)。幅640px未満でタグラインを、
  幅480px未満で副題("Network Verification Atelier")も非表示にすることで、
  ブランド表示に必要な最小幅に収まるようにした。デスクトップ幅(640px以上)
  の表示は変更なし。
- [アクセシビリティ改善] `--faint`(`#5f5a51`)は背景 `#0d0d10` に対する
  コントラスト比が実測 約2.83:1 で、WCAG AA の通常文字基準(4.5:1)は
  もちろん大きい文字の基準(3:1)も満たしていなかった。ヘッダーのタグライン、
  ステップラベルの小文字、`.note`(ヒント文)、Findings の「なぜ問題か」の
  説明文など、ほぼ全フェーズの補足テキストに使われている色のため影響範囲が
  広い。色相は保ったまま `#817a6e` に明るくし、コントラスト比を約4.6:1
  まで改善(AA 基準クリア)。
- 残る②(シャーシSVGのモバイル対応)と、より大きな設計変更を伴う結果画面の
  情報密度の見直しは、Sprint 5.5 の後続タスクとして別途対応する。

---

## v4.16.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-7 — HSRP(standby)ビルダー UI(Sprint 5 フォローアップ完了)

- Cisco ビルダーフォームの SVI セクションに HSRP(`standby <group> ip <ip>`)の
  作成 UI を新設。`CiscoBuilderSvi.standbyGroup`/`standbyIp`(両方 null =
  未設定)で HSRP グループ番号・仮想 IP を GUI で設定できるようにした。
- 調査の結果、`parseCisco` の standby 行の正規表現(`^standby\s+\d+\s+ip\s+
  ([\d.]+)`)はグループ番号にマッチしつつも捕捉しておらず、仮想 IP のみを
  `ParsedInterface.standby: string | null` として保持していた。GUI 側の
  group フィールドを往復保証テストで検証できるようにするため、`\d+` を
  `(\d+)` に変えてグループ番号も捕捉するよう拡張し、型を
  `standby: StandbyConfig | null`(`{ group: string; ip: string }`)に変更した。
  他に `.standby` を参照する箇所は verify.ts を含め存在しないため、既存動作への
  影響はない。
- priority/preempt 等の HSRP 拡張構文は `parseCisco` が現状未対応のため、
  生成側でも意図的に含めない(「生成される全構文はパーサの正規表現に厳密
  準拠する」という往復保証の方針を維持するため。将来パーサを拡張すれば
  ビルダー側にもフィールドを足すだけで対応可能)。
- HSRP グループ番号は 0〜255(HSRP v1 の範囲。本ビルダーは `standby version
  2` を生成しないため拡張範囲の 0〜4095 は許可しない)の整数のみを許可する
  形式検証を追加。グループ番号・仮想 IP は両方任意だが、片方だけ入力された
  未完成な状態のみエラー表示する。
- テスト 1 ケース追加(HSRP group/仮想 IP が `parseCisco` で正しく読み戻せる
  こと)。テスト計 127 → 128 ケース、全 PASS(既存ケースへの回帰なし)。
  ブラウザでの実地確認: VLAN・SVI を作成し、HSRP group=1・仮想IP=
  192.168.10.254 を設定した状態で生成 → 検証まで一連の操作をエラーなく
  完走できることを確認(コンソールエラー 0 件)。
- **Sprint 5 フォローアップ(SF5-1〜SF5-7)が全項目完了**。次は Sprint 5.5
  (全体 UI/UX デザイン刷新)。

---

## v4.15.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-6 — Port-channel/channel-group ビルダー UI

- Cisco ビルダーフォームに Port-channel/channel-group(LACP/EtherChannel 束)の
  作成 UI を新設。`CiscoBuilderDraft.portChannels: CiscoBuilderPortChannel[]`
  で channel-group 番号・LACP モード(`ChannelGroupMode`:
  active/passive/on/desirable/auto の実機で有効な5値のみ)・switchport 設定
  (access/trunk)を一括定義できる。各ポートには
  `CiscoBuilderPort.channelGroup` を追加し、所属する channel-group を選択する
  ことでメンバーとして束ねられる。
- Sprint 4 S4-1(Port-channel 論理 IF → 物理メンバーへの継承)・S4-5(LACP 束の
  実効フォーミング判定)は既にエンジン側で実装済みだったが、GUI からその構成を
  組み立てる手段がなかった。generator は `interface Port-channel<N>` ブロック
  (switchport 設定を持つ場合のみ)と、各メンバーの `interface <phys>` 内に
  `channel-group <N> mode <mode>` を出力する。
- [設計] channel-group に所属させたポートは、そのポート個別の switchport
  設定(mode/accessVlan/trunk)を GUI 上で編集できないようにした。実機の
  L2 設定は Port-channel 側が正であり、メンバー間で設定が食い違う状態
  (まさに S4-5 が異常として検出する構成)を GUI からそもそも作れない設計にした
  (既存の「存在しないポートは作れない」設計哲学の延長)。
- channel-group 番号は 1 以上の整数のみを許可し、重複チェックを追加。
  Port-channel を削除すると、参照していたポートの channel-group 割当も自動的に
  解除する(SF5-3 の ACL 削除時のクリーンアップと同じ考え方。存在しない
  channel-group 番号が生成テキストに残らないようにするため)。
- テスト 3 ケース追加(Port-channel 側の switchport 設定の往復保証、物理
  メンバーポートの channel-group の往復保証、`mapToPorts` による S4-1 継承
  ロジックとの結合確認 — Port-channel 側の trunk 設定が実際に物理メンバー
  ポートへ継承されることを確認)。テスト計 124 → 127 ケース、全 PASS
  (既存ケースへの回帰なし)。ブラウザでの実地確認: channel-group 5 を作成し
  (mode=active、switchport mode trunk)、2 本の物理ポートをメンバーとして
  割り当てたところ、対象ポート行の switchport 設定が非表示になり
  「channel-group 5 のメンバー」の注記に切り替わることを確認。生成 → 検証まで
  一連の操作をエラーなく完走できることを確認(コンソールエラー 0 件)。

---

## v4.14.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-5 — address-object の range 型対応

- SonicWall ビルダーフォームのアドレスオブジェクトに `range` 型を追加
  (`SonicWallBuilderAddrObj.type: 'host' | 'network' | 'range'` +
  `from`/`to` フィールド)。パース側(`parseSonicWall`)と `evalFW.objContains`
  は `range` 型を既に完全サポート済みだったが、ビルダー UI 側だけが未対応
  だった箇所を埋めた。
- 生成される構文は `address-object ipv4 <name> range <from> <to>`。
  `parseSonicWall` の range 用正規表現は `zone` 句を読み取らないため、
  生成側も zone を出力せず、UI 側も range 選択時は Zone 入力欄を表示しない
  設計にした(往復不能な入力を GUI 上で作れないようにする、既存の設計哲学
  を踏襲)。
- 開始 IP・終了 IP の形式検証に加え、終了 IP が開始 IP 以上であることも
  検証するようにした。
- テスト 1 ケース追加(range の `from`/`to` が `parseSonicWall` で正しく
  読み戻せること)。テスト計 123 → 124 ケース、全 PASS(既存ケースへの
  回帰なし)。ブラウザでの実地確認: range 型アドレスオブジェクトを作成し、
  生成 → 検証まで一連の操作をエラーなく完走できることを確認
  (コンソールエラー 0 件)。

---

## v4.13.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-4 — DHCP プールビルダー UI

- Cisco ビルダーフォームに DHCP プール(`ip dhcp pool`)作成 UI を新設
  (`CiscoBuilderDraft.dhcpPools: CiscoBuilderDhcpPool[]`)。プール名・
  ネットワークアドレス・サブネットマスク・default-router を GUI で設定できる。
- パース側の `DhcpPool` は `network` を CIDR 表記に正規化済みの結果として
  保持するが、生成側は `network <ip> <mask>` という元の2トークン形式で
  出力する必要があるため、ビルダー側では ip/mask を別フィールドとして保持する
  設計にした(往復時に `subnetOf()` で再度 CIDR 化される)。
- IP アドレス・サブネットマスクの形式検証を追加。
- テスト 1 ケース追加(`network`/`default-router` が `parseCisco` で正しい
  CIDR 表記に変換されて読み戻せること)。テスト計 122 → 123 ケース、全 PASS
  (既存ケースへの回帰なし)。ブラウザでの実地確認: DHCP プールを作成し、
  生成 → 検証まで一連の操作をエラーなく完走できることを確認
  (コンソールエラー 0 件)。

---

## v4.12.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-3 — ACL ビルダー UI

- Cisco ビルダーフォームに ACL(アクセスリスト)作成 UI を新設。従来「意図的に
  省いているもの」として generator のコメントに明記していたスコープ外機能を
  実装した。
- `CiscoBuilderDraft.acls: CiscoBuilderAcl[]` を新設(`{ name, lines: AclLine[] }`。
  `AclLine` は既存の `CiscoParsed.acls` と同じ `{action, rest}` 形を再利用)。
  `CiscoBuilderPort` に `aclIn`/`aclOut` を追加し、ポートへの `ip access-group
  <name> in/out` 適用を GUI から設定できるようにした。
- 生成される構文は `ip access-list extended <name>` ブロック + `permit`/`deny
  <rest>` 行。`src/engine/parsers/cisco.ts` の既存正規表現に厳密準拠し、
  往復保証テストで検証済み。
- UX: ACL 名の重複チェック、各ルール行の内容(`rest`)の未入力チェックを追加
  (H-1 の入力検証パターンに準拠)。ACL を削除すると、それを参照していた
  ポートの `aclIn`/`aclOut` も自動的に null へ戻す(存在しない ACL 名への
  参照が生成テキストに残らないようにするための安全策)。
- テスト 2 ケース追加(ACL 本体の permit/deny が `parseCisco` で正しく読み戻せる
  こと、`ip access-group` によるポート適用が読み戻せること)。テスト計 120 →
  122 ケース、全 PASS(既存ケースへの回帰なし)。ブラウザでの実地確認: ACL を
  作成 → ルール行を追加 → 未入力行に検証エラーが表示されることを確認 →
  ポートの「ACL in / ACL out」セレクトに作成した ACL 名が選択肢として現れる
  ことを確認(コンソールエラー 0 件)。

---

## v4.11.0 — 2026-07-05

### Sprint 5 フォローアップ SF5-2 — STP priority 入力欄

- Cisco ビルダーフォーム(GUI 作成モード)に `spanning-tree priority` の選択欄を
  追加した(`CiscoBuilderDraft.stpPriority`)。Sprint 4 S4-4 で実装した STP root
  election 推定機能は `spanning-tree priority` を読み取って動作するが、これまで
  GUI 作成モードにはこの値を設定する手段が無かった(投入モードでアップロードした
  コンフィグでのみ利用可能だった)。
- 実機の Cisco IOS/IOS-XE で有効な値は 4096 刻みの16段階(0, 4096, 8192, ...,
  61440)のみで、それ以外の値を設定すると実機側で拒否される。この制約を
  `<select>` の選択肢自体に反映し、不正な値をそもそも作れない設計にした
  (`device.ports` をそのまま編集対象にして「存在しないポートは作れない」ように
  している既存の設計哲学と同じ考え方)。
- `generateCiscoConfig`(ジェネレータ)・`initCiscoDraft`(初期化ヘルパ)も
  それぞれ対応。未設定(null)の場合は行を出力せず、IEEE/Cisco 既定値 32768 が
  暗黙的に適用される(Sprint 3 P3-3 の既定値モデル化と一貫した扱い)。
- テスト 1 ケース追加(`generateCiscoConfig` → `parseCisco` で `stpPriority` が
  正しく往復すること)。テスト計 119 → 120 ケース、全 PASS(既存ケースへの
  回帰なし)。ブラウザでの実地確認: ビルダーフォームで priority を選択 → 生成 →
  検証まで一連の操作をエラーなく完走できることを確認(コンソールエラー 0 件)。

---

## v4.10.1 — 2026-07-05

### Sprint 5 フォローアップ SF5-1 — 機種上限のリアルタイム制限

- Sprint 4 完了を受け、Sprint 5 フォローアップ(GUI 作成モードの精度向上)に着手。
  影響度・使用頻度順に着手する方針。
- Cisco/SonicWall のビルダーフォームで、VLAN 数(`maxVlansSupported`)・SVI 数
  (`maxSviCount`)・VLAN サブインターフェイス数(`maxVlanInterfaces`)が機種上限に
  到達すると、「+ 追加」ボタンを disabled にするようにした。従来(H-2、v4.1.0)は
  上限超過を警告表示するのみで実際の追加は妨げず、生成 → 検証まで進んで初めて
  CAP エラーとして気づく構造だった。「存在しないポートは作れない」という既存の
  設計哲学(device.ports をそのまま編集対象にする)を VLAN/SVI 数にも広げた形。
- ブラウザでの実地確認: Catalyst 1000-24T(上限64 VLAN)に対し VLAN を64個
  追加したところ、「+ VLAN 追加」ボタンが disabled になり「⚠ VLAN 数 64 が
  C1000-24 の上限(64)に到達しているため、これ以上追加できません。」という
  メッセージが表示されることを確認(コンソールエラー 0 件)。エンジンには
  変更が無いため既存 119 テストはそのまま全 PASS。

---

## v4.10.0 — 2026-07-05

### Sprint 4 S4-6 — ルーティングテーブル上限チェック(Sprint 4 完了)

- `catalog.ts` に定義済みだが一度も参照されていなかった2つの CAP フィールドを
  精査した:
  - **`maxRoutingEntries`(実装)**: 直結ルート(SVI 数)+ 静的ルート(`ip route`)
    の合計が SKU の上限を超過している場合に CAP err を発火するようにした。
    OSPF/EIGRP/BGP 等の動的プロトコルで学習される経路は FACET では計算して
    いないため、実際のルーティングテーブルはこれ以上のエントリを持ち得る
    (下限見積りとして扱う設計。過大評価を避けるため、静的に確認できる
    エントリだけで既に超過している場合のみ発火する)。
  - **`maxMacAddresses`(意図的に未実装)**: MAC アドレステーブルの使用量は
    「実際に何台の端末がどのポートに接続されるか」に依存し、これは静的な
    コンフィグテキストからは原理的に導出できない(コンフィグは「何が接続され
    得るか」を宣言するのみで「何が実際に接続されるか」は含まない)。将来
    `mac address-table static` 等の静的エントリ解析を追加すれば部分的な
    チェックは可能だが、実務での出現頻度が低いため優先度は低いと判断し、
    現時点では未実装のままとした。調査結果は `docs/VERIFICATION-RULES.md` に
    記録。
- テスト 2 ケース追加(静的ルート数が上限を超過した場合の CAP err 発火、
  上限未満での非発火)。テスト計 117 → 119 ケース、全 PASS(既存ケースへの
  回帰なし)。ブラウザでの実地確認: Catalyst 1000-24T(上限64エントリ)に
  対し静的ルートを70本投入したコンフィグを検証し、「ルーティングテーブルの
  静的エントリ数(直結 0 + 静的ルート 70 = 70)が SKU 上限 64 を超過。」という
  CAP finding が正しく表示されることを確認(コンソールエラー 0 件)。
- **Sprint 4(評価エンジンのリアリズム強化)完了**。着手前のコード調査で
  洗い出した S4-1〜S4-6 の全項目を実装・テスト・実地確認済み。v4.5.0 開始時点
  からテスト 101 → 119 ケースに拡充。

---

## v4.9.0 — 2026-07-05

### Sprint 4 S4-5 — LACP/EtherChannel 束の実効フォーミング判定

- 既存の L1 チェック(1本のリンクの両端 channel-group モードが互換か)は
  「宣言された1本のリンク単位」でしか見ておらず、channel-group の全メンバー
  ポートが実際に正しく束を形成できるかは検証していなかった。`verify.ts` に
  channel-group 単位の走査を追加し、以下を検出するようにした:
  - メンバーポートが複数の異なる機器に接続されている → err
    (LACP/EtherChannel は同一の対向機器への物理リンクの束である必要がある)
  - 対向側に channel-group 未設定のポートが含まれる → err
    (片側だけ EtherChannel を構成しても対向は個別リンクとして扱う)
  - 対向側のポートが複数の異なる channel-group にまたがっている → err
  - メンバーポート数が対向と非対称 → lack(束は形成され得るが帯域・冗長性が
    意図通りにならない可能性)
  - どのメンバーにもリンクが宣言されていない場合は判定不能として silent skip
    (既存の CAP capabilities 未定義時と同じ方針)
- channel-group の番号(id)はデバイスごとにローカルな識別子として扱う
  (実機の Cisco IOS 仕様と同様、両devices間で番号が一致している必要はない)。
- テスト 5 ケース追加(対称構成では新規 finding が発火しないことの確認、
  複数機器への分散接続、対向側の channel-group 未設定、対向側の
  channel-group 不一致、メンバーポート数の非対称)。テスト計 112 → 117
  ケース、全 PASS(既存ケースへの回帰なし)。ブラウザでの実地確認: 手動配線
  モードで SW1↔SW2 間に2本の冗長リンクを作成し、SW1 側は channel-group 1
  で統一、SW2 側は片方のポートのみ channel-group 9(片方は trunk のみで
  channel-group 未設定)という不整合な構成を投入したところ、期待通り
  「対向 SW2 側に channel-group 未設定のポートが含まれています」という
  finding が表示されることを確認(コンソールエラー 0 件)。

---

## v4.8.0 — 2026-07-05

### Sprint 4 S4-4 — STP root election + UI文言改善

- **`spanning-tree priority` / `spanning-tree vlan <list> priority`** のパースを
  `parseCisco` に追加(`CiscoParsed.stpPriority`)。未設定時は IEEE/Cisco 既定値
  32768 として扱う。
- **`electStpRootAndBlockingEdges()`**(`verify.ts`)を新設。L2 ループ検出時に
  簡易的な STP root election を行う: priority が最小のスイッチをルートブリッジと
  推定し(同点時は device key の文字列比較でタイブレーク。実機は MAC アドレスで
  比較するが FACET は保持していないための簡易化)、ルートからの BFS ホップ数を
  実リンクコストの近似として使い、スパニングツリーに含まれない冗長エッジの
  ブロック側を推定する。両端の距離が同じで判定できない場合は「特定できず」と
  誠実に報告する(実際にはリンクコストや bridge ID の比較が必要なため、断定しない)。
  STP カテゴリの finding の `why` に、推定ルートブリッジと推定ブロックポートを
  付記するようにした。
- **UI文言改善**:「GUI でコンフィグを作成」画面(作成モード Phase 03)の説明文が
  一文に詰め込まれすぎて分かりにくかったため、「何を入力するか→何を押すか→
  何ができるか→その後どうなるか」の4つの短文に分割。
- テスト 4 ケース追加(priority によるルートブリッジ選出、priority 未設定同士の
  device key タイブレーク、4 台リングでの冗長エッジのブロック側の一意特定、
  対称な三角形トポロジーでの「特定できず」という誠実な報告)。テスト計 108 →
  112 ケース、全 PASS(既存ケースへの回帰なし。既存の finding 文字列
  `desc`/`fix` は変更せず、詳細情報は `why` にのみ追記したため)。ブラウザでの
  実地確認: Phase 02 の手動配線モードで実際に SW1↔SW2 間へポートクリックにより
  冗長リンクを作成し、`spanning-tree priority 100` を設定した SW1 が正しく
  ルートブリッジとして推定され、対称な冗長エッジ(R1↔SW2)は「特定できず」、
  非対称な冗長エッジ(SW2側)は具体的なポート名まで特定されることを確認
  (コンソールエラー 0 件)。

---

## v4.7.0 — 2026-07-05

### Sprint 4 S4-3 — SonicWall 組み込みアドレスグループ

- **`objContains`**(`evalFW.ts`、FW ルール評価の中核ヘルパ)を拡張し、SonicOS の
  組み込みアドレスグループ `"<Zone> Subnets"`(例: `"LAN Subnets"`、`"WAN
  Subnets"`)を解決できるようにした。ゾーンに割り当てられた全インターフェイスの
  サブネットの和集合として動的に判定する。ユーザーが明示的に同名のカスタム
  アドレスオブジェクトを定義している場合はそちらを優先する。
- この組み込みグループが SonicOS に実在することは、SonicWall 公式の SonicOS 6.5
  Enterprise Command Line Interface Reference Guide を直接読み、複数箇所
  (`show address-group ipv4 "LAN Subnets"`、`vpn-client-access name "LAN
  Subnets"` 等)で確認した上で実装している。
- **カスタム address-group / service-group のメンバー展開は意図的に見送った**。
  同リファレンスガイドは `address-group ipv4 "<name>"` によるグループ自体の
  作成・削除コマンドは文書化しているが、個々の address-object をグループの
  メンバーとして追加する CLI コマンドの構文を見つけることができなかった。
  推測で構文をでっち上げて実装するのは FACET の「確証の無い判定を主張しない」
  という方針に反するため、この部分は未実装のまま `docs/PARSER-NOTES.md` に
  調査結果を記録し、P3-4(実機フィクスチャ)で実データが手に入った際に再調査する
  こととした。
- `objContains` の第一引数の型を `Record<string, AddressObject>` から
  `{ addr: ...; interfaces?: ... }` に拡張(呼び出し元は `evalFW.ts` と
  `pathTrace.ts` の 2 箇所のみで、いずれも本コミットで追随済み)。
- テスト 2 ケース追加(複数の LAN ゾーンサブネット — 直接 IF と VLAN サブ IF
  の両方 — がいずれも "LAN Subnets" に含まれること、他ゾーンの IP は含まれない
  こと)。テスト計 106 → 108 ケース、全 PASS(既存ケースへの回帰なし)。ブラウザ
  での実地確認: "LAN Subnets" を参照する access-rule を含む SonicWall コンフィグを
  投入し、到達性マトリクスで LAN ゾーンの複数サブネットがいずれも正しく許可
  (○)されることを確認(コンソールエラー 0 件)。

---

## v4.6.0 — 2026-07-05

### Sprint 4 S4-2 — SonicWall NAT/静的ルート評価の実質化

- **`pathTrace.ts`**: NAT ホップの評価を実質化。従来は `nat.length > 0` という
  だけで無条件に「明示的 NAT ポリシーで送元変換」と表示しており、そのポリシーが
  実際にこの通信(送元 IP・アウトバウンドインターフェイス)に一致するかどうかを
  一切見ていなかった。`findMatchingNat()` を新設し、`original-source`(address-
  object 経由で送元 IP を含むか)と `outbound-interface` の両方を満たす最初の
  ポリシーを採用する(SonicOS の上から順に最初の一致を採用する評価方式に準拠)。
  一致するポリシーが無い場合は「定義済み NAT ポリシー N 件はあるが、この通信に
  一致する条件が見つからない」と明示するようにした。
- **`verify.ts`**: `parseCisco`/`parseSonicWall` が抽出する静的ルート(Cisco の
  `ip route`、SonicWall の `route-policy`)が、これまで verify() から一切参照
  されていなかった問題を修正。next-hop が既知のどのサブネット(構成済みイン
  ターフェイスから導出)にも属さない静的ルートは実際には機能しないため、L3
  カテゴリで検出するようにした(DHCP `default-router` 不一致チェックと同じ
  パターン)。
- テスト 5 ケース追加(NAT ポリシー一致・不一致・未定義の 3 パターン、静的ルート
  next-hop の到達可否 2 パターン)。テスト計 101 → 106 ケース、全 PASS(既存
  ケースへの回帰なし。既存 fixture はいずれも `ip route`/`route-policy`/
  `nat-policy` を使用していなかったため、拡張前の挙動を偶然にも壊していなかった
  ことを確認済み)。ブラウザでの実地確認: SonicWall コンフィグに `nat-policy` を
  含めて Phase 05 の経路トレースを実行し、該当 NAT ポリシーの内容
  (`original-source=net-lan → translated-source=X1-IP, outbound=X1`)が正しく
  表示されることを確認(コンソールエラー 0 件)。

---

## v4.5.0 — 2026-07-05

### Sprint 4 S4-1 — Cisco Port-channel 設定の継承

- Sprint 3 完了を受け、Sprint 4(評価エンジンのリアリズム強化)に着手。着手前に
  `evalFW`/`pathTrace`/`mapToPorts`/`verify.ts` を精査し、影響が大きい順に着手する
  方針で合意。
- **`mapToPorts.ts`**: `interface Port-channel<N>` に設定された switchport/trunk
  設定を、対応する物理メンバーポート(`channel-group <N> mode ...` を持つポート)へ
  継承するロジックを追加。実務では L2 設定を Port-channel 側にのみ書き、物理
  メンバー側には channel-group コマンドしか書かないパターンが一般的だが、
  `Port-channel<N>` という論理インターフェイス名は `canonIf()` でどの物理ポート
  ラベルにも一致しないため、従来はこの設定がサイレントに読み捨てられ、メンバー
  ポートは「switchport mode 未指定」の bare ポートとして誤って評価されていた。
- 継承対象: `mode` / `accessVlan` / `trunkNative` / `trunkAllowed` / `ip`・`mask` /
  `description`。メンバー側が既に自分自身の値を持っている項目は上書きしない
  (SonicWall の VLAN サブインターフェイス zone 継承と同じ「未設定のみ埋める」方針)。
  SonicWall の `ParsedInterface.channel` は常に null のため、この処理は Cisco の
  Port-channel 構成にのみ作用する。
- テスト 3 ケース追加(継承の基本動作、メンバー側の明示設定を上書きしないこと、
  対応する Port-channel が存在しないチャネル番号でクラッシュしないこと)。
  テスト計 98 → 101 ケース、全 PASS(既存ケースへの回帰なし)。

---

## v4.4.0 — 2026-07-04

### Sprint 3 P3-3 — 暗黙既定値のモデル化

- **L2**: `switchport mode` 未指定ポートに対する注意喚起を拡張。従来は `accessVlan` /
  `trunkAllowed` が設定済みの場合のみ発火していたが(「VLAN は書いたがモードを
  忘れた」ケースのみ検出)、完全に未設定のポート(いわゆる bare interface)でも
  同様に発火するよう拡張した。メッセージも「機種既定の dynamic auto として動作する」
  ことを明示するように変更(本カタログの全 SKU — Catalyst 1000/2960-X/9200/9300 —
  は DTP 既定モードが `dynamic auto` であることをウェブ調査で確認。旧 2950/3550 等の
  `dynamic desirable` とは異なる)。
- **STP(過大評価の是正)**: L2 ループ検出において、`spanning-tree mode` 未設定の
  スイッチが含まれる場合に `err`(「STP 無し」)と判定していたロジックを修正。
  ウェブ調査により、本カタログの全 SKU は `spanning-tree mode` 未指定時
  Rapid-PVST+ が既定(2960-X/1000 は IOS 15.2(4)E 以降、9200/9300 は IOS-XE)である
  ことが判明したため、未設定 ≠ STP 無効という誤った前提を撤回。未設定でも
  既定動作でループが保護されている前提に修正し、判定を `lack`(明示設定を推奨)へ
  格下げした。FACET は静的解析であり実機の稼働状態そのものは検証できないため、
  断定は避けるメッセージにしている。
- **ドキュメント整合性の是正**: `docs/VERIFICATION-RULES.md` が TypeScript 移行
  (v4.0.0)以前の記述のまま放置されていたことが判明。CAP カテゴリ(Sprint 2 で
  追加済み)の記載が丸ごと欠落していたほか、`src/facet-core.js` / `app/facet.html`
  (いずれも deprecated)を参照する古い「ルールの追加方法」が残っていた。現状の
  `src/engine/verify.ts` / `test/engine/engine.test.ts` を参照する内容に是正し、
  P3-2/P3-3 の変更点も反映した。あわせて `docs/ROADMAP.md` の P3-2 完了バージョン
  表記の誤り(v4.2.0 → 正しくは v4.3.0)も修正。
- テスト 5 ケース追加(L2 dynamic auto 拡張の新旧比較、STP lack 化の新旧比較)。
  テスト計 93 → 98 ケース、全 PASS(既存ケースへの回帰なし。いずれの既存 fixture も
  bare interface / STP 未設定ループのシナリオを含んでいなかったため、拡張前の
  挙動を偶然にも壊していなかったことをテストで確認済み)。

---

## v4.3.0 — 2026-07-04

### Sprint 3 P3-2 — プラットフォーム判別(NX-OS/IOS-XE誤投入検知)

- `parseCisco` に `platformHint`(`PlatformHint` 型)を追加。投入コンフィグのテキストから、
  選択機種の OS ファミリー(`catalog.ts` の `SwitchCapabilities.osVersions`)と矛盾する
  構文シグナルが無いかを検出する。検出ロジック(`detectPlatformHint()`)は既存の抽出
  ロジックから完全に独立した追加スキャンで、`out`/`cur` 等の既存状態には一切触れない
  (ゼロ回帰)。
- **NX-OS 判別**: `feature <name>` / `feature-set` / `vdc <name> id <n>` /
  `interface mgmt0` / `vrf context <name>` / `boot nxos|kickstart bootflash:` を検出。
  FACET のカタログに NX-OS 機器は存在しないため、検出 = カタログ対象外の機種の
  コンフィグが投入された可能性が高いというシグナルとして扱う(CAP err)。
- **classic IOS vs IOS-XE 判別**: 一般則としての判別は信頼できる方法が無いことを
  ウェブ調査で確認した上で、FACET のカタログという閉じた集合(Catalyst 9000系=IOS-XE、
  2960-X/1000系=classic IOS)の中でのみ実用的な代理指標を採用。
  `license boot level network-essentials|network-advantage|dna-*`(IOS-XE 側の
  ライセンス階層名)、`packages.conf`(install mode)、`platform punt-keepalive|qos|ptp|
  sudi|tcam-limit`(FED 固有コマンド)、`service call-home` + `license smart transport
  callhome` のクラスタ(Smart Licensing、単体では非決定的なため両方必須)を IOS-XE 側の
  シグナルとし、`license boot level lanbase|lanlite|ipservices` を classic IOS 側の
  シグナルとした。選択機種の OS ファミリーと矛盾する場合は CAP err を発火
  (機種選択・アップロードファイルの取り違えを早期発見)。
- **SonicOS 6/7 判別は実装を見送り**: 公式の SonicOS/X 7 Command Line Interface
  Reference Guide が bot 対策(Imperva)で取得できず、CLI テキストレベルでの信頼できる
  判別根拠が確認できなかった。加えて SonicOS 7 には Classic Mode(6.5 相当)と
  Policy Mode(SonicOSX、別体系)があり、ファームウェアバージョンだけではモードも
  判定できないことが判明。確証の無い判定ロジックを実装しない方針を優先し、
  `SonicWallParsed` には `platformHint` を追加していない。Policy Mode 等の非対応方言は
  既存の `ParseCoverage`(v4.2.0)の認識率低下として自然に可視化されるため、実用上の
  セーフティネットは既に機能している。調査結果は `docs/PARSER-NOTES.md` に記録。
- テスト 12 ケース追加(NX-OS/IOS-XE/classic IOS シグナル検出、CAP 突合の一致/不一致、
  誤検出防止 `license feature X` 等)。テスト計 81 → 93 ケース、全 PASS(既存ケースへの
  回帰なし)。

---

## v4.2.0 — 2026-07-04

### Sprint 3 P3-1 — パーサ・カバレッジの可視化

- `ParseCoverage` 型を新設(`totalLines` / `recognizedLines` / `unrecognizedLines` /
  `coveragePercent`)。`parseCisco` / `parseSonicWall` の両方が返り値に `coverage` を
  含めるようになった。空行は「認識に失敗したコンテンツ」ではなく構造上の区切りのため
  分母(`totalLines`)に含めない。
- **Cisco**: 制御フロー上「未認識」と判定できる箇所はちょうど2つ
  (`vlan`/`name` 待ちブロックの末尾フォールスルー、インターフェース本体
  if/else-if チェーンの末尾)。この2箇所にのみ計測ロジックを追加し、
  既存の抽出ロジック・正規表現は一切変更していない。
- **SonicWall**: `nat`/`rule` ブロックが内部の一致有無に関わらず無条件で `continue`
  する構造のため、行ごとに `recognized` フラグを立てるラベル付きブロック方式
  (`matchLine: { ...; break matchLine; }`)を採用。ネストしたループが存在しないため
  `continue` と `break matchLine` は完全に等価で、既存の分岐条件・実行順序は不変。
- **UI**: Phase 03 投入モードの各スロットに「認識率 92%(3行未対応)」のような
  カバレッジ表示を追加。100% 未満の場合は警告色(topaz)で強調し、
  未対応行の一覧(行番号+内容)をツールチップで確認できる。静的解析ツールとして
  「何を検証できていないか」を隠さない方針の一環。
- 既存の匿名サンプル(`SMP_C1`)を実際にパースしたところ `line vty 0 4` が
  未対応行として検出された(想定どおりの検出動作。この行自体は Sprint 3 の
  後続ステップで対応予定)。
- カバレッジ専用テストを 7 ケース追加(意図的に未認識行を仕込んだ Cisco/SonicWall
  フィクスチャを含む)。テスト計 74 → 81 ケース、全 PASS(既存ケースへの回帰なし)。

---

## v4.1.0 — 2026-07-04

> **プロセス注記**: このエントリは Sprint 2 / Sprint 5 MVP / GUI ハードニングの
> 3 つの作業をまとめて記録している。本来はそれぞれで `package.json` の version と
> `src/ui/versionHistory.ts` を更新すべきだったが、当時は更新せずコミットしており、
> 旧版の本ファイルでは同じ "v4.0.0" ラベルの下に日付違いのセクションが並存していた
> (バージョン表記のあいまいさ)。本エントリで正しいバージョン番号(4.1.0)に是正し、
> 以降は `test/version.test.ts` が `package.json` と `versionHistory.ts` の不一致を
> 機械的に検出するため、同じ事故は起きない(CLAUDE.md 参照)。

### プロセス — バージョン管理の厳格化
- `src/ui/versionHistory.ts` を新設(バージョン履歴の単一ソース・オブ・トゥルース)。
  ヘッダーのバージョンバッジをクリックするとバージョン履歴モーダルを表示。
- `test/version.test.ts` で `package.json` の version と `versionHistory.ts` の
  整合性を自動チェック。ずれると `npm test` が失敗する。テスト計 70 → 74 ケース。

### Sprint 2 — 機材カタログ実物化
- SonicWall 全 7 SKU / Cisco 全 8 SKU の物理仕様を datasheet 精読で正確化
  (v3.1.0 で誤っていた TZ370/470/570/670 のポート構成を修正)
- `RouterCapabilities` / `SwitchCapabilities` 型を新設、Firewall/VPN throughput、
  Max VLAN/MAC/ACL、STP variant、PoE 等を SKU ごとに保持
- **CAP カテゴリ**新設:機材能力を超える設定(VLAN数超過、PAgP非対応、
  STP variant非対応等)を検出
- Phase 01 に capability chip、ポート tooltip に PoE 情報を表示
- テスト 46 → 50 ケース

### Sprint 5 MVP — 「GUI でゼロから作成」モード
- 当初計画(Sprint 3/4 の後に着手)を前倒し。ユーザーヒアリングでこれが
  FACET の核心機能と判明したため優先度を繰り上げ
- `src/engine/generators/{cisco,sonicwall}.ts` — draft(フォーム編集用データ)
  → running-config / SonicOS CLI テキストのジェネレータを新設
- 往復保証を構造で担保:生成テキストは既存の `parseCisco`/`parseSonicWall` で
  再パースして `device.parsed` を作るため、検証パイプラインは投入モードと完全共通
- Phase 00「作成モード」を有効化、Phase 03 が投入フォーム/GUI構築フォームに
  動的切替
- Cisco/SonicWall 双方の GUI フォーム(VLAN・ポート・FWルール・NAT等)を実装
- 「⇩ ダウンロード」で生成テキストをそのまま実機投入可能
- 往復保証テスト 20 ケース追加(`test/engine/builder.test.ts`)。テスト計 70 ケース

### GUI ハードニング — Sprint 5 MVP のフォローアップ
- **入力検証**(`src/ui/components/builder/validation.ts`):IP/マスク/VLAN ID/
  hostname の形式チェック、赤枠+エラー文でインライン表示、不正時は生成ボタン無効化
- **機種上限のリアルタイム警告**:VLAN数/SVI数(Cisco)、VLANサブIF数(SonicWall)を
  capabilities と比較し、生成前にその場で警告
- **バグ修正**:トポロジー再構成(`BUILD_TOPOLOGY`)時に古い `builderDrafts` が
  残存し、実ポート数と不整合を起こす問題を修正
- **データロス防止**:機種/台数変更で既存データが失われる唯一の箇所に確認ダイアログ、
  機器ごとの個別リセットボタンを追加
- **GUI デザイン刷新**:セクション見出しを `.eyebrow` と同じ金線トリートメントに統一、
  ポート行をステータス色分け(access=emerald / trunk=gold / shutdown=garnet)、
  カスタムチェックボックス、CSS Grid による整列、機器ごとの完成度サマリ表示

---

## v4.0.0 — 2026-06-23

### Sprint 1.5 — Vite + React + TypeScript ポート

#### アーキテクチャ
- **TypeScript 5(strict)+ Vite 5 + React 18** に全面移行。
- エンジンを `src/engine/*.ts` に分割(types / catalog / ip / canonIf / parsers / 
  mapToPorts / buildSubnets / evalFW / buildMatrix / pathTrace / verify / autoLinks)。
- UI を `src/ui/**/*.tsx` に React コンポーネント化(`useReducer` + Context の中央
  集権 store)。Phase 7 個 + 共有コンポーネント 13 個。
- `vite-plugin-singlefile` で配布物は引き続き **単一 HTML**(`dist/index.html`、
  約 220KB、外部依存ゼロ)。利用者の体験は v3.1.0 と同等(ダブルクリック起動)。
- Path alias `@engine/*` / `@ui/*` で UI → エンジン内部直接 import を防止。

#### 解消した負債
- **エンジン二重化解消**:旧 `src/facet-core.js` と `app/facet.html` 内コピーの手動
  同期が不要に。今後は `src/engine/` のみが正典。
- **型システム導入**:Port/Device/Finding/Catalog/AST 等の全公開型を `types.ts` に
  定義し、機材カタログとパーサ AST の型安全性を担保。Sprint 2 以降の機材精度向上の
  土台。
- **Google Fonts CDN 撤去**:Sprint 1 で既に開始した外部依存撤去を完了。SVG 内の
  `font-family` も Meiryo UI / Consolas に置換。

#### テスト
- 旧 `test/facet.test.js`(plain-Node)→ `test/engine/engine.test.ts`(Vitest)に移行。
  既存 46 ケース全 PASS、Sprint 1 で追加した svcMatch 双方向 / pathTrace 同一サブネット
  のケースも維持。
- `npm test` で 7ms 実行(エンジン純関数のみ、jsdom 不要)。

#### DEPRECATED
- `app/facet.html`(v3.1.0 単一 HTML 版)
- `src/facet-core.js`(v3.1.0 エンジン IIFE)
- `test/facet.test.js`(v3.1.0 plain-Node テスト)

履歴用に残置、編集禁止。新側を編集する。

#### ドキュメント
- `CLAUDE.md` を v4.0.0 構成で全面書き直し
- `README.md` を利用者/開発者の 2 視点で書き直し
- `docs/ARCHITECTURE.md` を v4.0.0 アーキテクチャに更新
- `docs/ROADMAP.md` を Sprint 1.5 完了 → Sprint 2(機材カタログ実物化)最優先に再構成
- `docs/PUBLISHING.md` を新ビルドフロー(`npm run build`)+ Cloudflare Pages 推奨に更新
- `docs/PARSER-NOTES.md` に TS 移行注記
- `docs/SPRINT-1.5-DESIGN.md` を ✅ COMPLETED に

---

## v3.1.0 — 2026-05-24

### Sprint 1 — 信頼回復 & UX 整備

#### エンジンバグ修正
- **`svcMatch` を双方向 overlap 判定に修正**:旧来「rule.service が定義されているか」
  しか見ておらず、ルールが `svc-https` のとき任意の service が match する致命バグを
  解消。マトリクスと経路トレースの allow 判定が正しくなる。
- **`pathTrace` 同一サブネット時に L2/GW/RT/FW を出さない構造に修正**:同一サブネット
  通信で存在しない GW ホップが出る UX バグを解消。

#### UI
- フォントを **Meiryo UI に統一**(等幅のみ Consolas)、Google Fonts CDN への外部依存を撤去
- **Phase 00「モード選択」**を新設(① 検証モード / ② 作成モード = Coming Soon)
- 手動トポロジーを **SVG クリック式**に刷新(ポートクリック→別機器ポートクリックで配線)
- Phase 03 に **「⇩ ダウンロード」**を機器毎に設置(投入済コンフィグを取り出し可)
- スロットに **パース概要**(IF/VLAN/rules/NAT 件数)を表示
- `reIntake` を完全クリア(config / parsed / port 状態 / 結果すべて初期化)

#### テスト
- svcMatch 双方向 6 ケース + pathTrace 同一サブネット 3 ケースを追加(計 46 ケース)

#### 文字化け修正
- HTML 本文に直書きされていた `\uXXXX` エスケープが文字列のまま表示される問題を修正
  (本文領域のみ実 Unicode 文字へデコード)
- 1958 個のエスケープを処理、`<script>` 内 JS リテラルも全面デコードしてレビュー可能化

---

## v3.0 — initial

単一ファイル配信版 v3。Phase 01〜05 ウィザード、Cisco / SonicWall パーサ、6 カテゴリ検証、
到達性マトリクス、経路トレース。

---

## v2 / v1

`app/legacy/facet_v1.html` / `facet_v2.html` に履歴のみ保存。
