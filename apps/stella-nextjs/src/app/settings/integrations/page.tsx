"use client";

const WEBHOOK_DATA = [
  { url: "https://hooks.slack.com/services/T0••••/B0••••/x••••", events: ["platform.alert", "bot.kill"], active: true },
  { url: "https://api.pagerduty.com/v2/enqueue/••••••••", events: ["platform.alert.critical"], active: true },
  { url: "https://client-api.example.com/stella/events", events: ["kyc.approved", "kyc.declined", "bot.started", "bot.stopped"], active: true },
  { url: "https://app.eu.xero.com/api.xro/2.0/webhook/••••", events: ["billing.invoice", "billing.payment"], active: false },
];

export default function IntegrationsPage() {
  const integrations = [
    { name: "Xero", icon: "📊", category: "Accounting", status: "connected", desc: "Sync platform fee invoices to Xero automatically." },
    { name: "Slack", icon: "💬", category: "Alerting", status: "connected", desc: "Ops alerts routed to configured Slack channels." },
    { name: "PagerDuty", icon: "🚨", category: "Incident", status: "connected", desc: "Critical incidents create PagerDuty pages automatically." },
    { name: "Mixpanel", icon: "📈", category: "Analytics", status: "connected", desc: "User events forwarded to Mixpanel for product analytics." },
    { name: "Intercom", icon: "💭", category: "Support", status: "disconnected", desc: "In-app support chat and user communication." },
    { name: "HubSpot", icon: "🏷", category: "CRM", status: "disconnected", desc: "Sync user signups and subscription events to CRM." },
  ];

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Integrations</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Third-party integrations and outbound webhook management.
        </div>
      </div>

      {/* Integrations grid */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Third-Party Integrations</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {integrations.map((i) => {
              const connected = i.status === "connected";
              return (
                <div
                  key={i.name}
                  className="bg-[#131920] border border-[#1e2d40] rounded p-3.5 flex flex-col gap-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[20px]">{i.icon}</span>
                    <div className="flex-1">
                      <div className="font-mono text-[11px] font-semibold text-[#e8edf3]">{i.name}</div>
                      <div className="font-mono text-[8px] text-[#5a7090] uppercase tracking-wider">{i.category}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                        connected
                          ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                          : "bg-[#1a2230] text-[#8fa3b8] border border-[#253550]"
                      }`}
                    >
                      {i.status}
                    </span>
                  </div>
                  <div className="font-sans text-[11px] text-[#5a7090] leading-relaxed">{i.desc}</div>
                  <button
                    className={`px-3 py-1.5 rounded border font-mono text-[9px] font-semibold uppercase tracking-wide flex items-center justify-center transition-all ${
                      connected
                        ? "border-[#1e2d40] bg-transparent text-[#8fa3b8] hover:bg-[#1a2230] hover:text-[#e8edf3]"
                        : "bg-[rgba(255,215,0,0.10)] text-[#FFD700] border-[rgba(255,215,0,0.3)] hover:bg-[#FFD700] hover:text-black"
                    }`}
                  >
                    {connected ? "Configure" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Outbound webhooks */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Outbound Webhooks</div>
          <button className="px-3 py-1.5 rounded border bg-[rgba(255,215,0,0.10)] text-[#FFD700] border-[rgba(255,215,0,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#FFD700] hover:text-black transition-all">
            + Add Webhook
          </button>
        </div>
        <div>
          {WEBHOOK_DATA.map((w, i) => (
            <div key={i} className="px-3.5 py-3 border-b border-[#1e2d40] last:border-b-0 grid grid-cols-[1fr_auto] gap-3 items-start">
              <div>
                <div className="font-mono text-[10px] text-[#3d9df3] break-all">{w.url}</div>
                <div className="flex gap-1 flex-wrap mt-1.5">
                  {w.events.map((e) => (
                    <span
                      key={e}
                      className="px-2 py-0.5 rounded-sm bg-[#1a2230] text-[#8fa3b8] border border-[#253550] font-mono text-[8px]"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <span
                  className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide ${
                    w.active
                      ? "bg-[rgba(0,229,160,0.10)] text-[#00e5a0]"
                      : "bg-[#1a2230] text-[#8fa3b8] border border-[#253550]"
                  }`}
                >
                  {w.active ? "active" : "inactive"}
                </span>
                <div className="flex gap-1.5">
                  <button className="px-2 py-0.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                    Test
                  </button>
                  <button className="px-2 py-0.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                    Edit
                  </button>
                  <button className="px-2 py-0.5 rounded border bg-[rgba(255,71,87,0.10)] text-[#ff4757] border-[rgba(255,71,87,0.3)] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3.5 py-2.5 border-t border-[#1e2d40] font-mono text-[9px] text-[#5a7090] flex justify-between items-center">
          <span>All webhooks are signed with HMAC-SHA256. Verify the X-Stella-Signature header on your endpoint.</span>
          <button className="px-2 py-1 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
            Rotate Signing Key
          </button>
        </div>
      </div>
    </div>
  );
}
