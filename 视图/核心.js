// Atlas 共用功能：数据、导航状态、缩放平移、选择、编辑、保存与撤销。
const $ = s => document.querySelector(s);
const 转义 = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const 图后缀 = /\.(png|jpg|jpeg|webp|gif|svg)$/i;
let 数据 = null, 视图 = '内容', 选中 = null, 布局 = {}, 选中步 = null;
let 缩 = 0.85, 位 = {x: 30, y: 24};
let 展开卡 = null, 正文请求 = null, 首次 = true, 上次绘制视图 = null;
let 悬停条目 = null, 悬停关联 = null;
let 悬停计时 = null, 待悬停卡 = null;
const 卡片悬停延迟 = 250;
const 按路径 = {}, 按编号 = {}, 按名 = {};

let 主题 = null, 当前主题包 = null, 主题请求序号 = 0;
let 主题选择 = null, 当前外观 = null, 选择序号 = 0;
const 主题API = {
  $, 转义, 图后缀, 可动,
  分组数据: () => 分组数据(), 更新关联: () => 更新关联(),
  读取状态: () => ({数据, 视图, 缩, 位: {...位}, 布局, 展开卡, 外观: 当前外观}),
  视图规则: v => 视图规则(v), 视图原型: v => 视图原型(v),
};
const 主题调用 = name => (...args) => 主题?.[name](...args);
const 色 = 主题调用('色'), 定位文件预览 = 主题调用('定位文件预览'), 定位导航 = 主题调用('定位导航');
const 算库布局 = 主题调用('算库布局'), 算路线布局 = 主题调用('算路线布局'), 卡html = 主题调用('卡html');
const 停卡片动效 = 主题调用('停卡片动效');
const 卡片过渡 = 主题调用('卡片过渡'), 布置阅读幕 = 主题调用('布置阅读幕'), 画布入场 = 主题调用('画布入场');
const 定位展开 = 主题调用('定位展开'), 阅读区域 = 主题调用('阅读区域');
let 阅读完成 = Promise.resolve();
let 待恢复阅读 = null;

function 保存主题视图(){
  const input = $('#屉 .步骤标题编辑 input');
  return {视图, 缩, 位:{...位}, 选中, 步:选中步 ? {...选中步} : null,
    列表滚动:['#未体','#搜果','#检查列表','#挑 .单'].map(s => [s,$(s)?.scrollTop || 0]),
    滚动:待恢复阅读?.节点 === $('#屉 .详情体') ? 待恢复阅读.滚动 : ($('#屉 .详情体')?.scrollTop || 0),
    草稿:input ? {值:input.value, start:input.selectionStart, end:input.selectionEnd} : null,
    焦点:document.activeElement,
  };
}
function 渲染主题包(pack, state, 外观){
  主题 = pack.theme; 当前主题包 = pack; 当前外观 = 外观;
  ({卡宽, 卡高, 隙, 盒隙} = 主题.布局);
  Atlas主题加载器.启用(pack, 外观);
  主题.装配界面?.();
  $('#签').replaceChildren(); 画签();
  if (!数据) return;
  画未认领();
  if ($('#检查详情').open) 画检查();
  if ($('#项目窗').open) 画项目();
  const 搜果显示 = 搜果.style.display;
  if (搜框.value.trim()) 画搜索结果(); else 画搜索记录();
  搜果.style.display = 搜果显示;
  重画候选?.();
  state.列表滚动.forEach(([s,top]) => { if ($(s)) $(s).scrollTop = top; });
  视图 = state.视图; 缩 = state.缩; 位 = {...state.位};
  画();
  if (state.选中 && 按路径[state.选中]) 选条目(state.选中);
  else if (state.步) 选步骤(state.步.路线, state.步.步);
  if (state.草稿 && 选中步){
    编辑步骤标题(选中步.路线, 选中步.步);
    const input = $('#屉 .步骤标题编辑 input');
    if (input) { input.value = state.草稿.值; input.setSelectionRange(state.草稿.start, state.草稿.end); }
  }
  const reading = {节点:$('#屉 .详情体'), 滚动:state.滚动};
  待恢复阅读 = state.选中 ? reading : null;
  const restoreScroll = () => { if (当前主题包 === pack && 选中 === state.选中 && 选中步?.路线 === state.步?.路线 && 选中步?.步 === state.步?.步 && reading.节点 === $('#屉 .详情体') && reading.节点) reading.节点.scrollTop = state.滚动; };
  restoreScroll();
  if (state.选中) 阅读完成.then(() => { restoreScroll(); if (待恢复阅读 === reading) 待恢复阅读 = null; });
  if ($('#文件预览').open) 定位文件预览();
  if (state.焦点?.isConnected) state.焦点.focus({preventScroll:true});
  定位主题面板();
}
// 方案 = {id, 外观}。同一主题只换外观时不重载，只改 html 的 data-外观 并通知主题。
async function 切换方案(方案){
  const 序号 = ++主题请求序号, id = 方案.id;
  if (当前主题包?.meta.id === id) {
    const 旧外观 = 当前外观;
    if (旧外观 !== 方案.外观) {
      当前外观 = 方案.外观; document.documentElement.dataset.外观 = 方案.外观;
      try { 主题.外观变化?.(方案.外观, 旧外观); } catch (e) { console.error('主题外观切换失败', e); }
    }
    $('#主题选择').removeAttribute('aria-busy');
    return true;
  }
  $('#主题选择').setAttribute('aria-busy', 'true');
  let pack;
  try {
    pack = await Atlas主题加载器.准备(id, 主题API);
    if (序号 !== 主题请求序号) { Atlas主题加载器.卸载(pack); return false; }
    const state = 保存主题视图(), old = 当前主题包, 旧外观 = 当前外观;
    停镜头();
    if (主题) 收卡(false);
    Atlas主题加载器.卸载(old);
    try { 渲染主题包(pack, state, 方案.外观); }
    catch (e){
      Atlas主题加载器.卸载(pack); pack = null;
      当前主题包 = null; 主题 = null;
      if (old) 渲染主题包(Atlas主题加载器.重建(old, 主题API), state, 旧外观);
      throw e;
    }
    return true;
  } catch (e){
    if (pack && 当前主题包 !== pack) Atlas主题加载器.卸载(pack);
    if (序号 === 主题请求序号){
      if (当前主题包) 提示('主题切换失败，已保留原主题：' + e.message);
      else throw e;
    }
    return false;
  } finally {
    if (序号 === 主题请求序号) $('#主题选择').removeAttribute('aria-busy');
  }
}

// 主题面板：固定用一个方案，或跟随系统、白天和夜间各用一个方案。每个方案用主题自带的图标表示，名字只在悬停提示里。
// 面板由核心生成，放在浏览器顶层；外观随当前主题（基础.css 给结构，主题给配色）。
function 画主题选项(){
  const 全 = Atlas主题加载器.方案们(), s = 主题选择, 跟随 = s.模式 === '跟随', 面 = $('#主题面板');
  const 焦 = 面.contains(document.activeElement) ? document.activeElement : null;
  const 焦键 = 焦 && (焦.dataset.值 ? `[data-值="${CSS.escape(焦.dataset.值)}"]` : 焦.dataset.模式 ? `[data-模式="${焦.dataset.模式}"]` : null);
  const 模式钮 = (值, 文) => `<button type="button" data-模式="${值}" aria-pressed="${s.模式 === 值}">${文}</button>`;
  const 项 = f => { const 中 = 跟随 ? s[f.外观] === f.值 : s.手动 === f.值;
    return `<button type="button" class="主题项" data-值="${转义(f.值)}" aria-pressed="${中}" title="${转义(f.名称)}" aria-label="${转义(f.名称)}"><img src="${转义(f.图标)}" alt="" draggable="false"><span class="主题项名">${转义(f.名称)}</span></button>`; };
  const 组 = (外观, 标) => { const 列 = 全.filter(f => f.外观 === 外观);
    return 列.length ? `<div class="主题组" data-外观="${外观}"><span class="主题组名">${标}</span><div class="主题项们">${列.map(项).join('')}</div></div>` : ''; };
  面.innerHTML = `<div class="主题模式" role="group" aria-label="主题模式">${模式钮('手动', '固定')}${模式钮('跟随', '跟随系统')}</div>`
    + 组('浅', 跟随 ? '白天用' : '浅色') + 组('深', 跟随 ? '夜间用' : '深色');
  面.dataset.模式 = s.模式;
  if (焦键) 面.querySelector(焦键)?.focus({preventScroll: true});
  const 名 = 值 => Atlas主题加载器.找方案(值)?.名称 || '未设';
  // 主题选择只剩一枚图标，悬停提示要说清当前用的是哪个方案。
  $('#主题选择').title = 跟随 ? `界面主题：跟随系统（白天${名(s.浅)}，夜间${名(s.深)}）` : `界面主题：${名(s.手动)}`;
  定位主题面板();
}
// 面板贴着按钮下方右对齐，放不下就翻到上方；主题换了按钮位置或窗口变化时重新定位。主题面板和运行面板共用。
function 定位面板(面, 钮){
  if (!面.matches(':popover-open')) return;
  const r = 钮.getBoundingClientRect(), w = 面.offsetWidth, h = 面.offsetHeight;
  let top = r.bottom + 8;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
  面.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  面.style.top = top + 'px';
}
function 定位主题面板(){
  定位面板($('#主题面板'), $('#主题选择'));
  定位面板($('#运行面板'), $('#运行选择'));
}
async function 应用主题选择(s){
  const 本次 = ++选择序号, 旧 = 主题选择;
  主题选择 = s; 画主题选项();
  const 方案 = Atlas主题加载器.当前方案(s);
  const ok = 方案 ? await 切换方案(方案) : false;
  if (本次 !== 选择序号) return;
  if (ok) Atlas主题加载器.记选择(s);
  else { 主题选择 = 旧; 画主题选项(); }
}
async function 启动界面(){
  try {
    const d = await Atlas主题加载器.读取目录();
    主题选择 = Atlas主题加载器.读选择(); 画主题选项();
    const 方案 = Atlas主题加载器.当前方案(主题选择);
    try { await 切换方案(方案); }
    catch (e) {
      const 默认 = Atlas主题加载器.方案们().find(f => f.id === d.默认);
      if (方案.id === d.默认) throw e;
      主题选择 = {...主题选择, 模式:'手动', 手动:默认.值}; 画主题选项();
      await 切换方案(默认);
    }
    await 取数();
    document.body.removeAttribute('data-启动中'); $('#启动状态').hidden = true;
    查运行();
    查空间('更新');
  } catch (e){
    $('#启动状态').firstChild.textContent = '界面加载失败：' + e.message + ' ';
    $('#重试启动').hidden = false;
  }
}
$('#主题面板').addEventListener('beforetoggle', e => { if (e.newState === 'open') e.target.setAttribute('data-定位中', ''); });
$('#主题面板').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  定位主题面板(); e.target.removeAttribute('data-定位中');
});
// 图标缺失时退回显示名字，不留空白格。
$('#主题面板').addEventListener('error', e => e.target.closest?.('.主题项')?.setAttribute('data-无图', ''), true);
$('#主题面板').onclick = e => {
  const 钮 = e.target.closest('button');
  if (!钮 || $('#主题选择').getAttribute('aria-busy')) return;
  const s = {...主题选择};
  if (钮.dataset.模式) {
    if (钮.dataset.模式 === s.模式) return;
    // 从跟随改固定时，固定成眼下正在用的方案，界面不跳。
    if (钮.dataset.模式 === '手动') s.手动 = Atlas主题加载器.当前方案(s)?.值 || s.手动;
    s.模式 = 钮.dataset.模式;
  } else if (钮.dataset.值) {
    const 值 = 钮.dataset.值, 外观 = Atlas主题加载器.找方案(值)?.外观;
    if (s.模式 === '手动') s.手动 = 值;
    else {
      s[外观] = 值;
      if (外观 !== Atlas主题加载器.系统外观())
        提示(`已设为${外观 === '浅' ? '白天' : '夜间'}主题：${Atlas主题加载器.找方案(值)?.名称}，系统切到${外观}色时生效`);
    }
  } else return;
  应用主题选择(s);
};
// 系统外观变化时跟换；回到窗口时再核对一次，补上后台期间可能漏掉的变化。
function 核对系统外观(){
  if (主题选择?.模式 !== '跟随' || !当前主题包) return;
  const 目标 = Atlas主题加载器.当前方案(主题选择);
  if (目标 && (目标.id !== 当前主题包.meta.id || 目标.外观 !== 当前外观)) 应用主题选择({...主题选择});
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', 核对系统外观);
addEventListener('focus', 核对系统外观);
document.addEventListener('visibilitychange', () => { if (!document.hidden) 核对系统外观(); });
$('#重试启动').onclick = () => location.reload();


// 带退场动画关闭：先标 data-关闭中，主题若为它写了动画或过渡就等播完（最多 600ms），否则立即关。
function 关弹窗(el, 关 = () => el.close()){
  const 令 = el._关令 = {};
  el.setAttribute('data-关闭中', '');
  // 只等因 data-关闭中 新触发、尚未开始的动画；开场动画还在播也不必等它。
  const 动 = 可动() ? el.getAnimations({subtree: true}).filter(a => a.pending && (a instanceof CSSAnimation || a instanceof CSSTransition)) : [];
  const 完 = () => { if (el._关令 !== 令) return; el._关令 = null; el.removeAttribute('data-关闭中'); 关(); };
  if (!动.length) { 完(); return; }
  Promise.race([Promise.all(动.map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 600))]).then(完);
}
function 取消关闭(el){ el._关令 = null; el.removeAttribute('data-关闭中'); }
['#检查详情', '#文件预览', '#询问', '#项目窗', '#产出窗'].forEach(s => $(s).addEventListener('cancel', e => {
  e.preventDefault(); if (s === '#询问') 询问中?.(null); else 关弹窗($(s));
}));

// 页内询问框，替代浏览器的 prompt / confirm；外观由主题决定。字段为空时就是确认框。
// 字段 {名, 值, 占位} 是输入框；带 选项（字符串数组）时是一组单选，值为默认选中项。
// 返回各字段的值组成的数组，取消返回 null。
let 询问中 = null;
function 询问({标题, 说明 = '', 字段 = [], 确定 = '确定', 危险 = false}){
  询问中?.(null);
  const d = $('#询问'), 区 = $('#询问字段');
  $('#询问标题').textContent = 标题;
  $('#询问说明').textContent = 说明; $('#询问说明').hidden = !说明;
  区.innerHTML = 字段.map((f, i) => f.选项
    ? `<div class="询问项" role="radiogroup" aria-labelledby="询问名${i}"><span id="询问名${i}">${转义(f.名)}</span><div class="询问选项">${f.选项.map(o =>
        `<label><input type="radio" name="询问选${i}" value="${转义(o)}"${o === f.值 ? ' checked' : ''}><span>${转义(o)}</span></label>`).join('')}</div></div>`
    : `<label class="询问项"><span>${转义(f.名)}</span><input data-i="${i}" value="${转义(f.值 ?? '')}" placeholder="${转义(f.占位 || '')}" autocomplete="off"></label>`).join('');
  $('#询问确定').textContent = 确定;
  d.toggleAttribute('data-危险', 危险);
  return new Promise(完 => {
    询问中 = v => { 询问中 = null; 关弹窗(d); 完(v); };
    取消关闭(d);
    if (!d.open) d.showModal();
    const 首 = 区.querySelector('input:not([type=radio]), input:checked');
    if (首) { 首.focus(); 首.select(); } else $(危险 ? '#询问取消' : '#询问确定').focus();
  });
}
$('#询问表').onsubmit = e => { e.preventDefault(); 询问中?.([...$('#询问字段').children].map(项 => (项.querySelector('input:checked') || 项.querySelector('input:not([type=radio])'))?.value ?? '')); };
$('#询问取消').onclick = () => 询问中?.(null);

