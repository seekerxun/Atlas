"""代码目录回归：python3 -m unittest discover -s atlas -p 'test_code_dirs.py'。

代码目录里的 .cjs、测试快照不报未归类；代码目录可以写单个根目录文件。
"""
import shutil
import tempfile
import unittest
from pathlib import Path

from lint import 校验
from scan import 建索引


class 代码目录(unittest.TestCase):
    def setUp(self):
        self.根 = Path(tempfile.mkdtemp())
        (self.根 / "项目.yml").write_text(
            "名称: 测试\n主分组: 模块\n内容类型: [条目]\n代码目录: [src, tests, index.html, 打开.command]\n",
            encoding="utf-8")
        (self.根 / "策划").mkdir()
        (self.根 / "策划" / "总览.md").write_text("---\n类型: 总览\n状态: 草案\n摘要: 总览\n---\n\n# 总览\n",
                                           encoding="utf-8")
        for p in ("src/main.cjs", "tests/a.test.cjs", "tests/snap.bin", "index.html", "打开.command",
                  "散落.cjs", "游离.command"):
            f = self.根 / p
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("x\n", encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.根, ignore_errors=True)

    def test_cjs与command是工具(self):
        idx = 建索引(self.根)
        for p in ("src/main.cjs", "散落.cjs", "游离.command", "打开.command"):
            self.assertIn(p, idx.工具)

    def test_代码目录不报未归类和放错位置(self):
        idx = 建索引(self.根)
        self.assertNotIn("tests/snap.bin", idx.未归类)
        位置 = {(f.码, f.位置) for f in 校验(idx)}
        for p in ("src/main.cjs", "tests/a.test.cjs", "index.html", "打开.command"):
            self.assertNotIn(("W02", p), 位置)
            self.assertNotIn(("W04", p), 位置)
        # 不在代码目录里的照样报
        self.assertIn(("W04", "散落.cjs"), 位置)
        self.assertIn(("W02", "游离.command"), 位置)


class 忽略路径(unittest.TestCase):
    def test_相对路径只忽略那一处(self):
        根 = Path(tempfile.mkdtemp())
        try:
            (根 / "项目.yml").write_text("名称: 测试\n主分组: 模块\n内容类型: [条目]\n忽略: [docs/history, 草稿]\n",
                                      encoding="utf-8")
            for p in ("docs/history/a.md", "docs/v1/history/b.md", "docs/c.md", "x/草稿/d.md"):
                f = 根 / p
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text("# 无 frontmatter\n", encoding="utf-8")
            idx = 建索引(根)
            self.assertNotIn("docs/history/a.md", idx.条目)
            self.assertIn("docs/v1/history/b.md", idx.条目)     # 同名但路径不同，不跳过
            self.assertIn("docs/c.md", idx.条目)
            self.assertNotIn("x/草稿/d.md", idx.条目)            # 目录名照旧任意层跳过
        finally:
            shutil.rmtree(根, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
