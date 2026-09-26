import tempfile
import unittest
from unittest.mock import AsyncMock
from pathlib import Path
from server import TicketStore, ProjectFiles, DesktopError, DesktopRuntime, container_bind, create_app

OWNER = '11111111-1111-4111-8111-111111111111'
PROJECT = '22222222-2222-4222-8222-222222222222'


class DesktopBoundaries(unittest.TestCase):
    def test_public_bind_requires_explicit_container_mode(self):
        self.assertEqual(container_bind({}), '127.0.0.1')
        self.assertEqual(container_bind({'EDA_DESKTOP_CONTAINER': '1', 'EDA_DESKTOP_BIND': '0.0.0.0'}, in_container=True), '0.0.0.0')
        with self.assertRaises(DesktopError):
            container_bind({'EDA_DESKTOP_BIND': '0.0.0.0'})
        with self.assertRaises(DesktopError):
            container_bind({'EDA_DESKTOP_CONTAINER': '1', 'EDA_DESKTOP_BIND': '0.0.0.0'}, in_container=False)
        with self.assertRaises(DesktopError):
            container_bind({'EDA_DESKTOP_CONTAINER': '1', 'EDA_DESKTOP_BIND': '192.0.2.1'})

    def test_initialization_adds_official_library_tables_without_overwriting_user_tables(self):
        with tempfile.TemporaryDirectory() as root:
            templates = Path(root) / 'templates'
            templates.mkdir()
            (templates / 'sym-lib-table').write_text('(sym_lib_table (lib (name "Device")))')
            (templates / 'fp-lib-table').write_text('(fp_lib_table (lib (name "Resistor_SMD")))')
            files = ProjectFiles(Path(root) / 'projects', templates=templates)
            path = files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch)', 'pcb': '(kicad_pcb)'})
            self.assertEqual((path / 'sym-lib-table').read_text(), (templates / 'sym-lib-table').read_text())
            (path / 'sym-lib-table').write_text('(sym_lib_table user-edited)')
            files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch new)', 'pcb': '(kicad_pcb new)'})
            self.assertEqual((path / 'sym-lib-table').read_text(), '(sym_lib_table user-edited)')
            self.assertEqual((path / 'fp-lib-table').read_text(), (templates / 'fp-lib-table').read_text())

    def test_ticket_is_single_use_expiring_and_scoped(self):
        tickets = TicketStore()
        token = tickets.issue(PROJECT, now=100)
        self.assertEqual(tickets.consume(token, now=110), PROJECT)
        with self.assertRaises(DesktopError):
            tickets.consume(token, now=111)
        token = tickets.issue(PROJECT, now=100)
        with self.assertRaises(DesktopError):
            tickets.consume(token, now=161)

    def test_initialization_never_overwrites_saved_native_files(self):
        with tempfile.TemporaryDirectory() as root:
            files = ProjectFiles(Path(root))
            path = files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch first)', 'pcb': '(kicad_pcb first)'})
            (path / 'circuit.kicad_sch').write_text('(kicad_sch edited)')
            files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch replacement)', 'pcb': '(kicad_pcb replacement)'})
            self.assertEqual((path / 'circuit.kicad_sch').read_text(), '(kicad_sch edited)')

    def test_rejects_path_traversal_and_second_owner(self):
        with tempfile.TemporaryDirectory() as root:
            files = ProjectFiles(Path(root))
            with self.assertRaises(DesktopError):
                files.directory(OWNER, '../escape')
            files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch)', 'pcb': '(kicad_pcb)'})
            with self.assertRaises(DesktopError):
                files.initialize(PROJECT, PROJECT, {'schematic': '(kicad_sch)', 'pcb': '(kicad_pcb)'})

    def test_import_validates_both_files_before_writing(self):
        with tempfile.TemporaryDirectory() as root:
            files = ProjectFiles(Path(root))
            with self.assertRaises(DesktopError):
                files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch)', 'pcb': 'bad input'})
            self.assertFalse((Path(root) / OWNER / PROJECT / 'circuit.kicad_sch').exists())


class CheckFailures(unittest.IsolatedAsyncioTestCase):
    async def test_drc_checks_schematic_parity_from_the_saved_project(self):
        with tempfile.TemporaryDirectory() as root:
            runtime = DesktopRuntime(Path(root))
            runtime.files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch)', 'pcb': '(kicad_pcb)'})
            async def report(args, **_):
                Path(args[args.index('-o') + 1]).write_text('{"violations": [], "schematic_parity": []}')
                return (0, b'', b'')
            runtime.run = AsyncMock(side_effect=report)
            await runtime.check(OWNER, PROJECT, 'drc')
            self.assertIn('--schematic-parity', runtime.run.call_args.args[0])

    async def test_failed_check_cannot_return_a_previous_report(self):
        with tempfile.TemporaryDirectory() as root:
            runtime = DesktopRuntime(Path(root))
            path = runtime.files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch)', 'pcb': '(kicad_pcb)'})
            (path / '.erc-report.json').write_text('{"stale": true}')
            runtime.run = AsyncMock(return_value=(1, b'', b'failed'))
            with self.assertRaises(DesktopError):
                await runtime.check(OWNER, PROJECT, 'erc')

    async def test_snapshot_exports_netlist_from_the_saved_schematic_without_rewriting_it(self):
        with tempfile.TemporaryDirectory() as root:
            runtime = DesktopRuntime(Path(root))
            path = runtime.files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch saved)', 'pcb': '(kicad_pcb)'})
            source = path / 'circuit.kicad_sch'
            async def netlist(args, **_):
                Path(args[args.index('-o') + 1]).write_text('(export (nets))')
                return (0, b'', b'')
            runtime.run = AsyncMock(side_effect=netlist)
            result = await runtime.snapshot(OWNER, PROJECT)
            self.assertEqual(result['schematic'], '(kicad_sch saved)')
            self.assertEqual(result['netlist'], '(export (nets))')
            self.assertEqual(source.read_text(), '(kicad_sch saved)')

    async def test_snapshot_rejects_a_save_during_netlist_export(self):
        with tempfile.TemporaryDirectory() as root:
            runtime = DesktopRuntime(Path(root))
            path = runtime.files.initialize(OWNER, PROJECT, {'schematic': '(kicad_sch saved)', 'pcb': '(kicad_pcb)'})
            source = path / 'circuit.kicad_sch'
            async def netlist(args, **_):
                Path(args[args.index('-o') + 1]).write_text('(export (nets))')
                source.write_text('(kicad_sch newer)')
                return (0, b'', b'')
            runtime.run = AsyncMock(side_effect=netlist)
            with self.assertRaises(DesktopError) as raised:
                await runtime.snapshot(OWNER, PROJECT)
            self.assertEqual(raised.exception.status, 409)


class BrokerHealth(unittest.IsolatedAsyncioTestCase):
    async def test_health_requires_broker_token(self):
        from aiohttp.test_utils import TestClient, TestServer
        with tempfile.TemporaryDirectory() as root:
            client = TestClient(TestServer(create_app(DesktopRuntime(Path(root)), 'a' * 32, set())))
            await client.start_server()
            try:
                self.assertEqual((await client.get('/health')).status, 401)
                response = await client.get('/health', headers={'Authorization': 'Bearer ' + 'a' * 32})
                self.assertEqual(response.status, 200)
                self.assertEqual(await response.json(), {'ok': True})
            finally:
                await client.close()


if __name__ == '__main__':
    unittest.main()
