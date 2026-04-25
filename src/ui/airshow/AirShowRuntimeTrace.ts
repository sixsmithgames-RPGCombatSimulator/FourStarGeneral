import type { PlannedAirShowScene, ResolvedAirShowScene } from "./AirShowPlaybackScene";

export interface AirShowRuntimeTraceActorState {
  readonly actorId: string;
  readonly flightId: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly active: boolean;
  readonly headingDegrees: number;
  readonly cx: number;
  readonly cy: number;
  readonly opacity: string | null;
  readonly dataAirshowActive: string | null;
}

export interface AirShowRuntimeTracePhaseSummary {
  readonly label: string;
  readonly durationMs: number;
  readonly visibleActorIds: readonly string[];
  readonly assignmentActorIds: readonly string[];
}

export interface AirShowRuntimeTraceFlightSummary {
  readonly flightId: string;
  readonly role: "interceptor" | "escort" | "bomber";
  readonly combatRole: string;
  readonly faction: string;
  readonly actorIds: readonly string[];
}

export type AirShowRuntimeTraceEvent =
  | {
      readonly kind: "runtime-flight-build-skipped";
      readonly flightId: string;
      readonly role: "interceptor" | "escort" | "bomber";
      readonly combatRole: string;
      readonly faction: string;
      readonly scenarioType: string;
      readonly actorIds: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: "runtime-flight-built";
      readonly flightId: string;
      readonly role: "interceptor" | "escort" | "bomber";
      readonly combatRole: string;
      readonly faction: string;
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "phase-start";
      readonly label: string;
      readonly durationMs: number;
      readonly assignmentActorIds: readonly string[];
      readonly visibleActorIds: readonly string[];
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "phase-visibility-sync";
      readonly label: string;
      readonly visibleActorIds: readonly string[];
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "phase-visibility-expanded";
      readonly label: string;
      readonly requestedVisibleActorIds: readonly string[];
      readonly resolvedVisibleActorIds: readonly string[];
      readonly addedActiveActorIds: readonly string[];
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "phase-complete";
      readonly label: string;
      readonly requestedDurationMs: number;
      readonly elapsedMs: number;
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "strength-sync";
      readonly flightId: string;
      readonly previousStrength: number;
      readonly targetStrength: number;
      readonly targetVisibleCount: number;
      readonly activeActorIds: readonly string[];
      readonly removedActorIds: readonly string[];
    }
  | {
      readonly kind: "actor-fade-out";
      readonly actorState: AirShowRuntimeTraceActorState;
    }
  | {
      readonly kind: "scene-complete";
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    }
  | {
      readonly kind: "scene-cleanup";
      readonly actorStates: readonly AirShowRuntimeTraceActorState[];
    };

export interface AirShowRuntimeTraceEventRecord {
  readonly index: number;
  readonly event: AirShowRuntimeTraceEvent;
}

export interface AirShowRuntimeTrace {
  readonly version: 1;
  readonly recordedAtIso: string;
  readonly source: "HexMapRenderer.animatePlannedResolvedAirCombatShow";
  readonly scene: {
    readonly hexKey: string;
    readonly kind: ResolvedAirShowScene["kind"] | null;
    readonly bomberTargetHexKey: string | null;
    readonly playerHqKey: string | null;
    readonly botHqKey: string | null;
  };
  readonly planned: {
    readonly flights: readonly AirShowRuntimeTraceFlightSummary[];
    readonly phases: readonly AirShowRuntimeTracePhaseSummary[];
  };
  readonly events: readonly AirShowRuntimeTraceEventRecord[];
  readonly status: "success" | "error";
  readonly error: string | null;
}

export interface AirShowRuntimeTraceDebugHook {
  clear(): void;
  disable(): void;
  downloadLatest(fileName?: string): boolean;
  enable(): void;
  exportLatest(pretty?: boolean): string | null;
  getHistory(): readonly AirShowRuntimeTrace[];
  getLatest(): AirShowRuntimeTrace | null;
  isEnabled(): boolean;
}

export interface AirShowRuntimeTraceSession {
  trace: {
    version: 1;
    recordedAtIso: string;
    source: "HexMapRenderer.animatePlannedResolvedAirCombatShow";
    scene: AirShowRuntimeTrace["scene"];
    planned: AirShowRuntimeTrace["planned"];
    events: AirShowRuntimeTraceEventRecord[];
    status: "success" | "error";
    error: string | null;
  };
}

