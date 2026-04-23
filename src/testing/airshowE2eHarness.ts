import { BattleScreen } from "../ui/screens/BattleScreen";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import type {
  AirShowInspectionReport,
  ResolvedAirShowScene
} from "../ui/airshow/AirShowPlaybackScene";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge, type AirshowHarnessFixture } from "./airshowHarnessFixture";

interface AirshowActorSnapshot {
  readonly actorId: string;
  readonly role: string;
  readonly combatRole: string;
  readonly flightId: string;
  readonly active: boolean;
  readonly opacity: string;
}

interface AirshowSpawnSnapshot {
  readonly actorId: string;
  readonly role: string;
  readonly active: boolean;
  readonly cx: number;
  readonly cy: number;
}

interface AirshowPositionSample {
  readonly elapsedMs: number;
  readonly phaseLabel: string | null;
  readonly actors: ReadonlyArray<{
    readonly actorId: string;
    readonly role: string;
    readonly combatRole: string;
    readonly faction: string;
    readonly active: boolean;
    readonly cx: number;
    readonly cy: number;
  }>;
}

interface AirshowStartResult {
  readonly missionId: string;
  readonly phaseLabels: readonly string[];
  readonly totalDurationMs: number;
  readonly targetRunSampleMs: number;
  readonly bomberIngressActorCount: number;
  readonly hqMidX: number | null;
  readonly corridorCenterX: number | null;
}

interface AirshowE2EHarness {
  startScenario(): Promise<AirshowStartResult>;
  getActorSnapshot(): readonly AirshowActorSnapshot[];
  getSpawnSnapshot(): readonly AirshowSpawnSnapshot[];
  getPositionTimeline(): readonly AirshowPositionSample[];
  pauseAtPhaseStart(label: string): Promise<void>;
  pauseAtPhaseProgress(label: string, progress: number): Promise<void>;
  resumePhase(): void;
  waitForCompletion(): Promise<void>;
  waitForPhase(label: string): Promise<void>;
  waitForPhaseProgress(label: string, progress: number): Promise<void>;
  getInspectionSummary(): {
    readonly phaseLabels: readonly string[];
    readonly originPlan: unknown;
    readonly fighterIngressStart: ReadonlyArray<{
      readonly actorId: string;
      readonly role: string;
      readonly cx: number;
      readonly cy: number;
    }>;
  } | null;
}

declare global {
  interface Window {
    __FSG_AIRSHOW_E2E__?: AirshowE2EHarness;
  }
}

const POSITION_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_PHASE_WAIT_TIMEOUT_MS = 45000;
const PHASE_WAIT_BUFFER_MS = 4000;
const COMPLETION_WAIT_BUFFER_MS = 10000;

function compressSceneForHarness(scene: ResolvedAirShowScene): ResolvedAirShowScene {
  return scene;
}

function ensureBattleScreenVisible(): void {
  const battleScreen = document.getElementById("battleScreen");
  if (!battleScreen) {
    throw new Error("Expected #battleScreen to exist for airshow e2e harness.");
  }
  document.querySelectorAll<HTMLElement>("[id$='Screen']:not(#battleScreen), .modal-overlay, .overlay, #deploymentScreen, #campaignScreen, #mainMenuScreen").forEach((el) => {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  });
  battleScreen.classList.remove("hidden");
  battleScreen.setAttribute("aria-hidden", "false");
  battleScreen.style.zIndex = "1";
}

function createRendererForFixture(harnessFixture: AirshowHarnessFixture): HexMapRenderer { // eslint-disable-line
  const svg = document.getElementById("battleHexMap") as SVGSVGElement | null;
  const canvas = document.getElementById("battleMapCanvas") as HTMLDivElement | null;
  if (!svg || !canvas) {
    throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
  }
  const renderer = new HexMapRenderer();
  renderer.render(svg, canvas, harnessFixture.renderScenario);
  return renderer;
}

