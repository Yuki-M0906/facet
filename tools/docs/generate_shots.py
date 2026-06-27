# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT="/home/claude/shots"; os.makedirs(OUT,exist_ok=True)
W=1200

# palette
BG=(13,13,16); PANEL=(22,22,28); RAISED=(28,28,36); BG2=(17,17,22)
INK=(236,231,219); MUTED=(146,140,127); FAINT=(95,90,81)
GOLD=(201,168,106); GOLDLT=(230,205,148); GOLDDIM=(140,118,74)
HAIR=(46,42,33); HAIRS=(72,62,42)
EMER=(107,191,154); GARN=(213,107,98); TOPA=(217,166,72); STEEL=(74,74,85); SAPP=(111,147,212)

NSANS="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
NSANSM="/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc"
NSANSB="/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
NSERIF="/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
MONO="/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
def f(p,s): return ImageFont.truetype(p,s,index=0)
def fm(s): return ImageFont.truetype(MONO,s)

def canvas(h):
    img=Image.new("RGB",(W,h),BG)
    # soft gold glow top-right
    ov=Image.new("RGBA",(W,h),(0,0,0,0)); od=ImageDraw.Draw(ov)
    od.ellipse([W-520,-260,W+260,360],fill=(201,168,106,30))
    od.ellipse([-260,h-300,360,h+220],fill=(107,191,154,16))
    ov=ov.filter(ImageFilter.GaussianBlur(120))
    img=Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
    d=ImageDraw.Draw(img)
    d.rectangle([0,0,W-1,h-1],outline=(42,42,50),width=1)
    return img,d

def track(d,xy,s,font,fill,sp):  # letter-spaced text
    x,y=xy
    for ch in s:
        d.text((x,y),ch,font=font,fill=fill)
        x+=d.textlength(ch,font=font)+sp
    return x

def mtext(d,xy,s,size,fill,sp=0):  # mono for ASCII, CJK font for the rest
    x,y=xy; mf=fm(size); jf=f(NSANS,size)
    for ch in s:
        fo=mf if ord(ch)<128 else jf
        d.text((x,y),ch,font=fo,fill=fill)
        x+=d.textlength(ch,font=fo)+sp
    return x
def mwidth(d,s,size,sp=0):
    mf=fm(size); jf=f(NSANS,size); w=0
    for ch in s: w+=d.textlength(ch,font=(mf if ord(ch)<128 else jf))+sp
    return w

def rr(d,box,r,fill=None,outline=None,w=1):
    d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=w)

def chrome_header(img,d,active,title=None,sub_extra=None):
    # browser chrome
    d.rectangle([1,1,W-2,46],fill=(26,26,32))
    for i,c in enumerate([(225,95,90),(225,180,90),(120,200,140)]):
        d.ellipse([22+i*22,18,34+i*22,30],fill=c)
    rr(d,[120,12,W-40,36],11,fill=(15,15,20),outline=(50,46,38),w=1)
    d.text((140,16),"facet.html",font=fm(15),fill=(120,116,108))
    # header bar
    hy=46
    d.rectangle([1,hy,W-2,hy+92],fill=(15,15,19))
    d.line([1,hy+92,W-2,hy+92],fill=HAIR,width=1)
    # wordmark
    d.text((36,hy+34),"\u25C6",font=f(NSERIF,22),fill=GOLD)
    track(d,(70,hy+22),"FACET",f(NSERIF,40),GOLDLT,10)
    d.text((300,hy+34),"Network Verification Atelier",font=f(NSERIF,22),fill=MUTED)
    d.text((W-360,hy+40),"Static Verification \u00B7 L1\u2013L3 + Firewall",font=fm(14),fill=FAINT)
    # stepper
    sy=hy+92
    d.rectangle([1,sy,W-2,sy+62],fill=(11,11,15))
    d.line([1,sy+62,W-2,sy+62],fill=HAIR,width=1)
    steps=[("\u69CB\u6210","SELECT"),("\u30C8\u30DD\u30ED\u30B8\u30FC","TOPOLOGY"),("\u6295\u5165","INTAKE"),("\u691C\u8A3C","VERIFY"),("\u5B8C\u4E86","DONE")]
    x=40
    for i,(lbl,en) in enumerate(steps):
        cy=sy+31
        done=i<active; act=i==active
        col=GOLD if act else (GOLDLT if done else FAINT)
        if done:
            rr(d,[x,cy-13,x+26,cy+13],13,fill=GOLD); d.text((x+8,cy-9),"\u2713",font=f(NSANSB,15),fill=(26,22,17))
        else:
            rr(d,[x,cy-13,x+26,cy+13],13,outline=(GOLD if act else HAIRS),w=2)
            d.text((x+8,cy-10),str(i+1),font=fm(14),fill=col)
        a=255 if (act or done) else 110
        tcol=tuple(list(col))
        d.text((x+36,cy-16),lbl,font=f(NSANSM,17),fill=col if (act or done) else (110,106,98))
        d.text((x+36,cy+2),en,font=fm(10),fill=(95,90,81) if (act or done) else (70,66,60))
        x+=36+max(d.textlength(lbl,font=f(NSANSM,17)),d.textlength(en,font=fm(10)))+44
    cy0=sy+62
    if title:
        d.text((36,cy0+26),"PHASE",font=fm(12),fill=GOLDDIM)
        d.text((36,cy0+50),title,font=f(NSERIF,40),fill=INK)
        return cy0+118
    return cy0+24

