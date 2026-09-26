"""Local single-owner KiCad desktop broker. Run as an unprivileged Linux user.

This is deliberately not a multi-tenant sandbox. A persistent owner lease and
loopback binding prevent accidentally deploying this adapter as a public farm.
"""
import asyncio
import hashlib
import io
import json
import logging
import os
import secrets
import shutil
import signal
import time
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path


class DesktopError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def identifier(value):
    try:
        if str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise DesktopError('Invalid project identifier') from None
    return value


def container_bind(environ=None, in_container=None):
    env = os.environ if environ is None else environ
    host = env.get('EDA_DESKTOP_BIND', '127.0.0.1')
    if host == '127.0.0.1':
        return host
    if in_container is None:
        in_container = Path('/.dockerenv').is_file()
    if host == '0.0.0.0' and env.get('EDA_DESKTOP_CONTAINER') == '1' and in_container:
        return host
    raise DesktopError('Non-loopback desktop bind requires an isolated container', 503)


class TicketStore:
    def __init__(self):
        self.values = {}

    def issue(self, session, now=None):
        now = time.monotonic() if now is None else now
        self.values = {key: val for key, val in self.values.items() if val[1] > now}
        token = secrets.token_urlsafe(32)
        self.values[token] = (session, now + 60)
        return token

    def consume(self, token, now=None):
        now = time.monotonic() if now is None else now
        value = self.values.pop(token, None)
        if not value or value[1] <= now:
            raise DesktopError('Connection ticket expired; reconnect from the project page', 401)
        return value[0]


class ProjectFiles:
    def __init__(self, root, templates=None):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.templates = Path(templates) if templates else Path('/usr/share/kicad/template')

    def ensure_library_tables(self, directory):
        for name in ('sym-lib-table', 'fp-lib-table'):
            template = self.templates / name
            if not template.is_file():
                continue
            try:
                with (directory / name).open('xb') as handle:
                    handle.write(template.read_bytes())
            except FileExistsError:
                pass

    def directory(self, owner, project):
        directory = self.root / identifier(owner) / identifier(project)
        if not directory.resolve().is_relative_to(self.root):
            raise DesktopError('Invalid project path')
        return directory

    def claim(self, owner):
        identifier(owner)
        lease = self.root / 'owner'
        try:
            with lease.open('x') as handle:
                handle.write(owner)
        except FileExistsError:
            if lease.read_text().strip() != owner:
                raise DesktopError('This local desktop runtime is assigned to another account', 403)

    def initialize(self, owner, project, sources):
        directory = self.directory(owner, project)
        self.claim(owner)
        if (directory / 'circuit.kicad_pro').exists():
            self.ensure_library_tables(directory)
            return directory
        for name, root in [('schematic', 'kicad_sch'), ('pcb', 'kicad_pcb')]:
            source = sources.get(name, '')
            if not isinstance(source, str) or not source.lstrip().startswith('(' + root) or len(source.encode()) > 8_000_000:
                raise DesktopError('Invalid or oversized native KiCad file')
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        for name, extension in [('schematic', 'sch'), ('pcb', 'pcb')]:
            target = directory / f'circuit.kicad_{extension}'
            # Exclusive create also protects a partially initialized project.
            if not target.exists():
                with target.open('x', encoding='utf-8') as handle:
                    handle.write(sources[name])
        (directory / 'circuit.kicad_pro').write_text('{}', encoding='utf-8')
        self.ensure_library_tables(directory)
        return directory

    def native_files(self, directory):
        allowed = {'.kicad_sch', '.kicad_pcb', '.kicad_pro', '.kicad_sym', '.kicad_mod', '.kicad_dru'}
        result = {}
        size = 0
        for path in sorted(directory.rglob('*')):
            relative = path.relative_to(directory)
            if any(part.startswith('.') for part in relative.parts) or path.is_symlink() or not path.is_file():
                continue
            if path.suffix not in allowed and path.name not in ('sym-lib-table', 'fp-lib-table'):
                continue
            if not path.resolve().is_relative_to(directory.resolve()):
                raise DesktopError('Unsupported project link')
            size += path.stat().st_size
            if size > 64_000_000:
                raise DesktopError('Project archive exceeds 64 MB')
            result[relative.as_posix()] = path.read_bytes()
        return result


@dataclass
class Session:
    key: str
    path: Path
    display: int
    env: dict
    processes: list = field(default_factory=list)
    editors: dict = field(default_factory=dict)
    viewers: set = field(default_factory=set)
    started: float = field(default_factory=time.time)


