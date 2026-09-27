import { cookies } from "next/headers";
import { AUTH_COOKIE, readSessionToken, sessionMatchesAccount } from "@/lib/server/security";
import { findUserById } from "@/lib/server/store";
import { canReadBoardCatalog, type CatalogBoard } from "@/lib/board-catalog";
import { verifiedBoardCatalog } from "@/lib/server/verified-board-catalog";

// Never trust a role from the signed cookie: roles can be revoked after login.
// The catalog JSON must stay server-side, outside public/ and client imports.
export async function readBoardCatalog(): Promise<
  { status: "anonymous" | "forbidden" | "unavailable" } | { status: "allowed"; boards: CatalogBoard[] }
> {
  const session = readSessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return { status: "anonymous" };
  try {
    const user = await findUserById(session.id);
    if (!user || !sessionMatchesAccount(session, user)) return { status: "anonymous" };
    if (!canReadBoardCatalog(user.role)) return { status: "forbidden" };
    const [{ default: boards }, { default: evidence }, { default: specifications }] = await Promise.all([
      import("./data/board-catalog.json"), import("./data/board-catalog-evidence.json"), import("./data/board-spec-evidence.json")]);
    return { status: "allowed", boards: verifiedBoardCatalog(boards as CatalogBoard[], evidence as Parameters<typeof verifiedBoardCatalog>[1], specifications as Parameters<typeof verifiedBoardCatalog>[2]) };
  } catch {
    return { status: "unavailable" };
  }
}
