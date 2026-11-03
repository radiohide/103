import {createInitialPlan, createObject, updateObject, removeObject, duplicateObject, validatePlan, resolveOpenings, applyPublishedPlanEdits, mirrorPlanHorizontally, copyFurniture, pasteFurniture} from './model.js';
import {PlanScene} from './scene.js';
import {measurementMetrics} from './measurement.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const TYPES={wall:'墙体',door:'门',window:'窗',furniture:'家具与设备'};
const KINDS={bed:'床',nightstand:'床头柜',wardrobe:'衣柜',sofa:'沙发','coffee-table':'茶几','dining-table':'餐桌',chair:'餐椅',armchair:'休闲椅',cabinet:'储物柜',sideboard:'餐边柜',counter:'橱柜',sink:'洗手盆',toilet:'坐便器',shower:'淋浴',stove:'灶台',fridge:'冰箱',washer:'洗衣机',rug:'地毯',plant:'绿植',lamp:'台灯','side-table':'边几',bench:'长凳',vanity:'浴室柜',basin:'台盆'};
const STORAGE='jusuo.plan.v1';
let furnitureClipboard=null, furniturePasteCount=0;
let measurement={start:null,end:null,complete:false,snapLabel:''};
let plan=createInitialPlan(), selected=null, filter='all', search='', collapsed=new Set(), history=[], future=[], scene=null, view='2d', tool='move', linked=true, anchor='center', dragBefore=null, toastTimer, saveTimer, pendingConfirmation=null, dragFailed=false;
try{const saved=localStorage.getItem(STORAGE);if(saved)plan=validatePlan(JSON.parse(saved));}catch{setTimeout(()=>toast('未能恢复浏览器中的方案，已载入原始户型。',true),400);}
const beforePublishedEdit=JSON.parse(JSON.stringify(plan));
try{if(applyPublishedPlanEdits(plan)){
  // Undo restores the prior geometry while remembering the published edit.
  beforePublishedEdit.meta.appliedEdits=[...plan.meta.appliedEdits];
  history.push(JSON.stringify(beforePublishedEdit));
  setTimeout(()=>{persist();toast('已同步最新户型修改，可通过撤销恢复。');},0);
}}catch(error){setTimeout(()=>toast(`最新户型修改未能自动应用：${error.message}。已保留你的方案。`,true),400);}
selected=plan.objects.find(o=>o.type==='furniture'&&o.kind==='sofa')?.id??plan.objects.find(o=>o.type==='furniture')?.id??null;
const snapshot=()=>JSON.stringify(plan);
const roomName=v=>plan.rooms?.find(r=>r.id===v)?.name||v||'未分组';
const objIcon=o=>o.type==='furniture'?'sofa':o.type;
const selectedObject=()=>plan.objects.find(o=>o.id===selected);

