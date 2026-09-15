import { Skeleton } from "@/components/ui/skeleton";
import { AppIcon } from "@/components/portal/PortalNavbar";
import type { PortalApp } from "@/lib/portalApps";

/**
 * Placeholder shown in the Portal frame while an app's page loads. The native
 * webview stays hidden until the page finishes (src-tauri/src/portal.rs), so
 * this shows through instead of an empty dark rectangle. The blocks sketch a
 * generic web app: a narrow rail, a list column, and a content area.
 */
export default function PortalSkeleton({ app }: { app: PortalApp }) {
  const label = `Loading ${app.name}`;
  return (
    <div role="status" aria-busy="true" aria-label={label} className="relative flex h-full gap-3 p-3">
      <div className="hidden sm:flex w-12 flex-col items-center gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="portal-skeleton h-10 w-10 rounded-full" />
        ))}
      </div>

      <div className="hidden md:flex w-56 flex-col gap-3">
        <Skeleton className="portal-skeleton h-8 w-full" />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="portal-skeleton h-7 w-7 shrink-0 rounded-full" />
            <Skeleton className="portal-skeleton h-3" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Skeleton className="portal-skeleton h-10 w-full" />
        <div className="flex flex-1 flex-col justify-end gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="portal-skeleton h-9 w-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="portal-skeleton h-3 w-32" />
                <Skeleton className="portal-skeleton h-3" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="portal-skeleton h-11 w-full rounded-lg" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="portal-skeleton-badge flex items-center gap-2.5 rounded-full px-4 py-2">
          <AppIcon app={app} size={20} />
          <span className="text-sm text-white/75">Loading {app.name}…</span>
        </div>
      </div>
    </div>
  );
}
