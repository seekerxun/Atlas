// 搜索行为回归：node atlas/test_search.js；直接执行核心里的真实实现。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '视图/核心.js'), 'utf8');
const start = source.indexOf('// ---------------------------------------------------------------- 搜索\n');
const end = source.indexOf("document.addEventListener('keydown'", start);
let rendered;
const more = {};
const input = {value:''}, output = {style:{}, querySelectorAll:()=>[], querySelector:s=>s === '[data-搜索更多]' && rendered?.更多 ? more : null};
const storage = new Map();
const context = vm.createContext({
  项目根:"/项目甲", 提示:()=>{},
  localStorage:{getItem:key=>storage.get(key) ?? null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key)},
  $:s=>s === '#搜 input' ? input : output,
  转义:s=>String(s ?? '').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  数据:null, 主题:{模板:{搜索结果:args=>{rendered=args;return '';}}},
});
vm.runInContext(source.slice(start,end), context);
const data = {
  条目:[{路径:'内容/a.md',名称:'普通文档',标题:'独立标题',摘要:'苹果',标签:['测试']},
    {路径:'内容/b.md',名称:'独有词',摘要:''}, {路径:'资产/demo.png',名称:'demo.png',资产文件:true}],
  搜索正文:{'内容/a.md':'# 独有词\n香蕉\n' + '背景'.repeat(200) + '\n远处词 <script>alert(1)</script>', '内容/b.md':''},
  路线:[{路径:'路线/a.yml',名称:'独立路线',说明:'路线说明',步骤:[{id:'step2',title:'第二步骤',note:'护栏提示',docs:['内容/a'],tools:['工具/run.py'],outputs:['产出/目标']}]}],
  资产:['资产/demo.png'], 工具:['工具/run.py'],
  文件候选:[{文件路径:'工具/run.py'}, {文件路径:'路线/a.yml'}, {文件路径:'额外.txt',标题:'额外文本'}],
};
const index = context.建搜索索引(data);
const search = q=>context.查搜索(index,q);
assert.equal(search('独立标题')[0].路径,'内容/a.md');
assert.equal(search('苹果 香蕉')[0].路径,'内容/a.md');
assert.equal(search('香蕉 独立标题')[0].路径,'内容/a.md');
assert.equal(search('不存在 香蕉').length,0);
assert.equal(search('独立路线')[0].种,'路线');
assert.equal(search('第二步骤 护栏提示')[0].步,'step2');
assert.equal(search('产出/目标')[0].种,'步骤');
assert.equal(search('独有词')[0].路径,'内容/b.md');
assert.equal(search('ＤＥＭＯ').length,1);
assert.equal(search('额外文本')[0].路径,'额外.txt');
assert.equal(search('   ').length,0);
assert.ok(search('香蕉 远处词')[0].片段.includes('香蕉'));
assert.ok(search('香蕉 远处词')[0].片段.includes('远处词'));
assert.equal(index.filter(h=>h.路径 === '资产/demo.png').length,1);
context.数据=data;
input.value='[';input.oninput();
assert.equal(context.搜索标记('[<img>]'),'<mark>[</mark>&lt;img&gt;]');
input.value='script';input.oninput();
assert.ok(!context.搜索标记('<script>alert(1)</script>').includes('<script>'));
input.value='.*';input.oninput();
assert.equal(context.搜索标记('abc .*'), 'abc <mark>.*</mark>');
context.数据={条目:Array.from({length:65},(_,i)=>({名称:`匹配文档 ${i}`,路径:`内容/${i}.md`})),搜索正文:{}};
input.value='匹配';input.oninput();
assert.equal(rendered.总数,65);
assert.equal(rendered.前.length,30);
assert.equal(rendered.更多,true);
let stopped = false;
more.onclick({stopPropagation:()=>{stopped=true;}});
assert.equal(stopped,true);
assert.equal(output.style.display,'block');
assert.equal(rendered.前.length,60);
vm.runInContext('搜索上限 += 30; 画搜索结果()',context);
assert.equal(rendered.前.length,65);
assert.equal(rendered.更多,false);
context.数据={条目:[{名称:'修改后的文档',路径:'新.md'}],搜索正文:{}};
input.value='匹配';input.oninput();assert.equal(rendered.总数,0);
input.value='修改后';input.oninput();assert.equal(rendered.总数,1);
context.数据={条目:[]};
input.value='全文';input.oninput();assert.ok(rendered.提醒.includes('重启'));
context.数据={条目:[],搜索正文:{},搜索遗漏:['失败.md']};
input.oninput();assert.ok(rendered.提醒.includes('失败.md'));
console.log('搜索回归通过：全文、多词、排序、路线步骤、去重、规范化、高亮转义、65 项分页及快照更新。');

// 记录只保存完成的查询，刷新后保留，按项目隔离且可持久清除。
input.value='输入中的半截';input.oninput();assert.equal(context.读搜索记录().length,0);
input.value='  苹果   香蕉 ';input.onblur();
assert.equal(context.读搜索记录()[0],'苹果 香蕉');
input.value='DEMO';input.onblur();input.value='ｄｅｍｏ';input.onblur();
assert.equal(context.读搜索记录().length,2);
vm.runInContext('搜索记录缓存.clear()',context);
assert.equal(context.读搜索记录()[0],'ｄｅｍｏ');
context.项目根='/项目乙';assert.equal(context.读搜索记录().length,0);
input.value='乙项目';input.onblur();context.项目根='/项目甲';
assert.equal(context.读搜索记录().length,2);
for(let i=0;i<25;i++){input.value=`记录${i}`;input.onblur();}
assert.equal(context.读搜索记录().length,20);
assert.equal(context.读搜索记录()[0],'记录24');
context.存搜索记录([]);vm.runInContext('搜索记录缓存.clear()',context);
assert.equal(context.读搜索记录().length,0);
context.项目根='/项目乙';assert.equal(context.读搜索记录()[0],'乙项目');
input.value='没有结果的搜索';input.oninput();
input.onkeydown({key:'Enter',isComposing:false,preventDefault:()=>{}});
assert.equal(context.读搜索记录()[0],'没有结果的搜索');
input.value='';input.oninput();assert.ok(Array.isArray(rendered.记录));
context.项目根='/损坏记录';storage.set('atlas:搜索记录:/损坏记录','{bad json');
assert.equal(context.读搜索记录().length,0);
console.log('搜索记录回归通过：保存时机、去重、20 条上限、刷新恢复、项目隔离、清空及异常数据。');
