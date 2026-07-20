const fs=require('fs');
const path=require('path');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,LevelFormat,
 HeadingLevel,BorderStyle,WidthType,ShadingType,VerticalAlign,PageNumber,PageBreak,
 TableOfContents,Header,Footer,ExternalHyperlink,ImageRun}=require('docx');

const FONT="Meiryo UI";
const INK="1A1A1A", GOLD="A8884E", GOLDD="8C744A", LINE="CCCCCC";
const CW=10466; // A4 width 11906 - margins 720*2
const FACET_URL="https://facet.yuki-mats.workers.dev";

/* ---- palette for status swatches ---- */
const EMER="6BBF9A", GARN="D56B62", TOPA="D9A648", STEE="8A8A92", SAPP="6F93D4";

/* ---- helpers ---- */
function P(text,opt){opt=opt||{};return new Paragraph({spacing:{after:opt.after===undefined?120:opt.after,before:opt.before||0,line:300},
  alignment:opt.align,children:Array.isArray(text)?text:[new TextRun({text:text,bold:opt.bold,italics:opt.italics,color:opt.color||INK,size:opt.size||21})]});}
function H1(t){return new Paragraph({heading:HeadingLevel.HEADING_1,children:[new TextRun({text:t})]});}
function H2(t){return new Paragraph({heading:HeadingLevel.HEADING_2,children:[new TextRun({text:t})]});}
function H3(t){return new Paragraph({heading:HeadingLevel.HEADING_3,children:[new TextRun({text:t})]});}
function bullet(t,lvl){return new Paragraph({numbering:{reference:"b",level:lvl||0},spacing:{after:60,line:290},
  children:Array.isArray(t)?t:[new TextRun({text:t,size:21,color:INK})]});}
function step(t,ref){return new Paragraph({numbering:{reference:ref,level:0},spacing:{after:80,line:300},
  children:Array.isArray(t)?t:[new TextRun({text:t,size:21,color:INK})]});}
function run(text,o){o=o||{};return new TextRun({text:text,bold:o.bold,italics:o.italics,color:o.color||INK,size:o.size||21,font:o.font});}
function mono(text){return new TextRun({text:text,font:"Consolas",size:20,color:"303030"});}

const bd={style:BorderStyle.SINGLE,size:1,color:LINE};
const borders={top:bd,bottom:bd,left:bd,right:bd};
const cellMargin={top:60,bottom:60,left:120,right:120};
function cell(children,o){o=o||{};return new TableCell({borders,width:{size:o.w,type:WidthType.DXA},
  shading:o.fill?{fill:o.fill,type:ShadingType.CLEAR}:undefined,margins:cellMargin,verticalAlign:VerticalAlign.CENTER,
  children:children.map(function(c){return typeof c==='string'?P(c,{after:0,size:o.size||20}):c;})});}
function hcell(text,w){return new TableCell({borders,width:{size:w,type:WidthType.DXA},shading:{fill:"2E2A24",type:ShadingType.CLEAR},
  margins:cellMargin,verticalAlign:VerticalAlign.CENTER,children:[P([new TextRun({text:text,bold:true,color:"FFFFFF",size:20})],{after:0})]});}
function tbl(widths,headerRow,rows){
  var trs=[];
  if(headerRow)trs.push(new TableRow({tableHeader:true,children:headerRow.map(function(h,i){return hcell(h,widths[i]);})}));
  rows.forEach(function(r){trs.push(new TableRow({children:r.map(function(c,i){
    if(c&&c.__cell)return c.build(widths[i]);
    return cell(Array.isArray(c)?c:[typeof c==='string'?P(c,{after:0,size:20}):c],{w:widths[i]});})}));});
  return new Table({width:{size:widths.reduce((a,b)=>a+b,0),type:WidthType.DXA},columnWidths:widths,rows:trs});
}
function swatch(fill){return {__cell:true,build:function(w){return new TableCell({borders,width:{size:w,type:WidthType.DXA},
  shading:{fill:fill,type:ShadingType.CLEAR},margins:cellMargin,children:[P("",{after:0})]});}};}

/* callout box (single-cell table) */
function callout(title,lines,fill,barColor){
  var kids=[];
  if(title)kids.push(P([new TextRun({text:title,bold:true,color:barColor||GOLDD,size:21})],{after:lines.length?60:0}));
  lines.forEach(function(l,i){kids.push(P(Array.isArray(l)?l:[new TextRun({text:l,size:20,color:INK})],{after:i===lines.length-1?0:50,line:290}));});
  return new Table({width:{size:CW,type:WidthType.DXA},columnWidths:[CW],rows:[new TableRow({children:[
    new TableCell({width:{size:CW,type:WidthType.DXA},shading:{fill:fill||"F6F1E6",type:ShadingType.CLEAR},
      margins:{top:140,bottom:140,left:200,right:200},
      borders:{left:{style:BorderStyle.SINGLE,size:18,color:barColor||GOLD},top:{style:BorderStyle.SINGLE,size:2,color:"E5DCC8"},bottom:{style:BorderStyle.SINGLE,size:2,color:"E5DCC8"},right:{style:BorderStyle.SINGLE,size:2,color:"E5DCC8"}},
      children:kids})]})]});
}
function spacer(h){return P("",{after:h===undefined?80:h});}

