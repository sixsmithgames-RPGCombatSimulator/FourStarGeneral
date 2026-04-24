const MAX_RUNTIME_TRACE_HISTORY = 5;
const runtimeTraceStore = {
    enabled: true,
    traces: []
};
function cloneTrace(value) {
    return typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}
function buildDebugHook() {
    return {
        clear() {
            runtimeTraceStore.traces.length = 0;
        },
        disable() {
            runtimeTraceStore.enabled = false;
        },
        downloadLatest(fileName = "fsg-airshow-runtime-trace.json") {
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
        enable() {
            runtimeTraceStore.enabled = true;
        },
        exportLatest(pretty = true) {
            const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
            return latest ? JSON.stringify(latest, null, pretty ? 2 : 0) : null;
        },
        getHistory() {
            return runtimeTraceStore.traces.map((trace) => cloneTrace(trace));
        },
        getLatest() {
            const latest = runtimeTraceStore.traces[runtimeTraceStore.traces.length - 1] ?? null;
            return latest ? cloneTrace(latest) : null;
        },
        isEnabled() {
            return runtimeTraceStore.enabled;
        }
    };
}
export function installAirShowRuntimeTraceDebugHook(targetWindow = window) {
    if (!targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__) {
        targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__ = buildDebugHook();
    }
    return targetWindow.__FSG_AIRSHOW_RUNTIME_TRACE__;
}
export function beginAirShowRuntimeTrace(scene, plannedScene) {
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
export function recordAirShowRuntimeTraceEvent(session, event) {
    if (!session || !runtimeTraceStore.enabled) {
        return;
    }
    session.trace.events.push({
        index: session.trace.events.length,
        event: cloneTrace(event)
    });
}
export function completeAirShowRuntimeTrace(session, status, error = null) {
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
