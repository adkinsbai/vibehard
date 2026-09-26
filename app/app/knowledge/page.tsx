import Link from "next/link";
import { redirect } from "next/navigation";
import { KnowledgeLibrary } from "@/components/app/knowledge-library";
import { readBoardCatalog } from "@/lib/server/board-catalog";

export const dynamic = "force-dynamic";

export default async function KnowledgeLibraryPage() {
  const result = await readBoardCatalog();
  if (result.status === "anonymous") redirect("/login");
  if (result.status !== "allowed") return <section className="mx-auto max-w-3xl space-y-4 p-6 md:p-10">
    <h1 className="text-2xl font-semibold">知识库</h1>
    <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">{result.status === "forbidden" ? "仅管理员和开发者可以访问知识库。请联系平台管理员确认账号角色。" : "暂时无法确认访问权限，请稍后刷新重试。"}</p>
    <Link href="/app" className="text-sm text-primary underline">返回工作台</Link>
  </section>;
  return <KnowledgeLibrary boards={result.boards} />;
}
