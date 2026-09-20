"""校验：宁可误报，不可漏报。"""
from __future__ import annotations
import fnmatch, os
from pathlib import Path

from model import 发现, TOOL_EXT, ASSET_EXT
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


def 校验(idx: 索引) -> list[发现]:
    cfg, 根 = idx.cfg, idx.根
    出: list[发现] = []
    加 = 出.append

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

        for 机 in n.机制:
            if idx.机制名 and 机 not in idx.机制名:
                加(发现("错误", "E05", s, f"机制名 `{机}` 不在机制目录里",
                        "要新机制先去机制目录加最小占位条目"))

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
                    加(发现("错误", "E06", s, f"资产不存在: {p}"))
                else:
                    被挂资产.add(str(p))
        for t in n.工具:
            if not _存在(根, t):
                加(发现("错误", "E06", s, f"工具不存在: {t}"))
            被声明工具.setdefault(t, set()).add(n.分组 or "?")
        for d in n.数据:
            if not _存在(根, d):
                加(发现("错误", "E06", s, f"数据表不存在: {d}"))

        if not n.摘要 and not n.豁免:
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

        if (not n.路线 and not n.被引用 and n.库 in ("策划", "内容")
                and n.类型 not in ("总览", "规范", "模板") and n.状态 != "废弃"
                and "_模板" not in n.路径 and "_待定" not in n.路径):
            加(发现("警告", "W01", s, "孤儿条目：没有任何路线或条目引用它",
                    "挂到某条路线的 docs 里，或者删掉"))

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
                    加(发现("错误", "E06", f"{r.路径}#{st.id}", f"工具不存在: {t}"))
                else:
                    被声明工具.setdefault(t, set()).add(f"路线:{r.名称}")
            for nx in st.next:
                if nx not in ids:
                    加(发现("错误", "E08", f"{r.路径}#{st.id}", f"next → `{nx}` 不存在"))

    # 孤儿工具 / 放错位置
    for t in idx.工具:
        认领 = [k for k in 被声明工具 if t == k or t.startswith(k.rstrip("/") + "/")]
        if not 认领:
            加(发现("警告", "W02", t, "孤儿工具：没有任何文档或路线声明使用它",
                    "在用它的文档 工具: 里登记；确实没用就删"))
        if t.split("/")[0] != "工具":
            加(发现("警告", "W04", t, "脚本不在 工具/ 下", "挪进 工具/，或者它其实是产出"))
    for a in idx.资产:
        顶 = a.split("/")[0]
        if 顶 not in ("资产", "产出"):
            加(发现("警告", "W04", a, "图片不在 资产/ 或 产出/ 下"))
        elif 顶 == "资产" and a not in 被挂资产:
            加(发现("警告", "W03", a, "孤儿资产：没挂到任何条目",
                    "在对应条目 资产: 里挂上，或者退回 产出/"))
    for u in idx.未归类:
        加(发现("警告", "W05", u, "未归类文件：任何规则都没匹配上"))

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
