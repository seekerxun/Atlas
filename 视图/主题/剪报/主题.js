import 创建模板 from './模板.js';
/* 剪报主题：新闻纸、胶带贴片、马克笔高亮、地图红虚线，深浅两用。
   动效分两种：镜头（拖动、缩放、取景）照常顺滑；元素出场按定格动画的节奏一顿一顿地走（steps 缓动）。
   视觉在 样式.css（按 html[data-外观] 切配色），本文件负责布局、模板与动效。 */
export default function 创建主题(api){
const {$, 转义, 图后缀, 可动, 分组数据, 更新关联} = api;

const 卡宽 = 270, 卡高 = 176, 隙 = 18, 盒隙 = 48, 内左 = 22, 内顶 = 76;
const 步宽 = 280, 步距 = 84;
// 定格节奏：每帧约 83ms（12fps），出场 3~5 帧。
const 帧 = n => `steps(${n}, end)`;

// 类型 = 色相 × 形状：q 四分之一圆、c 圆、h 半圆、d 菱形、s 方块。同色相的类型形状一定不同。
const 色相们 = ['路线红','墨蓝','青绿','赭石','紫灰'], 形状们 = ['s','c','d','h','q'];
const 类型表 = {
  规范:['墨蓝','s'], 工具说明:['青绿','c'], 路线:['路线红','c'], 视图:['墨蓝','c'], 命令:['赭石','s'],
  系统:['路线红','s'], 机制:['路线红','d'], 技能:['路线红','h'], 力量体系:['路线红','q'],
  世界观:['墨蓝','d'], 世界:['墨蓝','h'], 谱痕:['墨蓝','q'],
  数值:['赭石','c'], 数据表:['赭石','d'], 道具:['赭石','h'], 异常物:['赭石','q'],
  流程:['青绿','s'], 副本:['青绿','d'], 剧情:['青绿','h'], 创意:['青绿','q'], 模板:['紫灰','s'],
  NPC:['紫灰','c'], 势力:['紫灰','d'], 总览:['紫灰','h'],
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
const 序色 = () => '路线红';
// 胶带的角度和位置按文本取哈希，同一张卡每次重绘都贴在同一处。
function 胶(种子){
  let h = 7; for (const c of String(种子)) h = (h * 33 + c.codePointAt(0)) >>> 0;
  const 角 = (h % 11) - 5, 左 = 14 + (h >> 4) % 40;
  return `<span class="胶" style="--胶角:${角}deg;--胶左:${左}%" aria-hidden="true"></span>`;
}

const 图标 = {
  工具: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  产出: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M6 10l6 6 6-6M4 21h16"/></svg>',
  箭头: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

let 签序 = -1;

function 装配界面(){
  签序 = -1;
  api.监听(window, 'resize', () => 定位导航(true));
  api.清理(() => {
    document.querySelectorAll('.卡,.步').forEach(停卡片动效);
    document.body.classList.remove('剪报阅读','远','中');
    $('#阅读幕').classList.remove('开'); $('#阅读幕').removeAttribute('style');
    $('#文件预览').style.removeProperty('--预览顶'); $('#文件预览').style.removeProperty('--预览高');
  });
  装配扫描涂划();
}

// 重新扫描：平时是一枚循环箭头；核心标 data-扫描中 时换成铅笔来回涂划的三帧循环，至少播满两轮。
function 装配扫描涂划(){
  const 钮 = $('#刷');
  if (!钮) return;
  const 原文 = 钮.textContent;
  钮.innerHTML = '<svg class="箭" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>'
    + '<svg class="涂" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path class="涂1" d="M4 15c2-3 4-7 6-5s-1 7 2 7 3-8 5-8 2 4 3 5"/>'
    + '<path class="涂2" d="M4 12c3 0 3-6 6-4s0 9 3 8 2-7 4-7 2 3 3 3"/>'
    + '<path class="涂3" d="M4 16c1-5 5-8 6-5s0 6 3 5 3-6 4-6 2 5 3 5"/></svg>';
  let 到 = 0, 计 = null;
  const 开始 = () => {
    到 = performance.now() + 750;
    钮.classList.add('涂划中');
    if (计 == null) 计 = api.循环(() => {
      if (钮.hasAttribute('data-扫描中') || performance.now() < 到) return;
      clearInterval(计); 计 = null; 钮.classList.remove('涂划中');
    }, 125);
  };
  // 扫描很快时加上和去掉属性会落在同一批记录里，所以看「曾被加上」而不是看当前状态。
  const 观 = new MutationObserver(记录 => { if (可动() && 记录.some(r => r.oldValue === null)) 开始(); });
  观.observe(钮, {attributes:true, attributeFilter:['data-扫描中'], attributeOldValue:true});
  api.清理(() => { 观.disconnect(); if (计 != null) clearInterval(计); 钮.classList.remove('涂划中'); 钮.textContent = 原文; });
}

// 分组的主色取组内最多的类型；类型小标去掉核心加的「●」，改画成对应形状。
function 装配画布(){
  const 组 = 分组数据();
  $('#世界').querySelectorAll('.盒').forEach(box => {
    const 名 = box.dataset.id.split(':').slice(2).join(':'), 计 = {};
    (组[名] || []).forEach(n => { const h = 类型形(n.类型)[0]; 计[h] = (计[h] || 0) + 1; });
    const 主色 = Object.keys(计).sort((a, b) => 计[b] - 计[a])[0] || '墨蓝';
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

// 导航是档案夹索引签：选中的一签往下一顿一顿地插进报头线。
function 定位导航(即刻){
  const 签 = $('#签'), 钮 = 签?.querySelector('button.开');
  if (!钮) return;
  const 序 = [...签.querySelectorAll('button')].indexOf(钮);
  if (可动() && !即刻 && 签序 >= 0 && 序 !== 签序)
    api.动画(钮, [{translate:'0 -10px'}, {translate:'0 3px', offset:.66}, {translate:'0 0'}], {duration:250, easing:帧(3)});
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
      if (多类) { 卡们.push({类标: 类, x: 0, y: 内y}); 内y += 30; }
      const 行卡高 = 卡高 + (类组[类].some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 50 : 0);
      类组[类].forEach((n, i) => {
        const c = i % 列, r = (i / 列) | 0;
        卡们.push({节: n, x: c * (卡宽 + 隙), y: 内y + r * (行卡高 + 隙), h: 行卡高});
      });
      内y += Math.ceil(类组[类].length / 列) * (行卡高 + 隙) + 10;
    });
    const w = 列 * (卡宽 + 隙) - 隙 + 内左 * 2, h = 内y + 内顶 + 8;
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
      const 高 = 104 + ((步[i].docs || []).length + (步[i].tools || []).length +
                      (步[i].outputs || []).length) * 28 + (步[i].note ? 84 : 0);
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
  return `${胶(n.路径)}
    <div class="卡眉">${小形(n.类型)}<span class="类型签">${转义(n.类型 || '文档')}</span>${n.编号 ? `<span class="编号">${转义(n.编号)}</span>` : ''}</div>
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
  const k = 类型 ?? 分类, 签色 = 色相 ? `var(--${色相})` : 色(k);
  return `<div class="详情头" style="--签色:${签色}"><span class="胶 左" aria-hidden="true"></span><span class="胶 右" aria-hidden="true"></span>
    <div class="详情眉">${色相 ? '' : 小形(k)}<span class="类型签">${转义(分类)}</span><span class="路">${转义(路径)}</span></div>
    <h3>${转义(标题)}</h3><button class="收起" onclick="收卡()" aria-label="收起卡片">收起 <kbd>Esc</kbd></button></div>`;
}

function 停卡片动效(card){ card?._动效清理?.(); }

// 展开是「啪」地贴上来：没有中间补间，纸页直接到位，只抖两三帧再落定，胶带最后压下；
// 收起时小卡在原位弹一下。动的是独立的 rotate/translate 属性，不碰核心写的 transform。
function 卡片过渡(card, 原框){
  if (!可动() || !原框?.width) return;
  停卡片动效(card);
  const opening = card.classList.contains('展开'), 动们 = [];
  if (opening) {
    动们.push(api.动画(card, [
      {opacity:0, rotate:'-2.2deg', translate:'-10px 14px'},
      {opacity:1, rotate:'1deg', translate:'4px -4px', offset:.5},
      {opacity:1, rotate:'-.3deg', translate:'0 1px', offset:.75},
      {opacity:1, rotate:'0deg', translate:'0 0'}], {duration:330, easing:帧(4)}));
    card.querySelectorAll('.详情头>.胶').forEach((el, i) => 动们.push(api.动画(el,
      [{opacity:0, translate:'0 -14px', scale:'1.3'}, {opacity:1, translate:'0 0', scale:'1'}],
      {duration:170, delay:260 + i * 80, easing:帧(2), fill:'backwards'})));
  } else {
    动们.push(api.动画(card, [
      {rotate:'1.6deg', translate:'0 -6px'}, {rotate:'-.6deg', translate:'0 2px', offset:.66}, {rotate:'0deg', translate:'0 0'}],
      {duration:250, easing:帧(3)}));
  }
  const cleanup = () => { 动们.forEach(a => a.cancel()); card._动效清理 = null; };
  card._动效清理 = cleanup;
  动们[0].finished.then(() => { if (card._动效清理 === cleanup) cleanup(); 更新关联(); }, () => {});
}

function 布置阅读幕(){
  const {展开卡, 位, 缩} = api.读取状态();
  const curtain = $('#阅读幕'), stage = $('#台');
  document.body.classList.toggle('剪报阅读', !!展开卡);
  curtain.classList.toggle('开', !!展开卡);
  curtain.style.cssText = `left:${-位.x/缩}px;top:${-位.y/缩}px;width:${stage.clientWidth/缩}px;height:${stage.clientHeight/缩}px;`;
}

// 切换视图：卡片按阅读顺序一张张「贴」上来，每张 4 帧；流程线逐条出现，终点钉最后按下。
function 画布入场(){
  if (!可动()) return;
  const stage = $('#台').getBoundingClientRect();
  const visible = [...$('#世界').querySelectorAll('.卡,.步,.空')].filter(el => {
    const r = el.getBoundingClientRect();
    return !el.classList.contains('展开') && r.right > stage.left && r.left < stage.right && r.bottom > stage.top && r.top < stage.bottom;
  });
  visible.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return A.top - B.top || A.left - B.left; });
  visible.forEach((el, i) => {
    // 只动 transform，不占用拖拽的 left/top 和悬停的 translate。
    el._入场动画?.cancel();
    const 偏 = i % 2 ? 1 : -1;
    el._入场动画 = api.动画(el, [
      {opacity:0, transform:`translate(${-8 * 偏}px,18px) rotate(${-3 * 偏}deg) scale(.9)`},
      {opacity:1, transform:`translate(${3 * 偏}px,-5px) rotate(${1.2 * 偏}deg) scale(1.03)`, offset:.5},
      {opacity:1, transform:`translate(0,1px) rotate(${-.4 * 偏}deg)`, offset:.75},
      {opacity:1, transform:'none'}], {duration:330, delay:Math.min(i, 12) * 83, easing:帧(4), fill:'backwards'});
  });
  $('#世界').querySelectorAll('.路线标题,.盒>.头,.编辑条').forEach(el => api.动画(el,
    [{opacity:0, transform:'translateY(-8px)'}, {opacity:1, transform:'none'}], {duration:170, easing:帧(2), fill:'backwards'}));
  const 延 = Math.min(visible.length, 12) * 83;
  $('#线').querySelectorAll('path.边').forEach((path, i) => api.动画(path,
    [{opacity:0}, {opacity:1}], {duration:84, delay:延 + i * 125, easing:帧(1), fill:'backwards'}));
  $('#线').querySelectorAll('circle').forEach((c, i) => api.动画(c,
    [{transform:'scale(0)'}, {transform:'scale(1.5)', offset:.5}, {transform:'none'}],
    {duration:250, delay:延 + 84 + i * 125, easing:帧(3), fill:'backwards'}));
}

// 同一主题内深浅切换：旧底色像被撕掉的一页，分四帧从上往下露出新外观。
function 外观变化(外观, 旧外观){
  if (!可动() || !旧外观) return;
  const 页 = document.createElement('div'); 页.className = '剪报换页'; 页.setAttribute('aria-hidden', 'true');
  页.style.background = 旧外观 === '深' ? '#151412' : '#F3EEE3';
  api.装饰(页);
  api.动画(页, [{clipPath:'polygon(0 0,100% 0,100% 100%,0 100%)'}, {clipPath:'polygon(0 100%,100% 100%,100% 100%,0 100%)'}],
    {duration:330, easing:帧(4), fill:'forwards'}).finished.then(() => 页.remove(), () => 页.remove());
}

function 定位展开(){
  const {展开卡, 位, 缩} = api.读取状态();
  if (!展开卡) return;
  const card = 展开卡, box = card.closest('.盒'), 台框 = $('#台').getBoundingClientRect();
  const 原x = parseFloat(card.style.left) + (box ? parseFloat(box.style.left) + box.clientLeft : 0);
  const 原y = parseFloat(card.style.top) + (box ? parseFloat(box.style.top) + box.clientTop : 0);
  const 区 = 阅读区域();
  const 宽 = Math.min(1180, 台框.width < 700 ? 台框.width - 16 : 台框.width * .86);
  const 高 = Math.max(120, 区.高);
  card.style.setProperty('--展开宽', 宽 + 'px'); card.style.setProperty('--展开高', 高 + 'px');
  const ax = 原x * 缩 + 位.x, ay = 原y * 缩 + 位.y;
  const x = (台框.width - 宽) / 2;
  const y = 区.顶 + (区.高 - card.offsetHeight) / 2;
  card.style.transform = `translate(${(x-ax)/缩}px,${(y-ay)/缩}px) scale(${1/缩})`;
  布置阅读幕(); 更新关联();
}

function 阅读区域(){
  const stage = $('#台').getBoundingClientRect();
  const 顶 = Math.max(12, $('#顶').getBoundingClientRect().bottom - stage.top + 20);
  const 底 = Math.max(16, stage.bottom - $('#角').getBoundingClientRect().top + 16);
  return {顶, 底, 高:Math.max(120, stage.height - 顶 - 底)};
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
  return 视图们.map(v => `<button data-v="${v}"><span>${v}</span><span class="导航计数"></span></button>`).join('');
}

function 缩放外观(缩){
  document.body.classList.toggle('远', 缩 < .55);
  document.body.classList.toggle('中', 缩 >= .55 && 缩 < .8);
}

const 模板 = 创建模板(api, {色, 上, 形, 小形, 行, 详情头, 图标, 序色, 胶});
return {
  装配界面, 装配画布, 外观变化, 模板,
  布局: {卡宽, 卡高, 隙, 盒隙, 内左, 内顶, 路线起点:60, 路线间距:120, 路线标题距:112, 路线编辑距:48, 连线出口:步宽},
  // 镜头保持顺滑：只有元素出场是定格的。
  镜头时长:460, 镜头缓动:t => 1-Math.pow(1-t,4),
  色, 导航内容, 缩放外观, 初始视野, 定位文件预览, 定位导航, 算库布局, 算路线布局,
  卡html, 行, 详情头, 停卡片动效, 卡片过渡, 布置阅读幕, 画布入场, 定位展开, 阅读区域,
};
};
