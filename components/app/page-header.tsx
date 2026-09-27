import type { LucideIcon } from "lucide-react";
import { ModuleHelp } from "@/components/app/module-help";
import type { ModuleHelpKey } from "@/lib/module-help";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  helpKey: ModuleHelpKey;
}

export function PageHeader({ icon: Icon, title, description, helpKey }: PageHeaderProps) {
  return (
    <div className="animate-fade-up mb-8 flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1><ModuleHelp module={helpKey} /></div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
