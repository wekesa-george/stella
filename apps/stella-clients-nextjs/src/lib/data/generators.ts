// Data generation utilities for dashboard

export const STRATEGIES = ["Momentum Grid", "Arbitrage V2", "Mean Reversion", "Trend Follow", "Scalp Pro"];
export const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT"];
export const EXCHANGES = ["Binance", "Bybit", "OKX", "Kraken"];
export const USERS = ["alice.k@trader.io", "bob.m@trader.io", "carol.x@hedge.co", "dan.r@fund.io", "eve.s@quant.ai"];

function randBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function randInt(a: number, b: number) {
  return Math.floor(randBetween(a, b));
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length)];
}

export function generateBots(count = 18) {
  return Array.from({ length: count }, (_, i) => {
    // Each bot trades a single pair (assign pair based on bot index)
    const pair = PAIRS[i % PAIRS.length];

    return {
      id: `BOT-${String(i + 1).padStart(4, "0")}`,
      name: `${pick(STRATEGIES)}-${randInt(100, 999)}`,
      user: pick(USERS),
      strategy: pick(STRATEGIES),
      exchange: pick(EXCHANGES),
      pair, // Single pair per bot
      status: pick(["running", "running", "running", "running", "paused", "error"] as const),
      pnl: parseFloat((randBetween(-800, 3200)).toFixed(2)),
      pnlPct: parseFloat((randBetween(-4.5, 12.8)).toFixed(2)),
      equity: parseFloat((randBetween(5000, 85000)).toFixed(2)),
      openPositions: randInt(0, 8),
      trades: randInt(12, 340),
      winRate: parseFloat((randBetween(42, 78)).toFixed(1)),
      lastHeartbeat: randInt(1, 45),
      cpu: parseFloat((randBetween(5, 88)).toFixed(1)),
      ram: parseFloat((randBetween(20, 85)).toFixed(1)),
      uptime: `${randInt(1, 72)}h ${randInt(0, 59)}m`,
    };
  });
}

export function generateEquityCurve(points = 60, base = 10000, volatility = 0.012) {
  let v = base;
  return Array.from({ length: points }, (_, i) => {
    v = v * (1 + (Math.random() - 0.46) * volatility);
    return { t: i, value: parseFloat(v.toFixed(2)) };
  });
}

export function generateInfraMetrics() {
  return {
    phoenix:   { cpu: parseFloat((randBetween(18, 65)).toFixed(1)), ram: parseFloat((randBetween(30, 72)).toFixed(1)), disk: 24.1 },
    postgres:  { cpu: parseFloat((randBetween(10, 55)).toFixed(1)), ram: parseFloat((randBetween(45, 82)).toFixed(1)), disk: 38.7 },
    rabbitmq:  { cpu: parseFloat((randBetween(5, 40)).toFixed(1)),  ram: parseFloat((randBetween(20, 55)).toFixed(1)), disk: 12.2 },
    redis:     { cpu: parseFloat((randBetween(3, 35)).toFixed(1)),  ram: parseFloat((randBetween(25, 60)).toFixed(1)), disk: 8.4 },
    botWorker: { cpu: parseFloat((randBetween(30, 91)).toFixed(1)), ram: parseFloat((randBetween(50, 89)).toFixed(1)), disk: 18.6 },
  };
}

export function generateInfraHistory(points = 40) {
  let cpu = 45, ram = 55;
  return Array.from({ length: points }, (_, i) => {
    cpu = Math.min(100, Math.max(5, cpu + (Math.random() - 0.5) * 8));
    ram = Math.min(100, Math.max(20, ram + (Math.random() - 0.5) * 4));
    return { t: i, cpu: parseFloat(cpu.toFixed(1)), ram: parseFloat(ram.toFixed(1)) };
  });
}

export function generateAlerts() {
  const types = [
    { msg: "Bot BOT-0012 CPU > 85%", sev: "critical" as const, service: "botWorker" },
    { msg: "BOT-0007 heartbeat missed", sev: "critical" as const, service: "BOT-0007" },
    { msg: "Postgres RAM at 79%", sev: "warning" as const, service: "postgres" },
    { msg: "BotWorker RAM at 72%", sev: "warning" as const, service: "botWorker" },
    { msg: "BOT-0003 drawdown > 8%", sev: "warning" as const, service: "BOT-0003" },
    { msg: "RabbitMQ queue depth 4.2k", sev: "info" as const, service: "rabbitmq" },
    { msg: "BOT-0015 win rate drop to 41%", sev: "info" as const, service: "BOT-0015" },
  ];
  return types.map((a, i) => ({ ...a, id: i, time: `${randInt(1, 58)}m ago`, acked: false }));
}

