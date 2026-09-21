import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AirCombatExchangeEntry, FlakEngagementEntry } from "../src/game/battle/air/AirCombatContracts";
import { projectBattleAirEngagement } from "../src/game/battle/air/BattleAirEngagementProjection";
import { registerTest } from "./harness.js";

function exchange(phase: AirCombatExchangeEntry["phase"]): AirCombatExchangeEntry {
  return {
    phase,
    attackerFaction: "Bot",
    attackerUnitKey: "cap-alpha",
    attackerUnitType: "Fighter",
    attackerLabel: "CAP Alpha",
    defenderFaction: "Player",
    defenderUnitKey: "escort-alpha",
    defenderUnitType: "Fighter",
    defenderLabel: "Escort Alpha",
    attackerStrengthBefore: 8,
    attackerStrengthAfter: 5,
    defenderStrengthBefore: 7,
    defenderStrengthAfter: 3,
    damageToDefender: 4,
    retaliationDamage: 3,
    attackerDestroyed: false,
    defenderDestroyed: false,
    visualPasses: 2,
    escortIndex: 0,
    interceptorIndex: 0
  };
}

registerTest("BATTLE_AIR_ENGAGEMENT_PROJECTION_PRESERVES_MULTI_DEFENDER_EVENT_PARITY", async ({ Given, When, Then }) => {
  const location = { q: 3, r: -2 };
  const flakInterceptors = [
    { faction: "Bot" as const, unitKey: "flak-a", unitType: "Flak_88", label: "A Battery", hex: { q: 2, r: -2 } },
    { faction: "Bot" as const, unitKey: "flak-b", unitType: "Flak_88", label: "B Battery", hex: { q: 4, r: -2 } }
  ];
  const flakEngagements: FlakEngagementEntry[] = flakInterceptors.map((battery, index) => {
    const strengthBefore = index === 0 ? 10 : 7;
    const strengthAfter = index === 0 ? 7 : 0;
    return {
      batteryFaction: battery.faction,
      batteryUnitKey: battery.unitKey,
      batteryUnitType: battery.unitType,
      batteryLabel: battery.label,
      batteryHex: battery.hex,
      bomberFaction: "Player",
      bomberUnitKey: "bomber-player",
      bomberUnitType: "Bomber",
      bomberLabel: "Blue Leader",
      bomberStrengthBefore: strengthBefore,
      bomberStrengthAfter: strengthAfter,
      damageToBomber: strengthBefore - strengthAfter,
      bomberDestroyed: strengthAfter <= 0
    };
  });
  const escorts = [
    { faction: "Player" as const, unitKey: "escort-a", unitType: "Fighter", label: "Escort A", strength: 7 },
    { faction: "Player" as const, unitKey: "escort-b", unitType: "Fighter", label: "Escort B", strength: 6 }
  ];
  const interceptors = [
    { faction: "Bot" as const, unitKey: "cap-a", unitType: "Fighter", label: "CAP A", strength: 8 },
    { faction: "Bot" as const, unitKey: "cap-b", unitType: "Fighter", label: "CAP B", strength: 9 }
  ];
  const escortExchanges = [exchange("escortClash")];
  const bomberPassExchanges = [exchange("bomberPass")];

  await Given("resolved aircraft combat facts with multiple flak batteries, escorts, and interceptors", () => {});
  const flakEvent = projectBattleAirEngagement({
    type: "flak",
    missionId: "mission-flak",
    location,
    bomber: {
      faction: "Player",
      unitKey: "bomber-player",
      unitType: "Bomber",
      label: "Blue Leader",
      strengthBefore: 10
    },
    interceptors: flakInterceptors,
    flakEngagements
  });
  const airToAirEvent = projectBattleAirEngagement({
    type: "airToAir",
    missionId: "mission-air",
    location,
    bomber: {
      faction: "Bot",
      unitKey: "bomber-bot",
      unitType: "Bomber",
      label: "Red Leader",
      strengthBefore: 12
    },
    interceptors,
    escorts,
    interception: {
      bomberAfter: { strength: 5 },
      interceptorAttrition: 5,
      escortPhaseInterceptorAttrition: 3,
      bomberDefenseInterceptorAttrition: 2,
      interceptorKills: 1,
      escortAttrition: 4,
      escortKills: 1,
      escortsEngaged: 2,
      interceptorsAfterEscortPhase: 2,
      escortsAfterEscortPhase: 1,
      interceptorDeltas: [
        { strengthAfterEscortPhase: 6, unitAfter: { strength: 4 } },
        { strengthAfterEscortPhase: 7, unitAfter: { strength: 7 } }
      ],
      escortDeltas: [
        { strengthAfterEscortPhase: 3, unitAfter: { strength: 3 } },
        { strengthAfterEscortPhase: 0, unitAfter: { strength: 0 } }
      ],
      escortExchanges,
      bomberPassExchanges
    }
  });
  const capClashEvent = projectBattleAirEngagement({
    type: "capClash",
    missionId: undefined,
    location,
    bomber: {
      faction: "Bot",
      unitKey: "cap-a",
      unitType: "Fighter",
      label: "CAP A",
      strengthBefore: 8
    },
    interceptors,
    escorts,
    bomberStrengthAfter: 4,
    interceptorFinalStrengths: [4, 0],
    escortFinalStrengths: [3, 0],
    escortExchanges
  });
  await When("the canonical projector creates both UI-facing event variants", () => {});
  await Then("every historic event field and participant order is preserved", () => {
    assert.deepEqual(flakEvent, {
      type: "flak",
      missionId: "mission-flak",
      location: { q: 3, r: -2 },
      bomber: { faction: "Player", unitKey: "bomber-player", unitType: "Bomber", label: "Blue Leader", strength: 10 },
      interceptors: flakInterceptors,
      escorts: [],
      bomberStrengthBefore: 10,
      bomberStrengthAfter: 0,
      bomberDestroyed: true,
      flakDamage: 10,
      flakEngagements
    });
    assert.deepEqual(airToAirEvent, {
      type: "airToAir",
      missionId: "mission-air",
      location: { q: 3, r: -2 },
      bomber: { faction: "Bot", unitKey: "bomber-bot", unitType: "Bomber", label: "Red Leader", strength: 12 },
      interceptors,
      escorts,
      bomberStrengthBefore: 12,
      bomberStrengthAfter: 5,
      bomberDestroyed: false,
      interceptorAttrition: 5,
      escortPhaseInterceptorAttrition: 3,
      bomberDefenseInterceptorAttrition: 2,
      interceptorKills: 1,
      escortAttrition: 4,
      escortKills: 1,
      escortsEngaged: 2,
      interceptorsAfterEscortPhase: 2,
      escortsAfterEscortPhase: 1,
      interceptorStrengthsAfterEscortPhase: [6, 7],
      escortStrengthsAfterEscortPhase: [3, 0],
      interceptorFinalStrengths: [4, 7],
      escortFinalStrengths: [3, 0],
      escortExchanges,
      bomberPassExchanges
    });
    assert.deepEqual(capClashEvent, {
      type: "capClash",
      missionId: undefined,
      location: { q: 3, r: -2 },
      bomber: { faction: "Bot", unitKey: "cap-a", unitType: "Fighter", label: "CAP A", strength: 8 },
      interceptors,
      escorts,
      bomberStrengthBefore: 8,
      bomberStrengthAfter: 4,
      bomberDestroyed: false,
      escortExchanges,
      bomberPassExchanges: [],
      interceptorsAfterEscortPhase: 1,
      escortsAfterEscortPhase: 1,
      interceptorStrengthsAfterEscortPhase: [4, 0],
      escortStrengthsAfterEscortPhase: [3, 0],
      interceptorFinalStrengths: [4, 0],
      escortFinalStrengths: [3, 0]
    });
    assert.deepEqual(Object.keys(flakEvent), [
      "type", "missionId", "location", "bomber", "interceptors", "escorts", "flakDamage", "flakEngagements",
      "bomberStrengthBefore", "bomberStrengthAfter", "bomberDestroyed"
    ]);
    assert.deepEqual(Object.keys(airToAirEvent), [
      "type", "missionId", "location", "bomber", "interceptors", "escorts", "bomberStrengthBefore",
      "bomberStrengthAfter", "bomberDestroyed", "interceptorAttrition", "escortPhaseInterceptorAttrition",
      "bomberDefenseInterceptorAttrition", "interceptorKills", "escortAttrition", "escortKills", "escortsEngaged",
      "interceptorsAfterEscortPhase", "escortsAfterEscortPhase", "interceptorStrengthsAfterEscortPhase",
      "escortStrengthsAfterEscortPhase", "interceptorFinalStrengths", "escortFinalStrengths", "escortExchanges",
      "bomberPassExchanges"
    ]);
    assert.deepEqual(Object.keys(capClashEvent), [
      "type", "missionId", "location", "bomber", "interceptors", "escorts", "bomberStrengthBefore",
      "bomberStrengthAfter", "bomberDestroyed", "escortExchanges", "bomberPassExchanges",
      "interceptorsAfterEscortPhase", "escortsAfterEscortPhase", "interceptorStrengthsAfterEscortPhase",
      "escortStrengthsAfterEscortPhase", "interceptorFinalStrengths", "escortFinalStrengths"
    ]);
  });
});

