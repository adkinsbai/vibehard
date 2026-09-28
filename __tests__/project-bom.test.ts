// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { projectBomCsv, type ProjectBom } from "@/lib/server/project-bom";
import { GET } from "@/app/api/projects/[id]/bom/route";
import { requestUser } from "@/lib/server/http";
import { ownedProject } from "@/lib/server/store";
import { latestProjectBom } from "@/lib/server/project-bom";

vi.mock("@/lib/server/http", async original => ({ ...await original<typeof import("@/lib/server/http")>(), requestUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({ ownedProject: vi.fn() }));
vi.mock("@/lib/server/project-bom", async original => ({ ...await original<typeof import("@/lib/server/project-bom")>(), latestProjectBom: vi.fn() }));

const id = "9e18a623-1612-4a26-b293-bc658a8bad48";
const bom: ProjectBom = { projectId: id, projectName: "测试工程", designId: "1b027527-8d79-4371-a7c7-a738ef43b2a9",
  completedAt: "2026-09-28T00:00:00.000Z", model: "test-model", items: [
    { item: "温度传感器", model: "SHT30", qty: 1, estCost: "¥8（估算）" },
  ] };
const context = { params: Promise.resolve({ id }) };
const request = (suffix = "") => new NextRequest(`https://example.invalid/api/projects/${id}/bom${suffix}`);

beforeEach(() => {
  vi.mocked(requestUser).mockReset().mockResolvedValue({ id: "owner", email: "owner@example.invalid", name: "owner", role: "member" });
  vi.mocked(ownedProject).mockReset().mockResolvedValue({ id } as Awaited<ReturnType<typeof ownedProject>>);
  vi.mocked(latestProjectBom).mockReset().mockResolvedValue(bom);
});

it("only returns the owner's persisted BOM and blocks unauthenticated or other-user requests", async () => {
  const own = await GET(request(), context);
  expect(own.status).toBe(200);
  expect((await own.json()).bom.items).toEqual(bom.items);
  vi.mocked(ownedProject).mockResolvedValueOnce(null);
  expect((await GET(request(), context)).status).toBe(404);
  expect(latestProjectBom).toHaveBeenCalledTimes(1);
  vi.mocked(requestUser).mockResolvedValueOnce(null);
  expect((await GET(request(), context)).status).toBe(401);
});

it("serves a real CSV only for completed designs and does not claim an empty download", async () => {
  const csv = await GET(request(`?format=csv&designId=${bom.designId}`), context);
  expect(csv.status).toBe(200);
  expect(csv.headers.get("content-disposition")).toContain("attachment;");
  expect(await csv.text()).toContain('"SHT30"');
  expect(latestProjectBom).toHaveBeenCalledWith("owner", id, bom.designId);
  expect((await GET(request("?format=csv&designId=invalid"), context)).status).toBe(400);
  vi.mocked(latestProjectBom).mockResolvedValueOnce(null);
  expect((await GET(request(`?format=csv&designId=${bom.designId}`), context)).status).toBe(409);
});

it("escapes spreadsheet formulas, quotes and newlines in model-controlled cells", () => {
  const csv = projectBomCsv({ ...bom, items: [{ item: "=HYPERLINK(\"evil\")", model: "+1,2", qty: 1, estCost: "¥5（估算）\n待核实" }] });
  expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
  expect(csv).toContain(`"'+1,2"`);
  expect(csv).toContain('"¥5（估算）\n待核实"');
});
