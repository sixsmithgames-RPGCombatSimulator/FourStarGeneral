import { BattleScreen } from "../ui/screens/BattleScreen";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge } from "./airshowHarnessFixture";
const POSITION_SAMPLE_INTERVAL_MS = 100;
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
    document.querySelectorAll("[id$='Screen']:not(#battleScreen), .modal-overlay, .overlay, #deploymentScreen, #campaignScreen, #mainMenuScreen").forEach((el) => {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
    });
    battleScreen.classList.remove("hidden");
    battleScreen.setAttribute("aria-hidden", "false");
    battleScreen.style.zIndex = "1";
}
function createRendererForFixture(harnessFixture) {
    const svg = document.getElementById("battleHexMap");
    const canvas = document.getElementById("battleMapCanvas");
    if (!svg || !canvas) {
        throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
    }
    const renderer = new HexMapRenderer();
    renderer.render(svg, canvas, harnessFixture.renderScenario);
    return renderer;
}
function createSceneCaptureScreenForFixture(rendererLike, harnessFixture) {
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
    screen.resolveAirEngagementOffsetKey = (unitKey) => harnessFixture.originKeysByUnitId[unitKey] ?? null;
    screen.resolveAirSquadronStrength = (unitKey) => harnessFixture.strengthByUnitId[unitKey] ?? 100;
    return screen;
}
async function captureSceneFromFixture(harnessFixture) {
    let capturedScene = null;
    const captureRenderer = {
        animateResolvedAirCombatShow: async (scene) => {
            capturedScene = scene;
        }
    };
    const screen = createSceneCaptureScreenForFixture(captureRenderer, harnessFixture);
    const fakeEngine = {
        getPlayerHq: () => harnessFixture.renderScenario.sides.Player.hq,
        getBotHq: () => harnessFixture.renderScenario.sides.Bot.hq
    };
    await screen.playMissionAirInterceptEvent(harnessFixture.engagement, harnessFixture.locKey, captureRenderer, fakeEngine, 0, false, false, harnessFixture.bomberArrivalDelayMs, true, harnessFixture.bomberOriginKey, harnessFixture.linkedEscortFlights, harnessFixture.bomberTargetKey, harnessFixture.flakEvent);
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
function installAirshowE2EHarnessWithFixture(harnessFixture) {
    ensureBattleScreenVisible();
    let activeRenderer = null;
    let activeInspection = null;
    let activeAnimation = null;
    let activePhaseLabel = null;
    let spawnSnapshot = [];
    let positionTimeline = [];
    let positionSamplerHandle = null;
    let restorePhaseProbe = null;
    function sampleActorPositions() {
        const size = 32;
        return {
            elapsedMs: performance.now(),
            phaseLabel: activePhaseLabel,
            actors: Array.from(document.querySelectorAll('[data-testid="airshow-actor"]')).map((el) => ({
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
    function startPositionSampler() {
        positionTimeline = [];
        if (positionSamplerHandle !== null)
            window.clearInterval(positionSamplerHandle);
        positionSamplerHandle = window.setInterval(() => { positionTimeline.push(sampleActorPositions()); }, POSITION_SAMPLE_INTERVAL_MS);
    }
    function stopPositionSampler() {
        if (positionSamplerHandle !== null) {
            window.clearInterval(positionSamplerHandle);
            positionSamplerHandle = null;
        }
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
        restorePhaseProbe = () => { runtimeRenderer.runAirShowPhase = originalRunAirShowPhase; restorePhaseProbe = null; };
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
    window.__FSG_AIRSHOW_E2E__ = {
        async startScenario() {
            activePhaseLabel = null;
            restorePhaseProbe?.();
            activeRenderer = createRendererForFixture(harnessFixture);
            const scene = compressSceneForHarness(await captureSceneFromFixture(harnessFixture));
            activeInspection = activeRenderer.inspectResolvedAirCombatShow(scene);
            installPhaseProbe(activeRenderer, activeInspection?.phases.map((phase) => phase.label) ?? []);
            activeAnimation = activeRenderer.animateResolvedAirCombatShow(scene);
            spawnSnapshot = Array.from(document.querySelectorAll('[data-testid="airshow-actor"]')).map((el) => {
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
            const bomberIngressActorCount = bomberIngressPhase?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;
            return {
                missionId: harnessFixture.missionId,
                phaseLabels: activeInspection?.phases.map((phase) => phase.label) ?? [],
                targetRunSampleMs: computeTargetRunSampleMs(activeInspection),
                bomberIngressActorCount,
                hqMidX: activeInspection?.hqMidX ?? null,
                corridorCenterX: activeInspection?.corridor.center.cx ?? null
            };
        },
        getActorSnapshot,
        getSpawnSnapshot() { return spawnSnapshot; },
        getPositionTimeline() { return positionTimeline; },
        waitForPhase,
        async waitForCompletion() {
            if (!activeAnimation)
                return;
            await activeAnimation;
        },
        getInspectionSummary() {
            if (!activeInspection)
                return null;
            return { phaseLabels: activeInspection.phases.map((phase) => phase.label) };
        }
    };
    function runAutoPlay() {
        const harness = window.__FSG_AIRSHOW_E2E__;
        const overlay = document.createElement("div");
        overlay.id = "airshow-autoplay-overlay";
        overlay.style.cssText = [
            "position:fixed", "top:12px", "right:12px", "z-index:99999",
            "background:rgba(0,0,0,0.78)", "color:#fff", "font:bold 14px/1.4 monospace",
            "padding:10px 16px", "border-radius:8px", "cursor:pointer",
            "box-shadow:0 2px 12px rgba(0,0,0,0.5)", "user-select:none"
        ].join(";");
        let countdown = 3;
        const update = () => { overlay.textContent = `▶ Click to play  (auto in ${countdown}s)`; };
        update();
        document.body.appendChild(overlay);
        let cancelled = false;
        const tick = window.setInterval(() => {
            countdown -= 1;
            if (countdown <= 0) {
                window.clearInterval(tick);
                if (!cancelled) {
                    cancelled = true;
                    launch();
                }
            }
            else {
                update();
            }
        }, 1000);
        overlay.addEventListener("click", () => {
            window.clearInterval(tick);
            if (!cancelled) {
                cancelled = true;
                launch();
            }
        }, { once: true });
        function launch() {
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
export function installAirshowE2EHarness() {
    installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixture());
}
export function installAirshowE2EHarnessLarge() {
    installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixtureLarge());
}
