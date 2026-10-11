// 空间请求回归：node atlas/test_disk_usage.js。
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../视图/核心.js'), 'utf8');
const nodes = new Map(), requests = [], intervals = [], timers = [];
const $ = key => {
  if (!nodes.has(key)) nodes.set(key, {textContent:'…', setAttribute(){}, removeAttribute(){}, toggleAttribute(){}});
  return nodes.get(key);
};
let scans = 0, reveal, result = {根:'/project', 字节:123*1024**2, 时间:1000, 扫描中:false};
const ctx = vm.createContext({$, 项目根:'/project', 项目头:()=>({'X-Atlas-Root':'/project'}),
  document:{hidden:false}, location:{reload:()=>{throw Error('wrong root');}},
  setTimeout:fn=>{timers.push(fn);return timers.length;}, clearTimeout:()=>{},
  setInterval:(fn,ms)=>intervals.push({fn,ms}),
  fetch:async (url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({...result})};},
  系统打开:(...args)=>reveal=args, 取数:async()=>{scans++;}, 提示:()=>{},
});
const start = source.indexOf('// 空间统计独立于 /数据');
vm.runInContext(source.slice(start, source.indexOf('async function 读数据', start)), ctx);
const manual = source.indexOf("$('#刷').onclick =");
vm.runInContext(source.slice(manual, source.indexOf("$('#新路线').onclick", manual)), ctx);
(async () => {
  assert.equal(ctx.空间短名(123*1024**2),'123M');
  assert.equal(ctx.空间短名(133*1024**3),'133G');
  assert.equal(ctx.空间短名(134*1024**4),'134T');
  assert.equal(ctx.空间短名(1024**3-1),'1G');
  assert.equal(ctx.空间短名(1),'1M');
  assert.equal(ctx.空间短名(0),'0M');
  await ctx.查空间('更新');
  assert.equal(requests.at(-1).url,'/空间?更新=1');
  assert.equal($('#项目空间').textContent,'123M');
  result.扫描中=true;
  await ctx.查空间('强制');
  assert.equal(requests.at(-1).options.method,'POST');
  assert.equal(requests.at(-1).options.headers['X-Atlas-Root'],'/project');
  assert.equal($('#项目空间').textContent,'123M');
  result.扫描中=false;
  await timers.at(-1)();
  assert.equal(requests.at(-1).url,'/空间');
  assert.equal(requests.at(-1).options,undefined);
  assert.equal(intervals[0].ms,300000);
  ctx.document.hidden=true;
  const count=requests.length;
  intervals[0].fn();assert.equal(requests.length,count);
  ctx.document.hidden=false;
  intervals[0].fn();await new Promise(setImmediate);
  assert.equal(requests.at(-1).url,'/空间?更新=1');
  $('#刷').onclick();await new Promise(setImmediate);
  assert.equal(requests.at(-1).options.method,'POST');assert.equal(scans,1);
  $('#项目位置').onclick();assert.deepEqual(reveal,['.',false]);
  console.log('空间请求通过：M/G/T、后台轮询、五分钟更新、后台页面跳过、手动强刷、访达入口。');
})().catch(e=>{console.error(e);process.exitCode=1;});
