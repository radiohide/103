const pCanvas=document.getElementById('plan-canvas'),g=pCanvas.getContext('2d');pCanvas.width=1400;pCanvas.height=1130;
const sc=220, ox=150,oy=200;
const u=z=>ox+(2.35-z)*sc,v=x=>oy+(1.7-x)*sc;
const txt=(s,x,y,size=23,col='#36453b',align='center')=>{g.font=`${size}px "Microsoft YaHei",sans-serif`;g.fillStyle=col;g.textAlign=align;g.fillText(s,x,y);};
const seg=(x,y,x2,y2,col='#58675b',w=2,dash=[])=>{g.strokeStyle=col;g.lineWidth=w;g.setLineDash(dash);g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke();g.setLineDash([]);};
const block=(x0,x1,z0,z1,col,stroke='#b5b5a5')=>{g.fillStyle=col;g.fillRect(u(z1),v(x1),(z1-z0)*sc,(x1-x0)*sc);if(stroke){g.strokeStyle=stroke;g.lineWidth=2;g.strokeRect(u(z1),v(x1),(z1-z0)*sc,(x1-x0)*sc);}};
const dim=(x,y,x2,y2,s)=>{seg(x,y,x2,y2,'#809080',1.5);if(y===y2){seg(x,y-7,x,y+7);seg(x2,y-7,x2,y+7);txt(s,(x+x2)/2,y-12,22);}else{seg(x-7,y,x+7,y);seg(x2-7,y2,x2+7,y2);g.save();g.translate(x-12,(y+y2)/2);g.rotate(-Math.PI/2);txt(s,0,0,22);g.restore();}};
g.fillStyle='#f8f6f1';g.fillRect(0,0,1400,1130);
txt('卧室二 · 双移门过道衣帽区',150,65,34,'#263c30','left');
txt('布局按现有模型调整 / 单位：cm / 柜高230，门头高240，上方留通风空间',150,108,22,'#727e72','left');
block(-1.7,1.7,-2.35,2.35,'#efeee8',null);
// Existing shell and doorway; bathroom is left, window is right.
seg(u(2.35),v(-1.7),u(-2.35),v(-1.7),'#465348',12);
seg(u(2.35),v(1.7),u(2.225),v(1.7),'#465348',12);
seg(u(1.275),v(1.7),u(-2.35),v(1.7),'#465348',12);
seg(u(2.35),v(-1.7),u(2.35),v(-1.1),'#465348',12);
seg(u(2.35),v(.6),u(2.35),v(1.7),'#465348',12);
seg(u(2.35),v(-1.1),u(2.35),v(-.225),'#a99a7d',9);
txt('卫生间',u(2.35)-65,v(.18),26);
g.save();g.translate(u(2.35)-23,v(-.65));g.rotate(-Math.PI/2);txt('固定扇',0,0,19,'#83775e');g.restore();
txt('卧室房门',u(1.75),v(1.7)-28,23);
seg(u(2.225),v(1.7),u(2.225),v(.78),'#aeb4a8',2);
g.strokeStyle='#adb6a8';g.setLineDash([5,6]);g.beginPath();g.arc(u(2.225),v(1.7),.92*sc,0,Math.PI/2);g.stroke();g.setLineDash([]);
// Opposing storage: rear clearances preserve the turn into the real bath opening.
block(-1.7,-1.1,1.17,2.26,'#ccb493');
block(.35,.70,1.17,1.65,'#ccb493');
block(-1.1,.35,1.17,2.26,'#e4eadd',null);
txt('主挂衣柜 109 × 60',u(1.715),v(-1.39),24);
txt('挂衣＋抽屉',u(1.715),v(-1.56),19,'#726246');
txt('浅柜',u(1.41),v(.54),22);txt('48×35',u(1.41),v(.41),18);
seg(u(1.17),v(-1.1),u(2.26),v(-1.1),'#8b7251',4);seg(u(1.17),v(.35),u(1.65),v(.35),'#8b7251',4);
txt('取衣区',u(1.71),v(-.50),26);txt('两柜之间约145',u(1.71),v(-.70),21);
txt('后部敞开',u(1.98),v(.63),20,'#66805d');
// Front partition with two real sliding leaves shown in their parked position.
block(-1.7,-.8,1.075,1.125,'#d2d2c6');block(.1,.75,1.075,1.125,'#d2d2c6');
block(-1.30,-.82,1.0025,1.0375,'#fcfaf3','#717b6f');block(.12,.60,1.0025,1.0375,'#fcfaf3','#717b6f');
seg(u(1.005),v(-1.40),u(1.005),v(.70),'#38443b',3);
dim(u(.90),v(-.80),u(.90),v(.10),'');
txt('门洞90',u(.60),v(-.55),22);
txt('双扇白色移门',u(.90)+25,v(-1.13),20,'#5f6b60','left');
// Bed moved 550 mm towards the window, dimensions preserved.
block(-1.65,.60,-1.80,.20,'#eee5d5','#aaa89a');block(-1.65,-1.50,-1.80,.20,'#b89e81','#9d866e');
block(-1.42,-.99,-.66,.02,'#fbf9f2','#c6c0af');block(-1.42,-.99,-1.60,-.92,'#fbf9f2','#c6c0af');
txt('床 200 × 225',u(-.80),v(-.37),29);txt('向窗移动55',u(-.80),v(-.58),22,'#866d4b');
dim(u(.20),v(.80),u(1.0025),v(.80),'门前约80');
dim(u(-1.8),v(-.20),u(-2.35),v(-.20),'窗侧55');
dim(u(-.80),v(.60),u(-.80),v(1.70),'床脚约110');
// Main route from foot-side aisle to wardrobe then bathroom.
g.strokeStyle='#69886b';g.lineWidth=6;g.lineJoin='round';g.beginPath();g.moveTo(u(.58),v(.48));g.lineTo(u(.58),v(-.32));g.lineTo(u(1.87),v(-.32));g.lineTo(u(2.10),v(.18));g.lineTo(u(2.34),v(.18));g.stroke();
seg(u(2.34),v(.18),u(2.24),v(.25),'#69886b',6);seg(u(2.34),v(.18),u(2.24),v(.11),'#69886b',6);
txt('进入衣帽区',u(.57)+16,v(.65),20,'#567951','left');
seg(u(-2.35),v(-1.7),u(-2.35),v(1.25),'#809b9e',7);seg(u(-2.35)+7,v(-1.7),u(-2.35)+7,v(1.25),'#809b9e',2);
g.save();g.translate(u(-2.35)+44,v(-.25));g.rotate(-Math.PI/2);txt('转角采光窗',0,0,24,'#65858a');g.restore();
txt('右柜缩短、变浅，保留房门通路与通向卫生间的转弯空间。',150,1010,24,'#455b48','left');
txt('取舍：窗侧缩为55cm；这是按模型尺寸做的示意，门轨、风口与插座需现场复核。',150,1060,21,'#768172','left');
document.getElementById('show-plan').onclick=()=>document.getElementById('plan-dialog').showModal();
document.getElementById('close-plan').onclick=()=>document.getElementById('plan-dialog').close();
document.getElementById('save-plan').onclick=()=>pCanvas.toBlob(blob=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='卧室二-双移门衣帽区尺寸图.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
