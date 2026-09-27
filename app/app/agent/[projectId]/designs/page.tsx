import { DesignWorkbench } from "@/components/app/design-workbench";
export default async function ProjectDesigns({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <DesignWorkbench key={projectId} projectId={projectId} />;
}
