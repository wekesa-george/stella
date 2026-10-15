"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { TrainingScenario, TrainingEvent, ExpectedAction } from "./scenarios";
import { TRAINING_SCENARIOS } from "./scenarios";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionLog {
  actionId: string;
  completedAt: number;       // ms since scenario start
  label: string;
}

export interface TrainingSession {
  scenarioId: string;
  startedAt: number;         // Date.now()
  completedActions: ActionLog[];
  firedEventIndices: number[];
  narrationLog: string[];
  score: number | null;      // null until scenario ends
  status: "running" | "completed" | "aborted";
}

interface InjectedAlerts {
  alerts: Array<Record<string, any>>;
  incidents: Array<Record<string, any>>;
  botOverrides: Map<string, Record<string, any>>;
  exchangeOverrides: Map<string, Record<string, any>>;
  serviceOverrides: Map<string, Record<string, any>>;
  metricOverrides: Record<string, any>;
}

export interface TrainingContextValue {
  /** Whether training mode is active */
  isTrainingMode: boolean;
  /** Toggle training mode on/off */
  toggleTrainingMode: () => void;

  /** Currently running scenario (null if none) */
  activeScenario: TrainingScenario | null;
  /** Session state */
  session: TrainingSession | null;

  /** Start a scenario */
  startScenario: (scenarioId: string) => void;
  /** Abort current scenario */
  abortScenario: () => void;

  /** Mark an expected action as completed */
  completeAction: (actionId: string) => void;

  /** Injected data for the dashboard to merge */
  injected: InjectedAlerts;

  /** Current narration text */
  currentNarration: string;

  /** All available scenarios */
  scenarios: TrainingScenario[];

  /** Is an action already completed? */
  isActionCompleted: (actionId: string) => boolean;

  /** Get action score details for debriefing */
  getScoreDetails: () => { action: ExpectedAction; completed: ActionLog | null; score: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const TrainingContext = createContext<TrainingContextValue | null>(null);

export function useTraining(): TrainingContextValue {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error("useTraining must be inside TrainingProvider");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [activeScenario, setActiveScenario] = useState<TrainingScenario | null>(null);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentNarration, setCurrentNarration] = useState("");
  const [injected, setInjected] = useState<InjectedAlerts>({
    alerts: [],
    incidents: [],
    botOverrides: new Map(),
    exchangeOverrides: new Map(),
    serviceOverrides: new Map(),
    metricOverrides: {},
  });

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear all scheduled event timers
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Toggle training mode
  const toggleTrainingMode = useCallback(() => {
    setIsTrainingMode(prev => {
      if (prev) {
        // Turning off — abort any running scenario
        clearTimers();
        setActiveScenario(null);
        setSession(null);
        setCurrentNarration("");
        setInjected({
          alerts: [],
          incidents: [],
          botOverrides: new Map(),
          exchangeOverrides: new Map(),
          serviceOverrides: new Map(),
          metricOverrides: {},
        });
      }
      return !prev;
    });
  }, [clearTimers]);

  // Fire a training event — inject into local state
  const fireEvent = useCallback((event: TrainingEvent, eventIndex: number) => {
    setCurrentNarration(event.narration);

    setSession(prev => {
      if (!prev || prev.status !== "running") return prev;
      return { ...prev, firedEventIndices: [...prev.firedEventIndices, eventIndex], narrationLog: [...prev.narrationLog, event.narration] };
    });

    setInjected(prev => {
      const next = { ...prev };

      switch (event.type) {
        case "alert":
          next.alerts = [...prev.alerts, {
            ...event.payload,
            isTraining: true,
            created_at: new Date().toISOString(),
          }];
          break;

        case "incident":
          next.incidents = [...prev.incidents, {
            ...event.payload,
            isTraining: true,
            created_at: event.payload.created_at || new Date().toISOString(),
          }];
          break;

        case "bot_status": {
          const bots = new Map(prev.botOverrides);
          bots.set(event.payload.botId, { ...event.payload, isTraining: true });
          next.botOverrides = bots;
          break;
        }

        case "exchange_health": {
          const exch = new Map(prev.exchangeOverrides);
          exch.set(event.payload.exchange, { ...event.payload, isTraining: true });
          next.exchangeOverrides = exch;
          break;
        }

        case "service_health": {
          const svc = new Map(prev.serviceOverrides);
          svc.set(event.payload.service, { ...event.payload, isTraining: true });
          next.serviceOverrides = svc;
          break;
        }

        case "metric_change":
          next.metricOverrides = { ...prev.metricOverrides, ...event.payload };
          break;
      }

      return next;
    });
  }, []);

  // Start a scenario
  const startScenario = useCallback((scenarioId: string) => {
    const scenario = TRAINING_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) return;

    // Clear any previous state
    clearTimers();
    setInjected({
      alerts: [],
      incidents: [],
      botOverrides: new Map(),
      exchangeOverrides: new Map(),
      serviceOverrides: new Map(),
      metricOverrides: {},
    });

    const startTime = Date.now();

    setActiveScenario(scenario);
    setSession({
      scenarioId,
      startedAt: startTime,
      completedActions: [],
      firedEventIndices: [],
      narrationLog: [],
      score: null,
      status: "running",
    });

    // Schedule all events
    const timers = scenario.events.map((event, idx) => {
      return setTimeout(() => fireEvent(event, idx), event.delaySeconds * 1000);
    });

    // Schedule scenario end (last event + 60s buffer for operator to complete actions)
    const lastEventTime = Math.max(...scenario.events.map(e => e.delaySeconds));
    const endTimer = setTimeout(() => {
      setSession(prev => {
        if (!prev || prev.status !== "running") return prev;
        return { ...prev, status: "completed" };
      });
    }, (lastEventTime + 120) * 1000);

    timersRef.current = [...timers, endTimer];
  }, [clearTimers, fireEvent]);

