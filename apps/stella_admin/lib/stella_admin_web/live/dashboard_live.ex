defmodule StellaAdminWeb.DashboardLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Dashboard")
     |> assign(:current_page, :dashboard)
     |> assign_chart_data()}
  end

  defp assign_chart_data(socket) do
    socket
    |> assign(:revenue_chart, revenue_chart_config())
    |> assign(:volume_chart, volume_chart_config())
    |> assign(:user_growth_chart, user_growth_chart_config())
    |> assign(:trading_pairs_chart, trading_pairs_donut_config())
  end

  # Revenue Chart Configuration
  defp revenue_chart_config do
    %{
      chart: %{
        type: "area",
        height: 200,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "Revenue",
          data: [45, 52, 48, 61, 58, 72, 85, 92, 103, 98, 115, 127, 142, 138, 155, 163, 178, 187]
        }
      ],
      colors: ["#c4f563"],
      fill: %{
        type: "gradient",
        gradient: %{
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.1,
          stops: [0, 90, 100]
        }
      },
      stroke: %{
        curve: "smooth",
        width: 2
      },
      grid: %{
        borderColor: "#2a2a2a",
        strokeDashArray: 4
      },
      xaxis: %{
        categories: ["1", "3", "5", "7", "9", "11", "13", "15", "17", "19", "21", "23", "25", "27", "29", "31", ">", "Now"],
        labels: %{
          show: true,
          style: %{
            colors: "#888888",
            fontSize: "10px"
          }
        },
        axisBorder: %{show: true, color: "#2a2a2a"},
        axisTicks: %{show: true, color: "#2a2a2a"}
      },
      yaxis: %{
        labels: %{
          show: true,
          style: %{
            colors: "#888888",
            fontSize: "10px"
          }
        }
      },
      dataLabels: %{enabled: false},
      tooltip: %{
        theme: "dark",
        x: %{show: true}
      }
    }
    |> Jason.encode!()
  end

  # Trading Volume Chart Configuration
  defp volume_chart_config do
    %{
      chart: %{
        type: "area",
        height: 250,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "Trading Volume",
          data: [1.2, 1.45, 1.35, 1.65, 1.55, 1.75, 1.85, 1.95, 2.1, 2.05, 2.25, 2.4]
        }
      ],
      colors: ["#c4f563"],
      fill: %{
        type: "gradient",
        gradient: %{
          shadeIntensity: 1,
          opacityFrom: 0.5,
          opacityTo: 0.1,
          stops: [0, 90, 100]
        }
      },
      stroke: %{
        curve: "smooth",
        width: 3
      },
      grid: %{
        borderColor: "#2a2a2a",
        strokeDashArray: 4
      },
      xaxis: %{
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "12px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "12px"
          }
        }
      },
      dataLabels: %{enabled: false},
      tooltip: %{
        theme: "dark"
      }
    }
    |> Jason.encode!()
  end

  # User Growth Chart Configuration
  defp user_growth_chart_config do
    %{
      chart: %{
        type: "area",
        height: 250,
        stacked: true,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "Total Users",
          data: [2_000, 2_800, 3_500, 4_200, 5_100, 6_200, 7_500, 8_800, 9_900, 10_800, 11_600, 12_543]
        },
        %{
          name: "Active Traders",
          data: [500, 720, 950, 1_200, 1_450, 1_850, 2_200, 2_650, 3_050, 3_350, 3_600, 3_891]
        }
      ],
      colors: ["#c4f563", "#7dd3c0"],
      fill: %{
        type: "gradient",
        gradient: %{
          opacityFrom: 0.6,
          opacityTo: 0.1
        }
      },
      stroke: %{
        curve: "smooth",
        width: 2
      },
      grid: %{
        borderColor: "#2a2a2a",
        strokeDashArray: 4
      },
      xaxis: %{
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "12px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "12px"
          }
        }
      },
      legend: %{
        position: "top",
        horizontalAlign: "left",
        labels: %{
          colors: "#cccccc"
        }
      },
      dataLabels: %{enabled: false},
      tooltip: %{
        theme: "dark",
        shared: true,
        intersect: false
      }
    }
    |> Jason.encode!()
  end

  # Trading Pairs Donut Chart Configuration
  defp trading_pairs_donut_config do
    %{
      chart: %{
        type: "donut",
        height: 280,
        background: "transparent"
      },
      series: [50, 28, 13, 9],
      labels: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "Others"],
      colors: ["#c4f563", "#7dd3c0", "#fbbf24", "#60a5fa"],
      legend: %{
        show: false
      },
      dataLabels: %{
        enabled: false
      },
      plotOptions: %{
        pie: %{
          donut: %{
            size: "75%",
            labels: %{
              show: true,
              total: %{
                show: true,
                label: "24h Volume",
                fontSize: "12px",
                color: "#888888"
              },
              value: %{
                show: true,
                fontSize: "20px",
                fontWeight: "bold",
                color: "#ffffff"
              }
            }
          }
        }
      },
      stroke: %{
        width: 1,
        colors: ["#444444"]
      },
      tooltip: %{
        theme: "dark"
      }
    }
    |> Jason.encode!()
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-base-content">Dashboard Overview</h1>
        <button class="px-4 py-2 bg-base-200 hover:bg-base-300 rounded text-sm font-medium text-base-content border border-base-300">
          Last 24 Hours
          <.icon name="hero-chevron-down" class="inline size-4 ml-1" />
        </button>
      </div>

      <%!-- Key Metric Cards --%>
      <div class="grid grid-cols-6 gap-4">
        <.stat_card
          title="Total Users"
          value="12,543"
          change="+12.5% vs last month"
          trend="up"
        />
        <.stat_card
          title="Active Traders"
          value="3,891"
          change="+8.2% vs last month"
          trend="up"
        />
        <.stat_card
          title="24h Trading Volume"
          value="$2.4M"
          change="-3.1% vs yesterday"
          trend="down"
        />
        <.stat_card
          title="Platform Revenue"
          value="$187.2K"
          change="+15.3% vs last month"
          trend="up"
        />

        <%!-- Active Copy Trades --%>
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Active Copy Trades</p>
          <p class="text-2xl font-bold text-base-content mb-1">1,247</p>
          <p class="text-xs text-success">+18% This Week</p>
        </div>

        <%!-- Pending Verifications --%>
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Pending Verifications</p>
          <p class="text-2xl font-bold text-base-content mb-1">23</p>
          <p class="text-xs text-base-content/50">Requires Action</p>
        </div>
      </div>

      <%!-- Main Grid - Revenue and Trading Volume --%>
      <div class="grid grid-cols-2 gap-4">
        <%!-- Platform Revenue Trend --%>
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="mb-3">
            <h3 class="text-base font-semibold text-base-content">Platform Revenue Trend</h3>
            <p class="text-xs text-base-content/60">Last 30 days</p>
            <p class="text-2xl font-bold text-base-content mt-1">$187,235.44</p>
          </div>
          <div
            id="revenue-chart"
            phx-hook="ApexChart"
            phx-update="ignore"
            data-chart={@revenue_chart}
          >
          </div>
        </div>

        <%!-- Trading Volume Breakdown --%>
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-base-content">Trading Volume by Pair</h2>
            <button class="p-1 hover:bg-base-300 rounded">
              <.icon name="hero-ellipsis-vertical" class="size-4 text-base-content/60" />
            </button>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <%!-- Trading Pairs Donut Chart --%>
            <div class="flex items-center justify-center">
              <div
                id="trading-pairs-chart"
                phx-hook="ApexChart"
                phx-update="ignore"
                data-chart={@trading_pairs_chart}
                class="w-full"
              >
              </div>
            </div>

            <%!-- Trading Pairs Breakdown --%>
            <div class="space-y-3">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center space-x-2">
                  <div class="w-8 h-8 bg-primary/20 rounded flex items-center justify-center">
                    <.icon name="hero-currency-dollar" class="size-4 text-primary" />
                  </div>
                  <div>
                    <p class="text-xs text-base-content/60">Total Volume</p>
                    <p class="text-xl font-bold text-base-content">$2.4M</p>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <div>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center space-x-1.5">
                      <div class="w-2.5 h-2.5 rounded-full" style="background-color: #c4f563;"></div>
                      <span class="text-xs text-base-content/70">BTC/USDT</span>
                    </div>
                    <span class="text-xs font-medium text-base-content">50%</span>
                  </div>
                  <p class="text-base font-semibold text-base-content ml-4">$1.2M</p>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center space-x-1.5">
                      <div class="w-2.5 h-2.5 rounded-full" style="background-color: #7dd3c0;"></div>
                      <span class="text-xs text-base-content/70">ETH/USDT</span>
                    </div>
                    <span class="text-xs font-medium text-base-content">28%</span>
                  </div>
                  <p class="text-base font-semibold text-base-content ml-4">$672K</p>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center space-x-1.5">
                      <div class="w-2.5 h-2.5 rounded-full" style="background-color: #fbbf24;"></div>
                      <span class="text-xs text-base-content/70">SOL/USDT</span>
                    </div>
                    <span class="text-xs font-medium text-base-content">13%</span>
                  </div>
                  <p class="text-base font-semibold text-base-content ml-4">$312K</p>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-0.5">
                    <div class="flex items-center space-x-1.5">
                      <div class="w-2.5 h-2.5 rounded-full" style="background-color: #60a5fa;"></div>
                      <span class="text-xs text-base-content/70">Others</span>
                    </div>
                    <span class="text-xs font-medium text-base-content">9%</span>
                  </div>
                  <p class="text-base font-semibold text-base-content ml-4">$216K</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <%!-- Top Traders and Quick Stats --%>
      <div class="grid grid-cols-3 gap-4">
        <%!-- Top Traders Table --%>
        <div class="col-span-2 bg-base-200 rounded p-4 border border-base-300">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-base-content">Top Performing Traders</h2>
            <button class="p-1 hover:bg-base-300 rounded">
              <.icon name="hero-ellipsis-vertical" class="size-4 text-base-content/60" />
            </button>
          </div>

          <table class="w-full">
            <thead>
              <tr class="border-b border-base-300">
                <th class="text-left py-2 px-3 text-xs font-medium text-base-content/60">Trader</th>
                <th class="text-left py-2 px-3 text-xs font-medium text-base-content/60">Followers</th>
                <th class="text-left py-2 px-3 text-xs font-medium text-base-content/60">30d Performance</th>
                <th class="text-left py-2 px-3 text-xs font-medium text-base-content/60">Total Volume</th>
              </tr>
            </thead>
            <tbody>
              <.trader_row
                name="Sarah Chen"
                username="@crypto_queen"
                followers="2,341"
                performance="+45.2%"
                performance_trend="up"
                volume="$1.2M"
                avatar_color="bg-purple-500"
              />
              <.trader_row
                name="Michael Torres"
                username="@btc_master"
                followers="1,892"
                performance="+38.7%"
                performance_trend="up"
                volume="$890K"
                avatar_color="bg-blue-500"
              />
              <.trader_row
                name="Emma Wilson"
                username="@eth_trader"
                followers="1,654"
                performance="+32.1%"
                performance_trend="up"
                volume="$745K"
                avatar_color="bg-green-500"
              />
            </tbody>
          </table>
        </div>

        <%!-- Quick Stats Column --%>
        <div class="grid grid-cols-2 gap-3">
          <%!-- Average Copy Success Rate --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Copy Success Rate</p>
            <p class="text-xl font-bold text-base-content mb-0.5">87.3%</p>
            <p class="text-xs text-success">+2.1% Month</p>
          </div>

          <%!-- Average Trade Duration --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Avg Trade Duration</p>
            <p class="text-xl font-bold text-base-content mb-0.5">4.2h</p>
            <p class="text-xs text-base-content/50">Median: 2.8h</p>
          </div>

          <%!-- Platform Fee Revenue --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Platform Fees (24h)</p>
            <p class="text-xl font-bold text-base-content mb-0.5">$12.4K</p>
            <p class="text-xs text-success">+8.5% vs Yesterday</p>
          </div>

          <%!-- Win Rate --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Avg Win Rate</p>
            <p class="text-xl font-bold text-base-content mb-0.5">64.8%</p>
            <p class="text-xs text-success">+1.3% Week</p>
          </div>

          <%!-- Total Positions Open --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Open Positions</p>
            <p class="text-xl font-bold text-base-content mb-0.5">2,847</p>
            <p class="text-xs text-base-content/50">Across 1,234 users</p>
          </div>

          <%!-- Risk Score --%>
          <div class="bg-base-200 rounded p-3 border border-base-300">
            <p class="text-xs text-base-content/60 mb-1">Avg Risk Score</p>
            <p class="text-xl font-bold text-base-content mb-0.5">6.2/10</p>
            <p class="text-xs text-warning">Medium Risk</p>
          </div>
        </div>
      </div>

      <%!-- Charts Row --%>
      <div class="grid grid-cols-2 gap-4">
        <%!-- Trading Volume Trend --%>
        <div class="bg-base-200 rounded p-6 border border-base-300">
          <h3 class="text-lg font-semibold text-base-content mb-4">Trading Volume Trend</h3>
          <div
            id="volume-chart"
            phx-hook="ApexChart"
            phx-update="ignore"
            data-chart={@volume_chart}
          >
          </div>
        </div>

        <%!-- User Growth --%>
        <div class="bg-base-200 rounded p-6 border border-base-300">
          <h3 class="text-lg font-semibold text-base-content mb-4">User Growth</h3>
          <div
            id="user-growth-chart"
            phx-hook="ApexChart"
            phx-update="ignore"
            data-chart={@user_growth_chart}
          >
          </div>
        </div>
      </div>
    </div>
    """
  end

  # Stat Card Component
  attr :title, :string, required: true
  attr :value, :string, required: true
  attr :change, :string, default: nil
  attr :subtitle, :string, default: nil
  attr :trend, :string, default: "neutral"

  defp stat_card(assigns) do
    ~H"""
    <div class="bg-base-200 rounded p-4 border border-base-300">
      <p class="text-sm text-base-content/60 mb-1"><%= @title %></p>
      <p class="text-2xl font-bold text-base-content mb-1"><%= @value %></p>
      <%= if @change do %>
        <div class="flex items-center space-x-1">
          <.icon
            name="hero-arrow-trending-up"
            class={["size-4", @trend == "up" && "text-success" || "text-error"]}
          />
          <span class={["text-xs", @trend == "up" && "text-success" || "text-error"]}>
            <%= @change %>
          </span>
        </div>
      <% end %>
      <%= if @subtitle do %>
        <p class="text-xs text-base-content/60"><%= @subtitle %></p>
      <% end %>
    </div>
    """
  end

  # Trader Row Component
  attr :name, :string, required: true
  attr :username, :string, required: true
  attr :followers, :string, required: true
  attr :performance, :string, required: true
  attr :performance_trend, :string, default: "up"
  attr :volume, :string, required: true
  attr :avatar_color, :string, default: "bg-primary"

  defp trader_row(assigns) do
    ~H"""
    <tr class="border-b border-base-300 hover:bg-base-300/30">
      <td class="py-2.5 px-3">
        <div class="flex items-center space-x-2">
          <div class={"w-8 h-8 #{@avatar_color} rounded-full flex items-center justify-center"}>
            <span class="text-white text-xs font-medium"><%= String.first(@name) %></span>
          </div>
          <div>
            <p class="text-xs font-medium text-base-content"><%= @name %></p>
            <p class="text-xs text-base-content/60"><%= @username %></p>
          </div>
        </div>
      </td>
      <td class="py-2.5 px-3">
        <p class="text-xs text-base-content"><%= @followers %></p>
      </td>
      <td class="py-2.5 px-3">
        <p class={[
          "text-xs font-medium",
          @performance_trend == "up" && "text-success" || "text-error"
        ]}>
          <%= @performance %>
        </p>
      </td>
      <td class="py-2.5 px-3">
        <p class="text-xs font-medium text-base-content"><%= @volume %></p>
      </td>
    </tr>
    """
  end
end
