"""项目的运行目标：读项目自己的 .devdock.json，查状态、启动、停止。画布顶栏的运行面板和 `atlas 运行` 共用。

规则照 DevDock（DevDock/Services/ProjectRuntimeController.swift）来，两边看到的状态一致，谁起的服务另一边都能停：
- 状态：定时任务先跑 statusCommand；有端口就看端口上有没有进程在监听；再不然跑 statusCommand；
  都没有就只认本进程自己起的那个。
- 停止：有 stopCommand 就跑它；没有就按端口找监听进程，工作目录全在项目目录里才发 SIGTERM，
  有一个不在就拒绝——端口可能被别的程序占着，宁可停不掉也不误杀；再不然只停本进程自己起的。
- 启动、停止后每 0.25 秒查一次，6 秒内没到位就报错。启动没到位时把刚起的进程收掉。

配置只读不写；改目标还是在 DevDock 里或手改 .devdock.json。命令只从配置里取，接口只收目标名。
"""
from __future__ import annotations
import json, os, signal, subprocess, time
from pathlib import Path

DevDock = ".devdock.json"
_自起: dict[tuple[str, str], subprocess.Popen] = {}


def 读目标(根: Path) -> list[dict]:
    p = 根 / DevDock
    if not p.is_file():
        return []
    try:
        配置 = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"{DevDock} 读不了：{e}")
    return [t for t in 配置.get("targets") or [] if isinstance(t, dict) and t.get("name")]


def 找(根: Path, 名: str) -> dict:
    for t in 读目标(根):
        if t["name"] == 名:
            return t
    raise RuntimeError(f"{DevDock} 里没有「{名}」")


def _展开(值, 根: Path) -> str:
    if '{uid}' in str(值) and not hasattr(os, 'getuid'):
        raise RuntimeError('当前平台没有 Unix uid，请修改此运行目标中的 {uid} 占位符。')
    return (str(值).replace("{projectDirectory}", str(根)).replace("{home}", str(Path.home()))
            .replace("{uid}", str(os.getuid()) if hasattr(os, 'getuid') else ""))


def _准备(命令: dict, 根: Path):
    """返回 (argv, 工作目录, 环境)。工作目录相对项目目录，空就是项目目录。"""
    argv = [_展开(命令.get("executable") or "", 根)] + [_展开(a, 根) for a in 命令.get("arguments") or []]
    目录 = _展开(命令.get("workingDirectory") or "", 根)
    目录 = Path(目录) if Path(目录).is_absolute() else 根 / 目录
    环境 = {**os.environ, **{k: _展开(v, 根) for k, v in (命令.get("environment") or {}).items()}}
    return argv, 目录, 环境


def _跑完(命令: dict, 根: Path, 超时=30) -> tuple[int, str]:
    argv, 目录, 环境 = _准备(命令, 根)
    try:
        r = subprocess.run(argv, cwd=目录, env=环境, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=超时)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, str(e)
    return r.returncode, r.stdout.decode("utf-8", "replace").strip()


def _lsof(*参数) -> tuple[int, str]:
    if not Path('/usr/sbin/lsof').is_file():
        raise RuntimeError('此运行目标需要 lsof 检查进程归属；当前平台尚未适配，请在外部工具中管理该服务。')
    # 不设 UTF-8 时 lsof 会把中文路径转义掉，工作目录就对不上了。
    r = subprocess.run(["/usr/sbin/lsof", *参数], stdin=subprocess.DEVNULL, capture_output=True,
                       env={**os.environ, "LC_ALL": "en_US.UTF-8"})
    return r.returncode, r.stdout.decode("utf-8", "replace")


def 监听进程(端口: int) -> list[int]:
    码, 出 = _lsof("-nP", "-t", f"-iTCP:{端口}", "-sTCP:LISTEN")
    return [int(x) for x in 出.split()] if 码 == 0 else []


def _在项目里(pid: int, 根: Path) -> bool:
    码, 出 = _lsof("-a", "-p", str(pid), "-d", "cwd", "-Fn")
    if 码 != 0:
        return False
    根 = 根.resolve()
    return any(Path(行[1:]).resolve().is_relative_to(根) for 行 in 出.splitlines() if 行.startswith("n"))


