// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { projectBomCsv, type ProjectBom } from "@/lib/server/project-bom";
import { GET } from "@/app/api/projects/[id]/bom/route";
import { requestUser } from "@/lib/server/http";
import { ownedProject } from "@/lib/server/store";
import { latestProjectBom } from "@/lib/server/project-bom";
import { bomReferencePrice, freezeBomPrices, recordedOrCurrentBomPrice } from "@/lib/bom-price-snapshots";
import { designResultSchema } from "@/lib/agent/llm";

vi.mock("@/lib/server/http", async original => ({ ...await original<typeof import("@/lib/server/http")>(), requestUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({ ownedProject: vi.fn() }));
vi.mock("@/lib/server/project-bom", async original => ({ ...await original<typeof import("@/lib/server/project-bom")>(), latestProjectBom: vi.fn() }));

const id = "9e18a623-1612-4a26-b293-bc658a8bad48";
const bom: ProjectBom = { projectId: id, projectName: "测试工程", designId: "1b027527-8d79-4371-a7c7-a738ef43b2a9",
  completedAt: "2026-09-28T00:00:00.000Z", model: "test-model", priceRecorded: false, items: [
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

it("uses checked supplier snapshots only for an entire matching MPN", () => {
  expect(bomReferencePrice("BH1750FVI-TR", "¥6–10/件（估算）")).toMatchObject({
    kind: "supplier", display: "US$0.9515/件", supplierSku: "C78960", minimumQuantity: 1,
  });
  expect(bomReferencePrice("ESP32-S3-WROOM-1-N8R8", "¥30（估算）")).toMatchObject({
    kind: "supplier-reference", display: "US$5.0496/件",
  });
  for (const model of ["BH1750/VEML7700", "BH1750FVI-TR 或同类", "ESP32-C3-MINI-1", "MCP73871"]) {
    expect(bomReferencePrice(model, "¥8–15/件（估算）")).toEqual({ kind: "estimate", display: "¥8–15/件（估算）" });
  }
});

it("exports supplier currency, SKU and source separately from model estimates", () => {
  const csv = projectBomCsv({ ...bom, items: [
    { item: "光照", model: "BH1750FVI-TR", qty: 2, estCost: "¥6–10/件（估算）", referencePrice: bomReferencePrice("BH1750FVI-TR", "¥6–10/件（估算）") },
    { item: "主控", model: "ESP32-C3-MINI-1 或同类", qty: 1, estCost: "¥10–18/件（估算）" },
  ] });
  expect(csv).toContain('"US$0.9515/件","供应商公开报价快照","LCSC","C78960","1","2026-09-28"');
  expect(csv).toContain('"¥10–18/件（估算）","模型估算"');
  expect(csv).not.toContain('"ESP32-C3-MINI-1 或同类","1","US$');
});

it("stores an immutable supplier/estimate snapshot and prefers it over a later catalogue lookup", () => {
  const modelResult = { architecture: ["I2C"], interfaces: ["I2C"], risks: [{ level: "低", desc: "核价" }], bom: [
    { item: "光照", model: "BH1750FVI-TR", qty: 2, estCost: "¥6–10/件（估算）", referencePrice: { kind: "supplier", display: "伪造报价" } },
    { item: "主控", model: "ESP32-C3-MINI-1 或同类", qty: 1, estCost: "¥10–18/件（估算）" },
  ] };
  const parsed = designResultSchema.omit({ retrieval: true }).parse(modelResult);
  expect(parsed.bom[0]).not.toHaveProperty("referencePrice");
  const frozen = freezeBomPrices(parsed);
  expect(frozen.bom[0].referencePrice).toMatchObject({ display: "US$0.9515/件", checkedAt: "2026-09-28", supplierSku: "C78960" });
  expect(frozen.bom[1].referencePrice).toEqual({ kind: "estimate", display: "¥10–18/件（估算）" });
  expect(parsed.bom[0]).not.toHaveProperty("referencePrice");
  const historical = { ...frozen.bom[0], referencePrice: { kind: "supplier" as const, display: "US$0.75/件", checkedAt: "2026-01-01", sourceUrl: "https://example.invalid/old" } };
  expect(recordedOrCurrentBomPrice(historical)).toEqual(historical.referencePrice);
  const csv = projectBomCsv({ ...bom, priceRecorded: true, items: [{ ...historical, qty: 2, item: "光照" }] });
  expect(csv).toContain('"US$0.75/件"');
  expect(csv).toContain('"生成时保存的快照"');
  expect(csv).not.toContain('"US$0.9515/件"');
});
