defmodule StellaAdminWeb.KycDetailLive do
  use StellaAdminWeb, :live_view
  alias StellaAdmin.Kyc

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    case Kyc.get_kyc_detail(id) do
      nil ->
        {:ok,
         socket
         |> put_flash(:error, "KYC record not found")
         |> push_navigate(to: ~p"/kyc-review")}

      %{kyc_record: kyc_record, user: user} ->
        {:ok,
         socket
         |> assign(:page_title, "KYC Detail")
         |> assign(:kyc_record, kyc_record)
         |> assign(:user, user)
         |> assign(:show_approve_modal, false)
         |> assign(:show_reject_modal, false)
         |> assign(:approve_notes, "")
         |> assign(:reject_reason, "")
         |> assign(:processing, false)}
    end
  end

  @impl true
  def handle_event("show_approve_modal", _params, socket) do
    {:noreply, assign(socket, :show_approve_modal, true)}
  end

  def handle_event("hide_approve_modal", _params, socket) do
    {:noreply, assign(socket, show_approve_modal: false, approve_notes: "")}
  end

  def handle_event("show_reject_modal", _params, socket) do
    {:noreply, assign(socket, :show_reject_modal, true)}
  end

  def handle_event("hide_reject_modal", _params, socket) do
    {:noreply, assign(socket, show_reject_modal: false, reject_reason: "")}
  end

  def handle_event("update_approve_notes", %{"notes" => notes}, socket) do
    {:noreply, assign(socket, :approve_notes, notes)}
  end

  def handle_event("update_reject_reason", %{"reason" => reason}, socket) do
    {:noreply, assign(socket, :reject_reason, reason)}
  end

  def handle_event("approve_kyc", _params, socket) do
    kyc_record = socket.assigns.kyc_record
    admin_user = socket.assigns.current_admin_user
    notes = socket.assigns.approve_notes

    socket = assign(socket, :processing, true)

    case Kyc.approve_kyc(kyc_record, admin_user.id, notes) do
      {:ok, updated_kyc} ->
        {:noreply,
         socket
         |> assign(:kyc_record, updated_kyc)
         |> assign(:processing, false)
         |> assign(:show_approve_modal, false)
         |> put_flash(:info, "KYC record approved successfully")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> assign(:processing, false)
         |> put_flash(:error, "Failed to approve KYC record")}
    end
  end

  def handle_event("reject_kyc", _params, socket) do
    kyc_record = socket.assigns.kyc_record
    admin_user = socket.assigns.current_admin_user
    reason = socket.assigns.reject_reason

    if String.trim(reason) == "" do
      {:noreply, put_flash(socket, :error, "Rejection reason is required")}
    else
      socket = assign(socket, :processing, true)

      case Kyc.reject_kyc(kyc_record, admin_user.id, reason) do
        {:ok, updated_kyc} ->
          {:noreply,
           socket
           |> assign(:kyc_record, updated_kyc)
           |> assign(:processing, false)
           |> assign(:show_reject_modal, false)
           |> put_flash(:info, "KYC record rejected")}

        {:error, _changeset} ->
          {:noreply,
           socket
           |> assign(:processing, false)
           |> put_flash(:error, "Failed to reject KYC record")}
      end
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="h-full overflow-y-auto pb-16">
      <!-- Header -->
      <div class="border-b border-white/[0.08] bg-[#13111C]/95 backdrop-blur-sm sticky top-0 z-10">
        <div class="px-8 py-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <.link navigate={~p"/kyc-review"} class="text-white/60 hover:text-white/90 transition-colors">
                <.icon name="hero-arrow-left" class="size-6" />
              </.link>
              <div>
                <h1 class="text-2xl font-medium text-white/90">KYC Verification</h1>
                <p class="text-sm text-white/50 mt-0.5">
                  Review and verify user identity documents
                </p>
              </div>
            </div>

            <div :if={@kyc_record.status in [:pending, :in_review]} class="flex items-center space-x-3">
              <button
                phx-click="show_reject_modal"
                class="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
              >
                Reject
              </button>
              <button
                phx-click="show_approve_modal"
                class="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/90 to-purple-600/90 text-white hover:from-purple-500 hover:to-purple-600 transition-all text-sm font-medium"
              >
                Approve
              </button>
            </div>

            <div :if={@kyc_record.status == :approved} class="px-4 py-2 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 text-sm font-medium">
              <div class="flex items-center space-x-2">
                <.icon name="hero-check-circle" class="size-4" />
                <span>Approved</span>
              </div>
            </div>

            <div :if={@kyc_record.status == :rejected} class="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-medium">
              <div class="flex items-center space-x-2">
                <.icon name="hero-x-circle" class="size-4" />
                <span>Rejected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="px-8 py-6 space-y-6">
        <!-- Status Bar -->
        <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
          <div class="grid grid-cols-5 gap-4">
            <div>
              <div class="text-xs text-white/40 mb-1">Status</div>
              <div class="flex items-center space-x-2">
                <%= case @kyc_record.status do %>
                  <% :pending -> %>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                      Pending
                    </span>
                  <% :in_review -> %>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                      In Review
                    </span>
                  <% :approved -> %>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30">
                      Approved
                    </span>
                  <% :rejected -> %>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                      Rejected
                    </span>
                  <% _ -> %>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-white/40 border border-white/10">
                      Unknown
                    </span>
                <% end %>
              </div>
            </div>

            <div>
              <div class="text-xs text-white/40 mb-1">Level</div>
              <div class="text-sm font-medium text-white/90 capitalize"><%= @kyc_record.level %></div>
            </div>

            <div>
              <div class="text-xs text-white/40 mb-1">Provider</div>
              <div class="text-sm font-medium text-white/90"><%= @kyc_record.provider %></div>
            </div>

            <div>
              <div class="text-xs text-white/40 mb-1">Submitted</div>
              <div class="text-sm font-medium text-white/90">
                <%= if @kyc_record.submitted_at do %>
                  <%= Calendar.strftime(@kyc_record.submitted_at, "%b %d, %Y") %>
                <% else %>
                  -
                <% end %>
              </div>
            </div>

            <div>
              <div class="text-xs text-white/40 mb-1">Risk Rating</div>
              <div class="text-sm font-medium text-white/90 capitalize">
                <%= @kyc_record.risk_rating || "-" %>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <!-- Left Column -->
          <div class="space-y-6">
            <!-- User Information -->
            <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-user" class="size-5 mr-2 text-purple-400" />
                User Information
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Email</span>
                  <span class="text-sm font-medium text-white/90"><%= @user.email %></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Username</span>
                  <span class="text-sm font-medium text-white/90"><%= @user.username || "-" %></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">User ID</span>
                  <span class="text-xs font-mono text-white/60"><%= @user.id %></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Current Tier</span>
                  <span class="text-sm font-medium text-purple-400 capitalize">
                    <%= String.replace(to_string(@user.tier), "_", " ") %>
                  </span>
                </div>
                <div class="flex justify-between items-center py-2">
                  <span class="text-sm text-white/40">Account Status</span>
                  <span class={"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium #{status_class(@user.status)}"}>
                    <%= String.capitalize(to_string(@user.status)) %>
                  </span>
                </div>
              </div>
            </div>

            <!-- Submitted Information -->
            <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-document-text" class="size-5 mr-2 text-purple-400" />
                Submitted Information
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Full Name</span>
                  <span class="text-sm font-medium text-white/90">
                    <%= @kyc_record.submitted_first_name %> <%= @kyc_record.submitted_last_name %>
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Phone</span>
                  <span class="text-sm font-medium text-white/90"><%= @kyc_record.submitted_phone %></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Country</span>
                  <span class="text-sm font-medium text-white/90"><%= @kyc_record.submitted_country %></span>
                </div>
                <div class="flex justify-between items-center py-2">
                  <span class="text-sm text-white/40">City</span>
                  <span class="text-sm font-medium text-white/90"><%= @kyc_record.submitted_city %></span>
                </div>
              </div>
            </div>

            <!-- Verified Information -->
            <div
              :if={@kyc_record.verified_name || @kyc_record.verified_dob || @kyc_record.verified_address}
              class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6"
            >
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-check-badge" class="size-5 mr-2 text-green-400" />
                Verified Information
              </h2>
              <div class="space-y-4">
                <div :if={@kyc_record.verified_name} class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Verified Name</span>
                  <span class="text-sm font-medium text-white/90"><%= @kyc_record.verified_name %></span>
                </div>
                <div :if={@kyc_record.verified_dob} class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Date of Birth</span>
                  <span class="text-sm font-medium text-white/90">
                    <%= Calendar.strftime(@kyc_record.verified_dob, "%b %d, %Y") %>
                  </span>
                </div>
                <div :if={@kyc_record.verified_address} class="py-2">
                  <div class="text-sm text-white/40 mb-2">Verified Address</div>
                  <div class="text-sm font-medium text-white/90">
                    <%= if @kyc_record.verified_address["street"] do %>
                      <%= @kyc_record.verified_address["street"] %><br />
                    <% end %>
                    <%= @kyc_record.verified_address["city"] || "" %>
                    <%= if @kyc_record.verified_address["province"] do %>
                      , <%= @kyc_record.verified_address["province"] %>
                    <% end %>
                    <%= @kyc_record.verified_address["postal_code"] || "" %><br />
                    <%= @kyc_record.verified_address["country"] || "" %>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column -->
          <div class="space-y-6">
            <!-- Document Information -->
            <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-identification" class="size-5 mr-2 text-purple-400" />
                Document Information
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Document Type</span>
                  <span class="text-sm font-medium text-white/90 capitalize">
                    <%= String.replace(@kyc_record.document_type, "_", " ") %>
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Document Country</span>
                  <span class="text-sm font-medium text-white/90"><%= @kyc_record.document_country %></span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Document Number</span>
                  <span class="text-sm font-mono text-white/90"><%= @kyc_record.document_number %></span>
                </div>
                <div class="flex justify-between items-center py-2">
                  <span class="text-sm text-white/40">Expiry Date</span>
                  <span class="text-sm font-medium text-white/90">
                    <%= Calendar.strftime(@kyc_record.document_expiry, "%b %d, %Y") %>
                  </span>
                </div>
              </div>
            </div>

            <!-- Documents -->
            <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-photo" class="size-5 mr-2 text-purple-400" />
                Documents
              </h2>
              <div class="space-y-3">
                <div class="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <div class="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <.icon name="hero-document" class="size-5 text-purple-400" />
                      </div>
                      <div>
                        <div class="text-sm font-medium text-white/90">Identity Document</div>
                        <div class="text-xs text-white/40 mt-0.5">
                          <%= Path.basename(@kyc_record.document_path) %>
                        </div>
                      </div>
                    </div>
                    <button class="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/90 transition-all text-xs font-medium">
                      View
                    </button>
                  </div>
                </div>

                <div :if={@kyc_record.passport_photo_path} class="p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <div class="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <.icon name="hero-camera" class="size-5 text-purple-400" />
                      </div>
                      <div>
                        <div class="text-sm font-medium text-white/90">Selfie Photo</div>
                        <div class="text-xs text-white/40 mt-0.5">
                          <%= Path.basename(@kyc_record.passport_photo_path) %>
                        </div>
                      </div>
                    </div>
                    <button class="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/90 transition-all text-xs font-medium">
                      View
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Verification Results -->
            <div class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-shield-check" class="size-5 mr-2 text-purple-400" />
                Verification Results
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Overall Score</span>
                  <span class="text-sm font-medium text-white/90">
                    <%= Decimal.mult(@kyc_record.verification_score, 100) |> Decimal.round(1) %>%
                  </span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Risk Rating</span>
                  <span class="text-sm font-medium text-white/90 capitalize">
                    <%= @kyc_record.risk_rating %>
                  </span>
                </div>

                <%= if @kyc_record.validation_details do %>
                  <%= if @kyc_record.validation_details["face_match_score"] do %>
                    <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                      <span class="text-sm text-white/40">Face Match</span>
                      <span class="text-sm font-medium text-white/90">
                        <%= trunc(@kyc_record.validation_details["face_match_score"] * 100) %>%
                      </span>
                    </div>
                  <% end %>

                  <%= if @kyc_record.validation_details["document_authenticity"] do %>
                    <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                      <span class="text-sm text-white/40">Document Authenticity</span>
                      <span class={"text-sm font-medium capitalize #{if @kyc_record.validation_details["document_authenticity"] == "verified", do: "text-green-400", else: "text-yellow-400"}"}>
                        <%= @kyc_record.validation_details["document_authenticity"] %>
                      </span>
                    </div>
                  <% end %>

                  <%= if @kyc_record.validation_details["liveness_check"] do %>
                    <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                      <span class="text-sm text-white/40">Liveness Check</span>
                      <span class={"text-sm font-medium capitalize #{if @kyc_record.validation_details["liveness_check"] == "passed", do: "text-green-400", else: "text-yellow-400"}"}>
                        <%= @kyc_record.validation_details["liveness_check"] %>
                      </span>
                    </div>
                  <% end %>

                  <%= if @kyc_record.validation_details["pep_check"] do %>
                    <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                      <span class="text-sm text-white/40">PEP Check</span>
                      <span class={"text-sm font-medium capitalize #{if @kyc_record.validation_details["pep_check"] == "clear", do: "text-green-400", else: "text-red-400"}"}>
                        <%= @kyc_record.validation_details["pep_check"] %>
                      </span>
                    </div>
                  <% end %>

                  <%= if @kyc_record.validation_details["sanctions_check"] do %>
                    <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                      <span class="text-sm text-white/40">Sanctions Check</span>
                      <span class={"text-sm font-medium capitalize #{if @kyc_record.validation_details["sanctions_check"] == "clear", do: "text-green-400", else: "text-red-400"}"}>
                        <%= @kyc_record.validation_details["sanctions_check"] %>
                      </span>
                    </div>
                  <% end %>

                  <%= if @kyc_record.validation_details["quality_issues"] do %>
                    <div class="py-2">
                      <div class="text-sm text-white/40 mb-2">Quality Issues</div>
                      <div class="space-y-1">
                        <%= for issue <- @kyc_record.validation_details["quality_issues"] do %>
                          <div class="text-xs text-red-400 flex items-center">
                            <.icon name="hero-exclamation-circle" class="size-3 mr-1.5" />
                            <%= String.replace(issue, "_", " ") |> String.capitalize() %>
                          </div>
                        <% end %>
                      </div>
                    </div>
                  <% end %>
                <% end %>
              </div>
            </div>

            <!-- Review History -->
            <div
              :if={@kyc_record.status in [:approved, :rejected]}
              class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6"
            >
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-clock" class="size-5 mr-2 text-purple-400" />
                Review History
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center py-2 border-b border-white/[0.05]">
                  <span class="text-sm text-white/40">Reviewed At</span>
                  <span class="text-sm font-medium text-white/90">
                    <%= if @kyc_record.reviewed_at do %>
                      <%= Calendar.strftime(@kyc_record.reviewed_at, "%b %d, %Y %I:%M %p") %>
                    <% else %>
                      -
                    <% end %>
                  </span>
                </div>

                <%= if @kyc_record.status == :rejected && @kyc_record.rejection_reason do %>
                  <div class="py-2">
                    <div class="text-sm text-white/40 mb-2">Rejection Reason</div>
                    <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                      <%= @kyc_record.rejection_reason %>
                    </div>
                  </div>
                <% end %>

                <%= if @kyc_record.status == :approved && @kyc_record.notes do %>
                  <div class="py-2">
                    <div class="text-sm text-white/40 mb-2">Review Notes</div>
                    <div class="p-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-sm text-white/70">
                      <%= @kyc_record.notes %>
                    </div>
                  </div>
                <% end %>
              </div>
            </div>

            <!-- Notes -->
            <div :if={@kyc_record.notes && @kyc_record.status in [:pending, :in_review]} class="rounded-xl border border-white/[0.08] bg-gradient-to-br from-[#1A1625] to-[#13111C] p-6">
              <h2 class="text-lg font-medium text-white/90 mb-4 flex items-center">
                <.icon name="hero-chat-bubble-left-ellipsis" class="size-5 mr-2 text-purple-400" />
                Notes
              </h2>
              <div class="p-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-sm text-white/70">
                <%= @kyc_record.notes %>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Approve Modal -->
      <div
        :if={@show_approve_modal}
        class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        phx-click="hide_approve_modal"
      >
        <div class="bg-[#13111C] rounded-xl border border-white/[0.08] w-full max-w-md p-6" phx-click="stop_propagation">
          <h3 class="text-lg font-medium text-white/90 mb-4">Approve KYC Verification</h3>

          <div class="mb-4">
            <label class="block text-sm font-medium text-white/60 mb-2">
              Approval Notes (Optional)
            </label>
            <textarea
              phx-change="update_approve_notes"
              name="notes"
              rows="4"
              class="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.08] rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
              placeholder="Add any relevant notes about this approval..."
            ><%= @approve_notes %></textarea>
          </div>

          <div class="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mb-4">
            <div class="flex items-start space-x-2">
              <.icon name="hero-exclamation-triangle" class="size-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div class="text-sm text-yellow-400">
                <p class="font-medium mb-1">Automatic Tier Upgrade</p>
                <p class="text-yellow-400/80">
                  This user's tier may be automatically upgraded based on their KYC level.
                </p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end space-x-3">
            <button
              phx-click="hide_approve_modal"
              disabled={@processing}
              class="px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/90 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              phx-click="approve_kyc"
              disabled={@processing}
              class="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/90 to-purple-600/90 text-white hover:from-purple-500 hover:to-purple-600 transition-all disabled:opacity-50"
            >
              <%= if @processing, do: "Processing...", else: "Approve" %>
            </button>
          </div>
        </div>
      </div>

      <!-- Reject Modal -->
      <div
        :if={@show_reject_modal}
        class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        phx-click="hide_reject_modal"
      >
        <div class="bg-[#13111C] rounded-xl border border-white/[0.08] w-full max-w-md p-6" phx-click="stop_propagation">
          <h3 class="text-lg font-medium text-white/90 mb-4">Reject KYC Verification</h3>

          <div class="mb-4">
            <label class="block text-sm font-medium text-white/60 mb-2">
              Rejection Reason <span class="text-red-400">*</span>
            </label>
            <textarea
              phx-change="update_reject_reason"
              name="reason"
              rows="4"
              class="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.08] rounded-lg text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-transparent"
              placeholder="Explain why this KYC verification is being rejected..."
            ><%= @reject_reason %></textarea>
            <p class="mt-1 text-xs text-white/40">
              This message will be visible to the user. Please be clear and professional.
            </p>
          </div>

          <div class="flex items-center justify-end space-x-3">
            <button
              phx-click="hide_reject_modal"
              disabled={@processing}
              class="px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/90 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              phx-click="reject_kyc"
              disabled={@processing}
              class="px-4 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <%= if @processing, do: "Processing...", else: "Reject" %>
            </button>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp status_class(:active), do: "bg-green-500/10 text-green-400 border border-green-500/30"
  defp status_class(:suspended), do: "bg-red-500/10 text-red-400 border border-red-500/30"
  defp status_class(:pending), do: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
  defp status_class(:banned), do: "bg-red-500/10 text-red-400 border border-red-500/30"

  defp status_class(:deactivated),
    do: "bg-white/5 text-white/40 border border-white/10"

  defp status_class(_), do: "bg-white/5 text-white/40 border border-white/10"
end
