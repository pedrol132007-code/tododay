import { useEffect, useState } from "react";
import type { DashboardData } from "../types";
import type { DemoAttachment } from "../lib/demoBoard";
import type { DemoFile } from "../lib/demoFiles";

/** Cria os arquivos dos anexos de exemplo (URLs blob:) e os libera ao trocar de demonstração. */
export function useDemoFiles(attachments: DemoAttachment[], data: DashboardData | null): Map<string, DemoFile> {
  const [files, setFiles] = useState<Map<string, DemoFile>>(new Map());
  useEffect(() => {
    if (!data || attachments.length === 0) {
      setFiles(new Map());
      return;
    }
    let current: Map<string, DemoFile> | null = null;
    let alive = true;
    const titleOf = (id: string) => data.tasks.find((t) => t.id === id)?.title ?? "";
    // O gerador de arquivos (canvas, PDF) só desce com a demonstração.
    let revoke: (files: Map<string, DemoFile>) => void = () => {};
    void import("../lib/demoFiles").then(async (m) => {
      revoke = m.revokeDemoFiles;
      const made = await m.makeDemoFiles(attachments, titleOf);
      if (!alive) return m.revokeDemoFiles(made);
      current = made;
      setFiles(made);
    });
    return () => {
      alive = false;
      if (current) revoke(current);
    };
  }, [attachments, data]);
  return files;
}
