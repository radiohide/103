const pCanvas=document.getElementById('plan-canvas'),g=pCanvas.getContext('2d');pCanvas.width=1400;pCanvas.height=1240;
const sc=220, ox=150,oy=200;
const u=z=>ox+(2.35-z)*sc,v=x=>oy+(1.7-x)*sc;
const txt=(s,x,y,size=23,col='#36453b',align='center')=>{g.font=`${size}px "Microsoft YaHei",sans-serif`;g.fillStyle=col;g.textAlign=align;g.fillText(s,x,y);};
const seg=(x,y,x2,y2,col='#58675b',w=2,dash=[])=>{g.strokeStyle=col;g.lineWidth=w;g.setLineDash(dash);g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke();g.setLineDash([]);};
const block=(x0,x1,z0,z1,col,stroke='#b5b5a5')=>{g.fillStyle=col;g.fillRect(u(z1),v(x1),(z1-z0)*sc,(x1-x0)*sc);if(stroke){g.strokeStyle=stroke;g.lineWidth=2;g.strokeRect(u(z1),v(x1),(z1-z0)*sc,(x1-x0)*sc);}};
const dim=(x,y,x2,y2,s)=>{seg(x,y,x2,y2,'#809080',1.5);if(y===y2){seg(x,y-7,x,y+7);seg(x2,y-7,x2,y+7);txt(s,(x+x2)/2,y-12,22);}else{seg(x-7,y,x+7,y);seg(x2-7,y2,x2+7,y2);g.save();g.translate(x-12,(y+y2)/2);g.rotate(-Math.PI/2);txt(s,0,0,22);g.restore();}};
g.fillStyle='#f8f6f1';g.fillRect(0,0,1400,1240);
txt('同占地方案 B · 暖白 L 型衣柜',150,65,34,'#263c30','left');
txt('布置范围235×122.5cm ≈2.88㎡（含柜体）/ 顶高240cm / 图中尺寸均为cm',150,108,22,'#727e72','left');
block(-1.7,1.7,-2.35,2.35,'#efeee8',null);
block(-1.7,.65,1.125,2.35,'#e7ecdf',null);
const hingeU=u(2.212),hingeV=v(1.682),sweepR=Math.hypot(.920,.0205)*sc;
g.fillStyle='#e9ddc8';g.beginPath();g.moveTo(hingeU,hingeV);g.arc(hingeU,hingeV,sweepR,0,Math.PI/2);g.closePath();g.fill();
// The original room shell and bathroom opening stay in their real positions.
seg(u(2.35),v(-1.7),u(-2.35),v(-1.7),'#465348',12);
seg(u(2.35),v(1.7),u(2.225),v(1.7),'#465348',12);
seg(u(1.275),v(1.7),u(-2.35),v(1.7),'#465348',12);
seg(u(2.35),v(-1.7),u(2.35),v(-1.1),'#465348',12);
seg(u(2.35),v(.6),u(2.35),v(1.7),'#465348',12);
seg(u(2.35),v(-1.1),u(2.35),v(-.225),'#a99a7d',9);
txt('卫生间',55,v(.18),24);
txt('卧室房门 · 90°',u(1.75),v(1.7)-28,23);
block(.762,1.682,2.1915,2.2325,'#ad8f63','#7d6a4e');
g.strokeStyle='#bba781';g.lineWidth=2;g.setLineDash([5,6]);g.beginPath();g.arc(hingeU,hingeV,sweepR,0,Math.PI/2);g.stroke();g.setLineDash([]);
// The former side wall is removed. This dotted line marks the layout boundary,
// not a wall: the rear 775 mm opening is entered from the bedroom-door aisle.
seg(u(2.35),v(.65),u(1.575),v(.65),'#a3b39b',1.5,[6,6]);
txt('房门90°无碰撞',440,303,22,'#866337');
// L cabinet: a 450 mm deep front run and 600 mm deep hanging return.
// The shared corner is counted once and communicates with the return.
block(-1.70,.65,1.125,1.575,'#d7bfa1','#a58c6a');
block(-1.70,-1.10,1.575,2.30,'#c9b18b','#a58c6a');
block(-1.70,-1.10,1.125,1.575,'#ded2bc',null);
seg(u(1.575),v(-1.10),u(1.125),v(-1.10),'#9e8e73',1.5,[6,5]);
seg(u(1.575),v(-1.70),u(1.575),v(-1.10),'#9e8e73',1.5,[6,5]);
// Closed cabinet fronts and fine door divisions. The pulls are recessed.
seg(u(1.575),v(-1.10),u(1.575),v(-1.05),'#ad9879',7);
seg(u(1.575),v(-1.05),u(1.575),v(.65),'#fdfaf2',7);
for(const x of [-.625,-.20,.225]) seg(u(1.575)-4,v(x),u(1.575)+4,v(x),'#9a896e',2);
seg(u(2.30),v(-1.10),u(1.575),v(-1.10),'#fdfaf2',7);
seg(u(2.025),v(-1.10)-4,u(2.025),v(-1.10)+4,'#9a896e',2);
txt('长边柜',u(1.35),v(.36),23);
txt('叠衣',u(1.35),v(-.10),24);txt('抽屉',u(1.35),v(-.28),24);
txt('深45',u(1.35),v(-.71),20,'#7a6649');
txt('挂衣返柜',u(1.9375),v(-1.34),23);
txt('72.5×60',u(1.9375),v(-1.52),20,'#7a6649');
txt('共享',u(1.35),v(-1.33),21,'#82765f');txt('转角',u(1.35),v(-1.49),21,'#82765f');
// Full-width bedroom-facing back: no front opening. The sunflower picture is
// represented as a thin frame in plan; the room model shows the complete art.
block(-1.7,.65,1.075,1.125,'#d2d2c6');
block(-.905,-.145,1.0365,1.074,'#be8a35','#8e6934');
g.save();g.translate(u(1.0365)+30,v(-.525));g.rotate(-Math.PI/2);txt('整幅柜背 · 向日葵挂画',0,0,20,'#7d6a44');g.restore();
txt('侧面入口77.5',520,432,20,'#526f50');
seg(440,425,300,425,'#7c9672',1.5);
dim(u(2.35),v(-.65),u(1.575),v(-.65),'通道77.5');
txt('柜门关闭时',u(1.96),v(-.85),18,'#7d8979');
// Bed location and dimensions are identical to the enclosed double-run option.
block(-1.65,.60,-1.80,.20,'#eee5d5','#aaa89a');block(-1.65,-1.50,-1.80,.20,'#b89e81','#9d866e');
block(-1.42,-.99,-.66,.02,'#fbf9f2','#c6c0af');block(-1.42,-.99,-1.60,-.92,'#fbf9f2','#c6c0af');
txt('床 200 × 225',u(-.80),v(-.37),29);txt('沿用向窗移动55',u(-.80),v(-.58),22,'#866d4b');
dim(u(.20),v(.80),u(1.075),v(.80),'柜背至床87.5');
dim(u(-1.8),v(-.20),u(-2.35),v(-.20),'窗侧55');
dim(u(-.80),v(.60),u(-.80),v(1.70),'床脚约110');
dim(125,v(-1.70),125,v(.65),'布置宽235');
dim(u(2.35),998,u(1.125),998,'布置深122.5');
txt('外侧通路约105',u(.25),v(1.10),21,'#63765e');
// Enter beside the cabinet from the door aisle, then turn into the bathroom.
g.strokeStyle='#69886b';g.lineWidth=6;g.lineJoin='round';g.beginPath();g.moveTo(u(1.20),v(1.05));g.lineTo(u(1.80),v(1.05));g.lineTo(u(1.80),v(.175));g.lineTo(u(2.34),v(.175));g.stroke();
seg(u(2.34),v(.175),u(2.24),v(.245),'#69886b',6);seg(u(2.34),v(.175),u(2.24),v(.105),'#69886b',6);
txt('转入卫生间',u(1.96),v(-.08),20,'#567951');
seg(u(-2.35),v(-1.7),u(-2.35),v(1.25),'#809b9e',7);seg(u(-2.35)+7,v(-1.7),u(-2.35)+7,v(1.25),'#809b9e',2);
g.save();g.translate(u(-2.35)+44,v(-.25));g.rotate(-Math.PI/2);txt('转角采光窗',0,0,24,'#65858a');g.restore();
txt('长边235×45：叠衣、抽屉；返柜72.5×60：挂衣。侧面开放，从房门一侧进入。',150,1080,22,'#455b48','left');
txt('长边含60cm转角及5cm收口，可开门面宽170cm；柜门打开时会占用取衣通道。',150,1130,22,'#455b48','left');
txt('侧口77.5；房门开至90°时转入最窄约63。尺寸为方案估算，施工前实测复核。',150,1180,21,'#768172','left');
document.getElementById('show-plan').onclick=()=>document.getElementById('plan-dialog').showModal();
document.getElementById('close-plan').onclick=()=>document.getElementById('plan-dialog').close();
document.getElementById('save-plan').onclick=()=>pCanvas.toBlob(blob=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='卧室二-L型衣帽区尺寸图.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
