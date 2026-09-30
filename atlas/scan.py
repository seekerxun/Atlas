"""扫描仓库：解析 frontmatter、归类文件、建反向关系。"""
from __future__ import annotations
import fnmatch, os, re
from pathlib import Path

import miniyaml as y
from model import (Node, 步骤, 路线, 配置, TOOL_EXT, ASSET_EXT, DATA_EXT,
                   SKIP_EXT, SKIP_NAME, 保留目录)

双链 = re.compile(r"\[\[([^\]|#]+)")
资产网页 = {".html", ".htm"}


class 索引:
    def __init__(self, cfg: 配置):
        self.cfg = cfg
        self.根 = cfg.根
        self.条目: dict[str, Node] = {}       # 路径 -> Node
        self.按编号: dict[str, Node] = {}
        self.按名: dict[str, Node] = {}       # 文件名 stem -> Node
        self.工具: list[str] = []
        self.资产: list[str] = []
        self.数据: list[str] = []
        self.未归类: list[str] = []
        self.路线: list[路线] = []
        self.解析错误: list[tuple[str, str]] = []
        self.词表值: dict[str, set[str]] = {}

    def 统计(self):
        return {
            "文档": len(self.条目), "工具": len(self.工具), "资产": len(self.资产),
            "数据": len(self.数据), "路线": len(self.路线), "未归类": len(self.未归类),
            "总行数": sum(n.行数 for n in self.条目.values()),
        }


def _走(根: Path, 忽略: set[str]):
    for dp, dn, fn in os.walk(根):
        dn[:] = [d for d in dn if d not in 忽略]
        d = Path(dp)
        if any(part in 忽略 for part in d.relative_to(根).parts):
            continue
        for f in sorted(fn):
            if f in SKIP_NAME:
                continue
            yield (d / f).relative_to(根)


def _库与分组(cfg: 配置, rel: Path):
    """库 = 顶层目录对应的标签名；分组按标签的规则从下一级目录推导。"""
    parts = rel.parts
    标签 = cfg.按目录.get(parts[0])
    if 标签 is None:
        库 = parts[0] if parts[0] in 保留目录 else ""
        return 库, (parts[1] if 库 == "产出" and len(parts) > 1 else "")
    库, 规则, 分组 = 标签["名称"], 标签["规则"], ""
    if 规则 == "文档" and len(parts) > 2:
        分组 = parts[1].lstrip("_")         # _待定、_公共 这类特殊分组去掉前缀
    elif 规则 == "素材" and len(parts) > 1:
        分组 = parts[1]
    return 库, 分组


def _编号与名称(cfg: 配置, stem: str):
    if cfg.编号正则:
        m = cfg.编号正则.match(stem)
        if m:
            return m.group(0), stem[m.end():].strip()
    return "", stem


def _在代码目录(cfg: 配置, 路径: str) -> bool:
    """代码目录里的文件是产品本身（含框架自带的 md），不按条目要求。"""
    return any(路径 == d or 路径.startswith(d + "/") for d in cfg.代码目录)


