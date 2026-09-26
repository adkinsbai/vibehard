// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/server/http', () => ({ requestUser: vi.fn(), unauthorized: () => NextResponse.json({ error: '请先登录' }, { status: 401 }), isResourceId: (id: string) => /^[a-f0-9-]{36}$/.test(id) }));
vi.mock('@/lib/server/store', () => ({ ownedProject: vi.fn() }));
vi.mock('@/lib/server/eda-store', () => ({ loadEdaProject: vi.fn(), saveEdaProject: vi.fn(), EdaConflictError: class extends Error {} }));
import { requestUser } from '@/lib/server/http';
import { ownedProject } from '@/lib/server/store';
import { loadEdaProject, saveEdaProject } from '@/lib/server/eda-store';
import { GET, PUT } from '@/app/api/eda/projects/[id]/route';
const id = '22222222-2222-4222-8222-222222222222';
const context = () => ({ params: Promise.resolve({ id }) });
const request = (method = 'GET', body?: unknown) => new NextRequest(`http://localhost/api/eda/projects/${id}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
beforeEach(() => vi.resetAllMocks());
describe('EDA API project boundary', () => {
  it('requires a session before reading project data', async () => {
    vi.mocked(requestUser).mockResolvedValue(null);
    expect((await GET(request(), context())).status).toBe(401);
    expect(loadEdaProject).not.toHaveBeenCalled();
  });
  it('does not expose or write other users projects', async () => {
    vi.mocked(requestUser).mockResolvedValue({ id: 'user', email: 'test@example.com', role: 'member', name: 'test' });
    vi.mocked(ownedProject).mockResolvedValue(null);
    expect((await GET(request(), context())).status).toBe(404);
    expect((await PUT(request('PUT', { document: {}, expectedVersion: null }), context())).status).toBe(404);
    expect(saveEdaProject).not.toHaveBeenCalled();
  });
  it('requires an explicit expected version before saving', async () => {
    vi.mocked(requestUser).mockResolvedValue({ id: 'user', email: 'test@example.com', role: 'member', name: 'test' });
    vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
    expect((await PUT(request('PUT', { document: {} }), context())).status).toBe(400);
    expect(saveEdaProject).not.toHaveBeenCalled();
  });
});
