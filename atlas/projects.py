"""项目的新建、登记和列举。命令行 `atlas 新建` 和画布的「新建 / 打开项目」共用。

注册表只存路径，项目身份（名称、类型）一律读各项目自己的 项目.yml。
"""
from __future__ import annotations
import shutil
from pathlib import Path

import miniyaml as y
from model import ATLAS

模板根 = ATLAS / "模板"
注册表 = ATLAS / "注册表.yml"
# 模板里可以写的占位符；新建时按项目替换。
可替换后缀 = {".md", ".yml", ".yaml", ".txt"}
# git 不收空目录，模板里缺的标准目录在新建时补上。
标准目录 = ["路线", "策划", "内容", "内容/_公共", "内容/_待定", "创意", "资产", "产出", "工具"]


def 模板们() -> list[str]:
    return sorted(p.name for p in 模板根.iterdir() if p.is_dir() and (p / "项目.yml").is_file())


def 是项目(路径: Path) -> bool:
    return (路径 / "项目.yml").is_file()


def 项目信息(路径: Path) -> dict:
    """列表里显示用：名称和类型读不出来也不报错，项目文件夹被挪走了就标不存在。"""
    信息 = {"路径": str(路径), "名称": 路径.name, "类型": "", "存在": 是项目(路径)}
    if 信息["存在"]:
        try:
            d = y.parse((路径 / "项目.yml").read_text(encoding="utf-8"))
            信息["名称"] = str(d.get("名称") or 路径.name)
            信息["类型"] = str(d.get("类型") or "")
        except Exception:
            pass
    return 信息


def 已登记() -> list[dict]:
    if not 注册表.exists():
        return []
    d = y.parse(注册表.read_text(encoding="utf-8"))
    return [x for x in (d.get("项目") or []) if isinstance(x, dict) and x.get("路径")]


def 登记(路径: Path, 备注: str = "") -> bool:
    """已登记的不重复写。返回是否新写了一条。"""
    路径 = 路径.resolve()
    if any(Path(str(x["路径"])).expanduser().resolve() == 路径 for x in 已登记()):
        return False
    with 注册表.open("a", encoding="utf-8") as f:
        f.write(f"\n  - 路径: {路径}\n    备注: {备注 or 路径.name}\n")
    return True


def 新建项目(模板: str, 目标: Path, 名称: str = "") -> Path:
    """从模板复制出一个新项目，替换占位符、补齐标准目录并登记。目标必须不存在或是空目录。"""
    源 = 模板根 / 模板
    if 模板 not in 模板们():
        raise ValueError(f"没有模板「{模板}」。可用：{'、'.join(模板们())}")
    目标 = 目标.expanduser().resolve()
    if 目标.exists() and (not 目标.is_dir() or any(目标.iterdir())):
        raise FileExistsError(f"{目标} 已存在且不是空目录，不覆盖。")
    名称 = 名称.strip() or 目标.name
    shutil.copytree(源, 目标, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".DS_Store"))
    替换 = {"{{名称}}": 名称, "{{atlas}}": str(ATLAS / "atlas" / "atlas.py")}
    for p in 目标.rglob("*"):
        if p.is_file() and p.suffix.lower() in 可替换后缀:
            s = p.read_text(encoding="utf-8")
            新 = s
            for k, v in 替换.items():
                新 = 新.replace(k, v)
            if 新 != s:
                p.write_text(新, encoding="utf-8")
    for d in 标准目录:
        (目标 / d).mkdir(parents=True, exist_ok=True)
    登记(目标, 名称)
    return 目标
