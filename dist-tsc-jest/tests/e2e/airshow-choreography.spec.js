import { expect, test } from "@playwright/test";
import { auditAirshowTemporalTrace, writeAirshowTemporalArtifacts } from "./support/airshowTemporalAudit";
const AIRSHOW_CHOREOGRAPHY_TIMEOUT_MS = 140000;
const FIGHTER_SPEED_PX_PER_MS = 0.115;
const BOMBER_SPEED_PX_PER_MS = 0.0575;
function distance(left, right) {
    return Math.hypot(left.cx - right.cx, left.cy - right.cy);
}
function centroid(actors) {
    return {
        cx: actors.reduce((sum, actor) => sum + actor.cx, 0) / actors.length,
        cy: actors.reduce((sum, actor) => sum + actor.cy, 0) / actors.length
    };
}
function nearestOpposingDistance(playerSide, botSide) {
    return Math.min(...playerSide.flatMap((playerActor) => botSide.map((botActor) => distance(playerActor, botActor))));
}
function midpointSample(samples, phaseLabel) {
    const phaseSamples = samples.filter((sample) => sample.phaseLabel === phaseLabel);
    expect(phaseSamples.length, `${phaseLabel} needs enough browser samples`).toBeGreaterThan(2);
    return phaseSamples[Math.floor(phaseSamples.length / 2)];
}
function activeFighterSides(sample) {
    const fighters = sample.actors.filter((actor) => actor.active && (actor.role === "interceptor" || actor.role === "escort"));
    return {
        playerSide: fighters.filter((actor) => actor.faction !== "Bot"),
        botSide: fighters.filter((actor) => actor.faction === "Bot")
    };
}
test.describe("AirShow timeline-v2 choreography", () => {
    test("20x20 full engagement preserves origins, speed, continuity, merge, scramble, formation, and egress @temporal-certificate", async ({ page }, testInfo) => {
        test.setTimeout(AIRSHOW_CHOREOGRAPHY_TIMEOUT_MS);
        await page.goto("/?codex-test=airshow-large");
        await page.waitForSelector("#battleHexMap", { state: "attached", timeout: 20000 });
        await page.waitForFunction(() => Boolean(window.__FSG_AIRSHOW_E2E__), null, { timeout: 20000 });
        const startResult = await page.evaluate(async () => {
            const harness = window.__FSG_AIRSHOW_E2E__;
            if (!harness)
                throw new Error("Airshow e2e hooks were not installed.");
            const result = await harness.startScenario();
            await harness.waitForCompletion();
            return result;
        });
        const capture = await page.evaluate(() => {
            const harness = window.__FSG_AIRSHOW_E2E__;
            if (!harness)
                throw new Error("Airshow e2e hooks were not installed.");
            return {
                timeline: harness.getPositionTimeline(),
                spawn: harness.getSpawnSnapshot(),
                originPlan: harness.getInspectionSummary()?.originPlan ?? null
            };
        });
        expect(startResult.missionId).toBe("e2e-airshow-contested-package-large");
        expect(startResult.phaseLabels).toEqual(expect.arrayContaining([
            "fighter-ingress",
            "escort-clash-merge",
            "escort-clash-scramble",
            "bomber-ingress",
            "bomber-defense-pass",
            "target-run",
            "egress"
        ]));
        expect(startResult.totalDurationMs).toBeGreaterThan(0);
        expect(capture.timeline.length).toBeGreaterThan(100);
        const originPlan = capture.originPlan;
        expect(originPlan).not.toBeNull();
        if (!originPlan) {
            throw new Error("Timeline-v2 inspection did not expose its origin plan.");
        }
        const temporalAudit = auditAirshowTemporalTrace(capture.timeline, {
            scenarioId: startResult.missionId,
            originPlan,
            spawn: capture.spawn,
            requireFullEngagement: true,
            requireFlak: true
        });
        const temporalArtifacts = writeAirshowTemporalArtifacts("airshow-20x20-full-engagement", capture.timeline, temporalAudit);
        await testInfo.attach("airshow-temporal-summary", {
            path: temporalArtifacts.summary,
            contentType: "text/plain"
        });
        expect(temporalAudit.findings.filter((finding) => finding.severity === "error"), `Temporal audit failed. See ${temporalArtifacts.summary}`).toEqual([]);
        expect(originPlan.offsetPx).toBe(500);
        expect(distance(originPlan.playerOrigin, originPlan.playerBoundary)).toBeCloseTo(500, 6);
        expect(distance(originPlan.botOrigin, originPlan.botBoundary)).toBeCloseTo(500, 6);
        for (const actor of capture.spawn) {
            const insideTileEnvelope = actor.cx >= originPlan.mapBounds.minX
                && actor.cx <= originPlan.mapBounds.maxX
                && actor.cy >= originPlan.mapBounds.minY
                && actor.cy <= originPlan.mapBounds.maxY;
            expect(insideTileEnvelope, `${actor.role} ${actor.actorId} must originate outside the rendered tile envelope`).toBe(false);
        }
        const actorIds = new Set(capture.timeline.flatMap((sample) => sample.actors.map((actor) => actor.actorId)));
        const speedSamples = new Map();
        for (const actorId of actorIds) {
            const actorSamples = capture.timeline
                .map((sample) => ({
                elapsedMs: sample.elapsedMs,
                actor: sample.actors.find((actor) => actor.actorId === actorId)
            }))
                .filter((entry) => !!entry.actor);
            const firstActive = actorSamples.findIndex((entry) => entry.actor.active);
            let lastActive = -1;
            actorSamples.forEach((entry, index) => {
                if (entry.actor.active)
                    lastActive = index;
            });
            if (firstActive < 0 || lastActive <= firstActive)
                continue;
            const activeWindow = actorSamples.slice(firstActive, lastActive + 1);
            expect(activeWindow.every((entry) => entry.actor.active), `${actorId} must use one uninterrupted visible lifecycle`).toBe(true);
            const observedSpeeds = [];
            for (let index = 1; index < activeWindow.length; index += 1) {
                const previous = activeWindow[index - 1];
                const current = activeWindow[index];
                const elapsedMs = current.elapsedMs - previous.elapsedMs;
                if (elapsedMs <= 0)
                    continue;
                const observedSpeed = distance(previous.actor, current.actor) / elapsedMs;
                const expectedSpeed = current.actor.role === "bomber"
                    ? BOMBER_SPEED_PX_PER_MS
                    : FIGHTER_SPEED_PX_PER_MS;
                expect(observedSpeed, `${actorId} moved too far for its ${current.actor.role} speed at ${Math.round(current.elapsedMs)}ms`).toBeLessThanOrEqual(expectedSpeed * 1.35 + 0.01);
                observedSpeeds.push(observedSpeed);
            }
            speedSamples.set(actorId, observedSpeeds);
        }
        const median = (values) => {
            const sorted = [...values].sort((left, right) => left - right);
            return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };
        const allActors = capture.timeline.find((sample) => sample.actors.length > 0)?.actors ?? [];
        for (const actor of allActors) {
            const observed = speedSamples.get(actor.actorId) ?? [];
            expect(observed.length, `${actor.actorId} needs browser speed samples`).toBeGreaterThan(8);
            const expectedSpeed = actor.role === "bomber"
                ? BOMBER_SPEED_PX_PER_MS
                : FIGHTER_SPEED_PX_PER_MS;
            expect(median(observed)).toBeGreaterThan(expectedSpeed * 0.75);
            expect(median(observed)).toBeLessThanOrEqual(expectedSpeed * 1.12);
        }
        const mergeSamples = capture.timeline.filter((sample) => sample.phaseLabel === "escort-clash-merge");
        const mergeDistances = mergeSamples.map((sample) => {
            const { playerSide, botSide } = activeFighterSides(sample);
            return playerSide.length > 0 && botSide.length > 0
                ? nearestOpposingDistance(playerSide, botSide)
                : Number.POSITIVE_INFINITY;
        });
        expect(Math.min(...mergeDistances)).toBeLessThanOrEqual(55);
        const scrambleSample = midpointSample(capture.timeline, "escort-clash-scramble");
        const scrambleSides = activeFighterSides(scrambleSample);
        expect(scrambleSides.playerSide.length).toBeGreaterThan(0);
        expect(scrambleSides.botSide.length).toBeGreaterThan(0);
        const playerCenter = centroid(scrambleSides.playerSide);
        const botCenter = centroid(scrambleSides.botSide);
        expect(distance(playerCenter, botCenter)).toBeLessThanOrEqual(210);
        expect(nearestOpposingDistance(scrambleSides.playerSide, scrambleSides.botSide)).toBeLessThanOrEqual(160);
        const strikeSamples = capture.timeline.filter((sample) => sample.phaseLabel === "bomber-ingress"
            || sample.phaseLabel === "bomber-defense-pass"
            || sample.phaseLabel === "target-run");
        const bomberPairDistances = strikeSamples.flatMap((sample) => {
            const bombers = sample.actors.filter((actor) => actor.active && actor.role === "bomber");
            return bombers.flatMap((left, leftIndex) => bombers.slice(leftIndex + 1).map((right) => distance(left, right)));
        });
        expect(bomberPairDistances.length).toBeGreaterThan(0);
        expect(Math.min(...bomberPairDistances)).toBeGreaterThanOrEqual(48);
        const lastActiveByActor = new Map();
        capture.timeline.forEach((sample) => {
            sample.actors.filter((actor) => actor.active).forEach((actor) => {
                lastActiveByActor.set(actor.actorId, actor);
            });
        });
        const mapCenter = {
            cx: (originPlan.mapBounds.minX + originPlan.mapBounds.maxX) / 2,
            cy: (originPlan.mapBounds.minY + originPlan.mapBounds.maxY) / 2
        };
        for (const actor of lastActiveByActor.values()) {
            const exitProjection = (actor.cx - mapCenter.cx) * originPlan.axis.cx
                + (actor.cy - mapCenter.cy) * originPlan.axis.cy;
            if (actor.faction === "Bot") {
                expect(exitProjection, `${actor.actorId} must exit toward the bot HQ side`).toBeLessThan(0);
            }
            else {
                expect(exitProjection, `${actor.actorId} must exit toward the player HQ side`).toBeGreaterThan(0);
            }
        }
    });
});