function 提示(s){ const t = $('#提示'); t.textContent = s; t.classList.add('开');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('开'), 1600); }


// ---------------------------------------------------------------- 取数
// 每次取数都是服务端的一次重新扫描，不论从哪个入口触发；扫描期间 #刷 带 data-扫描中，主题据此播放扫描动画。
async function 取数(自动 = false){
  const 钮 = $('#刷'); 钮.setAttribute('data-扫描中', '');
  try { await 读数据(自动); } finally { 钮.removeAttribute('data-扫描中'); }
}
// 切回前台自动重新扫描一次。正在阅读、输入或开着对话框时不打断，等下次回到前台；数据没变就不重画。
let 上次数据文本 = null, 上次自动扫描 = 0;
function 忙着(){
  return !!(展开卡 || document.querySelector('dialog[open]') || $('#挑')?.classList.contains('开')
    || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable);
}
function 自动扫描(){
  if (document.hidden || !数据 || 忙着() || Date.now() - 上次自动扫描 < 2000) return;
  上次自动扫描 = Date.now();
  取数(true).catch(() => {});
}
addEventListener('focus', 自动扫描);
document.addEventListener('visibilitychange', 自动扫描);
// 写请求带上页面所属的项目根；服务管的不是这个项目时会拒收，不会写错地方。
let 项目根 = null;
const 项目头 = () => ({'X-Atlas-Root': encodeURIComponent(项目根 || '')});

// 空间统计独立于 /数据：启动读缓存，前台每五分钟检查一次；焦点切换不触发。
let 空间请求序号 = 0, 空间计时 = null, 空间进行中 = false;
function 空间短名(字节){
  const 单位 = ['M', 'G', 'T'];
  let 数 = 字节 / 1024 ** 2, i = 0;
  while (Math.round(数) >= 1024 && i < 单位.length - 1) { 数 /= 1024; i++; }
  return `${字节 > 0 ? Math.max(1, Math.round(数)) : 0}${单位[i]}`;
}
async function 查空间(模式 = '缓存', 序号 = ++空间请求序号){
  clearTimeout(空间计时);
  if (!项目根) return;
  空间进行中 = true;
  const el = $('#项目空间');
  try {
    const r = await fetch(模式 === '更新' ? '/空间?更新=1' : '/空间',
      模式 === '强制' ? {method:'POST', headers:项目头()} : undefined);
    if (!r.ok) throw new Error(r.status === 404 ? '请重启画布服务以启用磁盘占用统计' : '暂时无法读取磁盘占用');
    const j = await r.json();
    if (序号 !== 空间请求序号) return;
    if (j.根 !== 项目根) { location.reload(); return; }
    el.textContent = j.字节 == null ? (j.扫描中 ? '…' : '—') : 空间短名(j.字节);
    el.toggleAttribute('data-扫描中', j.扫描中);
    const 说明 = '实际磁盘占用（M/G/T，按 1024 进位）';
    el.title = [说明, j.时间 ? `统计于 ${new Date(j.时间 * 1000).toLocaleTimeString()}` : '',
      j.扫描中 ? '正在后台更新' : '', j.错误 || ''].filter(Boolean).join('\n');
    el.setAttribute('aria-label', `${说明}：${el.textContent}`);
    if (j.扫描中) 空间计时 = setTimeout(() => 查空间('缓存', 序号), 1000);
    else 空间进行中 = false;
  } catch (e) {
    if (序号 !== 空间请求序号) return;
    空间进行中 = false;
    el.removeAttribute('data-扫描中');
    if (el.textContent === '…') el.textContent = '—';
    el.title = e.message;
  }
}
setInterval(() => { if (!document.hidden && !空间进行中) 查空间('更新'); }, 300000);
$('#项目位置').onclick = () => 系统打开('.', true);

async function 读数据(自动 = false){
  const 文本 = await (await fetch('/数据')).text();
  // 自动扫描：结果没变、或者扫描期间用户开始阅读／输入了，就不重画，免得打断
  if (自动 && (文本 === 上次数据文本 || 忙着())) return;
  上次数据文本 = 文本;
  数据 = JSON.parse(文本);
  if (数据.错误) { document.body.innerHTML = '<div class="空">' + 转义(数据.错误) + '</div>'; return; }
  // 同一端口换成了另一个项目的服务（比如在 DevDock 里重启过）：整页重载，撤销栈、布局和选择都属于旧项目。
  if (项目根 && 数据.根 !== 项目根) { location.reload(); return; }
  项目根 = 数据.根;
  布局 = 数据.布局 || {};
  候选缓存 = null;
  $('#名').textContent = 数据.项目;
  const 新视图们 = ['路线', ...(数据.标签 || []).map(t => t.名称)];
  if (新视图们.join('|') !== 视图们.join('|')) { 视图们 = 新视图们; $('#签').replaceChildren(); }
  if (首次) { let 存; try { 存 = localStorage.getItem(视图键()); } catch {} if (视图们.includes(存)) 视图 = 存; }
  if (!视图们.includes(视图)) 视图 = 视图们.find(v => v !== '路线' && 视图规则(v) === '文档') || '路线';
  if (首次 && !数据.条目.some(n => n.库 === 视图)) 视图 = 数据.路线.length ? '路线' : 视图;
  const 初次 = 首次; 首次 = false;
  for (const k in 按编号) delete 按编号[k];
  for (const k in 按名) delete 按名[k];
  for (const k in 按路径) delete 按路径[k];
  数据.条目.forEach(n => {
    按路径[n.路径] = n;
    if (n.编号) 按编号[n.编号] ??= n;
    const stem = n.路径.split('/').pop().replace(/\.md$/, '');
    按名[stem] ??= n;
  });
  const t = 数据.体检;
  const 签 = $('#体检');
  签.textContent = [t.错误 ? `${t.错误} 错误` : '', t.警告 ? `${t.警告} 警告` : ''].filter(Boolean).join(' · ') || '零问题';
  签.setAttribute('aria-label', `项目检查：${签.textContent}，点击查看详情`);
  const 首条 = (数据.发现 || [])[0];
  签.title = 首条 ? `${首条.位置}：${首条.信息}\n点击查看详情与处理建议` : '项目检查通过，点击查看详情';
  签.dataset.状态 = t.错误 ? '错误' : t.警告 ? '警告' : '正常';
  画签(); 画未认领(); 画产出入口(); 画(); if (初次) 阅读视野();
  if (搜框.value.trim()) { const display = 搜果.style.display; 搜框.oninput(); 搜果.style.display = display; }
}

function 画检查(){
  if (!数据) return;
  const 发现 = 数据.发现 || [];
  $('#检查计数').textContent = $('#体检').textContent;
  $('#检查说明').textContent = 发现.length
    ? '警告是项目规范提醒，不阻止画布使用；错误表示检查未通过。下方列出具体原因与处理建议。'
    : '本次扫描未发现错误或警告。';
  $('#检查列表').innerHTML = 主题.模板.检查列表({发现, 按路径});
}
function 打开检查(){
  if (!数据) return;
  画检查();
  取消关闭($('#检查详情')); $('#检查详情').showModal();
  $('#体检').setAttribute('aria-expanded', 'true');
}
$('#体检').onclick = 打开检查;

// ---------------------------------------------------------------- 运行
// 当前项目 .devdock.json 里的运行目标：看状态、启动、停止、打开。判断和停止规则与 DevDock 相同，由服务端负责；
// 停止时端口上的进程不在项目目录里就拒绝。当前画布自己那一项不给停。面板由核心生成，外观随主题。
let 运行目标 = [], 运行错 = '', 运行忙 = new Set(), 上次运行查询 = 0;
function 画运行(){
  const 面 = $('#运行面板');
  const 焦 = 面.contains(document.activeElement) ? document.activeElement.dataset : null;
  const 项 = (t, i) => {
    const 忙 = 运行忙.has(t.名称), 副 = [t.端口 ? ':' + t.端口 : '', t.说明].filter(Boolean).join(' · ');
    const 钮 = t.本页 ? '<span class="运行本页">当前画布</span>'
      : t.运行中 ? (t.可停止 ? `<button type="button" data-动作="停止" data-i="${i}"${忙 ? ' disabled' : ''}>${忙 ? '停止中…' : '停止'}</button>` : '')
      : (t.可启动 ? `<button type="button" data-动作="启动" data-i="${i}"${忙 ? ' disabled' : ''}>${忙 ? '启动中…' : '启动'}</button>` : '');
    const 开 = t.网址 && !t.本页 ? `<button type="button" data-动作="打开" data-i="${i}"${t.运行中 ? '' : ' disabled'}>打开</button>` : '';
    return `<li class="运行项"${t.运行中 ? ' data-运行中' : ''}${忙 ? ' aria-busy="true"' : ''}><span class="运行灯" aria-hidden="true"></span>`
      + `<div class="运行名"><b>${转义(t.名称)}</b>${副 ? `<small title="${转义(副)}">${转义(副)}</small>` : ''}</div>`
      + `<div class="运行钮">${钮}${开}</div></li>`;
  };
  面.innerHTML = `<div class="运行头"><b>运行</b><small>.devdock.json</small></div>`
    + (运行目标.length ? `<ul class="运行列表">${运行目标.map(项).join('')}</ul>` : '<p class="运行空">这个项目的 .devdock.json 里还没有运行目标。</p>')
    + (运行错 ? `<p class="运行错" role="alert">${转义(运行错)}</p>` : '');
  if (焦?.动作) 面.querySelector(`[data-动作="${焦.动作}"][data-i="${焦.i}"]`)?.focus({preventScroll: true});
  const 在跑 = 运行目标.filter(t => t.运行中 && !t.本页);
  $('#运行控件').toggleAttribute('data-运行中', 在跑.length > 0);
  $('#运行选择').title = 在跑.length ? `运行中：${在跑.map(t => t.名称).join('、')}` : '运行目标：启动、停止和打开本项目的服务';
  定位面板(面, $('#运行选择'));
}
async function 查运行(){
  上次运行查询 = Date.now();
  try {
    const j = await (await fetch('/运行')).json();
    if (j.错误) { 运行目标 = []; 运行错 = j.错误; } else { 运行目标 = j.目标; }
  } catch { 运行错 = '读取运行状态失败，确认 atlas serve 还在运行'; }
  画运行();
}
$('#运行面板').addEventListener('beforetoggle', e => { if (e.newState === 'open') { e.target.setAttribute('data-定位中', ''); 运行错 = ''; } });
$('#运行面板').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  画运行(); e.target.removeAttribute('data-定位中');
  查运行();
});
$('#运行面板').onclick = async e => {
  const 钮 = e.target.closest('button[data-动作]'), t = 钮 && 运行目标[+钮.dataset.i];
  if (!t || 钮.disabled) return;
  if (钮.dataset.动作 === '打开') { window.open(t.网址, '_blank'); return; }
  运行忙.add(t.名称); 运行错 = ''; 画运行();
  try {
    const r = await fetch('/运行', {method: 'POST', headers: 项目头(), body: JSON.stringify({名称: t.名称, 动作: 钮.dataset.动作})});
    const j = await r.json();
    if (!r.ok || j.错误) 运行错 = j.错误 || '操作失败';
  } catch { 运行错 = '服务没有响应，确认 atlas serve 还在运行'; }
  运行忙.delete(t.名称);
  await 查运行();
};
// 运行点要大致准：启动时查一次，回到窗口时再查（DevDock 那边可能起停过），两次之间至少隔 3 秒。
addEventListener('focus', () => { if (Date.now() - 上次运行查询 > 3000) 查运行(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - 上次运行查询 > 3000) 查运行(); });

// ---------------------------------------------------------------- 项目
// 一个服务只管一个项目。打开或新建别的项目：服务端保证那个项目的画布在它自己的端口（.devdock.json）上运行，
// 这里在新标签页打开它；当前页面不动。
let 项目清单 = null;
function 画项目(){
  if (!项目清单) return;
  $('#项目列表').innerHTML = 主题.模板.项目列表({列表: 项目清单.列表});
}
async function 打开项目窗(){
  try { 项目清单 = await (await fetch('/项目')).json(); }
  catch { 提示('读取项目列表失败'); return; }
  画项目();
  const d = $('#项目窗'); 取消关闭(d);
  if (!d.open) d.showModal();
  $('#项目').setAttribute('aria-expanded', 'true');
}
// 新标签必须在用户这次点击里先开出来，等服务起好再填网址，否则会被当成弹窗拦掉。
// 成功返回 null；失败返回错误文字，由调用方放回询问框里重试（提示条会被模态框挡住）。
async function 启动项目(接口, 体){
  const 窗 = window.open('', '_blank');
  let j;
  try {
    const r = await fetch(接口, {method: 'POST', body: JSON.stringify(体)});
    j = await r.json();
    if (!r.ok || j.错误) { 窗?.close(); return j.错误 || '操作失败'; }
  } catch { 窗?.close(); return '服务没有响应，确认 atlas serve 还在运行'; }
  关弹窗($('#项目窗'));
  if (窗) { 窗.location.href = j.网址; return null; }
  // 新标签被拦（比如在内嵌网页视图里）：让用户再点一次，或就在当前页打开。
  if (await 询问({标题: '画布已经起好', 说明: `运行在 ${j.网址}。浏览器没让开新标签。`, 确定: '在当前页打开'})) location.href = j.网址;
  return null;
}
async function 反复询问(参数, 提交){
  let 错 = null, 值 = null;
  for (;;) {
    const 字段 = 参数.字段.map((f, i) => ({...f, 值: 值 ? 值[i] : f.值}));
    值 = await 询问({...参数, 字段, 说明: 错 ? `没成功：${错}` : 参数.说明});
    if (!值) return;
    错 = await 提交(值.map(x => x.trim()));
    if (!错) return;
  }
}
$('#项目').onclick = 打开项目窗;
$('#关闭项目窗').onclick = () => 关弹窗($('#项目窗'));
$('#项目窗').addEventListener('close', () => $('#项目').setAttribute('aria-expanded', 'false'));
$('#项目列表').onclick = e => {
  const b = e.target.closest('button[data-i]');
  const p = b && 项目清单?.列表[+b.dataset.i];
  if (!p || b.disabled) return;
  if (p.当前) { 关弹窗($('#项目窗')); return; }
  启动项目('/打开项目', {路径: p.路径}).then(错 => 错 && 询问({标题: '没能打开', 说明: 错, 确定: '知道了'}));
};
$('#新建项目').onclick = () => {
  const 模板 = 项目清单?.模板 || [];
  反复询问({标题: '新建项目', 确定: '新建',
    说明: '在「位置」下新建一个以名称命名的文件夹，带好 AGENTS.md、路线、目录骨架和 DevDock 配置，在新标签页打开它的画布。',
    字段: [{名: '名称', 占位: '比如 夏日MV'}, {名: '位置', 值: 项目清单?.建议位置 || ''},
           {名: '模板', 选项: 模板, 值: 模板.includes('通用项目') ? '通用项目' : 模板[0] || ''}]},
    ([名称, 位置, 模板名]) => 启动项目('/新建项目', {名称, 位置, 模板: 模板名}));
};
$('#打开路径').onclick = () => 反复询问({标题: '打开项目', 确定: '打开',
  说明: '填项目文件夹的完整路径，文件夹里要有 项目.yml。', 字段: [{名: '路径', 占位: '/Users/…/我的项目'}]},
  ([路径]) => 启动项目('/打开项目', {路径}));
