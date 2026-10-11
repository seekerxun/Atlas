// 分组内部按时间排，外部以完整矩形填空；纯计算，不读取 DOM 或写盘。
const 自然序 = new Intl.Collator('zh', {numeric:true, sensitivity:'base'});
const 时间 = n => Number.isFinite(n.修改时间) ? n.修改时间 : 0;
export const 按修改排序 = (a, b) => 时间(b) - 时间(a) || 自然序.compare(a.编号 || a.标题 || a.名称 || a.路径, b.编号 || b.标题 || b.名称 || b.路径) || 自然序.compare(a.路径, b.路径);

export function 组内布局(条目, 列, 尺寸){
  const {卡宽, 卡高, 隙, 内左, 内顶, 图后缀} = 尺寸;
  const 卡们 = []; let y = 0;
  for (let i = 0; i < 条目.length; i += 列) {
    const 行 = 条目.slice(i, i + 列);
    const h = 卡高 + (行.some(n => (n.资产展开 || []).some(a => 图后缀.test(a))) ? 50 : 0);
    行.forEach((节, j) => 卡们.push({节, x:j * (卡宽 + 隙), y, h}));
    y += h + 隙;
  }
  return {w:列 * (卡宽 + 隙) - 隙 + 内左 * 2, h:内顶 + Math.max(0, y - 隙) + 20, 卡们};
}

// 保存顺序而非“持续按时间排序”：新增条目接在末尾，只有再次点排列才更新顺序。
export function 恢复组内布局(条目, 排列, 尺寸){
  if (排列?.版本 !== 1 || !Number.isInteger(排列.列) || 排列.列 < 1 || 排列.列 > 6 || !Array.isArray(排列.顺序)) return null;
  const 位序 = new Map(排列.顺序.map((p, i) => [p, i]));
  const 有序 = 条目.slice().sort((a, b) => (位序.get(a.路径) ?? Infinity) - (位序.get(b.路径) ?? Infinity) || 自然序.compare(a.路径, b.路径));
  return 组内布局(有序, 排列.列, 尺寸);
}

function 选列(条目, 宽, 尺寸){
  const 上限 = Math.min(6, 条目.length, Math.max(1, Math.floor((宽 - 尺寸.内左 * 2 + 尺寸.隙) / (尺寸.卡宽 + 尺寸.隙))));
  if (条目.length <= 4) return 上限;
  let 最好 = 1, 分 = Infinity;
  for (let 列 = 1; 列 <= 上限; 列++) {
    const b = 组内布局(条目, 列, 尺寸), 行 = Math.ceil(条目.length / 列);
    const 候选 = Math.abs(Math.log(b.w / b.h / 1.4)) + Math.max(0, 行 - 3) * .25 + (行 * 列 - 条目.length) / 条目.length * .4;
    if (候选 < 分) { 分 = 候选; 最好 = 列; }
  }
  return 最好;
}

