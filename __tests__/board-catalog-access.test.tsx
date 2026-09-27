// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ session: null as null | { id: string; role: string }, user: null as null | { id: string; role: string }, failure: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "signed-test-session" }) }) }));
vi.mock("@/lib/server/security", () => ({ AUTH_COOKIE: "vibehard_session", readSessionToken: () => state.session }));
vi.mock("@/lib/server/store", () => ({ findUserById: async () => { if (state.failure) throw Error("db down"); return state.user; } }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error(`redirect:${path}`); } }));
vi.mock("@/components/app/knowledge-library", () => ({ KnowledgeLibrary: ({ boards }: { boards: { name: string }[] }) => <div>{boards.map(board => board.name).join(",")}</div> }));
import { readBoardCatalog } from "@/lib/server/board-catalog";
import BoardLibraryPage from "@/app/app/knowledge/page";
import LegacyLibraryPage from "@/app/app/board-library/page";

beforeEach(() => { state.session = null; state.user = null; state.failure = false; });
describe("server-side catalog authorization", () => {
  it("redirects legacy bookmarks to the protected knowledge page", () => {
    expect(() => LegacyLibraryPage()).toThrow("redirect:/app/knowledge");
  });
  it("redirects anonymous visitors without returning any board data", async () => {
    expect(await readBoardCatalog()).toEqual({ status: "anonymous" });
    await expect(BoardLibraryPage()).rejects.toThrow("redirect:/login");
  });
  it.each(["member", "unknown", "ADMIN"])("does not trust stale admin cookies when the stored role is %s", async role => {
    state.session = { id: "one", role: "admin" }; state.user = { id: "one", role };
    expect(await readBoardCatalog()).toEqual({ status: "forbidden" });
    const html = renderToStaticMarkup(await BoardLibraryPage());
    expect(html).toContain("仅管理员和开发者");
    expect(html).not.toContain("ESP32");
  });
  it.each(["admin", "developer"])("serves catalog for the current %s role regardless of the old cookie role", async role => {
    state.session = { id: "one", role: "member" }; state.user = { id: "one", role };
    const result = await readBoardCatalog();
    expect(result.status).toBe("allowed");
    if (result.status === "allowed") {
      expect(result.boards).toHaveLength(61);
      expect(result.boards.flatMap(board => board.resources)).toHaveLength(762);
    }
    expect(renderToStaticMarkup(await BoardLibraryPage())).toContain("ESP32-S3-A7670E-4G");
  });
  it("rejects deleted accounts and fails closed if the database is unavailable", async () => {
    state.session = { id: "deleted", role: "admin" };
    expect(await readBoardCatalog()).toEqual({ status: "anonymous" });
    state.failure = true;
    expect(await readBoardCatalog()).toEqual({ status: "unavailable" });
    expect(renderToStaticMarkup(await BoardLibraryPage())).toContain("暂时无法确认访问权限");
  });
});
