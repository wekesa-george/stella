"use client";

import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { CandlestickData, BotOrder, BotPosition, BotConfig } from "@/lib/types/bot.types";

interface BotCandlestickChartProps {
  candles: CandlestickData[];
  botConfig: BotConfig;
  orders?: BotOrder[];
  positions?: BotPosition[];
}

function fmtP(p: number) {
  if (p >= 10000) return p.toFixed(1);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(4);
}

export function BotCandlestickChart({
  candles,
  botConfig,
  orders = [],
  positions = [],
}: BotCandlestickChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 480 });
  const [hov, setHov] = useState<number | null>(null);
  const [mxy, setMxy] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!candles || candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-[#080c10]">
        <div className="text-[#5a7090] font-mono text-sm">No chart data available</div>
      </div>
    );
  }

  // Convert candlestick data to chart format
  const chartCandles = candles.map((c, i) => ({
    i,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume || 0,
  }));

  const PAD = { t: 14, r: 72, b: 28, l: 8 };
  const VOL_H = Math.floor(dims.h * 0.18);
  const CH = dims.h - PAD.t - PAD.b - VOL_H - 4;
  const CW = dims.w - PAD.l - PAD.r;

  const prices = useMemo(() => {
    const candlePrices = chartCandles.flatMap((c) => [c.high, c.low]);
    // Include grid range so grid lines are always visible
    if (botConfig.gridConfig) {
      candlePrices.push(botConfig.gridConfig.upper_price, botConfig.gridConfig.lower_price);
    }
    // Include active order prices
    orders.forEach((o) => {
      if (o.price > 0 && ["open", "submitted", "partially_filled", "new"].includes(o.status?.toLowerCase?.() || "")) {
        candlePrices.push(o.price);
      }
    });
    return candlePrices;
  }, [chartCandles, botConfig.gridConfig, orders]);
  const minP = useMemo(() => Math.min(...prices) * 0.9994, [prices]);
  const maxP = useMemo(() => Math.max(...prices) * 1.0006, [prices]);
  const maxVol = useMemo(
    () => Math.max(...chartCandles.map((c) => c.volume)),
    [chartCandles]
  );

  const toX = (i: number) => PAD.l + ((i + 0.5) / chartCandles.length) * CW;
  const toY = (p: number) => PAD.t + (1 - (p - minP) / (maxP - minP)) * CH;
  const toYV = (v: number) => dims.h - PAD.b - (v / maxVol) * VOL_H;
  const cW = Math.max(2, (CW / chartCandles.length) * 0.65);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setMxy({ x: mx, y: my });
      setHov(
        Math.max(
          0,
          Math.min(
            chartCandles.length - 1,
            Math.round((mx - PAD.l) / CW * chartCandles.length - 0.5)
          )
        )
      );
    },
    [chartCandles.length, CW]
  );

  const yTicks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const p = minP + (i / 5) * (maxP - minP);
        return { p, y: toY(p) };
      }),
    [minP, maxP, dims]
  );

  const hovC = hov !== null ? chartCandles[hov] : chartCandles[chartCandles.length - 1];
  const lastC = chartCandles[chartCandles.length - 1];
  const lastY = toY(lastC.close);

  // Convert orders to chart markers
  const chartOrders = orders
    .filter((o) => o.status === "filled" && o.filledAt)
    .map((o) => {
      // Find closest candle by timestamp
      const orderTime = new Date(o.filledAt!).getTime() / 1000;
      const candleIndex = candles.findIndex(
        (c, i) => c.time <= orderTime && (!candles[i + 1] || candles[i + 1].time > orderTime)
      );
      return {
        i: candleIndex >= 0 ? candleIndex : 0,
        price: o.price,
        side: o.side.toUpperCase(),
        bot: o.botId,
        filled: true,
      };
    });

  // Active (open) orders — shown as horizontal lines on chart
  const activeOrders = orders
    .filter((o) => ["open", "submitted", "partially_filled", "new"].includes(o.status?.toLowerCase?.() || ""))
    .filter((o) => o.price > 0)
    .map((o) => ({
      price: o.price,
      side: o.side?.toUpperCase() || "",
      quantity: o.quantity,
      status: o.status,
    }));

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* OHLCV readout */}
      <div className="absolute top-3 left-4 flex gap-4 pointer-events-none z-10">
        {[
          ["O", hovC.open],
          ["H", hovC.high],
          ["L", hovC.low],
          ["C", hovC.close],
        ].map(([l, v]) => (
          <div key={l} className="flex flex-col gap-0.5">
            <div className="font-mono text-[8px] text-[#5a7090] uppercase">{l}</div>
            <div
              className="font-mono text-[11px] font-medium"
              style={{
                color:
                  l === "C"
                    ? hovC.close >= hovC.open
                      ? "#00e5a0"
                      : "#ff4757"
                    : "#8fa3b8",
              }}
            >
              {fmtP(v as number)}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <div className="font-mono text-[8px] text-[#5a7090] uppercase">Vol</div>
          <div className="font-mono text-[11px] text-[#5a7090]">
            {(hovC.volume / 1e6).toFixed(2)}M
          </div>
        </div>
      </div>

      <svg
        className="w-full h-full cursor-crosshair"
        width={dims.w}
        height={dims.h}
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHov(null);
          setMxy(null);
        }}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line
            key={i}
            x1={PAD.l}
            y1={t.y}
            x2={dims.w - PAD.r}
            y2={t.y}
            stroke="#1a2230"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        ))}

        {/* Grid level lines and zones - DRAW FIRST so candles are on top */}
        {botConfig.gridConfig && (() => {
          const { upper_price: upperPrice, lower_price: lowerPrice, grid_levels: gridLevels } = botConfig.gridConfig;
          const upperY = toY(upperPrice);
          const lowerY = toY(lowerPrice);
          const priceStep = (upperPrice - lowerPrice) / gridLevels;

          return (
            <>
              {/* Buy zone (lower 30%) - green overlay */}
              {(() => {
                const buyZoneTop = lowerPrice + (upperPrice - lowerPrice) * 0.3;
                const buyZoneTopY = toY(buyZoneTop);
                const buyZoneHeight = lowerY - buyZoneTopY;

                if (lowerY >= PAD.t && buyZoneTopY <= PAD.t + CH) {
                  return (
                    <rect
                      x={PAD.l}
                      y={Math.max(PAD.t, buyZoneTopY)}
                      width={CW}
                      height={Math.min(buyZoneHeight, PAD.t + CH - Math.max(PAD.t, buyZoneTopY))}
                      fill="rgba(0, 229, 160, 0.12)"
                    />
                  );
                }
              })()}

              {/* Sell zone (upper 30%) - red overlay */}
              {(() => {
                const sellZoneBottom = upperPrice - (upperPrice - lowerPrice) * 0.3;
                const sellZoneBottomY = toY(sellZoneBottom);
                const sellZoneHeight = sellZoneBottomY - upperY;

                if (upperY >= PAD.t && sellZoneBottomY <= PAD.t + CH) {
                  return (
                    <rect
                      x={PAD.l}
                      y={Math.max(PAD.t, upperY)}
                      width={CW}
                      height={Math.min(sellZoneHeight, PAD.t + CH - Math.max(PAD.t, upperY))}
                      fill="rgba(255, 107, 107, 0.12)"
                    />
                  );
                }
              })()}

              {/* All grid levels - more visible */}
              {Array.from({ length: gridLevels + 1 }, (_, i) => {
                const gridPrice = lowerPrice + priceStep * i;
                const y = toY(gridPrice);

                if (y < PAD.t || y > PAD.t + CH) return null;

                const isUpperOrLower = i === 0 || i === gridLevels;

                return (
                  <line
                    key={`grid-${i}`}
                    x1={PAD.l}
                    y1={y}
                    x2={dims.w - PAD.r}
                    y2={y}
                    stroke={isUpperOrLower ? (i === gridLevels ? "#4a9eff" : "#ff6b6b") : "rgba(200, 200, 200, 0.25)"}
                    strokeWidth={isUpperOrLower ? "2" : "1"}
                    strokeDasharray={isUpperOrLower ? "6 3" : "4 4"}
                    opacity={isUpperOrLower ? "0.9" : "0.6"}
                  />
                );
              })}
            </>
          );
        })()}

        {/* Volume bars */}
        {chartCandles.map((c, i) => {
          const vx = toX(i);
          const vy = toYV(c.volume);
          const vH = dims.h - PAD.b - vy;
          return (
            <rect
              key={`v${i}`}
              x={vx - cW / 2}
              y={vy}
              width={cW}
              height={Math.max(1, vH)}
              fill={
                c.close >= c.open
                  ? "rgba(0,229,160,0.16)"
                  : "rgba(255,71,87,0.16)"
              }
            />
          );
        })}

        {/* Vol divider */}
        <line
          x1={PAD.l}
          y1={dims.h - PAD.b - VOL_H}
          x2={dims.w - PAD.r}
          y2={dims.h - PAD.b - VOL_H}
          stroke="#1e2d40"
          strokeWidth="1"
        />

        {/* Candle bodies + wicks */}
        {chartCandles.map((c, i) => {
          const x = toX(i);
          const yO = toY(c.open);
          const yC = toY(c.close);
          const yH = toY(c.high);
          const yL = toY(c.low);
          const bull = c.close >= c.open;
          const col = bull ? "#00e5a0" : "#ff4757";
          const bY = Math.min(yO, yC);
          const bH = Math.max(1.5, Math.abs(yC - yO));
          return (
            <g key={`c${i}`}>
              <line
                x1={x}
                y1={yH}
                x2={x}
                y2={yL}
                stroke={col}
                strokeWidth="1"
                opacity="0.65"
              />
              <rect
                x={x - cW / 2}
                y={bY}
                width={cW}
                height={bH}
                fill={bull ? "rgba(0,229,160,0.88)" : "rgba(255,71,87,0.84)"}
                stroke={col}
                strokeWidth="0.4"
              />
            </g>
          );
        })}

        {/* Grid price labels - drawn on top */}
        {botConfig.gridConfig && (() => {
          const { upper_price: upperPrice, lower_price: lowerPrice } = botConfig.gridConfig;
          const upperY = toY(upperPrice);
          const lowerY = toY(lowerPrice);

          return (
            <>
              {/* Upper price label */}
              {upperY >= PAD.t && upperY <= PAD.t + CH && (
                <>
                  <rect
                    x={dims.w - PAD.r + 2}
                    y={upperY - 8}
                    width={PAD.r - 4}
                    height={15}
                    fill="rgba(74, 158, 255, 0.2)"
                    rx="1"
                  />
                  <text
                    x={dims.w - PAD.r + 5}
                    y={upperY + 3}
                    fontSize="8"
                    fill="#4a9eff"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    UPPER
                  </text>
                </>
              )}

              {/* Lower price label */}
              {lowerY >= PAD.t && lowerY <= PAD.t + CH && (
                <>
                  <rect
                    x={dims.w - PAD.r + 2}
                    y={lowerY - 8}
                    width={PAD.r - 4}
                    height={15}
                    fill="rgba(255, 107, 107, 0.2)"
                    rx="1"
                  />
                  <text
                    x={dims.w - PAD.r + 5}
                    y={lowerY + 3}
                    fontSize="8"
                    fill="#ff6b6b"
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    LOWER
                  </text>
                </>
              )}
            </>
          );
        })()}

        {/* Order markers (triangles) */}
        {chartOrders.map((o, idx) => {
          const x = toX(o.i);
          const yp = toY(o.price);
          if (yp < PAD.t || yp > PAD.t + CH) return null;
          const isBuy = o.side === "BUY";
          const col = isBuy ? "#00e5a0" : "#f5a623";
          const oy = isBuy ? yp + 10 : yp - 10;
          const tri = isBuy
            ? `${x},${oy - 9} ${x - 5},${oy} ${x + 5},${oy}`
            : `${x},${oy + 9} ${x - 5},${oy} ${x + 5},${oy}`;
          return (
            <polygon key={idx} points={tri} fill={col} opacity="0.82">
              <title>
                {o.bot} {o.side} {fmtP(o.price)}
              </title>
            </polygon>
          );
        })}

        {/* Active (open) order lines */}
        {activeOrders.map((o, idx) => {
          const y = toY(o.price);
          if (y < PAD.t || y > PAD.t + CH) return null;
          const isBuy = o.side === "BUY";
          const col = isBuy ? "#00e5a0" : "#f5a623";
          return (
            <g key={`ao-${idx}`}>
              <line
                x1={PAD.l}
                y1={y}
                x2={dims.w - PAD.r}
                y2={y}
                stroke={col}
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.5"
              />
              {/* Small label on left side */}
              <rect
                x={PAD.l}
                y={y - 6}
                width={36}
                height={12}
                fill={isBuy ? "rgba(0,229,160,0.15)" : "rgba(245,166,35,0.15)"}
                stroke={col}
                strokeWidth="0.5"
                rx="2"
              />
              <text x={PAD.l + 2} y={y + 3} fontSize="7" fill={col} fontFamily="monospace" fontWeight="600">
                {isBuy ? "BUY" : "SELL"}
              </text>
              {/* Price label on right */}
              <rect
                x={dims.w - PAD.r + 2}
                y={y - 6}
                width={PAD.r - 4}
                height={12}
                fill={isBuy ? "rgba(0,229,160,0.15)" : "rgba(245,166,35,0.15)"}
                rx="1"
              />
              <text x={dims.w - PAD.r + 4} y={y + 3} fontSize="7" fill={col} fontFamily="monospace">
                {fmtP(o.price)}
              </text>
            </g>
          );
        })}

        {/* Current price line */}
        <line
          x1={PAD.l}
          y1={lastY}
          x2={dims.w - PAD.r}
          y2={lastY}
          stroke="#00e5a0"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.45"
        />
        <rect
          x={dims.w - PAD.r + 1}
          y={lastY - 8}
          width={PAD.r - 2}
          height={15}
          fill="#00e5a0"
          rx="2"
        />
        <text
          x={dims.w - PAD.r + 5}
          y={lastY + 4}
          fontSize="9"
          fill="#000"
          fontFamily="monospace"
          fontWeight="700"
        >
          {fmtP(lastC.close)}
        </text>

        {/* Y-axis price labels */}
        {yTicks.map((t, i) => (
          <text
            key={i}
            x={dims.w - PAD.r + 5}
            y={t.y + 3}
            fontSize="9"
            fill="#5a7090"
            fontFamily="monospace"
          >
            {fmtP(t.p)}
          </text>
        ))}

        {/* Crosshair */}
        {mxy && hov !== null && (
          <>
            <line
              x1={toX(hov)}
              y1={PAD.t}
              x2={toX(hov)}
              y2={dims.h - PAD.b}
              stroke="#253550"
              strokeWidth="1"
            />
            <line
              x1={PAD.l}
              y1={mxy.y}
              x2={dims.w - PAD.r}
              y2={mxy.y}
              stroke="#253550"
              strokeWidth="1"
            />
            <rect
              x={dims.w - PAD.r + 1}
              y={mxy.y - 8}
              width={PAD.r - 2}
              height={15}
              fill="#1a2230"
              stroke="#253550"
              rx="2"
            />
            <text
              x={dims.w - PAD.r + 5}
              y={mxy.y + 4}
              fontSize="9"
              fill="#8fa3b8"
              fontFamily="monospace"
            >
              {fmtP(minP + (1 - (mxy.y - PAD.t) / CH) * (maxP - minP))}
            </text>
            <rect
              x={toX(hov) - cW / 2 - 2}
              y={PAD.t}
              width={cW + 4}
              height={CH}
              fill="rgba(255,255,255,0.025)"
            />
          </>
        )}
      </svg>
    </div>
  );
}