const SHOTS=path.join(__dirname,'shots');
function imgWH(p){const b=fs.readFileSync(p);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}
function shot(name,dispW){dispW=dispW||680;const p=path.join(SHOTS,name);const wh=imgWH(p);
  return new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:120,after:30},
    children:[new ImageRun({type:"png",data:fs.readFileSync(p),
      transformation:{width:dispW,height:Math.round(dispW*wh.h/wh.w)},
      altText:{title:"FACET screen",description:"FACET screen capture",name:name}})]});}
function caption(t){return new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:0,after:170},
  children:[new TextRun({text:"▲ "+t,size:17,italics:true,color:"888888"})]});}

/* ============ DOCUMENT BODY ============ */
const body=[];

/* ----- cover ----- */
body.push(new Paragraph({spacing:{before:1700,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"◆",size:60,color:GOLD})]}));
body.push(new Paragraph({spacing:{before:120,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"F A C E T",bold:true,size:72,color:INK})]}));
body.push(new Paragraph({spacing:{before:80,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"Network Verification Atelier",italics:true,size:30,color:GOLDD})]}));
body.push(new Paragraph({spacing:{before:60,after:0},alignment:AlignmentType.CENTER,border:{bottom:{style:BorderStyle.SINGLE,size:6,color:GOLD,space:8}},children:[new TextRun({text:"",size:2})]}));
body.push(new Paragraph({spacing:{before:520,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"使い方説明書",bold:true,size:40,color:INK})]}));
body.push(new Paragraph({spacing:{before:60,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"ネットワーク構成検証ツール ユーザーガイド",size:24,color:"555555"})]}));
body.push(new Paragraph({spacing:{before:900,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"版数：v4.20.1 ・ 発行日：2026年7月20日",size:20,color:"777777"})]}));
body.push(new Paragraph({spacing:{before:200,after:0},alignment:AlignmentType.CENTER,
  children:[new ExternalHyperlink({link:FACET_URL,children:[new TextRun({text:FACET_URL,size:20,color:GOLDD,underline:{type:"single",color:GOLDD}})]})]}));
body.push(new Paragraph({children:[new PageBreak()]}));

/* ----- TOC ----- */
body.push(H1("目次"));
body.push(new TableOfContents("Table of Contents",{hyperlink:true,headingStyleRange:"1-3"}));
body.push(new Paragraph({spacing:{before:60},children:[new TextRun({text:"※ 目次のページ番号はWordで「フィールドの更新」を実行すると反映されます。",size:18,color:"888888",italics:true})]}));
body.push(new Paragraph({children:[new PageBreak()]}));

/* ===== 1. FACETとは ===== */
body.push(H1("1. FACETとは"));
body.push(P([run("「FACET」（ファセット）という名前は、"),run("Framework for Automated Configuration Evaluation & Templating",{italics:true,color:GOLDD}),run("（構成の自動評価とひな型作成のための基盤）の頭文字に由来します。同時に、原石を一面ずつ丹念に磨き上げて初めて輝きを放つ、宝石の"),run("ファセット（カット面）",{bold:true}),run("にも意味を重ねています。")]));
body.push(P("ネットワーク構成もこれと同じです。物理層・VLAN・スパニングツリー・L3到達性・ファイアウォールポリシー・堅牢化・機器仕様——このどれか一つの面に歪みがあっても、配備というセッティングを終えたあとに必ず綻びとなって現れます。FACETは、そのすべての面を配備前に一つずつ磨き上げるための検証ツールです。"));
body.push(P([run("本ツールは、"),run("Harry Winston",{bold:true,color:GOLDD}),run(" のネットワーク環境向けに専用開発された、SonicWall・Cisco 機器のコンフィグ検証・作成を支援するツールです。")]));
body.push(P("FACETは、ルータ（SonicWall）とスイッチ（Cisco、最大8台）のコンフィグを読み込み、配備前に設定上の問題を自動で洗い出します。VLANの不一致、L3ゲートウェイの欠落、ファイアウォールポリシーの漏れ、Telnetなどのセキュリティ上の懸念を、人手で読み合わせる前に見つけられます。"));
body.push(P([run("すべての処理は"),run("ブラウザ内で完結",{bold:true}),run("します。投入したコンフィグが外部サーバーに送信されることは一切なく、インストール作業も不要です（アクセス方法によってはページを開く際にインターネット接続が必要な場合があります。詳しくは「2. 起動方法」参照）。")]));

