import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorText } from "./errorText";
import type { Topic } from "./model";
import type { Resource } from "./resources/ingest";
import { acceptClear, processResource } from "./resources/process";
import { useObservatorySettings } from "./settings";

export interface ProcessJob { resource: Resource; code: string; topics: Topic[] }

export function useProcessAll() {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async (jobs: ProcessJob[]) => {
    setRunning(true);
    const id = toast.loading(`Processing 0 of ${jobs.length} PDFs…`);
    let added = 0;
    const failed: string[] = [];
    try {
      for (const [i, { resource, code, topics }] of jobs.entries()) {
        toast.loading(`Processing ${i + 1} of ${jobs.length} PDFs…`, { id, description: resource.name });
        try {
          const { pools } = await processResource(resource.sidecar, topics);
          for (const path of pools) added += await acceptClear(folder, code, path, resource.type === "slides" ? "card" : "worked");
        } catch (err) {
          console.error(`Could not process ${resource.name}`, err);
          failed.push(`${resource.name}: ${errorText(err)}`);
        }
      }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      setRunning(false);
    }
    const title = `Processed ${jobs.length - failed.length} PDF${jobs.length - failed.length === 1 ? "" : "s"}, added ${added} question${added === 1 ? "" : "s"} to Review`;
    if (failed.length) {
      const shown = failed.slice(0, 5).join("\n") + (failed.length > 5 ? `\nand ${failed.length - 5} more (details in the console)` : "");
      toast.warning(`${title}; ${failed.length} failed`, { id, description: shown, duration: 20_000 });
    }
    else toast.success(title, { id, description: undefined });
  };

  return { run, running };
}
