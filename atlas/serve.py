"""atlas serve —— 本地画布服务。只绑 127.0.0.1。

接口：
  GET  /                 画布页面
  GET  /数据             扫描结果 + 校验结果 + 布局（每次请求重扫，规模小不值得缓存）
  GET  /文件/<路径>       读一个仓库里的文件（缩略图、原文预览）
  POST /布局             存卡片位置
  POST /认领             把资产或工具挂到某个条目的 frontmatter 上
  POST /路线             按固定模板重写一条路线的 yml
  GET  /候选             画布上选文档用的候选列表
"""
from __future__ import annotations
import json, mimetypes, os, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import edit
import miniyaml as y
from lint import 校验, 体检数
from model import ATLAS
from scan import 建索引

页面 = ATLAS / "视图" / "画布.html"


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
    声明工具 = {x.rstrip("/") for n in idx.条目.values() for x in n.工具}
    声明工具 |= {x.rstrip("/") for r in idx.路线 for st in r.步骤 for x in st.tools}
    未认领资产 = [a for a in idx.资产 if a.startswith("资产/") and a not in 已挂]
    孤儿工具 = [t for t in idx.工具
               if not any(t == k or t.startswith(k + "/") for k in 声明工具)]
    产出 = []
    d = 根 / "产出"
    if d.is_dir():
        for p in sorted(d.rglob("*")):
            if p.is_file() and p.name != ".DS_Store":
                产出.append(str(p.relative_to(根)).replace(os.sep, "/"))
    return {
        "项目": idx.cfg.名称, "主分组": idx.cfg.主分组,
        "条目": [n.to_dict() for n in idx.条目.values()],
        "路线": [{"名称": r.名称, "路径": r.路径, "说明": r.说明, "入口": r.入口,
                 "文件名": r.路径.split("/")[-1],
                 "mtime": (根 / r.路径).stat().st_mtime,
                 "步骤": [s.__dict__ for s in r.步骤]} for r in idx.路线],
        "工具": idx.工具, "资产": idx.资产, "数据表": idx.数据,
        "未归类": idx.未归类, "未认领资产": 未认领资产, "孤儿工具": 孤儿工具,
        "产出": 产出, "机制名": sorted(idx.机制名),
        "发现": [f.__dict__ for f in 结果], "体检": 体检数(idx, 结果),
        "统计": idx.统计(), "布局": 读布局(根),
    }


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
        if 路径 == "/数据":
            try:
                self._json(打包(self.根))
            except Exception as e:
                self._json({"错误": f"{type(e).__name__}: {e}"}, 500)
            return
        if 路径 == "/候选":
            idx = 建索引(self.根)
            self._json([{"路径": n.路径[:-3], "标题": n.标题, "类型": n.类型,
                         "库": n.库, "行数": n.行数, "摘要": n.摘要}
                        for n in sorted(idx.条目.values(), key=lambda x: x.路径)])
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
            if 路径 == "/布局":
                写布局(self.根, 体)
                self._json({"好": True})
            elif 路径 == "/认领":
                条目 = self.根 / 体["条目"]
                文件 = str(体["文件"])
                字段 = 体.get("字段") or ("工具" if Path(文件).suffix.lower() in
                                        {".py", ".js", ".ts", ".sh", ".html"} else "资产")
                分类 = 体.get("分类") or (None if 字段 == "工具" else "未分类")
                r = edit.认领(条目, 字段, 分类, 文件)
                self._json({"好": True, "说明": r})
            elif 路径 == "/路线":
                名 = str(体["文件名"])
                if "/" in 名 or "\\" in 名 or not 名.endswith(".yml"):
                    raise RuntimeError("文件名不合法")
                p = self.根 / "路线" / 名
                mt = p.stat().st_mtime if (p.exists() and 体.get("mtime")) else None
                if mt is not None and abs(mt - float(体["mtime"])) > 1e-6:
                    raise RuntimeError(f"{名} 在这期间被改过了，已中止。刷新后再试。")
                edit.写路线(p, 体["路线"])
                self._json({"好": True, "mtime": p.stat().st_mtime})
            elif 路径 == "/删路线":
                名 = str(体["文件名"])
                p = self.根 / "路线" / 名
                if "/" in 名 or not 名.endswith(".yml") or not p.exists():
                    raise RuntimeError("文件名不合法")
                p.unlink()
                self._json({"好": True})
            else:
                self._json({"错误": "没这个接口"}, 404)
        except Exception as e:
            self._json({"错误": str(e)}, 409)


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