body.push(H2("1.1 できること・できないこと"));
body.push(P("これが最も重要な前提です。FACETは「静的解析」ツールであり、実機に接続して疎通を試すものではありません。"));
body.push(tbl([5233,5233],["できること","できないこと（限界）"],[
 ["設定ファイルからの不整合・見落とし検出","実機の物理配線が正しいかの確認"],
 ["VLAN・トランク・L3の整合性チェック","実際の通信速度・実スループット"],
 ["FWポリシーの評価と経路トレース","ケーブルの抵抗・リンクの物理障害"],
 ["セキュリティ堅牢化の診断","リアルタイムの監視・障害検知"],
 ["機種の物理仕様上の上限超過検知（VLAN数・ACL数など）","未接続端末の実際の台数にMACテーブルが耐えられるか"]
]));
body.push(spacer(40));
body.push(callout("重要：緑は「設定が正しい」、「実機が通じた」ではありません",
 ["すべて緑（確認）になっても、それは「設定上の矛盾が見つからなかった」という意味です。実機の物理疎通は、現地でのpingやCDP/LLDPなど別手段での確認が必要です。FACETは「配備前の一次防衛線（設定レビュー）」としてご利用ください。"],
 "FBF3DD",GOLD));

body.push(H2("1.2 三つの利用モード"));
body.push(P("FACETには、目的に応じた3つの入り口があります。①検証モードと②作成モードは、その先の検証ロジックとレポート画面が完全に共通です。③簡易検証モードは、1台だけを手早く確認するための独立した近道です。"));
body.push(shot("00_mode.png"));
body.push(caption("Phase00の画面：検証モード / 作成モード / 簡易検証モードの選択"));
body.push(tbl([2400,8066],["モード","向いているケース"],[
 ["① 検証モード",[P([run("手元に",{}),run("既存のコンフィグファイル一式",{bold:true}),run("（ルータ＋スイッチ）がある場合。running-config や SonicOS CLI のテキストを投入し、機器間の配線・到達性まで含めて総合的に検証します。")],{after:0,size:20})]],
 ["② 作成モード",[P([run("既存コンフィグがなく、",{}),run("これから構成を考えたい",{bold:true}),run("場合。画面上のGUIフォームでVLAN・ポート・ACLなどを組み立てると、Cisco IOS / SonicOS 形式の実際のコンフィグテキストが生成され、そのまま検証に進みます。")],{after:0,size:20})]],
 ["③ 簡易検証モード",[P([run("機器を",{}),run("1台だけ手早く確認したい",{bold:true}),run("場合。機種選定やトポロジー指定を省略し、単体機器のコンフィグを直接アップロードするとその場で静的チェックします。ただし配線不一致・STPループ・到達性マトリクス・経路トレースなど"),run("複数機器にまたがるチェックは対象外",{bold:true}),run("です。詳しくは「8. 簡易検証モード」参照。")],{after:0,size:20})]]
]));
body.push(spacer(40));
body.push(callout(null,[[run("ポイント：",{bold:true,color:GOLDD}),run("作成モードで生成したテキストは、FACET 自身のパーサで必ず読み戻してから検証する設計（往復保証）なので、「フォームで組んだものが検証では違う形で読まれる」という事態は起きません。")]],"F4F4F2","D9D2C2"));

/* ===== 2. 起動 ===== */
body.push(H1("2. 起動方法"));
body.push(P("FACETは次のいずれかの方法で開きます。Chrome・Edge・Firefoxなどのモダンブラウザで動作します。"));
body.push(bullet([run("ブラウザで次のURLを開く",{bold:true}),run("："),new ExternalHyperlink({link:FACET_URL,children:[new TextRun({text:FACET_URL,size:21,color:GOLDD,underline:{type:"single",color:GOLDD}})]})]));
body.push(bullet([run("配布された単一HTMLファイル（"),mono("index.html"),run("）を直接ダブルクリックする",{bold:true})]));
body.push(P("どちらの方法でも、Node.js・npm・インストール作業・アカウント登録は一切不要です。"));

body.push(H2("2.1 インターネット接続について"));
body.push(tbl([2600,7866],["アクセス方法","インターネット接続"],[
 ["URLを開く","ページを読み込む瞬間だけ、通常のWebサイトと同様に接続が必要です。"],
 ["HTMLファイルを直接開く","ページの読み込みも含めて一切不要です。社内の閉鎖ネットワークやオフライン環境でもそのまま動作します。"]
]));
body.push(spacer(40));
body.push(callout("重要：どちらの方法でも、コンフィグの中身は外部に送信されません",
 ["ページが表示されたあとは、投入したコンフィグの内容がサーバーやホスティング先に送信されることは一切ありません。解析はすべて利用者のブラウザ内で完結します。フォントもOS標準（Meiryo UI / Consolas）を使用しており、外部CDNへのリクエストも発生しません。「ページを開くのに接続が要るかどうか」と「コンフィグの中身が外部に漏れるかどうか」は別の話である点にご注意ください。"],
 "FBF3DD",GOLD));

