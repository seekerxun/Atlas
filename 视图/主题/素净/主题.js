import 创建模板 from './模板.js';
/* 素净主题：中性灰白、白卡细边、一个强调色，深浅两用。
   好看靠排版和留白，不靠装饰；动效只有短促的淡入、位移和平滑形变，不回弹。
   视觉在 样式.css（按 html[data-外观] 切配色），本文件负责布局、模板与动效。 */
export default function 创建主题(api){
const {$, 转义, 图后缀, 可动, 分组数据, 更新关联} = api;

const 卡宽 = 272, 卡高 = 150, 隙 = 14, 盒隙 = 40, 内左 = 20, 内顶 = 58;
const 步宽 = 260, 步距 = 80;
const 缓 = 'cubic-bezier(.2,.8,.2,1)';

// 类型只用一个小圆点区分，颜色低饱和；类型名总会写在圆点旁边，颜色只是辅助。
const 色相们 = ['蓝灰','青','陶','金','紫'];
const 类型表 = {
  规范:'蓝灰', 视图:'蓝灰', 世界观:'蓝灰', 世界:'蓝灰', 谱痕:'蓝灰',
  工具说明:'青', 流程:'青', 副本:'青', 剧情:'青', 创意:'青',
  路线:'陶', 系统:'陶', 机制:'陶', 技能:'陶', 力量体系:'陶',
  数值:'金', 数据表:'金', 道具:'金', 异常物:'金', 命令:'金',
  NPC:'紫', 势力:'紫', 总览:'紫', 模板:'紫',
};
function 色相(k){
  const 名 = String(k || '总览');
  if (类型表[名]) return 类型表[名];
  let hash = 0; for (const c of 名) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return 色相们[hash % 5];
}
const 色 = k => `var(--${色相(k)})`;
const 上 = () => 'var(--面)';
const 形 = () => 'c';
const 小形 = k => `<span class="小形" style="--形色:${色(k)}" aria-hidden="true"></span>`;
const 序色 = () => '序';

const 图标 = {
  工具: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  产出: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  箭头: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

let 签序 = -1;

function 装配界面(){
  签序 = -1;
  api.监听(window, 'resize', () => 定位导航(true));
  api.清理(() => {
    document.querySelectorAll('.卡,.步').forEach(停卡片动效);
    document.body.classList.remove('素净阅读','远','中');
    $('#阅读幕').classList.remove('开'); $('#阅读幕').removeAttribute('style');
    $('#文件预览').style.removeProperty('--预览顶'); $('#文件预览').style.removeProperty('--预览高');
  });
  装配扫描转圈();
}

// 重新扫描：换成居中的线条箭头；核心标 data-扫描中 时匀速转一整圈，扫描没结束就接着转，停下时落在整圈上。
function 装配扫描转圈(){
  const 钮 = $('#刷');
  if (!钮) return;
  const 原文 = 钮.textContent;
  钮.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>';
  const 箭 = 钮.firstChild;
  let 转 = null;
  const 一圈 = () => {
    转 = api.动画(箭, [{rotate:'0deg'}, {rotate:'360deg'}], {duration:700, easing:'cubic-bezier(.45,0,.25,1)'});
    转.finished.then(() => { 转 = null; if (钮.hasAttribute('data-扫描中') && 可动()) 一圈(); }, () => {});
  };
  // 扫描很快时加上和去掉属性会落在同一批记录里，所以看「曾被加上」而不是看当前状态。
  const 观 = new MutationObserver(记录 => { if (!转 && 可动() && 记录.some(r => r.oldValue === null)) 一圈(); });
  观.observe(钮, {attributes:true, attributeFilter:['data-扫描中'], attributeOldValue:true});
  api.清理(() => { 观.disconnect(); 转?.cancel(); 钮.textContent = 原文; });
}

// 类型小标去掉核心加的「●」，换成同色圆点。
function 装配画布(){
  $('#世界').querySelectorAll('.盒>.类标').forEach(el => {
    const 类型 = el.textContent.replace(/^\s*●\s*/, '').trim();
    el.textContent = 类型; el.style.color = '';
    el.insertAdjacentHTML('afterbegin', 小形(类型));
  });
}

function 定位文件预览(){
  const 区 = 阅读区域();
  $('#文件预览').style.setProperty('--预览高', 区.高 + 'px');
  $('#文件预览').style.setProperty('--预览顶', 区.顶 + 'px');
}

// 分段控件：白色滑块平移到选中的一段，宽度一起过渡。
function 定位导航(即刻){
  const 签 = $('#签'), 块 = 签?.querySelector('.签块'), 钮 = 签?.querySelector('button.开');
  if (!块 || !钮) return;
  const 序 = [...签.querySelectorAll('button')].indexOf(钮);
  const 动 = 可动() && !即刻 && 签序 >= 0 && 序 !== 签序;
  块.style.transition = 动 ? `left .22s ${缓}, width .22s ${缓}` : 'none';
  块.style.left = 钮.offsetLeft + 'px'; 块.style.width = 钮.offsetWidth + 'px';
  块.style.opacity = '1';
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
      const 行卡高 = 卡高 + (类组[类].some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 48 : 0);
      类组[类].forEach((n, i) => {
        const c = i % 列, r = (i / 列) | 0;
        卡们.push({节: n, x: c * (卡宽 + 隙), y: 内y + r * (行卡高 + 隙), h: 行卡高});
      });
      内y += Math.ceil(类组[类].length / 列) * (行卡高 + 隙) + 8;
    });
    const w = 列 * (卡宽 + 隙) - 隙 + 内左 * 2, h = 内y + 内顶 + 6;
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
    let y = 40;
    列[d].forEach(i => {
      const 高 = 84 + ((步[i].docs || []).length + (步[i].tools || []).length +
                     (步[i].outputs || []).length) * 22 + (步[i].note ? 84 : 0);
      const id = `步:${r.名称}:${步[i].id}`;
      const p = {...(布局[id] || {x: 40 + d * (步宽 + 步距), y: 基y + y})};
      p.y = Math.max(基y + 40, p.y);
      for (let 次 = 0; 次 <= 步.length; 次++) {
        const 撞 = 位置.find(b => b && p.x < b.x+步宽+28 && p.x+步宽+28 > b.x && p.y < b.y+b.h+28 && p.y+高+28 > b.y);
        if (!撞) break;
        p.y = 撞.y+撞.h+28;
      }
      位置[i] = {id, x: p.x, y: p.y, h: 高};
      y += 高 + 28;
    });
  });
  return 位置;
}

