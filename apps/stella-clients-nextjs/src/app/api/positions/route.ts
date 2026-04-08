import { NextResponse } from "next/server";

// GET: List all open positions
export async function GET() {
  // Mock position data
  const positions = [
    {
      id: "1",
      botId: "1",
      botName: "Bot #1",
      pair: "BTC/USDT",
      side: "LONG",
      entryPrice: 42150,
      currentPrice: 42380,
      quantity: 0.1,
      pnl: 230.0,
      unrealizedPnl: 23.0,
      openedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "2",
      botId: "2",
      botName: "Bot #2",
      pair: "ETH/USDT",
      side: "SHORT",
      entryPrice: 2240,
      currentPrice: 2220,
      quantity: 5,
      pnl: 100.0,
      unrealizedPnl: 20.0,
      openedAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "3",
      botId: "3",
      botName: "Bot #3",
      pair: "SOL/USDT",
      side: "LONG",
      entryPrice: 98.5,
      currentPrice: 97.2,
      quantity: 10,
      pnl: -13.0,
      unrealizedPnl: -13.0,
      openedAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  return NextResponse.json(positions);
}