/* ===== 3. 全体の流れ ===== */
body.push(H1("3. 全体の流れ"));
body.push(P("検証はフェーズを順に進めます。画面上部のステップバーで現在位置が分かります。「検証モード」と「作成モード」は Phase 03 の中身だけが切り替わり、それ以外は完全に共通です。なお「簡易検証モード」はこのフェーズ列を通らず、機種選択とアップロードだけで結果画面へ直行する近道です（詳細は「8. 簡易検証モード」）。"));
body.push(tbl([1200,2600,6666],["フェーズ","名称","内容"],[
 ["00","モード選択","検証モード / 作成モードを選ぶ"],
 ["01","構成の選定","ルータ・スイッチの機種と台数を選ぶ"],
 ["02","構成図・トポロジー","フェイスプレートを生成し、配線方式を指定"],
 ["03","コンフィグの投入（検証）/ GUIで作成（作成）","既存コンフィグを読み込む、またはフォームでゼロから作る"],
 ["04","検証中","解析を実行（自動・演出のみ。数秒で自動遷行）"],
 ["05","検証レポート","結果を表示・出力"],
 ["06","完了","終了画面（全レイヤ「確認」時のみ進行可）"]
]));

/* ===== 4. Phase01 ===== */
body.push(H1("4. Phase01 — 構成の選定"));
body.push(shot("01_select.png"));
body.push(caption("Phase01の画面：ルータ・スイッチの機種と台数を選ぶ"));
body.push(step([run("「Router — SonicWall」で機種を選びます（TZ270・TZ370・TZ470・TZ570・TZ670・NSa2700・NSa3700の7機種）。")],"s1"));
body.push(step([run("「Switch — Cisco」で機種を選び、台数を入力します（C1000-24/48・C2960-X 24/48・C9200-24/48・C9300-24/48の8機種、最大8台）。")],"s1"));
body.push(step([run("選択すると、その機種の実際のポート構成と主要スペック（スループット、セッション数、対応VLAN数など）がチップで表示されます。「構成図・トポロジーへ」を押します。")],"s1"));
body.push(callout(null,[[run("ヒント：",{bold:true,color:GOLDD}),run("このスペックチップはカタログの実データシートを元にしています。検証中の「機器能力（CAP）」カテゴリでは、ここで選んだ機種のVLAN数・ACL数・SVI数・ルーティングテーブル上限などを超えていないかを自動で確認します。台数はあとからでも戻って変更できます。")]],"F4F4F2","D9D2C2"));

/* ===== 5. Phase02 ===== */
body.push(H1("5. Phase02 — 構成図とトポロジー"));
body.push(shot("02_topology.png"));
body.push(caption("Phase02の画面：フェイスプレートと配線方式（トポロジー）"));
body.push(P("選んだ機種のフェイスプレート（ポート配置図）が自動生成されます。物理配線はコンフィグテキストからは確定できないため、ここで実際の配線方式を指定します。これがSTPループ検知や到達性検証の前提になります。"));
body.push(H2("5.1 配線方式の選び方"));
body.push(tbl([2000,8466],["方式","説明"],[
 ["スター","各スイッチのアップリンクがルータのポートへ集約。最も一般的で、ループは生じません。"],
 ["カスケード","ルータ→SW1→SW2…と数珠つなぎ。スイッチ間リンクが自動追加されます。"],
 ["手動","実配線に合わせてリンクを自由に追加・削除できます（冗長構成の検証に）。"]
]));
body.push(P([run("手動モードでは、フェイスプレート上のポートをクリックして両端を選び、リンクを追加します。追加したリンクは一覧の×で削除できます。")]));

