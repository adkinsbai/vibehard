"""One-shot native KiCad module netlist verifier, run only in an unmounted container.

The manager sends a bounded JSON request on stdin and receives one JSON response.
No user project, manager token, or host directory is mounted into this process.
"""

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_REQUEST = 3_000_000
MAX_FILES = 64
MAX_PAYLOAD = 2_000_000
MAX_NETLIST = 2_000_000
SAFE_PATH = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._/-]{0,179}$')
SHA256 = re.compile(r'^[a-f0-9]{64}$')


class InvalidPackage(Exception):
    pass


def safe_path(name):
    if not isinstance(name, str) or not SAFE_PATH.fullmatch(name):
        raise InvalidPackage('Invalid module path')
    parts = name.split('/')
    if any(not part or part in ('.', '..') or part.endswith(('.', ' ')) for part in parts):
        raise InvalidPackage('Invalid module path')
    if any(re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part, re.I) for part in parts):
        raise InvalidPackage('Invalid module path')
    return name


def decode_request(raw):
    if len(raw) > MAX_REQUEST:
        raise InvalidPackage('Module request exceeds 3 MB')
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeError):
        raise InvalidPackage('Invalid module request') from None
    if not isinstance(body, dict) or not isinstance(body.get('manifest'), dict) or not isinstance(body.get('filesBase64'), dict):
        raise InvalidPackage('Invalid module request')
    manifest = body['manifest']
    entries = manifest.get('files')
    encoded = body['filesBase64']
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_FILES or any(not isinstance(entry, dict) or not isinstance(entry.get('path'), str) for entry in entries):
        raise InvalidPackage('Module file manifest does not match payload')
    if set(encoded) != {entry['path'] for entry in entries}:
        raise InvalidPackage('Module file manifest does not match payload')
    entry_schematic = safe_path(manifest.get('entrySchematic'))
    payloads, total = {}, 0
    for entry in entries:
        if not isinstance(entry, dict):
            raise InvalidPackage('Invalid module manifest entry')
        name = safe_path(entry.get('path'))
        expected = entry.get('sha256')
        if name in payloads or not isinstance(expected, str) or not SHA256.fullmatch(expected):
            raise InvalidPackage('Invalid module manifest entry')
        data64 = encoded.get(name)
        if not isinstance(data64, str) or len(data64) > 2_800_000:
            raise InvalidPackage('Invalid module file encoding')
        try:
            data = base64.b64decode(data64, validate=True)
        except (ValueError, base64.binascii.Error):
            raise InvalidPackage('Invalid module file encoding') from None
        total += len(data)
        if not data or total > MAX_PAYLOAD or hashlib.sha256(data).hexdigest() != expected:
            raise InvalidPackage('Module file size or digest mismatch')
        payloads[name] = data
    if entry_schematic not in payloads or not entry_schematic.endswith('.kicad_sch') or not any(item.get('path') == entry_schematic and item.get('role') == 'schematic' for item in entries):
        raise InvalidPackage('Invalid entry schematic')
    return entry_schematic, payloads


def verify(raw):
    entry, payloads = decode_request(raw)
    with tempfile.TemporaryDirectory(prefix='vibehard-module-') as directory:
        root = Path(directory)
        for name, content in payloads.items():
            path = root.joinpath(*name.split('/'))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        env = {**os.environ, 'HOME': directory, 'XDG_CONFIG_HOME': directory}
        output = root / 'netlist.net'
        try:
            version = subprocess.run(['kicad-cli', '--version'], capture_output=True, timeout=5, env=env)
            command = subprocess.run(['kicad-cli', 'sch', 'export', 'netlist', '--format', 'kicadsexpr',
                                      '--output', str(output), str(root / entry)], capture_output=True, timeout=45, env=env)
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError('KiCad native check timed out or is unavailable') from None
        if version.stdout.decode('utf-8', 'replace').strip().split('.')[0] != '9':
            raise RuntimeError('This verifier requires KiCad 9')
        if version.returncode or command.returncode or not output.is_file() or output.stat().st_size > MAX_NETLIST:
            raise InvalidPackage('KiCad could not export a bounded native netlist')
        try:
            netlist = output.read_text(encoding='utf-8')
        except UnicodeError:
            raise InvalidPackage('KiCad netlist is not UTF-8') from None
        if not netlist.lstrip().startswith('(export'):
            raise InvalidPackage('KiCad returned an invalid netlist')
        return {'netlist': netlist, 'kicadVersion': version.stdout.decode('utf-8', 'replace').strip()[:40]}


if __name__ == '__main__':
    try:
        request = sys.stdin.buffer.read(MAX_REQUEST + 1)
        result = verify(request)
        print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    except InvalidPackage as error:
        print(json.dumps({'error': str(error), 'status': 422}))
    except Exception:
        print(json.dumps({'error': 'Native KiCad verification unavailable', 'status': 503}))