export function generatePositions(botId: string, botPair?: string) {
  // If bot pair is not provided, extract from botId or use default
  const pair = botPair || PAIRS[parseInt(botId.split('-')[1]) % PAIRS.length] || PAIRS[0];

  return Array.from({ length: randInt(1, 6) }, (_, i) => {
    const entry = parseFloat((randBetween(100, 65000)).toFixed(2));
    const current = entry * (1 + (Math.random() - 0.48) * 0.08);
    const size = parseFloat((randBetween(0.01, 2.5)).toFixed(4));
    const pnl = parseFloat(((current - entry) * size).toFixed(2));
    return {
      id: `POS-${i}`,
      pair, // Use bot's single pair
      side: pick(["LONG", "SHORT"]),
      entry: parseFloat(entry.toFixed(2)),
      current: parseFloat(current.toFixed(2)),
      size,
      pnl,
      pnlPct: parseFloat(((current - entry) / entry * 100).toFixed(2)),
      age: `${randInt(1, 240)}m`,
    };
  });
}

const FIRST_NAMES = ["Alice", "Bob", "Carol", "Dan", "Eve", "Frank", "Grace", "Henry", "Iris", "Jack", "Kate", "Liam", "Mary", "Nathan", "Olivia", "Peter", "Quinn", "Rachel", "Sam", "Tina"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Jones", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson"];

export function generateUsers(count = 50) {
  return Array.from({ length: count }, (_, i) => {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const type = pick(["trader", "follower", "both", "both", "trader"] as const);
    const status = pick(["active", "active", "active", "active", "inactive", "suspended"] as const);
    const verificationLevel = pick(["unverified", "basic", "advanced", "full", "full"] as const);

    return {
      id: `USER-${String(i + 1).padStart(4, "0")}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(["gmail.com", "yahoo.com", "outlook.com", "trader.io", "crypto.com"])}`,
      name: `${firstName} ${lastName}`,
      type,
      status,
      verified: verificationLevel !== "unverified",
      joinDate: new Date(Date.now() - randInt(1, 730) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lastActive: `${randInt(1, 48)}h ago`,
      totalTrades: type === "follower" ? 0 : randInt(0, 500),
      followers: type === "trader" || type === "both" ? randInt(0, 1200) : 0,
      following: type === "follower" || type === "both" ? randInt(0, 50) : 0,
      totalPnl: parseFloat((randBetween(-5000, 25000)).toFixed(2)),
      winRate: parseFloat((randBetween(35, 85)).toFixed(1)),
      copyTrading: type !== "follower",
      verificationLevel,
    };
  });
}

export function generateUserTransactions(userId: string, count = 20) {
  return Array.from({ length: count }, (_, i) => {
    const type = pick(["deposit", "withdrawal", "trade", "fee", "trade", "trade"] as const);
    const amount = parseFloat((randBetween(10, 5000)).toFixed(2));
    const status = pick(["completed", "completed", "completed", "pending", "failed"] as const);

    return {
      id: `TXN-${String(i + 1).padStart(6, "0")}`,
      type,
      amount,
      currency: pick(["USDT", "BTC", "ETH", "USDT", "USDT"]),
      status,
      timestamp: new Date(Date.now() - randInt(0, 30) * 24 * 60 * 60 * 1000).toISOString(),
      description: type === "deposit" ? "Deposit via bank transfer" :
                   type === "withdrawal" ? "Withdrawal to wallet" :
                   type === "trade" ? `${pick(["BTC", "ETH", "SOL"])}/USDT trade` :
                   "Platform fee",
    };
  });
}

export function generateUserActivity(userId: string, count = 30) {
  return Array.from({ length: count }, (_, i) => {
    const type = pick(["login", "trade", "withdraw", "deposit", "settings_change", "login", "login"] as const);

    return {
      id: `ACT-${String(i + 1).padStart(6, "0")}`,
      type,
      description: type === "login" ? "User logged in" :
                   type === "trade" ? `Executed ${pick(["BTC", "ETH", "SOL"])}/USDT trade` :
                   type === "withdraw" ? "Withdrawal requested" :
                   type === "deposit" ? "Deposit confirmed" :
                   "Changed account settings",
      timestamp: new Date(Date.now() - randInt(0, 15) * 24 * 60 * 60 * 1000).toISOString(),
      ip: `${randInt(1, 255)}.${randInt(1, 255)}.${randInt(1, 255)}.${randInt(1, 255)}`,
    };
  });
}
