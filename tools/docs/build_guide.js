const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,LevelFormat,
 HeadingLevel,BorderStyle,WidthType,ShadingType,VerticalAlign,PageNumber,PageBreak,
 TableOfContents,Header,Footer,ExternalHyperlink,ImageRun}=require('docx');

const FONT="Meiryo UI";
const INK="1A1A1A", GOLD="A8884E", GOLDD="8C744A", LINE="CCCCCC";
const CW=10466; // A4 width 11906 - margins 720*2

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

const SHOTS="/home/claude/shots/";
function imgWH(p){const b=fs.readFileSync(p);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)};}
function shot(name,dispW){dispW=dispW||640;const p=SHOTS+name;const wh=imgWH(p);
  return new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:120,after:30},
    children:[new ImageRun({type:"png",data:fs.readFileSync(p),
      transformation:{width:dispW,height:Math.round(dispW*wh.h/wh.w)},
      altText:{title:"FACET screen",description:"FACET screen mock",name:name}})]});}
function caption(t){return new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:0,after:170},
  children:[new TextRun({text:"\u25B2 "+t,size:17,italics:true,color:"888888"})]});}

/* ============ DOCUMENT BODY ============ */
const body=[];

/* ----- cover ----- */
body.push(new Paragraph({spacing:{before:1700,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"\u25C6",size:60,color:GOLD})]}));
body.push(new Paragraph({spacing:{before:120,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"F A C E T",bold:true,size:72,color:INK})]}));
body.push(new Paragraph({spacing:{before:80,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"Network Verification Atelier",italics:true,size:30,color:GOLDD})]}));
body.push(new Paragraph({spacing:{before:60,after:0},alignment:AlignmentType.CENTER,border:{bottom:{style:BorderStyle.SINGLE,size:6,color:GOLD,space:8}},children:[new TextRun({text:"",size:2})]}));
body.push(new Paragraph({spacing:{before:520,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"\u4F7F\u3044\u65B9\u8AAC\u660E\u66F8",bold:true,size:40,color:INK})]}));
body.push(new Paragraph({spacing:{before:60,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u69CB\u6210\u691C\u8A3C\u30C4\u30FC\u30EB \u30E6\u30FC\u30B6\u30FC\u30AC\u30A4\u30C9",size:24,color:"555555"})]}));
body.push(new Paragraph({spacing:{before:900,after:0},alignment:AlignmentType.CENTER,
  children:[new TextRun({text:"\u7248\u6570\uFF1Av3 \u30FB \u767A\u884C\u65E5\uFF1A2026\u5E745\u670820\u65E5",size:20,color:"777777"})]}));
body.push(new Paragraph({children:[new PageBreak()]}));

/* ----- TOC ----- */
body.push(H1("\u76EE\u6B21"));
body.push(new TableOfContents("Table of Contents",{hyperlink:true,headingStyleRange:"1-3"}));
body.push(new Paragraph({spacing:{before:60},children:[new TextRun({text:"\u203B \u76EE\u6B21\u306E\u30DA\u30FC\u30B8\u756A\u53F7\u306FWord\u3067\u300C\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u66F4\u65B0\u300D\u3092\u5B9F\u884C\u3059\u308B\u3068\u53CD\u6620\u3055\u308C\u307E\u3059\u3002",size:18,color:"888888",italics:true})]}));
body.push(new Paragraph({children:[new PageBreak()]}));

/* ===== 1. FACETとは ===== */
body.push(H1("1. FACET\u3068\u306F"));
body.push(P("FACET\u306F\u3001\u30EB\u30FC\u30BF\uFF08SonicWall\uFF09\u3068\u30B9\u30A4\u30C3\u30C1\uFF08Cisco\uFF09\u306E\u30B3\u30F3\u30D5\u30A3\u30B0\u3092\u8AAD\u307F\u8FBC\u307F\u3001\u914D\u5099\u524D\u306B\u8A2D\u5B9A\u4E0A\u306E\u554F\u984C\u3092\u81EA\u52D5\u3067\u6D17\u3044\u51FA\u3059\u30C4\u30FC\u30EB\u3067\u3059\u3002VLAN\u306E\u4E0D\u4E00\u81F4\u3001L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u306E\u6B20\u843D\u3001\u30D5\u30A1\u30A4\u30A2\u30A6\u30A9\u30FC\u30EB\u30DD\u30EA\u30B7\u30FC\u306E\u6F0F\u308C\u3001Telnet\u306A\u3069\u306E\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u4E0A\u306E\u61F8\u5FF5\u3092\u3001\u4EBA\u624B\u3067\u8AAD\u307F\u5408\u308F\u305B\u308B\u524D\u306B\u898B\u3064\u3051\u3089\u308C\u307E\u3059\u3002"));
body.push(P("\u3059\u3079\u3066\u306E\u51E6\u7406\u306F\u30D6\u30E9\u30A6\u30B6\u5185\u3067\u5B8C\u7D50\u3057\u307E\u3059\u3002\u30B3\u30F3\u30D5\u30A3\u30B0\u304C\u5916\u90E8\u30B5\u30FC\u30D0\u30FC\u306B\u9001\u4FE1\u3055\u308C\u308B\u3053\u3068\u306F\u306A\u304F\u3001\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3082\u4E0D\u8981\u3067\u3059\u3002"));

body.push(H2("1.1 \u3067\u304D\u308B\u3053\u3068\u30FB\u3067\u304D\u306A\u3044\u3053\u3068"));
body.push(P("\u3053\u308C\u304C\u6700\u3082\u91CD\u8981\u306A\u524D\u63D0\u3067\u3059\u3002FACET\u306F\u300C\u9759\u7684\u89E3\u6790\u300D\u30C4\u30FC\u30EB\u3067\u3042\u308A\u3001\u5B9F\u6A5F\u306B\u63A5\u7D9A\u3057\u3066\u758E\u901A\u3092\u8A66\u3059\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002"));
body.push(tbl([5233,5233],["\u3067\u304D\u308B\u3053\u3068","\u3067\u304D\u306A\u3044\u3053\u3068\uFF08\u9650\u754C\uFF09"],[
 ["\u8A2D\u5B9A\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u306E\u4E0D\u6574\u5408\u30FB\u8133\u9583\u691C\u51FA","\u5B9F\u6A5F\u306E\u7269\u7406\u914D\u7DDA\u304C\u6B63\u3057\u3044\u304B\u306E\u78BA\u8A8D"],
 ["VLAN\u30FB\u30C8\u30E9\u30F3\u30AF\u30FBL3\u306E\u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF","\u5B9F\u969B\u306E\u901A\u4FE1\u901F\u5EA6\u30FB\u5B9F\u30B9\u30EB\u30FC\u30D7\u30C3\u30C8"],
 ["FW\u30DD\u30EA\u30B7\u30FC\u306E\u8A55\u4FA1\u3068\u7D4C\u8DEF\u30C8\u30EC\u30FC\u30B9","\u30B1\u30FC\u30D6\u30EB\u306E\u62B5\u6297\u30FB\u30EA\u30F3\u30AF\u306E\u7269\u7406\u969C\u5BB3"],
 ["\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u5805\u7262\u5316\u306E\u8A3A\u65AD","\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u306E\u76E3\u8996\u30FB\u969C\u5BB3\u691C\u77E5"]
]));
body.push(spacer(40));
body.push(callout("\u91CD\u8981\uFF1A\u7DD1\u306F\u300C\u8A2D\u5B9A\u304C\u6B63\u3057\u3044\u300D\u3001\u300C\u5B9F\u6A5F\u304C\u901A\u3058\u305F\u300D\u3067\u306F\u3042\u308A\u307E\u305B\u3093",
 ["\u3059\u3079\u3066\u7DD1\uFF08\u78BA\u8A8D\uFF09\u306B\u306A\u3063\u3066\u3082\u3001\u305D\u308C\u306F\u300C\u8A2D\u5B9A\u4E0A\u306E\u77DB\u76FE\u304C\u898B\u3064\u304B\u3089\u306A\u304B\u3063\u305F\u300D\u3068\u3044\u3046\u610F\u5473\u3067\u3059\u3002\u5B9F\u6A5F\u306E\u7269\u7406\u758E\u901A\u306F\u3001\u73FE\u5730\u3067\u306Eping\u3084CDP/LLDP\u306A\u3069\u5225\u624B\u6BB5\u3067\u306E\u78BA\u8A8D\u304C\u5FC5\u8981\u3067\u3059\u3002FACET\u306F\u300C\u914D\u5099\u524D\u306E\u4E00\u6B21\u9632\u885B\u7DDA\uFF08\u8A2D\u5B9A\u30EC\u30D3\u30E5\u30FC\uFF09\u300D\u3068\u3057\u3066\u3054\u5229\u7528\u304F\u3060\u3055\u3044\u3002"],
 "FBF3DD",GOLD));

/* ===== 2. 起動 ===== */
body.push(H1("2. \u8D77\u52D5\u65B9\u6CD5"));
body.push(P([run("HTML\u30D5\u30A1\u30A4\u30EB\uFF08"),mono("facet.html"),run("\uFF09\u3092\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3060\u3051\u3067\u8D77\u52D5\u3057\u307E\u3059\u3002Chrome\u30FBEdge\u30FBFirefox\u306A\u3069\u306E\u30E2\u30C0\u30F3\u30D6\u30E9\u30A6\u30B6\u3067\u52D5\u4F5C\u3057\u307E\u3059\u3002\u30A4\u30F3\u30BF\u30FC\u30CD\u30C3\u30C8\u63A5\u7D9A\u306F\u4E0D\u8981\u3067\u3059\uFF08\u30D5\u30A9\u30F3\u30C8\u8868\u793A\u306E\u305F\u3081\u306B\u306E\u307F\u63A5\u7D9A\u3092\u4F7F\u3044\u307E\u3059\u304C\u3001\u672A\u63A5\u7D9A\u3067\u3082\u6A5F\u80FD\u306F\u3059\u3079\u3066\u52D5\u304D\u307E\u3059\uFF09\u3002")]));
body.push(P("\u793E\u5185\u3084\u30C1\u30FC\u30E0\u3067\u5171\u6709\u3057\u305F\u3044\u5834\u5408\u306F\u3001\u30B5\u30FC\u30D0\u30FC\u4E0D\u8981\u306E\u9759\u7684\u30DB\u30B9\u30C6\u30A3\u30F3\u30B0\uFF08GitHub Pages\u7B49\uFF09\u306B\u7F6E\u304F\u3060\u3051\u3067URL\u516C\u958B\u3067\u304D\u307E\u3059\u3002"));

/* ===== 3. 全体の流れ ===== */
body.push(H1("3. \u5168\u4F53\u306E\u6D41\u308C"));
body.push(P("\u691C\u8A3C\u306F5\u3064\u306E\u30D5\u30A7\u30FC\u30BA\u3092\u9806\u306B\u9032\u3081\u307E\u3059\u3002\u753B\u9762\u4E0A\u90E8\u306E\u30B9\u30C6\u30C3\u30D7\u30D0\u30FC\u3067\u73FE\u5728\u4F4D\u7F6E\u304C\u5206\u304B\u308A\u307E\u3059\u3002"));
body.push(tbl([1200,2600,6666],["\u30D5\u30A7\u30FC\u30BA","\u540D\u79F0","\u5185\u5BB9"],[
 ["01","\u69CB\u6210\u306E\u9078\u5B9A","\u30EB\u30FC\u30BF\u30FB\u30B9\u30A4\u30C3\u30C1\u306E\u6A5F\u7A2E\u3068\u53F0\u6570\u3092\u9078\u3076"],
 ["02","\u69CB\u6210\u56F3\u30FB\u30C8\u30DD\u30ED\u30B8\u30FC","\u30DD\u30FC\u30C8\u914D\u7F6E\u3092\u751F\u6210\u3057\u3001\u914D\u7DDA\u65B9\u5F0F\u3092\u6307\u5B9A"],
 ["03","\u30B3\u30F3\u30D5\u30A3\u30B0\u306E\u6295\u5165","\u30EB\u30FC\u30BF\u2192\u30B9\u30A4\u30C3\u30C1\u306E\u9806\u3067\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u3080"],
 ["04","\u691C\u8A3C","\u89E3\u6790\u3092\u5B9F\u884C\uFF08\u81EA\u52D5\uFF09"],
 ["05","\u691C\u8A3C\u30EC\u30DD\u30FC\u30C8","\u7D50\u679C\u3092\u8868\u793A\u30FB\u51FA\u529B"]
]));

/* ===== 4. Phase01 ===== */
body.push(H1("4. Phase01 \u2014 \u69CB\u6210\u306E\u9078\u5B9A"));
body.push(shot("a_phase01.png"));
body.push(caption("Phase01\u306E\u753B\u9762\uFF1A\u30EB\u30FC\u30BF\u30FB\u30B9\u30A4\u30C3\u30C1\u306E\u6A5F\u7A2E\u3068\u53F0\u6570\u3092\u9078\u3076"));
body.push(step([run("\u300CRouter \u2014 SonicWall\u300D\u3067\u6A5F\u7A2E\u3092\u9078\u3073\u307E\u3059\uFF08TZ270\uFF5E670\u3001NSa2700/3700\uFF09\u3002")],"s1"));
body.push(step([run("\u300CSwitch \u2014 Cisco\u300D\u3067\u6A5F\u7A2E\u3092\u9078\u3073\u3001\u53F0\u6570\u3092\u5165\u529B\u3057\u307E\u3059\uFF08\u6700\u59278\u53F0\uFF1AC1000\u30FB2960-X\u30FB9200\u30FB9300\uFF09\u3002")],"s1"));
body.push(step([run("\u9078\u629E\u3059\u308B\u3068\u30DD\u30FC\u30C8\u69CB\u6210\u306E\u6982\u8981\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u300C\u69CB\u6210\u56F3\u30FB\u30C8\u30DD\u30ED\u30B8\u30FC\u3078\u300D\u3092\u62BC\u3057\u307E\u3059\u3002")],"s1"));
body.push(callout(null,[ [run("\u30D2\u30F3\u30C8\uFF1A",{bold:true,color:GOLDD}),run("\u53F0\u6570\u306F\u3042\u3068\u304B\u3089\u3067\u3082\u623B\u3063\u3066\u5909\u66F4\u3067\u304D\u307E\u3059\u3002\u307E\u305A\u306F\u5B9F\u69CB\u6210\u306B\u5408\u308F\u305B\u3066\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002")] ],"F4F4F2","D9D2C2"));

/* ===== 5. Phase02 ===== */
body.push(H1("5. Phase02 \u2014 \u69CB\u6210\u56F3\u3068\u30C8\u30DD\u30ED\u30B8\u30FC"));
body.push(shot("b_phase02.png"));
body.push(caption("Phase02\u306E\u753B\u9762\uFF1A\u30D5\u30A7\u30A4\u30B9\u30D7\u30EC\u30FC\u30C8\u3068\u914D\u7DDA\u65B9\u5F0F\uFF08\u30C8\u30DD\u30ED\u30B8\u30FC\uFF09"));
body.push(P("\u30D5\u30A7\u30A4\u30B9\u30D7\u30EC\u30FC\u30C8\uFF08\u30DD\u30FC\u30C8\u914D\u7F6E\u56F3\uFF09\u304C\u751F\u6210\u3055\u308C\u307E\u3059\u3002\u7269\u7406\u914D\u7DDA\u306F\u30B3\u30F3\u30D5\u30A3\u30B0\u304B\u3089\u306F\u78BA\u5B9A\u3067\u304D\u306A\u3044\u305F\u3081\u3001\u3053\u3053\u3067\u5B9F\u969B\u306E\u914D\u7DDA\u65B9\u5F0F\u3092\u6307\u5B9A\u3057\u307E\u3059\u3002\u3053\u308C\u304CSTP\u30EB\u30FC\u30D7\u691C\u77E5\u3084\u5230\u9054\u6027\u691C\u8A3C\u306E\u524D\u63D0\u306B\u306A\u308A\u307E\u3059\u3002"));
body.push(H2("5.1 \u914D\u7DDA\u65B9\u5F0F\u306E\u9078\u3073\u65B9"));
body.push(tbl([2000,8466],["\u65B9\u5F0F","\u8AAC\u660E"],[
 ["\u30B9\u30BF\u30FC","\u5404\u30B9\u30A4\u30C3\u30C1\u306E\u30A2\u30C3\u30D7\u30EA\u30F3\u30AF\u304C\u30EB\u30FC\u30BF\u306E\u30DD\u30FC\u30C8\u3078\u96C6\u7D04\u3002\u6700\u3082\u4E00\u822C\u7684\u3067\u3001\u30EB\u30FC\u30D7\u306F\u751F\u3058\u307E\u305B\u3093\u3002"],
 ["\u30AB\u30B9\u30B1\u30FC\u30C9","\u30EB\u30FC\u30BF\u2192SW1\u2192SW2\u2026\u3068\u6570\u73E0\u3064\u306A\u304E\u3002\u30B9\u30A4\u30C3\u30C1\u9593\u30EA\u30F3\u30AF\u304C\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059\u3002"],
 ["\u624B\u52D5","\u5B9F\u914D\u7DDA\u306B\u5408\u308F\u305B\u3066\u30EA\u30F3\u30AF\u3092\u81EA\u7531\u306B\u8FFD\u52A0\u30FB\u524A\u9664\u3067\u304D\u307E\u3059\uFF08\u5197\u9577\u69CB\u6210\u306E\u691C\u8A3C\u306B\uFF09\u3002"]
]));
body.push(P([run("\u624B\u52D5\u30E2\u30FC\u30C9\u3067\u306F\u3001\u4E0B\u90E8\u306E\u30C9\u30ED\u30C3\u30D7\u30C0\u30A6\u30F3\u3067\u4E21\u7AEF\u306E\u30DD\u30FC\u30C8\u3092\u9078\u3073\u300C+\u30EA\u30F3\u30AF\u8FFD\u52A0\u300D\u3092\u62BC\u3057\u307E\u3059\u3002\u8FFD\u52A0\u3057\u305F\u30EA\u30F3\u30AF\u306F\u4E00\u89A7\u306E\u00D7\u3067\u524A\u9664\u3067\u304D\u307E\u3059\u3002")]));

/* ===== 6. Phase03 ===== */
body.push(H1("6. Phase03 \u2014 \u30B3\u30F3\u30D5\u30A3\u30B0\u306E\u6295\u5165"));
body.push(shot("c_phase03.png"));
body.push(caption("Phase03\u306E\u753B\u9762\uFF1A\u30EB\u30FC\u30BF\u2192\u30B9\u30A4\u30C3\u30C1\u306E\u9806\u306B\u30B3\u30F3\u30D5\u30A3\u30B0\u3092\u6295\u5165"));
body.push(P("\u30EB\u30FC\u30BF\u2192\u30B9\u30A4\u30C3\u30C1\uFF08\u53F0\u6570\u5206\uFF09\u306E\u9806\u756A\u3067\u8AAD\u307F\u8FBC\u307F\u307E\u3059\u3002\u524D\u306E\u6A5F\u5668\u306E\u6295\u5165\u304C\u7D42\u308F\u308B\u3068\u3001\u6B21\u306E\u6A5F\u5668\u306E\u67A0\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3059\u3002"));
body.push(H2("6.1 \u30B3\u30F3\u30D5\u30A3\u30B0\u306E\u5F62\u5F0F"));
body.push(tbl([2400,8066],["\u6A5F\u5668","\u6295\u5165\u3059\u308B\u5185\u5BB9"],[
 ["SonicWall\uFF08\u30EB\u30FC\u30BF\uFF09",[P([run(".exp\u306E\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3067\u306F\u306A\u304F\u3001",{}),run("CLI\u306E\u53EF\u8AAD\u30C6\u30AD\u30B9\u30C8",{bold:true}),run("\u3092\u8AAD\u307F\u307E\u3059\u3002\u30A2\u30C9\u30EC\u30B9\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u30FB\u30B5\u30FC\u30D3\u30B9\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u30FB\u30A2\u30AF\u30BB\u30B9\u30EB\u30FC\u30EB\u30FBNAT\u3092\u542B\u3081\u308B\u3068FW\u691C\u8A3C\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3059\u3002")],{after:0,size:20})]],
 ["Cisco\uFF08\u30B9\u30A4\u30C3\u30C1\uFF09",[P("running-config\u306E\u30C6\u30AD\u30B9\u30C8\u3002interface range\u30FBip route\u30FBACL\u30FBdhcp pool\u30FBHSRP\u306A\u3069\u3082\u89E3\u91C8\u3057\u307E\u3059\u3002",{after:0,size:20})]]
]));
body.push(H2("6.2 \u624B\u9806"));
body.push(step("\u5404\u6A5F\u5668\u306E\u300C\u30D5\u30A1\u30A4\u30EB\u9078\u629E\u300D\u304B\u3089\u30B3\u30F3\u30D5\u30A3\u30B0\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3073\u307E\u3059\uFF08.txt / .cfg / .conf \u306A\u3069\uFF09\u3002","s2"));
body.push(step("\u8AAD\u307F\u8FBC\u3080\u3068\u300C\u6295\u5165\u5B8C\u4E86\u300D\u3068\u30A4\u30F3\u30BF\u30FC\u30D5\u30A7\u30FC\u30B9\u6570\u304C\u8868\u793A\u3055\u308C\u3001\u6B21\u306E\u6A5F\u5668\u304C\u6709\u52B9\u5316\u3055\u308C\u307E\u3059\u3002","s2"));
body.push(step("\u3059\u3079\u3066\u6295\u5165\u3059\u308B\u3068\u300C\u691C\u8A3C\u3092\u5B9F\u884C\u300D\u30DC\u30BF\u30F3\u304C\u62BC\u305B\u308B\u3088\u3046\u306B\u306A\u308A\u307E\u3059\u3002","s2"));
body.push(callout(null,[ [run("\u8A66\u3057\u305F\u3044\u3060\u3051\u306E\u3068\u304D\uFF1A",{bold:true,color:GOLDD}),run("\u300C\u30B5\u30F3\u30D7\u30EB\u30B3\u30F3\u30D5\u30A3\u30B0\u3092\u8AAD\u307F\u8FBC\u3080\u300D\u3092\u62BC\u3059\u3068\u3001\u533F\u540D\u5316\u3055\u308C\u305F\u30C7\u30E2\u7528\u8A2D\u5B9A\u304C\u4E00\u62EC\u3067\u5165\u308A\u3001\u305D\u306E\u307E\u307E\u691C\u8A3C\u3092\u4F53\u9A13\u3067\u304D\u307E\u3059\u3002")] ],"F4F4F2","D9D2C2"));

/* ===== 7. 結果の読み方 ===== */
body.push(H1("7. \u691C\u8A3C\u30EC\u30DD\u30FC\u30C8\u306E\u8AAD\u307F\u65B9"));
body.push(shot("d_results.png"));
body.push(caption("\u691C\u8A3C\u30EC\u30DD\u30FC\u30C8\u4E0A\u90E8\uFF1A\u30B9\u30B3\u30A2\u30FB\u96C6\u8A08\u30FB\u30AB\u30C6\u30B4\u30EA"));
body.push(P("\u691C\u8A3C\u3092\u5B9F\u884C\u3059\u308B\u3068\u30EC\u30DD\u30FC\u30C8\u753B\u9762\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u4E0A\u304B\u3089\u9806\u306B\u300C\u30B9\u30B3\u30A2\u300D\u300C\u96C6\u8A08\u300D\u300C\u30AB\u30C6\u30B4\u30EA\u300D\u300C\u7D4C\u8DEF\u30C8\u30EC\u30FC\u30B9\u300D\u300C\u30C8\u30DD\u30ED\u30B8\u30FC\u56F3\u300D\u300C\u30DD\u30FC\u30C8\u5225\u30B9\u30C6\u30FC\u30BF\u30B9\u300D\u300C\u5230\u9054\u6027\u30DE\u30C8\u30EA\u30AF\u30B9\u300D\u300C\u6307\u6458\u4E00\u89A7\u300D\u3068\u7D9A\u304D\u307E\u3059\u3002"));

body.push(H2("7.1 \u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u610F\u5473"));
body.push(P("\u30DD\u30FC\u30C8\u3084\u6307\u6458\u306F4\u3064\u306E\u72B6\u614B\u3067\u8868\u793A\u3055\u308C\u307E\u3059\u3002"));
body.push(tbl([1100,2400,6966],["\u8272","\u72B6\u614B","\u610F\u5473"],[
 [swatch(EMER),"\u78BA\u8A8D","\u8A2D\u5B9A\u4E0A\u306E\u554F\u984C\u306F\u898B\u3064\u304B\u3089\u306A\u304B\u3063\u305F"],
 [swatch(GARN),"\u30A8\u30E9\u30FC","\u660E\u3089\u304B\u306A\u4E0D\u6574\u5408\u3002\u4FEE\u6B63\u304C\u5FC5\u8981\uFF08\u4F8B\uFF1ANative VLAN\u4E0D\u4E00\u81F4\u3001IP\u91CD\u8907\uFF09"],
 [swatch(TOPA),"\u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB3","\u8A2D\u5B9A\u304C\u8DB3\u308A\u3066\u3044\u306A\u3044\u3002\u8981\u78BA\u8A8D\uFF08\u4F8B\uFF1AVLAN\u672A\u5B9A\u7FA9\u3001L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u7121\u3057\uFF09"],
 [swatch(STEE),"\u672A\u4F7F\u7528","\u30B3\u30F3\u30D5\u30A3\u30B0\u304C\u306A\u3044\uFF08\u672A\u63A5\u7D9A\u306E\u30DD\u30FC\u30C8\uFF09"]
]));

body.push(H2("7.2 \u30B9\u30B3\u30A2"));
body.push(P([run("\u30B9\u30B3\u30A2\u306F100\u70B9\u6E80\u70B9\u306E\u76EE\u5B89\u3067\u3001"),run("100 \u2212 \u30A8\u30E9\u30FC\u00D712 \u2212 \u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB3\u00D74",{bold:true}),run("\u3067\u8A08\u7B97\u3055\u308C\u307E\u3059\uFF080\u672A\u6E80\u306F0\uFF09\u3002\u30A8\u30E9\u30FC\u306E\u65B9\u304C\u91CD\u304F\u63A1\u70B9\u3055\u308C\u307E\u3059\u3002\u7D76\u5BFE\u7684\u306A\u5408\u683C\u70B9\u3067\u306F\u306A\u304F\u3001\u4FEE\u6B63\u306E\u512A\u5148\u5EA6\u3092\u3064\u304B\u3080\u305F\u3081\u306E\u6307\u6A19\u3068\u3057\u3066\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002")]));

body.push(H2("7.3 6\u3064\u306E\u691C\u8A3C\u30AB\u30C6\u30B4\u30EA"));
body.push(tbl([2000,8466],["\u30AB\u30C6\u30B4\u30EA","\u898B\u3066\u3044\u308B\u3082\u306E"],[
 ["\u7269\u7406\uFF08L1\uFF09","\u901F\u5EA6\u30FBDuplex\u30FBMTU\u306E\u4E0D\u4E00\u81F4\u3001EtherChannel\u30E2\u30FC\u30C9\u306E\u975E\u4E92\u63DB"],
 ["VLAN/\u30C8\u30E9\u30F3\u30AF\uFF08L2\uFF09","\u30A2\u30AF\u30BB\u30B9/\u30C8\u30E9\u30F3\u30AF\u30E2\u30FC\u30C9\u3001Native VLAN\u3001\u8A31\u53EFVLAN\u3001VLAN\u672A\u5B9A\u7FA9"],
 ["STP","L2\u30EB\u30FC\u30D7\u306E\u6709\u7121\u3001\u30C8\u30E9\u30F3\u30AF\u3078\u306Eportfast\u306A\u3069\u306E\u30EA\u30B9\u30AF"],
 ["L3\u5230\u9054\u6027","L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u306E\u6709\u7121\u3001IP\u91CD\u8907\u3001DHCP\u306Edefault-router\u4E0D\u4E00\u81F4"],
 ["FW\u30DD\u30EA\u30B7\u30FC","\u30BE\u30FC\u30F3\u9593\u306E\u8A31\u53EF/\u906E\u65AD\u3001\u5185\u90E8\u2192WAN\u306E\u8A31\u53EF\u30EB\u30FC\u30EB\u306E\u6709\u7121"],
 ["\u5805\u7262\u5316\uFF08SEC\uFF09","Telnet\u3001\u5F31\u3044enable\u3001SNMP public/private\u3001any/any/any\u8A31\u53EF\u3001\u30B7\u30E3\u30C9\u30A6\u30EB\u30FC\u30EB"]
]));

body.push(H2("7.4 \u7D4C\u8DEF\u30C8\u30EC\u30FC\u30B9\uFF08\u76EE\u7389\u6A5F\u80FD\uFF09"));
body.push(shot("e_trace.png"));
body.push(caption("\u7D4C\u8DEF\u30C8\u30EC\u30FC\u30B9\uFF1A\u3069\u306E\u30DB\u30C3\u30D7\u3067\u906E\u65AD\u3055\u308C\u305F\u304B\u304C\u4E00\u76EE\u3067\u5206\u304B\u308B"));
body.push(P("\u9001\u4FE1\u5143\u30B5\u30D6\u30CD\u30C3\u30C8\u3068\u5B9B\u5148\uFF08\u307E\u305F\u306F\u30A4\u30F3\u30BF\u30FC\u30CD\u30C3\u30C8\uFF09\u3092\u9078\u3093\u3067\u300C\u30C8\u30EC\u30FC\u30B9\u300D\u3092\u62BC\u3059\u3068\u3001\u30D1\u30B1\u30C3\u30C8\u304C\u3069\u3053\u3092\u901A\u308B\u304B\u3092\u30DB\u30C3\u30D7\u5358\u4F4D\u3067\u8FFD\u8DE1\u3057\u307E\u3059\u3002\u5404\u30DB\u30C3\u30D7\u306F\u6B21\u306E\u9806\u3067\u8868\u793A\u3055\u308C\u3001\u3069\u3053\u3067\u8A31\u53EF\u30FB\u906E\u65AD\u3055\u308C\u305F\u304B\u3001\u52B9\u3044\u305F\u30EB\u30FC\u30EB\u756A\u53F7\u307E\u3067\u5206\u304B\u308A\u307E\u3059\u3002"));
body.push(tbl([1400,9066],["\u30DB\u30C3\u30D7","\u610F\u5473"],[
 ["SRC","\u9001\u4FE1\u5143\u30DB\u30B9\u30C8\uFF08\u9078\u3093\u3060\u30B5\u30D6\u30CD\u30C3\u30C8\uFF09"],
 ["L2","\u30A2\u30AF\u30BB\u30B9\u30B9\u30A4\u30C3\u30C1\u304B\u3089\u30C8\u30E9\u30F3\u30AF\u7D4C\u7531\u3067\u30EB\u30FC\u30BF\u3078"],
 ["GW","L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\uFF08\u30EB\u30FC\u30BF\u306E\u30B5\u30D6IF\uFF09"],
 ["RT","\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\uFF08\u63A5\u7D9A\u6E08 or \u30C7\u30D5\u30A9\u30EB\u30C8\u30EB\u30FC\u30C8\u3067WAN\u3078\uFF09"],
 ["FW","\u30D5\u30A1\u30A4\u30A2\u30A6\u30A9\u30FC\u30EB\u30DD\u30EA\u30B7\u30FC\u306E\u8A55\u4FA1\uFF08\u8A31\u53EF/\u906E\u65AD\uFF09"],
 ["NAT","WAN\u5B9B\u3066\u306E\u5834\u5408\u306E\u9001\u5143\u5909\u63DB"],
 ["DST","\u5B9B\u5148\u5230\u9054"]
]));

body.push(H2("7.5 \u5230\u9054\u6027\u30DE\u30C8\u30EA\u30AF\u30B9"));
body.push(shot("f_matrix.png"));
body.push(caption("\u5230\u9054\u6027\u30DE\u30C8\u30EA\u30AF\u30B9\uFF1A\u30B5\u30D6\u30CD\u30C3\u30C8\u9593\u306E \u25CB\u00D7\u25B3"));
body.push(P("\u30B5\u30D6\u30CD\u30C3\u30C8\u540C\u58EB\u306E\u5230\u9054\u53EF\u5426\u3092\u4E00\u89A7\u3067\u8868\u793A\u3057\u307E\u3059\u3002\u8A18\u53F7\u306E\u610F\u5473\u306F\u6B21\u306E\u3068\u304A\u308A\u3067\u3059\u3002"));
body.push(tbl([1400,9066],["\u8A18\u53F7","\u610F\u5473"],[
 [[P([new TextRun({text:"\u25CB",color:EMER,bold:true,size:22})],{after:0})],"\u901A\u904E\uFF08\u30DD\u30EA\u30B7\u30FC\u4E0A\u8A31\u53EF\uFF09"],
 [[P([new TextRun({text:"\u00D7",color:GARN,bold:true,size:22})],{after:0})],"\u906E\u65AD\u30FB\u672A\u8A31\u53EF\uFF08\u30DD\u30EA\u30B7\u30FC\u3067\u30D6\u30ED\u30C3\u30AF\uFF09"],
 [[P([new TextRun({text:"\u25B3",color:TOPA,bold:true,size:22})],{after:0})],"L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u7121\u3057\uFF08\u305D\u3082\u305D\u3082\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\u3067\u304D\u306A\u3044\uFF09"]
]));
body.push(P("\u540C\u4E00\u30B5\u30D6\u30CD\u30C3\u30C8\u5185\uFF08L2\u3067\u5B8C\u7D50\uFF09\u306F\u5BFE\u8C61\u5916\u3067\u3059\u3002"));

body.push(H2("7.6 \u6307\u6458\u4E00\u89A7\u306E\u8AAD\u307F\u65B9"));
body.push(shot("g_findings.png"));
body.push(caption("\u6307\u6458\u4E00\u89A7\uFF1A\u30A8\u30E9\u30FC\uFF0F\u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB3\u3068\u63D0\u6848"));
body.push(P("\u5404\u6307\u6458\u306F\u3001\u91CD\u8981\u5EA6\uFF08\u30A8\u30E9\u30FC\u2192\u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB3\uFF09\u9806\u306B\u4E26\u3073\u3001\u6B21\u306E3\u70B9\u304C\u30BB\u30C3\u30C8\u3067\u8868\u793A\u3055\u308C\u307E\u3059\u3002"));
body.push(bullet([run("\u4F55\u304C\u8D77\u304D\u3066\u3044\u308B\u304B",{bold:true}),run("\uFF1A\u6307\u6458\u306E\u5185\u5BB9\u3068\u5BFE\u8C61\u7B87\u6240")]));
body.push(bullet([run("\u306A\u305C\u554F\u984C\u304B",{bold:true}),run("\uFF1A\u305D\u306E\u8A2D\u5B9A\u304C\u3069\u3046\u969C\u5BB3\u306B\u3064\u306A\u304C\u308B\u304B")]));
body.push(bullet([run("\u63D0\u6848",{bold:true}),run("\uFF1A\u3069\u3046\u76F4\u305B\u3070\u3088\u3044\u304B\u306E\u5177\u4F53\u7B56")]));
body.push(P("\u753B\u9762\u4E0A\u90E8\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u3067\u3001\u30AB\u30C6\u30B4\u30EA\u5225\uFF08L2\u30FBSTP\u306A\u3069\uFF09\u306B\u7D5E\u308A\u8FBC\u3093\u3067\u8868\u793A\u3067\u304D\u307E\u3059\u3002"));

/* ===== 8. レポート出力 ===== */
body.push(H1("8. \u30EC\u30DD\u30FC\u30C8\u306E\u51FA\u529B"));
body.push(P("\u30EC\u30DD\u30FC\u30C8\u753B\u9762\u4E0B\u90E8\u304B\u30893\u3064\u306E\u5F62\u5F0F\u3067\u51FA\u529B\u3067\u304D\u307E\u3059\u3002"));
body.push(tbl([2400,8066],["\u30DC\u30BF\u30F3","\u5185\u5BB9"],[
 ["JSON","\u691C\u8A3C\u7D50\u679C\u3092JSON\u30D5\u30A1\u30A4\u30EB\u3067\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3002\u4ED6\u30C4\u30FC\u30EB\u3068\u306E\u9023\u643A\u3084\u8A18\u9332\u4FDD\u5B58\u306B\u3002"],
 ["Markdown\u30B3\u30D4\u30FC","\u6307\u6458\u4E00\u89A7\u3092Markdown\u3067\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3002\u30C1\u30B1\u30C3\u30C8\u3084Teams\u3078\u306E\u8CBC\u4ED8\u306B\u3002"],
 ["\u5370\u5237/PDF","\u30D6\u30E9\u30A6\u30B6\u306E\u5370\u5237\u6A5F\u80FD\u3067PDF\u4FDD\u5B58\u3002\u63D0\u51FA\u8CC7\u6599\u306B\u3002"]
]));

/* ===== 9. よくある指摘と対処 ===== */
body.push(H1("9. \u3088\u304F\u3042\u308B\u6307\u6458\u3068\u5BFE\u51E6"));
body.push(tbl([3200,3633,3633],["\u6307\u6458","\u539F\u56E0","\u5BFE\u51E6"],[
 ["Native VLAN \u4E0D\u4E00\u81F4","\u30C8\u30E9\u30F3\u30AF\u4E21\u7AEF\u306Enative vlan\u304C\u9055\u3046","\u4E21\u7AEF\u306Enative vlan\u3092\u63C3\u3048\u308B"],
 ["Access VLAN \u304C\u672A\u5B9A\u7FA9","switchport\u3067\u6307\u5B9A\u3057\u305FVLAN\u304CVLAN DB\u306B\u306A\u3044","vlan <ID>\u3092\u5B9A\u7FA9\u3059\u308B"],
 ["L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u304C\u306A\u3044","\u305D\u306EVLAN\u306E\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4IP\u304C\u30EB\u30FC\u30BF\u306B\u7121\u3044","SonicWall\u306B\u8A72\u5F53VLAN\u306E\u30B5\u30D6IF\u3092\u4F5C\u308B"],
 ["WAN\u3078\u306E\u8A31\u53EF\u30EB\u30FC\u30EB\u304C\u306A\u3044","\u5185\u90E8\u30BE\u30FC\u30F3\u2192WAN\u306Eallow\u30EB\u30FC\u30EB\u304C\u7121\u3044","access-rule from <zone> to WAN allow\u3092\u8FFD\u52A0"],
 ["Telnet\u304C\u6709\u52B9","\u5E73\u6587\u30D7\u30ED\u30C8\u30B3\u30EB\u304C\u6709\u52B9","transport input ssh\u306E\u307F\u306B\u3059\u308B"],
 ["L2\u30EB\u30FC\u30D7","\u5197\u9577\u914D\u7DDA+STP\u672A\u8A2D\u5B9A","\u8A72\u5F53\u30B9\u30A4\u30C3\u30C1\u306BSTP\u3092\u8A2D\u5B9A\u3059\u308B"]
]));

/* ===== 10. 注意事項 ===== */
body.push(H1("10. \u3054\u5229\u7528\u4E0A\u306E\u6CE8\u610F"));
body.push(bullet("\u672C\u30C4\u30FC\u30EB\u306F\u9759\u7684\u89E3\u6790\u3067\u3042\u308A\u3001\u5B9F\u6A5F\u306E\u7269\u7406\u758E\u901A\u3092\u4FDD\u8A3C\u3057\u307E\u305B\u3093\u3002\u6700\u7D42\u78BA\u8A8D\u306F\u5FC5\u305A\u5B9F\u6A5F\u3067\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002"));
body.push(bullet("SonicWall\u306FCLI\u306E\u53EF\u8AAD\u30C6\u30AD\u30B9\u30C8\u524D\u63D0\u3067\u3059\u3002SonicOS\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u3084\u8A18\u6CD5\u306B\u3088\u3063\u3066\u306F\u8AAD\u307F\u53D6\u308C\u306A\u3044\u8A18\u8FF0\u304C\u3042\u308A\u307E\u3059\u3002"));
body.push(bullet("\u30DD\u30FC\u30C8\u914D\u7F6E\u306F\u6A5F\u7A2E\u3054\u3068\u306E\u4EE3\u8868\u7684\u306A\u3082\u306E\u3067\u3001\u5B9F\u6A5F\u306E\u7269\u7406\u30EC\u30A4\u30A2\u30A6\u30C8\u3068\u7570\u306A\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002"));
body.push(bullet("\u5B9F\u30B3\u30F3\u30D5\u30A3\u30B0\u3092\u6271\u3046\u969B\u306F\u3001\u516C\u958B\u30FB\u5171\u6709\u524D\u306B\u30DB\u30B9\u30C8\u540D\u30FBIP\u30FB\u62E0\u70B9\u540D\u306A\u3069\u306E\u6A5F\u5BC6\u60C5\u5831\u306E\u53D6\u308A\u6271\u3044\u306B\u3054\u6CE8\u610F\u304F\u3060\u3055\u3044\u3002"));

body.push(spacer(120));
body.push(new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:4,color:GOLD,space:6}},spacing:{before:60,after:0},
  alignment:AlignmentType.CENTER,children:[new TextRun({text:"FACET \u2014 Network Verification Atelier",italics:true,size:18,color:"999999"})]}));

/* ============ DOC ============ */
const doc=new Document({
  creator:"FACET",title:"FACET \u4F7F\u3044\u65B9\u8AAC\u660E\u66F8",
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
    {reference:"b",levels:[{level:0,format:LevelFormat.BULLET,text:"\u2022",alignment:AlignmentType.LEFT,style:{run:{font:FONT},paragraph:{indent:{left:520,hanging:260}}}}]},
    {reference:"s1",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]},
    {reference:"s2",levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:300}}}}]}
  ]},
  sections:[{
    properties:{page:{size:{width:11906,height:16838},margin:{top:720,right:720,bottom:720,left:720}}},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,
      children:[new TextRun({text:"FACET \u4F7F\u3044\u65B9\u8AAC\u660E\u66F8 \u00B7 ",size:16,color:"999999"}),
        new TextRun({children:[PageNumber.CURRENT],size:16,color:"999999"})]})]})},
    children:body
  }]
});

Packer.toBuffer(doc).then(function(buf){fs.writeFileSync("/home/claude/FACET_User_Guide.docx",buf);console.log("written",buf.length);});
