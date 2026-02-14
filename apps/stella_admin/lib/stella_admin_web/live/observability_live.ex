defmodule StellaAdminWeb.ObservabilityLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      # Update system metrics every 5 seconds
      Process.send_after(self(), :update_metrics, 5000)
    end

    {:ok,
     socket
     |> assign(:page_title, "Observability")
     |> assign(:current_page, :observability)
     |> assign(:system_health, system_health_metrics())
     |> assign(:services_status, services_status())
     |> assign(:recent_logs, recent_logs())
     |> assign(:performance_metrics, performance_metrics())
     |> assign(:error_rates, error_rates())
     |> assign(:cpu_chart, cpu_usage_chart())
     |> assign(:memory_chart, memory_usage_chart())
     |> assign(:response_time_chart, response_time_chart())
     |> assign(:database_metrics, database_metrics())
     |> assign(:api_endpoints, api_endpoints())}
  end

  @impl true
  def handle_info(:update_metrics, socket) do
    # Schedule next update
    Process.send_after(self(), :update_metrics, 5000)

    {:noreply,
     socket
     |> assign(:system_health, system_health_metrics())
     |> assign(:performance_metrics, performance_metrics())}
  end

  defp system_health_metrics do
    %{
      cpu: :rand.uniform(100),
      memory: :rand.uniform(100),
      disk: :rand.uniform(100),
      network_in: "#{:rand.uniform(1000)} MB/s",
      network_out: "#{:rand.uniform(500)} MB/s",
      uptime: "45d 12h 34m"
    }
  end

  defp services_status do
    [
      %{name: "Phoenix Server", status: "healthy", response_time: "12ms", uptime: "99.99%"},
      %{name: "PostgreSQL", status: "healthy", response_time: "3ms", uptime: "99.98%"},
      %{name: "Redis Cache", status: "healthy", response_time: "1ms", uptime: "100%"},
      %{name: "WebSocket Server", status: "healthy", response_time: "8ms", uptime: "99.95%"},
      %{name: "Background Jobs", status: "warning", response_time: "45ms", uptime: "98.5%"},
      %{name: "External API", status: "healthy", response_time: "125ms", uptime: "99.2%"},
      %{name: "Elasticsearch", status: "healthy", response_time: "15ms", uptime: "99.95%"},
      %{name: "Message Queue", status: "healthy", response_time: "5ms", uptime: "99.99%"},
      %{name: "CDN", status: "healthy", response_time: "35ms", uptime: "99.99%"},
      %{name: "Email Service", status: "healthy", response_time: "200ms", uptime: "99.5%"},
      %{name: "SMS Gateway", status: "healthy", response_time: "150ms", uptime: "99.8%"},
      %{name: "Payment Gateway", status: "healthy", response_time: "95ms", uptime: "99.95%"}
    ]
  end

  defp recent_logs do
    [
      %{level: "info", message: "User authentication successful", timestamp: "2 minutes ago", service: "Auth"},
      %{level: "error", message: "Failed to connect to external API", timestamp: "5 minutes ago", service: "Integration"},
      %{level: "warn", message: "High memory usage detected", timestamp: "8 minutes ago", service: "System"},
      %{level: "info", message: "Trade executed successfully", timestamp: "10 minutes ago", service: "Trading"},
      %{level: "info", message: "Cache cleared for user sessions", timestamp: "15 minutes ago", service: "Cache"}
    ]
  end

  defp performance_metrics do
    %{
      requests_per_min: :rand.uniform(5000),
      avg_response_time: "#{:rand.uniform(50)}ms",
      error_rate: "#{:rand.uniform(100) / 100}%",
      active_connections: :rand.uniform(500),
      queue_size: :rand.uniform(100),
      cache_hit_rate: "#{85 + :rand.uniform(15)}%"
    }
  end

  defp error_rates do
    [
      %{code: "500", count: 12, percentage: "0.02%"},
      %{code: "404", count: 145, percentage: "0.24%"},
      %{code: "422", count: 34, percentage: "0.06%"},
      %{code: "503", count: 2, percentage: "0.003%"}
    ]
  end

  defp cpu_usage_chart do
    %{
      series: [
        %{
          name: "CPU Usage",
          data: Enum.map(1..20, fn _ -> :rand.uniform(100) end)
        }
      ],
      options: %{
        chart: %{type: "area", height: 300, toolbar: %{show: false}},
        dataLabels: %{enabled: false},
        stroke: %{curve: "smooth", width: 2},
        colors: ["#a3e635"],
        fill: %{
          type: "gradient",
          gradient: %{
            shadeIntensity: 1,
            opacityFrom: 0.7,
            opacityTo: 0.3
          }
        },
        xaxis: %{
          categories: Enum.map(1..20, fn i -> "#{i}m" end),
          labels: %{style: %{colors: "#9ca3af"}}
        },
        yaxis: %{
          labels: %{
            style: %{colors: "#9ca3af"},
            formatter: "function(value) { return value + '%' }"
          },
          max: 100
        },
        grid: %{borderColor: "#374151"}
      }
    }
    |> Jason.encode!()
  end

  defp memory_usage_chart do
    %{
      series: [
        %{
          name: "Memory Usage",
          data: Enum.map(1..20, fn _ -> :rand.uniform(100) end)
        }
      ],
      options: %{
        chart: %{type: "area", height: 300, toolbar: %{show: false}},
        dataLabels: %{enabled: false},
        stroke: %{curve: "smooth", width: 2},
        colors: ["#3b82f6"],
        fill: %{
          type: "gradient",
          gradient: %{
            shadeIntensity: 1,
            opacityFrom: 0.7,
            opacityTo: 0.3
          }
        },
        xaxis: %{
          categories: Enum.map(1..20, fn i -> "#{i}m" end),
          labels: %{style: %{colors: "#9ca3af"}}
        },
        yaxis: %{
          labels: %{
            style: %{colors: "#9ca3af"},
            formatter: "function(value) { return value + '%' }"
          },
          max: 100
        },
        grid: %{borderColor: "#374151"}
      }
    }
    |> Jason.encode!()
  end

  defp response_time_chart do
    %{
      series: [
        %{
          name: "Avg Response Time",
          data: Enum.map(1..20, fn _ -> :rand.uniform(100) end)
        },
        %{
          name: "95th Percentile",
          data: Enum.map(1..20, fn _ -> 50 + :rand.uniform(100) end)
        }
      ],
      options: %{
        chart: %{type: "line", height: 300, toolbar: %{show: false}},
        dataLabels: %{enabled: false},
        stroke: %{curve: "smooth", width: 2},
        colors: ["#a3e635", "#fb923c"],
        xaxis: %{
          categories: Enum.map(1..20, fn i -> "#{i}m" end),
          labels: %{style: %{colors: "#9ca3af"}}
        },
        yaxis: %{
          labels: %{
            style: %{colors: "#9ca3af"},
            formatter: "function(value) { return value + 'ms' }"
          }
        },
        grid: %{borderColor: "#374151"},
        legend: %{
          labels: %{colors: "#9ca3af"}
        }
      }
    }
    |> Jason.encode!()
  end

  defp database_metrics do
    %{
      connection_pool: %{
        total: 20,
        active: :rand.uniform(15),
        idle: 5 + :rand.uniform(10),
        waiting: :rand.uniform(3)
      },
      query_performance: %{
        avg_query_time: "#{:rand.uniform(20)}ms",
        slow_queries: :rand.uniform(5),
        total_queries: 12000 + :rand.uniform(5000),
        queries_per_sec: 50 + :rand.uniform(150)
      },
      storage: %{
        database_size: "2.4 GB",
        table_count: 45,
        index_count: 128,
        largest_table: "transactions (450 MB)"
      },
      replication: %{
        status: "healthy",
        lag: "#{:rand.uniform(100)}ms",
        replicas: 2,
        synced: true
      }
    }
  end

  defp api_endpoints do
    [
      %{
        endpoint: "/api/v1/users",
        method: "GET",
        status: "healthy",
        avg_response: "#{15 + :rand.uniform(20)}ms",
        requests_min: 200 + :rand.uniform(100),
        error_rate: "0.#{:rand.uniform(9)}%"
      },
      %{
        endpoint: "/api/v1/trades",
        method: "POST",
        status: "healthy",
        avg_response: "#{25 + :rand.uniform(30)}ms",
        requests_min: 150 + :rand.uniform(100),
        error_rate: "0.#{:rand.uniform(9)}%"
      },
      %{
        endpoint: "/api/v1/auth/login",
        method: "POST",
        status: "healthy",
        avg_response: "#{30 + :rand.uniform(40)}ms",
        requests_min: 80 + :rand.uniform(50),
        error_rate: "1.#{:rand.uniform(9)}%"
      },
      %{
        endpoint: "/api/v1/portfolio",
        method: "GET",
        status: "warning",
        avg_response: "#{80 + :rand.uniform(50)}ms",
        requests_min: 300 + :rand.uniform(200),
        error_rate: "2.#{:rand.uniform(9)}%"
      },
      %{
        endpoint: "/api/v1/market/prices",
        method: "GET",
        status: "healthy",
        avg_response: "#{10 + :rand.uniform(15)}ms",
        requests_min: 500 + :rand.uniform(300),
        error_rate: "0.#{:rand.uniform(5)}%"
      },
      %{
        endpoint: "/api/v1/notifications",
        method: "POST",
        status: "healthy",
        avg_response: "#{20 + :rand.uniform(25)}ms",
        requests_min: 100 + :rand.uniform(80),
        error_rate: "0.#{:rand.uniform(7)}%"
      }
    ]
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">System Observability</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Monitor system health, performance, and service status
          </p>
        </div>
        <div class="flex items-center space-x-2">
          <div class="flex items-center space-x-2 px-3 py-2 bg-success/10 rounded border border-success/30">
            <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <span class="text-xs text-success font-medium">All Systems Operational</span>
          </div>
        </div>
      </div>

      <%!-- System Health Metrics --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">CPU Usage</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.cpu %>%</p>
          <div class="w-full bg-base-300 rounded-full h-1.5">
            <div
              class={[
                "h-1.5 rounded-full",
                @system_health.cpu > 80 && "bg-error",
                @system_health.cpu > 60 && @system_health.cpu <= 80 && "bg-warning",
                @system_health.cpu <= 60 && "bg-success"
              ]}
              style={"width: #{@system_health.cpu}%"}
            >
            </div>
          </div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Memory Usage</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.memory %>%</p>
          <div class="w-full bg-base-300 rounded-full h-1.5">
            <div
              class={[
                "h-1.5 rounded-full",
                @system_health.memory > 80 && "bg-error",
                @system_health.memory > 60 && @system_health.memory <= 80 && "bg-warning",
                @system_health.memory <= 60 && "bg-success"
              ]}
              style={"width: #{@system_health.memory}%"}
            >
            </div>
          </div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Disk Usage</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.disk %>%</p>
          <div class="w-full bg-base-300 rounded-full h-1.5">
            <div class="bg-success h-1.5 rounded-full" style={"width: #{@system_health.disk}%"}>
            </div>
          </div>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Network In</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.network_in %></p>
          <p class="text-xs text-base-content/50">Incoming traffic</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Network Out</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.network_out %></p>
          <p class="text-xs text-base-content/50">Outgoing traffic</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">System Uptime</p>
          <p class="text-2xl font-bold text-base-content mb-1"><%= @system_health.uptime %></p>
          <p class="text-xs text-success">99.99% availability</p>
        </div>
      </div>

      <%!-- Performance Metrics --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Requests/Min</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.requests_per_min %>
          </p>
          <p class="text-xs text-success">+5.2% vs avg</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Avg Response</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.avg_response_time %>
          </p>
          <p class="text-xs text-success">-2.1% vs avg</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Error Rate</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.error_rate %>
          </p>
          <p class="text-xs text-success">Below threshold</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Active Conn.</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.active_connections %>
          </p>
          <p class="text-xs text-base-content/50">WebSocket + HTTP</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Queue Size</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.queue_size %>
          </p>
          <p class="text-xs text-base-content/50">Background jobs</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Cache Hit Rate</p>
          <p class="text-2xl font-bold text-base-content mb-1">
            <%= @performance_metrics.cache_hit_rate %>
          </p>
          <p class="text-xs text-success">Optimal range</p>
        </div>
      </div>

      <%!-- Services Status & Recent Logs --%>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <%!-- Services Status --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Services Status</h2>
          </div>
          <div class="p-4">
            <div class="space-y-3">
              <%= for service <- @services_status do %>
                <div class="flex items-center justify-between p-3 bg-base-300/30 rounded border border-base-300/50">
                  <div class="flex items-center space-x-3">
                    <div class={[
                      "w-2 h-2 rounded-full",
                      service.status == "healthy" && "bg-success",
                      service.status == "warning" && "bg-warning",
                      service.status == "error" && "bg-error"
                    ]}>
                    </div>
                    <div>
                      <p class="text-sm font-medium text-base-content"><%= service.name %></p>
                      <p class="text-xs text-base-content/60">
                        <%= service.response_time %> · <%= service.uptime %> uptime
                      </p>
                    </div>
                  </div>
                  <span class={[
                    "px-2 py-1 rounded text-xs font-medium",
                    service.status == "healthy" && "bg-success/10 text-success",
                    service.status == "warning" && "bg-warning/10 text-warning",
                    service.status == "error" && "bg-error/10 text-error"
                  ]}>
                    <%= String.capitalize(service.status) %>
                  </span>
                </div>
              <% end %>
            </div>
          </div>
        </div>

        <%!-- Recent Logs --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Recent Logs</h2>
          </div>
          <div class="p-4">
            <div class="space-y-3">
              <%= for log <- @recent_logs do %>
                <div class="flex items-start space-x-3 p-3 bg-base-300/30 rounded border border-base-300/50">
                  <div class={[
                    "px-2 py-0.5 rounded text-xs font-medium uppercase mt-0.5",
                    log.level == "error" && "bg-error/10 text-error",
                    log.level == "warn" && "bg-warning/10 text-warning",
                    log.level == "info" && "bg-info/10 text-info"
                  ]}>
                    <%= log.level %>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-base-content"><%= log.message %></p>
                    <div class="flex items-center space-x-2 mt-1">
                      <span class="text-xs text-base-content/60"><%= log.service %></span>
                      <span class="text-xs text-base-content/40">·</span>
                      <span class="text-xs text-base-content/60"><%= log.timestamp %></span>
                    </div>
                  </div>
                </div>
              <% end %>
            </div>
          </div>
        </div>
      </div>

      <%!-- System Charts --%>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <%!-- CPU Usage Chart --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">CPU Usage (Last 20 min)</h2>
          </div>
          <div class="p-4">
            <div
              id="cpu-chart"
              phx-hook="ApexChart"
              data-chart={@cpu_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>

        <%!-- Memory Usage Chart --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Memory Usage (Last 20 min)</h2>
          </div>
          <div class="p-4">
            <div
              id="memory-chart"
              phx-hook="ApexChart"
              data-chart={@memory_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>

        <%!-- Response Time Chart --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Response Time (Last 20 min)</h2>
          </div>
          <div class="p-4">
            <div
              id="response-time-chart"
              phx-hook="ApexChart"
              data-chart={@response_time_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>
      </div>

      <%!-- Database Metrics --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">Database Metrics</h2>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <%!-- Connection Pool --%>
            <div class="bg-base-300/30 rounded p-4 border border-base-300/50">
              <p class="text-xs text-base-content/60 mb-2">Connection Pool</p>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Active:</span>
                  <span class="font-medium text-success">
                    <%= @database_metrics.connection_pool.active %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Idle:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.connection_pool.idle %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Waiting:</span>
                  <span class={[
                    "font-medium",
                    @database_metrics.connection_pool.waiting > 0 && "text-warning",
                    @database_metrics.connection_pool.waiting == 0 && "text-base-content"
                  ]}>
                    <%= @database_metrics.connection_pool.waiting %>
                  </span>
                </div>
              </div>
            </div>

            <%!-- Query Performance --%>
            <div class="bg-base-300/30 rounded p-4 border border-base-300/50">
              <p class="text-xs text-base-content/60 mb-2">Query Performance</p>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Avg Time:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.query_performance.avg_query_time %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Slow Queries:</span>
                  <span class={[
                    "font-medium",
                    @database_metrics.query_performance.slow_queries > 3 && "text-warning",
                    @database_metrics.query_performance.slow_queries <= 3 && "text-base-content"
                  ]}>
                    <%= @database_metrics.query_performance.slow_queries %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Queries/sec:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.query_performance.queries_per_sec %>
                  </span>
                </div>
              </div>
            </div>

            <%!-- Storage --%>
            <div class="bg-base-300/30 rounded p-4 border border-base-300/50">
              <p class="text-xs text-base-content/60 mb-2">Storage</p>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">DB Size:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.storage.database_size %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Tables:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.storage.table_count %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Indexes:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.storage.index_count %>
                  </span>
                </div>
              </div>
            </div>

            <%!-- Replication --%>
            <div class="bg-base-300/30 rounded p-4 border border-base-300/50">
              <p class="text-xs text-base-content/60 mb-2">Replication</p>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Status:</span>
                  <span class="font-medium text-success">
                    <%= String.capitalize(@database_metrics.replication.status) %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Lag:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.replication.lag %>
                  </span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-base-content/70">Replicas:</span>
                  <span class="font-medium text-base-content">
                    <%= @database_metrics.replication.replicas %>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <%!-- API Endpoints Monitoring --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">API Endpoints Health</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px]">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Endpoint
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Method</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Status</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Avg Response
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Requests/min
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Error Rate
                </th>
              </tr>
            </thead>
            <tbody>
              <%= for endpoint <- @api_endpoints do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <span class="text-sm font-mono text-base-content"><%= endpoint.endpoint %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "badge badge-xs",
                      endpoint.method == "GET" && "badge-info",
                      endpoint.method == "POST" && "badge-success",
                      endpoint.method == "PUT" && "badge-warning",
                      endpoint.method == "DELETE" && "badge-error"
                    ]}>
                      <%= endpoint.method %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-1 rounded text-xs font-medium",
                      endpoint.status == "healthy" && "bg-success/10 text-success",
                      endpoint.status == "warning" && "bg-warning/10 text-warning",
                      endpoint.status == "error" && "bg-error/10 text-error"
                    ]}>
                      <%= String.capitalize(endpoint.status) %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-base-content"><%= endpoint.avg_response %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-base-content"><%= endpoint.requests_min %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-base-content"><%= endpoint.error_rate %></span>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>
      </div>

      <%!-- Error Rates --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">HTTP Error Rates (Last Hour)</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Status Code
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Count</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Percentage
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Trend</th>
              </tr>
            </thead>
            <tbody>
              <%= for error <- @error_rates do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <span class="text-sm font-medium text-base-content"><%= error.code %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-base-content"><%= error.count %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-base-content"><%= error.percentage %></span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="text-sm text-success">↓ -12%</span>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    """
  end
end
