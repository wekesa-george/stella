"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getEscalationMatrix,
  createEscalationRule,
  updateEscalationRule,
  deleteEscalationRule,
  previewEscalationChain,
} from "@/lib/stellaAdminApi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================================
// Types
// ============================================================================

interface EscalationRule {
  id: string;
  priority: string;
  category: string | null;
  tier: number;
  targetRoleId: string | null;
  targetUserId: string | null;
  notificationChannels: string[];
  responseTimeMins: number;
  autoEscalateToTier: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const PRIORITIES = ["P1", "P2", "P3", "P4"];
const CATEGORIES = [
  "bot_error",
  "rogue_bot",
  "kill_switch",
  "api_issue",
  "pnl_loss_limit",
  "balance",
  "security",
  "other",
];
const CHANNELS = ["ntfy", "slack", "email", "pagerduty"];
const ROLES: Record<string, string> = {
  operations_manager: "Operations Manager",
  risk_officer: "Risk Officer",
  super_admin: "Super Admin",
  compliance_officer: "Compliance Officer",
  support_agent: "Support Agent",
  finance_manager: "Finance Manager",
  strategy_curator: "Strategy Curator",
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#ff4757",
  P2: "#f5a623",
  P3: "#3d9df3",
  P4: "#5a7090",
};

const CHANNEL_ICONS: Record<string, string> = {
  ntfy: "N",
  slack: "S",
  email: "E",
  pagerduty: "P",
};

// ============================================================================
// Components
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || "#5a7090";
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {priority}
    </span>
  );
}

