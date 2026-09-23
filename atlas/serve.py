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
  GET  /候选             画布上选文档用的候选列表
  GET  /项目             当前项目、注册表里的项目、可用模板
  POST /打开项目         把这个服务切到另一个项目（端口不变）
  POST /新建项目         从模板新建项目、登记并切过去

一个服务同一时间只管一个项目，端口固定；打开别的项目是在同一个端口里切换，不另起端口。
切换后，旧页面的写请求会因为 X-Atlas-根 对不上而被拒，绝不会写进另一个项目。

每个会写盘的接口都返回改之前的全文，画布把它压进撤销栈；撤销就是把那份全文写回去。
写回前一律比对 mtime：对不上说明别人动过，中止，绝不覆盖。
"""
from __future__ import annotations
import json, mimetypes, os, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import edit
import projects
import miniyaml as y
from lint import 校验, 体检数
from model import ATLAS
from scan import 建索引, _走

页面 = ATLAS / "视图" / "画布.html"
文本后缀 = {'.md', '.txt', '.html', '.htm', '.css', '.scss', '.js', '.mjs', '.ts',
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


def 打包(根: Path) -> dict:
    idx = 建索引(根)
    结果 = 校验(idx)
    已挂 = {a for n in idx.条目.values() for a in n.资产展开}
    未认领资产 = [a for a in idx.资产 if a.startswith("资产/") and a not in 已挂]
    # 与项目检查共用 W02 判定，代码目录中的产品文件不能被界面误报为孤儿。
    孤儿工具 = [f.位置 for f in 结果 if f.码 == 'W02']
    产出 = []
    d = 根 / "产出"
    if d.is_dir():
        for p in sorted(d.rglob("*")):
            if p.is_file() and p.name != ".DS_Store":
                产出.append(str(p.relative_to(根)).replace(os.sep, "/"))
    return {
        "项目": idx.cfg.名称, "主分组": idx.cfg.主分组, "文件候选": 文件候选(idx),
        "条目": [n.to_dict() for n in idx.条目.values()],
        "路线": [{"名称": r.名称, "路径": r.路径, "说明": r.说明, "入口": r.入口,
                 "文件名": r.路径.split("/")[-1],
                 "mtime": (根 / r.路径).stat().st_mtime,
                 "步骤": [s.__dict__ for s in r.步骤]} for r in idx.路线],
        "工具": idx.工具, "资产": idx.资产, "数据表": idx.数据,
        "未归类": idx.未归类, "未认领资产": 未认领资产, "孤儿工具": 孤儿工具,
        "产出": 产出, "词表值": {k: sorted(v) for k, v in idx.词表值.items()},
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

    def log_message(self, *a):
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
        if 路径 == "/项目":
            self._json(项目清单(self.根))
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
                self._切到(p.resolve())
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
                self._切到(目标)
                return
            # 其余接口都写当前项目；页面带来的根和当前根对不上，说明项目已被别的页面切走。
            if unquote(self.headers.get("X-Atlas-根") or "") != str(self.根):
                self._json({"错误": "项目已经切换过，这个页面的内容过期了。刷新后再操作。", "已切换": True}, 409)
                return
            if 路径 == "/布局":
                写布局(self.根, 体)
                self._json({"好": True})
            elif 路径 == "/认领":
                条目 = self.根 / 体["条目"]
                文件 = str(体["文件"])
                字段 = 体.get("字段") or ("工具" if Path(文件).suffix.lower() in
                                        {".py", ".js", ".ts", ".sh", ".html"} else "资产")
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

    def _切到(self, 根: Path):
        type(self).根 = 根
        projects.登记(根, projects.项目信息(根)["名称"])
        self._json({"好": True, "路径": str(根)})


def 起服务(根: Path, 端口: int = 7391, 打开=True):
    处理器.根 = 根
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
