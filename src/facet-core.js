/**
 * ⚠ DEPRECATED — Sprint 1.5 (2026-06-23) で本ファイルは src/engine/*.ts に
 * 全面移行しました。動作中の検証エンジンは src/engine/ 配下、テストは
 * test/engine/engine.test.ts (Vitest, 46 ケース) を参照。
 *
 * 本ファイル(およびペアの app/facet.html)は履歴用に残置していますが、
 * 編集禁止です。エンジンロジックの修正は src/engine/*.ts に対して行い、
 * UI は src/ui/**/*.tsx を編集してください。
 *
 * 元の v3.1.0 のヘッダコメントは以下に保持しています(参考用):
 * ---------------------------------------------------------------------------
 * FACET — Network Verification Atelier : verification engine (core)
 *
 * DOM-FREE. Pure logic only. Safe to require() in Node for tests, and to
 * import into the future React/TS port. The browser app (app/facet.html)
 * currently embeds its OWN copy of this IIFE — see docs/ARCHITECTURE.md
 * (》core duplication《) for the de-dup plan. Keep this file and the copy
 * inside facet.html behaviourally identical until they are unified.
 *
 * Public API (see docs/ARCHITECTURE.md for full signatures):
 *   CATALOG, switchPorts, parseCisco, parseSonicWall, mapToPorts,
 *   verify, buildSubnets, buildMatrix, autoLinks, pathTrace, evalFW,
 *   expandVlans, expandIfRange, subnetOf, inSubnet
 */
