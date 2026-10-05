/* 幻想的区域模板；只有呈现，没有请求、状态修改或保存逻辑。 */
export default function 创建模板({转义, 图后缀}, {色, 小章, 行, 详情头, 图标, 序色, 状态签}){
function 条目详情({n, 按路径, 解析}){
  const 跳钮 = (文, 路径, 尾) => { const x = 按路径[路径];
    return 行(文, 尾, 转义(`跳(${JSON.stringify(路径)})`), x?.类型)
      .replace('class="行"', `class="行" data-关联="${转义(路径)}" style="--关联色:${色(x?.类型)}"`); };
  const 关联 = Object.entries(n.关联 || {}).map(([k, v]) =>
    `<h6>${转义(k)}</h6>` + (Array.isArray(v) ? v : [v]).map(t => {
      const x = 解析(t);
      return x ? 跳钮(x.标题 || x.名称, x.路径) : 行(t, '未找到');
    }).join('')).join('');
  const 被引 = (n.被引用 || []).map(p => {
    const x = 按路径[p]; return 跳钮(x ? x.标题 || x.名称 : p, p);
  }).join('');
  const 图 = (n.资产展开 || []).filter(a => 图后缀.test(a));
  const 属性 = [['类型',n.类型],['状态',n.状态],['分组',n.分组],['编号',n.编号],['位阶',n.位阶],['篇幅',n.行数 == null ? '' : n.行数 + ' 行']]
    .filter(([,v]) => v !== null && v !== undefined && v !== '')
    .map(([k,v]) => `<dt>${k}</dt><dd>${k === '状态' ? 状态签(v) : 转义(v)}</dd>`).join('');
  // 侧栏四个区：属性单独开合；标题、被谁引用、引用同一时间只展开一个（核心负责）。
  const 区 = (名, 题, 内, 数, 独立) => `<section class="侧区" data-侧区="${名}"${独立 ? ' data-独立' : ''}>
    <button type="button" class="侧区头"><span>${题}</span>${数 ? `<span class="侧区数">${数}</span>` : ''}</button><div class="侧区体">${内}</div></section>`;
  const 引用数 = Object.values(n.关联 || {}).reduce((s, v) => s + (Array.isArray(v) ? v.length : 1), 0) + (n.软引用 || []).length + (n.路线 || []).length;
  const 引用 = `${关联}${(n.软引用 || []).length ? '<h6>文中引用</h6>' + n.软引用.map(t => { const x = 解析(t); return x ? 跳钮(x.标题 || x.名称, x.路径) : 行(t, ''); }).join('') : ''}${(n.路线 || []).length ? '<h6>出现在路线</h6>' + n.路线.map(r => 行(r, '', 转义(`去路线(${JSON.stringify(r)})`), '路线')).join('') : ''}`;
  return 详情头(n.标题 || n.名称, n.类型 || '文档', n.路径, n.类型) + `
    <div class="详情体">
      <div class="详情格"><div>${n.摘要 ? `<p class="详情摘要">${转义(n.摘要)}</p>` : ''}<article class="正文" id="原"><div class="读取">正在读取正文…</div></article>
        ${图.length ? '<h5>资产 (' + 图.length + ')</h5><div class="资产格">' + 图.map(a => `<a href="/文件/${转义(encodeURI(a))}" target="_blank" rel="noopener"><img class="预" loading="lazy" src="/文件/${转义(encodeURI(a))}" alt="${转义(a.split('/').pop())}"></a>`).join('') + '</div>' : ''}
      </div><aside class="详情侧">
      ${区('属性', '属性', `<dl class="属性表">${属性}</dl>${(n.标签 || []).length ? '<h6>标签</h6><div class="标签组">' + n.标签.map(t => `<span class="小签">${转义(t)}</span>`).join('') + '</div>' : ''}${(n.机制 || []).length ? '<h6>调用机制</h6>' + n.机制.map(m => 行(m, '')).join('') : ''}${(n.工具 || []).length ? '<h6>工具</h6>' + n.工具.map(t => 行(t, '复制', 转义(`抄(${JSON.stringify(t)})`), null, 图标.工具)).join('') : ''}`, 0, true)}
      ${区('标题', '标题', '<nav class="大纲" data-大纲 aria-label="正文标题"></nav>')}
      ${被引 ? 区('被引', '被谁引用', 被引, (n.被引用 || []).length) : ''}
      ${引用 ? 区('引用', '引用', 引用, 引用数) : ''}
      <div class="卡操作"><button class="主钮" onclick="${转义(`抄(${JSON.stringify(n.路径)})`)}">复制路径</button><a href="/文件/${转义(encodeURI(n.路径))}" target="_blank" rel="noopener" title="用系统默认应用打开" draggable="false" onclick="${转义(`event.preventDefault();系统打开(${JSON.stringify(n.路径)})`)}">打开原文</a><a href="/文件/${转义(encodeURI(n.路径))}" role="button" draggable="false" title="在访达中选中这个文件" onclick="${转义(`event.preventDefault();系统打开(${JSON.stringify(n.路径)},true)`)}">在访达中显示</a></div>
      </aside></div></div>`;
}

function 步骤详情({r, s, 路线名, 步id, 路线文件}){
  const q = x => 转义(String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  const 项 = (字段, 值, 文, 尾, 类型, 图) =>
    `<div class="行">${图 ? `<span class="图标${字段 === 'outputs' ? ' 产出' : ''}">${图}</span>` : 小章(类型)}
      ${字段 === 'docs' || 路线文件(值) ? `<button class="文件名称" data-预览="${转义(值)}">${转义(文)}</button><button class="预览按钮" data-预览="${转义(值)}" aria-label="预览 ${转义(文)}">预览</button>` : `<span>${转义(文)}</span>`}${尾 ? `<span class="尾">${转义(尾)}</span>` : ''}
      <button class="叉" title="从这一步移掉" aria-label="从这一步移掉 ${转义(文)}"
        onclick="删步骤项('${q(路线名)}','${q(步id)}','${字段}','${q(值)}')">✕</button></div>`;
  const 文档 = (s.docs || []).map(d => {
    const n = 路线文件(d);
    return n ? 项('docs', d, n.标题 || n.名称, `${n.行数 == null ? '' : n.行数 + '行 · '}${n.类型}`, n.类型)
             : 项('docs', d, d + ' · 不存在', '', '');
  }).join('') || '<div class="尾 空项">还没挂文档</div>';
  const 行数 = (s.docs || []).reduce((a, d) => a + (路线文件(d)?.行数 || 0), 0);
  const 后续 = (s.next || []).map(x => {
    const t2 = r.步骤.find(y => y.id === x);
    return `<div class="行"><span class="图标">${图标.箭头}</span><span>${转义(t2 ? t2.title : x)}</span>
      <button class="叉" title="断开" aria-label="断开到 ${转义(t2 ? t2.title : x)} 的连线"
        onclick="断线('${q(路线名)}','${q(步id)}','${q(x)}')">✕</button></div>`;
  }).join('') || '<div class="尾 空项">这是末步</div>';
  const 序 = r.步骤.findIndex(y => y.id === s.id);
  return 详情头(s.title, '路线步骤', 路线名, null, 序色(Math.max(0, 序))) + `<div class="详情体">
    <div class="路">${转义(路线名)} / ${转义(s.id)}　<span class="编辑入口"
      onclick="编辑步骤标题('${q(路线名)}','${q(步id)}')">改标题</span></div>
    <div class="步骤护栏"
      onclick="改步骤字段('${q(路线名)}','${q(步id)}','note','给 AI 的一句话护栏（留空则去掉）')">
      <span class="提签">AI 护栏</span>${s.note ? 转义(s.note) : '＋ 加一句给 AI 的护栏'}</div>
    <h5>要读的文件（${(s.docs || []).length} 个${(s.docs || []).some(d => 路线文件(d)?.行数 == null) ? '' : ` / 约 ${行数} 行`}）</h5>${文档}
    <div class="行 加项" onclick="加步骤项('${q(路线名)}','${q(步id)}','docs')">＋ 添加文档或代码文件</div>
    <h5>工具</h5>
    ${(s.tools || []).map(x => 项('tools', x, x, '', '', 图标.工具)).join('')}
    <div class="行 加项" onclick="加步骤项('${q(路线名)}','${q(步id)}','tools')">＋ 加工具</div>
    <h5>产出到</h5>
    ${(s.outputs || []).map(x => 项('outputs', x, x, '', '', 图标.产出)).join('')}
    <div class="行 加项" onclick="加步骤项('${q(路线名)}','${q(步id)}','outputs')">＋ 加产出</div>
    <h5>下一步</h5>${后续}
    <h5>给 AI 的命令</h5>
    <div class="行 命令" onclick="抄('atlas 路线 ${q(路线名)}')"><span class="提示符">$</span>atlas 路线 ${转义(路线名)}<span class="尾">复制</span></div>
    <h5>危险</h5>
    <div class="行 危险"
      onclick="删步骤('${q(路线名)}','${q(步id)}')">删掉这一步</div></div>`;
}

function 检查列表({发现, 按路径}){
  return 发现.map((f, i) => `<li class="检查项 ${f.级别 === '错误' ? '错误' : ''}">
    <span class="检查级别 ${f.级别 === '错误' ? '错误' : ''}">${转义(f.级别)} · ${转义(f.码)}</span>
    <h3>${转义(f.信息)}</h3><div class="检查位置">${转义(f.位置)}</div>
    ${f.提示 ? `<p class="检查建议">建议：${转义(f.提示)}</p>` : ''}
    ${按路径[f.位置] ? `<button type="button" data-发现="${i}">查看文档 →</button>` : ''}
  </li>`).join('');
}

function 候选列表({命}){
  return 命.map((c, i) => `<div class="候选项"><button class="候选选择" data-i="${i}">${小章(c.类型)}<span><b>${转义(c.标题)}</b>
    <small>${转义(c.类型)} · ${转义(c.文件路径 || c.路径)}${c.行数 == null ? '' : ` · ${c.行数}行`}</small></span></button>
    <button class="预览按钮" data-预览="${转义(c.路径)}" aria-label="预览 ${转义(c.标题)}">预览</button></div>`).join('')
    || '<div class="次文">没找到</div>';
}

function 未认领列表({组}){
  return 组.filter(([, v]) => (v || []).length).map(([k, v]) =>
    `<div class="组">${k} · ${v.length}</div>` + v.map(p =>
      `<div class="项" draggable="true" data-文件="${转义(p)}" title="${转义(p)}">${转义(p)}</div>`).join('')
  ).join('') || '<div class="组">都挂上了</div>';
}

// 项目列表：每个项目一枚纹章，当前项目用星标出。
function 项目列表({列表}){
  return 列表.map((p, i) => `<li><button type="button" class="项目项${p.当前 ? ' 当前' : ''}" data-i="${i}"${p.存在 ? '' : ' disabled'}>
    ${小章(p.类型 === '游戏' ? '世界' : p.当前 ? '总览' : '条目')}
    <span class="项目文"><b>${转义(p.名称)}</b><small>${p.端口 ? `:${p.端口} · ` : ''}${转义(p.路径)}</small></span>
    <span class="项目签${p.运行中 && !p.当前 ? ' 运行' : ''}">${p.当前 ? '当前' : !p.存在 ? '找不到' : p.运行中 ? '运行中' : 转义(p.类型 || '项目')}</span></button></li>`).join('');
}

function 搜索结果({前, 总数 = 前.length, 更多 = false, 提醒 = '', 标记 = 转义}){
  return `<p class="搜索计数" role="status">找到 ${总数} 项${更多 ? ` · 已显示 ${前.length} 项` : ''}</p>`
    + (提醒 ? `<p class="搜索提醒" role="status">${转义(提醒)}</p>` : '')
    + 前.map((h, i) => `<div data-i="${i}" tabindex="0" role="button"><b>${标记(h.文)}</b>
      <span class="搜索副文">${标记(h.副)}</span>
      ${h.片段 ? `<span class="搜索片段">${标记(h.片段)}</span>` : ''}</div>`).join('')
    + (!总数 ? '<p class="搜索计数">没有匹配结果，试试减少关键词或换个词。</p>' : '')
    + (更多 ? '<button type="button" class="搜索更多" data-搜索更多>再显示 30 项</button>' : '');
}

function 步骤卡({s, i, 路线文件}){
  const 号 = String(i + 1).padStart(2, '0'), 色号 = 序色(i);
  const li = (s.docs || []).map(d => {
    const n = 路线文件(d);
    return `<li>${n ? 小章(n.类型) : '<span class="小章 缺" aria-hidden="true"></span>'}<span>${转义(n ? n.标题 || n.名称 : d + ' · 缺失')}</span></li>`;
  }).join('');
  const 尾 = [...(s.tools || []).map(x => `<li class="码"><span class="图标">${图标.工具}</span><span>${转义(x.split('/').pop())}</span></li>`),
             ...(s.outputs || []).map(o => `<li class="码"><span class="图标 产出">${图标.产出}</span><span>${转义(o)}</span></li>`)].join('');
  return `<i class="饰 饰-左上" aria-hidden="true"></i><i class="饰 饰-右下" aria-hidden="true"></i>
      <div class="序"><span class="序号" style="--序色:var(--${色号})" aria-hidden="true">${号}</span><h4>${转义(s.title)}</h4></div>
      ${s.note ? `<div class="提"><span class="提签">AI 护栏</span>${转义(s.note)}</div>` : ''}
      <ul class="步骤清单">${li}${尾}</ul>
      <div class="远牌" aria-hidden="true"><span class="序号" style="--序色:var(--${色号})">${号}</span><span class="远题">${转义(s.title)}</span></div>
      <div class="柄" title="拖到另一张卡上连线"></div>`;
}

function 分组头({b}){ return `<div class="头"><i class="头饰" aria-hidden="true"></i><b>${转义(b.名)}</b><span>${b.数}</span></div>`; }

function 路线标题({r}){ return `<span class="路线名">${转义(r.名称)}</span>${r.入口 ? '<span class="入口签">入口</span>' : ''}
        <span class="路线说明">${转义(r.说明 || '')}</span>`; }
function 路线工具({r}){ return `<button class="主钮" onclick="${转义(`加步骤(${JSON.stringify(r.名称)})`)}">＋ 加一步</button>
        <button onclick="${转义(`改路线头(${JSON.stringify(r.名称)})`)}">改名字/说明</button>
        <button onclick="${转义(`删路线(${JSON.stringify(r.名称)})`)}" class="危险">删掉这条路线</button>
        <span>从右侧菱形拖到另一张卡 = 连线；点线 = 断开</span>`; }

return {路线标题, 路线工具, 条目详情, 步骤详情, 检查列表, 候选列表, 未认领列表, 搜索结果, 步骤卡, 分组头, 项目列表};
}
