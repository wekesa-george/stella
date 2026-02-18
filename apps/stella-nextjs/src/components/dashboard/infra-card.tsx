import { cn } from "@/lib/utils";
import type { InfraMetric } from "@/lib/types/dashboard";

interface InfraCardProps {
  name: string;
  metrics: InfraMetric;
  warnThreshold?: number;
  critThreshold?: number;
}

function gaugeColor(val: number, warn = 60, crit = 85) {
  if (val >= crit) return "bg-red";
  if (val >= warn) return "bg-amber";
  return "bg-green";
}

function infraStatus(metrics: InfraMetric, warn = 60, crit = 85) {
  const max = Math.max(metrics.cpu, metrics.ram);
  if (max >= crit) return "critical";
  if (max >= warn) return "warning";
  return "normal";
}

export function InfraCard({ name, metrics, warnThreshold = 60, critThreshold = 85 }: InfraCardProps) {
  const status = infraStatus(metrics, warnThreshold, critThreshold);

  return (
    <div
      className={cn(
        "bg-dark-elevated border border-dark rounded-md p-3 flex flex-col gap-2",
        status === "warning" && "border-amber",
        status === "critical" && "border-red shadow-[0_0_12px_rgba(255,71,87,0.15)]"
      )}
    >
      <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{name}</div>

      {/* CPU Metric */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[9px] text-dim uppercase tracking-widest">
          <span>CPU</span>
          <span className="font-mono">{metrics.cpu}%</span>
        </div>
        <div className="h-1 bg-dark-section rounded-sm overflow-hidden">
          <div
            className={cn("h-full rounded-sm transition-all duration-700", gaugeColor(metrics.cpu, warnThreshold, critThreshold))}
            style={{ width: `${metrics.cpu}%` }}
          />
        </div>
      </div>

      {/* RAM Metric */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[9px] text-dim uppercase tracking-widest">
          <span>RAM</span>
          <span className="font-mono">{metrics.ram}%</span>
        </div>
        <div className="h-1 bg-dark-section rounded-sm overflow-hidden">
          <div
            className={cn("h-full rounded-sm transition-all duration-700", gaugeColor(metrics.ram, warnThreshold, critThreshold))}
            style={{ width: `${metrics.ram}%` }}
          />
        </div>
      </div>

      {/* Disk Metric */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center text-[9px] text-dim uppercase tracking-widest">
          <span>DISK</span>
          <span className="font-mono">{metrics.disk}%</span>
        </div>
        <div className="h-1 bg-dark-section rounded-sm overflow-hidden">
          <div
            className={cn("h-full rounded-sm transition-all duration-700", gaugeColor(metrics.disk, warnThreshold, critThreshold))}
            style={{ width: `${metrics.disk}%` }}
          />
        </div>
      </div>
    </div>
  );
}
