import { BotGridSkeleton } from "@/components/ui/skeleton";

export default function BotFleetLoading() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header skeleton */}
          <div className="flex items-center gap-2 text-xs">
            <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-3 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-32 bg-[#1a2230] rounded animate-pulse mb-2" />
              <div className="h-4 w-48 bg-[#1a2230] rounded animate-pulse" />
            </div>
            <div className="h-9 w-28 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* Filter bar skeleton */}
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-24 bg-[#1a2230] rounded animate-pulse" />
            ))}
          </div>
          <BotGridSkeleton count={8} />
        </div>
      </div>
    </div>
  );
}