class DesktopRuntime:
    def __init__(self, root):
        self.files = ProjectFiles(root)
        self.sessions = {}
        self.tickets = TicketStore()
        self.lock = asyncio.Lock()
        self.jobs = asyncio.Semaphore(1)

    async def run(self, args, env=None, timeout=30):
        process = await asyncio.create_subprocess_exec(*args, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)
        try:
            out, err = await asyncio.wait_for(process.communicate(), timeout)
        except (TimeoutError, asyncio.CancelledError):
            os.killpg(process.pid, signal.SIGKILL)
            await process.wait()
            raise
        return process.returncode, out, err

    async def spawn(self, session, args):
        log = (session.path / '.desktop.log').open('ab')
        try:
            process = await asyncio.create_subprocess_exec(*args, env=session.env, cwd=session.path, stdout=log, stderr=log, start_new_session=True)
        finally:
            log.close()
        session.processes.append(process)
        return process

    async def start(self, owner, project, sources, editor):
        key = f'{identifier(owner)}/{identifier(project)}'
        self.files.claim(owner)
        async with self.lock:
            session = self.sessions.get(key)
            if session and session.processes[0].returncode is not None:
                await self.stop(key)
                session = None
            if not session:
                if len(self.sessions) >= 2:
                    raise DesktopError('Close another project desktop first (local limit: 2)', 409)
                for binary in ('Xtigervnc', 'openbox', 'eeschema', 'pcbnew', 'kicad-cli', 'xauth', 'xdotool'):
                    if not shutil.which(binary):
                        raise DesktopError('KiCad desktop dependencies are not installed', 503)
                path = self.files.initialize(owner, project, sources)
                used = {s.display for s in self.sessions.values()}
                display = next((n for n in range(100, 120) if n not in used and not Path(f'/tmp/.X11-unix/X{n}').exists() and not Path(f'/tmp/.X{n}-lock').exists()), None)
                if display is None:
                    raise DesktopError('No free virtual display', 503)
                home = path / '.home'
                home.mkdir(exist_ok=True)
                config_root = home / '.config'
                _, version, _ = await self.run(['kicad-cli', '--version'])
                major = version.decode().strip().split('.')[0]
                if not major.isdigit():
                    raise DesktopError('Cannot detect KiCad version', 503)
                config = config_root / 'kicad' / (major + '.0')
                config.mkdir(parents=True, exist_ok=True)
                common = config / 'kicad_common.json'
                if not common.exists():
                    common.write_text(json.dumps({'meta': {'version': 1}}))
                for name in ('sym-lib-table', 'fp-lib-table'):
                    source = Path('/usr/share/kicad/template') / name
                    if source.exists() and not (config / name).exists():
                        shutil.copyfile(source, config / name)
                authority = home / '.Xauthority'
                authority.touch(mode=0o600, exist_ok=True)
                await self.run(['xauth', '-f', str(authority), 'add', f':{display}', '.', secrets.token_hex(16)])
                env = {**os.environ, 'HOME': str(home), 'XDG_CONFIG_HOME': str(config_root), 'DISPLAY': f':{display}', 'XAUTHORITY': str(authority), 'GDK_BACKEND': 'x11', 'LIBGL_ALWAYS_SOFTWARE': '1', 'NO_AT_BRIDGE': '1'}
                # A WSLg/host bus must never receive these editor windows.
                for name in ('WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'SESSION_MANAGER'):
                    env.pop(name, None)
                session = Session(key, path, display, env)
                self.sessions[key] = session
                try:
                    await self.spawn(session, ['Xtigervnc', f':{display}', '-geometry', '1440x900', '-depth', '24', '-rfbport', str(5900 + display), '-localhost', 'yes', '-SecurityTypes', 'None', '-AlwaysShared', '-nolisten', 'tcp', '-auth', str(authority)])
                    for _ in range(80):
                        if session.processes[0].returncode is not None:
                            raise DesktopError('Virtual display failed to start', 503)
                        try:
                            _, writer = await asyncio.open_connection('127.0.0.1', 5900 + display)
                            writer.close()
                            await writer.wait_closed()
                            break
                        except OSError:
                            await asyncio.sleep(.1)
                    else:
                        raise DesktopError('Virtual display startup timed out', 503)
                    rc = home / 'openbox.xml'
                    rc.write_text('<openbox_config xmlns="http://openbox.org/3.4/rc"><applications><application type="normal"><maximized>yes</maximized></application></applications></openbox_config>')
                    await self.spawn(session, ['openbox', '--config-file', str(rc)])
                except BaseException:
                    await self.stop(key)
                    raise
            await self.open_editor(session, editor)
            return session

    async def open_editor(self, session, editor):
        if editor not in ('schematic', 'pcb'):
            raise DesktopError('Unknown editor')
        binary, suffix = ('eeschema', 'sch') if editor == 'schematic' else ('pcbnew', 'pcb')
        process = session.editors.get(editor)
        if process and process.returncode is None:
            # Raise the already-open editor; never reopen/overwrite an unsaved file.
            _, out, _ = await self.run(['xdotool', 'search', '--onlyvisible', '--pid', str(process.pid)], session.env)
            for window in out.decode().splitlines()[:1]:
                await self.run(['xdotool', 'windowactivate', '--sync', window], session.env, 3)
        else:
            session.editors[editor] = await self.spawn(session, [binary, str(session.path / f'circuit.kicad_{suffix}')])

    async def stop(self, key):
        session = self.sessions.pop(key, None)
        if not session:
            return
        for ws in list(session.viewers):
            await ws.close(code=1001, message=b'Session stopped')
        for process in reversed(session.processes):
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    await asyncio.wait_for(process.wait(), 4)
                except TimeoutError:
                    os.killpg(process.pid, signal.SIGKILL)
                    await process.wait()
                except ProcessLookupError:
                    pass

    def status(self, owner, project):
        self.files.claim(owner)
        path = self.files.directory(owner, project)
        session = self.sessions.get(f'{owner}/{project}')
        files = self.files.native_files(path) if path.exists() else {}
        return {'running': bool(session and session.processes[0].returncode is None), 'files': [{'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in files.items()], 'mode': 'local-single-owner'}

    async def check(self, owner, project, kind):
        if kind not in ('erc', 'drc'):
            raise DesktopError('Unknown check')
        path = self.files.directory(owner, project)
        source = path / ('circuit.kicad_sch' if kind == 'erc' else 'circuit.kicad_pcb')
        if not source.is_file():
            raise DesktopError('Save a native project first', 404)
        if kind == 'drc' and not (path / 'circuit.kicad_sch').is_file():
            raise DesktopError('Save the schematic before checking PCB parity', 404)
        async with self.jobs:
            output = path / f'.{kind}-{uuid.uuid4()}.json'
            try:
                command = ['kicad-cli', 'sch' if kind == 'erc' else 'pcb', kind, '--format', 'json', '--exit-code-violations']
                if kind == 'drc':
                    command.append('--schematic-parity')
                code, _, _ = await self.run([*command, '-o', str(output), str(source)], timeout=90)
                if code not in (0, 5) or not output.is_file():
                    raise DesktopError('KiCad check failed; no valid report was produced', 503)
                return {'kind': kind, 'exitCode': code, 'report': json.loads(output.read_text()), 'savedFilesOnly': True}
            finally:
                output.unlink(missing_ok=True)

    async def snapshot(self, owner, project):
        path = self.files.directory(owner, project)
        source = path / 'circuit.kicad_sch'
        if not source.is_file():
            raise DesktopError('Save a KiCad schematic first', 404)
        initial = source.read_bytes()
        if len(initial) > 900_000:
            raise DesktopError('Schematic exceeds the current Agent import limit', 413)
        async with self.jobs:
            output = path / f'.agent-netlist-{uuid.uuid4()}.net'
            try:
                code, _, _ = await self.run(['kicad-cli', 'sch', 'export', 'netlist', '--format', 'kicadsexpr', '-o', str(output), str(source)], timeout=60)
                if code != 0 or not output.is_file() or output.stat().st_size > 2_000_000:
                    raise DesktopError('KiCad could not export a bounded netlist for this saved schematic', 422)
                if source.read_bytes() != initial:
                    raise DesktopError('Schematic changed while the Agent read it; save and retry', 409)
                return {'schematic': initial.decode('utf-8'), 'netlist': output.read_text(encoding='utf-8'), 'sha256': hashlib.sha256(initial).hexdigest(), 'savedFilesOnly': True}
            finally:
                output.unlink(missing_ok=True)


def create_app(runtime, secret, origins, max_viewers=2):
    from aiohttp import web, WSMsgType

    @web.middleware
    async def guard(request, handler):
        try:
            if request.path != '/client/ws':
                if not secrets.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + secret):
                    raise DesktopError('Unauthorized', 401)
            return await handler(request)
        except DesktopError as error:
            return web.json_response({'error': str(error)}, status=error.status)
        except (ValueError, TypeError, KeyError):
            return web.json_response({'error': 'Invalid desktop request'}, status=400)
        except Exception:
            # Do not leak project paths, process errors or credentials to browsers.
            logging.exception('Desktop operation failed')
            return web.json_response({'error': 'Desktop operation failed; see local runtime logs'}, status=503)

    async def action(request):
        owner, project = identifier(request.match_info['owner']), identifier(request.match_info['project'])
        runtime.files.claim(owner)
        body = await request.json()
        command = body.get('action')
        key = f'{owner}/{project}'
        if command == 'start':
            await runtime.start(owner, project, body.get('sources', {}), body.get('editor', 'schematic'))
            return web.json_response({**runtime.status(owner, project), 'ticket': runtime.tickets.issue(key)})
        if command == 'stop':
            await runtime.stop(key)
            return web.json_response(runtime.status(owner, project))
        if command == 'status':
            return web.json_response(runtime.status(owner, project))
        if command == 'archive':
            path = runtime.files.directory(owner, project)
            files = runtime.files.native_files(path)
            if not files:
                raise DesktopError('Project has no saved native files', 404)
            manifest = {'savedFilesOnly': True, 'createdAt': time.time(), 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
                archive.writestr('manifest.json', json.dumps(manifest, indent=2))
            return web.Response(body=output.getvalue(), content_type='application/zip', headers={'Cache-Control': 'no-store'})
        if command == 'check':
            return web.json_response(await runtime.check(owner, project, body.get('kind')))
        if command == 'snapshot':
            return web.json_response(await runtime.snapshot(owner, project))
        raise DesktopError('Unknown desktop action')

    async def health(_request):
        return web.json_response({'ok': True})

    async def websocket(request):
        if request.headers.get('Origin') not in origins:
            raise DesktopError('Untrusted browser origin', 403)
        key = runtime.tickets.consume(request.query.get('ticket', ''))
        session = runtime.sessions.get(key)
        if not session:
            raise DesktopError('Session ended', 410)
        if len(session.viewers) >= max_viewers:
            raise DesktopError('Too many connected viewers', 409)
        reader, writer = await asyncio.open_connection('127.0.0.1', 5900 + session.display)
        ws = web.WebSocketResponse(max_msg_size=8_000_000, heartbeat=25)
        await ws.prepare(request)
        session.viewers.add(ws)

        async def upstream():
            while data := await reader.read(65536):
                await ws.send_bytes(data)
            await ws.close()

        pump = asyncio.create_task(upstream())
        try:
            async for message in ws:
                if message.type == WSMsgType.BINARY:
                    writer.write(message.data)
                    await writer.drain()
        finally:
            pump.cancel()
            await asyncio.gather(pump, return_exceptions=True)
            writer.close()
            await writer.wait_closed()
            session.viewers.discard(ws)
        return ws

    async def cleanup(app):
        for key in list(runtime.sessions):
            await runtime.stop(key)

    app = web.Application(middlewares=[guard], client_max_size=18_000_000)
    app.router.add_get('/health', health)
    app.router.add_post('/v1/projects/{owner}/{project}', action)
    app.router.add_get('/client/ws', websocket)
    app.on_cleanup.append(cleanup)
    return app


if __name__ == '__main__':
    import fcntl
    from aiohttp import web
    if os.geteuid() == 0:
        raise SystemExit('Run this desktop broker as an unprivileged user')
    root = Path(os.environ.get('EDA_DESKTOP_DATA', str(Path.home() / '.local/share/vibehard-desktop')))
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = (root / '.broker.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    secret_path = Path(os.environ['EDA_DESKTOP_TOKEN_FILE'])
    secret = secret_path.read_text().strip()
    if len(secret) < 32:
        raise SystemExit('Desktop broker token must contain at least 32 characters')
    origins = set(os.environ.get('EDA_DESKTOP_ORIGINS', 'http://127.0.0.1:3212,http://localhost:3212').split(','))
    max_viewers = 6 if os.environ.get('EDA_DESKTOP_CONTAINER') == '1' else 2
    web.run_app(create_app(DesktopRuntime(root), secret, origins, max_viewers=max_viewers), host=container_bind(), port=int(os.environ.get('EDA_DESKTOP_PORT', '6081')), access_log=None)
