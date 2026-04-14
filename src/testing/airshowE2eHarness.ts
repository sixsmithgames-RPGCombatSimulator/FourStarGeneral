import { BattleScreen } from "../ui/screens/BattleScreen";
import {
  HexMapRenderer,
  type AirShowInspectionReport,
  type ResolvedAirShowScene
} from "../rendering/HexMapRenderer";
import { buildAirshowHarnessFixture } from "./airshowHarnessFixture";

interface AirshowActorSnapshot {
  readonly actorId: string;
  readonly role: string;
  readonly combatRole: string;
  readonly flightId: string;
  readonly active: boolean;
  readonly opacity: string;
}

interface AirshowStartResult {
  readonly missionId: string;
  readonly phaseLabels: readonly string[];
  readonly targetRunSampleMs: number;
  readonly bomberIngressActorCount: number;
}

interface AirshowE2EHarness {
  startScenario(): Promise<AirshowStartResult>;
  getActorSnapshot(): readonly AirshowActorSnapshot[];
  waitForCompletion(): Promise<void>;
  waitForPhase(label: string): Promise<void>;
  getInspectionSummary(): { readonly phaseLabels: readonly string[] } | null;
}

declare global {
  interface Window {
    __FSG_AIRSHOW_E2E__?: AirshowE2EHarness;
  }
}

const fixture = buildAirshowHarnessFixture();

let activeRenderer: HexMapRenderer | null = null;
let activeInspection: AirShowInspectionReport | null = null;
let activeAnimation: Promise<void> | null = null;
let activePhaseLabel: string | null = null;
let restorePhaseProbe: (() => void) | null = null;

function compressSceneForHarness(scene: ResolvedAirShowScene): ResolvedAirShowScene {
  return {
    ...scene,
    fighterIngressDurationMs: 320,
    escortClashDurationMs: 920,
    bomberIngressDurationMs: 780,
    bomberPassDurationMs: 760,
    strikeRunDurationMs: 980,
    egressDurationMs: 320,
    bomberArrivalDelayMs: 160
  };
}

function ensureBattleScreenVisible(): void {
  const battleScreen = document.getElementById("battleScreen");
  if (!battleScreen) {
    throw new Error("Expected #battleScreen to exist for airshow e2e harness.");
  }
  battleScreen.classList.remove("hidden");
  battleScreen.setAttribute("aria-hidden", "false");
}

function createRenderer(): HexMapRenderer {
  const svg = document.getElementById("battleHexMap") as SVGSVGElement | null;
  const canvas = document.getElementById("battleMapCanvas") as HTMLDivElement | null;
  if (!svg || !canvas) {
    throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
  }

  const renderer = new HexMapRenderer();
  renderer.render(svg, canvas, fixture.renderScenario);
  return renderer;
}

function createSceneCaptureScreen(rendererLike: unknown): BattleScreen {
  const fakeBattleState = {
    ensureGameEngine: () => ({ getScheduledAirMissions: () => [] }),
    tryGetGameEngine: () => ({ getScheduledAirMissions: () => [] }),
    hasEngine: () => true
  } as unknown as import("../state/BattleState").BattleState;

  const screen = new BattleScreen(
    {} as never,
    fakeBattleState,
    {} as never,
    rendererLike as never,
    null,
    null,
    null,
    {} as never,
    null
  );

  (screen as unknown as Record<string, unknown>).announceAirInterceptEngagement = () => {};
  (screen as unknown as Record<string, unknown>).announceBattleUpdate = () => {};
  (screen as unknown as Record<string, unknown>).publishActivityEvent = () => {};
  (screen as unknown as Record<string, unknown>).closeSelectionIntelForAnimation = () => {};
  (screen as unknown as Record<string, unknown>).waitMs = async () => {};
  (screen as unknown as Record<string, unknown>).waitForNextFrame = async () => {};
  (screen as unknown as Record<string, unknown>).focusCameraOnHex = async () => {};
  (screen as unknown as Record<string, unknown>).renderEngineUnits = () => {};
  (screen as unknown as Record<string, unknown>).resolveAirEngagementOffsetKey = (unitKey: string) =>
    fixture.originKeysByUnitId[unitKey as keyof typeof fixture.originKeysByUnitId] ?? null;
  (screen as unknown as Record<string, unknown>).resolveAirSquadronStrength = (unitKey: string) =>
    fixture.strengthByUnitId[unitKey as keyof typeof fixture.strengthByUnitId] ?? 100;

  return screen;
}

