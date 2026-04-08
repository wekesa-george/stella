import { NextResponse } from "next/server";

// GET: List all bots
export async function GET() {
  // Mock bot data
  const bots = [
    {
      id: "1",
      name: "Bot #1",
      strategy: "Mean Reversion",
      status: "running",
      pnl: 847.5,
      exchange: "Binance",
      pair: "BTC/USDT",
    },
    {
      id: "2",
      name: "Bot #2",
      strategy: "Trend Following",
      status: "running",
      pnl: 234.2,
      exchange: "Alpaca",
      pair: "ETH/USDT",
    },
    {
      id: "3",
      name: "Bot #3",
      strategy: "Grid Trading",
      status: "paused",
      pnl: -45.8,
      exchange: "Binance",
      pair: "SOL/USDT",
    },
  ];

  return NextResponse.json(bots);
}

// POST: Create a new bot
export async function POST(request: Request) {
  const body = await request.json();

  // TODO: Validate and create bot via NestJS backend
  const newBot = {
    id: Date.now().toString(),
    ...body,
    status: "created",
    pnl: 0,
  };

  return NextResponse.json(newBot, { status: 201 });
}
