"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAdminUser, getAvailableRoles } from "@/lib/stellaAdminApi";

interface AvailableRole {
  id: string;
  name: string;
  code: string;
  hierarchyLevel: number;
  isSystem: boolean;
}

export default function CreateAdminUserPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    username: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await getAvailableRoles();
        setAvailableRoles((res.data || []) as AvailableRole[]);
      } catch {
        // roles are optional, don't block the form
      } finally {
        setRolesLoading(false);
      }
    }
    loadRoles();
  }, []);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body: {
        email: string;
        username: string;
        firstName: string;
        lastName: string;
        phone?: string;
        roleIds?: string[];
      } = {
        email: form.email,
        username: form.username,
        firstName: form.firstName,
        lastName: form.lastName,
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (selectedRoleIds.length > 0) body.roleIds = selectedRoleIds;

      const res = await createAdminUser(body);
      if (res.error) {
        setError(res.error);
      } else {
        router.push("/admin-users");
      }
    } catch {
      setError("Failed to create admin user");
    } finally {
      setSubmitting(false);
    }
  };

  const sanitizeUsername = (val: string) => val.toLowerCase().replace(/\s+/g, "_");
  const usernameRegex = /^[a-z_]\w*$/;
  const trimmedUsername = form.username.trim();
  const looksLikeEmail = trimmedUsername.includes("@");
  const isUsernameValid = trimmedUsername.length >= 3 && usernameRegex.test(trimmedUsername) && !looksLikeEmail;
  const isValid = form.email.trim() && trimmedUsername && isUsernameValid && form.firstName.trim() && form.lastName.trim();

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-2xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 font-mono text-[10px] md:text-[11px]">
        <Link
          href="/admin-users"
          className="text-[#5a7090] hover:text-[#3d9df3] transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Admin Users
        </Link>
        <svg className="w-4 h-4 text-[#5a7090]" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-[#8fa3b8]">Create Admin User</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="font-mono text-xl md:text-2xl font-semibold text-[#e8edf3]">Create Admin User</h1>
        <p className="mt-1 font-mono text-[11px] text-[#5a7090]">
          Create a new admin user account. A temporary password will be generated and the user will be prompted to change it on first login.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[rgba(255,71,87,0.10)] border border-[rgba(255,71,87,0.3)] rounded p-4">
          <p className="font-mono text-[11px] text-[#ff4757]">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Basic Info */}
        <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d40]">
            <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Basic Information</h3>
          </div>
          <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                First Name <span className="text-[#ff4757]">*</span>
              </label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jane"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Last Name <span className="text-[#ff4757]">*</span>
              </label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Doe"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Email <span className="text-[#ff4757]">*</span>
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane.doe@stella.io"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Username <span className="text-[#ff4757]">*</span>
              </label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
                placeholder="jane_doe"
                className={`w-full px-3 py-2 bg-[#080c10] border rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0] ${
                  trimmedUsername && !isUsernameValid ? "border-[#ff4757]" : "border-[#1e2d40]"
                }`}
              />
              {trimmedUsername && !isUsernameValid && (
                <p className="mt-1 font-mono text-[9px] text-[#ff4757]">
                  {looksLikeEmail ? "Username cannot be an email address." : "Min 3 chars. Lowercase letters, numbers, underscores only. Must start with a letter or underscore."}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Phone
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 123 4567"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
              />
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d40]">
            <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Assign Roles</h3>
            <p className="font-mono text-[9px] text-[#5a7090] mt-1">
              Select roles to assign to this user. You can also assign roles later.
            </p>
          </div>
          <div className="px-4 py-4">
            {rolesLoading ? (
              <div className="flex items-center gap-2 py-4">
                <svg className="w-4 h-4 animate-spin text-[#3d9df3]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="font-mono text-[11px] text-[#5a7090]">Loading roles...</span>
              </div>
            ) : availableRoles.length === 0 ? (
              <p className="font-mono text-[10px] text-[#5a7090] py-2">No roles available.</p>
            ) : (
              <div className="space-y-2">
                {availableRoles.map((role) => {
                  const isSelected = selectedRoleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={`w-full text-left p-3 rounded border transition-all ${
                        isSelected
                          ? "border-[#00e5a0] bg-[rgba(0,229,160,0.08)]"
                          : "border-[#1e2d40] hover:border-[#253550] hover:bg-[#0d1117]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-[#00e5a0] border-[#00e5a0]"
                                : "border-[#5a7090]"
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="font-mono text-[11px] font-semibold text-[#e8edf3]">{role.name}</p>
                            <p className="font-mono text-[9px] text-[#5a7090]">
                              Level {role.hierarchyLevel} · {role.code}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {role.isSystem && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(61,157,243,0.10)] text-[#3d9df3] font-mono text-[8px] font-bold">
                              System
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-[rgba(61,157,243,0.08)] border border-[rgba(61,157,243,0.2)] rounded p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-[#3d9df3] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="font-mono text-[10px] text-[#8fa3b8] space-y-1">
              <p>A temporary password will be generated automatically.</p>
              <p>The user will be created in both the database and the identity provider (Logto).</p>
              <p>The account will start in <span className="text-[#3d9df3] font-semibold">Invited</span> status and become <span className="text-[#00e5a0] font-semibold">Active</span> on first login.</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin-users"
            className="px-4 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !isValid}
            className="px-4 py-2 rounded border border-[rgba(0,229,160,0.3)] bg-[#00e5a0] text-black font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#00cc8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create Admin User"}
          </button>
        </div>
      </form>
    </div>
  );
}
