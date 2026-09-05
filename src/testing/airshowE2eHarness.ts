import { BattleScreen } from "../ui/screens/BattleScreen";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import { MapViewport } from "../ui/controls/MapViewport";
import type {
  AirShowInspectionReport,
  ResolvedAirShowScene
} from "../ui/airshow/AirShowPlaybackScene";
import type { ScenarioData, ScenarioUnit } from "../core/types";
import type { AirEngagementEvent, AirMissionArrival } from "../game/GameEngine";
import type { AirShowPlaybackCapture } from "../ui/airshow/AirShowPlaybackCapture";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge, type AirshowHarnessFixture } from "./airshowHarnessFixture";
import { buildAirshowPlaybackCaptureFixture } from "./airshowPlaybackCaptureFixture";
import { getScenarioByMissionKey } from "../data/scenarioRegistry";
import { normalizeScenarioSource, type RawScenarioInput } from "../data/scenarioNormalizer";

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
  readonly lastCue: string | null;
  readonly impactFired: boolean;
  readonly cueCounts: Readonly<Record<string, number>>;
  readonly effectCounts: Readonly<Record<string, number>>;
  readonly actors: ReadonlyArray<{
    readonly actorId: string;
    readonly flightId: string;
    readonly role: string;
    readonly combatRole: string;
    readonly faction: string;
    readonly active: boolean;
    readonly opacity: number;
    readonly connected: boolean;
    readonly headingDegrees: number;
    readonly width: number;
    readonly height: number;
    readonly bombReleased: boolean;
    readonly destroyed: boolean;
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

interface AirshowHarnessPlaybackSpec {
  readonly missionId: string;
  readonly renderScenario: ScenarioData;
  readonly focusHexKey?: string;
  readonly startPlayback: (renderer: HexMapRenderer) => Promise<void>;
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
  const battleMain = document.querySelector<HTMLElement>(".battle-main");
  battleMain?.setAttribute("data-panel-collapsed", "true");
  battleMain?.setAttribute("data-activity-collapsed", "true");
  [
    document.getElementById("deploymentPanel"),
    document.getElementById("deploymentPanelToggle"),
    document.getElementById("battleActivityLog"),
    document.getElementById("battleActivityLogToggle"),
    document.getElementById("battleIntelOverlay")
  ].forEach((element) => {
    if (element) {
      element.style.display = "none";
      element.setAttribute("aria-hidden", "true");
    }
  });
}

function focusRendererForHarness(renderer: HexMapRenderer, hexKey: string): void {
  const center = renderer.getHexCenter(hexKey);
  const viewportRoot = renderer.getViewportRoot();
  const svg = document.getElementById("battleHexMap") as SVGSVGElement | null;
  const viewBox = svg?.viewBox.baseVal;
  if (!center || !viewportRoot || !viewBox) {
    return;
  }
  const scale = window.innerWidth <= 600 ? 2.35 : 1.65;
  const viewportCenterX = viewBox.x + viewBox.width / 2;
  const viewportCenterY = viewBox.y + viewBox.height / 2;
  viewportRoot.setAttribute(
    "transform",
    `translate(${viewportCenterX - center.cx * scale} ${viewportCenterY - center.cy * scale}) scale(${scale})`
  );
}

function createRendererForScenario(renderScenario: ScenarioData): HexMapRenderer {
  const svg = document.getElementById("battleHexMap") as SVGSVGElement | null;
  const canvas = document.getElementById("battleMapCanvas") as HTMLDivElement | null;
  if (!svg || !canvas) {
    throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
  }
  const renderer = new HexMapRenderer();
  renderer.render(svg, canvas, renderScenario);
  return renderer;
}

function createSceneCaptureScreenForFixture(rendererLike: unknown, harnessFixture: AirshowHarnessFixture): BattleScreen {
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
  (screen as unknown as Record<string, unknown>).scenario = harnessFixture.renderScenario;
  (screen as unknown as Record<string, unknown>).scenarioSource = harnessFixture.renderScenario;

  return screen;
}

function buildReplayEngineFromCapture(capture: AirShowPlaybackCapture): {
  readonly playerUnits: readonly ScenarioUnit[];
  readonly botUnits: readonly ScenarioUnit[];
  readonly allyUnits: readonly ScenarioUnit[];
  readonly reserveUnits: ReadonlyArray<{ readonly unit: ScenarioUnit }>;
  readonly getScheduledAirMissions: (faction: "Player" | "Bot" | "Ally") => readonly import("../game/GameEngine").SerializedAirMission[];
  readonly getPlayerHq: () => ScenarioData["sides"]["Player"]["hq"] | null;
  readonly getBotHq: () => ScenarioData["sides"]["Bot"]["hq"] | null;
} {
  return {
    playerUnits: capture.playerUnits,
    botUnits: capture.botUnits,
    allyUnits: capture.allyUnits,
    reserveUnits: capture.reserveUnits.map((unit) => ({ unit })),
    getScheduledAirMissions(faction: "Player" | "Bot" | "Ally") {
      return capture.scheduledMissionsByFaction[faction] ?? [];
    },
    getPlayerHq: () => capture.playerHq,
    getBotHq: () => capture.botHq
  };
}

function createReplayScreenForCapture(rendererLike: unknown, capture: AirShowPlaybackCapture): BattleScreen {
  const fakeEngine = buildReplayEngineFromCapture(capture);
  const fakeBattleState = {
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine,
    hasEngine: () => true
  } as unknown as import("../state/BattleState").BattleState;
  const mapViewport = new MapViewport();
  if (rendererLike instanceof HexMapRenderer) {
    mapViewport.setViewportRoot(rendererLike.getViewportRoot());
  }

  const screen = new BattleScreen(
    {} as never,
    fakeBattleState,
    {} as never,
    rendererLike as never,
    null,
    null,
    null,
    mapViewport,
    null
  );

  (screen as unknown as Record<string, unknown>).announceAirInterceptEngagement = () => {};
  (screen as unknown as Record<string, unknown>).announceBattleUpdate = () => {};
  (screen as unknown as Record<string, unknown>).announceFlakEngagement = () => {};
  (screen as unknown as Record<string, unknown>).publishActivityEvent = () => {};
  (screen as unknown as Record<string, unknown>).closeSelectionIntelForAnimation = () => {};
  (screen as unknown as Record<string, unknown>).waitMs = async () => {};
  (screen as unknown as Record<string, unknown>).renderEngineUnits = () => {};
  (screen as unknown as Record<string, unknown>).scenario = capture.scenario;
  (screen as unknown as Record<string, unknown>).scenarioSource = capture.scenario;

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

  const targetRun = report.phases.find((phase) => phase.label === "target-run");
  if (targetRun) {
    return Math.round((targetRun.startTimeMs ?? 0) + targetRun.durationMs * 0.55);
  }
  return Math.round(computeInspectionTotalDurationMs(report) * 0.7);
}

function computeInspectionTotalDurationMs(report: AirShowInspectionReport | null): number {
  if (!report) {
    return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  }
  return report.timelineTotalDurationMs
    ?? Math.max(0, ...report.phases.map((phase) => phase.endTimeMs ?? phase.durationMs));
}

function computePhaseTimeoutMs(report: AirShowInspectionReport | null, label: string): number {
  if (!report) {
    return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  }

  const phase = report.phases.find((candidate) => candidate.label === label);
  if (phase) {
    return Math.max(
      DEFAULT_PHASE_WAIT_TIMEOUT_MS,
      (phase.endTimeMs ?? phase.durationMs) + PHASE_WAIT_BUFFER_MS
    );
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

function installAirshowE2EHarnessWithPlayback(config: AirshowHarnessPlaybackSpec): void {
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
  let activeAnimationError: unknown = null;
  let activePhaseLabel: string | null = null;
  let _activePhaseStartedAtMs = 0;
  let _activePhaseDurationMs = 0;
  let activeTimelineElapsedMs = 0;
  let activeTotalDurationMs = DEFAULT_PHASE_WAIT_TIMEOUT_MS;
  let restoreAnimateCapture: (() => void) | null = null;
  let spawnSnapshot: readonly AirshowSpawnSnapshot[] = [];
  let positionTimeline: AirshowPositionSample[] = [];
  let positionSamplerHandle: number | null = null;
  let restorePhaseProbe: (() => void) | null = null;
  let pendingPhasePause: PendingPhasePause | null = null;

  function sampleActorPositions(): AirshowPositionSample {
    const layer = document.querySelector<SVGGElement>(".combat-effects-layer");
    const cueKinds = ["tracer", "flak", "bomb-release", "impact", "destruction"];
    const cueCounts = Object.fromEntries(cueKinds.map((kind) => [
      kind,
      Number.parseInt(layer?.getAttribute(`data-airshow-cue-count-${kind}`) ?? "0", 10) || 0
    ]));
    const effectCounts: Record<string, number> = {};
    document.querySelectorAll<SVGGElement>('[data-effect-instance="true"]').forEach((effect) => {
      const effectType = effect.getAttribute("data-effect-type") ?? "unknown";
      effectCounts[effectType] = (effectCounts[effectType] ?? 0) + 1;
    });
    return {
      elapsedMs: activeTimelineElapsedMs,
      phaseLabel: activePhaseLabel,
      lastCue: layer?.getAttribute("data-airshow-last-cue") ?? null,
      impactFired: layer?.getAttribute("data-airshow-impact-fired") === "true",
      cueCounts,
      effectCounts,
      actors: Array.from(document.querySelectorAll<SVGImageElement>('[data-testid="airshow-actor"]')).map((el) => ({
        actorId: el.getAttribute("data-airshow-actor-id") ?? "",
        flightId: el.getAttribute("data-airshow-flight-id") ?? "",
        role: el.getAttribute("data-airshow-role") ?? "",
        combatRole: el.getAttribute("data-airshow-combat-role") ?? "",
        faction: el.getAttribute("data-airshow-faction") ?? "",
        active: el.getAttribute("data-airshow-active") === "true",
        opacity: Number.parseFloat(window.getComputedStyle(el).opacity || "0"),
        connected: el.isConnected,
        headingDegrees: Number.parseFloat(el.getAttribute("transform")?.match(/rotate\(([-\d.]+)/)?.[1] ?? "0"),
        width: Number.parseFloat(el.getAttribute("width") ?? "0"),
        height: Number.parseFloat(el.getAttribute("height") ?? "0"),
        bombReleased: el.getAttribute("data-airshow-bomb-released") === "true",
        destroyed: el.getAttribute("data-airshow-destroyed") === "true",
        cx: Number.parseFloat(el.getAttribute("x") ?? "0") + Number.parseFloat(el.getAttribute("width") ?? "0") / 2,
        cy: Number.parseFloat(el.getAttribute("y") ?? "0") + Number.parseFloat(el.getAttribute("height") ?? "0") / 2
      }))
    };
  }

  function startPositionSampler(): void {
    positionTimeline = [];
    if (positionSamplerHandle !== null) window.clearInterval(positionSamplerHandle);
    positionTimeline.push(sampleActorPositions());
    positionSamplerHandle = window.setInterval(() => {
      const sample = sampleActorPositions();
      const previous = positionTimeline[positionTimeline.length - 1];
      if (!previous || sample.elapsedMs > previous.elapsedMs) {
        positionTimeline.push(sample);
      }
    }, POSITION_SAMPLE_INTERVAL_MS);
  }

  function stopPositionSampler(): void {
    if (positionSamplerHandle !== null) { window.clearInterval(positionSamplerHandle); positionSamplerHandle = null; }
  }

  function installPhaseProbe(renderer: HexMapRenderer, phases: AirShowInspectionReport["phases"]): void {
    restorePhaseProbe?.();
    const runtimeRenderer = renderer as unknown as {
      scheduleAnimationFrame?: (step: FrameRequestCallback) => void;
    };
    const originalScheduleAnimationFrame = runtimeRenderer.scheduleAnimationFrame?.bind(renderer);
    if (typeof originalScheduleAnimationFrame !== "function") {
      restorePhaseProbe = null;
      return;
    }
    const phaseByLabel = new Map(phases.map((phase) => [phase.label, phase] as const));
    const readTimelineClock = (): { readonly label: string | null; readonly elapsedMs: number } => {
      const layer = document.querySelector<SVGGElement>(".combat-effects-layer[data-airshow-time-ms]");
      return {
        label: layer?.getAttribute("data-airshow-beat") ?? null,
        elapsedMs: Number.parseFloat(layer?.getAttribute("data-airshow-time-ms") ?? "0")
      };
    };
    const syncObservedClock = (clock: { readonly label: string | null; readonly elapsedMs: number }): void => {
      if (clock.label) {
        activePhaseLabel = clock.label;
        const phase = phaseByLabel.get(clock.label);
        _activePhaseDurationMs = Math.max(1, phase?.durationMs ?? 1);
        _activePhaseStartedAtMs = performance.now()
          - Math.max(0, clock.elapsedMs - (phase?.startTimeMs ?? clock.elapsedMs));
      }
      activeTimelineElapsedMs = clock.elapsedMs;
    };
    runtimeRenderer.scheduleAnimationFrame = (step: FrameRequestCallback): void => {
      originalScheduleAnimationFrame((timestamp) => {
        const clock = readTimelineClock();
        syncObservedClock(clock);
        const phasePause = pendingPhasePause;
        const phase = phasePause ? phaseByLabel.get(phasePause.label) : null;
        const pauseAtMs = phasePause && phase
          ? (phase.startTimeMs ?? 0) + phase.durationMs * thisClamp(phasePause.progress, 0, 1)
          : Number.POSITIVE_INFINITY;
        if (phasePause && !phasePause.engaged && clock.elapsedMs >= pauseAtMs) {
          activePhaseLabel = phasePause.label;
          _activePhaseDurationMs = Math.max(1, phase?.durationMs ?? 1);
          _activePhaseStartedAtMs = performance.now()
            - Math.max(0, clock.elapsedMs - (phase?.startTimeMs ?? clock.elapsedMs));
          phasePause.engaged = true;
          positionTimeline.push(sampleActorPositions());
          phasePause.readyResolve();
          void phasePause.resumePromise.then(() => {
            if (pendingPhasePause === phasePause) {
              pendingPhasePause = null;
            }
            originalScheduleAnimationFrame(step);
          });
          return;
        }
        step(timestamp);
        syncObservedClock(readTimelineClock());
      });
    };
    restorePhaseProbe = () => {
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
    const phase = activeInspection?.phases.find((candidate) => candidate.label === label);
    const targetTimelineMs = (phase?.startTimeMs ?? 0) + (phase?.durationMs ?? 0) * clampedProgress;
    const timeoutMs = Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, targetTimelineMs + PHASE_WAIT_BUFFER_MS);
    const startedAt = performance.now();
    while (activeTimelineElapsedMs < targetTimelineMs) {
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
    const phase = activeInspection?.phases.find((candidate) => candidate.label === label);
    const phaseStartTimeMs = phase?.startTimeMs ?? 0;
    while (activeTimelineElapsedMs < phaseStartTimeMs) {
      if (performance.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out waiting for airshow phase "${label}" after ${timeoutMs}ms. ` +
          `Last phase: ${activePhaseLabel ?? "none"}.`
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    activePhaseLabel = label;
    _activePhaseDurationMs = Math.max(1, phase?.durationMs ?? 1);
    _activePhaseStartedAtMs = performance.now();
  }

  window.__FSG_AIRSHOW_E2E__ = {
    async startScenario(): Promise<AirshowStartResult> {
      activePhaseLabel = null;
      _activePhaseStartedAtMs = 0;
      _activePhaseDurationMs = 0;
      activeTimelineElapsedMs = 0;
      restoreAnimateCapture?.();
      restorePhaseProbe?.();
      activeInspection = null;
      activeAnimationError = null;
      activeRenderer = createRendererForScenario(config.renderScenario);
      if (config.focusHexKey) {
        focusRendererForHarness(activeRenderer, config.focusHexKey);
      }
      const renderer = activeRenderer as HexMapRenderer & {
        animateResolvedAirCombatShow: (scene: ResolvedAirShowScene) => Promise<void>;
        inspectResolvedAirCombatShow: (candidate: ResolvedAirShowScene) => AirShowInspectionReport | null;
      };
      const originalAnimateResolvedAirCombatShow = renderer.animateResolvedAirCombatShow.bind(renderer);
      renderer.animateResolvedAirCombatShow = async (scene: ResolvedAirShowScene): Promise<void> => {
        const compressedScene = compressSceneForHarness(scene);
        if (!activeInspection) {
          activeInspection = renderer.inspectResolvedAirCombatShow(compressedScene);
          activeTotalDurationMs = computeInspectionTotalDurationMs(activeInspection);
          installPhaseProbe(renderer, activeInspection?.phases ?? []);
        }
        return originalAnimateResolvedAirCombatShow(compressedScene);
      };
      restoreAnimateCapture = () => {
        renderer.animateResolvedAirCombatShow = originalAnimateResolvedAirCombatShow;
        restoreAnimateCapture = null;
      };
      activeAnimation = config.startPlayback(renderer);
      startPositionSampler();
      const finishPlayback = (): void => {
        stopPositionSampler();
        activePhaseLabel = "complete";
        restoreAnimateCapture?.();
        restorePhaseProbe?.();
      };
      void activeAnimation.then(
        () => finishPlayback(),
        (error) => {
          activeAnimationError = error;
          finishPlayback();
        }
      );
      await createTimedPromise(
        new Promise<void>((resolve, reject) => {
          const startedAtMs = performance.now();
          const tick = (): void => {
            if (activeInspection) {
              resolve();
              return;
            }
            if (activeAnimationError) {
              reject(activeAnimationError);
              return;
            }
            if (performance.now() - startedAtMs > DEFAULT_PHASE_WAIT_TIMEOUT_MS) {
              reject(new Error("Airshow e2e harness did not observe a resolved airshow scene."));
              return;
            }
            window.setTimeout(tick, 10);
          };
          tick();
        }),
        DEFAULT_PHASE_WAIT_TIMEOUT_MS,
        "initial airshow scene"
      );
      spawnSnapshot = Array.from(document.querySelectorAll<SVGImageElement>('[data-testid="airshow-actor"]')).map((el) => {
        const width = Number.parseFloat(el.getAttribute("width") ?? "0");
        const height = Number.parseFloat(el.getAttribute("height") ?? "0");
        return {
          actorId: el.getAttribute("data-airshow-actor-id") ?? "",
          role: el.getAttribute("data-airshow-role") ?? "",
          active: el.getAttribute("data-airshow-active") === "true",
          cx: Number.parseFloat(el.getAttribute("x") ?? "0") + width / 2,
          cy: Number.parseFloat(el.getAttribute("y") ?? "0") + height / 2
        };
      });
      if (!activeInspection) {
        throw new Error("Airshow e2e harness did not capture an inspection report.");
      }
      const inspection: AirShowInspectionReport = activeInspection;
      const bomberIngressPhase = inspection.phases.find((phase: AirShowInspectionReport["phases"][number]) => phase.label === "bomber-ingress");
      const bomberIngressActorCount =
        bomberIngressPhase?.assignments.filter((assignment: AirShowInspectionReport["phases"][number]["assignments"][number]) => assignment.role === "bomber").length ?? 0;
      return {
        missionId: config.missionId,
        phaseLabels: inspection.phases.map((phase: AirShowInspectionReport["phases"][number]) => phase.label),
        totalDurationMs: activeTotalDurationMs,
        targetRunSampleMs: computeTargetRunSampleMs(inspection),
        bomberIngressActorCount,
        hqMidX: inspection.hqMidX ?? null,
        corridorCenterX: inspection.corridor.center.cx ?? null
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

function installAirshowE2EHarnessWithFixture(harnessFixture: AirshowHarnessFixture): void {
  installAirshowE2EHarnessWithPlayback({
    missionId: harnessFixture.missionId,
    renderScenario: harnessFixture.renderScenario,
    focusHexKey: harnessFixture.renderScenario.size.cols >= 20 ? harnessFixture.locKey : undefined,
    startPlayback: async (renderer) => {
      const scene = compressSceneForHarness(await captureSceneFromFixture(harnessFixture));
      await renderer.animateResolvedAirCombatShow(scene);
    }
  });
}

export function installAirshowPlaybackReplayE2EHarness(): void {
  const capture = buildAirshowPlaybackCaptureFixture();
  installAirshowE2EHarnessWithPlayback({
    missionId: capture.events[0]?.missionId ?? capture.missionKey,
    renderScenario: capture.scenario,
    startPlayback: async (renderer) => {
      const screen = createReplayScreenForCapture(renderer, capture);
      await (screen as unknown as {
        playAirOperations: (arrivals: readonly AirMissionArrival[], events: readonly AirEngagementEvent[]) => Promise<void>;
      }).playAirOperations(capture.arrivals, capture.events);
    }
  });
}

export function installAirshowE2EHarness(): void {
  installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixture());
}

export function installAirshowE2EHarnessLarge(): void {
  installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixtureLarge());
}

export function installTutorialStrikeAirshowE2EHarness(): void {
  const rawScenario = getScenarioByMissionKey("training");
  const renderScenario = normalizeScenarioSource(
    cloneHarnessValue(rawScenario) as RawScenarioInput,
    { turnLimit: 20 }
  );
  installAirshowE2EHarnessWithPlayback({
    missionId: "tutorial-zero-strength-strike",
    renderScenario,
    startPlayback: async (renderer) => {
      const fakeEngine = {
        playerUnits: renderScenario.sides.Player.units,
        botUnits: renderScenario.sides.Bot.units,
        allyUnits: renderScenario.sides.Ally?.units ?? [],
        reserveUnits: [],
        getScheduledAirMissions: () => [],
        getPlayerHq: () => renderScenario.sides.Player.hq,
        getBotHq: () => renderScenario.sides.Bot.hq
      };
      const fakeBattleState = {
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        hasEngine: () => true
      } as unknown as import("../state/BattleState").BattleState;
      const screen = new BattleScreen(
        {} as never,
        fakeBattleState,
        {} as never,
        renderer,
        null,
        null,
        null,
        new MapViewport(),
        null
      );
      (screen as unknown as Record<string, unknown>).scenario = renderScenario;
      (screen as unknown as Record<string, unknown>).scenarioSource = rawScenario;
      (screen as unknown as Record<string, unknown>).renderEngineUnits = () => {};
      await (screen as unknown as {
        playPersistentStrikeSortie: (
          flight: Record<string, unknown>,
          activeRenderer: HexMapRenderer,
          engine: unknown,
          options: Record<string, unknown>
        ) => Promise<void>;
      }).playPersistentStrikeSortie({
        missionId: "tutorial-zero-strength-strike",
        faction: "Bot",
        kind: "strike",
        unitKey: "tutorial-bomber",
        originKey: "14,8",
        destKey: "2,12",
        unitType: "Bomber",
        strength: 0,
        laneOffsetPx: 0
      }, renderer, fakeEngine, {
        playEffects: true,
        strength: 0,
        returnStrength: 0
      });
    }
  });
}

function cloneHarnessValue<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
