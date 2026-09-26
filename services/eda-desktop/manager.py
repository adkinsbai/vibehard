"""Private cloud manager for one isolated KiCad worker per owned project.

Only the Next.js server may call the control API. Browser WebSocket connections
must present both a current platform session and a single-use project ticket.
"""

import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import secrets
import shutil
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web
from server import identifier

REAPER_KEY = web.AppKey('reaper', asyncio.Task)


class ManagerError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class ProjectKey:
    owner: str
    project: str

    def __post_init__(self):
        try:
            identifier(self.owner)
            identifier(self.project)
        except Exception:
            raise ManagerError('Invalid project identifier') from None

    @property
    def container_name(self):
        digest = hashlib.sha256(f'{self.owner}/{self.project}'.encode()).hexdigest()[:24]
        return f'vibehard-eda-{digest}'

    def project_root(self, root):
        root = Path(root).resolve()
        path = root / 'projects' / self.owner / self.project
        if not path.resolve().is_relative_to(root):
            raise ManagerError('Invalid project path')
        return path


@dataclass(frozen=True)
class DockerSettings:
    image: str
    network: str = 'vibehard-eda-internal'
    origins: str = 'https://ldcx.tech'
    memory: str = '1280m'
    cpus: str = '0.5'
    pids: int = 128
    max_sessions: int = 3
    max_per_owner: int = 2
    project_bytes: int = 256_000_000
    min_free_bytes: int = 2_000_000_000
    idle_seconds: int = 1800


def container_command(settings, key, project_root):
    project_root = Path(project_root)
    return [
        'run', '--detach', '--rm', '--init', '--name', key.container_name,
        '--network', settings.network, '--read-only',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
        '--user', '10001:10001', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--memory', settings.memory, '--memory-swap', settings.memory,
        '--cpus', settings.cpus, '--pids-limit', str(settings.pids),
        '--label', 'vibehard.eda=worker',
        '--label', f'vibehard.owner={key.owner}',
        '--label', f'vibehard.project={key.project}',
        '--mount', f'type=bind,src={project_root / "data"},dst=/data',
        '--mount', f'type=bind,src={project_root / ".token"},dst=/run/eda-token,readonly',
        '--env', f'EDA_DESKTOP_ORIGINS={settings.origins}',
        settings.image,
    ]


