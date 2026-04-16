import { BattleScreen } from "../ui/screens/BattleScreen";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import { buildAirshowHarnessFixture } from "./airshowHarnessFixture";
const fixture = buildAirshowHarnessFixture();
let activeRenderer = null;
let activeInspection = null;
let activeAnimation = null;
let activePhaseLabel = null;
let restorePhaseProbe = null;
function compressSceneForHarness(scene) {
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
function ensureBattleScreenVisible() {
    const battleScreen = document.getElementById("battleScreen");
    if (!battleScreen) {
        throw new Error("Expected #battleScreen to exist for airshow e2e harness.");
    }
    battleScreen.classList.remove("hidden");
    battleScreen.setAttribute("aria-hidden", "false");
}
function createRenderer() {
    const svg = document.getElementById("battleHexMap");
    const canvas = document.getElementById("battleMapCanvas");
    if (!svg || !canvas) {
        throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
    }
    const renderer = new HexMapRenderer();
    renderer.render(svg, canvas, fixture.renderScenario);
    return renderer;
}
function createSceneCaptureScreen(rendererLike) {
    const fakeBattleState = {
        ensureGameEngine: () => ({ getScheduledAirMissions: () => [] }),
        tryGetGameEngine: () => ({ getScheduledAirMissions: () => [] }),
        hasEngine: () => true
    };
    const screen = new BattleScreen({}, fakeBattleState, {}, rendererLike, null, null, null, {}, null);
    screen.announceAirInterceptEngagement = () => { };
    screen.announceBattleUpdate = () => { };
    screen.publishActivityEvent = () => { };
    screen.closeSelectionIntelForAnimation = () => { };
    screen.waitMs = async () => { };
    screen.waitForNextFrame = async () => { };
    screen.focusCameraOnHex = async () => { };
    screen.renderEngineUnits = () => { };
    screen.resolveAirEngagementOffsetKey = (unitKey) => fixture.originKeysByUnitId[unitKey] ?? null;
    screen.resolveAirSquadronStrength = (unitKey) => fixture.strengthByUnitId[unitKey] ?? 100;
    return screen;
}
async function captureScene() {
    let capturedScene = null;
    const captureRenderer = {
        animateResolvedAirCombatShow: async (scene) => {
            capturedScene = scene;
        }
    };
    const screen = createSceneCaptureScreen(captureRenderer);
    await screen.playMissionAirInterceptEvent(fixture.engagement, fixture.locKey, captureRenderer, {}, 0, false, false, fixture.bomberArrivalDelayMs, true, fixture.bomberOriginKey, fixture.linkedEscortFlights, fixture.bomberTargetKey, fixture.flakEvent);
    if (!capturedScene) {
        throw new Error("Airshow e2e harness failed to capture the resolved airshow scene.");
    }
    return capturedScene;
}
function computeTargetRunSampleMs(report) {
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
function getActorSnapshot() {
    return Array.from(document.querySelectorAll('[data-testid="airshow-actor"]')).map((node) => ({
        actorId: node.getAttribute("data-airshow-actor-id") ?? "",
        role: node.getAttribute("data-airshow-role") ?? "",
        combatRole: node.getAttribute("data-airshow-combat-role") ?? "",
        flightId: node.getAttribute("data-airshow-flight-id") ?? "",
        active: node.getAttribute("data-airshow-active") === "true",
        opacity: window.getComputedStyle(node).opacity
    }));
}
function installPhaseProbe(renderer, phaseLabels) {
    restorePhaseProbe?.();
    const runtimeRenderer = renderer;
    const originalRunAirShowPhase = runtimeRenderer.runAirShowPhase?.bind(renderer);
    if (typeof originalRunAirShowPhase !== "function") {
        restorePhaseProbe = null;
        return;
    }
    let phaseIndex = 0;
    runtimeRenderer.runAirShowPhase = async (...args) => {
        activePhaseLabel = phaseLabels[phaseIndex] ?? `phase-${phaseIndex + 1}`;
        phaseIndex += 1;
        return originalRunAirShowPhase(...args);
    };
    restorePhaseProbe = () => {
        runtimeRenderer.runAirShowPhase = originalRunAirShowPhase;
        restorePhaseProbe = null;
    };
}
async function waitForPhase(label) {
    const startedAt = performance.now();
    while (activePhaseLabel !== label) {
        if (performance.now() - startedAt > 15000) {
            throw new Error(`Timed out waiting for airshow phase "${label}". Last phase: ${activePhaseLabel ?? "none"}.`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
}
export function installAirshowE2EHarness() {
    ensureBattleScreenVisible();
    window.__FSG_AIRSHOW_E2E__ = {
        async startScenario() {
            activePhaseLabel = null;
            restorePhaseProbe?.();
            activeRenderer = createRenderer();
            const scene = compressSceneForHarness(await captureScene());
            activeInspection = activeRenderer.inspectResolvedAirCombatShow(scene);
            installPhaseProbe(activeRenderer, activeInspection?.phases.map((phase) => phase.label) ?? []);
            activeAnimation = activeRenderer.animateResolvedAirCombatShow(scene);
            activeAnimation.finally(() => {
                activePhaseLabel = "complete";
                restorePhaseProbe?.();
            });
            const bomberIngressPhase = activeInspection?.phases.find((phase) => phase.label === "bomber-ingress");
            const bomberIngressActorCount = bomberIngressPhase?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;
            return {
                missionId: fixture.missionId,
                phaseLabels: activeInspection?.phases.map((phase) => phase.label) ?? [],
                targetRunSampleMs: computeTargetRunSampleMs(activeInspection),
                bomberIngressActorCount
            };
        },
        getActorSnapshot,
        waitForPhase,
        async waitForCompletion() {
            if (!activeAnimation) {
                return;
            }
            await activeAnimation;
        },
        getInspectionSummary() {
            if (!activeInspection) {
                return null;
            }
            return {
                phaseLabels: activeInspection.phases.map((phase) => phase.label)
            };
        }
    };
}
