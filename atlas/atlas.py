#!/usr/bin/env python3
"""atlas —— 项目知识导航。零依赖。

  atlas 扫描                写出 .atlas/索引.json
  atlas 检查 [--只看错误] [--严格]  体检，有错误退出码 1；--严格 把被 git 忽略的缺失文件也算错误
  atlas 路线 [名字] [--列表] 输出这条路线的文件清单（给 AI 用）
  atlas 找 <关键词>          搜条目 / 工具 / 资产
  atlas 迁移 --加字段 k=v [--筛选 类型=NPC] [--演习]
  atlas 迁移 --改名 旧=新 [--演习]
  atlas 认领 <文件> <条目> [--分类 人设]
  atlas 新建 <模板> <路径> [--名称 显示名]   从 模板/ 生成新项目并登记
  atlas 改名 --类型 旧=新 [--演习]        类型值改名（副本 → 世界节点）
  atlas 改名 --条目 <编号或名字>=新名      条目改名，连带修所有引用
  atlas 改名 --词表 机制:旧=新             受控词表里的一个值改名
  atlas 改名 --字段 旧=新                  自定义字段名改名
  atlas 钩子                装 git pre-commit
  atlas serve [--端口 7391] [--不开浏览器]   起本地画布
  atlas 运行 [目标] [--停止]  列出 .devdock.json 里的运行目标及状态；带目标名就启动（或停止）它
  atlas 计划                 列出 计划.yml，进行中的在前
  atlas 计划 加 <id> <标题> [--涉及 a,b] [--验收 …]   加一条待办（没有 计划.yml 就新建）
  atlas 计划 开始|完成|搁置 <id> [--产出 a,b]          改状态，顺手写 updated；完成必须带产出
  atlas 待定 [--行内]        汇总各文档「## 待定」小节；--行内 再列出正文里散落的「待定」

英文别名（与中文等价，可混用）：
  scan 扫描 · check 检查 · route 路线 · find 找 · migrate 迁移 · claim 认领
  new 新建 · rename 改名 · hook 钩子 · run 运行 · plan 计划 · pending 待定
  plan 的动作：add 加 · start 开始 · done 完成 · drop 搁置
  --touches 涉及 · --done-when 验收 · --outputs 产出 · --inline 行内
  --errors-only 只看错误 · --strict 严格 · --list 列表 · --add-field 加字段 · --rename 改名
  --filter 筛选 · --dry-run 演习 · --category 分类 · --name 名称 · --type 类型
  --entry 条目 · --vocab 词表 · --field 字段 · --port 端口 · --no-browser 不开浏览器 · --stop 停止
"""
from __future__ import annotations
import datetime, json, os, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model import 找根, ATLAS, 发现        # noqa: E402
from scan import 建索引, 解析目标          # noqa: E402
from lint import 校验, 体检数, _存在       # noqa: E402
import edit                                # noqa: E402

C = {"红": "\033[31m", "黄": "\033[33m", "绿": "\033[32m", "蓝": "\033[34m",
     "淡": "\033[2m", "粗": "\033[1m", "_": "\033[0m"}
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}


def 宽(s: str) -> int:
    """中日韩字符占两列，按显示宽度算。"""
    import unicodedata
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def 垫(s: str, n: int) -> str:
    return s + " " * max(1, n - 宽(s))


def 根目录() -> Path:
    r = 找根(Path.cwd())
    if r is None:
        sys.exit("这里不是 Atlas 项目（往上找不到 项目.yml）。用 `atlas 新建` 建一个。")
    return r


