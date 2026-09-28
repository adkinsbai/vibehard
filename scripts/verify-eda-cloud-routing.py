"""Route and accept a disposable KiCad fixture on the isolated EDA candidate.

Run after verify-eda-cloud.py on the EDA deployment host. Both scripts refuse
to run against a database other than vibehard_eda_acceptance_*. This one reads
the prior script's root-only account state and never prints session cookies.
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
from pathlib import Path
from urllib.parse import urlsplit


BASE = 'http://127.0.0.1:3211/vibehard'
ORIGIN = 'https://ldcx.tech'
ENV_FILE = Path('/etc/vibehard/eda-candidate.env')
STATE_FILE = Path('/tmp/vibehard-eda-acceptance-state.json')
FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'eda-routing'


def env_value(name):
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith(name + '='):
            return line.partition('=')[2].strip().strip('"').strip("'")
    raise RuntimeError(f'Missing candidate setting: {name}')


def request(method, path, payload, cookie):
    headers = {'Host': 'ldcx.tech', 'X-Forwarded-Proto': 'https',
               'Origin': ORIGIN, 'Cookie': cookie, 'Content-Type': 'application/json'}
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=140) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def expect(status, response):
    actual, body = response
    if actual != status:
        raise RuntimeError(f'Expected HTTP {status}, got {actual}: {body[:200]!r}')
    return json.loads(body)


def desktop(account, project, action):
    return request('POST', f'/api/eda/desktop/{project}', action, account['cookie'])


def archived(account, project):
    status, body = desktop(account, project, {'action': 'archive'})
    if status != 200:
        raise RuntimeError(f'Archive failed: HTTP {status}: {body[:200]!r}')
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        return {name: archive.read(name) for name in manifest['files']}


async def main():
    database = urlsplit(env_value('DATABASE_URL')).path.lstrip('/')
    if not database.startswith('vibehard_eda_acceptance_'):
        raise RuntimeError('Refusing routing acceptance outside an isolated EDA database')
    if not STATE_FILE.is_file() or STATE_FILE.stat().st_mode & 0o077:
        raise RuntimeError('Missing or non-private three-account acceptance state')
    accounts = json.loads(STATE_FILE.read_text())
    if len(accounts) != 3 or len({row['owner'] for row in accounts}) != 3:
        raise RuntimeError('Run the three-account EDA acceptance first')
    source = {
        'schematic': (FIXTURE / 'circuit.kicad_sch').read_text(),
        'pcb': (FIXTURE / 'circuit.kicad_pcb').read_text(),
    }
    if len(source['schematic']) > 900_000 or len(source['pcb']) > 900_000:
        raise RuntimeError('Routing fixture exceeds the desktop API limit')
    first, second, _ = accounts
    # Release one of the three running desktops; stopping never deletes its files.
    expect(200, desktop(first, first['project'], {'action': 'stop'}))
    suffix = secrets.token_hex(5)
    created = expect(201, request('POST', '/api/projects', {
        'name': 'EDA isolated routing acceptance', 'workspaceKey': f'eda-route-{suffix}',
    }, first['cookie']))
    project = created['project']['id']
    expect(200, desktop(first, project, {'action': 'start', 'sources': source, 'editor': 'pcb'}))
    before_files = archived(first, project)
    if before_files['circuit.kicad_pcb'] != source['pcb'].encode():
        raise RuntimeError('Fixture board was changed during project creation')
    started = expect(200, desktop(first, project, {'action': 'routeStart'}))
    job_id = started['jobId']
    status, _ = desktop(second, project, {'action': 'routeStatus', 'jobId': job_id})
    if status != 404:
        raise RuntimeError(f'Cross-account routing job was not hidden: HTTP {status}')
    for _ in range(115):
        state = expect(200, desktop(first, project, {'action': 'routeStatus', 'jobId': job_id}))
        if state['state'] in ('ready', 'failed'):
            break
        await asyncio.sleep(3)
    else:
        raise RuntimeError('Routing job did not finish within 345 seconds')
    if state['state'] != 'ready':
        raise RuntimeError(f'Routing failed: {state.get("error", "unknown error")}')
    candidate = expect(200, desktop(first, project, {'action': 'routeCandidate', 'jobId': job_id}))
    if not candidate['sources'].get('project'):
        raise RuntimeError('Routing candidate omitted the native KiCad project configuration')
    if candidate['sources']['schematic'] != source['schematic']:
        raise RuntimeError('Candidate schematic differs from the source')
    if candidate['sources']['pcb'] == source['pcb']:
        raise RuntimeError('Routing candidate did not change the PCB')
    if state['before']['unconnected'] < 1 or state['after']['unconnected'] != 0:
        raise RuntimeError('Unconnected-item routing acceptance failed')
    if state['after']['schematicParity'] != 0 or state['after']['violations'] != state['before']['violations']:
        raise RuntimeError('Routing introduced schematic parity or DRC violations')
    after_files = archived(first, project)
    if after_files['circuit.kicad_sch'] != before_files['circuit.kicad_sch'] or after_files['circuit.kicad_pcb'] != before_files['circuit.kicad_pcb']:
        raise RuntimeError('Routing modified the original native project')
    expect(200, desktop(first, project, {'action': 'stop'}))
    accepted = expect(201, request('POST', '/api/projects', {
        'name': 'EDA accepted routing candidate', 'workspaceKey': f'eda-accepted-{suffix}',
    }, first['cookie']))
    accepted_project = accepted['project']['id']
    expect(200, desktop(first, accepted_project, {'action': 'start', 'sources': candidate['sources'], 'verifySources': True, 'editor': 'pcb'}))
    expect(200, desktop(first, accepted_project, {'action': 'start', 'sources': candidate['sources'], 'verifySources': True, 'editor': 'pcb'}))
    accepted_files = archived(first, accepted_project)
    expected_files = {'schematic': 'circuit.kicad_sch', 'pcb': 'circuit.kicad_pcb',
                      'project': 'circuit.kicad_pro', 'symLibTable': 'sym-lib-table',
                      'fpLibTable': 'fp-lib-table', 'designRules': 'circuit.kicad_dru'}
    for key, filename in expected_files.items():
        if key in candidate['sources'] and accepted_files.get(filename) != candidate['sources'][key].encode():
            raise RuntimeError(f'Accepted project changed native file: {filename}')
    status, _ = desktop(second, accepted_project, {'action': 'archive'})
    if status != 404:
        raise RuntimeError(f'Accepted project leaked to another account: HTTP {status}')
    print(json.dumps({
        'isolatedDatabase': database, 'routingState': state['state'],
        'beforeUnconnected': state['before']['unconnected'],
        'afterUnconnected': state['after']['unconnected'],
        'sourcePcbSha256': sha256(before_files['circuit.kicad_pcb']).hexdigest(),
        'candidatePcbSha256': sha256(accepted_files['circuit.kicad_pcb']).hexdigest(),
        'originalPreserved': True, 'acceptedAsNewOwnedProject': True,
        'crossAccountRouteAndArchive': 404,
    }))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(f'EDA routing acceptance failed: {error}', file=sys.stderr)
        raise
