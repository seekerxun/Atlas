/* 邂逅的区域模板；只有呈现，没有请求、状态修改或保存逻辑。 */
export default function 创建模板({转义, 图后缀}, {色, 行, 详情头}){
function 条目详情({n, 按路径, 解析}){
  const 跳钮 = (文, 路径, 尾) => 行(文, 尾, 转义(`跳(${JSON.stringify(路径)})`), 色(按路径[路径]?.类型))
    .replace('class="行"', `class="行" data-关联="${转义(路径)}" style="--关联色:${色(按路径[路径]?.类型)}"`);
  const 关联 = Object.entries(n.关联 || {}).map(([k, v]) =>
    `<h5>${转义(k)}</h5>` + (Array.isArray(v) ? v : [v]).map(t => {
      const x = 解析(t);
      return x ? 跳钮(x.标题 || x.名称, x.路径, x.类型) : 行(t, '未找到');
    }).join('')).join('');
  const 被引 = (n.被引用 || []).map(p => {
    const x = 按路径[p]; return 跳钮(x ? x.标题 || x.名称 : p, p, x?.类型);
  }).join('');
  const 图 = (n.资产展开 || []).filter(a => 图后缀.test(a));
  const 属性 = [['类型',n.类型],['状态',n.状态],['分组',n.分组],['编号',n.编号],['位阶',n.位阶],['篇幅',n.行数 + ' 行']]
    .filter(([,v]) => v !== null && v !== undefined && v !== '')
    .map(([k,v]) => `<dt>${k}</dt><dd>${转义(v)}</dd>`).join('');
  return 详情头(n.标题 || n.名称, n.类型 || '文档', n.路径) + `
    <div class="详情体">
      ${n.摘要 ? `<p class="详情摘要">${转义(n.摘要)}</p>` : ''}
      <div class="详情格"><div><article class="正文" id="原"><div class="读取">正在读取正文…</div></article>
        ${图.length ? '<h5>资产 (' + 图.length + ')</h5><div class="资产格">' + 图.map(a => `<a href="/文件/${转义(encodeURI(a))}" target="_blank" rel="noopener"><img class="预" loading="lazy" src="/文件/${转义(encodeURI(a))}" alt="${转义(a.split('/').pop())}"></a>`).join('') + '</div>' : ''}
      </div><aside class="详情侧"><h5>属性</h5><dl class="属性表">${属性}</dl>
      ${(n.标签 || []).length ? '<h5>标签</h5>' + n.标签.map(t => `<span class="小丸">${转义(t)}</span>`).join(' ') : ''}
      ${(n.机制 || []).length ? '<h5>调用机制</h5>' + n.机制.map(m => 行(m, '')).join('') : ''}
      ${关联}${被引 ? '<h5>被谁引用</h5>' + 被引 : ''}
      ${(n.软引用 || []).length ? '<h5>文中引用</h5>' + n.软引用.map(t => { const x = 解析(t); return x ? 跳钮(x.标题 || x.名称, x.路径, '') : 行(t, ''); }).join('') : ''}
      ${(n.工具 || []).length ? '<h5>工具</h5>' + n.工具.map(t => 行(t, '', 转义(`抄(${JSON.stringify(t)})`))).join('') : ''}
      ${(n.路线 || []).length ? '<h5>出现在路线</h5>' + n.路线.map(r => 行(r, '', 转义(`去路线(${JSON.stringify(r)})`))).join('') : ''}
      <div class="卡操作"><button onclick="${转义(`抄(${JSON.stringify(n.路径)})`)}">复制路径</button><a href="/文件/${转义(encodeURI(n.路径))}" target="_blank" rel="noopener">打开原文</a></div>
      </aside></div></div>`;
}

function 步骤详情({r, s, 路线名, 步id, 路线文件}){
  const 动作 = (名, ...参数) => 转义(`${名}(${参数.map(p => JSON.stringify(p)).join(',')})`);
  const 项 = (字段, 值, 文, 尾, 色条) =>
    `<div class="行"><span class="点" style="background:${色条 || 'var(--字3)'}"></span>
      ${字段 === 'docs' || 路线文件(值) ? `<button class="文件名称" data-预览="${转义(值)}">${转义(文)}</button><button class="预览按钮" data-预览="${转义(值)}" aria-label="预览 ${转义(文)}">预览</button>` : `<span>${转义(文)}</span>`}${尾 ? `<span class="尾">${转义(尾)}</span>` : ''}
      <button class="叉" title="从这一步移掉" onclick="${动作('删步骤项', 路线名, 步id, 字段, 值)}">✕</button></div>`;
  const 文档 = (s.docs || []).map(d => {
    const n = 路线文件(d);
    return 项('docs', d, n ? (n.标题 || n.名称) : d + ' ⚠不存在',
      n ? `${n.行数 == null ? '' : n.行数 + '行 · '}${n.类型}` : '', n ? 色(n.类型) : 'var(--错)');
  }).join('') || '<div class="尾 空项">还没挂文档</div>';
  const 行数 = (s.docs || []).reduce((a, d) => a + (路线文件(d)?.行数 || 0), 0);
  const 后续 = (s.next || []).map(x => {
    const t = r.步骤.find(y => y.id === x);
    return `<div class="行"><span>${转义(t ? t.title : x)}</span><button class="叉" title="断开" onclick="${动作('断线', 路线名, 步id, x)}">✕</button></div>`;
  }).join('') || '<div class="尾 空项">这是末步</div>';
  return 详情头(s.title, '路线步骤', 路线名) + `<div class="详情体">
    <div class="路">${转义(路线名)} / ${转义(s.id)} <button class="编辑入口" onclick="${动作('编辑步骤标题', 路线名, 步id)}">改标题</button></div>
    <button class="步骤护栏" onclick="${动作('改步骤字段', 路线名, 步id, 'note', '给 AI 的一句话护栏（留空则去掉）')}">${s.note ? 转义(s.note) : '＋ 加一句给 AI 的护栏'}</button>
    <h5>要读的文件（${(s.docs || []).length} 个${(s.docs || []).some(d => 路线文件(d)?.行数 == null) ? '' : ` / 约 ${行数} 行`}）</h5>${文档}
    <button class="行" onclick="${动作('加步骤项', 路线名, 步id, 'docs')}">＋ 添加文档或代码文件</button>
    <h5>工具</h5>${(s.tools || []).map(x => 项('tools', x, x)).join('')}
    <button class="行" onclick="${动作('加步骤项', 路线名, 步id, 'tools')}">＋ 加工具</button>
    <h5>产出到</h5>${(s.outputs || []).map(x => 项('outputs', x, x)).join('')}
    <button class="行" onclick="${动作('加步骤项', 路线名, 步id, 'outputs')}">＋ 加产出</button>
    <h5>下一步</h5>${后续}<h5>给 AI 的命令</h5>
    <button class="行" onclick="${动作('抄', 'atlas 路线 ' + 路线名)}">atlas 路线 ${转义(路线名)}</button>
    <h5>危险</h5><button class="行 危险" onclick="${动作('删步骤', 路线名, 步id)}">删掉这一步</button></div>`;
}

function 检查列表({发现, 按路径}){
  return 发现.map((f, i) => `<li class="检查项">
    <span class="检查级别 ${f.级别 === '错误' ? '错误' : ''}">${转义(f.级别)} · ${转义(f.码)}</span>
    <h3>${转义(f.信息)}</h3><div class="检查位置">${转义(f.位置)}</div>
    ${f.提示 ? `<p class="检查建议">建议：${转义(f.提示)}</p>` : ''}
    ${按路径[f.位置] ? `<button type="button" data-发现="${i}">查看文档 →</button>` : ''}
  </li>`).join('');
}

function 候选列表({命}){
  return 命.map((c, i) => `<div class="候选项"><button class="候选选择" data-i="${i}"><b>${转义(c.标题)}</b>
    <small>${转义(c.类型)} · ${转义(c.文件路径 || c.路径)}${c.行数 == null ? '' : ` · ${c.行数}行`}</small></button>
    <button class="预览按钮" data-预览="${转义(c.路径)}" aria-label="预览 ${转义(c.标题)}">预览</button></div>`).join('')
    || '<div><small>没找到</small></div>';
}

function 未认领列表({组}){
  return 组.filter(([, v]) => (v || []).length).map(([k, v]) =>
    `<div class="组">${转义(k)} · ${v.length}</div>` + v.map(p =>
      `<div class="项" draggable="true" data-文件="${转义(p)}" title="${转义(p)}">${转义(p)}</div>`).join('')
  ).join('') || '<div class="组">都挂上了</div>';
}

function 搜索结果({前}){
  return 前.map((h, i) => `<div data-i="${i}"><b>${转义(h.文)}</b>
    <span class="搜索副文"> · ${转义(h.副)}</span></div>`).join('')
    || '<div class="次文">没找到</div>';
}

function 步骤卡({s, i, 路线文件}){
  const li = (s.docs || []).map(d => {
    const n = 路线文件(d);
    return `<li><span class="点" style="background:${n ? 色(n.类型) : 'var(--错)'}"></span>${
      转义(n ? n.标题 : d + ' ⚠缺失')}</li>`;
  }).join('');
  const 尾 = [...(s.tools || []).map(x => `<li>🔧 ${转义(x.split('/').pop())}</li>`),
             ...(s.outputs || []).map(o => `<li>📦 ${转义(o)}</li>`)].join('');
  return `<div class="序"><span>步骤 ${i + 1}</span><span class="序号" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span></div><h4>${转义(s.title)}</h4>
      ${s.note ? `<div class="提">${转义(s.note)}</div>` : ''}
      <ul class="步骤清单">${li}${尾}</ul>
      <div class="柄" title="拖到另一张卡上连线"></div>`;
}

function 分组头({b}){ return `<div class="头"><b>${转义(b.名)}</b><span>${b.数} 条</span></div>`; }

function 路线标题({r}){ return `        ${r.入口 ? '★ ' : ''}${转义(r.名称)}
        <span class="路线说明">　${转义(r.说明 || '')}</span>`; }
function 路线工具({r}){ return `        <button onclick="${转义(`加步骤(${JSON.stringify(r.名称)})`)}">+ 加一步</button>
        <button onclick="${转义(`改路线头(${JSON.stringify(r.名称)})`)}">改名字/说明</button>
        <button onclick="${转义(`删路线(${JSON.stringify(r.名称)})`)}" class="危险">删掉这条路线</button>
        <span>从右侧圆点拖到另一张卡 = 连线；点线 = 断开</span>`; }

return {路线标题, 路线工具, 条目详情, 步骤详情, 检查列表, 候选列表, 未认领列表, 搜索结果, 步骤卡, 分组头};
}
