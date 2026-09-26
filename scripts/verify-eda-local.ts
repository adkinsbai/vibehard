/** Explicit local-only integration check. Creates a disposable development project. */
import assert from 'node:assert/strict';
import { engineeringFixture } from '../__tests__/fixtures/eda-engineering';
import { exportKicadSchematic } from '../lib/eda/kicad';
import { unzipSync } from 'fflate';

async function main() {
  const origin = new URL(process.argv[2] || 'http://127.0.0.1:3212');
  assert(['localhost', '127.0.0.1'].includes(origin.hostname), 'This check is local-only');
  let cookie = '';
  const send = async (path: string, method = 'GET', body?: unknown, authenticated = true) => {
    const response = await fetch(new URL(path, origin), { method, headers: { 'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    return { response, data };
  };
  assert.equal((await send('/api/eda/capabilities', 'GET', undefined, false)).response.status, 401);
  const login = await send('/api/auth/login', 'POST', { email: 'demo@vibehard.ai', password: 'demo1234' });
  assert.equal(login.response.status, 200);
  cookie = login.response.headers.getSetCookie().find(value => value.startsWith('vibehard_session='))!.split(';')[0];
  const created = await send('/api/projects', 'POST', { name: 'EDA integration check', workspaceKey: `eda-check-${Date.now()}` });
  assert.equal(created.response.status, 201);
  const path = `/api/eda/projects/${created.data.project.id}`;
  const document = engineeringFixture();
  const saved = await send(path, 'PUT', { document, expectedVersion: null });
  assert.equal(saved.response.status, 200); assert.equal(saved.data.version, 1);
  assert.equal((await send(path, 'PUT', { document, expectedVersion: null })).response.status, 409);
  const loaded = await send(path); assert.deepEqual(loaded.data.document, document);
  assert.equal((await send(path, 'GET', undefined, false)).response.status, 401);
  const capabilities = await send('/api/eda/capabilities');
  assert.equal(capabilities.response.status, 200);
  const checks: Record<string, unknown> = {};
  for (const kind of ['erc', 'drc']) {
    const result = await send('/api/eda/check', 'POST', { document, kind });
    assert.equal(result.response.status, 200);
    if (capabilities.data.kicad) {
      assert.equal(result.data.available, true);
      assert(result.data.report, `${kind} must return an actual report`);
    }
    checks[kind] = { available: result.data.available, exitCode: result.data.exitCode, hasReport: Boolean(result.data.report) };
  }
  if (!capabilities.data.agent) assert.equal((await send('/api/eda/agent', 'POST', { document, prompt: '把电路名称改为测试电路' })).response.status, 503);
  let nativeImport = false; let artifactCount = 0;
  if (capabilities.data.kicad) {
    const imported = await send('/api/eda/import', 'POST', { source: exportKicadSchematic(document) });
    assert.equal(imported.response.status, 200); assert.equal(imported.data.document.components.length, document.components.length); nativeImport = true;
    const archive = await fetch(new URL('/api/eda/export', origin), { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ document }) });
    assert.equal(archive.status, 200); artifactCount = Object.keys(unzipSync(new Uint8Array(await archive.arrayBuffer()))).length;
    assert(artifactCount > 10);
  }
  console.log(JSON.stringify({ project: created.data.project.id, saveReload: true, staleWriteRejected: true, anonymousRejected: true, nativeImport, artifactCount, capabilities: capabilities.data, checks, modelCallTested: false }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Check failed'); process.exitCode = 1; });
