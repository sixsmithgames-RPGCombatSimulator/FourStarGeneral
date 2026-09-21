import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { SerializedAirMission, SupportImpactEvent } from "../src/game/GameEngine";
import type {
  EnemyContactSnapshot,
  SupportAssetSnapshot,
  SupportSnapshot,
  UnitCommandState
} from "../src/game/battle/BattleRuntimeContracts";
import type { Axial, ScenarioUnit } from "../src/core/types";
import {
  resolveArtilleryActionProjection,
  resolveObservedArtilleryTargetHexes
} from "../src/game/battle/support/BattleSupportTargeting";
import { BattleState } from "../src/state/BattleState";

function asset(status: SupportAssetSnapshot["status"], charges = 1): SupportAssetSnapshot {
  return {
    id: "heavy-artillery",
    label: "Heavy artillery",
    type: "artillery",
    status,
    charges,
    maxCharges: 2,
    cooldown: 0,
    maxCooldown: 2,
    assignedHex: null,
    notes: null,
    queuedHex: status === "queued" ? "2,0" : null,
    queuedByHex: status === "queued" ? "0,0" : null
  };
}

function support(section: SupportAssetSnapshot["status"] = "ready"): SupportSnapshot {
  const entry = asset(section);
  return {
    updatedAt: "2026-09-17T12:00:00.000Z",
    ready: section === "ready" ? [entry] : [],
    queued: section === "queued" ? [entry] : [],
    cooldown: section === "cooldown" ? [entry] : [],
    maintenance: section === "maintenance" ? [entry] : [],
    metrics: {
      totalAssets: 1,
      ready: section === "ready" ? 1 : 0,
      queued: section === "queued" ? 1 : 0,
      cooldown: section === "cooldown" ? 1 : 0,
      maintenance: section === "maintenance" ? 1 : 0,
      totalCharges: entry.charges,
      actionsQueued: section === "queued" ? 1 : 0,
      averageCooldown: null
    }
  };
}

function command(suppressionState: UnitCommandState["suppressionState"] = "clear"): UnitCommandState {
  return {
    unitId: "observer",
    unitType: "Recon_Bike",
    isAutomated: false,
    suppressionState
  } as UnitCommandState;
}

function contact(
  unitId: string,
  q: number,
  state: EnemyContactSnapshot["state"],
  lastSeenTurn = 5
): EnemyContactSnapshot {
  return { unitId, hex: { q, r: 0 }, state, lastSeenTurn, source: "recon" };
}

registerTest("BATTLE_SUPPORT_TARGETING_PRESERVES_OBSERVER_AND_CONTACT_RULES", async ({ Given, When, Then }) => {
  const contacts = [
    contact("identified", 3, "identified"),
    contact("duplicate-hex", 3, "visible"),
    contact("spotted", 2, "spotted"),
    contact("stale", 1, "visible", 4),
    contact("too-far", 4, "visible")
  ];
  let targets: readonly { q: number; r: number }[] = [];
  let available: ReturnType<typeof resolveArtilleryActionProjection>;

  await Given("a recon observer with current, stale, duplicate, spotted, and distant contacts", () => {});
  await When("the pure support targeting boundary projects legal observed hexes", () => {
    const observation = {
      callerHex: { q: 0, r: 0 },
      definition: { class: "recon" as const, moveType: "wheel" as const, vision: 2 },
      currentTurn: 5,
      enemyContacts: contacts
    };
    targets = resolveObservedArtilleryTargetHexes(observation);
    available = resolveArtilleryActionProjection({
      ...observation,
      commandState: command(),
      support: support("ready")
    });
  });
  await Then("recon gains one observation hex while existing contact filtering and dedupe remain exact", () => {
    assert.deepEqual(targets, [{ q: 3, r: 0 }]);
    assert.equal(available.available, true);
    assert.equal(available.assetId, "heavy-artillery");
    assert.deepEqual(available.targetHexes, [{ q: 3, r: 0 }]);
  });
});

