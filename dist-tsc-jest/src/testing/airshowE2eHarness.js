import { BattleScreen } from "../ui/screens/BattleScreen";
import { HexMapRenderer } from "../rendering/HexMapRenderer";
import { MapViewport } from "../ui/controls/MapViewport";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge } from "./airshowHarnessFixture";
import { buildAirshowPlaybackCaptureFixture } from "./airshowPlaybackCaptureFixture";
const POSITION_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_PHASE_WAIT_TIMEOUT_MS = 45000;
const PHASE_WAIT_BUFFER_MS = 4000;
const COMPLETION_WAIT_BUFFER_MS = 10000;
function compressSceneForHarness(scene) {
    return scene;
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
function createRendererForScenario(renderScenario) {
    const svg = document.getElementById("battleHexMap");
    const canvas = document.getElementById("battleMapCanvas");
    if (!svg || !canvas) {
        throw new Error("Expected #battleHexMap and #battleMapCanvas to exist for airshow e2e harness.");
    }
    const renderer = new HexMapRenderer();
    renderer.render(svg, canvas, renderScenario);
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
    screen.scenario = harnessFixture.renderScenario;
    screen.scenarioSource = harnessFixture.renderScenario;
    return screen;
}
function buildReplayEngineFromCapture(capture) {
    return {
        playerUnits: capture.playerUnits,
        botUnits: capture.botUnits,
        allyUnits: capture.allyUnits,
        reserveUnits: capture.reserveUnits.map((unit) => ({ unit })),
        getScheduledAirMissions(faction) {
            return capture.scheduledMissionsByFaction[faction] ?? [];
        },
        getPlayerHq: () => capture.playerHq,
        getBotHq: () => capture.botHq
    };
}
function createReplayScreenForCapture(rendererLike, capture) {
    const fakeEngine = buildReplayEngineFromCapture(capture);
    const fakeBattleState = {
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        hasEngine: () => true
    };
    const mapViewport = new MapViewport();
    if (rendererLike instanceof HexMapRenderer) {
        mapViewport.setViewportRoot(rendererLike.getViewportRoot());
    }
    const screen = new BattleScreen({}, fakeBattleState, {}, rendererLike, null, null, null, mapViewport, null);
    screen.announceAirInterceptEngagement = () => { };
    screen.announceBattleUpdate = () => { };
    screen.announceFlakEngagement = () => { };
    screen.publishActivityEvent = () => { };
    screen.closeSelectionIntelForAnimation = () => { };
    screen.waitMs = async () => { };
    screen.renderEngineUnits = () => { };
    screen.scenario = capture.scenario;
    screen.scenarioSource = capture.scenario;
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
function computeInspectionTotalDurationMs(report) {
    if (!report) {
        return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
    }
    return report.phases.reduce((sum, phase) => sum + phase.durationMs, 0);
}
function computePhaseTimeoutMs(report, label) {
    if (!report) {
        return DEFAULT_PHASE_WAIT_TIMEOUT_MS;
    }
    let elapsedMs = 0;
    for (const phase of report.phases) {
        const phaseBudgetMs = Math.max(phase.durationMs, 1);
        if (phase.label === label) {
            return Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, elapsedMs + phaseBudgetMs + PHASE_WAIT_BUFFER_MS);
        }
        elapsedMs += phaseBudgetMs;
    }
    return Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, computeInspectionTotalDurationMs(report) + PHASE_WAIT_BUFFER_MS);
}
function createTimedPromise(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`));
        }, timeoutMs);
        void promise.then((value) => {
            window.clearTimeout(timer);
            resolve(value);
        }, (error) => {
            window.clearTimeout(timer);
            reject(error);
        });
    });
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
function installAirshowE2EHarnessWithPlayback(config) {
    ensureBattleScreenVisible();
    let activeRenderer = null;
    let activeInspection = null;
    let activeAnimation = null;
    let activePhaseLabel = null;
    let activePhaseStartedAtMs = 0;
    let activePhaseDurationMs = 0;
    let activeTotalDurationMs = DEFAULT_PHASE_WAIT_TIMEOUT_MS;
    let restoreAnimateCapture = null;
    let spawnSnapshot = [];
    let positionTimeline = [];
    let positionSamplerHandle = null;
    let restorePhaseProbe = null;
    let pendingPhasePause = null;
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
        const originalScheduleAnimationFrame = runtimeRenderer.scheduleAnimationFrame?.bind(renderer);
        if (typeof originalRunAirShowPhase !== "function" || typeof originalScheduleAnimationFrame !== "function") {
            restorePhaseProbe = null;
            return;
        }
        let phaseIndex = 0;
        runtimeRenderer.runAirShowPhase = async (...args) => {
            const phaseLabel = phaseLabels[phaseIndex] ?? `phase-${phaseIndex + 1}`;
            activePhaseLabel = phaseLabel;
            activePhaseStartedAtMs = performance.now();
            activePhaseDurationMs = typeof args[1] === "number" ? Math.max(args[1], 1) : 0;
            phaseIndex += 1;
            const phasePause = pendingPhasePause?.label === phaseLabel ? pendingPhasePause : null;
            if (phasePause) {
                runtimeRenderer.scheduleAnimationFrame = (step) => {
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
            }
            finally {
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
    function createPhasePause(label, progress) {
        if (pendingPhasePause) {
            pendingPhasePause.resumeResolve();
        }
        let readyResolve;
        let resumeResolve;
        const resumePromise = new Promise((resolve) => {
            resumeResolve = resolve;
        });
        const readyPromise = new Promise((resolve) => {
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
    function thisClamp(value, min, max) {
        if (Number.isNaN(value)) {
            return min;
        }
        return Math.min(max, Math.max(min, value));
    }
    async function waitForPhaseProgress(label, progress) {
        await waitForPhase(label);
        const clampedProgress = thisClamp(progress, 0, 1);
        const targetElapsedMs = activePhaseDurationMs * clampedProgress;
        const timeoutMs = Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, targetElapsedMs + PHASE_WAIT_BUFFER_MS);
        const startedAt = performance.now();
        while (activePhaseLabel === label && performance.now() - activePhaseStartedAtMs < targetElapsedMs) {
            if (performance.now() - startedAt > timeoutMs) {
                throw new Error(`Timed out waiting for airshow phase "${label}" progress ${(clampedProgress * 100).toFixed(0)}% ` +
                    `after ${timeoutMs}ms.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 10));
        }
    }
    async function waitForPhase(label) {
        const startedAt = performance.now();
        const timeoutMs = computePhaseTimeoutMs(activeInspection, label);
        while (activePhaseLabel !== label) {
            if (performance.now() - startedAt > timeoutMs) {
                throw new Error(`Timed out waiting for airshow phase "${label}" after ${timeoutMs}ms. ` +
                    `Last phase: ${activePhaseLabel ?? "none"}.`);
            }
            await new Promise((resolve) => window.setTimeout(resolve, 25));
        }
    }
    window.__FSG_AIRSHOW_E2E__ = {
        async startScenario() {
            activePhaseLabel = null;
            activePhaseStartedAtMs = 0;
            activePhaseDurationMs = 0;
            restoreAnimateCapture?.();
            restorePhaseProbe?.();
            activeInspection = null;
            activeRenderer = createRendererForScenario(config.renderScenario);
            const renderer = activeRenderer;
            const originalAnimateResolvedAirCombatShow = renderer.animateResolvedAirCombatShow.bind(renderer);
            renderer.animateResolvedAirCombatShow = async (scene) => {
                const compressedScene = compressSceneForHarness(scene);
                if (!activeInspection) {
                    activeInspection = renderer.inspectResolvedAirCombatShow(compressedScene);
                    activeTotalDurationMs = computeInspectionTotalDurationMs(activeInspection);
                    installPhaseProbe(renderer, activeInspection?.phases.map((phase) => phase.label) ?? []);
                }
                return originalAnimateResolvedAirCombatShow(compressedScene);
            };
            restoreAnimateCapture = () => {
                renderer.animateResolvedAirCombatShow = originalAnimateResolvedAirCombatShow;
                restoreAnimateCapture = null;
            };
            activeAnimation = config.startPlayback(renderer);
            startPositionSampler();
            activeAnimation.finally(() => {
                stopPositionSampler();
                activePhaseLabel = "complete";
                restoreAnimateCapture?.();
                restorePhaseProbe?.();
            });
            await createTimedPromise(new Promise((resolve, reject) => {
                const startedAtMs = performance.now();
                const tick = () => {
                    if (activeInspection) {
                        resolve();
                        return;
                    }
                    if (performance.now() - startedAtMs > DEFAULT_PHASE_WAIT_TIMEOUT_MS) {
                        reject(new Error("Airshow e2e harness did not observe a resolved airshow scene."));
                        return;
                    }
                    window.setTimeout(tick, 10);
                };
                tick();
            }), DEFAULT_PHASE_WAIT_TIMEOUT_MS, "initial airshow scene");
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
            if (!activeInspection) {
                throw new Error("Airshow e2e harness did not capture an inspection report.");
            }
            const inspection = activeInspection;
            const bomberIngressPhase = inspection.phases.find((phase) => phase.label === "bomber-ingress");
            const bomberIngressActorCount = bomberIngressPhase?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;
            return {
                missionId: config.missionId,
                phaseLabels: inspection.phases.map((phase) => phase.label),
                totalDurationMs: activeTotalDurationMs,
                targetRunSampleMs: computeTargetRunSampleMs(inspection),
                bomberIngressActorCount,
                hqMidX: inspection.hqMidX ?? null,
                corridorCenterX: inspection.corridor.center.cx ?? null
            };
        },
        getActorSnapshot,
        getSpawnSnapshot() { return spawnSnapshot; },
        getPositionTimeline() { return positionTimeline; },
        pauseAtPhaseStart(label) {
            return createPhasePause(label, 0);
        },
        pauseAtPhaseProgress(label, progress) {
            return createPhasePause(label, progress);
        },
        resumePhase() {
            if (!pendingPhasePause) {
                return;
            }
            const pause = pendingPhasePause;
            pendingPhasePause = null;
            pause.resumeResolve();
        },
        waitForPhase,
        waitForPhaseProgress,
        async waitForCompletion() {
            if (!activeAnimation)
                return;
            const timeoutMs = Math.max(DEFAULT_PHASE_WAIT_TIMEOUT_MS, activeTotalDurationMs + COMPLETION_WAIT_BUFFER_MS);
            await createTimedPromise(activeAnimation, timeoutMs, "airshow completion");
        },
        getInspectionSummary() {
            if (!activeInspection)
                return null;
            const fighterIngressPhase = activeInspection.phases.find((phase) => phase.label === "fighter-ingress");
            return {
                phaseLabels: activeInspection.phases.map((phase) => phase.label),
                originPlan: activeInspection.originPlan ?? null,
                fighterIngressStart: fighterIngressPhase?.assignments.map((assignment) => {
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
function installAirshowE2EHarnessWithFixture(harnessFixture) {
    installAirshowE2EHarnessWithPlayback({
        missionId: harnessFixture.missionId,
        renderScenario: harnessFixture.renderScenario,
        startPlayback: async (renderer) => {
            const scene = compressSceneForHarness(await captureSceneFromFixture(harnessFixture));
            await renderer.animateResolvedAirCombatShow(scene);
        }
    });
}
export function installAirshowPlaybackReplayE2EHarness() {
    const capture = buildAirshowPlaybackCaptureFixture();
    installAirshowE2EHarnessWithPlayback({
        missionId: capture.events[0]?.missionId ?? capture.missionKey,
        renderScenario: capture.scenario,
        startPlayback: async (renderer) => {
            const screen = createReplayScreenForCapture(renderer, capture);
            await screen.playAirOperations(capture.arrivals, capture.events);
        }
    });
}
export function installAirshowE2EHarness() {
    installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixture());
}
export function installAirshowE2EHarnessLarge() {
    installAirshowE2EHarnessWithFixture(buildAirshowHarnessFixtureLarge());
}
