import { InfraGridSkeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function InfraLoading() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <div className="h-3 w-16 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-3 bg-[#1a2230] rounded animate-pulse" />
            <div className="h-3 w-28 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* Header */}
          <div>
            <div className="h-7 w-40 bg-[#1a2230] rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-[#1a2230] rounded animate-pulse" />
          </div>
          {/* BEAM VM + DB cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SkeletonCard lines={6} className="h-48" />
            <SkeletonCard lines={6} className="h-48" />
          </div>
          {/* Service grid */}
          <InfraGridSkeleton count={5} />
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md p-3 h-48 animate-pulse" />
            <div className="bg-[#0d1117] border border-[#1e2d40] rounded-md p-3 h-48 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
