"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// Mock data - would come from Logto API
const MOCK_USER = {
  id: "usr_01h8g3j9k2m4n5p6",
  firstName: "Sarah",
  lastName: "Chen",
  email: "sarah.chen@stella.io",
  phone: "+1 (555) 123-4567",
  displayName: "Sarah C.",
  timezone: "America/New_York",
  avatarUrl: null,
  status: "active",
  isSuperAdmin: true,
  mfaEnabled: true,
  forcePasswordChange: false,
  lastLoginAt: "2026-02-18T14:23:00Z",
  lastLoginIp: "192.168.1.100",
  failedLoginCount: 0,
  lockedUntil: null,
  createdAt: "2025-11-15T08:00:00Z",
  invitedAt: "2025-11-14T16:00:00Z",
  activatedAt: "2025-11-15T10:30:00Z",
  deactivatedAt: null,
  deactivationReason: null,
};

const MOCK_ROLES = [
  { id: "role_1", name: "Super Administrator", code: "super_admin", hierarchyLevel: 1, isSystem: true },
  { id: "role_2", name: "Financial Controller", code: "finance_ctrl", hierarchyLevel: 3, isSystem: false },
];

const AVAILABLE_ROLES = [
  { id: "role_3", name: "Support Manager", code: "support_mgr", hierarchyLevel: 4, isSystem: false },
  { id: "role_4", name: "Content Manager", code: "content_mgr", hierarchyLevel: 5, isSystem: false },
  { id: "role_5", name: "Analyst", code: "analyst", hierarchyLevel: 6, isSystem: false },
];

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
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [showRemoveRoleModal, setShowRemoveRoleModal] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<(typeof MOCK_ROLES)[0] | null>(null);
  const [deactivationReason, setDeactivationReason] = useState("");

  const user = MOCK_USER; // In real app, fetch by params.id

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5">
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
        <span className="text-[#8fa3b8]">Details</span>
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
          {user.status !== "deactivated" && (
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
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-[rgba(61,157,243,0.10)] text-[#3d9df3] border-[rgba(61,157,243,0.3)] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#3d9df3] hover:text-white transition-all">
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
                <DetailItem label="First Name" value={user.firstName} />
                <DetailItem label="Last Name" value={user.lastName} />
                <DetailItem label="Email" value={user.email} />
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
                  <dd className="mt-1">
                    {user.mfaEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(0,229,160,0.10)] text-[#00e5a0] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-[rgba(90,112,144,0.10)] text-[#5a7090] font-mono text-[8px] font-bold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Disabled
                      </span>
                    )}
                  </dd>
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
              {AVAILABLE_ROLES.length > 0 && (
                <button
                  onClick={() => setShowAssignRoleModal(true)}
                  className="font-mono text-[10px] font-semibold text-[#3d9df3] hover:text-[#00e5a0] transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Add Role
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              {MOCK_ROLES.length === 0 ? (
                <div>
                  <p className="font-mono text-[10px] text-[#5a7090] mb-2">No roles assigned</p>
                  {AVAILABLE_ROLES.length > 0 && (
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
                  {MOCK_ROLES.map((role) => (
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
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
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
              <ActionButton icon="key" label="Reset Password" />
              <ActionButton icon="envelope" label="Send Email" />
              <ActionButton icon="clock" label="View Activity Log" />
            </div>
          </div>
        </div>
      </div>

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <Modal onClose={() => setShowDeactivateModal(false)} title="Deactivate Admin User" danger>
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[rgba(255,71,87,0.15)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#ff4757]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
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
                className="flex-1 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
              >
                Cancel
              </button>
              <button className="flex-1 px-3 py-2 rounded border border-[rgba(255,71,87,0.3)] bg-[#ff4757] text-white font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#ff3545] transition-all">
                Deactivate
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
            {AVAILABLE_ROLES.length === 0 ? (
              <p className="font-mono text-[10px] text-[#5a7090]">No more roles available to assign.</p>
            ) : (
              <ul className="w-full max-h-60 overflow-y-auto space-y-2">
                {AVAILABLE_ROLES.map((role) => (
                  <li key={role.id}>
                    <button className="w-full text-left p-3 rounded border border-[#1e2d40] hover:border-[#3d9df3] hover:bg-[rgba(61,157,243,0.10)] transition-all">
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <p className="font-mono text-[11px] text-[#8fa3b8] text-center">
              Are you sure you want to remove the role "{roleToRemove.name}" from {user.firstName} {user.lastName}?
            </p>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setShowRemoveRoleModal(false)}
                className="flex-1 px-3 py-2 rounded border border-[#1e2d40] bg-transparent text-[#8fa3b8] font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#1a2230] hover:text-[#e8edf3] hover:border-[#253550] transition-all"
              >
                Cancel
              </button>
              <button className="flex-1 px-3 py-2 rounded border border-[rgba(255,71,87,0.3)] bg-[#ff4757] text-white font-mono text-[10px] font-semibold uppercase tracking-wide hover:bg-[#ff3545] transition-all">
                Remove Role
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

function ActionButton({ icon, label }: { icon: string; label: string }) {
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
    <button className="w-full text-left px-3 py-2 flex items-center gap-2 text-[#8fa3b8] hover:bg-[#0d1117] rounded transition-colors">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[icon as keyof typeof icons]}
      </svg>
      <span className="font-mono text-[11px]">{label}</span>
    </button>
  );
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
