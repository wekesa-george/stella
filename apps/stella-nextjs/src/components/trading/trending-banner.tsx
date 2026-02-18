"use client";

import { TrendingUp, Info, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const trendingTokens = [
  { symbol: "ZRX", price: "0.34$", change: "+19%", isPositive: true },
  { symbol: "LINA", price: "0.0142$", change: "+18%", isPositive: true },
  { symbol: "FLOKI", price: "< $0.0001", change: "0%", isPositive: null },
  { symbol: "WOO", price: "< $0.22", change: "+7%", isPositive: true },
];

export function TrendingBanner() {
  return (
    <div className="flex items-center gap-4 overflow-x-auto rounded-lg border border-border/40 bg-card px-4 py-2.5">
      {/* Trending Label */}
      <div className="flex shrink-0 items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Trending Soon</span>
      </div>

      {/* Trending Tokens */}
      <div className="flex items-center gap-6">
        {trendingTokens.map((token) => (
          <Link
            key={token.symbol}
            href={`/trade/${token.symbol}`}
            className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              <span className="text-xs">🪙</span>
            </div>
            <span className="text-sm font-medium">{token.symbol}</span>
            <span className="text-sm text-muted-foreground">{token.price}</span>
            <Badge
              variant={
                token.isPositive === true
                  ? "default"
                  : token.isPositive === false
                    ? "destructive"
                    : "secondary"
              }
              className={
                token.isPositive === true
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : ""
              }
            >
              {token.change}
            </Badge>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <Info className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-primary"
            >
              <ShoppingCart className="h-3 w-3" />
            </Button>
          </Link>
        ))}
      </div>

      {/* Discover More */}
      <Link
        href="/discover"
        className="ml-auto shrink-0 text-sm text-primary hover:underline"
      >
        Discover more
      </Link>
    </div>
  );
}
