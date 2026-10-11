"""Chrome 桌面入口；开发时仅需标准库，发布包内置 Python，不内置浏览器。"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import traceback


def state_directory() -> Path:
    if os.environ.get('ATLAS_STATE_DIR'):
        return Path(os.environ['ATLAS_STATE_DIR']).expanduser().resolve()
    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Atlas'
    if os.name == 'nt':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Atlas'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share')) / 'Atlas'


def find_chrome() -> Path:
    explicit = os.environ.get('ATLAS_CHROME')
    if explicit:
        p = Path(explicit).expanduser()
        if not p.is_file():
            raise RuntimeError('ATLAS_CHROME 指定的 Google Chrome 可执行文件不存在。')
        return p
    candidates = []
    if sys.platform == 'darwin':
        candidates = [base / 'Google Chrome.app/Contents/MacOS/Google Chrome'
                      for base in (Path('/Applications'), Path.home() / 'Applications')]
    elif os.name == 'nt':
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
                try:
                    with winreg.OpenKey(hive, r'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
                                        0, winreg.KEY_READ | view) as key:
                        candidates.append(Path(winreg.QueryValue(key, None).strip('"')))
                except OSError:
                    pass
        candidates += [Path(os.environ[k]) / 'Google/Chrome/Application/chrome.exe'
                       for k in ('LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)') if os.environ.get(k)]
    else:
        candidates = [Path(p) for name in ('google-chrome', 'google-chrome-stable')
                      if (p := shutil.which(name))]
    for p in candidates:
        if p.is_file():
            return p
    raise RuntimeError('未找到 Google Chrome。请先安装 Chrome，或用 ATLAS_CHROME 指定其可执行文件。不会回退到 Safari 或 Edge。')


@contextmanager
def single_instance(state: Path):
    with (state / 'desktop.lock').open('a+b') as lock:
        lock.seek(0)
        lock.write(b'0')
        lock.flush()
        lock.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            raise RuntimeError('Atlas 已在运行，请使用已打开的 Chrome 窗口。') from e
        yield


class ServerManager:
    def __init__(self):
        self.servers = {}
        self.lock = threading.RLock()

    def start(self, root: Path, name: str = '') -> str:
        import projects
        import serve
        root = root.resolve()
        if not projects.是项目(root):
            raise RuntimeError(f'不是 Atlas 项目：{root}（缺少 项目.yml）')
        with self.lock:
            port = projects.确保画布端口(root, name)
            url = f'http://127.0.0.1:{port}/'
            if root in self.servers:
                return url
            if projects.端口在用(port):
                identity = projects.端口上的项目(port)
                if identity and Path(identity).resolve() == root:
                    projects.登记(root, name)
                    return url  # 外部服务不归当前宿主关闭。
                raise RuntimeError(f'端口 {port} 已被其他服务占用，请检查该项目的 .devdock.json。')

            class DesktopHandler(serve.处理器):
                def parse_request(self):
                    if not super().parse_request():
                        return False
                    origin = self.headers.get('Origin')
                    if (self.headers.get('Host') != f'127.0.0.1:{self.端口}'
                            or (origin is not None and origin != f'http://127.0.0.1:{self.端口}')):
                        self.send_error(403, 'Local same-origin requests only')
                        return False
                    return True

            server = serve.创建服务(root, port, DesktopHandler)
            try:
                projects.登记(root, name or projects.项目信息(root)['名称'])
            except Exception:
                server.server_close()
                raise
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.servers[root] = (server, thread)
            return url

    def close(self):
        for server, thread in self.servers.values():
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        self.servers.clear()


def main():
    state = state_directory()
    state.mkdir(parents=True, exist_ok=True)
    os.environ['ATLAS_STATE_DIR'] = str(state)
    # Windows --windowed 启动时 stdout/stderr 为 None。
    if sys.stdout is None:
        sys.stdout = (state / 'desktop.log').open('a', encoding='utf-8', buffering=1)
    if sys.stderr is None:
        sys.stderr = sys.stdout
    if len(sys.argv) > 1 and sys.argv[1] == '--cli':
        del sys.argv[1]
        if getattr(sys, 'frozen', False) and len(sys.argv) > 1 and sys.argv[1] in ('hook', '钩子'):
            raise RuntimeError('冻结版暂不生成 Git 钩子，请使用源码 atlas.py hook。')
        import atlas
        atlas.main()
        return
    parser = argparse.ArgumentParser(description='Atlas · 本机 Google Chrome 桌面版')
    parser.add_argument('--project', type=Path, help='现有项目目录；省略时打开上次项目或创建入门项目')
    parser.add_argument('--diagnose', action='store_true', help='打印资源与 Chrome 路径，不启动界面')
    parser.add_argument('--no-browser', action='store_true', help='只启动服务，用于验收；Ctrl+C 退出')
    args = parser.parse_args()
    from model import ATLAS
    import projects
    if args.diagnose:
        print(json.dumps({'resources': str(ATLAS), 'state': str(state), 'chrome': str(find_chrome()),
                          'frozen': bool(getattr(sys, 'frozen', False)),
                          'templates': projects.模板们(),
                          'ui_exists': (ATLAS / '视图' / '画布.html').is_file()}, ensure_ascii=False, indent=2))
        return
    chrome = None if args.no_browser else find_chrome()
    with single_instance(state):
        last = state / 'last-project.txt'
        root = args.project
        if root is None and last.exists():
            candidate = Path(last.read_text(encoding='utf-8'))
            if projects.是项目(candidate):
                root = candidate
        if root is None:
            root = state / '我的项目'
            if not projects.是项目(root):
                projects.新建项目('通用项目', root, '我的项目')
        root = root.expanduser().resolve()
        manager = ServerManager()
        projects.画布启动器 = manager.start
        process = None
        try:
            url = manager.start(root)
            last.write_text(str(root), encoding='utf-8')
            print(url, flush=True)
            if args.no_browser:
                threading.Event().wait()
            else:
                # 独立持久 profile：不借用用户日常浏览器进程，主题/搜索设置可持久化。
                with (state / 'chrome.log').open('ab') as log:
                    process = subprocess.Popen([str(chrome), f'--app={url}',
                                                f'--user-data-dir={state / "ChromeProfile"}',
                                                '--no-first-run', '--no-default-browser-check',
                                                '--disable-background-mode'],
                                               stdout=log, stderr=log)
                    code = process.wait()
                    if code:
                        raise RuntimeError(f'Chrome 退出码 {code}，请查看 {state / "chrome.log"}')
        except KeyboardInterrupt:
            pass
        finally:
            projects.画布启动器 = None
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            manager.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        state = state_directory()
        state.mkdir(parents=True, exist_ok=True)
        with (state / 'desktop.log').open('a', encoding='utf-8') as log:
            traceback.print_exc(file=log)
        message = f'{error}\n\n日志：{state / "desktop.log"}'
        if sys.platform == 'darwin':
            subprocess.run(['osascript', '-e', 'on run argv', '-e',
                            'display alert "Atlas" message (item 1 of argv)', '-e', 'end run', message])
        elif os.name == 'nt':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, 'Atlas', 0x10)
        else:
            print(message, file=sys.stderr)
        sys.exit(1)
