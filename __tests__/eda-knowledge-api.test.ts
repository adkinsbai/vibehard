// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/http', () => ({ requestUser: vi.fn(), unauthorized: () => NextResponse.json({ error: '请先登录' }, { status: 401 }) }));
vi.mock('@/lib/server/rate-limit', () => ({ consumeRateLimit: vi.fn() }));
vi.mock('@/lib/server/eda-knowledge', () => ({ searchEdaKnowledge: vi.fn(), EdaKnowledgeError: class extends Error { status = 503; } }));

import { requestUser } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { searchEdaKnowledge } from '@/lib/server/eda-knowledge';
import { GET } from '@/app/api/eda/knowledge/route';

const request = (query = 'ESP32-S3') => new NextRequest(`http://localhost/api/eda/knowledge?q=${encodeURIComponent(query)}`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requestUser).mockResolvedValue({ id: 'user', email: 'test@example.com', role: 'member', name: 'test' });
  vi.mocked(consumeRateLimit).mockReturnValue({ allowed: true } as ReturnType<typeof consumeRateLimit>);
});

describe('authenticated EDA knowledge API', () => {
  it('requires login before reading indexed material', async () => {
    vi.mocked(requestUser).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(searchEdaKnowledge).not.toHaveBeenCalled();
  });
  it('limits requests and rejects empty queries', async () => {
    vi.mocked(consumeRateLimit).mockReturnValueOnce({ allowed: false } as ReturnType<typeof consumeRateLimit>);
    expect((await GET(request())).status).toBe(429);
    expect((await GET(request('x'))).status).toBe(400);
    expect(searchEdaKnowledge).not.toHaveBeenCalled();
  });
  it('reports a disabled index instead of empty successful data', async () => {
    vi.mocked(searchEdaKnowledge).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(503);
  });
  it('returns bounded source references with an explicit usage boundary', async () => {
    vi.mocked(searchEdaKnowledge).mockResolvedValue({ snapshotSha256: 'a'.repeat(64), indexedSources: 1, quarantinedSources: 0, hits: [{ sourceSha256: 'b'.repeat(64), source: 'board.pdf', category: 'schematics', page: 2, excerpt: 'ESP32-S3 EN', reviewStatus: 'auto_approved_for_index', manualReview: false }] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ usage: 'reference_only_not_hardware_approved', hits: [{ source: 'board.pdf', page: 2 }] });
  });
});
