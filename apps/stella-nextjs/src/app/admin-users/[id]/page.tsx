"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getAdminUser,
  getAdminUserRoles,
  getAvailableRoles,
  updateAdminUser,
  deactivateAdminUser,
  reactivateAdminUser,
  assignAdminUserRole,
  removeAdminUserRole,
  resetAdminPassword,
  getAdminUserMfa,
  deleteAdminUserMfa,
} from "@/lib/stellaAdminApi";

interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string | null;
  displayName: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  status: string;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  invitedAt: string | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
}

interface RoleAssignment {
  id: string;
  name: string;
  code: string;
  hierarchyLevel: number;
  isSystem: boolean;
  assignedAt: string;
  expiresAt: string | null;
  assignedBy: { id: string; email: string; name: string } | null;
}

interface AvailableRole {
  id: string;
  name: string;
  code: string;
  hierarchyLevel: number;
  isSystem: boolean;
}

interface MfaVerification {
  id: string;
  type: "Totp" | "WebAuthn" | "BackupCode" | "EmailVerificationCode" | "PhoneVerificationCode";
  createdAt: string;
  lastUsedAt?: string;
  name?: string;
  remainCodes?: number;
}

function formatDateTime(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<AdminUser | null>(null);
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [mfaVerifications, setMfaVerifications] = useState<MfaVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [showRemoveRoleModal, setShowRemoveRoleModal] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<RoleAssignment | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [editForm, setEditForm] = useState({ username: "", firstName: "", lastName: "", phone: "", timezone: "", avatarUrl: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRes, rolesRes, availRes, mfaRes] = await Promise.all([
        getAdminUser(userId),
        getAdminUserRoles(userId),
        getAvailableRoles(userId),
        getAdminUserMfa(userId),
      ]);
      if (userRes.error) {
        setError(userRes.error);
        return;
      }
      setUser(userRes.data as AdminUser);
      setRoles((rolesRes.data || []) as RoleAssignment[]);
      setAvailableRoles((availRes.data || []) as AvailableRole[]);
      const mfaData = mfaRes.data as { verifications?: MfaVerification[]; mfaEnabled?: boolean } | undefined;
      setMfaVerifications((mfaData?.verifications || []) as MfaVerification[]);
    } catch {
      setError("Failed to fetch admin user");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const showMessage = (type: "success" | "error", text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleDeactivate = async () => {
    if (!deactivationReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await deactivateAdminUser(userId, { reason: deactivationReason });
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "User deactivated successfully");
        setShowDeactivateModal(false);
        setDeactivationReason("");
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to deactivate user");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    if (!confirm(`Reactivate ${user?.firstName} ${user?.lastName}? They will regain access to the admin panel.`)) return;
    setActionLoading(true);
    try {
      const res = await reactivateAdminUser(userId);
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "User reactivated successfully");
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to reactivate user");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignRole = async (roleId: string) => {
    setActionLoading(true);
    try {
      const res = await assignAdminUserRole(userId, { roleId });
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "Role assigned successfully");
        setShowAssignRoleModal(false);
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to assign role");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveRole = async () => {
    if (!roleToRemove) return;
    setActionLoading(true);
    try {
      const res = await removeAdminUserRole(userId, roleToRemove.id);
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "Role removed successfully");
        setShowRemoveRoleModal(false);
        setRoleToRemove(null);
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to remove role");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setActionLoading(true);
    try {
      const res = await resetAdminPassword(userId);
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "Password reset initiated successfully");
      }
    } catch {
      showMessage("error", "Failed to reset password");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMfa = async (verificationId: string, typeName: string) => {
    if (!confirm(`Remove ${typeName} MFA factor? The user may lose access if this is their only factor.`)) return;
    setActionLoading(true);
    try {
      const res = await deleteAdminUserMfa(userId, verificationId);
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "MFA factor removed successfully");
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to remove MFA factor");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = () => {
    if (!user) return;
    setEditForm({
      username: user.username || "",
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || "",
      timezone: user.timezone || "",
      avatarUrl: user.avatarUrl || "",
    });
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const body: Record<string, string> = {};
      if (editForm.username !== (user.username || "")) body.username = editForm.username;
      if (editForm.firstName !== user.firstName) body.firstName = editForm.firstName;
      if (editForm.lastName !== user.lastName) body.lastName = editForm.lastName;
      if (editForm.phone !== (user.phone || "")) body.phone = editForm.phone;
      if (editForm.timezone !== (user.timezone || "")) body.timezone = editForm.timezone;
      if (editForm.avatarUrl !== (user.avatarUrl || "")) body.avatarUrl = editForm.avatarUrl;

      if (Object.keys(body).length === 0) {
        showMessage("error", "No changes to save");
        setActionLoading(false);
        return;
      }

      const res = await updateAdminUser(userId, body);
      if (res.error) {
        showMessage("error", res.error);
      } else {
        showMessage("success", "User updated successfully");
        setShowEditModal(false);
        fetchUser();
      }
    } catch {
      showMessage("error", "Failed to update user");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[50vh]">
        <div className="inline-flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin text-[#3d9df3]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-mono text-[11px] text-[#5a7090]">Loading user details...</span>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="font-mono text-[11px] text-[#ff4757]">{error || "User not found"}</p>
        <button
          onClick={fetchUser}
          className="font-mono text-[10px] text-[#3d9df3] hover:text-[#00e5a0] transition-colors"
        >
          Retry
        </button>
        <Link href="/admin-users" className="font-mono text-[10px] text-[#5a7090] hover:text-[#8fa3b8] transition-colors">
          Back to Admin Users
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
      {/* Action message toast */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-[200] px-4 py-3 rounded border font-mono text-[11px] shadow-lg transition-all ${
            actionMessage.type === "success"
              ? "bg-[rgba(0,229,160,0.15)] border-[rgba(0,229,160,0.3)] text-[#00e5a0]"
              : "bg-[rgba(255,71,87,0.15)] border-[rgba(255,71,87,0.3)] text-[#ff4757]"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 font-mono text-[10px] md:text-[11px]">
        <Link href="/admin-users" className="text-[#5a7090] hover:text-[#3d9df3] transition-colors flex items-center gap-2">
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
        <span className="text-[#8fa3b8]">{user.firstName} {user.lastName}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Avatar */}
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 md:w-16 md:h-16 bg-[rgba(61,157,243,0.15)] rounded-full flex items-center justify-center">
              <span className="text-[#3d9df3] text-lg md:text-xl font-bold font-mono">{getInitials(user.firstName, user.lastName)}</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-1 flex-wrap">
              <h1 className="font-mono text-lg md:text-2xl font-semibold text-[#e8edf3]">
                {user.firstName} {user.lastName}
              </h1>
              <StatusBadge status={user.status} />
              {user.isSuperAdmin && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(167,139,250,0.15)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] font-mono text-[8px] font-bold uppercase tracking-wide">
                  Super Admin
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] md:text-[11px] text-[#8fa3b8]">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {(user.status === "deactivated" || user.status === "suspended") && (
            <button
              onClick={handleReactivate}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[rgba(0,229,160,0.3)] bg-[rgba(0,229,160,0.10)] text-[#00e5a0] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#00e5a0] hover:text-black transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Reactivate
            </button>
          )}
          {user.status !== "deactivated" && user.status !== "suspended" && (
            <button
              onClick={() => setShowDeactivateModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[rgba(255,71,87,0.3)] bg-[rgba(255,71,87,0.10)] text-[#ff4757] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#ff4757] hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              Deactivate
            </button>
          )}
          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.3)] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#3d9df3] hover:text-white transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column - Main Info (2/3 width) */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Basic Information */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Basic Information</h3>
            </div>
            <div className="px-4 py-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailItem label="Username" value={user.username || "—"} />
                <DetailItem label="Email" value={user.email} />
                <DetailItem label="First Name" value={user.firstName} />
                <DetailItem label="Last Name" value={user.lastName} />
                <DetailItem label="Phone" value={user.phone || "—"} />
                <DetailItem label="Display Name" value={user.displayName || "—"} />
                <DetailItem label="Timezone" value={user.timezone || "—"} />
              </dl>
            </div>
          </div>

          {/* Security & Access */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Security & Access</h3>
            </div>
            <div className="px-4 py-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                    Multi-Factor Authentication
                  </dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {mfaVerifications.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.10)] text-[#00e5a0] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Enabled ({mfaVerifications.length} {mfaVerifications.length === 1 ? "factor" : "factors"})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(90,112,144,0.10)] text-[#5a7090] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Not Configured
                      </span>
                    )}
                  </dd>
                  {mfaVerifications.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {mfaVerifications.map((v) => (
                        <div key={v.id} className="flex items-center justify-between p-2 bg-[#0d1117] rounded group">
                          <div className="flex items-center gap-2">
                            <MfaTypeIcon type={v.type} />
                            <div>
                              <p className="font-mono text-[10px] text-[#e8edf3]">
                                {v.name || getMfaTypeLabel(v.type)}
                              </p>
                              <p className="font-mono text-[8px] text-[#5a7090]">
                                Added {formatDateTime(v.createdAt)}
                                {v.lastUsedAt && <> · Last used {formatDateTime(v.lastUsedAt)}</>}
                                {v.type === "BackupCode" && v.remainCodes !== undefined && (
                                  <> · {v.remainCodes} codes remaining</>
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMfa(v.id, v.name || getMfaTypeLabel(v.type))}
                            disabled={actionLoading}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#ff4757] p-1 disabled:opacity-50"
                            title="Remove factor"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                    Force Password Change
                  </dt>
                  <dd className="mt-1">
                    {user.forcePasswordChange ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(245,166,35,0.10)] text-[#f5a623] font-mono text-[8px] font-bold">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(90,112,144,0.10)] text-[#5a7090] font-mono text-[8px] font-bold">
                        Not Required
                      </span>
                    )}
                  </dd>
                </div>
                <DetailItem label="Last Login" value={formatDateTime(user.lastLoginAt)} />
                <DetailItem label="Last Login IP" value={user.lastLoginIp || "—"} />
                <DetailItem label="Failed Login Count" value={user.failedLoginCount.toString()} />
                <DetailItem label="Locked Until" value={user.lockedUntil ? formatDateTime(user.lockedUntil) : "Not Locked"} />
              </dl>
            </div>
          </div>

          {/* Account History */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Account History</h3>
            </div>
            <div className="px-4 py-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailItem label="Created At" value={formatDateTime(user.createdAt)} />
                <DetailItem label="Invited At" value={formatDateTime(user.invitedAt)} />
                <DetailItem label="Activated At" value={formatDateTime(user.activatedAt)} />
                {user.status === "deactivated" && (
                  <>
                    <DetailItem label="Deactivated At" value={formatDateTime(user.deactivatedAt)} />
                    <div className="col-span-2">
                      <dt className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">Deactivation Reason</dt>
                      <dd className="font-mono text-[10px] text-[#e8edf3]">{user.deactivationReason || "—"}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>

        {/* Right Column - Roles & Actions (1/3 width) */}
        <div className="flex flex-col gap-5">
          {/* Roles */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center justify-between">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Roles</h3>
              {availableRoles.length > 0 && (
                <button
                  onClick={() => setShowAssignRoleModal(true)}
                  className="font-mono text-[10px] font-semibold text-[#3d9df3] hover:text-[#00e5a0] transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Role
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              {roles.length === 0 ? (
                <div>
                  <p className="font-mono text-[10px] text-[#5a7090] mb-2">No roles assigned</p>
                  {availableRoles.length > 0 && (
                    <button
                      onClick={() => setShowAssignRoleModal(true)}
                      className="font-mono text-[10px] text-[#3d9df3] hover:text-[#00e5a0] transition-colors"
                    >
                      Click here to assign a role
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {roles.map((role) => (
                    <li
                      key={role.id}
                      className="flex items-center justify-between p-3 bg-[#0d1117] rounded group hover:bg-[#1a2230] transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-[11px] font-semibold text-[#e8edf3]">{role.name}</p>
                        <p className="font-mono text-[9px] text-[#5a7090]">Level {role.hierarchyLevel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {role.isSystem && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(61,157,243,0.10)] text-[#3d9df3] font-mono text-[8px] font-bold">
                            System
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setRoleToRemove(role);
                            setShowRemoveRoleModal(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#ff4757] hover:text-[#ff4757] p-1"
                          title="Remove role"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#131920] border border-[#1e2d40] rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e2d40]">
              <h3 className="font-mono text-xs font-semibold text-[#e8edf3]">Quick Actions</h3>
            </div>
            <div className="px-4 py-4 space-y-2">
              <ActionButton icon="key" label="Reset Password" onClick={handleResetPassword} disabled={actionLoading} />
              <ActionButton icon="envelope" label="Send Email" onClick={() => window.open(`mailto:${user.email}`)} />
              <ActionButton icon="clock" label="View Activity Log" onClick={() => router.push(`/admin-users/${userId}/audit-log`)} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {showEditModal && (
        <Modal onClose={() => setShowEditModal(false)} title="Edit Admin User">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Username <span className="text-[#ff4757]">*</span>
              </label>
              <input
                type="text"
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                placeholder="jane_doe"
                className={`w-full px-3 py-2 bg-[#080c10] border rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#3d9df3] ${
                  editForm.username.trim() && (!/^[a-z_]\w*$/.test(editForm.username.trim()) || editForm.username.includes("@")) ? "border-[#ff4757]" : "border-[#1e2d40]"
                }`}
              />
              {editForm.username.trim() && (!/^[a-z_]\w*$/.test(editForm.username.trim()) || editForm.username.includes("@")) && (
                <p className="mt-1 font-mono text-[9px] text-[#ff4757]">
                  {editForm.username.includes("@") ? "Username cannot be an email address." : "Lowercase letters, numbers, underscores only. Must start with a letter or underscore."}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#3d9df3]"
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#3d9df3]"
                />
              </div>
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Phone
              </label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+1 555 123 4567"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#3d9df3]"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Timezone
              </label>
              <select
                value={editForm.timezone}
                onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] focus:outline-none focus:border-[#3d9df3]"
              >
                <option value="">Select timezone</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Chicago">America/Chicago (CST)</option>
                <option value="America/Denver">America/Denver (MST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
                <option value="Pacific/Auckland">Pacific/Auckland (NZST)</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Avatar URL
              </label>
              <input
                type="url"
                value={editForm.avatarUrl}
                onChange={(e) => setEditForm({ ...editForm, avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.png"
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#3d9df3]"
              />
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={actionLoading || !editForm.username.trim() || !/^[a-z_]\w*$/.test(editForm.username.trim()) || editForm.username.includes("@") || !editForm.firstName.trim() || !editForm.lastName.trim()}
                className="flex-1 px-3 py-2 rounded border border-[rgba(61,157,243,0.3)] bg-[#3d9df3] text-white font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#2d8de3] transition-all disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <Modal onClose={() => setShowDeactivateModal(false)} title="Deactivate Admin User" danger>
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(255,71,87,0.15)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#ff4757]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="font-mono text-[11px] text-[#8fa3b8] text-center">
              Are you sure you want to deactivate {user.firstName} {user.lastName}? They will no longer be able to access the admin
              panel.
            </p>
            <div className="w-full">
              <label className="block font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">
                Reason for deactivation
              </label>
              <textarea
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 bg-[#080c10] border border-[#1e2d40] rounded font-mono text-[11px] text-[#e8edf3] placeholder:text-[#5a7090] focus:outline-none focus:border-[#ff4757]"
                placeholder="Enter the reason for deactivation..."
              />
            </div>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setShowDeactivateModal(false)}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={actionLoading || !deactivationReason.trim()}
                className="flex-1 px-3 py-2 rounded border border-[rgba(255,71,87,0.3)] bg-[#ff4757] text-white font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#ff3545] transition-all disabled:opacity-50"
              >
                {actionLoading ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign Role Modal */}
      {showAssignRoleModal && (
        <Modal onClose={() => setShowAssignRoleModal(false)} title="Assign Role">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(61,157,243,0.15)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#3d9df3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <p className="font-mono text-[11px] text-[#8fa3b8] text-center">
              Select a role to assign to {user.firstName} {user.lastName}.
            </p>
            {availableRoles.length === 0 ? (
              <p className="font-mono text-[10px] text-[#5a7090]">No more roles available to assign.</p>
            ) : (
              <ul className="w-full max-h-60 overflow-y-auto space-y-2">
                {availableRoles.map((role) => (
                  <li key={role.id}>
                    <button
                      onClick={() => handleAssignRole(role.id)}
                      disabled={actionLoading}
                      className="w-full text-left p-3 rounded border border-[#1e2d40] hover:border-[#3d9df3] hover:bg-[rgba(61,157,243,0.10)] transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-[11px] font-semibold text-[#e8edf3]">{role.name}</p>
                          <p className="font-mono text-[9px] text-[#5a7090]">
                            Level {role.hierarchyLevel} · {role.code}
                          </p>
                        </div>
                        {role.isSystem && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[rgba(61,157,243,0.10)] text-[#3d9df3] font-mono text-[8px] font-bold">
                            System
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setShowAssignRoleModal(false)}
              className="w-full px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Remove Role Modal */}
      {showRemoveRoleModal && roleToRemove && (
        <Modal onClose={() => setShowRemoveRoleModal(false)} title="Remove Role" danger>
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(255,71,87,0.15)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#ff4757]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="font-mono text-[11px] text-[#8fa3b8] text-center">
              Are you sure you want to remove the role &ldquo;{roleToRemove.name}&rdquo; from {user.firstName} {user.lastName}?
            </p>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setShowRemoveRoleModal(false)}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveRole}
                disabled={actionLoading}
                className="flex-1 px-3 py-2 rounded border border-[rgba(255,71,87,0.3)] bg-[#ff4757] text-white font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#ff3545] transition-all disabled:opacity-50"
              >
                {actionLoading ? "Removing..." : "Remove Role"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-wider text-[#5a7090] mb-1">{label}</dt>
      <dd className="font-mono text-[10px] text-[#e8edf3]">{value}</dd>
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick?: () => void; disabled?: boolean }) {
  const icons = {
    key: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    ),
    envelope: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    ),
    clock: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-2 flex items-center gap-2 text-[#8fa3b8] hover:bg-[#0d1117] rounded transition-colors disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[icon as keyof typeof icons]}
      </svg>
      <span className="font-mono text-[11px]">{label}</span>
    </button>
  );
}

function getMfaTypeLabel(type: string) {
  const labels: Record<string, string> = {
    Totp: "Authenticator App (TOTP)",
    WebAuthn: "Security Key (WebAuthn)",
    BackupCode: "Backup Codes",
    EmailVerificationCode: "Email Verification",
    PhoneVerificationCode: "Phone Verification",
  };
  return labels[type] || type;
}

function MfaTypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    Totp: (
      <svg className="w-4 h-4 text-[#3d9df3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    WebAuthn: (
      <svg className="w-4 h-4 text-[#a78bfa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    BackupCode: (
      <svg className="w-4 h-4 text-[#f5a623]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };
  return <>{icons[type] || icons.Totp}</>;
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: "Active", bg: "rgba(0,229,160,0.10)", color: "#00e5a0", border: "rgba(0,229,160,0.3)" },
    invited: { label: "Invited", bg: "rgba(61,157,243,0.10)", color: "#3d9df3", border: "rgba(61,157,243,0.3)" },
    suspended: { label: "Suspended", bg: "rgba(245,166,35,0.10)", color: "#f5a623", border: "rgba(245,166,35,0.3)" },
    deactivated: { label: "Deactivated", bg: "rgba(90,112,144,0.10)", color: "#5a7090", border: "rgba(90,112,144,0.3)" },
  };

  const { label, bg, color, border } = config[status as keyof typeof config] || config.active;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold uppercase tracking-wide"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}

function Modal({
  children,
  onClose,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#131920] border border-[#1e2d40] rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#1e2d40]">
          <h3 className="font-mono text-sm font-semibold text-[#e8edf3]">{title}</h3>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
