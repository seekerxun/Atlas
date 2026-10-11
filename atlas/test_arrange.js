// node atlas/test_arrange.js：使用真实纯布局模块验证排序、填空、尺寸和持久顺序。
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async () => {
  const {自动分组布局, 恢复组内布局, 矩形填空} = await import(pathToFileURL(path.resolve(__dirname, '../视图/主题/矢量/排列.js')));
  const size = {卡宽:260, 卡高:172, 隙:14, 盒隙:40, 内左:20, 内顶:70, 图后缀:/\.(png|jpg)$/i};
  const make = (name, n, time) => Array.from({length:n}, (_, i) => ({路径:`内容/${name}/${i+1}.md`, 名称:`E${i+1}`, 修改时间:time-i, 类型:i%2 ? '图片' : '视频', 资产展开:i%3 ? [] : ['a.png']}));
  const groups = {A:make('A',9,100), B:make('B',2,80), C:make('C',2,60), D:make('D',4,40)};
  const original = JSON.stringify(groups);
  const boxes = 自动分组布局(groups, '内容', 2400, size);
  assert.deepEqual(boxes.map(b=>b.名), ['A','B','C','D']);
  assert.equal(new Set(boxes[0].卡们.map(c=>c.y)).size,3);
  for (const b of boxes.slice(1)) assert.equal(new Set(b.卡们.map(c=>c.y)).size,1);
  assert.equal(boxes[1].y,boxes[2].y);assert.ok(boxes[1].x>boxes[0].x);
  assert.ok(boxes[3].x>boxes[0].x && boxes[3].y<boxes[0].y+boxes[0].h,'small group uses space beside tall group');
  assert.equal(JSON.stringify(groups),original,'input is read-only');
  const natural = 自动分组布局({N:[{路径:'10',名称:'E10',修改时间:10},{路径:'2',名称:'E2',修改时间:10},{路径:'1',名称:'E1',修改时间:null},{路径:'9',名称:'E9',修改时间:20}]},'资料',2400,size)[0];
  assert.deepEqual(natural.排列.顺序,['9','2','10','1']);
  const changed = groups.A.map(n=>({...n,修改时间:-n.修改时间}));
  changed.push({路径:'内容/A/new.md',名称:'新条目',修改时间:999});
  const restored = 恢复组内布局(changed,boxes[0].排列,size);
  assert.deepEqual(restored.卡们.map(c=>c.节.路径),[...boxes[0].排列.顺序,'内容/A/new.md']);
  assert.equal(恢复组内布局(changed,{版本:1,列:0,顺序:[]},size),null);
  assert.equal(自动分组布局(groups,'内容',2400,size,new Set(['盒:内容:A']),84)[0].h,84);
  assert.deepEqual(自动分组布局({},'内容',2400,size),[]);
  let seed=117;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  for (let trial=0;trial<80;trial++) {
    const rects=Array.from({length:5+Math.floor(random()*50)},(_,i)=>({id:i,w:100+Math.floor(random()*900),h:60+Math.floor(random()*1000)}));
    const packed=矩形填空(rects,1200,40);
    assert.equal(packed.length,rects.length);
    assert.deepEqual(矩形填空(rects,1200,40),packed,'deterministic');
    packed.forEach((a,i)=>{
      assert.ok(a.x>=40&&a.y>=40&&a.x+a.w<=1240);
      packed.slice(i+1).forEach(b=>assert.ok(a.x+a.w+40<=b.x||b.x+b.w+40<=a.x||a.y+a.h+40<=b.y||b.y+b.h+40<=a.y,'no overlaps, including gutter'));
    });
  }
  for (const n of [1,2,4,9,19,50,100]) {
    const b=自动分组布局({A:make('A',n,1000)},'内容',848,size)[0];
    assert.equal(b.卡们.length,n);
    assert.ok(b.w<=848);
    for(const c of b.卡们)assert.ok(c.x+size.内左+size.卡宽<=b.w&&c.y+size.内顶+c.h<=b.h);
  }
  console.log('自动排列回归通过：目录完整、修改时间与自然序、大小组填空、窄画布、折叠、保存顺序、80 组随机无重叠。');
})().catch(e=>{console.error(e);process.exitCode=1;});
