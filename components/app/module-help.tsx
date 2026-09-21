"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CircleHelp, X } from "lucide-react";
import { moduleHelp, type ModuleHelpKey } from "@/lib/module-help";

export function ModuleHelp({ module }: { module: ModuleHelpKey }) {
  const guide = moduleHelp[module];
  return <Dialog.Root>
    <Dialog.Trigger type="button" aria-label={`${guide.title}使用说明`} title="查看使用说明" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <CircleHelp aria-hidden="true" className="size-4" />
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop data-slot="module-help-backdrop" className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" />
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <Dialog.Title className="text-lg font-semibold">{guide.title} · 使用说明</Dialog.Title>
          <Dialog.Close type="button" aria-label="关闭使用说明" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="size-4" /></Dialog.Close>
        </div>
        <div className="space-y-5 overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-6">
          <Dialog.Description className="text-muted-foreground">{guide.purpose}</Dialog.Description>
          <section><h3 className="mb-2 font-semibold">怎么使用</h3><ol className="list-decimal space-y-2 pl-5">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"><h3 className="mb-2 font-semibold">当前能力与注意事项</h3><ul className="list-disc space-y-2 pl-4 text-muted-foreground">{guide.notes.map(note => <li key={note}>{note}</li>)}</ul></section>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
