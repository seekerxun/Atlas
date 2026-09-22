import 创建模板 from './模板.js';
/* 石墨主题：视觉样式见 样式.css；本文件决定布局、模板与动效。 */
export default function 创建主题(api){
const {$, 转义, 图后缀, 可动, 分组数据, 更新关联} = api;
function 装配界面(){
api.清理(() => {
  document.querySelectorAll('.卡,.步').forEach(停卡片动效);
  document.body.classList.remove('石墨阅读','远','中');
  $('#阅读幕').classList.remove('开'); $('#阅读幕').removeAttribute('style');
  $('#签').style.removeProperty('--签左'); $('#签').style.removeProperty('--签宽');
  $('#文件预览').style.removeProperty('--预览顶'); $('#文件预览').style.removeProperty('--预览高');
});
}

const 卡宽 = 284, 卡高 = 216, 隙 = 16, 盒隙 = 44;
const 导航图形 = {
  '路线':'<circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7.5 5h7a4 4 0 0 1 0 8h-5a4 4 0 0 0 0 8h7"/>',
  '策划':'<path d="M5 3h10l4 4v14H5zM14 3v5h5M9 12h6M9 16h6"/>',
  '内容':'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  '创意':'<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
  '资产':'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>'
};

const 已知类型 = new Set(['总览','世界观','系统','数值','机制','规范','流程','世界','NPC','势力','技能','道具','副本','剧情','异常物','谱痕','力量体系','创意','数据表']);


function 色(k){
  const 名 = String(k || '总览');
  const 候补 = ['技能','NPC','世界','力量体系','道具','势力','谱痕'];
  let hash = 0; for (const c of 名) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return `var(--k-${已知类型.has(名) ? 名 : 候补[hash % 候补.length]})`;
}

function 定位文件预览(){
  const 区 = 阅读区域();
  $('#文件预览').style.setProperty('--预览高', 区.高 + 'px');
  $('#文件预览').style.setProperty('--预览顶', 区.顶 + 'px');
}

function 定位导航(){
  const active = $('#签 button.开'); if (!active) return;
  $('#签').style.setProperty('--签左', active.offsetLeft + 'px');
  $('#签').style.setProperty('--签宽', active.offsetWidth + 'px');
}

function 算库布局(){
  const {视图, 布局} = api.读取状态();
  const 盒 = 分组数据(), 结果 = [];
  let x = 40, y = 40, 行高 = 0;
  const 限宽 = 2400;
  Object.keys(盒).sort((a, b) => 盒[b].length - 盒[a].length).forEach(名 => {
    const ns = 盒[名].slice().sort((a, b) =>
      (a.类型 + a.标题).localeCompare(b.类型 + b.标题, 'zh'));
    const 类组 = {}; ns.forEach(n => (类组[n.类型 || '?'] ??= []).push(n));
    const 列 = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(ns.length))));
    let 内y = 0; const 卡们 = [];
    Object.keys(类组).forEach(类 => {
      卡们.push({类标: 类, x: 0, y: 内y}); 内y += 28;
      const 行卡高 = 卡高 + (类组[类].some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 56 : 0);
      类组[类].forEach((n, i) => {
        const c = i % 列, r = (i / 列) | 0;
        卡们.push({节: n, x: c * (卡宽 + 隙), y: 内y + r * (行卡高 + 隙), h: 行卡高});
      });
      内y += Math.ceil(类组[类].length / 列) * (行卡高 + 隙) + 10;
    });
    const w = 列 * (卡宽 + 隙) - 隙 + 44, h = 内y + 64;
    if (x + w > 限宽 && x > 40) { x = 40; y += 行高 + 盒隙; 行高 = 0; }
    const id = `盒:${视图}:${名}`;
    const p = {...(布局[id] || {x, y})};
    // 放大卡片后，旧布局可能相交；只调整显示位置，不覆盖用户保存的布局。
    for (let 次 = 0; 次 <= 结果.length; 次++) {
      const 撞 = 结果.find(b => p.x < b.x+b.w+盒隙 && p.x+w+盒隙 > b.x && p.y < b.y+b.h+盒隙 && p.y+h+盒隙 > b.y);
      if (!撞) break;
      p.x = 撞.x + 撞.w + 盒隙;
    }
    结果.push({id, 名, 数: ns.length, x: p.x, y: p.y, w, h, 卡们});
    x += w + 盒隙; 行高 = Math.max(行高, h);
  });
  return 结果;
}

