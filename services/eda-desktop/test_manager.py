import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from manager import CloudManager, DockerController, DockerSettings, ManagerError, ProjectKey, TicketStore, container_command, create_app

OWNER_A = '11111111-1111-4111-8111-111111111111'
OWNER_B = '33333333-3333-4333-8333-333333333333'
PROJECT_A = '22222222-2222-4222-8222-222222222222'
PROJECT_B = '44444444-4444-4444-8444-444444444444'


class ProjectIdentity(unittest.TestCase):
    def test_project_paths_and_container_names_are_scoped_to_both_ids(self):
        with tempfile.TemporaryDirectory() as root:
            a = ProjectKey(OWNER_A, PROJECT_A)
            b = ProjectKey(OWNER_B, PROJECT_A)
            c = ProjectKey(OWNER_A, PROJECT_B)
            self.assertEqual(a.project_root(Path(root)), Path(root).resolve() / 'projects' / OWNER_A / PROJECT_A)
            self.assertEqual(a.container_name, ProjectKey(OWNER_A, PROJECT_A).container_name)
            self.assertEqual(len({a.container_name, b.container_name, c.container_name}), 3)
            for key in (b, c):
                self.assertNotEqual(a.project_root(Path(root)), key.project_root(Path(root)))
        with self.assertRaises(ManagerError):
            ProjectKey(OWNER_A, '../outside')
        with self.assertRaises(ManagerError):
            ProjectKey('bad-owner', PROJECT_A)

    def test_container_command_never_mounts_another_project_or_publishes_ports(self):
        with tempfile.TemporaryDirectory() as root:
            key = ProjectKey(OWNER_A, PROJECT_A)
            project_root = key.project_root(Path(root))
            settings = DockerSettings(image='vibehard-eda-worker:test', network='eda-private')
            args = container_command(settings, key, project_root)
            joined = ' '.join(args)
            self.assertIn('type=bind,src=' + str(project_root / 'data') + ',dst=/data', joined)
            self.assertIn('--network eda-private', joined)
            self.assertIn('--memory 1280m', joined)
            self.assertIn('--user 10001:10001', joined)
            self.assertIn('--cap-drop ALL', joined)
            self.assertNotIn(' -p ', joined)
            self.assertNotIn(OWNER_B, joined)


