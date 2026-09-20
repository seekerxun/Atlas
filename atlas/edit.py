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
