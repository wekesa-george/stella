# Trading Bot Chart Implementation

Complete implementation of TradingView-style charts with real-time data integration for BOT-0001 (Paper Trading) and BOT-0002 (Live Trading).

## 🎯 Overview

This implementation provides professional trading charts with:
- **TradingView Lightweight Charts** integration
- **Dual chart views**: Timeline and TradingView
- **Real-time market data** from Binance API
- **Bot order overlays** and grid level visualization
- **Paper trading** (Alpaca) and **live trading** (Binance) support

## 📁 Project Structure

```
src/
├── lib/
│   ├── types/
│   │   └── bot.types.ts              # TypeScript interfaces for bots, orders, positions
│   ├── config/
│   │   └── bot-fleet.ts               # Bot fleet configuration (BOT-0001, BOT-0002)
│   ├── api/
│   │   ├── binance.ts                 # Binance API integration (market data)
│   │   ├── alpaca.ts                  # Alpaca paper trading API
│   │   ├── trading-engine.ts          # Trading engine API client
│   │   └── tradingEngineApi.ts        # Complete trading engine API utility
│   └── hooks/
│       └── useRealtimePriceData.ts    # WebSocket hook for live price updates
├── components/
│   └── trading/
│       ├── TradingViewChart.tsx       # TradingView Lightweight Charts component
│       └── TimelineChart.tsx          # Custom timeline visualization
└── app/
    └── dashboard/
        └── bot/
            └── [id]/
                └── page.tsx            # Bot detail page with chart toggle
```

## 🤖 Bot Fleet Configuration

### BOT-0001: Paper Trading Grid Bot
- **Exchange**: Alpaca (Paper Trading)
- **Symbol**: BTC/USD
- **Strategy**: Grid Trading
- **Chart Data Source**: Binance (for realistic prices)
- **Order Execution**: Simulated through Trading Engine

**Grid Configuration:**
```typescript
{
  upperPrice: 105000,
  lowerPrice: 85000,
  gridLevels: 20,
  investmentPerGrid: 500,
  totalInvestment: 10000
}
```

### BOT-0002: Live Binance Grid Bot
- **Exchange**: Binance (Live Trading)
- **Symbol**: BTCUSDT
- **Strategy**: Grid Trading
- **Chart Data Source**: Binance API
- **Order Execution**: Real trading via Trading Engine

**Grid Configuration:**
```typescript
{
  upperPrice: 31175.45,
  lowerPrice: 18002.65,
  gridLevels: 40,
  investmentPerGrid: 250,
  totalInvestment: 10000
}
```

## 📊 Chart Features

### TradingView Chart Component

**Features:**
- Professional candlestick charts
- Grid level overlays (upper/lower price lines)
- Buy/sell order markers
- Real-time price updates
- Customizable timeframes (1m, 5m, 15m, 1h, 4h, 1d)
- Dark theme optimized

**Usage:**
```typescript
import { TradingViewChart } from '@/components/trading/TradingViewChart';

<TradingViewChart
  data={candleData}           // Array of OHLCV data
  botConfig={botConfig}        // Bot configuration with grid settings
  orders={orders}              // Array of bot orders for markers
/>
```

### Timeline Chart Component

**Features:**
- Custom canvas-based visualization
- Order timeline with price movement
- Buy/sell markers
- Grid level indicators
- Statistics panel (total trades, win rate, etc.)

**Usage:**
```typescript
import { TimelineChart } from '@/components/trading/TimelineChart';

<TimelineChart
  orders={orders}              // Bot orders
  positions={positions}        // Bot positions
  botConfig={botConfig}        // Bot configuration
/>
```

## 🔌 API Integration

### Binance API (`src/lib/api/binance.ts`)

**Functions:**
- `fetchBinanceKlines(symbol, interval, limit)` - Get candlestick/OHLCV data
- `fetchBinancePrice(symbol)` - Get current price
- `fetchBinance24hStats(symbol)` - Get 24h ticker statistics
- `subscribeBinanceWebSocket(symbol, interval, callback)` - Real-time price updates

**Example:**
```typescript
import { fetchBinanceKlines } from '@/lib/api/binance';

const klines = await fetchBinanceKlines('BTCUSDT', '1h', 500);
// Returns array of {time, open, high, low, close, volume}
```

### Trading Engine API (`src/lib/api/trading-engine.ts`)

**Functions:**
- `fetchBotOrders(botId)` - Get bot orders
- `fetchBotPositions(botId)` - Get bot positions
- `fetchBotDetails(botId)` - Get full bot data
- `startBot(botId)` - Start a bot
- `pauseBot(botId)` - Pause a bot
- `stopBot(botId)` - Stop a bot

**Example:**
```typescript
import { fetchBotOrders } from '@/lib/api/trading-engine';

const orders = await fetchBotOrders('BOT-0002');
```

### Complete Trading Engine API Utility (`src/lib/tradingEngineApi.ts`)

This is a comprehensive API client with **32 endpoints** across 5 categories:

#### 1. Bots API (11 routes)
- Create, list, get, update, delete bots
- Start, pause, stop bot operations
- Get bot positions and orders

