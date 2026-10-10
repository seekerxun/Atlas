"""项目的新建、登记、列举和画布服务启动。命令行 `atlas 新建` 和画布的「新建 / 打开项目」共用。

注册表只存路径，项目身份（名称、类型）一律读各项目自己的 项目.yml。
"""
from __future__ import annotations
import json, shutil, socket, subprocess, sys, time
import urllib.request
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


def _复制模板(源: Path, 目标: Path) -> None:
    """只继承内容和权限；旧 mtime 在 macOS 上还会把新目录的创建时间拉回过去。"""
    目标.mkdir(parents=True, exist_ok=True)
    for p in 源.iterdir():
        if p.name == ".DS_Store":
            continue
        if p.is_dir():
            _复制模板(p, 目标 / p.name)
        else:
            shutil.copy(p, 目标 / p.name)
    # copytree 即使指定 copy_function=copy，仍会对目录调用 copystat。
    shutil.copymode(源, 目标)


def 新建项目(模板: str, 目标: Path, 名称: str = "") -> Path:
    """从模板复制出一个新项目，替换占位符、补齐标准目录并登记。目标必须不存在或是空目录。"""
    源 = 模板根 / 模板
    if 模板 not in 模板们():
        raise ValueError(f"没有模板「{模板}」。可用：{'、'.join(模板们())}")
    目标 = 目标.expanduser().resolve()
    if 目标.exists() and (not 目标.is_dir() or any(目标.iterdir())):
        raise FileExistsError(f"{目标} 已存在且不是空目录，不覆盖。")
    名称 = 名称.strip() or 目标.name
    _复制模板(源, 目标)
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
    确保画布端口(目标, 名称)
    登记(目标, 名称)
    return 目标


# ---------------------------------------------------------------- 画布服务与 DevDock
# 每个项目的画布端口写在它自己的 .devdock.json 里（DevDock 靠 port 判断运行状态、按 port 停止）。
# 一个端口只对应一个项目，打开别的项目是在它自己的端口上起服务，不切换当前服务。
起始端口 = 7391
DevDock = ".devdock.json"


def _atlas目标(配置: dict):
    for t in 配置.get("targets") or []:
        参数 = [str(x) for x in ((t.get("startCommand") or {}).get("arguments") or [])]
        if "serve" in 参数 and any(a.endswith("atlas.py") for a in 参数) and t.get("port"):
            return t
    return None


def _读配置(路径: Path) -> dict:
    p = 路径 / DevDock
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
    except Exception:
        return {}


def 画布端口(路径: Path) -> int | None:
    t = _atlas目标(_读配置(路径))
    return int(t["port"]) if t else None


def 端口在用(端口: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", 端口)) == 0


def _已占端口() -> set[int]:
    """LifeSpace 下各项目 .devdock.json 里写死的端口，加上注册表里项目的，都不能再分配。"""
    目录们 = {p for p in ATLAS.parent.iterdir() if p.is_dir()} | {Path(str(x["路径"])).expanduser() for x in 已登记()}
    端口们 = set()
    for d in 目录们:
        for t in _读配置(d).get("targets") or []:
            if isinstance(t.get("port"), int):
                端口们.add(t["port"])
    return 端口们


def 分配端口() -> int:
    占 = _已占端口()
    p = 起始端口
    while p in 占 or 端口在用(p):
        p += 1
    return p


def _python() -> str:
    for p in ("/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if Path(p).is_file():
            return p
    return sys.executable


def 确保画布端口(路径: Path, 名称: str = "") -> int:
    """有 Atlas 画布运行项就用它的端口；没有就分配一个，写进（或新建）项目的 .devdock.json。"""
    端口 = 画布端口(路径)
    if 端口:
        return 端口
    端口 = 分配端口()
    配置 = _读配置(路径) or {"schemaVersion": 1, "name": 名称 or 路径.name,
                             "detail": "用 Atlas 规范管理的项目；画布看路线、策划、内容、资产", "symbolName": "map"}
    配置.setdefault("targets", []).append({
        "name": "Atlas 画布", "detail": "本地画布，只绑 127.0.0.1", "kind": "webPreview",
        "port": 端口, "url": f"http://127.0.0.1:{端口}",
        "startCommand": {"executable": _python(),
                         "arguments": [str(ATLAS / "atlas" / "atlas.py"), "serve", "--端口", str(端口), "--不开浏览器"],
                         "workingDirectory": "."},
    })
    (路径 / DevDock).write_text(json.dumps(配置, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 端口


def 端口上的项目(端口: int) -> str | None:
    """这个端口上的 Atlas 服务管的是哪个项目；没服务、不是 Atlas 或旧版本返回 None。"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{端口}/%E8%BA%AB%E4%BB%BD", timeout=1) as r:
            return json.loads(r.read()).get("根")
    except Exception:
        return None


def 启动画布(路径: Path, 名称: str = "") -> str:
    """保证这个项目的画布在它自己的端口上运行，返回网址。和 DevDock 用同一条命令、同一个工作目录。"""
    路径 = 路径.resolve()
    端口 = 确保画布端口(路径, 名称)
    网址 = f"http://127.0.0.1:{端口}/"
    if 端口在用(端口):
        根 = 端口上的项目(端口)
        if 根 and Path(根).resolve() == 路径:
            return 网址
        raise RuntimeError(f"端口 {端口} 已被别的程序占用（{'项目 ' + 根 if 根 else '不是新版 Atlas'}）。"
                           f"在 DevDock 里停掉它，或改 {路径.name}/{DevDock} 里的端口。")
    日志 = 路径 / ".atlas" / "serve.log"
    日志.parent.mkdir(exist_ok=True)
    with 日志.open("ab") as f:
        subprocess.Popen([_python(), str(ATLAS / "atlas" / "atlas.py"), "serve", "--端口", str(端口), "--不开浏览器"],
                         cwd=路径, stdin=subprocess.DEVNULL, stdout=f, stderr=f, start_new_session=True)
    for _ in range(40):
        time.sleep(0.2)
        if 端口上的项目(端口):
            return 网址
    raise RuntimeError(f"画布服务没能在端口 {端口} 起来，看 {路径.name}/.atlas/serve.log。")
