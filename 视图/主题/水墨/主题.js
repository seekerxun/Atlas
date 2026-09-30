import 创建模板 from './模板.js';
/* 水墨主题：宣纸打底、墨分浓淡，五种传统颜料配五种印形区分类型，只做浅色。
   动效是墨在纸上晕开：元素从模糊收拢成字，不回弹。
   视觉在 样式.css，本文件负责布局、模板与动效。 */
export default function 创建主题(api){
const {$, 转义, 图后缀, 可动, 分组数据, 更新关联} = api;

const 卡宽 = 256, 卡高 = 164, 隙 = 20, 盒隙 = 64, 内左 = 28, 内顶 = 84;
const 步宽 = 240, 步距 = 90;
const 缓 = 'cubic-bezier(.25,.7,.3,1)';

// 类型 = 颜料 × 印形：s 方印、c 圆印、d 菱印、h 长印、q 葫芦印。同色的类型印形一定不同。
const 颜料们 = ['朱砂','石青','石绿','赭石','藤黄'], 印形们 = ['s','c','d','h','q'];
const 类型表 = {
  路线:['朱砂','c'], 系统:['朱砂','s'], 机制:['朱砂','d'], 技能:['朱砂','h'], 力量体系:['朱砂','q'],
  规范:['石青','s'], 视图:['石青','c'], 世界观:['石青','d'], 世界:['石青','h'], 谱痕:['石青','q'],
  流程:['石绿','s'], 工具说明:['石绿','c'], 副本:['石绿','d'], 剧情:['石绿','h'], 创意:['石绿','q'],
  命令:['赭石','s'], 数值:['赭石','c'], 数据表:['赭石','d'], 道具:['赭石','h'], 异常物:['赭石','q'],
  模板:['藤黄','s'], NPC:['藤黄','c'], 势力:['藤黄','d'], 总览:['藤黄','h'],
};
function 类型印(k){
  const 名 = String(k || '总览');
  if (类型表[名]) return 类型表[名];
  let hash = 0; for (const c of 名) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return [颜料们[hash % 5], 印形们[((hash / 5) | 0) % 5]];
}
const 色 = k => `var(--${类型印(k)[0]})`;

// 印：颜料色的印面，中间留一个纸色的类型首字，边上几粒纸色斑点像印泥没吃满。
const 印面 = {
  s: '<path d="M2.4 2.7 21.5 2.2 21.9 21.4 2.1 21.8Z"/>',
  c: '<circle cx="12" cy="12" r="10.6"/>',
  d: '<path d="M12 .7 23.3 12 12 23.3 .7 12Z"/>',
  h: '<ellipse cx="12" cy="12" rx="8.3" ry="11.3"/>',
  q: '<circle cx="12" cy="6.7" r="5.1"/><circle cx="12" cy="16.2" r="7.4"/><path d="M9.6 9h4.8v4H9.6Z"/>',
};
const 印字 = {s:[12.3,13.5], c:[12.3,13.5], d:[12.3,10], h:[12.3,12], q:[16.5,9.5]};
const 印斑 = '<g class="斑"><circle cx="6.2" cy="17.4" r=".75"/><circle cx="17.6" cy="6.3" r=".55"/><path d="M14.6 18.6h3.2v.7h-3.2Z"/></g>';
function 印(类型, 字){
  const [颜料, 形] = 类型印(类型);
  const 文 = 字 ?? String(类型 || '文').trim()[0] ?? '文';
  const [y, 号] = 印字[形];
  return `<svg class="印 印-${形}" viewBox="0 0 24 24" style="--印色:var(--${颜料})" aria-hidden="true"><g class="印面">${印面[形]}</g><text x="12" y="${y}" font-size="${号}">${转义(文)}</text>${印斑}</svg>`;
}
const 数字 = '一二三四五六七八九';
function 汉数(n){
  if (n < 10) return 数字[n - 1] || '〇';
  if (n < 20) return '十' + (n % 10 ? 数字[n % 10 - 1] : '');
  if (n < 100) return 数字[((n / 10) | 0) - 1] + '十' + (n % 10 ? 数字[n % 10 - 1] : '');
  return String(n);
}

const 线 = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
const 图标 = {
  工具: `<svg viewBox="0 0 24 24" aria-hidden="true" ${线}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>`,
  产出: `<svg viewBox="0 0 24 24" aria-hidden="true" ${线}><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>`,
  箭头: `<svg viewBox="0 0 24 24" aria-hidden="true" ${线}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  复制: `<svg viewBox="0 0 24 24" aria-hidden="true" ${线}><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>`,
  原文: `<svg viewBox="0 0 24 24" aria-hidden="true" ${线}><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v6H4V6h6"/></svg>`,
};

let 签序 = -1;

function 装配界面(){
  签序 = -1;
  api.监听(window, 'resize', () => 定位导航(true));
  api.清理(() => {
    document.querySelectorAll('.卡,.步').forEach(停卡片动效);
    document.body.classList.remove('水墨阅读','远','中');
    $('#阅读幕').classList.remove('开'); $('#阅读幕').removeAttribute('style');
    $('#文件预览').style.removeProperty('--预览顶'); $('#文件预览').style.removeProperty('--预览高');
  });
  装配扫描转圈();
}

// 重新扫描：换成居中的线描箭头；核心每次扫描都标 data-扫描中，箭头就转一整圈，扫描没完就接着转。
function 装配扫描转圈(){
  const 钮 = $('#刷');
  if (!钮) return;
  const 原文 = 钮.textContent;
  钮.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11a7 7 0 1 0-2 5"/><path d="M19 5v6h-6"/></svg>';
  const 箭 = 钮.firstChild;
  let 转 = null;
  const 一圈 = () => {
    转 = api.动画(箭, [{rotate:'0deg'}, {rotate:'360deg'}], {duration:760, easing:'cubic-bezier(.45,0,.35,1)'});
    转.finished.then(() => { 转 = null; if (钮.hasAttribute('data-扫描中') && 可动()) 一圈(); }, () => {});
  };
  // 扫描很快时加上和去掉属性会落在同一批记录里，所以看「曾被加上」而不是看当前状态。
  const 观 = new MutationObserver(记录 => { if (!转 && 可动() && 记录.some(r => r.oldValue === null)) 一圈(); });
  观.observe(钮, {attributes:true, attributeFilter:['data-扫描中'], attributeOldValue:true});
  api.清理(() => { 观.disconnect(); 转?.cancel(); 钮.textContent = 原文; });
}

// 类型小标去掉核心加的「●」，改盖对应的印。
function 装配画布(){
  $('#世界').querySelectorAll('.盒>.类标').forEach(el => {
    const 类型 = el.textContent.replace(/^\s*●\s*/, '').trim();
    el.textContent = 类型; el.style.color = '';
    el.insertAdjacentHTML('afterbegin', 印(类型));
  });
}

function 定位文件预览(){
  const 区 = 阅读区域();
  $('#文件预览').style.setProperty('--预览高', 区.高 + 'px');
  $('#文件预览').style.setProperty('--预览顶', 区.顶 + 'px');
}

// 导航的墨块像一笔拖过去：前沿先走，后沿晚 90ms 跟上，不回弹。
function 定位导航(即刻){
  const 签 = $('#签'), 块 = 签?.querySelector('.签块'), 钮 = 签?.querySelector('button.开');
  if (!块 || !钮) return;
  const 序 = [...签.querySelectorAll('button')].indexOf(钮);
  const 左 = 钮.offsetLeft, 右 = 签.clientWidth - 钮.offsetLeft - 钮.offsetWidth;
  const 动 = 可动() && !即刻 && 签序 >= 0 && 序 !== 签序;
  const 向右 = 序 > 签序;
  块.style.transition = 动
    ? `${向右 ? 'right' : 'left'} .42s ${缓}, ${向右 ? 'left' : 'right'} .42s ${缓} .09s`
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
      if (多类) { 卡们.push({类标: 类, x: 0, y: 内y}); 内y += 32; }
      const 行卡高 = 卡高 + (类组[类].some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 50 : 0);
      类组[类].forEach((n, i) => {
        const c = i % 列, r = (i / 列) | 0;
        卡们.push({节: n, x: c * (卡宽 + 隙), y: 内y + r * (行卡高 + 隙), h: 行卡高});
      });
      内y += Math.ceil(类组[类].length / 列) * (行卡高 + 隙) + 12;
    });
    const w = 列 * (卡宽 + 隙) - 隙 + 内左 * 2, h = 内y + 内顶 + 16;
    if (x + w > 限宽 && x > 40) { x = 40; y += 行高 + 盒隙; 行高 = 0; }
    const id = `盒:${视图}:${名}`;
    结果.push({id, 名, 数: ns.length, x, y, w, h, 卡们, 存: 布局[id]});
    x += w + 盒隙; 行高 = Math.max(行高, h);
  });
  // 用户拖过的分组原样放在保存的位置，不做避让，否则切换导航重绘后会被挤开。
  // 没拖过的分组按自动排列落位，撞上已放好的分组就往右让。
  const 已放 = 结果.filter(b => b.存).map(b => Object.assign(b, {x: b.存.x, y: b.存.y}));
  结果.filter(b => !b.存).forEach(b => {
    for (let 次 = 0; 次 <= 已放.length; 次++) {
      const 撞 = 已放.find(o => b.x < o.x+o.w+盒隙 && b.x+b.w+盒隙 > o.x && b.y < o.y+o.h+盒隙 && b.y+b.h+盒隙 > o.y);
      if (!撞) break;
      b.x = 撞.x + 撞.w + 盒隙;
    }
    已放.push(b);
  });
  结果.forEach(b => delete b.存);
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
    // 相邻的列上下错开半个身位，一条路线读起来像一行起伏的字。
    let y = 40 + (d % 2) * 36;
    列[d].forEach(i => {
      const 高 = 104 + ((步[i].docs || []).length + (步[i].tools || []).length +
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
  return `<div class="卡眉">${印(n.类型)}<span class="类型名">${转义(n.类型 || '文档')}</span>${n.编号 ? `<span class="编号">${转义(n.编号)}</span>` : ''}${n.行数 == null ? '' : `<span class="篇幅">${n.行数} 行</span>`}</div>
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
    ${图 ? `<span class="图标">${图}</span>` : 类型 !== undefined && 类型 !== null ? 印(类型) : ''}
    <span>${转义(文)}</span>${尾 ? `<span class="尾">${转义(尾)}</span>` : ''}</div>`;
}

// 详情头：左边一枚大印，右上一个圆的收起钮；步骤的印是朱砂圆印里写序号。
function 详情头(标题, 分类, 路径, 类型, 印中字){
  return `<div class="详情头" style="--签色:${色(类型 ?? 分类)}">${印(类型 ?? 分类, 印中字)}
    <div class="详情题"><div class="路"><span class="类型名">${转义(分类)}</span>${转义(路径)}</div><h3>${转义(标题)}</h3></div>
    <button class="收起" onclick="收卡()" aria-label="收起卡片"><svg viewBox="0 0 24 24" aria-hidden="true" ${线}><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
}

function 停卡片动效(card){ card?._动效清理?.(); }

// 展开：原卡处落下一团淡墨向外洇开，阅读卡从模糊收拢成字；收起时小卡同样一晕。不回弹。
function 卡片过渡(card, 原框){
  if (!可动() || !原框?.width) return;
  const 终框 = card.getBoundingClientRect();
  if (!终框.width || !终框.height) return;
  停卡片动效(card);
  const opening = card.classList.contains('展开');
  const 动们 = [];
  const 团 = document.createElement('div'); 团.className = '水墨晕团';
  团.setAttribute('aria-hidden', 'true');
  const 心 = opening ? 原框 : 终框, 边 = Math.max(心.width, 心.height);
  团.style.cssText = `left:${心.left + 心.width / 2 - 边 / 2}px;top:${心.top + 心.height / 2 - 边 / 2}px;width:${边}px;height:${边}px;`;
  api.装饰(团);
  动们.push(api.动画(团, [{opacity:.55, transform:'scale(.6)'}, {opacity:0, transform:`scale(${opening ? 3.2 : 1.8})`}],
    {duration:opening ? 620 : 420, easing:'cubic-bezier(.2,.6,.3,1)', fill:'forwards'}));
  if (opening) {
    动们.push(api.动画(card, [{opacity:0, filter:'blur(12px)'}, {opacity:.75, filter:'blur(4px)', offset:.45}, {opacity:1, filter:'blur(0px)'}],
      {duration:420, easing:缓}));
    card.querySelectorAll('.详情头,.详情体').forEach((el, i) => 动们.push(api.动画(el,
      [{opacity:0, transform:`translateY(${i ? 10 : 6}px)`}, {opacity:1, transform:'none'}],
      {duration:260, delay:160 + i * 60, easing:缓, fill:'backwards'})));
  } else {
    动们.push(api.动画(card, [{opacity:.15, filter:'blur(6px)'}, {opacity:1, filter:'blur(0px)'}], {duration:320, easing:缓}));
  }
  const cleanup = () => { 动们.forEach(a => a.cancel()); 团.remove(); card._动效清理 = null; };
  card._动效清理 = cleanup;
  动们[1].finished.then(() => { cleanup(); 更新关联(); }, () => {});
}

function 布置阅读幕(){
  const {展开卡, 位, 缩} = api.读取状态();
  const curtain = $('#阅读幕'), stage = $('#台');
  document.body.classList.toggle('水墨阅读', !!展开卡);
  curtain.classList.toggle('开', !!展开卡);
  curtain.style.cssText = `left:${-位.x/缩}px;top:${-位.y/缩}px;width:${stage.clientWidth/缩}px;height:${stage.clientHeight/缩}px;`;
}

// 切换视图：卡片像墨落纸，从一团模糊依次收拢成字；连线一笔笔写出，终点墨点随后落下。
function 画布入场(){
  if (!可动()) return;
  const stage = $('#台').getBoundingClientRect();
  const visible = [...$('#世界').querySelectorAll('.卡,.步,.空')].filter(el => {
    const r = el.getBoundingClientRect();
    return !el.classList.contains('展开') && r.right > stage.left && r.left < stage.right && r.bottom > stage.top && r.top < stage.bottom;
  });
  visible.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return A.top - B.top || A.left - B.left; });
  visible.forEach((el, i) => {
    el._入场动画?.cancel();
    // 模糊很吃性能，只给前 40 张；其余只淡入。
    const 帧们 = i < 40
      ? [{opacity:0, filter:'blur(9px)', transform:'scale(1.05)'}, {opacity:.6, filter:'blur(3px)', offset:.4}, {opacity:1, filter:'blur(0px)', transform:'none'}]
      : [{opacity:0}, {opacity:1}];
    el._入场动画 = api.动画(el, 帧们, {duration:440, delay:Math.min(i, 12) * 40, easing:缓, fill:'backwards'});
  });
  $('#世界').querySelectorAll('.路线标题,.盒>.头,.编辑条').forEach(el => api.动画(el,
    [{opacity:0, filter:'blur(6px)'}, {opacity:1, filter:'blur(0px)'}], {duration:420, easing:缓, fill:'backwards'}));
  $('#线').querySelectorAll('path.边').forEach((path, i) => {
    const length = path.getTotalLength();
    api.动画(path, [{strokeDasharray:`${length} ${length}`, strokeDashoffset:length},
      {strokeDasharray:`${length} ${length}`, strokeDashoffset:0}],
      {duration:560, delay:260 + Math.min(i, 8) * 80, easing:'cubic-bezier(.5,0,.3,1)', fill:'backwards'});
  });
  $('#线').querySelectorAll('circle').forEach((c, i) => api.动画(c, [{opacity:0, transform:'scale(.2)'}, {opacity:1, transform:'none'}],
    {duration:260, delay:780 + Math.min(i, 8) * 80, easing:缓, fill:'backwards'}));
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
  const 顶 = Math.max(12, $('#顶').getBoundingClientRect().bottom - stage.top + 16);
  const 底 = Math.max(16, stage.bottom - $('#角').getBoundingClientRect().top + 14);
  return {顶, 底, 高:Math.max(120, stage.height - 顶 - 底)};
}

function 初始视野(){
  const {视图} = api.读取状态();
  const 首 = $('#世界').querySelector('.盒,.步,.空');
  if (!首) return;
  const 台宽 = $('#台').clientWidth;
  const 缩 = 台宽 < 700 ? .85 : .9;
  const 顶 = 阅读区域().顶 + 12;
  // 左边留出竖写的视图名。
  const 左 = 台宽 < 700 ? 16 : 120;
  const 位 = {x:左 - (parseFloat(首.style.left)||0)*缩, y:顶 - (parseFloat(首.style.top)||0)*缩};
  if (视图 === '路线') {
    const 标题们 = [...$('#世界').querySelectorAll('.路线标题')];
    if (标题们.length) 位.y = 顶 - Math.min(...标题们.map(e => parseFloat(e.style.top))) * 缩;
  }
  return {缩, 位};
}

function 导航内容(视图们){
  return '<span class="签块" aria-hidden="true"></span>' + 视图们.map(v =>
    `<button data-v="${转义(v)}"><span>${转义(v)}</span><span class="导航计数"></span></button>`).join('');
}

function 缩放外观(缩){
  document.body.classList.toggle('远', 缩 < .55);
  document.body.classList.toggle('中', 缩 >= .55 && 缩 < .8);
}

const 模板 = 创建模板(api, {色, 印, 行, 详情头, 图标, 汉数});
return {
  装配界面, 装配画布, 模板,
  布局: {卡宽, 卡高, 隙, 盒隙, 内左, 内顶, 路线起点:60, 路线间距:120, 路线标题距:100, 路线编辑距:46, 连线出口:步宽},
  镜头时长:520, 镜头缓动:t => 1 - Math.pow(1 - t, 3),
  色, 导航内容, 缩放外观, 初始视野, 定位文件预览, 定位导航, 算库布局, 算路线布局,
  卡html, 行, 详情头, 停卡片动效, 卡片过渡, 布置阅读幕, 画布入场, 定位展开, 阅读区域,
};
};
