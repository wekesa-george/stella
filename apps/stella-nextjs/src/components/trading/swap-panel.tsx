"use client";

import { useState } from "react";
import { ArrowDown, Info, Settings, Clock, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SwapPanel() {
  const [fromAmount, setFromAmount] = useState("0");
  const [toAmount, setToAmount] = useState("0");

  return (
    <Card className="border-border/40 bg-card">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Swap to:</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 bg-primary/10 px-2 text-xs text-primary"
            >
              Crypto
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              Fiat
            </Button>
          </div>
        </div>

        <div className="relative rounded-md border border-border/40 bg-background p-2.5">
          <Input
            type="text"
            placeholder='Try typing "10 ETH to BTC"'
            className="border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0"
          />
          <div className="mt-1 text-[10px] text-muted-foreground">Ctrl+K</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* From Token */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>From</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background p-2.5">
            <Input
              type="number"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="border-0 bg-transparent px-0 text-xl font-medium focus-visible:ring-0"
              placeholder="0"
            />
            <Select defaultValue="eth">
              <SelectTrigger className="w-28 border-0 bg-muted">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20">
                    Ξ
                  </div>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eth">ETH</SelectItem>
                <SelectItem value="btc">BTC</SelectItem>
                <SelectItem value="usdt">USDT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Balance: 0</span>
          </div>
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-muted hover:bg-muted/80"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>

        {/* To Token */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>To</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background p-2.5">
            <Input
              type="number"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              className="border-0 bg-transparent px-0 text-xl font-medium focus-visible:ring-0"
              placeholder="0"
            />
            <Select defaultValue="eur">
              <SelectTrigger className="w-28 border-0 bg-muted">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20">
                    €
                  </div>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eur">EUR</SelectItem>
                <SelectItem value="usd">USD</SelectItem>
                <SelectItem value="gbp">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Balance: 0</span>
          </div>
        </div>

        {/* Swap Details */}
        <div className="space-y-2 rounded-lg border border-border/40 bg-background p-3">
          <button className="flex w-full items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <span>Max Slippage</span>
              <Info className="h-3 w-3" />
            </span>
            <span className="font-medium">0.5%</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Minimum Received</span>
              <Info className="h-3 w-3" />
            </div>
            <span className="font-medium">$3 USD</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Gas Fee</span>
              <Info className="h-3 w-3" />
            </div>
            <span className="font-medium">$16.34</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Price Impact</span>
              <Info className="h-3 w-3" />
            </div>
            <span className="font-medium text-destructive">{"< 0.01%"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
          >
            <Clock className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 text-muted-foreground"
          >
            <Repeat className="h-4 w-4" />
          </Button>
        </div>

        <Button className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90">
          Maximum Return
        </Button>

        <div className="space-y-2 text-xs">
          <button className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background p-3 text-left transition-colors hover:bg-muted/50">
            <span className="font-medium text-foreground">
              MORE INFORMATION
            </span>
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
