## Page 4: `/dashboard/infra` - Infrastructure Monitoring

### UI Features & Requirements
1. **Infrastructure Health Grid** - Same 5 service cards as Mission Control
2. **Bot Worker Resources Chart** - CPU/RAM graph (1 hour history)
3. **Service Detail Cards** - Phoenix, Postgres, RabbitMQ, Redis with metrics
4. **System Status** - Overall operational status
5. **Exchange Adapter Status** - Connection health per exchange **(ADDED for multi-exchange)**

---

### Data Source Mapping

**This page reuses the same data sources as Mission Control Page 3:**

| Component | Data Source | Endpoint/Channel | Notes |
|-----------|-------------|------------------|-------|
| **Infrastructure Health** | Phoenix API + WS | `GET /api/phoenix/infra/metrics` + Channel `infra:metrics` | Same as Mission Control |
| **Service Details** | Phoenix API | `GET /api/phoenix/infra/services` | Extended metrics per service |
| **Bot Worker Chart** | Phoenix Channel | Channel `infra:metrics` with history | Same real-time updates |
| **System Status** | Aggregated | Derived from service health | All services operational check |

---

### Additional Service Details API

**Endpoint (Phoenix):** `GET /api/phoenix/infra/services/:service`

**Response for Phoenix:**
```json
{
  "service": "phoenix",
  "status": "running",
  "uptime": "14d 8h 23m",
  "requestsPerMin": 1247,
  "avgResponseTime": 12,
  "cpu": 24.5,
  "ram": 45.2,
  "disk": 24.1
}
```

**Response for Postgres:**
```json
{
  "service": "postgres",
  "status": "running",
  "connections": { "current": 124, "max": 200 },
  "queriesPerSec": 342,
  "cacheHitRate": 98.2,
  "cpu": 18.3,
  "ram": 62.4,
  "disk": 38.7
}
```

**Response for RabbitMQ:**
```json
{
  "service": "rabbitmq",
  "status": "running",
  "queueDepth": 4234,
  "messagesPerSec": 167,
  "consumers": 18,
  "cpu": 12.1,
  "ram": 32.5,
  "disk": 12.2
}
```

**Response for Redis:**
```json
{
  "service": "redis",
  "status": "running",
  "keys": 12847,
  "opsPerSec": 8234,
  "hitRate": 99.7,
  "cpu": 8.7,
  "ram": 28.9,
  "disk": 8.4
}
```

---

### Multi-Exchange Adapter Monitoring

**Additional Endpoint (Phoenix):** `GET /api/phoenix/infra/exchanges`

**Response:**
```json
{
  "exchanges": [
    {
      "code": "binance",
      "name": "Binance",
      "status": "active",
      "adapterStatus": "running",
      "marketDataConnected": true,
      "restApiLatency": 45,
      "websocketLatency": 12,
      "lastSuccessfulCall": "2s ago",
      "totalApiCalls24h": 45234,
      "errorRate24h": 0.2,
      "activeBots": 47,
      "activeWebsockets": 3
    },
    {
      "code": "bybit",
      "name": "Bybit",
      "status": "active",
      "adapterStatus": "running",
      "marketDataConnected": true,
      "restApiLatency": 52,
      "websocketLatency": 15,
      "lastSuccessfulCall": "3s ago",
      "totalApiCalls24h": 23456,
      "errorRate24h": 0.1,
      "activeBots": 23,
      "activeWebsockets": 2
    },
    {
      "code": "okx",
      "name": "OKX",
      "status": "active",
      "adapterStatus": "error",
      "marketDataConnected": false,
      "restApiLatency": 850,
      "websocketLatency": null,
      "lastSuccessfulCall": "15s ago",
      "totalApiCalls24h": 12345,
      "errorRate24h": 5.3,
      "activeBots": 12,
      "activeWebsockets": 0
    }
  ]
}
```

**Use Exchange Health Monitor from Mission Control:**

