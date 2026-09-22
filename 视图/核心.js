// Atlas 共用功能：数据、导航状态、缩放平移、选择、编辑、保存与撤销。
const $ = s => document.querySelector(s);
const 转义 = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const 图后缀 = /\.(png|jpg|jpeg|webp|gif|svg)$/i;
let 数据 = null, 视图 = '内容', 选中 = null, 布局 = {}, 选中步 = null;
let 缩 = 0.85, 位 = {x: 30, y: 24};
let 展开卡 = null, 正文请求 = null, 首次 = true, 上次绘制视图 = null;
let 悬停条目 = null, 悬停关联 = null;
let 悬停计时 = null, 待悬停卡 = null;
const 卡片悬停延迟 = 500;
const 按路径 = {}, 按编号 = {}, 按名 = {};

let 主题 = null, 当前主题包 = null, 主题请求序号 = 0;
let 主题选择 = null, 当前外观 = null, 选择序号 = 0;
const 主题API = {
  $, 转义, 图后缀, 可动,
  分组数据: () => 分组数据(), 更新关联: () => 更新关联(),
  读取状态: () => ({数据, 视图, 缩, 位: {...位}, 布局, 展开卡, 外观: 当前外观}),
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
  const 搜果显示 = 搜果.style.display;
  搜框.oninput(); 搜果.style.display = 搜果显示;
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

// 主题下拉：跟随系统 / 固定使用某个方案 / 设定跟随时白天、夜间各用哪个方案。
function 画主题选项(){
  const 全 = Atlas主题加载器.方案们(), s = 主题选择;
  const 项 = (值, 文, 勾) => `<option value="${转义(值)}">${转义(文)}${勾 ? '　✓' : ''}</option>`;
  const 组 = (标, 列) => 列.length ? `<optgroup label="${标}">${列.join('')}</optgroup>` : '';
  $('#主题选择').innerHTML = 项('跟随', '跟随系统')
    + 组('固定使用', 全.map(f => 项('手动:' + f.值, f.名称)))
    + 组('跟随时白天用', 全.filter(f => f.外观 === '浅').map(f => 项('浅:' + f.值, f.名称, s.浅 === f.值)))
    + 组('跟随时夜间用', 全.filter(f => f.外观 === '深').map(f => 项('深:' + f.值, f.名称, s.深 === f.值)));
  const 名 = 值 => Atlas主题加载器.找方案(值)?.名称 || '未设';
  $('#主题选择').value = s.模式 === '跟随' ? '跟随' : '手动:' + s.手动;
  $('#主题选择').title = s.模式 === '跟随' ? `跟随系统：白天用${名(s.浅)}，夜间用${名(s.深)}` : '';
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
  } catch (e){
    $('#启动状态').firstChild.textContent = '界面加载失败：' + e.message + ' ';
    $('#重试启动').hidden = false;
  }
}
$('#主题选择').onchange = e => {
  const v = e.target.value, s = {...主题选择}, 分 = v.indexOf(':');
  if (v === '跟随') s.模式 = '跟随';
  else if (v.slice(0, 分) === '手动') { s.模式 = '手动'; s.手动 = v.slice(分 + 1); }
  else {
    const 外观 = v.slice(0, 分); s.模式 = '跟随'; s[外观] = v.slice(分 + 1);
    if (外观 !== Atlas主题加载器.系统外观())
      提示(`已设为${外观 === '浅' ? '白天' : '夜间'}主题：${Atlas主题加载器.找方案(s[外观])?.名称}，系统切到${外观}色时生效`);
  }
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


function 提示(s){ const t = $('#提示'); t.textContent = s; t.classList.add('开');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('开'), 1600); }


// ---------------------------------------------------------------- 取数
async function 取数(){
  const r = await fetch('/数据');
  数据 = await r.json();
  if (数据.错误) { document.body.innerHTML = '<div class="空">' + 转义(数据.错误) + '</div>'; return; }
  布局 = 数据.布局 || {};
  候选缓存 = null;
  $('#名').textContent = 数据.项目;
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
  画签(); 画未认领(); 画(); if (初次) 阅读视野();
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
  $('#检查详情').showModal();
  $('#体检').setAttribute('aria-expanded', 'true');
}
$('#体检').onclick = 打开检查;
$('#关闭检查').onclick = () => $('#检查详情').close();
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

