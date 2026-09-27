// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/server/http', () => ({ requestUser: vi.fn(), unauthorized: () => NextResponse.json({}, { status: 401 }) }));
vi.mock('@/lib/server/knowledge-retrieval-service', async original => ({ ...await original<typeof import('@/lib/server/knowledge-retrieval-service')>(), retrieveAuthorizedKnowledge: vi.fn() }));
vi.mock('@/lib/server/eda-agent', async original => ({ ...await original<typeof import('@/lib/server/eda-agent')>(), proposeEdaEdit: vi.fn() }));
import { requestUser } from '@/lib/server/http';
import { retrieveAuthorizedKnowledge, RetrievalAccessError } from '@/lib/server/knowledge-retrieval-service';
import { proposeEdaEdit } from '@/lib/server/eda-agent';
import { POST } from '@/app/api/eda/agent/route';
const userId = '22222222-2222-4222-8222-222222222222'; const projectId = '33333333-3333-4333-8333-333333333333';
const req = (project?: string) => new NextRequest('http://localhost/api/eda/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: {}, prompt: 'I2C test', projectId: project }) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requestUser).mockResolvedValue({ id: userId, email: 'test@example.invalid', role: 'member', name: 'test' }); });
it('rejects a forged project ID before any model call', async () => {
  vi.mocked(retrieveAuthorizedKnowledge).mockRejectedValue(new RetrievalAccessError());
  expect((await POST(req(projectId))).status).toBe(404); expect(proposeEdaEdit).not.toHaveBeenCalled();
});
it('uses platform-only retrieval when no project is selected', async () => {
  const evidence = { status: 'partial' as const, method: 'keyword-chunks-v1' as const, references: [], context: '', revision: 'a'.repeat(64), warnings: ['INDEX_UNAVAILABLE' as const] };
  vi.mocked(retrieveAuthorizedKnowledge).mockResolvedValue(evidence);
  vi.mocked(proposeEdaEdit).mockResolvedValue({ retrieval: evidence, model: 'test', summary: 'fixture', batch: { id: projectId, baseRevision: 0, actor: 'agent', label: 'fixture', commands: [] } });
  const result = await POST(req()); expect(result.status).toBe(200);
  expect(retrieveAuthorizedKnowledge).toHaveBeenCalledWith({ userId, projectId: undefined, query: 'I2C test', purpose: 'eda' });
  expect(proposeEdaEdit).toHaveBeenCalledWith({}, 'I2C test', expect.any(AbortSignal), evidence);
});
