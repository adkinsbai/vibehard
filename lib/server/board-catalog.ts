import { cookies } from "next/headers";
import { AUTH_COOKIE, readSessionToken } from "@/lib/server/security";
import { findUserById } from "@/lib/server/store";
import { canReadBoardCatalog, type CatalogBoard } from "@/lib/board-catalog";

// Never trust a role from the signed cookie: roles can be revoked after login.
// The catalog JSON must stay server-side, outside public/ and client imports.
export async function readBoardCatalog(): Promise<
  { status: "anonymous" | "forbidden" | "unavailable" } | { status: "allowed"; boards: CatalogBoard[] }
> {
  const session = readSessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return { status: "anonymous" };
  try {
    const user = await findUserById(session.id);
    if (!user) return { status: "anonymous" };
    if (!canReadBoardCatalog(user.role)) return { status: "forbidden" };
    const { default: boards } = await import("./data/board-catalog.json");
    return { status: "allowed", boards };
  } catch {
    return { status: "unavailable" };
  }
}
