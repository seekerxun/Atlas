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

export function 自动分组布局(分组, 视图, 宽, 尺寸, 折叠们 = new Set(), 折叠高 = 0){
  const 组们 = Object.entries(分组).filter(([, ns]) => ns.length).map(([名, ns]) => {
    const 有序 = ns.slice().sort(按修改排序), 列 = 选列(有序, 宽, 尺寸), id = `盒:${视图}:${名}`;
    const b = 组内布局(有序, 列, 尺寸);
    return {id, 名, 数:ns.length, ...b, h:折叠高 > 0 && 折叠们.has(id) ? 折叠高 : b.h,
      修改时间:Math.max(...ns.map(时间)), 排列:{版本:1, 列, 顺序:有序.map(n => n.路径)}};
  }).sort((a, b) => b.修改时间-a.修改时间 || 自然序.compare(a.名, b.名));
  return 矩形填空(组们, 宽, 尺寸.盒隙);
}
