import { expect, test } from "@playwright/test";

// Full choreography validation — spec §Scenario 5 invariants as one coordinated sequence.
// Uses the 200ms position timeline to see every actor throughout the show.
// All violations are collected per-phase and reported together.

type Actor = { actorId: string; role: string; active: boolean; cx: number; cy: number };
type Sample = { elapsedMs: number; phaseLabel: string | null; actors: ReadonlyArray<Actor> };

test.describe("AirShow Choreography", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?codex-test=airshow");
    await page.waitForSelector("#battleHexMap", { state: "attached", timeout: 15000 });
    await page.waitForFunction(
      () => Boolean((window as Window & { __FSG_AIRSHOW_E2E__?: unknown }).__FSG_AIRSHOW_E2E__),
      null,
      { timeout: 15000 }
    );
    await page.waitForSelector("#battleScreen", { state: "visible", timeout: 15000 });
  });

  test("full show matches spec §Scenario 5 choreography invariants across all phases", async ({ page }) => {
    await page.evaluate(async () => {
      const h = (window as Window & { __FSG_AIRSHOW_E2E__?: { startScenario: () => Promise<unknown>; waitForCompletion: () => Promise<void> } }).__FSG_AIRSHOW_E2E__;
      if (!h) throw new Error("hooks not installed");
      await h.startScenario();
      await h.waitForCompletion();
    });

    const { timeline, midX, vbRight, vbBottom, vbX, vbY } = await page.evaluate(() => {
      const h = (window as Window & { __FSG_AIRSHOW_E2E__?: { getPositionTimeline: () => readonly Sample[] } }).__FSG_AIRSHOW_E2E__;
      if (!h) throw new Error("hooks not installed");
      const svg = document.getElementById("battleHexMap") as unknown as SVGSVGElement;
      const vb = svg.viewBox.baseVal;
      return {
        timeline: h.getPositionTimeline() as readonly Sample[],
        midX: vb.x + vb.width / 2,
        vbRight: vb.x + vb.width,
        vbBottom: vb.y + vb.height,
        vbX: vb.x,
        vbY: vb.y
      };
    });

    const violations: string[] = [];

    function avgDisp(samples: readonly Sample[], role: string): number {
      let total = 0; let n = 0;
      for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1]!; const curr = samples[i]!;
        for (const a of curr.actors.filter(x => x.active && x.role === role)) {
          const p = prev.actors.find(x => x.actorId === a.actorId);
          if (!p?.active) continue;
          total += Math.hypot(a.cx - p.cx, a.cy - p.cy); n++;
        }
      }
      return n > 0 ? total / n : 0;
    }

    // ── Invariant 1: All fighters spawn off-map (checked at t=0, spawn snapshot)
    const spawnSample = timeline[0];
    if (spawnSample) {
      for (const a of spawnSample.actors.filter(x => x.role === "interceptor" || x.role === "escort")) {
        const inside = a.cx >= vbX && a.cx <= vbRight && a.cy >= vbY && a.cy <= vbBottom;
        if (inside) violations.push(`SPAWN: ${a.role} ${a.actorId} spawned on-map cx=${Math.round(a.cx)} cy=${Math.round(a.cy)}`);
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
      if (!ints.length || !escs.length) continue;
      const iSides = new Set(ints.map(a => a.cx < midX ? "L" : "R"));
      const eSides = new Set(escs.map(a => a.cx < midX ? "L" : "R"));
      if ([...iSides].some(s => eSides.has(s)))
        violations.push(`INGRESS @${Math.round(s.elapsedMs)}ms: interceptors[${[...iSides]}] escorts[${[...eSides]}] same side — should be opposite`);
    }

    // ── Invariant 3: fighter-ingress — bombers must move slower than fighters (ratio < 0.75)
    if (ingressSamples.length >= 2) {
      const bDisp = avgDisp(ingressSamples, "bomber");
      const fDisp = avgDisp(ingressSamples, "interceptor") || avgDisp(ingressSamples, "escort");
      if (fDisp > 0 && bDisp > 0) {
        const ratio = bDisp / fDisp;
        if (ratio >= 0.75)
          violations.push(`INGRESS SPEED: bombers avg ${bDisp.toFixed(1)}px/200ms, fighters ${fDisp.toFixed(1)}px/200ms, ratio=${ratio.toFixed(2)} — spec requires bombers at V/2 (ratio<0.75)`);
      }
    }

    // ── Invariant 4: fighter-ingress — bombers must trail fighters (be further from target than escorts)
    for (const s of ingressSamples) {
      const bombers = s.actors.filter(a => a.active && a.role === "bomber");
      const escorts = s.actors.filter(a => a.active && a.role === "escort");
      if (!bombers.length || !escorts.length) continue;
      const avgBomberCx = bombers.reduce((sum, a) => sum + a.cx, 0) / bombers.length;
      const avgEscortCx = escorts.reduce((sum, a) => sum + a.cx, 0) / escorts.length;
      // escorts should be closer to midX (ahead of bombers toward center)
      const escortCloser = Math.abs(avgEscortCx - midX) < Math.abs(avgBomberCx - midX);
      if (!escortCloser)
        violations.push(`INGRESS TRAIL @${Math.round(s.elapsedMs)}ms: escorts not ahead of bombers toward center. escort cx=${avgEscortCx.toFixed(0)} bomber cx=${avgBomberCx.toFixed(0)} midX=${Math.round(midX)}`);
    }

    // ── Invariant 5: bomber-ingress — bombers at V/2 vs fighters at V (ratio < 0.6)
    const biSamples = timeline.filter(s => s.phaseLabel === "bomber-ingress");
    if (biSamples.length >= 2) {
      const bDisp = avgDisp(biSamples, "bomber");
      const fDisp = Math.max(avgDisp(biSamples, "interceptor"), avgDisp(biSamples, "escort"));
      if (fDisp > 0 && bDisp > 0) {
        const ratio = bDisp / fDisp;
        if (ratio >= 0.6)
          violations.push(`BOMBER-INGRESS SPEED: ratio=${ratio.toFixed(2)} — spec requires bombers at V/2 (ratio<0.6)`);
      }
    }

    // ── Invariant 6: egress — interceptors exit toward bot side (right), escorts toward player side (left)
    // Requires >30px past midX before flagging — actors start near center and must travel
    // clearly into wrong territory to count as a violation.
    const EGRESS_MARGIN_PX = 30;
    const egressSamples = timeline.filter(s => s.phaseLabel === "egress");
    for (const s of egressSamples) {
      const ints = s.actors.filter(a => a.active && a.role === "interceptor");
      const escs = s.actors.filter(a => a.active && a.role === "escort");
      for (const a of ints) {
        if (a.cx < midX - EGRESS_MARGIN_PX) violations.push(`EGRESS @${Math.round(s.elapsedMs)}ms: interceptor ${a.actorId} cx=${Math.round(a.cx)} is >30px into player side (midX=${Math.round(midX)}) — should egress right toward bot HQ`);
      }
      for (const a of escs) {
        if (a.cx > midX + EGRESS_MARGIN_PX) violations.push(`EGRESS @${Math.round(s.elapsedMs)}ms: escort ${a.actorId} cx=${Math.round(a.cx)} is >30px into bot side (midX=${Math.round(midX)}) — should egress left toward player HQ`);
      }
    }

    expect(
      violations,
      `Choreography violations (${violations.length}):\n${violations.join("\n")}`
    ).toHaveLength(0);
  });
});