def panel(d,box,title=None):
    rr(d,box,16,fill=PANEL,outline=HAIR,w=1)
    x0,y0,x1,y1=box
    if title:
        tx=mtext(d,(x0+24,y0+20),title,13,GOLDDIM,2)
        d.line([tx+14,y0+27,x1-24,y0+27],fill=HAIR,width=1)
        return y0+52
    return y0+20

def dropdown(d,x,y,w,text,sub=None):
    rr(d,[x,y,x+w,y+44],10,fill=RAISED,outline=HAIRS,w=1)
    d.text((x+14,y+12),text,font=f(NSANS,18),fill=INK)
    # chevron
    d.polygon([(x+w-26,y+18),(x+w-16,y+18),(x+w-21,y+25)],fill=GOLD)
    if sub: d.text((x,y+52),sub,font=fm(13),fill=FAINT)

def fld_label(d,x,y,s):
    d.text((x,y),s,font=f(NSANS,15),fill=MUTED)

def pill_btn(d,x,y,text,primary=True):
    tw=d.textlength(text,font=f(NSANSM,18)); w=tw+56
    if primary:
        rr(d,[x,y,x+w,y+46],23,fill=GOLD)
        d.text((x+28,y+12),text,font=f(NSANSM,18),fill=(26,21,16))
    else:
        rr(d,[x,y,x+w,y+46],23,outline=HAIRS,w=1)
        d.text((x+28,y+12),text,font=f(NSANS,18),fill=MUTED)
    return w

def save(img,name):
    img.save(os.path.join(OUT,name)); print(name,img.size)

# ---------- A: Phase 01 ----------
def shotA():
    img,d=canvas(560); y=chrome_header(img,d,0,"\u69CB\u6210\u306E\u9078\u5B9A")
    gap=24; pw=(W-72-gap)//2
    # router panel
    bx=[36,y,36+pw,y+250]; py=panel(d,bx,"ROUTER \u2014 SonicWall")
    fld_label(d,56,py+6,"\u6A5F\u7A2E"); dropdown(d,56,py+28,pw-40,"SonicWall TZ570","8 ports \u2014 8\u00D7RJ45 + 2\u00D7SFP+")
    # switch panel
    bx2=[36+pw+gap,y,W-36,y+250]; py2=panel(d,bx2,"SWITCH \u2014 Cisco")
    sx=36+pw+gap+20
    fld_label(d,sx,py2+6,"\u6A5F\u7A2E"); dropdown(d,sx,py2+28,pw-40,"Catalyst 9300-24P")
    fld_label(d,sx,py2+92,"\u53F0\u6570")
    rr(d,[sx,py2+114,sx+120,py2+158],10,fill=RAISED,outline=HAIRS,w=1); d.text((sx+16,py2+126),"2",font=f(NSANS,18),fill=INK)
    d.text((sx,py2+170),"28 ports/unit \u2014 24\u00D7RJ45 + 4\u00D7SFP+",font=fm(13),fill=FAINT)
    # footer row
    fy=y+270
    d.text((40,fy+14),"Router \u00D71 \u00B7 Switch \u00D72",font=fm(15),fill=FAINT)
    bw=pill_btn(d,W-36-360,fy,"\u69CB\u6210\u56F3\u30FB\u30C8\u30DD\u30ED\u30B8\u30FC\u3078 \u2192",True)
    save(img,"a_phase01.png")

