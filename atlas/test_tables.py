"""数据表读取回归：python3 -m unittest discover -s atlas -p 'test_tables.py'。"""
import tempfile
import unittest
import zipfile
from pathlib import Path

from tables import 读表

主 = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
关系 = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'


def 造xlsx(p: Path):
    with zipfile.ZipFile(p, 'w') as z:
        z.writestr('xl/workbook.xml', f'<workbook {主} {关系}><sheets>'
                   '<sheet name="星座" sheetId="1" r:id="rId1"/><sheet name="空表" sheetId="2" r:id="rId2"/>'
                   '</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels',
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
                   '<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>')
        z.writestr('xl/sharedStrings.xml', f'<sst {主}><si><t>名称</t></si>'
                   '<si><r><t>白</t></r><r><t>羊</t></r><rPh><t>はく</t></rPh></si><si><t>日期</t></si></sst>')
        z.writestr('xl/styles.xml', f'<styleSheet {主}><numFmts><numFmt numFmtId="164" formatCode="yyyy/m/d"/></numFmts>'
                   '<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>')
        z.writestr('xl/worksheets/sheet1.xml', f'<worksheet {主}><sheetData>'
                   '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>'
                   '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>0.30000000000000004</v></c>'
                   '<c r="C3" s="1"><v>45000</v></c><c r="D3" t="b"><v>1</v></c>'
                   '<c r="E3" t="inlineStr"><is><t>内联</t></is></c></row>'
                   '</sheetData></worksheet>')
        z.writestr('xl/worksheets/sheet2.xml', f'<worksheet {主}><sheetData/></worksheet>')


class TableReadTests(unittest.TestCase):
    def test_xlsx(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / '参数.xlsx'
            造xlsx(p)
            星座, 空表 = 读表(p)['表']
            self.assertEqual(星座['名称'], '星座')
            self.assertEqual(星座['行'], [['名称', '', '日期', '', ''], ['', '', '', '', ''],
                                          ['白羊', '0.3', '2023-03-15', 'TRUE', '内联']])
            self.assertEqual((星座['总行'], 星座['总列'], 星座['截断']), (3, 5, False))
            self.assertEqual((空表['名称'], 空表['行']), ('空表', []))

    def test_csv_encoding_and_tsv(self):
        with tempfile.TemporaryDirectory() as folder:
            gbk = Path(folder) / 'gbk.csv'
            gbk.write_bytes('星座,备注\n白羊,"莽, 不撤"\n\n'.encode('gb18030'))
            表 = 读表(gbk)['表'][0]
            self.assertEqual(表['行'], [['星座', '备注'], ['白羊', '莽, 不撤']])
            self.assertEqual(表['总行'], 2)
            tsv = Path(folder) / 'a.tsv'
            tsv.write_text('﻿a\tb\n1\t2\n', encoding='utf-8')
            self.assertEqual(读表(tsv)['表'][0]['行'], [['a', 'b'], ['1', '2']])

    def test_truncation_and_xls(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / '大.csv'
            p.write_text('\n'.join(f'{i},x' for i in range(2500)), encoding='utf-8')
            表 = 读表(p)['表'][0]
            self.assertEqual((len(表['行']), 表['总行'], 表['截断']), (2000, 2500, True))
            旧 = Path(folder) / '旧.xls'
            旧.write_bytes(b'\xd0\xcf\x11\xe0')
            with self.assertRaises(ValueError):
                读表(旧)


if __name__ == '__main__':
    unittest.main()
