"""Acceptance probe for an isolated candidate DB and private KiCad manager.

Run only on the EDA deployment host. It creates three disposable accounts in a
database whose name begins with vibehard_eda_acceptance_, never in production.
"""

import asyncio
import io
import json
import secrets
import sys
import urllib.error
import urllib.request
import zipfile
from hashlib import sha256
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import ClientSession, WSServerHandshakeError

BASE = 'http://127.0.0.1:3211/vibehard'
ORIGIN = 'https://ldcx.tech'
ENV_FILE = Path('/etc/vibehard/eda-candidate.env')
STATE_FILE = Path('/tmp/vibehard-eda-acceptance-state.json')


def env_value(name):
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith(name + '='):
            return line.partition('=')[2].strip().strip('"').strip("'")
    raise RuntimeError(f'Missing candidate setting: {name}')


def request(method, path, payload=None, cookie=None, origin=False):
    headers = {'Host': 'ldcx.tech', 'X-Forwarded-Proto': 'https'}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    if cookie:
        headers['Cookie'] = cookie
    if origin:
        headers['Origin'] = ORIGIN
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=135) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def expect(status, actual, body):
    if actual != status:
        raise RuntimeError(f'Expected HTTP {status}, got {actual}: {body[:250]!r}')


async def probe_websocket(ticket, cookie, expected_status=None):
    async with ClientSession() as client:
        url = f'http://127.0.0.1:6083/client/ws?ticket={ticket}'
        try:
            async with client.ws_connect(url, headers={'Origin': ORIGIN, 'Cookie': cookie}, timeout=15) as ws:
                if expected_status:
                    raise RuntimeError(f'Expected WebSocket denial {expected_status}')
                message = await ws.receive(timeout=15)
                if message.type.name != 'BINARY' or not message.data.startswith(b'RFB '):
                    raise RuntimeError('KiCad RFB handshake missing')
        except WSServerHandshakeError as error:
            if error.status != expected_status:
                raise


async def main():
    database = urlsplit(env_value('DATABASE_URL')).path.lstrip('/')
    if not database.startswith('vibehard_eda_acceptance_'):
        raise RuntimeError('Refusing to create test accounts outside an isolated EDA acceptance database')
    invite = env_value('INVITE_CODES').split(',')[0]
    accounts = []
    for index in range(3):
        suffix = secrets.token_hex(5)
        email = f'eda-acceptance-{suffix}@example.invalid'
        status, headers, body = request('POST', '/api/auth/register', {
            'email': email, 'password': secrets.token_urlsafe(24), 'inviteCode': invite,
        })
        expect(201, status, body)
        owner = json.loads(body)['user']['id']
        cookie = None
        for raw in headers.get_all('Set-Cookie', []):
            parsed = SimpleCookie()
            parsed.load(raw)
            item = parsed.get('vibehard_session')
            if item and item.value and item['path'] == '/vibehard':
                cookie = f'vibehard_session={item.value}'
        if not cookie:
            raise RuntimeError('Registration did not issue a scoped session cookie')
        status, _, body = request('POST', '/api/projects', {
            'name': f'EDA cloud acceptance {index + 1}', 'workspaceKey': f'eda-acceptance-{suffix}',
        }, cookie)
        expect(201, status, body)
        project = json.loads(body)['project']['id']
        status, _, body = request('GET', f'/api/eda/desktop/{project}/access', cookie=cookie)
        expect(200, status, body)
        access = json.loads(body)
        if access != {'owner': owner, 'project': project}:
            raise RuntimeError('Project ownership response mismatch')
        accounts.append({'owner': owner, 'project': project, 'cookie': cookie})

    first, second, third = accounts
    status, _, body = request('GET', f"/api/eda/desktop/{second['project']}/access", cookie=first['cookie'])
    expect(404, status, body)
    status, _, body = request('POST', f"/api/eda/desktop/{second['project']}", {'action': 'start'}, first['cookie'], True)
    expect(404, status, body)

    for account in accounts:
        status, _, body = request('POST', f"/api/eda/desktop/{account['project']}", {'action': 'start'}, account['cookie'], True)
        expect(200, status, body)
        result = json.loads(body)
        if not result.get('running') or result.get('mode') != 'cloud-isolated':
            raise RuntimeError('Cloud KiCad worker did not start')
        account['ticket'] = result['ticket']

    await probe_websocket(first['ticket'], second['cookie'], expected_status=403)
    await asyncio.gather(*(probe_websocket(account['ticket'], account['cookie']) for account in accounts))
    await probe_websocket(first['ticket'], first['cookie'], expected_status=401)

    # A second tab for the same owner/project reuses the desktop and receives a new ticket.
    status, _, body = request('POST', f"/api/eda/desktop/{first['project']}", {'action': 'start'}, first['cookie'], True)
    expect(200, status, body)
    await probe_websocket(json.loads(body)['ticket'], first['cookie'])

    for account in accounts:
        project = account['project']
        status, _, body = request('POST', f'/api/eda/desktop/{project}', {'action': 'check', 'kind': 'erc'}, account['cookie'], True)
        expect(200, status, body)
        account['erc'] = json.loads(body)['exitCode']
        status, _, body = request('POST', f'/api/eda/desktop/{project}', {'action': 'check', 'kind': 'drc'}, account['cookie'], True)
        expect(200, status, body)
        account['drc'] = json.loads(body)['exitCode']
        status, _, body = request('POST', f'/api/eda/desktop/{project}', {'action': 'archive'}, account['cookie'], True)
        expect(200, status, body)
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            for name, digest in manifest['files'].items():
                if sha256(archive.read(name)).hexdigest() != digest:
                    raise RuntimeError('Archive hash does not match saved file')
            account['archiveFiles'] = len(manifest['files'])

    STATE_FILE.write_text(json.dumps(accounts))
    STATE_FILE.chmod(0o600)
    print(json.dumps({
        'accounts': len(accounts), 'isolatedDatabase': database,
        'crossAccountAccess': 404, 'wrongCookieWebSocket': 403, 'replayWebSocket': 401,
        'rfbHandshake': 'RFB', 'checks': [{'erc': account['erc'], 'drc': account['drc'], 'archiveFiles': account['archiveFiles']} for account in accounts],
    }))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(f'EDA cloud acceptance failed: {error}', file=sys.stderr)
        raise