def _键(根: Path, t: dict):
    return (str(根.resolve()), t["name"])


def 在运行(t: dict, 根: Path) -> bool:
    if t.get("kind") == "scheduledTask" and t.get("statusCommand"):
        return _跑完(t["statusCommand"], 根)[0] == 0
    if isinstance(t.get("port"), int):
        return bool(监听进程(t["port"]))
    if t.get("statusCommand"):
        return _跑完(t["statusCommand"], 根)[0] == 0
    p = _自起.get(_键(根, t))
    return bool(p and p.poll() is None)


def _等(t: dict, 根: Path, 期望: bool) -> bool:
    for _ in range(24):
        if 在运行(t, 根) == 期望:
            return True
        time.sleep(0.25)
    return False


def 日志(根: Path, 名: str) -> Path:
    return 根 / ".atlas" / "运行" / (名.replace("/", "_").replace("\\", "_") + ".log")


def 启动(根: Path, 名: str):
    t = 找(根, 名)
    if not t.get("startCommand"):
        raise RuntimeError(f"「{名}」没写启动命令（startCommand）")
    if 在运行(t, 根):
        return
    argv, 目录, 环境 = _准备(t["startCommand"], 根)
    记 = 日志(根, 名)
    记.parent.mkdir(parents=True, exist_ok=True)
    # 单独成会话：Atlas 自己的服务停了，项目服务照跑，和 DevDock 起的一样。
    with 记.open("ab") as f:
        f.write(f"\n==== {time.strftime('%Y-%m-%d %H:%M:%S')} 启动 {' '.join(argv)}\n".encode())
        f.flush()
        try:
            p = subprocess.Popen(argv, cwd=目录, env=环境, stdin=subprocess.DEVNULL, stdout=f, stderr=f,
                                 start_new_session=True)
        except OSError as e:
            raise RuntimeError(f"「{名}」起不来：{e}")
    _自起[_键(根, t)] = p
    time.sleep(0.25)
    if p.poll() not in (None, 0):
        _自起.pop(_键(根, t), None)
        raise RuntimeError(f"「{名}」启动就退出了（退出状态 {p.returncode}），看 {记.relative_to(根)}")
    if not _等(t, 根, True):
        if p.poll() is None:
            p.terminate()
        _自起.pop(_键(根, t), None)
        raise RuntimeError(f"「{名}」6 秒内没有起来，看 {记.relative_to(根)}")


def 停止(根: Path, 名: str):
    t = 找(根, 名)
    键 = _键(根, t)
    if t.get("stopCommand"):
        码, 出 = _跑完(t["stopCommand"], 根)
        if 码 != 0 and 在运行(t, 根):
            raise RuntimeError(f"「{名}」停止命令失败：{出 or f'退出状态 {码}'}")
    elif isinstance(t.get("port"), int):
        pids = 监听进程(t["port"])
        if not all(_在项目里(pid, 根) for pid in pids):
            raise RuntimeError(f"「{名}」的端口 {t['port']} 由其他目录中的进程占用，已拒绝停止")
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    elif (p := _自起.get(键)) and p.poll() is None:
        p.terminate()
    else:
        raise RuntimeError(f"「{名}」没有停止命令，也没有端口，停不了不是这里起的进程")
    if not _等(t, 根, False):
        raise RuntimeError(f"「{名}」6 秒内没有停下")
    _自起.pop(键, None)


def 状态(根: Path, 本端口: int | None = None) -> list[dict]:
    """本端口：画布服务自己的端口。对应的目标就是当前页面，不给停，停了页面就断了。"""
    列表 = []
    for t in 读目标(根):
        端口 = t.get("port") if isinstance(t.get("port"), int) else None
        本页 = 本端口 is not None and 端口 == 本端口
        有法停 = bool(t.get("stopCommand") or 端口)
        列表.append({
            "名称": t["name"], "说明": str(t.get("detail") or ""), "类型": str(t.get("kind") or ""),
            "端口": 端口, "网址": str(t.get("url") or ""), "运行中": 本页 or 在运行(t, 根),
            "可启动": bool(t.get("startCommand")), "可停止": not 本页 and (有法停 or _键(根, t) in _自起),
            "本页": 本页,
        })
    return 列表
