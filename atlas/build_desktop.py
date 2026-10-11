"""在目标操作系统构建：python atlas/build_desktop.py --dist <产物目录>。"""
import argparse
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description='打包 Atlas（需要 PyInstaller 6.22.0）')
    parser.add_argument('--dist', type=Path, default=root / '产出' / '桌面版')
    parser.add_argument('--work', type=Path, default=root / '.atlas' / 'desktop-build')
    args = parser.parse_args()
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
               '--name', 'Atlas', '--paths', str(root / 'atlas'), '--hidden-import', 'atlas',
               '--distpath', str(args.dist.resolve()), '--workpath', str(work / 'build'),
               '--specpath', str(work), '--exclude-module', 'tkinter', '--exclude-module', 'unittest']
    if sys.platform == 'darwin' or sys.platform == 'win32':
        command += ['--windowed']
    if sys.platform == 'darwin':
        command += ['--osx-bundle-identifier', 'local.atlas.desktop']
    # 白名单：不带私人注册表、.devdock.json、.atlas、Git、产出和受管理项目。
    for directory in ('视图', '模板'):
        for file in sorted((root / directory).rglob('*')):
            if file.is_file() and not any(part.startswith('.') for part in file.relative_to(root).parts):
                command += ['--add-data', f'{file}:{file.parent.relative_to(root).as_posix()}']
    command += ['--add-data', f'{root / "规范" / "词表.yml"}:规范', str(root / 'atlas' / 'desktop.py')]
    subprocess.run(command, cwd=root, check=True)


if __name__ == '__main__':
    main()
