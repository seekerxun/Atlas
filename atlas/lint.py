"""校验：宁可误报，不可漏报。"""
from __future__ import annotations
import datetime as dt
import fnmatch, os, subprocess
from pathlib import Path

from model import 发现, TOOL_EXT, ASSET_EXT, 计划文件
from scan import 索引, 解析目标


def _存在(根: Path, rel: str) -> bool:
    rel = rel.strip()
    if not rel:
        return False
    if (根 / rel).exists():
        return True
    if "*" in rel or "?" in rel:
        头 = rel.split("*")[0].split("?")[0]
        base = 头.rsplit("/", 1)[0] if "/" in 头 else ""
        d = (根 / base) if base else 根
        if d.is_dir():
            for dp, _, fs in os.walk(d):
                for f in fs:
                    r = str((Path(dp) / f).relative_to(根)).replace(os.sep, "/")
                    if fnmatch.fnmatch(r, rel):
                        return True
    return False


def _被忽略(根: Path, rel: str) -> bool:
    """这个路径是否被 git 忽略（本来就不进库）。不在 git 仓库或没装 git 时一律当作没被忽略。"""
    rel = rel.strip()
    if not rel:
        return False
    try:
        r = subprocess.run(["git", "-C", str(根), "check-ignore", "-q", "--", rel],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0


def _git(根: Path, *参数: str) -> str | None:
    """在项目根跑一条 git 命令，拿不到结果（不是仓库、没装 git）就返回 None。"""
    try:
        # quotePath=false：不然中文路径会被转成 "\347\255\226…"，和扫描出来的路径对不上
        r = subprocess.run(["git", "-c", "core.quotePath=false", "-C", str(根), *参数],
                           capture_output=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8", errors="replace")


def 涉及(touches: list[str], 文件: str) -> bool:
    """计划条目的 touches 能写文件、目录、glob，文档可以省掉 .md（和路线 docs 一样）。"""
    for t in touches:
        t = t.strip().strip("/")
        if not t:
            continue
        if 文件 in (t, f"{t}.md") or 文件.startswith(t + "/") or fnmatch.fnmatch(文件, t):
            return True
    return False


def 改动记录(根: Path, 起始: dt.date, 忽略: set[str]) -> tuple[str, dict[str, dt.date], set[str]]:
    """返回（来源, 文件 → 最后改动日期, 未提交的文件）。

    有 git：日期取提交日期，另外列出工作区里还没提交的改动——这才是"真改过"。
    没有 git：退回文件修改时间，复制、检出也会碰到它，所以只能当提示。
    """
    前缀 = _git(根, "rev-parse", "--show-prefix")
    if 前缀 is not None:
        前缀 = 前缀.strip()
        def 本项目(p: str) -> str | None:
            return p[len(前缀):] if p.startswith(前缀) else None
        日期: dict[str, dt.date] = {}
        log = _git(根, "log", f"--since={起始.isoformat()}T00:00:00", "--format=%x00%cs",
                   "--name-only", "--", ".") or ""
        当天 = None
        for ln in log.split("\n"):
            if ln.startswith("\x00"):
                try:
                    当天 = dt.date.fromisoformat(ln[1:].strip())
                except ValueError:
                    当天 = None
            elif ln.strip() and 当天:
                p = 本项目(ln.strip())
                if p and 当天 > 日期.get(p, dt.date.min):
                    日期[p] = 当天
        未提交: set[str] = set()
        st = _git(根, "status", "--porcelain", "-z", "--untracked-files=all", "--", ".") or ""
        段 = st.split("\x00")
        i = 0
        while i < len(段):
            e = 段[i]
            i += 1
            if len(e) < 4:
                continue
            p = 本项目(e[3:])
            if p:
                未提交.add(p)
            if e[0] in "RC":
                i += 1        # 重命名后面跟着原路径
        return "git", 日期, 未提交
    日期 = {}
    for dp, dn, fn in os.walk(根):
        dn[:] = [d for d in dn if d not in 忽略]
        for f in fn:
            p = Path(dp) / f
            try:
                d = dt.date.fromtimestamp(p.stat().st_mtime)
            except OSError:
                continue
            if d >= 起始:
                日期[str(p.relative_to(根)).replace(os.sep, "/")] = d
    return "修改时间", 日期, set()


def _计划校验(idx: 索引, 加, 缺文件, 今天: dt.date):
    cfg, 根 = idx.cfg, idx.根
    上限 = int(cfg.上限.get("计划进行中") or 3)
    停滞 = int(cfg.上限.get("计划停滞天数") or 14)
    日期表: dict[str, dt.date] = {}
    for 项 in idx.计划:
        位置 = f"{计划文件}#{项.id}"
        if 项.updated:
            try:
                日期表[项.id] = dt.date.fromisoformat(项.updated)
            except ValueError:
                加(发现("错误", "E09", 位置, f"updated `{项.updated}` 不是 YYYY-MM-DD"))

        if 项.status == "完成":
            if not 项.outputs:
                加(发现("错误", "E11", 位置, "标了完成，但没写产出",
                        "atlas plan done <id> --产出 a,b；产出可以是改过的文档"))
            for o in 项.outputs:
                if not (_存在(根, o) or _存在(根, f"{o}.md")):
                    if _被忽略(根, o):
                        缺文件(位置, "计划产出", o)
                    else:
                        加(发现("错误", "E11", 位置, f"产出不存在: {o}"))

        if 项.status == "进行中":
            d = 日期表.get(项.id)
            if d is None:
                加(发现("警告", "W15", 位置, "进行中，但没有 updated",
                        "用 atlas plan start 标记，会自动写日期"))
            elif (今天 - d).days > 停滞:
                加(发现("警告", "W15", 位置, f"进行中，{(今天 - d).days} 天没更新",
                        "做完了就 atlas plan done，卡住了就 atlas plan drop"))

    进行中 = [项.id for 项 in idx.计划 if 项.status == "进行中"]
    if len(进行中) > 上限:
        加(发现("警告", "W16", 计划文件, f"进行中 {len(进行中)} 条，超过 {上限}：{'、'.join(进行中)}",
                "先收尾几条，再开新的"))

    待查 = [项 for 项 in idx.计划 if 项.status == "待办" and 项.touches and 项.id in 日期表]
    if not 待查:
        return
    来源, 改动, 未提交 = 改动记录(根, min(日期表[项.id] for 项 in 待查), cfg.忽略)
    for 项 in 待查:
        起 = 日期表[项.id]
        命中 = sorted(f for f, d in 改动.items() if d > 起 and 涉及(项.touches, f))
        命中 += sorted(f for f in 未提交 if f not in 命中 and 涉及(项.touches, f))
        if 命中:
            尾 = f" 等 {len(命中)} 个" if len(命中) > 3 else ""
            加(发现("警告", "W17", f"{计划文件}#{项.id}",
                    f"还是待办，但涉及的文件改过了（按{来源}）: {'、'.join(命中[:3])}{尾}",
                    "开始做了就 atlas plan start，做完了就 atlas plan done"))


def 校验(idx: 索引, 严格: bool = False, 今天: dt.date | None = None) -> list[发现]:
    """严格=True 时，被 git 忽略、本机又不存在的文件也按 E06 报错（在应当有全部文件的机器上用）。"""
    cfg, 根 = idx.cfg, idx.根
    出: list[发现] = []
    加 = 出.append

    def 缺文件(位置: str, 种类: str, p: str):
        if not 严格 and _被忽略(根, p):
            加(发现("警告", "W14", 位置, f"{种类}本机缺失（被 git 忽略，不进库）: {p}",
                    "换到有这个文件的机器上跑 atlas check --严格 确认它没丢"))
        else:
            加(发现("错误", "E06", 位置, f"{种类}不存在: {p}"))

    for err in cfg.标签错误:
        加(发现("错误", "E09", "项目.yml", err, "标签写法见 规范/目录规范.md《标签》"))
    for 位置, err in idx.解析错误:
        码 = "E10" if "行内" in err or "`- `" in err else "E09"
        加(发现("错误", 码, 位置, err))

    被声明工具: dict[str, set[str]] = {}
    被挂资产: set[str] = set()

    for s, n in sorted(idx.条目.items()):
        if n.豁免:
            continue
        if not n.有frontmatter:
            if not any(e[0] == s for e in idx.解析错误):
                加(发现("错误", "E01", s, "缺 frontmatter",
                        "至少写 类型 和 状态 两行"))
            continue
        for k in cfg.必填:
            if not getattr(n, k, ""):
                加(发现("错误", "E02", s, f"缺必填字段 {k}"))
        if n.类型 and n.类型 not in cfg.类型表:
            加(发现("错误", "E03", s, f"类型 `{n.类型}` 不在词表内",
                    "要细分用 标签，不要扩类型表"))
        if n.状态 and n.状态 not in cfg.状态表:
            加(发现("错误", "E03", s, f"状态 `{n.状态}` 不在词表内"))
        for k in getattr(n, "_未知", []):
            加(发现("警告", "W12", s, f"未知字段 `{k}`", "实验性字段放 扩展: 下面"))

        for 表 in cfg.受控词表:
            名字 = str(表.get("名字") or "")
            字段 = str(表.get("引用字段") or 名字)
            名单 = idx.词表值.get(名字) or set()
            if not 名单:
                continue
            for v in (getattr(n, 字段, None) or []):
                if v not in 名单:
                    加(发现("错误", "E05", s, f"{名字}名 `{v}` 不在 {表.get('文件')} 里",
                            f"先去那份名单加一条占位，再回来引用"))

        总关联 = 0
        for 关系, 目标们 in (n.关联 or {}).items():
            目标表 = 目标们 if isinstance(目标们, list) else [目标们]
            if not isinstance(目标们, list) and 目标们 is not None:
                加(发现("错误", "E10", s, f"关联.{关系} 必须写成行内列表 [a, b]"))
            总关联 += len(目标表)
            for t in 目标表:
                节 = 解析目标(idx, str(t))
                if 节 is None:
                    加(发现("错误", "E04", s, f"关联.{关系} → `{t}` 找不到对应条目",
                            "要么先建那个条目，要么别写这条关联"))
                elif 节.状态 == "废弃":
                    加(发现("警告", "W09", s, f"关联到已废弃的 `{t}`"))
        上限 = int(cfg.上限.get("单条关联数") or 8)
        if 总关联 > 上限:
            加(发现("警告", "W13", s, f"关联 {总关联} 条，超过 {上限}",
                    "这个条目该拆，或者那其实是一张表"))

        for 分类, 路径们 in (n.资产 or {}).items():
            if not isinstance(路径们, list):
                加(发现("错误", "E10", s, f"资产.{分类} 必须写成行内列表 [a, b]"))
                continue
            for p in 路径们:
                if not _存在(根, str(p)):
                    缺文件(s, "资产", str(p))
                else:
                    被挂资产.add(str(p))
        for t in n.工具:
            if not _存在(根, t):
                缺文件(s, "工具", t)
            被声明工具.setdefault(t, set()).add(n.分组 or "?")
        for d in n.数据:
            if not _存在(根, d):
                缺文件(s, "数据表", d)

        规则 = cfg.规则(n.库)
        # 草稿是零门槛区：不要求摘要，门槛一高就没人往里丢东西了
        if not n.摘要 and not n.豁免 and 规则 != "草稿":
            加(发现("警告", "W11", s, "没有摘要", "画布中景卡片全靠它"))

        # 层级：抽象层不该依赖具体实例
        我 = cfg.层级序(n.类型)
        if 我 is not None:
            for 关系, 目标们 in (n.关联 or {}).items():
                for t in (目标们 if isinstance(目标们, list) else []):
                    节 = 解析目标(idx, str(t))
                    if 节 is None:
                        continue
                    他 = cfg.层级序(节.类型)
                    if 他 is not None and 他 > 我:
                        加(发现("警告", "W07", s,
                                f"{n.类型} 关联了更具体的 {节.类型}（{t}）",
                                "关系应该由更具体的一方声明"))

        上限行 = int(cfg.上限.get("文档行数") or 400)
        if n.行数 > 上限行:
            加(发现("警告", "W08", s, f"{n.行数} 行，超过 {上限行}",
                    "拆分，或者改成索引页"))

        for 行, _, 目标 in n.正文链接:
            if not (_存在(根, 目标) or _存在(根, f"{目标}.md")):
                缺文件(f"{s}:{行}", "正文链接", 目标)

        # 关系由更具体的一方声明（下级写 所属: [上级]），所以声明了所属的下级本身就有归属
        所属 = (n.关联 or {}).get("所属") or []
        有所属 = any(解析目标(idx, str(t)) is not None
                    for t in (所属 if isinstance(所属, list) else [所属]))
        if (not n.路线 and not n.被引用 and not 有所属 and 规则 == "文档"
                and n.类型 not in ("总览", "规范", "模板") and n.状态 != "废弃"
                and "_模板" not in n.路径 and "_待定" not in n.路径):
            加(发现("警告", "W01", s, "孤儿条目：没有路线、条目或正文链接引用它，也没声明所属",
                    "挂到某条路线的 docs 里、在上级正文里链接它、或者写 关联: 所属: [上级]；没用就删"))

    # 路线
    for r in idx.路线:
        ids = {st.id for st in r.步骤}
        for st in r.步骤:
            for d in st.docs:
                if (根 / f"{d}.md").exists() or (根 / d).exists():
                    continue
                加(发现("错误", "E07", f"{r.路径}#{st.id}",
                        f"docs → `{d}` 不存在", "路线里写的是文件路径，不带 .md"))
            for t in st.tools:
                if not _存在(根, t):
                    缺文件(f"{r.路径}#{st.id}", "工具", t)
                else:
                    被声明工具.setdefault(t, set()).add(f"路线:{r.名称}")
            for nx in st.next:
                if nx not in ids:
                    加(发现("错误", "E08", f"{r.路径}#{st.id}", f"next → `{nx}` 不存在"))

    # 孤儿工具 / 放错位置。代码目录是产品本身，不按"工具"要求
    代码 = tuple(d + "/" for d in cfg.代码目录)
    for t in idx.工具:
        if 代码 and t.startswith(代码):
            continue
        认领 = [k for k in 被声明工具 if t == k or t.startswith(k.rstrip("/") + "/")]
        if not 认领:
            加(发现("警告", "W02", t, "孤儿工具：没有任何文档或路线声明使用它",
                    "在用它的文档 工具: 里登记；确实没用就删"))
        if t.split("/")[0] != "工具":
            加(发现("警告", "W04", t, "脚本不在 工具/ 下", "挪进 工具/，或者它其实是产出"))
    素材 = cfg.素材目录
    素材处 = "、".join(f"{d}/" for d in (*素材, "产出"))
    for a in idx.资产:
        if 代码 and a.startswith(代码):
            continue
        顶 = a.split("/")[0]
        if 顶 not in (*素材, "产出"):
            加(发现("警告", "W04", a, f"图片不在 {素材处} 下"))
        elif 顶 in 素材 and a not in 被挂资产:
            加(发现("警告", "W03", a, "孤儿资产：没挂到任何条目",
                    "在对应条目 资产: 里挂上，或者退回 产出/"))
    for u in idx.未归类:
        加(发现("警告", "W05", u, "未归类文件：任何规则都没匹配上"))

    if idx.有计划:
        _计划校验(idx, 加, 缺文件, 今天 or dt.date.today())

    for t, 域 in 被声明工具.items():
        实域 = {d for d in 域 if not d.startswith("路线:")}
        if len(实域) >= 3:
            加(发现("警告", "W10", t, f"被 {len(实域)} 个分组共用: {', '.join(sorted(实域))}",
                    "拆分，或者明确它是通用工具"))

    序 = {"错误": 0, "警告": 1}
    出.sort(key=lambda f: (序.get(f.级别, 9), f.码, f.位置))
    return 出


def 体检数(idx: 索引, 结果: list[发现]) -> dict:
    缺fm = sum(1 for f in 结果 if f.码 == "E01")
    return {
        "错误": sum(1 for f in 结果 if f.级别 == "错误"),
        "警告": sum(1 for f in 结果 if f.级别 == "警告"),
        "未归类": len(idx.未归类),
        "孤儿工具": sum(1 for f in 结果 if f.码 == "W02"),
        "缺frontmatter": 缺fm,
        "孤儿资产": sum(1 for f in 结果 if f.码 == "W03"),
        "放错位置": sum(1 for f in 结果 if f.码 == "W04"),
    }
