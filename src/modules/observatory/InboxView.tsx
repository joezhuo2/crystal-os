import { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/field-controls";
import { isDesktop } from "@/lib/platform";
import { undoToast } from "@/lib/undo";
import type { Course } from "./model";
import { filedTitle, moveResource, useResources, type Resource } from "./resources/ingest";
import { sortByKeywords } from "./resources/sort";
import { RESOURCE_DIRS } from "./resources/paths";
import type { ResourceType } from "./resources/types";
import { SortPopup } from "./SortPopup";

export function InboxView({ courses, onClose }: { courses: Course[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { resources, loading } = useResources(null);
  const [filing, setFiling] = useState<Resource | null>(null);
  const desktop = isDesktop();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vault"] });
  const options = courses.filter((c) => !c.archived).map((c) => ({ value: c.code, label: c.code, color: c.color }));

  const move = async (r: Resource, code: string | null, type: ResourceType) => {
    setFiling(null);
    try {
      const filed = await moveResource(r.sidecar, code, type);
      await refresh();
      undoToast(filedTitle(r.name, filed), () =>
        void moveResource(filed.sidecar, null, r.type).then(refresh, (err: unknown) =>
          toast.error(`Could not move ${r.name} back`, { description: err instanceof Error ? err.message : String(err) }),
        ),
      );
    } catch (err) {
      toast.error(`Could not file ${r.name}`, { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onClose}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <h2 className="text-lg font-semibold">_inbox</h2>
      {!desktop && <p className="text-sm text-muted-foreground">Filing PDFs needs the desktop app.</p>}
      {!loading && resources.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Nothing waiting to be sorted</div>
      ) : (
        <ul className="observatory-panel space-y-2" aria-label="Unsorted files">
          {resources.map((r) => (
            <li key={r.sidecar} className="glass-card flex flex-wrap items-center gap-3 p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {RESOURCE_DIRS[r.type]}
                  {r.added && ` · added ${r.added}`}
                </p>
              </div>
              {desktop && (
                <>
                  <ThemedSelect
                    className="w-36"
                    value=""
                    placeholder="Move to…"
                    options={options}
                    onChange={(code) => void move(r, code, r.type)}
                    aria-label={`Move ${r.name} to`}
                  />
                  <Button size="sm" variant="outline" onClick={() => setFiling(r)}>
                    File…
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {filing && (
        <SortPopup
          name={filing.name}
          courses={courses}
          ranked={sortByKeywords(courses, filing.name, filing.title).candidates.map((c) => c.code)}
          type={filing.type}
          onChoose={(code, type) => void move(filing, code, type)}
          onClose={() => setFiling(null)}
        />
      )}
    </div>
  );
}