function 算路线布局(r, 基y){
  const {布局} = api.读取状态();
  const 步 = r.步骤, 位序 = {}; 步.forEach((s, i) => 位序[s.id] = i);
  const 入度 = 步.map(() => 0);
  步.forEach(s => (s.next || []).forEach(n => { if (位序[n] != null) 入度[位序[n]]++; }));
  const 深 = 步.map(() => 0);
  let 队 = 步.map((_, i) => i).filter(i => 入度[i] === 0), 守 = 0;
  while (队.length && 守++ < 9999) {
    const i = 队.shift();
    (步[i].next || []).forEach(n => {
      const j = 位序[n]; if (j == null) return;
      if (深[j] < 深[i] + 1) { 深[j] = 深[i] + 1; 队.push(j); }
    });
  }
  const 列 = {}; 步.forEach((s, i) => (列[深[i]] ??= []).push(i));
  const 位置 = [];
  Object.keys(列).map(Number).sort((a, b) => a - b).forEach(d => {
    let y = 40;
    列[d].forEach(i => {
      const 高 = 190 + ((步[i].docs || []).length + (步[i].tools || []).length +
                      (步[i].outputs || []).length) * 31 + (步[i].note ? 82 : 0);
      const id = `步:${r.名称}:${步[i].id}`;
      const p = {...(布局[id] || {x: 40 + d * 370, y: 基y + y})};
      p.y = Math.max(基y + 40, p.y);
      for (let 次 = 0; 次 <= 步.length; 次++) {
        const 撞 = 位置.find(b => b && p.x < b.x+332 && p.x+332 > b.x && p.y < b.y+b.h+32 && p.y+高+32 > b.y);
        if (!撞) break;
        p.y = 撞.y+撞.h+32;
      }
      位置[i] = {id, x: p.x, y: p.y, h: 高};
      y += 高 + 32;
    });
  });
  return 位置;
}

function 卡html(n){
  const 图 = (n.资产展开 || []).filter(a => 图后缀.test(a)).slice(0, 3);
  return `<div class="条" style="background:${色(n.类型)}"></div>
    <div class="卡眉"><span class="卡识别"><span class="类型签">${转义(n.类型 || '文档')}</span>${n.编号 ? `<span class="编号">${转义(n.编号)}</span>` : ''}</span><span class="展开符" aria-hidden="true">⤢</span></div>
    <h4>${转义(n.标题 || n.名称)}</h4>
    ${n.摘要 ? `<div class="要">${转义(n.摘要)}</div>` : ''}
    ${图.length ? `<div class="图条">${图.map(a =>
      `<img loading="lazy" src="/文件/${encodeURI(a)}">`).join('')}</div>` : ''}
    <div class="脚">
      <span class="小丸 ${n.状态 === '草案' ? '草案' : ''}">${转义(n.状态)}</span>
      ${(n.被引用 || []).length ? `<span class="小丸 引">被引 ${n.被引用.length}</span>` : ''}
      ${(n.资产展开 || []).length ? `<span class="小丸 图">${n.资产展开.length} 图</span>` : ''}
      ${(n.路线 || []).length ? `<span class="小丸">${转义(n.路线[0])}</span>` : ''}
    </div>`;
}

