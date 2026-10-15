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
    password: "",
    confirmPassword: "",
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
        password?: string;
        roleIds?: string[];
      } = {
        email: form.email,
        username: form.username,
        firstName: form.firstName,
        lastName: form.lastName,
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.password.trim()) body.password = form.password.trim();
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
  const passwordsMatch = !form.password || form.password === form.confirmPassword;
  const passwordLongEnough = !form.password || form.password.length >= 8;
  const isValid = form.email.trim() && trimmedUsername && isUsernameValid && form.firstName.trim() && form.lastName.trim() && passwordsMatch && passwordLongEnough;

  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col gap-6">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl md:text-2xl font-semibold text-[#e8edf3]">Create Admin User</h1>
          <p className="mt-1 font-mono text-[11px] text-[#5a7090]">
            Create a new admin user account. Set a password or leave blank for an auto-generated temporary password.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin-users"
            className="px-5 py-2.5 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
          >
            Cancel
          </Link>
          <button
            type="submit"
            form="create-admin-form"
            disabled={submitting || !isValid}
            className="px-5 py-2.5 rounded border border-[rgba(0,229,160,0.3)] bg-[#00e5a0] text-black font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#00cc8e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create Admin User"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[rgba(255,71,87,0.10)] border border-[rgba(255,71,87,0.3)] rounded p-4">
          <p className="font-mono text-[11px] text-[#ff4757]">{error}</p>
        </div>
      )}

      <form id="create-admin-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Basic Info + Password */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Basic Info */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Basic Information</h3>
            </div>
            <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  First Name <span className="text-[#ff4757]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Jane"
                  className="w-full px-3 py-2.5 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Last Name <span className="text-[#ff4757]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Doe"
                  className="w-full px-3 py-2.5 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Email <span className="text-[#ff4757]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane.doe@stella.io"
                  className="w-full px-3 py-2.5 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Phone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 555 123 4567"
                  className="w-full px-3 py-2.5 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Username <span className="text-[#ff4757]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
                  placeholder="jane_doe"
                  className={`w-full px-3 py-2.5 bg-[#080c10] border rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0] ${
                    trimmedUsername && !isUsernameValid ? "border-[#ff4757]" : "border-[#1e2d40]"
                  }`}
                />
                {trimmedUsername && !isUsernameValid && (
                  <p className="mt-1 font-mono text-[9px] text-[#ff4757]">
                    {looksLikeEmail ? "Username cannot be an email address." : "Min 3 chars. Lowercase letters, numbers, underscores only. Must start with a letter or underscore."}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Password</h3>
              <p className="font-mono text-[9px] text-[#5a7090] mt-1">
                Leave blank to auto-generate a temporary password. The user will be prompted to change it on first login.
              </p>
            </div>
            <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 8 characters"
                    className={`w-full px-3 py-2.5 pr-10 bg-[#080c10] border rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0] ${
                      form.password && !passwordLongEnough ? "border-[#ff4757]" : "border-[#1e2d40]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5a7090] hover:text-[#8fa3b8] transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {form.password && !passwordLongEnough && (
                  <p className="mt-1 font-mono text-[9px] text-[#ff4757]">Password must be at least 8 characters.</p>
                )}
              </div>
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Confirm password"
                    className={`w-full px-3 py-2.5 pr-10 bg-[#080c10] border rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#00e5a0] ${
                      form.confirmPassword && !passwordsMatch ? "border-[#ff4757]" : "border-[#1e2d40]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5a7090] hover:text-[#8fa3b8] transition-colors"
                  >
                    {showConfirmPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {form.confirmPassword && !passwordsMatch && (
                  <p className="mt-1 font-mono text-[9px] text-[#ff4757]">Passwords do not match.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Roles + Info */}
        <div className="flex flex-col gap-6">
          {/* Roles */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Assign Roles</h3>
              <p className="font-mono text-[9px] text-[#5a7090] mt-1">
                Select roles to assign. You can also assign roles later.
              </p>
            </div>
            <div className="px-5 py-5">
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
                          {role.isSystem && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(61,157,243,0.10)] text-[#3d9df3] font-mono text-[8px] font-bold">
                              System
                            </span>
                          )}
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
                <p>The user will be created in both the database and Logto.</p>
                <p>The account starts as <span className="text-[#3d9df3] font-semibold">Invited</span> and becomes <span className="text-[#00e5a0] font-semibold">Active</span> on first login.</p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