/* ===== 6. Phase03(検証モード) ===== */
body.push(H1("6. Phase03 — コンフィグの投入（検証モード）"));
body.push(shot("03_intake.png"));
body.push(caption("Phase03の画面（検証モード）：ルータ→スイッチの順にコンフィグを投入"));
body.push(P("ルータ→スイッチ（台数分）の順番で読み込みます。前の機器の投入が終わると、次の機器の枠が有効になります。"));
body.push(H2("6.1 コンフィグの形式"));
body.push(tbl([2400,8066],["機器","投入する内容"],[
 ["SonicWall（ルータ）",[P([run(".expのエクスポートではなく、",{}),run("CLIの可読テキスト",{bold:true}),run("を読みます。アドレスオブジェクト・サービスオブジェクト・アクセスルール・NATを含めるとFW検証が有効になります。")],{after:0,size:20})]],
 ["Cisco（スイッチ）",[P("running-configのテキスト。interface range・ip route・ACL・ip dhcp pool・channel-group・HSRP(standby)なども解釈します。",{after:0,size:20})]]
]));
body.push(H2("6.2 手順"));
body.push(step("各機器の「ファイル選択」からコンフィグファイルを選びます（.txt / .cfg / .conf など）。","s2"));
body.push(step("読み込むと「投入完了」とインターフェース数が表示され、次の機器が有効化されます。","s2"));
body.push(step("すべて投入すると「検証を実行」ボタンが押せるようになります。","s2"));
body.push(callout(null,[[run("試したいだけのとき：",{bold:true,color:GOLDD}),run("「◆ サンプルコンフィグを読み込む」を押すと、匿名化されたデモ用設定（ACME-* や RFC1918 アドレス等）が一括で入り、そのまま検証を体験できます。")]],"F4F4F2","D9D2C2"));

/* ===== 7. Phase03(作成モード) ===== */
body.push(H1("7. Phase03 — GUIでコンフィグを作成（作成モード）"));
body.push(P("手元にコンフィグがない場合は、この作成モードでVLAN・ポート・ACLなどをフォームに入力してコンフィグを組み立てます。「生成」を押すと Cisco IOS / SonicOS 形式の実際のコンフィグテキストが作られ、以降は検証モードと完全に同じ流れで検証されます。"));

body.push(H2("7.1 SonicWall（ルータ）の設定項目"));
body.push(shot("10_build_sonicwall.png"));
body.push(caption("SonicWallビルダー：インターフェースとアドレスオブジェクト"));
body.push(bullet([run("インターフェース",{bold:true}),run("：各ポートの有効/無効、Zone、IP/マスク、VLANサブインターフェース")]));
body.push(bullet([run("アドレスオブジェクト",{bold:true}),run("：host / network / range の3種類（rangeは開始・終了IPを指定）")]));
body.push(bullet([run("サービスオブジェクト・アクセスルール・NAT ポリシー",{bold:true}),run("：FW検証を活用するならここも必要に応じて設定")]));

body.push(H2("7.2 Cisco（スイッチ）の設定項目"));
body.push(shot("11_build_cisco.png"));
body.push(caption("Ciscoビルダー：VLAN 一覧・ACL・Port-channel・ポート設定"));
body.push(P("ポート一覧は選んだ機種の実ポート構成そのままなので、存在しないポートを誤って作ってしまう心配はありません。主な設定項目は次のとおりです。"));
body.push(tbl([2600,7866],["項目","内容"],[
 ["基本設定","hostname、spanning-tree mode、spanning-tree priority（4096刻み16段階のselectで不正な値は作れない）、SSHのみ許可・enable secret・パスワード暗号化などのセキュリティ設定"],
 ["VLAN 一覧","VLAN ID・名前。機種のVLAN上限に到達すると追加ボタンが自動で無効化"],
 ["ACL 一覧","名前付きACLのpermit/deny行を作成し、ポートのip access-group(in/out)として適用"],
 ["Port-channel / channel-group","複数の物理ポートを1本の論理リンクとして束ねるLACP/EtherChannel設定"],
 ["ポート設定","access/trunkモード、アクセスVLAN、ネイティブ/許可VLAN、portfast・bpduguard、channel-group所属"],
 ["SVI（VLAN内IP）","VLANごとのIPアドレスと、HSRP(standby)のグループ番号・仮想IP"],
 ["DHCP プール","プール名・ネットワークアドレス・default-router"]
]));

body.push(H2("7.3 生成と検証への接続"));
body.push(step("各機器のフォームを入力します（入力エラーがある項目は赤枠で即座に表示されます）。","s3"));
body.push(step("一番下の「◆ すべて生成」を押すと、全機器分のコンフィグテキストが一括で作成されます。","s3"));
body.push(step("必要に応じて「⇩ ダウンロード」で実機投入用のテキストを取り出せます。","s3"));
body.push(step("「検証を実行」を押すと、以降は検証モードと全く同じレポート画面に進みます。","s3"));
body.push(callout(null,[[run("往復保証：",{bold:true,color:GOLDD}),run("生成したテキストは必ず FACET 自身のパーサで再パースしてから検証に回す設計なので、「フォームで作ったのに検証が通らない」という事態は構造的に起きません。")]],"F4F4F2","D9D2C2"));
body.push(spacer(40));
body.push(callout("重要：生成コンフィグ内の enable secret はプレースホルダです",
 [[run("Cisco の生成コンフィグには "),mono("enable secret 0 FACET-CHANGE-ME-BEFORE-DEPLOY"),run(" という"),run("プレースホルダのパスワード",{bold:true}),run("が入ります（GUI では実際の値を収集しないため）。実機に投入する前に、必ず実運用の値へ変更してください。行頭にはその旨のコメントも付与されます。")]],
 "FBF3DD",GOLD));