async function 预览文档(路径){
  预览请求?.abort();
  const controller = 预览请求 = new AbortController(), dialog = $('#文件预览'), body = $('#文件预览正文');
  定位文件预览();
  $('#文件预览标题').textContent = '文件预览';
  $('#文件预览路径').textContent = 路径;
  body.className = '正文'; body.textContent = '正在读取…'; body.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  try {
    const r = await fetch('/预览/' + encodeURIComponent(路径), {signal: controller.signal});
    const file = await r.json();
    if (!r.ok) throw new Error(file.错误 || '读取失败');
    if (controller.signal.aborted) return;
    $('#文件预览标题').textContent = file.路径.split('/').pop();
    $('#文件预览路径').textContent = file.路径 + (file.格式 === 'code' ? ' · 源码预览' : '');
    if (file.格式 === 'markdown') {
      body.innerHTML = 正文html(file.内容.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) || '<p>这篇文档还没有正文。</p>';
    } else { body.className = '源码'; body.textContent = file.内容 || '文件为空。'; }
  } catch (e) {
    if (e.name !== 'AbortError') body.textContent = '预览失败：' + e.message;
  }
}
$('#关闭文件预览').onclick = () => $('#文件预览').close();
$('#文件预览').addEventListener('close', () => { 预览请求?.abort(); 预览请求 = null; });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-预览]');
  if (b) { e.preventDefault(); 预览文档(b.dataset.预览); }
}, true);

// ---------------------------------------------------------------- 视图切换
const 视图们 = ['路线', '策划', '内容', '创意', '资产'];

function 可动(){ return !matchMedia('(prefers-reduced-motion: reduce)').matches; }