# ---------- B: Phase 02 ----------
def shotB():
    img,d=canvas(860); y=chrome_header(img,d,1,"\u69CB\u6210\u56F3\u3068\u30C8\u30DD\u30ED\u30B8\u30FC")
    # faceplate panel
    bx=[36,y,W-36,y+210]; py=panel(d,bx,"CHASSIS \u2014 Catalyst 9300-24P")
    d.text((56,py+4),"SW1",font=f(NSERIF,20),fill=INK)
    # 24 rj45 in 2 rows of 12 + 4 sfp
    ox,oy=56,py+38; ps=26; gp=5
    for i in range(24):
        c=i%12; r=i//12
        x=ox+c*(ps+gp); yy=oy+r*(ps+gp)
        rr(d,[x,yy,x+ps,yy+ps],3,fill=(35,35,43),outline=(60,54,38),w=1)
        rr(d,[x+5,yy+4,x+ps-5,yy+ps-8],1,fill=(0,0,0))
        d.text((x+ps/2-d.textlength(str(i+1),font=fm(8))/2,yy+ps+2),str(i+1),font=fm(8),fill=FAINT)
    # uplinks
    ux=ox+12*(ps+gp)+30
    for i in range(4):
        c=i//2; r=i%2; x=ux+c*(ps+gp); yy=oy+r*(ps+gp)
        rr(d,[x+3,yy+7,x+ps-3,yy+ps-9],2,fill=(35,35,43),outline=GOLDDIM,w=1)
        d.text((x+ps/2-d.textlength("U"+str(i+1),font=fm(8))/2,yy+ps+2),"U"+str(i+1),font=fm(8),fill=FAINT)
    mtext(d,(ox,oy+2*(ps+gp)+22),"\u25A0 RJ45      \u25C6 SFP/SFP+ (uplink)",13,MUTED)
    # topology panel
    ty=y+228
    bx2=[36,ty,W-36,ty+360]; py2=panel(d,bx2,"TOPOLOGY \u2014 \u914D\u7DDA\u65B9\u5F0F")
    # toggle
    tgx=56
    labels=["\u30B9\u30BF\u30FC","\u30AB\u30B9\u30B1\u30FC\u30C9","\u624B\u52D5"]
    rr(d,[tgx,py2+4,tgx+300,py2+42],19,outline=HAIRS,w=1)
    xx=tgx
    for i,l in enumerate(labels):
        w=100
        if i==0:
            rr(d,[xx+2,py2+6,xx+w,py2+40],17,fill=GOLD); d.text((xx+w/2-d.textlength(l,font=f(NSANSM,16))/2,py2+13),l,font=f(NSANSM,16),fill=(26,21,16))
        else:
            d.text((xx+w/2-d.textlength(l,font=f(NSANS,16))/2,py2+13),l,font=f(NSANS,16),fill=MUTED)
        xx+=w
    d.text((tgx,py2+54),"\u30B9\u30BF\u30FC\uFF1A\u5404\u30B9\u30A4\u30C3\u30C1\u306E\u30A2\u30C3\u30D7\u30EA\u30F3\u30AF\u304C\u30EB\u30FC\u30BF\u306E X0 \u3078\u96C6\u7D04\u3002\u30EB\u30FC\u30D7\u306F\u751F\u3058\u307E\u305B\u3093\u3002",font=f(NSANS,15),fill=FAINT)
    # graph
    gy=py2+96
    def node(cx,cy,key,name):
        rr(d,[cx-70,cy-26,cx+70,cy+26],10,fill=RAISED,outline=HAIRS,w=1)
        d.text((cx-d.textlength(key,font=f(NSERIF,18))/2,cy-20),key,font=f(NSERIF,18),fill=INK)
        d.text((cx-d.textlength(name,font=fm(10))/2,cy+4),name,font=fm(10),fill=FAINT)
    rcx=W//2; rcy=gy+24
    s1=W//2-220; s2=W//2+220; scy=gy+170
    d.line([rcx,rcy+26,s1,scy-26],fill=GOLDDIM,width=2)
    d.line([rcx,rcy+26,s2,scy-26],fill=GOLDDIM,width=2)
    node(rcx,rcy,"R1","SonicWall TZ570")
    node(s1,scy,"SW1","Catalyst 9300")
    node(s2,scy,"SW2","Catalyst 9300")
    # link rows
    ly=py2+96
    d.text((W-360,ly),"R1  X0  \u2194  U1  SW1",font=f(NSANS,14),fill=MUTED)
    d.text((W-360,ly+26),"R1  X0  \u2194  U1  SW2",font=f(NSANS,14),fill=MUTED)
    save(img,"b_phase02.png")

