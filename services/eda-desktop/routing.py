"""Bounded, saved-file-only KiCad/FreeRouting candidate jobs for one desktop worker.

Jobs live beside native project directories, never inside the KiCad project. A
candidate is returned for review; this module never replaces the source board.
"""

import asyncio
import hashlib
import json
import os
import re
import resource
import secrets
import shutil
import signal
import time
import uuid
from pathlib import Path


class RoutingError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def identifier(value):
    try:
        if str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise RoutingError('Invalid project identifier') from None
    return value

JAR = Path('/opt/vibehard-eda/freerouting.jar')
JAR_SHA256 = 'fb2e91df901fa50cd23a09ab42793af0ece4f3b1f3857d6724dd6f9c0c00be98'
MAX_SOURCE = 900_000
MAX_AUX = 128_000
MAX_BUNDLE = 1_850_000
MAX_REPORT = 2_000_000
MAX_OUTPUT = 1_000_000
MAX_JOBS = 3
MAX_ARTIFACT = 8_000_000
MAX_JOB_BYTES = 32_000_000
MAX_WORKER_DATA = 256_000_000
MIN_FREE_BYTES = 2_000_000_000
ROUTE_TIMEOUT = 300

PCBNEW_BRIDGE = '''import json, sys, pcbnew
mode = sys.argv[1]
board = pcbnew.LoadBoard(sys.argv[2])
if board is None: raise RuntimeError('KiCad board load failed')
if mode == 'export':
    if not pcbnew.ExportSpecctraDSN(board, sys.argv[3]): raise RuntimeError('DSN export failed')
elif mode == 'import':
    if not pcbnew.ImportSpecctraSES(board, sys.argv[3]): raise RuntimeError('SES import failed')
    if not pcbnew.SaveBoard(sys.argv[4], board): raise RuntimeError('Board save failed')
elif mode == 'fingerprint':
    def point(v): return [v.x, v.y]
    def box(item):
        r = item.GetBoundingBox()
        return [r.GetX(), r.GetY(), r.GetWidth(), r.GetHeight()]
    footprints = []
    for part in board.GetFootprints():
        pads = sorted([[p.GetNumber(), p.GetNetname(), point(p.GetPosition()), point(p.GetSize()), point(p.GetDrillSize()), p.GetShape(), p.GetLayerName()] for p in part.Pads()], key=lambda x: json.dumps(x))
        footprints.append([part.GetReference(), part.GetValue(), part.GetFPIDAsString(), point(part.GetPosition()), part.GetOrientationDegrees(), part.GetLayerName(), pads])
    data = {'copperLayers': board.GetCopperLayerCount(),
            'nets': sorted([net.GetNetname() for net in board.GetNetInfo().NetsByNetcode().values()]),
            'footprints': sorted(footprints, key=lambda x: x[0]),
            'drawings': sorted([[item.GetClass(), item.GetLayerName(), box(item)] for item in board.GetDrawings()], key=lambda x: json.dumps(x))}
    with open(sys.argv[3], 'w', encoding='utf-8') as out:
        json.dump(data, out, sort_keys=True, separators=(',', ':'))
else: raise RuntimeError('Unknown bridge action')
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_bounded(path, maximum):
    if path.is_symlink() or not path.is_file():
        raise RoutingError('Saved native project file is missing', 404)
    if path.stat().st_size > maximum:
        raise RoutingError(f'Routing file exceeds its {maximum} byte limit', 413)
    return path.read_bytes()


SOURCE_FILES = {
    'circuit.kicad_sch': ('schematic', MAX_SOURCE),
    'circuit.kicad_pcb': ('pcb', MAX_SOURCE),
    'circuit.kicad_pro': ('project', MAX_AUX),
    'sym-lib-table': ('symLibTable', MAX_AUX),
    'fp-lib-table': ('fpLibTable', MAX_AUX),
    'circuit.kicad_dru': ('designRules', MAX_AUX),
}
REQUIRED_FILES = ('circuit.kicad_sch', 'circuit.kicad_pcb', 'circuit.kicad_pro')
NATIVE_SUFFIXES = {'.kicad_sch', '.kicad_pcb', '.kicad_pro', '.kicad_sym', '.kicad_mod', '.kicad_dru'}
URI = re.compile(r'\(uri\s+(?:"([^"\r\n]+)"|([^\s()]+))\s*\)')


def require_portable_library_table(name, data):
    try:
        source = data.decode('utf-8')
    except UnicodeDecodeError:
        raise RoutingError('Native library table is not UTF-8', 422) from None
    root = 'sym_lib_table' if name == 'sym-lib-table' else 'fp_lib_table'
    variable = 'KICAD9_SYMBOL_DIR' if name == 'sym-lib-table' else 'KICAD9_FOOTPRINT_DIR'
    suffix = '.kicad_sym' if name == 'sym-lib-table' else '.pretty'
    if not source.lstrip().startswith('(' + root) or source.count('(uri') != len(URI.findall(source)):
        raise RoutingError('Native library table contains unsupported references', 422)
    uris = [left or right for left, right in URI.findall(source)]
    if len(uris) != len(re.findall(r'\(lib(?=\s|\()', source)):
        raise RoutingError('Native library table contains entries without a portable URI', 422)
    expected = re.compile(r'^\$\{' + variable + r'\}/[A-Za-z0-9_.+-]+' + re.escape(suffix) + r'$')
    if any(not expected.fullmatch(uri) for uri in uris):
        raise RoutingError('Native library table references a project-local or external path', 422)


def collect_source_files(source):
    source = Path(source)
    for path in source.rglob('*'):
        relative = path.relative_to(source)
        if any(part.startswith('.') for part in relative.parts):
            continue
        if path.suffix in NATIVE_SUFFIXES or path.name in ('sym-lib-table', 'fp-lib-table'):
            if path.is_symlink() or relative.as_posix() not in SOURCE_FILES:
                raise RoutingError('Project contains native files that cannot be preserved in a routing candidate', 422)
    files, total = {}, 0
    for name, (_, limit) in SOURCE_FILES.items():
        path = source / name
        if not path.exists():
            if name in REQUIRED_FILES:
                raise RoutingError('Saved native project is incomplete', 404)
            continue
        data = read_bounded(path, limit)
        try:
            data.decode('utf-8')
        except UnicodeDecodeError:
            raise RoutingError('Native project contains a non-UTF-8 file', 422) from None
        files[name] = data
        total += len(data)
        if name in ('sym-lib-table', 'fp-lib-table'):
            require_portable_library_table(name, data)
    if total > MAX_BUNDLE:
        raise RoutingError('Routing candidate exceeds its 1.85 MB native handoff limit', 413)
    return files


def candidate_sources(source_files, candidate):
    sources = {SOURCE_FILES[name][0]: data.decode('utf-8') for name, data in source_files.items()}
    sources['pcb'] = candidate.decode('utf-8')
    # Next's start endpoint caps the entire JSON body at 2 MB. Leave room for
    # JSON framing and future bounded metadata, not only raw file bytes.
    if len(json.dumps({'action': 'start', 'sources': sources}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) > 1_900_000:
        raise RoutingError('Routing candidate exceeds the online project handoff limit', 413)
    return sources


def drc_summary(path):
    try:
        data = json.loads(read_bounded(path, MAX_REPORT))
        if data.get('$schema') != 'https://schemas.kicad.org/drc.v1.json':
            raise ValueError()
        for field in ('violations', 'unconnected_items', 'schematic_parity'):
            if not isinstance(data.get(field), list):
                raise ValueError()
        levels = data.get('included_severities', [])
        if not all(level in levels for level in ('error', 'warning', 'exclusion')):
            raise ValueError()
        violations, signatures = {}, {}
        for row in data['violations']:
            kind = f"{row['severity']}:{row['type']}"
            violations[kind] = violations.get(kind, 0) + 1
            items = sorted(str(item.get('uuid') or item) for item in row.get('items', []))
            signature = json.dumps([kind, items, '' if items else row.get('description', '')])
            signatures[signature] = signatures.get(signature, 0) + 1
        return {'unconnected': len(data['unconnected_items']),
                'schematicParity': len(data['schematic_parity']),
                'violations': violations, 'violationSignatures': signatures}
    except (ValueError, KeyError, TypeError, UnicodeError) as error:
        raise RoutingError('KiCad produced an invalid DRC report', 503) from error


def require_complete_routing(before, after):
    if after['schematicParity'] or after['unconnected'] >= before['unconnected']:
        raise RoutingError('Routing did not improve native connectivity', 422)
    if after['unconnected']:
        raise RoutingError(f'Routing left {after["unconnected"]} connections incomplete', 422)
    for field in ('violations', 'violationSignatures'):
        if any(count > before[field].get(kind, 0) for kind, count in after[field].items()):
            raise RoutingError('Routing candidate introduced a DRC violation', 422)


class RouteJobs:
    def __init__(self, root):
        self.root = Path(root).resolve() / '.route-jobs'
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.active = {}
        self.lock = asyncio.Lock()

    def _check_storage(self, job_path=None):
        if shutil.disk_usage(self.root).free < MIN_FREE_BYTES:
            raise RoutingError('KiCad host needs more free storage', 507)
        worker_bytes = job_bytes = 0
        for file in self.root.parent.rglob('*'):
            if file.is_symlink():
                raise RoutingError('Unsupported link in KiCad worker data', 503)
            if file.is_file():
                size = file.stat().st_size
                worker_bytes += size
                if job_path is not None and file.is_relative_to(job_path):
                    job_bytes += size
                if worker_bytes > MAX_WORKER_DATA or job_bytes > MAX_JOB_BYTES:
                    raise RoutingError('KiCad routing storage budget exceeded', 507)

    def _directory(self, owner, project, job_id):
        identifier(owner)
        identifier(project)
        try:
            if str(uuid.UUID(job_id)) != job_id:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise RoutingError('Invalid routing job', 400) from None
        path = self.root / owner / project / job_id
        if not path.resolve().is_relative_to(self.root):
            raise RoutingError('Invalid routing job', 400)
        return path

    @staticmethod
    def _state(path):
        state_file = path / 'state.json'
        if state_file.is_symlink() or not state_file.is_file():
            raise RoutingError('Routing job not found', 404)
        state = json.loads(read_bounded(state_file, 32_000))
        if state['state'] in ('queued', 'running') and time.time() - state['updatedAt'] > ROUTE_TIMEOUT + 180:
            state['state'], state['error'] = 'failed', 'Routing worker was interrupted'
        return state

    @staticmethod
    def _write_state(path, state):
        state['updatedAt'] = time.time()
        temp = path / ('state-' + secrets.token_hex(8) + '.tmp')
        temp.write_text(json.dumps(state, separators=(',', ':')), encoding='utf-8')
        temp.replace(path / 'state.json')

    async def start(self, owner, project, project_path):
        source = Path(project_path).resolve()
        collect_source_files(source)
        async with self.lock:
            key = (owner, project)
            if key in self.active and not self.active[key].done():
                raise RoutingError('A routing job is already active for this project', 429)
            jobs_root = self.root / identifier(owner) / identifier(project)
            jobs_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            existing = sorted((p for p in jobs_root.iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime)
            for stale in existing[:-MAX_JOBS + 1]:
                if not stale.is_symlink():
                    shutil.rmtree(stale)
            self._check_storage()
            job_id = str(uuid.uuid4())
            path = self._directory(owner, project, job_id)
            path.mkdir(mode=0o700)
            state = {'jobId': job_id, 'state': 'queued'}
            self._write_state(path, state)
            task = asyncio.create_task(self._execute(key, source, path))
            self.active[key] = task
            return state

    def status(self, owner, project, job_id):
        state = self._state(self._directory(owner, project, job_id))
        if state['state'] in ('queued', 'running') and (owner, project) not in self.active:
            state['state'], state['error'] = 'failed', 'Routing worker was interrupted'
        return {key: value for key, value in state.items() if key != 'updatedAt'}

    def candidate(self, owner, project, job_id, project_path):
        path = self._directory(owner, project, job_id)
        state = self._state(path)
        if state['state'] != 'ready':
            raise RoutingError('Routing candidate is not ready', 409)
        original = Path(project_path).resolve()
        schematic = read_bounded(original / 'circuit.kicad_sch', MAX_SOURCE)
        board = read_bounded(original / 'circuit.kicad_pcb', MAX_SOURCE)
        if digest(schematic) != state['sourceSchematicSha256'] or digest(board) != state['sourceSha256']:
            raise RoutingError('Saved project changed after routing; start a new job', 409)
        current_files = collect_source_files(original)
        if set(current_files) != set(state.get('sourceFilesSha256', {})):
            raise RoutingError('Saved project changed after routing; start a new job', 409)
        for filename, sha in state.get('sourceFilesSha256', {}).items():
            if digest(current_files[filename]) != sha:
                raise RoutingError('Saved project changed after routing; start a new job', 409)
        candidate = read_bounded(path / 'candidate' / 'circuit.kicad_pcb', MAX_SOURCE)
        if digest(candidate) != state['candidateSha256']:
            raise RoutingError('Routing candidate failed integrity check', 503)
        sources = candidate_sources(current_files, candidate)
        return {'jobId': job_id, 'state': 'ready', 'sources': sources,
                'before': state['before'], 'after': state['after'],
                'sourceSha256': state['sourceSha256'], 'candidateSha256': state['candidateSha256']}

    async def _run(self, args, cwd, timeout, allow_violations=False):
        def limit_files():
            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_ARTIFACT, MAX_ARTIFACT))

        process = await asyncio.create_subprocess_exec(*args, cwd=cwd, stdout=asyncio.subprocess.PIPE,
                                                       stderr=asyncio.subprocess.PIPE, start_new_session=True,
                                                       preexec_fn=limit_files)
        total = 0

        async def drain(stream):
            nonlocal total
            while chunk := await stream.read(65536):
                total += len(chunk)
                if total > MAX_OUTPUT:
                    raise RoutingError('Routing tool produced excessive output', 503)

        readers = [asyncio.create_task(drain(process.stdout)), asyncio.create_task(drain(process.stderr))]
        try:
            await asyncio.wait_for(asyncio.gather(*readers, process.wait()), timeout)
            if process.returncode not in ((0, 5) if allow_violations else (0,)):
                raise RoutingError('KiCad or routing tool failed', 503)
            return process.returncode
        except (TimeoutError, asyncio.CancelledError, RoutingError) as error:
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            await process.wait()
            if isinstance(error, TimeoutError):
                raise RoutingError('Routing tool exceeded its time limit', 503) from None
            raise
        finally:
            for reader in readers:
                reader.cancel()
            await asyncio.gather(*readers, return_exceptions=True)

    async def _execute(self, key, source, path):
        state = self._state(path)
        state['state'] = 'running'
        self._write_state(path, state)
        try:
            if not JAR.is_file() or digest(JAR.read_bytes()) != JAR_SHA256:
                raise RoutingError('Pinned Freerouting tool is unavailable', 503)
            baseline, candidate, artifacts = (path / name for name in ('baseline', 'candidate', 'artifacts'))
            for directory in (baseline, candidate, artifacts):
                directory.mkdir(mode=0o700)
            source_files = collect_source_files(source)
            sources = {}
            for filename, content in source_files.items():
                sources[filename] = digest(content)
                for directory in (baseline, candidate):
                    (directory / filename).write_bytes(content)
            state['sourceSha256'] = sources['circuit.kicad_pcb']
            state['sourceSchematicSha256'] = sources['circuit.kicad_sch']
            state['sourceFilesSha256'] = sources
            self._write_state(path, state)
            board = baseline / 'circuit.kicad_pcb'
            before_report = artifacts / 'before.json'
            after_report = artifacts / 'after.json'
            drc_args = ['kicad-cli', 'pcb', 'drc', '--format', 'json', '--severity-all',
                        '--schematic-parity', '--exit-code-violations']
            await self._run([*drc_args, '-o', str(before_report), str(board)], baseline, 90, allow_violations=True)
            before = drc_summary(before_report)
            if before['schematicParity'] or not before['unconnected']:
                raise RoutingError('Baseline board is inconsistent or already fully connected', 422)
            fingerprint_before = artifacts / 'fingerprint-before.json'
            await self._run(['/usr/bin/python3', '-c', PCBNEW_BRIDGE, 'fingerprint', str(board), str(fingerprint_before)], baseline, 60)
            dsn, ses = artifacts / 'board.dsn', artifacts / 'board.ses'
            await self._run(['/usr/bin/python3', '-c', PCBNEW_BRIDGE, 'export', str(board), str(dsn)], baseline, 60)
            if not read_bounded(dsn, MAX_ARTIFACT):
                raise RoutingError('KiCad produced an empty DSN', 503)
            self._check_storage(path)
            await self._run(['/usr/bin/java', '-Xmx512m', '-XX:ActiveProcessorCount=1', '-jar', str(JAR),
                             '--gui.enabled=false', '--api_server.enabled=false', '--logging.file.enabled=false',
                             f'--user_data_path={artifacts}', '-da', '-de', str(dsn), '-do', str(ses), '-mp', '10', '-mt', '1'], artifacts, ROUTE_TIMEOUT)
            if not read_bounded(ses, MAX_ARTIFACT):
                raise RoutingError('Freerouting produced an empty session', 503)
            self._check_storage(path)
            candidate_board = candidate / 'circuit.kicad_pcb'
            await self._run(['/usr/bin/python3', '-c', PCBNEW_BRIDGE, 'import', str(candidate_board), str(ses), str(candidate_board)], candidate, 60)
            fingerprint_after = artifacts / 'fingerprint-after.json'
            await self._run(['/usr/bin/python3', '-c', PCBNEW_BRIDGE, 'fingerprint', str(candidate_board), str(fingerprint_after)], candidate, 60)
            if digest(read_bounded(fingerprint_before, MAX_REPORT)) != digest(read_bounded(fingerprint_after, MAX_REPORT)):
                raise RoutingError('Routing candidate changed fixed PCB structure', 422)
            await self._run([*drc_args, '-o', str(after_report), str(candidate_board)], candidate, 90, allow_violations=True)
            after = drc_summary(after_report)
            state['before'] = {key: value for key, value in before.items() if key != 'violationSignatures'}
            state['after'] = {key: value for key, value in after.items() if key != 'violationSignatures'}
            self._write_state(path, state)
            require_complete_routing(before, after)
            current_files = collect_source_files(source)
            if set(current_files) != set(sources) or any(digest(current_files[filename]) != sha for filename, sha in sources.items()):
                raise RoutingError('Saved project changed during routing', 409)
            candidate_bytes = read_bounded(candidate_board, MAX_SOURCE)
            candidate_sources(source_files, candidate_bytes)
            self._check_storage(path)
            if digest(candidate_bytes) == state['sourceSha256']:
                raise RoutingError('Routing returned an unchanged board', 422)
            state.update({'state': 'ready',
                          'candidateSha256': digest(candidate_bytes)})
        except Exception as error:
            state['state'] = 'failed'
            state['error'] = str(error) if isinstance(error, RoutingError) else 'Routing service failed'
        finally:
            self._write_state(path, state)
            self.active.pop(key, None)