function toast(message,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=message;t.classList.toggle('error',error);t.classList.add('show');toastTimer=setTimeout(()=>t.classList.remove('show'),error?5200:2800);}
function persist(){clearTimeout(saveTimer);$('#save-status').innerHTML='<span class="status-dot"></span>正在保存…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,snapshot());$('#save-status').innerHTML='<span class="status-dot"></span>已保存在此浏览器';}catch{$('#save-status').textContent='保存失败 · 请导出备份';toast('浏览器存储不可用，请导出 JSON 保存方案。',true);}},180);}
function remember(before){if(before===snapshot())return;history.push(before);if(history.length>70)history.shift();future=[];persist();updateHistory();}
function mutate(fn,message){const before=snapshot();try{fn();scene?.clearMeasurement();remember(before);render();if(message)toast(message);}catch(error){plan=JSON.parse(before);render();toast(error.message||'这个修改无法应用，请检查参数。',true);}}
function updateHistory(){$('#undo-btn').disabled=!history.length;$('#redo-btn').disabled=!future.length;}
function undo(){if(!history.length)return;scene?.clearMeasurement();future.push(snapshot());plan=JSON.parse(history.pop());if(!plan.objects.some(o=>o.id===selected))selected=null;persist();render();toast('已撤销');}
function redo(){if(!future.length)return;scene?.clearMeasurement();history.push(snapshot());plan=JSON.parse(future.pop());if(!plan.objects.some(o=>o.id===selected))selected=null;persist();render();toast('已重做');}
function select(id){selected=id;scene?.select(id);renderTree();renderInspector();updateStatus();}
function render(){if(!plan.objects.some(o=>o.id===selected))selected=null;$('#project-title').value=plan.title;$('#object-count').textContent=plan.objects.length;renderTree();renderInspector();updateStatus();updateHistory();scene?.setPlan(plan);scene?.select(selected);}
function updateStatus(){if(tool==='measure'){const ready=measurement.start&&measurement.end;$('#selection-status').textContent=ready?`测量${measurement.complete?'完成':'预览'} · ${Math.round(measurementMetrics(measurement.start,measurement.end).distance)} mm`:'测量模式 · 点击'+(measurement.start?'终点':'起点');return;}const o=selectedObject();$('#selection-status').textContent=o?`${o.name} · ${Math.round(o.width)} × ${Math.round(o.depth)} mm${o.locked?' · 已锁定':''}`:`${plan.objects.length} 个独立对象 · 从图形或列表选择` ;}
function filteredObjects(){return plan.objects.filter(o=>(filter==='all'||(filter==='opening'?['door','window'].includes(o.type):o.type===filter))&&(!search||`${o.name} ${o.id} ${roomName(o.room)} ${TYPES[o.type]}`.toLowerCase().includes(search)));}
function renderTree(){const tree=$('#object-tree');tree.replaceChildren();const grouped=new Map();for(const o of filteredObjects()){const key=roomName(o.room);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(o);}if(!grouped.size){tree.innerHTML='<p class="empty-search">没有找到对象<br>试试房间名、物件名或编号</p>';return;}for(const [room,objects] of grouped){const group=document.createElement('div');group.className='object-group';const toggle=document.createElement('button');toggle.className='group-toggle'+(collapsed.has(room)&&!search?' collapsed':'');toggle.setAttribute('aria-expanded',String(!collapsed.has(room)||!!search));toggle.innerHTML=`${icon('chevron')}<span>${esc(room)}</span><small>${objects.length}</small>`;toggle.addEventListener('click',()=>{collapsed.has(room)?collapsed.delete(room):collapsed.add(room);renderTree();});group.append(toggle);if(!collapsed.has(room)||search){for(const o of objects){const row=document.createElement('div');row.className=`object-row${o.id===selected?' selected':''}${o.visible===false?' invisible':''}`;row.dataset.objectId=o.id;const pick=document.createElement('button');pick.className='object-pick';pick.setAttribute('aria-label',`选择 ${o.name}`);pick.setAttribute('aria-pressed',String(o.id===selected));pick.title=`${o.name} · ${o.id}`;pick.innerHTML=`${icon(objIcon(o))}<span>${esc(o.name)}</span>`;pick.onclick=()=>select(o.id);row.append(pick);const visibility=document.createElement('button');visibility.className=`icon-button row-action${o.visible===false?' marked':''}`;visibility.setAttribute('aria-label',`${o.visible===false?'显示':'隐藏'} ${o.name}`);visibility.innerHTML=icon('eye');visibility.onclick=()=>mutate(()=>{o.visible=o.visible===false;});row.append(visibility);const lock=document.createElement('button');lock.className=`icon-button row-action${o.locked?' marked':''}`;lock.setAttribute('aria-label',`${o.locked?'解锁':'锁定'} ${o.name}`);lock.innerHTML=icon(o.locked?'lock':'unlock');lock.onclick=()=>mutate(()=>{o.locked=!o.locked;});row.append(lock);group.append(row);}}tree.append(group);}}

function field(label,key,value,unit='',opts={}){return `<label class="field">${label}<span class="field-unit-wrap"><input data-prop="${key}" aria-label="${label}" type="${opts.text?'text':'number'}" value="${esc(value)}" ${opts.text?'maxlength="80"':'step="'+(opts.step||1)+'"'} ${opts.disabled?'disabled':''} ${opts.min!==undefined?'min="'+opts.min+'"':''}>${unit?`<span class="field-unit">${unit}</span>`:''}</span></label>`;}
function renderInspector(){renderFurnitureClipboard();const c=$('#inspector-content'),o=selectedObject();if(!o){c.innerHTML=`<div class="inspector-empty">${icon('move')}<div>选择一个空间对象</div><small>输入尺寸，或在画布中直接调整。</small></div><div class="inspector-section"><div class="source-note">根据原图重建的户型。每面墙、每扇门窗和每件家具均为独立对象。</div></div>`;return;}
 const attached=['door','window'].includes(o.type)&&!!o.wallId;const wall=o.type==='wall', locked=o.locked;
 const roomOptions=[...new Set([...(plan.rooms||[]).map(r=>r.name),...plan.objects.map(v=>roomName(v.room))])];
 c.innerHTML=`<div class="inspector-head"><div class="inspector-topline"><span>对象属性</span><span class="type-badge">${o.type==='door'?({sliding:'推拉门',opening:'敞口',single:'平开门'}[o.kind]||'门'):TYPES[o.type]||'对象'}</span></div><h2>${esc(o.name)}</h2><span class="object-id">${esc(o.id)}</span></div>
 <section class="inspector-section"><h3 class="section-title">基本信息</h3>${field('对象名称','name',o.name,'',{text:true})}<label class="field">所属空间<select data-prop="room" aria-label="所属空间">${roomOptions.map(r=>`<option value="${esc(r)}" ${roomName(o.room)===r?'selected':''}>${esc(r)}</option>`).join('')}</select></label></section>
 <section class="inspector-section"><h3 class="section-title">尺寸<span>毫米 / mm</span></h3><div class="fields-grid">${field(wall?'长度':o.type==='door'||o.type==='window'?'洞口宽度':'宽度','width',Math.round(o.width),'mm',{disabled:locked,min:10})}${field(wall?'墙厚':'深度','depth',Math.round(o.depth),'mm',{disabled:locked||attached,min:10})}</div>${field('高度','height',Math.round(o.height),'mm',{disabled:locked,min:1})}${wall?`<label class="field">修改长度时固定<select id="wall-anchor" aria-label="修改长度时固定"><option value="center" ${anchor==='center'?'selected':''}>中心</option><option value="start" ${anchor==='start'?'selected':''}>起点</option><option value="end" ${anchor==='end'?'selected':''}>终点</option></select></label><label class="toggle-row">相连墙体端点联动<input id="wall-linked" type="checkbox" ${linked?'checked':''}></label>`:''}</section>
 <section class="inspector-section"><h3 class="section-title">位置与方向<span>以左上为原点</span></h3><div class="fields-grid">${field('X 坐标','x',Math.round(o.x),'mm',{disabled:locked||attached})}${field('Y 坐标','y',Math.round(o.y),'mm',{disabled:locked||attached})}</div>${field('旋转角度','rotation',Math.round(o.rotation*10)/10,'°',{disabled:locked||attached,step:1})}${attached?'<p class="note">坐标与方向跟随关联墙体，通过下方距离调整位置。</p>':''}</section>
 ${['door','window'].includes(o.type)?`<section class="inspector-section"><h3 class="section-title">门窗设置</h3>${o.type==='door'?`<label class="field">门型<select data-prop="kind" aria-label="门型" ${locked?'disabled':''}><option value="single" ${!['sliding','opening'].includes(o.kind)?'selected':''}>平开门</option><option value="sliding" ${o.kind==='sliding'?'selected':''}>推拉门</option><option value="opening" ${o.kind==='opening'?'selected':''}>敞口</option></select></label>`:''}<label class="field">关联墙体<select data-prop="wallId" aria-label="关联墙体" ${locked?'disabled':''}><option value="">不关联 · 自由摆放</option>${plan.objects.filter(v=>v.type==='wall').map(w=>`<option value="${esc(w.id)}" ${o.wallId===w.id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label>${attached?field('中心距墙起点','offset',Math.round(o.offset),'mm',{disabled:locked,min:0}):''}${o.type==='window'?field('窗台高度','sill',Math.round(o.sill??900),'mm',{disabled:locked,min:0}):''}${o.type==='door'&&!['sliding','opening'].includes(o.kind)?`<div class="fields-grid"><label class="field">合页方向<select data-prop="hinge" aria-label="合页方向" ${locked?'disabled':''}><option value="left" ${o.hinge==='left'?'selected':''}>左侧</option><option value="right" ${o.hinge==='right'?'selected':''}>右侧</option></select></label><label class="field">开启侧<select data-prop="swing" aria-label="开启侧" ${locked?'disabled':''}><option value="1" ${o.swing!==-1?'selected':''}>正向</option><option value="-1" ${o.swing===-1?'selected':''}>反向</option></select></label></div>`:''}</section>`:''}
 <section class="inspector-section"><label class="toggle-row">显示对象<input data-prop="visible" type="checkbox" ${o.visible!==false?'checked':''} aria-label="显示对象"></label><label class="toggle-row">锁定位置与尺寸<input data-prop="locked" type="checkbox" ${o.locked?'checked':''} aria-label="锁定位置与尺寸"></label><label class="toggle-row">尺寸待实测校准<input data-prop="estimated" type="checkbox" ${o.estimated?'checked':''} aria-label="尺寸待实测校准"></label></section>
 <section class="inspector-section"><div class="inspector-actions"><button class="button" id="duplicate-btn">${icon('copy')}${o.type==='furniture'?'直接生成副本':'复制对象'}</button><button class="button" id="delete-btn">${icon('trash')}删除</button></div><div class="source-note">${o.estimated?'<strong>估算尺寸</strong><br>根据原图比例重建，可输入实测数值，并关闭“尺寸待实测校准”。':'<strong>尺寸记录</strong><br>当前数值已保存到方案。重新标为待校准可记录后续测量需求。'}</div></section>`;
 c.querySelectorAll('[data-prop]').forEach(input=>input.addEventListener('change',()=>{const key=input.dataset.prop;let value=input.type==='checkbox'?input.checked:input.type==='number'||key==='swing'?Number(input.value):input.value;if(input.type==='number'&&input.value.trim()===''){toast('请输入有效的数值。',true);renderInspector();return;}if(key==='name'&&!String(value).trim()){toast('名称不能为空。',true);renderInspector();return;}mutate(()=>updateObject(plan,o.id,{[key]:value},{linked,anchor}));}));
 c.querySelectorAll('input').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}else if(e.key==='Escape'){renderInspector();}}));
 $('#wall-anchor')?.addEventListener('change',e=>anchor=e.target.value);$('#wall-linked')?.addEventListener('change',e=>linked=e.target.checked);
 $('#duplicate-btn').onclick=duplicateSelected;$('#delete-btn').onclick=deleteSelected;
}
function refreshInspectorValues(){const o=selectedObject();if(!o)return;for(const key of ['x','y','width','depth','height','rotation','offset']){const input=$(`#inspector-content [data-prop="${key}"]`);if(input&&document.activeElement!==input)input.value=Math.round((o[key]??0)*10)/10;}updateStatus();}
function renderFurnitureClipboard(){
 const furniture=selectedObject()?.type==='furniture';
 $('#copy-furniture-btn').disabled=!furniture;
 $('#paste-furniture-btn').disabled=!furnitureClipboard;
 const message=furnitureClipboard?'已复制：'+furnitureClipboard.name:'选择家具后复制，可连续粘贴';
 $('#clipboard-status').textContent=message;$('#clipboard-status').title=message;
}
function copySelectedFurniture(){
 const object=selectedObject();
 if(object?.type!=='furniture'){toast('请选择一件家具后复制。',true);return;}
 try{furnitureClipboard=copyFurniture(plan,object.id);furniturePasteCount=0;renderFurnitureClipboard();toast('家具已复制，可连续粘贴副本');}
 catch(error){toast(error.message,true);}
}
function pasteCopiedFurniture(){
 if(!furnitureClipboard){toast('请先选择家具并复制。',true);return;}
 if(scene?.drag){toast('请先结束拖动，再粘贴家具。');return;}
 if(tool==='measure')setTool('move');
 mutate(()=>{
  const result=pasteFurniture(plan,furnitureClipboard,{offset:300*(furniturePasteCount+1)});
  furniturePasteCount++;selected=result.id;collapsed.delete(roomName(result.room));
 },'家具副本已粘贴，可移动、旋转或修改尺寸');
}
function duplicateSelected(){const o=selectedObject();if(!o)return;mutate(()=>{const result=duplicateObject(plan,o.id);selected=result?.id??(typeof result==='string'?result:plan.objects.at(-1)?.id);},'已复制，可拖动调整位置');}
function deleteSelected(){const o=selectedObject();if(!o)return;if(o.locked){toast('请先解锁这个对象。',true);return;}const dependents=plan.objects.filter(v=>v.wallId===o.id);const apply=()=>mutate(()=>{removeObject(plan,o.id);selected=null;},'已删除，可使用撤销恢复');if(dependents.length)confirmAction('删除墙体？',`「${o.name}」上关联的 ${dependents.length} 个门窗也将删除。可以通过撤销恢复。`,apply);else apply();}
function confirmAction(title,message,fn){$('#confirm-title').textContent=title;$('#confirm-text').textContent=message;pendingConfirmation=fn;$('#confirm-dialog').showModal();}
function updateModeHint(){
 const measuring=tool==='measure';
 $('#mode-hint').innerHTML='<span class="hint-dot"></span>'+(measuring?'点选起点 → 终点 · Esc 清除 / 退出':view==='3d'?'拖动环绕 · 滚轮缩放 · 属性栏精确编辑':'点击选择 · 拖动移动 · 手柄旋转');
 $('#view-caption').textContent=measuring?'量清每一段距离。':view==='3d'?'换个角度，看见你的家。':'让空间，随想法改变。';
}
function updateMeasurement(state){
 measurement=state;
 const ready=state.start&&state.end,values=ready?measurementMetrics(state.start,state.end):null;
 $('#measure-phase').textContent=state.complete?'测量完成 · 点击开始下一条':state.start?'选择终点 · 实时预览':'选择起点';
 $('#measure-distance').textContent=values?Math.round(values.distance).toLocaleString('zh-CN')+' mm':'—';
 $('#measure-metres').textContent=values?(values.distance/1000).toFixed(3)+' m':'';
 $('#measure-dx').textContent=values?Math.round(values.dx).toLocaleString('zh-CN')+' mm':'—';
 $('#measure-dy').textContent=values?Math.round(values.dy).toLocaleString('zh-CN')+' mm':'—';
 $('#measure-clear').disabled=!state.start&&!state.end;
 const instruction=state.complete?'按当前模型计算 · 点击新起点继续测量':'Shift 水平 / 竖直 · Alt 自由取点';
 $('#measure-help').textContent=(state.snapLabel?'吸附：'+state.snapLabel+' · ':'')+instruction;
 updateStatus();
}
function finishPendingDrag(){
 scene?.finishDrag();
 if(!dragBefore)return;
 const before=dragBefore;dragBefore=null;remember(before);render();
}
function setView(next){
 if(next!==view)finishPendingDrag();
 if(next==='3d'&&tool==='measure')setTool('move');
 view=next;scene?.setView(view);$('#fullheight-label').hidden=view!=='3d';
 for(const name of ['2d','3d']){$('#view-'+name).classList.toggle('active',view===name);$('#view-'+name).setAttribute('aria-pressed',String(view===name));}
 $('#move-btn').disabled=view==='3d';$('#rotate-btn').disabled=view==='3d';updateModeHint();
}
function setTool(next){
 if(next!==tool)finishPendingDrag();
 if(next==='measure'&&view!=='2d')setView('2d');
 tool=next;scene?.setTool(tool);
 for(const name of ['move','rotate','measure']){$('#'+name+'-btn').classList.toggle('active',tool===name);$('#'+name+'-btn').setAttribute('aria-pressed',String(tool===name));}
 $('#measurement-panel').hidden=tool!=='measure';$('.workspace').classList.toggle('measuring',tool==='measure');
 $('#snap-detail').textContent=tool==='measure'?'端点 / 边缘':tool==='rotate'?'15°':'网格 / 墙面';updateModeHint();updateStatus();
 if(tool==='rotate'&&selectedObject()?.wallId)toast('门窗方向跟随墙体，可在属性中翻转开启方向。');
}
function download(data,name,mime){const a=document.createElement('a');let blob;if(typeof data==='string'&&data.startsWith('data:')){const encoded=data.slice(data.indexOf(',')+1),bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));blob=new Blob([bytes],{type:mime});}else blob=new Blob([data],{type:mime});const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const fileName=()=>plan.title.replace(/[\\/:*?"<>|]/g,'-').slice(0,70)||'户型方案';
function downloadJSON(){download(JSON.stringify(plan,null,2),fileName()+'.json','application/json');$('#export-dialog').close();toast('方案已导出，可随时导入继续编辑');}

$('#project-title').addEventListener('change',e=>{const value=e.target.value.trim();if(!value){e.target.value=plan.title;return;}mutate(()=>plan.title=value.slice(0,100));});
$('#object-search').oninput=e=>{search=e.target.value.toLowerCase().trim();renderTree();};
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderTree();});
$('#undo-btn').onclick=undo;$('#redo-btn').onclick=redo;$('#view-2d').onclick=()=>setView('2d');$('#view-3d').onclick=()=>setView('3d');$('#move-btn').onclick=()=>setTool('move');$('#rotate-btn').onclick=()=>setTool('rotate');
$('#copy-furniture-btn').onclick=copySelectedFurniture;$('#paste-furniture-btn').onclick=pasteCopiedFurniture;
$('#measure-btn').onclick=()=>setTool(tool==='measure'?'move':'measure');
$('#measure-clear').onclick=()=>scene?.clearMeasurement();$('#measure-exit').onclick=()=>setTool('move');
$('#mirror-btn').onclick=()=>{mutate(()=>mirrorPlanHorizontally(plan),'已左右镜像，再点一次可翻回；Ctrl+Z 可撤销');scene?.fit();};
$('#zoom-in').onclick=()=>scene?.zoom(1.2);$('#zoom-out').onclick=()=>scene?.zoom(1/1.2);$('#fit-btn').onclick=()=>scene?.fit();
for(const option of ['snap','grid','labels','dimensions','reference','fullHeight']){$(`#option-${option}`).onchange=e=>scene?.setOptions({[option]:e.target.checked});}
$('#export-btn').onclick=()=>$('#export-dialog').showModal();$('#help-btn').onclick=()=>$('#help-dialog').showModal();$('#download-json').onclick=downloadJSON;
$('#download-png').onclick=()=>{try{const data=scene?.exportPNG();if(!data)throw Error('画布暂不可用。');download(data,fileName()+`-${view}.png`,'image/png');$('#export-dialog').close();toast('图片已导出');}catch(e){toast(e.message,true);}};
$('#import-btn').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>10*1024*1024)throw Error('方案文件不能大于 10 MB。');const next=validatePlan(JSON.parse(await f.text()));mutate(()=>{plan=next;selected=null;collapsed.clear();},'方案已导入');scene?.fit();}catch(error){toast(error.message||'无法读取方案，请选择有效 JSON 文件。',true);}e.target.value='';};
$('#reset-btn').onclick=()=>confirmAction('恢复默认户型？','恢复已左右镜像的默认方案，包含此前的阳台门墙删除及推拉门修正。当前修改可以通过撤销找回。',()=>{mutate(()=>{plan=createInitialPlan();selected=null;},'已恢复默认户型');scene?.fit();});
$('#confirm-yes').onclick=()=>{const fn=pendingConfirmation;pendingConfirmation=null;$('#confirm-dialog').close();fn?.();};
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
$('#add-kind').innerHTML=Object.entries(KINDS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
$('#add-btn').onclick=()=>$('#add-dialog').showModal();$('#add-type').onchange=e=>$('#add-kind-field').hidden=e.target.value!=='furniture';
$('#add-form').onsubmit=e=>{e.preventDefault();const type=$('#add-type').value,kind=type==='furniture'?$('#add-kind').value:type;mutate(()=>{const o=createObject(type,kind);o.name=$('#add-name').value.trim()||o.name;o.x=5000;o.y=5000;o.room='客餐厅';if(o.wallId)delete o.wallId;plan.objects.push(o);resolveOpenings(plan);selected=o.id;},'已添加对象，可拖动或输入参数');$('#add-dialog').close();$('#add-name').value='';};
// Native browser Edit-menu commands may emit copy/paste without keydown.
const FURNITURE_CLIPBOARD_PREFIX='JUSUO_FURNITURE_V1\n';
function nativeTextEditing(){const active=document.activeElement;return ['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)||active?.isContentEditable||!!document.querySelector('dialog[open]');}
document.addEventListener('copy',event=>{
 if(nativeTextEditing()||window.getSelection()?.toString()||selectedObject()?.type!=='furniture'||!event.clipboardData)return;
 copySelectedFurniture();
 event.clipboardData.setData('text/plain',FURNITURE_CLIPBOARD_PREFIX+JSON.stringify(furnitureClipboard));event.preventDefault();
});
document.addEventListener('paste',event=>{
 if(nativeTextEditing())return;
 // Keep native menu paste consistent with the latest copy made in this page.
 if(furnitureClipboard){event.preventDefault();pasteCopiedFurniture();return;}
 const text=event.clipboardData?.getData('text/plain')||'';
 if(!text.startsWith(FURNITURE_CLIPBOARD_PREFIX))return;
 event.preventDefault();
 try{
  if(text.length>20000)throw Error('家具剪贴板内容过大。');
  const data=JSON.parse(text.slice(FURNITURE_CLIPBOARD_PREFIX.length));
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('家具数据格式不正确。');
  const copied=copyFurniture({objects:[data]},data?.id);
  if(JSON.stringify(copied)!==JSON.stringify(furnitureClipboard)){furnitureClipboard=copied;furniturePasteCount=0;renderFurnitureClipboard();}
  pasteCopiedFurniture();
 }catch(error){toast('无法粘贴这份家具：'+error.message,true);}
});
document.addEventListener('keydown',e=>{
 const active=document.activeElement;
 if(['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)||active?.isContentEditable||document.querySelector('dialog[open]'))return;
 const key=e.key.toLowerCase(),command=e.ctrlKey||e.metaKey;
 if(scene?.drag){
  if(e.key==='Escape'){e.preventDefault();scene.finishDrag(false);return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.key)||(command&&['z','y','d','v'].includes(key)))finishPendingDrag();
 }
 if(command&&!e.altKey&&!e.shiftKey&&(key==='c'||key==='v')){
  if(key==='c'&&window.getSelection()?.toString())return;
  e.preventDefault();if(e.repeat)return;
  if(key==='c')copySelectedFurniture();else pasteCopiedFurniture();return;
 }
 if(tool==='measure'){
  if(e.key==='Escape'){e.preventDefault();if(measurement.start||measurement.end)scene?.clearMeasurement();else setTool('move');return;}
  if(['Delete','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||(command&&key==='d')){e.preventDefault();return;}
 }
 if(key==='m'&&!command&&!e.altKey){e.preventDefault();setTool(tool==='measure'?'move':'measure');return;}
 if(command&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();}
 else if(command&&key==='y'){e.preventDefault();redo();}
 else if(command&&key==='d'){e.preventDefault();duplicateSelected();}
 else if(command&&key==='s'){e.preventDefault();downloadJSON();}
 else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();}
 else if(!command&&key==='v'&&view==='2d')setTool('move');
 else if(!command&&key==='r'&&view==='2d')setTool('rotate');
 else if(e.key==='Escape')select(null);
 else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
  const object=selectedObject();if(!object||object.locked)return;e.preventDefault();const step=e.shiftKey?100:10;
  mutate(()=>updateObject(plan,object.id,{x:object.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),y:object.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)},{linked,anchor}));
 }
});
try{scene=new PlanScene($('#scene'),{onSelect:select,onMeasurementChange:updateMeasurement,onTransform(id,patch,phase){if(phase==='cancel'){if(dragBefore){plan=JSON.parse(dragBefore);dragBefore=null;render();}return;}if(phase==='start'){dragBefore=snapshot();dragFailed=false;return;}if(!dragBefore)dragBefore=snapshot();try{plan=JSON.parse(dragBefore);updateObject(plan,id,patch,{linked,anchor:'center'});scene.setPlan(plan);scene.select(id);refreshInspectorValues();if(phase==='commit'){remember(dragBefore);dragBefore=null;render();}}catch(error){plan=JSON.parse(dragBefore);scene.setPlan(plan);scene.select(id);refreshInspectorValues();if(!dragFailed)toast(error.message,true);dragFailed=true;if(phase==='commit'){dragBefore=null;render();}}}});scene.setPlan(plan);scene.select(selected);}catch(error){$('#canvas-error').hidden=false;$('#canvas-error').textContent=`无法初始化三维画布：${error.message}。请在支持 WebGL 2 的浏览器中开启硬件加速。对象列表与方案导入导出仍可使用。`;toast('画布初始化失败。',true);}
render();scene?.fit();
window.addEventListener('beforeunload',()=>{try{localStorage.setItem(STORAGE,snapshot());}catch{}});