function ChannelBadges({ channels }: { channels: string[] }) {
  return (
    <div className="flex gap-1">
      {channels.map((ch) => (
        <span
          key={ch}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-mono font-bold bg-[#1e2d40] text-[#8fa3b8] border border-[#253550]"
          title={ch}
        >
          {CHANNEL_ICONS[ch] || ch[0]?.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Edit Dialog
// ============================================================================

function RuleDialog({
  open,
  onClose,
  onSave,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<EscalationRule>) => Promise<void>;
  rule: EscalationRule | null;
}) {
  const [priority, setPriority] = useState(rule?.priority || "P1");
  const [category, setCategory] = useState(rule?.category || "");
  const [tier, setTier] = useState(String(rule?.tier || 1));
  const [targetRole, setTargetRole] = useState(rule?.targetRoleId || "");
  const [channels, setChannels] = useState<string[]>(rule?.notificationChannels || ["ntfy"]);
  const [responseTime, setResponseTime] = useState(String(rule?.responseTimeMins || 15));
  const [autoEscalate, setAutoEscalate] = useState(rule?.autoEscalateToTier ? String(rule.autoEscalateToTier) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPriority(rule?.priority || "P1");
    setCategory(rule?.category || "");
    setTier(String(rule?.tier || 1));
    setTargetRole(rule?.targetRoleId || "");
    setChannels(rule?.notificationChannels || ["ntfy"]);
    setResponseTime(String(rule?.responseTimeMins || 15));
    setAutoEscalate(rule?.autoEscalateToTier ? String(rule.autoEscalateToTier) : "");
  }, [rule, open]);

  const toggleChannel = (ch: string) => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        priority,
        category: category || null,
        tier: Number(tier),
        targetRoleId: targetRole || null,
        notificationChannels: channels,
        responseTimeMins: Number(responseTime),
        autoEscalateToTier: autoEscalate ? Number(autoEscalate) : null,
        isActive: true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d1117] border-[#1e2d40] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm text-[#e8edf3]">
            {rule ? "Edit Escalation Rule" : "Add Escalation Rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#131920] border-[#1e2d40]">
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs font-mono text-[#e8edf3]">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#131920] border-[#1e2d40]">
                  {[1, 2, 3, 4, 5].map((t) => (
                    <SelectItem key={t} value={String(t)} className="text-xs font-mono text-[#e8edf3]">
                      Tier {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Category (blank = all)</Label>
            <Select value={category || "__all__"} onValueChange={(v) => setCategory(v === "__all__" ? "" : v)}>
              <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#131920] border-[#1e2d40]">
                <SelectItem value="__all__" className="text-xs font-mono text-[#8fa3b8]">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs font-mono text-[#e8edf3]">
                    {c.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Target Role</Label>
            <Select value={targetRole || "__none__"} onValueChange={(v) => setTargetRole(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#131920] border-[#1e2d40]">
                <SelectItem value="__none__" className="text-xs font-mono text-[#8fa3b8]">No role</SelectItem>
                {Object.entries(ROLES).map(([code, name]) => (
                  <SelectItem key={code} value={code} className="text-xs font-mono text-[#e8edf3]">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] uppercase text-[#5a7090] font-mono mb-1.5 block">Notification Channels</Label>
            <div className="flex gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                    channels.includes(ch)
                      ? "bg-[rgba(61,157,243,0.15)] border-[#3d9df3] text-[#3d9df3]"
                      : "bg-[#131920] border-[#1e2d40] text-[#5a7090]"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Response SLA (min)</Label>
              <Input
                className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8"
                type="number"
                value={responseTime}
                onChange={(e) => setResponseTime(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-[#5a7090] font-mono">Auto-escalate to tier</Label>
              <Select value={autoEscalate || "__none__"} onValueChange={(v) => setAutoEscalate(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-xs font-mono h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#131920] border-[#1e2d40]">
                  <SelectItem value="__none__" className="text-xs font-mono text-[#8fa3b8]">None</SelectItem>
                  {[2, 3, 4, 5].map((t) => (
                    <SelectItem key={t} value={String(t)} className="text-xs font-mono text-[#e8edf3]">
                      Tier {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs border-[#1e2d40] text-[#8fa3b8]">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || channels.length === 0}
            className="text-xs bg-[#3d9df3] text-white hover:bg-[#2d8de3]"
          >
            {saving ? "Saving..." : rule ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Preview Panel
// ============================================================================

function PreviewPanel() {
  const [priority, setPriority] = useState("P1");
  const [category, setCategory] = useState("");
  const [chain, setChain] = useState<EscalationRule[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await previewEscalationChain(priority, category || undefined);
      setChain(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setChain([] as EscalationRule[]);
    } finally {
      setLoading(false);
    }
  }, [priority, category]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  return (
    <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e2d40] flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">Escalation Preview</span>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-[10px] font-mono h-6 w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#131920] border-[#1e2d40]">
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="text-[10px] font-mono text-[#e8edf3]">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category || "__all__"} onValueChange={(v) => setCategory(v === "__all__" ? "" : v)}>
          <SelectTrigger className="bg-[#131920] border-[#1e2d40] text-[#e8edf3] text-[10px] font-mono h-6 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#131920] border-[#1e2d40]">
            <SelectItem value="__all__" className="text-[10px] font-mono text-[#8fa3b8]">All</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="text-[10px] font-mono text-[#e8edf3]">{c.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 bg-[#1e2d40]" />
            <Skeleton className="h-8 bg-[#1e2d40]" />
          </div>
        ) : chain.length === 0 ? (
          <p className="text-[10px] text-[#5a7090] font-mono">No escalation rules defined for this combination.</p>
        ) : (
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-2 top-1 bottom-1 w-px bg-[#253550]" />
            {chain.map((rule, i) => (
              <div key={rule.id} className="relative mb-4 last:mb-0">
                {/* Dot */}
                <div
                  className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full border-2"
                  style={{
                    borderColor: PRIORITY_COLORS[rule.priority] || "#5a7090",
                    backgroundColor: i === 0 ? PRIORITY_COLORS[rule.priority] : "transparent",
                  }}
                />
                <div className="bg-[#131920] border border-[#1e2d40] rounded px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold text-[#e8edf3]">Tier {rule.tier}</span>
                    <span className="text-[10px] font-mono text-[#5a7090]">SLA: {rule.responseTimeMins} min</span>
                    {rule.autoEscalateToTier && (
                      <span className="text-[9px] font-mono text-[#f5a623]">auto → T{rule.autoEscalateToTier}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChannelBadges channels={rule.notificationChannels} />
                    {rule.targetRoleId && (
                      <span className="text-[10px] font-mono text-[#8fa3b8]">
                        {Object.entries(ROLES).find(([, v]) => rule.targetRoleId?.includes(v))?.[1] || rule.targetRoleId?.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function EscalationMatrixPage() {
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<EscalationRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEscalationMatrix();
      setRules(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setRules([] as EscalationRule[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreate = async (data: Partial<EscalationRule>) => {
    await createEscalationRule(data);
    await loadRules();
  };

  const handleUpdate = async (data: Partial<EscalationRule>) => {
    if (!editingRule) return;
    await updateEscalationRule(editingRule.id, data);
    await loadRules();
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteEscalationRule(id);
      await loadRules();
    } finally {
      setDeleting(null);
    }
  };

  // Group rules by priority
  const grouped = PRIORITIES.map((p) => ({
    priority: p,
    rules: rules.filter((r) => r.priority === p).sort((a, b) => a.tier - b.tier),
  })).filter((g) => g.rules.length > 0);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[11px] md:text-[13px] font-semibold text-[#e8edf3] tracking-wider mb-1">
            Escalation Matrix
          </div>
          <div className="font-mono text-[10px] text-[#5a7090]">
            Define who gets notified at each tier when incidents are escalated. Auto-escalation triggers if no acknowledgment within SLA.
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="text-xs bg-[#3d9df3] text-white hover:bg-[#2d8de3] font-mono"
        >
          + Add Rule
        </Button>
      </div>

      {/* Preview */}
      <PreviewPanel />

      {/* Rules table */}
      <div className="bg-[#0d1117] border border-[#1e2d40] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2d40]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#8fa3b8]">
            All Rules ({rules.length})
          </span>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 bg-[#1e2d40]" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[11px] text-[#5a7090] font-mono">No escalation rules defined.</p>
            <p className="text-[10px] text-[#5a7090] font-mono mt-1">Click "Add Rule" to set up your escalation matrix.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#1e2d40] hover:bg-transparent">
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Priority</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Category</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Tier</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Channels</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">SLA</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Auto</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8">Status</TableHead>
                <TableHead className="text-[10px] font-mono text-[#5a7090] uppercase tracking-wider h-8 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((group) =>
                group.rules.map((rule, idx) => (
                  <TableRow
                    key={rule.id}
                    className="border-b border-[#1e2d40]/50 hover:bg-[#131920] cursor-pointer"
                    onClick={() => setEditingRule(rule)}
                  >
                    <TableCell className="py-2">
                      {idx === 0 && <PriorityBadge priority={rule.priority} />}
                    </TableCell>
                    <TableCell className="py-2 text-[10px] font-mono text-[#8fa3b8]">
                      {rule.category ? rule.category.replace(/_/g, " ") : <span className="text-[#5a7090]">all</span>}
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-[10px] font-mono font-bold text-[#e8edf3]">T{rule.tier}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <ChannelBadges channels={rule.notificationChannels} />
                    </TableCell>
                    <TableCell className="py-2 text-[10px] font-mono text-[#8fa3b8]">
                      {rule.responseTimeMins} min
                    </TableCell>
                    <TableCell className="py-2 text-[10px] font-mono">
                      {rule.autoEscalateToTier ? (
                        <span className="text-[#f5a623]">→ T{rule.autoEscalateToTier}</span>
                      ) : (
                        <span className="text-[#5a7090]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono ${
                          rule.isActive
                            ? "border-[#00e5a0] text-[#00e5a0]"
                            : "border-[#5a7090] text-[#5a7090]"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[10px] text-[#ff4757] hover:text-[#ff6b6b] hover:bg-[rgba(255,71,87,0.1)] h-6 px-2"
                        disabled={deleting === rule.id}
                        onClick={() => handleDelete(rule.id)}
                      >
                        {deleting === rule.id ? "..." : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <RuleDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        rule={null}
      />

      {/* Edit dialog */}
      <RuleDialog
        open={!!editingRule}
        onClose={() => setEditingRule(null)}
        onSave={handleUpdate}
        rule={editingRule}
      />
    </div>
  );
}