# ---------------------------------------------------------------- 扫描
def 命令_扫描(args):
    根 = 根目录()
    idx = 建索引(根)
    out = 根 / ".atlas" / "索引.json"
    out.parent.mkdir(exist_ok=True)
    数据 = {
        "版本": 1, "项目": idx.cfg.名称, "主分组": idx.cfg.主分组,
        "条目": [n.to_dict() for n in idx.条目.values()],
        "工具": idx.工具, "资产": idx.资产, "数据表": idx.数据,
        "未归类": idx.未归类,
        "词表值": {k: sorted(v) for k, v in idx.词表值.items()},
        "路线": [{"名称": r.名称, "路径": r.路径, "说明": r.说明, "入口": r.入口,
                 "步骤": [s.__dict__ for s in r.步骤]} for r in idx.路线],
        "计划": [p.__dict__ for p in idx.计划] if idx.有计划 else None,
        "统计": idx.统计(),
    }
    out.write_text(json.dumps(数据, ensure_ascii=False, indent=1), encoding="utf-8")
    s = idx.统计()
    print(f"{C['绿']}✓{C['_']} .atlas/索引.json（{out.stat().st_size // 1024} KB）")
    print(f"  文档 {s['文档']} · 工具 {s['工具']} · 资产 {s['资产']} · "
          f"数据表 {s['数据']} · 路线 {s['路线']} · 未归类 {s['未归类']}")
    return idx


# ---------------------------------------------------------------- 检查
def 命令_检查(args):
    根 = 根目录()
    idx = 建索引(根)
    结果 = 校验(idx, 严格=bool(args.严格))
    if args.只看计划:
        # 给 pre-commit 用的提醒：只打计划相关的警告，安静、不改退出码
        for f in 结果:
            if f.级别 == "警告" and f.位置.startswith("计划.yml"):
                print(f"{C['黄']}! {f.码}{C['_']} {f.位置}  {f.信息}"
                      + (f"\n    {C['蓝']}→ {f.提示}{C['_']}" if f.提示 else ""))
        return
    if args.只看错误:
        结果 = [f for f in 结果 if f.级别 == "错误"]
    当前 = None
    for f in 结果:
        if f.码 != 当前:
            当前 = f.码
            色 = C["红"] if f.级别 == "错误" else C["黄"]
            说明 = idx.cfg.规则说明.get(f.码, ("", f.码))[1]
            n = sum(1 for x in 结果 if x.码 == f.码)
            print(f"\n{色}{C['粗']}{f.码} {说明}{C['_']} {C['淡']}× {n}{C['_']}")
        标 = "✗" if f.级别 == "错误" else "!"
        print(f"  {标} {f.位置}\n      {f.信息}" + (f"\n      {C['蓝']}→ {f.提示}{C['_']}" if f.提示 else ""))

    数 = 体检数(idx, 结果)
    s = idx.统计()
    print(f"\n{'─' * 58}")
    print(f"{C['粗']}{idx.cfg.名称}{C['_']}  文档 {s['文档']} · {s['总行数']} 行 · "
          f"工具 {s['工具']} · 资产 {s['资产']} · 路线 {s['路线']}")
    for k in ("未归类", "孤儿工具", "缺frontmatter", "孤儿资产", "放错位置"):
        v = 数[k]
        色 = C["绿"] if v == 0 else C["黄"]
        print(f"  {k:<16}{色}{v}{C['_']}")
    print(f"  {C['红']}{数['错误']} 错误{C['_']}   {C['黄']}{数['警告']} 警告{C['_']}")
    print("─" * 58)
    if 数["错误"]:
        print(f"{C['红']}✗ 不通过{C['_']}")
        sys.exit(1)
    print(f"{C['绿']}✓ 通过{C['_']}")