const 相交 = (a, b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
const 包含 = (a, b) => a.x <= b.x && a.y <= b.y && a.x+a.w >= b.x+b.w && a.y+a.h >= b.y+b.h;

// MaxRects 式空闲矩形切分。按新到旧依次放组，优先上方、再左侧，不按面积打乱输入。
export function 矩形填空(分组, 宽, 隙){
  if (!分组.length) return [];
  宽 = Math.max(宽, ...分组.map(b => b.w));
  let 空位 = [{x:0, y:0, w:宽 + 隙, h:分组.reduce((s, b) => s + b.h + 隙, 0)}];
  return 分组.map(b => {
    const w = b.w + 隙, h = b.h + 隙;
    const 可放 = 空位.filter(f => f.w >= w && f.h >= h)
      .sort((a, b) => a.y-b.y || a.x-b.x || a.w*a.h-b.w*b.h);
    const p = 可放[0];
    if (!p) throw new Error('无法放入分组');
    const 占 = {x:p.x, y:p.y, w, h}, 新空位 = [];
    for (const f of 空位) {
      if (!相交(f, 占)) { 新空位.push(f); continue; }
      if (占.x > f.x) 新空位.push({...f, w:占.x-f.x});
      if (占.x+w < f.x+f.w) 新空位.push({...f, x:占.x+w, w:f.x+f.w-占.x-w});
      if (占.y > f.y) 新空位.push({...f, h:占.y-f.y});
      if (占.y+h < f.y+f.h) 新空位.push({...f, y:占.y+h, h:f.y+f.h-占.y-h});
    }
    空位 = 新空位.filter((f, i) => !新空位.some((o, j) => i !== j && 包含(o, f) && (!包含(f, o) || j < i)));
    return {...b, x:p.x+40, y:p.y+40};
  });
}

// 系列按目录结构／编号前缀识别，不把 E01、E02 等同系列分组与模板穿插。
// 至少两个分组匹配才形成区域；原始分组、标题和布局键都不改变。
function 系列键(名){
  const 段 = 名.split(/\s*\/\s*/), 末 = 段.pop(), 上级 = 段.join('/');
  const 编号 = 末.match(/^([\p{L}]+)\d+(?=$|[-_\s])/u);
  if (编号) return `编号:${上级}:${编号[1].toLocaleUpperCase()}`;
  return 上级 ? `目录:${上级}` : null;
}

// 保持时间顺序，按整行换行；均衡余量，避免七张卡排成 3+3+1。
function 对齐分行(组们, 宽, 隙){
  const n = 组们.length, 代价 = Array(n+1).fill(Infinity), 断点 = [];
  代价[n] = 0;
  for (let i = n-1; i >= 0; i--) {
    let 行宽 = 0;
    for (let j = i; j < n; j++) {
      行宽 += 组们[j].w + (j > i ? 隙 : 0);
      if (行宽 > 宽) break;
      const 分 = 1 + ((宽-行宽)/宽)**2 + 代价[j+1];
      if (分 <= 代价[i] + 1e-9) { 代价[i] = 分; 断点[i] = j+1; }
    }
  }
  const 子组 = []; let y = 0, w = 0, 行数 = 0;
  for (let i = 0; i < n;) {
    const end = 断点[i]; let x = 0, 行高 = 0;
    for (let j = i; j < end; j++) {
      子组.push({...组们[j], x, y});
      x += 组们[j].w + 隙; 行高 = Math.max(行高, 组们[j].h);
    }
    w = Math.max(w, x-隙); y += 行高+隙; 行数++; i = end;
  }
  return {w, h:y-隙, 子组, 行数};
}

function 系列区域(组们, 宽, 隙){
  const 最窄 = Math.max(...组们.map(b => b.w)), 总宽 = 组们.reduce((s,b) => s+b.w+隙, -隙);
  宽 = Math.max(宽, 最窄);
  if (组们.length <= 3 && 总宽 <= 宽) return 对齐分行(组们, 总宽, 隙);
  // 候选来自真实卡宽，避免使用与卡宽不吻合的任意行宽。
  const 宽们 = new Set([最窄, 宽]);
  for (let i = 0; i < 组们.length; i++) {
    let w = 0;
    for (let j = i; j < Math.min(i+6, 组们.length); j++) {
      w += 组们[j].w + (j > i ? 隙 : 0);
      if (w > 宽) break;
      if (w >= 最窄) 宽们.add(w);
    }
  }
  let 最好, 最小 = Infinity;
  for (const w of 宽们) {
    const 区 = 对齐分行(组们, w, 隙);
    const 分 = Math.abs(Math.log(区.w/区.h/1.4)) + Math.max(0, 区.行数-3)*.12;
    if (分 < 最小) { 最好 = 区; 最小 = 分; }
  }
  return 最好;
}

export function 按系列填空(组们, 宽, 隙){
  const 系列 = new Map();
  for (const b of 组们) {
    const key = 系列键(b.名);
    if (key) { if (!系列.has(key)) 系列.set(key, []); 系列.get(key).push(b); }
  }
  const 已归 = new Set(), 区们 = [];
  for (const [key, 同类] of 系列) {
    if (同类.length < 2) continue;
    同类.forEach(b => 已归.add(b.id));
    区们.push({id:key, ...系列区域(同类, 宽, 隙)});
  }
  // 系列完整占一块区域，其余小分组填在区域外，不钻进系列的行尾空位。
  const 待排 = [...区们, ...组们.filter(b => !已归.has(b.id))];
  const 已排 = 矩形填空(待排, 宽, 隙);
  const 行线 = [...new Set(已排.flatMap(b => (b.子组 || []).map(c => b.y+c.y)))].sort((a,b) => a-b);
  // 侧边小组离系列行线很近时顺势对齐，避免模板矮一点就让下排参差。
  已排.filter(b => !b.子组).sort((a,b) => b.y-a.y).forEach(b => {
    const y = 行线.find(y => y >= b.y && y-b.y <= 隙*1.5);
    if (y == null || y === b.y) return;
    const 候选 = {...b, y, w:b.w+隙, h:b.h+隙};
    if (已排.every(o => o === b || !相交(候选, {...o, w:o.w+隙, h:o.h+隙}))) b.y = y;
  });
  return 已排.flatMap(b => b.子组
    ? b.子组.map(c => ({...c, x:c.x+b.x, y:c.y+b.y})) : [b]);
}

export function 自动分组布局(分组, 视图, 宽, 尺寸, 折叠们 = new Set(), 折叠高 = 0){
  const 组们 = Object.entries(分组).filter(([, ns]) => ns.length).map(([名, ns]) => {
    const 有序 = ns.slice().sort(按修改排序), 列 = 选列(有序, 宽, 尺寸), id = `盒:${视图}:${名}`;
    const b = 组内布局(有序, 列, 尺寸);
    return {id, 名, 数:ns.length, ...b, h:折叠高 > 0 && 折叠们.has(id) ? 折叠高 : b.h,
      修改时间:Math.max(...ns.map(时间)), 排列:{版本:1, 列, 顺序:有序.map(n => n.路径)}};
  }).sort((a, b) => b.修改时间-a.修改时间 || 自然序.compare(a.名, b.名));
  return 按系列填空(组们, 宽, 尺寸.盒隙);
}