$('#关闭检查').onclick = () => 关弹窗($('#检查详情'));
$('#检查详情').addEventListener('close', () => $('#体检').setAttribute('aria-expanded', 'false'));
$('#检查列表').onclick = e => {
  const button = e.target.closest('button[data-发现]');
  if (!button) return;
  const f = 数据.发现[Number(button.dataset.发现)];
  if (!f || !按路径[f.位置]) return;
  $('#检查详情').close();
  跳(f.位置);
};

function 解析(目标){
  目标 = String(目标 || '').trim(); if (!目标) return null;
  return 按编号[目标.split(' ')[0]] || 按名[目标] || 按路径[目标] || 按路径[目标 + '.md'] || null;
}

function 路线文件(引用){
  return (数据?.文件候选 || []).find(c => c.路径 === 引用 || c.文件路径 === 引用);
}
let 预览请求 = null;

async function 预览文档(路径, 副 = ''){
  预览请求?.abort();
  const controller = 预览请求 = new AbortController(), dialog = $('#文件预览'), body = $('#文件预览正文');
  定位文件预览();
  $('#文件预览标题').textContent = '文件预览';
  $('#文件预览路径').textContent = 路径;
  body.className = '正文'; body.textContent = '正在读取…'; body.scrollTop = 0;
  取消关闭(dialog); if (!dialog.open) dialog.showModal();
  try {
    const r = await fetch('/预览/' + encodeURIComponent(路径), {signal: controller.signal});
    const file = await r.json();
    if (!r.ok) throw new Error(file.错误 || '读取失败');
    if (controller.signal.aborted) return;
    $('#文件预览标题').textContent = file.路径.split('/').pop();
    $('#文件预览路径').textContent = file.路径 + (file.格式 === 'code' ? ' · 源码预览' : '') + 副;
    if (file.格式 === 'markdown') {
      body.innerHTML = 正文html(file.内容.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) || '<p>这篇文档还没有正文。</p>';
    } else { body.className = '源码'; body.textContent = file.内容 || '文件为空。'; }
  } catch (e) {
    if (e.name !== 'AbortError') body.textContent = '预览失败：' + e.message;
  }
}
$('#关闭文件预览').onclick = () => 关弹窗($('#文件预览'));
$('#文件预览').addEventListener('close', () => { 预览请求?.abort(); 预览请求 = null; 产出预览位 = null; });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-预览]');
  if (b) { e.preventDefault(); 预览文档(b.dataset.预览); }
}, true);
// 正文双链：指向当前这篇（或只写了 #标题）就在原地滚动，否则跳到那张卡片；带修饰键的点击交给浏览器开新标签。
// 用捕获阶段：展开卡内的点击会被卡片自己的处理截住，冒泡到不了 document。
document.addEventListener('click', e => {
  const a = e.target.closest('a.双链'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  const 路径 = a.dataset.双链, 锚 = a.dataset.锚, 预览 = a.closest('#文件预览');
  const 原地 = !路径 || (!预览 && a.closest('#屉') && 路径 === 选中);
  if (原地) { 跳锚(a.closest('.正文'), 预览 ? $('#文件预览正文') : $('#屉 .详情体'), 锚); return; }
  if (预览?.open) 关弹窗(预览);
  if (a.closest('#产出窗')) 关弹窗($('#产出窗'));
  跳(路径, 锚);
}, true);

// ---------------------------------------------------------------- 视图切换
// 导航 = 路线 + 项目 项目.yml 里声明的标签；每个标签套用 文档 / 草稿 / 素材 三种规则之一。
let 视图们 = ['路线', '策划', '内容', '创意', '资产'];
// 主题的图标、配色、背景按五个"原型"准备：默认名字且规则没改的标签用自己的名字，其余按规则取代表。
const 规则原型 = {流程: '路线', 文档: '内容', 草稿: '创意', 素材: '资产'};
const 默认规则 = {路线: '流程', 策划: '文档', 内容: '文档', 创意: '草稿', 资产: '素材'};
function 视图规则(v){
  if (v === '路线') return '流程';
  return (数据?.标签 || []).find(t => t.名称 === v)?.规则 || 默认规则[v] || '';
}
function 视图目录(v){ return (数据?.标签 || []).find(t => t.名称 === v)?.目录 || v; }
function 视图原型(v){ const r = 视图规则(v); return 默认规则[v] === r ? v : (规则原型[r] || v); }
// 当前导航按项目记在本机，刷新后回到原来的导航；读不到就按默认规则选。
const 视图键 = () => 'atlas:视图:' + 项目根;

function 可动(){ return !matchMedia('(prefers-reduced-motion: reduce)').matches; }

function 画签(){
  const b = $('#新路线'); if (b) b.style.display = 视图 === '路线' ? '' : 'none';
  // 持续复用按钮和滑块，切换时保留滑块的起点与键盘焦点。
  if (!$('#签 button')) {
    $('#签').innerHTML = 主题.导航内容(视图们);
    $('#签').querySelectorAll('button').forEach(b => {
      b.onclick = () => 切视图(b.dataset.v);
      b.dataset.规则 = 视图规则(b.dataset.v); b.dataset.原型 = 视图原型(b.dataset.v);
    });
  }
  $('#签').querySelectorAll('button').forEach(b => {
    b.classList.toggle('开', b.dataset.v === 视图);
    b.setAttribute('aria-pressed', String(b.dataset.v === 视图));
    const count = b.dataset.v === '路线' ? (数据?.路线 || []).length : (数据?.条目 || []).filter(n => n.库 === b.dataset.v).length;
    b.querySelector('.导航计数').textContent = count;
    b.title = `${b.dataset.v} · ${count} ${b.dataset.v === '路线' ? '条路线' : '个条目'}`;
  });
  定位导航();
}

// ---------------------------------------------------------------- 布局计算
let 卡宽, 卡高, 隙, 盒隙;

function 分组数据(){
  const 库 = 视图;
  const ns = 数据.条目.filter(n => n.库 === 库);
  const 盒 = {};
  ns.forEach(n => (盒[n.分组 || '（未分组）'] ??= []).push(n));
  return 盒;
}





// ---------------------------------------------------------------- 画
function 画(){
  const 原选 = 选中, 原步 = 选中步;
  收卡(false);
  const w = $('#世界');
  const 切换了 = 上次绘制视图 !== 视图;
  if (切换了) {
    w.classList.remove('切入'); void w.offsetWidth; w.classList.add('切入');
    上次绘制视图 = 视图;
    try { localStorage.setItem(视图键(), 视图); } catch {}
  }
  w.querySelectorAll('.盒,.卡,.步,.类标,.编辑条,.空').forEach(e => e.remove());
  $('#线').innerHTML = '';
  if (视图 === '路线') 画路线(); else 画库();
  主题.装配画布?.();
  应用变换();
  $('#视图名').textContent = 视图;
  const 数 = 视图 === '路线' ? (数据.路线 || []).length : 数据.条目.filter(n => n.库 === 视图).length;
  $('#视图数').textContent = `${数} ${视图 === '路线' ? '条路线' : '个条目'}`;
  if (原选 && w.querySelector(`.卡[data-路径="${CSS.escape(原选)}"]`)) 选条目(原选);
  else if (原步 && 视图 === '路线') 选步骤(原步.路线, 原步.步);
  if (切换了) { const 本次视图 = 视图, 本次主题 = 主题; requestAnimationFrame(() => { if (视图 === 本次视图 && 主题 === 本次主题) 画布入场(); }); }
}



function 画库(){
  const w = $('#世界'), 盒们 = 算库布局();
  if (!盒们.length) {
    w.insertAdjacentHTML('beforeend', `<div class="空 空位">
      <b>${转义(视图)}库还是空的</b>在项目的「${转义(视图目录(视图))}」目录添加内容，重新扫描后会出现在这里。</div>`);
    return;
  }
  盒们.forEach(b => {
    const 内 = b.卡们.map(c => c.类标
      ? `<div class="类标" style="left:${c.x + 主题.布局.内左}px;top:${c.y + 主题.布局.内顶}px;color:${色(c.类标)}">● ${转义(c.类标)}</div>`
      : `<div class="卡" data-路径="${转义(c.节.路径)}"
           style="--卡色:${色(c.节.类型)};left:${c.x + 主题.布局.内左}px;top:${c.y + 主题.布局.内顶}px;width:${卡宽}px;height:${c.h}px">
           ${卡html(c.节)}</div>`).join('');
    w.insertAdjacentHTML('beforeend',
      `<div class="盒" data-id="${b.id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
        ${主题.模板.分组头({b})}${内}</div>`);
  });
  w.querySelectorAll('.卡').forEach(e => {
    e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-expanded', 'false');
    e.setAttribute('aria-label', '展开 ' + (按路径[e.dataset.路径].标题 || 按路径[e.dataset.路径].名称));
    e.onclick = ev => { ev.stopPropagation(); if (!ev.target.closest('#屉')) 选条目(e.dataset.路径); };
    绑定卡片关联(e);
    e.addEventListener('transitionend', ev => { if (ev.target === e && ev.propertyName === 'translate') 更新关联(); });

    e.onkeydown = ev => { if (ev.target === e && ['Enter', ' '].includes(ev.key)) { ev.preventDefault(); 选条目(e.dataset.路径); } };
  });
  装拖动('.盒', 'data-id');
}

function 画路线(){
  const w = $('#世界');
  let 基y = 主题.布局.路线起点;
  (数据.路线 || []).forEach(r => {
    // 拖过标题的路线在主题排好的位置上整体平移；后面的路线仍按平移前的位置往下排，互不牵连。
    const 原位 = 算路线布局(r, 基y), 移 = 布局[路线键(r.名称)] || {x: 0, y: 0};
    const 位置 = 原位.map(p => ({...p, x: p.x + 移.x, y: p.y + 移.y}));
    const 顶 = (原位.length ? Math.min(...原位.map(p => p.y)) : 基y) + 移.y;
    const 左 = (原位.length ? Math.min(...原位.map(p => p.x)) : 40) + 移.x;
    基y = Math.max(...原位.map(p => p.y + p.h), 基y) + 主题.布局.路线间距;
    w.insertAdjacentHTML('beforeend',
      `<div class="类标 路线标题" data-路线="${转义(r.名称)}" title="拖动标题可移动整条路线" style="left:${左}px;top:${顶 - 主题.布局.路线标题距}px;">
        ${主题.模板.路线标题({r})}</div>
       <div class="编辑条" data-路线="${转义(r.名称)}" style="left:${左}px;top:${顶 - 主题.布局.路线编辑距}px">
        ${主题.模板.路线工具({r})}</div>`);
    r.步骤.forEach((s, i) => {
      const p = 位置[i]; if (!p) return;
      w.insertAdjacentHTML('beforeend',
        `<div class="步" data-标题="${转义(s.title)}" data-id="${p.id}" data-路线="${转义(r.名称)}" data-步="${转义(s.id)}"
          style="--卡色:${色(按路径[(s.docs || [])[0] + '.md']?.类型 || '流程')};left:${p.x}px;top:${p.y}px">
          ${主题.模板.步骤卡({s, i, 路线文件})}</div>`);
    });
    const 本次主题 = 主题, 本次世界 = w.lastElementChild;
    requestAnimationFrame(() => { if (主题 === 本次主题 && 本次世界?.isConnected) 画边(r, 位置); });
  });
  w.querySelectorAll('.步').forEach(e => {
    e.tabIndex = 0; e.setAttribute('role', 'button'); e.setAttribute('aria-expanded', 'false');
    e.setAttribute('aria-label', '展开步骤 ' + e.querySelector('h4').textContent);
    e.onkeydown = ev => { if (ev.target === e && ['Enter', ' '].includes(ev.key)) { ev.preventDefault(); 选步骤(e.dataset.路线, e.dataset.步); } };
    e.onclick = ev => {
      if (ev.target.closest('.柄,#屉')) return;
      if (e._拖过) { e._拖过 = false; return; }
      ev.stopPropagation(); 选步骤(e.dataset.路线, e.dataset.步);
    };
    e.querySelector('.柄').addEventListener('pointerdown', ev => 起连线(ev, e));
  });
  装拖动('.步', 'data-id');
  装路线拖动();
}

// 按当前 DOM 里步骤的位置重画全部连线，拖动途中让线跟着走。
function 重画路线边(){
  $('#线').innerHTML = '';
  (数据.路线 || []).forEach(r => 画边(r, r.步骤.map(s => {
    const e = $('#世界').querySelector(`.步[data-路线="${CSS.escape(r.名称)}"][data-步="${CSS.escape(s.id)}"]`);
    return e ? {id: e.dataset.id, x: parseFloat(e.style.left), y: parseFloat(e.style.top)} : {id: '', x: 0, y: 0};
  })));
}

function 画边(r, 位置){
  const w = $('#世界'), svg = $('#线');
  let d = svg.innerHTML;
  r.步骤.forEach((s, i) => (s.next || []).forEach(nx => {
    const j = r.步骤.findIndex(x => x.id === nx); if (j < 0) return;
    const a = w.querySelector(`[data-id="${CSS.escape(位置[i].id)}"]`);
    const b = w.querySelector(`[data-id="${CSS.escape(位置[j].id)}"]`);
    if (!a || !b) return;
    const x1 = 位置[i].x + 主题.布局.连线出口, y1 = 位置[i].y + (a._原高 || a.offsetHeight) / 2;
    const x2 = 位置[j].x, y2 = 位置[j].y + (b._原高 || b.offsetHeight) / 2, mx = (x1 + x2) / 2;
    const 形 = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    const 键 = `${r.名称}|${s.id}|${nx}`;
    d += `<path class="边击" d="${形}" data-边="${转义(键)}"/>
          <path class="边" d="${形}" fill="none" stroke="var(--线,#888)" stroke-width="2"
                data-边="${转义(键)}"><title>点一下断开这条线</title></path>
          <circle cx="${x2}" cy="${y2}" r="3.5" fill="var(--主,#888)"/>`;
  }));
  svg.innerHTML = d;
  svg.querySelectorAll('[data-边]').forEach(e => e.onclick = ev => {
    ev.stopPropagation();
    const [路线名, 从, 到] = e.dataset.边.split('|');
    断线(路线名, 从, 到);
  });
}

// ---------------------------------------------------------------- 撤销 / 重做
// 每一笔记的是「文件改之前的全文」和「改之后的全文」。撤销就是把前者写回去，
// 重做就是再写后者。路线、认领、迁移全走这一套，不用给每种操作写逆操作。
const 撤销栈 = [], 重做栈 = [], 栈上限 = 60;

function 记一笔(说明, 快照){
  if (!快照) return;
  撤销栈.push({说明, ...快照});
  if (撤销栈.length > 栈上限) 撤销栈.shift();
  重做栈.length = 0;
  刷新撤销按钮();
}

function 记布局(说明, 旧, 新){
  撤销栈.push({说明, 类型: '布局', 旧内容: 旧, 新内容: 新});
  if (撤销栈.length > 栈上限) 撤销栈.shift();
  重做栈.length = 0;
  刷新撤销按钮();
}

function 刷新撤销按钮(){
  const a = $('#撤销'), b = $('#重做');
  a.disabled = !撤销栈.length; b.disabled = !重做栈.length;
  a.title = 撤销栈.length ? `撤销「${撤销栈.at(-1).说明}」 ⌘Z` : '没什么可撤销的';
  b.title = 重做栈.length ? `重做「${重做栈.at(-1).说明}」 ⇧⌘Z` : '没什么可重做的';
}

async function 走一步(笔, 目标内容, 动词){
  if (笔.类型 === '布局'){
    布局 = JSON.parse(JSON.stringify(目标内容 || {}));
    await fetch('/布局', {method: 'POST', headers: 项目头(), body: JSON.stringify(布局)});
    提示(`已${动词}：${笔.说明}`);
    画();
    return true;
  }
  const res = await fetch('/还原', {method: 'POST', headers: 项目头(), body: JSON.stringify(
    {路径: 笔.路径, 内容: 目标内容, 期望mtime: 笔.mtime})});
  const j = await res.json();
  if (j.错误) { 提示(`${动词}不了：${j.错误}`); return false; }
  笔.mtime = j.mtime;
  提示(`已${动词}：${笔.说明}`);
  await 取数();
  return true;
}

async function 撤销(){
  const 笔 = 撤销栈.at(-1); if (!笔) return;
  if (await 走一步(笔, 笔.旧内容, '撤销')){
    撤销栈.pop(); 重做栈.push(笔); 刷新撤销按钮();
  }
}

async function 重做(){
  const 笔 = 重做栈.at(-1); if (!笔) return;
  if (await 走一步(笔, 笔.新内容, '重做')){
    重做栈.pop(); 撤销栈.push(笔); 刷新撤销按钮();
  }
}

// ---------------------------------------------------------------- 路线编辑
async function 新建路线(){
  const 答 = await 询问({标题: '新路线', 说明: '名字就写你最常干的那件事。',
    字段: [{名: '名字', 占位: '例如：出一个NPC'}, {名: '一句话说明', 占位: '可留空'}], 确定: '建好'});
  if (!答 || !答[0].trim()) return;
  const [名, 说] = 答;
  const 文件名 = 名.trim() + '.yml';
  if ((数据.路线 || []).some(r => r.文件名 === 文件名)) { 提示('已经有这条路线了'); return; }
  const res = await fetch('/路线', {method: 'POST', headers: 项目头(), body: JSON.stringify(
    {文件名, 路线: {route: 名.trim(), desc: 说.trim(),
                  steps: [{id: '第一步', title: '第一步', docs: [], next: []}]}})});
  const j = await res.json();
  if (j.错误) { 提示('建不了：' + j.错误); return; }
  记一笔('新建路线 ' + 名.trim(), j.撤销);
  提示('建好了 ' + 文件名);
  await 取数();
}

function 找路线(名){ return (数据.路线 || []).find(r => r.名称 === 名); }

async function 存路线(r, 说明){
  const 体 = {文件名: r.文件名, mtime: r.mtime,
             路线: {route: r.名称, desc: r.说明, entry: r.入口,
                   steps: r.步骤.map(s => ({id: s.id, title: s.title, note: s.note,
                                            docs: s.docs, tools: s.tools,
                                            outputs: s.outputs, next: s.next}))}};
  const res = await fetch('/路线', {method: 'POST', headers: 项目头(), body: JSON.stringify(体)});
  const j = await res.json();
  if (j.错误) { 提示('写回失败：' + j.错误); return false; }
  r.mtime = j.mtime;
  记一笔(说明 || '改了 ' + r.文件名, j.撤销);
  提示(说明 || '已写回 ' + r.文件名);
  const 记 = 选中步;
  await 取数();
  // 写回后重开卡片，否则显示的还是改之前的内容
  if (记 && 找路线(记.路线)?.步骤.some(s => s.id === 记.步)) 选步骤(记.路线, 记.步);
  else 收卡(false);
  return true;
}

function 起连线(ev, 卡){
  ev.stopPropagation(); ev.preventDefault();
  const 路线名 = 卡.dataset.路线, 从 = 卡.dataset.步;
  const svg = $('#线');
  const x1 = parseFloat(卡.style.left) + 主题.布局.连线出口, y1 = parseFloat(卡.style.top) + 卡.offsetHeight / 2;
  const 临 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  临.setAttribute('stroke', 'var(--好,#888)'); 临.setAttribute('stroke-width', '2');
  临.setAttribute('fill', 'none'); 临.setAttribute('stroke-dasharray', '5 4');
  svg.appendChild(临);
  document.querySelectorAll(`.步[data-路线="${CSS.escape(路线名)}"]`).forEach(e => {
    if (e !== 卡) e.classList.add('可放');
  });
  const 台框 = $('#台').getBoundingClientRect();
  const 动 = m => {
    const x2 = (m.clientX - 台框.left - 位.x) / 缩, y2 = (m.clientY - 台框.top - 位.y) / 缩;
    const mx = (x1 + x2) / 2;
    临.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    document.querySelectorAll('.步').forEach(e => e.classList.remove('靶'));
    const 下 = document.elementFromPoint(m.clientX, m.clientY)?.closest('.步');
    if (下 && 下 !== 卡 && 下.dataset.路线 === 路线名) 下.classList.add('靶');
  };
  const 停 = async m => {
    window.removeEventListener('pointermove', 动); window.removeEventListener('pointerup', 停);
    临.remove();
    document.querySelectorAll('.步').forEach(e => e.classList.remove('可放', '靶'));
    const 下 = document.elementFromPoint(m.clientX, m.clientY)?.closest('.步');
    if (!下 || 下 === 卡 || 下.dataset.路线 !== 路线名) return;
    await 连线(路线名, 从, 下.dataset.步);
  };
  window.addEventListener('pointermove', 动); window.addEventListener('pointerup', 停);
}

async function 连线(路线名, 从, 到){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 从); if (!s) return;
  s.next = s.next || [];
  if (s.next.includes(到)) { 提示('已经连过了'); return; }
  if (成环(r, 从, 到)) { 提示('这样会成环，路线必须是有向无环的'); return; }
  s.next.push(到);
  await 存路线(r, `连上：${从} → ${到}`);
}

