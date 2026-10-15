defmodule StellaAdminWeb.Router do
  use StellaAdminWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {StellaAdminWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug StellaAdminWeb.Plugs.LoadAdminUser
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :require_admin_auth do
    plug StellaAdminWeb.Plugs.RequireAdminAuth
  end

  scope "/auth", StellaAdminWeb do
    pipe_through :browser

    get "/sign-in", AuthController, :sign_in
    get "/callback", AuthController, :callback
    get "/sign-out", AuthController, :sign_out
  end

  scope "/", StellaAdminWeb do
    pipe_through :browser
    pipe_through :require_admin_auth

    live_session :admin,
      layout: {StellaAdminWeb.Layouts, :admin},
      on_mount: {StellaAdminWeb.LiveAuth, :require_admin} do
      live "/", DashboardLive
      live "/users", UsersLive
      live "/users/:id", UserDetailLive
      live "/kyc-review", KycReviewLive
      live "/kyc-review/:id", KycDetailLive
      live "/trading", TradingLive
      live "/finance", FinanceLive
      live "/content", ContentLive
      live "/analytics", AnalyticsLive
      live "/support", SupportLive
      live "/observability", ObservabilityLive
      live "/settings", SettingsLive
      live "/system/admins", AdminUsersLive
      live "/system/admins/new", InviteAdminLive
      live "/system/admins/:id", AdminUserDetailLive
    end
  end

  # API routes
  scope "/api", StellaAdminWeb.Api do
    pipe_through :api

    post "/user-webhooks", WebhookController, :user_webhooks
    post "/admin-webhooks", WebhookController, :admin_webhooks
  end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:stella_admin, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: StellaAdminWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
