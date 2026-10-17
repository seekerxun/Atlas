"""计划表与待定汇总回归：python3 -m unittest discover -s atlas -p 'test_plan.py'。"""
import datetime as dt
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

import edit
import miniyaml as y
from lint import 校验
from scan import 建索引, 载入计划

CLI = Path(__file__).resolve().parent / "atlas.py"
今天 = dt.date(2026, 10, 18)


def 造项目(根: Path, 计划: str | None = None):
    (根 / "项目.yml").write_text("名称: 测试\n主分组: 模块\n内容类型: [条目]\n", encoding="utf-8")
    (根 / "策划").mkdir()
    (根 / "策划" / "总览.md").write_text("---\n类型: 总览\n状态: 草案\n摘要: 总览\n---\n\n# 总览\n",
                                       encoding="utf-8")
    if 计划 is not None:
        (根 / "计划.yml").write_text(计划, encoding="utf-8")


def 码(根: Path) -> list[tuple[str, str]]:
    return [(f.码, f.位置) for f in 校验(建索引(根), 今天=今天) if "计划" in f.位置]


def 项(id, status, updated="2026-10-18", touches="[]", outputs="[]"):
    return (f"  - id: {id}\n    title: 标题{id}\n    status: {status}\n    touches: {touches}\n"
            f"    outputs: {outputs}\n    updated: {updated}\n")


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.根 = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_plan_file_means_feature_off(self):
        造项目(self.根)
        idx = 建索引(self.根)
        self.assertFalse(idx.有计划)
        self.assertEqual(码(self.根), [])

    def test_serialize_round_trip(self):
        项们 = [{"id": "回放器", "title": "看: 画面 #1", "status": "进行中",
               "touches": ["game/src/viewer", "策划/流程/录制渲染"], "done_when": '能输"种子"回放',
               "outputs": [], "updated": "2026-10-18"},
              {"id": "b", "title": "[括号]开头", "status": "待办", "touches": [], "done_when": "",
               "outputs": [], "updated": "2026-10-01"}]
        文本 = edit.序列化计划(项们)
        self.assertTrue(文本.startswith("# 计划"))
        造项目(self.根, 文本)
        有, 读回, 错 = 载入计划(建索引(self.根).cfg)
        self.assertTrue(有)
        self.assertEqual(错, [])
        self.assertEqual([(p.id, p.title, p.status, p.touches, p.done_when, p.updated) for p in 读回],
                         [(x["id"], x["title"], x["status"], x["touches"], x["done_when"], x["updated"])
                          for x in 项们])

    def test_structure_errors_are_E09(self):
        造项目(self.根, "items:\n" + 项("a", "做着") + 项("a", "待办") + 项("c", "待办", updated="昨天"))
        结果 = 码(self.根)
        self.assertIn(("E09", "计划.yml#a"), 结果)            # 状态不在词表 + 重复
        self.assertIn(("E09", "计划.yml#c"), 结果)            # updated 不是日期

    def test_done_requires_existing_outputs(self):
        造项目(self.根, "items:\n" + 项("空", "完成") + 项("缺", "完成", outputs="[不存在.md]")
               + 项("好", "完成", outputs="[策划/总览]"))
        结果 = 码(self.根)
        self.assertIn(("E11", "计划.yml#空"), 结果)
        self.assertIn(("E11", "计划.yml#缺"), 结果)
        self.assertNotIn(("E11", "计划.yml#好"), 结果)      # 文档可以省 .md

    def test_stale_and_too_many_in_progress(self):
        造项目(self.根, "items:\n" + 项("旧", "进行中", updated="2026-09-01")
               + "".join(项(f"新{i}", "进行中") for i in range(3)))
        结果 = 码(self.根)
        self.assertIn(("W15", "计划.yml#旧"), 结果)
        self.assertNotIn(("W15", "计划.yml#新0"), 结果)
        self.assertIn(("W16", "计划.yml"), 结果)

    def test_W17_without_git_uses_mtime(self):
        造项目(self.根, "items:\n" + 项("改过", "待办", updated="2026-10-01", touches="[策划/总览]")
               + 项("没改", "待办", updated="2026-10-01", touches="[策划/别的]"))
        总览 = self.根 / "策划" / "总览.md"
        t = time.mktime((2026, 10, 10, 12, 0, 0, 0, 0, -1))
        os.utime(总览, (t, t))
        结果 = 码(self.根)
        self.assertIn(("W17", "计划.yml#改过"), 结果)
        self.assertNotIn(("W17", "计划.yml#没改"), 结果)
        早 = time.mktime((2026, 9, 1, 12, 0, 0, 0, 0, -1))
        os.utime(总览, (早, 早))
        self.assertNotIn(("W17", "计划.yml#改过"), 码(self.根))

    @unittest.skipUnless(shutil.which("git"), "没装 git")
    def test_W17_with_git_uses_commits_and_worktree(self):
        造项目(self.根, "items:\n" + 项("提交过", "待办", updated="2026-10-01", touches="[策划/总览]")
               + 项("早提交", "待办", updated="2026-10-15", touches="[策划/总览]")
               + 项("未提交", "待办", updated="2026-10-01", touches="[策划/新文件.md]"))
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t",
                   GIT_COMMITTER_EMAIL="t@t", GIT_AUTHOR_DATE="2026-10-10T12:00:00",
                   GIT_COMMITTER_DATE="2026-10-10T12:00:00")
        g = lambda *a: subprocess.run(["git", "-C", str(self.根), *a], env=env, check=True,
                                      capture_output=True)
        g("init", "-q")
        g("add", "-A")
        g("commit", "-q", "-m", "初始")
        # 修改时间故意设得很新：有 git 时应该看提交日期，不看它
        新 = time.mktime((2026, 10, 17, 12, 0, 0, 0, 0, -1))
        os.utime(self.根 / "策划" / "总览.md", (新, 新))
        (self.根 / "策划" / "新文件.md").write_text("---\n类型: 总览\n状态: 草案\n---\n", encoding="utf-8")
        结果 = 码(self.根)
        self.assertIn(("W17", "计划.yml#提交过"), 结果)      # 10-10 的提交晚于 10-01
        self.assertNotIn(("W17", "计划.yml#早提交"), 结果)  # 10-10 的提交早于 10-15
        self.assertIn(("W17", "计划.yml#未提交"), 结果)      # 工作区里还没提交的新文件

    def test_cli_add_start_done(self):
        造项目(self.根)
        跑 = lambda *a: subprocess.run([sys.executable, str(CLI), *a], cwd=self.根,
                                      capture_output=True, text=True)
        self.assertEqual(跑("plan", "add", "回放器", "浏览器回放器", "--涉及", "策划/总览",
                           "--验收", "能回放").returncode, 0)
        self.assertEqual(跑("计划", "开始", "回放器").returncode, 0)
        (self.根 / "路线").mkdir()
        (self.根 / "路线" / "开工.yml").write_text(
            "route: 开工\nsteps:\n  - id: a\n    title: 读\n    docs: [策划/总览]\n", encoding="utf-8")
        路线输出 = 跑("route", "开工").stdout
        self.assertIn("计划 · 进行中", 路线输出)
        self.assertIn("回放器", 路线输出)
        self.assertNotEqual(跑("plan", "done", "回放器").returncode, 0)          # 没带产出
        self.assertNotEqual(跑("plan", "done", "回放器", "--产出", "没有.md").returncode, 0)
        self.assertEqual(跑("plan", "done", "回放器", "--产出", "策划/总览").returncode, 0)
        raw = y.parse((self.根 / "计划.yml").read_text(encoding="utf-8"))
        it = raw["items"][0]
        self.assertEqual((it["status"], it["outputs"], it["touches"], it["done_when"]),
                         ("完成", ["策划/总览"], ["策划/总览"], "能回放"))
        self.assertEqual(it["updated"], dt.date.today().isoformat())
        self.assertNotIn("E11", 跑("check").stdout)


class PendingTests(unittest.TestCase):
    def test_sections_and_inline(self):
        sys.path.insert(0, str(CLI.parent))
        import atlas
        正文 = ("# 文档\n\n做到什么程度：待定。\n\n## 规则\n\n- 不算\n\n## 待定\n\n- 第一条\n  - 子条\n"
              "- 第二条\n\n```\n- 代码里的待定\n```\n\n### 小节也算在里面\n- 第三条\n\n## 别的\n\n- 不算\n")
        节内, 行内 = atlas.待定条目(正文)
        self.assertEqual(节内, ["- 第一条", "  - 子条", "- 第二条", "- 第三条"])
        self.assertEqual(行内, ["做到什么程度：待定。"])


if __name__ == "__main__":
    unittest.main()
