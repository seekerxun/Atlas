"""桌面封装的集成回归：多项目隔离、写回、资源、生命周期和跨站拒绝。"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

import desktop
import projects


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.registry = patch.object(projects, '注册表', self.base / 'state' / '注册表.yml')
        self.registry.start()
        self.manager = desktop.ServerManager()
        self.a = projects.新建项目('通用项目', self.base / '项目 A', 'A')
        self.b = projects.新建项目('通用项目', self.base / '项目 B', 'B')
        self.ua = self.manager.start(self.a)
        self.ub = self.manager.start(self.b)

    def tearDown(self):
        self.manager.close()
        self.registry.stop()
        self.temp.cleanup()

    def request(self, url, path, data=None, headers=None):
        req = Request(url + quote(path), data=None if data is None else json.dumps(data).encode(),
                      headers=headers or {})
        return urlopen(req, timeout=5)

    def test_projects_and_layout_are_isolated(self):
        for root, url, name in ((self.a, self.ua, 'A'), (self.b, self.ub, 'B')):
            with self.request(url, '数据') as response:
                data = json.load(response)
            self.assertEqual(data['根'], str(root))
            self.assertEqual(data['项目'], name)
            with self.request(url, '布局', {'test': name}, {'X-Atlas-Root': quote(str(root))}):
                pass
            self.assertEqual(json.loads((root / '.atlas/布局.json').read_text()), {'test': name})
        with self.assertRaises(HTTPError) as caught:
            self.request(self.ua, '布局', {}, {'X-Atlas-Root': quote(str(self.b))})
        self.assertEqual(caught.exception.code, 409)
        caught.exception.close()

    def test_bundled_resources_and_cross_origin(self):
        from model import ATLAS
        extensions = {'.html', '.js', '.css', '.json', '.svg', '.webp'}
        for file in (ATLAS / '视图').rglob('*'):
            if file.suffix not in extensions:
                continue
            path = '' if file.name == '画布.html' else '界面/' + file.relative_to(ATLAS / '视图').as_posix()
            with self.request(self.ua, path) as response:
                self.assertEqual(response.read(), file.read_bytes())
        with self.assertRaises(HTTPError) as caught:
            self.request(self.ua, '数据', headers={'Origin': 'https://example.com'})
        self.assertEqual(caught.exception.code, 403)
        caught.exception.close()
        with self.assertRaises(HTTPError) as caught:
            self.request(self.ua, '数据', headers={'Host': 'attacker.example'})
        self.assertEqual(caught.exception.code, 403)
        caught.exception.close()

    def test_new_project_uses_manager_and_ports_close(self):
        with patch.object(projects, '画布启动器', self.manager.start):
            with self.request(self.ua, '新建项目', {'名称': '新项目', '位置': str(self.base), '模板': '通用项目'}) as response:
                result = json.load(response)
            with self.request(result['网址'], '数据') as response:
                self.assertEqual(json.load(response)['项目'], '新项目')
        ports = [s.server_port for s, _ in self.manager.servers.values()]
        self.manager.close()
        self.assertTrue(all(not projects.端口在用(port) for port in ports))

    def test_reused_service_is_not_closed(self):
        other = desktop.ServerManager()
        try:
            self.assertEqual(other.start(self.a), self.ua)
            self.assertEqual(other.servers, {})
            other.close()
            with self.request(self.ua, '身份') as response:
                self.assertEqual(json.load(response)['根'], str(self.a))
        finally:
            other.close()


if __name__ == '__main__':
    unittest.main()