async function 断线(路线名, 从, 到){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 从); if (!s) return;
  s.next = (s.next || []).filter(x => x !== 到);
  await 存路线(r, `断开：${从} → ${到}`);
}

function 成环(r, 从, 到){
  // 从「到」出发能不能走回「从」
  const 表 = {}; r.步骤.forEach(s => 表[s.id] = s.next || []);
  const 栈 = [到], 见 = new Set();
  while (栈.length) {
    const x = 栈.pop();
    if (x === 从) return true;
    if (见.has(x)) continue;
    见.add(x);
    (表[x] || []).forEach(y => 栈.push(y));
  }
  return false;
}

const 新增步骤中 = new Set();
async function 加步骤(路线名){
  const r = 找路线(路线名); if (!r) return;
  if (新增步骤中.has(路线名)) return;
  新增步骤中.add(路线名);
  let i = r.步骤.length + 1;
  while (r.步骤.some(s => s.id === `步骤${i}`)) i++;
  const id = `步骤${i}`, 标题 = `新步骤 ${i}`, 原选 = 选中步;
  r.步骤.push({id, title: 标题, note: '', docs: [], tools: [], outputs: [], next: []});
  选中步 = {路线: 路线名, 步: id};
  try {
    if (await 存路线(r, '加了一步：' + 标题)) 编辑步骤标题(路线名, id);
    else { r.步骤 = r.步骤.filter(s => s.id !== id); 选中步 = 原选; }
  } catch { r.步骤 = r.步骤.filter(s => s.id !== id); 选中步 = 原选; 提示('添加失败，请重新扫描后再试'); }
  finally { 新增步骤中.delete(路线名); }
}

function 编辑步骤标题(路线名, 步id){
  const r = 找路线(路线名), s = r?.步骤.find(s => s.id === 步id), h = $('#详情标题');
  if (!s || !h || 选中步?.路线 !== 路线名 || 选中步?.步 !== 步id || h.querySelector('input')) return;
  const 原内容 = h.innerHTML, 原标题 = s.title;
  h.innerHTML = '<form class="步骤标题编辑"><input aria-label="步骤标题" required><button type="submit">保存</button><button type="button">取消</button></form>';
  const form = h.querySelector('form'), input = h.querySelector('input');
  input.value = 原标题;
  let 保存中 = false;
  const 取消 = () => { if (保存中) return; h.innerHTML = 原内容; h.querySelector('button')?.focus(); };
  form.querySelector('[type=button]').onclick = 取消;
  form.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); 取消(); } };
  form.onsubmit = async e => {
    e.preventDefault();
    const 标题 = input.value.trim();
    if (保存中) return;
    if (!标题) { input.setCustomValidity('请填写步骤标题'); input.reportValidity(); return; }
    if (标题 === 原标题) { 取消(); return; }
    保存中 = true; form.querySelectorAll('input,button').forEach(el => el.disabled = true);
    s.title = 标题;
    try {
      if (await 存路线(r, '修改步骤标题：' + 标题)) return;
      s.title = 原标题;
    } catch { s.title = 原标题; 提示('保存失败，请重新扫描后再试'); }
    保存中 = false; form.querySelectorAll('input,button').forEach(el => el.disabled = false); input.focus();
  };
  input.oninput = () => input.setCustomValidity('');
  input.focus({preventScroll:true}); input.select();
}

async function 删步骤(路线名, 步id){
  const r = 找路线(路线名); if (!r) return;
  if (!await 询问({标题: `删掉「${步id}」这一步？`, 说明: '指向它的线也会一起断开，可以用撤销恢复。', 确定: '删掉', 危险: true})) return;
  r.步骤 = r.步骤.filter(s => s.id !== 步id);
  r.步骤.forEach(s => s.next = (s.next || []).filter(x => x !== 步id));
  await 存路线(r, '删了：' + 步id);
}

async function 改路线头(路线名){
  const r = 找路线(路线名); if (!r) return;
  const 答 = await 询问({标题: '改名字和说明', 字段: [{名: '路线名字', 值: r.名称}, {名: '一句话说明', 值: r.说明 || '', 占位: '可留空'}], 确定: '保存'});
  if (!答) return;
  const [名, 说] = 答;
  r.名称 = 名.trim() || r.名称; r.说明 = 说.trim();
  await 存路线(r, '改好了');
}

async function 删路线(路线名){
  const r = 找路线(路线名); if (!r) return;
  if (!await 询问({标题: `删掉整条「${路线名}」？`, 说明: `文件 ${r.文件名} 会被删除，可以用撤销恢复。`, 确定: '删掉', 危险: true})) return;
  const res = await fetch('/删路线', {method: 'POST', headers: 项目头(), body: JSON.stringify({文件名: r.文件名})});
  const j = await res.json();
  if (j.错误) { 提示('删不掉：' + j.错误); return; }
  记一笔('删掉路线 ' + 路线名, j.撤销);
  提示('删了 ' + r.文件名);
  收卡(false);
  await 取数();
}

async function 改步骤字段(路线名, 步id, 字段, 提示文){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 步id); if (!s) return;
  const 答 = await 询问({标题: 提示文, 字段: [{名: {note: 'AI 护栏'}[字段] || 字段, 值: s[字段] || ''}], 确定: '保存'});
  if (!答) return; const v = 答[0];
  s[字段] = v.trim();
  await 存路线(r, '改好了');
}

async function 删步骤项(路线名, 步id, 字段, 值){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 步id); if (!s) return;
  s[字段] = (s[字段] || []).filter(x => x !== 值);
  await 存路线(r, '移掉了 ' + 值);
}

async function 加步骤项(路线名, 步id, 字段){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 步id); if (!s) return;
  if (字段 === 'docs') {
    const 选 = await 挑文档(); if (!选) return;
    s.docs = s.docs || []; if (s.docs.includes(选)) { 提示('已经有了'); return; }
    s.docs.push(选);
  } else {
    const 工具 = 字段 === 'tools';
    const 答 = await 询问({标题: 工具 ? '加工具' : '加产出',
      字段: [{名: 工具 ? '工具路径（仓库相对）' : '产出位置（可用通配符）', 占位: 工具 ? '工具/某个脚本' : '资产/W-*/场景/**'}], 确定: '加上'});
    const v = 答?.[0]; if (!v?.trim()) return;
    s[字段] = s[字段] || []; s[字段].push(v.trim());
  }
  await 存路线(r, '加好了');
}

let 候选缓存 = null, 取消挑选 = null, 重画候选 = null;
function 挑文档(){
  return new Promise(async 完 => {
    try {
      if (!候选缓存) {
        const r = await fetch('/候选');
        if (!r.ok) throw new Error('读取失败');
        候选缓存 = await r.json();
      }
    } catch { 提示('读取文件列表失败，请重新扫描后再试'); 完(null); return; }
    const 盒 = $('#挑'), 输 = 盒.querySelector('input'), 单 = 盒.querySelector('.单');
    const 画单 = q => {
      const 命 = 候选缓存.filter(c =>
        !q || (c.路径 + ' ' + c.标题 + ' ' + c.类型).toLowerCase().includes(q)).slice(0, 80);
      单.innerHTML = 主题.模板.候选列表({命});
      单.querySelectorAll('button[data-i]').forEach(d => d.onclick = () => 收(命[+d.dataset.i].路径));
    };
    const 收 = v => { 关弹窗(盒, () => 盒.classList.remove('开')); 输.oninput = null; 取消挑选 = null; 重画候选 = null; $('#屉 .收起')?.focus({preventScroll:true}); 完(v); };
    取消挑选 = () => 收(null);
    输.value = ''; 画单(''); 取消关闭(盒); 盒.classList.add('开'); 输.focus();
    输.oninput = 重画候选 = () => 画单(输.value.trim().toLowerCase());
    盒.onclick = e => { if (e.target === 盒) 收(null); };
  });
}

// ---------------------------------------------------------------- 选中与卡内详情
// 关联触发时机属于核心；主题只呈现核心设置的状态类。
function 清除卡片悬停(card = null){
  if (!card || 待悬停卡 === card) {
    clearTimeout(悬停计时); 悬停计时 = null; 待悬停卡 = null;
  }
  if (!card || 悬停条目 === card.dataset.路径) {
    悬停条目 = null; 更新关联();
  }
}
function 绑定卡片关联(card){
  card.onpointerenter = ev => {
    if (ev.pointerType === 'touch' || ev.buttons || card.classList.contains('展开')) return;
    清除卡片悬停();
    待悬停卡 = card;
    悬停计时 = setTimeout(() => {
      悬停计时 = null; 待悬停卡 = null;
      if (!card.isConnected || card.classList.contains('展开')) return;
      悬停条目 = card.dataset.路径; 更新关联();
    }, 卡片悬停延迟);
  };
  card.onpointerleave = card.onpointercancel = () => 清除卡片悬停(card);
  card.addEventListener('pointerdown', () => 清除卡片悬停(card));
  card.onfocus = () => {
    清除卡片悬停();
    if (!card.classList.contains('展开')) { 悬停条目 = card.dataset.路径; 更新关联(); }
  };
  card.onblur = () => 清除卡片悬停(card);
}

function 一跳(n){
  const s = new Set([n.路径]);
  Object.values(n.关联 || {}).flat().forEach(t => { const x = 解析(t); if (x) s.add(x.路径); });
  (n.被引用 || []).forEach(p => s.add(p));
  (n.软引用 || []).forEach(t => { const x = 解析(t); if (x) s.add(x.路径); });
  return s;
}

function 选条目(路径){
  const n = 按路径[路径]; if (!n) return;
  收卡(false); 选中 = 路径; 选中步 = null;
  开抽屉(n);
  更新关联();
}

