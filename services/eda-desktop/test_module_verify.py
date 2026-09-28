import base64
import json
import shutil
import unittest
from pathlib import Path

from module_verify import InvalidPackage, decode_request, verify

FIXTURE = Path(__file__).resolve().parents[2] / 'lib' / 'eda' / 'modules' / 'sample-led'


def fixture_request():
    manifest = json.loads((FIXTURE / 'manifest.json').read_text())
    files = {item['path']: base64.b64encode((FIXTURE / item['path']).read_bytes()).decode('ascii') for item in manifest['files']}
    return {'manifest': manifest, 'filesBase64': files}


class NativeModuleVerification(unittest.TestCase):
    def test_rejects_path_escape_before_write(self):
        body = fixture_request()
        body['manifest']['files'][0]['path'] = '../escape.kicad_sch'
        body['filesBase64']['../escape.kicad_sch'] = body['filesBase64'].pop('module.kicad_sch')
        with self.assertRaises(InvalidPackage):
            decode_request(json.dumps(body).encode())

    def test_rejects_digest_mismatch(self):
        body = fixture_request()
        body['filesBase64']['module.kicad_sch'] = base64.b64encode(b'(kicad_sch malicious)').decode()
        with self.assertRaises(InvalidPackage):
            decode_request(json.dumps(body).encode())

    @unittest.skipUnless(shutil.which('kicad-cli'), 'KiCad CLI is unavailable')
    def test_real_kicad_netlist_is_returned_without_project_mount(self):
        result = verify(json.dumps(fixture_request()).encode())
        self.assertTrue(result['netlist'].lstrip().startswith('(export'))
        self.assertIn('9.', result['kicadVersion'])


if __name__ == '__main__':
    unittest.main()
