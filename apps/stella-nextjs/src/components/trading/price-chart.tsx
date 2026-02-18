"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const timeframes = ["1H", "4H", "1D", "1W", "1M", "6M"];

export function PriceChart() {
  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-4">
        {/* Chart Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">$</span>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  Ξ
                </div>
                <span className="text-lg font-semibold">ETH</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-lg font-semibold">USDT</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">1859.07 USDT</span>
            </div>
            <div className="text-xs text-muted-foreground">Past 24 hours</div>
          </div>

          {/* Timeframe Selector */}
          <div className="flex gap-1 rounded-lg border border-border/40 bg-background p-1">
            {timeframes.map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                className={`h-7 px-3 text-xs ${
                  tf === "1D"
                    ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                    : "text-muted-foreground"
                }`}
              >
                {tf}
              </Button>
            ))}
          </div>
        </div>

        {/* Chart Area - Placeholder with gradient */}
        <div className="relative h-[300px] overflow-hidden rounded-lg border border-border/40 bg-background">
          {/* Grid Lines */}
          <div className="absolute inset-0">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-border/30"
                style={{ top: `${(i + 1) * 16.66}%` }}
              />
            ))}
          </div>

          {/* Price Labels */}
          <div className="absolute left-2 top-0 flex h-full flex-col justify-between py-2 text-xs text-muted-foreground">
            <span>$1900.00</span>
            <span>$1800.00</span>
            <span>$1700.00</span>
            <span>$1600.00</span>
            <span>$1500.00</span>
            <span>$1400.00</span>
          </div>

          {/* Chart Line - Simulated with SVG */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 300">
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(74, 222, 128)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(74, 222, 128)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Area under the line */}
            <path
              d="M 50 200 L 100 180 L 150 160 L 200 140 L 250 145 L 300 150 L 350 155 L 400 150 L 450 155 L 500 145 L 550 130 L 600 120 L 650 100 L 700 80 L 750 110 L 800 140 L 800 300 L 50 300 Z"
              fill="url(#chartGradient)"
            />
            {/* Main line */}
            <path
              d="M 50 200 L 100 180 L 150 160 L 200 140 L 250 145 L 300 150 L 350 155 L 400 150 L 450 155 L 500 145 L 550 130 L 600 120 L 650 100 L 700 80 L 750 110"
              fill="none"
              stroke="rgb(74, 222, 128)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Time Labels */}
          <div className="absolute bottom-2 left-12 right-2 flex justify-between text-xs text-muted-foreground">
            <span>5:58 PM</span>
            <span>10:10 PM</span>
            <span>2:23 AM</span>
            <span>6:35 AM</span>
            <span>10:47 AM</span>
            <span>3:00 PM</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
