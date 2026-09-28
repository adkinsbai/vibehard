import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from routing import RouteJobs, RoutingError, collect_source_files, digest, drc_summary, require_complete_routing, require_portable_library_table
from server import ProjectFiles

OWNER = '11111111-1111-4111-8111-111111111111'
PROJECT = '22222222-2222-4222-8222-222222222222'
OTHER = '33333333-3333-4333-8333-333333333333'


class RoutingBoundaries(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.files = ProjectFiles(self.root)
        self.source = self.files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch source)', 'pcb': '(kicad_pcb source)'})
        self.jobs = RouteJobs(self.root)

    async def asyncTearDown(self):
        for task in self.jobs.active.values():
            task.cancel()
        await asyncio.gather(*self.jobs.active.values(), return_exceptions=True)
        self.temp.cleanup()

    async def test_start_requires_saved_files_and_rejects_duplicate_active_job(self):
        event = asyncio.Event()

        async def hold(*_):
            await event.wait()

        with patch.object(self.jobs, '_execute', side_effect=hold):
            first = await self.jobs.start(OWNER, PROJECT, self.source)
            self.assertEqual(first['state'], 'queued')
            with self.assertRaises(RoutingError) as duplicate:
                await self.jobs.start(OWNER, PROJECT, self.source)
            self.assertEqual(duplicate.exception.status, 429)
            with self.assertRaises(RoutingError) as other_owner:
                self.jobs.status(OTHER, PROJECT, first['jobId'])
            self.assertEqual(other_owner.exception.status, 404)
            event.set()
            await asyncio.sleep(0)

    async def test_candidate_is_immutable_copy_and_checks_both_source_hashes(self):
        job_id = '44444444-4444-4444-8444-444444444444'
        path = self.jobs._directory(OWNER, PROJECT, job_id)
        (path / 'candidate').mkdir(parents=True)
        schematic = (self.source / 'circuit.kicad_sch').read_bytes()
        board = (self.source / 'circuit.kicad_pcb').read_bytes()
        candidate = b'(kicad_pcb routed)'
        (path / 'candidate' / 'circuit.kicad_pcb').write_bytes(candidate)
        self.jobs._write_state(path, {'jobId': job_id, 'state': 'ready',
                                      'sourceSha256': digest(board), 'sourceSchematicSha256': digest(schematic),
                                      'sourceFilesSha256': {name: digest(data) for name, data in collect_source_files(self.source).items()},
                                      'candidateSha256': digest(candidate),
                                      'before': {'unconnected': 2}, 'after': {'unconnected': 0}})
        response = self.jobs.candidate(OWNER, PROJECT, job_id, self.source)
        self.assertEqual(response['sources']['pcb'], candidate.decode())
        self.assertEqual(response['sources']['project'], '{}')
        self.assertEqual((self.source / 'circuit.kicad_pcb').read_bytes(), board)
        with self.assertRaises(RoutingError) as isolation:
            self.jobs.candidate(OTHER, PROJECT, job_id, self.source)
        self.assertEqual(isolation.exception.status, 404)
        (self.source / 'circuit.kicad_sch').write_text('(kicad_sch changed)')
        with self.assertRaises(RoutingError) as changed:
            self.jobs.candidate(OWNER, PROJECT, job_id, self.source)
        self.assertEqual(changed.exception.status, 409)
        (self.source / 'circuit.kicad_sch').write_bytes(schematic)
        (self.source / 'circuit.kicad_pcb').write_text('(kicad_pcb changed)')
        with self.assertRaises(RoutingError) as board_changed:
            self.jobs.candidate(OWNER, PROJECT, job_id, self.source)
        self.assertEqual(board_changed.exception.status, 409)

    async def test_incomplete_job_from_previous_worker_is_reported_failed(self):
        job_id = '55555555-5555-4555-8555-555555555555'
        path = self.jobs._directory(OWNER, PROJECT, job_id)
        path.mkdir(parents=True)
        self.jobs._write_state(path, {'jobId': job_id, 'state': 'running'})
        state = RouteJobs(self.root).status(OWNER, PROJECT, job_id)
        self.assertEqual(state['state'], 'failed')

    async def test_route_storage_counts_saved_project_and_retained_jobs(self):
        job_id = '66666666-6666-4666-8666-666666666666'
        path = self.jobs._directory(OWNER, PROJECT, job_id)
        path.mkdir(parents=True)
        (path / 'large.ses').write_bytes(b'x' * 64)
        with patch('routing.MAX_JOB_BYTES', 32):
            with self.assertRaises(RoutingError) as job_full:
                self.jobs._check_storage(path)
        self.assertEqual(job_full.exception.status, 507)
        with patch('routing.MAX_WORKER_DATA', 64):
            with self.assertRaises(RoutingError) as worker_full:
                self.jobs._check_storage()
        self.assertEqual(worker_full.exception.status, 507)


class DrcValidation(unittest.TestCase):
    def test_library_table_rejects_project_local_or_absolute_paths(self):
        for uri in ('${KIPRJMOD}/private.kicad_sym', '/etc/passwd', '${CUSTOM}/Device.kicad_sym'):
            table = f'(sym_lib_table (lib (name "Device") (type "KiCad") (uri "{uri}") (options "") (descr "")))'
            with self.assertRaises(RoutingError):
                require_portable_library_table('sym-lib-table', table.encode())
        allowed = b'(sym_lib_table (lib (name "Device") (type "KiCad") (uri "${KICAD9_SYMBOL_DIR}/Device.kicad_sym") (options "") (descr "")))'
        require_portable_library_table('sym-lib-table', allowed)

    def test_partial_routing_is_rejected_even_when_it_improves(self):
        before = {'unconnected': 100, 'schematicParity': 0, 'violations': {}, 'violationSignatures': {}}
        after = {'unconnected': 99, 'schematicParity': 0, 'violations': {}, 'violationSignatures': {}}
        with self.assertRaises(RoutingError) as partial:
            require_complete_routing(before, after)
        self.assertEqual(partial.exception.status, 422)
        self.assertIn('99', str(partial.exception))

    def test_rejects_incomplete_or_excluded_native_reports(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'drc.json'
            path.write_text('{"violations":[],"unconnected_items":[],"schematic_parity":[]}')
            with self.assertRaises(RoutingError):
                drc_summary(path)


if __name__ == '__main__':
    unittest.main()