# ---------------------------------------------------------------- 路线
def 命令_路线(args):
    根 = 根目录()
    idx = 建索引(根)
    if args.列表 or not args.名字:
        if not idx.路线:
            print("还没有路线。在 路线/ 下建一个 .yml。")
            return
        print(f"{C['粗']}可用路线：{C['_']}")
        for r in idx.路线:
            篇 = len({d for s in r.步骤 for d in s.docs})
            print(f"  {'★ ' if r.入口 else '  '}{C['粗']}{r.名称}{C['_']}  "
                  f"{C['淡']}{len(r.步骤)} 步 / {篇} 篇文档"
                  f"{'  —  ' + r.说明 if r.说明 else ''}{C['_']}")
        return
    命中 = [r for r in idx.路线 if r.名称 == args.名字] or \
           [r for r in idx.路线 if args.名字 in r.名称]
    if not 命中:
        sys.exit(f"没有叫 `{args.名字}` 的路线。可用：" + "、".join(r.名称 for r in idx.路线))
    r = 命中[0]

    文件, 行数 = {}, 0   # 文件 → 首次出现的步骤号；同一篇在多步出现只算一次
    out = [f"# 路线：{r.名称}"] + ([f"# {r.说明}"] if r.说明 else []) + [""] + 计划头(idx)
    for i, s in enumerate(r.步骤, 1):
        out.append(f"## 步骤 {i} — {s.title}")
        if s.note:
            out.append(f"#  {s.note}")
        新条目 = []   # 本步第一次出现的条目，只列它们的图
        for d in s.docs:
            n = idx.条目.get(f"{d}.md")
            路径 = n.路径 if n else (f"{d}.md" if (根 / f"{d}.md").exists() else d)
            if 路径 in 文件:
                out.append(垫(f"读   {路径}", 52) + f"# 同步骤 {文件[路径]}")
                continue
            if n:
                out.append(垫(f"读   {n.路径}", 52) + f"# {n.类型} · {n.行数}行"
                           + (f" · {n.摘要}" if n.摘要 else ""))
                文件[n.路径] = i
                行数 += n.行数
                新条目.append(n)
            elif (根 / f"{d}.md").exists() or (根 / d).exists():
                p = f"{d}.md" if (根 / f"{d}.md").exists() else d
                try:
                    源码行数 = (根 / p).read_text(encoding="utf-8").count("\n") + 1
                except (UnicodeError, OSError):
                    源码行数 = None
                out.append(f"读   {p}" + (f"  # {源码行数}行" if 源码行数 is not None else ""))
                文件[p] = i
                行数 += 源码行数 or 0
            else:
                out.append(f"读   ??? `{d}` 不存在")
        for t in s.tools:
            out.append(f"工具 {t}")
        for o in s.outputs:
            out.append(f"产出 {o}")
        图 = [a for n in 新条目 for a in n.资产展开]
        for a in 图[:6]:
            out.append(f"图   {a}")
        if len(图) > 6:
            out.append(f"图   …还有 {len(图) - 6} 张")
        out.append("")
    out.append("─" * 56)
    out.append(f"共 {len(文件)} 个文件 / 约 {行数} 行。**只读这些，不要额外浏览目录。**")
    print("\n".join(out))


# ---------------------------------------------------------------- 计划
计划动作 = {"加": "加", "add": "加", "开始": "开始", "start": "开始",
          "完成": "完成", "done": "完成", "搁置": "搁置", "drop": "搁置"}
动作到状态 = {"开始": "进行中", "完成": "完成", "搁置": "搁置"}
状态序 = {"进行中": 0, "待办": 1, "搁置": 2, "完成": 3}


def 计划头(idx) -> list[str]:
    """开工跑路线时顺带看到计划：进行中的条目列出来，不用多读一个文件。"""
    if not idx.有计划:
        return []
    进行中 = [p for p in idx.计划 if p.status == "进行中"]
    待办 = sum(1 for p in idx.计划 if p.status == "待办")
    if not 进行中:
        return [f"# 计划：没有进行中的条目，待办 {待办} 条（atlas plan 查看）", ""]
    out = ["# 计划 · 进行中"]
    for p in 进行中:
        out.append(f"#   {p.id}  {p.title}" + (f"  （验收：{p.done_when}）" if p.done_when else ""))
    out += ["# 这次做的事属于哪条就更新哪条：atlas plan done <id> --产出 a,b", ""]
    return out


def _切(s) -> list[str]:
    return [x.strip() for x in str(s or "").split(",") if x.strip()]


