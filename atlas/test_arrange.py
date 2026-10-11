"""python3 -m unittest discover -s atlas -p 'test_arrange.py'。"""
import os
import tempfile
import unittest
from pathlib import Path

from serve import 文件修改时间, 打包


class ArrangeTimestampTests(unittest.TestCase):
    def test_real_times_scope_and_missing(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            root = Path(folder)
            file = root / '条目.md'
            file.write_text('正文', encoding='utf-8')
            os.utime(file, (1000, 1234))
            self.assertEqual(文件修改时间(root, '条目.md'), 1234)
            os.utime(file, (1000, 5678))
            self.assertEqual(文件修改时间(root, '条目.md'), 5678)
            secret = Path(outside) / '外部.md'
            secret.write_text('外部', encoding='utf-8')
            (root / '外链.md').symlink_to(secret)
            self.assertIsNone(文件修改时间(root, '外链.md'))
            self.assertIsNone(文件修改时间(root, '不存在.md'))

    def test_data_has_document_and_asset_times(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '项目.yml').write_text('名称: 排列测试\n', encoding='utf-8')
            for rel, stamp in [('内容/系列/说明.md', 1234), ('资产/系列/音频.mp3', 5678)]:
                file = root / rel
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('测试', encoding='utf-8')
                os.utime(file, (stamp, stamp))
            nodes = {n['路径']: n for n in 打包(root)['条目']}
            self.assertEqual(nodes['内容/系列/说明.md']['修改时间'], 1234)
            self.assertEqual(nodes['资产/系列/音频.mp3']['修改时间'], 5678)


if __name__ == '__main__':
    unittest.main()
