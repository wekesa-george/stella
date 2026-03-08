import { AlertListSkeleton } from "@/components/ui/skeleton";

export default function AlertsLoading() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-3 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-14 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-24 bg-[#1a2230] rounded animate-pulse mb-2" />
              <div className="h-4 w-60 bg-[#1a2230] rounded animate-pulse" />
            </div>
            <div className="h-9 w-32 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-[#0d1117] border border-[#1e2d40] rounded-md p-3 space-y-2">
                <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
                <div className="h-6 w-10 bg-[#1a2230] rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* Alert list */}
          <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md">
            <AlertListSkeleton count={8} />
          </div>
        </div>
      </div>
    </div>
  );
}