def 命令_计划(args):
    根 = 根目录()
    p = 根 / "计划.yml"
    动作 = 计划动作.get(args.动作 or "", None) if args.动作 else None
    if args.动作 and 动作 is None:
        sys.exit(f"不认识的动作 `{args.动作}`。可用：加 / 开始 / 完成 / 搁置（add / start / done / drop）")

    if 动作 is None:
        idx = 建索引(根)
        if not idx.有计划:
            print("还没有 计划.yml。用 `atlas plan add <id> <标题>` 加第一条。")
            return
        for 位置, err in idx.解析错误:
            if 位置.startswith("计划.yml"):
                print(f"{C['红']}✗{C['_']} {位置}  {err}")
        for it in sorted(idx.计划, key=lambda x: 状态序.get(x.status, 9)):
            色 = {"进行中": C["绿"], "完成": C["淡"], "搁置": C["淡"]}.get(it.status, "")
            print(f"{色}{垫(it.status, 8)}{C['_']}{C['粗']}{垫(it.id, 14)}{C['_']}{it.title}"
                  f"  {C['淡']}{it.updated}{C['_']}")
            if it.done_when and it.status != "完成":
                print(f"{'':8}{C['淡']}验收：{it.done_when}{C['_']}")
            if it.outputs:
                print(f"{'':8}{C['淡']}产出：{'、'.join(it.outputs)}{C['_']}")
        return

    if not args.id:
        sys.exit("要带条目 id，例如 atlas plan start 回放器")
    import miniyaml as y
    原mtime = p.stat().st_mtime if p.exists() else None
    try:
        raw = (y.parse(p.read_text(encoding="utf-8")) or {}) if p.exists() else {}
    except y.YamlError as e:
        sys.exit(f"{C['红']}✗{C['_']} 计划.yml 解析失败：{e}。先手动修好再用命令。")
    项们 = [dict(x) for x in (raw.get("items") or []) if isinstance(x, dict)]
    今天 = datetime.date.today().isoformat()
    目标 = next((x for x in 项们 if str(x.get("id")) == args.id), None)

    if 动作 == "加":
        if 目标 is not None:
            sys.exit(f"已经有 `{args.id}` 了。")
        if not args.标题:
            sys.exit("加一条要写标题：atlas plan add <id> <标题>")
        项们.append({"id": args.id, "title": args.标题, "status": "待办",
                   "touches": _切(args.涉及), "done_when": args.验收 or "",
                   "outputs": [], "updated": 今天})
        说 = f"加了 `{args.id}`（待办）"
    else:
        if 目标 is None:
            sys.exit(f"计划里没有 `{args.id}`。现有：" + "、".join(str(x.get("id")) for x in 项们))
        if 动作 == "完成":
            产出 = list(目标.get("outputs") or []) + [o for o in _切(args.产出) if o not in (目标.get("outputs") or [])]
            if not 产出:
                sys.exit("完成要带产出：atlas plan done <id> --产出 a,b（可以是改过的文档）")
            缺 = [o for o in 产出 if not (_存在(根, o) or _存在(根, f"{o}.md"))]
            if 缺:
                sys.exit(f"产出不存在：{'、'.join(缺)}")
            目标["outputs"] = 产出
        elif args.产出:
            目标["outputs"] = list(目标.get("outputs") or []) + _切(args.产出)
        if args.涉及:
            目标["touches"] = list(dict.fromkeys(list(目标.get("touches") or []) + _切(args.涉及)))
        if args.验收:
            目标["done_when"] = args.验收
        目标["status"] = 动作到状态[动作]
        目标["updated"] = 今天
        说 = f"`{args.id}` → {目标['status']}"
    for x in 项们:
        for k in ("touches", "outputs"):
            v = x.get(k)
            x[k] = v if isinstance(v, list) else ([v] if v else [])
    try:
        edit.写计划(p, 项们, 原mtime)
    except RuntimeError as e:
        sys.exit(f"{C['红']}✗{C['_']} {e}")
    print(f"{C['绿']}✓{C['_']} {说}")
    进行中 = sum(1 for x in 项们 if x.get("status") == "进行中")
    上限 = int(建索引(根).cfg.上限.get("计划进行中") or 3)
    if 进行中 > 上限:
        print(f"  {C['黄']}进行中已经 {进行中} 条，超过 {上限}，先收尾几条{C['_']}")