/* ===== 8. 簡易検証モード ===== */
body.push(H1("8. 簡易検証モード（単体機器のクイックチェック）"));
body.push(shot("12_quick.png"));
body.push(caption("簡易検証モード：種別・機種を選んで1台分を直接アップロード"));
body.push(P("手元の機器を1台だけ手早く確認したいときは、Phase00で「③ 簡易検証モード」を選びます。機種選定やトポロジー指定（Phase01・02）を経ず、単体機器のコンフィグを直接アップロードするだけでその場で静的チェックされます。"));
body.push(H2("8.1 手順"));
body.push(step("Phase00で「③ 簡易検証モード」を選びます。","sq"));
body.push(step([run("機器の種別（"),run("ルータ=SonicWall / スイッチ=Cisco",{bold:true}),run("）と機種を選びます。機種を指定すると、VLAN数・ACL数などの機器能力（CAP）チェックも対象になります。")],"sq"));
body.push(step("「ファイル選択」からその機器のコンフィグテキストを1つアップロードすると、即座に結果画面へ進みます。","sq"));
body.push(step([run("結果画面には、スコア・シャーシ図・指摘一覧が表示されます。"),run("「← 別のファイルを検証」",{bold:true}),run("で、同じ種別・機種のまま別のファイルを続けて確認できます。")],"sq"));
body.push(H2("8.2 対象になるチェック・ならないチェック"));
body.push(P("単体機器だけで判定できるものは実行され、複数機器の関係が必要なものは実行されません。この区別は結果画面にも常時明示されます。"));
body.push(tbl([5233,5233],["実行されるチェック（単体で判定可能）","実行されないチェック（複数機器が必要）"],[
 ["VLAN/トランク（L2）：モード・VLAN定義","機器間の配線不一致（速度/Duplex・両端モード・Native VLAN）"],
 ["STP：トランクへのportfast等のリスク","STPループ検出"],
 ["単体L3：SVIのIP重複など","サブネット間の到達性マトリクス"],
 ["堅牢化（SEC）：Telnet・弱いenable・SNMP等","経路トレース（ホップ単位の追跡）"],
 ["機器能力（CAP）：VLAN数・ACL数・SVI数などの上限","ファイアウォールポリシーの評価（ルータ⇔スイッチの関係）"]
]));
body.push(spacer(40));
body.push(callout("重要：複数機器にまたがるチェックは実行されません",
 ["簡易検証モードは単体機器のみを対象にした静的チェックです。配線不一致・STPループ・到達性マトリクス・経路トレースなどは対象外のため、緑（指摘なし）でもネットワーク全体の健全性を保証するものではありません。総合的な検証には「① 検証モード」をご利用ください。"],
 "FBF3DD",GOLD));

/* ===== 9. 結果の読み方 ===== */
body.push(H1("9. 検証レポートの読み方"));
body.push(shot("04_report_overview.png"));
body.push(caption("検証レポート上部：スコア・集計・7カテゴリ"));
body.push(P("検証を実行するとレポート画面が表示されます。上から順に「スコア」「集計」「カテゴリ」「経路トレース」「論理接続図」「ポート別ステータス」「到達性マトリクス」「指摘一覧」と続きます。"));

body.push(H2("9.1 ステータスの意味"));
body.push(P("ポートや指摘は4つの状態で表示されます。"));
body.push(tbl([1100,2400,6966],["色","状態","意味"],[
 [swatch(EMER),"確認","設定上の問題は見つからなかった"],
 [swatch(GARN),"エラー","明らかな不整合。修正が必要（例：Native VLAN不一致、IP重複）"],
 [swatch(TOPA),"コンフィグ不足","設定が足りていない。要確認（例：VLAN未定義、L3ゲートウェイ無し）"],
 [swatch(STEE),"未使用","コンフィグがない（未接続のポート）"]
]));

body.push(H2("9.2 スコア"));
body.push(P([run("スコアは100点満点の目安で、"),run("100 − エラー×12 − コンフィグ不足×4",{bold:true}),run("で計算されます（0未満は0）。エラーの方が重く採点されます。絶対的な合格点ではなく、修正の優先度をつかむための指標として使ってください。")]));