# ---------- C: Phase 03 ----------
def shotC():
    img,d=canvas(560); y=chrome_header(img,d,2,"\u30B3\u30F3\u30D5\u30A3\u30B0\u306E\u6295\u5165")
    bx=[36,y,W-36,y+300]; py=panel(d,bx,"INTAKE SEQUENCE")
    rows=[("\u2B21","\u30EB\u30FC\u30BF \u2014 SonicWall TZ570","\u6295\u5165\u5B8C\u4E86 \u2713 \u2014 5 interfaces, 2 rules","loaded"),
          ("\u2B22","\u30B9\u30A4\u30C3\u30C11 \u2014 Catalyst 9300-24P","\u6295\u5165\u5B8C\u4E86 \u2713 \u2014 6 interfaces","loaded"),
          ("\u2B22","\u30B9\u30A4\u30C3\u30C12 \u2014 Catalyst 9300-24P","\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u53EF\u80FD","ready")]
    yy=py+8
    for ic,name,sub,st in rows:
        col=EMER if st=="loaded" else GOLDDIM
        bg=(18,26,22) if st=="loaded" else (0,0,0)
        rr(d,[56,yy,W-56,yy+62],12,fill=(18,26,22) if st=="loaded" else (16,16,21),outline=(col if st!="ready" else HAIRS),w=1)
        rr(d,[70,yy+12,108,yy+50],10,outline=(col if st=="loaded" else HAIRS),w=1)
        d.text((82,yy+18),ic,font=f(NSANS,18),fill=col if st=="loaded" else GOLD)
        d.text((124,yy+12),name,font=f(NSANS,17),fill=INK)
        mtext(d,(124,yy+34),sub,13,EMER if st=="loaded" else MUTED)
        rr(d,[W-220,yy+15,W-72,yy+47],17,outline=HAIRS,w=1)
        d.text((W-205,yy+22),"\u30D5\u30A1\u30A4\u30EB\u9078\u629E",font=f(NSANS,14),fill=MUTED)
        yy+=74
    pill_btn(d,56,yy+2,"\u25C6 \u30B5\u30F3\u30D7\u30EB\u30B3\u30F3\u30D5\u30A3\u30B0\u3092\u8AAD\u307F\u8FBC\u3080",False)
    save(img,"c_phase03.png")