# ---------------------------------------------------------------- 待定
def 待定条目(正文: str) -> tuple[list[str], list[str]]:
    """返回（「## 待定」小节里的行, 小节外正文里提到“待定”的行）。代码块里的不算。"""
    import re
    节内, 行内 = [], []
    在节 = None          # 当前待定小节的标题级别
    围栏 = False
    for ln in 正文.split("\n"):
        if ln.lstrip().startswith("```"):
            围栏 = not 围栏
            continue
        if 围栏:
            continue
        m = re.match(r"^(#{1,6})\s+(.+?)\s*$", ln)
        if m:
            级 = len(m.group(1))
            if 在节 is not None and 级 <= 在节:
                在节 = None
            if m.group(2) == "待定":
                在节 = 级
            continue
        if 在节 is not None:
            if ln.strip():
                节内.append(ln.rstrip())
        elif "待定" in ln and ln.strip():
            行内.append(ln.strip())
    return 节内, 行内


def 命令_待定(args):
    根 = 根目录()
    idx = 建索引(根)
    import miniyaml as y
    篇, 条 = 0, 0
    for s, n in sorted(idx.条目.items()):
        if n.豁免:
            continue
        try:
            _, 正文 = y.split_frontmatter((根 / s).read_text(encoding="utf-8"))
        except (OSError, UnicodeError):
            continue
        节内, 行内 = 待定条目(正文)
        if not args.行内:
            行内 = []
        if not 节内 and not 行内:
            continue
        篇 += 1
        顶层 = sum(1 for ln in 节内 if not ln.startswith((" ", "\t")))
        条 += 顶层 + len(行内)
        print(f"{C['粗']}{s}{C['_']}  {C['淡']}{顶层 + len(行内)} 条{C['_']}")
        for ln in 节内:
            print(f"  {ln}")
        for ln in 行内:
            print(f"  {C['淡']}正文：{C['_']}{ln}")
        print()
    if not 篇:
        print("没有待定项。" + ("" if args.行内 else "加 --行内 再看正文里散落的“待定”。"))
        return
    print("─" * 56)
    print(f"共 {篇} 篇文档 / {条} 条待定" + ("" if args.行内 else "。加 --行内 连正文里散落的一起看"))


# ---------------------------------------------------------------- 找
def 命令_找(args):
    根 = 根目录()
    idx = 建索引(根)
    q = args.关键词.lower()
    命中 = 0
    for s, n in sorted(idx.条目.items()):
        干草 = f"{s} {n.编号} {n.名称} {n.类型} {n.分组} {n.摘要} {' '.join(n.标签)}".lower()
        if q in 干草:
            尾 = f"{n.类型}/{n.分组 or '—'} · {n.行数}行 · " + (
                "路线:" + "、".join(n.路线) if n.路线 else "无路线")
            print(f"{C['淡']}文档{C['_']} {C['粗']}{s}{C['_']}\n     {C['淡']}{尾}{C['_']}"
                  + (f"\n     {n.摘要}" if n.摘要 else ""))
            命中 += 1
    # 工具按"被声明的那个路径"折叠：声明的是目录就整目录算一条
    声明 = {}
    for n in idx.条目.values():
        for x in n.工具:
            声明.setdefault(x.rstrip("/"), []).append(n.路径)
    for r in idx.路线:
        for st in r.步骤:
            for x in st.tools:
                声明.setdefault(x.rstrip("/"), []).append(f"路线:{r.名称}")
    已印 = set()
    # 与 atlas 检查 的 W02 判定一致：代码目录是产品本身，不按"工具"要求
    def 是代码(路径):
        return any(路径 == d or 路径.startswith(d + "/") for d in idx.cfg.代码目录)
    for t in idx.工具:
        if q not in t.lower():
            continue
        键 = next((k for k in 声明 if t == k or t.startswith(k + "/")), t)
        if 键 in 已印:
            continue
        已印.add(键)
        用户 = 声明.get(键, [])
        个数 = sum(1 for x in idx.工具 if x == 键 or x.startswith(键 + "/"))
        尾 = f"（{个数} 个文件）" if 个数 > 1 else ""
        代码 = 是代码(键)
        if 用户:
            说明 = "服务于：" + "、".join(dict.fromkeys(用户))
        elif 代码:
            说明 = "产品代码，不按工具要求"
        else:
            说明 = "⚠ 孤儿工具，没人声明"
        print(f"{C['淡']}{'代码' if 代码 else '工具'}{C['_']} {C['粗']}{键}{C['_']}{C['淡']}{尾}{C['_']}"
              f"\n     {C['淡']}{说明}{C['_']}")
        命中 += 1
    for a in idx.资产:
        if q in a.lower():
            挂 = [n.路径 for n in idx.条目.values() if a in n.资产展开]
            print(f"{C['淡']}资产{C['_']} {C['粗']}{a}{C['_']}\n     {C['淡']}"
                  + ("挂在：" + "、".join(挂) if 挂 else "⚠ 未认领") + C["_"])
            命中 += 1
    if not 命中:
        print("没找到。换个词，或者这东西本来就不存在。")