function 卡html(n){
  const 图 = (n.资产展开 || []).filter(a => 图后缀.test(a)).slice(0, 3);
  return `<div class="卡眉">${小形(n.类型)}<span class="类型签">${转义(n.类型 || '文档')}</span>${n.编号 ? `<span class="编号">${转义(n.编号)}</span>` : ''}
      ${n.状态 ? 模板.状态签(n.状态) : ''}</div>
    <h4>${转义(n.标题 || n.名称)}</h4>
    ${n.摘要 ? `<div class="要">${转义(n.摘要)}</div>` : ''}
    ${图.length ? `<div class="图条">${图.map(a =>
      `<img loading="lazy" alt="" src="/文件/${转义(encodeURI(a))}">`).join('')}</div>` : ''}
    <div class="脚">
      ${n.行数 != null ? `<span class="篇幅">${n.行数} 行</span>` : ''}
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

function 详情头(标题, 分类, 路径, 类型){
  const k = 类型 ?? 分类;
  return `<div class="详情头"><div class="详情眉">${小形(k)}<span class="类型签">${转义(分类)}</span><span class="分隔符">/</span><span class="路">${转义(路径)}</span></div>
    <h3>${转义(标题)}</h3><button class="收起" onclick="收卡()" aria-label="收起卡片">收起 <kbd>Esc</kbd></button></div>`;
}

function 停卡片动效(card){ card?._动效清理?.(); }

// 展开是一块白色面板从卡片的位置和大小平滑长到阅读面板（不拉伸内容），面板到位后内容淡入；收起反向，更短。
function 卡片过渡(card, 原框){
  if (!可动() || !原框?.width) return;
  停卡片动效(card);
  const 终框 = card.getBoundingClientRect();
  if (!终框.width || !终框.height) return;
  const opening = card.classList.contains('展开'), duration = opening ? 240 : 180;
  const 片 = document.createElement('div'); 片.className = '素净过渡片';
  片.setAttribute('aria-hidden', 'true'); 片.inert = true;
  api.装饰(片);
  const 小圆 = 10 * api.读取状态().缩 + 'px';
  const 框帧 = (框, 大) => ({left:框.left + 'px', top:框.top + 'px', width:框.width + 'px', height:框.height + 'px', borderRadius:大 ? '14px' : 小圆});
  const 动们 = [
    api.动画(片, [框帧(原框, !opening), 框帧(终框, opening)], {duration, easing:缓, fill:'forwards'}),
    api.动画(片, [{opacity:1}, {opacity:1, offset:.7}, {opacity:0}], {duration, fill:'forwards'}),
    api.动画(card, [{opacity:0}, {opacity:0, offset:.55}, {opacity:1}], {duration, easing:'ease-out'}),
  ];
  const cleanup = () => { 动们.forEach(a => a.cancel()); 片.remove(); card._动效清理 = null; };
  card._动效清理 = cleanup;
  动们[0].finished.then(() => { if (card._动效清理 === cleanup) cleanup(); 更新关联(); }, () => {});
}

function 布置阅读幕(){
  const {展开卡, 位, 缩} = api.读取状态();
  const curtain = $('#阅读幕'), stage = $('#台');
  document.body.classList.toggle('素净阅读', !!展开卡);
  curtain.classList.toggle('开', !!展开卡);
  curtain.style.cssText = `left:${-位.x/缩}px;top:${-位.y/缩}px;width:${stage.clientWidth/缩}px;height:${stage.clientHeight/缩}px;`;
}

// 切换视图：可见的卡片按阅读顺序淡入并上移几像素，间隔很短；流程线稍后淡入。
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
    el._入场动画 = api.动画(el, [{opacity:0, transform:'translateY(6px)'}, {opacity:1, transform:'none'}],
      {duration:220, delay:Math.min(i, 12) * 18, easing:缓, fill:'backwards'});
  });
  $('#世界').querySelectorAll('.路线标题,.盒>.头,.编辑条').forEach(el => api.动画(el,
    [{opacity:0}, {opacity:1}], {duration:200, easing:'ease-out', fill:'backwards'}));
  $('#线').querySelectorAll('path.边,circle').forEach(el => api.动画(el,
    [{opacity:0}, {opacity:1}], {duration:220, delay:120, easing:'ease-out', fill:'backwards'}));
}

// 同一主题内深浅切换：旧底色盖一层再淡出，整体是一次柔和的交叉淡化。
function 外观变化(外观, 旧外观){
  if (!可动() || !旧外观) return;
  const 层 = document.createElement('div'); 层.className = '素净换色'; 层.setAttribute('aria-hidden', 'true');
  层.style.background = 旧外观 === '深' ? '#141413' : '#F6F6F4';
  api.装饰(层);
  api.动画(层, [{opacity:.85}, {opacity:0}], {duration:260, easing:'ease-out', fill:'forwards'})
    .finished.then(() => 层.remove(), () => 层.remove());
}

function 定位展开(){
  const {展开卡, 位, 缩} = api.读取状态();
  if (!展开卡) return;
  const card = 展开卡, box = card.closest('.盒'), 台框 = $('#台').getBoundingClientRect();
  const 原x = parseFloat(card.style.left) + (box ? parseFloat(box.style.left) + box.clientLeft : 0);
  const 原y = parseFloat(card.style.top) + (box ? parseFloat(box.style.top) + box.clientTop : 0);
  const 区 = 阅读区域();
  const 宽 = Math.min(1080, 台框.width < 700 ? 台框.width - 16 : 台框.width * .84);
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
  const 位 = {x:24 - (parseFloat(首.style.left)||0)*缩, y:顶 - (parseFloat(首.style.top)||0)*缩};
  if (视图 === '路线') {
    const 标题们 = [...$('#世界').querySelectorAll('.路线标题')];
    if (标题们.length) 位.y = 顶 - Math.min(...标题们.map(e => parseFloat(e.style.top))) * 缩;
  }
  return {缩, 位};
}

function 导航内容(视图们){
  return '<span class="签块" aria-hidden="true"></span>' +
    视图们.map(v => `<button data-v="${v}"><span>${v}</span><span class="导航计数"></span></button>`).join('');
}

function 缩放外观(缩){
  document.body.classList.toggle('远', 缩 < .55);
  document.body.classList.toggle('中', 缩 >= .55 && 缩 < .8);
}

const 模板 = 创建模板(api, {色, 上, 形, 小形, 行, 详情头, 图标, 序色});
return {
  装配界面, 装配画布, 外观变化, 模板,
  布局: {卡宽, 卡高, 隙, 盒隙, 内左, 内顶, 路线起点:60, 路线间距:110, 路线标题距:96, 路线编辑距:48, 连线出口:步宽},
  镜头时长:420, 镜头缓动:t => 1-Math.pow(1-t,3),
  色, 导航内容, 缩放外观, 初始视野, 定位文件预览, 定位导航, 算库布局, 算路线布局,
  卡html, 行, 详情头, 停卡片动效, 卡片过渡, 布置阅读幕, 画布入场, 定位展开, 阅读区域,
};
};
