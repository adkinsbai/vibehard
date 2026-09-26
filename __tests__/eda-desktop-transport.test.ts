// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
import { readFile } from 'node:fs/promises';
import { desktopRequest } from '@/lib/server/eda-desktop';

const owner = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('EDA_MANAGER_URL', 'http://127.0.0.1:6083');
  vi.stubEnv('EDA_MANAGER_TOKEN_FILE', '/private/eda-manager-token');
  vi.mocked(readFile).mockResolvedValue('test-only-manager-token-with-32-bytes' as never);
});
afterEach(() => vi.unstubAllEnvs());

it('routes production project actions through the private cloud manager', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ running: false }));
  try {
    expect((await desktopRequest(owner, project, { action: 'status' })).status).toBe(200);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(`http://127.0.0.1:6083/v1/projects/${owner}/${project}`);
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer test-only-manager-token-with-32-bytes');
  } finally { fetcher.mockRestore(); }
});

it('does not contact a public or unconfigured manager', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    vi.stubEnv('EDA_MANAGER_URL', 'http://public.example:6083');
    expect((await desktopRequest(owner, project, { action: 'status' })).status).toBe(503);
    vi.stubEnv('EDA_MANAGER_URL', '');
    expect((await desktopRequest(owner, project, { action: 'status' })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); }
});
