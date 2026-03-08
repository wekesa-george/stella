import { Skeleton } from "@/components/ui/skeleton";

export default function TradingLoading() {
  return (
    <div className="flex h-full">
      <div className="flex-1 p-4 space-y-4">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-8">
            <Skeleton className="h-[400px] w-full rounded-md" />
          </div>
          <div className="col-span-4 space-y-3">
            <Skeleton className="h-48 w-full rounded-md" />
            <Skeleton className="h-48 w-full rounded-md" />
          </div>
        </div>
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}
