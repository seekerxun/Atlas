"""YAML 的一个严格子集，零依赖。

支持：
    键: 值
    键: [a, b]              行内列表
    键: {a: b, c: d}        行内字典
    键:                     嵌套一层
      子键: 值
    键:                     块列表（标量或映射）
      - 值
      - 键: 值
        键2: 值

不支持的写法一律报错，不做宽容处理——宽容是假校验的来源。
frontmatter 另外收紧：strict=True 时禁止块列表。
"""
from __future__ import annotations


class YamlError(Exception):
    pass


def _scalar(s: str):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    if s in ("~", "null", ""):
        return None
    if s in ("true", "True"):
        return True
    if s in ("false", "False"):
        return False
    if s.lstrip("-").isdigit():
        return int(s)
    return s


def _split_top(s: str):
    """按逗号切，但不切进嵌套的 [] {} 里。"""
    out, buf, depth = [], "", 0
    for ch in s:
        if ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        out.append(buf)
    return [x.strip() for x in out if x.strip()]


def _value(raw: str):
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        return [_value(x) for x in _split_top(raw[1:-1])]
    if raw.startswith("{") and raw.endswith("}"):
        d = {}
        for part in _split_top(raw[1:-1]):
            k, sep, v = part.partition(":")
            if not sep:
                raise YamlError(f"行内字典缺冒号: {part}")
            d[k.strip()] = _value(v)
        return d
    if raw.startswith("[") or raw.startswith("{"):
        raise YamlError(f"括号没闭合: {raw}")
    return _scalar(raw)


def _strip_comment(line: str) -> str:
    out, q = "", None
    for ch in line:
        if q:
            out += ch
            if ch == q:
                q = None
            continue
        if ch in "\"'":
            q = ch
            out += ch
            continue
        if ch == "#" and (not out or out[-1] in " \t"):
            break
        out += ch
    return out.rstrip()


def _rows(text: str):
    for i, raw in enumerate(text.split("\n"), 1):
        line = _strip_comment(raw)
        if not line.strip():
            continue
        yield i, len(line) - len(line.lstrip()), line.strip()


def parse(text: str, strict: bool = False):
    rows = list(_rows(text))
    val, pos = _block(rows, 0, 0, strict)
    if pos != len(rows):
        n, _, t = rows[pos]
        raise YamlError(f"第 {n} 行缩进对不上: {t}")
    return val


def _block(rows, pos, indent, strict):
    if pos >= len(rows):
        return None, pos
    _, ind, txt = rows[pos]
    if txt.startswith("- "):
        if strict:
            n = rows[pos][0]
            raise YamlError(f"第 {n} 行用了 `- ` 列表；frontmatter 的列表必须写成行内 [a, b]")
        return _seq(rows, pos, ind, strict)
    return _map(rows, pos, ind, strict)


def _map(rows, pos, indent, strict):
    d = {}
    while pos < len(rows):
        n, ind, txt = rows[pos]
        if ind < indent:
            break
        if ind > indent:
            raise YamlError(f"第 {n} 行缩进多了: {txt}")
        if txt.startswith("- "):
            break
        k, sep, v = txt.partition(":")
        if not sep:
            raise YamlError(f"第 {n} 行不是 `键: 值`: {txt}")
        k, v = k.strip(), v.strip()
        if v:
            d[k] = _value(v)
            pos += 1
            continue
        # 值在下面
        if pos + 1 < len(rows) and rows[pos + 1][1] > indent:
            child, pos = _block(rows, pos + 1, rows[pos + 1][1], strict)
            d[k] = child
        else:
            d[k] = None
            pos += 1
    return d, pos


def _seq(rows, pos, indent, strict):
    out = []
    while pos < len(rows):
        n, ind, txt = rows[pos]
        if ind < indent or not txt.startswith("- "):
            break
        body = txt[2:].strip()
        k, sep, v = body.partition(":")
        if sep and not body.startswith(("[", "{")):
            # 列表项是映射：把首行当成这个映射的第一个键
            item = {}
            item[k.strip()] = _value(v) if v.strip() else None
            childind = ind + 2
            pos += 1
            if v.strip() == "" and pos < len(rows) and rows[pos][1] > childind:
                item[k.strip()], pos = _block(rows, pos, rows[pos][1], strict)
            while pos < len(rows) and rows[pos][1] >= childind and not rows[pos][2].startswith("- "):
                n2, ind2, t2 = rows[pos]
                k2, sep2, v2 = t2.partition(":")
                if not sep2:
                    raise YamlError(f"第 {n2} 行不是 `键: 值`: {t2}")
                if v2.strip():
                    item[k2.strip()] = _value(v2)
                    pos += 1
                elif pos + 1 < len(rows) and rows[pos + 1][1] > ind2:
                    item[k2.strip()], pos = _block(rows, pos + 1, rows[pos + 1][1], strict)
                else:
                    item[k2.strip()] = None
                    pos += 1
            out.append(item)
        else:
            out.append(_value(body))
            pos += 1
    return out, pos


FM_MARK = "---"


def split_frontmatter(text: str):
    """返回 (frontmatter 原文, 正文)。没有 frontmatter 时前者为 None。"""
    if not text.startswith(FM_MARK):
        return None, text
    lines = text.split("\n")
    if lines[0].strip() != FM_MARK:
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == FM_MARK:
            return "\n".join(lines[1:i]), "\n".join(lines[i + 1:])
    return None, text