function createSceneCaptureScreenForFixture(rendererLike: unknown, harnessFixture: AirshowHarnessFixture): BattleScreen { // eslint-disable-line
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
    harnessFixture.originKeysByUnitId[unitKey as keyof typeof harnessFixture.originKeysByUnitId] ?? null;
  (screen as unknown as Record<string, unknown>).resolveAirSquadronStrength = (unitKey: string) =>
    harnessFixture.strengthByUnitId[unitKey as keyof typeof harnessFixture.strengthByUnitId] ?? 100;

  return screen;
}

async function captureSceneFromFixture(harnessFixture: AirshowHarnessFixture): Promise<ResolvedAirShowScene> {
  let capturedScene: ResolvedAirShowScene | null = null;
  const captureRenderer = {
    animateResolvedAirCombatShow: async (scene: ResolvedAirShowScene): Promise<void> => {
      capturedScene = scene;
    }
  };
  const screen = createSceneCaptureScreenForFixture(captureRenderer, harnessFixture);

  const fakeEngine = {
    getPlayerHq: () => harnessFixture.renderScenario.sides.Player.hq,
    getBotHq: () => harnessFixture.renderScenario.sides.Bot.hq
  };

  await (screen as unknown as {
    playMissionAirInterceptEvent: (
      event: unknown,
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
      flakEvent: unknown
    ) => Promise<void>;
  }).playMissionAirInterceptEvent(
    harnessFixture.engagement,
    harnessFixture.locKey,
    captureRenderer,
    fakeEngine as never,
    0,
    false,
    false,
    harnessFixture.bomberArrivalDelayMs,
    true,
    harnessFixture.bomberOriginKey,
    harnessFixture.linkedEscortFlights as readonly Record<string, unknown>[],
    harnessFixture.bomberTargetKey,
    harnessFixture.flakEvent
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

function computeInspectionTotalDurationMs(report: AirShowInspectionReport | null): number {
  if (!report) {
    return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  }
  return report.phases.reduce((sum, phase) => sum + phase.durationMs, 0);
}

function computePhaseTimeoutMs(report: AirShowInspectionReport | null, label: string): number {
  if (!report) {
    return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  }

  let elapsedMs = 0;
  for (const phase of report.phases) {
    const phaseBudgetMs = Math.max(phase.durationMs, 1);
    if (phase.label === label) {
      return Math.max(
        DEFAULT_PHASE_WAIT_TIMEOUT_MS,
        elapsedMs + phaseBudgetMs + PHASE_WAIT_BUFFER_MS
      );
    }
    elapsedMs += phaseBudgetMs;
  }

  return Math.max(
    DEFAULT_PHASE_WAIT_TIMEOUT_MS,
    computeInspectionTotalDurationMs(report) + PHASE_WAIT_BUFFER_MS
  );
}

function createTimedPromise<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`));
    }, timeoutMs);

    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
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

function installAirshowE2EHarnessWithFixture(harnessFixture: AirshowHarnessFixture): void {
  ensureBattleScreenVisible();

  type PendingPhasePause = {
    label: string;
    progress: number;
    engaged: boolean;
    readyResolve: () => void;
    resumePromise: Promise<void>;
    resumeResolve: () => void;
  };

  let activeRenderer: HexMapRenderer | null = null;
  let activeInspection: AirShowInspectionReport | null = null;
  let activeAnimation: Promise<void> | null = null;
  let activePhaseLabel: string | null = null;
  let activePhaseStartedAtMs = 0;
  let activePhaseDurationMs = 0;
  let activeTotalDurationMs = DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  let spawnSnapshot: readonly AirshowSpawnSnapshot[] = [];
  let positionTimeline: AirshowPositionSample[] = [];
  let positionSamplerHandle: number | null = null;
  let restorePhaseProbe: (() => void) | null = null;
  let pendingPhasePause: PendingPhasePause | null = null;

  function sampleActorPositions(): AirshowPositionSample {
    const size = 32;
    return {
      elapsedMs: performance.now(),
      phaseLabel: activePhaseLabel,
      actors: Array.from(document.querySelectorAll<SVGImageElement>('[data-testid="airshow-actor"]')).map((el) => ({
        actorId: el.getAttribute("data-airshow-actor-id") ?? "",
        role: el.getAttribute("data-airshow-role") ?? "",
        combatRole: el.getAttribute("data-airshow-combat-role") ?? "",
        faction: el.getAttribute("data-airshow-faction") ?? "",
        active: el.getAttribute("data-airshow-active") === "true",
        cx: parseFloat(el.getAttribute("x") ?? "0") + size / 2,
        cy: parseFloat(el.getAttribute("y") ?? "0") + size / 2
      }))
    };
  }

  function startPositionSampler(): void {
    positionTimeline = [];
    if (positionSamplerHandle !== null) window.clearInterval(positionSamplerHandle);
    positionSamplerHandle = window.setInterval(() => { positionTimeline.push(sampleActorPositions()); }, POSITION_SAMPLE_INTERVAL_MS);
  }

  function stopPositionSampler(): void {
    if (positionSamplerHandle !== null) { window.clearInterval(positionSamplerHandle); positionSamplerHandle = null; }
  }

  function installPhaseProbe(renderer: HexMapRenderer, phaseLabels: readonly string[]): void {
    restorePhaseProbe?.();
    const runtimeRenderer = renderer as unknown as {
      runAirShowPhase?: (...args: unknown[]) => Promise<void>;
      scheduleAnimationFrame?: (step: FrameRequestCallback) => void;
    };
    const originalRunAirShowPhase = runtimeRenderer.runAirShowPhase?.bind(renderer);
    const originalScheduleAnimationFrame = runtimeRenderer.scheduleAnimationFrame?.bind(renderer);
    if (typeof originalRunAirShowPhase !== "function" || typeof originalScheduleAnimationFrame !== "function") {
      restorePhaseProbe = null;
      return;
    }
    let phaseIndex = 0;
    runtimeRenderer.runAirShowPhase = async (...args: unknown[]): Promise<void> => {
      const phaseLabel = phaseLabels[phaseIndex] ?? `phase-${phaseIndex + 1}`;
      activePhaseLabel = phaseLabel;
      activePhaseStartedAtMs = performance.now();
      activePhaseDurationMs = typeof args[1] === "number" ? Math.max(args[1], 1) : 0;
      phaseIndex += 1;
      const phasePause = pendingPhasePause?.label === phaseLabel ? pendingPhasePause : null;
      if (phasePause) {
        runtimeRenderer.scheduleAnimationFrame = (step: FrameRequestCallback): void => {
          const targetElapsedMs = activePhaseDurationMs * thisClamp(phasePause.progress, 0, 1);
          const elapsedMs = performance.now() - activePhaseStartedAtMs;
          if (!phasePause.engaged && elapsedMs >= targetElapsedMs) {
            phasePause.engaged = true;
            phasePause.readyResolve();
            void phasePause.resumePromise.then(() => {
              if (pendingPhasePause === phasePause) {
                pendingPhasePause = null;
              }
              originalScheduleAnimationFrame(step);
            });
            return;
          }
          if (phasePause.engaged) {
            void phasePause.resumePromise.then(() => {
              if (pendingPhasePause === phasePause) {
                pendingPhasePause = null;
              }
              originalScheduleAnimationFrame(step);
            });
            return;
          }
          originalScheduleAnimationFrame(step);
        };
      }
      try {
        return await originalRunAirShowPhase(...args);
      } finally {
        runtimeRenderer.scheduleAnimationFrame = originalScheduleAnimationFrame;
        if (activePhaseLabel === phaseLabel) {
          activePhaseDurationMs = 0;
        }
      }
    };
    restorePhaseProbe = () => {
      runtimeRenderer.runAirShowPhase = originalRunAirShowPhase;
      runtimeRenderer.scheduleAnimationFrame = originalScheduleAnimationFrame;
      restorePhaseProbe = null;
    };
  }

  function createPhasePause(label: string, progress: number): Promise<void> {
    if (pendingPhasePause) {
      pendingPhasePause.resumeResolve();
    }
    let readyResolve!: () => void;
    let resumeResolve!: () => void;
    const resumePromise = new Promise<void>((resolve) => {
      resumeResolve = resolve;
    });
    const readyPromise = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    pendingPhasePause = {
      label,
      progress: thisClamp(progress, 0, 1),
      engaged: false,
      readyResolve,
      resumePromise,
      resumeResolve
    };
    return readyPromise;
  }

  function thisClamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  async function waitForPhaseProgress(label: string, progress: number): Promise<void> {
    await waitForPhase(label);
    const clampedProgress = thisClamp(progress, 0, 1);
    const targetElapsedMs = activePhaseDurationMs * clampedProgress;
    const timeoutMs = Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, targetElapsedMs + PHASE_WAIT_BUFFER_MS);
    const startedAt = performance.now();
    while (activePhaseLabel === label && performance.now() - activePhaseStartedAtMs < targetElapsedMs) {
      if (performance.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out waiting for airshow phase "${label}" progress ${(clampedProgress * 100).toFixed(0)}% ` +
          `after ${timeoutMs}ms.`
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
  }

  async function waitForPhase(label: string): Promise<void> {
    const startedAt = performance.now();
    const timeoutMs = computePhaseTimeoutMs(activeInspection, label);
    while (activePhaseLabel !== label) {
      if (performance.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out waiting for airshow phase "${label}" after ${timeoutMs}ms. ` +
          `Last phase: ${activePhaseLabel ?? "none"}.`
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
  }

  window.__FSG_AIRSHOW_E2E__ = {
    async startScenario(): Promise<AirshowStartResult> {
      activePhaseLabel = null;
      activePhaseStartedAtMs = 0;
      activePhaseDurationMs = 0;
      restorePhaseProbe?.();
      activeRenderer = createRendererForFixture(harnessFixture);
      const scene = compressSceneForHarness(await captureSceneFromFixture(harnessFixture));
      activeInspection = (activeRenderer as unknown as {
        inspectResolvedAirCombatShow: (candidate: ResolvedAirShowScene) => AirShowInspectionReport | null;
      }).inspectResolvedAirCombatShow(scene);
      activeTotalDurationMs = computeInspectionTotalDurationMs(activeInspection);
      installPhaseProbe(activeRenderer, activeInspection?.phases.map((phase) => phase.label) ?? []);
      activeAnimation = activeRenderer.animateResolvedAirCombatShow(scene);
      spawnSnapshot = Array.from(document.querySelectorAll<SVGImageElement>('[data-testid="airshow-actor"]')).map((el) => {
        const size = 32;
        return {
          actorId: el.getAttribute("data-airshow-actor-id") ?? "",
          role: el.getAttribute("data-airshow-role") ?? "",
          active: el.getAttribute("data-airshow-active") === "true",
          cx: parseFloat(el.getAttribute("x") ?? "0") + size / 2,
          cy: parseFloat(el.getAttribute("y") ?? "0") + size / 2
        };
      });
      startPositionSampler();
      activeAnimation.finally(() => {
        stopPositionSampler();
        activePhaseLabel = "complete";
        restorePhaseProbe?.();
      });
      const bomberIngressPhase = activeInspection?.phases.find((phase) => phase.label === "bomber-ingress");
      const bomberIngressActorCount =
        bomberIngressPhase?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;
      return {
        missionId: harnessFixture.missionId,
        phaseLabels: activeInspection?.phases.map((phase) => phase.label) ?? [],
        totalDurationMs: activeTotalDurationMs,
        targetRunSampleMs: computeTargetRunSampleMs(activeInspection),
        bomberIngressActorCount,
        hqMidX: activeInspection?.hqMidX ?? null,
        corridorCenterX: activeInspection?.corridor.center.cx ?? null
      };
    },
    getActorSnapshot,
    getSpawnSnapshot(): readonly AirshowSpawnSnapshot[] { return spawnSnapshot; },
    getPositionTimeline(): readonly AirshowPositionSample[] { return positionTimeline; },
    pauseAtPhaseStart(label: string): Promise<void> {
      return createPhasePause(label, 0);
    },
    pauseAtPhaseProgress(label: string, progress: number): Promise<void> {
      return createPhasePause(label, progress);
    },
    resumePhase(): void {
      if (!pendingPhasePause) {
        return;
      }
      const pause = pendingPhasePause;
      pendingPhasePause = null;
      pause.resumeResolve();
    },
    waitForPhase,
    waitForPhaseProgress,
    async waitForCompletion(): Promise<void> {
      if (!activeAnimation) return;
      const timeoutMs = Math.max(
        DEFAULT_PHASE_WAIT_TIMEOUT_MS,
        activeTotalDurationMs + COMPLETION_WAIT_BUFFER_MS
      );
      await createTimedPromise(activeAnimation, timeoutMs, "airshow completion");
    },
    getInspectionSummary(): {
      readonly phaseLabels: readonly string[];
      readonly originPlan: unknown;
      readonly fighterIngressStart: ReadonlyArray<{
        readonly actorId: string;
        readonly role: string;
        readonly cx: number;
        readonly cy: number;
      }>;
    } | null {
      if (!activeInspection) return null;
      const fighterIngressPhase = activeInspection.phases.find((phase) => phase.label === "fighter-ingress");
      return {
        phaseLabels: activeInspection.phases.map((phase) => phase.label),
        originPlan: activeInspection.originPlan ?? null,
        fighterIngressStart:
          fighterIngressPhase?.assignments.map((assignment) => {
            const sample = assignment.sampledPositions[0];
            return {
              actorId: assignment.actorId,
              role: assignment.role,
              cx: sample?.cx ?? 0,
              cy: sample?.cy ?? 0
            };
          }) ?? []
      };
    }
  };

  function runAutoPlay(): void {
    const harness = window.__FSG_AIRSHOW_E2E__!;

    const overlay = document.createElement("div");
    overlay.id = "airshow-autoplay-overlay";
    overlay.style.cssText = [
      "position:fixed", "top:12px", "right:12px", "z-index:99999",
      "background:rgba(0,0,0,0.78)", "color:#fff", "font:bold 14px/1.4 monospace",
      "padding:10px 16px", "border-radius:8px", "cursor:pointer",
      "box-shadow:0 2px 12px rgba(0,0,0,0.5)", "user-select:none"
    ].join(";");

    let countdown = 3;
    const update = (): void => { overlay.textContent = `▶ Click to play  (auto in ${countdown}s)`; };
    update();
    document.body.appendChild(overlay);

    let cancelled = false;
    const tick = window.setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        window.clearInterval(tick);
        if (!cancelled) { cancelled = true; launch(); }
      } else {
        update();
      }
    }, 1000);

    overlay.addEventListener("click", () => {
      window.clearInterval(tick);
      if (!cancelled) { cancelled = true; launch(); }
    }, { once: true });

    function launch(): void {
      overlay.textContent = "▶ Running…";
      void harness.startScenario().then(() => harness.waitForCompletion()).then(() => {
        overlay.textContent = "↺ Done — click to replay";
        overlay.addEventListener("click", launch, { once: true });
      });
    }
  }

  if (!navigator.webdriver) {
    window.setTimeout(runAutoPlay, 0);
  }
}

export function installAirshowE2EHarness(): void {
  installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixture());
}

export function installAirshowE2EHarnessLarge(): void {
  installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixtureLarge());
}
