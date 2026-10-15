defmodule StellaAdminWeb.AnalyticsLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Analytics")
     |> assign(:current_page, :analytics)
     |> assign(:revenue_trend_chart, revenue_trend_chart_config())
     |> assign(:user_growth_chart, user_growth_chart_config())
     |> assign(:trading_volume_chart, trading_volume_chart_config())
     |> assign(:revenue_sources_chart, revenue_sources_chart_config())
     |> assign(:user_retention_chart, user_retention_chart_config())
     |> assign(:top_pairs_data, get_top_pairs_data())
     |> assign(:geographic_data, get_geographic_data())}
  end

  defp revenue_trend_chart_config do
    %{
      chart: %{
        type: "area",
        height: 300,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "Revenue",
          data: [125_000, 132_000, 145_000, 138_000, 152_000, 168_000, 175_000, 182_000, 187_235]
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
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
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

  defp user_growth_chart_config do
    %{
      chart: %{
        type: "area",
        height: 300,
        stacked: true,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "New Users",
          data: [450, 520, 680, 750, 890, 1050, 1200, 1350, 1456]
        },
        %{
          name: "Returning Users",
          data: [1200, 1450, 1580, 1720, 1890, 2100, 2350, 2580, 2789]
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
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
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

  defp trading_volume_chart_config do
    %{
      chart: %{
        type: "bar",
        height: 300,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: "Trading Volume",
          data: [1.8, 2.1, 2.3, 2.0, 2.5, 2.7, 2.4, 2.8, 2.4]
        }
      ],
      colors: ["#c4f563"],
      plotOptions: %{
        bar: %{
          borderRadius: 2,
          columnWidth: "60%"
        }
      },
      grid: %{
        borderColor: "#2a2a2a",
        strokeDashArray: 4
      },
      xaxis: %{
        categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
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

  defp revenue_sources_chart_config do
    %{
      chart: %{
        type: "donut",
        height: 300,
        background: "transparent"
      },
      series: [48, 30, 14, 6, 2],
      labels: ["Trading Fees", "Copy Trade Fees", "Subscriptions", "Withdrawal Fees", "Other"],
      colors: ["#c4f563", "#7dd3c0", "#fbbf24", "#60a5fa", "#a78bfa"],
      legend: %{
        position: "bottom",
        labels: %{
          colors: "#cccccc"
        }
      },
      dataLabels: %{
        enabled: true,
        style: %{
          fontSize: "12px",
          colors: ["#fff"]
        }
      },
      plotOptions: %{
        pie: %{
          donut: %{
            size: "65%",
            labels: %{
              show: true,
              total: %{
                show: true,
                label: "Total Revenue",
                fontSize: "14px",
                color: "#888888"
              },
              value: %{
                show: true,
                fontSize: "24px",
                fontWeight: "bold",
                color: "#ffffff"
              }
            }
          }
        }
      },
      stroke: %{
        width: 0
      },
      tooltip: %{
        theme: "dark"
      }
    }
    |> Jason.encode!()
  end

  defp user_retention_chart_config do
    %{
      chart: %{
        type: "heatmap",
        height: 250,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{name: "Week 1", data: [%{x: "Mon", y: 85}, %{x: "Tue", y: 82}, %{x: "Wed", y: 79}, %{x: "Thu", y: 76}, %{x: "Fri", y: 73}, %{x: "Sat", y: 70}, %{x: "Sun", y: 68}]},
        %{name: "Week 2", data: [%{x: "Mon", y: 68}, %{x: "Tue", y: 65}, %{x: "Wed", y: 63}, %{x: "Thu", y: 61}, %{x: "Fri", y: 59}, %{x: "Sat", y: 57}, %{x: "Sun", y: 55}]},
        %{name: "Week 3", data: [%{x: "Mon", y: 55}, %{x: "Tue", y: 53}, %{x: "Wed", y: 52}, %{x: "Thu", y: 50}, %{x: "Fri", y: 49}, %{x: "Sat", y: 48}, %{x: "Sun", y: 47}]},
        %{name: "Week 4", data: [%{x: "Mon", y: 47}, %{x: "Tue", y: 46}, %{x: "Wed", y: 45}, %{x: "Thu", y: 44}, %{x: "Fri", y: 43}, %{x: "Sat", y: 42}, %{x: "Sun", y: 41}]}
      ],
      colors: ["#c4f563"],
      dataLabels: %{
        enabled: true,
        style: %{
          colors: ["#1a1a1a"],
          fontSize: "10px"
        }
      },
      xaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
          }
        }
      },
      yaxis: %{
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "11px"
          }
        }
      },
      tooltip: %{
        theme: "dark"
      }
    }
    |> Jason.encode!()
  end

  defp get_top_pairs_data do
    [
      %{pair: "BTC/USDT", volume: "$45.2M", trades: "12,453", avg_profit: "+3.2%", growth: "+15.3%"},
      %{pair: "ETH/USDT", volume: "$28.7M", trades: "8,234", avg_profit: "+2.1%", growth: "+12.8%"},
      %{pair: "SOL/USDT", volume: "$12.4M", trades: "5,678", avg_profit: "+5.8%", growth: "+22.4%"},
      %{pair: "AVAX/USDT", volume: "$8.9M", trades: "3,456", avg_profit: "-1.2%", growth: "+8.7%"},
      %{pair: "MATIC/USDT", volume: "$6.2M", trades: "2,890", avg_profit: "+1.8%", growth: "+5.2%"}
    ]
  end

  defp get_geographic_data do
    [
      %{country: "United States", users: "4,234", percentage: "33.7%", revenue: "$63.2K"},
      %{country: "United Kingdom", users: "2,156", percentage: "17.2%", revenue: "$32.1K"},
      %{country: "Canada", users: "1,567", percentage: "12.5%", revenue: "$23.4K"},
      %{country: "Germany", users: "1,234", percentage: "9.8%", revenue: "$18.3K"},
      %{country: "Australia", users: "890", percentage: "7.1%", revenue: "$13.2K"},
      %{country: "Others", users: "2,462", percentage: "19.7%", revenue: "$37.0K"}
    ]
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">Analytics Dashboard</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Comprehensive insights and performance metrics
          </p>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
          <button class="px-4 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded text-sm font-medium text-base-content transition-colors">
            <.icon name="hero-calendar" class="inline size-4 mr-1" />
            Last 9 Months
          </button>
          <button class="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors">
            <.icon name="hero-arrow-down-tray" class="inline size-4 mr-1" />
            Export Report
          </button>
        </div>
      </div>

      <%!-- Key Performance Indicators --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Revenue</p>
          <p class="text-2xl font-bold text-base-content mb-1">$187.2K</p>
          <p class="text-xs text-success">+15.3% MoM</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Users</p>
          <p class="text-2xl font-bold text-base-content mb-1">12,543</p>
          <p class="text-xs text-success">+12.5% MoM</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Trading Volume</p>
          <p class="text-2xl font-bold text-base-content mb-1">$2.4M</p>
          <p class="text-xs text-error">-3.1% vs last month</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Avg Session Time</p>
          <p class="text-2xl font-bold text-base-content mb-1">12.4m</p>
          <p class="text-xs text-success">+8.3% MoM</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Conversion Rate</p>
          <p class="text-2xl font-bold text-base-content mb-1">4.2%</p>
          <p class="text-xs text-success">+0.5% MoM</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">ARPU</p>
          <p class="text-2xl font-bold text-base-content mb-1">$14.92</p>
          <p class="text-xs text-success">+2.1% MoM</p>
        </div>
      </div>

      <%!-- Revenue Trend & User Growth --%>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <%!-- Revenue Trend --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Revenue Trend</h2>
            <p class="text-xs text-base-content/60 mt-1">Monthly revenue growth over time</p>
          </div>
          <div class="p-4">
            <div
              id="revenue-trend-chart"
              phx-hook="ApexChart"
              phx-update="ignore"
              data-chart={@revenue_trend_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>

        <%!-- User Growth --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">User Growth</h2>
            <p class="text-xs text-base-content/60 mt-1">New vs returning users over time</p>
          </div>
          <div class="p-4">
            <div
              id="user-growth-chart"
              phx-hook="ApexChart"
              phx-update="ignore"
              data-chart={@user_growth_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>
      </div>

      <%!-- Trading Volume & Revenue Sources --%>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <%!-- Trading Volume --%>
        <div class="lg:col-span-2 bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Trading Volume Trends</h2>
            <p class="text-xs text-base-content/60 mt-1">Monthly trading volume in millions</p>
          </div>
          <div class="p-4">
            <div
              id="trading-volume-chart"
              phx-hook="ApexChart"
              phx-update="ignore"
              data-chart={@trading_volume_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>

        <%!-- Revenue Sources --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Revenue Sources</h2>
            <p class="text-xs text-base-content/60 mt-1">Breakdown by category</p>
          </div>
          <div class="p-4">
            <div
              id="revenue-sources-chart"
              phx-hook="ApexChart"
              phx-update="ignore"
              data-chart={@revenue_sources_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>
      </div>

      <%!-- User Retention Heatmap --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">User Retention Heatmap</h2>
          <p class="text-xs text-base-content/60 mt-1">
            Daily retention rate (%) by week - darker = higher retention
          </p>
        </div>
        <div class="p-4">
          <div
            id="user-retention-chart"
            phx-hook="ApexChart"
            phx-update="ignore"
            data-chart={@user_retention_chart}
            class="w-full"
          >
          </div>
        </div>
      </div>

      <%!-- Top Pairs & Geographic Data --%>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <%!-- Top Trading Pairs Performance --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Top Trading Pairs Performance</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[400px]">
              <thead class="bg-base-300/50 border-b border-base-300">
                <tr>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Pair</th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Volume
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Trades
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Avg Profit
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody>
                <%= for pair <- @top_pairs_data do %>
                  <tr class="border-b border-base-300">
                    <td class="py-2.5 px-4">
                      <p class="text-sm font-bold text-base-content"><%= pair.pair %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-sm font-medium text-base-content"><%= pair.volume %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs text-base-content"><%= pair.trades %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class={[
                        "text-xs font-medium",
                        String.starts_with?(pair.avg_profit, "+") && "text-success",
                        String.starts_with?(pair.avg_profit, "-") && "text-error"
                      ]}>
                        <%= pair.avg_profit %>
                      </p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs font-medium text-success"><%= pair.growth %></p>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>
          </div>
        </div>

        <%!-- Geographic Distribution --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <h2 class="text-base font-semibold text-base-content">Geographic Distribution</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-base-300/50 border-b border-base-300">
                <tr>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Country
                  </th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Users</th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">Share</th>
                  <th class="text-left py-2 px-4 text-xs font-medium text-base-content/60">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                <%= for geo <- @geographic_data do %>
                  <tr class="border-b border-base-300">
                    <td class="py-2.5 px-4">
                      <p class="text-sm font-medium text-base-content"><%= geo.country %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs text-base-content"><%= geo.users %></p>
                    </td>
                    <td class="py-2.5 px-4">
                      <div class="flex items-center space-x-2">
                        <div class="flex-1 bg-base-300 rounded-full h-1.5 max-w-[60px]">
                          <div
                            class="bg-primary rounded-full h-1.5"
                            style={"width: #{geo.percentage}"}
                          >
                          </div>
                        </div>
                        <p class="text-xs text-base-content/70"><%= geo.percentage %></p>
                      </div>
                    </td>
                    <td class="py-2.5 px-4">
                      <p class="text-xs font-medium text-base-content"><%= geo.revenue %></p>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
