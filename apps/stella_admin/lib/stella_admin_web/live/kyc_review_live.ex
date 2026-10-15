defmodule StellaAdminWeb.KycReviewLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Kyc
  alias StellaAdmin.Users

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "KYC Review")
     |> assign(:current_page, :kyc_review)
     |> assign(:kyc_records, [])
     |> assign(:pagination, %{})
     |> assign(:stats, %{})
     |> assign(:filters, %{page: 1, page_size: 20})
     |> assign(:show_approve_modal, false)
     |> assign(:show_reject_modal, false)
     |> assign(:selected_kyc, nil)
     |> assign(:selected_user, nil)
     |> assign(:approval_notes, "")
     |> assign(:rejection_reason, "")}
  end

  @impl true
  def handle_params(params, _url, socket) do
    page = String.to_integer(params["page"] || "1")

    filters = Map.put(socket.assigns.filters, :page, page)

    {kyc_records, pagination} = Kyc.list_pending_kyc_submissions(filters)
    stats = Kyc.get_kyc_stats()

    {:noreply,
     socket
     |> assign(:kyc_records, kyc_records)
     |> assign(:pagination, pagination)
     |> assign(:stats, stats)
     |> assign(:filters, filters)}
  end

  @impl true
  def handle_event("show_approve_modal", %{"kyc-id" => kyc_id}, socket) do
    kyc_record = Kyc.get_kyc_record!(kyc_id)
    user = Users.get_user_detail(kyc_record.user_id)

    {:noreply,
     socket
     |> assign(:show_approve_modal, true)
     |> assign(:selected_kyc, kyc_record)
     |> assign(:selected_user, user)
     |> assign(:approval_notes, "")}
  end

  @impl true
  def handle_event("close_approve_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_approve_modal, false)
     |> assign(:selected_kyc, nil)
     |> assign(:selected_user, nil)
     |> assign(:approval_notes, "")}
  end

  @impl true
  def handle_event("update_approval_notes", %{"notes" => notes}, socket) do
    {:noreply, assign(socket, :approval_notes, notes)}
  end

  @impl true
  def handle_event("approve_kyc", _params, socket) do
    kyc_record = socket.assigns.selected_kyc
    current_admin = socket.assigns.current_admin
    notes = socket.assigns.approval_notes

    case Kyc.approve_kyc(kyc_record, current_admin.id, notes) do
      {:ok, _updated_kyc} ->
        # Reload KYC list
        {kyc_records, pagination} = Kyc.list_pending_kyc_submissions(socket.assigns.filters)
        stats = Kyc.get_kyc_stats()

        {:noreply,
         socket
         |> assign(:kyc_records, kyc_records)
         |> assign(:pagination, pagination)
         |> assign(:stats, stats)
         |> assign(:show_approve_modal, false)
         |> assign(:selected_kyc, nil)
         |> assign(:selected_user, nil)
         |> assign(:approval_notes, "")
         |> put_flash(:info, "KYC record approved successfully.")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to approve KYC record.")}
    end
  end

  @impl true
  def handle_event("show_reject_modal", %{"kyc-id" => kyc_id}, socket) do
    kyc_record = Kyc.get_kyc_record!(kyc_id)
    user = Users.get_user_detail(kyc_record.user_id)

    {:noreply,
     socket
     |> assign(:show_reject_modal, true)
     |> assign(:selected_kyc, kyc_record)
     |> assign(:selected_user, user)
     |> assign(:rejection_reason, "")}
  end

  @impl true
  def handle_event("close_reject_modal", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_reject_modal, false)
     |> assign(:selected_kyc, nil)
     |> assign(:selected_user, nil)
     |> assign(:rejection_reason, "")}
  end

  @impl true
  def handle_event("update_rejection_reason", %{"reason" => reason}, socket) do
    {:noreply, assign(socket, :rejection_reason, reason)}
  end

  @impl true
  def handle_event("reject_kyc", _params, socket) do
    kyc_record = socket.assigns.selected_kyc
    current_admin = socket.assigns.current_admin
    reason = socket.assigns.rejection_reason

    case Kyc.reject_kyc(kyc_record, current_admin.id, reason) do
      {:ok, _updated_kyc} ->
        # Reload KYC list
        {kyc_records, pagination} = Kyc.list_pending_kyc_submissions(socket.assigns.filters)
        stats = Kyc.get_kyc_stats()

        {:noreply,
         socket
         |> assign(:kyc_records, kyc_records)
         |> assign(:pagination, pagination)
         |> assign(:stats, stats)
         |> assign(:show_reject_modal, false)
         |> assign(:selected_kyc, nil)
         |> assign(:selected_user, nil)
         |> assign(:rejection_reason, "")
         |> put_flash(:info, "KYC record rejected.")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to reject KYC record.")}
    end
  end

  defp format_kyc_level(level) do
    case level do
      :none -> "None"
      :basic -> "Basic"
      :standard -> "Standard"
      :enhanced -> "Enhanced"
      _ -> "Unknown"
    end
  end

  defp format_kyc_status(status) do
    case status do
      :not_started -> "Not Started"
      :pending -> "Pending"
      :in_review -> "In Review"
      :approved -> "Approved"
      :rejected -> "Rejected"
      :expired -> "Expired"
      _ -> "Unknown"
    end
  end

  defp format_date(nil), do: "-"

  defp format_date(datetime) do
    Calendar.strftime(datetime, "%Y-%m-%d %H:%M")
  end

  defp get_user_initials(email) when is_binary(email) do
    email |> String.first() |> String.upcase()
  end

  defp get_user_initials(_), do: "U"

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-4">
      <%!-- Page Header --%>
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-base-content">KYC Review Queue</h1>
          <p class="text-sm text-base-content/60 mt-1">
            Review and approve pending KYC submissions
          </p>
        </div>
      </div>
      <%!-- Stats Cards --%>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Pending Review</p>
          <p class="text-2xl font-bold text-warning"><%= @stats[:pending] || 0 %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">In Review</p>
          <p class="text-2xl font-bold text-primary"><%= @stats[:in_review] || 0 %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Approved Today</p>
          <p class="text-2xl font-bold text-success"><%= @stats[:approved_today] || 0 %></p>
        </div>

        <div class="bg-base-200 rounded p-4 border border-base-300">
          <p class="text-sm text-base-content/60 mb-1">Rejected Today</p>
          <p class="text-2xl font-bold text-error"><%= @stats[:rejected_today] || 0 %></p>
        </div>
      </div>
      <%!-- KYC Records Grid --%>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <%= if Enum.empty?(@kyc_records) do %>
          <div class="col-span-full bg-base-200 rounded border border-base-300 p-12 text-center">
            <.icon name="hero-document-check" class="size-16 text-base-content/40 mx-auto mb-4" />
            <p class="text-lg font-medium text-base-content/80">No Pending KYC Submissions</p>
            <p class="text-sm text-base-content/60 mt-2">
              All KYC submissions have been reviewed
            </p>
          </div>
        <% else %>
          <%= for kyc <- @kyc_records do %>
            <div class="bg-base-200 rounded border border-base-300 p-4 hover:shadow-lg transition-shadow">
              <%!-- Header --%>
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center space-x-3">
                  <div class="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center">
                    <span class="text-white text-lg font-medium">
                      <%= get_user_initials(kyc.submitted_first_name || kyc.submitted_last_name || "U") %>
                    </span>
                  </div>
                  <div>
                    <p class="font-medium text-base-content">
                      <%= kyc.submitted_first_name %> <%= kyc.submitted_last_name %>
                    </p>
                    <p class="text-xs text-base-content/60"><%= kyc.submitted_phone %></p>
                  </div>
                </div>
                <span class={[
                  "px-2 py-1 rounded text-xs font-medium",
                  kyc.status == :pending && "bg-warning/20 text-warning",
                  kyc.status == :in_review && "bg-primary/20 text-primary"
                ]}>
                  <%= format_kyc_status(kyc.status) %>
                </span>
              </div>
              <%!-- Details Grid --%>
              <div class="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div>
                  <p class="text-base-content/60 text-xs">KYC Level</p>
                  <p class="font-medium text-base-content"><%= format_kyc_level(kyc.level) %></p>
                </div>
                <div>
                  <p class="text-base-content/60 text-xs">Document Type</p>
                  <p class="font-medium text-base-content"><%= kyc.document_type || "-" %></p>
                </div>
                <div>
                  <p class="text-base-content/60 text-xs">Country</p>
                  <p class="font-medium text-base-content"><%= kyc.submitted_country || "-" %></p>
                </div>
                <div>
                  <p class="text-base-content/60 text-xs">Submitted</p>
                  <p class="font-medium text-base-content"><%= format_date(kyc.submitted_at) %></p>
                </div>
              </div>
              <%= if kyc.provider do %>
                <div class="mb-4 p-2 bg-base-300 rounded text-xs">
                  <p class="text-base-content/60">Provider</p>
                  <p class="font-medium text-base-content"><%= kyc.provider %></p>
                  <%= if kyc.verification_score do %>
                    <p class="text-base-content/60 mt-1">
                      Score: <span class="font-medium"><%= kyc.verification_score %></span>
                    </p>
                  <% end %>
                </div>
              <% end %>
              <%!-- Actions --%>
              <div class="flex items-center space-x-2">
                <a
                  href={~p"/kyc-review/#{kyc.id}"}
                  class="flex-1 px-3 py-2 bg-base-300 hover:bg-base-content/20 rounded text-sm font-medium text-base-content text-center transition-colors"
                >
                  <.icon name="hero-eye" class="inline size-4 mr-1" />
                  View Details
                </a>
                <button
                  phx-click="show_approve_modal"
                  phx-value-kyc-id={kyc.id}
                  class="px-3 py-2 bg-success hover:bg-success/90 text-white rounded text-sm font-medium transition-colors"
                  title="Approve"
                >
                  <.icon name="hero-check" class="size-4" />
                </button>
                <button
                  phx-click="show_reject_modal"
                  phx-value-kyc-id={kyc.id}
                  class="px-3 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors"
                  title="Reject"
                >
                  <.icon name="hero-x-mark" class="size-4" />
                </button>
              </div>
            </div>
          <% end %>
        <% end %>
      </div>
      <%!-- Pagination --%>
      <%= if @pagination[:total_pages] && @pagination[:total_pages] > 1 do %>
        <div class="flex items-center justify-between">
          <p class="text-xs text-base-content/60">
            Showing <%= ((@pagination[:page] - 1) * @pagination[:page_size]) + 1 %> to <%= min(
              @pagination[:page] * @pagination[:page_size],
              @pagination[:total_count]
            ) %> of <%= @pagination[:total_count] %> records
          </p>
          <div class="flex items-center space-x-2">
            <%= if @pagination[:page] > 1 do %>
              <a
                href={~p"/kyc-review?page=#{@pagination[:page] - 1}"}
                class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors"
              >
                Previous
              </a>
            <% end %>

            <%= for page_num <- max(1, @pagination[:page] - 2)..min(
                  @pagination[:total_pages],
                  @pagination[:page] + 2
                ) do %>
              <a
                href={~p"/kyc-review?page=#{page_num}"}
                class={[
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  page_num == @pagination[:page] &&
                    "bg-primary text-primary-content" ||
                    "bg-base-200 hover:bg-base-300 text-base-content border border-base-300"
                ]}
              >
                <%= page_num %>
              </a>
            <% end %>

            <%= if @pagination[:page] < @pagination[:total_pages] do %>
              <a
                href={~p"/kyc-review?page=#{@pagination[:page] + 1}"}
                class="px-3 py-1.5 bg-base-200 hover:bg-base-300 rounded text-xs font-medium text-base-content border border-base-300 transition-colors"
              >
                Next
              </a>
            <% end %>
          </div>
        </div>
      <% end %>
    </div>
    <%!-- Approve KYC Modal --%>
    <%= if @show_approve_modal && @selected_kyc do %>
      <div
        class="fixed inset-0 z-50 overflow-y-auto"
        aria-labelledby="approve-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div
            class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity"
            phx-click="close_approve_modal"
          >
          </div>
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-base-content">Approve KYC Submission</h3>
              <button
                phx-click="close_approve_modal"
                class="p-1 hover:bg-base-300 rounded transition-colors"
              >
                <.icon name="hero-x-mark" class="size-5 text-base-content/60" />
              </button>
            </div>

            <div class="mb-6">
              <div class="flex items-center space-x-3 mb-4">
                <div class="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center">
                  <.icon name="hero-check-circle" class="size-8 text-success" />
                </div>
                <div>
                  <p class="text-base font-medium text-base-content">
                    <%= @selected_kyc.submitted_first_name %> <%= @selected_kyc.submitted_last_name %>
                  </p>
                  <%= if @selected_user do %>
                    <p class="text-sm text-base-content/60"><%= @selected_user.email %></p>
                  <% end %>
                </div>
              </div>

              <div class="bg-success/10 border border-success/20 rounded p-4 mb-4">
                <p class="text-sm text-base-content/80 font-medium mb-2">
                  This will approve the KYC submission and:
                </p>
                <ul class="space-y-1 text-xs text-base-content/70">
                  <li>• Mark KYC status as approved</li>
                  <li>
                    • Upgrade user tier based on KYC level (<%= format_kyc_level(
                      @selected_kyc.level
                    ) %>)
                  </li>
                  <li>• Log the approval in audit trail</li>
                  <li>• Notify the user via email</li>
                </ul>
              </div>

              <div>
                <label class="block text-sm font-medium text-base-content mb-2">
                  Notes (optional)
                </label>
                <textarea
                  phx-change="update_approval_notes"
                  name="notes"
                  rows="3"
                  placeholder="Add any notes about this approval..."
                  class="w-full px-3 py-2 bg-base-300 border border-base-content/20 rounded text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary"
                ><%= @approval_notes %></textarea>
              </div>
            </div>

            <div class="flex items-center justify-end space-x-3">
              <button
                phx-click="close_approve_modal"
                class="px-4 py-2 bg-base-300 hover:bg-base-content/20 rounded text-sm font-medium text-base-content transition-colors"
              >
                Cancel
              </button>
              <button
                phx-click="approve_kyc"
                class="px-4 py-2 bg-success hover:bg-success/90 text-white rounded text-sm font-medium transition-colors"
              >
                Approve KYC
              </button>
            </div>
          </div>
        </div>
      </div>
    <% end %>
    <%!-- Reject KYC Modal --%>
    <%= if @show_reject_modal && @selected_kyc do %>
      <div
        class="fixed inset-0 z-50 overflow-y-auto"
        aria-labelledby="reject-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div
            class="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 transition-opacity"
            phx-click="close_reject_modal"
          >
          </div>
          <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
            &#8203;
          </span>
          <div class="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-base-content">Reject KYC Submission</h3>
              <button
                phx-click="close_reject_modal"
                class="p-1 hover:bg-base-300 rounded transition-colors"
              >
                <.icon name="hero-x-mark" class="size-5 text-base-content/60" />
              </button>
            </div>

            <div class="mb-6">
              <div class="flex items-center space-x-3 mb-4">
                <div class="w-12 h-12 bg-error/20 rounded-full flex items-center justify-center">
                  <.icon name="hero-x-circle" class="size-8 text-error" />
                </div>
                <div>
                  <p class="text-base font-medium text-base-content">
                    <%= @selected_kyc.submitted_first_name %> <%= @selected_kyc.submitted_last_name %>
                  </p>
                  <%= if @selected_user do %>
                    <p class="text-sm text-base-content/60"><%= @selected_user.email %></p>
                  <% end %>
                </div>
              </div>

              <div class="bg-error/10 border border-error/20 rounded p-4 mb-4">
                <p class="text-sm text-base-content/80">
                  Are you sure you want to reject this KYC submission?
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-base-content mb-2">
                  Rejection Reason (required)
                </label>
                <textarea
                  phx-change="update_rejection_reason"
                  name="reason"
                  rows="3"
                  placeholder="Enter the reason for rejecting this KYC submission..."
                  class="w-full px-3 py-2 bg-base-300 border border-base-content/20 rounded text-sm text-base-content placeholder:text-base-content/40 focus:outline-none focus:ring-2 focus:ring-primary"
                ><%= @rejection_reason %></textarea>
              </div>
            </div>

            <div class="flex items-center justify-end space-x-3">
              <button
                phx-click="close_reject_modal"
                class="px-4 py-2 bg-base-300 hover:bg-base-content/20 rounded text-sm font-medium text-base-content transition-colors"
              >
                Cancel
              </button>
              <button
                phx-click="reject_kyc"
                disabled={@rejection_reason == ""}
                class="px-4 py-2 bg-error hover:bg-error/90 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject KYC
              </button>
            </div>
          </div>
        </div>
      </div>
    <% end %>
    """
  end
end