body.push(H2("9.3 7つの検証カテゴリ"));
body.push(tbl([2000,8466],["カテゴリ","見ているもの"],[
 ["物理（L1）","速度・Duplex・MTUの不一致、EtherChannelモードの非互換、channel-group内で対向が不一致な束"],
 ["VLAN/トランク（L2）","アクセス/トランクモード、Native VLAN、許可VLAN、VLAN未定義"],
 ["STP/ループ","L2ループの有無、トランクへのportfastなどのリスク、優先度からのルートブリッジ推定"],
 ["L3到達性","L3ゲートウェイの有無、IP重複、静的ルートのnext-hop到達可否、DHCPのdefault-router不一致"],
 ["FWポリシー","ゾーン間の許可/遮断、内部→WANの許可ルールの有無、NATポリシーの実際のマッチ判定"],
 ["堅牢化（SEC）","Telnet、弱いenable、SNMP public/private、any/any/any許可、シャドウルール"],
 ["機器能力（CAP）","VLAN数・ACL数・SVI数・ルーティングテーブルの上限超過、PAgP非対応機種でのauto/desirable使用など"]
]));
body.push(spacer(40));
body.push(callout(null,[[run("新規：",{bold:true,color:GOLDD}),run("「機器能力（CAP）」は、選んだ機種のカタログ上の物理仕様と照らし合わせて検証する専用カテゴリです。例えば実際のVLAN数が機種の上限（64など）を超えていないかを自動で確認します。")]],"F4F4F2","D9D2C2"));

body.push(H2("9.4 経路トレース（目玉機能）"));
body.push(shot("05_report_trace.png"));
body.push(caption("経路トレース：どのホップで遮断されたかが一目で分かる"));
body.push(P("送信元サブネットと宛先（またはインターネット）を選んで「トレース」を押すと、パケットがどこを通るかをホップ単位で追跡します。各ホップは次の順で表示され、どこで許可・遮断されたか、効いたルール番号まで分かります。"));
body.push(tbl([1400,9066],["ホップ","意味"],[
 ["SRC","送信元ホスト（選んだサブネット）"],
 ["L2","アクセススイッチからトランク経由でルータへ"],
 ["GW","L3ゲートウェイ（ルータのサブIF）"],
 ["RT","ルーティング（接続済 or 静的ルートのnext-hop到達確認済みでWANへ）"],
 ["FW","ファイアウォールポリシーの評価（許可/遮断）"],
 ["NAT","WAN宛ての場合の送元変換（該当nat-policyを実際にマッチさせて表示）"],
 ["DST","宛先到達"]
]));

body.push(H2("9.5 論理接続図・シャーシ図"));
body.push(shot("06_report_topology.png"));
body.push(caption("論理接続図：機器間の接続関係を一目で確認"));
body.push(shot("07_report_chassis.png"));
body.push(caption("シャーシ図：各機器のポート別ステータス（確認/エラー/コンフィグ不足/未使用）"));
body.push(P("ポートにマウスを重ねると、そのポートの設定内容と検出された問題がツールチップで表示されます。"));

body.push(H2("9.6 到達性マトリクス"));
body.push(shot("08_report_matrix.png"));
body.push(caption("到達性マトリクス：サブネット間の ○×△"));
body.push(P("サブネット同士の到達可否を一覧で表示します。記号の意味は次のとおりです。"));
body.push(tbl([1400,9066],["記号","意味"],[
 [[P([new TextRun({text:"○",color:EMER,bold:true,size:22})],{after:0})],"通過（ポリシー上許可）"],
 [[P([new TextRun({text:"×",color:GARN,bold:true,size:22})],{after:0})],"遮断・未許可（ポリシーでブロック）"],
 [[P([new TextRun({text:"△",color:TOPA,bold:true,size:22})],{after:0})],"L3ゲートウェイ無し（そもそもルーティングできない）"]
]));
body.push(P("同一サブネット内（L2で完結）は対象外です。"));

body.push(H2("9.7 指摘一覧の読み方"));
body.push(shot("09_report_findings.png"));
body.push(caption("指摘一覧：エラー／コンフィグ不足と提案"));
body.push(P("各指摘は、重要度（エラー→コンフィグ不足）順に並び、次の3点がセットで表示されます。"));
body.push(bullet([run("何が起きているか",{bold:true}),run("：指摘の内容と対象箇所")]));
body.push(bullet([run("なぜ問題か",{bold:true}),run("：その設定がどう障害につながるか")]));
body.push(bullet([run("提案",{bold:true}),run("：どう直せばよいかの具体策")]));
body.push(P("画面上部のフィルターで、カテゴリ別（L2・STPなど）に絞り込んで表示できます。"));

/* ===== 10. レポート出力 ===== */
body.push(H1("10. レポートの出力"));
body.push(P("レポート画面下部から3つの形式で出力できます。"));
body.push(tbl([2400,8066],["ボタン","内容"],[
 ["JSON","検証結果をJSONファイルでダウンロード。他ツールとの連携や記録保存に。"],
 ["Markdownコピー","指摘一覧をMarkdownでクリップボードにコピー。チケットやTeamsへの貼付に。"],
 ["印刷/PDF","ブラウザの印刷機能でPDF保存。提出資料に。"]
]));