function 更新关联(){
  const 主 = 悬停关联 && 选中 ? 选中 : 悬停条目 || 选中;
  const n = 按路径[主];
  const 近 = n ? (悬停关联 ? new Set([主, 悬停关联]) : 一跳(n)) : new Set();
  document.querySelectorAll('.卡').forEach(c => {
    const p = c.dataset.路径;
    c.classList.toggle('选', p === 选中);
    c.classList.toggle('悬', p === 悬停条目 || p === 悬停关联);
    c.classList.toggle('邻', p !== 主 && p !== 选中 && 近.has(p));
    c.classList.toggle('暗', 近.size > 1 && !近.has(p) && p !== 选中);
  });
}



// 正文里的 [[名]]、[[名|显示]]、[[名#标题]]、[[#标题]]：找得到的条目渲染成链接，点击跳到卡片并滚到该标题；
// 找不到的只留文字，标 .未找到。表格里的 \| 当作显示名分隔。
function 双链html(内){
  const [目标, ...显] = 内.replace(/\\\|/g, '|').split('|');
  const 井 = 目标.indexOf('#');
  const 名 = (井 < 0 ? 目标 : 目标.slice(0, 井)).trim(), 锚 = 井 < 0 ? '' : 目标.slice(井 + 1).trim();
  const 文 = 显.join('|').trim() || [名, 锚.split('#').pop()].filter(Boolean).join(' › ');
  const n = 名 ? 解析(名) : null;
  if (名 && !n) return `<span class="双链 未找到" title="${转义('未找到：' + 名)}">${转义(文)}</span>`;
  const 路径 = n?.路径 || '';
  return `<a class="双链" href="${n ? '/文件/' + 转义(encodeURI(路径)) : '#'}" data-双链="${转义(路径)}" data-锚="${转义(锚)}"`
    + (n ? ` data-关联="${转义(路径)}" style="--关联色:${转义(色(n.类型))}"` : '') + `>${转义(文)}</a>`;
}
// 先转义，再渲染常用 Markdown；原始 HTML 只作为文本显示。行内代码里的内容原样显示。
function 正文html(文本){
  const 行内 = t => t.split(/(`[^`]+`|\[\[[^\]\n]+?\]\])/).map((段, i) => {
    if (i % 2) return 段[0] === '`' ? '<code>' + 转义(段.slice(1, -1)) + '</code>' : 双链html(段.slice(2, -2));
    return 转义(段).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (原, 文, 链) => {
        if (!/^https?:\/\//i.test(链)) return 文;
        return `<a href="${链}" target="_blank" rel="noopener noreferrer">${文}</a>`;
      });
  }).join('');
  const ls = 文本.replace(/\r\n/g, '\n').split('\n');
  let out = [], 段 = [], 列 = null;
  const 收段 = () => { if (段.length) out.push('<p>' + 段.map(行内).join('<br>') + '</p>'); 段 = []; };
  const 收列 = () => { if (列) out.push(`</${列}>`); 列 = null; };
  const 格 = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|(?![^\[]*\]\])/).map(x => x.trim());
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (/^\s*```/.test(l)) {
      收段(); 收列(); const code = [];
      while (++i < ls.length && !/^\s*```/.test(ls[i])) code.push(ls[i]);
      out.push('<pre><code>' + 转义(code.join('\n')) + '</code></pre>'); continue;
    }
    if (l.includes('|') && i + 1 < ls.length && /^\s*\|?\s*:?-{3,}/.test(ls[i+1])) {
      收段(); 收列(); let table = '<div class="表滚"><table><thead><tr>' + 格(l).map(x => '<th>' + 行内(x) + '</th>').join('') + '</tr></thead><tbody>'; i++;
      while (i + 1 < ls.length && ls[i+1].includes('|') && ls[i+1].trim()) table += '<tr>' + 格(ls[++i]).map(x => '<td>' + 行内(x) + '</td>').join('') + '</tr>';
      out.push(table + '</tbody></table></div>'); continue;
    }
    const 标 = l.match(/^(#{1,6})\s+(.+)/), 项 = l.match(/^\s*([-*+] |\d+\. )(.+)/);
    if (项) { 收段(); const kind = /^\d/.test(项[1]) ? 'ol' : 'ul'; if (列 !== kind) { 收列(); out.push(`<${kind}>`); 列 = kind; } out.push('<li>' + 行内(项[2]) + '</li>'); continue; }
    收列();
    if (标) { 收段(); const level = Math.min(标[1].length, 4); out.push(`<h${level}>${行内(标[2])}</h${level}>`); }
    else if (/^>\s?/.test(l)) { 收段(); out.push('<blockquote>' + 行内(l.replace(/^>\s?/, '')) + '</blockquote>'); }
    else if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { 收段(); out.push('<hr>'); }
    else if (!l.trim()) 收段();
    else 段.push(l);
  }
  收段(); 收列(); return out.join('');
}



function 收卡(恢复焦点 = true){
  清除卡片悬停();
  正文请求?.abort(); 正文请求 = null;
  const card = 展开卡, panel = $('#屉');
  const 原框 = card?._过渡壳?.getBoundingClientRect() || card?.getBoundingClientRect();
  停卡片动效(card);
  if (panel) { panel.classList.remove('开'); document.body.appendChild(panel); }
  if (card) {
    card.classList.remove('展开');
    card.style.transform = ''; card._原高 = null;
    card.setAttribute('role', 'button'); card.setAttribute('aria-expanded', 'false');
    card.removeAttribute('aria-labelledby'); card.closest('.盒')?.classList.remove('聚起');
  }
  展开卡 = null; 选中 = null; 选中步 = null; 悬停条目 = null; 悬停关联 = null;
  document.body.removeAttribute('data-阅读中');
  document.querySelectorAll('.卡.选,.步.选,.卡.邻,.卡.暗,.卡.悬').forEach(e => e.classList.remove('选', '邻', '暗', '悬'));
  if (视图 !== '路线') $('#线').innerHTML = '';
  if (恢复焦点 && card?.isConnected) card.focus({preventScroll:true});
  if (恢复焦点 && card?.isConnected) 卡片过渡(card, 原框);
  布置阅读幕();
}

// 动效壳只延展表面，正文保持真实字号，避免把文字拉成长条。





function 装入卡(card){
  if (!card) return;
  const 原框 = card._过渡壳?.getBoundingClientRect() || card.getBoundingClientRect();
  停卡片动效(card); card._入场动画?.cancel();
  停镜头();

  card._原高 = card.offsetHeight;
  展开卡 = card; card.classList.add('展开', '选'); card.closest('.盒')?.classList.add('聚起');
  // 阅读时展开卡之外的一切都在它后面、不接收鼠标：基础.css 据此把画布盖到固定界面上，点在别处都落到 #台 上收卡。
  document.body.setAttribute('data-阅读中', '');
  card.setAttribute('role', 'region'); card.setAttribute('aria-expanded', 'true');
  const panel = $('#屉'); card.appendChild(panel); panel.classList.add('开');
  主题.装配详情?.(panel);
  // 详情模板由主题提供；缺连接点时提示作者，不让整张卡片展开失败。
  const 缺 = ['h3', '.收起', '.详情体'].filter(sel => !panel.querySelector(sel));
  if (缺.length) { console.error('主题详情模板缺少连接点：', 缺); 提示('主题详情模板缺少连接点：' + 缺.join('、')); }
  const 标题节点 = panel.querySelector('h3');
  if (标题节点) { 标题节点.id = '详情标题'; card.setAttribute('aria-labelledby', '详情标题'); }
  panel.querySelectorAll('[onclick]:not(button):not(a)').forEach(e => {
    e.tabIndex = 0; e.setAttribute('role', 'button');
    e.onkeydown = ev => { if (ev.target === e && ['Enter',' '].includes(ev.key)) { ev.preventDefault(); e.click(); } };
  });
  绑关联(panel);
  定位展开(); panel.querySelector('.收起')?.focus({preventScroll:true});
  卡片过渡(card, 原框);
}

// 悬停或聚焦关联入口时高亮画布上对应的卡片；正文双链在正文读完后再绑一次。
function 绑关联(根){
  根.querySelectorAll('[data-关联]').forEach(e => {
    const 开 = () => { 悬停关联 = e.dataset.关联; 更新关联(); };
    const 关 = () => { 悬停关联 = null; 更新关联(); };
    e.onpointerenter = ev => { if (ev.pointerType !== 'touch') 开(); };
    e.onpointerleave = 关; e.onfocus = 开; e.onblur = 关;
  });
}
// 在阅读滚动容器里把某个元素滚到顶部附近；展开卡可能带画布缩放，屏幕距离要换回元素自身的 px。
function 滚到(体, el){
  const 比 = 体.getBoundingClientRect().height / 体.offsetHeight || 1;
  体.scrollTo({top: 体.scrollTop + (el.getBoundingClientRect().top - 体.getBoundingClientRect().top) / 比 - 16, behavior: 可动() ? 'smooth' : 'auto'});
}
// 双链锚点按标题文字找（忽略空白和大小写），[[名#父#子]] 取最后一段；先精确匹配，再找包含它的标题。
function 找锚(根, 锚){
  const 规 = x => x.replace(/\s+/g, '').toLowerCase(), k = 规(锚.split('#').pop());
  const 标们 = [...根.querySelectorAll('h1,h2,h3,h4')];
  return k ? 标们.find(h => 规(h.textContent) === k) || 标们.find(h => 规(h.textContent).includes(k)) : null;
}
function 跳锚(根, 体, 锚){
  if (!锚 || !根 || !体) return;
  const h = 找锚(根, 锚);
  if (h) 滚到(体, h); else 提示('这篇里没找到标题「' + 锚.split('#').pop() + '」');
}

// 详情侧栏分区：主题在模板里给出 [data-侧区] 区块（.侧区头 按钮 + .侧区体），核心负责折叠和记忆。
// 带 data-独立 的区自己开合；其余区同一时间只展开一个。折叠状态按项目记在浏览器里。
// 核心只写 data-展开 和区体的 inert，收起时怎么隐藏、要不要动画由主题 CSS 决定。
const 侧区键 = () => 'atlas:侧区:' + 项目根;
function 读侧区(){
  let s; try { s = JSON.parse(localStorage.getItem(侧区键())); } catch {}
  return s && typeof s === 'object' ? s : {独立:{}, 展开:'标题'};
}
function 排侧区(panel){
  const 区们 = [...panel.querySelectorAll('[data-侧区]')];
  if (!区们.length) return;
  const s = 读侧区(), 组 = 区们.filter(e => !e.hasAttribute('data-独立') && !e.hidden);
  // 记住的区在这篇里没有时，临时展开第一个可见区，不改记忆；用户全收起时保持全收起。
  const 展开名 = s.展开 === null ? null : 组.some(e => e.dataset.侧区 === s.展开) ? s.展开 : 组[0]?.dataset.侧区;
  区们.forEach(e => {
    const 开 = e.hasAttribute('data-独立') ? s.独立?.[e.dataset.侧区] !== false : e.dataset.侧区 === 展开名;
    e.toggleAttribute('data-展开', 开);
    e.querySelector('.侧区头')?.setAttribute('aria-expanded', String(开));
    // 收起的区体不用 hidden，留给主题做展开收起动画；inert 让它不可聚焦、读屏也跳过。
    const 体 = e.querySelector('.侧区体'); if (体) 体.inert = !开;
  });
}
function 绑侧区(panel){
  panel.querySelectorAll('[data-侧区]').forEach(e => {
    const 头 = e.querySelector('.侧区头'), 体 = e.querySelector('.侧区体');
    if (!头 || !体) return;
    体.id = '侧区-' + e.dataset.侧区; 头.setAttribute('aria-controls', 体.id);
    头.onclick = () => {
      const s = 读侧区(), 开 = !e.hasAttribute('data-展开');
      if (e.hasAttribute('data-独立')) s.独立 = {...s.独立, [e.dataset.侧区]: 开};
      else s.展开 = 开 ? e.dataset.侧区 : null;
      try { localStorage.setItem(侧区键(), JSON.stringify(s)); } catch {}
      排侧区(panel);
    };
  });
  排侧区(panel);
}
// 正文标题大纲：填进模板的 [data-大纲] 槽；点击在 .详情体 内滚到标题，滚动时标出当前所在标题。
function 建大纲(panel){
  const 槽 = panel.querySelector('[data-大纲]'), 正文 = panel.querySelector('#原'), 体 = panel.querySelector('.详情体');
  if (!槽 || !正文 || !体) return;
  const 标们 = [...正文.querySelectorAll('h1,h2,h3,h4')];
  // 正文开头和详情标题同名的大标题不进大纲。
  if (标们[0]?.textContent.trim() === panel.querySelector('h3')?.textContent.trim()) 标们.shift();
  const 区 = 槽.closest('[data-侧区]'); if (区) 区.hidden = !标们.length;
  const 最浅 = Math.min(...标们.map(h => +h.tagName[1]));
  槽.innerHTML = 标们.map((h, i) => { h.id = '原-标题-' + i;
    return `<button type="button" class="大纲项" data-级="${+h.tagName[1] - 最浅 + 1}" data-i="${i}">${转义(h.textContent)}</button>`; }).join('');
  const 比 = () => 体.getBoundingClientRect().height / 体.offsetHeight || 1;
  槽.onclick = ev => { const h = 标们[+ev.target.closest('.大纲项')?.dataset.i]; if (h) 滚到(体, h); };
  let 帧 = 0;
  const 亮 = () => { 帧 = 0;
    const 顶 = 体.getBoundingClientRect().top, k = 比();
    let 当前 = -1;
    标们.forEach((h, i) => { if ((h.getBoundingClientRect().top - 顶) / k <= 40) 当前 = i; });
    if (体.scrollTop > 0 && 体.scrollTop + 体.clientHeight >= 体.scrollHeight - 2) 当前 = 标们.length - 1;
    const 项们 = 槽.querySelectorAll('.大纲项');
    项们.forEach((b, i) => i === 当前 ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
    const b = 项们[当前], 滚 = 槽.closest('.侧区体');
    if (!b || !滚 || 滚.inert) return;
    const r = b.getBoundingClientRect(), R = 滚.getBoundingClientRect();
    if (r.top < R.top) 滚.scrollTop -= (R.top - r.top) / k;
    else if (r.bottom > R.bottom) 滚.scrollTop += (r.bottom - R.bottom) / k;
  };
  体.onscroll = () => { 帧 ||= requestAnimationFrame(亮); };
  排侧区(panel); 亮();
}



function 资产预览html(路径){
  const 址 = '/文件/' + encodeURI(路径), 后 = (路径.split('.').pop() || '').toLowerCase();
  if (图后缀.test(路径)) return `<p><img class="资产预览" src="${转义(址)}" alt="${转义(路径.split('/').pop())}" style="max-width:100%;height:auto"></p>`;
  if (['mp4', 'webm', 'mov', 'm4v'].includes(后)) return `<p><video class="资产预览" src="${转义(址)}" controls preload="metadata" style="width:100%;max-height:70vh"></video></p>`;
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(后)) return `<p><audio class="资产预览" src="${转义(址)}" controls style="width:100%"></audio></p>`;
  if (['html', 'htm'].includes(后)) return `<p><a href="${转义(址)}" target="_blank" rel="noopener">在新标签页打开这个网页 ↗</a></p>` +
    `<iframe class="资产预览" src="${转义(址)}" title="${转义(路径)}" style="width:100%;aspect-ratio:16/9;border:0"></iframe>`;
  if (后 === 'pdf') return `<iframe class="资产预览" src="${转义(址)}" title="${转义(路径)}" style="width:100%;height:70vh;border:0"></iframe>`;
  return `<p class="读取">这个文件不能在这里预览，<a href="${转义(址)}" target="_blank" rel="noopener">在新标签页打开 ↗</a>。</p>`;
}

