const SVG_NS = "http://www.w3.org/2000/svg";
const ANCHOR_X = 128;
const ANCHOR_Y = 220;
const HOTSPOT_BASE_Y = 206;
function counts(far, mid, near) {
    return { far, mid, near };
}
function range(minMs, maxMs) {
    return { minMs, maxMs };
}
function createIntervals(flame, smokeLow, smokeMid, smokeHigh, emberAir, heatHaze) {
    return { flame, smokeLow, smokeMid, smokeHigh, emberAir, heatHaze };
}
function createLifetimes(flame, smokeLow, smokeMid, smokeHigh, emberAir, heatHaze) {
    return { flame, smokeLow, smokeMid, smokeHigh, emberAir, heatHaze };
}
function createSeverityProfile(countsConfig, intervalsMs, lifetimes) {
    return { counts: countsConfig, intervalsMs, lifetimes };
}
function scaledCount(value, scale, minimum = 0) {
    return Math.max(minimum, Math.round(value * scale));
}
export const WRECK_FX_PRESETS = {
    infantry: {
        wreckClass: "infantry",
        hotspotOffsets: [{ x: 0, y: -10 }],
        emberBedCount: counts(2, 3, 4),
        emberGlowCount: counts(1, 2, 2),
        heatHazeEnabled: false,
        severityWindowsMs: { freshEnd: 8000, burningEnd: 24000, settlingEnd: 52000 },
        severities: {
            fresh: createSeverityProfile({
                flame: counts(0, 1, 2),
                smokeLow: counts(2, 3, 4),
                smokeMid: counts(1, 2, 3),
                smokeHigh: counts(0, 0, 1),
                emberAir: counts(0, 1, 1),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(460, 620, 920, 1680, 1320, 999999), createLifetimes(range(170, 230), range(620, 880), range(980, 1500), range(1500, 2200), range(180, 340), range(1500, 2200))),
            burning: createSeverityProfile({
                flame: counts(0, 1, 1),
                smokeLow: counts(2, 3, 4),
                smokeMid: counts(1, 2, 2),
                smokeHigh: counts(0, 1, 1),
                emberAir: counts(0, 1, 1),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(520, 720, 1080, 1840, 1480, 999999), createLifetimes(range(170, 240), range(640, 900), range(1100, 1600), range(1700, 2300), range(190, 360), range(1500, 2200))),
            settling: createSeverityProfile({
                flame: counts(0, 0, 1),
                smokeLow: counts(1, 2, 3),
                smokeMid: counts(1, 2, 2),
                smokeHigh: counts(0, 1, 1),
                emberAir: counts(0, 0, 1),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(760, 940, 1260, 1940, 1800, 999999), createLifetimes(range(180, 240), range(680, 940), range(1200, 1750), range(1900, 2500), range(180, 320), range(1500, 2200))),
            smoldering: createSeverityProfile({
                flame: counts(0, 0, 0),
                smokeLow: counts(1, 1, 2),
                smokeMid: counts(0, 1, 1),
                smokeHigh: counts(0, 1, 1),
                emberAir: counts(0, 0, 0),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(999999, 1320, 1680, 2200, 999999, 999999), createLifetimes(range(180, 240), range(760, 1080), range(1300, 1900), range(2100, 2700), range(180, 320), range(1500, 2200)))
        }
    },
    truck: {
        wreckClass: "truck",
        hotspotOffsets: [{ x: -12, y: -8 }, { x: 12, y: -6 }],
        emberBedCount: counts(3, 4, 6),
        emberGlowCount: counts(1, 2, 3),
        heatHazeEnabled: false,
        severityWindowsMs: { freshEnd: 16000, burningEnd: 68000, settlingEnd: 150000 },
        severities: {
            fresh: createSeverityProfile({
                flame: counts(1, 3, 5),
                smokeLow: counts(3, 5, 7),
                smokeMid: counts(2, 3, 5),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 1, 2),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(190, 250, 420, 980, 860, 999999), createLifetimes(range(180, 280), range(700, 1020), range(1160, 1760), range(1700, 2400), range(180, 420), range(1400, 2200))),
            burning: createSeverityProfile({
                flame: counts(1, 3, 4),
                smokeLow: counts(3, 6, 8),
                smokeMid: counts(2, 4, 5),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 1, 2),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(220, 280, 460, 1040, 940, 999999), createLifetimes(range(190, 290), range(760, 1080), range(1220, 1820), range(1840, 2480), range(200, 460), range(1500, 2300))),
            settling: createSeverityProfile({
                flame: counts(0, 2, 3),
                smokeLow: counts(2, 4, 6),
                smokeMid: counts(2, 4, 5),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 1, 1),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(320, 380, 580, 1180, 1320, 999999), createLifetimes(range(200, 310), range(800, 1140), range(1300, 1880), range(1960, 2550), range(190, 390), range(1500, 2300))),
            smoldering: createSeverityProfile({
                flame: counts(0, 0, 1),
                smokeLow: counts(1, 2, 3),
                smokeMid: counts(1, 2, 3),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 0, 0),
                heatHaze: counts(0, 0, 0)
            }, createIntervals(999999, 760, 920, 1400, 999999, 999999), createLifetimes(range(200, 300), range(820, 1200), range(1380, 1960), range(2100, 2680), range(180, 360), range(1500, 2300)))
        }
    },
    artillery: {
        wreckClass: "artillery",
        hotspotOffsets: [{ x: -14, y: -9 }, { x: 10, y: -7 }],
        emberBedCount: counts(3, 5, 6),
        emberGlowCount: counts(1, 2, 3),
        heatHazeEnabled: true,
        severityWindowsMs: { freshEnd: 18000, burningEnd: 82000, settlingEnd: 180000 },
        severities: {
            fresh: createSeverityProfile({
                flame: counts(1, 4, 6),
                smokeLow: counts(3, 6, 8),
                smokeMid: counts(2, 4, 6),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 2, 3),
                heatHaze: counts(0, 1, 2)
            }, createIntervals(170, 235, 390, 900, 760, 1200), createLifetimes(range(180, 300), range(760, 1080), range(1180, 1840), range(1760, 2440), range(180, 480), range(1800, 2600))),
            burning: createSeverityProfile({
                flame: counts(1, 3, 5),
                smokeLow: counts(3, 6, 8),
                smokeMid: counts(2, 4, 5),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 1, 2),
                heatHaze: counts(0, 1, 2)
            }, createIntervals(195, 255, 430, 980, 860, 1320), createLifetimes(range(190, 310), range(800, 1120), range(1260, 1880), range(1880, 2520), range(190, 460), range(1900, 2700))),
            settling: createSeverityProfile({
                flame: counts(0, 2, 3),
                smokeLow: counts(2, 4, 6),
                smokeMid: counts(2, 4, 5),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 1, 1),
                heatHaze: counts(0, 1, 1)
            }, createIntervals(300, 360, 560, 1140, 1240, 1560), createLifetimes(range(200, 320), range(820, 1180), range(1360, 1960), range(2000, 2580), range(180, 420), range(2000, 2800))),
            smoldering: createSeverityProfile({
                flame: counts(0, 0, 1),
                smokeLow: counts(1, 2, 3),
                smokeMid: counts(1, 2, 3),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 0, 0),
                heatHaze: counts(0, 0, 1)
            }, createIntervals(999999, 760, 980, 1420, 999999, 1780), createLifetimes(range(200, 300), range(860, 1220), range(1420, 2040), range(2140, 2720), range(180, 360), range(2100, 2900)))
        }
    },
    tank: {
        wreckClass: "tank",
        hotspotOffsets: [{ x: -18, y: -8 }, { x: 2, y: -13 }, { x: 18, y: -7 }],
        emberBedCount: counts(4, 6, 8),
        emberGlowCount: counts(2, 3, 4),
        heatHazeEnabled: true,
        severityWindowsMs: { freshEnd: 20000, burningEnd: 90000, settlingEnd: 240000 },
        severities: {
            fresh: createSeverityProfile({
                flame: counts(2, 6, 8),
                smokeLow: counts(4, 7, 10),
                smokeMid: counts(2, 5, 7),
                smokeHigh: counts(0, 2, 3),
                emberAir: counts(1, 2, 4),
                heatHaze: counts(0, 1, 3)
            }, createIntervals(140, 210, 340, 780, 640, 1040), createLifetimes(range(190, 320), range(820, 1180), range(1280, 1940), range(1960, 2580), range(180, 500), range(2000, 2800))),
            burning: createSeverityProfile({
                flame: counts(2, 5, 7),
                smokeLow: counts(4, 7, 10),
                smokeMid: counts(2, 5, 7),
                smokeHigh: counts(0, 2, 3),
                emberAir: counts(1, 2, 3),
                heatHaze: counts(0, 1, 2)
            }, createIntervals(155, 225, 360, 820, 720, 1180), createLifetimes(range(200, 330), range(860, 1220), range(1340, 2020), range(2040, 2640), range(180, 480), range(2100, 2900))),
            settling: createSeverityProfile({
                flame: counts(1, 3, 4),
                smokeLow: counts(3, 5, 8),
                smokeMid: counts(2, 5, 6),
                smokeHigh: counts(0, 2, 3),
                emberAir: counts(0, 1, 2),
                heatHaze: counts(0, 1, 2)
            }, createIntervals(250, 320, 500, 980, 1080, 1360), createLifetimes(range(210, 340), range(900, 1260), range(1440, 2100), range(2140, 2720), range(180, 420), range(2200, 3000))),
            smoldering: createSeverityProfile({
                flame: counts(0, 1, 1),
                smokeLow: counts(1, 3, 4),
                smokeMid: counts(1, 3, 4),
                smokeHigh: counts(0, 1, 2),
                emberAir: counts(0, 0, 0),
                heatHaze: counts(0, 0, 1)
            }, createIntervals(860, 620, 860, 1320, 999999, 1640), createLifetimes(range(210, 300), range(940, 1320), range(1500, 2180), range(2240, 2840), range(180, 360), range(2300, 3100)))
        }
    },
    convoy: {
        wreckClass: "convoy",
        hotspotOffsets: [{ x: -24, y: -7 }, { x: 0, y: -12 }, { x: 24, y: -7 }],
        emberBedCount: counts(4, 7, 8),
        emberGlowCount: counts(2, 3, 4),
        heatHazeEnabled: true,
        severityWindowsMs: { freshEnd: 22000, burningEnd: 120000, settlingEnd: 280000 },
        severities: {
            fresh: createSeverityProfile({
                flame: counts(3, 7, 10),
                smokeLow: counts(5, 8, 12),
                smokeMid: counts(3, 6, 8),
                smokeHigh: counts(1, 2, 4),
                emberAir: counts(1, 3, 5),
                heatHaze: counts(0, 1, 3)
            }, createIntervals(105, 180, 320, 760, 560, 980), createLifetimes(range(210, 340), range(920, 1280), range(1380, 2040), range(2100, 2720), range(180, 520), range(2000, 2900))),
            burning: createSeverityProfile({
                flame: counts(3, 6, 9),
                smokeLow: counts(5, 8, 12),
                smokeMid: counts(3, 6, 8),
                smokeHigh: counts(1, 2, 4),
                emberAir: counts(1, 3, 4),
                heatHaze: counts(0, 1, 3)
            }, createIntervals(120, 200, 340, 820, 620, 1100), createLifetimes(range(220, 350), range(960, 1320), range(1440, 2120), range(2180, 2780), range(190, 500), range(2100, 3000))),
            settling: createSeverityProfile({
                flame: counts(1, 4, 6),
                smokeLow: counts(4, 7, 10),
                smokeMid: counts(3, 6, 8),
                smokeHigh: counts(0, 2, 3),
                emberAir: counts(0, 1, 2),
                heatHaze: counts(0, 1, 2)
            }, createIntervals(200, 280, 460, 980, 980, 1320), createLifetimes(range(220, 360), range(980, 1360), range(1520, 2200), range(2260, 2860), range(180, 420), range(2200, 3100))),
            smoldering: createSeverityProfile({
                flame: counts(0, 1, 2),
                smokeLow: counts(2, 4, 6),
                smokeMid: counts(1, 4, 5),
                smokeHigh: counts(0, 1, 3),
                emberAir: counts(0, 0, 0),
                heatHaze: counts(0, 0, 1)
            }, createIntervals(720, 520, 760, 1240, 999999, 1560), createLifetimes(range(220, 320), range(1040, 1400), range(1600, 2280), range(2360, 2940), range(180, 360), range(2300, 3200)))
        }
    }
};
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
}
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}
function hashUnit(seed, salt) {
    let value = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x85ebca6b) >>> 0;
    value ^= value >>> 13;
    value = Math.imul(value, 0xc2b2ae35) >>> 0;
    value ^= value >>> 16;
    return value / 4294967296;
}
function pickTierValue(countsByTier, zoomTier) {
    return countsByTier[zoomTier];
}
export function resolveWreckSeverity(preset, elapsedMs) {
    if (elapsedMs < preset.severityWindowsMs.freshEnd) {
        return "fresh";
    }
    if (elapsedMs < preset.severityWindowsMs.burningEnd) {
        return "burning";
    }
    if (elapsedMs < preset.severityWindowsMs.settlingEnd) {
        return "settling";
    }
    return "smoldering";
}
export function getWreckFxPreset(wreckClass) {
    return WRECK_FX_PRESETS[wreckClass];
}
export function resolveWreckFxClass(unitClass, scenarioType) {
    const normalizedType = String(scenarioType ?? "").toLowerCase();
    const isGroundReconVehicle = unitClass === "recon" &&
        !normalizedType.includes("plane") &&
        !normalizedType.includes("air");
    if (normalizedType.includes("supply")) {
        return "convoy";
    }
    if (unitClass === "tank" || normalizedType.includes("tank")) {
        return "tank";
    }
    if (unitClass === "artillery" ||
        normalizedType.includes("artillery") ||
        normalizedType.includes("howitzer") ||
        normalizedType.includes("gun") ||
        normalizedType.includes("flak")) {
        return "artillery";
    }
    if (unitClass === "vehicle" ||
        isGroundReconVehicle ||
        normalizedType.includes("bike") ||
        normalizedType.includes("car") ||
        normalizedType.includes("armored") ||
        normalizedType.includes("truck") ||
        normalizedType.includes("halftrack") ||
        normalizedType.includes("apc")) {
        return "truck";
    }
    return "infantry";
}
function createGroup(className) {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", className);
    return group;
}
function hideElement(element) {
    element.style.display = "none";
}
function showElement(element) {
    element.style.display = "";
}
function ensureSharedDefs(svgRoot) {
    const existing = svgRoot.querySelector("#wreck-fx-shared-defs");
    if (existing) {
        return;
    }
    let defs = svgRoot.querySelector("#battleDefs");
    if (!defs) {
        defs = document.createElementNS(SVG_NS, "defs");
        defs.setAttribute("id", "battleDefs");
        svgRoot.insertBefore(defs, svgRoot.firstChild);
    }
    const sharedDefs = document.createElementNS(SVG_NS, "g");
    sharedDefs.setAttribute("id", "wreck-fx-shared-defs");
    const smokeBlurSmall = document.createElementNS(SVG_NS, "filter");
    smokeBlurSmall.setAttribute("id", "wreck-smoke-blur-small");
    smokeBlurSmall.setAttribute("x", "-40%");
    smokeBlurSmall.setAttribute("y", "-40%");
    smokeBlurSmall.setAttribute("width", "180%");
    smokeBlurSmall.setAttribute("height", "180%");
    const smokeBlurSmallGaussian = document.createElementNS(SVG_NS, "feGaussianBlur");
    smokeBlurSmallGaussian.setAttribute("stdDeviation", "1.8");
    smokeBlurSmall.appendChild(smokeBlurSmallGaussian);
    const smokeBlurMedium = document.createElementNS(SVG_NS, "filter");
    smokeBlurMedium.setAttribute("id", "wreck-smoke-blur-medium");
    smokeBlurMedium.setAttribute("x", "-50%");
    smokeBlurMedium.setAttribute("y", "-50%");
    smokeBlurMedium.setAttribute("width", "200%");
    smokeBlurMedium.setAttribute("height", "200%");
    const smokeBlurMediumGaussian = document.createElementNS(SVG_NS, "feGaussianBlur");
    smokeBlurMediumGaussian.setAttribute("stdDeviation", "3.2");
    smokeBlurMedium.appendChild(smokeBlurMediumGaussian);
    const emberGlow = document.createElementNS(SVG_NS, "filter");
    emberGlow.setAttribute("id", "wreck-ember-glow");
    emberGlow.setAttribute("x", "-60%");
    emberGlow.setAttribute("y", "-60%");
    emberGlow.setAttribute("width", "220%");
    emberGlow.setAttribute("height", "220%");
    const emberGlowBlur = document.createElementNS(SVG_NS, "feGaussianBlur");
    emberGlowBlur.setAttribute("stdDeviation", "2.6");
    emberGlow.appendChild(emberGlowBlur);
    sharedDefs.append(smokeBlurSmall, smokeBlurMedium, emberGlow);
    const gradients = [
        ["wreck-fire-core", [["0%", "#ff8a1f", "1"], ["45%", "#ffd14a", "0.98"], ["100%", "#fff0b0", "0.92"]]],
        ["wreck-fire-flame", [["0%", "#8a2a1f", "0.9"], ["35%", "#d95a17", "0.96"], ["72%", "#ff8a1f", "0.98"], ["100%", "#ffd14a", "0.88"]]],
        ["wreck-smoke-low", [["0%", "#241c1a", "0.92"], ["55%", "#3a302d", "0.86"], ["100%", "#5a514d", "0.36"]]],
        ["wreck-smoke-mid", [["0%", "#3a302d", "0.8"], ["60%", "#5a514d", "0.62"], ["100%", "#8c8782", "0.22"]]],
        ["wreck-smoke-high", [["0%", "#5a514d", "0.48"], ["55%", "#8c8782", "0.28"], ["100%", "#c2bbb4", "0.08"]]]
    ];
    gradients.forEach(([id, stops]) => {
        const gradient = document.createElementNS(SVG_NS, "linearGradient");
        gradient.setAttribute("id", id);
        gradient.setAttribute("x1", "0%");
        gradient.setAttribute("y1", "100%");
        gradient.setAttribute("x2", "0%");
        gradient.setAttribute("y2", "0%");
        stops.forEach(([offset, color, opacity]) => {
            const stop = document.createElementNS(SVG_NS, "stop");
            stop.setAttribute("offset", offset);
            stop.setAttribute("stop-color", color);
            stop.setAttribute("stop-opacity", opacity);
            gradient.appendChild(stop);
        });
        sharedDefs.appendChild(gradient);
    });
    const emberGradient = document.createElementNS(SVG_NS, "radialGradient");
    emberGradient.setAttribute("id", "wreck-fire-ember");
    [["0%", "#ffd14a", "0.95"], ["58%", "#ff8a1f", "0.88"], ["100%", "#8a2a1f", "0.48"]].forEach(([offset, color, opacity]) => {
        const stop = document.createElementNS(SVG_NS, "stop");
        stop.setAttribute("offset", offset);
        stop.setAttribute("stop-color", color);
        stop.setAttribute("stop-opacity", opacity);
        emberGradient.appendChild(stop);
    });
    sharedDefs.appendChild(emberGradient);
    defs.appendChild(sharedDefs);
}
function createBlobPath(cx, cy, rx, ry, variant) {
    const top = ry * (0.92 + variant * 0.18);
    const right = rx * (0.88 + (1 - variant) * 0.22);
    const bottom = ry * (0.9 + (0.5 - Math.abs(variant - 0.5)) * 0.32);
    const left = rx * (0.84 + variant * 0.26);
    const cxTop = 0.58;
    const cySide = 0.54;
    return [
        `M ${cx} ${cy - top}`,
        `C ${cx + right * cxTop} ${cy - top}, ${cx + right} ${cy - top * cySide}, ${cx + right} ${cy}`,
        `C ${cx + right} ${cy + bottom * cySide}, ${cx + left * cxTop} ${cy + bottom}, ${cx} ${cy + bottom}`,
        `C ${cx - left * cxTop} ${cy + bottom}, ${cx - left} ${cy + bottom * cySide}, ${cx - left} ${cy}`,
        `C ${cx - left} ${cy - top * cySide}, ${cx - right * cxTop} ${cy - top}, ${cx} ${cy - top}`,
        "Z"
    ].join(" ");
}
function hotspotPositions(preset) {
    return preset.hotspotOffsets.map((offset) => ({
        x: ANCHOR_X + offset.x,
        y: HOTSPOT_BASE_Y + offset.y
    }));
}
function lifetimeFromBand(band, seed, salt) {
    return Math.round(lerp(band.minMs, band.maxMs, hashUnit(seed, salt)));
}
function createEmitterState() {
    return {
        flame: { timerMs: 999999, sequence: 0 },
        smokeLow: { timerMs: 999999, sequence: 0 },
        smokeMid: { timerMs: 999999, sequence: 0 },
        smokeHigh: { timerMs: 999999, sequence: 0 },
        emberAir: { timerMs: 999999, sequence: 0 },
        heatHaze: { timerMs: 999999, sequence: 0 }
    };
}
export class WreckFxRenderer {
    constructor(svgRoot, zoomResolver) {
        this.instances = new Map();
        this.rafHandle = null;
        this.lastTimestamp = 0;
        this.tick = (timestamp) => {
            const dt = this.lastTimestamp > 0 ? clamp(timestamp - this.lastTimestamp, 8, 48) : 16;
            this.lastTimestamp = timestamp;
            this.instances.forEach((instance) => this.updateInstance(instance, timestamp, dt));
            if (this.instances.size > 0) {
                this.rafHandle = requestAnimationFrame(this.tick);
            }
            else {
                this.rafHandle = null;
            }
        };
        this.svgRoot = svgRoot;
        this.zoomResolver = zoomResolver;
        ensureSharedDefs(svgRoot);
    }
    bindSvg(svgRoot) {
        this.svgRoot = svgRoot;
        ensureSharedDefs(svgRoot);
    }
    upsertWreck(options) {
        ensureSharedDefs(this.svgRoot);
        const mode = options.mode ?? "wreck";
        const forcedSeverity = options.forcedSeverity ?? null;
        const allowFlames = options.allowFlames ?? true;
        const preset = getWreckFxPreset(options.wreckClass);
        let instance = this.instances.get(options.hexKey);
        if (instance &&
            (instance.preset.wreckClass !== options.wreckClass ||
                instance.mode !== mode ||
                instance.forcedSeverity !== forcedSeverity ||
                instance.allowFlames !== allowFlames)) {
            instance.root.remove();
            this.instances.delete(options.hexKey);
            instance = undefined;
        }
        if (!instance) {
            instance = this.createInstance(options.hexKey, options.seed, preset, mode, forcedSeverity, allowFlames);
            this.instances.set(options.hexKey, instance);
        }
        instance.preset = preset;
        instance.mode = mode;
        instance.forcedSeverity = forcedSeverity;
        instance.allowFlames = allowFlames;
        instance.startedAtMs || (instance.startedAtMs = performance.now());
        instance.anchorX = options.anchorX;
        instance.anchorY = options.anchorY;
        instance.zoomTier = this.zoomResolver();
        instance.root.setAttribute("data-wreck-mode", mode);
        if (forcedSeverity) {
            instance.root.setAttribute("data-wreck-severity", forcedSeverity);
        }
        else {
            instance.root.removeAttribute("data-wreck-severity");
        }
        instance.root.setAttribute("transform", `translate(${options.anchorX - ANCHOR_X} ${options.anchorY - ANCHOR_Y})`);
        if (instance.root.parentNode !== options.parentGroup) {
            options.parentGroup.appendChild(instance.root);
        }
        this.ensureRunning();
    }
    removeWreck(hexKey) {
        const instance = this.instances.get(hexKey);
        if (!instance) {
            return;
        }
        instance.root.remove();
        this.instances.delete(hexKey);
        if (this.instances.size === 0 && this.rafHandle !== null) {
            cancelAnimationFrame(this.rafHandle);
            this.rafHandle = null;
        }
    }
    stopAll() {
        this.instances.forEach((instance) => instance.root.remove());
        this.instances.clear();
        if (this.rafHandle !== null) {
            cancelAnimationFrame(this.rafHandle);
            this.rafHandle = null;
        }
    }
    stepForTests(timestamp) {
        this.tick(timestamp);
    }
    ensureRunning() {
        if (this.rafHandle !== null) {
            return;
        }
        this.lastTimestamp = performance.now();
        this.rafHandle = requestAnimationFrame(this.tick);
    }
    createInstance(hexKey, seed, preset, mode, forcedSeverity, allowFlames) {
        const root = createGroup("wreck-fx");
        root.setAttribute("data-wreck-hex", hexKey);
        root.setAttribute("data-wreck-class", preset.wreckClass);
        root.setAttribute("data-wreck-mode", mode);
        if (forcedSeverity) {
            root.setAttribute("data-wreck-severity", forcedSeverity);
        }
        const shadowGroup = createGroup("wreck-shadow");
        const emberBedGroup = createGroup("ember-bed");
        const flameGroup = createGroup("flame-layer");
        const smokeLowGroup = createGroup("smoke-low");
        const smokeMidGroup = createGroup("smoke-mid");
        const smokeHighGroup = createGroup("smoke-high");
        const emberAirGroup = createGroup("embers-air");
        const heatHazeGroup = createGroup("heat-haze");
        root.append(shadowGroup, emberBedGroup, flameGroup, smokeLowGroup, smokeMidGroup, smokeHighGroup, emberAirGroup, heatHazeGroup);
        const emberBed = [];
        const emberGlows = [];
        for (let i = 0; i < 8; i += 1) {
            const ellipse = document.createElementNS(SVG_NS, "ellipse");
            ellipse.setAttribute("fill", "url(#wreck-fire-ember)");
            ellipse.setAttribute("filter", "url(#wreck-ember-glow)");
            emberBedGroup.appendChild(ellipse);
            emberBed.push(ellipse);
        }
        for (let i = 0; i < 4; i += 1) {
            const glow = document.createElementNS(SVG_NS, "circle");
            glow.setAttribute("fill", "#ff8a1f");
            glow.setAttribute("filter", "url(#wreck-ember-glow)");
            emberBedGroup.appendChild(glow);
            emberGlows.push(glow);
        }
        const flames = Array.from({ length: 10 }, () => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("fill", "url(#wreck-fire-flame)");
            flameGroup.appendChild(path);
            hideElement(path);
            return {
                element: path,
                active: false,
                bornAtMs: 0,
                lifeMs: 0,
                hotspotIndex: 0,
                height: 0,
                width: 0,
                lean: 0,
                rotation: 0,
                peakOpacity: 0,
                phase: 0,
                swayAmp: 0,
                swayFreq: 0
            };
        });
        const smokeLow = Array.from({ length: 12 }, () => this.createSmokeParticle(smokeLowGroup, "low"));
        const smokeMid = Array.from({ length: 10 }, () => this.createSmokeParticle(smokeMidGroup, "mid"));
        const smokeHigh = Array.from({ length: 5 }, () => this.createSmokeParticle(smokeHighGroup, "high"));
        const emberAir = Array.from({ length: 6 }, () => {
            const ellipse = document.createElementNS(SVG_NS, "ellipse");
            ellipse.setAttribute("fill", "#ffd14a");
            ellipse.setAttribute("filter", "url(#wreck-ember-glow)");
            emberAirGroup.appendChild(ellipse);
            hideElement(ellipse);
            return {
                element: ellipse,
                active: false,
                bornAtMs: 0,
                lifeMs: 0,
                hotspotIndex: 0,
                startX: 0,
                startY: 0,
                driftX: 0,
                rise: 0,
                peakOpacity: 0,
                radiusX: 0,
                radiusY: 0,
                rotation: 0,
                phase: 0
            };
        });
        const heatHaze = Array.from({ length: 4 }, () => {
            const ellipse = document.createElementNS(SVG_NS, "ellipse");
            ellipse.setAttribute("fill", "#f1c79c");
            ellipse.setAttribute("filter", "url(#wreck-smoke-blur-small)");
            heatHazeGroup.appendChild(ellipse);
            hideElement(ellipse);
            return {
                element: ellipse,
                active: false,
                bornAtMs: 0,
                lifeMs: 0,
                hotspotIndex: 0,
                startX: 0,
                startY: 0,
                driftX: 0,
                rise: 0,
                peakOpacity: 0,
                radiusX: 0,
                radiusY: 0,
                phase: 0
            };
        });
        return {
            hexKey,
            seed,
            preset,
            root,
            shadowGroup,
            emberBedGroup,
            flameGroup,
            smokeLowGroup,
            smokeMidGroup,
            smokeHighGroup,
            emberAirGroup,
            heatHazeGroup,
            emberBed,
            emberGlows,
            flames,
            smokeLow,
            smokeMid,
            smokeHigh,
            emberAir,
            heatHaze,
            emitters: createEmitterState(),
            mode,
            forcedSeverity,
            allowFlames,
            startedAtMs: performance.now(),
            anchorX: 0,
            anchorY: 0,
            zoomTier: "mid"
        };
    }
    createSmokeParticle(parent, band) {
        const element = band === "high"
            ? document.createElementNS(SVG_NS, "ellipse")
            : document.createElementNS(SVG_NS, "path");
        element.setAttribute("fill", band === "low" ? "url(#wreck-smoke-low)" : band === "mid" ? "url(#wreck-smoke-mid)" : "url(#wreck-smoke-high)");
        element.setAttribute("filter", band === "low" ? "url(#wreck-smoke-blur-small)" : "url(#wreck-smoke-blur-medium)");
        parent.appendChild(element);
        hideElement(element);
        return {
            element,
            active: false,
            bornAtMs: 0,
            lifeMs: 0,
            hotspotIndex: 0,
            startX: 0,
            startY: 0,
            rise: 0,
            driftX: 0,
            swayAmp: 0,
            swayFreq: 0,
            startScale: 0,
            endScale: 0,
            peakOpacity: 0,
            rotation: 0,
            radiusX: 0,
            radiusY: 0,
            variant: 0,
            phase: 0
        };
    }
    updateInstance(instance, nowMs, dtMs) {
        instance.zoomTier = this.zoomResolver();
        const elapsedMs = Math.max(0, nowMs - instance.startedAtMs);
        const severity = instance.forcedSeverity ?? resolveWreckSeverity(instance.preset, elapsedMs);
        const profile = instance.preset.severities[severity];
        this.renderShadow(instance, nowMs);
        this.renderEmberBed(instance, nowMs);
        this.updateFlames(instance, nowMs);
        this.updateSmokeParticles(instance.smokeLow, "smokeLow", nowMs);
        this.updateSmokeParticles(instance.smokeMid, "smokeMid", nowMs);
        this.updateSmokeParticles(instance.smokeHigh, "smokeHigh", nowMs);
        this.updateEmberAir(instance, nowMs);
        this.updateHeatHaze(instance, nowMs);
        const countScale = instance.mode === "damage"
            ? instance.allowFlames ? 0.72 : 0.56
            : 1;
        const flameTarget = instance.allowFlames
            ? scaledCount(pickTierValue(profile.counts.flame, instance.zoomTier), countScale)
            : 0;
        const smokeLowTarget = scaledCount(pickTierValue(profile.counts.smokeLow, instance.zoomTier), countScale, 1);
        const smokeMidTarget = scaledCount(pickTierValue(profile.counts.smokeMid, instance.zoomTier), countScale, 1);
        const smokeHighTarget = scaledCount(pickTierValue(profile.counts.smokeHigh, instance.zoomTier), countScale);
        const emberAirTarget = scaledCount(pickTierValue(profile.counts.emberAir, instance.zoomTier), countScale);
        const hazeTarget = instance.mode === "wreck" && instance.preset.heatHazeEnabled
            ? pickTierValue(profile.counts.heatHaze, instance.zoomTier)
            : 0;
        this.emitFamily(instance, "flame", dtMs, flameTarget, profile);
        this.emitFamily(instance, "smokeLow", dtMs, smokeLowTarget, profile);
        this.emitFamily(instance, "smokeMid", dtMs, smokeMidTarget, profile);
        this.emitFamily(instance, "smokeHigh", dtMs, smokeHighTarget, profile);
        this.emitFamily(instance, "emberAir", dtMs, emberAirTarget, profile);
        this.emitFamily(instance, "heatHaze", dtMs, hazeTarget, profile);
    }
    renderShadow(instance, nowMs) {
        while (instance.shadowGroup.firstChild) {
            instance.shadowGroup.firstChild.remove();
        }
        const pulse = 0.92 + Math.sin((nowMs + instance.seed) / 600) * 0.04;
        const isDamageMode = instance.mode === "damage";
        const shadow = document.createElementNS(SVG_NS, "ellipse");
        shadow.setAttribute("cx", `${ANCHOR_X}`);
        shadow.setAttribute("cy", `${ANCHOR_Y - (isDamageMode ? 6 : 4)}`);
        shadow.setAttribute("rx", `${(isDamageMode ? 18 : 30) * pulse}`);
        shadow.setAttribute("ry", `${(isDamageMode ? 5 : 9) * pulse}`);
        shadow.setAttribute("fill", "#0d0b0a");
        shadow.setAttribute("opacity", isDamageMode ? "0.14" : "0.28");
        const warmGlow = document.createElementNS(SVG_NS, "ellipse");
        warmGlow.setAttribute("cx", `${ANCHOR_X}`);
        warmGlow.setAttribute("cy", `${ANCHOR_Y - (isDamageMode ? 12 : 10)}`);
        warmGlow.setAttribute("rx", `${(isDamageMode ? 14 : 22) * pulse}`);
        warmGlow.setAttribute("ry", `${(isDamageMode ? 3.8 : 6) * pulse}`);
        warmGlow.setAttribute("fill", "#6d3a18");
        warmGlow.setAttribute("opacity", isDamageMode ? "0.07" : "0.12");
        warmGlow.setAttribute("filter", "url(#wreck-smoke-blur-small)");
        instance.shadowGroup.append(shadow, warmGlow);
    }
    renderEmberBed(instance, nowMs) {
        const hotspots = hotspotPositions(instance.preset);
        const emberScale = instance.mode === "damage"
            ? instance.allowFlames ? 0.68 : 0.42
            : 1;
        const emberCount = scaledCount(pickTierValue(instance.preset.emberBedCount, instance.zoomTier), emberScale, 1);
        const glowCount = scaledCount(pickTierValue(instance.preset.emberGlowCount, instance.zoomTier), emberScale);
        instance.emberBed.forEach((element, index) => {
            if (index >= emberCount) {
                hideElement(element);
                return;
            }
            const hotspot = hotspots[index % hotspots.length];
            const phase = (nowMs / 420) + hashUnit(instance.seed, 11 + index) * Math.PI * 2;
            const pulse = 0.82 + Math.sin(phase) * 0.18;
            const dx = (hashUnit(instance.seed, 41 + index) - 0.5) * 20;
            const dy = (hashUnit(instance.seed, 67 + index) - 0.5) * 10;
            const rx = 7 + hashUnit(instance.seed, 89 + index) * 7;
            const ry = 3 + hashUnit(instance.seed, 101 + index) * 3;
            const cx = hotspot.x + dx;
            const cy = hotspot.y + 7 + dy;
            element.setAttribute("cx", `${cx}`);
            element.setAttribute("cy", `${cy}`);
            element.setAttribute("rx", `${rx * pulse}`);
            element.setAttribute("ry", `${ry * (0.88 + pulse * 0.24)}`);
            element.setAttribute("opacity", `${0.24 + pulse * 0.28}`);
            showElement(element);
        });
        instance.emberGlows.forEach((element, index) => {
            if (index >= glowCount) {
                hideElement(element);
                return;
            }
            const hotspot = hotspots[index % hotspots.length];
            const phase = (nowMs / 320) + hashUnit(instance.seed, 131 + index) * Math.PI * 2;
            const pulse = 0.84 + Math.sin(phase) * 0.16;
            const cx = hotspot.x + (hashUnit(instance.seed, 151 + index) - 0.5) * 12;
            const cy = hotspot.y + 5 + (hashUnit(instance.seed, 171 + index) - 0.5) * 6;
            const radius = 1.8 + hashUnit(instance.seed, 191 + index) * 2.6;
            element.setAttribute("cx", `${cx}`);
            element.setAttribute("cy", `${cy}`);
            element.setAttribute("r", `${radius * pulse}`);
            element.setAttribute("opacity", `${0.22 + pulse * 0.22}`);
            showElement(element);
        });
    }
    updateFlames(instance, nowMs) {
        const hotspots = hotspotPositions(instance.preset);
        instance.flames.forEach((particle) => {
            if (!particle.active) {
                return;
            }
            const age = nowMs - particle.bornAtMs;
            if (age >= particle.lifeMs) {
                particle.active = false;
                hideElement(particle.element);
                return;
            }
            const t = clamp(age / particle.lifeMs, 0, 1);
            const hotspot = hotspots[particle.hotspotIndex];
            const height = particle.height * (0.62 + Math.sin((t + particle.phase) * Math.PI) * 0.34);
            const width = particle.width * (0.76 + Math.sin((t * 1.7 + particle.phase) * Math.PI) * 0.16);
            const sway = Math.sin(t * particle.swayFreq + particle.phase) * particle.swayAmp;
            const tipX = hotspot.x + particle.lean + sway;
            const tipY = hotspot.y - height;
            const leftBaseX = hotspot.x - width * 0.44;
            const rightBaseX = hotspot.x + width * 0.44;
            const bodyMidY = hotspot.y - height * 0.45;
            const pathData = [
                `M ${hotspot.x} ${hotspot.y + 2}`,
                `C ${leftBaseX} ${hotspot.y - height * 0.18}, ${tipX - width * 0.18} ${bodyMidY}, ${tipX} ${tipY}`,
                `C ${tipX + width * 0.12} ${bodyMidY}, ${rightBaseX} ${hotspot.y - height * 0.14}, ${hotspot.x} ${hotspot.y + 2}`,
                "Z"
            ].join(" ");
            particle.element.setAttribute("d", pathData);
            particle.element.setAttribute("opacity", `${particle.peakOpacity * Math.pow(1 - t, 0.55)}`);
            particle.element.setAttribute("transform", `rotate(${particle.rotation + sway * 2.4} ${hotspot.x} ${hotspot.y})`);
            particle.element.setAttribute("fill", hashUnit(instance.seed, 241 + particle.hotspotIndex + Math.round(particle.phase * 100)) > 0.45 ? "url(#wreck-fire-flame)" : "url(#wreck-fire-core)");
            showElement(particle.element);
        });
    }
    updateSmokeParticles(particles, family, nowMs) {
        particles.forEach((particle) => {
            if (!particle.active) {
                return;
            }
            const age = nowMs - particle.bornAtMs;
            if (age >= particle.lifeMs) {
                particle.active = false;
                hideElement(particle.element);
                return;
            }
            const t = clamp(age / particle.lifeMs, 0, 1);
            const x = particle.startX + particle.driftX * t + Math.sin(t * particle.swayFreq + particle.phase) * particle.swayAmp;
            const y = particle.startY - particle.rise * easeOutQuad(t);
            const scale = lerp(particle.startScale, particle.endScale, easeOutCubic(t));
            const opacity = particle.peakOpacity * Math.pow(1 - t, 1.2);
            const rx = particle.radiusX * scale;
            const ry = particle.radiusY * scale;
            if (particle.element.tagName === "ellipse") {
                const ellipse = particle.element;
                ellipse.setAttribute("cx", `${x}`);
                ellipse.setAttribute("cy", `${y}`);
                ellipse.setAttribute("rx", `${rx}`);
                ellipse.setAttribute("ry", `${ry}`);
                ellipse.setAttribute("transform", `rotate(${particle.rotation} ${x} ${y})`);
            }
            else {
                const path = particle.element;
                path.setAttribute("d", createBlobPath(x, y, rx, ry, particle.variant));
                path.setAttribute("transform", `rotate(${particle.rotation} ${x} ${y})`);
            }
            particle.element.setAttribute("opacity", `${opacity}`);
            particle.element.setAttribute("fill", family === "smokeLow" ? "url(#wreck-smoke-low)" : family === "smokeMid" ? "url(#wreck-smoke-mid)" : "url(#wreck-smoke-high)");
            showElement(particle.element);
        });
    }
    updateEmberAir(instance, nowMs) {
        instance.emberAir.forEach((particle) => {
            if (!particle.active) {
                return;
            }
            const age = nowMs - particle.bornAtMs;
            if (age >= particle.lifeMs) {
                particle.active = false;
                hideElement(particle.element);
                return;
            }
            const t = clamp(age / particle.lifeMs, 0, 1);
            const x = particle.startX + particle.driftX * t;
            const y = particle.startY - particle.rise * easeOutQuad(t);
            const rx = lerp(particle.radiusX, particle.radiusX * 0.38, t);
            const ry = lerp(particle.radiusY, particle.radiusY * 0.24, t);
            particle.element.setAttribute("cx", `${x}`);
            particle.element.setAttribute("cy", `${y}`);
            particle.element.setAttribute("rx", `${Math.max(0.3, rx)}`);
            particle.element.setAttribute("ry", `${Math.max(0.2, ry)}`);
            particle.element.setAttribute("opacity", `${particle.peakOpacity * Math.pow(1 - t, 1.5)}`);
            particle.element.setAttribute("transform", `rotate(${particle.rotation} ${x} ${y})`);
            particle.element.setAttribute("fill", t < 0.25 ? "#ffd14a" : "#ff8a1f");
            showElement(particle.element);
        });
    }
    updateHeatHaze(instance, nowMs) {
        instance.heatHaze.forEach((particle) => {
            if (!particle.active) {
                return;
            }
            const age = nowMs - particle.bornAtMs;
            if (age >= particle.lifeMs) {
                particle.active = false;
                hideElement(particle.element);
                return;
            }
            const t = clamp(age / particle.lifeMs, 0, 1);
            const x = particle.startX + particle.driftX * t;
            const y = particle.startY - particle.rise * easeOutQuad(t);
            const wobble = 1 + Math.sin(t * 5 + particle.phase) * 0.08;
            particle.element.setAttribute("cx", `${x}`);
            particle.element.setAttribute("cy", `${y}`);
            particle.element.setAttribute("rx", `${particle.radiusX * wobble}`);
            particle.element.setAttribute("ry", `${particle.radiusY * (1 + Math.sin(t * 4 + particle.phase) * 0.05)}`);
            particle.element.setAttribute("opacity", `${particle.peakOpacity * Math.pow(1 - t, 1.15)}`);
            showElement(particle.element);
        });
    }
    emitFamily(instance, family, dtMs, targetCount, profile) {
        const emitter = instance.emitters[family];
        emitter.timerMs += dtMs;
        const missing = Math.max(0, targetCount - this.countActiveParticles(instance, family));
        if (missing <= 0) {
            return;
        }
        const intervalMs = profile.intervalsMs[family];
        if (intervalMs <= 0) {
            return;
        }
        while (emitter.timerMs >= intervalMs && this.countActiveParticles(instance, family) < targetCount) {
            emitter.timerMs -= intervalMs;
            this.spawnParticle(instance, family, emitter.sequence, profile);
            emitter.sequence += 1;
        }
    }
    countActiveParticles(instance, family) {
        const list = family === "flame"
            ? instance.flames
            : family === "smokeLow"
                ? instance.smokeLow
                : family === "smokeMid"
                    ? instance.smokeMid
                    : family === "smokeHigh"
                        ? instance.smokeHigh
                        : family === "emberAir"
                            ? instance.emberAir
                            : instance.heatHaze;
        return list.reduce((sum, particle) => sum + (particle.active ? 1 : 0), 0);
    }
    spawnParticle(instance, family, sequence, profile) {
        const hotspots = hotspotPositions(instance.preset);
        if (hotspots.length === 0) {
            return;
        }
        const hotspotIndexRaw = Math.floor(hashUnit(instance.seed, 500 + sequence * 7 + family.length) * hotspots.length);
        const hotspotIndex = Number.isFinite(hotspotIndexRaw)
            ? clamp(hotspotIndexRaw, 0, hotspots.length - 1)
            : 0;
        const hotspot = hotspots[hotspotIndex] ?? { x: ANCHOR_X, y: HOTSPOT_BASE_Y };
        const bornAtMs = performance.now();
        const lifetime = lifetimeFromBand(profile.lifetimes[family], instance.seed, 700 + sequence * 11 + family.length);
        if (family === "flame") {
            const particle = instance.flames.find((entry) => !entry.active);
            if (!particle) {
                return;
            }
            particle.active = true;
            particle.bornAtMs = bornAtMs;
            particle.lifeMs = lifetime;
            particle.hotspotIndex = hotspotIndex;
            particle.height = 16 + hashUnit(instance.seed, 740 + sequence) * 24;
            particle.width = 6 + hashUnit(instance.seed, 760 + sequence) * 10;
            particle.lean = (hashUnit(instance.seed, 780 + sequence) - 0.5) * 8;
            particle.rotation = (hashUnit(instance.seed, 800 + sequence) - 0.5) * 16;
            particle.peakOpacity = 0.48 + hashUnit(instance.seed, 820 + sequence) * 0.34;
            particle.phase = hashUnit(instance.seed, 840 + sequence) * Math.PI * 2;
            particle.swayAmp = 1.2 + hashUnit(instance.seed, 860 + sequence) * 2.2;
            particle.swayFreq = 5 + hashUnit(instance.seed, 880 + sequence) * 4;
            showElement(particle.element);
            return;
        }
        if (family === "smokeLow" || family === "smokeMid" || family === "smokeHigh") {
            const collection = family === "smokeLow" ? instance.smokeLow : family === "smokeMid" ? instance.smokeMid : instance.smokeHigh;
            const particle = collection.find((entry) => !entry.active);
            if (!particle) {
                return;
            }
            particle.active = true;
            particle.bornAtMs = bornAtMs;
            particle.lifeMs = lifetime;
            particle.hotspotIndex = hotspotIndex;
            particle.startX = hotspot.x + (hashUnit(instance.seed, 900 + sequence) - 0.5) * (family === "smokeHigh" ? 18 : 10);
            particle.startY = hotspot.y - (family === "smokeHigh" ? 8 : 2) + (hashUnit(instance.seed, 920 + sequence) - 0.5) * 6;
            particle.rise = family === "smokeLow" ? 18 + hashUnit(instance.seed, 940 + sequence) * 20 : family === "smokeMid" ? 26 + hashUnit(instance.seed, 960 + sequence) * 28 : 36 + hashUnit(instance.seed, 980 + sequence) * 34;
            particle.driftX = (hashUnit(instance.seed, 1000 + sequence) - 0.5) * (family === "smokeHigh" ? 18 : 12);
            particle.swayAmp = family === "smokeHigh" ? 4 + hashUnit(instance.seed, 1020 + sequence) * 3 : 2 + hashUnit(instance.seed, 1040 + sequence) * 3;
            particle.swayFreq = 2.2 + hashUnit(instance.seed, 1060 + sequence) * 1.8;
            particle.startScale = family === "smokeLow" ? 0.7 : family === "smokeMid" ? 0.8 : 0.88;
            particle.endScale = family === "smokeLow" ? 1.5 : family === "smokeMid" ? 1.8 : 1.65;
            particle.peakOpacity = family === "smokeLow" ? 0.34 + hashUnit(instance.seed, 1080 + sequence) * 0.18 : family === "smokeMid" ? 0.22 + hashUnit(instance.seed, 1100 + sequence) * 0.12 : 0.14 + hashUnit(instance.seed, 1120 + sequence) * 0.08;
            particle.rotation = (hashUnit(instance.seed, 1140 + sequence) - 0.5) * 24;
            particle.radiusX = family === "smokeLow" ? 8 + hashUnit(instance.seed, 1160 + sequence) * 7 : family === "smokeMid" ? 10 + hashUnit(instance.seed, 1180 + sequence) * 9 : 7 + hashUnit(instance.seed, 1200 + sequence) * 6;
            particle.radiusY = family === "smokeLow" ? 5 + hashUnit(instance.seed, 1220 + sequence) * 5 : family === "smokeMid" ? 7 + hashUnit(instance.seed, 1240 + sequence) * 6 : 4 + hashUnit(instance.seed, 1260 + sequence) * 4;
            particle.variant = hashUnit(instance.seed, 1280 + sequence);
            particle.phase = hashUnit(instance.seed, 1300 + sequence) * Math.PI * 2;
            showElement(particle.element);
            return;
        }
        if (family === "emberAir") {
            const particle = instance.emberAir.find((entry) => !entry.active);
            if (!particle) {
                return;
            }
            particle.active = true;
            particle.bornAtMs = bornAtMs;
            particle.lifeMs = lifetime;
            particle.hotspotIndex = hotspotIndex;
            particle.startX = hotspot.x + (hashUnit(instance.seed, 1320 + sequence) - 0.5) * 10;
            particle.startY = hotspot.y - 4 + (hashUnit(instance.seed, 1340 + sequence) - 0.5) * 4;
            particle.driftX = (hashUnit(instance.seed, 1360 + sequence) - 0.5) * 10;
            particle.rise = 12 + hashUnit(instance.seed, 1380 + sequence) * 18;
            particle.peakOpacity = 0.54 + hashUnit(instance.seed, 1400 + sequence) * 0.3;
            particle.radiusX = 0.8 + hashUnit(instance.seed, 1420 + sequence) * 1.6;
            particle.radiusY = 0.4 + hashUnit(instance.seed, 1440 + sequence) * 0.8;
            particle.rotation = (hashUnit(instance.seed, 1460 + sequence) - 0.5) * 60;
            particle.phase = hashUnit(instance.seed, 1480 + sequence) * Math.PI * 2;
            showElement(particle.element);
            return;
        }
        const particle = instance.heatHaze.find((entry) => !entry.active);
        if (!particle) {
            return;
        }
        particle.active = true;
        particle.bornAtMs = bornAtMs;
        particle.lifeMs = lifetime;
        particle.hotspotIndex = hotspotIndex;
        particle.startX = hotspot.x + (hashUnit(instance.seed, 1500 + sequence) - 0.5) * 16;
        particle.startY = hotspot.y - 18 + (hashUnit(instance.seed, 1520 + sequence) - 0.5) * 6;
        particle.driftX = (hashUnit(instance.seed, 1540 + sequence) - 0.5) * 10;
        particle.rise = 10 + hashUnit(instance.seed, 1560 + sequence) * 16;
        particle.peakOpacity = 0.05 + hashUnit(instance.seed, 1580 + sequence) * 0.04;
        particle.radiusX = 10 + hashUnit(instance.seed, 1600 + sequence) * 12;
        particle.radiusY = 3 + hashUnit(instance.seed, 1620 + sequence) * 2.8;
        particle.phase = hashUnit(instance.seed, 1640 + sequence) * Math.PI * 2;
        showElement(particle.element);
    }
}
