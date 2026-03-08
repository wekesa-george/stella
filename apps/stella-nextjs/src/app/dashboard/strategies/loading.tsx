import { StrategyGridSkeleton } from "@/components/ui/skeleton";

export default function StrategiesLoading() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-3 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-20 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-32 bg-[#1a2230] rounded animate-pulse mb-2" />
              <div className="h-4 w-56 bg-[#1a2230] rounded animate-pulse" />
            </div>
            <div className="h-9 w-36 bg-[#1a2230] rounded animate-pulse" />
          </div>
          <StrategyGridSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