def 解析条目(cfg: 配置, rel: Path) -> tuple[Node | None, str | None]:
    p = cfg.根 / rel
    text = p.read_text(encoding="utf-8", errors="replace")
    fm原文, 正文 = y.split_frontmatter(text)
    库, 分组 = _库与分组(cfg, rel)
    编号, 名称 = _编号与名称(cfg, rel.stem)
    n = Node(路径=str(rel).replace(os.sep, "/"), 编号=编号, 名称=名称,
             库=库, 分组=分组, 行数=text.count("\n") + 1)
    n.豁免 = rel.name in cfg.豁免 or str(rel) in cfg.豁免 or _在代码目录(cfg, n.路径)
    if fm原文 is None:
        n.有frontmatter = False
        return n, None
    try:
        fm = y.parse(fm原文, strict=True) or {}
    except y.YamlError as e:
        n.有frontmatter = False
        return n, str(e)
    if not isinstance(fm, dict):
        n.有frontmatter = False
        return n, "frontmatter 不是键值对"

    def 取列表(k):
        v = fm.get(k)
        if v is None:
            return []
        return v if isinstance(v, list) else [v]

    n.类型 = str(fm.get("类型") or "")
    n.状态 = str(fm.get("状态") or "")
    n.摘要 = str(fm.get("摘要") or "")
    n.位阶 = fm.get("位阶")
    n.机制 = [str(x) for x in 取列表("机制")]
    n.工具 = [str(x) for x in 取列表("工具")]
    n.数据 = [str(x) for x in 取列表("数据")]
    n.代码 = [str(x) for x in 取列表("代码")]
    n.标签 = [str(x) for x in 取列表("标签")]
    n.关联 = fm.get("关联") or {}
    n.资产 = fm.get("资产") or {}
    n.扩展 = fm.get("扩展") or {}
    if fm.get("分组"):
        n.分组 = str(fm["分组"])
    n.软引用 = sorted(set(双链.findall(正文)))
    n._未知 = [k for k in fm
               if k not in cfg.可选字段 | set(cfg.必填) | {"分组", "库"}]
    return n, None


def 载入路线(cfg: 配置) -> tuple[list[路线], list[tuple[str, str]]]:
    d = cfg.根 / "路线"
    out, errs = [], []
    if not d.is_dir():
        return out, errs
    for p in sorted(list(d.glob("*.yml")) + list(d.glob("*.yaml"))):
        try:
            raw = y.parse(p.read_text(encoding="utf-8")) or {}
        except y.YamlError as e:
            errs.append((f"路线/{p.name}", str(e)))
            continue
        r = 路线(名称=str(raw.get("route") or p.stem), 路径=f"路线/{p.name}",
                说明=str(raw.get("desc") or ""), 入口=bool(raw.get("entry")))
        for i, s in enumerate(raw.get("steps") or []):
            if not isinstance(s, dict):
                errs.append((r.路径, f"steps[{i}] 不是映射"))
                continue
            L = lambda k: [str(x) for x in (s.get(k) or [] if isinstance(s.get(k), list) else ([s[k]] if s.get(k) else []))]
            r.步骤.append(步骤(id=str(s.get("id") or f"s{i}"),
                             title=str(s.get("title") or s.get("id") or ""),
                             note=str(s.get("note") or ""),
                             docs=L("docs"), tools=L("tools"),
                             outputs=L("outputs"), next=L("next")))
        out.append(r)
    return out, errs


def 抽词表(cfg: 配置) -> dict[str, set[str]]:
    """把项目声明的每一份受控词表读成一个名字集合。"""
    出: dict[str, set[str]] = {}
    for 表 in cfg.受控词表:
        名字 = str(表.get("名字") or "")
        p = cfg.根 / str(表.get("文件") or "")
        if not 名字 or not p.exists():
            continue
        段落 = str(表.get("段落") or "")
        取法 = str(表.get("取法") or "表格首列")
        值 = set()
        在段 = not 段落
        for ln in p.read_text(encoding="utf-8").split("\n"):
            if 段落 and re.match(rf"^#{{2,3}}\s+{re.escape(段落)}", ln):
                在段 = True
                continue
            if 在段 and 段落 and ln.startswith("#"):
                break
            if not 在段:
                continue
            if 取法 == "表格首列" and ln.startswith("|"):
                首 = ln.split("|")[1].strip()
                if 首 and not set(首) <= set("-: ") and 首 != f"{名字}名":
                    值.add(首)
            elif 取法 == "标题":
                mm = re.match(r"^#{3}\s+(.+?)\s*$", ln)
                if mm:
                    值.add(mm.group(1).strip())
        出[名字] = 值
    return 出


