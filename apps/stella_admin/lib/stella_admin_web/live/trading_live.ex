defmodule StellaAdminWeb.TradingLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      # Send update every 2 seconds for real-time effect
      Process.send_after(self(), :update_prices, 2000)
    end

    {:ok,
     socket
     |> assign(:page_title, "Trading")
     |> assign(:current_page, :trading)
     |> assign(:active_trades, get_active_trades())
     |> assign(:recent_trades, get_recent_trades())
     |> assign(:top_pairs, get_top_pairs())
     |> assign(:filter, "all")
     |> assign(:selected_pair, "BTC/USDT")
     |> assign(:candlestick_chart, candlestick_chart_config())
     |> assign(:live_prices, initial_live_prices())
     |> assign(:price_changes, %{})}
  end

  @impl true
  def handle_event("filter", %{"type" => type}, socket) do
    {:noreply, assign(socket, :filter, type)}
  end

  @impl true
  def handle_event("select_pair", %{"pair" => pair}, socket) do
    {:noreply,
     socket
     |> assign(:selected_pair, pair)
     |> assign(:candlestick_chart, candlestick_chart_config(pair))}
  end

  @impl true
  def handle_info(:update_prices, socket) do
    # Schedule next update
    Process.send_after(self(), :update_prices, 2000)

    # Simulate price changes
    updated_prices =
      Enum.map(socket.assigns.live_prices, fn {pair, price} ->
        change = :rand.uniform(200) - 100
        new_price = price + change
        {pair, new_price}
      end)
      |> Map.new()

    # Track which prices went up or down
    price_changes =
      Enum.map(updated_prices, fn {pair, new_price} ->
        old_price = socket.assigns.live_prices[pair]
        direction = cond do
          new_price > old_price -> :up
          new_price < old_price -> :down
          true -> :neutral
        end
        {pair, direction}
      end)
      |> Map.new()

    {:noreply,
     socket
     |> assign(:live_prices, updated_prices)
     |> assign(:price_changes, price_changes)}
  end

  defp initial_live_prices do
    %{
      "BTC/USDT" => 44_400,
      "ETH/USDT" => 2_312,
      "SOL/USDT" => 96.20,
      "AVAX/USDT" => 33.80,
      "MATIC/USDT" => 0.89
    }
  end

  defp candlestick_chart_config(pair \\ "BTC/USDT") do
    # Generate sample candlestick data
    data = generate_candlestick_data()

    %{
      chart: %{
        type: "candlestick",
        height: 350,
        toolbar: %{show: false},
        background: "transparent"
      },
      series: [
        %{
          name: pair,
          data: data
        }
      ],
      xaxis: %{
        type: "datetime",
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "10px"
          }
        }
      },
      yaxis: %{
        tooltip: %{enabled: true},
        labels: %{
          style: %{
            colors: "#888888",
            fontSize: "10px"
          }
        }
      },
      plotOptions: %{
        candlestick: %{
          colors: %{
            upward: "#c4f563",
            downward: "#ef4444"
          }
        }
      },
      grid: %{
        borderColor: "#2a2a2a",
        strokeDashArray: 4
      },
      tooltip: %{
        theme: "dark"
      }
    }
    |> Jason.encode!()
  end

  defp generate_candlestick_data do
    base_time = System.system_time(:millisecond) - 3_600_000
    base_price = 44_000

    Enum.map(0..59, fn i ->
      time = base_time + i * 60_000
      open = base_price + :rand.uniform(1000) - 500
      high = open + :rand.uniform(400)
      low = open - :rand.uniform(400)
      close = low + :rand.uniform(trunc(high - low))

      %{
        x: time,
        y: [open, high, low, close]
      }
    end)
  end

  defp get_active_trades do
    [
      %{
        id: 1,
        trader: "Sarah Chen",
        username: "@crypto_queen",
        pair: "BTC/USDT",
        type: "Long",
        entry_price: "$43,200",
        current_price: "$44,400",
        size: "$12,500",
        leverage: "5x",
        pnl: "+$1,200",
        pnl_percent: "+9.6%",
        duration: "3h 24m",
        followers_copying: 234,
        avatar_color: "bg-purple-500"
      },
      %{
        id: 2,
        trader: "Michael Torres",
        username: "@btc_master",
        pair: "ETH/USDT",
        type: "Long",
        entry_price: "$2,245",
        current_price: "$2,312",
        size: "$8,900",
        leverage: "3x",
        pnl: "+$670",
        pnl_percent: "+7.5%",
        duration: "1h 45m",
        followers_copying: 189,
        avatar_color: "bg-blue-500"
      },
      %{
        id: 3,
        trader: "Emma Wilson",
        username: "@eth_trader",
        pair: "SOL/USDT",
        type: "Short",
        entry_price: "$98.50",
        current_price: "$96.20",
        size: "$5,600",
        leverage: "10x",
        pnl: "+$2,330",
        pnl_percent: "+41.6%",
        duration: "6h 12m",
        followers_copying: 156,
        avatar_color: "bg-green-500"
      },
      %{
        id: 4,
        trader: "David Lee",
        username: "@day_trader",
        pair: "BTC/USDT",
        type: "Long",
        entry_price: "$44,100",
        current_price: "$44,400",
        size: "$15,200",
        leverage: "2x",
        pnl: "+$300",
        pnl_percent: "+2.0%",
        duration: "45m",
        followers_copying: 312,
        avatar_color: "bg-teal-500"
      },
      %{
        id: 5,
        trader: "Alex Kumar",
        username: "@alt_hunter",
        pair: "AVAX/USDT",
        type: "Long",
        entry_price: "$34.20",
        current_price: "$33.80",
        size: "$4,200",
        leverage: "5x",
        pnl: "-$420",
        pnl_percent: "-10.0%",
        duration: "2h 30m",
        followers_copying: 92,
        avatar_color: "bg-indigo-500"
      }
    ]
  end

  defp get_recent_trades do
    [
      %{
        id: 1,
        trader: "Sarah Chen",
        username: "@crypto_queen",
        pair: "BTC/USDT",
        type: "Long",
        entry_price: "$42,350",
        exit_price: "$43,120",
        size: "$10,000",
        pnl: "+$770",
        pnl_percent: "+1.82%",
        closed_at: "2 hours ago",
        avatar_color: "bg-purple-500"
      },
      %{
        id: 2,
        trader: "Michael Torres",
        username: "@btc_master",
        pair: "ETH/USDT",
        type: "Long",
        entry_price: "$2,245",
        exit_price: "$2,198",
        size: "$7,500",
        pnl: "-$470",
        pnl_percent: "-6.3%",
        closed_at: "3 hours ago",
        avatar_color: "bg-blue-500"
      },
      %{
        id: 3,
        trader: "Emma Wilson",
        username: "@eth_trader",
        pair: "SOL/USDT",
        type: "Short",
        entry_price: "$95.20",
        exit_price: "$92.10",
        size: "$6,200",
        pnl: "+$1,930",
        pnl_percent: "+31.1%",
        closed_at: "5 hours ago",
        avatar_color: "bg-green-500"
      }
    ]
  end

  defp get_top_pairs do
    [
      %{pair: "BTC/USDT", volume: "$45.2M", trades: 1247, avg_pnl: "+3.2%", trend: "up"},
      %{pair: "ETH/USDT", volume: "$28.7M", trades: 892, avg_pnl: "+2.1%", trend: "up"},
      %{pair: "SOL/USDT", volume: "$12.4M", trades: 534, avg_pnl: "+5.8%", trend: "up"},
      %{pair: "AVAX/USDT", volume: "$8.9M", trades: 423, avg_pnl: "-1.2%", trend: "down"},
      %{pair: "MATIC/USDT", volume: "$6.2M", trades: 312, avg_pnl: "+1.8%", trend: "up"}
    ]
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">Trading Overview</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Monitor all active and recent trades across the platform
          </p>
        </div>
        <button class="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors">
          <.icon name="hero-arrow-down-tray" class="inline size-4 mr-1" />
          Export Data
        </button>
      </div>

      <%!-- Stats Cards --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Active Trades</p>
          <p class="text-2xl font-bold text-base-content mb-1">1,234</p>
          <p class="text-xs text-success">+8.5% vs yesterday</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">24h Volume</p>
          <p class="text-2xl font-bold text-base-content mb-1">$2.4M</p>
          <p class="text-xs text-error">-3.1% vs yesterday</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total P&L (24h)</p>
          <p class="text-2xl font-bold text-success mb-1">+$45.2K</p>
          <p class="text-xs text-success">+12.3% profitable</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Avg Win Rate</p>
          <p class="text-2xl font-bold text-base-content mb-1">64.8%</p>
          <p class="text-xs text-success">+1.2% vs last week</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Copy Trades</p>
          <p class="text-2xl font-bold text-base-content mb-1">983</p>
          <p class="text-xs text-base-content/50">79.7% of active</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Avg Leverage</p>
          <p class="text-2xl font-bold text-warning mb-1">5.2x</p>
          <p class="text-xs text-base-content/50">Medium risk</p>
        </div>
      </div>

      <%!-- Live Price Ticker & Chart --%>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <%!-- Live Price Ticker --%>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold text-base-content">Live Prices</h2>
              <div class="flex items-center space-x-1">
                <div class="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <span class="text-xs text-base-content/60">Live</span>
              </div>
            </div>
          </div>
          <div class="p-4 space-y-3">
            <%= for {pair, price} <- @live_prices do %>
              <button
                phx-click="select_pair"
                phx-value-pair={pair}
                class={[
                  "w-full text-left p-3 rounded border transition-all",
                  @selected_pair == pair && "bg-primary/10 border-primary",
                  @selected_pair != pair && "bg-base-300/30 border-base-300/50 hover:bg-base-300/50"
                ]}
              >
                <div class="flex items-center justify-between mb-1">
                  <p class="text-sm font-bold text-base-content"><%= pair %></p>
                  <%= case Map.get(@price_changes, pair, :neutral) do %>
                    <% :up -> %>
                      <.icon name="hero-arrow-trending-up" class="size-4 text-success animate-pulse" />
                    <% :down -> %>
                      <.icon name="hero-arrow-trending-down" class="size-4 text-error animate-pulse" />
                    <% _ -> %>
                      <.icon name="hero-minus" class="size-4 text-base-content/40" />
                  <% end %>
                </div>
                <p class={[
                  "text-lg font-bold transition-colors",
                  Map.get(@price_changes, pair) == :up && "text-success",
                  Map.get(@price_changes, pair) == :down && "text-error",
                  Map.get(@price_changes, pair) == :neutral && "text-base-content"
                ]}>
                  $<%= :erlang.float_to_binary(price / 1, decimals: 2) %>
                </p>
              </button>
            <% end %>
          </div>
        </div>

        <%!-- Candlestick Chart --%>
        <div class="lg:col-span-2 bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300">
            <div class="flex items-center justify-between">
              <h2 class="text-base font-semibold text-base-content">
                <%= @selected_pair %> Chart
              </h2>
              <div class="flex items-center space-x-2">
                <span class="text-xs text-base-content/60">1H</span>
                <span class="text-xs text-base-content/60">•</span>
                <span class="text-xs text-base-content/60">Candlestick</span>
              </div>
            </div>
          </div>
          <div class="p-4">
            <div
              id="candlestick-chart"
              phx-hook="ApexChart"
              phx-update="ignore"
              data-chart={@candlestick_chart}
              class="w-full"
            >
            </div>
          </div>
        </div>
      </div>

      <%!-- Top Trading Pairs --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">Top Trading Pairs (24h)</h2>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <%= for pair <- @top_pairs do %>
              <div class="bg-base-300/30 rounded p-3 border border-base-300/50">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm font-bold text-base-content"><%= pair.pair %></p>
                  <%= if pair.trend == "up" do %>
                    <.icon name="hero-arrow-trending-up" class="size-4 text-success" />
                  <% else %>
                    <.icon name="hero-arrow-trending-down" class="size-4 text-error" />
                  <% end %>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-base-content/60">Volume</p>
                    <p class="text-xs font-medium text-base-content"><%= pair.volume %></p>
                  </div>
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-base-content/60">Trades</p>
                    <p class="text-xs font-medium text-base-content"><%= pair.trades %></p>
                  </div>
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-base-content/60">Avg P&L</p>
                    <p class={[
                      "text-xs font-medium",
                      String.starts_with?(pair.avg_pnl, "+") && "text-success",
                      String.starts_with?(pair.avg_pnl, "-") && "text-error"
                    ]}>
                      <%= pair.avg_pnl %>
                    </p>
                  </div>
                </div>
              </div>
            <% end %>
          </div>
        </div>
      </div>

      <%!-- Active Trades --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-base-content">Active Trades</h2>
          <div class="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto">
            <button
              phx-click="filter"
              phx-value-type="all"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "all" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              All
            </button>
            <button
              phx-click="filter"
              phx-value-type="long"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "long" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Long
            </button>
            <button
              phx-click="filter"
              phx-value-type="short"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @filter == "short" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Short
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px]">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Trader</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Pair</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Type</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Entry Price
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Current Price
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Size</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Leverage
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">P&L</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Duration
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Copiers
                </th>
              </tr>
            </thead>
            <tbody>
              <%= for trade <- @active_trades do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-2">
                      <div class={"w-8 h-8 #{trade.avatar_color} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-xs font-medium">
                          <%= String.first(trade.trader) %>
                        </span>
                      </div>
                      <div>
                        <p class="text-xs font-medium text-base-content"><%= trade.trader %></p>
                        <p class="text-xs text-base-content/60"><%= trade.username %></p>
                      </div>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-sm font-medium text-base-content"><%= trade.pair %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      trade.type == "Long" && "bg-success/20 text-success",
                      trade.type == "Short" && "bg-error/20 text-error"
                    ]}>
                      <%= trade.type %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content"><%= trade.entry_price %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs font-medium text-base-content"><%= trade.current_price %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content"><%= trade.size %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class="px-2 py-0.5 bg-warning/20 text-warning rounded text-xs font-medium">
                      <%= trade.leverage %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <div>
                      <p class={[
                        "text-xs font-medium",
                        String.starts_with?(trade.pnl, "+") && "text-success",
                        String.starts_with?(trade.pnl, "-") && "text-error"
                      ]}>
                        <%= trade.pnl %>
                      </p>
                      <p class={[
                        "text-xs",
                        String.starts_with?(trade.pnl_percent, "+") && "text-success/70",
                        String.starts_with?(trade.pnl_percent, "-") && "text-error/70"
                      ]}>
                        <%= trade.pnl_percent %>
                      </p>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content/60"><%= trade.duration %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-1">
                      <.icon name="hero-users" class="size-3 text-base-content/60" />
                      <p class="text-xs text-base-content"><%= trade.followers_copying %></p>
                    </div>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>
      </div>

      <%!-- Recent Closed Trades --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300">
          <h2 class="text-base font-semibold text-base-content">Recently Closed Trades</h2>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[800px]">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Trader</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Pair</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Type</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Entry Price
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Exit Price
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Size</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">P&L</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Closed At
                </th>
              </tr>
            </thead>
            <tbody>
              <%= for trade <- @recent_trades do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-2">
                      <div class={"w-8 h-8 #{trade.avatar_color} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-xs font-medium">
                          <%= String.first(trade.trader) %>
                        </span>
                      </div>
                      <div>
                        <p class="text-xs font-medium text-base-content"><%= trade.trader %></p>
                        <p class="text-xs text-base-content/60"><%= trade.username %></p>
                      </div>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-sm font-medium text-base-content"><%= trade.pair %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      trade.type == "Long" && "bg-success/20 text-success",
                      trade.type == "Short" && "bg-error/20 text-error"
                    ]}>
                      <%= trade.type %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content"><%= trade.entry_price %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs font-medium text-base-content"><%= trade.exit_price %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content"><%= trade.size %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <div>
                      <p class={[
                        "text-xs font-medium",
                        String.starts_with?(trade.pnl, "+") && "text-success",
                        String.starts_with?(trade.pnl, "-") && "text-error"
                      ]}>
                        <%= trade.pnl %>
                      </p>
                      <p class={[
                        "text-xs",
                        String.starts_with?(trade.pnl_percent, "+") && "text-success/70",
                        String.starts_with?(trade.pnl_percent, "-") && "text-error/70"
                      ]}>
                        <%= trade.pnl_percent %>
                      </p>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content/60"><%= trade.closed_at %></p>
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
