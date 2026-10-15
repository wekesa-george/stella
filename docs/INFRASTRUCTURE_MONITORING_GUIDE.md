# Infrastructure Monitoring Integration Guide

**Date:** 2026-02-18
**Purpose:** Production-ready infrastructure monitoring with Coolify, Docker, and Prometheus
**Target:** 60% CPU/RAM warning alerts, 85% critical alerts

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Option A: PromEx + Prometheus (Recommended)](#option-a-promex--prometheus-recommended)
3. [Option B: Docker Stats API](#option-b-docker-stats-api)
4. [Option C: System Commands](#option-c-system-commands)
5. [Option D: Coolify API](#option-d-coolify-api)
6. [Alert Configuration](#alert-configuration)
7. [Dashboard Implementation](#dashboard-implementation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Stella Admin Dashboard                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Infrastructure Monitor LiveView                     │   │
│  │  - Real-time metrics display                         │   │
│  │  - Alert notifications                               │   │
│  │  - Threshold configuration                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ▲                                  │
│                           │ PubSub broadcasts                │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Infrastructure.Monitor GenServer                    │   │
│  │  - Collects metrics every 30s                        │   │
│  │  - Checks thresholds                                 │   │
│  │  - Triggers alerts                                   │   │
│  │  - Broadcasts updates                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ▲                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼─────┐     ┌───────▼────────┐   ┌─────▼──────┐
   │PromEx    │     │ Docker Stats   │   │ Coolify    │
   │(BEAM)    │     │ API            │   │ API        │
   └──────────┘     └────────────────┘   └────────────┘
```

---

## Option A: PromEx + Prometheus (Recommended)

**Best for:** Production environments, comprehensive metrics, industry-standard tooling

### Why PromEx?

- ✅ **Built for Elixir/Phoenix** - Native integration
- ✅ **Zero-config metrics** - Phoenix, Ecto, Oban, BEAM VM out-of-the-box
- ✅ **Industry standard** - Prometheus ecosystem
- ✅ **Grafana integration** - Beautiful dashboards
- ✅ **Historical data** - Built-in time-series DB
- ✅ **Alertmanager** - Powerful alert routing

### Installation

#### 1. Add Dependencies

```elixir
# mix.exs
defp deps do
  [
    {:prom_ex, "~> 1.9"},
    {:phoenix_live_dashboard, "~> 0.8"},
    # ... existing deps
  ]
end
```

```bash
mix deps.get
```

#### 2. Create PromEx Module

```elixir
# lib/stella_admin/prom_ex.ex
defmodule StellaAdmin.PromEx do
  use PromEx, otp_app: :stella_admin

  alias PromEx.Plugins

  @impl true
  def plugins do
    [
      # BEAM VM metrics (memory, processes, scheduler)
      Plugins.Beam,

      # Phoenix metrics (requests, response time, errors)
      {Plugins.Phoenix, router: StellaAdminWeb.Router, endpoint: StellaAdminWeb.Endpoint},

      # Phoenix LiveView metrics
      Plugins.PhoenixLiveView,

      # Ecto metrics (queries, connections, queue time)
      {Plugins.Ecto, otp_app: :stella_admin, repos: [StellaAdmin.Repo]},

      # Oban metrics (jobs, queues, errors) - if using Oban
      {Plugins.Oban, otp_app: :stella_admin},

      # Application metrics (custom business metrics)
      StellaAdmin.PromEx.ApplicationMetrics
    ]
  end

  @impl true
  def dashboard_assigns do
    [
      datasource_id: "prometheus",
      default_selected_interval: "30s"
    ]
  end

  @impl true
  def dashboards do
    [
      {:prom_ex, "application.json"},
      {:prom_ex, "beam.json"},
      {:prom_ex, "phoenix.json"},
      {:prom_ex, "ecto.json"},
      {:prom_ex, "oban.json"}
    ]
  end
end
```

#### 3. Create Custom Application Metrics

```elixir
# lib/stella_admin/prom_ex/application_metrics.ex
defmodule StellaAdmin.PromEx.ApplicationMetrics do
  use PromEx.Plugin

  @impl true
  def event_metrics(_opts) do
    [
      # Bot metrics
      counter(
        [:stella, :bots, :started, :total],
        event_name: [:stella, :bot, :started],
        description: "Total number of bots started",
        tags: [:strategy_type]
      ),

      gauge(
        [:stella, :bots, :active, :count],
        event_name: [:stella, :bots, :active],
        description: "Number of currently active bots",
        measurement: :count
      ),

      # Trading metrics
      counter(
        [:stella, :trades, :executed, :total],
        event_name: [:stella, :trade, :executed],
        description: "Total trades executed",
        tags: [:side, :exchange]
      ),

      distribution(
        [:stella, :trades, :pnl, :usd],
        event_name: [:stella, :trade, :closed],
        description: "Distribution of trade P&L",
        measurement: :pnl_usd,
        unit: {:native, :dollar}
      ),

      # Infrastructure metrics (custom)
      gauge(
        [:stella, :infrastructure, :cpu, :percent],
        event_name: [:stella, :infrastructure, :metric],
        description: "CPU usage percentage",
        tags: [:service],
        measurement: fn measurements -> measurements[:cpu_percent] end
      ),

      gauge(
        [:stella, :infrastructure, :memory, :percent],
        event_name: [:stella, :infrastructure, :metric],
        description: "Memory usage percentage",
        tags: [:service],
        measurement: fn measurements -> measurements[:memory_percent] end
      )
    ]
  end

  @impl true
  def polling_metrics(_opts) do
    [
      # Poll active bots count every 30 seconds
      {__MODULE__, :poll_active_bots, []},

      # Poll infrastructure metrics every 30 seconds
      {__MODULE__, :poll_infrastructure_metrics, []}
    ]
  end

  def poll_active_bots do
    count = StellaAdmin.Trading.count_active_bots()

    :telemetry.execute(
      [:stella, :bots, :active],
      %{count: count},
      %{}
    )
  end

  def poll_infrastructure_metrics do
    # Get system metrics
    metrics = StellaAdmin.Infrastructure.collect_system_metrics()

    Enum.each(metrics, fn %{service: service, cpu_percent: cpu, memory_percent: mem} ->
      :telemetry.execute(
        [:stella, :infrastructure, :metric],
        %{cpu_percent: cpu, memory_percent: mem},
        %{service: service}
      )
    end)
  end
end
```

#### 4. Add to Supervision Tree

```elixir
# lib/stella_admin/application.ex
def start(_type, _args) do
  children = [
    # ... existing children

    # PromEx metrics collector
    StellaAdmin.PromEx,

    # ... rest of children
  ]

  opts = [strategy: :one_for_one, name: StellaAdmin.Supervisor]
  Supervisor.start_link(children, opts)
end
```

#### 5. Configure Endpoint

```elixir
# lib/stella_admin_web/endpoint.ex
defmodule StellaAdminWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :stella_admin

  # Add Prometheus metrics endpoint
  plug PromEx.Plug, prom_ex_module: StellaAdmin.PromEx

  # ... rest of config
end
```

#### 6. Access Metrics

**Metrics Endpoint:** `http://localhost:4000/metrics`

```bash
# Test metrics endpoint
curl http://localhost:4000/metrics
```

### Prometheus Setup (Docker)

#### 1. Create Prometheus Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'stella_admin'
    static_configs:
      - targets: ['host.docker.internal:4000']
    metrics_path: '/metrics'

rule_files:
  - 'alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

#### 2. Create Alert Rules

```yaml
# alerts.yml
groups:
  - name: infrastructure
    interval: 30s
    rules:
      # CPU alerts
      - alert: HighCPUUsage
        expr: stella_infrastructure_cpu_percent > 60
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.service }}"
          description: "CPU usage is {{ $value }}%"

      - alert: CriticalCPUUsage
        expr: stella_infrastructure_cpu_percent > 85
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "CRITICAL CPU usage on {{ $labels.service }}"
          description: "CPU usage is {{ $value }}%"

      # Memory alerts
      - alert: HighMemoryUsage
        expr: stella_infrastructure_memory_percent > 60
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.service }}"
          description: "Memory usage is {{ $value }}%"

      - alert: CriticalMemoryUsage
        expr: stella_infrastructure_memory_percent > 85
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "CRITICAL memory usage on {{ $labels.service }}"
          description: "Memory usage is {{ $value }}%"

  - name: trading
    interval: 30s
    rules:
      - alert: BotOffline
        expr: stella_bots_active_count == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "No active bots running"
          description: "All bots appear to be offline"
```

#### 3. Docker Compose Setup

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: stella_prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    container_name: stella_alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: stella_grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

#### 4. Alertmanager Configuration

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'ops-team'
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'ops-team'
    email_configs:
      - to: 'ops@stella.trade'
        from: 'alerts@stella.trade'
        smarthost: 'smtp.sendgrid.net:587'
        auth_username: 'apikey'
        auth_password: 'YOUR_SENDGRID_API_KEY'

  - name: 'slack'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#stella-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        description: '{{ .GroupLabels.alertname }}'
```

### Query Metrics from Elixir

```elixir
# lib/stella_admin/infrastructure.ex
defmodule StellaAdmin.Infrastructure do
  @prometheus_url "http://localhost:9090"

  def query_metric(query) do
    url = "#{@prometheus_url}/api/v1/query?query=#{URI.encode(query)}"

    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        Jason.decode!(body)

      {:error, reason} ->
        {:error, reason}
    end
  end

  def get_cpu_usage(service) do
    query = "stella_infrastructure_cpu_percent{service=\"#{service}\"}"

    case query_metric(query) do
      %{"data" => %{"result" => [%{"value" => [_timestamp, value]} | _]}} ->
        String.to_float(value)

      _ ->
        nil
    end
  end

  def get_memory_usage(service) do
    query = "stella_infrastructure_memory_percent{service=\"#{service}\"}"

    case query_metric(query) do
      %{"data" => %{"result" => [%{"value" => [_timestamp, value]} | _]}} ->
        String.to_float(value)

      _ ->
        nil
    end
  end
end
```

---

## Option B: Docker Stats API

**Best for:** Coolify deployments where containers are accessible

### Implementation

```elixir
# lib/stella_admin/infrastructure/docker_collector.ex
defmodule StellaAdmin.Infrastructure.DockerCollector do
  @doc """
  Collect metrics from Docker containers
  """
  def collect_metrics do
    case System.cmd("docker", ["stats", "--no-stream", "--format", "json"]) do
      {output, 0} ->
        output
        |> String.split("\n", trim: true)
        |> Enum.map(&Jason.decode!/1)
        |> Enum.map(&parse_container_stats/1)

      {error, _code} ->
        {:error, error}
    end
  end

  defp parse_container_stats(stats) do
    %{
      service: extract_service_name(stats["Name"]),
      cpu_percent: parse_percentage(stats["CPUPerc"]),
      memory_percent: parse_percentage(stats["MemPerc"]),
      memory_usage: stats["MemUsage"],
      network_io: stats["NetIO"],
      block_io: stats["BlockIO"],
      pids: stats["PIDs"]
    }
  end

  defp extract_service_name(container_name) do
    # Parse service name from container name
    # e.g., "stella_admin_phoenix_1" -> "phoenix"
    container_name
    |> String.split("_")
    |> Enum.at(-2)
  end

  defp parse_percentage(percent_str) do
    percent_str
    |> String.replace("%", "")
    |> String.to_float()
  end
end
```

### GenServer for Continuous Collection

```elixir
# lib/stella_admin/infrastructure/monitor.ex
defmodule StellaAdmin.Infrastructure.Monitor do
  use GenServer
  require Logger

  alias StellaAdmin.Infrastructure.DockerCollector
  alias StellaAdmin.Infrastructure

  @collection_interval :timer.seconds(30)

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(state) do
    schedule_collection()
    {:ok, state}
  end

  def handle_info(:collect, state) do
    case DockerCollector.collect_metrics() do
      {:ok, metrics} ->
        Enum.each(metrics, &process_metric/1)

      {:error, reason} ->
        Logger.error("Failed to collect metrics: #{inspect(reason)}")
    end

    schedule_collection()
    {:noreply, state}
  end

  defp process_metric(metric) do
    # Store in database
    Infrastructure.store_metric(metric)

    # Check thresholds
    case Infrastructure.check_thresholds(metric) do
      {:alert, alert} ->
        Infrastructure.trigger_alert(alert)
        broadcast_alert(alert)

      :ok ->
        :ok
    end

    # Broadcast update to LiveView
    broadcast_metric(metric)
  end

  defp broadcast_metric(metric) do
    Phoenix.PubSub.broadcast(
      StellaAdmin.PubSub,
      "infrastructure_updates",
      {:metric_update, metric}
    )
  end

  defp broadcast_alert(alert) do
    Phoenix.PubSub.broadcast(
      StellaAdmin.PubSub,
      "infrastructure_alerts",
      {:new_alert, alert}
    )
  end

  defp schedule_collection do
    Process.send_after(self(), :collect, @collection_interval)
  end
end
```

---

## Option C: System Commands

**Best for:** Simple deployments without Docker or Prometheus

### Implementation

```elixir
# lib/stella_admin/infrastructure/system_collector.ex
defmodule StellaAdmin.Infrastructure.SystemCollector do
  @doc """
  Collect system metrics using OS commands
  """
  def collect_metrics do
    %{
      cpu: get_cpu_usage(),
      memory: get_memory_usage(),
      disk: get_disk_usage(),
      beam: get_beam_metrics()
    }
  end

  defp get_cpu_usage do
    # macOS/Linux
    case System.cmd("ps", ["-A", "-o", "pcpu"]) do
      {output, 0} ->
        output
        |> String.split("\n", trim: true)
        |> Enum.drop(1)  # Remove header
        |> Enum.map(&String.trim/1)
        |> Enum.map(&String.to_float/1)
        |> Enum.sum()

      _ ->
        0.0
    end
  end

  defp get_memory_usage do
    case :os.type() do
      {:unix, :darwin} -> get_memory_usage_macos()
      {:unix, :linux} -> get_memory_usage_linux()
      _ -> %{}
    end
  end

  defp get_memory_usage_linux do
    case System.cmd("free", ["-m"]) do
      {output, 0} ->
        [_header, mem_line | _] = String.split(output, "\n")
        [_label, total, used | _] = String.split(mem_line, ~r/\s+/)

        %{
          total_mb: String.to_integer(total),
          used_mb: String.to_integer(used),
          percent: (String.to_integer(used) / String.to_integer(total) * 100) |> Float.round(2)
        }

      _ ->
        %{}
    end
  end

  defp get_memory_usage_macos do
    # macOS uses vm_stat
    case System.cmd("vm_stat") do
      {output, 0} ->
        parse_vm_stat(output)

      _ ->
        %{}
    end
  end

  defp get_disk_usage do
    case System.cmd("df", ["-h", "/"]) do
      {output, 0} ->
        [_header, root_line] = String.split(output, "\n", trim: true)
        [_fs, size, used, _avail, percent | _] = String.split(root_line, ~r/\s+/)

        %{
          size: size,
          used: used,
          percent: String.replace(percent, "%", "") |> String.to_integer()
        }

      _ ->
        %{}
    end
  end

  defp get_beam_metrics do
    %{
      process_count: :erlang.system_info(:process_count),
      memory_total: :erlang.memory(:total),
      memory_processes: :erlang.memory(:processes),
      memory_ets: :erlang.memory(:ets),
      run_queue: :erlang.statistics(:run_queue)
    }
  end
end
```

---

## Option D: Coolify API

**Best for:** If Coolify exposes metrics API

### Check Coolify Documentation

```bash
# Check if Coolify has API documentation
curl https://coolify.io/docs/api

# Or check your Coolify instance
curl http://your-coolify-instance.com/api/v1/docs
```

### Example Implementation (hypothetical)

```elixir
# lib/stella_admin/infrastructure/coolify_client.ex
defmodule StellaAdmin.Infrastructure.CoolifyClient do
  @coolify_url System.get_env("COOLIFY_URL") || "http://coolify.praetocloud.com"
  @api_token System.get_env("COOLIFY_API_TOKEN")

  def get_service_metrics(service_id) do
    url = "#{@coolify_url}/api/v1/services/#{service_id}/metrics"

    headers = [
      {"Authorization", "Bearer #{@api_token}"},
      {"Content-Type", "application/json"}
    ]

    case HTTPoison.get(url, headers) do
      {:ok, %{status_code: 200, body: body}} ->
        Jason.decode!(body)

      {:error, reason} ->
        {:error, reason}
    end
  end
end
```

---

## Alert Configuration

### Database Schema

```sql
-- Add to stella-database.sql
CREATE TABLE IF NOT EXISTS infrastructure.alert_thresholds (
    threshold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('cpu_percent', 'memory_percent', 'disk_percent')),
    warning_threshold NUMERIC(5,2) NOT NULL DEFAULT 60.0,
    critical_threshold NUMERIC(5,2) NOT NULL DEFAULT 85.0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    notification_channels TEXT[] NOT NULL DEFAULT '{in_app}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_thresholds_service ON infrastructure.alert_thresholds(service_name, metric_type);
```

### Context Implementation

```elixir
# lib/stella_admin/infrastructure.ex
defmodule StellaAdmin.Infrastructure do
  alias StellaAdmin.Repo
  alias StellaAdmin.Infrastructure.{Metric, AlertThreshold, Alert}

  def check_thresholds(metric) do
    threshold = get_threshold(metric.service, metric.metric_type)

    cond do
      metric.value >= threshold.critical_threshold ->
        {:alert, create_alert(metric, threshold, :critical)}

      metric.value >= threshold.warning_threshold ->
        {:alert, create_alert(metric, threshold, :warning)}

      true ->
        :ok
    end
  end

  defp create_alert(metric, threshold, severity) do
    %Alert{
      service_name: metric.service,
      metric_type: metric.metric_type,
      current_value: metric.value,
      threshold_value: if(severity == :critical, do: threshold.critical_threshold, else: threshold.warning_threshold),
      severity: severity,
      notification_channels: threshold.notification_channels
    }
    |> Repo.insert!()
  end

  def trigger_alert(alert) do
    Enum.each(alert.notification_channels, fn channel ->
      case channel do
        "in_app" -> notify_in_app(alert)
        "slack" -> notify_slack(alert)
        "email" -> notify_email(alert)
        "pagerduty" -> notify_pagerduty(alert)
        _ -> :ok
      end
    end)
  end

  defp notify_in_app(alert) do
    Phoenix.PubSub.broadcast(
      StellaAdmin.PubSub,
      "platform_alerts",
      {:new_alert, alert}
    )
  end

  defp notify_slack(alert) do
    # Use HTTPoison to post to Slack webhook
    webhook_url = System.get_env("SLACK_WEBHOOK_URL")

    payload = %{
      text: format_alert_message(alert),
      blocks: [
        %{
          type: "section",
          text: %{
            type: "mrkdwn",
            text: """
            🚨 *#{String.upcase(to_string(alert.severity))}* Infrastructure Alert

            *Service:* #{alert.service_name}
            *Metric:* #{alert.metric_type}
            *Current Value:* #{alert.current_value}%
            *Threshold:* #{alert.threshold_value}%
            """
          }
        }
      ]
    }

    HTTPoison.post(webhook_url, Jason.encode!(payload), [{"Content-Type", "application/json"}])
  end
end
```

---

## Dashboard Implementation

### LiveView

```elixir
# lib/stella_admin_web/live/infrastructure/monitor_live.ex
defmodule StellaAdminWeb.Infrastructure.MonitorLive do
  use StellaAdminWeb, :live_view

  alias StellaAdmin.Infrastructure

  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(StellaAdmin.PubSub, "infrastructure_updates")
      Phoenix.PubSub.subscribe(StellaAdmin.PubSub, "infrastructure_alerts")
    end

    {:ok, assign(socket,
      services: Infrastructure.get_current_metrics(),
      alerts: Infrastructure.list_recent_alerts(),
      thresholds: Infrastructure.list_alert_thresholds()
    )}
  end

  def handle_info({:metric_update, metric}, socket) do
    services = update_service_metric(socket.assigns.services, metric)
    {:noreply, assign(socket, services: services)}
  end

  def handle_info({:new_alert, alert}, socket) do
    {:noreply,
      socket
      |> update(:alerts, fn alerts -> [alert | alerts] end)
      |> put_flash(:error, format_alert_flash(alert))}
  end
end
```

### Template

```heex
<!-- lib/stella_admin_web/live/infrastructure/monitor_live.html.heex -->
<div class="infrastructure-monitor">
  <h1>Infrastructure Monitoring</h1>

  <div class="services-grid grid grid-cols-3 gap-4">
    <%= for service <- @services do %>
      <div class="service-card" data-status={service_status(service)}>
        <h3><%= service.name %></h3>

        <div class="metric">
          <span>CPU:</span>
          <span class={cpu_class(service.cpu_percent)}>
            <%= format_percent(service.cpu_percent) %>
          </span>
        </div>

        <div class="metric">
          <span>Memory:</span>
          <span class={memory_class(service.memory_percent)}>
            <%= format_percent(service.memory_percent) %>
          </span>
        </div>

        <div class="chart" id={"chart-#{service.name}"} phx-hook="MetricChart" data-service={service.name}></div>
      </div>
    <% end %>
  </div>

  <div class="alerts-section">
    <h2>Recent Alerts</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Severity</th>
          <th>Service</th>
          <th>Metric</th>
          <th>Value</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <%= for alert <- @alerts do %>
          <tr>
            <td><%= format_timestamp(alert.inserted_at) %></td>
            <td><span class={"badge-#{alert.severity}"}><%= alert.severity %></span></td>
            <td><%= alert.service_name %></td>
            <td><%= alert.metric_type %></td>
            <td><%= alert.current_value %>%</td>
            <td>
              <button phx-click="acknowledge_alert" phx-value-id={alert.id}>Acknowledge</button>
            </td>
          </tr>
        <% end %>
      </tbody>
    </table>
  </div>
</div>
```

---

## Next Steps

1. **Choose monitoring approach** (PromEx recommended for production)
2. **Set up monitoring infrastructure** (Prometheus + Grafana)
3. **Implement GenServer collector**
4. **Configure alert thresholds**
5. **Test alert notifications** (Slack, email)
6. **Build LiveView dashboard**
7. **Deploy to staging** and monitor

---

**Estimated Implementation Time:** 3-4 days
**Recommended Approach:** PromEx + Prometheus (Option A)
