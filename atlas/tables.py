"""读数据表给画布预览：CSV / TSV 用 csv 模块，xlsx / xlsm 直接拆 zip 里的 XML，不依赖第三方库。
旧版二进制 .xls 读不了，只给卡片不给预览。"""
from __future__ import annotations
import csv, io, re, zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

表格后缀 = {".csv", ".tsv", ".xlsx", ".xlsm", ".xls"}
可预览后缀 = {".csv", ".tsv", ".xlsx", ".xlsm"}
最多行 = 2000
最多列 = 100
最大字节 = 20 * 1024 * 1024

_主 = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_关系 = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_包关系 = "{http://schemas.openxmlformats.org/package/2006/relationships}"
# Excel 内置的日期时间格式编号
_日期格式号 = set(range(14, 23)) | {45, 46, 47}


def 读表(p: Path) -> dict:
    后缀 = p.suffix.lower()
    if 后缀 not in 可预览后缀:
        raise ValueError("旧版 .xls 不能在这里预览，请用 Excel 打开，或另存为 .xlsx")
    if p.stat().st_size > 最大字节:
        raise ValueError("表格超过 20 MB，请在 Excel 中查看")
    表们 = _读xlsx(p) if 后缀 in {".xlsx", ".xlsm"} else [_读分隔(p, "\t" if 后缀 == ".tsv" else ",")]
    return {"表": 表们, "最多行": 最多行, "最多列": 最多列}


def _裁(名称: str, 行们: list[list[str]], 总行: int | None = None) -> dict:
    """去掉尾部空行、空列，再按上限截断。"""
    while 行们 and not any(行们[-1]):
        行们.pop()
    宽 = max((max((i + 1 for i, v in enumerate(r) if v), default=0) for r in 行们), default=0)
    总列 = 宽
    宽 = min(宽, 最多列)
    行们 = [(r[:宽] + [""] * (宽 - len(r))) for r in 行们[:最多行]]
    总行 = len(行们) if 总行 is None else 总行
    return {"名称": 名称, "行": 行们, "总行": 总行, "总列": 总列,
            "截断": 总行 > len(行们) or 总列 > 宽}


def _读分隔(p: Path, 分隔: str) -> dict:
    原 = p.read_bytes()
    for 编码 in ("utf-8-sig", "gb18030"):    # Excel 在中文系统导出的 CSV 常是 GBK
        try:
            文本 = 原.decode(编码)
            break
        except UnicodeDecodeError:
            continue
    else:
        文本 = 原.decode("utf-8", errors="replace")
    行们, 总行 = [], 0
    for r in csv.reader(io.StringIO(文本, newline=""), delimiter=分隔):
        总行 += 1
        if len(行们) < 最多行:
            行们.append(r)
    while 总行 and 行们 and not any(行们[-1]):
        行们.pop(); 总行 -= 1
    return _裁(p.name, 行们, 总行)


def _列号(引用: str) -> int:
    n = 0
    for ch in 引用:
        if not ch.isalpha():
            break
        n = n * 26 + ord(ch.upper()) - 64
    return n - 1


def _是日期格式(码: str) -> bool:
    码 = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', "", 码).lower()
    return bool(re.search(r"[ymdhs]", 码)) and "general" not in 码


def _数字文本(v: str, 日期: bool) -> str:
    try:
        x = float(v)
    except ValueError:
        return v
    if 日期:
        t = datetime(1899, 12, 30) + timedelta(days=x)
        if x < 1:
            return t.strftime("%H:%M:%S")
        return t.strftime("%Y-%m-%d") if t.time() == datetime.min.time() else t.strftime("%Y-%m-%d %H:%M")
    return f"{x:.15g}"


def _读xlsx(p: Path) -> list[dict]:
    try:
        z = zipfile.ZipFile(p)
    except zipfile.BadZipFile:
        raise ValueError("这个 Excel 文件已损坏或不是 xlsx 格式")
    with z:
        名单 = set(z.namelist())
        共享: list[str] = []
        if "xl/sharedStrings.xml" in 名单:
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(_主 + "si"):
                # 只取 si/t 和 si/r/t，跳过 rPh 里的注音
                共享.append("".join(t.text or "" for t in
                                    si.findall(_主 + "t") + si.findall(f"{_主}r/{_主}t")))
        日期样式: set[int] = set()
        if "xl/styles.xml" in 名单:
            st = ET.fromstring(z.read("xl/styles.xml"))
            自定 = {int(f.get("numFmtId")): f.get("formatCode", "")
                    for f in st.iter(_主 + "numFmt")}
            xfs = st.find(_主 + "cellXfs")
            for i, xf in enumerate(xfs if xfs is not None else []):
                号 = int(xf.get("numFmtId", 0))
                if 号 in _日期格式号 or (号 in 自定 and _是日期格式(自定[号])):
                    日期样式.add(i)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        目标 = {r.get("Id"): r.get("Target", "") for r in rels.iter(_包关系 + "Relationship")}
        出 = []
        for sh in wb.iter(_主 + "sheet"):
            t = 目标.get(sh.get(_关系 + "id"), "")
            路径 = t.lstrip("/") if t.startswith("/") else "xl/" + t
            if 路径 not in 名单:
                continue
            出.append(_读工作表(z.read(路径), sh.get("name", ""), 共享, 日期样式))
        return 出 or [{"名称": "", "行": [], "总行": 0, "总列": 0, "截断": False}]


def _读工作表(xml: bytes, 名称: str, 共享: list[str], 日期样式: set[int]) -> dict:
    行们: list[list[str]] = []
    总行 = 0
    for _, el in ET.iterparse(io.BytesIO(xml)):
        if el.tag != _主 + "row":
            continue
        号 = int(el.get("r", 总行 + 1))
        总行 = max(总行, 号)
        if 号 <= 最多行:
            while len(行们) < 号 - 1:
                行们.append([])
            r: list[str] = []
            for c in el.iter(_主 + "c"):
                列 = _列号(c.get("r", "")) if c.get("r") else len(r)
                if 列 >= 最多列 * 2:
                    continue
                类 = c.get("t", "n")
                v = c.find(_主 + "v")
                值 = v.text if v is not None and v.text is not None else ""
                if 类 == "s" and 值:
                    值 = 共享[int(值)] if int(值) < len(共享) else ""
                elif 类 == "inlineStr":
                    值 = "".join(t.text or "" for t in c.iter(_主 + "t"))
                elif 类 == "b":
                    值 = "TRUE" if 值 == "1" else "FALSE"
                elif 类 == "n" and 值:
                    值 = _数字文本(值, int(c.get("s", 0)) in 日期样式)
                while len(r) < 列:
                    r.append("")
                r.append(值)
            行们.append(r)
        el.clear()
    return _裁(名称, 行们, 总行)
