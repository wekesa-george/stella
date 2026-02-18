"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Card className="border-border/40 bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AreaChartPlaceholder() {
  return (
    <div className="relative h-[300px] w-full">
      <svg className="h-full w-full" viewBox="0 0 800 300">
        <defs>
          <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(142, 76, 56)" stopOpacity="0.3" />
            <stop
              offset="100%"
              stopColor="rgb(142, 76, 56)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1="0"
            y1={i * 75}
            x2="800"
            y2={i * 75}
            stroke="hsl(0 0% 14%)"
            strokeOpacity="0.4"
          />
        ))}

        {/* Area fill */}
        <path
          d="M 0 250 L 50 220 L 100 200 L 150 180 L 200 160 L 250 140 L 300 135 L 350 130 L 400 110 L 450 105 L 500 95 L 550 80 L 600 70 L 650 60 L 700 55 L 750 50 L 800 45 L 800 300 L 0 300 Z"
          fill="url(#areaGradient)"
        />

        {/* Line */}
        <path
          d="M 0 250 L 50 220 L 100 200 L 150 180 L 200 160 L 250 140 L 300 135 L 350 130 L 400 110 L 450 105 L 500 95 L 550 80 L 600 70 L 650 60 L 700 55 L 750 50 L 800 45"
          fill="none"
          stroke="rgb(142, 76, 56)"
          strokeWidth="2"
        />
      </svg>

      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 flex h-full flex-col justify-between py-2 text-xs text-muted-foreground">
        <span>$100k</span>
        <span>$75k</span>
        <span>$50k</span>
        <span>$25k</span>
        <span>$0</span>
      </div>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-12 right-0 flex justify-between text-xs text-muted-foreground">
        <span>Jan</span>
        <span>Mar</span>
        <span>May</span>
        <span>Jul</span>
        <span>Sep</span>
        <span>Nov</span>
      </div>
    </div>
  );
}

export function DonutChartPlaceholder() {
  return (
    <div className="relative flex h-[300px] w-full items-center justify-center">
      <svg className="h-64 w-64" viewBox="0 0 200 200">
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="rgb(142, 76, 56)"
          strokeWidth="30"
          strokeDasharray="188.4 188.4"
          transform="rotate(-90 100 100)"
        />
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="rgb(34, 197, 94)"
          strokeWidth="30"
          strokeDasharray="94.2 282.6"
          strokeDashoffset="-188.4"
          transform="rotate(-90 100 100)"
        />
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="rgb(59, 130, 246)"
          strokeWidth="30"
          strokeDasharray="47.1 329.7"
          strokeDashoffset="-282.6"
          transform="rotate(-90 100 100)"
        />
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="rgb(168, 85, 247)"
          strokeWidth="30"
          strokeDasharray="47.1 329.7"
          strokeDashoffset="-329.7"
          transform="rotate(-90 100 100)"
        />
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[rgb(142,76,56)]" />
          <span>ETH/USDT (50%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[rgb(34,197,94)]" />
          <span>BTC/USDT (25%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[rgb(59,130,246)]" />
          <span>BNB/USDT (12.5%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[rgb(168,85,247)]" />
          <span>MATIC/USDT (12.5%)</span>
        </div>
      </div>
    </div>
  );
}
