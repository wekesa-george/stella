import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#1a2230]", className)}
      {...props}
    />
  );
}

/** A card-shaped skeleton with optional height */
export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("bg-dark-elevated border border-dark rounded-md p-3.5 space-y-3", className)}>
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-7 w-20" />
      {Array.from({ length: lines - 2 }).map((_, i) => (
        <Skeleton key={i} className="h-2 w-16" />
      ))}
    </div>
  );
}

/** Full-page dashboard skeleton */
export function DashboardSkeleton() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Bot grid skeleton */
export function BotGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-dark-elevated border border-dark rounded-md p-3 space-y-2.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-4">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Alert list skeleton */
export function AlertListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-dark/50">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-3 flex gap-3">
          <Skeleton className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Strategy grid skeleton */
export function StrategyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-dark-elevated border border-dark rounded-md p-3.5 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="flex justify-between pt-1">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Infra card skeleton */
export function InfraGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-dark-elevated border border-dark rounded-md p-3 space-y-2">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-2 w-8" />
                <Skeleton className="h-2 w-10" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
