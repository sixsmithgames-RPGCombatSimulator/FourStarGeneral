import type { Axial, ScenarioData, ScenarioUnit } from "../../core/types";
import type {
  AirEngagementEvent,
  AirMissionArrival,
  SerializedAirMission
} from "../../game/GameEngine";
import type { ResolvedAirShowScene } from "./AirShowPlaybackScene";

export interface AirShowPlaybackOperationSnapshot {
  readonly kind: "linkedStrike" | "flight" | "event";
  readonly index: number;
  readonly focusKey: string | null;
  readonly focusHex: Axial | null;
  readonly missionId: string | null;
  readonly unitKey: string | null;
  readonly unitType: string | null;
  readonly eventType: AirEngagementEvent["type"] | null;
  readonly bomberUnitKey: string | null;
  readonly escortUnitKeys: readonly string[];
  readonly interceptorUnitKeys: readonly string[];
  readonly linkedEventTypes: readonly AirEngagementEvent["type"][];
}

export interface AirShowCoordinatedPlanSnapshot {
  readonly focusKey: string | null;
  readonly strikeMissionIds: readonly string[];
  readonly handledOperationIndices: readonly number[];
  readonly residualOperationIndices: readonly number[];
  readonly bomberStartDelayMs: number;
  readonly fighterIngressLeadMs: number;
  readonly scene: ResolvedAirShowScene | null;
}

export interface AirShowPlaybackClusterSnapshot {
  readonly focusKey: string | null;
  readonly operationIndices: readonly number[];
  readonly operations: readonly AirShowPlaybackOperationSnapshot[];
  readonly coordinatedPlan: AirShowCoordinatedPlanSnapshot | null;
  readonly executionMode: "coordinated" | "parallel";
}

export interface AirShowPlaybackContractViolation {
  readonly code: "linked-escort-missing-from-event";
  readonly message: string;
  readonly missionId: string | null;
  readonly eventType: AirEngagementEvent["type"];
  readonly unitKeys: readonly string[];
}

export interface AirShowResolvedEventSceneCapture {
  readonly missionId: string | null;
  readonly eventType: AirEngagementEvent["type"];
  readonly locKey: string;
  readonly linkedEscortMissionIds: readonly string[];
  readonly linkedEscortUnitKeys: readonly string[];
  readonly missingLinkedEscortUnitKeys: readonly string[];
  readonly bomberPassAvailable: boolean;
  readonly scene: ResolvedAirShowScene;
}

export interface AirShowPlaybackCapture {
  readonly version: 1;
  readonly recordedAtIso: string;
  readonly missionKey: string;
  readonly source: "BattleScreen.playAirOperations";
  readonly scenario: ScenarioData;
  readonly arrivals: readonly AirMissionArrival[];
  readonly events: readonly AirEngagementEvent[];
  readonly playerUnits: readonly ScenarioUnit[];
  readonly botUnits: readonly ScenarioUnit[];
  readonly allyUnits: readonly ScenarioUnit[];
  readonly reserveUnits: readonly ScenarioUnit[];
  readonly scheduledMissionsByFaction: Readonly<{
    Player: readonly SerializedAirMission[];
    Bot: readonly SerializedAirMission[];
    Ally: readonly SerializedAirMission[];
  }>;
  readonly playerHq: Axial | null;
  readonly botHq: Axial | null;
  readonly playerHqKey: string | null;
  readonly botHqKey: string | null;
  readonly operations: readonly AirShowPlaybackOperationSnapshot[];
  readonly clusters: readonly AirShowPlaybackClusterSnapshot[];
  readonly eventSceneCaptures: readonly AirShowResolvedEventSceneCapture[];
  readonly violations: readonly AirShowPlaybackContractViolation[];
  readonly error: string | null;
}

export interface AirShowPlaybackCaptureDebugHook {
  clear(): void;
  disable(): void;
  downloadLatest(fileName?: string): boolean;
  enable(): void;
  exportLatest(pretty?: boolean): string | null;
  getHistory(): readonly AirShowPlaybackCapture[];
  getLatest(): AirShowPlaybackCapture | null;
  isEnabled(): boolean;
}

type AirShowPlaybackCaptureStore = {
  enabled: boolean;
  captures: AirShowPlaybackCapture[];
};

const MAX_CAPTURE_HISTORY = 5;
const captureStore: AirShowPlaybackCaptureStore = {
  enabled: true,
  captures: []
};

declare global {
  interface Window {
    __FSG_AIRSHOW_CAPTURE__?: AirShowPlaybackCaptureDebugHook;
  }
}

function cloneCapture<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function buildDebugHook(): AirShowPlaybackCaptureDebugHook {
  return {
    clear(): void {
      captureStore.captures.length = 0;
    },
    disable(): void {
      captureStore.enabled = false;
    },
    downloadLatest(fileName = "fsg-airshow-capture.json"): boolean {
      if (typeof window === "undefined") {
        return false;
      }
      const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
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
      captureStore.enabled = true;
    },
    exportLatest(pretty = true): string | null {
      const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
      return latest ? JSON.stringify(latest, null, pretty ? 2 : 0) : null;
    },
    getHistory(): readonly AirShowPlaybackCapture[] {
      return captureStore.captures.map((capture) => cloneCapture(capture));
    },
    getLatest(): AirShowPlaybackCapture | null {
      const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
      return latest ? cloneCapture(latest) : null;
    },
    isEnabled(): boolean {
      return captureStore.enabled;
    }
  };
}

export function clearAirShowPlaybackCaptures(): void {
  captureStore.captures.length = 0;
}

export function getLatestAirShowPlaybackCapture(): AirShowPlaybackCapture | null {
  const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
  return latest ? cloneCapture(latest) : null;
}

export function installAirShowPlaybackCaptureDebugHook(
  targetWindow: Window & typeof globalThis = window
): AirShowPlaybackCaptureDebugHook {
  if (!targetWindow.__FSG_AIRSHOW_CAPTURE__) {
    targetWindow.__FSG_AIRSHOW_CAPTURE__ = buildDebugHook();
  }
  return targetWindow.__FSG_AIRSHOW_CAPTURE__;
}

export function recordAirShowPlaybackCapture(capture: AirShowPlaybackCapture): void {
  if (!captureStore.enabled) {
    return;
  }
  captureStore.captures.push(cloneCapture(capture));
  while (captureStore.captures.length > MAX_CAPTURE_HISTORY) {
    captureStore.captures.shift();
  }
}