def 建索引(根: Path) -> 索引:
    cfg = 配置(根)
    idx = 索引(cfg)
    for rel in _走(根, cfg.忽略):
        s = str(rel).replace(os.sep, "/")
        ext = rel.suffix.lower()
        顶 = rel.parts[0]
        if 顶 == "产出":
            continue                      # 倾倒区不扫
        if 顶 in cfg.素材目录 and ext in 资产网页:
            idx.资产.append(s)            # 素材目录里的单文件网页（如交互页）是成品，不是工具
            continue
        if ext == ".md":
            n, err = 解析条目(cfg, rel)
            if err and not _在代码目录(cfg, s):
                idx.解析错误.append((s, err))
            idx.条目[s] = n
        elif ext in TOOL_EXT or (顶 == "工具" and ext not in DATA_EXT | SKIP_EXT):
            idx.工具.append(s)
        elif ext in ASSET_EXT:
            idx.资产.append(s)
        elif ext in DATA_EXT:
            idx.数据.append(s)
        elif ext in SKIP_EXT or rel.name.startswith("."):
            pass
        else:
            idx.未归类.append(s)

    for n in idx.条目.values():
        if n.编号:
            idx.按编号.setdefault(n.编号, n)
        idx.按名.setdefault(Path(n.路径).stem, n)

    idx.路线, 路线错 = 载入路线(cfg)
    idx.解析错误 += 路线错
    idx.词表值 = 抽词表(cfg)

    # 资产展开 + 自动挂接
    所有资产 = set(idx.资产)
    for n in idx.条目.values():
        for 分类, 路径们 in (n.资产 or {}).items():
            for p in (路径们 if isinstance(路径们, list) else [路径们]):
                n.资产展开.append(str(p))
    已挂 = {a for n in idx.条目.values() for a in n.资产展开}
    for a in sorted(所有资产 - 已挂):
        if not cfg.编号正则:
            break
        for part in Path(a).parts:
            m = cfg.编号正则.match(part)
            if m and m.group(0) in idx.按编号:
                节 = idx.按编号[m.group(0)]
                节.资产展开.append(a)
                节.资产.setdefault("自动挂接", []).append(a)
                break

    # 反向关系
    for n in idx.条目.values():
        for 关系, 目标们 in (n.关联 or {}).items():
            for t in (目标们 if isinstance(目标们, list) else [目标们]):
                节 = 解析目标(idx, str(t))
                if 节 is not None and n.路径 not in 节.被引用:
                    节.被引用.append(n.路径)
    # 正文双链也算引用：被索引页链到的条目不是孤儿
    for n in idx.条目.values():
        for 链 in n.软引用:
            节 = 解析双链(idx, 链)
            if 节 is not None and 节 is not n and n.路径 not in 节.被引用:
                节.被引用.append(n.路径)
    # 路线：docs 直接挂，outputs 的 glob 命中也算认领
    for r in idx.路线:
        for st in r.步骤:
            for d in st.docs:
                节 = idx.条目.get(f"{d}.md") or idx.条目.get(d)
                if 节 is not None and r.名称 not in 节.路线:
                    节.路线.append(r.名称)
            for o in st.outputs:
                for s, 节 in idx.条目.items():
                    if fnmatch.fnmatch(s, o) and r.名称 not in 节.路线:
                        节.路线.append(r.名称)
    return idx


def 解析双链(idx: 索引, 链: str) -> Node | None:
    链 = 链.strip()
    if not 链:
        return None
    if f"{链}.md" in idx.条目:
        return idx.条目[f"{链}.md"]
    尾 = 链.rsplit("/", 1)[-1]
    if 尾 in idx.按名:
        return idx.按名[尾]
    return idx.按编号.get(尾.split()[0]) if 尾.split() else None


def 解析目标(idx: 索引, 目标: str) -> Node | None:
    目标 = 目标.strip()
    if not 目标:
        return None
    编号 = 目标.split()[0]
    return idx.按编号.get(编号) or idx.按名.get(目标) or idx.条目.get(f"{目标}.md")