# ---------- D: Results header ----------
def shotD():
    img,d=canvas(740); y=chrome_header(img,d,3,"\u691C\u8A3C\u30EC\u30DD\u30FC\u30C8")
    # disclaimer
    rr(d,[36,y,W-36,y+62],10,fill=(28,24,16),outline=(80,64,30),w=1)
    d.rectangle([36,y,42,y+62],fill=TOPA)
    d.text((58,y+10),"\u3053\u308C\u306F\u9759\u7684\u89E3\u6790\u3067\u3059\u3002\u8A2D\u5B9A\u4E0A\u306E\u4E0D\u6574\u5408\u30FB\u30EA\u30B9\u30AF\u3092\u9AD8\u7CBE\u5EA6\u306B\u6D17\u3044\u51FA\u3057\u307E\u3059\u304C\u3001",font=f(NSANS,16),fill=INK)
    d.text((58,y+34),"\u5B9F\u6A5F\u306E\u7269\u7406\u758E\u901A\u305D\u306E\u3082\u306E\u3092\u4FDD\u8A3C\u3059\u308B\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002",font=f(NSANS,16),fill=MUTED)
    # score ring
    sy=y+86; cx,cy,R=120,sy+58,52
    d.arc([cx-R,cy-R,cx+R,cy+R],0,360,fill=(40,40,46),width=11)
    import math
    end=-90+360*0.64
    d.arc([cx-R,cy-R,cx+R,cy+R],-90,end,fill=TOPA,width=11)
    d.text((cx-d.textlength("64",font=f(NSERIF,40))/2,cy-28),"64",font=f(NSERIF,40),fill=TOPA)
    d.text((210,sy+26),"\u8981\u4FEE\u6B63\uFF1A\u30A8\u30E9\u30FC2\u4EF6",font=f(NSERIF,24),fill=INK)
    d.text((210,sy+62),"\u30A8\u30E9\u30FC2 / \u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB33\u4EF6\u3092\u691C\u51FA\u3002\u30B9\u30B3\u30A2\u306F\u91CD\u8981\u5EA6\u52A0\u91CD\u306E\u76EE\u5B89\u3067\u3059\u3002",font=f(NSANS,15),fill=MUTED)
    # summary stats
    ssy=sy+150; sw=(W-72-3*16)//4
    stats=[("8","\u69CB\u6210\u30DD\u30FC\u30C8",GOLD),("5","\u78BA\u8A8D",EMER),("3","\u4E0D\u8DB3",TOPA),("2","\u30A8\u30E9\u30FC",GARN)]
    for i,(n,c,col) in enumerate(stats):
        x=36+i*(sw+16)
        rr(d,[x,ssy,x+sw,ssy+86],13,fill=RAISED,outline=HAIR,w=1)
        d.text((x+18,ssy+10),n,font=f(NSERIF,42),fill=col)
        d.text((x+18,ssy+64),c,font=f(NSANS,14),fill=MUTED)
    # category chips
    ccy=ssy+104; cw=(W-72-5*11)//6
    cats=[("\u7269\u7406","\u554F\u984C\u306A\u3057",EMER),("VLAN/\u30C8\u30E9\u30F3\u30AF","\u30A8\u30E9\u30FC1",GARN),("STP","\u554F\u984C\u306A\u3057",EMER),("L3\u5230\u9054\u6027","\u4E0D\u8DB31",TOPA),("FW\u30DD\u30EA\u30B7\u30FC","\u554F\u984C\u306A\u3057",EMER),("\u5805\u7262\u5316","\u30A8\u30E9\u30FC1",GARN)]
    for i,(nm,pill,col) in enumerate(cats):
        x=36+i*(cw+11)
        rr(d,[x,ccy,x+cw,ccy+72],12,fill=RAISED,outline=HAIR,w=1)
        d.text((x+12,ccy+12),nm,font=f(NSANS,13),fill=INK)
        bgp={EMER:(18,30,25),GARN:(34,18,17),TOPA:(34,28,15)}[col]
        pw=mwidth(d,pill,12)+18
        rr(d,[x+12,ccy+40,x+12+pw,ccy+62],6,fill=bgp)
        mtext(d,(x+21,ccy+43),pill,12,col)
    save(img,"d_results.png")