var FACET=(function(){

/* ---- 機器マスタ ---- */
var CATALOG={
  router:[
    {id:'TZ270',name:'SonicWall TZ270',ports:rrow(8,'rj45','1GbE')},
    {id:'TZ370',name:'SonicWall TZ370',ports:rrow(8,'rj45','1GbE')},
    {id:'TZ470',name:'SonicWall TZ470',ports:rrow(8,'rj45','2.5GbE')},
    {id:'TZ570',name:'SonicWall TZ570',ports:rrow(8,'rj45','2.5GbE').concat(rsfp(8,2,'SFP+'))},
    {id:'TZ670',name:'SonicWall TZ670',ports:rrow(8,'rj45','2.5GbE').concat(rsfp(8,2,'SFP+'))},
    {id:'NSa2700',name:'SonicWall NSa 2700',ports:rrow(8,'rj45','1GbE').concat(rrj(8,4,'2.5GbE')).concat(rsfp(12,2,'SFP+'))},
    {id:'NSa3700',name:'SonicWall NSa 3700',ports:rrow(8,'rj45','1GbE').concat(rrj(8,4,'2.5GbE')).concat(rsfp(12,4,'SFP+'))}
  ],
  switch:[
    {id:'C1000-24',name:'Catalyst 1000-24T',down:24,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp'},
    {id:'C1000-48',name:'Catalyst 1000-48T',down:48,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp'},
    {id:'C2960X-24',name:'Catalyst 2960-X 24',down:24,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp'},
    {id:'C2960X-48',name:'Catalyst 2960-X 48',down:48,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp'},
    {id:'C9200-24',name:'Catalyst 9200-24P',down:24,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp+'},
    {id:'C9200-48',name:'Catalyst 9200-48P',down:48,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp+'},
    {id:'C9300-24',name:'Catalyst 9300-24P',down:24,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp+'},
    {id:'C9300-48',name:'Catalyst 9300-48P',down:48,up:4,prefix:'GigabitEthernet1/0/',uplinkType:'sfp+'}
  ]
};
function rrow(n,t,s){var a=[];for(var i=0;i<n;i++)a.push({label:'X'+i,type:t,speed:s,iface:'X'+i});return a;}
function rrj(st,n,s){var a=[];for(var i=0;i<n;i++)a.push({label:'X'+(st+i),type:'rj45',speed:s,iface:'X'+(st+i)});return a;}
function rsfp(st,n,s){var a=[];for(var i=0;i<n;i++)a.push({label:'X'+(st+i),type:'sfp+',speed:s,iface:'X'+(st+i)});return a;}
function switchPorts(m){var p=[],i;for(i=1;i<=m.down;i++)p.push({label:String(i),type:'rj45',speed:'1GbE',iface:m.prefix+i});
  for(i=1;i<=m.up;i++)p.push({label:'U'+i,type:m.uplinkType,speed:m.uplinkType==='sfp+'?'10G':'1G',iface:(m.uplinkType==='sfp+'?'TenGigabitEthernet1/1/':'GigabitEthernet1/1/')+i});return p;}

/* ---- helpers ---- */
function expandVlans(str){var out=[];String(str).split(',').forEach(function(part){var r=part.match(/(\d+)\s*-\s*(\d+)/);
  if(r){for(var i=+r[1];i<=+r[2];i++)out.push(String(i));}else if(/^\d+$/.test(part.trim()))out.push(part.trim());});return out;}
function ipToInt(ip){return ip.split('.').reduce(function(a,o){return (a<<8)+(+o);},0)>>>0;}
function intToIp(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
function maskBits(m){return m.split('.').reduce(function(a,o){return a+(((+o).toString(2).match(/1/g)||[]).length);},0);}
function bitsToMaskInt(b){return b===0?0:((0xffffffff<<(32-b))>>>0);}
function subnetOf(ip,mask){var net=((ipToInt(ip)&ipToInt(mask))>>>0);return intToIp(net)+'/'+maskBits(mask);}
function inSubnet(ip,cidr){if(!ip||!cidr)return false;var p=cidr.split('/');var net=ipToInt(p[0]),m=bitsToMaskInt(+p[1]);return ((ipToInt(ip)&m)>>>0)===((net&m)>>>0);}
function canonIf(name){if(/^X\d/i.test(name))return name.replace(/:?V\d+$/i,'').toUpperCase();
  var m=name.match(/(\d+\/\d+\/\d+|\d+\/\d+)\s*$/);return m?'P'+m[1]:name.toUpperCase();}
function expandIfRange(spec,prefix){ // "Gi1/0/1 - 5" or "1-5" relative
  var out=[];spec.split(',').forEach(function(seg){seg=seg.trim();
    var m=seg.match(/^(\D*?)(\d+\/\d+\/)(\d+)\s*-\s*(\d+)$/)||seg.match(/^(\D*?)(\d+\/)(\d+)\s*-\s*(\d+)$/);
    if(m){for(var i=+m[3];i<=+m[4];i++)out.push((prefix||(m[1]+m[2]))+i);return;}
    var s=seg.match(/^(\d+)\s*-\s*(\d+)$/);if(s&&prefix){for(var j=+s[1];j<=+s[2];j++)out.push(prefix+j);return;}
    if(seg)out.push(seg);});
  return out;}

/* ---- Cisco IOS パーサ ---- */
function parseCisco(text){
  var out={hostname:null,vlans:{},interfaces:{},svis:{},stpMode:null,defaultGw:null,routes:[],acls:{},dhcp:{},sec:{telnet:false,sshOnly:false,enableSecret:false,enablePassword:false,snmpWeak:false,pwEncrypt:false}};
  var lines=text.split(/\r?\n/);var cur=null,vl=null,curAcl=null;
  function flush(){if(cur){cur.names.forEach(function(nm){var c={};for(var k in cur)if(k!=='names')c[k]=Array.isArray(cur[k])?cur[k].slice():cur[k];c.name=nm;out.interfaces[nm]=c;});cur=null;}}
  function mkif(names){return {names:names,sviVlan:(names[0].match(/^Vlan(\d+)/i)||[])[1]||null,mode:null,accessVlan:null,trunkNative:null,trunkAllowed:[],channel:null,ip:null,mask:null,secondary:[],speed:null,duplex:null,mtu:null,portfast:false,bpduguard:false,aclIn:null,aclOut:null,standby:null,description:null,shutdown:false};}
  for(var li=0;li<lines.length;li++){
    var raw=lines[li];var t=raw.replace(/\t/g,' ').trim();var m;
    if(m=t.match(/^hostname\s+(\S+)/)){out.hostname=m[1];continue;}
    if(m=t.match(/^spanning-tree\s+mode\s+(\S+)/)){out.stpMode=m[1];continue;}
    if(m=t.match(/^ip\s+default-gateway\s+([\d.]+)/)){out.defaultGw=m[1];continue;}
    if(m=t.match(/^ip\s+route\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)){out.routes.push({dst:m[1],mask:m[2],nh:m[3]});continue;}
    if(/^no\s+service\s+password-encryption/.test(t)){out.sec.pwEncrypt=false;continue;}
    if(/^service\s+password-encryption/.test(t)){out.sec.pwEncrypt=true;continue;}
    if(m=t.match(/^enable\s+secret\b/)){out.sec.enableSecret=true;continue;}
    if(m=t.match(/^enable\s+password\b/)){out.sec.enablePassword=true;continue;}
    if(m=t.match(/^snmp-server\s+community\s+(\S+)/)){if(/^(public|private)$/i.test(m[1]))out.sec.snmpWeak=true;continue;}
    if(m=t.match(/^transport\s+input\s+(.+)/)){if(/telnet/i.test(m[1]))out.sec.telnet=true;if(/^ssh\s*$/i.test(m[1].trim()))out.sec.sshOnly=true;continue;}
    if(m=t.match(/^ip\s+access-list\s+\w+\s+(\S+)/)){curAcl=m[1];out.acls[curAcl]=out.acls[curAcl]||[];flush();continue;}
    if(m=t.match(/^access-list\s+(\S+)\s+(permit|deny)\s+(.+)/)){out.acls[m[1]]=out.acls[m[1]]||[];out.acls[m[1]].push({action:m[2],rest:m[3]});continue;}
    if(curAcl&&(m=t.match(/^(permit|deny)\s+(.+)/))){out.acls[curAcl].push({action:m[1],rest:m[2]});continue;}
    if(m=t.match(/^ip\s+dhcp\s+pool\s+(\S+)/)){flush();curAcl=null;out._dhcp=m[1];out.dhcp[m[1]]={network:null,gw:null};continue;}
    if(out._dhcp){
      if(m=t.match(/^network\s+([\d.]+)\s+([\d.]+)/)){out.dhcp[out._dhcp].network=subnetOf(m[1],m[2]);continue;}
      if(m=t.match(/^default-router\s+([\d.]+)/)){out.dhcp[out._dhcp].gw=m[1];continue;}
    }
    if(m=t.match(/^interface\s+range\s+(.+)/)){flush();curAcl=null;out._dhcp=null;cur=mkif(expandIfRange(m[1]));continue;}
    if(m=t.match(/^interface\s+(\S+)/)){flush();curAcl=null;out._dhcp=null;cur=mkif([m[1]]);continue;}
    if(/^!/.test(t)){flush();vl=null;curAcl=null;out._dhcp=null;continue;}
    if(!cur){
      if(m=t.match(/^vlan\s+([\d,\-]+)\s*$/)){vl=m[1];expandVlans(m[1]).forEach(function(v){if(!out.vlans[v])out.vlans[v]='VLAN'+v;});continue;}
      if((m=t.match(/^name\s+(\S+)/))&&vl){expandVlans(vl).forEach(function(v){out.vlans[v]=m[1];});vl=null;continue;}
      continue;
    }
    if(m=t.match(/^description\s+(.+)/))cur.description=m[1];
    else if(/switchport mode access/.test(t))cur.mode='access';
    else if(/switchport mode trunk/.test(t))cur.mode='trunk';
    else if(m=t.match(/switchport access vlan\s+(\d+)/))cur.accessVlan=m[1];
    else if(m=t.match(/switchport trunk native vlan\s+(\d+)/))cur.trunkNative=m[1];
    else if(m=t.match(/switchport trunk allowed vlan\s+(?:add\s+)?([\d,\-]+)/))cur.trunkAllowed=cur.trunkAllowed.concat(expandVlans(m[1]));
    else if(m=t.match(/channel-group\s+(\d+)\s+mode\s+(\S+)/))cur.channel={id:m[1],mode:m[2]};
    else if(m=t.match(/ip address\s+([\d.]+)\s+([\d.]+)\s+secondary/)){cur.secondary.push({ip:m[1],mask:m[2]});}
    else if(m=t.match(/ip address\s+([\d.]+)\s+([\d.]+)/)){cur.ip=m[1];cur.mask=m[2];}
    else if(m=t.match(/^speed\s+(\d+|auto)/))cur.speed=m[1];
    else if(m=t.match(/^duplex\s+(\S+)/))cur.duplex=m[1];
    else if(m=t.match(/^mtu\s+(\d+)/))cur.mtu=m[1];
    else if(m=t.match(/ip access-group\s+(\S+)\s+(in|out)/)){if(m[2]==='in')cur.aclIn=m[1];else cur.aclOut=m[1];}
    else if(m=t.match(/^standby\s+\d+\s+ip\s+([\d.]+)/))cur.standby=m[1];
    else if(/spanning-tree portfast/.test(t)&&!/disable/.test(t))cur.portfast=true;
    else if(/spanning-tree bpduguard enable/.test(t))cur.bpduguard=true;
    else if(/^shutdown$/.test(t))cur.shutdown=true;
  }
  flush();
  Object.keys(out.interfaces).forEach(function(k){var i=out.interfaces[k];if(i.sviVlan&&i.ip)out.svis[i.sviVlan]={ip:i.ip,mask:i.mask};});
  delete out._dhcp;
  return out;
}

/* ---- SonicWall パーサ (zones/subif/objects/rules/nat/dhcp/routes) ---- */
function parseSonicWall(text){
  var out={hostname:null,vlans:{},interfaces:{},zonesByIf:{},rules:[],nat:[],addr:{},svc:{},dhcp:[],routes:[],sec:{pingWanAllow:false,mgmtWanAllow:false}};
  var lines=text.split(/\r?\n/);var cur=null,rule=null,nat=null;
  function flushIf(){if(cur){out.interfaces[cur.name]=cur;cur=null;}}
  function flushRule(){if(rule){out.rules.push(rule);rule=null;}}
  function flushNat(){if(nat){out.nat.push(nat);nat=null;}}
  function flushAll(){flushIf();flushRule();flushNat();}
  for(var li=0;li<lines.length;li++){
    var t=lines[li].replace(/\t/g,' ').trim();var m;
    if(m=t.match(/^(?:system\s+)?name\s+(\S+)/i)){if(!out.hostname)out.hostname=m[1];continue;}
    if(m=t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+host\s+([\d.]+)(?:\s+zone\s+(\S+))?/i)){flushAll();out.addr[m[1]]={type:'host',ip:m[2],zone:m[3]||null};continue;}
    if(m=t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+network\s+([\d.]+)\s+([\d.]+)(?:\s+zone\s+(\S+))?/i)){flushAll();out.addr[m[1]]={type:'network',cidr:subnetOf(m[2],m[3]),zone:m[4]||null};continue;}
    if(m=t.match(/^address-object\s+(?:ipv4\s+)?(\S+)\s+range\s+([\d.]+)\s+([\d.]+)/i)){flushAll();out.addr[m[1]]={type:'range',from:m[2],to:m[3]};continue;}
    if(m=t.match(/^service-object\s+(\S+)\s+(\S+)\s+(\d+)(?:\s*-\s*(\d+))?/i)){out.svc[m[1]]={proto:m[2],from:+m[3],to:m[4]?+m[4]:+m[3]};continue;}
    if(m=t.match(/^nat-policy/i)){flushAll();nat={raw:t,orig:null,trans:null,iface:null};continue;}
    if(nat){
      if(m=t.match(/^original-source\s+(\S+)/i))nat.orig=m[1];
      else if(m=t.match(/^translated-source\s+(\S+)/i))nat.trans=m[1];
      else if(m=t.match(/^outbound-interface\s+(\S+)/i))nat.iface=m[1];
      if(/^(end|exit)\s*$/i.test(t)||t===''){flushNat();}
      continue;
    }
    if(m=t.match(/^access-rule\s+from\s+(\S+)\s+to\s+(\S+)/i)){flushAll();rule={from:m[1],to:m[2],action:'allow',src:'any',dst:'any',service:'any',enabled:true};continue;}
    if(rule){
      if(m=t.match(/^action\s+(\S+)/i))rule.action=m[1].toLowerCase();
      else if(m=t.match(/^source\s+(.+)/i))rule.src=m[1].trim();
      else if(m=t.match(/^destination\s+(.+)/i))rule.dst=m[1].trim();
      else if(m=t.match(/^service\s+(.+)/i))rule.service=m[1].trim();
      else if(/^(disable|disabled|no\s+enable)/i.test(t))rule.enabled=false;
      else if(/^(end|exit)\s*$/i.test(t)||t==='')flushRule();
      continue;
    }
    if(m=t.match(/^dhcp-?(?:server|scope)\b.*?([\d.]+)\s*-\s*([\d.]+)/i)){out.dhcp.push({from:m[1],to:m[2]});continue;}
    if(m=t.match(/^route-?policy.*?dest(?:ination)?\s+([\d.]+)\s+([\d.]+).*?gateway\s+([\d.]+)/i)){out.routes.push({dst:m[1],mask:m[2],nh:m[3]});continue;}
    if(/ping.*from\s+wan/i.test(t))out.sec.pingWanAllow=true;
    if(/management.*(from\s+wan|wan.*allow)/i.test(t))out.sec.mgmtWanAllow=true;
    if(m=t.match(/^interface\s+(X\d+(?::?V?\d+)?)/i)){flushAll();
      var name=m[1].replace(/:?V(\d+)/i,':V$1');var vt=name.match(/V(\d+)/);
      cur={name:name,vlanTag:vt?vt[1]:null,zone:null,ip:null,mask:null,description:null,shutdown:false,mode:vt?'vlan-subif':null,trunkAllowed:vt?[vt[1]]:[]};continue;}
    if(!cur)continue;
    if(m=t.match(/^zone\s+(\S+)/i)){cur.zone=m[1];out.zonesByIf[cur.name]=m[1];}
    else if(m=t.match(/^ip-?assignment\s+(\S+)/i)){if(!cur.zone)cur.zone=m[1];}
    else if(m=t.match(/^ip\s+([\d.]+)\s+netmask\s+([\d.]+)/i)){cur.ip=m[1];cur.mask=m[2];}
    else if(m=t.match(/^vlan\s+([\d,\-]+)/i)){cur.trunkAllowed=cur.trunkAllowed.concat(expandVlans(m[1]));cur.vlanTag=cur.vlanTag||expandVlans(m[1])[0];}
    else if(m=t.match(/^comment\s+(.+)/i))cur.description=m[1].replace(/^"|"$/g,'');
  }
  flushAll();
  Object.keys(out.interfaces).forEach(function(k){var i=out.interfaces[k];if(i.vlanTag)out.vlans[i.vlanTag]='VLAN'+i.vlanTag;});
  return out;
}

/* ---- ポートマッピング ---- */
function mapToPorts(dev){
  dev.ports.forEach(function(p){p.cfg=null;p.status='idle';p.msg=null;});
  if(!dev.parsed)return;
  var byCanon={};dev.ports.forEach(function(p){byCanon[canonIf(p.iface)]=p;});
  Object.keys(dev.parsed.interfaces).forEach(function(k){var ifc=dev.parsed.interfaces[k];
    if(/^Vlan/i.test(ifc.name))return;
    var port=byCanon[canonIf(ifc.name)];if(!port)return;
    if(!port.cfg){port.cfg={};for(var kk in ifc)port.cfg[kk]=ifc[kk];}
    else{
      if(ifc.trunkAllowed)port.cfg.trunkAllowed=uniq((port.cfg.trunkAllowed||[]).concat(ifc.trunkAllowed));
      if(ifc.vlanTag)port.cfg.subVlans=(port.cfg.subVlans||[]).concat(ifc.vlanTag);
      if(ifc.zone&&!port.cfg.zone)port.cfg.zone=ifc.zone;
    }
  });
}
function uniq(a){return a.filter(function(v,i){return a.indexOf(v)===i;});}

/* ---- サブネット表 ---- */
function buildSubnets(state){
  var subs=[],seen={};
  function add(vlan,ip,mask,zone,dev,iface){if(!ip||!mask)return;var cidr=subnetOf(ip,mask);var key=cidr+'|'+(vlan||'');
    if(seen[key])return;seen[key]=1;subs.push({vlan:vlan||null,cidr:cidr,gw:ip,zone:zone||'LAN',dev:dev,iface:iface});}
  var r=state.router;if(r.parsed)Object.keys(r.parsed.interfaces).forEach(function(k){var i=r.parsed.interfaces[k];add(i.vlanTag,i.ip,i.mask,i.zone,r.key,i.name);});
  state.switches.forEach(function(sw){if(sw.parsed&&sw.parsed.svis)Object.keys(sw.parsed.svis).forEach(function(v){var o=sw.parsed.svis[v];add(v,o.ip,o.mask,'LAN',sw.key,'Vlan'+v);});});
  return subs;
}

/* ---- object 解決 ---- */
function objContains(addr,name,ip){ // does object 'name' contain ip ?
  if(!name||/^any$/i.test(name))return true;
  var o=addr[name];if(!o){ // maybe a raw cidr/host
    if(/^[\d.]+\/\d+$/.test(name))return inSubnet(ip,name);
    if(/^[\d.]+$/.test(name))return ip===name;
    return false; // unknown object -> treat as no match (caller handles)
  }
  if(o.type==='host')return ip===o.ip;
  if(o.type==='network')return inSubnet(ip,o.cidr);
  if(o.type==='range')return (ipToInt(ip)>=ipToInt(o.from)&&ipToInt(ip)<=ipToInt(o.to));
  return false;
}
/* well-known な service 名 → port (小さく抑える。名前付き svc-object があれば優先) */
var WELL_KNOWN_SVC={
  http:{proto:'tcp',from:80,to:80},     https:{proto:'tcp',from:443,to:443},
  ssh:{proto:'tcp',from:22,to:22},      telnet:{proto:'tcp',from:23,to:23},
  ftp:{proto:'tcp',from:21,to:21},      smtp:{proto:'tcp',from:25,to:25},
  dns:{proto:null,from:53,to:53},       ping:{proto:'icmp',from:null,to:null},
  icmp:{proto:'icmp',from:null,to:null}
};
/* 文字列の service spec を {proto, from, to} に解決。
   返り値: null=「任意 (any)」、undefined=「未知」、それ以外= 解決済み                  */
function resolveSvc(svc,spec){
  if(!spec||/^any$/i.test(spec))return null;
  if(svc&&svc[spec]){var s=svc[spec];return {proto:(s.proto||'').toLowerCase()||null,from:s.from,to:s.to};}
  if(/^\d+$/.test(spec))return {proto:null,from:+spec,to:+spec};
  var m=spec.match(/^(tcp|udp|icmp)\s*\/\s*(\d+)(?:\s*-\s*(\d+))?$/i);
  if(m)return {proto:m[1].toLowerCase(),from:+m[2],to:m[3]?+m[3]:+m[2]};
  var w=WELL_KNOWN_SVC[spec.toLowerCase()];
  if(w)return {proto:w.proto,from:w.from,to:w.to};
  return undefined;
}
/* ルール側 spec と要求側 spec の双方向 overlap 判定。
   - どちらか any → match
   - どちらか未知 → 過剰拒否を避けて permissive (従来挙動を踏襲)
   - 両方解決済み → プロトコル一致 (どちらか null は wildcard) + ポート範囲 overlap */
function svcMatch(svc,ruleSpec,reqSpec){
  var r=resolveSvc(svc,ruleSpec),q=resolveSvc(svc,reqSpec);
  if(r===null||q===null)return true;
  if(r===undefined||q===undefined)return true;
  if(r.proto&&q.proto&&r.proto!==q.proto)return false;
  if(r.from==null||q.from==null)return true;
  return !(r.to<q.from||q.to<r.from);
}

/* ---- FW 評価 (object対応) ---- */
function evalFW(rparsed,srcZone,dstZone,srcIp,dstIp,service){
  if(!rparsed)return {action:srcZone===dstZone?'allow':'deny',rule:null,reason:'default'};
  var rules=rparsed.rules||[];
  for(var i=0;i<rules.length;i++){var rl=rules[i];if(rl.enabled===false)continue;
    if(rl.from.toUpperCase()!==srcZone.toUpperCase()&&rl.from.toUpperCase()!=='ANY')continue;
    if(rl.to.toUpperCase()!==dstZone.toUpperCase()&&rl.to.toUpperCase()!=='ANY')continue;
    if(srcIp&&!objContains(rparsed.addr,rl.src,srcIp))continue;
    if(dstIp&&!objContains(rparsed.addr,rl.dst,dstIp))continue;
    if(!svcMatch(rparsed.svc,rl.service,service))continue;
    return {action:rl.action,rule:rl,reason:'rule',index:i};
  }
  return {action:srcZone.toUpperCase()===dstZone.toUpperCase()?'allow':'deny',rule:null,reason:srcZone.toUpperCase()===dstZone.toUpperCase()?'intra-zone':'default-deny'};
}

/* ---- 到達性マトリクス ---- */
function buildMatrix(state,subnets){
  var r=state.router;
  function reach(s,d){if(s===d)return 'self';if(!s.gw||!d.gw)return 'nogw';
    var res=evalFW(r.parsed,s.zone||'LAN',d.zone||'LAN',s.gw,d.gw,'any');
    return res.action==='allow'?'ok':'deny';}
  var cells={},blocked=[];
  subnets.forEach(function(s){cells[s.cidr]={};subnets.forEach(function(d){var v=reach(s,d);cells[s.cidr][d.cidr]=v;
    if(v==='deny')blocked.push({from:s.cidr,to:d.cidr,fromZone:s.zone,toZone:d.zone});});});
  return {cells:cells,blocked:blocked,subnets:subnets};
}

/* ---- 経路トレース ---- */
function pathTrace(state,srcCidr,dstSpec,service){
  var subs=buildSubnets(state);var r=state.router;
  function finalize(h,v,msg){return {ok:v==='ok',hops:h,verdict:v,message:msg};}
  var src=subs.filter(function(s){return s.cidr===srcCidr;})[0];
  if(!src)return finalize([{node:'?',detail:'送信元サブネットが見つかりません',status:'deny'}],'deny','送信元サブネットが見つかりません');
  var hops=[];
  hops.push({node:'SRC',detail:src.dev+' の VLAN'+(src.vlan||'-')+' 内ホスト ('+src.cidr+')',status:'ok'});

  var dst,dstZone,dstIp,wan=false,wsub=null;
  if(dstSpec==='__WAN__'){
    wan=true;dstZone='WAN';
    wsub=subs.filter(function(s){return /WAN/i.test(s.zone);})[0];
    if(!wsub)return finalize(hops,'deny','WAN インターフェイスが検出されません');
    dstIp=intToIp((ipToInt(wsub.gw))+1);
  }else{
    dst=subs.filter(function(s){return s.cidr===dstSpec;})[0];
    if(!dst)return finalize(hops,'deny','宛先サブネットが見つかりません');
    /* 同一サブネット: L3 を経由しないので L2 で完結 (GW/RT/FW は経路に含めない) */
    if(src.cidr===dst.cidr){
      hops.push({node:'DST',detail:'同一サブネット内のホスト ('+dst.cidr+')',status:'ok'});
      return finalize(hops,'ok','同一サブネット内 — L2 で完結（ルータ・FW は通らない）');
    }
    dstZone=dst.zone||'LAN';
    dstIp=intToIp((ipToInt(dst.gw)&bitsToMaskInt(+dst.cidr.split('/')[1]))+20);
  }

  /* L3 経路 */
  if(src.dev!==r.key)hops.push({node:'L2',detail:src.dev+' → トランク → '+r.key+'（VLAN'+(src.vlan||'-')+' タグ付き転送）',status:'ok'});
  hops.push({node:'GW',detail:'L3 ゲートウェイ '+src.gw+' ('+r.key+':'+src.iface+')',status:'ok'});
  if(wan)hops.push({node:'RT',detail:'デフォルトルートで WAN へ ('+wsub.iface+')',status:'ok'});
  else   hops.push({node:'RT',detail:r.key+' が VLAN'+(dst.vlan||'-')+' ('+dst.cidr+') へルーティング（接続済）',status:'ok'});

  /* FW */
  var fw=evalFW(r.parsed,src.zone||'LAN',dstZone,src.gw,dstIp,service||'any');
  var fwd=fw.action==='allow'?'ok':'deny';
  var rdesc=fw.reason==='rule'?('ルール #'+(fw.index+1)+' '+fw.rule.from+'→'+fw.rule.to+' ('+fw.rule.action+', svc='+fw.rule.service+')')
    :fw.reason==='intra-zone'?'同一ゾーン内（既定許可）':fw.reason==='default-deny'?'該当ルールなし（ゾーン間既定遮断）':'既定';
  hops.push({node:'FW',detail:(src.zone||'LAN')+' → '+dstZone+' : '+rdesc,status:fwd});
  if(fwd==='deny')return finalize(hops,'deny','ファイアウォールポリシーで遮断');

  /* NAT */
  if(wan){var hasNat=r.parsed&&r.parsed.nat&&r.parsed.nat.length;
    hops.push({node:'NAT',detail:hasNat?'明示的 NAT ポリシーで送元変換':'デフォルト SNAT（WAN IP へ）を想定',status:'info'});}
  hops.push({node:'DST',detail:wan?'インターネット':(dst.dev+' VLAN'+(dst.vlan||'-')+' ('+dst.cidr+')'),status:'ok'});
  return finalize(hops,'ok','設定上は到達可能');
}

/* ---- 検証エンジン ---- */
function verify(state){
  var F=[];var devs=state.devices;var router=state.router;
  devs.forEach(function(d){d.ports.forEach(function(p){p.status='idle';p.msg=null;});});
  function setPort(dev,iface,level,msg){if(!dev)return;var p=dev.ports.filter(function(x){return x.iface===iface;})[0];
    if(p&&(level==='err'||(level==='lack'&&p.status!=='err'))){p.status=level;p.msg=msg;}}
  function add(cat,level,where,desc,why,fix){F.push({cat:cat,level:level,where:where,desc:desc,why:why,fix:fix});}

  /* L2 個別IF */
  devs.forEach(function(d){if(d.role!=='switch')return;var vlans=d.parsed?d.parsed.vlans:{};
    d.ports.forEach(function(p){var c=p.cfg;if(!c)return;
      if(c.shutdown){add('L2','lack',d.key+':'+p.iface,p.iface+' が shutdown です。','リンク予定ポートが無効だと疎通しません。','no shutdown を投入。');setPort(d,p.iface,'lack');}
      if(c.mode==='access'&&c.accessVlan&&!vlans[c.accessVlan]){add('L2','lack',d.key+':'+p.iface,'Access VLAN '+c.accessVlan+' が未定義。','VLAN DB に無いVLANは通信に使えません。','vlan '+c.accessVlan+' を定義。');setPort(d,p.iface,'lack');}
      if(c.mode==='trunk'&&(!c.trunkAllowed||!c.trunkAllowed.length)){add('L2','lack',d.key+':'+p.iface,'トランクの allowed vlan 未指定（全許可扱い）。','明示しないと意図しないVLANが透過します。','allowed vlan を明示。');setPort(d,p.iface,'lack');}
      if(!c.mode&&(c.accessVlan||(c.trunkAllowed&&c.trunkAllowed.length))){add('L2','lack',d.key+':'+p.iface,'switchport mode 未指定。','モード未定義は機種既定動作依存で不安定。','access / trunk を明示。');setPort(d,p.iface,'lack');}
    });});

  /* リンク */
  var links=state.links||[];
  function port(key,iface){var d=devs.filter(function(x){return x.key===key;})[0];return d?d.ports.filter(function(p){return p.iface===iface;})[0]:null;}
  function cfgOf(key,iface){var p=port(key,iface);return p?p.cfg:null;}
  links.forEach(function(L){
    var ca=cfgOf(L.a.key,L.a.iface),cb=cfgOf(L.b.key,L.b.iface);
    var da=devs.filter(function(x){return x.key===L.a.key;})[0],db=devs.filter(function(x){return x.key===L.b.key;})[0];
    var tag=L.a.key+':'+L.a.iface+' ↔ '+L.b.key+':'+L.b.iface;
    if(!ca||!cb){var miss=!ca?L.a:L.b;add('L2','lack',tag,'リンク端 '+miss.key+':'+miss.iface+' に構成がありません。','指定した配線に対応するインターフェース設定が無い。','該当ポートをトランクとして構成。');setPort(da,L.a.iface,'lack');setPort(db,L.b.iface,'lack');return;}
    var ma=ca.mode||(ca.subVlans?'trunk':null),mb=cb.mode;
    if(ma&&mb&&((ma==='trunk')!==(mb==='trunk'))){add('L2','err',tag,'両端モード不一致（'+ma+' ↔ '+mb+'）。','片側access/片側trunkはVLANタグ処理が食い違い疎通不可。','両端を trunk に統一。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}
    var na=ca.trunkNative||'1',nb=cb.trunkNative||'1';
    if((ca.mode==='trunk'||ca.subVlans)&&cb.mode==='trunk'&&na!==nb){add('L2','err',tag,'Native VLAN 不一致（'+na+' ↔ '+nb+'）。','ネイティブVLAN不一致はタグ無しフレームが別VLANへ漏れる典型ミス。','両端の native vlan を一致させる。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}
    var aa=ca.trunkAllowed||[],bb=cb.trunkAllowed||[];
    if(aa.length&&bb.length){var inter=bb.filter(function(v){return aa.indexOf(v)>=0;});
      if(!inter.length){add('L2','err',tag,'許可VLANに共通項なし（['+aa+'] ↔ ['+bb+']）。','共通VLANが無いとどのVLANも通過できません。','共通VLANを双方の allowed に含める。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}
      else{var onlyB=bb.filter(function(v){return aa.indexOf(v)<0;});if(onlyB.length){add('L2','lack',tag,'VLAN '+onlyB.join(',')+' がルータ側で未許可。','スイッチ側のVLANがルータに無いとL3ゲートウェイが存在しない。','SonicWall に VLAN '+onlyB.join(',')+' のサブIFを追加。');setPort(da,L.a.iface,'lack');setPort(db,L.b.iface,'lack');}}
    }
    /* L1 */
    if(ca.speed&&cb.speed&&ca.speed!=='auto'&&cb.speed!=='auto'&&ca.speed!==cb.speed){add('L1','err',tag,'速度不一致（'+ca.speed+' ↔ '+cb.speed+'）。','固定速度の不一致はリンクダウンの原因。','速度を一致 or 両端 auto。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}
    if(ca.duplex&&cb.duplex&&ca.duplex!==cb.duplex){add('L1','err',tag,'Duplex 不一致（'+ca.duplex+' ↔ '+cb.duplex+'）。','デュプレックス不一致は遅延・パケロスの典型原因。','両端を full に統一。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}
    if(ca.mtu&&cb.mtu&&ca.mtu!==cb.mtu){add('L1','lack',tag,'MTU 不一致（'+ca.mtu+' ↔ '+cb.mtu+'）。','MTU差は大きいフレームの破棄を招く。','MTUを一致させる。');}
    if(ca.channel&&cb.channel){var x=ca.channel.mode,y=cb.channel.mode;
      var bad=(x==='active'&&y==='on')||(x==='on'&&y==='active')||(x==='passive'&&y==='passive')||(x==='passive'&&y==='on')||(x==='on'&&y==='passive');
      if(bad){add('L1','err',tag,'EtherChannel モード非互換（'+x+' ↔ '+y+'）。','LACPネゴシエーションが成立しない組合せ。','active/active・active/passive・on/on のいずれかに。');setPort(da,L.a.iface,'err');setPort(db,L.b.iface,'err');}}
  });

  /* STP */
  var parent={};devs.forEach(function(d){parent[d.key]=d.key;});
  function find(x){return parent[x]===x?x:(parent[x]=find(parent[x]));}
  var loop=false,loopEdge=null;
  links.forEach(function(L){var ra=find(L.a.key),rb=find(L.b.key);if(ra===rb){loop=true;loopEdge=L;}else parent[ra]=rb;});
  if(loop){var noStp=devs.filter(function(d){return d.role==='switch'&&d.parsed&&!d.parsed.stpMode;});
    add('STP',noStp.length?'err':'lack',loopEdge?loopEdge.a.key+' ↔ '+loopEdge.b.key:'topology',
      'L2ループが存在します'+(noStp.length?'（STP未設定のスイッチあり）':'（STPで1ポートがブロック）')+'。',
      '冗長配線はループを生み、STP無しではブロードキャストストームに直結。',
      noStp.length?noStp.map(function(s){return s.key;}).join(',')+' に spanning-tree mode rapid-pvst 等を設定。':'STPが片側ポートをブロックします。意図的な冗長か確認を。');}
  devs.forEach(function(d){if(d.role==='switch'&&d.parsed)d.ports.forEach(function(p){if(p.cfg&&p.cfg.mode==='trunk'&&p.cfg.portfast)add('STP','lack',d.key+':'+p.iface,'トランクに portfast。','トランクへのportfastはループ即時発生のリスク。','トランクの portfast を外す。');});});

  /* L3 */
  var subnets=buildSubnets(state);
  devs.forEach(function(d){if(d.role!=='switch')return;var used={};
    d.ports.forEach(function(p){if(p.cfg&&p.cfg.mode==='access'&&p.cfg.accessVlan)used[p.cfg.accessVlan]=1;});
    Object.keys(used).forEach(function(v){var has=subnets.some(function(s){return s.vlan===v&&s.gw;});
      if(!has)add('L3','lack',d.key+' / VLAN '+v,'VLAN '+v+' に L3 ゲートウェイがありません。','ゲートウェイ無しでは同一サブネット内しか通信できない。','SonicWall に VLAN '+v+' のサブIF（ゲートウェイIP）を作成。');});});
  var ipseen={};
  devs.forEach(function(d){if(d.parsed)Object.keys(d.parsed.interfaces).forEach(function(k){var i=d.parsed.interfaces[k];if(i.ip)(ipseen[i.ip]=ipseen[i.ip]||[]).push(d.key+':'+i.name);});});
  Object.keys(ipseen).forEach(function(ip){var u=uniq(ipseen[ip]);if(u.length>1)add('L3','err',u.join(', '),'IP '+ip+' が重複。','重複IPはARP競合で双方が不安定化。','いずれかを再採番。');});
  // DHCP default-router 不一致
  devs.forEach(function(d){if(!d.parsed||!d.parsed.dhcp)return;Object.keys(d.parsed.dhcp).forEach(function(pool){var dp=d.parsed.dhcp[pool];if(dp.network&&dp.gw){
    var match=subnets.some(function(s){return s.cidr===dp.network&&s.gw===dp.gw;});
    var sub=subnets.filter(function(s){return s.cidr===dp.network;})[0];
    if(sub&&!match)add('L3','err',d.key+' / DHCP '+pool,'DHCP配布の default-router ('+dp.gw+') が実ゲートウェイ ('+sub.gw+') と不一致。','クライアントは誤ったゲートウェイを掴み、外部へ出られない。','default-router を '+sub.gw+' に修正。');}});});

  /* FW */
  var matrix=buildMatrix(state,subnets);
  function isWan(z){return /WAN/i.test(z||'');}
  var hasWan=subnets.some(function(s){return isWan(s.zone);});
  if(hasWan)subnets.forEach(function(s){if(isWan(s.zone))return;
    var reachesWan=subnets.some(function(d){return isWan(d.zone)&&matrix.cells[s.cidr][d.cidr]==='ok';});
    if(!reachesWan)add('FW','lack',(s.vlan?'VLAN '+s.vlan+' ':'')+s.cidr+' ('+s.zone+')',s.zone+' から WAN への許可ルールがありません。','内部→WANのallowルールが無いとインターネットへ出られません。','access-rule from '+s.zone+' to WAN action allow を追加。');});

  /* SEC ハードニング + ポリシー衛生 */
  devs.forEach(function(d){if(!d.parsed)return;var s=d.parsed.sec;if(!s)return;
    if(s.telnet)add('SEC','err',d.key,'Telnet が有効です。','平文プロトコルで資格情報が盗聴されます。','transport input ssh のみにする。');
    if(s.enablePassword&&!s.enableSecret)add('SEC','lack',d.key,'enable password（可逆）が使われています。','enable passwordは弱い可逆暗号で復元されます。','enable secret に置き換える。');
    if(s.snmpWeak)add('SEC','err',d.key,'SNMP コミュニティが public/private です。','推測容易なコミュニティ名は情報漏えいの原因。','SNMPv3 またはユニークなコミュニティ名へ。');
    if(s.pingWanAllow)add('SEC','lack',d.key,'WANからのPingが許可されています。','外部からの存在確認を容易にします。','WANインターフェイスのPing応答を無効化。');
    if(s.mgmtWanAllow)add('SEC','err',d.key,'WANからの管理アクセスが許可されています。','管理面の外部公開は侵入リスクが高い。','管理アクセスをLAN/VPNに限定。');});
  // access port の portfast/bpduguard
  devs.forEach(function(d){if(d.role!=='switch'||!d.parsed)return;d.ports.forEach(function(p){var c=p.cfg;if(!c||c.mode!=='access')return;
    if(!c.portfast)add('SEC','lack',d.key+':'+p.iface,'アクセスポートに portfast がありません。','端末ポートのportfast無しは接続毎にSTP収束待ちが生じます。','アクセスポートに spanning-tree portfast。');
    if(c.portfast&&!c.bpduguard)add('SEC','lack',d.key+':'+p.iface,'portfastありだがBPDU guardがありません。','portfastポートにBPDUが入るとループ・不正接続の原因に。','spanning-tree bpduguard enable を併用。');});});
  // 過剰許可ルール
  if(router.parsed&&router.parsed.rules){router.parsed.rules.forEach(function(rl,i){if(rl.enabled===false)return;
    if(rl.action==='allow'&&/^any$/i.test(rl.src)&&/^any$/i.test(rl.dst)&&/^any$/i.test(rl.service)&&!isWan(rl.from)&&isWan(rl.to)===false&&rl.from.toUpperCase()!==rl.to.toUpperCase())
      add('SEC','lack','ルール #'+(i+1)+' '+rl.from+'→'+rl.to,'any/any/any の許可ルールです。','全許可はセグメンテーションを無効化します。','必要なサービス・宛先に絞る。');});
    // shadowed
    var seen={};router.parsed.rules.forEach(function(rl,i){if(rl.enabled===false)return;var key=rl.from.toUpperCase()+'>'+rl.to.toUpperCase();
      if(seen[key]&&seen[key].broad)add('SEC','lack','ルール #'+(i+1)+' '+rl.from+'→'+rl.to,'より上位の包括ルールにシャドウされています。','上位にany/anyの同ゾーンルールがあり、このルールは評価されません。','ルール順を見直すか不要なら削除。');
      if(/^any$/i.test(rl.src)&&/^any$/i.test(rl.dst)&&/^any$/i.test(rl.service))seen[key]={broad:true};});
  }

  /* 残りを ok に */
  devs.forEach(function(d){d.ports.forEach(function(p){if(p.cfg&&p.status==='idle')p.status='ok';});});

  var cats={};['L1','L2','STP','L3','FW','SEC'].forEach(function(c){cats[c]={err:0,lack:0};});
  F.forEach(function(f){if(cats[f.cat])cats[f.cat][f.level]=(cats[f.cat][f.level]||0)+1;});
  var nErr=F.filter(function(f){return f.level==='err';}).length;
  var nLack=F.filter(function(f){return f.level==='lack';}).length;
  var score=Math.max(0,Math.round(100-nErr*12-nLack*4));
  return {findings:F,subnets:subnets,matrix:matrix,cats:cats,loop:loop,score:score,nErr:nErr,nLack:nLack};
}

/* ---- 自動リンク ---- */
function autoLinks(state){
  var mode=state.topoMode||'star';var links=[];var sw=state.switches;var r=state.router;
  function upOf(d){var u=d.ports.filter(function(p){return /^U1$/.test(p.label);})[0];return u?u.iface:d.ports[d.ports.length-1].iface;}
  function up2Of(d){var u=d.ports.filter(function(p){return /^U2$/.test(p.label);})[0];return u?u.iface:upOf(d);}
  var rLan=r.ports.filter(function(p){return p.label==='X0';})[0]?'X0':r.ports[0].iface;
  if(mode==='star'){sw.forEach(function(s){links.push({a:{key:r.key,iface:rLan},b:{key:s.key,iface:upOf(s)}});});}
  else if(mode==='cascade'){if(sw[0])links.push({a:{key:r.key,iface:rLan},b:{key:sw[0].key,iface:upOf(sw[0])}});
    for(var i=1;i<sw.length;i++)links.push({a:{key:sw[i-1].key,iface:up2Of(sw[i-1])},b:{key:sw[i].key,iface:upOf(sw[i])}});}
  return links;
}

return {CATALOG:CATALOG,switchPorts:switchPorts,parseCisco:parseCisco,parseSonicWall:parseSonicWall,mapToPorts:mapToPorts,verify:verify,buildSubnets:buildSubnets,buildMatrix:buildMatrix,autoLinks:autoLinks,expandVlans:expandVlans,subnetOf:subnetOf,pathTrace:pathTrace,evalFW:evalFW,inSubnet:inSubnet,expandIfRange:expandIfRange};
})();
if(typeof module!=='undefined'&&module.exports){module.exports=FACET;}