registerTest("BATTLE_SUPPORT_TARGETING_PRESERVES_BLOCKING_COPY", async ({ When, Then }) => {
  const base = {
    callerHex: { q: 0, r: 0 },
    definition: { class: "infantry" as const, moveType: "leg" as const, vision: 3 },
    currentTurn: 5,
    enemyContacts: [contact("target", 2, "visible")]
  };
  let pinned: ReturnType<typeof resolveArtilleryActionProjection>;
  let queued: ReturnType<typeof resolveArtilleryActionProjection>;

  await When("pinned and already-tasked observers request command availability", () => {
    pinned = resolveArtilleryActionProjection({ ...base, commandState: command("pinned"), support: support("ready") });
    queued = resolveArtilleryActionProjection({ ...base, commandState: command(), support: support("queued") });
  });
  await Then("the existing actionable reasons remain byte-for-byte stable", () => {
    assert.equal(pinned.reason, "Pinned battalions cannot adjust Heavy artillery until the suppression is broken.");
    assert.equal(queued.reason, "Heavy artillery is already tasked.");
    assert.equal(pinned.available, false);
    assert.equal(queued.available, false);
  });
});

registerTest("BATTLE_STATE_SUPPORT_COMMAND_FACADE_IS_DETACHED_AND_ROUTES_MUTATIONS", async ({ Given, When, Then }) => {
  const battleState = new BattleState();
  const authoritativeSupport = support("queued");
  const scheduledMission = {
    id: "strike-1",
    kind: "strike",
    faction: "Player",
    unitKey: "bomber-1",
    unitType: "Bomber",
    status: "queued",
    launchTurn: 5,
    turnsRemaining: 1,
    targetHex: { q: 2, r: 0 },
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  } as SerializedAirMission;
  let canceledSupport = "";
  let canceledAir = "";
  let queuedArguments: {
    callerHex: Axial;
    assetId: string;
    targetHex: Axial;
    callerUnitId?: string | null;
  } | null = null;

  await Given("an engine double whose mutable support collections remain authoritative", () => {
    (battleState as unknown as { gameEngine: unknown }).gameEngine = {
      getTurnSummary: () => ({ turnNumber: 5 }),
      getSupportSnapshot: () => authoritativeSupport,
      getScheduledAirMissions: () => [scheduledMission],
      getEnemyContactSnapshot: () => [contact("target", 2, "visible")],
      getUnitCommandState: () => command(),
      cancelQueuedSupport: (id: string) => { canceledSupport = id; return true; },
      cancelQueuedAirMission: (id: string) => { canceledAir = id; return true; },
      resolveSmokeTargetHexKeys: () => ["1,0"],
      queueSupportActionFromUnit: (
        callerHex: Axial,
        assetId: string,
        targetHex: Axial,
        callerUnitId?: string | null
      ) => {
        queuedArguments = { callerHex, assetId, targetHex, callerUnitId };
        return true;
      },
      consumeSupportImpactEvents: () => [],
      botUnits: []
    };
  });
  await When("presentation mutates its snapshot and commands route back through BattleState", () => {
    const snapshot = battleState.getBattleSupportCommandSnapshot();
    assert.ok(snapshot);
    (snapshot.support.queued as SupportAssetSnapshot[])[0] = { ...snapshot.support.queued[0], label: "Mutated" };
    (snapshot.enemyContacts as EnemyContactSnapshot[])[0].hex.q = 99;
    battleState.cancelQueuedBattleSupport("heavy-artillery");
    battleState.cancelQueuedBattleAirMission("strike-1");
    battleState.queueBattleSupportAction({ q: 0, r: 0 }, "heavy-artillery", { q: 2, r: 0 }, "observer");
  });
  await Then("engine facts remain detached and each command reaches the intended capability", () => {
    const fresh = battleState.getBattleSupportCommandSnapshot();
    assert.equal(fresh?.support.queued[0].label, "Heavy artillery");
    assert.equal(fresh?.enemyContacts[0].hex.q, 2);
    assert.equal(canceledSupport, "heavy-artillery");
    assert.equal(canceledAir, "strike-1");
    assert.deepEqual(queuedArguments, {
      callerHex: { q: 0, r: 0 },
      assetId: "heavy-artillery",
      targetHex: { q: 2, r: 0 },
      callerUnitId: "observer"
    });
  });
});