function 开抽屉(n){
  const card = $('#世界').querySelector(`.卡[data-路径="${CSS.escape(n.路径)}"]`);
  if (!card) return;
  $('#屉').innerHTML = 主题.模板.条目详情({n, 按路径, 解析});
  绑侧区($('#屉')); 装入卡(card);
  const 正文 = $('#原');
  if (!正文) { 阅读完成 = Promise.resolve(); 提示('主题条目详情缺少 #原 正文插槽'); return; }
  // 资产卡不是文档：直接内嵌预览，不把图片、视频当文本读
  const 文本资产 = n.资产文件 && /\.(srt|txt)$/i.test(n.路径);
  if (n.资产文件 && !文本资产) { 正文.innerHTML = 资产预览html(n.路径); 阅读完成 = Promise.resolve(); 建大纲($('#屉')); 定位展开(); return; }
  正文请求 = new AbortController();
  const controller = 正文请求;
  阅读完成 = fetch((文本资产 ? '/预览/' : '/文件/') + encodeURIComponent(n.路径), {signal: controller.signal}).then(r => {
    if (!r.ok) throw new Error('读取失败'); return 文本资产 ? r.json() : r.text();
  }).then(t => {
    if (controller.signal.aborted || !正文.isConnected) return;
    正文.innerHTML = 文本资产 ? `<pre><code>${转义(t.内容 || '文件为空。')}</code></pre>`
      : 正文html(t.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) || '<p class="读取">这篇文档还没有正文。</p>';
    绑关联(正文); 建大纲($('#屉')); 定位展开();
  }).catch(e => { if (e.name !== 'AbortError' && 正文.isConnected) 正文.innerHTML = '<p>正文读取失败，请收起卡片后重新打开，或点击「打开原文」。</p>'; });
}

function 选步骤(路线名, 步id){
  const r = 找路线(路线名); if (!r) return;
  const s = r.步骤.find(x => x.id === 步id); if (!s) return;
  收卡(false);
  选中步 = {路线: 路线名, 步: 步id};
  document.querySelectorAll('.步').forEach(e => e.classList.toggle('选',
    e.dataset.路线 === 路线名 && e.dataset.步 === 步id));
  $('#屉').innerHTML = 主题.模板.步骤详情({r, s, 路线名, 步id, 路线文件});
  装入卡($('#世界').querySelector(`.步[data-路线="${CSS.escape(路线名)}"][data-步="${CSS.escape(步id)}"]`));
  const 步骤标题节点 = $('#详情标题');
  if (步骤标题节点) 步骤标题节点.innerHTML = `<button class="步骤标题按钮" title="点击编辑步骤标题" onclick="${转义(`编辑步骤标题(${JSON.stringify(路线名)},${JSON.stringify(步id)})`)}">${转义(s.title)}<span aria-hidden="true">✎</span></button>`;
}

function 切视图(v){
  if (v === 视图) return;
  // 导航共享当前缩放与平移；这是画布行为，不随主题改变。
  停镜头(); 收卡(false); 视图 = v; 画签(); 画();
}
function 跳(路径, 锚 = ''){
  const n = 按路径[路径]; if (!n) return;
  收卡(false);
  if (n.库 && n.库 !== 视图 && 视图们.includes(n.库)) { 视图 = n.库; 画签(); 画(); }
  聚焦(路径); 选条目(路径);
  if (!展开卡) { window.open('/文件/' + encodeURI(路径), '_blank', 'noopener'); return; }
  if (锚) 阅读完成.then(() => { if (选中 === 路径) 跳锚($('#原'), $('#屉 .详情体'), 锚); });
}
function 去路线(名){
  收卡(false);
  切视图('路线');
  const r = 找路线(名); if (!r) return;
  const selector = `[data-路线="${CSS.escape(名)}"]`;
  const e = $('#世界').querySelector('.步' + selector) || $('#世界').querySelector('.路线标题' + selector);
  if (e) { 缩 = .85; 位 = {x:40 - parseFloat(e.style.left)*缩,y:30 - parseFloat(e.style.top)*缩}; 应用变换(); }
  if (r.步骤.length) 选步骤(名,r.步骤[0].id);
}
// 用系统默认应用打开，或在访达里选中；失败时退回浏览器新标签页看原文。
async function 系统打开(路径, 显示 = false){
  try {
    const r = await fetch('/系统打开', {method: 'POST', headers: 项目头(), body: JSON.stringify({路径, 显示})});
    const j = await r.json();
    if (!j.好) throw new Error(j.错误 || '打开失败');
    提示(显示 ? '已在访达中显示' : '已用默认应用打开');
  } catch (e) {
    if (显示) 提示(e.message || '打开失败'); else window.open('/文件/' + encodeURI(路径), '_blank', 'noopener');
  }
}
async function 抄(t){
  try { await navigator.clipboard.writeText(t); 提示('已复制 ' + t); }
  catch { 提示('复制失败，请手动选择路径复制'); }
}
function 聚焦(路径){
  const e = $('#世界').querySelector(`.卡[data-路径="${CSS.escape(路径)}"]`); if (!e) return;
  const 盒 = e.closest('.盒');
  const x = parseFloat(盒.style.left) + e.offsetLeft, y = parseFloat(盒.style.top) + e.offsetTop;
  缩 = Math.max(缩, 0.85);
  位 = {x: $('#台').clientWidth / 2 - (x + 卡宽 / 2) * 缩, y: 阅读区域().顶 + 阅读区域().高 / 2 - (y + 80) * 缩};
  应用变换();
}
// 仅决定初始视野和阅读面板的落点，画布本身始终覆盖整个窗口。

function 阅读视野(){
  const 初始 = 主题.初始视野(); if (!初始) return;
  缩 = 初始.缩; 位 = 初始.位; 应用变换();
}

function 回全局(){
  收卡(false);
  const items = [...$('#世界').querySelectorAll('.盒,.步,.空')];
  if (!items.length) { 缩 = .85; 位 = {x:30,y:24}; 应用变换(); return; }
  const bounds = items.map(e => ({x:parseFloat(e.style.left)||0,y:parseFloat(e.style.top)||0,w:e.offsetWidth,h:e.offsetHeight}));
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y)) - (视图 === '路线' ? 主题.布局.路线标题距 : 0);
  const w = Math.max(...bounds.map(b => b.x+b.w))-x, h = Math.max(...bounds.map(b => b.y+b.h))-y;
  const 台宽 = $('#台').clientWidth, 区 = 阅读区域();
  const 目标缩 = Math.max(.12, Math.min(.95, (台宽-64)/w, (区.高-32)/h));
  移镜头(目标缩,{x:(台宽-w*目标缩)/2-x*目标缩,y:区.顶+16-y*目标缩});
}

// ---------------------------------------------------------------- 变换
let 镜头帧=null;
function 停镜头(){ if (镜头帧!==null) cancelAnimationFrame(镜头帧); 镜头帧=null; }
function 移镜头(目标缩,目标位){
  停镜头();
  if (!可动()) { 缩=目标缩;位=目标位;应用变换();return; }
  const from={缩,x:位.x,y:位.y}, start=performance.now();
  function frame(now){
    const t=Math.min(1,(now-start)/主题.镜头时长), eased=主题.镜头缓动(t);
    缩=from.缩+(目标缩-from.缩)*eased;
    位={x:from.x+(目标位.x-from.x)*eased,y:from.y+(目标位.y-from.y)*eased};
    应用变换(); 镜头帧=t<1?requestAnimationFrame(frame):null;
  }
  镜头帧=requestAnimationFrame(frame);
}
function 应用变换(){
  $('#世界').style.transform = `translate(${位.x}px,${位.y}px) scale(${缩})`;
  document.documentElement.style.setProperty('--缩', 缩);
  主题.缩放外观(缩);
  $('#缩').textContent = Math.round(缩 * 100) + '%';
  定位展开(); 布置阅读幕();
  if (!展开卡) 更新关联();
}
const 台 = $('#台');
台.addEventListener('pointerdown', () => 清除卡片悬停(), true);
台.addEventListener('wheel', e => {
  if (e.target.closest('#屉')) return;
  e.preventDefault(); if (展开卡) return;
  停镜头(); 清除卡片悬停();
  const k = Math.exp(-e.deltaY * 0.0016), 新 = Math.min(2.4, Math.max(0.12, 缩 * k));
  const r = 台.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  位.x = mx - (mx - 位.x) * (新 / 缩); 位.y = my - (my - 位.y) * (新 / 缩);
  缩 = 新; 应用变换();
}, {passive: false});
let 拖 = null;
台.addEventListener('pointerdown', e => {
  if (e.button !== 0 || 展开卡 || e.target.closest('.卡,.步,.盒,button,a,input,.编辑条')) return;
  停镜头();
  拖 = {x: e.clientX - 位.x, y: e.clientY - 位.y}; 台.classList.add('拖');
  台.setPointerCapture(e.pointerId);
});
台.addEventListener('pointermove', e => {
  if (!拖) return; 位 = {x: e.clientX - 拖.x, y: e.clientY - 拖.y}; 应用变换();
});
台.addEventListener('pointerup', () => { 拖 = null; 台.classList.remove('拖'); });
台.addEventListener('click', e => {
  if (e.target.closest('.卡,.步,button,a,input,.编辑条')) return;
  收卡();
});
$('#回').onclick = 回全局;
function 调缩(k){
  const 新 = Math.max(.12,Math.min(2.4,缩*k)), x = 台.clientWidth/2, y = 台.clientHeight/2;
  移镜头(新,{x:x-(x-位.x)*新/缩,y:y-(y-位.y)*新/缩});
}
$('#放大').onclick = () => 调缩(1.2);
$('#缩小').onclick = () => 调缩(1/1.2);
window.addEventListener('resize', () => { if (!主题) return; 停镜头(); document.querySelectorAll('.卡,.步').forEach(停卡片动效);定位导航();定位展开();布置阅读幕();定位主题面板();if ($('#文件预览').open) 定位文件预览(); });
$('#屉').addEventListener('click', e => e.stopPropagation());
$('#屉').addEventListener('pointerdown', e => e.stopPropagation());

// ---------------------------------------------------------------- 拖动卡片存布局
let 存计时 = null;
function 存布局(){
  clearTimeout(存计时);
  存计时 = setTimeout(() => fetch('/布局', {method: 'POST', headers: 项目头(), body: JSON.stringify(布局)}), 400);
}
function 装拖动(选择器, 属性){
  $('#世界').querySelectorAll(选择器).forEach(e => {
    e.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest('#屉,.柄,button,input,a') || e.classList.contains('展开')) return;
      if (ev.target.closest('.卡') && 选择器 === '.盒') return;
      ev.stopPropagation(); 停镜头(); e._入场动画?.cancel(); 停卡片动效(e);
      const id = e.getAttribute(属性);
      const 起 = {x: ev.clientX, y: ev.clientY,
                 ox: parseFloat(e.style.left), oy: parseFloat(e.style.top)};
      const 布局快照 = JSON.parse(JSON.stringify(布局));
      e.setPointerCapture(ev.pointerId);
      const 动 = m => {
        const dx = (m.clientX - 起.x) / 缩, dy = (m.clientY - 起.y) / 缩;
        if (Math.abs(dx) + Math.abs(dy) > 3) e._拖过 = true;
        e.style.left = (起.ox + dx) + 'px'; e.style.top = (起.oy + dy) + 'px';
        更新关联();
        if (视图 === '路线') 重画路线边();
      };
      const 停 = () => {
        e.removeEventListener('pointermove', 动); e.removeEventListener('pointerup', 停);
        if (e._拖过) {
          // 步骤存的是路线平移前的位置，主题按它排布，核心再整体平移。
          const 移 = 选择器 === '.步' && 布局[路线键(e.dataset.路线)] || {x: 0, y: 0};
          布局[id] = {x: parseFloat(e.style.left) - 移.x, y: parseFloat(e.style.top) - 移.y};
          记布局('挪了 ' + id.split(':').pop(), 布局快照,
                JSON.parse(JSON.stringify(布局)));
          存布局();
          if (视图 === '路线') 画();
        }
      };
      e.addEventListener('pointermove', 动); e.addEventListener('pointerup', 停);
    });
  });
}

// 拖路线标题：标题、编辑条和这条路线的全部步骤一起走，松手存成整条路线的平移量。
const 路线键 = 名 => '路线:' + 名;
function 装路线拖动(){
  $('#世界').querySelectorAll('.路线标题').forEach(t => t.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || ev.target.closest('button,input,a,[contenteditable]')) return;
    ev.stopPropagation(); ev.preventDefault(); 停镜头();
    const 名 = t.dataset.路线, 键 = 路线键(名);
    const 同路 = [...$('#世界').querySelectorAll('.路线标题,.编辑条,.步')].filter(e => e.dataset.路线 === 名)
      .map(e => { e._入场动画?.cancel(); if (e.matches('.步')) 停卡片动效(e);
                  return {e, x: parseFloat(e.style.left), y: parseFloat(e.style.top)}; });
    const 起 = {x: ev.clientX, y: ev.clientY}, 旧移 = 布局[键] || {x: 0, y: 0};
    const 布局快照 = JSON.parse(JSON.stringify(布局));
    let dx = 0, dy = 0, 拖过 = false;
    t.setPointerCapture(ev.pointerId);
    const 动 = m => {
      dx = (m.clientX - 起.x) / 缩; dy = (m.clientY - 起.y) / 缩;
      if (Math.abs(dx) + Math.abs(dy) > 3) 拖过 = true;
      同路.forEach(o => { o.e.style.left = (o.x + dx) + 'px'; o.e.style.top = (o.y + dy) + 'px'; });
      重画路线边();
    };
    const 停 = () => {
      t.removeEventListener('pointermove', 动); t.removeEventListener('pointerup', 停);
      if (!拖过) return;
      布局[键] = {x: 旧移.x + dx, y: 旧移.y + dy};
      记布局('挪了路线 ' + 名, 布局快照, JSON.parse(JSON.stringify(布局)));
      存布局(); 画();
    };
    t.addEventListener('pointermove', 动); t.addEventListener('pointerup', 停);
  }));
}

