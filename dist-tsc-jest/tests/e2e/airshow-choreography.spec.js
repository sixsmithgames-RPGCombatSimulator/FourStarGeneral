import { expect, test } from "@playwright/test";
const AIRSHOW_CHOREOGRAPHY_TIMEOUT_MS = 120000;
function makeChoreographyTests(describeLabel, testUrl, setupTimeoutMs = 15000, testTimeoutMs = AIRSHOW_CHOREOGRAPHY_TIMEOUT_MS) {
    test.describe(describeLabel, () => {
        test.beforeEach(async ({ page }) => {
            await page.goto(testUrl);
            await page.waitForSelector("#battleHexMap", { state: "attached", timeout: setupTimeoutMs });
            await page.waitForFunction(() => Boolean(window.__FSG_AIRSHOW_E2E__), null, { timeout: setupTimeoutMs });
            await page.waitForSelector("#battleScreen", { state: "visible", timeout: setupTimeoutMs });
        });
        test("full show matches spec §Scenario 5 choreography invariants across all phases", async ({ page }) => {
            test.setTimeout(testTimeoutMs);
            const { hqMidX: rawHqMidX, corridorCenterX: rawCorridorCenterX } = await page.evaluate(async () => {
                const h = window.__FSG_AIRSHOW_E2E__;
                if (!h)
                    throw new Error("hooks not installed");
                const result = await h.startScenario();
                await h.waitForCompletion();
                return { hqMidX: result.hqMidX, corridorCenterX: result.corridorCenterX };
            });
            const { timeline, spawn, midX, vbRight, vbBottom, vbX, vbY } = await page.evaluate(() => {
                const h = window.__FSG_AIRSHOW_E2E__;
                if (!h)
                    throw new Error("hooks not installed");
                const svg = document.getElementById("battleHexMap");
                const vb = svg.viewBox.baseVal;
                return {
                    timeline: h.getPositionTimeline(),
                    spawn: h.getSpawnSnapshot(),
                    midX: vb.x + vb.width / 2,
                    vbRight: vb.x + vb.width,
                    vbBottom: vb.y + vb.height,
                    vbX: vb.x,
                    vbY: vb.y
                };
            });
            const egressMidX = rawHqMidX ?? rawCorridorCenterX ?? midX;
            const violations = [];
            function avgDisp(samples, role) {
                let total = 0;
                let n = 0;
                for (let i = 1; i < samples.length; i++) {
                    const prev = samples[i - 1];
                    const curr = samples[i];
                    for (const a of curr.actors.filter(x => x.active && x.role === role)) {
                        const p = prev.actors.find(x => x.actorId === a.actorId);
                        if (!p?.active)
                            continue;
                        total += Math.hypot(a.cx - p.cx, a.cy - p.cy);
                        n++;
                    }
                }
                return n > 0 ? total / n : 0;
            }
            function avgVisibleDisp(samples, role) {
                let total = 0;
                let n = 0;
                for (let i = 1; i < samples.length; i++) {
                    const prev = samples[i - 1];
                    const curr = samples[i];
                    for (const a of curr.actors.filter(x => x.active && x.role === role && isOnMap(x))) {
                        const p = prev.actors.find(x => x.actorId === a.actorId);
                        if (!p?.active || !isOnMap(p))
                            continue;
                        total += Math.hypot(a.cx - p.cx, a.cy - p.cy);
                        n++;
                    }
                }
                return n > 0 ? total / n : 0;
            }
            function isOnMap(actor) {
                return actor.cx >= vbX && actor.cx <= vbRight && actor.cy >= vbY && actor.cy <= vbBottom;
            }
            function centroid(actors) {
                if (actors.length <= 0) {
                    return null;
                }
                return {
                    cx: actors.reduce((sum, actor) => sum + actor.cx, 0) / actors.length,
                    cy: actors.reduce((sum, actor) => sum + actor.cy, 0) / actors.length
                };
            }
            // ── Invariant 1: All fighters spawn off-map (checked from authoritative spawn snapshot)
            if (spawn) {
                for (const a of spawn.filter(x => x.role === "interceptor" || x.role === "escort")) {
                    const inside = a.cx >= vbX && a.cx <= vbRight && a.cy >= vbY && a.cy <= vbBottom;
                    if (inside)
                        violations.push(`SPAWN: ${a.role} ${a.actorId} spawned on-map cx=${Math.round(a.cx)} cy=${Math.round(a.cy)}`);
                }
            }
            // ── Invariant 2: fighter-ingress — interceptors and escorts on opposite sides
            // Only checked in first 70% of phase samples: at phase end both factions approach
            // their hold points near center, so separation naturally narrows before clash begins.
            const ingressSamples = timeline.filter(s => s.phaseLabel === "fighter-ingress");
            const ingressEarlyCount = Math.max(1, Math.floor(ingressSamples.length * 0.7));
            for (const s of ingressSamples.slice(0, ingressEarlyCount)) {
                const ints = s.actors.filter(a => a.active && a.role === "interceptor");
                const escs = s.actors.filter(a => a.active && a.role === "escort");
                if (!ints.length || !escs.length)
                    continue;
                const iSides = new Set(ints.map(a => a.cx < midX ? "L" : "R"));
                const eSides = new Set(escs.map(a => a.cx < midX ? "L" : "R"));
                if ([...iSides].some(s => eSides.has(s)))
                    violations.push(`INGRESS @${Math.round(s.elapsedMs)}ms: interceptors[${[...iSides]}] escorts[${[...eSides]}] same side — should be opposite`);
            }
            // ── Invariant 3: fighter-ingress — CAP may not establish a long visible lead before escort
            // The north star allows simultaneous off-map start with faster CAP closure, so the correct
            // guardrail is a bounded visible lead rather than zero lead at every sampled frame.
            const MAX_INGRESS_VISIBLE_LEAD_MS = 1000;
            const firstVisibleInterceptorSample = ingressSamples.find((s) => s.actors.some((a) => a.active && a.role === "interceptor" && isOnMap(a)));
            const firstVisibleEscortSample = ingressSamples.find((s) => s.actors.some((a) => a.active && a.role === "escort" && isOnMap(a)));
            if (firstVisibleInterceptorSample && !firstVisibleEscortSample) {
                violations.push(`INGRESS VISIBILITY: interceptors entered the visible map but escorts never became visible during fighter-ingress.`);
            }
            else if (firstVisibleInterceptorSample
                && firstVisibleEscortSample
                && firstVisibleEscortSample.elapsedMs - firstVisibleInterceptorSample.elapsedMs > MAX_INGRESS_VISIBLE_LEAD_MS) {
                violations.push(`INGRESS VISIBILITY: interceptors led escort onto the visible map by `
                    + `${Math.round(firstVisibleEscortSample.elapsedMs - firstVisibleInterceptorSample.elapsedMs)}ms `
                    + `(max ${MAX_INGRESS_VISIBLE_LEAD_MS}ms).`);
            }
            // ── Invariant 4: fighter-ingress — visible on-map bomber motion must stay slower than visible fighter motion
            if (ingressSamples.length >= 2) {
                const bDisp = avgVisibleDisp(ingressSamples, "bomber");
                const fDisp = avgVisibleDisp(ingressSamples, "interceptor") || avgVisibleDisp(ingressSamples, "escort");
                if (fDisp > 0 && bDisp > 0) {
                    const ratio = bDisp / fDisp;
                    if (ratio >= 0.75)
                        violations.push(`INGRESS SPEED: bombers avg ${bDisp.toFixed(1)}px/200ms, fighters ${fDisp.toFixed(1)}px/200ms, ratio=${ratio.toFixed(2)} — spec requires bombers at V/2 (ratio<0.75)`);
                }
            }
            // ── Invariant 5: fighter-ingress — bombers must trail fighters (be further from target than escorts)
            for (const s of ingressSamples) {
                const bombers = s.actors.filter(a => a.active && a.role === "bomber");
                const escorts = s.actors.filter(a => a.active && a.role === "escort");
                if (!bombers.length || !escorts.length)
                    continue;
                const avgBomberCx = bombers.reduce((sum, a) => sum + a.cx, 0) / bombers.length;
                const avgEscortCx = escorts.reduce((sum, a) => sum + a.cx, 0) / escorts.length;
                // escorts should be closer to midX (ahead of bombers toward center)
                const escortCloser = Math.abs(avgEscortCx - midX) < Math.abs(avgBomberCx - midX);
                if (!escortCloser)
                    violations.push(`INGRESS TRAIL @${Math.round(s.elapsedMs)}ms: escorts not ahead of bombers toward center. escort cx=${avgEscortCx.toFixed(0)} bomber cx=${avgBomberCx.toFixed(0)} midX=${Math.round(midX)}`);
            }
            // ── Invariant 6: clash opening — escorts and interceptors must stay visibly engaged on-map
            const clashSamples = timeline.filter(s => s.phaseLabel === "escort-clash-merge" || s.phaseLabel === "escort-clash-scramble");
            const openingClashCount = Math.max(1, Math.floor(clashSamples.length * 0.5));
            for (const s of clashSamples.slice(0, openingClashCount)) {
                const visibleInts = s.actors.filter(a => a.active && a.role === "interceptor" && isOnMap(a));
                const visibleEscs = s.actors.filter(a => a.active && a.role === "escort" && isOnMap(a));
                if (visibleInts.length === 0 || visibleEscs.length === 0) {
                    violations.push(`CLASH VISIBILITY @${Math.round(s.elapsedMs)}ms: interceptors=${visibleInts.length} escorts=${visibleEscs.length} on-map during clash.`);
                }
            }
            // ── Invariant 7: clash midpoint — both fighter factions must actually converge into one combat volume
            const clashMidpointSamples = ["escort-clash-merge", "escort-clash-scramble"]
                .map((label) => {
                const phaseSamples = timeline.filter((sample) => sample.phaseLabel === label);
                if (phaseSamples.length <= 0) {
                    return null;
                }
                const first = phaseSamples[0];
                const last = phaseSamples[phaseSamples.length - 1];
                const midpointElapsedMs = first.elapsedMs + (last.elapsedMs - first.elapsedMs) * 0.5;
                const midpointSample = phaseSamples.reduce((closest, sample) => {
                    const closestDistanceMs = Math.abs(closest.elapsedMs - midpointElapsedMs);
                    const sampleDistanceMs = Math.abs(sample.elapsedMs - midpointElapsedMs);
                    return sampleDistanceMs < closestDistanceMs ? sample : closest;
                }, phaseSamples[0]);
                return { label, sample: midpointSample };
            })
                .filter((entry) => !!entry);
            const maxMergeCentroidDistancePx = Math.min(vbRight - vbX, vbBottom - vbY) * 0.45;
            for (const { label, sample } of clashMidpointSamples) {
                const visibleInts = sample.actors.filter((actor) => actor.active && actor.role === "interceptor" && isOnMap(actor));
                const visibleEscs = sample.actors.filter((actor) => actor.active && actor.role === "escort" && isOnMap(actor));
                const interceptorCentroid = centroid(visibleInts);
                const escortCentroid = centroid(visibleEscs);
                if (!interceptorCentroid || !escortCentroid) {
                    violations.push(`CLASH MIDPOINT ${label} @${Math.round(sample.elapsedMs)}ms: missing visible fighters for cohesion check. `
                        + `interceptors=${visibleInts.length} escorts=${visibleEscs.length}.`);
                    continue;
                }
                const centroidDistancePx = Math.hypot(interceptorCentroid.cx - escortCentroid.cx, interceptorCentroid.cy - escortCentroid.cy);
                if (centroidDistancePx > maxMergeCentroidDistancePx) {
                    violations.push(`CLASH MIDPOINT ${label} @${Math.round(sample.elapsedMs)}ms: fighter groups are split by `
                        + `${Math.round(centroidDistancePx)}px (max ${Math.round(maxMergeCentroidDistancePx)}px).`);
                }
            }
            // ── Invariant 8: bomber-ingress — visible on-map bombers must remain slower than fighters
            const biSamples = timeline.filter(s => s.phaseLabel === "bomber-ingress");
            if (biSamples.length >= 2) {
                const bDisp = avgVisibleDisp(biSamples, "bomber");
                const fDisp = Math.max(avgVisibleDisp(biSamples, "interceptor"), avgVisibleDisp(biSamples, "escort"));
                if (fDisp > 0 && bDisp > 0) {
                    const ratio = bDisp / fDisp;
                    if (ratio >= 0.6)
                        violations.push(`BOMBER-INGRESS SPEED: ratio=${ratio.toFixed(2)} — spec requires bombers at V/2 (ratio<0.6)`);
                }
            }
            // ── Invariant 9: egress — interceptors exit toward bot side, escorts toward player side.
            // Aircraft start from post-clash geometry, so the direction check must skip the
            // launch transient rather than check the instant egress begins.
            // Egress timing scales with map size, so use a phase-relative settle window instead
            // of a fixed 4s cutoff.
            const EGRESS_MARGIN_PX = 30;
            const egressSamples = timeline.filter(s => s.phaseLabel === "egress");
            const egressStartMs = egressSamples[0]?.elapsedMs ?? 0;
            const egressEndMs = egressSamples[egressSamples.length - 1]?.elapsedMs ?? egressStartMs;
            const egressDirectionCheckDelayMs = Math.min(5600, Math.max(4000, (egressEndMs - egressStartMs) * 0.36));
            for (const s of egressSamples.filter(s => s.elapsedMs >= egressStartMs + egressDirectionCheckDelayMs)) {
                const ints = s.actors.filter(a => a.active && a.role === "interceptor");
                const escs = s.actors.filter(a => a.active && a.role === "escort");
                for (const a of ints) {
                    if (a.cx < egressMidX - EGRESS_MARGIN_PX)
                        violations.push(`EGRESS @${Math.round(s.elapsedMs)}ms: interceptor ${a.actorId} cx=${Math.round(a.cx)} is >30px into player side (egressMidX=${Math.round(egressMidX)}) — should egress right toward bot HQ`);
                }
                for (const a of escs) {
                    if (a.cx > egressMidX + EGRESS_MARGIN_PX)
                        violations.push(`EGRESS @${Math.round(s.elapsedMs)}ms: escort ${a.actorId} cx=${Math.round(a.cx)} is >30px into bot side (egressMidX=${Math.round(egressMidX)}) — should egress left toward player HQ`);
                }
            }
            expect(violations, `Choreography violations (${violations.length}):\n${violations.join("\n")}`).toHaveLength(0);
        });
        // Diagnostic test for the remaining open bugs from AIR_SHOW_NORTH_STAR_SPEC.md.
        // Does NOT assert pass/fail — collects raw measurements at 100ms resolution and reports.
        // Each section measures a specific spec requirement and reports what was observed.
        test("open bug diagnostics — measure and report remaining spec violations", async ({ page }) => {
            test.setTimeout(testTimeoutMs);
            // Capture renderer logs for flak, explosions, bomb release, dust clouds so the diagnostic
            // test can answer: did flak animations fire? did ordnance explosions paint?
            const rendererLogs = [];
            page.on("console", (msg) => {
                const text = msg.text();
                if (/flak|explosion|dust|bomb.?release|playCombatAnimation START|Target-run flak plan|AirSprite|playDustCloud|playExplosion/i.test(text)) {
                    rendererLogs.push(text);
                }
            });
            const { phaseLabels } = await page.evaluate(async () => {
                const h = window.__FSG_AIRSHOW_E2E__;
                if (!h)
                    throw new Error("hooks not installed");
                const result = await h.startScenario();
                await h.waitForCompletion();
                return { phaseLabels: result.phaseLabels };
            });
            const { timeline, phaseSequence, viewBox } = await page.evaluate(() => {
                const h = window.__FSG_AIRSHOW_E2E__;
                if (!h)
                    throw new Error("hooks not installed");
                const tl = h.getPositionTimeline();
                const svg = document.getElementById("battleHexMap");
                const vb = svg?.viewBox.baseVal;
                if (!vb)
                    throw new Error("No viewBox on battleHexMap");
                const seen = [];
                const seq = [];
                for (const s of tl) {
                    const lbl = s.phaseLabel ?? "(none)";
                    if (seen[seen.length - 1] !== lbl) {
                        if (seen.length > 0)
                            seq[seq.length - 1].endMs = s.elapsedMs;
                        seen.push(lbl);
                        seq.push({ label: lbl, startMs: s.elapsedMs, endMs: s.elapsedMs });
                    }
                    else {
                        seq[seq.length - 1].endMs = s.elapsedMs;
                    }
                }
                return {
                    timeline: tl,
                    phaseSequence: seq,
                    viewBox: {
                        minX: vb.x,
                        maxX: vb.x + vb.width,
                        minY: vb.y,
                        maxY: vb.y + vb.height
                    }
                };
            });
            const findings = [];
            const t0 = phaseSequence[0]?.startMs ?? 0;
            const isOnMap = (actor) => actor.cx >= viewBox.minX
                && actor.cx <= viewBox.maxX
                && actor.cy >= viewBox.minY
                && actor.cy <= viewBox.maxY;
            // ── Helper: compute per-actor speed in px/ms for consecutive active samples
            function actorSpeedPxPerMs(samples, actorId, visibleOnly = false) {
                const result = [];
                for (let i = 1; i < samples.length; i++) {
                    const prev = samples[i - 1];
                    const curr = samples[i];
                    const pa = prev.actors.find(a => a.actorId === actorId);
                    const ca = curr.actors.find(a => a.actorId === actorId);
                    if (!pa?.active || !ca?.active)
                        continue;
                    if (visibleOnly && (!isOnMap(pa) || !isOnMap(ca)))
                        continue;
                    const dt = curr.elapsedMs - prev.elapsedMs;
                    if (dt <= 0)
                        continue;
                    const dx = ca.cx - pa.cx;
                    const dy = ca.cy - pa.cy;
                    result.push({ tMs: Math.round(curr.elapsedMs - t0), phase: curr.phaseLabel, speedPxPerMs: Math.hypot(dx, dy) / dt, dx, dy });
                }
                return result;
            }
            // ── Helper: heading change in degrees between two velocity vectors
            function headingChangeDeg(v1x, v1y, v2x, v2y) {
                const mag1 = Math.hypot(v1x, v1y);
                const mag2 = Math.hypot(v2x, v2y);
                if (mag1 < 0.5 || mag2 < 0.5)
                    return 0;
                return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)))) * 180 / Math.PI;
            }
            // ── Collect all actor IDs and their faction/role from the first sample they appear in
            const actorMeta = new Map();
            for (const s of timeline) {
                for (const a of s.actors) {
                    if (!actorMeta.has(a.actorId))
                        actorMeta.set(a.actorId, { role: a.role, faction: a.faction, combatRole: a.combatRole });
                }
            }
            function label(id) {
                const m = actorMeta.get(id);
                return m ? `${id} [${m.faction || "?"} ${m.combatRole || m.role}]` : id;
            }
            // ── Phase plan and runtime sequence
            findings.push("=== INSPECTION PHASE PLAN (compressed durations) ===");
            findings.push(`  ${phaseLabels.join(" → ")}`);
            findings.push("\n=== RUNTIME PHASE SEQUENCE (100ms samples) ===");
            for (const p of phaseSequence) {
                findings.push(`  [${String(Math.round(p.startMs - t0)).padStart(5)}ms → ${String(Math.round(p.endMs - t0)).padStart(5)}ms] (${String(Math.round(p.endMs - p.startMs)).padStart(4)}ms)  ${p.label}`);
            }
            findings.push(`  Total samples: ${timeline.length}`);
            // ── SPEED CALIBRATION: Measure V (fighter) and V/2 (bomber) from fighter-ingress phase
            // Spec §Speed Principles: fighter speed = V, bomber = V/2, ratio must be ~2:1
            findings.push("\n=== SPEED CALIBRATION (from fighter-ingress phase) ===");
            const ingressSamples = timeline.filter(s => s.phaseLabel === "fighter-ingress");
            const allActorIds = Array.from(actorMeta.keys());
            const fighterIds = allActorIds.filter(id => actorMeta.get(id)?.role !== "bomber");
            const bomberIds = allActorIds.filter(id => actorMeta.get(id)?.role === "bomber");
            let estimatedV = 0;
            let estimatedHalfV = 0;
            if (ingressSamples.length >= 3) {
                const fSpeeds = fighterIds.flatMap(id => actorSpeedPxPerMs(ingressSamples, id, true).map(s => s.speedPxPerMs));
                const bSpeeds = bomberIds.flatMap(id => actorSpeedPxPerMs(ingressSamples, id, true).map(s => s.speedPxPerMs));
                estimatedV = fSpeeds.length ? fSpeeds.reduce((a, b) => a + b, 0) / fSpeeds.length : 0;
                estimatedHalfV = bSpeeds.length ? bSpeeds.reduce((a, b) => a + b, 0) / bSpeeds.length : 0;
                const ratio = estimatedHalfV > 0 && estimatedV > 0 ? estimatedV / estimatedHalfV : 0;
                findings.push(`  Fighter V: ${(estimatedV * 100).toFixed(1)}px/100ms (n=${fSpeeds.length})`);
                findings.push(`  Bomber V/2: ${(estimatedHalfV * 100).toFixed(1)}px/100ms (n=${bSpeeds.length})`);
                findings.push(`  Speed ratio V/(V/2): ${ratio.toFixed(2)} — spec requires ~2.0`);
                if (ratio < 1.5 || ratio > 2.8)
                    findings.push(`  ⚠ RATIO OUT OF RANGE: expected 1.5–2.8, got ${ratio.toFixed(2)}`);
            }
            else {
                findings.push("  Insufficient fighter-ingress samples for calibration");
            }
            findings.push("\n=== DIAGNOSTIC 0: First Visible Ingress Samples ===");
            const ingressVisibleByRole = (role) => {
                for (const sample of ingressSamples) {
                    const visibleActors = sample.actors.filter((actor) => actor.active && actor.role === role && isOnMap(actor));
                    if (visibleActors.length > 0) {
                        return { sample, visibleActors };
                    }
                }
                return null;
            };
            const firstVisibleInterceptors = ingressVisibleByRole("interceptor");
            const firstVisibleEscorts = ingressVisibleByRole("escort");
            if (firstVisibleInterceptors) {
                findings.push(`  Interceptors first visible @ ${Math.round(firstVisibleInterceptors.sample.elapsedMs - t0)}ms: `
                    + firstVisibleInterceptors.visibleActors
                        .map((actor) => `${actor.actorId}(${Math.round(actor.cx)},${Math.round(actor.cy)})`)
                        .join(", "));
            }
            else {
                findings.push("  Interceptors first visible: none");
            }
            if (firstVisibleEscorts) {
                findings.push(`  Escorts first visible @ ${Math.round(firstVisibleEscorts.sample.elapsedMs - t0)}ms: `
                    + firstVisibleEscorts.visibleActors
                        .map((actor) => `${actor.actorId}(${Math.round(actor.cx)},${Math.round(actor.cy)})`)
                        .join(", "));
            }
            else {
                findings.push("  Escorts first visible: none");
            }
            findings.push("\n=== DIAGNOSTIC 1: Clash midpoint visible fighters ===");
            for (const phaseLabel of ["escort-clash-merge", "escort-clash-scramble"]) {
                const phaseSamples = timeline.filter((sample) => sample.phaseLabel === phaseLabel);
                if (phaseSamples.length <= 0) {
                    findings.push(`  ${phaseLabel}: no samples`);
                    continue;
                }
                const first = phaseSamples[0];
                const last = phaseSamples[phaseSamples.length - 1];
                const midpointElapsedMs = first.elapsedMs + (last.elapsedMs - first.elapsedMs) * 0.5;
                const midpointSample = phaseSamples.reduce((closest, sample) => {
                    const closestDistanceMs = Math.abs(closest.elapsedMs - midpointElapsedMs);
                    const sampleDistanceMs = Math.abs(sample.elapsedMs - midpointElapsedMs);
                    return sampleDistanceMs < closestDistanceMs ? sample : closest;
                }, phaseSamples[0]);
                const visibleFighters = midpointSample.actors.filter((actor) => actor.active && (actor.role === "interceptor" || actor.role === "escort") && isOnMap(actor));
                findings.push(`  ${phaseLabel} @ ${Math.round(midpointSample.elapsedMs - t0)}ms: `
                    + (visibleFighters.length > 0
                        ? visibleFighters
                            .map((actor) => `${actor.role}:${actor.actorId}(${Math.round(actor.cx)},${Math.round(actor.cy)})`)
                            .join(", ")
                        : "no visible fighters"));
            }
            // ── BUG 1: Bomber continuity — disappear/reappear and genuine discontinuities
            // A "teleport" is only flagged when displacement is >3× expected V/2 per interval (not just fast motion)
            // A "sharp turn" is only flagged when heading change >120° AND speed is high (not a near-stop pivot)
            findings.push("\n=== BUG 1: Bomber continuity — disappear / reappear / path discontinuity ===");
            const discontinuityThresholdPxPerMs = estimatedHalfV > 0 ? estimatedHalfV * 3 : 0.5;
            for (const id of bomberIds) {
                const speeds = actorSpeedPxPerMs(timeline, id);
                let prevDx = 0;
                let prevDy = 0;
                for (let i = 1; i < timeline.length; i++) {
                    const prev = timeline[i - 1];
                    const curr = timeline[i];
                    const pa = prev.actors.find(a => a.actorId === id);
                    const ca = curr.actors.find(a => a.actorId === id);
                    if (!pa || !ca)
                        continue;
                    if (pa.active && !ca.active)
                        findings.push(`  DISAPPEAR: ${label(id)} at ${Math.round(curr.elapsedMs - t0)}ms (phase: ${curr.phaseLabel ?? "?"})`);
                    if (!pa.active && ca.active)
                        findings.push(`  REAPPEAR:  ${label(id)} at ${Math.round(curr.elapsedMs - t0)}ms (phase: ${curr.phaseLabel ?? "?"})`);
                    if (!pa.active || !ca.active) {
                        prevDx = 0;
                        prevDy = 0;
                        continue;
                    }
                    const dt = curr.elapsedMs - prev.elapsedMs;
                    if (dt <= 0)
                        continue;
                    const dx = ca.cx - pa.cx;
                    const dy = ca.cy - pa.cy;
                    const spd = Math.hypot(dx, dy) / dt;
                    if (spd > discontinuityThresholdPxPerMs) {
                        findings.push(`  DISCONTINUITY: ${label(id)} at ${Math.round(curr.elapsedMs - t0)}ms — ${(spd * 100).toFixed(0)}px/100ms (${(discontinuityThresholdPxPerMs * 100).toFixed(0)}px/100ms threshold, 3×V/2) (phase: ${curr.phaseLabel ?? "?"})`);
                    }
                    if (prevDx !== 0 || prevDy !== 0) {
                        const turn = headingChangeDeg(prevDx, prevDy, dx, dy);
                        if (turn > 120 && spd > discontinuityThresholdPxPerMs * 0.4) {
                            findings.push(`  SHARP TURN: ${label(id)} turned ${Math.round(turn)}° at ${Math.round(curr.elapsedMs - t0)}ms (speed: ${(spd * 100).toFixed(0)}px/100ms) (phase: ${curr.phaseLabel ?? "?"})`);
                        }
                    }
                    prevDx = dx;
                    prevDy = dy;
                }
                void speeds;
            }
            const bomberDisappearCount = findings.filter(f => f.includes("DISAPPEAR")).length;
            if (bomberDisappearCount === 0)
                findings.push("  OK: No bomber disappear/reappear events detected");
            // ── BUG 2: Progress-model timing — clash must start when bomber is mid-approach
            // Spec §Progress-Based Phase Triggers: clash begins at bomber progress 0.20
            // We infer bomber progress at clash start from: progress ≈ (clashStartMs - t0) / bomberIngressDurationMs
            findings.push("\n=== BUG 2: Clash timing vs bomber progress model ===");
            const clashPhases = phaseSequence.filter(p => p.label.includes("clash"));
            const bomberIngressPhase = phaseSequence.find(p => p.label === "bomber-ingress");
            const firstClash = clashPhases[0];
            if (firstClash && bomberIngressPhase) {
                const clashEnd = clashPhases.reduce((m, p) => Math.max(m, p.endMs), 0);
                const clashStartRel = Math.round(firstClash.startMs - t0);
                const biStart = Math.round(bomberIngressPhase.startMs - t0);
                const biEnd = Math.round(bomberIngressPhase.endMs - t0);
                const biDuration = biEnd - biStart;
                // Bomber speed during each phase; clash starts before bomber-ingress, so estimate
                // bomber progress at clash-start by measuring how far bombers moved vs total bomber-ingress distance
                const bomberIngressMovement = bomberIds.flatMap(id => {
                    const phaseSamples = timeline.filter(s => s.phaseLabel === "bomber-ingress");
                    if (phaseSamples.length < 2)
                        return [0];
                    const first = phaseSamples[0].actors.find(a => a.actorId === id);
                    const last = phaseSamples[phaseSamples.length - 1].actors.find(a => a.actorId === id);
                    if (!first || !last)
                        return [0];
                    return [Math.hypot(last.cx - first.cx, last.cy - first.cy)];
                });
                const avgBomberIngressDist = bomberIngressMovement.length ? bomberIngressMovement.reduce((a, b) => a + b, 0) / bomberIngressMovement.length : 0;
                findings.push(`  First clash phase: ${firstClash.label} starts @ ${clashStartRel}ms`);
                findings.push(`  All clash phases end @ ${Math.round(clashEnd - t0)}ms (duration: ${Math.round(clashEnd - firstClash.startMs)}ms)`);
                findings.push(`  Bomber-ingress: ${biStart}ms → ${biEnd}ms (${biDuration}ms)`);
                findings.push(`  Avg bomber distance during bomber-ingress: ${Math.round(avgBomberIngressDist)}px`);
                const overlapMs = Math.max(0, Math.round(clashEnd - bomberIngressPhase.startMs));
                findings.push(`  Clash/bomber-ingress overlap: ${overlapMs}ms — spec requires clash to complete before bomber arrives`);
                if (overlapMs <= 0)
                    findings.push("  ✓ Clash ends before bomber-ingress begins");
                else
                    findings.push(`  ⚠ OVERLAP: clash still running ${overlapMs}ms into bomber-ingress — bombers arrive before CAP is fully engaged`);
                // Check if fighter-ingress shows bombers at V/2 vs fighters at V (ratio check per spec §Speed Principles)
                if (estimatedV > 0 && estimatedHalfV > 0) {
                    const fightClashStart = clashStartRel;
                    const expectedBomberProgressAtClash = biDuration > 0 ? (fightClashStart - biStart) / biDuration : null;
                    if (expectedBomberProgressAtClash !== null) {
                        findings.push(`  Est. bomber progress at clash start: ${(expectedBomberProgressAtClash * 100).toFixed(0)}% — spec §0.20 trigger`);
                        if (expectedBomberProgressAtClash > 0.4)
                            findings.push(`  ⚠ LATE CLASH: clash starts at bomber progress ~${(expectedBomberProgressAtClash * 100).toFixed(0)}%, spec requires ~20%`);
                        else
                            findings.push(`  ✓ Clash starts near expected bomber progress`);
                    }
                }
            }
            else {
                findings.push(`  Clash phases: ${clashPhases.length > 0 ? clashPhases.map(p => p.label).join(", ") : "none found"}`);
                findings.push(`  Bomber-ingress phase: ${bomberIngressPhase ? "found" : "not found"}`);
            }
            // ── DIAGNOSTIC 3: Escort heading continuity at clash entry
            // Spec §Continuity Requirement: next phase begins from aircraft's actual end heading.
            findings.push("\n=== DIAGNOSTIC 3: Escort heading continuity at clash entry ===");
            const escortIds = allActorIds.filter(id => actorMeta.get(id)?.role === "escort");
            const preclashPhase = phaseSequence.find(p => p.label === "fighter-ingress");
            const firstClashPhase = phaseSequence.find(p => p.label.includes("clash"));
            if (preclashPhase && firstClashPhase) {
                for (const id of escortIds) {
                    // Last velocity vector before clash
                    const preclashActorSamples = timeline.filter(s => s.phaseLabel === "fighter-ingress");
                    const n = preclashActorSamples.length;
                    if (n < 2)
                        continue;
                    const s1 = preclashActorSamples[n - 2];
                    const s2 = preclashActorSamples[n - 1];
                    const a1 = s1.actors.find(a => a.actorId === id);
                    const a2 = s2.actors.find(a => a.actorId === id);
                    // First velocity vector in clash
                    const clashActorSamples = timeline.filter(s => s.phaseLabel !== null && s.phaseLabel.includes("clash"));
                    if (clashActorSamples.length < 2 || !a1 || !a2)
                        continue;
                    const c1 = clashActorSamples[0];
                    const c2 = clashActorSamples[1];
                    const b1 = c1.actors.find(a => a.actorId === id);
                    const b2 = c2.actors.find(a => a.actorId === id);
                    if (!b1 || !b2)
                        continue;
                    const preDx = a2.cx - a1.cx;
                    const preDy = a2.cy - a1.cy;
                    const clashDx = b2.cx - b1.cx;
                    const clashDy = b2.cy - b1.cy;
                    const turn = headingChangeDeg(preDx, preDy, clashDx, clashDy);
                    findings.push(`  ${label(id)}: heading change at clash entry = ${Math.round(turn)}°${turn > 90 ? " ⚠ SNAP TURN (>90°)" : " ✓"}`);
                }
            }
            else {
                findings.push("  Could not identify pre-clash and clash phases for heading continuity check");
            }
            // ── BUG 4: Speed ratio during every phase — fighters at V, bombers at V/2, ratio ~2:1 throughout
            // Spec §Speed Principles: ratio must hold across all phases, not just ingress
            findings.push("\n=== BUG 4: Speed ratio per phase (fighters V vs bombers V/2, spec requires ~2:1) ===");
            const phaseLabelsInOrder = Array.from(new Set(timeline.map(s => s.phaseLabel).filter(Boolean)));
            for (const phase of phaseLabelsInOrder) {
                const phaseSamples = timeline.filter(s => s.phaseLabel === phase);
                if (phaseSamples.length < 2)
                    continue;
                const fSpeeds = fighterIds.flatMap(id => actorSpeedPxPerMs(phaseSamples, id, true).map(s => s.speedPxPerMs));
                const bSpeeds = bomberIds.flatMap(id => actorSpeedPxPerMs(phaseSamples, id, true).map(s => s.speedPxPerMs));
                const avgF = fSpeeds.length ? fSpeeds.reduce((a, b) => a + b, 0) / fSpeeds.length : null;
                const avgB = bSpeeds.length ? bSpeeds.reduce((a, b) => a + b, 0) / bSpeeds.length : null;
                const ratio = avgF && avgB && avgB > 0 ? avgF / avgB : null;
                const fStr = avgF !== null ? `${(avgF * 100).toFixed(1)}px/100ms` : "—";
                const bStr = avgB !== null ? `${(avgB * 100).toFixed(1)}px/100ms` : "—";
                const ratioStr = ratio !== null ? `ratio=${ratio.toFixed(2)}` : "ratio=—";
                const flag = ratio !== null && (ratio < 1.3 || ratio > 3.0) ? " ⚠ RATIO VIOLATION" : "";
                findings.push(`  ${phase.padEnd(28)} fighters=${fStr}  bombers=${bStr}  ${ratioStr}${flag}`);
            }
            // ── DIAGNOSTIC 5: Interception-pass ownership
            // Timeline-only motion cannot reliably infer attacker ownership because bomber forward motion can
            // reduce bomber/interceptor distance even when the pass is correctly interceptor-owned.
            findings.push("\n=== DIAGNOSTIC 5: Interception-pass ownership ===");
            findings.push("  Authoritative ownership is validated in the regression suite via tracer-source roles.");
            findings.push("  See AIR_SHOW_REGRESSION_BOMBER_DEFENSE_PASS_USES_ONE_SIDED_INTERCEPTION_VISUALS.");
            // ── DIAGNOSTIC 6: Bomber continuity around ordnance / egress transition
            // Spec §Visual Continuity: no disappearance around bomb release or egress transition.
            findings.push("\n=== DIAGNOSTIC 6: Bomber continuity around ordnance / egress transition ===");
            const targetRunPhase = phaseSequence.find(p => p.label === "target-run");
            const egressPhase = phaseSequence.find(p => p.label === "egress");
            if (targetRunPhase && egressPhase) {
                const windowStart = targetRunPhase.endMs - 300;
                const windowEnd = egressPhase.startMs + 300;
                const windowSamples = timeline.filter(s => s.elapsedMs >= windowStart && s.elapsedMs <= windowEnd);
                for (const id of bomberIds) {
                    let lastActive = null;
                    for (const s of windowSamples) {
                        const a = s.actors.find(x => x.actorId === id);
                        if (!a)
                            continue;
                        if (lastActive !== null && lastActive !== a.active) {
                            const transition = a.active ? "REAPPEAR" : "DISAPPEAR";
                            findings.push(`  ${transition}: ${label(id)} at ${Math.round(s.elapsedMs - t0)}ms (phase: ${s.phaseLabel ?? "?"}) — ordnance/egress window`);
                        }
                        lastActive = a.active;
                    }
                }
                // Also check for sharp heading reversals at the target-run→egress boundary
                for (const id of bomberIds) {
                    const trSamples = timeline.filter(s => s.phaseLabel === "target-run");
                    const egSamples = timeline.filter(s => s.phaseLabel === "egress");
                    const trLast2 = trSamples.slice(-2);
                    const egFirst2 = egSamples.slice(0, 2);
                    if (trLast2.length < 2 || egFirst2.length < 2)
                        continue;
                    const a1 = trLast2[0].actors.find(a => a.actorId === id);
                    const a2 = trLast2[1].actors.find(a => a.actorId === id);
                    const b1 = egFirst2[0].actors.find(a => a.actorId === id);
                    const b2 = egFirst2[1].actors.find(a => a.actorId === id);
                    if (!a1 || !a2 || !b1 || !b2)
                        continue;
                    const preDx = a2.cx - a1.cx;
                    const preDy = a2.cy - a1.cy;
                    const postDx = b2.cx - b1.cx;
                    const postDy = b2.cy - b1.cy;
                    const turn = headingChangeDeg(preDx, preDy, postDx, postDy);
                    findings.push(`  ${label(id)}: heading at target-run→egress boundary = ${Math.round(turn)}°${turn > 120 ? " ⚠ REVERSAL (>120°)" : " ✓"}`);
                }
            }
            else {
                findings.push("  Could not find target-run and egress phases");
            }
            // ── DIAGNOSTIC 7: Flak / ordnance animation painting
            // Spec §Scenario 5 Phase 6 (Flak 0.80 → 1.00) and Phase 7 (Bomb release at turnProgress 0.50)
            // User reported: no flak animations painted; no ordnance explosion animations painted.
            findings.push("\n=== DIAGNOSTIC 7: Flak / ordnance animation painting ===");
            const flakPlanLogs = rendererLogs.filter((line) => /Target-run flak plan/i.test(line));
            const flakFiredLogs = rendererLogs.filter((line) => /\[AirSprite\] Flak burst fired/i.test(line));
            const explosionStartLogs = rendererLogs.filter((line) => /playExplosion called/i.test(line));
            const explosionFrameLogs = rendererLogs.filter((line) => /playCombatAnimation START.*(explosionSmall|explosionLarge)/i.test(line));
            const dustLogs = rendererLogs.filter((line) => /playDustCloud called/i.test(line));
            const bombScheduledLogs = rendererLogs.filter((line) => /Scheduling bomb release/i.test(line));
            const bombFiredLogs = rendererLogs.filter((line) => /Bomb release firing/i.test(line));
            const bombCancelledLogs = rendererLogs.filter((line) => /Bomb release cancelled before firing/i.test(line));
            const bombSkippedLogs = rendererLogs.filter((line) => /Bomb release skipped/i.test(line));
            findings.push(`  Flak plans scheduled (Target-run flak plan): ${flakPlanLogs.length}`);
            findings.push(`  Flak bursts actually fired: ${flakFiredLogs.length}${flakFiredLogs.length === 0 ? " ⚠ NO FLAK ANIMATIONS PAINTED" : " ✓"}`);
            findings.push(`  Bomb release scheduled: ${bombScheduledLogs.length}`);
            findings.push(`  Bomb release fired: ${bombFiredLogs.length}${bombFiredLogs.length === 0 ? " ⚠ NO ORDNANCE EXPLOSION PAINTED" : " ✓"}`);
            findings.push(`  Bomb release cancelled before firing: ${bombCancelledLogs.length}${bombCancelledLogs.length > 0 ? " ⚠ CANCELLED BEFORE FIRING" : ""}`);
            findings.push(`  Bomb release skipped (no targetHexKey): ${bombSkippedLogs.length}`);
            findings.push(`  playExplosion calls: ${explosionStartLogs.length}${explosionStartLogs.length === 0 ? " ⚠ NO EXPLOSIONS PAINTED" : " ✓"}`);
            findings.push(`  Combat animations started for explosions: ${explosionFrameLogs.length}`);
            findings.push(`  playDustCloud calls: ${dustLogs.length}`);
            if (flakFiredLogs.length === 0 && flakPlanLogs.length > 0) {
                findings.push("  ⚠ Flak was scheduled but setTimeout handles never resolved — plan was cancelled before any burst fired");
            }
            console.log("\n" + findings.join("\n"));
            expect(findings.length).toBeGreaterThan(0);
        });
    });
}
makeChoreographyTests("AirShow Choreography — 10x10 map", "/?codex-test=airshow");
makeChoreographyTests("AirShow Choreography — 20x20 map", "/?codex-test=airshow-large");
