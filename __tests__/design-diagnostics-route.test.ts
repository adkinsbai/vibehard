// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/design-diagnostics/route";
import { requestUser } from "@/lib/server/http";
import { listDesignDiagnostics } from "@/lib/server/design-job-store";
vi.mock("@/lib/server/http", async original => ({ ...await original<typeof import("@/lib/server/http")>(), requestUser: vi.fn() }));
vi.mock("@/lib/server/design-job-store", () => ({ listDesignDiagnostics: vi.fn().mockResolvedValue([]) }));
beforeEach(() => vi.clearAllMocks());
it.each([null, "member", "developer"])("refuses diagnostics for %s", async role => {
  vi.mocked(requestUser).mockResolvedValue(role ? { role } as Awaited<ReturnType<typeof requestUser>> : null);
  const response = await GET(new NextRequest("https://example.invalid/api/admin/design-diagnostics"));
  expect(response.status).toBe(role ? 403 : 401); expect(listDesignDiagnostics).not.toHaveBeenCalled();
});
it("allows admin with no-store", async () => {
  vi.mocked(requestUser).mockResolvedValue({ role: "admin" } as Awaited<ReturnType<typeof requestUser>>);
  const response = await GET(new NextRequest("https://example.invalid/api/admin/design-diagnostics"));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ jobs: [] });
});