type AirShowRuntimeTraceStore = {
  enabled: boolean;
  traces: AirShowRuntimeTrace[];
};

const MAX_RUNTIME_TRACE_HISTORY = 5;
const runtimeTraceStore: AirShowRuntimeTraceStore = {
  enabled: true,
  traces: []
};

declare global {
  interface Window {
    __FSG_AIRSHOW_RUNTIME_TRACE__?: AirShowRuntimeTraceDebugHook;
  }
}

function cloneTrace<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function buildDebugHook(): AirShowRuntimeTraceDebugHook {
  return {
    clear(): void {
      runtimeTraceStore.traces.length = 0;
    },
    disable(): void {
      runtimeTraceStore.enabled = false;
    },
    downloadLatest(fileName = "fsg-airshow-runtime-trace.json"): boolean {
      if (typeof window === "undefined") {
        return false;
      }
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      if (!latest) {
        return false;
      }
      const blob = new Blob([JSON.stringify(latest, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      return true;
    },
    enable(): void {
      runtimeTraceStore.enabled = true;
    },
    exportLatest(pretty = true): string | null {
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      return latest ? JSON.stringify(latest, null, pretty ? 2 : 0) : null;
    },
    getHistory(): readonly AirShowRuntimeTrace[] {
      return runtimeTraceStore.traces.map((trace) => cloneTrace(trace));
    },
    getLatest(): AirShowRuntimeTrace | null {
      const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
      return latest ? cloneTrace(latest) : null;
    },
    isEnabled(): boolean {
      return runtimeTraceStore.enabled;
    }
  };
}

export function installAirShowRuntimeTraceDebugHook(
  targetWindow: Window & typeof globalThis = window
): AirShowRuntimeTraceDebugHook {
  if (!targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__) {
    targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__ = buildDebugHook();
  }
  return targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__;
}

export function beginAirShowRuntimeTrace(
  scene: ResolvedAirShowScene,
  plannedScene: PlannedAirShowScene
): AirShowRuntimeTraceSession | null {
  if (!runtimeTraceStore.enabled) {
    return null;
  }
  return {
    trace: {
      version: 1,
      recordedAtIso: new Date().toISOString(),
      source: "HexMapRenderer.animatePlannedResolvedAirCombatShow",
      scene: {
        hexKey: scene.hexKey,
        kind: scene.kind ?? null,
        bomberTargetHexKey: scene.bomberTargetHexKey ?? scene.bomber?.targetHexKey ?? null,
        playerHqKey: scene.playerHqKey ?? null,
        botHqKey: scene.botHqKey ?? null
      },
      planned: {
        flights: plannedScene.flights.map((flight) => ({
          flightId: flight.id,
          role: flight.role,
          combatRole: flight.combatRole ?? flight.role,
          faction: flight.faction ?? "",
          actorIds: flight.actors.map((actor) => actor.actorId)
        })),
        phases: plannedScene.phases.map((phase) => ({
          label: phase.label,
          durationMs: phase.durationMs,
          visibleActorIds: [...phase.visibleActorIds],
          assignmentActorIds: phase.assignments.map((assignment) => assignment.actorId)
        }))
      },
      events: [],
      status: "success",
      error: null
    }
  };
}

export function recordAirShowRuntimeTraceEvent(
  session: AirShowRuntimeTraceSession | null,
  event: AirShowRuntimeTraceEvent
): void {
  if (!session || !runtimeTraceStore.enabled) {
    return;
  }
  session.trace.events.push({
    index: session.trace.events.length,
    event: cloneTrace(event)
  });
}

export function completeAirShowRuntimeTrace(
  session: AirShowRuntimeTraceSession | null,
  status: "success" | "error",
  error: string | null = null
): void {
  if (!session || !runtimeTraceStore.enabled) {
    return;
  }
  session.trace.status = status;
  session.trace.error = error;
  runtimeTraceStore.traces.push(cloneTrace(session.trace));
  while (runtimeTraceStore.traces.length > MAX_RUNTIME_TRACE_HISTORY) {
    runtimeTraceStore.traces.shift();
  }
}
