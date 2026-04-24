const MAX_CAPTURE_HISTORY = 5;
const captureStore = {
    enabled: true,
    captures: []
};
function cloneCapture(value) {
    return typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}
function buildDebugHook() {
    return {
        clear() {
            captureStore.captures.length = 0;
        },
        disable() {
            captureStore.enabled = false;
        },
        downloadLatest(fileName = "fsg-airshow-capture.json") {
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
        enable() {
            captureStore.enabled = true;
        },
        exportLatest(pretty = true) {
            const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
            return latest ? JSON.stringify(latest, null, pretty ? 2 : 0) : null;
        },
        getHistory() {
            return captureStore.captures.map((capture) => cloneCapture(capture));
        },
        getLatest() {
            const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
            return latest ? cloneCapture(latest) : null;
        },
        isEnabled() {
            return captureStore.enabled;
        }
    };
}
export function clearAirShowPlaybackCaptures() {
    captureStore.captures.length = 0;
}
export function getLatestAirShowPlaybackCapture() {
    const latest = captureStore.captures[captureStore.captures.length - 1] ?? null;
    return latest ? cloneCapture(latest) : null;
}
export function installAirShowPlaybackCaptureDebugHook(targetWindow = window) {
    if (!targetWindow.__FSG_AIRSHOW_CAPTURE__) {
        targetWindow.__FSG_AIRSHOW_CAPTURE__ = buildDebugHook();
    }
    return targetWindow.__FSG_AIRSHOW_CAPTURE__;
}
export function recordAirShowPlaybackCapture(capture) {
    if (!captureStore.enabled) {
        return;
    }
    captureStore.captures.push(cloneCapture(capture));
    while (captureStore.captures.length > MAX_CAPTURE_HISTORY) {
        captureStore.captures.shift();
    }
}
