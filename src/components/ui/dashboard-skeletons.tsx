import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders for the HomePage dashboard. Each mirrors the padding and
 * rough block sizes of the widget it stands in for, so the layout does not jump
 * when the real data arrives. Widgets whose header stays usable while loading
 * (the vault, the horizon) get a content-only skeleton instead of a whole card.
 */

/** Card shell for skeletons that replace a whole widget, announced to screen readers. */
function SkeletonCard({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("glass-card p-6", className)}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Marks a content-only skeleton as a busy region for screen readers. */
function SkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A stack of text lines with varied widths, so it reads as prose rather than a block. */
export function SkeletonLines({
  count = 3,
  className,
  widths = ["w-full", "w-11/12", "w-4/5", "w-2/3"],
}: {
  count?: number;
  className?: string;
  widths?: string[];
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4 rounded", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Section label above a widget's content. */
function SkeletonLabel() {
  return <Skeleton className="h-3 w-32 rounded" />;
}

export function WeatherWidgetSkeleton() {
  return (
    <SkeletonCard label="Loading the weather" className="flex items-center gap-4">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-24 rounded" />
        <Skeleton className="h-3 w-36 rounded" />
      </div>
    </SkeletonCard>
  );
}

export function SmartSummarySkeleton() {
  return (
    <SkeletonCard label="Loading your smart summary">
      <SkeletonLabel />
      <SkeletonLines className="mt-4" count={3} />
    </SkeletonCard>
  );
}

export function DailyFocusSkeleton() {
  return (
    <SkeletonCard label="Loading your daily focus" className="col-span-full lg:col-span-2">
      <SkeletonLabel />
      <Skeleton className="mt-3 h-7 w-3/5 rounded" />
      <Skeleton className="mt-3 h-3 w-56 rounded" />
    </SkeletonCard>
  );
}

/** Event count plus a few event rows, sits inside the horizon card's own shell. */
export function TodayHorizonContentSkeleton() {
  return (
    <SkeletonRegion label="Loading today's events">
      <Skeleton className="h-8 w-28 rounded" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
            <Skeleton className={cn("h-4 rounded", ["w-2/5", "w-1/2", "w-1/3"][i % 3])} />
            <Skeleton className="ml-auto h-3 w-24 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Tag chips plus note rows, sits inside the vault card's own shell. */
export function VaultContentSkeleton() {
  return (
    <SkeletonRegion label="Loading the archive">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["w-12", "w-16", "w-10", "w-14"].map((w, i) => (
          <Skeleton key={i} className={cn("h-4 rounded-full", w)} />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
            <Skeleton className={cn("h-4 rounded", ["w-2/3", "w-1/2", "w-3/5", "w-2/5"][i % 4])} />
            <Skeleton className="ml-auto h-3 w-16 shrink-0 rounded" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-3 h-3 w-28 rounded" />
    </SkeletonRegion>
  );
}
