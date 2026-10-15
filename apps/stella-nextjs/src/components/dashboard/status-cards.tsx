import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  variant?: "default" | "success" | "warning";
}

export function StatusCard({
  title,
  value,
  subtitle,
  variant = "default",
}: StatusCardProps) {
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformStatusCard() {
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Platform Status</p>
          <p className="text-2xl font-bold">Idle</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-xs text-primary">All Systems Operational</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DataFreshnessCard() {
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Data Freshness</p>
          <p className="text-2xl font-bold">Live</p>
          <p className="text-xs text-muted-foreground">Auto-refresh 10s</p>
        </div>
      </CardContent>
    </Card>
  );
}
