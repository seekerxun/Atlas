"""磁盘占用回归：python3 -m unittest discover -s atlas -p 'test_disk_usage.py'。"""
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from disk_usage import 已分配空间, 空间缓存
from serve import 系统打开


class DiskUsageTests(unittest.TestCase):
    def wait_done(self, cache):
        deadline = time.monotonic() + 3
        while cache.状态()['扫描中']:
            self.assertLess(time.monotonic(), deadline)
            time.sleep(.005)
        return cache.状态()

    def test_allocated_blocks_hidden_sparse_hardlinks_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            root = Path(folder)
            hidden = root / '.git'
            hidden.mkdir()
            data = hidden / 'data'
            data.write_bytes(b'a' * 8192)
            sparse = root / 'sparse'
            with sparse.open('wb') as stream:
                stream.truncate(100 * 1024 ** 2)
            os.link(data, root / 'hardlink')
            external = Path(outside) / 'large'
            external.write_bytes(b'b' * 65536)
            link = root / 'outside'
            link.symlink_to(outside, target_is_directory=True)
            loop = root / 'loop'
            loop.symlink_to(root, target_is_directory=True)
            expected = sum(p.lstat().st_blocks * 512 for p in (root, hidden, data, sparse, link, loop))
            self.assertEqual(已分配空间(root), expected)
            self.assertLess(expected, sparse.stat().st_size)

    def test_background_dedup_ttl_force_persistence_and_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            now = [1000.0]
            entered, release = threading.Event(), threading.Event()
            def scan(root):
                entered.set()
                self.assertTrue(release.wait(2))
                return 123456
            with patch('disk_usage.time.time', side_effect=lambda: now[0]), patch('disk_usage.已分配空间', side_effect=scan) as scanner:
                cache = 空间缓存(Path(folder))
                self.assertIsNone(cache.状态()['字节'])
                self.assertEqual(scanner.call_count, 0)  # 普通查询即使过期也不能启动扫描。
                self.assertTrue(cache.状态(更新=True)['扫描中'])
                self.assertTrue(entered.wait(1))
                cache.状态(强制=True)
                self.assertEqual(scanner.call_count, 1)  # 同时请求共用一个后台任务。
                release.set()
                self.assertEqual(self.wait_done(cache)['字节'], 123456)
                restored = 空间缓存(Path(folder))
                self.assertEqual(restored.状态(更新=True)['字节'], 123456)
                self.assertEqual(scanner.call_count, 1)
                now[0] += 299
                cache.状态(更新=True)
                self.assertEqual(scanner.call_count, 1)
                cache.状态(强制=True)
                self.wait_done(cache)
                self.assertEqual(scanner.call_count, 2)
                now[0] += 300
                cache.状态()
                self.assertEqual(scanner.call_count, 2)
                cache.状态(更新=True)
                self.wait_done(cache)
                self.assertEqual(scanner.call_count, 3)
                scanner.side_effect = PermissionError('unreadable')
                cache.状态(强制=True)
                result = self.wait_done(cache)
                self.assertEqual(result['字节'], 123456)
                self.assertIn('unreadable', result['错误'])
                cache.状态(更新=True)
                self.assertEqual(scanner.call_count, 4)

    def test_reveal_project_root_and_reject_outside(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            with patch('serve.sys.platform', 'darwin'), patch('serve.subprocess.Popen') as launch:
                系统打开(root, '.', True)
                self.assertEqual(launch.call_args.args[0], ['open', '-R', str(root)])
                with self.assertRaises(RuntimeError):
                    系统打开(root, '..', True)
                self.assertEqual(launch.call_count, 1)


if __name__ == '__main__':
    unittest.main()
