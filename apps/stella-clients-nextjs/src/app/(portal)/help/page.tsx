"use client";

import { useState } from "react";

const C = {
  bg: "#0B0D11",
  surface: "#12151C",
  surfaceAlt: "#0E111A",
  surfaceHov: "#161B26",
  border: "#1C2338",
  borderSub: "#161B28",
  green: "#00E5A0",
  greenDim: "#00E5A012",
  greenMid: "#00E5A035",
  red: "#F04F59",
  redDim: "#F04F5912",
  redMid: "#F04F5935",
  amber: "#F59E0B",
  amberDim: "#F59E0B12",
  amberMid: "#F59E0B35",
  blue: "#3B82F6",
  blueDim: "#3B82F612",
  blueMid: "#3B82F635",
  purple: "#A78BFA",
  cyan: "#06B6D4",
  textPri: "#C8CDE0",
  textMid: "#A0AAC0",
  textMuted: "#8B95B0",
  textDim: "#6A7590",
};

const mono = "'JetBrains Mono','Fira Code',monospace";

const FAQ = [
  {
    q: "How does the performance fee work?",
    a: "Performance fees are calculated at the end of each billing cycle on realized P&L above your high-water mark. If your portfolio was at $10,000 last month and is now at $10,500, the $500 gain is subject to the fee. If you had a loss period, no fee is charged and the HWM resets to the new lower value — you must recover past the previous peak before fees apply again.",
  },
  {
    q: "Where does my capital live?",
    a: "For paid tiers (Unum, Eon, Plenum), your capital stays entirely in your own exchange account. Stella never holds, moves, or touches your funds — we only execute orders using the API keys you provide. For Stella One, Stella seeds a small capital allocation from a managed pool on your behalf.",
  },
  {
    q: "How do I revoke exchange access?",
    a: "Go to Settings → Exchange Credentials and click Revoke on any credential. This immediately stops Stella from executing new trades on that exchange. Any open positions will remain open on the exchange until you manually close them or they hit your stop/take-profit levels.",
  },
  {
    q: "What triggers a circuit breaker?",
    a: "Circuit breakers fire when your configured drawdown threshold is breached (e.g. 15% for Unum), when daily trading volume exceeds your cap, or during rapid consecutive losses. When triggered, all open orders are cancelled, all positions are closed at market, and the bot pauses for a cooldown period. You receive an immediate notification.",
  },
  {
    q: "Can I run multiple bots on the same exchange?",
    a: "Yes. Each bot is a separate process with its own strategy, capital allocation, and credentials. Two bots can trade on the same exchange simultaneously. Their capital allocations are independent, but combined exposure is monitored against your account-level risk limits.",
  },
  {
    q: "How secure are my API keys?",
    a: "All credentials are encrypted with AES-256-GCM at the application level before storage. The database never contains plaintext keys. We strongly recommend creating API keys with only Read and Trade permissions — never Withdrawal — and enabling IP whitelisting to Stella's server IPs for maximum security.",
  },
  {
    q: "What is the high-water mark?",
    a: "The high-water mark (HWM) is the peak portfolio equity you've reached in all your trading history with Stella. Performance fees only apply to profit above the HWM, preventing you from being double-charged if you recover from a loss. Example: HWM is $12,000, portfolio drops to $10,000, then recovers to $12,500 — fee only applies to the $500 above the old HWM.",
  },
  {
    q: "How do I upgrade or downgrade my plan?",
    a: "Go to Billing → Plan and click Upgrade or Downgrade. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing cycle. If downgrading would exceed the new tier's bot or strategy limits, you'll be prompted to deactivate the excess before the change is confirmed.",
  },
];

const SYS_STATUS = [
  {
    name: "Trading Engine (Elixir)",
    status: "operational",
    latency: "42ms",
  },
  { name: "API & Platform (NestJS)", status: "operational", latency: "120ms" },
  { name: "Market Data Feed", status: "operational", latency: "18ms" },
  { name: "Binance Adapter", status: "operational", latency: "65ms" },
  { name: "Alpaca Adapter", status: "operational", latency: "98ms" },
  { name: "Notification Service", status: "degraded", latency: "—" },
  { name: "RabbitMQ Message Broker", status: "operational", latency: "8ms" },
];