This page can reuse the `Exchange.HealthMonitor` GenServer created for Mission Control (Page 3), but display more detailed metrics:

```elixir
# Add to HealthMonitor
defp get_detailed_metrics(adapter) do
  %{
    code: adapter.code,
    name: adapter.name,
    status: adapter.status,
    adapterStatus: get_adapter_process_status(adapter.code),
    marketDataConnected: check_market_data_connection(adapter.code),
    restApiLatency: get_rest_api_latency(adapter.id),
    websocketLatency: get_websocket_latency(adapter.code),
    lastSuccessfulCall: get_last_successful_call(adapter.id),
    totalApiCalls24h: count_api_calls_24h(adapter.id),
    errorRate24h: calculate_error_rate_24h(adapter.id),
    activeBots: count_active_bots(adapter.id),
    activeWebsockets: count_active_websockets(adapter.code)
  }
end

defp get_adapter_process_status(exchange_code) do
  case Process.whereis(:"MarketData.#{exchange_code}Adapter") do
    nil -> "not_started"
    pid when is_pid(pid) ->
      if Process.alive?(pid), do: "running", else: "crashed"
  end
end

defp check_market_data_connection(exchange_code) do
  case :ets.lookup(:market_data_connections, exchange_code) do
    [{^exchange_code, :connected, _timestamp}] -> true
    _ -> false
  end
end

defp get_rest_api_latency(adapter_id) do
  # Query connection_logs for recent latency
  query = """
  SELECT AVG(latency_ms)::INTEGER
  FROM exchange.connection_logs
  WHERE adapter_id = $1
    AND connection_type = 'rest'
    AND created_at > NOW() - INTERVAL '5 minutes'
  """

  case Repo.query(query, [adapter_id]) do
    {:ok, %{rows: [[latency]]}} when not is_nil(latency) -> latency
    _ -> nil
  end
end

defp count_api_calls_24h(adapter_id) do
  Repo.one(
    from cl in ConnectionLog,
    where: cl.adapter_id == ^adapter_id
      and cl.created_at > ago(24, "hour"),
    select: count(cl.id)
  )
end
```

**UI Display:**

Show each exchange adapter as a card with:
- Exchange logo/icon
- Status badge (running, error, not_started)
- Market Data WebSocket status indicator
- REST API latency gauge
- Error rate trend (last 24h)
- Active bots count
- Active websocket connections count

---

### Summary: Infrastructure Page

| Component | Data Source | Protocol | Frequency | Multi-Exchange Notes |
|-----------|-------------|----------|-----------|-----------------------|
| **Infrastructure Health** | Phoenix API + Channel | HTTP REST + WebSocket | Initial + Every 4s | System-wide (not per-exchange) |
| **Service Details** | Phoenix API | HTTP REST | On page load | System-wide (not per-exchange) |
| **Bot Worker Chart** | Phoenix Channel | WebSocket | Every 4s | Aggregated across all exchanges |
| **System Status** | Derived | Client-side | Real-time | Overall system health |
| **Exchange Adapters** | Phoenix API | HTTP REST | On page load | **NEW: Per-exchange adapter status** |

**Schema Changes Required (Updated for Multi-Exchange):**
1. ✅ Reuses `Exchange.HealthMonitor` GenServer from Mission Control
2. ✅ Reuses `:exchange_health_cache` ETS table
3. ✅ Uses existing `exchange.connection_logs` table for latency metrics
4. ✅ Create ETS table `:market_data_connections` for WS status tracking

**New ETS Table:**
```elixir
:ets.new(:market_data_connections, [
  :named_table,
  :set,
  :public,
  read_concurrency: true
])

# Entry format: {exchange_code, :connected | :disconnected | :reconnecting, timestamp}
# Example: {"binance", :connected, 1708531200}
```

---

---


---

**[← Previous: Mission Control](./03-mission-control.md)** | **[Back to Index](./00-INDEX.md)**
