"""atlas serve —— 本地画布服务。只绑 127.0.0.1。

接口：
  GET  /                 画布页面
  GET  /界面/<路径>       Atlas 自身的界面资源，与当前被管理项目分开
  GET  /数据             扫描结果 + 校验结果 + 布局（每次请求重扫，规模小不值得缓存）
  GET  /文件/<路径>       读一个仓库里的文件（缩略图、原文预览）
  POST /布局             存卡片位置
  POST /认领             把资产或工具挂到某个条目的 frontmatter 上
  POST /路线             按固定模板重写一条路线的 yml
  POST /删路线           删掉一条路线的 yml
  POST /还原             把某个文件写回指定内容（撤销/重做就靠它）
  POST /系统打开         用系统默认应用打开仓库里的文件，或在访达里选中它（不写盘）
  GET  /产出             产出批次：件数、天数、上次看过之后的新文件数
  GET  /产出批/<目录>     一批产出的文件清单与批次根目录下的说明
  POST /审阅             记一批看过的时间，或给产出文件标 通过／打回（写 .atlas/审阅.json）
  GET  /候选             画布上选文档用的候选列表
  GET  /身份             这个服务管的是哪个项目
  GET  /项目             当前项目、注册表里的项目（含端口和是否在运行）、可用模板
  POST /打开项目         保证那个项目的画布在它自己的端口上运行，返回网址
  POST /新建项目         从模板新建项目、登记、起它的画布，返回网址
  GET  /运行             当前项目 .devdock.json 里各运行目标的状态
  POST /运行             启动或停止当前项目的一个运行目标（只收目标名，命令只从配置里取）

一个服务只管启动时所在的项目。每个项目的端口写在它自己的 .devdock.json（DevDock 同一份配置），
打开别的项目是在那个端口上另起服务，当前服务不切换。写请求带 X-Atlas-Root，对不上就拒收。

每个会写盘的接口都返回改之前的全文，画布把它压进撤销栈；撤销就是把那份全文写回去。
写回前一律比对 mtime：对不上说明别人动过，中止，绝不覆盖。
"""
from __future__ import annotations
import json, mimetypes, os, re, subprocess, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import edit
import projects
import targets
import miniyaml as y
from lint import 校验, 体检数
from model import ATLAS
from scan import 建索引, _走

页面 = ATLAS / "视图" / "画布.html"
文本后缀 = {'.md', '.txt', '.srt', '.html', '.htm', '.css', '.scss', '.js', '.mjs', '.ts',
          '.tsx', '.jsx', '.vue', '.svelte', '.py', '.sh', '.json', '.yml', '.yaml',
          '.toml', '.xml', '.csv', '.tsv', '.sql'}


def 文件候选(idx):
    """文档保持无 .md 的路线引用；代码使用完整文件名，不读入所有源码。"""
    结果 = {n.路径: {"路径": n.路径[:-3], "文件路径": n.路径, "标题": n.标题 or n.名称,
                       "类型": n.类型, "库": n.库, "行数": n.行数, "摘要": n.摘要}
            for n in idx.条目.values()}
    根 = idx.根.resolve()
    for rel in _走(根, idx.cfg.忽略):
        s = rel.as_posix()
        if s in 结果 or any(p.startswith('.') for p in rel.parts):
            continue
        p = (根 / rel).resolve()
        if not p.is_relative_to(根) or not p.is_file() or p.suffix.lower() not in 文本后缀:
            continue
        结果[s] = {"路径": s[:-3] if s.endswith('.md') else s, "文件路径": s,
                   "标题": rel.name, "类型": '文档' if s.endswith('.md') else '代码 / 文本',
                   "库": '', "行数": None, "摘要": ''}
    return [结果[k] for k in sorted(结果)]