# ---------- E: Path trace ----------
def shotE():
    img,d=canvas(660); y=chrome_header(img,d,3)
    bx=[36,y,W-36,y+470]; py=panel(d,bx,"REACHABILITY \u2014 \u7D4C\u8DEF\u30C8\u30EC\u30FC\u30B9")
    # selectors
    fld_label(d,56,py+2,"\u9001\u4FE1\u5143"); dropdown(d,56,py+22,300,"V20 192.168.20.0/24 (POS)")
    fld_label(d,372,py+2,"\u5B9B\u5148"); dropdown(d,372,py+22,300,"V10 192.168.10.0/24 (LAN)")
    fld_label(d,688,py+2,"\u30B5\u30FC\u30D3\u30B9")
    rr(d,[688,py+22,808,py+66],10,fill=RAISED,outline=HAIRS,w=1); d.text((702,py+34),"any",font=f(NSANS,16),fill=MUTED)
    pill_btn(d,828,py+22,"\u30C8\u30EC\u30FC\u30B9",True)
    # hops
    hy=py+96; lx=70
    hops=[("SRC","SW2 \u306E VLAN20 \u5185\u30DB\u30B9\u30C8 (192.168.20.0/24)","ok"),
          ("L2","SW2 \u2192 \u30C8\u30E9\u30F3\u30AF\u2192 R1\uFF08VLAN20 \u30BF\u30B0\u4ED8\u8EE2\u9001\uFF09","ok"),
          ("GW","L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4 192.168.20.1 (R1:X0:V20)","ok"),
          ("RT","R1 \u304C VLAN10 (192.168.10.0/24) \u3078\u30EB\u30FC\u30C6\u30A3\u30F3\u30B0\uFF08\u63A5\u7D9A\u6E08\uFF09","ok"),
          ("FW","POS \u2192 LAN : \u8A72\u5F53\u30EB\u30FC\u30EB\u306A\u3057\uFF08\u30BE\u30FC\u30F3\u9593\u65E2\u5B9A\u906E\u65AD\uFF09","deny")]
    for i,(nd,desc,st) in enumerate(hops):
        cy=hy+i*64
        col=EMER if st=="ok" else GARN
        if i<len(hops)-1:
            d.line([lx+16,cy+30,lx+16,cy+64],fill=HAIRS,width=2)
        rr(d,[lx,cy,lx+32,cy+32],16,fill=RAISED,outline=col,w=2)
        d.text((lx+16-d.textlength(nd,font=fm(11))/2,cy+9),nd,font=fm(11),fill=col)
        d.text((lx+52,cy+5),desc,font=f(NSANS,16),fill=INK)
    # verdict
    vy=hy+5*64+6
    rr(d,[lx,vy,W-70,vy+44],10,fill=(34,18,17),outline=(120,55,52),w=1)
    d.text((lx+18,vy+11),"\u00D7  \u30D5\u30A1\u30A4\u30A2\u30A6\u30A9\u30FC\u30EB\u30DD\u30EA\u30B7\u30FC\u3067\u906E\u65AD",font=f(NSANSM,17),fill=GARN)
    save(img,"e_trace.png")

# ---------- F: Matrix ----------
def shotF():
    img,d=canvas(500); y=chrome_header(img,d,3)
    bx=[36,y,W-36,y+300]; py=panel(d,bx,"REACHABILITY MATRIX \u2014 \u30B5\u30D6\u30CD\u30C3\u30C8\u9593\u5230\u9054\u6027")
    cols=["from \\ to","V10 LAN","V20 POS","WAN"]
    rows=[("V10 192.168.10.0/24 (LAN)",["\u2014","\u00D7","\u25CB"]),
          ("V20 192.168.20.0/24 (POS)",["\u00D7","\u2014","\u25CB"]),
          ("203.0.113.0/29 (WAN)",["\u00D7","\u00D7","\u2014"])]
    cw=[360,180,180,180]; tx=70; ty=py+10; rh=46
    # header
    x=tx
    for i,c in enumerate(cols):
        rr(d,[x,ty,x+cw[i],ty+rh],0,fill=(46,42,36),outline=HAIR,w=1)
        d.text((x+12,ty+13),c,font=fm(14),fill=GOLD)
        x+=cw[i]
    sym={"\u25CB":EMER,"\u00D7":GARN,"\u25B3":TOPA,"\u2014":FAINT}
    for r,(name,vals) in enumerate(rows):
        yy=ty+rh*(r+1); x=tx
        rr(d,[x,yy,x+cw[0],yy+rh],0,fill=(24,22,17),outline=HAIR,w=1)
        d.text((x+12,yy+14),name,font=fm(13),fill=GOLD); x+=cw[0]
        for i,v in enumerate(vals):
            rr(d,[x,yy,x+cw[i+1],yy+rh],0,fill=BG2,outline=HAIR,w=1)
            d.text((x+cw[i+1]/2-d.textlength(v,font=f(NSANSB,20))/2,yy+10),v,font=f(NSANSB,20),fill=sym[v])
            x+=cw[i+1]
    d.text((tx,ty+rh*4+14),"\u25CB \u901A\u904E   \u00D7 \u906E\u65AD\u30FB\u672A\u8A31\u53EF   \u25B3 L3\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u7121\u3057   \u540C\u4E00\u30B5\u30D6\u30CD\u30C3\u30C8\u5185\u306F\u5BFE\u8C61\u5916",font=f(NSANS,14),fill=MUTED)
    save(img,"f_matrix.png")

