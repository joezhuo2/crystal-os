import { useEffect, useState } from "react";
import { ChangelogDialog } from "@/components/ChangelogDialog";
import { changelogSince, takeUpdatedFrom } from "@/lib/changelog";
import { changelogSettings } from "@/lib/changelogSettings";

declare const __APP_VERSION__: string | undefined;

export function ChangelogNotice() {
  const [notes, setNotes] = useState<string | null>(null);
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null;

  useEffect(() => {
    if (!version) return;
    const from = takeUpdatedFrom(version);
    if (!from || !changelogSettings.getState()) return;
    let cancelled = false;
    import("../../CHANGELOG.md?raw")
      .then(({ default: markdown }) => {
        const since = changelogSince(markdown, from, version);
        if (!cancelled && since) setNotes(since);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!version || notes === null) return null;
  return <ChangelogDialog open onOpenChange={(open) => !open && setNotes(null)} version={version} notes={notes} />;
}