def 预览文件(根: Path, rel: str):
    根 = 根.resolve()
    p = (根 / rel).resolve()
    md = (根 / (rel + '.md')).resolve()
    if md.is_relative_to(根) and md.is_file():
        p = md
    if not p.is_relative_to(根) or not p.is_file():
        raise FileNotFoundError('文件不存在或不在当前项目内')
    if p.suffix.lower() not in 文本后缀:
        raise ValueError('该文件类型暂不支持文本预览')
    if p.stat().st_size > 1024 * 1024:
        raise ValueError('文件超过 1 MB，请在编辑器中查看')
    内容 = p.read_text(encoding='utf-8')
    return {"路径": p.relative_to(根).as_posix(), "内容": 内容,
            "格式": 'markdown' if p.suffix.lower() == '.md' else 'code'}


def 读布局(根: Path) -> dict:
    p = 根 / ".atlas" / "布局.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def 写布局(根: Path, 数据: dict):
    p = 根 / ".atlas" / "布局.json"
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(数据, ensure_ascii=False, indent=1), encoding="utf-8")


资产种类 = [("图片", {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".psd"}), ("视频", {".mp4", ".mov", ".webm"}),
          ("音频", {".mp3", ".wav", ".m4a"}), ("网页", {".html", ".htm"}),
          ("字幕", {".srt"}), ("文本", {".txt"})]


def 资产卡(idx) -> list:
    """素材视图的卡片：素材目录（默认 资产/）下每个文件一张，按实体目录分组（视图规范：按实体编号聚合）。
    只用于画布呈现；不是 md 条目，不参与校验。卡片带 资产文件=True，核心据此内嵌预览而不是读正文。"""
    主人: dict = {}
    for n in idx.条目.values():
        for a in n.资产展开:
            主人.setdefault(a, []).append(n)
    出 = []
    for a in idx.资产:
        parts = a.split("/")
        标签 = idx.cfg.按目录.get(parts[0])
        if not 标签 or 标签["规则"] != "素材":
            continue
        后缀 = Path(a).suffix.lower()
        种 = next((k for k, v in 资产种类 if 后缀 in v), "文件")
        挂 = 主人.get(a, [])
        分组 = " / ".join(parts[1:-1]) or "（根目录）"
        出.append({
            "路径": a, "名称": Path(a).stem, "标题": Path(a).name, "编号": "", "库": 标签["名称"], "分组": 分组,
            "类型": 种, "状态": "", "摘要": ("挂在：" + "、".join(n.标题 for n in 挂)) if 挂 else "未认领",
            "关联": {}, "资产": {}, "资产展开": [a], "被引用": [n.路径 for n in 挂], "软引用": [], "路线": [],
            "工具": [], "数据": [], "代码": [], "标签": [后缀.lstrip(".")], "扩展": {}, "机制": [],
            "行数": None, "有frontmatter": False, "豁免": True, "资产文件": True,
        })
    return 出


产出过期天数 = 14
产出单批上限 = 3000
产出跳过目录 = {"node_modules", "__pycache__"}
产出种类 = [("图片", {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".bmp"}),
          ("视频", {".mp4", ".mov", ".webm", ".m4v"}), ("音频", {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}),
          ("网页", {".html", ".htm"}), ("文档", {".md", ".txt", ".srt", ".pdf", ".csv", ".docx", ".xlsx", ".pptx"})]
# 过程文件：生成脚本、配置、缓存、字体之类，审阅时默认收起
产出过程后缀 = {".json", ".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".log", ".yml", ".yaml", ".css", ".map",
             ".lock", ".toml", ".xml", ".tmp", ".pid", ".pyc", ".woff", ".woff2", ".ttf", ".otf"}
产出过程文件 = {"claude.md", "agents.md"}
# 批次根目录下的 md/txt 当作 AI 写的说明置顶；这些是框架自带或制作用的文件，不算说明
产出非说明 = 产出过程文件 | {"brief.md", "storyboard.md", "script.md", "frame.md", "design.md"}