function M({
  size = 11,
  color = C.textPri,
  weight = 500,
  caps = false,
  style = {},
  children,
}: any) {
  return (
    <span
      style={{
        fontFamily: mono,
        fontSize: size,
        color,
        fontWeight: weight,
        letterSpacing: caps ? "0.11em" : "0.03em",
        textTransform: caps ? "uppercase" : "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Lbl({ children, color = C.textMuted, style = {} }: any) {
  return (
    <M
      size={9}
      color={color}
      weight={600}
      caps
      style={{ letterSpacing: "0.13em", ...style }}
    >
      {children}
    </M>
  );
}

function Divider({ my = 0 }: { my?: number }) {
  return (
    <div
      style={{
        height: 1,
        background: C.borderSub,
        marginTop: my,
        marginBottom: my,
      }}
    />
  );
}

function Tag({ children, color = C.green }: any) {
  return (
    <span
      style={{
        background: color + "18",
        border: `1px solid ${color}35`,
        borderRadius: 2,
        padding: "2px 7px",
        fontFamily: mono,
        fontSize: 9,
        color,
        fontWeight: 700,
        letterSpacing: "0.1em",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style = {} }: any) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({ title, sub, style = {} }: any) {
  return (
    <>
      <div
        style={{
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          ...style,
        }}
      >
        <div>
          <M
            size={11}
            weight={700}
            style={{ letterSpacing: "0.06em", display: "block" }}
          >
            {title}
          </M>
          {sub && <Lbl style={{ marginTop: 3, display: "block" }}>{sub}</Lbl>}
        </div>
      </div>
      <Divider />
    </>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled = false,
  small = false,
}: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#1A2030" : C.green,
        color: disabled ? "#3D4560" : "#0A0D14",
        border: "none",
        borderRadius: 3,
        padding: small ? "6px 14px" : "9px 20px",
        fontFamily: mono,
        fontSize: small ? 9 : 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, small = false }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        padding: small ? "5px 12px" : "9px 16px",
        fontFamily: mono,
        fontSize: small ? 9 : 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: C.textMuted,
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function TextBtn({ children, onClick, color = C.green }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        fontFamily: mono,
        fontSize: 9,
        color,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        fontWeight: 700,
        padding: "2px 0",
      }}
    >
      {children}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder = "",
  disabled = false,
}: any) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <Lbl>{label}</Lbl>}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          e.target.style.borderColor = C.green;
        }}
        onBlur={(e) => {
          setFocused(false);
          e.target.style.borderColor = C.border;
        }}
        style={{
          width: "100%",
          background: disabled ? C.surfaceAlt : C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          padding: "8px 12px",
          fontFamily: mono,
          fontSize: 11,
          color: disabled ? C.textMuted : C.textPri,
          outline: "none",
          transition: "border-color 0.15s",
        }}
      />
    </div>
  );
}

