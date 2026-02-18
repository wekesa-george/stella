"use client";

import { useState } from "react";

const ADMIN_USERS = [
  { id: 1, name: "George Wekesa", email: "george@stella.io", role: "Platform Admin", twoFA: true, lastLogin: "Just now", color: "#3d9df3", initials: "GW", sessions: 1 },
  { id: 2, name: "Amara Nwosu", email: "amara@stella.io", role: "Compliance Officer", twoFA: true, lastLogin: "2h ago", color: "#00e5a0", initials: "AN", sessions: 1 },
  { id: 3, name: "David Kiptoo", email: "david@stella.io", role: "Read Only", twoFA: false, lastLogin: "1d ago", color: "#f5a623", initials: "DK", sessions: 0 },
  { id: 4, name: "Fatima Al-Rashid", email: "fatima@stella.io", role: "Compliance Officer", twoFA: true, lastLogin: "3h ago", color: "#a78bfa", initials: "FA", sessions: 1 },
];

const ROLES_LIST = ["Platform Admin", "Compliance Officer", "Ops Engineer", "Read Only"];

export default function SecurityPage() {
  const [users, setUsers] = useState(ADMIN_USERS);
  const [ipList, setIpList] = useState(["41.210.0.0/16", "196.0.0.0/8"]);
  const [ipInput, setIpInput] = useState("");
  const [s, setS] = useState({
    sessionTimeout: 480,
    forceTwoFA: true,
    ipAllowlist: true,
    auditRetentionYears: 7,
    minPasswordLength: 12,
    requireSpecialChars: true,
    maxLoginAttempts: 5,
  });

  const [dirty, setDirty] = useState(false);

  const set = (k: string, v: any) => {
    setS((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const handleSave = () => {
    setDirty(false);
    // In real app, save to API
  };

  const handleDiscard = () => {
    setDirty(false);
    // In real app, reset to original values
  };

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Page Header */}
      <div className="mb-1">
        <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">Security & Access Control</div>
        <div className="font-mono text-[10px] text-[#5a7090]">
          Admin users, authentication policy, and session management.
        </div>
      </div>

      {/* Admin users */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">
            Admin Users <span className="font-mono text-[9px] text-[#5a7090] font-normal ml-1.5">{users.length} users</span>
          </div>
          <button className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all">
            + Invite Admin
          </button>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  User
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Role
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  2FA
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Active Sessions
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap">
                  Last Login
                </th>
                <th className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] px-3.5 py-2 text-left border-b border-[#1e2d40] bg-[#131920] font-medium whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#131920]">
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40]">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-[30px] h-[30px] rounded flex items-center justify-center font-mono text-[11px] font-semibold flex-shrink-0"
                        style={{ background: u.color + "22", color: u.color }}
                      >
                        {u.initials}
                      </div>
                      <div>
                        <div className="font-semibold text-[#e8edf3] text-[12px]">{u.name}</div>
                        <div className="font-mono text-[9px] text-[#5a7090]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40]">
                    <select
                      className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[10px] px-2 py-0.5 rounded outline-none cursor-pointer"
                      defaultValue={u.role}
                    >
                      {ROLES_LIST.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40]">
                    {u.twoFA ? (
                      <span className="px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.10)] text-[#00e5a0] font-mono text-[9px] font-bold uppercase tracking-wide inline-flex items-center gap-1">
                        <span className="w-[5px] h-[5px] rounded-full bg-[#00e5a0]" />
                        Enabled
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-sm bg-[rgba(245,166,35,0.10)] text-[#f5a623] font-mono text-[9px] font-bold uppercase tracking-wide inline-flex items-center gap-1">
                        <span className="w-[5px] h-[5px] rounded-full bg-[#f5a623]" />
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] font-mono text-[10px]" style={{ color: u.sessions > 0 ? "#00e5a0" : "#5a7090" }}>
                    {u.sessions}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40] font-mono text-[10px] text-[#5a7090]">{u.lastLogin}</td>
                  <td className="px-3.5 py-2.5 border-b border-[#1e2d40]">
                    <div className="flex gap-1.5">
                      <button className="px-2 py-0.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] transition-all">
                        Edit
                      </button>
                      <button className="px-2 py-0.5 rounded border bg-[rgba(255,71,87,0.10)] text-[#ff4757] border-[rgba(255,71,87,0.3)] font-mono text-[8px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all">
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auth policy */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Authentication Policy</div>
        </div>
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3.5">
              <Field label="Session Timeout (minutes)" hint="Admin sessions expire after this many minutes of inactivity.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  value={s.sessionTimeout}
                  onChange={(e) => set("sessionTimeout", +e.target.value)}
                />
              </Field>
              <Field label="Min Password Length">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  value={s.minPasswordLength}
                  onChange={(e) => set("minPasswordLength", +e.target.value)}
                />
              </Field>
              <Field label="Max Login Attempts" hint="Account locked after this many consecutive failures.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  value={s.maxLoginAttempts}
                  onChange={(e) => set("maxLoginAttempts", +e.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-3.5">
              <Field label="Audit Log Retention (years)" hint="Minimum 7 years required by most financial regulations.">
                <input
                  className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none w-full transition-all focus:border-[#253550]"
                  type="number"
                  value={s.auditRetentionYears}
                  onChange={(e) => set("auditRetentionYears", +e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="h-px bg-[#1e2d40] my-3.5" />
          <ToggleRow
            label="Enforce 2FA for all admins"
            sub="Any admin without 2FA configured will be locked out until they set it up."
            checked={s.forceTwoFA}
            onChange={(v) => set("forceTwoFA", v)}
          />
          <ToggleRow
            label="Require special characters in passwords"
            sub="Passwords must contain at least one symbol."
            checked={s.requireSpecialChars}
            onChange={(v) => set("requireSpecialChars", v)}
          />
          <ToggleRow
            label="Enable IP allowlist"
            sub="Only IP addresses in the list below can access the admin panel."
            checked={s.ipAllowlist}
            onChange={(v) => set("ipAllowlist", v)}
          />
        </div>
      </div>

      {/* IP allowlist */}
      {s.ipAllowlist && (
        <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d40]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">IP Allowlist</div>
            <div className="text-[11px] text-[#5a7090] mt-0.5">CIDR notation supported (e.g. 196.0.0.0/8)</div>
          </div>
          <div className="px-4 py-4">
            <div className="flex gap-2 flex-wrap mb-3">
              {ipList.map((ip) => (
                <div
                  key={ip}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#1a2230] border border-[#253550] rounded-sm font-mono text-[10px] text-[#8fa3b8]"
                >
                  {ip}
                  <span
                    className="text-[#5a7090] cursor-pointer text-[10px] leading-none hover:text-[#ff4757] transition-colors"
                    onClick={() => {
                      setIpList((l) => l.filter((i) => i !== ip));
                      setDirty(true);
                    }}
                  >
                    ✕
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="bg-[#131920] border border-[#1e2d40] text-[#e8edf3] font-mono text-[11px] px-2.5 py-1.5 rounded outline-none max-w-[220px] transition-all focus:border-[#253550]"
                placeholder="41.210.0.0/16"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
              />
              <button
                className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all"
                onClick={() => {
                  if (ipInput.trim()) {
                    setIpList((l) => [...l, ipInput.trim()]);
                    setIpInput("");
                    setDirty(true);
                  }
                }}
              >
                Add IP
              </button>
            </div>
          </div>
          {dirty && (
            <div className="px-4 py-2.5 border-t border-[#1e2d40] flex gap-2 justify-end bg-[#131920]">
              <button
                onClick={handleDiscard}
                className="px-3 py-1.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
              >
                Discard Changes
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded border bg-[rgba(0,229,160,0.10)] text-[#00e5a0] border-[rgba(0,229,160,0.3)] font-mono text-[9px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all"
              >
                Save Changes
              </button>
            </div>
          )}
        </div>
      )}
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

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1e2d40] last:border-b-0 last:pb-0">
      <div>
        <div className="text-[12px] text-[#e8edf3] font-medium">{label}</div>
        <div className="font-mono text-[9px] text-[#5a7090] mt-0.5">{sub}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative w-9 h-5 flex-shrink-0 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="opacity-0 w-0 h-0" />
      <span
        className={`absolute inset-0 rounded-full border transition-all duration-200 ${
          checked ? "bg-[rgba(0,229,160,0.10)] border-[rgba(0,229,160,0.4)]" : "bg-[#1a2230] border-[#253550]"
        }`}
      >
        <span
          className={`absolute h-3.5 w-3.5 rounded-full transition-all duration-200 left-0.5 top-0.5 ${
            checked ? "translate-x-4 bg-[#00e5a0]" : "translate-x-0 bg-[#5a7090]"
          }`}
        />
      </span>
    </label>
  );
}
