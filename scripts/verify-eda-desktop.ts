import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import WebSocket from 'ws';

async function main() {
const base = process.env.EDA_VERIFY_ORIGIN ?? 'http://127.0.0.1:3212';
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@vibehard.ai', password: 'demo1234' }) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
const listing = await fetch(`${base}/api/projects`, { headers }).then(response => response.json());
const project = listing.projects.find((item: { name: string; id: string }) => process.argv[2] ? item.id === process.argv[2] : item.name === 'KiCad 原生编辑验收');
assert.ok(project, 'First create the browser acceptance project');
const endpoint = `${base}/api/eda/desktop/${project.id}`;
const call = async (body: object, extra = headers) => fetch(endpoint, { method: 'POST', headers: extra, body: JSON.stringify(body) });
assert.equal((await call({ action: 'status' }, { ...headers, Cookie: '' })).status, 401);
assert.equal((await call({ action: 'status' }, { ...headers, Origin: 'https://untrusted.example' })).status, 403);
const before = await call({ action: 'status' }).then(response => response.json());
assert.ok(before.files.length >= 3);
const start = await call({ action: 'start', editor: 'pcb' }).then(response => response.json());
assert.ok(start.ticket);
const socketUrl = new URL('/eda-desktop/ws', base); socketUrl.protocol = base.startsWith('https:') ? 'wss:' : 'ws:'; socketUrl.searchParams.set('ticket', start.ticket);
const handshake = () => new Promise<string | number>((resolve, reject) => {
  const socket = new WebSocket(socketUrl, { headers: { Origin: base }, handshakeTimeout: 5000 });
  socket.once('message', buffer => { socket.close(); resolve(buffer.toString().slice(0, 3)); });
  socket.once('unexpected-response', (_, response) => { response.resume(); socket.terminate(); resolve(response.statusCode ?? 0); });
  socket.on('error', () => reject(new Error('WebSocket handshake failed')));
});
assert.equal(await handshake(), 'RFB');
assert.equal(await handshake(), 401);
const archive = await call({ action: 'archive' }); assert.equal(archive.status, 200);
const bytes = new Uint8Array(await archive.arrayBuffer());
const entries = unzipSync(bytes);
assert.match(strFromU8(entries['circuit.kicad_sch']), /470R/);
assert.match(strFromU8(entries['circuit.kicad_pcb']), /R_0603_1608Metric/);
const checks: { kind: string; exitCode: number }[] = [];
for (const kind of ['erc', 'drc']) {
  const response = await call({ action: 'check', kind }); assert.equal(response.status, 200);
  const result = await response.json(); assert.ok(result.report); assert.ok([0, 5].includes(result.exitCode));
  checks.push({ kind, exitCode: result.exitCode });
}
const after = await call({ action: 'status' }).then(response => response.json());
assert.deepEqual(after.files, before.files, 'Reconnect/check/export must not change native source files');
await mkdir('.eda-data', { recursive: true });
await writeFile('.eda-data/desktop-verification.zip', bytes);
console.log(JSON.stringify({ project: project.id, savedNativeFiles: Object.keys(entries), websocket: 'RFB handshake', replayRejected: true, auth: '401/403', checks, sourcesUnchanged: true }, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Desktop verification failed'); process.exitCode = 1; });
