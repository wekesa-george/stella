export interface CurrentShift {
  id: string;
  userId: string;
  user: string;
  startTime: string;
  startTimeRaw: string;
  duration: string;
  actions: number;
  incidents: number;
}

export interface ShiftLog {
  id: string | number;
  timestamp: string;
  user: string;
  action: string;
  notes: string;
  priority: "normal" | "warning" | "critical";
}

export interface WatchItem {
  id: string | number;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
}