// ---------------------------------------------------------------- 产出
// 产出/ 是 AI 的倾倒区，大部分要人看过确认。产出窗按批次看：说明置顶、文件预览墙、新文件标记、通过／打回。
// 「新」= 上次打开这一批之后改动过的文件，AI 不用做任何标记；审阅状态由服务端存在 .atlas/审阅.json。
// 面板由核心生成，结构和默认配色在 基础.css，主题只给外框、头部和入口按钮的外观。
let 产出批 = null, 产出选中 = null, 产出基线 = 0, 产出请求 = null, 产出预览位 = null, 产出序列 = [];
let 产出筛 = {种类: '全部', 只新: false, 过程: false};
const 产出开合 = new Map(), 产出种类 = ['图片', '视频', '音频', '网页', '文档', '其他'];
const 产出名 = 目录 => 目录.replace(/^产出\//, '').replace(/\/$/, '');
// 文件在批内所在的子目录；散放在 产出/ 下的单个文件算批次根目录
const 产出子目录 = f => 产出批.目录.endsWith('/') ? f.路径.slice(产出批.目录.length).split('/').slice(0, -1).join('/') : '';
const 产出新数 = () => (数据?.产出批次 || []).filter(b => b.新数 > 0);
function 多久前(秒){
  const d = Date.now() / 1000 - 秒;
  return d < 60 ? '刚刚' : d < 3600 ? `${Math.floor(d / 60)} 分钟前` : d < 86400 ? `${Math.floor(d / 3600)} 小时前` : `${Math.floor(d / 86400)} 天前`;
}
function 画产出入口(){
  const 待 = 产出新数(), c = $('#产出控件'), 钮 = $('#产出选择');
  if (待.length) c.dataset.新 = 待.length; else delete c.dataset.新;
  钮.title = 待.length ? `产出：${待.length} 批有新东西待看` : '产出：查看 AI 的中间产出';
  钮.setAttribute('aria-label', 待.length ? `产出，${待.length} 批有新东西` : '产出');
  if ($('#产出窗').open) 画产出批次();
}
function 画产出批次(){
  const 批 = [...(数据?.产出批次 || [])].sort((a, b) => b.最新 - a.最新), 待 = 产出新数().length;
  $('#产出窗计数').textContent = 批.length ? `${批.length} 批` + (待 ? ` · ${待} 批有新的` : '') : '';
  $('#产出批次').innerHTML = 批.length ? 批.map(b => `<button type="button" class="产出批次项" data-批="${转义(b.目录)}"`
      + `${b.目录 === 产出选中 ? ' aria-current="true"' : ''}${b.过期 ? ' data-过期' : ''}>`
      + `<b>${转义(产出名(b.目录))}</b><small>${b.件数} 件 · ${多久前(b.最新)}${b.过期 ? ' · 该清了' : ''}</small>`
      + (b.新数 ? `<span class="产出新">${b.新数} 新</span>` : '') + '</button>').join('')
    : '<p class="产出空">产出/ 里还没有东西。AI 不知道放哪的文件都会落在这里。</p>';
}
async function 打开产出窗(){
  const d = $('#产出窗'); 取消关闭(d);
  if (!d.open) d.showModal();
  $('#产出选择').setAttribute('aria-expanded', 'true');
  await 刷新产出批次();
  const 批 = [...(数据?.产出批次 || [])].sort((a, b) => b.最新 - a.最新);
  const 目标 = 批.find(b => b.目录 === 产出选中) || 批.find(b => b.新数) || 批[0];
  if (目标) 选产出批(目标.目录); else { 产出选中 = null; 产出批 = null; $('#产出批').innerHTML = ''; }
}
async function 刷新产出批次(){
  try { const 列 = await (await fetch('/产出')).json(); if (数据 && Array.isArray(列)) 数据.产出批次 = 列; } catch {}
  画产出入口(); 画产出批次();
}
// 打开一批：记下它上次看过的时间做基线（本次一直按它标新），再告诉服务端这批看过了。
async function 选产出批(目录, 保留 = false){
  const 换批 = 目录 !== 产出选中;
  产出选中 = 目录; 画产出批次();
  产出请求?.abort(); const c = 产出请求 = new AbortController();
  const 区 = $('#产出批'), 滚 = 保留 ? 区.scrollTop : 0;
  if (!保留) 区.innerHTML = '<p class="读取">正在读取…</p>';
  try {
    const r = await fetch('/产出批/' + encodeURIComponent(目录), {signal: c.signal}), j = await r.json();
    if (!r.ok) throw new Error(j.错误 || '读取失败');
    if (换批 || !保留) { 产出基线 = j.看过; if (换批) 产出筛 = {种类: '全部', 只新: false, 过程: false}; }
    产出批 = j; 画产出批(); 区.scrollTop = 滚;
    const b = (数据?.产出批次 || []).find(x => x.目录 === 目录);
    if (b?.新数) { b.新数 = 0; 画产出入口(); }
    fetch('/审阅', {method: 'POST', headers: 项目头(), body: JSON.stringify({看过: 目录})}).catch(() => {});
  } catch (e) { if (e.name !== 'AbortError') 区.innerHTML = `<p class="读取">读取失败：${转义(e.message)}</p>`; }
}
const 产出新 = f => f.时间 > 产出基线;
function 产出可见(){
  const 筛 = 产出筛;
  return (产出批?.文件 || []).filter(f => (筛.过程 || !f.过程) && (!筛.只新 || 产出新(f)) && (筛.种类 === '全部' || f.种类 === 筛.种类));
}
function 产出件html(f){
  const 址 = '/文件/' + encodeURI(f.路径), 名 = f.路径.split('/').pop(), 后 = (名.includes('.') ? 名.split('.').pop() : '').toUpperCase();
  const 图 = f.种类 === '图片' ? `<img src="${转义(址)}" alt="" loading="lazy" draggable="false">`
    : f.种类 === '视频' ? `<video data-src="${转义(址)}#t=0.1" muted playsinline preload="none"></video><span class="产出符">▶ ${转义(后)}</span>`
    : `<span class="产出符">${转义(后 || '文件')}</span>`;
  const 标钮 = (状态, 字) => `<button type="button" data-产出标="${状态}" aria-pressed="${f.标记 === 状态}" title="${状态}">${字}</button>`;
  return `<div class="产出件" data-路径="${转义(f.路径)}" data-种类="${f.种类}"${f.标记 ? ` data-标记="${f.标记}"` : ''}${产出新(f) ? ' data-新' : ''}>`
    + `<button type="button" class="产出缩略" data-产出看="${转义(f.路径)}" title="预览 ${转义(名)}">${图}</button>`
    + (f.种类 === '音频' ? `<audio src="${转义(址)}" controls preload="none"></audio>` : '')
    + `<div class="产出件名" title="${转义(f.路径)}">${转义(名)}</div>`
    + `<div class="产出件钮">${标钮('通过', '✓ 通过')}${标钮('打回', '✕ 打回')}`
    + `<button type="button" data-产出动作="打开" data-路径="${转义(f.路径)}" title="用默认应用打开">打开</button>`
    + `<button type="button" data-产出动作="访达" data-路径="${转义(f.路径)}" title="在访达中显示">访达</button></div></div>`;
}
function 画产出批(){
  const j = 产出批, 区 = $('#产出批'); if (!j) return;
  const 不含过程 = j.文件.filter(f => 产出筛.过程 || !f.过程);
  const 数 = k => 不含过程.filter(f => (!产出筛.只新 || 产出新(f)) && (k === '全部' || f.种类 === k)).length;
  const 新数 = j.文件.filter(f => (产出筛.过程 || !f.过程) && 产出新(f)).length, 过程数 = j.文件.filter(f => f.过程).length;
  const 可见 = 产出可见();
  // 按所在子目录分组；目录按其中最新的文件排，批次根目录永远在最前
  const 组 = new Map();
  for (const f of 可见) { const 目 = 产出子目录(f); if (!组.has(目)) 组.set(目, []); 组.get(目).push(f); }
  const 组们 = [...组].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0));
  产出序列 = 组们.flatMap(([, fs]) => fs);  // 翻看顺序和墙上一致
  // 默认：总数不多就全开，多了只开前三个不太大的组；用户亲手开合过的组按他的来
  const 手 = 产出开合.get(j.目录) || new Map(); 产出开合.set(j.目录, 手);
  const 开 = new Set(组们.filter(([目, fs], i) => 手.has(目) ? 手.get(目) : 可见.length <= 200 || (i < 3 && fs.length <= 120)).map(([目]) => 目));
  const 说明 = j.说明.map((n, i) => `<details class="产出说明"${i ? '' : ' open'}><summary><b>${转义(n.路径.split('/').pop())}</b><small>${多久前(n.时间)}</small></summary>`
    + `<div class="正文">${n.格式 === 'markdown' ? 正文html(n.内容.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) : `<pre>${转义(n.内容)}</pre>`}</div></details>`).join('');
  const 片 = k => `<button type="button" data-产出种="${k}" aria-pressed="${产出筛.种类 === k}">${k} <small>${数(k)}</small></button>`;
  区.innerHTML = `<div class="产出批头"><div><h3>${转义(产出名(j.目录))}</h3><small>${j.总数} 件 · 最近改动 ${多久前(j.文件[0]?.时间 || 0)}</small></div>`
    + `<div class="产出批钮"><button type="button" data-产出动作="访达" data-路径="${转义(j.目录)}">在访达中显示</button>`
    + `<button type="button" data-产出动作="复制" data-路径="${转义(j.目录)}">复制路径</button></div></div>`
    + (说明 ? `<div class="产出说明们">${说明}</div>` : '')
    + `<div class="产出筛" role="toolbar" aria-label="筛选">${['全部', ...产出种类].filter(k => k === '全部' || 数(k)).map(片).join('')}`
    + `<label><input type="checkbox" data-产出筛="只新"${产出筛.只新 ? ' checked' : ''}${新数 ? '' : ' disabled'}> 只看新的 <small>${新数}</small></label>`
    + (过程数 ? `<label><input type="checkbox" data-产出筛="过程"${产出筛.过程 ? ' checked' : ''}> 显示过程文件 <small>${过程数}</small></label>` : '') + '</div>'
    + (j.总数 > j.文件.length ? `<p class="产出提醒">这一批有 ${j.总数} 件，这里只列出最近改动的 ${j.文件.length} 件，其余请在访达里看。</p>` : '')
    + (可见.length ? 组们.map(([目, fs]) => `<details class="产出组" data-组="${转义(目)}"${开.has(目) ? ' open' : ''}>`
        + `<summary><b>${转义(目 || '批次根目录')}</b><small>${fs.length} 件${fs.some(产出新) ? ` · ${fs.filter(产出新).length} 新` : ''}</small></summary>`
        + `<div class="产出墙">${开.has(目) ? fs.map(产出件html).join('') : ''}</div></details>`).join('')
      : `<p class="产出空">${j.文件.length ? '没有符合筛选的文件。' : '这一批是空的。'}</p>`);
  链接产出说明(区.querySelector('.产出说明们'));
  看视频缩略(区);
}
// 说明里提到的文件名（`封面-v2.png`、assets/images/x.png 之类）变成按钮，点了直接预览那个文件。
function 链接产出说明(根){
  if (!根 || !产出批) return;
  const 根前 = 产出批.目录.endsWith('/') ? 产出批.目录 : '', 表 = new Map(), 重名 = new Set();
  for (const f of 产出批.文件) {
    表.set(f.路径, f.路径); if (根前) 表.set(f.路径.slice(根前.length), f.路径);
    const 名 = f.路径.split('/').pop();
    if (表.has(名) && 表.get(名) !== f.路径) 重名.add(名); else 表.set(名, f.路径);
  }
  重名.forEach(名 => 表.delete(名));
  const 词 = /[^\s`'"“”‘’()（）<>\[\]【】,，;；:：、。|*]+\.[A-Za-z0-9]{1,6}/g;
  const 走 = document.createTreeWalker(根, NodeFilter.SHOW_TEXT, {acceptNode: t => t.parentElement.closest('a,button,summary') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  const 节点们 = []; while (走.nextNode()) 节点们.push(走.currentNode);
  for (const t of 节点们) {
    const 文 = t.nodeValue; let 末 = 0, 有 = false; const 片 = document.createDocumentFragment();
    for (const m of 文.matchAll(词)) {
      const 键 = m[0].replace(/^\.?\//, ''), 路径 = 表.get(键) || 表.get(键.replace(/^产出\//, ''));
      if (!路径) continue;
      有 = true; 片.append(文.slice(末, m.index));
      const b = document.createElement('button'); b.type = 'button'; b.className = '产出链'; b.dataset.产出看 = 路径; b.textContent = m[0]; b.title = '预览 ' + 路径;
      片.append(b); 末 = m.index + m[0].length;
    }
    if (有) { 片.append(文.slice(末)); t.replaceWith(片); }
  }
}
// 视频缩略按需加载：滚到眼前才给 src，一批几十个视频不会一次全拉。
let 视频观察 = null;
function 看视频缩略(根){
  视频观察 ??= new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; const v = e.target; v.preload = 'metadata'; v.src = v.dataset.src; v.removeAttribute('data-src'); v.load(); 视频观察.unobserve(v);
  }), {root: $('#产出批'), rootMargin: '200px'});
  根.querySelectorAll('video[data-src]').forEach(v => 视频观察.observe(v));
}
// 预览一件产出。从墙上点开的可以用 ← → 翻当前筛选下的上一件、下一件。
async function 预览产出(路径){
  let i = 产出序列.findIndex(f => f.路径 === 路径);
  if (i < 0) { const f = 产出批?.文件.find(f => f.路径 === 路径); if (!f) return; 产出序列 = [f]; i = 0; }
  const f = 产出序列[i], 副 = 产出序列.length > 1 ? ` · ${i + 1} / ${产出序列.length}（← → 翻看）` : '';
  document.querySelectorAll('#产出批 .产出件[data-当前]').forEach(e => e.removeAttribute('data-当前'));
  const 件 = $('#产出批').querySelector(`.产出件[data-路径="${CSS.escape(f.路径)}"]`);
  件?.setAttribute('data-当前', ''); 件?.scrollIntoView({block: 'nearest'});
  if (f.文本) await 预览文档(f.路径, 副);
  else {
    预览请求?.abort(); 预览请求 = null;
    const dialog = $('#文件预览'), body = $('#文件预览正文');
    定位文件预览();
    $('#文件预览标题').textContent = f.路径.split('/').pop();
    $('#文件预览路径').textContent = f.路径 + 副;
    body.className = '正文'; body.innerHTML = 资产预览html(f.路径); body.scrollTop = 0;
    取消关闭(dialog); if (!dialog.open) dialog.showModal();
  }
  产出预览位 = i;
}
$('#文件预览').addEventListener('keydown', e => {
  if (产出预览位 === null || !['ArrowLeft', 'ArrowRight'].includes(e.key) || e.target.closest?.('input,textarea,audio,video')) return;
  const i = 产出预览位 + (e.key === 'ArrowRight' ? 1 : -1);
  if (i < 0 || i >= 产出序列.length) return;
  e.preventDefault(); 预览产出(产出序列[i].路径);
});
async function 标产出(路径, 状态){
  const f = 产出批?.文件.find(x => x.路径 === 路径); if (!f) return;
  const 新 = f.标记 === 状态 ? null : 状态, 旧 = f.标记;
  f.标记 = 新; 重画产出件(f);
  try {
    const r = await fetch('/审阅', {method: 'POST', headers: 项目头(), body: JSON.stringify({标记: {[路径]: 新}})});
    const j = await r.json(); if (!j.好) throw new Error(j.错误 || '保存失败');
  } catch (e) { f.标记 = 旧; 重画产出件(f); 提示('标记没存上：' + e.message); }
}
function 重画产出件(f){
  const 旧 = $('#产出批').querySelector(`.产出件[data-路径="${CSS.escape(f.路径)}"]`); if (!旧) return;
  const 当前 = 旧.hasAttribute('data-当前');
  旧.outerHTML = 产出件html(f);
  const 新 = $('#产出批').querySelector(`.产出件[data-路径="${CSS.escape(f.路径)}"]`);
  if (当前) 新.setAttribute('data-当前', '');
  看视频缩略(新);
}
$('#产出选择').onclick = 打开产出窗;
$('#关闭产出窗').onclick = () => 关弹窗($('#产出窗'));
$('#产出窗').addEventListener('close', () => { 产出请求?.abort(); $('#产出选择').setAttribute('aria-expanded', 'false'); });
$('#产出批次').onclick = e => { const b = e.target.closest('[data-批]'); if (b) 选产出批(b.dataset.批); };
$('#产出批').addEventListener('click', e => {
  const 看 = e.target.closest('[data-产出看]'); if (看) { 预览产出(看.dataset.产出看); return; }
  const 标 = e.target.closest('[data-产出标]'); if (标) { 标产出(标.closest('.产出件').dataset.路径, 标.dataset.产出标); return; }
  const 动 = e.target.closest('[data-产出动作]');
  if (动) { const 路径 = 动.dataset.路径.replace(/\/$/, ''); 动.dataset.产出动作 === '复制' ? 抄(路径) : 系统打开(路径, 动.dataset.产出动作 === '访达'); return; }
  const 种 = e.target.closest('[data-产出种]'); if (种) { 产出筛.种类 = 种.dataset.产出种; 画产出批(); }
});
$('#产出批').addEventListener('change', e => { const k = e.target.dataset?.产出筛; if (k) { 产出筛[k] = e.target.checked; 画产出批(); } });
// 子目录分组展开时才画里面的文件。用户亲手开合的组按批记住，切走再回来、换筛选都不变。
$('#产出批').addEventListener('click', e => {
  const 头 = e.target.closest('.产出组>summary'); if (!头 || !产出批) return;
  const 组 = 头.parentElement; 产出开合.get(产出批.目录)?.set(组.dataset.组, !组.open);
});
$('#产出批').addEventListener('toggle', e => {
  const 组 = e.target; if (!组.classList?.contains('产出组') || !组.open || !产出批) return;
  const 墙 = 组.querySelector('.产出墙'), 目 = 组.dataset.组;
  if (!墙.childElementCount) { 墙.innerHTML = 产出序列.filter(f => 产出子目录(f) === 目).map(产出件html).join(''); 看视频缩略(墙); }
}, true);
// 产出窗开着时回到窗口：AI 可能刚写完一批，刷新批次列表；正在看的这批有新文件就原地重读（滚动位置、基线不变）。
addEventListener('focus', async () => {
  if (!$('#产出窗').open || $('#文件预览').open) return;
  const 旧 = (数据?.产出批次 || []).find(b => b.目录 === 产出选中)?.最新;
  await 刷新产出批次();
  const 新 = (数据?.产出批次 || []).find(b => b.目录 === 产出选中)?.最新;
  if (产出选中 && 新 !== 旧) 选产出批(产出选中, true);
});

// ---------------------------------------------------------------- 未认领抽屉
function 画未认领(){
  const 组 = [['未认领资产', 数据.未认领资产], ['孤儿工具', 数据.孤儿工具],
             ['未归类文件', 数据.未归类]];
  // 产出池不在这里：它有自己的产出窗（顶栏的产出入口）
  const 总 = 组.reduce((a, [, v]) => a + (v || []).length, 0);
  $('#未数').textContent = 总 ? `${总} 件` : '空了';
  $('#未数').dataset.状态 = 总 ? '警告' : '正常';
  $('#未体').innerHTML = 主题.模板.未认领列表({组});
  $('#未体').querySelectorAll('.项').forEach(e => {
    e.ondragstart = ev => {
      ev.dataTransfer.setData(认领类型, e.dataset.文件);
      ev.dataTransfer.setData('text/plain', e.dataset.文件);
      document.querySelectorAll('.卡').forEach(c => c.classList.add('可放'));
    };
    e.ondragend = () => document.querySelectorAll('.卡').forEach(c => c.classList.remove('可放'));
  });
}
$('#未 .头').onclick = () => { const 未 = $('#未');
  if (未.classList.contains('开')) 关弹窗(未, () => 未.classList.remove('开')); else { 取消关闭(未); 未.classList.add('开'); } };
// 认领只接受未认领抽屉发起的拖动：链接、选中的文字、外部文件拖进来一律不认，免得把网址写进 frontmatter。
const 认领类型 = 'application/x-atlas-file';
const 是认领拖动 = e => [...(e.dataTransfer?.types || [])].includes(认领类型);
document.addEventListener('dragover', e => { if (e.target.closest('.卡') && 是认领拖动(e)) e.preventDefault(); });
document.addEventListener('drop', async e => {
  const 卡 = e.target.closest('.卡'); if (!卡) return;
  e.preventDefault();
  if (!是认领拖动(e)) return;
  const 文件 = e.dataTransfer.getData(认领类型); if (!文件) return;
  if (文件.startsWith('产出/')) { 提示('产出不能直接认领：值得留的先移到 资产/，再从未认领资产里拖'); return; }
  let 分类 = null;
  if (图后缀.test(文件)) {
    const 答 = await 询问({标题: '挂成哪一类？', 说明: 文件.split('/').pop(), 字段: [{名: '分类', 值: '未分类', 占位: '人设 / 场景 / 图标 …'}], 确定: '认领'});
    if (!答) return; 分类 = 答[0].trim() || '未分类';
  }
  const r = await fetch('/认领', {method: 'POST', headers: 项目头(), body: JSON.stringify(
    {条目: 卡.dataset.路径, 文件, 分类})});
  const j = await r.json();
  if (j.错误) { 提示('认领失败：' + j.错误); return; }
  记一笔('认领 ' + 文件.split('/').pop(), j.撤销);
  提示('已认领：' + j.说明);
  await 取数();
});

// ---------------------------------------------------------------- 搜索
// 索引随 /数据 的快照重建；正文仅在服务端扫描时读取，不随每次击键请求。
const 搜框 = $('#搜 input'), 搜果 = $('#搜果');
const 搜索规范 = s => String(s ?? '').normalize('NFKC').toLowerCase();
const 搜索词 = q => [...new Set(搜索规范(q).trim().split(/\s+/).filter(Boolean))];
let 搜索快照 = null, 搜索索引 = [], 搜索命中 = [], 搜索上限 = 30, 搜索当前词 = [];
const 搜索记录缓存 = new Map();
const 搜索记录键 = () => 'atlas:搜索记录:' + 项目根;
function 读搜索记录(){
  if (!项目根) return [];
  const key = 搜索记录键();
  if (!搜索记录缓存.has(key)) {
    let records;
    try { records = JSON.parse(localStorage.getItem(key)); } catch {}
    搜索记录缓存.set(key, Array.isArray(records)
      ? records.filter(q => typeof q === 'string' && q.trim()).slice(0, 20) : []);
  }
  return 搜索记录缓存.get(key);
}
function 存搜索记录(records){
  if (!项目根) return;
  const key = 搜索记录键();
  搜索记录缓存.set(key, records);
  try {
    if (records.length) localStorage.setItem(key, JSON.stringify(records));
    else localStorage.removeItem(key);
  } catch { 提示('浏览器无法保存搜索记录，本次操作仅在当前页面生效'); }
}
function 记搜索记录(){
  const q = 搜框.value.trim().replace(/\s+/g, ' ');
  if (!q) return;
  存搜索记录([q, ...读搜索记录().filter(v => 搜索规范(v) !== 搜索规范(q))].slice(0, 20));
}
function 画搜索记录(){
  if (!主题 || !数据) return;
  const records = 读搜索记录();
  搜果.innerHTML = 主题.模板.搜索结果({前:[], 记录:records});
  搜果.style.display = 'block';
  搜果.querySelectorAll('[data-搜索记录]').forEach(button => {
    button.onclick = e => {
      e.stopPropagation();
      搜框.focus(); 搜框.value = records[+button.dataset.搜索记录];
      搜框.oninput(); 记搜索记录();
    };
  });
  const clear = 搜果.querySelector('[data-清除搜索记录]');
  if (clear) clear.onclick = e => {
    e.stopPropagation(); 存搜索记录([]); 画搜索记录(); 搜框.focus();
  };
}
function 建搜索索引(data){
  const list = [], paths = new Set();
  const add = (item, meta, body = '') => {
    const fields = [item.文, meta, body].map(搜索规范);
    list.push({...item, 元文: meta, 正文: body, 域: fields, 全文: fields.join('\n')});
  };
  (data.条目 || []).forEach(n => {
    paths.add(n.路径);
    add({文:n.标题 || n.名称 || n.路径, 副:`${n.类型 || '文档'} · ${n.路径}`, 路径:n.路径, 种:'条目'},
      [n.标题, n.名称, n.路径, n.编号, n.类型, n.库, n.分组, n.状态, n.摘要, ...(n.标签 || [])].filter(Boolean).join(' · '),
      data.搜索正文?.[n.路径] || '');
  });
  (data.路线 || []).forEach(r => {
    paths.add(r.路径);
    add({文:r.名称, 副:`路线 · ${r.路径}`, 种:'路线', 路线:r.名称}, `${r.路径} · ${r.入口 || ''}`, r.说明 || '');
    (r.步骤 || []).forEach(s => add(
      {文:s.title || s.id, 副:`步骤 · ${r.名称} › ${s.id}`, 种:'步骤', 路线:r.名称, 步:s.id},
      [r.名称, s.id, ...(s.docs || []), ...(s.tools || []), ...(s.outputs || [])].join(' · '), s.note || ''));
  });
  const file = (path, kind, title) => {
    if (!path || paths.has(path)) return;
    paths.add(path);
    add({文:title || path.split('/').pop(), 副:`${kind} · ${path}`, 种:'文件', 路径:path}, path);
  };
  (data.资产 || []).forEach(p => file(p, '资产'));
  (data.工具 || []).forEach(p => file(p, '工具'));
  (data.文件候选 || []).forEach(f => file(f.文件路径, f.类型 || '文件', f.标题));
  (data.数据表 || []).forEach(p => file(p, '数据表'));
  return list;
}
function 搜索片段(text, words){
  const s = String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim(), lower = s.toLowerCase();
  const positions = words.map(w => lower.indexOf(w)).filter(i => i >= 0).sort((a,b) => a-b);
  if (!positions.length) return '';
  const ranges = [];
  for (const pos of positions){
    const start = Math.max(0, pos - 28), end = Math.min(s.length, pos + Math.max(72, ...words.map(w => w.length)));
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else if (ranges.length < 3) ranges.push([start, end]);
  }
  return ranges.map(([a,b]) => `${a ? '…' : ''}${s.slice(a,b)}${b < s.length ? '…' : ''}`).join(' · ');
}
function 查搜索(index, query){
  const words = 搜索词(query), phrase = 搜索规范(query).trim();
  if (!words.length) return [];
  return index.filter(h => words.every(w => h.全文.includes(w))).map(h => {
    const score = (h.域[0] === phrase ? 100 : h.域[0].includes(phrase) ? 50 : 0)
      + words.reduce((sum,w) => sum + (h.域[0].includes(w) ? 20 : h.域[1].includes(w) ? 6 : 1), 0);
    return {...h, 分:score, 片段:搜索片段(h.正文, words) || 搜索片段(h.元文, words)};
  }).sort((a,b) => b.分 - a.分 || a.文.localeCompare(b.文, 'zh-CN') || a.副.localeCompare(b.副, 'zh-CN'));
}
function 搜索标记(text){
  // 转义先于插入 mark；文件中的 HTML 永远只作为文字显示。
  const s = String(text || '').normalize('NFKC');
  if (!搜索当前词.length) return 转义(s);
  const re = new RegExp('(' + [...搜索当前词].sort((a,b) => b.length-a.length)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
  return s.split(re).map((part,i) => i % 2 ? `<mark>${转义(part)}</mark>` : 转义(part)).join('');
}
function 打开搜索结果(h){
  记搜索记录();
  搜果.style.display = 'none'; 搜框.value = '';
  if (h.种 === '条目') 跳(h.路径);
  else if (h.种 === '路线') 去路线(h.路线);
  else if (h.种 === '步骤') {
    切视图('路线');
    const e = $('#世界').querySelector(`.步[data-路线="${CSS.escape(h.路线)}"][data-步="${CSS.escape(h.步)}"]`);
    if (e) { 缩 = .85; 位 = {x:40-parseFloat(e.style.left)*缩,y:30-parseFloat(e.style.top)*缩}; 应用变换(); }
    选步骤(h.路线, h.步);
  } else if ((数据.文件候选 || []).some(f => f.文件路径 === h.路径)) 预览文档(h.路径);
  else window.open('/文件/' + h.路径.split('/').map(encodeURIComponent).join('/'), '_blank', 'noopener');
}
function 画搜索结果(){
  const 前 = 搜索命中.slice(0, 搜索上限);
  const 遗漏 = 数据?.搜索遗漏 || [];
  const 提醒 = !数据?.搜索正文 ? '文档全文尚未加载，请重启画布服务后刷新。'
    : 遗漏.length ? `${遗漏.length} 篇文档正文读取失败：${遗漏.join('、')}` : '';
  搜果.innerHTML = 主题.模板.搜索结果({前, 总数:搜索命中.length, 更多:前.length < 搜索命中.length, 提醒, 标记:搜索标记});
  搜果.style.display = 'block';
  搜果.querySelectorAll('[data-i]').forEach(d => {
    d.onclick = () => 打开搜索结果(前[+d.dataset.i]);
    d.onkeydown = e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); d.click(); } };
  });
  const more = 搜果.querySelector('[data-搜索更多]');
  if (more) more.onclick = e => {
    // 重绘会移除当前按钮，阻止冒泡后被全局点击处理误判为「点在搜索框外」。
    e.stopPropagation();
    const top = 搜果.scrollTop, count = 前.length;
    搜索上限 += 30; 画搜索结果(); 搜果.scrollTop = top;
    搜果.querySelector(`[data-i="${count}"]`)?.focus({preventScroll:true});
  };
}
搜框.oninput = () => {
  if (!数据 || !主题) { 搜果.style.display = 'none'; return; }
  if (!搜框.value.trim()) { 画搜索记录(); 搜果.scrollTop = 0; return; }
  if (搜索快照 !== 数据) { 搜索快照 = 数据; 搜索索引 = 建搜索索引(数据); }
  搜索当前词 = 搜索词(搜框.value);
  搜索命中 = 查搜索(搜索索引, 搜框.value); 搜索上限 = 30;
  画搜索结果(); 搜果.scrollTop = 0;
};
搜框.onfocus = () => 搜框.oninput();
// 提交、打开结果或离开输入框才记一条，避免把每次击键都变成记录。
搜框.onblur = () => 记搜索记录();
搜框.onclick = () => { if (搜果.style.display === 'none') 搜框.oninput(); };
搜框.onkeydown = e => {
  if (e.isComposing || 搜果.style.display === 'none') return;
  if (e.key === 'Enter' && 搜框.value.trim()) {
    e.preventDefault(); 记搜索记录();
    if (搜索命中.length) 打开搜索结果(搜索命中[0]);
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); 搜果.querySelector('[data-i], [data-搜索记录]')?.focus(); }
};
document.addEventListener('keydown', e => {
  if ($('#检查详情').open || $('#文件预览').open || $('#询问').open || $('#产出窗').open) return;
  const 在输入 = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')
                || document.activeElement?.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !在输入){
    e.preventDefault(); e.shiftKey ? 重做() : 撤销(); return;
  }
  if (e.key === 'Escape' && 取消挑选) { e.preventDefault(); 取消挑选(); return; }
  if ($('#挑').classList.contains('开')) return;
  if (e.key === 'Escape') { 搜果.style.display = 'none'; 搜框.blur(); 收卡(); return; }
  if (在输入) return;
  if (e.key === '/' && document.activeElement !== 搜框) { e.preventDefault(); 搜框.focus(); }
  if (e.key >= '1' && e.key <= '9' && 视图们[+e.key - 1] && document.activeElement !== 搜框) {
    切视图(视图们[+e.key - 1]);
  }
});
document.addEventListener('click', e => { if (!$('#搜').contains(e.target)) 搜果.style.display = 'none'; });

$('#刷').onclick = () => {
  查空间('强制');
  取数().then(() => 提示('已重新扫描，磁盘占用在后台更新')).catch(() => 提示('重新扫描失败'));
};
$('#新路线').onclick = 新建路线;
$('#撤销').onclick = 撤销;
$('#重做').onclick = 重做;

启动界面();