async function captureScene(): Promise<ResolvedAirShowScene> {
  let capturedScene: ResolvedAirShowScene | null = null;
  const captureRenderer = {
    animateResolvedAirCombatShow: async (scene: ResolvedAirShowScene): Promise<void> => {
      capturedScene = scene;
    }
  };
  const screen = createSceneCaptureScreen(captureRenderer);

  await (screen as unknown as {
    playMissionAirInterceptEvent: (
      event: typeof fixture.engagement,
      locKey: string,
      renderer: unknown,
      engine: unknown,
      fallbackLaneOffsetPx: number,
      skipEscortFlights: boolean,
      announceEvent: boolean,
      bomberArrivalDelayMs: number,
      allowBomberDefensePass: boolean,
      bomberOriginKey: string | null,
      linkedEscortFlights: readonly Record<string, unknown>[],
      bomberTargetKey: string | null,
      flakEvent: typeof fixture.flakEvent
    ) => Promise<void>;
  }).playMissionAirInterceptEvent(
    fixture.engagement,
    fixture.locKey,
    captureRenderer,
    {} as never,
    0,
    false,
    false,
    fixture.bomberArrivalDelayMs,
    true,
    fixture.bomberOriginKey,
    fixture.linkedEscortFlights,
    fixture.bomberTargetKey,
    fixture.flakEvent
  );

  if (!capturedScene) {
    throw new Error("Airshow e2e harness failed to capture the resolved airshow scene.");
  }

  return capturedScene;
}

function computeTargetRunSampleMs(report: AirShowInspectionReport | null): number {
  if (!report) {
    return 2600;
  }

  const roleReadDelayMs = report.phases.some((phase) => phase.label.startsWith("escort-clash")) ? 250 : 0;
  let elapsedMs = 0;
  for (const phase of report.phases) {
    if (phase.label === "target-run") {
      return roleReadDelayMs + elapsedMs + Math.round(phase.durationMs * 0.55);
    }
    elapsedMs += phase.durationMs;
  }

  return roleReadDelayMs + Math.round(elapsedMs * 0.7);
}

function getActorSnapshot(): readonly AirshowActorSnapshot[] {
  return Array.from(document.querySelectorAll<SVGImageElement>('[data-testid="airshow-actor"]')).map((node) => ({
    actorId: node.getAttribute("data-airshow-actor-id") ?? "",
    role: node.getAttribute("data-airshow-role") ?? "",
    combatRole: node.getAttribute("data-airshow-combat-role") ?? "",
    flightId: node.getAttribute("data-airshow-flight-id") ?? "",
    active: node.getAttribute("data-airshow-active") === "true",
    opacity: window.getComputedStyle(node).opacity
  }));
}

function installPhaseProbe(renderer: HexMapRenderer, phaseLabels: readonly string[]): void {
  restorePhaseProbe?.();

  const runtimeRenderer = renderer as unknown as {
    runAirShowPhase?: (...args: unknown[]) => Promise<void>;
  };
  const originalRunAirShowPhase = runtimeRenderer.runAirShowPhase?.bind(renderer);
  if (typeof originalRunAirShowPhase !== "function") {
    restorePhaseProbe = null;
    return;
  }

  let phaseIndex = 0;
  runtimeRenderer.runAirShowPhase = async (...args: unknown[]): Promise<void> => {
    activePhaseLabel = phaseLabels[phaseIndex] ?? `phase-${phaseIndex + 1}`;
    phaseIndex += 1;
    return originalRunAirShowPhase(...args);
  };

  restorePhaseProbe = () => {
    runtimeRenderer.runAirShowPhase = originalRunAirShowPhase;
    restorePhaseProbe = null;
  };
}

async function waitForPhase(label: string): Promise<void> {
  const startedAt = performance.now();
  while (activePhaseLabel !== label) {
    if (performance.now() - startedAt > 15000) {
      throw new Error(`Timed out waiting for airshow phase "${label}". Last phase: ${activePhaseLabel ?? "none"}.`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
}

export function installAirshowE2EHarness(): void {
  ensureBattleScreenVisible();

  window.__FSG_AIRSHOW_E2E__ = {
    async startScenario(): Promise<AirshowStartResult> {
      activePhaseLabel = null;
      restorePhaseProbe?.();
      activeRenderer = createRenderer();
      const scene = compressSceneForHarness(await captureScene());
      activeInspection = (activeRenderer as unknown as {
        inspectResolvedAirCombatShow: (candidate: ResolvedAirShowScene) => AirShowInspectionReport | null;
      }).inspectResolvedAirCombatShow(scene);
      installPhaseProbe(activeRenderer, activeInspection?.phases.map((phase) => phase.label) ?? []);
      activeAnimation = activeRenderer.animateResolvedAirCombatShow(scene);
      activeAnimation.finally(() => {
        activePhaseLabel = "complete";
        restorePhaseProbe?.();
      });

      const bomberIngressPhase = activeInspection?.phases.find((phase) => phase.label === "bomber-ingress");
      const bomberIngressActorCount =
        bomberIngressPhase?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;

      return {
        missionId: fixture.missionId,
        phaseLabels: activeInspection?.phases.map((phase) => phase.label) ?? [],
        targetRunSampleMs: computeTargetRunSampleMs(activeInspection),
        bomberIngressActorCount
      };
    },
    getActorSnapshot,
    waitForPhase,
    async waitForCompletion(): Promise<void> {
      if (!activeAnimation) {
        return;
      }
      await activeAnimation;
    },
    getInspectionSummary(): { readonly phaseLabels: readonly string[] } | null {
      if (!activeInspection) {
        return null;
      }
      return {
        phaseLabels: activeInspection.phases.map((phase) => phase.label)
      };
    }
  };
}
