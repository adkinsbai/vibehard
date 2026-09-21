import { ProjectKnowledge } from "@/components/app/project-knowledge";

export default async function KnowledgePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ document?: string }> }) {
  const { projectId } = await params;
  const { document } = await searchParams;
  return <ProjectKnowledge key={`${projectId}:${document ?? ""}`} projectId={projectId} initialDocumentId={document} />;
}
