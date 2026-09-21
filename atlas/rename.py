"""改名引擎：声明改什么 → 算出所有会被波及的地方 → 预演 → 执行。

四种改名共用一套流程，差别只在影响面包含哪几类：

    条目改名    文件名、别人 关联: 里的名字、正文 [[链接]]、路线 docs、资产目录
    类型值改名  frontmatter 的 类型:、项目.yml 词表与编号前缀、目录名、模板文件、路线 docs
    词表值改名  受控词表那份名单里的一行、frontmatter 的引用字段、正文锚点链接
    字段名改名  全库 frontmatter 的键

正文里的自然语言提及一律**只列不改**——"这个副本很难"里的"副本"可能说的是别的。
"""
from __future__ import annotations
import os, re
from dataclasses import dataclass, field
from pathlib import Path

import miniyaml as y
from scan import 索引


@dataclass
class 处:
    """一处会被改到的地方。"""
    位置: str
    预览: str = ""
    只读: bool = False          # 只读 = 工具不动它，列出来给人看


@dataclass
class 组:
    类: str
    处们: list = field(default_factory=list)
    只读: bool = False
    提醒: str = ""


@dataclass
class 影响面:
    种类: str
    旧: str
    新: str
    组们: list = field(default_factory=list)
    错: str = ""

    @property
    def 可改数(self):
        return sum(len(g.处们) for g in self.组们 if not g.只读)

    @property
    def 只读数(self):
        return sum(len(g.处们) for g in self.组们 if g.只读)


def _正文(文本: str) -> str:
    _, 正 = y.split_frontmatter(文本)
    return 正


def _提及(根: Path, idx: 索引, 词: str, 已算: set | None = None) -> list[处]:
    """正文里出现这个词的地方。只统计，不改。已在别的组里算过的不重复列。"""
    出, 已算 = [], 已算 or set()
    for s, n in sorted(idx.条目.items()):
        正文 = _正文((根 / s).read_text(encoding="utf-8", errors="replace"))
        for i, ln in enumerate(正文.split("\n"), 1):
            if 词 in ln and f"{s}:{i}" not in 已算:
                出.append(处(f"{s}:{i}", ln.strip()[:70], 只读=True))
    return 出


def _位置集(面: "影响面") -> set:
    return {h.位置 for g in 面.组们 for h in g.处们}


def _代码里(根: Path, cfg, 词: str) -> list[处]:
    出 = []
    for d in getattr(cfg, "代码目录", []) or []:
        base = 根 / d
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if not p.is_file() or p.suffix in (".png", ".jpg", ".mp4"):
                continue
            try:
                文本 = p.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for i, ln in enumerate(文本.split("\n"), 1):
                if 词 in ln:
                    rel = str(p.relative_to(根)).replace(os.sep, "/")
                    出.append(处(f"{rel}:{i}", ln.strip()[:70], 只读=True))
    return 出


# ---------------------------------------------------------------- 类型值
def 算_类型(idx: 索引, 旧: str, 新: str) -> 影响面:
    cfg, 根 = idx.cfg, idx.根
    面 = 影响面("类型值", 旧, 新)
    if 旧 not in cfg.内容类型 and 旧 not in cfg.策划类型 | cfg.通用类型:
        面.错 = f"`{旧}` 不在类型词表里。现有：" + "、".join(sorted(cfg.类型表))
        return 面

    fm = [处(s, f"类型: {旧}") for s, n in sorted(idx.条目.items()) if n.类型 == 旧]
    面.组们.append(组("frontmatter 的 类型:", fm))

    词表 = []
    p = 根 / "项目.yml"
    for i, ln in enumerate(p.read_text(encoding="utf-8").split("\n"), 1):
        if re.search(rf"(^|[\[,\s]){re.escape(旧)}([\],\s:]|$)", ln):
            词表.append(处(f"项目.yml:{i}", ln.strip()[:70]))
    面.组们.append(组("项目.yml（类型词表 / 编号前缀）", 词表,
                     提醒="编号前缀要不要跟着改，工具不替你决定"))

    目录 = [处(str(d.relative_to(根)).replace(os.sep, "/") + "/")
           for d in sorted(根.rglob(旧)) if d.is_dir()
           and not any(x in d.parts for x in cfg.忽略)]
    面.组们.append(组("目录名", 目录))

    模板 = [处(s) for s in idx.条目 if s.startswith("内容/_模板/") and Path(s).stem == 旧]
    面.组们.append(组("模板文件", 模板))

    路线 = []
    for r in idx.路线:
        for st in r.步骤:
            for d in st.docs + st.outputs:
                if 旧 in d:
                    路线.append(处(f"{r.路径}#{st.id}", d))
    面.组们.append(组("路线引用", 路线))

    面.组们.append(组("正文里的提及", _提及(根, idx, 旧, _位置集(面)), 只读=True,
                     提醒="自然语言，工具不动，你自己看哪些该改"))
    代码 = _代码里(根, cfg, 旧)
    if 代码:
        面.组们.append(组("代码目录里的字符串", 代码, 只读=True,
                         提醒="仓库外的消费者，工具不碰"))
    return 面


