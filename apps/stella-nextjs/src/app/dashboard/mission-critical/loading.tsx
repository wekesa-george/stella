import { Skeleton } from "@/components/ui/skeleton";

export default function MissionCriticalLoading() {
  return (
    <div className="flex flex-col h-screen bg-[#070b0f]">
      {/* Top bar */}
      <div className="h-11 border-b border-[#1e2d40] flex items-center px-4 gap-4 flex-shrink-0">
        <Skeleton className="h-4 w-32" />
        <div className="flex-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
      {/* Main content grid */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left panel */}
        <div className="col-span-3 border-r border-[#1e2d40] p-3 space-y-3">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#0d1117] rounded p-2.5 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-2 w-full" />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
        {/* Center panel */}
        <div className="col-span-6 p-3 space-y-3">
          <Skeleton className="h-40 w-full rounded" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-[#0d1117] rounded p-2.5 space-y-1.5">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded" />
        </div>
        {/* Right panel */}
        <div className="col-span-3 border-l border-[#1e2d40] p-3 space-y-3">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2 py-2">
              <Skeleton className="h-2 w-2 rounded-full mt-1 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