# ---------- G: Findings ----------
def shotG():
    img,d=canvas(540); y=chrome_header(img,d,3)
    bx=[36,y,W-36,y+330]; py=panel(d,bx,"FINDINGS & SUGGESTIONS")
    # filter bar
    fx=56; fy=py+6
    chips=[("\u3059\u3079\u3066 5",True),("\u7269\u7406 0",False),("L2 2",False),("STP 0",False),("L3 1",False),("SEC 2",False)]
    for lbl,on in chips:
        w=mwidth(d,lbl,13)+26
        rr(d,[fx,fy,fx+w,fy+30],15,fill=(28,24,16) if on else None,outline=GOLD if on else HAIR,w=1)
        mtext(d,(fx+13,fy+7),lbl,13,GOLDLT if on else MUTED); fx+=w+10
    # finding cards
    def card(yy,level,cat,loc,desc,why,fix):
        cols={"err":GARN,"lack":TOPA}; col=cols[level]
        rr(d,[56,yy,W-56,yy+118],8,fill=(0,0,0),outline=None)
        d.rectangle([56,yy,60,yy+118],fill=col)
        lvtxt={"err":"\u30A8\u30E9\u30FC","lack":"\u30B3\u30F3\u30D5\u30A3\u30B0\u4E0D\u8DB3"}[level]
        bg={"err":(34,18,17),"lack":(34,28,15)}[level]
        bw=mwidth(d,lvtxt,12)+18
        rr(d,[76,yy+14,76+bw,yy+36],6,fill=bg); mtext(d,(85,yy+17),lvtxt,12,col)
        x2=76+bw+8; cw2=d.textlength(cat,font=fm(12))+18
        rr(d,[x2,yy+14,x2+cw2,yy+36],6,fill=(28,24,16)); d.text((x2+9,yy+18),cat,font=fm(12),fill=GOLD)
        d.text((x2+cw2+12,yy+16),loc,font=fm(14),fill=INK)
        d.text((76,yy+46),desc,font=f(NSANS,16),fill=MUTED)
        d.text((76,yy+70),"\u306A\u305C \u2014 "+why,font=f(NSANS,13),fill=FAINT)
        d.line([76,yy+96,W-72,yy+96],fill=HAIR,width=1)
        d.text((76,yy+100),"\u63D0\u6848 \u2014 "+fix,font=f(NSANS,14),fill=GOLDLT)
    card(py+50,"err","L2","R1:X0 \u2194 SW2:U1","Native VLAN \u4E0D\u4E00\u81F4\uFF081 \u2194 99\uFF09\u3002",
         "\u30BF\u30B0\u7121\u3057\u30D5\u30EC\u30FC\u30E0\u304C\u5225VLAN\u3078\u6F0F\u308C\u308B\u5178\u578B\u30DF\u30B9\u3002","\u4E21\u7AEF\u306E native vlan \u3092\u4E00\u81F4\u3055\u305B\u308B\u3002")
    card(py+180,"lack","L3","SW2 / VLAN 30","VLAN 30 \u306B L3 \u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
         "\u30B2\u30FC\u30C8\u30A6\u30A7\u30A4\u7121\u3057\u3067\u306F\u540C\u4E00\u30B5\u30D6\u30CD\u30C3\u30C8\u5185\u3057\u304B\u901A\u4FE1\u3067\u304D\u306A\u3044\u3002","SonicWall \u306B VLAN 30 \u306E\u30B5\u30D6IF\u3092\u4F5C\u6210\u3002")
    save(img,"g_findings.png")

shotA(); shotB(); shotC(); shotD(); shotE(); shotF(); shotG()
print("done")
