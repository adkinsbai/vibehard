"""Run the real worker routing job against an isolated native KiCad fixture.

Usage: python3 verify_routing.py <unrouted-source-dir> <freerouting-jar>
"""

import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path

import routing
from routing import RouteJobs, digest
from server import ProjectFiles

OWNER = '11111111-1111-4111-8111-111111111111'
PROJECT = '22222222-2222-4222-8222-222222222222'
DESTINATION = '33333333-3333-4333-8333-333333333333'


async def main(source_dir, jar):
    routing.JAR = Path(jar).resolve()
    if digest(routing.JAR.read_bytes()) != routing.JAR_SHA256:
        raise RuntimeError('Freerouting jar digest mismatch')
    with tempfile.TemporaryDirectory(prefix='vibehard-worker-route-') as root:
        project = Path(root) / OWNER / PROJECT
        project.mkdir(parents=True)
        for extension in ('kicad_sch', 'kicad_pcb', 'kicad_pro'):
            shutil.copyfile(Path(source_dir) / f'design.{extension}', project / f'circuit.{extension}')
        shutil.copyfile(Path(source_dir) / 'sym-lib-table', project / 'sym-lib-table')
        original = digest((project / 'circuit.kicad_pcb').read_bytes())
        jobs = RouteJobs(root)
        started = await jobs.start(OWNER, PROJECT, project)
        job_id = started['jobId']
        for _ in range(420):
            await asyncio.sleep(1)
            state = jobs.status(OWNER, PROJECT, job_id)
            if state['state'] in ('ready', 'failed'):
                break
        else:
            raise RuntimeError('Job did not complete within 420 seconds')
        if state['state'] != 'ready':
            raise RuntimeError(f'Routing failed: {state}')
        candidate = jobs.candidate(OWNER, PROJECT, job_id, project)
        files = ProjectFiles(Path(root))
        accepted = files.initialize(OWNER, DESTINATION, candidate['sources'], verify_sources=True)
        files.initialize(OWNER, DESTINATION, candidate['sources'], verify_sources=True)
        for field, filename in [('schematic', 'circuit.kicad_sch'), ('pcb', 'circuit.kicad_pcb'),
                                ('project', 'circuit.kicad_pro'), ('symLibTable', 'sym-lib-table'),
                                ('fpLibTable', 'fp-lib-table'), ('designRules', 'circuit.kicad_dru')]:
            if field in candidate['sources']:
                assert (accepted / filename).read_text(encoding='utf-8') == candidate['sources'][field]
        assert original == digest((project / 'circuit.kicad_pcb').read_bytes())
        assert candidate['before']['unconnected'] > candidate['after']['unconnected']
        assert candidate['after']['unconnected'] == 0
        print(json.dumps({'state': state['state'], 'before': state['before'], 'after': state['after'],
                          'sourceSha256': original, 'candidateSha256': state['candidateSha256'],
                          'sourcePreserved': True, 'candidateAcceptedIntoSeparateProject': True}, indent=2))


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1], sys.argv[2]))
