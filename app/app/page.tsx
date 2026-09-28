import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardGrid } from "@/components/app/dashboard-grid";
import { AUTH_COOKIE, readSessionToken, sessionMatchesAccount } from "@/lib/server/security";
import { findUserById, listProjects } from "@/lib/server/store";
import { listDesigns } from "@/lib/server/design-job-store";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = readSessionToken((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  const user = await findUserById(session.id);
  if (!user || !sessionMatchesAccount(session, user)) redirect("/login");

  const projects = await listProjects(user.id);
  const design = await listDesigns(user.id).catch(() => null);
  return <DashboardGrid
    projects={projects.map(project => ({ id: project.id, name: project.name, updatedAt: project.updatedAt.toISOString() }))}
    jobs={design?.jobs.map(job => ({ id: job.id, projectName: job.projectName, status: job.status, createdAt: job.createdAt })) ?? []}
    designUnavailable={!design}
  />;
}