registerTest("BATTLE_AIR_ENGAGEMENT_PROJECTION_IS_DETACHED_AND_DELEGATED_EXACTLY", async ({ Given, When, Then }) => {
  const location = { q: 1, r: 2 };
  const interceptors = [{ faction: "Bot" as const, unitKey: "cap", unitType: "Fighter", hex: { q: 2, r: 2 } }];
  const escortExchanges = [exchange("escortClash")];
  const event = projectBattleAirEngagement({
    type: "airToAir",
    location,
    bomber: {
      faction: "Player",
      unitKey: "bomber",
      unitType: "Bomber",
      strengthBefore: 9
    },
    interceptors,
    escorts: [],
    interception: {
      bomberAfter: { strength: 6 },
      interceptorAttrition: 0,
      escortPhaseInterceptorAttrition: 0,
      bomberDefenseInterceptorAttrition: 0,
      interceptorKills: 0,
      escortAttrition: 0,
      escortKills: 0,
      escortsEngaged: 0,
      interceptorsAfterEscortPhase: 1,
      escortsAfterEscortPhase: 0,
      interceptorDeltas: [{ strengthAfterEscortPhase: 5, unitAfter: { strength: 4 } }],
      escortDeltas: [],
      escortExchanges,
      bomberPassExchanges: []
    }
  });

  await Given("mutable source facts and one projected engagement", () => {});
  await When("both sides are changed after projection", () => {
    location.q = 99;
    interceptors[0]!.hex.q = 98;
    (escortExchanges[0] as { attackerLabel?: string }).attackerLabel = "mutated source";
    event.location.r = 97;
    (event.interceptors as unknown as Array<{ unitKey: string }>)[0]!.unitKey = "mutated event";
  });
  await Then("the event owns detached coordinates, participants, and exchanges", () => {
    assert.equal(event.location.q, 1);
    assert.equal(event.interceptors[0]?.hex?.q, 2);
    assert.equal(event.escortExchanges?.[0]?.attackerLabel, "CAP Alpha");
    assert.equal(location.r, 2);
    assert.equal(interceptors[0]?.unitKey, "cap");
  });

  const source = readFileSync("src/game/GameEngine.ts", "utf8");
  const projectionSource = readFileSync("src/game/battle/air/BattleAirEngagementProjection.ts", "utf8");
  const missionStrikeBody = source.slice(source.indexOf("private resolveAirStrikeMission("), source.indexOf("private resolveEscortMission("));
  const capClashBody = source.slice(source.indexOf("private buildCapClashAirEngagementEvent("), source.indexOf("private resolveCapClashFocusHex("));
  const strikePhaseBody = source.slice(source.indexOf("private resolveStrikeMissionAirPhase("), source.indexOf("private resolveFlakAgainstBomberAtTarget("));
  const flakHelperBody = source.slice(source.indexOf("private resolveFlakAgainstBomberAtTarget("), source.indexOf("private captureAirPhaseFlakState("));
  const playerBody = source.slice(source.indexOf("private resolvePlayerAttack("), source.indexOf("  /** Resolve a basic attack"));
  const botBody = source.slice(source.indexOf("private resolveBotAttack("), source.indexOf("  /** Ensures bot supply mirror"));
  await Then("every engine event producer delegates exactly once per emitted schema without retaining fallbacks", () => {
    assert.equal(source.match(/projectBattleAirEngagement\(/g)?.length, 9);
    assert.equal(source.match(/type:\s*"(?:flak|airToAir|capClash)"/g)?.length, 9);
    assert.equal(missionStrikeBody.match(/projectBattleAirEngagement\(/g)?.length, 2);
    assert.equal(capClashBody.match(/projectBattleAirEngagement\(/g)?.length, 1);
    assert.equal(strikePhaseBody.match(/projectBattleAirEngagement\(/g)?.length, 1);
    assert.equal(flakHelperBody.match(/projectBattleAirEngagement\(/g)?.length, 1);
    for (const body of [playerBody, botBody]) {
      assert.equal(body.match(/pendingAirEngagements\.push\(projectBattleAirEngagement\(/g)?.length, 2);
      assert.equal(body.match(/projectBattleAirEngagement\(/g)?.length, 2);
      assert.doesNotMatch(body, /pendingAirEngagements\.push\(\{\s*type:\s*"(?:flak|airToAir)"/);
      assert.doesNotMatch(body, /interceptorStrengthsAfterEscortPhase:\s*interception\.interceptorDeltas/);
      assert.ok(body.indexOf("const baseFlakResult = resolveAttack(flakReq)") < body.indexOf("projectBattleAirEngagement({"));
      assert.ok(body.indexOf("const interception = this.resolveAirInterception(") < body.lastIndexOf("projectBattleAirEngagement({"));
    }
    assert.doesNotMatch(source, /pendingAirEngagements\.push\(\{\s*type:\s*"(?:flak|airToAir|capClash)"/);
    assert.doesNotMatch(source, /airToAirEvent\s*=\s*\{\s*type:\s*"airToAir"/);
    assert.doesNotMatch(source, /event:\s*\{\s*type:\s*"flak"/);
    assert.doesNotMatch(projectionSource, /\b(?:Math\.random|resolveAttack|pendingAirEngagements)\b/);
  });
});
