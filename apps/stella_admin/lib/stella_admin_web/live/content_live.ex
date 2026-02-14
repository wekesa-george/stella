defmodule StellaAdminWeb.ContentLive do
  use StellaAdminWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Content")
     |> assign(:current_page, :content)
     |> assign(:posts, get_posts())
     |> assign(:pending_moderation, get_pending_moderation())
     |> assign(:filter, "all")
     |> assign(:content_type, "all")}
  end

  @impl true
  def handle_event("filter", %{"type" => type}, socket) do
    {:noreply, assign(socket, :filter, type)}
  end

  @impl true
  def handle_event("filter_content_type", %{"type" => type}, socket) do
    {:noreply, assign(socket, :content_type, type)}
  end

  @impl true
  def handle_event("approve_content", %{"id" => id}, socket) do
    # In real app, this would update the database
    updated_moderation =
      Enum.reject(socket.assigns.pending_moderation, fn item -> item.id == String.to_integer(id) end)

    {:noreply,
     socket
     |> assign(:pending_moderation, updated_moderation)
     |> put_flash(:info, "Content approved successfully")}
  end

  @impl true
  def handle_event("reject_content", %{"id" => id}, socket) do
    # In real app, this would update the database
    updated_moderation =
      Enum.reject(socket.assigns.pending_moderation, fn item -> item.id == String.to_integer(id) end)

    {:noreply,
     socket
     |> assign(:pending_moderation, updated_moderation)
     |> put_flash(:info, "Content rejected successfully")}
  end

  defp get_posts do
    [
      %{
        id: 1,
        title: "Bitcoin hits new all-time high in Q1 2026",
        author: "Sarah Chen",
        username: "@crypto_queen",
        type: "Article",
        status: "published",
        views: 12_453,
        likes: 892,
        comments: 124,
        published_at: "2 hours ago",
        avatar_color: "bg-purple-500"
      },
      %{
        id: 2,
        title: "5 Trading Strategies for Bull Markets",
        author: "Michael Torres",
        username: "@btc_master",
        type: "Educational",
        status: "published",
        views: 8_234,
        likes: 654,
        comments: 89,
        published_at: "5 hours ago",
        avatar_color: "bg-blue-500"
      },
      %{
        id: 3,
        title: "Platform Update: New Copy Trading Features",
        author: "Admin Team",
        username: "@stella_official",
        type: "Announcement",
        status: "published",
        views: 15_782,
        likes: 1_234,
        comments: 234,
        published_at: "1 day ago",
        avatar_color: "bg-primary"
      },
      %{
        id: 4,
        title: "Understanding Leverage in Crypto Trading",
        author: "Emma Wilson",
        username: "@eth_trader",
        type: "Educational",
        status: "published",
        views: 6_543,
        likes: 423,
        comments: 67,
        published_at: "2 days ago",
        avatar_color: "bg-green-500"
      },
      %{
        id: 5,
        title: "Weekly Market Analysis - February 2026",
        author: "David Lee",
        username: "@day_trader",
        type: "Analysis",
        status: "draft",
        views: 0,
        likes: 0,
        comments: 0,
        published_at: "Draft",
        avatar_color: "bg-teal-500"
      }
    ]
  end

  defp get_pending_moderation do
    [
      %{
        id: 1,
        title: "My first trade profit - $500 in one day!",
        author: "Alex Kumar",
        username: "@alt_hunter",
        type: "Post",
        reason: "Auto-flagged: Contains profit claims",
        submitted: "5 mins ago",
        avatar_color: "bg-indigo-500"
      },
      %{
        id: 2,
        title: "Check out this amazing trading bot",
        author: "Sophie Martin",
        username: "@margin_queen",
        type: "Post",
        reason: "User report: Possible spam",
        submitted: "15 mins ago",
        avatar_color: "bg-pink-500"
      },
      %{
        id: 3,
        title: "Free trading signals - join my group",
        author: "James Park",
        username: "@sol_whale",
        type: "Post",
        reason: "Auto-flagged: External links",
        submitted: "1 hour ago",
        avatar_color: "bg-orange-500"
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
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">Content Management</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Manage posts, articles, announcements, and user-generated content
          </p>
        </div>
        <button class="w-full sm:w-auto px-4 py-2 bg-primary hover:bg-primary/90 text-primary-content rounded text-sm font-medium transition-colors">
          <.icon name="hero-plus" class="inline size-4 mr-1" />
          Create Content
        </button>
      </div>

      <%!-- Content Stats --%>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Posts</p>
          <p class="text-2xl font-bold text-base-content mb-1">1,234</p>
          <p class="text-xs text-success">+45 this week</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Published</p>
          <p class="text-2xl font-bold text-base-content mb-1">892</p>
          <p class="text-xs text-base-content/50">72.3% of total</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Pending Review</p>
          <p class="text-2xl font-bold text-warning mb-1">23</p>
          <p class="text-xs text-base-content/50">Needs attention</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Total Views</p>
          <p class="text-2xl font-bold text-base-content mb-1">234K</p>
          <p class="text-xs text-success">+12.3% vs last week</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Engagement Rate</p>
          <p class="text-2xl font-bold text-base-content mb-1">8.7%</p>
          <p class="text-xs text-success">+1.2% vs last week</p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Flagged Content</p>
          <p class="text-2xl font-bold text-error mb-1">12</p>
          <p class="text-xs text-base-content/50">Requires review</p>
        </div>
      </div>

      <%!-- Pending Moderation --%>
      <%= if length(@pending_moderation) > 0 do %>
        <div class="bg-base-200 rounded border border-base-300">
          <div class="p-4 border-b border-base-300 flex items-center justify-between">
            <h2 class="text-base font-semibold text-base-content">Pending Moderation</h2>
            <span class="px-2 py-1 bg-warning/20 text-warning rounded text-xs font-medium">
              <%= length(@pending_moderation) %> Items
            </span>
          </div>
          <div class="p-4">
            <div class="space-y-3">
              <%= for item <- @pending_moderation do %>
                <div class="bg-base-300/30 rounded p-4 border border-base-300/50">
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex items-start space-x-3 flex-1">
                      <div class={"w-10 h-10 #{item.avatar_color} rounded-full flex items-center justify-center flex-shrink-0"}>
                        <span class="text-white text-sm font-medium">
                          <%= String.first(item.author) %>
                        </span>
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-1">
                          <p class="text-sm font-medium text-base-content"><%= item.author %></p>
                          <p class="text-xs text-base-content/60"><%= item.username %></p>
                          <span class="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-medium">
                            <%= item.type %>
                          </span>
                        </div>
                        <p class="text-base font-medium text-base-content mb-2"><%= item.title %></p>
                        <div class="flex items-center space-x-4 text-xs text-base-content/60">
                          <div class="flex items-center space-x-1">
                            <.icon name="hero-flag" class="size-3 text-warning" />
                            <span><%= item.reason %></span>
                          </div>
                          <span>•</span>
                          <span><%= item.submitted %></span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button
                      phx-click="approve_content"
                      phx-value-id={item.id}
                      class="px-4 py-1.5 bg-success hover:bg-success/90 text-white rounded text-xs font-medium transition-colors"
                    >
                      <.icon name="hero-check" class="inline size-3 mr-1" />
                      Approve
                    </button>
                    <button
                      phx-click="reject_content"
                      phx-value-id={item.id}
                      class="px-4 py-1.5 bg-error hover:bg-error/90 text-white rounded text-xs font-medium transition-colors"
                    >
                      <.icon name="hero-x-mark" class="inline size-3 mr-1" />
                      Reject
                    </button>
                    <button class="px-4 py-1.5 bg-base-200 hover:bg-base-300 border border-base-300 rounded text-xs font-medium text-base-content transition-colors">
                      <.icon name="hero-eye" class="inline size-3 mr-1" />
                      Review
                    </button>
                  </div>
                </div>
              <% end %>
            </div>
          </div>
        </div>
      <% end %>

      <%!-- Content List --%>
      <div class="bg-base-200 rounded border border-base-300">
        <div class="p-4 border-b border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-base-content">All Content</h2>
          <div class="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto">
            <button
              phx-click="filter_content_type"
              phx-value-type="all"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @content_type == "all" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              All
            </button>
            <button
              phx-click="filter_content_type"
              phx-value-type="article"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @content_type == "article" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Articles
            </button>
            <button
              phx-click="filter_content_type"
              phx-value-type="educational"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @content_type == "educational" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Educational
            </button>
            <button
              phx-click="filter_content_type"
              phx-value-type="announcement"
              class={[
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                @content_type == "announcement" && "bg-primary text-primary-content" ||
                  "bg-base-300 text-base-content/70 hover:text-base-content"
              ]}
            >
              Announcements
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px]">
            <thead class="bg-base-300/50 border-b border-base-300">
              <tr>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Title</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Author</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Type</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Status</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Views</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">Likes</th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Comments
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Published
                </th>
                <th class="text-left py-3 px-4 text-xs font-medium text-base-content/60">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <%= for post <- @posts do %>
                <tr class="border-b border-base-300 hover:bg-base-300/30 transition-colors">
                  <td class="py-2.5 px-4">
                    <p class="text-sm font-medium text-base-content max-w-md truncate">
                      <%= post.title %>
                    </p>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-2">
                      <div class={"w-8 h-8 #{post.avatar_color} rounded-full flex items-center justify-center"}>
                        <span class="text-white text-xs font-medium">
                          <%= String.first(post.author) %>
                        </span>
                      </div>
                      <div>
                        <p class="text-xs font-medium text-base-content"><%= post.author %></p>
                        <p class="text-xs text-base-content/60"><%= post.username %></p>
                      </div>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      post.type == "Article" && "bg-primary/20 text-primary",
                      post.type == "Educational" && "bg-info/20 text-info",
                      post.type == "Announcement" && "bg-warning/20 text-warning",
                      post.type == "Analysis" && "bg-success/20 text-success"
                    ]}>
                      <%= post.type %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <span class={[
                      "px-2 py-0.5 rounded text-xs font-medium",
                      post.status == "published" && "bg-success/20 text-success",
                      post.status == "draft" && "bg-base-content/20 text-base-content/60"
                    ]}>
                      <%= String.capitalize(post.status) %>
                    </span>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-1">
                      <.icon name="hero-eye" class="size-3 text-base-content/60" />
                      <p class="text-xs text-base-content">
                        <%= format_number(post.views) %>
                      </p>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-1">
                      <.icon name="hero-heart" class="size-3 text-base-content/60" />
                      <p class="text-xs text-base-content">
                        <%= format_number(post.likes) %>
                      </p>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-1">
                      <.icon name="hero-chat-bubble-left" class="size-3 text-base-content/60" />
                      <p class="text-xs text-base-content">
                        <%= format_number(post.comments) %>
                      </p>
                    </div>
                  </td>
                  <td class="py-2.5 px-4">
                    <p class="text-xs text-base-content/60"><%= post.published_at %></p>
                  </td>
                  <td class="py-2.5 px-4">
                    <div class="flex items-center space-x-2">
                      <button class="p-1 hover:bg-base-300 rounded transition-colors">
                        <.icon name="hero-eye" class="size-4 text-base-content/60" />
                      </button>
                      <button class="p-1 hover:bg-base-300 rounded transition-colors">
                        <.icon name="hero-pencil" class="size-4 text-base-content/60" />
                      </button>
                      <button class="p-1 hover:bg-base-300 rounded transition-colors">
                        <.icon name="hero-trash" class="size-4 text-error/60" />
                      </button>
                    </div>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
        </div>
      </div>

      <%!-- Pagination --%>
      <div class="flex items-center justify-between">
        <p class="text-xs text-base-content/60">
          Showing 1 to 5 of 1,234 posts
        </p>
        <div class="flex items-center space-x-2">
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            Previous
          </button>
          <button class="px-3 py-1.5 bg-primary text-primary-content rounded text-xs font-medium transition-colors">
            1
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            2
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            3
          </button>
          <span class="text-xs text-base-content/60">...</span>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            41
          </button>
          <button class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
    """
  end

  defp format_number(number) when is_integer(number) do
    number
    |> Integer.to_string()
    |> String.graphemes()
    |> Enum.reverse()
    |> Enum.chunk_every(3)
    |> Enum.join(",")
    |> String.reverse()
  end
end
