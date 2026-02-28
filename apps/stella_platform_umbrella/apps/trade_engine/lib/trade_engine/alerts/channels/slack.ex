defmodule TradeEngine.Alerts.Channels.Slack do
  @moduledoc """
  Slack webhook adapter for alert notifications.
  Posts formatted alerts using Slack Block Kit.
  """

  require Logger

  @doc """
  Send an alert to the configured Slack webhook.
  Returns `{:ok, :sent}` or `{:error, reason}`. Never raises.
  """
  def send_alert(alert) do
    case webhook_url() do
      nil ->
        Logger.debug("[Slack] No webhook URL configured — skipping")
        {:error, :no_webhook_url}

      url ->
        payload = build_payload(alert)

        case HTTPoison.post(url, Jason.encode!(payload), [{"content-type", "application/json"}]) do
          {:ok, %HTTPoison.Response{status_code: 200}} ->
            Logger.debug("[Slack] Alert sent: #{Map.get(alert, :title, "Alert")}")
            {:ok, :sent}

          {:ok, %HTTPoison.Response{status_code: code, body: body}} ->
            Logger.warning("[Slack] Webhook returned #{code}: #{body}")
            {:error, {:http_error, code}}

          {:error, %HTTPoison.Error{reason: reason}} ->
            Logger.warning("[Slack] Webhook request failed: #{inspect(reason)}")
            {:error, reason}
        end
    end
  rescue
    e ->
      Logger.warning("[Slack] Unexpected error: #{Exception.message(e)}")
      {:error, :exception}
  end

  # --- Private ---

  defp build_payload(alert) do
    severity = Map.get(alert, :severity, "info")
    title = Map.get(alert, :title, "Alert")
    message = Map.get(alert, :message, "")
    category = Map.get(alert, :category, "system")
    source = Map.get(alert, :source, "unknown")
    metadata = Map.get(alert, :metadata, %{})

    color = severity_color(severity)
    emoji = severity_emoji(severity)
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()

    fields =
      [
        %{title: "Category", value: category, short: true},
        %{title: "Severity", value: String.upcase(severity), short: true},
        %{title: "Source", value: source, short: true},
        %{title: "Time", value: timestamp, short: true}
      ] ++ metadata_fields(metadata)

    %{
      attachments: [
        %{
          color: color,
          blocks: [
            %{
              type: "header",
              text: %{type: "plain_text", text: "#{emoji} #{title}", emoji: true}
            },
            %{
              type: "section",
              text: %{type: "mrkdwn", text: message}
            },
            %{
              type: "section",
              fields:
                Enum.map(fields, fn f ->
                  %{type: "mrkdwn", text: "*#{f.title}:*\n#{f.value}"}
                end)
            }
          ]
        }
      ]
    }
  end

  defp metadata_fields(metadata) when map_size(metadata) == 0, do: []

  defp metadata_fields(metadata) do
    metadata
    |> Enum.take(4)
    |> Enum.map(fn {k, v} ->
      %{title: to_string(k), value: to_string(v), short: true}
    end)
  end

  defp severity_color("critical"), do: "#DC2626"
  defp severity_color("warning"), do: "#F59E0B"
  defp severity_color(_), do: "#6B7280"

  defp severity_emoji("critical"), do: ":rotating_light:"
  defp severity_emoji("warning"), do: ":warning:"
  defp severity_emoji(_), do: ":information_source:"

  defp webhook_url do
    Application.get_env(:trade_engine, :slack_webhook_url)
  end
end