#### 2. Trading Controls (6 routes)
- Start/stop/restart signal trader
- Emergency close all positions
- Pause/resume user trading

#### 3. Capital Management (6 routes)
- Configure capital allocation
- Set active/total capital
- Get capital status

#### 4. Positions (4 routes)
- Get open/closed positions
- User-specific position queries

#### 5. Risk Management (5 routes)
- Get risk tiers and limits
- Calculate position sizes
- Update user risk parameters

**Usage:**
```typescript
import { tradingEngineApi } from '@/lib/tradingEngineApi';

// Start a bot
await tradingEngineApi.startBot('BOT-0002');

// Get positions
const { data } = await tradingEngineApi.getBotPositions('BOT-0002');

// Configure capital
await tradingEngineApi.configureCapital({
  user_id: 'user-123',
  total_capital: 10000,
  active_capital: 5000,
  scaling_mode: 'milestone'
});
```

## 🚀 Usage

### Accessing Bot Detail Page

Navigate to `/dashboard/bot/BOT-0001` or `/dashboard/bot/BOT-0002` to see:

1. **Bot Performance Metrics**
   - Total P&L
   - Win Rate
   - Total Trades
   - Open Positions

2. **Chart Toggle**
   - Switch between Timeline and TradingView
   - Real-time market data
   - Bot order markers
   - Grid level visualization

3. **Bot Configuration**
   - Grid settings
   - Price ranges
   - Investment details

4. **Recent Orders Table**
   - Order history with P&L
   - Status and timestamps

### Real-time Updates

The implementation includes WebSocket support for live price updates:

```typescript
import { useRealtimePriceData } from '@/hooks/useRealtimePriceData';

const { latestCandle, isConnected } = useRealtimePriceData({
  symbol: 'BTCUSDT',
  interval: '1h',
  enabled: true
});
```

## 🎨 Chart Customization

### Colors & Theme
- **Buy orders**: `#26a69a` (green)
- **Sell orders**: `#ef5350` (red)
- **Upper price line**: `#4a9eff` (blue, dashed)
- **Lower price line**: `#ff6b6b` (red, dashed)
- **Grid levels**: `rgba(160, 160, 160, 0.2)` (gray, dotted)
- **Background**: `#0a0a0a` (dark)

### Grid Configuration

Charts show:
- **Upper and lower price boundaries** (dashed lines)
- **Grid levels** (every 5th level shown as dotted lines)
- **Buy/sell markers** at actual trade prices
- **Real-time price action** with candlesticks

## 📦 Dependencies

```json
{
  "lightweight-charts": "^4.2.0"
}
```

**Note**: We use v4.2.0 for stable API compatibility. v5.x has breaking API changes.

## ⚙️ Configuration

### Environment Variables

While not required for Binance public API, you may want to add:

```env
# Optional: Trading Engine API URL (already configured in bot-fleet.ts)
NEXT_PUBLIC_TRADING_ENGINE_URL=http://170.168.103.207:4000

# Optional: Alpaca API keys for paper trading execution
ALPACA_API_KEY=your_api_key
ALPACA_SECRET_KEY=your_secret_key
ALPACA_PAPER_URL=https://paper-api.alpaca.markets
```

## 🔧 Error Handling

The implementation includes robust error handling:

1. **API Failures**: Graceful degradation with empty arrays
2. **Invalid Data**: Filters out NaN values before charting
3. **Network Issues**: Console warnings without breaking UI
4. **Missing Data**: Shows loading states and error messages

## 🎯 Next Steps

### Suggested Enhancements:

1. **Real-time Order Updates**
   - WebSocket connection to trading engine
   - Live order execution markers

2. **Chart Annotations**
   - Add drawing tools
   - Support/resistance levels
   - Custom indicators

3. **Performance Metrics**
   - Sharpe ratio calculation
   - Max drawdown visualization
   - Win/loss distribution

4. **Multi-timeframe Analysis**
   - Synchronized charts
   - Higher timeframe indicators

5. **Export Functionality**
   - Chart screenshots
   - CSV export of trades
   - Performance reports

## 📝 Notes

- **Data Source Strategy**: We use Binance market data for BOTH paper and live bots to ensure realistic price action
- **Order Simulation**: Paper trading orders are simulated through the trading engine but use real market prices
- **Chart Performance**: Optimized for up to 500 candlesticks without performance degradation
- **Mobile Responsive**: Charts adapt to different screen sizes

## 🐛 Troubleshooting

### Charts not loading
- Check browser console for API errors
- Verify Binance API is accessible
- Ensure data has valid timestamps

### NaN time values
- The implementation now filters invalid data
- Check `fetchBinanceKlines` returns proper Unix timestamps

### Trading Engine API errors
- API returns 404: Check bot exists in bot-fleet.ts
- Network errors: Verify trading engine is running at configured URL
- CORS issues: May need to configure trading engine CORS settings

## 📚 References

- [TradingView Lightweight Charts Docs](https://tradingview.github.io/lightweight-charts/)
- [Binance API Documentation](https://binance-docs.github.io/apidocs/spot/en/)
- [Alpaca API Documentation](https://alpaca.markets/docs/)

---

**Built with ❤️ for Stella Trading Platform**