def _产出文件(b: Path):
    """一批里的文件：跳过点开头的文件和目录、node_modules 之类的依赖目录。"""
    if b.is_file():
        yield b
        return
    for dp, dns, fns in os.walk(b):
        dns[:] = [d for d in dns if not d.startswith(".") and d not in 产出跳过目录]
        for f in fns:
            if not f.startswith("."):
                yield Path(dp) / f


def 读审阅(根: Path) -> dict:
    """产出的审阅状态：每批上次看过的时间、每个文件的 通过／打回。存在 .atlas/审阅.json，只由画布写。
    第一次用时记下基准时间，之前就有的产出都算看过，免得老批次全部亮成新的。"""
    p = 根 / ".atlas" / "审阅.json"
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("基准"), (int, float)):
            d.setdefault("看过", {}); d.setdefault("标记", {})
            return d
    except (OSError, ValueError):
        pass
    d = {"基准": time.time(), "看过": {}, "标记": {}}
    写审阅(根, d)
    return d


def 写审阅(根: Path, d: dict):
    p = 根 / ".atlas" / "审阅.json"
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def 产出池(根: Path) -> list:
    """产出/ 下一个一级目录算一批（散放的文件各算一批）。天数按批内最新文件的修改时间算，
    超过 产出过期天数 标 过期；新数 是上次看过这批之后改动过的文件数。
    产出池是临时存放，不算未认领，也不进 check。"""
    d = 根 / "产出"
    if not d.is_dir():
        return []
    审 = 读审阅(根)
    现在, 出 = time.time(), []
    for b in sorted(d.iterdir()):
        if b.name.startswith(".") or b.name in 产出跳过目录:
            continue
        时间 = [f.stat().st_mtime for f in _产出文件(b)]
        if not 时间:
            continue
        名 = str(b.relative_to(根)).replace(os.sep, "/") + ("/" if b.is_dir() else "")
        看过 = 审["看过"].get(名, 审["基准"])
        最新 = max(时间)
        天 = int((现在 - 最新) // 86400)
        出.append({"目录": 名, "件数": len(时间), "天数": 天, "过期": 天 > 产出过期天数,
                   "最新": 最新, "新数": sum(t > 看过 for t in 时间)})
    return 出


def 产出批详情(根: Path, 目录: str) -> dict:
    """一批产出的文件清单（新的在前）和批次根目录下的说明。看过时间由画布另行写回。"""
    产出根 = (根 / "产出").resolve()
    b = (根 / 目录).resolve()
    if not b.is_relative_to(产出根) or b == 产出根 or not b.exists():
        raise FileNotFoundError("没有这一批产出")
    名 = str(b.relative_to(根.resolve())).replace(os.sep, "/") + ("/" if b.is_dir() else "")
    审 = 读审阅(根)
    全 = sorted(((f, f.stat()) for f in _产出文件(b)), key=lambda x: -x[1].st_mtime)
    文件 = []
    for f, st in 全[:产出单批上限]:
        rel = f.relative_to(根.resolve()).as_posix()
        后 = f.suffix.lower()
        文件.append({"路径": rel, "种类": next((k for k, v in 产出种类 if 后 in v), "其他"),
                   "大小": st.st_size, "时间": st.st_mtime, "文本": 后 in 文本后缀,
                   "过程": 后 in 产出过程后缀 or f.name.lower() in 产出过程文件,
                   "标记": 审["标记"].get(rel)})
    说明 = []
    if b.is_dir():
        for f in b.iterdir():
            if (f.is_file() and f.suffix.lower() in {".md", ".txt"} and not f.name.startswith(".")
                    and f.name.lower() not in 产出非说明 and f.stat().st_size <= 200 * 1024):
                try:
                    说明.append({"路径": f.relative_to(根.resolve()).as_posix(), "时间": f.stat().st_mtime,
                               "格式": "markdown" if f.suffix.lower() == ".md" else "text",
                               "内容": f.read_text(encoding="utf-8")})
                except (OSError, UnicodeError):
                    pass
        说明.sort(key=lambda x: (x["格式"] != "markdown", -x["时间"]))  # md 说明优先，同类新的在前
    return {"目录": 名, "看过": 审["看过"].get(名, 审["基准"]), "总数": len(全), "文件": 文件, "说明": 说明}


def 记审阅(根: Path, 体: dict):
    审 = 读审阅(根)
    if 体.get("看过"):
        名 = str(体["看过"])
        if not 名.startswith("产出/"):
            raise RuntimeError("只记录 产出/ 下的批次")
        审["看过"][名] = time.time()
    for rel, 状态 in (体.get("标记") or {}).items():
        rel = str(rel)
        if not rel.startswith("产出/") or ".." in rel.split("/"):
            raise RuntimeError("只标记 产出/ 下的文件")
        if 状态 in ("通过", "打回"):
            审["标记"][rel] = 状态
        elif 状态 is None:
            审["标记"].pop(rel, None)
        else:
            raise RuntimeError("标记只能是 通过、打回 或清除")
    写审阅(根, 审)


def 系统打开(根: Path, rel: str, 显示: bool):
    """显示=True 在访达（资源管理器）里选中文件，否则用系统默认应用打开。只接受仓库内已存在的路径。"""
    根 = 根.resolve()
    p = (根 / rel).resolve()
    if not p.is_relative_to(根) or not p.exists():
        raise RuntimeError(f"文件不存在：{rel}")
    if sys.platform == "darwin":
        命令 = ["open", "-R", str(p)] if 显示 else ["open", str(p)]
    elif os.name == "nt":
        命令 = ["explorer", f"/select,{p}"] if 显示 else ["cmd", "/c", "start", "", str(p)]
    else:
        命令 = ["xdg-open", str(p.parent if 显示 else p)]
    subprocess.Popen(命令, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def 文档搜索正文(idx):
    """只读取扫描纳入的项目文档；失败显式返回，不能把漏搜伪装成零命中。"""
    根 = idx.根.resolve()
    正文, 遗漏 = {}, []
    for rel in idx.条目:
        try:
            p = (根 / rel).resolve()
            if not p.is_relative_to(根):
                raise ValueError('文件不在当前项目内')
            正文[rel] = y.split_frontmatter(p.read_text(encoding='utf-8'))[1]
        except (OSError, UnicodeError, ValueError):
            遗漏.append(rel)
    return 正文, 遗漏


def 打包(根: Path) -> dict:
    idx = 建索引(根)
    结果 = 校验(idx)
    已挂 = {a for n in idx.条目.values() for a in n.资产展开}
    未认领资产 = [a for a in idx.资产 if a.split("/")[0] in idx.cfg.素材目录 and a not in 已挂]
    # 与项目检查共用 W02 判定，代码目录中的产品文件不能被界面误报为孤儿。
    孤儿工具 = [f.位置 for f in 结果 if f.码 == 'W02']
    产出批次 = 产出池(根)
    搜索正文, 搜索遗漏 = 文档搜索正文(idx)
    return {
        "项目": idx.cfg.名称, "主分组": idx.cfg.主分组, "文件候选": 文件候选(idx),
        "标签": [{"名称": t["名称"], "目录": t["目录"], "规则": t["规则"]} for t in idx.cfg.标签],
        "条目": [n.to_dict() for n in idx.条目.values()] + 资产卡(idx),
        "搜索正文": 搜索正文, "搜索遗漏": 搜索遗漏,
        "路线": [{"名称": r.名称, "路径": r.路径, "说明": r.说明, "入口": r.入口,
                 "文件名": r.路径.split("/")[-1],
                 "mtime": (根 / r.路径).stat().st_mtime,
                 "步骤": [s.__dict__ for s in r.步骤]} for r in idx.路线],
        "工具": idx.工具, "资产": idx.资产, "数据表": idx.数据,
        "未归类": idx.未归类, "未认领资产": 未认领资产, "孤儿工具": 孤儿工具,
        "产出批次": 产出批次, "词表值": {k: sorted(v) for k, v in idx.词表值.items()},
        "发现": [f.__dict__ for f in 结果], "体检": 体检数(idx, 结果),
        "统计": idx.统计(), "布局": 读布局(根), "根": str(根),
    }


def 项目清单(根: Path) -> dict:
    列表, 见过 = [], set()
    for x in [{"路径": str(根)}, *projects.已登记()]:
        p = Path(str(x["路径"])).expanduser().resolve()
        if p in 见过:
            continue
        见过.add(p)
        信息 = projects.项目信息(p)
        信息["当前"] = p == 根.resolve()
        信息["备注"] = str(x.get("备注") or "")
        信息["端口"] = projects.画布端口(p) if 信息["存在"] else None
        信息["运行中"] = bool(信息["端口"]) and projects.端口在用(信息["端口"])
        列表.append(信息)
    return {"当前": str(根), "列表": 列表, "模板": projects.模板们(), "建议位置": str(根.resolve().parent)}


def 读文本(p: Path):
    return p.read_text(encoding="utf-8") if p.exists() else None


def 写文本(p: Path, 内容):
    """内容为 None 表示删掉这个文件。返回写完后的 mtime（删掉则为 None）。"""
    if 内容 is None:
        if p.exists():
            p.unlink()
        return None
    p.parent.mkdir(parents=True, exist_ok=True)
    临时 = p.with_suffix(p.suffix + ".tmp")
    临时.write_text(内容, encoding="utf-8")
    临时.replace(p)
    return p.stat().st_mtime


def 核对(p: Path, 期望):
    if 期望 is None:
        return
    现在 = p.stat().st_mtime if p.exists() else None
    if 现在 is None and 期望 is None:
        return
    if 现在 is None or abs(现在 - float(期望)) > 1e-6:
        raise RuntimeError(f"{p.name} 在这期间被别人改过了，已中止——撤销会盖掉那些改动。刷新后再看。")


class 处理器(BaseHTTPRequestHandler):
    根: Path = Path(".")
    端口: int | None = None

    def log_message(self, *a):
        pass

    def handle(self):
        # 浏览器中途取消（视频缩略滚出视野、切换批次）会断开连接，不算错误
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _发(self, 码, 体: bytes, 类型="application/json; charset=utf-8"):
        self.send_response(码)
        self.send_header("Content-Type", 类型)
        self.send_header("Content-Length", str(len(体)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(体)

    def _json(self, 对象, 码=200):
        self._发(码, json.dumps(对象, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        路径 = unquote(urlparse(self.path).path)
        if 路径 in ("/", "/index.html"):
            self._发(200, 页面.read_bytes(), "text/html; charset=utf-8")
            return
        if 路径.startswith('/界面/'):
            根 = 页面.parent.resolve()
            p = (根 / 路径[len('/界面/'):]).resolve()
            类型 = {'.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
                    '.woff2': 'font/woff2'}
            if not p.is_relative_to(根) or not p.is_file() or p.suffix.lower() not in 类型:
                self._发(404, b'not found', 'text/plain')
                return
            self._发(200, p.read_bytes(), 类型[p.suffix.lower()])
            return
        if 路径 == "/数据":
            try:
                self._json(打包(self.根))
            except Exception as e:
                self._json({"错误": f"{type(e).__name__}: {e}"}, 500)
            return
        if 路径 == "/身份":
            self._json({"根": str(self.根)})
            return
        if 路径 == "/项目":
            self._json(项目清单(self.根))
            return
        if 路径 == "/运行":
            try:
                self._json({"目标": targets.状态(self.根, self.端口)})
            except RuntimeError as e:
                self._json({"错误": str(e)}, 409)
            return
        if 路径 == "/产出":
            self._json(产出池(self.根))
            return
        if 路径.startswith("/产出批/"):
            try:
                self._json(产出批详情(self.根, 路径[len("/产出批/"):]))
            except FileNotFoundError as e:
                self._json({"错误": str(e)}, 404)
            return
        if 路径 == "/候选":
            idx = 建索引(self.根)
            self._json(文件候选(idx))
            return
        if 路径.startswith("/预览/"):
            try:
                self._json(预览文件(self.根, 路径[len('/预览/'):]))
            except FileNotFoundError as e:
                self._json({"错误": str(e)}, 404)
            except (ValueError, OSError):
                self._json({"错误": '无法预览：请确认文件是 UTF-8 文本，且不超过 1 MB。'}, 400)
            return
        if 路径.startswith("/文件/"):
            rel = 路径[len("/文件/"):]
            p = (self.根 / rel).resolve()
            if not str(p).startswith(str(self.根.resolve())) or not p.is_file():
                self._发(404, b"not found", "text/plain")
                return
            t = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
            if p.suffix.lower() == ".md":
                t = "text/plain; charset=utf-8"
            范围 = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range") or "")
            if 范围:
                大小 = p.stat().st_size
                起 = int(范围.group(1)) if 范围.group(1) else max(0, 大小 - int(范围.group(2) or 0))
                # 没写结束位置（bytes=N-）时每次最多给 4 MB：产出墙一次挂几十个视频缩略，不能把整片都读进内存
                止 = min(int(范围.group(2)), 大小 - 1) if 范围.group(1) and 范围.group(2) else (
                    min(大小 - 1, 起 + 4 * 1024 * 1024 - 1) if 范围.group(1) else 大小 - 1)
                with open(p, "rb") as f:
                    f.seek(起); 体 = f.read(止 - 起 + 1)
                self.send_response(206)
                self.send_header("Content-Type", t); self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {起}-{止}/{大小}"); self.send_header("Content-Length", str(len(体)))
                self.send_header("Cache-Control", "no-store"); self.end_headers(); self.wfile.write(体)
                return
            self._发(200, p.read_bytes(), t)
            return
        self._发(404, b"not found", "text/plain")

    def do_POST(self):
        路径 = unquote(urlparse(self.path).path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            体 = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            self._json({"错误": f"请求不是合法 JSON: {e}"}, 400)
            return
        try:
            if 路径 == "/打开项目":
                p = Path(str(体.get("路径") or "")).expanduser()
                if not p.is_absolute() or not projects.是项目(p):
                    raise RuntimeError("这个文件夹不是 Atlas 项目：要填完整路径，且文件夹里有 项目.yml。")
                self._json({"好": True, "网址": projects.启动画布(p.resolve())})
                return
            if 路径 == "/新建项目":
                名称 = str(体.get("名称") or "").strip()
                if not 名称 or "/" in 名称 or "\\" in 名称 or 名称.startswith("."):
                    raise RuntimeError("名称会用作文件夹名，不能为空、不能带斜杠、不能以 . 开头。")
                位置 = Path(str(体.get("位置") or "")).expanduser()
                if not 位置.is_absolute() or not 位置.is_dir():
                    raise RuntimeError("位置要填一个已存在文件夹的完整路径。")
                try:
                    目标 = projects.新建项目(str(体.get("模板") or ""), 位置 / 名称, 名称)
                except (ValueError, FileExistsError) as e:
                    raise RuntimeError(str(e))
                self._json({"好": True, "网址": projects.启动画布(目标, 名称)})
                return
            # 其余接口都写当前项目；页面带来的根和当前根对不上（旧页面、别的端口的页面），拒收。
            if unquote(self.headers.get("X-Atlas-Root") or "") != str(self.根):
                self._json({"错误": "这个页面和服务管的不是同一个项目，刷新后再操作。"}, 409)
                return
            if 路径 == "/布局":
                写布局(self.根, 体)
                self._json({"好": True})
            elif 路径 == "/运行":
                名, 动作 = str(体.get("名称") or ""), 体.get("动作")
                if 动作 == "启动":
                    targets.启动(self.根, 名)
                elif 动作 == "停止":
                    if targets.找(self.根, 名).get("port") == self.端口:
                        raise RuntimeError("这就是当前画布的服务，停了页面就断了。到别处停它。")
                    targets.停止(self.根, 名)
                else:
                    raise RuntimeError("动作只能是 启动 或 停止")
                self._json({"好": True, "目标": targets.状态(self.根, self.端口)})
            elif 路径 == "/系统打开":
                系统打开(self.根, str(体.get("路径") or ""), bool(体.get("显示")))
                self._json({"好": True})
            elif 路径 == "/审阅":
                记审阅(self.根, 体)
                self._json({"好": True})
            elif 路径 == "/认领":
                条目 = self.根 / 体["条目"]
                文件 = str(体["文件"])
                目标 = (self.根 / 文件).resolve()
                if ("://" in 文件 or Path(文件).is_absolute() or not 目标.is_relative_to(self.根.resolve())
                        or not 目标.exists()):
                    raise RuntimeError(f"只能认领仓库里已有的文件：{文件}")
                字段 = 体.get("字段") or ("工具" if Path(文件).suffix.lower() in
                                        {".py", ".js", ".mjs", ".ts", ".sh", ".html"} else "资产")
                分类 = 体.get("分类") or (None if 字段 == "工具" else "未分类")
                旧 = 读文本(条目)
                r = edit.认领(条目, 字段, 分类, 文件)
                self._json({"好": True, "说明": r, "撤销": {
                    "路径": 体["条目"], "旧内容": 旧, "新内容": 读文本(条目),
                    "mtime": 条目.stat().st_mtime}})
            elif 路径 == "/路线":
                名 = str(体["文件名"])
                if "/" in 名 or "\\" in 名 or not 名.endswith(".yml"):
                    raise RuntimeError("文件名不合法")
                p = self.根 / "路线" / 名
                mt = p.stat().st_mtime if (p.exists() and 体.get("mtime")) else None
                if mt is not None and abs(mt - float(体["mtime"])) > 1e-6:
                    raise RuntimeError(f"{名} 在这期间被改过了，已中止。刷新后再试。")
                旧 = 读文本(p)
                edit.写路线(p, 体["路线"])
                self._json({"好": True, "mtime": p.stat().st_mtime, "撤销": {
                    "路径": f"路线/{名}", "旧内容": 旧, "新内容": 读文本(p),
                    "mtime": p.stat().st_mtime}})
            elif 路径 == "/删路线":
                名 = str(体["文件名"])
                p = self.根 / "路线" / 名
                if "/" in 名 or not 名.endswith(".yml") or not p.exists():
                    raise RuntimeError("文件名不合法")
                旧 = 读文本(p)
                p.unlink()
                self._json({"好": True, "撤销": {
                    "路径": f"路线/{名}", "旧内容": 旧, "新内容": None, "mtime": None}})
            elif 路径 == "/还原":
                rel = str(体["路径"]).replace("\\", "/")
                p = (self.根 / rel).resolve()
                if not str(p).startswith(str(self.根.resolve())):
                    raise RuntimeError("路径越界")
                if p.suffix not in (".md", ".yml"):
                    raise RuntimeError("只还原 .md 和 .yml")
                核对(p, 体.get("期望mtime"))
                旧 = 读文本(p)
                新mtime = 写文本(p, 体.get("内容"))
                self._json({"好": True, "mtime": 新mtime, "被替换的": 旧})
            else:
                self._json({"错误": "没这个接口"}, 404)
        except Exception as e:
            self._json({"错误": str(e)}, 409)


def 起服务(根: Path, 端口: int = 7391, 打开=True):
    处理器.根 = 根
    处理器.端口 = 端口
    # 起过画布的项目都进注册表，项目窗里才找得到它。
    projects.登记(根, projects.项目信息(根)["名称"])
    srv = ThreadingHTTPServer(("127.0.0.1", 端口), 处理器)
    地址 = f"http://127.0.0.1:{端口}/"
    print(f"画布开在 {地址}（只绑本机，Ctrl+C 停）")
    if 打开:
        threading.Timer(0.6, lambda: webbrowser.open(地址)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n停了。")
        srv.shutdown()