registerTest("BATTLE_STATE_SUPPORT_READ_FACADE_FORWARDS_AND_DETACHES_RESULTS", async ({ Given, When, Then }) => {
  const battleState = new BattleState();
  const authoritativeCommand = command();
  const authoritativeSmokeTargets = ["1,0", "2,0"];
  const authoritativeImpacts: SupportImpactEvent[] = [{
    assetId: "heavy-artillery",
    label: "Heavy artillery",
    targetHex: { q: 2, r: 0 },
    targetFaction: "Bot",
    hit: true,
    damage: 18,
    destroyed: false,
    targetUnitType: "Infantry_42"
  }];
  const authoritativeBotUnit: ScenarioUnit = {
    unitId: "bot-1",
    type: "Infantry_42",
    hex: { q: 2, r: 0 },
    strength: 82,
    experience: 0,
    ammo: 4,
    fuel: 0,
    entrench: 0,
    facing: "NW"
  };
  let commandArguments: { hex: Axial; unitId?: string } | null = null;
  let smokeArguments: { hex: Axial; unitId?: string } | null = null;
  let impactConsumptions = 0;
  let projectedCommand: UnitCommandState | null = null;
  let smokeTargets: string[] = [];
  let impacts: SupportImpactEvent[] = [];
  let botUnit: ScenarioUnit | null = null;

  await Given("an engine double with authoritative command, smoke, impact, and bot-unit records", () => {
    (battleState as unknown as { gameEngine: unknown }).gameEngine = {
      getUnitCommandState: (hex: Axial, unitId?: string) => {
        commandArguments = { hex, unitId };
        return authoritativeCommand;
      },
      resolveSmokeTargetHexKeys: (hex: Axial, unitId?: string) => {
        smokeArguments = { hex, unitId };
        return authoritativeSmokeTargets;
      },
      consumeSupportImpactEvents: () => {
        impactConsumptions += 1;
        return authoritativeImpacts;
      },
      botUnits: [authoritativeBotUnit]
    };
  });
  await When("the BattleState support read facade forwards requests and returns presentation values", () => {
    projectedCommand = battleState.getBattleUnitCommandState({ q: 0, r: 0 }, "observer");
    smokeTargets = battleState.resolveBattleSmokeTargetHexKeys({ q: 0, r: 0 }, "observer");
    impacts = battleState.consumeBattleSupportImpacts();
    botUnit = battleState.getBotUnitAt({ q: 2, r: 0 });

    assert.ok(projectedCommand);
    (projectedCommand as { unitId: string }).unitId = "presentation-command";
    impacts[0].targetHex.q = 99;
    assert.ok(botUnit);
    botUnit.strength = 1;
    botUnit.hex.q = 99;
  });
  await Then("arguments remain exact while command, impact, and bot-unit results stay detached", () => {
    assert.deepEqual(commandArguments, { hex: { q: 0, r: 0 }, unitId: "observer" });
    assert.deepEqual(smokeArguments, { hex: { q: 0, r: 0 }, unitId: "observer" });
    assert.deepEqual(smokeTargets, authoritativeSmokeTargets);
    assert.equal(impactConsumptions, 1);
    assert.equal(authoritativeCommand.unitId, "observer");
    assert.equal(authoritativeImpacts[0].targetHex.q, 2);
    assert.equal(authoritativeBotUnit.strength, 82);
    assert.equal(authoritativeBotUnit.hex.q, 2);
    assert.equal(battleState.getBotUnitAt({ q: 9, r: 9 }), null);
  });
});