  // Abort scenario
  const abortScenario = useCallback(() => {
    clearTimers();
    setSession(prev => prev ? { ...prev, status: "aborted" } : null);
    setCurrentNarration("");
    setInjected({
      alerts: [],
      incidents: [],
      botOverrides: new Map(),
      exchangeOverrides: new Map(),
      serviceOverrides: new Map(),
      metricOverrides: {},
    });
    setActiveScenario(null);
    setSession(null);
  }, [clearTimers]);

  // Complete an action
  const completeAction = useCallback((actionId: string) => {
    setSession(prev => {
      if (!prev || prev.status !== "running") return prev;
      if (prev.completedActions.some(a => a.actionId === actionId)) return prev;

      const scenario = TRAINING_SCENARIOS.find(s => s.id === prev.scenarioId);
      const expected = scenario?.expectedActions.find(a => a.id === actionId);

      return {
        ...prev,
        completedActions: [
          ...prev.completedActions,
          {
            actionId,
            completedAt: Date.now() - prev.startedAt,
            label: expected?.label || actionId,
          },
        ],
      };
    });
  }, []);

  const isActionCompleted = useCallback((actionId: string) => {
    return session?.completedActions.some(a => a.actionId === actionId) ?? false;
  }, [session]);

  // Score calculation
  const getScoreDetails = useCallback(() => {
    if (!activeScenario || !session) return [];

    return activeScenario.expectedActions.map(action => {
      const completed = session.completedActions.find(a => a.actionId === action.id) || null;

      let score = 0;
      if (completed) {
        const elapsedSeconds = completed.completedAt / 1000;
        if (elapsedSeconds <= action.targetSeconds) {
          score = 100; // perfect
        } else if (elapsedSeconds <= action.targetSeconds * 1.5) {
          score = 75; // slightly late
        } else if (elapsedSeconds <= action.targetSeconds * 2) {
          score = 50; // late
        } else {
          score = 25; // very late but completed
        }
      }

      return { action, completed, score };
    });
  }, [activeScenario, session]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const value: TrainingContextValue = {
    isTrainingMode,
    toggleTrainingMode,
    activeScenario,
    session,
    startScenario,
    abortScenario,
    completeAction,
    injected,
    currentNarration,
    scenarios: TRAINING_SCENARIOS,
    isActionCompleted,
    getScoreDetails,
  };

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}
