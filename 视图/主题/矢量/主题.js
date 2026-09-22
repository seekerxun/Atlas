import 创建模板 from './模板.js';
/* 矢量主题：大地色块、简洁几何形、弹性形状动画，深浅两用。
   视觉在 样式.css（按 html[data-外观] 切配色），本文件负责布局、模板与动效。 */
export default function 创建主题(api){
const {$, 转义, 图后缀, 可动, 分组数据, 更新关联} = api;

const 卡宽 = 260, 卡高 = 172, 隙 = 14, 盒隙 = 40, 内左 = 20, 内顶 = 70;
const 步宽 = 240, 步距 = 90;
const 弹 = 'cubic-bezier(.34,1.56,.64,1)', 顺 = 'cubic-bezier(.2,.8,.3,1)';

// 类型 = 色相 × 形状：q 四分之一圆、c 圆、h 半圆、d 菱形、s 方块。同色相的类型形状一定不同。
const 色相们 = ['陶土','靛蓝','赭黄','橄榄','烟粉'], 形状们 = ['q','c','h','d','s'];
const 类型表 = {
  系统:['陶土','q'], 机制:['陶土','c'], 技能:['陶土','h'], 力量体系:['陶土','d'], 工具说明:['陶土','s'],
  规范:['靛蓝','q'], 世界观:['靛蓝','c'], 世界:['靛蓝','h'], 谱痕:['靛蓝','d'], 视图:['靛蓝','s'],
  数值:['赭黄','q'], 数据表:['赭黄','c'], 道具:['赭黄','h'], 异常物:['赭黄','d'], 命令:['赭黄','s'],
  流程:['橄榄','q'], 副本:['橄榄','c'], 剧情:['橄榄','h'], 创意:['橄榄','d'], 模板:['橄榄','s'],
  NPC:['烟粉','q'], 势力:['烟粉','c'], 总览:['烟粉','h'], 路线:['陶土','c'],
};
function 类型形(k){
  const 名 = String(k || '总览');
  if (类型表[名]) return 类型表[名];
  let hash = 0; for (const c of 名) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return [色相们[hash % 5], 形状们[((hash / 5) | 0) % 5]];
}
const 色 = k => `var(--${类型形(k)[0]})`;
const 上 = k => `var(--上-${类型形(k)[0]})`;
const 形 = k => 类型形(k)[1];
const 小形 = k => `<span class="小形 形-${形(k)}" style="--形色:${色(k)}" aria-hidden="true"></span>`;
const 序色 = i => 色相们[i % 5];

const 图标 = {
  工具: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  产出: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
  箭头: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};
const 导航图形 = {
  '路线':'<circle cx="3.5" cy="3.5" r="2.5"/><circle cx="12.5" cy="12.5" r="2.5"/><path class="描" d="M3.5 6v2.5a3 3 0 0 0 3 3h3"/>',
  '策划':'<rect x="2" y="2" width="12" height="12" rx="3"/>',
  '内容':'<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="2.75"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="2.75"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5"/>',
  '创意':'<path d="M8 2 14.5 13.5h-13z"/>',
  '资产':'<path d="M2 14V8a6 6 0 0 1 12 0v6z"/>'
};

let 签序 = -1;

function 装配界面(){
  签序 = -1;
  api.监听(window, 'resize', () => 定位导航(true));
  api.清理(() => {
    document.querySelectorAll('.卡,.步').forEach(停卡片动效);
    document.body.classList.remove('矢量阅读','远','中');
    $('#阅读幕').classList.remove('开'); $('#阅读幕').removeAttribute('style');
    $('#文件预览').style.removeProperty('--预览顶'); $('#文件预览').style.removeProperty('--预览高');
  });
}

// 分组底色取组内最多的类型的色相；类型小标去掉核心加的「●」，改画成对应形状。
function 装配画布(){
  const 组 = 分组数据();
  $('#世界').querySelectorAll('.盒').forEach(box => {
    const 名 = box.dataset.id.split(':').slice(2).join(':'), 计 = {};
    (组[名] || []).forEach(n => { const h = 类型形(n.类型)[0]; 计[h] = (计[h] || 0) + 1; });
    const 主色 = Object.keys(计).sort((a, b) => 计[b] - 计[a])[0] || '靛蓝';
    box.style.setProperty('--组色', `var(--${主色})`); box.style.setProperty('--组上', `var(--上-${主色})`);
    box.querySelectorAll(':scope>.类标').forEach(el => {
      const 类型 = el.textContent.replace(/^\s*●\s*/, '').trim();
      el.textContent = 类型; el.style.color = '';
      el.insertAdjacentHTML('afterbegin', 小形(类型));
    });
  });
}

function 定位文件预览(){
  const 区 = 阅读区域();
  $('#文件预览').style.setProperty('--预览高', 区.高 + 'px');
  $('#文件预览').style.setProperty('--预览顶', 区.顶 + 'px');
}

// 导航色块：前沿先走、后沿晚 110ms 跟上，落位回弹，形成先拉长再收拢的形变。
function 定位导航(即刻){
  const 签 = $('#签'), 块 = 签?.querySelector('.签块'), 钮 = 签?.querySelector('button.开');
  if (!块 || !钮) return;
  const 序 = [...签.querySelectorAll('button')].indexOf(钮);
  const 左 = 钮.offsetLeft, 右 = 签.clientWidth - 钮.offsetLeft - 钮.offsetWidth;
  const 动 = 可动() && !即刻 && 签序 >= 0 && 序 !== 签序;
  const 向右 = 序 > 签序;
  块.style.transition = 动
    ? `${向右 ? 'right' : 'left'} .5s ${弹}, ${向右 ? 'left' : 'right'} .5s ${弹} .11s, background-color .3s`
    : 'none';
  块.style.left = 左 + 'px'; 块.style.right = 右 + 'px';
  签序 = 序;
}

function 算库布局(){
  const {视图, 布局} = api.读取状态();
  const 盒 = 分组数据(), 结果 = [];
  let x = 40, y = 40, 行高 = 0;
  // 窄屏单列、分组纵向堆叠；位置键不变，用户拖过的位置照旧生效。
  const 窄 = $('#台').clientWidth < 700;
  const 限宽 = 窄 ? 400 : 2400;
  Object.keys(盒).sort((a, b) => 盒[b].length - 盒[a].length).forEach(名 => {
    const ns = 盒[名].slice().sort((a, b) =>
      (a.类型 + a.标题).localeCompare(b.类型 + b.标题, 'zh'));
    const 类组 = {}; ns.forEach(n => (类组[n.类型 || '?'] ??= []).push(n));
    const 多类 = Object.keys(类组).length > 1;
    const 列 = 窄 ? 1 : Math.min(3, Math.max(2, Math.ceil(Math.sqrt(ns.length))));
    let 内y = 0; const 卡们 = [];
    Object.keys(类组).forEach(类 => {
      // 组内只有一种类型时不再单列类型小标，分组头已经说明。
      if (多类) { 卡们.push({类标: 类, x: 0, y: 内y}); 内y += 28; }
      const 行卡高 = 卡高 + (类组[类].some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 50 : 0);
      类组[类].forEach((n, i) => {
        const c = i % 列, r = (i / 列) | 0;
        卡们.push({节: n, x: c * (卡宽 + 隙), y: 内y + r * (行卡高 + 隙), h: 行卡高});
      });
      内y += Math.ceil(类组[类].length / 列) * (行卡高 + 隙) + 8;
    });
    const w = 列 * (卡宽 + 隙) - 隙 + 内左 * 2, h = 内y + 内顶 + 6;
    if (x + w > 限宽 && x > 40) { x = 40; y += 行高 + 盒隙; 行高 = 0; }
    const id = `盒:${视图}:${名}`;
    const p = {...(布局[id] || {x, y})};
    // 卡片尺寸与其他主题不同，旧布局可能相交；只调整显示位置，不覆盖用户保存的布局。
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
      const 高 = 112 + ((步[i].docs || []).length + (步[i].tools || []).length +
                      (步[i].outputs || []).length) * 26 + (步[i].note ? 96 : 0);
      const id = `步:${r.名称}:${步[i].id}`;
      const p = {...(布局[id] || {x: 40 + d * (步宽 + 步距), y: 基y + y})};
      p.y = Math.max(基y + 40, p.y);
      for (let 次 = 0; 次 <= 步.length; 次++) {
        const 撞 = 位置.find(b => b && p.x < b.x+步宽+32 && p.x+步宽+32 > b.x && p.y < b.y+b.h+32 && p.y+高+32 > b.y);
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
  return `<span class="角 形-${形(n.类型)}" aria-hidden="true"></span>
    <div class="卡眉"><span class="类型签" style="--上:${上(n.类型)}">${转义(n.类型 || '文档')}</span>${n.编号 ? `<span class="编号">${转义(n.编号)}</span>` : ''}</div>
    <h4>${转义(n.标题 || n.名称)}</h4>
    ${n.摘要 ? `<div class="要">${转义(n.摘要)}</div>` : ''}
    ${图.length ? `<div class="图条">${图.map(a =>
      `<img loading="lazy" alt="" src="/文件/${转义(encodeURI(a))}">`).join('')}</div>` : ''}
    <div class="脚">
      ${n.状态 ? 模板.状态签(n.状态) : ''}
      ${(n.被引用 || []).length ? `<span class="小丸 引">被引 ${n.被引用.length}</span>` : ''}
      ${(n.资产展开 || []).length ? `<span class="小丸 图">${n.资产展开.length} 图</span>` : ''}
      ${(n.路线 || []).length ? `<span class="小丸 路">${转义(n.路线[0])}</span>` : ''}
    </div>`;
}

function 行(文, 尾, 点击, 类型, 图){
  return `<div class="行" ${点击 ? `onclick="${点击}"` : ''}>
    ${图 ? `<span class="图标">${图}</span>` : 类型 !== undefined && 类型 !== null ? 小形(类型) : ''}
    <span>${转义(文)}</span>${尾 ? `<span class="尾">${转义(尾)}</span>` : ''}</div>`;
}

function 详情头(标题, 分类, 路径, 类型, 色相){
  const k = 类型 ?? 分类, 签色 = 色相 ? `var(--${色相})` : 色(k), 签上 = 色相 ? `var(--上-${色相})` : 上(k);
  return `<div class="详情头" style="--签色:${签色};--上:${签上}"><span class="类型签">${转义(分类)}</span><h3>${转义(标题)}</h3><div class="路">${转义(路径)}</div><button class="收起" onclick="收卡()" aria-label="收起卡片">收起 <kbd>Esc</kbd></button></div>`;
}

function 停卡片动效(card){ card?._动效清理?.(); }

// 展开：一片与卡片同形的色面从卡片位置弹性撑开到阅读面板，角形同步长大；收起反向、不回弹。
function 卡片过渡(card, 原框){
  if (!可动() || !原框?.width) return;
  const 终框 = card.getBoundingClientRect();
  if (!终框.width || !终框.height) return;
  const opening = card.classList.contains('展开'), duration = opening ? 460 : 240;
  const shell = document.createElement('div'); shell.className = '矢量过渡片';
  shell.setAttribute('aria-hidden','true'); shell.inert = true;
  const 色值 = card.querySelector(':scope>.序 .序号')?.style.getPropertyValue('--序色') || getComputedStyle(card).getPropertyValue('--卡色');
  shell.style.cssText = `left:${终框.left}px;top:${终框.top}px;width:${终框.width}px;height:${终框.height}px;--卡色:${色值};`;
  shell.innerHTML = '<span></span>';
  api.装饰(shell); card._过渡壳 = shell;
  const sx = 原框.width / 终框.width, sy = 原框.height / 终框.height;
  const start = `translate(${原框.left-终框.left}px,${原框.top-终框.top}px) scale(${sx},${sy})`;
  const ease = opening ? 'cubic-bezier(.34,1.25,.64,1)' : 'cubic-bezier(.4,0,.2,1)';
  const animations = [];
  const move = api.动画(shell, [{transform:start},{transform:'none'}], {duration, easing:ease});
  animations.push(move, api.动画(shell,[{opacity:1,offset:0},{opacity:1,offset:.6},{opacity:0,offset:1}],{duration,fill:'forwards'}));
  // 角形反向补偿缩放，色面拉伸时它仍是正圆的四分之一。
  animations.push(api.动画(shell.firstChild, [{transform:`scale(${1/sx},${1/sy})`},{transform:'none'}], {duration, easing:ease}));
  animations.push(api.动画(card,[{opacity:0,offset:0},{opacity:0,offset:.5},{opacity:1,offset:1}],{duration,easing:'ease-out'}));
  if (opening) {
    card.querySelectorAll('.详情头,.详情体').forEach((el,i) => animations.push(api.动画(el,
      [{opacity:0,transform:`translateY(${i ? 14 : 8}px)`},{opacity:1,transform:'none'}],
      {duration:240,delay:180+i*50,easing:顺,fill:'backwards'})));
  }
  const cleanup = () => { animations.forEach(a => a.cancel()); shell.remove(); card._过渡壳=null; card._动效清理=null; };
  card._展开动画=move; card._动效清理=cleanup;
  move.finished.then(() => { cleanup(); 更新关联(); }, () => {});
}

function 布置阅读幕(){
  const {展开卡, 位, 缩} = api.读取状态();
  const curtain=$('#阅读幕'), stage=$('#台');
  document.body.classList.toggle('矢量阅读',!!展开卡);
  curtain.classList.toggle('开',!!展开卡);
  curtain.style.cssText=`left:${-位.x/缩}px;top:${-位.y/缩}px;width:${stage.clientWidth/缩}px;height:${stage.clientHeight/缩}px;`;
}

// 切换视图：卡片依次弹入，角形稍晚转入；连线逐条画出，终点圆点弹出。
function 画布入场(){
  if (!可动()) return;
  const 延 = 0;
  const stage=$('#台').getBoundingClientRect();
  const visible=[...$('#世界').querySelectorAll('.卡,.步,.空')].filter(el=>{
    const r=el.getBoundingClientRect();return !el.classList.contains('展开') && r.right>stage.left && r.left<stage.right && r.bottom>stage.top && r.top<stage.bottom;
  });
  visible.sort((a,b)=>{const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();return A.top-B.top||A.left-B.left;});
  visible.forEach((el,i)=>{
    // 弹入只动 transform，不占用拖拽的 left/top 和悬停的 translate。
    el._入场动画?.cancel();
    const d = 延 + Math.min(i,10)*45;
    el._入场动画=api.动画(el,[{opacity:0,transform:'translateY(24px) scale(.72)'},{opacity:1,transform:'translateY(-4px) scale(1.04)',offset:.6},{transform:'translateY(1px) scale(.99)',offset:.8},{opacity:1,transform:'none'}],
      {duration:620,delay:d,easing:顺,fill:'backwards'});
    const 角 = el.querySelector(':scope>.角');
    if (角) api.动画(角,[{transform:'scale(0) rotate(-120deg)'},{transform:'scale(1.15) rotate(8deg)',offset:.7},{transform:'none'}],
      {duration:520,delay:d+180,easing:顺,fill:'backwards'});
  });
  $('#世界').querySelectorAll('.路线标题,.盒>.头,.编辑条').forEach(el=>api.动画(el,
    [{opacity:0,transform:'translateY(10px) scale(.96)'},{opacity:1,transform:'none'}],{duration:420,delay:延,easing:顺,fill:'backwards'}));
  $('#线').querySelectorAll('path.边').forEach((path,i)=>{
    const length=path.getTotalLength();
    api.动画(path,[{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},
      {strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],
      {duration:600,delay:延+220+Math.min(i,8)*70,easing:'cubic-bezier(.25,.6,.3,1)',fill:'backwards'});
  });
  $('#线').querySelectorAll('circle').forEach((c,i)=>api.动画(c,[{transform:'scale(0)'},{transform:'scale(1.3)',offset:.7},{transform:'none'}],
    {duration:360,delay:延+700+Math.min(i,8)*70,easing:顺,fill:'backwards'}));
}

// 同一主题内深浅切换：新外观从主题下拉处圆形展开，旧底色被推出画面。
function 外观变化(外观, 旧外观){
  if (!可动() || !旧外观) return;
  const 旧底 = 旧外观 === '深' ? '#1A1815' : '#F1ECE4';
  const 框 = $('#主题选择')?.getBoundingClientRect();
  const x = 框 ? 框.left + 框.width / 2 : innerWidth, y = 框 ? 框.top + 框.height / 2 : 0;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const 圈 = document.createElement('div'); 圈.className = '矢量外观圈'; 圈.setAttribute('aria-hidden', 'true');
  圈.style.cssText = `left:${x}px;top:${y}px;box-shadow:0 0 0 ${R * 2}px ${旧底};`;
  api.装饰(圈);
  api.动画(圈, [{width:'0px',height:'0px'},{width:`${R * 2}px`,height:`${R * 2}px`}], {duration:560, easing:'cubic-bezier(.65,0,.35,1)', fill:'forwards'})
    .finished.then(() => 圈.remove(), () => 圈.remove());
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
  const 顶=Math.max(12,$('#顶').getBoundingClientRect().bottom-stage.top+16);
  const 底=Math.max(16,stage.bottom-$('#角').getBoundingClientRect().top+14);
  return {顶,底,高:Math.max(120,stage.height-顶-底)};
}

function 初始视野(){
  const {视图} = api.读取状态();
  const 首 = $('#世界').querySelector('.盒,.步,.空');
  if (!首) return;
  const 台宽 = $('#台').clientWidth;
  const 缩 = 台宽 < 700 ? .85 : .9;
  const 顶 = 阅读区域().顶 + 12;
  const 位 = {x:24 - (parseFloat(首.style.left)||0)*缩, y:顶 - (parseFloat(首.style.top)||0)*缩};
  if (视图 === '路线') {
    const 标题们 = [...$('#世界').querySelectorAll('.路线标题')];
    if (标题们.length) 位.y = 顶 - Math.min(...标题们.map(e => parseFloat(e.style.top))) * 缩;
  }
  return {缩, 位};
}

function 导航内容(视图们){
  return '<span class="签块" aria-hidden="true"></span>' + 视图们.map(v =>
    `<button data-v="${v}"><svg class="导航图标" viewBox="0 0 16 16" aria-hidden="true">${导航图形[v]}</svg><span>${v}</span><span class="导航计数"></span></button>`).join('');
}

function 缩放外观(缩){
  document.body.classList.toggle('远', 缩 < .55);
  document.body.classList.toggle('中', 缩 >= .55 && 缩 < .8);
}

const 模板 = 创建模板(api, {色, 上, 形, 小形, 行, 详情头, 图标, 序色});
return {
  装配界面, 装配画布, 外观变化, 模板,
  布局: {卡宽, 卡高, 隙, 盒隙, 内左, 内顶, 路线起点:60, 路线间距:110, 路线标题距:100, 路线编辑距:44, 连线出口:步宽},
  镜头时长:460, 镜头缓动:t => 1-Math.pow(1-t,4),
  色, 导航内容, 缩放外观, 初始视野, 定位文件预览, 定位导航, 算库布局, 算路线布局,
  卡html, 行, 详情头, 停卡片动效, 卡片过渡, 布置阅读幕, 画布入场, 定位展开, 阅读区域,
};
};