# ---------------------------------------------------------------- 迁移
def 命令_迁移(args):
    根 = 根目录()
    idx = 建索引(根)
    筛 = {}
    if args.筛选:
        for 条 in args.筛选.split(","):
            k, _, v = 条.partition("=")
            筛[k.strip()] = v.strip()
    目标 = []
    for s, n in sorted(idx.条目.items()):
        if n.豁免 or not n.有frontmatter:
            continue
        if all(str(getattr(n, k, "")) == v for k, v in 筛.items()):
            目标.append(n)
    if not 目标:
        print("没有匹配的条目。")
        return
    改动 = 0
    for n in 目标:
        p = 根 / n.路径
        try:
            if args.加字段:
                k, _, v = args.加字段.partition("=")
                值 = [x.strip() for x in v.strip("[]").split(",")] if v.strip().startswith("[") else v.strip()
                r = edit.加字段(p, k.strip(), 值, args.演习)
            elif args.改名:
                旧, _, 新 = args.改名.partition("=")
                r = edit.改名(p, 旧.strip(), 新.strip(), args.演习)
            else:
                sys.exit("要么 --加字段 k=v，要么 --改名 旧=新")
        except Exception as e:
            print(f"{C['红']}✗{C['_']} {n.路径}：{e}")
            continue
        if r:
            print(f"{C['淡']}{'[演习] ' if args.演习 else ''}{C['_']}{n.路径}  {r}")
            改动 += 1
    print(f"\n{改动}/{len(目标)} 个条目{'（演习，没写盘）' if args.演习 else '已改'}。")


# ---------------------------------------------------------------- 认领
def 命令_认领(args):
    根 = 根目录()
    idx = 建索引(根)
    n = 解析目标(idx, args.条目) or idx.条目.get(args.条目) or idx.条目.get(f"{args.条目}.md")
    if n is None:
        sys.exit(f"找不到条目 `{args.条目}`")
    文件 = args.文件.replace(os.sep, "/")
    if not (根 / 文件).exists():
        sys.exit(f"文件不存在：{文件}")
    字段 = "工具" if Path(文件).suffix.lower() in {".py", ".js", ".mjs", ".ts", ".sh", ".html"} else "资产"
    分类 = args.分类 or ("" if 字段 == "工具" else "未分类")
    try:
        r = edit.认领(根 / n.路径, 字段, 分类 or None, 文件, args.演习)
    except Exception as e:
        sys.exit(f"{C['红']}✗{C['_']} {e}")
    print(f"{C['绿']}✓{C['_']} {n.路径}  {r}")