export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ticketForm, setTicketForm] = useState({
    subject: "",
    category: "trading",
    message: "",
  });
  const [ticketSent, setTicketSent] = useState(false);

  const filtered = FAQ.filter(
    (f) =>
      !search ||
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase())
  );

  function submitTicket() {
    if (!ticketForm.subject || !ticketForm.message) return;
    setTicketSent(true);
  }

  const statusColor: Record<string, string> = {
    operational: C.green,
    degraded: C.amber,
    outage: C.red,
  };

  return (
    <div style={{ padding: "24px 32px", background: C.bg, minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <M
          size={16}
          weight={700}
          style={{ letterSpacing: "0.04em", display: "block" }}
        >
          Help & Support
        </M>
        <M
          size={10}
          color={C.textMuted}
          style={{ display: "block", marginTop: 3 }}
        >
          Documentation, FAQs, system status, and support tickets
        </M>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 18,
          alignItems: "start",
        }}
      >
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: C.textMuted,
                fontFamily: mono,
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search help articles and FAQs…"
              style={{
                width: "100%",
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: "12px 16px 12px 42px",
                fontFamily: mono,
                fontSize: 11,
                color: C.textPri,
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = C.green)}
              onBlur={(e) => (e.target.style.borderColor = C.border)}
            />
          </div>

          {/* Quicklinks */}
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}
          >
            {[
              {
                icon: "◈",
                label: "Platform Docs",
                sub: "Architecture & API reference",
                color: C.blue,
              },
              {
                icon: "▸",
                label: "Getting Started",
                sub: "5-minute setup guide",
                color: C.green,
              },
              {
                icon: "◆",
                label: "Risk Controls",
                sub: "Limits, breakers, drawdown",
                color: C.amber,
              },
              {
                icon: "◉",
                label: "Exchange Setup",
                sub: "API keys & permissions guide",
                color: C.purple,
              },
              {
                icon: "◐",
                label: "Billing Guide",
                sub: "Fees, invoices, HWM explained",
                color: C.cyan,
              },
              {
                icon: "⟲",
                label: "Bot Configuration",
                sub: "Strategies, pairs, params",
                color: C.green,
              },
            ].map((link) => (
              <button
                key={link.label}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  padding: "14px 16px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s,background 0.15s",
                  display: "block",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = link.color + "60";
                  e.currentTarget.style.background = C.surfaceHov;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.background = C.surface;
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 8 }}>{link.icon}</div>
                <M
                  size={11}
                  weight={700}
                  style={{ display: "block", marginBottom: 3 }}
                >
                  {link.label}
                </M>
                <M size={9} color={C.textMuted}>
                  {link.sub}
                </M>
              </button>
            ))}
          </div>

          {/* FAQ */}
          <Card>
            <CardHead
              title="Frequently Asked Questions"
              sub={
                search
                  ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
                  : `${FAQ.length} articles`
              }
            />
            {filtered.length === 0 ? (
              <div style={{ padding: "30px 18px", textAlign: "center" }}>
                <M size={11} color={C.textMuted}>
                  No results found for &quot;{search}&quot;
                </M>
              </div>
            ) : (
              filtered.map((faq, i) => (
                <div key={i}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 14,
                      textAlign: "left",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = C.surfaceHov)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <M
                      size={11}
                      color={openFaq === i ? C.green : C.textPri}
                      weight={openFaq === i ? 700 : 500}
                      style={{ lineHeight: 1.5 }}
                    >
                      {faq.q}
                    </M>
                    <span
                      style={{
                        fontFamily: mono,
                        fontSize: 14,
                        color: openFaq === i ? C.green : C.textDim,
                        flexShrink: 0,
                        marginTop: 1,
                        transition: "transform 0.2s",
                        display: "block",
                        transform: openFaq === i ? "rotate(45deg)" : "none",
                      }}
                    >
                      +
                    </span>
                  </button>
                  {openFaq === i && (
                    <div
                      style={{
                        padding: "0 18px 14px",
                        animation: "fadeIn 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          background: C.surfaceAlt,
                          borderLeft: `3px solid ${C.green}40`,
                          borderRadius: 3,
                          padding: "12px 16px",
                        }}
                      >
                        <M
                          size={10}
                          color={C.textMuted}
                          style={{ lineHeight: 1.75, display: "block" }}
                        >
                          {faq.a}
                        </M>
                      </div>
                    </div>
                  )}
                  {i < filtered.length - 1 && <Divider />}
                </div>
              ))
            )}
          </Card>

          {/* Support ticket */}
          <Card>
            <CardHead
              title="Contact Support"
              sub="Typical response time: 2–4 hours"
            />
            {ticketSent ? (
              <div
                style={{
                  padding: "30px 18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: C.greenDim,
                    border: `1px solid ${C.greenMid}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: C.green,
                  }}
                >
                  ✓
                </div>
                <M size={12} weight={700} color={C.green}>
                  Ticket Submitted
                </M>
                <M size={10} color={C.textMuted}>
                  We&apos;ll respond to james.doe@example.com within 2–4 hours.
                </M>
                <GhostBtn
                  small
                  onClick={() => {
                    setTicketSent(false);
                    setTicketForm({ subject: "", category: "trading", message: "" });
                  }}
                >
                  Submit Another
                </GhostBtn>
              </div>
            ) : (
              <div
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Input
                    label="Subject"
                    value={ticketForm.subject}
                    onChange={(v: string) =>
                      setTicketForm((f) => ({ ...f, subject: v }))
                    }
                    placeholder="Briefly describe your issue"
                  />
                  <div>
                    <Lbl style={{ display: "block", marginBottom: 5 }}>
                      Category
                    </Lbl>
                    <select
                      value={ticketForm.category}
                      onChange={(e) =>
                        setTicketForm((f) => ({ ...f, category: e.target.value }))
                      }
                      style={{
                        width: "100%",
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 3,
                        padding: "8px 12px",
                        fontFamily: mono,
                        fontSize: 11,
                        color: C.textPri,
                        outline: "none",
                      }}
                    >
                      {["trading", "billing", "account", "technical", "exchange", "other"].map(
                        (c) => (
                          <option key={c} value={c}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
                <div>
                  <Lbl style={{ display: "block", marginBottom: 5 }}>Message</Lbl>
                  <textarea
                    value={ticketForm.message}
                    onChange={(e) =>
                      setTicketForm((f) => ({ ...f, message: e.target.value }))
                    }
                    placeholder="Describe the issue in detail — include bot names, error messages, and steps to reproduce…"
                    rows={5}
                    onFocus={(e) => (e.target.style.borderColor = C.green)}
                    onBlur={(e) => (e.target.style.borderColor = C.border)}
                    style={{
                      width: "100%",
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 3,
                      padding: "10px 12px",
                      fontFamily: mono,
                      fontSize: 11,
                      color: C.textPri,
                      outline: "none",
                      resize: "vertical",
                      lineHeight: 1.6,
                    }}
                  />
                </div>
                <PrimaryBtn
                  onClick={submitTicket}
                  disabled={!ticketForm.subject || !ticketForm.message}
                >
                  Submit Ticket
                </PrimaryBtn>
              </div>
            )}
          </Card>
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* System status */}
          <Card>
            <CardHead title="System Status" />
            <div style={{ padding: "0 0 4px" }}>
              {SYS_STATUS.map((svc, i) => {
                const sc = statusColor[svc.status];
                return (
                  <div key={svc.name}>
                    <div
                      style={{
                        padding: "10px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: sc,
                            flexShrink: 0,
                            boxShadow:
                              svc.status === "operational"
                                ? `0 0 6px ${sc}50`
                                : "none",
                          }}
                        />
                        <M size={10} color={C.textMid} weight={500}>
                          {svc.name}
                        </M>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {svc.latency !== "—" && (
                          <M size={9} color={C.textDim}>
                            {svc.latency}
                          </M>
                        )}
                        {svc.status !== "operational" && (
                          <Tag color={sc}>{svc.status.toUpperCase()}</Tag>
                        )}
                      </div>
                    </div>
                    {i < SYS_STATUS.length - 1 && <Divider />}
                  </div>
                );
              })}
              <div
                style={{
                  padding: "10px 18px",
                  borderTop: `1px solid ${C.borderSub}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: C.amber,
                    }}
                  />
                  <M size={9} color={C.amber}>
                    1 service degraded
                  </M>
                </div>
                <TextBtn>Status Page →</TextBtn>
              </div>
            </div>
          </Card>

          {/* Support channels */}
          <Card>
            <CardHead title="Support Channels" />
            <div style={{ padding: "0 0 4px" }}>
              {[
                {
                  icon: "✎",
                  label: "Email Support",
                  sub: "Email · Unum plan",
                  action: "Open Ticket",
                  color: C.green,
                },
                {
                  icon: "◕",
                  label: "Community Forum",
                  sub: "Discuss & share tips",
                  action: "Visit",
                  color: C.blue,
                },
                {
                  icon: "▤",
                  label: "Documentation",
                  sub: "Full API reference",
                  action: "Open Docs",
                  color: C.purple,
                },
                {
                  icon: "◬",
                  label: "Report a Bug",
                  sub: "GitHub Issues",
                  action: "Open Issue",
                  color: C.amber,
                },
              ].map(({ icon, label, sub, action, color }, i, a) => (
                <div key={label}>
                  <div
                    style={{
                      padding: "12px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 4,
                          background: color + "18",
                          border: `1px solid ${color}30`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {icon}
                      </div>
                      <div>
                        <M
                          size={11}
                          weight={600}
                          style={{ display: "block", marginBottom: 2 }}
                        >
                          {label}
                        </M>
                        <M size={9} color={C.textMuted}>
                          {sub}
                        </M>
                      </div>
                    </div>
                    <TextBtn color={color}>{action} →</TextBtn>
                  </div>
                  {i < a.length - 1 && <Divider />}
                </div>
              ))}
            </div>
          </Card>

          {/* Account info */}
          <Card>
            <CardHead title="Your Account Info" />
            <div style={{ padding: "0 0 4px" }}>
              {[
                { l: "Plan", v: "Stella Unum" },
                { l: "Member ID", v: "STL-00042" },
                { l: "User Since", v: "Nov 2025" },
                { l: "KYC Level", v: "Enhanced (pending)" },
              ].map(({ l, v }, i, a) => (
                <div key={l}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "9px 18px",
                    }}
                  >
                    <Lbl>{l}</Lbl>
                    <M size={10} color={C.textPri} weight={600}>
                      {v}
                    </M>
                  </div>
                  {i < a.length - 1 && <Divider />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
