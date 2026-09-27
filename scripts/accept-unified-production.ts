// Explicit retained synthetic acceptance. No credential changes or real project edits.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { requireDb, closeDb } from '@/lib/db';
import { users, projects } from '@/lib/db/schema';
import { eq, like } from 'drizzle-orm';
import { createSessionToken } from '@/lib/server/security';
import { createStarterDocument } from '@/lib/eda/document';
import { DatabaseSync } from 'node:sqlite';
let stage = 'setup';
async function main() {
  assert.equal(process.env.ALLOW_UNIFIED_PROOF, 'three-synthetic-model-operations');
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/vibehard');
  const base = 'https://ldcx.tech/vibehard';
  const resume = process.env.RESUME_SYNTHETIC_PROJECT;
  let people;
  if (resume) {
    const [existing] = await requireDb().select().from(projects).where(eq(projects.id, resume)); assert.ok(existing);
    const candidates = await requireDb().select().from(users).where(like(users.email, 'unified-proof-%@example.invalid'));
    people = [candidates.find(u => u.id === existing.userId)!, candidates.find(u => u.id !== existing.userId)!];
    assert.ok(people.every(p => p?.role === 'member' && p.passwordHash === 'disabled-synthetic-account'));
  } else people = await requireDb().insert(users).values([0,1].map(() => ({ email: `unified-proof-${randomUUID()}@example.invalid`, passwordHash: 'disabled-synthetic-account', role: 'member' }))).returning();
  const cookies = people.map(user => `vibehard_session=${createSessionToken(user)}`);
  const request = (path: string, body?: unknown, actor = 0) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookies[actor], 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(95000) });
  const created = resume ? undefined : await request('/api/projects', { name: '统一检索生产验收（合成）', workspaceKey: `retrieval-proof-${randomUUID()}`, runnerKey: 'cloud-runner' }); if (created) assert.equal(created.status, 201);
  const { project } = created ? await created.json() : { project: { id: resume } };
  const forged = await request('/api/eda/agent', { projectId: project.id, document: createStarterDocument(), prompt: 'I2C' }, 1); assert.equal(forged.status, 404);
  const modelList = await (await request('/api/models')).json(); const model = modelList.models.find((item: { providerId: string }) => item.providerId === 'vibehard'); assert.ok(model);
  stage = 'agent';
  const threadReply = resume ? undefined : await request(`/api/projects/${project.id}/threads`, { title: '统一检索真实只读回合' }); if (threadReply) assert.equal(threadReply.status, 201);
  const { thread } = threadReply ? await threadReply.json() : { thread: { id: process.env.RESUME_SYNTHETIC_THREAD } };
  const turnReply = resume ? undefined : await request(`/api/threads/${thread.id}/turns`, { input: '隔离验收：实际调用只读 shell 工具 pwd 一次，返回工作目录。然后根据附带资料列出 ESP32-S3-Touch-LCD-2.8C 原理图的来源页和“未人工复核”标识。不修改文件，不执行其他命令，不申请提升权限。', model: model.model, providerId: 'vibehard' }); if (turnReply) assert.equal(turnReply.status, 202);
  const { turn } = turnReply ? await turnReply.json() : { turn: { id: process.env.RESUME_SYNTHETIC_TURN } }; let overview;
  for (let i = 0; i < 90; i++) {
    overview = await (await request(`/api/threads/${thread.id}`)).json();
    if (overview.turns.some((t: { id: string; status: string }) => t.id === turn.id && ['completed','failed','interrupted'].includes(t.status))) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const turnStatus = overview.turns.find((t: { id: string }) => t.id === turn.id).status;
  if (['queued','running','waiting_approval'].includes(turnStatus)) await request(`/api/threads/${thread.id}/interrupt`, {});
  assert.equal(turnStatus, 'completed');
  assert.ok(overview.events.some((e: { type: string; data: { item?: { type: string; exitCode: number } } }) => e.type === 'tool.completed' && e.data.item?.type === 'commandExecution' && e.data.item.exitCode === 0));
  const evidence = overview.events.find((e: { type: string }) => e.type === 'knowledge.retrieved')?.data;
  assert.equal(evidence.origin, 'platform'); assert.ok(evidence.retrieval.references.some((r: { reviewStatus?: string }) => r.reviewStatus === 'auto-indexed'));
  assert.equal((await request(`/api/threads/${thread.id}`, undefined, 1)).status, 403);
  console.log(JSON.stringify({ operation: 'agent', passed: true, projectId: project.id, turnId: turn.id, sources: evidence.retrieval.references.length, forgedEdaProject: 404, crossUserThread: 403 }));
  stage = 'design';
  const design = await request('/api/design', { requestId: randomUUID(), projectId: project.id, requirement: 'ESP32-S3-Touch-LCD-2.8C USB 供电触摸屏演示，参考原理图，简短列出 BOM 接口风险。' }); assert.equal(design.status, 202);
  let { job } = await design.json();
  for (let i = 0; i < 50 && ['queued','running'].includes(job.status); i++) { await new Promise(resolve => setTimeout(resolve, 2000)); job = (await (await request(`/api/design/${job.id}`)).json()).job; }
  assert.equal(job.status, 'completed'); assert.equal(job.result.retrieval.status, 'matched'); assert.ok(job.diagnostics.totalMs < 90000);
  assert.equal((await request(`/api/design/${job.id}`, undefined, 1)).status, 404);
  assert.equal((await request(`/api/design/${job.id}/download`, undefined, 1)).status, 404);
  const index = new DatabaseSync('/opt/vibehard/knowledge/20260926-esp32-s3-v1/knowledge-fts.sqlite', { readOnly: true });
  try { for (const ref of job.result.retrieval.references) { assert.equal(ref.reviewStatus, 'auto-indexed'); const pos = /#page=(\d+)&part=(\d+)$/.exec(ref.source); assert.ok(pos); const chunk = index.prepare('select text from chunks where source_sha=? and page=? and part=?').get(ref.sha256, Number(pos[1]), Number(pos[2])) as { text: string }; assert.ok(chunk.text.includes(ref.excerpt)); } } finally { index.close(); }
  console.log(JSON.stringify({ operation: 'design', passed: true, jobId: job.id, elapsedMs: job.diagnostics.totalMs, sources: job.result.retrieval.references.length, hashesAndLocations: true, crossUser: 404 }));
  stage = 'eda';
  const eda = await request('/api/eda/agent', { projectId: project.id, document: createStarterDocument(), prompt: '参考 ESP32-S3-Touch-LCD-2.8C 原理图，只把设计名称改为“验收草稿”，不增加器件、不修改连接。摘要注明资料未人工复核。' }); assert.equal(eda.status, 200);
  const proposal = await eda.json(); assert.ok(proposal.retrieval.references.length); assert.equal(proposal.retrieval.status, 'matched'); assert.ok(proposal.batch.commands.every((c: { type: string }) => c.type === 'renameDocument'));
  console.log(JSON.stringify({ operation: 'eda', passed: true, sources: proposal.retrieval.references.length, noProposalApplied: true, syntheticRecordsRetained: true, userIds: people.map(p => p.id) }));
}
void main().catch(error => { console.error(JSON.stringify({ failed: true, stage, name: error.name, ...(typeof error.actual === 'number' ? { actual: error.actual, expected: error.expected } : {}) })); process.exitCode = 1; }).finally(closeDb);
