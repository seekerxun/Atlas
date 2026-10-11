"""整个项目的已分配磁盘空间；独立后台任务，不参与内容扫描。"""
import json
import os
import stat
import threading
import time
from pathlib import Path


def 已分配空间(根: Path) -> int:
    """按 st_blocks 的 512 字节单位累计，包含目录和链接本身，硬链接去重。"""
    总数, 已见, 待扫 = 0, set(), [根]
    while 待扫:
        p = 待扫.pop()
        try:
            s = p.lstat()
        except FileNotFoundError:
            if p == 根:
                raise
            continue  # 扫描期间删除的文件不再占空间。
        if not hasattr(s, 'st_blocks'):
            raise RuntimeError('当前文件系统不提供实际磁盘占用')
        键 = (s.st_dev, s.st_ino)
        if 键 in 已见:
            continue
        已见.add(键)
        总数 += s.st_blocks * 512
        if stat.S_ISDIR(s.st_mode):
            try:
                with os.scandir(p) as entries:
                    待扫.extend(Path(e.path) for e in entries)
            except FileNotFoundError:
                if p == 根:
                    raise
    return 总数


class 空间缓存:
    有效期 = 300

    def __init__(self, 根: Path):
        self.根 = 根.resolve()
        self.文件 = self.根 / '.atlas' / '磁盘占用.json'
        self.锁 = threading.Lock()
        self.字节 = None
        self.时间 = self.尝试时间 = 0
        self.扫描中 = False
        self.错误 = None
        try:
            d = json.loads(self.文件.read_text(encoding='utf-8'))
            if (d.get('根') == str(self.根) and type(d.get('字节')) is int
                    and d['字节'] >= 0 and type(d.get('时间')) in (int, float)
                    and 0 < d['时间'] <= time.time()):
                self.字节, self.时间 = d['字节'], d['时间']
                self.尝试时间 = self.时间
        except (OSError, ValueError, TypeError, AttributeError):
            pass

    def 状态(self, 更新=False, 强制=False):
        with self.锁:
            过期 = not 0 <= time.time() - self.尝试时间 < self.有效期
            if not self.扫描中 and (强制 or (更新 and 过期)):
                self.扫描中 = True
                self.错误 = None
                self.尝试时间 = time.time()
                threading.Thread(target=self._扫描, daemon=True).start()
            return {'根': str(self.根), '字节': self.字节, '时间': self.时间,
                    '扫描中': self.扫描中, '错误': self.错误}

    def _扫描(self):
        try:
            大小 = 已分配空间(self.根)
            完成 = time.time()
            # 缓存写入失败不影响本次展示与进程内缓存。
            try:
                self.文件.parent.mkdir(exist_ok=True)
                临时 = self.文件.with_suffix('.tmp')
                临时.write_text(json.dumps({'根': str(self.根), '字节': 大小, '时间': 完成}), encoding='utf-8')
                临时.replace(self.文件)
            except OSError:
                pass
            with self.锁:
                self.字节, self.时间 = 大小, 完成
                self.尝试时间 = 完成
        except Exception as e:
            with self.锁:
                self.错误 = f'磁盘占用统计失败：{e}'
        finally:
            with self.锁:
                self.扫描中 = False
