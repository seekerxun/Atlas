// 主题目录、按需加载和资源生命周期。任何时刻只启用一份主题样式。
window.Atlas主题加载器 = (() => {
  const 必需 = ['色','导航内容','定位导航','算库布局','算路线布局','卡html',
    '初始视野','缩放外观','定位文件预览','定位展开','阅读区域','卡片过渡',
    '停卡片动效','布置阅读幕','画布入场','镜头缓动'];
  const 旧键 = 'atlas:theme', 选择键 = 'atlas:主题选择', 外观们 = ['浅','深'];
  let 目录;
  const 外观表 = item => Array.isArray(item.外观) ? item.外观 : [item.外观];
  async function 读取目录(){
    const r = await fetch('/界面/主题/目录.json');
    if (!r.ok) throw new Error('无法读取主题目录');
    const d = await r.json(), ids = new Set();
    if (!Array.isArray(d.主题) || !d.主题.length) throw new Error('主题目录为空');
    for (const item of d.主题){
      if (!item || typeof item.id !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(item.id) || ids.has(item.id) || typeof item.名称 !== 'string') throw new Error('主题登记格式不正确');
      const 表 = 外观表(item);
      if (!表.length || 表.some(v => !外观们.includes(v)) || new Set(表).size !== 表.length) throw new Error('主题外观应为 "浅"、"深" 或两者：' + item.id);
      ids.add(item.id);
    }
    if (!ids.has(d.默认)) throw new Error('默认主题未登记');
    目录 = d; return d;
  }
  // 方案 = 主题 + 外观。只支持一种外观的主题只有一个方案；深浅两用的主题有两个。
  // 每个方案的图标是主题目录里的 图标-<外观>.svg，主题面板用它代替名字。
  function 方案们(){
    return 目录.主题.flatMap(t => { const 表 = 外观表(t);
      return 表.map(外观 => ({值:`${t.id}@${外观}`, id:t.id, 外观, 名称:表.length > 1 ? `${t.名称} · ${外观}` : t.名称,
        图标:`/界面/主题/${encodeURIComponent(t.id)}/图标-${外观}.svg`})); });
  }
  function 找方案(值){ return 方案们().find(f => f.值 === 值); }
  function 系统外观(){ return matchMedia('(prefers-color-scheme: dark)').matches ? '深' : '浅'; }
  // 选择：手动固定一个方案，或跟随系统，在白天、夜间各用一个方案。
  function 读选择(){
    let s; try { s = JSON.parse(localStorage.getItem(选择键)); } catch {}
    const 全 = 方案们(), 有 = (值, 外观) => 全.some(f => f.值 === 值 && (!外观 || f.外观 === 外观));
    const 默认 = 外观 => (全.find(f => f.id === 目录.默认 && (!外观 || f.外观 === 外观)) || (外观 && 全.find(f => f.外观 === 外观)))?.值 ?? null;
    if (!s || typeof s !== 'object') {
      let 旧; try { 旧 = localStorage.getItem(旧键); } catch {}
      s = {模式:'手动', 手动:全.find(f => f.id === 旧)?.值};
    }
    return {
      模式: s.模式 === '跟随' ? '跟随' : '手动',
      手动: 有(s.手动) ? s.手动 : 默认(),
      浅: 有(s.浅, '浅') ? s.浅 : 默认('浅'),
      深: 有(s.深, '深') ? s.深 : 默认('深'),
    };
  }
  function 记选择(s){ try { localStorage.setItem(选择键, JSON.stringify(s)); localStorage.removeItem(旧键); } catch {} }
  function 当前方案(s){ return 找方案(s.模式 === '跟随' ? (s[系统外观()] || s.手动) : s.手动); }

  // 主题须通过这些接口创建副作用；卸载时统一回收，保留核心的事件和 DOM。
  function 生命周期(api){
    let disposed = false;
    const cleanups = [], animations = new Set(), decorations = new Set();
    const styles = new Map(), classes = new Map();
    const 清理 = fn => { cleanups.push(fn); return fn; };
    const onlyActive = fn => (...args) => { if (!disposed) return fn(...args); };
    return {
      api: {...api, 更新关联: onlyActive(api.更新关联), 清理,
        监听(target, type, fn, options){
          const callback = onlyActive(fn); target.addEventListener(type, callback, options);
          return 清理(() => target.removeEventListener(type, callback, options));
        },
        延时(fn, delay){ const id = setTimeout(onlyActive(fn), delay); 清理(() => clearTimeout(id)); return id; },
        循环(fn, delay){ const id = setInterval(onlyActive(fn), delay); 清理(() => clearInterval(id)); return id; },
        动画(el, frames, options){
          const a = el.animate(frames, options); animations.add(a);
          // forwards 填充仍属于主题，直到卸载时清理。
          a.finished.then(() => { if (a.effect?.getTiming().fill !== 'forwards' && a.effect?.getTiming().fill !== 'both') animations.delete(a); }, () => animations.delete(a));
          return a;
        },
        装饰(el, parent = document.body){
          for (const old of decorations) if (!old.isConnected) decorations.delete(old);
          decorations.add(el); parent.appendChild(el); return el;
        },
        移动(el, parent, before = null){
          const originalParent = el.parentNode, next = el.nextSibling;
          parent.insertBefore(el, before);
          清理(() => { if (originalParent) originalParent.insertBefore(el, next?.parentNode === originalParent ? next : null); });
        },
        样式(el, values){
          if (!styles.has(el)) styles.set(el, new Map());
          const old = styles.get(el);
          for (const [k,v] of Object.entries(values)) {
            if (!old.has(k)) old.set(k,[el.style.getPropertyValue(k),el.style.getPropertyPriority(k)]);
            el.style.setProperty(k,v);
          }
        },
        类名(el, name, enabled = true){
          if (!classes.has(el)) classes.set(el,new Map());
          const old = classes.get(el); if (!old.has(name)) old.set(name,el.classList.contains(name));
          el.classList.toggle(name,enabled);
        },
      },
      dispose(){
        if (disposed) return; disposed = true;
        animations.forEach(a => a.cancel()); animations.clear();
        for (const fn of cleanups.reverse()) { try { fn(); } catch (e) { console.error('主题清理失败', e); } }
        styles.forEach((values,el) => values.forEach(([v,p],k) => v ? el.style.setProperty(k,v,p) : el.style.removeProperty(k))); styles.clear();
        classes.forEach((values,el) => values.forEach((v,k) => el.classList.toggle(k,v))); classes.clear();
        decorations.forEach(el => el.remove()); decorations.clear();
      },
    };
  }
  function 实例(meta, factory, css, api){
    const scope = 生命周期(api);
    try {
      const theme = factory(scope.api);
      for (const key of ['路线标题','路线工具','条目详情','步骤详情','检查列表','候选列表','未认领列表','搜索结果','步骤卡','分组头','项目列表'])
        if (typeof theme?.模板?.[key] !== 'function') throw new Error('主题缺少区域模板：' + key);
      for (const key of 必需) if (typeof theme?.[key] !== 'function') throw new Error('主题缺少接口：' + key);
      if (theme.分组折叠高 != null && typeof theme.分组折叠高 !== 'function') throw new Error('主题接口不正确：分组折叠高');
      if (theme.算自动布局 != null && typeof theme.算自动布局 !== 'function') throw new Error('主题接口不正确：算自动布局');
      for (const key of ['卡宽','卡高','隙','盒隙','内左','内顶','路线起点','路线间距','路线标题距','路线编辑距','连线出口'])
        if (!Number.isFinite(theme.布局?.[key]) || theme.布局[key] < 0) throw new Error('主题布局参数不正确：' + key);
      if (!theme.布局.卡宽 || !theme.布局.卡高 || !(theme.镜头时长 > 0)) throw new Error('主题尺寸或动画时长不正确');
      return {meta, factory, css, theme, scope};
    } catch (e) { scope.dispose(); throw e; }
  }
  async function 准备(id, api){
    const meta = 目录.主题.find(t => t.id === id);
    if (!meta) throw new Error('找不到这个主题');
    const base = '/界面/主题/' + encodeURIComponent(id) + '/';
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.media = 'not all'; css.dataset.atlasTheme = id;
    let timer;
    const timeout = new Promise((_,reject) => { timer = setTimeout(() => reject(new Error('主题加载超时')), 10000); });
    const styleReady = new Promise((resolve,reject) => {
      css.onload = resolve;
      css.onerror = () => reject(new Error('主题样式加载失败'));
    });
    css.href = base + '样式.css'; document.head.appendChild(css);
    try {
      const [module] = await Promise.race([Promise.all([import(base + '主题.js'), styleReady]), timeout]);
      if (typeof module.default !== 'function') throw new Error('主题脚本没有导出创建函数');
      return 实例(meta, module.default, css, api);
    } catch (e) { css.remove(); throw e; }
    finally { clearTimeout(timer); css.onload = css.onerror = null; }
  }
  function 启用(pack, 外观){
    if (!pack.css.isConnected) document.head.appendChild(pack.css);
    document.documentElement.dataset.外观 = 外观;
    pack.css.media = 'all'; document.documentElement.dataset.theme = pack.meta.id;
  }
  function 卸载(pack){
    if (!pack) return;
    try { pack.theme.卸载?.(); } catch (e) { console.error('主题卸载失败', e); }
    finally { pack.scope.dispose(); pack.css.remove(); }
  }
  function 重建(pack, api){ return 实例(pack.meta, pack.factory, pack.css, api); }
  return {读取目录, 方案们, 找方案, 系统外观, 读选择, 记选择, 当前方案, 准备, 启用, 卸载, 重建};
})();
