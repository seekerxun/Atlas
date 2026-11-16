"""Windows 兼容回归：python3 -m unittest discover -s atlas -p 'test_windows.py'。

中文 Windows 的管道输出默认 GBK，曾让 ✓ ✗ 打印崩溃；钩子曾写死 python3。这里在任何系统上模拟这两件事。
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CLI = Path(__file__).resolve().parent / "atlas.py"


def 造项目(根: Path):
    (根 / "项目.yml").write_text("名称: 测试\n主分组: 模块\n内容类型: [条目]\n", encoding="utf-8")
    (根 / "策划").mkdir()
    (根 / "策划" / "总览.md").write_text("---\n类型: 总览\n状态: 草案\n摘要: 总览\n---\n\n# 总览\n",
                                       encoding="utf-8")


class Windows兼容(unittest.TestCase):
    def setUp(self):
        self.根 = Path(tempfile.mkdtemp())
        造项目(self.根)

    def tearDown(self):
        shutil.rmtree(self.根, ignore_errors=True)

    def test_GBK管道输出不崩(self):
        env = {**os.environ, "PYTHONIOENCODING": "gbk", "PYTHONUTF8": "0"}
        for 参数 in (["检查"], ["检查", "--只看错误"]):
            r = subprocess.run([sys.executable, str(CLI), *参数], cwd=self.根, env=env,
                               capture_output=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
            self.assertNotIn(b"UnicodeEncodeError", r.stderr)
        self.assertIn("✓", r.stdout.decode("utf-8"))

    @unittest.skipUnless(shutil.which("git") and shutil.which("sh"), "需要 git 和 sh")
    def test_钩子能放行干净提交(self):
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
        g = lambda *a: subprocess.run(["git", "-C", str(self.根), *a], env=env,
                                      capture_output=True, timeout=60)
        self.assertEqual(g("init", "-q").returncode, 0)
        r = subprocess.run([sys.executable, str(CLI), "钩子"], cwd=self.根, capture_output=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        钩子 = (self.根 / ".git" / "hooks" / "pre-commit").read_bytes()
        self.assertNotIn(b"\r\n", 钩子)
        self.assertIn(b"PYTHONUTF8=1", 钩子)
        self.assertNotIn(b"\\", 钩子, "路径要用正斜杠，Git for Windows 的 sh 才认")
        g("add", "-A")
        r = g("commit", "-q", "-m", "干净提交")
        self.assertEqual(r.returncode, 0, (r.stdout + r.stderr).decode("utf-8", "replace"))
        # 缺 frontmatter 要挡住
        (self.根 / "策划" / "坏.md").write_text("# 没有 frontmatter\n", encoding="utf-8")
        g("add", "-A")
        r = g("commit", "-q", "-m", "该被挡")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("导航体检没过", (r.stdout + r.stderr).decode("utf-8", "replace"))


if __name__ == "__main__":
    unittest.main()
