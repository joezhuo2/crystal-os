import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** "shimmer" sweeps a highlight across the block, "pulse" fades it in place. */
  variant?: "shimmer" | "pulse";
};

function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md",
        variant === "shimmer" ? "skeleton-shimmer" : "animate-pulse bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