# ---------------------------------------------------------------- 受控词表的值
def 算_词表值(idx: 索引, 词表名: str, 旧: str, 新: str) -> 影响面:
    cfg, 根 = idx.cfg, idx.根
    面 = 影响面(f"{词表名}名", 旧, 新)
    表 = next((t for t in cfg.受控词表 if str(t.get("名字")) == 词表名), None)
    if 表 is None:
        面.错 = f"项目没声明叫 `{词表名}` 的受控词表。现有：" + \
                "、".join(str(t.get("名字")) for t in cfg.受控词表)
        return 面
    if 旧 not in (idx.词表值.get(词表名) or set()):
        面.错 = f"名单里没有 `{旧}`"
        return 面

    名单文件 = str(表.get("文件"))
    名单 = []
    for i, ln in enumerate((根 / 名单文件).read_text(encoding="utf-8").split("\n"), 1):
        if ln.startswith("|") and ln.split("|")[1].strip() == 旧:
            名单.append(处(f"{名单文件}:{i}", ln.strip()[:70]))
        elif re.match(rf"^#{{2,4}}\s+{re.escape(旧)}\s*$", ln):
            名单.append(处(f"{名单文件}:{i}", ln.strip()))
    面.组们.append(组(f"名单本身（{名单文件}）", 名单))

    字段 = str(表.get("引用字段") or 词表名)
    引用 = [处(s, f"{字段}: …{旧}…") for s, n in sorted(idx.条目.items())
           if 旧 in (getattr(n, 字段, None) or [])]
    面.组们.append(组(f"frontmatter 的 {字段}:", 引用))

    锚点 = []
    for s in sorted(idx.条目):
        正文 = _正文((根 / s).read_text(encoding="utf-8", errors="replace"))
        for i, ln in enumerate(正文.split("\n"), 1):
            if re.search(rf"\[\[[^\]]*#{re.escape(旧)}[\|\]]", ln) or \
               re.search(rf"\[\[[^\]]*\|{re.escape(旧)}\]\]", ln):
                锚点.append(处(f"{s}:{i}", ln.strip()[:70]))
    面.组们.append(组("正文里的锚点链接 [[…#名字|名字]]", 锚点))

    面.组们.append(组("正文里的其它提及", _提及(根, idx, 旧, _位置集(面)), 只读=True,
                     提醒="自然语言，工具不动"))
    return 面


# ---------------------------------------------------------------- 条目
def 算_条目(idx: 索引, 旧: str, 新: str) -> 影响面:
    cfg, 根 = idx.cfg, idx.根
    节 = idx.按编号.get(旧.split()[0]) or idx.按名.get(旧) or idx.条目.get(旧)
    面 = 影响面("条目", 旧, 新)
    if 节 is None:
        面.错 = f"找不到条目 `{旧}`"
        return 面
    老名 = Path(节.路径).stem
    新名 = (f"{节.编号} {新}".strip() if 节.编号 else 新)
    面.旧, 面.新 = 老名, 新名

    面.组们.append(组("文件本身", [处(节.路径, f"→ {Path(节.路径).parent}/{新名}.md")]))

    引用 = []
    for s, n in sorted(idx.条目.items()):
        for 关系, 目标们 in (n.关联 or {}).items():
            for t in (目标们 if isinstance(目标们, list) else [目标们]):
                t = str(t)
                if t == 老名 or (节.编号 and t.split()[0] == 节.编号):
                    引用.append(处(s, f"关联.{关系}: {t}"))
    面.组们.append(组("别人 关联: 里的名字", 引用,
                     提醒="编号不变，只改后面的显示名" if 节.编号 else "没有编号，只能按名字匹配"))

    链接 = []
    for s in sorted(idx.条目):
        正文 = _正文((根 / s).read_text(encoding="utf-8", errors="replace"))
        for i, ln in enumerate(正文.split("\n"), 1):
            if re.search(rf"\[\[[^\]]*{re.escape(老名)}", ln):
                链接.append(处(f"{s}:{i}", ln.strip()[:70]))
    面.组们.append(组("正文 [[双链]]", 链接))

    路线 = [处(f"{r.路径}#{st.id}", d) for r in idx.路线 for st in r.步骤
           for d in st.docs if Path(d).stem == 老名]
    面.组们.append(组("路线 docs", 路线))

    资产 = []
    if 节.编号:
        for a in idx.资产:
            if 节.编号 in a:
                资产.append(处(a, 只读=True))
    面.组们.append(组("资产路径里的编号", 资产, 只读=True,
                     提醒="编号没变就不用动；编号也要改的话单独跑一次"))
    return 面


# ---------------------------------------------------------------- 字段名
def 算_字段(idx: 索引, 旧: str, 新: str) -> 影响面:
    面 = 影响面("字段名", 旧, 新)
    核心 = idx.cfg.可选字段 | set(idx.cfg.必填)
    if 旧 in 核心:
        面.错 = (f"`{旧}` 是 Atlas 核心字段，改它要动 model.py / lint.py / 画布，"
                f"不是批量改数据。核心字段定了就别改，要扩往 扩展: 里加。")
        return 面
    命中 = []
    for s, n in sorted(idx.条目.items()):
        if 旧 in (n.扩展 or {}):
            命中.append(处(s, f"扩展.{旧}"))
        elif 旧 in (getattr(n, "_未知", []) or []):
            命中.append(处(s, f"{旧}:（未知字段）"))
    面.组们.append(组("frontmatter 的键", 命中))
    return 面


def 算(idx: 索引, 种类: str, 旧: str, 新: str, 词表名: str = "") -> 影响面:
    if 种类 == "类型":
        return 算_类型(idx, 旧, 新)
    if 种类 == "条目":
        return 算_条目(idx, 旧, 新)
    if 种类 == "字段":
        return 算_字段(idx, 旧, 新)
    if 种类 == "词表":
        return 算_词表值(idx, 词表名, 旧, 新)
    面 = 影响面(种类, 旧, 新)
    面.错 = f"不认识的改名种类 `{种类}`"
    return 面