function 行(文, 尾, 点击, 色条){
  return `<div class="行" ${点击 ? `onclick="${点击}"` : ''}>
    ${色条 ? `<span class="点" style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${色条}"></span>` : ''}
    <span>${转义(文)}</span>${尾 ? `<span class="尾">${转义(尾)}</span>` : ''}</div>`;
}

function 详情头(标题, 分类, 路径){
  return `<div class="详情头"><div><div class="详情眉"><span>${转义(分类)}</span><span>正在阅读</span></div><h3>${转义(标题)}</h3><div class="路">${转义(路径)}</div></div><button class="收起" onclick="收卡()" aria-label="收起卡片">收起 <kbd>Esc</kbd></button></div>`;
}

function 停卡片动效(card){ card?._动效清理?.(); }

function 卡片过渡(card, 原框){
  if (!可动() || !原框?.width) return;
  const 终框 = card.getBoundingClientRect();
  if (!终框.width || !终框.height) return;
  const opening = card.classList.contains('展开'), duration = opening ? 260 : 200;
  const shell = document.createElement('div'); shell.className = '石墨过渡片';
  shell.setAttribute('aria-hidden','true'); shell.inert = true;
  const surface = getComputedStyle(card);
  shell.style.cssText = `left:${终框.left}px;top:${终框.top}px;width:${终框.width}px;height:${终框.height}px;--卡色:${surface.getPropertyValue('--卡色')};`;
  api.装饰(shell); card._过渡壳 = shell;
  const start = `translate(${原框.left-终框.left}px,${原框.top-终框.top}px) scale(${原框.width/终框.width},${原框.height/终框.height})`;
  const ease = 'cubic-bezier(.22,1,.36,1)';
  const animations = [];
  const move = api.动画(shell,[{transform:start},{transform:'none'}],{duration,easing:ease});
  animations.push(move, api.动画(shell,[{opacity:1,offset:0},{opacity:1,offset:.62},{opacity:0,offset:1}],{duration,fill:'forwards'}));
  animations.push(api.动画(card,[{opacity:0,offset:0},{opacity:0,offset:.42},{opacity:1,offset:1}],{duration,easing:'ease-out'}));
  if (opening) {
    card.querySelectorAll('.详情头,.详情体').forEach((el,i) => animations.push(api.动画(el,
      [{opacity:0,transform:`translateY(${i ? 14 : 8}px)`},{opacity:1,transform:'none'}],
      {duration:160,delay:40+i*30,easing:ease,fill:'backwards'})));
  }
  const cleanup = () => { animations.forEach(a => a.cancel()); shell.remove(); card._过渡壳=null; card._动效清理=null; };
  card._展开动画=move; card._动效清理=cleanup;
  move.finished.then(() => { cleanup(); 更新关联(); }, () => {});
}

function 布置阅读幕(){
  const {展开卡, 位, 缩} = api.读取状态();
  const curtain=$('#阅读幕'), stage=$('#台');
  document.body.classList.toggle('石墨阅读',!!展开卡);
  curtain.classList.toggle('开',!!展开卡);
  curtain.style.cssText=`left:${-位.x/缩}px;top:${-位.y/缩}px;width:${stage.clientWidth/缩}px;height:${stage.clientHeight/缩}px;`;
}

function 画布入场(){
  if (!可动()) return;
  const stage=$('#台').getBoundingClientRect();
  const visible=[...$('#世界').querySelectorAll('.卡,.步,.空')].filter(el=>{
    const r=el.getBoundingClientRect();return !el.classList.contains('展开') && r.right>stage.left && r.left<stage.right && r.bottom>stage.top && r.top<stage.bottom;
  });
  visible.forEach((el,i)=>{
    // 与拖拽使用的 left/top、悬停使用的 translate 分开。
    el._入场动画?.cancel();
    el._入场动画=api.动画(el,[{opacity:0,transform:'translateY(30px) scale(.94)'},{opacity:1,transform:'none'}],
      {duration:560,delay:Math.min(i,7)*65,easing:'cubic-bezier(.18,.8,.2,1)',fill:'backwards'});
  });
  $('#世界').querySelectorAll('.路线标题,.盒>.头,.类标:not(.路线标题)').forEach(el=>api.动画(el,
    [{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:400,easing:'ease-out'}));
  $('#线').querySelectorAll('path.边').forEach((path,i)=>{
    const length=path.getTotalLength();
    api.动画(path,[{strokeDasharray:`${length} ${length}`,strokeDashoffset:length,opacity:0},
      {strokeDasharray:`${length} ${length}`,strokeDashoffset:0,opacity:1}],
      {duration:750,delay:180+Math.min(i,8)*80,easing:'cubic-bezier(.25,.6,.3,1)',fill:'backwards'});
  });
}

function 定位展开(){
  const {展开卡, 位, 缩} = api.读取状态();
  if (!展开卡) return;
  const card = 展开卡, box = card.closest('.盒'), 台框 = $('#台').getBoundingClientRect();
  const 原x = parseFloat(card.style.left) + (box ? parseFloat(box.style.left) + box.clientLeft : 0);
  const 原y = parseFloat(card.style.top) + (box ? parseFloat(box.style.top) + box.clientTop : 0);
  const 区 = 阅读区域();
  const 宽 = Math.min(1320, 台框.width < 700 ? 台框.width - 16 : 台框.width * .9);
  const 高 = Math.max(120, 区.高);
  card.style.setProperty('--展开宽', 宽 + 'px'); card.style.setProperty('--展开高', 高 + 'px');
  const ax = 原x * 缩 + 位.x, ay = 原y * 缩 + 位.y;
  const x = (台框.width - 宽) / 2;
  const y = 区.顶 + (区.高 - card.offsetHeight) / 2;
  card.style.transform = `translate(${(x-ax)/缩}px,${(y-ay)/缩}px) scale(${1/缩})`;
  布置阅读幕(); 更新关联();
}

function 阅读区域(){
  const stage=$('#台').getBoundingClientRect();
  const 顶=Math.max(12,$('#顶').getBoundingClientRect().bottom-stage.top+14);
  const 底=Math.max(16,stage.bottom-$('#角').getBoundingClientRect().top+12);
  return {顶,底,高:Math.max(120,stage.height-顶-底)};
}

function 初始视野(){
  const {视图} = api.读取状态();
  const 首 = $('#世界').querySelector('.盒,.步,.空');
  if (!首) return;
  const 台宽 = $('#台').clientWidth;
  const 缩 = 台宽 < 700 ? .85 : .9;
  const 位 = {x:32 - (parseFloat(首.style.left)||0)*缩,y:阅读区域().顶 + (视图 === '路线' ? 86 : 16) - (parseFloat(首.style.top)||0)*缩};
  if (视图 === '路线') {
    const 标题们 = [...$('#世界').querySelectorAll('.路线标题')];
    if (标题们.length) 位.y = 阅读区域().顶 + 16 - Math.min(...标题们.map(e => parseFloat(e.style.top))) * 缩;
  }
  return {缩, 位};
}
function 导航内容(视图们){
  return '<span id="签标" aria-hidden="true"></span>' + 视图们.map(v =>
    `<button data-v="${v}"><svg class="导航图标" viewBox="0 0 24 24" aria-hidden="true">${导航图形[v]}</svg><span>${v}</span><span class="导航计数"></span></button>`).join('');
}
function 缩放外观(缩){
  document.body.classList.toggle('远', 缩 < .55);
  document.body.classList.toggle('中', 缩 >= .55 && 缩 < .8);
}
return {
  装配界面, 模板: 创建模板(api, {色, 行, 详情头}),
  布局: {卡宽, 卡高, 隙, 盒隙, 内左:22, 内顶:64, 路线起点:60, 路线间距:90, 路线标题距:66, 路线编辑距:32, 连线出口:300},
  镜头时长:460, 镜头缓动:t => 1-Math.pow(1-t,4),
  色, 导航内容, 缩放外观, 初始视野, 定位文件预览, 定位导航, 算库布局, 算路线布局,
  卡html, 行, 详情头, 停卡片动效, 卡片过渡, 布置阅读幕, 画布入场, 定位展开, 阅读区域,
};
};