class TicketStore:
    """SQLite-backed token hashes; the worker's one-time token is not persisted."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self._connect()) as db:
            db.execute('CREATE TABLE IF NOT EXISTS tickets (digest TEXT PRIMARY KEY, owner TEXT NOT NULL, project TEXT NOT NULL, expires REAL NOT NULL)')
        self.path.chmod(0o600)

    def _connect(self):
        return sqlite3.connect(self.path, timeout=5, isolation_level=None)

    def issue(self, key, token, now=None):
        if not isinstance(token, str) or not token:
            raise ManagerError('Worker did not issue a connection ticket', 503)
        now = time.time() if now is None else now
        digest = hashlib.sha256(token.encode()).hexdigest()
        with closing(self._connect()) as db:
            with db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('DELETE FROM tickets WHERE expires <= ?', (now,))
                db.execute('INSERT INTO tickets VALUES (?, ?, ?, ?)', (digest, key.owner, key.project, now + 55))

    def peek(self, token, now=None):
        now = time.time() if now is None else now
        digest = hashlib.sha256(str(token).encode()).hexdigest()
        with closing(self._connect()) as db:
            row = db.execute('SELECT owner, project, expires FROM tickets WHERE digest = ?', (digest,)).fetchone()
        if not row or row[2] <= now:
            raise ManagerError('Connection ticket expired; reconnect from the project page', 401)
        return ProjectKey(row[0], row[1])

    def consume(self, token, owner, now=None):
        now = time.time() if now is None else now
        digest = hashlib.sha256(str(token).encode()).hexdigest()
        with closing(self._connect()) as db:
            with db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT owner, project, expires FROM tickets WHERE digest = ?', (digest,)).fetchone()
                if not row or row[2] <= now:
                    raise ManagerError('Connection ticket expired; reconnect from the project page', 401)
                if row[0] != owner:
                    raise ManagerError('Project access denied', 403)
                db.execute('DELETE FROM tickets WHERE digest = ?', (digest,))
        return ProjectKey(row[0], row[1])


class DockerController:
    def __init__(self, root, settings):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.settings = settings
        self.lock = asyncio.Lock()
        self.last_used = {}

    async def _docker(self, *args, check=True, timeout=60):
        process = await asyncio.create_subprocess_exec(
            'docker', *args, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, _err = await asyncio.wait_for(process.communicate(), timeout)
        except (TimeoutError, asyncio.CancelledError):
            process.kill()
            await process.wait()
            raise ManagerError('Container operation timed out', 503) from None
        if check and process.returncode != 0:
            raise ManagerError('KiCad container operation failed', 503)
        return out if process.returncode == 0 else b''

    async def inspect(self, key):
        out = await self._docker('inspect', key.container_name, check=False)
        if not out:
            return None
        try:
            info = json.loads(out)[0]
            labels = info['Config']['Labels']
            if labels.get('vibehard.eda') != 'worker' or labels.get('vibehard.owner') != key.owner or labels.get('vibehard.project') != key.project:
                raise ManagerError('Container identity conflict', 409)
            return info
        except (IndexError, KeyError, TypeError, ValueError):
            raise ManagerError('Container inspection failed', 503) from None

    def _ip(self, info):
        try:
            address = info['NetworkSettings']['Networks'][self.settings.network]['IPAddress']
            parsed = ipaddress.ip_address(address)
            if not parsed.is_private or parsed.is_unspecified or parsed.is_loopback or parsed.is_link_local:
                raise ValueError()
            return address
        except (KeyError, TypeError, ValueError):
            raise ManagerError('KiCad container has no private address', 503) from None

    def _prepare(self, key):
        root = key.project_root(self.root)
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        data = root / 'data'
        if data.is_symlink() or not data.resolve().is_relative_to(root):
            raise ManagerError('Invalid project data directory', 503)
        data.mkdir(exist_ok=True, mode=0o700)
        os.chown(data, 10001, 10001)
        token = root / '.token'
        if token.is_symlink():
            raise ManagerError('Invalid worker credential file', 503)
        try:
            with token.open('x', encoding='ascii') as handle:
                handle.write(secrets.token_urlsafe(48))
        except FileExistsError:
            if not token.is_file():
                raise ManagerError('Invalid worker credential file', 503) from None
        token.chmod(0o640)
        os.chown(token, 0, 10001)
        return root

    def _used_bytes(self, key):
        data = key.project_root(self.root) / 'data'
        if not data.exists():
            return 0
        total = 0
        for path in data.rglob('*'):
            if path.is_symlink():
                raise ManagerError('Unsupported link in KiCad project', 503)
            if path.is_file():
                total += path.stat().st_size
        return total

    def _check_capacity(self, key):
        if self._used_bytes(key) > self.settings.project_bytes:
            raise ManagerError('KiCad project exceeds its storage budget', 507)
        if shutil.disk_usage(self.root).free < self.settings.min_free_bytes:
            raise ManagerError('KiCad host needs more free storage', 507)

    async def running_ip(self, key):
        info = await self.inspect(key)
        if not info or not info['State']['Running']:
            return None
        self.touch(key)
        return self._ip(info)

    def touch(self, key):
        self.last_used[key] = time.monotonic()

    async def ensure(self, key):
        async with self.lock:
            current = await self.inspect(key)
            if current and current['State']['Running']:
                self._check_capacity(key)
                self.touch(key)
                return self._ip(current)
            active = (await self._docker('ps', '--filter', 'label=vibehard.eda=worker', '--format', '{{.Names}}')).decode().splitlines()
            if len(active) >= self.settings.max_sessions:
                raise ManagerError('KiCad desktop capacity is full; retry shortly', 429)
            own = (await self._docker('ps', '--filter', f'label=vibehard.owner={key.owner}', '--filter', 'label=vibehard.eda=worker', '--format', '{{.Names}}')).decode().splitlines()
            if len(own) >= self.settings.max_per_owner:
                raise ManagerError('Close another KiCad project before opening more', 429)
            self._check_capacity(key)
            root = self._prepare(key)
            if current:
                await self._docker('rm', '-f', key.container_name)
            await self._docker(*container_command(self.settings, key, root))
            try:
                for _ in range(60):
                    info = await self.inspect(key)
                    if info and info['State']['Running']:
                        ip = self._ip(info)
                        try:
                            async with ClientSession(timeout=ClientTimeout(total=2)) as client:
                                async with client.get(f'http://{ip}:6081/health', headers={'Authorization': 'Bearer ' + self.worker_token(key)}) as response:
                                    if response.status == 200 and (await response.json()).get('ok') is True:
                                        self.touch(key)
                                        return ip
                        except (OSError, TimeoutError):
                            pass
                    await asyncio.sleep(.5)
                raise ManagerError('KiCad container did not become ready', 503)
            except BaseException:
                await self._docker('stop', '--time', '5', key.container_name, check=False)
                raise

    def worker_token(self, key):
        return (key.project_root(self.root) / '.token').read_text(encoding='ascii').strip()

    async def stop(self, key):
        async with self.lock:
            info = await self.inspect(key)
            if info and info['State']['Running']:
                await self._docker('stop', '--time', '10', key.container_name)
            self.last_used.pop(key, None)

    async def recover(self):
        names = (await self._docker('ps', '--filter', 'label=vibehard.eda=worker', '--format', '{{.Names}}')).decode().splitlines()
        for name in names:
            out = await self._docker('inspect', name)
            info = json.loads(out)[0]
            labels = info.get('Config', {}).get('Labels', {})
            key = ProjectKey(labels.get('vibehard.owner'), labels.get('vibehard.project'))
            if key.container_name != name:
                raise ManagerError('Unrecognized KiCad container', 503)
            self.last_used[key] = time.monotonic()

    async def reap_idle(self):
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            for key, last in list(self.last_used.items()):
                try:
                    if now - last >= self.settings.idle_seconds or self._used_bytes(key) > self.settings.project_bytes:
                        await self.stop(key)
                except Exception:
                    logging.exception('Failed to reap a KiCad worker')


class CloudManager:
    ACTIONS = {'start', 'stop', 'status', 'archive', 'check', 'snapshot'}

    def __init__(self, controller, tickets, platform_access_url, origins):
        self.controller = controller
        self.tickets = tickets
        self.platform_access_url = platform_access_url
        self.origins = set(origins)

    async def _forward(self, key, ip, body):
        url = f'http://{ip}:6081/v1/projects/{key.owner}/{key.project}'
        timeout = ClientTimeout(total=110 if body['action'] in ('start', 'check', 'snapshot') else 45)
        async with ClientSession(timeout=timeout) as client:
            async with client.post(url, json=body, headers={'Authorization': 'Bearer ' + self.controller.worker_token(key)}) as response:
                return response.status, response.headers.get('Content-Type', 'application/json').split(';')[0], await response.read()

    async def action(self, key, body):
        if not isinstance(body, dict) or body.get('action') not in self.ACTIONS:
            raise ManagerError('Invalid desktop action')
        command = body['action']
        if command == 'stop':
            await self.controller.stop(key)
            return 200, 'application/json', json.dumps({'running': False, 'files': [], 'mode': 'cloud-isolated'}).encode()
        if command == 'status':
            ip = await self.controller.running_ip(key)
            if ip is None:
                return 200, 'application/json', json.dumps({'running': False, 'files': [], 'mode': 'cloud-isolated'}).encode()
        else:
            ip = await self.controller.ensure(key)
        issued_at = time.time()
        status, content_type, payload = await self._forward(key, ip, body)
        if command == 'start' and status < 400:
            try:
                result = json.loads(payload)
                self.tickets.issue(key, result['ticket'], now=issued_at)
                result['mode'] = 'cloud-isolated'
                payload = json.dumps(result).encode()
            except (ValueError, KeyError, TypeError):
                raise ManagerError('KiCad worker returned an invalid ticket', 503) from None
        return status, content_type, payload

    async def verify_browser(self, request, key):
        cookie = request.headers.get('Cookie', '')
        if not cookie or len(cookie) > 8192:
            raise ManagerError('Please sign in to reconnect to KiCad', 401)
        url = self.platform_access_url.format(project=quote(key.project))
        try:
            async with ClientSession(timeout=ClientTimeout(total=6)) as client:
                async with client.get(url, headers={'Cookie': cookie, 'Host': 'ldcx.tech', 'X-Forwarded-Proto': 'https'}) as response:
                    if response.status != 200:
                        raise ManagerError('Project access denied', 403)
                    result = await response.json()
        except (OSError, TimeoutError):
            raise ManagerError('Platform session check is unavailable', 503) from None
        if not isinstance(result, dict) or result.get('owner') != key.owner or result.get('project') != key.project:
            raise ManagerError('Project access denied', 403)
        return key.owner


def create_app(manager, control_token):
    if len(control_token) < 32:
        raise ValueError('Cloud manager token must contain at least 32 characters')

    @web.middleware
    async def guard(request, handler):
        try:
            if request.path != '/client/ws':
                if not secrets.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + control_token):
                    raise ManagerError('Unauthorized', 401)
            return await handler(request)
        except ManagerError as error:
            return web.json_response({'error': str(error)}, status=error.status)
        except (ValueError, TypeError, KeyError):
            return web.json_response({'error': 'Invalid desktop request'}, status=400)
        except Exception:
            logging.exception('Cloud desktop request failed')
            return web.json_response({'error': 'KiCad cloud service failed'}, status=503)

    async def action(request):
        key = ProjectKey(request.match_info['owner'], request.match_info['project'])
        body = await request.json()
        status, content_type, payload = await manager.action(key, body)
        return web.Response(body=payload, status=status, content_type=content_type, headers={'Cache-Control': 'no-store'})

    async def health(_request):
        return web.json_response({'ok': True}, headers={'Cache-Control': 'no-store'})

    async def websocket(request):
        origin = request.headers.get('Origin')
        if origin not in manager.origins:
            raise ManagerError('Untrusted browser origin', 403)
        ticket = request.query.get('ticket', '')
        if not ticket or len(ticket) > 128:
            raise ManagerError('Invalid connection ticket', 401)
        key = manager.tickets.peek(ticket)
        owner = await manager.verify_browser(request, key)
        manager.tickets.consume(ticket, owner)
        ip = await manager.controller.running_ip(key)
        if ip is None:
            raise ManagerError('KiCad session ended; reconnect from the project page', 410)
        client = ClientSession(timeout=ClientTimeout(total=None))
        worker = None
        try:
            worker = await client.ws_connect(
                f'http://{ip}:6081/client/ws?ticket={quote(ticket)}',
                headers={'Origin': origin}, max_msg_size=8_000_000, heartbeat=25,
            )
            browser = web.WebSocketResponse(max_msg_size=8_000_000, heartbeat=25)
            await browser.prepare(request)

            async def worker_to_browser():
                async for message in worker:
                    if message.type == WSMsgType.BINARY:
                        await browser.send_bytes(message.data)
                    elif message.type == WSMsgType.TEXT:
                        await browser.send_str(message.data)
                await browser.close()

            pump = asyncio.create_task(worker_to_browser())
            try:
                async for message in browser:
                    if message.type == WSMsgType.BINARY:
                        manager.controller.touch(key)
                        await worker.send_bytes(message.data)
                    elif message.type == WSMsgType.TEXT:
                        manager.controller.touch(key)
                        await worker.send_str(message.data)
            finally:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
            return browser
        finally:
            if worker is not None:
                await worker.close()
            await client.close()

    async def startup(app):
        await manager.controller.recover()
        app[REAPER_KEY] = asyncio.create_task(manager.controller.reap_idle())

    async def cleanup(app):
        app[REAPER_KEY].cancel()
        await asyncio.gather(app[REAPER_KEY], return_exceptions=True)

    app = web.Application(middlewares=[guard], client_max_size=18_000_000)
    app.router.add_get('/health', health)
    app.router.add_post('/v1/projects/{owner}/{project}', action)
    app.router.add_get('/client/ws', websocket)
    app.on_startup.append(startup)
    app.on_cleanup.append(cleanup)
    return app


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise SystemExit('Cloud manager must own its private Docker controller and project data root')
    root = Path(os.environ.get('EDA_MANAGER_DATA', '/var/lib/vibehard-eda'))
    settings = DockerSettings(image=os.environ['EDA_MANAGER_IMAGE'])
    token = Path(os.environ['EDA_MANAGER_TOKEN_FILE']).read_text().strip()
    access_url = os.environ.get('EDA_MANAGER_ACCESS_URL', 'http://127.0.0.1:3210/vibehard/api/eda/desktop/{project}/access')
    origins = set(os.environ.get('EDA_MANAGER_ORIGINS', 'https://ldcx.tech').split(','))
    hosts = os.environ.get('EDA_MANAGER_HOSTS', '127.0.0.1').split(',')
    if any(host == '0.0.0.0' or not ipaddress.ip_address(host).is_private for host in hosts):
        raise SystemExit('Cloud manager may bind only private host addresses')
    controller = DockerController(root, settings)
    manager = CloudManager(controller, TicketStore(root / 'tickets.sqlite3'), access_url, origins)
    web.run_app(create_app(manager, token), host=hosts, port=int(os.environ.get('EDA_MANAGER_PORT', '6083')), access_log=None)