# ---------------------------------------------------------------- 新建
def 命令_新建(args):
    import projects
    try:
        目标 = projects.新建项目(args.模板, Path(args.路径), args.名称 or "")
    except (ValueError, FileExistsError) as e:
        sys.exit(str(e))
    print(f"{C['绿']}✓{C['_']} 已从 `{args.模板}` 生成 {目标}，并登记进 {projects.注册表.name}")
    print("  下一步：改 项目.yml 的 主分组 / 内容类型，然后写第一条路线。")


# ---------------------------------------------------------------- 改名
def 命令_改名(args):
    import rename
    根 = 根目录()
    idx = 建索引(根)
    对 = args.类型 or args.条目 or args.字段 or args.词表
    if not 对:
        sys.exit("要么 --类型 旧=新，要么 --条目 / --词表 / --字段。见 atlas 改名 -h")
    种类 = "类型" if args.类型 else "条目" if args.条目 else "字段" if args.字段 else "词表"
    词表名 = ""
    if 种类 == "词表":
        词表名, _, 对 = 对.partition(":")
        if not _:
            sys.exit("词表改名写成 --词表 机制:旧=新")
    旧, _, 新 = 对.partition("=")
    if not _ or not 旧.strip() or not 新.strip():
        sys.exit("写成 旧=新")
    面 = rename.算(idx, 种类, 旧.strip(), 新.strip(), 词表名.strip())
    if 面.错:
        sys.exit(f"{C['红']}✗{C['_']} {面.错}")

    print(f"{C['粗']}{面.种类}改名{C['_']}  {C['红']}{面.旧}{C['_']} → {C['绿']}{面.新}{C['_']}\n")
    for g in 面.组们:
        if not g.处们:
            continue
        标 = f"{C['淡']}只列不改{C['_']}" if g.只读 else ""
        print(f"{C['粗']}{g.类}{C['_']}  {len(g.处们)} 处  {标}")
        if g.提醒:
            print(f"  {C['黄']}※ {g.提醒}{C['_']}")
        for h in g.处们[:12]:
            print(f"  {垫(h.位置, 46)}{C['淡']}{h.预览}{C['_']}")
        if len(g.处们) > 12:
            print(f"  {C['淡']}… 还有 {len(g.处们) - 12} 处{C['_']}")
        print()
    print("─" * 58)
    print(f"工具会改 {C['绿']}{面.可改数}{C['_']} 处，"
          f"只列不改 {C['黄']}{面.只读数}{C['_']} 处。")
    if args.演习 or True:
        print(f"{C['淡']}目前只做预演，还没接执行。{C['_']}")


# ---------------------------------------------------------------- serve
def 命令_serve(args):
    import serve as S
    S.起服务(根目录(), int(args.端口 or 7391), not args.不开浏览器)


# ---------------------------------------------------------------- 运行
def 命令_运行(args):
    import targets
    根 = 根目录()
    try:
        if args.名字:
            (targets.停止 if args.停止 else targets.启动)(根, args.名字)
            print(f"{C['绿']}✓{C['_']} 已{'停止' if args.停止 else '启动'}「{args.名字}」")
            return
        列表 = targets.状态(根)
    except RuntimeError as e:
        sys.exit(f"{C['红']}✗{C['_']} {e}")
    if not 列表:
        print(f"{targets.DevDock} 里没有运行目标。")
        return
    for t in 列表:
        灯 = f"{C['绿']}●{C['_']}" if t["运行中"] else f"{C['淡']}○{C['_']}"
        print(f"{灯} {垫(t['名称'], 20)}{C['淡']}{t['网址'] or t['端口'] or ''}  {t['说明']}{C['_']}")


# ---------------------------------------------------------------- 钩子
钩子内容 = """#!/bin/sh
# atlas pre-commit
python3 "{脚本}" 检查 --只看错误 || {{
  echo ""
  echo "导航体检没过。修掉错误，或者 git commit --no-verify 跳过。"
  exit 1
}}
# 计划提醒：只提示，不挡提交
python3 "{脚本}" 检查 --只看计划 || true
"""