function 画签(){
  const b = $('#新路线'); if (b) b.style.display = 视图 === '路线' ? '' : 'none';
  // 持续复用按钮和滑块，切换时保留滑块的起点与键盘焦点。
  if (!$('#签 button')) {
    $('#签').innerHTML = 主题.导航内容(视图们);
    $('#签').querySelectorAll('button').forEach(b => b.onclick = () => 切视图(b.dataset.v));
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
      <b>${视图}库还是空的</b>在项目的「${视图}」目录添加内容，重新扫描后会出现在这里。</div>`);
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
    const 位置 = 算路线布局(r, 基y);
    const 顶 = 位置.length ? Math.min(...位置.map(p => p.y)) : 基y;
    const 左 = 位置.length ? Math.min(...位置.map(p => p.x)) : 40;
    基y = Math.max(...位置.map(p => p.y + p.h), 基y) + 主题.布局.路线间距;
    w.insertAdjacentHTML('beforeend',
      `<div class="类标 路线标题" style="left:${左}px;top:${顶 - 主题.布局.路线标题距}px;">
        ${主题.模板.路线标题({r})}</div>
       <div class="编辑条" style="left:${左}px;top:${顶 - 主题.布局.路线编辑距}px">
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
    await fetch('/布局', {method: 'POST', body: JSON.stringify(布局)});
    提示(`已${动词}：${笔.说明}`);
    画();
    return true;
  }
  const res = await fetch('/还原', {method: 'POST', body: JSON.stringify(
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
  const 名 = prompt('新路线叫什么？（就写你最常干的那件事）'); if (!名) return;
  const 文件名 = 名.trim() + '.yml';
  if ((数据.路线 || []).some(r => r.文件名 === 文件名)) { 提示('已经有这条路线了'); return; }
  const 说 = prompt('一句话说明（可留空）', '') || '';
  const res = await fetch('/路线', {method: 'POST', body: JSON.stringify(
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
  const res = await fetch('/路线', {method: 'POST', body: JSON.stringify(体)});
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
  if (!confirm(`删掉「${步id}」这一步？指向它的线也会一起断开。`)) return;
  r.步骤 = r.步骤.filter(s => s.id !== 步id);
  r.步骤.forEach(s => s.next = (s.next || []).filter(x => x !== 步id));
  await 存路线(r, '删了：' + 步id);
}

async function 改路线头(路线名){
  const r = 找路线(路线名); if (!r) return;
  const 名 = prompt('路线名字', r.名称); if (名 === null) return;
  const 说 = prompt('一句话说明', r.说明 || ''); if (说 === null) return;
  r.名称 = 名.trim() || r.名称; r.说明 = 说.trim();
  await 存路线(r, '改好了');
}

async function 删路线(路线名){
  const r = 找路线(路线名); if (!r) return;
  if (!confirm(`删掉整条「${路线名}」？文件 ${r.文件名} 会被删除，可以用撤销恢复。`)) return;
  const res = await fetch('/删路线', {method: 'POST', body: JSON.stringify({文件名: r.文件名})});
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
  const v = prompt(提示文, s[字段] || ''); if (v === null) return;
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
    const v = prompt(字段 === 'tools' ? '工具路径（仓库相对）' : '产出 glob'); if (!v) return;
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
    const 收 = v => { 盒.classList.remove('开'); 输.oninput = null; 取消挑选 = null; 重画候选 = null; $('#屉 .收起')?.focus({preventScroll:true}); 完(v); };
    取消挑选 = () => 收(null);
    输.value = ''; 画单(''); 盒.classList.add('开'); 输.focus();
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



// 先转义，再渲染常用 Markdown；原始 HTML 只作为文本显示。
function 正文html(文本){
  const 行内 = t => 转义(t).replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (原, 文, 链) => {
      if (!/^https?:\/\//i.test(链)) return 文;
      return `<a href="${链}" target="_blank" rel="noopener noreferrer">${文}</a>`;
    });
  const ls = 文本.replace(/\r\n/g, '\n').split('\n');
  let out = [], 段 = [], 列 = null;
  const 收段 = () => { if (段.length) out.push('<p>' + 段.map(行内).join('<br>') + '</p>'); 段 = []; };
  const 收列 = () => { if (列) out.push(`</${列}>`); 列 = null; };
  const 格 = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
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
  panel.querySelectorAll('[data-关联]').forEach(e => {
    const 开 = () => { 悬停关联 = e.dataset.关联; 更新关联(); };
    const 关 = () => { 悬停关联 = null; 更新关联(); };
    e.onpointerenter = ev => { if (ev.pointerType !== 'touch') 开(); };
    e.onpointerleave = 关; e.onfocus = 开; e.onblur = 关;
  });
  定位展开(); panel.querySelector('.收起')?.focus({preventScroll:true});
  卡片过渡(card, 原框);
}



function 开抽屉(n){
  const card = $('#世界').querySelector(`.卡[data-路径="${CSS.escape(n.路径)}"]`);
  if (!card) return;
  $('#屉').innerHTML = 主题.模板.条目详情({n, 按路径, 解析});
  装入卡(card);
  const 正文 = $('#原');
  if (!正文) { 阅读完成 = Promise.resolve(); 提示('主题条目详情缺少 #原 正文插槽'); return; }
  正文请求 = new AbortController();
  const controller = 正文请求;
  阅读完成 = fetch('/文件/' + encodeURI(n.路径), {signal: controller.signal}).then(r => {
    if (!r.ok) throw new Error('读取失败'); return r.text();
  }).then(t => {
    if (controller.signal.aborted || !正文.isConnected) return;
    正文.innerHTML = 正文html(t.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) || '<p class="读取">这篇文档还没有正文。</p>';
    定位展开();
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
function 跳(路径){
  const n = 按路径[路径]; if (!n) return;
  收卡(false);
  if (n.库 && n.库 !== 视图) { 视图 = n.库; 画签(); 画(); }
  聚焦(路径); 选条目(路径);
  if (!展开卡) window.open('/文件/' + encodeURI(路径), '_blank', 'noopener');
}
function 去路线(名){
  切视图('路线');
  const r = 找路线(名); if (r?.步骤.length) {
    const e = $('#世界').querySelector(`.步[data-路线="${CSS.escape(名)}"]`);
    if (e) { 缩 = .85; 位 = {x:40 - parseFloat(e.style.left)*缩,y:30 - parseFloat(e.style.top)*缩}; 应用变换(); }
    选步骤(名,r.步骤[0].id);
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
  e.preventDefault(); 停镜头(); 清除卡片悬停();
  const k = Math.exp(-e.deltaY * 0.0016), 新 = Math.min(2.4, Math.max(0.12, 缩 * k));
  const r = 台.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  位.x = mx - (mx - 位.x) * (新 / 缩); 位.y = my - (my - 位.y) * (新 / 缩);
  缩 = 新; 应用变换();
}, {passive: false});
let 拖 = null;
台.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.卡,.步,.盒,button,a,input,.编辑条')) return;
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
window.addEventListener('resize', () => { if (!主题) return; 停镜头(); document.querySelectorAll('.卡,.步').forEach(停卡片动效);定位导航();定位展开();布置阅读幕();if ($('#文件预览').open) 定位文件预览(); });
$('#屉').addEventListener('click', e => e.stopPropagation());
$('#屉').addEventListener('pointerdown', e => e.stopPropagation());

// ---------------------------------------------------------------- 拖动卡片存布局
let 存计时 = null;
function 存布局(){
  clearTimeout(存计时);
  存计时 = setTimeout(() => fetch('/布局', {method: 'POST', body: JSON.stringify(布局)}), 400);
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
      };
      const 停 = () => {
        e.removeEventListener('pointermove', 动); e.removeEventListener('pointerup', 停);
        if (e._拖过) {
          布局[id] = {x: parseFloat(e.style.left), y: parseFloat(e.style.top)};
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

// ---------------------------------------------------------------- 未认领抽屉
function 画未认领(){
  const 组 = [['未认领资产', 数据.未认领资产], ['孤儿工具', 数据.孤儿工具],
             ['未归类文件', 数据.未归类], ['产出（未挑）', 数据.产出]];
  const 总 = 组.reduce((a, [, v]) => a + (v || []).length, 0);
  $('#未数').textContent = 总 ? `${总} 件` : '空了';
  $('#未数').dataset.状态 = 总 ? '警告' : '正常';
  $('#未体').innerHTML = 主题.模板.未认领列表({组});
  $('#未体').querySelectorAll('.项').forEach(e => {
    e.ondragstart = ev => {
      ev.dataTransfer.setData('text/plain', e.dataset.文件);
      document.querySelectorAll('.卡').forEach(c => c.classList.add('可放'));
    };
    e.ondragend = () => document.querySelectorAll('.卡').forEach(c => c.classList.remove('可放'));
  });
}
$('#未 .头').onclick = () => $('#未').classList.toggle('开');
document.addEventListener('dragover', e => { if (e.target.closest('.卡')) e.preventDefault(); });
document.addEventListener('drop', async e => {
  const 卡 = e.target.closest('.卡'); if (!卡) return;
  e.preventDefault();
  const 文件 = e.dataTransfer.getData('text/plain'); if (!文件) return;
  const 分类 = 图后缀.test(文件) ? (prompt('挂成哪一类？（人设 / 场景 / 图标 …）', '未分类') || '未分类') : null;
  const r = await fetch('/认领', {method: 'POST', body: JSON.stringify(
    {条目: 卡.dataset.路径, 文件, 分类})});
  const j = await r.json();
  if (j.错误) { 提示('认领失败：' + j.错误); return; }
  记一笔('认领 ' + 文件.split('/').pop(), j.撤销);
  提示('已认领：' + j.说明);
  await 取数();
});

// ---------------------------------------------------------------- 搜索
const 搜框 = $('#搜 input'), 搜果 = $('#搜果');
搜框.oninput = () => {
  const q = 搜框.value.trim().toLowerCase();
  if (!q) { 搜果.style.display = 'none'; return; }
  const 命中 = [];
  数据.条目.forEach(n => {
    if (`${n.路径} ${n.编号} ${n.名称} ${n.类型} ${n.摘要} ${(n.标签 || []).join(' ')}`
        .toLowerCase().includes(q))
      命中.push({文: n.标题 || n.名称, 副: `${n.类型} · ${n.路径}`, 走: () => 跳(n.路径)});
  });
  数据.资产.forEach(a => { if (a.toLowerCase().includes(q))
    命中.push({文: a.split('/').pop(), 副: '资产 · ' + a, 走: () => 抄(a)}); });
  数据.工具.forEach(t => { if (t.toLowerCase().includes(q))
    命中.push({文: t.split('/').pop(), 副: '工具 · ' + t, 走: () => 抄(t)}); });
  const 前 = 命中.slice(0, 30);
  搜果.innerHTML = 主题.模板.搜索结果({前:前.map(({文,副})=>({文,副}))});
  搜果.style.display = 'block';
  搜果.querySelectorAll('[data-i]').forEach(d => d.onclick = () => {
    前[+d.dataset.i].走(); 搜果.style.display = 'none'; 搜框.value = '';
  });
};
document.addEventListener('keydown', e => {
  if ($('#检查详情').open || $('#文件预览').open) return;
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
  if (e.key >= '1' && e.key <= '5' && document.activeElement !== 搜框) {
    切视图(视图们[+e.key - 1]);
  }
});
document.addEventListener('click', e => { if (!$('#搜').contains(e.target)) 搜果.style.display = 'none'; });

$('#刷').onclick = () => 取数().then(() => 提示('已重新扫描'));
$('#新路线').onclick = 新建路线;
$('#撤销').onclick = 撤销;
$('#重做').onclick = 重做;

启动界面();