class SingleUseTickets(unittest.TestCase):
    def test_ticket_is_single_use_and_owned(self):
        with tempfile.TemporaryDirectory() as root:
            tickets = TicketStore(Path(root) / 'tickets.sqlite3')
            key = ProjectKey(OWNER_A, PROJECT_A)
            tickets.issue(key, 'worker-secret', now=100)
            with self.assertRaises(ManagerError):
                tickets.consume('worker-secret', OWNER_B, now=101)
            self.assertEqual(tickets.consume('worker-secret', OWNER_A, now=101), key)
            with self.assertRaises(ManagerError):
                tickets.consume('worker-secret', OWNER_A, now=102)

    def test_expired_ticket_cannot_be_reused_after_store_restart(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'tickets.sqlite3'
            TicketStore(path).issue(ProjectKey(OWNER_A, PROJECT_A), 'expired-secret', now=100)
            tickets = TicketStore(path)
            with self.assertRaises(ManagerError):
                tickets.consume('expired-secret', OWNER_A, now=156)


class FakeController:
    def __init__(self):
        self.stopped = []
        self.started = []

    async def recover(self):
        pass

    async def reap_idle(self):
        await asyncio.Event().wait()

    async def running_ip(self, _key):
        return None

    async def ensure(self, key):
        self.started.append(key)
        return '172.30.0.2'

    async def stop(self, key):
        self.stopped.append(key)


class DockerCapacity(unittest.IsolatedAsyncioTestCase):
    async def test_global_and_per_account_limits_reject_without_starting_container(self):
        with tempfile.TemporaryDirectory() as root:
            controller = DockerController(Path(root), DockerSettings(image='test-image'))
            controller.inspect = AsyncMock(return_value=None)
            controller._check_capacity = lambda _key: None
            controller._docker = AsyncMock(return_value=b'a\nb\nc\n')
            with self.assertRaises(ManagerError) as full:
                await controller.ensure(ProjectKey(OWNER_A, PROJECT_A))
            self.assertEqual(full.exception.status, 429)
            self.assertEqual(controller._docker.call_count, 1)

            controller._docker = AsyncMock(side_effect=[b'a\n', b'a\nb\n'])
            with self.assertRaises(ManagerError) as own:
                await controller.ensure(ProjectKey(OWNER_A, PROJECT_A))
            self.assertEqual(own.exception.status, 429)
            self.assertEqual(controller._docker.call_count, 2)

    async def test_existing_project_reuses_the_running_private_container(self):
        with tempfile.TemporaryDirectory() as root:
            controller = DockerController(Path(root), DockerSettings(image='test-image'))
            controller.inspect = AsyncMock(return_value={
                'State': {'Running': True},
                'NetworkSettings': {'Networks': {'vibehard-eda-internal': {'IPAddress': '172.30.0.2'}}},
            })
            controller._check_capacity = lambda _key: None
            controller._docker = AsyncMock()
            self.assertEqual(await controller.ensure(ProjectKey(OWNER_A, PROJECT_A)), '172.30.0.2')
            controller._docker.assert_not_called()


class ManagerRoutes(unittest.IsolatedAsyncioTestCase):
    async def test_websocket_access_verifier_rechecks_project_cookie(self):
        from aiohttp import web
        from aiohttp.test_utils import TestServer
        from types import SimpleNamespace
        async def access(request):
            if request.headers.get('Cookie') != 'session=owner-a':
                return web.json_response({'error': 'not owned'}, status=404)
            return web.json_response({'owner': OWNER_A, 'project': request.match_info['project']})
        app = web.Application()
        app.router.add_get('/access/{project}', access)
        server = TestServer(app)
        await server.start_server()
        try:
            manager = CloudManager(FakeController(), None, str(server.make_url('/access/')) + '{project}', {'https://ldcx.tech'})
            key = ProjectKey(OWNER_A, PROJECT_A)
            self.assertEqual(await manager.verify_browser(SimpleNamespace(headers={'Cookie': 'session=owner-a'}), key), OWNER_A)
            with self.assertRaises(ManagerError) as denied:
                await manager.verify_browser(SimpleNamespace(headers={'Cookie': 'session=someone-else'}), key)
            self.assertEqual(denied.exception.status, 403)
        finally:
            await server.close()

    async def test_control_requires_private_token_and_start_issues_scoped_ticket(self):
        from aiohttp.test_utils import TestClient, TestServer
        with tempfile.TemporaryDirectory() as root:
            controller = FakeController()
            tickets = TicketStore(Path(root) / 'tickets.sqlite3')
            manager = CloudManager(controller, tickets, 'http://127.0.0.1/access/{project}', {'https://ldcx.tech'})
            manager._forward = AsyncMock(return_value=(200, 'application/json', b'{"running": true, "ticket": "worker-ticket"}'))
            client = TestClient(TestServer(create_app(manager, 's' * 32)))
            await client.start_server()
            try:
                path = f'/v1/projects/{OWNER_A}/{PROJECT_A}'
                self.assertEqual((await client.post(path, json={'action': 'start'})).status, 401)
                response = await client.post(path, json={'action': 'start'}, headers={'Authorization': 'Bearer ' + 's' * 32})
                self.assertEqual(response.status, 200)
                body = await response.json()
                self.assertEqual(body['ticket'], 'worker-ticket')
                self.assertEqual(body['mode'], 'cloud-isolated')
                self.assertEqual(tickets.peek('worker-ticket'), ProjectKey(OWNER_A, PROJECT_A))
                self.assertEqual(controller.started, [ProjectKey(OWNER_A, PROJECT_A)])
            finally:
                await client.close()

    async def test_websocket_rejects_other_account_without_consuming_ticket(self):
        from aiohttp.test_utils import TestClient, TestServer
        with tempfile.TemporaryDirectory() as root:
            tickets = TicketStore(Path(root) / 'tickets.sqlite3')
            tickets.issue(ProjectKey(OWNER_A, PROJECT_A), 'worker-ticket')
            manager = CloudManager(FakeController(), tickets, 'http://127.0.0.1/access/{project}', {'https://ldcx.tech'})
            manager.verify_browser = AsyncMock(return_value=OWNER_B)
            client = TestClient(TestServer(create_app(manager, 's' * 32)))
            await client.start_server()
            try:
                path = '/client/ws?ticket=worker-ticket'
                self.assertEqual((await client.get(path, headers={'Origin': 'https://foreign.example'})).status, 403)
                response = await client.get(path, headers={'Origin': 'https://ldcx.tech'})
                self.assertEqual(response.status, 403)
                self.assertEqual(tickets.peek('worker-ticket'), ProjectKey(OWNER_A, PROJECT_A))
            finally:
                await client.close()


if __name__ == '__main__':
    unittest.main()
