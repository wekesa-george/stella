defmodule StellaAdminWeb.PageController do
  use StellaAdminWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