def 命令_钩子(args):
    根 = 根目录()
    d = 根 / ".git" / "hooks"
    if not d.is_dir():
        sys.exit("这里没有 .git/hooks")
    p = d / "pre-commit"
    p.write_text(钩子内容.format(脚本=Path(__file__).resolve()), encoding="utf-8")
    p.chmod(0o755)
    print(f"{C['绿']}✓{C['_']} 已装 {p}")
    print("  这一条比其它所有功能加起来都重要：缺 frontmatter 直接挡住提交。")


# ---------------------------------------------------------------- main
def main():
    import argparse
    ap = argparse.ArgumentParser(prog="atlas", description="项目知识导航",
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    sub = ap.add_subparsers(dest="命令")
    # 每个命令和选项都有英文别名，方便不切输入法；分派和 args 字段一律用中文名。
    英 = {"扫描": "scan", "检查": "check", "路线": "route", "找": "find", "迁移": "migrate",
         "认领": "claim", "新建": "new", "改名": "rename", "钩子": "hook", "运行": "run",
         "计划": "plan", "待定": "pending"}
    def 命令(名): return sub.add_parser(名, aliases=[英[名]] if 名 in 英 else [])
    def 选项(q, 名, 英名, **kw): q.add_argument("--" + 名, "--" + 英名, dest=名, **kw)
    命令("扫描")
    q = 命令("检查"); 选项(q, "只看错误", "errors-only", action="store_true")
    选项(q, "严格", "strict", action="store_true")
    选项(q, "只看计划", "plan-only", action="store_true")
    q = 命令("计划"); q.add_argument("动作", nargs="?"); q.add_argument("id", nargs="?")
    q.add_argument("标题", nargs="?")
    选项(q, "涉及", "touches"); 选项(q, "验收", "done-when"); 选项(q, "产出", "outputs")
    q = 命令("待定"); 选项(q, "行内", "inline", action="store_true")
    q = 命令("路线"); q.add_argument("名字", nargs="?"); 选项(q, "列表", "list", action="store_true")
    q = 命令("找"); q.add_argument("关键词")
    q = 命令("迁移")
    选项(q, "加字段", "add-field"); 选项(q, "改名", "rename")
    选项(q, "筛选", "filter"); 选项(q, "演习", "dry-run", action="store_true")
    q = 命令("认领")
    q.add_argument("文件"); q.add_argument("条目")
    选项(q, "分类", "category"); 选项(q, "演习", "dry-run", action="store_true")
    q = 命令("新建"); q.add_argument("模板"); q.add_argument("路径"); 选项(q, "名称", "name")
    q = 命令("改名")
    选项(q, "类型", "type"); 选项(q, "条目", "entry")
    选项(q, "词表", "vocab"); 选项(q, "字段", "field")
    选项(q, "演习", "dry-run", action="store_true")
    命令("钩子")
    q = 命令("运行"); q.add_argument("名字", nargs="?"); 选项(q, "停止", "stop", action="store_true")
    q = 命令("serve")
    选项(q, "端口", "port", default=7391); 选项(q, "不开浏览器", "no-browser", action="store_true")

    args = ap.parse_args()
    if not args.命令:
        ap.print_help()
        return
    args.命令 = {v: k for k, v in 英.items()}.get(args.命令, args.命令)
    for k in ("只看错误", "严格", "列表", "演习", "名字", "分类", "筛选", "加字段", "改名",
              "端口", "不开浏览器", "类型", "条目", "词表", "停止", "只看计划", "行内"):
        if not hasattr(args, k):
            setattr(args, k, None)
    {"扫描": 命令_扫描, "检查": 命令_检查, "路线": 命令_路线, "找": 命令_找,
     "迁移": 命令_迁移, "认领": 命令_认领, "新建": 命令_新建, "钩子": 命令_钩子,
     "serve": 命令_serve, "改名": 命令_改名, "运行": 命令_运行,
     "计划": 命令_计划, "待定": 命令_待定}[args.命令](args)


if __name__ == "__main__":
    main()
