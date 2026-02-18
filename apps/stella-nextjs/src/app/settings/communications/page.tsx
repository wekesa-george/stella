"use client";

import { useState } from "react";

export default function CommunicationsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState("kyc_approved");
  const [dirty, setDirty] = useState(false);

  const templates = [
    { key: "kyc_approved", name: "KYC Approved", sub: "Sent when user verification succeeds" },
    { key: "kyc_declined", name: "KYC Declined", sub: "Sent when verification is rejected" },
    { key: "kyc_resubmit", name: "KYC Re-Submit", sub: "Sent when re-verification is required" },
    { key: "bot_stopped", name: "Bot Stopped", sub: "Sent when a user's bot is halted" },
    { key: "payment_failed", name: "Payment Failed", sub: "Billing failure notification" },
    { key: "tier_upgraded", name: "Tier Upgraded", sub: "Subscription upgrade confirmation" },
    { key: "welcome", name: "Welcome", sub: "Sent on account creation" },
    { key: "withdrawal", name: "Withdrawal Processed", sub: "Funds withdrawal confirmation" },
  ];

  const [b, setB] = useState({
    senderName: "Stella",
    senderEmail: "noreply@stella.io",
    supportEmail: "support@stella.io",
  });

  const set = (k: string, v: any) => {
    setB((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Communications & Branding</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Email templates, sender configuration, and platform branding settings.
        </div>
      </div>

      {/* Email Sender */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Email Sender</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <Field label="Sender Name">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={b.senderName}
                onChange={(e) => set("senderName", e.target.value)}
              />
            </Field>
            <Field label="Sender Email">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={b.senderEmail}
                onChange={(e) => set("senderEmail", e.target.value)}
              />
            </Field>
            <Field label="Support Email">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                value={b.supportEmail}
                onChange={(e) => set("supportEmail", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Email Templates</div>
        </div>
        <div className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
            {/* Template list */}
            <div className="border-r border-[#1e2d40] lg:border-b-0 border-b p-3 flex flex-col gap-1.5">
              {templates.map((t) => (
                <div
                  key={t.key}
                  className={`bg-[#131920] border rounded-sm p-2.5 cursor-pointer transition-all ${
                    selectedTemplate === t.key
                      ? "border-[rgba(0,229,160,0.35)]"
                      : "border-[#1e2d40] hover:border-[#253550]"
                  }`}
                  onClick={() => setSelectedTemplate(t.key)}
                >
                  <div className="font-mono text-[10px] font-semibold text-[#e8edf3] mb-0.5">{t.name}</div>
                  <div className="font-mono text-[9px] text-[#5a7090]">{t.sub}</div>
                </div>
              ))}
            </div>

            {/* Template editor */}
            <div className="p-4 flex flex-col gap-3">
              <Field label="Subject Line">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  defaultValue="Your Stella {action} confirmation"
                />
              </Field>
              <Field label="Template Body (Markdown + variables supported)">
                <textarea
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550] resize-y leading-relaxed"
                  rows={10}
                  defaultValue={`Hi {{user.first_name}},

Your account verification has been {{status}}.

{{#if approved}}
You can now activate your trading bots and start growing your portfolio.
{{/if}}

If you have questions, contact us at ${b.supportEmail}.

— The Stella Team`}
                />
              </Field>
              <div className="font-mono text-[9px] text-[#5a7090]">
                Available variables: {`{{user.first_name}} {{user.email}} {{status}} {{support_email}} {{date}}`}
              </div>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all">
                  Send Test Email
                </button>
                <button className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] flex items-center gap-1.5">{label}</div>
      {children}
      {hint && <div className="font-mono text-[9px] text-[#3a5068]">{hint}</div>}
    </div>
  );
}