/* ===== 11. よくある指摘と対処 ===== */
body.push(H1("11. よくある指摘と対処"));
body.push(tbl([3200,3633,3633],["指摘","原因","対処"],[
 ["Native VLAN 不一致","トランク両端のnative vlanが違う","両端のnative vlanを揃える"],
 ["Access VLAN が未定義","switchportで指定したVLANがVLAN DBにない","vlan <ID>を定義する"],
 ["L3ゲートウェイがない","そのVLANのゲートウェイIPがルータに無い","SonicWallに該当VLANのサブIFを作る"],
 ["WANへの許可ルールがない","内部ゾーン→WANのallowルールが無い","access-rule from <zone> to WAN allowを追加"],
 ["Telnetが有効","平文プロトコルが有効","transport input sshのみにする"],
 ["L2ループ","冗長配線+STP未設定","該当スイッチにSTPを設定する"],
 ["channel-group が対向と不整合","束の片側のみ channel-group 未設定、または番号が不一致","両端の全メンバーポートで channel-group 番号を揃える"],
 ["PAgP 非対応機種で desirable/auto","channel-group mode がLACPではなくPAgP","channel-group mode を active/passive/on に変更"]
]));

/* ===== 12. バージョン履歴 ===== */
body.push(H1("12. バージョン履歴の確認"));
body.push(P([run("画面右上のバージョンバッジ（例："),mono("v4.20.1"),run("）をクリックすると、これまでの変更履歴がモーダルで表示されます。どのバージョンで何が変わったかをこの画面だけで確認できます。")]));

/* ===== 13. 注意事項 ===== */
body.push(H1("13. ご利用上の注意"));
body.push(bullet("本ツールは静的解析であり、実機の物理疎通を保証しません。最終確認は必ず実機で行ってください。"));
body.push(bullet("SonicWallはCLIの可読テキスト前提です。SonicOSのバージョンや記法によっては読み取れない記述があります。"));
body.push(bullet("ポート配置は機種ごとの代表的なもので、実機の物理レイアウトと異なる場合があります。"));
body.push(bullet("作成モードで生成したコンフィグも、あくまで「案」です。検証結果が良好でも、実機への投入前には必ず内容をレビューしてください。特に enable secret はプレースホルダのため、実運用の値へ変更が必要です。"));
body.push(bullet("簡易検証モードは単体機器のみが対象です。緑（指摘なし）でも、機器間の配線・到達性は検証されていません。総合的な確認には検証モードをご利用ください。"));
body.push(bullet("実コンフィグを扱う際は、公開・共有前にホスト名・IP・拠点名などの機密情報の取り扱いにご注意ください。"));

body.push(spacer(120));
body.push(new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:4,color:GOLD,space:6}},spacing:{before:60,after:0},
  alignment:AlignmentType.CENTER,children:[new TextRun({text:"FACET — Network Verification Atelier",italics:true,size:18,color:"999999"})]}));

/* ============ DOC ============ */
const doc=new Document({
  creator:"FACET",title:"FACET 使い方説明書",
  styles:{
    default:{document:{run:{font:FONT,size:21,color:INK}}},
    paragraphStyles:[
      {id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:34,bold:true,font:FONT,color:INK},
        paragraph:{spacing:{before:300,after:140},outlineLevel:0,border:{bottom:{style:BorderStyle.SINGLE,size:8,color:GOLD,space:4}}}},
      {id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:26,bold:true,font:FONT,color:"2E2A24"},
        paragraph:{spacing:{before:220,after:100},outlineLevel:1}},
      {id:"Heading3",name:"Heading 3",basedOn:"Normal",next:"Normal",quickFormat:true,
        run:{size:22,bold:true,font:FONT,color:GOLDD},
        paragraph:{spacing:{before:160,after:80},outlineLevel:2}}
    ]
  },
  numbering:{config:[
    {reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{run:{font:FONT},paragraph:{indent:{left:520,hanging:260}}}}]},
    {reference:"s1",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]},
    {reference:"s2",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]},
    {reference:"s3",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]},
    {reference:"sq",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]}
  ]},
  sections:[{
    properties:{page:{size:{width:11906,height:16838},margin:{top:720,right:720,bottom:720,left:720}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,
      children:[new TextRun({text:"FACET 使い方説明書 · ",size:16,color:"999999"}),
        new TextRun({children:[PageNumber.CURRENT],size:16,color:"999999"})]})]})},
    children:body
  }]
});

const OUT_PATH=path.join(__dirname,'..','..','FACET_User_Guide.docx');
Packer.toBuffer(doc).then(function(buf){fs.writeFileSync(OUT_PATH,buf);console.log("written",OUT_PATH,buf.length,"bytes");});
