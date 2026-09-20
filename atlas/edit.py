"""frontmatter 写回：只碰 frontmatter 区块，不碰正文。"""
from __future__ import annotations
import time
from pathlib import Path

import miniyaml as y

顺序 = ["类型", "状态", "摘要", "位阶", "机制", "关联", "资产",
        "工具", "数据", "代码", "标签", "扩展"]


def _标量(v) -> str:
    if v is None:
        return "~"
    if isinstance(v, bool):
        return "true" if v else "false"
    s = str(v)
    if s == "" or s[0] in "[{#&*!|>%@`" or ": " in s or s.endswith(":"):
        return f'"{s}"'
    return s


def _行内(v) -> str:
    if isinstance(v, list):
        return "[" + ", ".join(_标量(x) for x in v) + "]"
    return _标量(v)


def 序列化(fm: dict) -> str:
    行 = []
    键 = [k for k in 顺序 if k in fm] + [k for k in fm if k not in 顺序]
    for k in 键:
        v = fm[k]
        if isinstance(v, dict):
            行.append(f"{k}:")
            for k2, v2 in v.items():
                行.append(f"  {k2}: {_行内(v2)}")
        else:
            行.append(f"{k}: {_行内(v)}")
    return "\n".join(行)


def 读(路径: Path) -> tuple[dict, str, float]:
    text = 路径.read_text(encoding="utf-8")
    原文, 正文 = y.split_frontmatter(text)
    fm = y.parse(原文, strict=True) or {} if 原文 is not None else {}
    return fm, 正文, 路径.stat().st_mtime


def 写(路径: Path, fm: dict, 正文: str, 原mtime: float | None = None):
    """写回前比对修改时间，不一致就中止——画布和 AI 可能同时在改。"""
    if 原mtime is not None and 路径.exists():
        now = 路径.stat().st_mtime
        if abs(now - 原mtime) > 1e-6:
            raise RuntimeError(f"{路径} 在这期间被改过了，已中止。重新扫描后再试。")
    内容 = "---\n" + 序列化(fm) + "\n---\n" + (正文 if 正文.startswith("\n") else "\n" + 正文)
    临时 = 路径.with_suffix(路径.suffix + ".tmp")
    临时.write_text(内容, encoding="utf-8")
    临时.replace(路径)


def 加字段(路径: Path, 键: str, 值, 演习=False) -> str | None:
    fm, 正文, mt = 读(路径)
    if 键 in fm:
        return None
    fm[键] = 值
    if not 演习:
        写(路径, fm, 正文, mt)
    return f"{键}: {_行内(值)}"


def 改名(路径: Path, 旧: str, 新: str, 演习=False) -> str | None:
    fm, 正文, mt = 读(路径)
    if 旧 not in fm:
        return None
    新fm = {(新 if k == 旧 else k): v for k, v in fm.items()}
    if not 演习:
        写(路径, 新fm, 正文, mt)
    return f"{旧} → {新}"


def 认领(路径: Path, 字段: str, 分类: str | None, 值: str, 演习=False) -> str:
    fm, 正文, mt = 读(路径)
    if 分类:
        块 = fm.setdefault(字段, {})
        if not isinstance(块, dict):
            raise RuntimeError(f"{字段} 不是分类块，不能按分类挂")
        lst = 块.setdefault(分类, [])
        if not isinstance(lst, list):
            lst = 块[分类] = [lst]
    else:
        lst = fm.setdefault(字段, [])
        if not isinstance(lst, list):
            lst = fm[字段] = [lst]
    if 值 in lst:
        return f"已经挂过了：{值}"
    lst.append(值)
    if not 演习:
        写(路径, fm, 正文, mt)
    return f"{字段}{'.' + 分类 if 分类 else ''} += {值}"


# ---------------------------------------------------------------- 路线写回
def _yaml串(s: str) -> str:
    s = str(s)
    if s == "" or s[0] in "[{#&*!|>%@`'\"-" or ": " in s or s.endswith(":") or s.strip() != s:
        return '"' + s.replace('"', '\\"') + '"'
    return s


def 序列化路线(r: dict, 头注释: str = "") -> str:
    """按固定模板重写，不做 YAML 往返——往返会丢注释、打乱顺序。"""
    行 = []
    if 头注释:
        行.append(头注释.rstrip())
    行.append(f"route: {_yaml串(r.get('route') or '')}")
    if r.get("desc"):
        行.append(f"desc: {_yaml串(r['desc'])}")
    if r.get("entry"):
        行.append("entry: true")
    行.append("")
    行.append("steps:")
    for s in r.get("steps") or []:
        行.append(f"  - id: {_yaml串(s.get('id') or '')}")
        行.append(f"    title: {_yaml串(s.get('title') or s.get('id') or '')}")
        if s.get("note"):
            行.append(f"    note: {_yaml串(s['note'])}")
        if s.get("docs"):
            行.append("    docs:")
            行 += [f"      - {_yaml串(d)}" for d in s["docs"]]
        for k in ("tools", "outputs", "next"):
            if s.get(k):
                行.append(f"    {k}: [" + ", ".join(_yaml串(x) for x in s[k]) + "]")
        行.append("")
    return "\n".join(行).rstrip() + "\n"


def 取头注释(路径: Path) -> str:
    if not 路径.exists():
        return ""
    出 = []
    for ln in 路径.read_text(encoding="utf-8").split("\n"):
        if ln.startswith("#"):
            出.append(ln)
        elif ln.strip() == "":
            if 出:
                break
        else:
            break
    return "\n".join(出)


def 写路线(路径: Path, r: dict, 原mtime: float | None = None):
    if 原mtime is not None and 路径.exists():
        if abs(路径.stat().st_mtime - 原mtime) > 1e-6:
            raise RuntimeError(f"{路径.name} 在这期间被改过了，已中止。刷新后再试。")
    内容 = 序列化路线(r, 取头注释(路径))
    临时 = 路径.with_suffix(路径.suffix + ".tmp")
    临时.write_text(内容, encoding="utf-8")
    临时.replace(路径)
