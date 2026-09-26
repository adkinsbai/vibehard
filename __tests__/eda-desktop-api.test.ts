// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/server/http', () => ({ requestUser: vi.fn(), unauthorized: () => NextResponse.json({ error: 'login' }, { status: 401 }) }));
vi.mock('@/lib/server/store', () => ({ ownedProject: vi.fn() }));
vi.mock('@/lib/server/eda-desktop', () => ({ desktopRequest: vi.fn() }));
import { requestUser } from '@/lib/server/http';
import { ownedProject } from '@/lib/server/store';
import { desktopRequest } from '@/lib/server/eda-desktop';
import { POST } from '@/app/api/eda/desktop/[id]/route';
import { GET as ACCESS } from '@/app/api/eda/desktop/[id]/access/route';
const id = '22222222-2222-4222-8222-222222222222';
const context = () => ({ params: Promise.resolve({ id }) });
const request = (body: unknown, origin = 'http://localhost') => new NextRequest(`http://localhost/api/eda/desktop/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
beforeEach(() => vi.resetAllMocks());
it('rechecks the current owner before a browser may use a desktop ticket', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  vi.mocked(ownedProject).mockResolvedValue(null);
  expect((await ACCESS(new NextRequest(`http://localhost/api/eda/desktop/${id}/access`), context())).status).toBe(404);
  vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
  const response = await ACCESS(new NextRequest(`http://localhost/api/eda/desktop/${id}/access`), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ owner: id, project: id });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('requires login before starting a desktop', async () => {
  vi.mocked(requestUser).mockResolvedValue(null);
  expect((await POST(request({ action: 'start' }), context())).status).toBe(401);
  expect(desktopRequest).not.toHaveBeenCalled();
});
it('rejects cross-origin writes and another account project', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  expect((await POST(request({ action: 'start' }, 'https://foreign.example'), context())).status).toBe(403);
  vi.mocked(ownedProject).mockResolvedValue(null);
  expect((await POST(request({ action: 'start' }), context())).status).toBe(404);
  expect(desktopRequest).not.toHaveBeenCalled();
});
it('initializes a real empty project without a demo when sources are absent', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
  vi.mocked(desktopRequest).mockResolvedValue(new Response(JSON.stringify({ running: true, ticket: 'short-lived' }), { headers: { 'Content-Type': 'application/json' } }));
  expect((await POST(request({ action: 'start', editor: 'schematic' }), context())).status).toBe(200);
  const args = vi.mocked(desktopRequest).mock.calls[0];
  expect(args[0]).toBe(id);
  expect(args[1]).toBe(id);
  expect(args[2].sources?.schematic).toContain('(kicad_sch');
  expect(args[2].sources?.schematic).not.toContain('ESP32');
});
it('accepts the browser Host when Next normalizes the internal request URL to localhost', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
  vi.mocked(desktopRequest).mockResolvedValue(Response.json({ running: false, files: [] }));
  const req = request({ action: 'status' }, 'http://127.0.0.1:3212');
  req.headers.set('host', '127.0.0.1:3212');
  expect((await POST(req, context())).status).toBe(200);
});
it('lets an owner read a saved native schematic snapshot through the authenticated broker', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
  vi.mocked(desktopRequest).mockResolvedValue(Response.json({ schematic: '(kicad_sch)', netlist: '(export (nets))' }));
  const response = await POST(request({ action: 'snapshot' }), context());
  expect(response.status).toBe(200);
  expect((await response.json()).schematic).toContain('kicad_sch');
  expect(vi.mocked(desktopRequest).mock.calls[0][2].action).toBe('snapshot');
});
it('rejects malformed and oversized native imports before calling the broker', async () => {
  vi.mocked(requestUser).mockResolvedValue({ id, email: 'a@b.com', name: 'a', role: 'member' });
  vi.mocked(ownedProject).mockResolvedValue({ id } as NonNullable<Awaited<ReturnType<typeof ownedProject>>>);
  for (const schematic of ['invalid', '(kicad_sch ' + ' '.repeat(900_000), '(kicad_sch ' + ' '.repeat(2_000_000)]) {
    expect((await POST(request({ action: 'start', sources: { schematic, pcb: '(kicad_pcb)' } }), context())).status).toBe(400);
  }
  expect(desktopRequest).not.toHaveBeenCalled();
});
