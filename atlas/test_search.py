"""全文快照回归：python3 -m unittest discover -s atlas -p 'test_search.py'。"""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from serve import 文档搜索正文


class SearchSnapshotTests(unittest.TestCase):
    def test_body_refresh_and_frontmatter(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            file = root / '文档.md'
            file.write_text('---\n摘要: 元信息\n---\n# 正文标题\n正文独有文字\n', encoding='utf-8')
            idx = SimpleNamespace(根=root, 条目={'文档.md': object()})
            body, missing = 文档搜索正文(idx)
            self.assertEqual(missing, [])
            self.assertIn('正文独有文字', body['文档.md'])
            self.assertNotIn('摘要:', body['文档.md'])
            file.write_text('修改后的新内容', encoding='utf-8')
            self.assertEqual(文档搜索正文(idx)[0]['文档.md'], '修改后的新内容')
            file.unlink()
            self.assertEqual(文档搜索正文(idx), ({}, ['文档.md']))

    def test_scope_and_unreadable_files(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            root = Path(folder)
            secret = Path(outside) / '外部.md'
            secret.write_text('不应进入搜索', encoding='utf-8')
            (root / '外链.md').symlink_to(secret)
            (root / '乱码.md').write_bytes(b'\xff\xfe')
            (root / '未纳入.md').write_text('未纳入扫描', encoding='utf-8')
            idx = SimpleNamespace(根=root, 条目={'外链.md': object(), '乱码.md': object()})
            body, missing = 文档搜索正文(idx)
            self.assertEqual(body, {})
            self.assertEqual(missing, ['外链.md', '乱码.md'])

    def test_long_document_is_not_silently_truncated(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '长文.md').write_text('开头' + '字' * 400000 + '尾部独有词', encoding='utf-8')
            body, missing = 文档搜索正文(SimpleNamespace(根=root, 条目={'长文.md': object()}))
            self.assertEqual(missing, [])
            self.assertTrue(body['长文.md'].endswith('尾部独有词'))


if __name__ == '__main__':
    unittest.main()
