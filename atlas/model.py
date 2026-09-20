"""配置与数据模型。"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import miniyaml as y

ATLAS = Path(__file__).resolve().parent.parent
词表路径 = ATLAS / "规范" / "词表.yml"

TOOL_EXT = {".py", ".js", ".ts", ".sh", ".ps1", ".cmd", ".bat", ".html", ".ipynb"}
ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp", ".psd", ".svg", ".gif", ".mp4", ".wav", ".mp3"}
DATA_EXT = {".csv", ".tsv", ".json", ".xlsx"}
SKIP_EXT = {".yml", ".yaml", ".lock", ".gitignore", ".gitattributes", ".lfsconfig"}
SKIP_NAME = {".DS_Store", "package.json", "package-lock.json", "tsconfig.json"}


@dataclass
class Node:
    路径: str
    编号: str = ""
    名称: str = ""
    库: str = ""
    分组: str = ""
    类型: str = ""
    状态: str = ""
    摘要: str = ""
    位阶: Any = None
    机制: list = field(default_factory=list)
    关联: dict = field(default_factory=dict)
    资产: dict = field(default_factory=dict)
    工具: list = field(default_factory=list)
    数据: list = field(default_factory=list)
    代码: list = field(default_factory=list)
    标签: list = field(default_factory=list)
    扩展: dict = field(default_factory=dict)
    软引用: list = field(default_factory=list)
    行数: int = 0
    有frontmatter: bool = True
    豁免: bool = False
    # 扫描后填
    资产展开: list = field(default_factory=list)
    被引用: list = field(default_factory=list)
    路线: list = field(default_factory=list)

    @property
    def 标题(self):
        return self.名称 or Path(self.路径).stem

    def to_dict(self):
        d = dict(self.__dict__)
        return d


@dataclass
class 步骤:
    id: str
    title: str
    note: str = ""
    docs: list = field(default_factory=list)
    tools: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    next: list = field(default_factory=list)


@dataclass
class 路线:
    名称: str
    路径: str
    说明: str = ""
    入口: bool = False
    步骤: list = field(default_factory=list)


@dataclass
class 发现:
    级别: str      # 错误 | 警告
    码: str
    位置: str
    信息: str
    提示: str = ""


class 配置:
    def __init__(self, 根: Path):
        self.根 = 根
        d = y.parse((根 / "项目.yml").read_text(encoding="utf-8"))
        self.名称 = d.get("名称") or 根.name
        self.主分组 = d.get("主分组") or "分组"
        self.内容类型 = set(d.get("内容类型") or [])
        self.编号表 = d.get("编号") or {}
        self.机制权威 = d.get("机制权威")
        self.机制名来源 = d.get("机制名来源") or {}
        self.忽略 = set(d.get("忽略") or []) | {".git", ".atlas", "node_modules", "__pycache__"}
        self.入口路线 = d.get("入口路线")

        w = y.parse(词表路径.read_text(encoding="utf-8"))
        self.库表 = w.get("库") or {}
        self.策划类型 = set((w.get("类型") or {}).get("策划") or [])
        self.通用类型 = set((w.get("类型") or {}).get("通用") or [])
        self.状态表 = set(w.get("状态") or [])
        字段 = w.get("字段") or {}
        self.必填 = list(字段.get("必填") or ["类型", "状态"])
        self.豁免 = set(字段.get("豁免") or [])
        self.可选字段 = set((字段.get("可选") or {}).keys())
        self.层级 = w.get("层级") or []
        self.上限 = w.get("上限") or {}
        self.规则说明 = {}
        for 级, 组 in (w.get("校验") or {}).items():
            for k, v in (组 or {}).items():
                self.规则说明[k] = (级, v)

        前缀 = sorted({str(v) for v in self.编号表.values()}, key=len, reverse=True)
        self.编号正则 = re.compile(r"^(" + "|".join(map(re.escape, 前缀)) + r")-[A-Za-z0-9]+(?:-\d+)?") if 前缀 else None

    @property
    def 类型表(self):
        return self.策划类型 | self.通用类型 | self.内容类型

    def 层级序(self, 类型: str):
        for i, 组 in enumerate(self.层级):
            if 类型 in 组:
                return i
        return None


def 找根(起点: Path) -> Path | None:
    p =起点.resolve()
    for q in [p, *p.parents]:
        if (q / "项目.yml").exists():
            return q
    return None
