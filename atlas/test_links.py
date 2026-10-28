"""正文 markdown 链接与 所属 归属回归：python3 -m unittest discover -s atlas -p 'test_links.py'。"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import rename
from lint import 校验
from scan import 建索引, 抽正文链接


def 写(根: Path, rel: str, 文本: str):
    p = 根 / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(文本, encoding="utf-8")


def 文档(类型="机制", 正文="", 关联=""):
    return f"---\n类型: {类型}\n状态: 草案\n摘要: 测试\n{关联}---\n\n# 标题\n\n{正文}\n"


def 码(根: Path, 严格=False) -> set[tuple[str, str]]:
    return {(f.码, f.位置) for f in 校验(建索引(根), 严格=严格)}


class 抽取Tests(unittest.TestCase):
    def test_resolves_relative_to_the_document(self):
        正文 = ("见 [甲](../机制/甲.md#规则)、[乙](乙)、[丙](%E4%B8%99.md)、[丁](<带 空格.md>)\n"
              "[外](https://x.com/a.md) [邮](mailto:a@b) [本篇](#标题) [根](/abs.md)")
        出 = [目标 for _, _, 目标 in 抽正文链接(正文, "策划/流程/本篇.md")]
        self.assertEqual(出, ["策划/机制/甲.md", "策划/流程/乙", "策划/流程/丙.md", "策划/流程/带 空格.md"])

    def test_skips_code_and_counts_lines_after_frontmatter(self):
        正文 = "`[例](不算.md)`\n```\n[例](也不算.md)\n```\n[真](真.md)"
        self.assertEqual(抽正文链接(正文, "a.md", 偏移=5), [[10, "真.md", "真.md"]])

    def test_link_text_with_inline_code_still_counts(self):
        出 = 抽正文链接("[`配置`](配置.md)", "策划/a.md")
        self.assertEqual([目标 for _, _, 目标 in 出], ["策划/配置.md"])


class 孤儿与断链Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.根 = Path(self.tmp.name)
        写(self.根, "项目.yml", "名称: 测试\n主分组: 模块\n内容类型: [条目]\n")
        写(self.根, "策划/总览.md", 文档("总览"))

    def tearDown(self):
        self.tmp.cleanup()

    def test_markdown_link_is_a_reference(self):
        写(self.根, "策划/机制/被链.md", 文档())
        写(self.根, "策划/机制/省后缀.md", 文档())
        写(self.根, "策划/流程/链接方.md", 文档("流程", "见 [被链](../机制/被链.md) 和 [省](../机制/省后缀)",
                                            "关联:\n  所属: [总览]\n"))
        idx = 建索引(self.根)
        self.assertEqual(idx.条目["策划/机制/被链.md"].被引用, ["策划/流程/链接方.md"])
        结果 = 码(self.根)
        self.assertNotIn(("W01", "策划/机制/被链.md"), 结果)
        self.assertNotIn(("W01", "策划/机制/省后缀.md"), 结果)

    def test_link_from_skeleton_without_frontmatter_counts(self):
        写(self.根, "策划/机制/甲.md", 文档())
        写(self.根, "AGENTS.md", "# 协议\n\n先读 [甲](策划/机制/甲.md)\n")
        self.assertNotIn(("W01", "策划/机制/甲.md"), 码(self.根))

    def test_child_declaring_belongs_to_is_not_orphan(self):
        写(self.根, "策划/流程/上级.md", 文档("流程", 关联="关联:\n  所属: [总览]\n"))
        写(self.根, "策划/流程/下级.md", 文档("流程", 关联="关联:\n  所属: [上级]\n"))
        写(self.根, "策划/流程/只涉及.md", 文档("流程", 关联="关联:\n  涉及: [上级]\n"))
        写(self.根, "策划/流程/所属落空.md", 文档("流程", 关联="关联:\n  所属: [不存在]\n"))
        结果 = 码(self.根)
        self.assertNotIn(("W01", "策划/流程/上级.md"), 结果)      # 下级的 所属 指向它
        self.assertNotIn(("W01", "策划/流程/下级.md"), 结果)      # 自己声明了 所属
        self.assertIn(("W01", "策划/流程/只涉及.md"), 结果)       # 涉及 不算归属
        self.assertIn(("W01", "策划/流程/所属落空.md"), 结果)     # 所属 指向不存在的条目不算
        self.assertIn(("E04", "策划/流程/所属落空.md"), 结果)

    def test_true_orphan_still_reported(self):
        写(self.根, "策划/机制/没人管.md", 文档())
        self.assertIn(("W01", "策划/机制/没人管.md"), 码(self.根))

    def test_broken_link_is_E06_with_line(self):
        写(self.根, "策划/机制/甲.md", 文档(正文="[好](甲.md)\n[坏](没有这篇.md)\n[图](图/缺.png)",
                                         关联="关联:\n  所属: [总览]\n"))
        结果 = 码(self.根)
        # frontmatter 7 行（含 关联 两行）+ 空行 + 标题 + 空行，正文第 2、3 行是全文第 12、13 行
        self.assertIn(("E06", "策划/机制/甲.md:12"), 结果)
        self.assertIn(("E06", "策划/机制/甲.md:13"), 结果)
        self.assertNotIn(("E06", "策划/机制/甲.md:11"), 结果)

    @unittest.skipUnless(shutil.which("git"), "没装 git")
    def test_link_to_git_ignored_file_is_W14_unless_strict(self):
        写(self.根, ".gitignore", "成片/\n")
        写(self.根, "策划/机制/甲.md", 文档(正文="[片](../../成片/第一期.mp4)", 关联="关联:\n  所属: [总览]\n"))
        subprocess.run(["git", "-C", str(self.根), "init", "-q"], check=True, capture_output=True)
        self.assertIn(("W14", "策划/机制/甲.md:11"), 码(self.根))
        self.assertIn(("E06", "策划/机制/甲.md:11"), 码(self.根, 严格=True))


class 改名Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.根 = Path(self.tmp.name)
        写(self.根, "项目.yml", "名称: 测试\n主分组: 模块\n内容类型: [条目]\n")

    def tearDown(self):
        self.tmp.cleanup()

    def 组(self, 面, 类):
        return [h.位置 for g in 面.组们 if g.类 == 类 for h in g.处们]

    def test_entry_rename_lists_markdown_links(self):
        写(self.根, "策划/机制/旧名.md", 文档())
        写(self.根, "策划/流程/甲.md", 文档("流程", "[旧](../机制/旧名.md#一节)"))
        写(self.根, "策划/机制/乙.md", 文档(正文="[旧](旧名)\n[别的](乙.md)"))
        写(self.根, "AGENTS.md", "[旧](策划/机制/旧名.md)\n")
        面 = rename.算(建索引(self.根), "条目", "旧名", "新名")
        self.assertEqual(sorted(self.组(面, "正文 [文字](路径) 链接")),
                         ["AGENTS.md:1", "策划/机制/乙.md:9", "策划/流程/甲.md:9"])

    def test_type_rename_lists_links_through_renamed_directory(self):
        写(self.根, "内容/条目/甲.md", 文档("条目", "[同目录](乙.md)"))
        写(self.根, "内容/条目/乙.md", 文档("条目"))
        写(self.根, "策划/总览.md", 文档("总览", "[甲](../内容/条目/甲.md)"))
        面 = rename.算(建索引(self.根), "类型", "条目", "词条")
        self.assertEqual(self.组(面, "正文 [文字](路径) 里的目录名"), ["策划/总览.md:9"])


if __name__ == "__main__":
    unittest.main()
