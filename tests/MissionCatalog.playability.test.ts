import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { axialKey, type Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import terrainData from "../src/data/terrain.json";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { getAllMissionKeys, getMissionSummaryPackage, getMissionTurnLimit, isValidMission } from "../src/data/missions";
import { getScenarioByMissionKey } from "../src/data/scenarioRegistry";
import { normalizeScenarioSource, tupleToAxial } from "../src/data/scenarioNormalizer";
import { validateScenarioSource } from "../src/data/scenarioValidation";
import { GameEngine, type TurnFaction } from "../src/game/GameEngine";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";
import { createMissionRulesController, type MissionSnapshot } from "../src/state/missionRules";
import type { MissionKey } from "../src/state/UIState";
import { finalizeDeploymentZone } from "../src/ui/utils/deploymentZonePlanner";

function normalizedMission(missionKey: MissionKey): ScenarioData {
  return normalizeScenarioSource(structuredClone(getScenarioByMissionKey(missionKey)), {
    turnLimit: getMissionTurnLimit(missionKey, "Normal")
  });
}

function infantry(hex: Axial): ScenarioUnit {
  return { type: "Infantry_42", hex, strength: 100, experience: 0, ammo: 6, fuel: 0, entrench: 0, facing: "SE" };
}

function ruleSnapshot(scenario: ScenarioData, turn: number, occupancy: ReadonlyMap<string, TurnFaction>): MissionSnapshot {
  return {
    scenario,
    turnSummary: { phase: "playerTurn", activeFaction: "Player", turnNumber: turn },
    occupancy,
    playerUnits: scenario.sides.Player.units.length > 0 ? scenario.sides.Player.units : [infantry(scenario.sides.Player.hq)],
    botUnits: scenario.sides.Bot.units,
    allyUnits: scenario.sides.Ally?.units ?? []
  };
}

function liveSnapshot(engine: GameEngine, scenario: ScenarioData): MissionSnapshot {
  const occupancy = new Map<string, TurnFaction>();
  for (const [faction, units] of [["Player", engine.playerUnits], ["Bot", engine.botUnits], ["Ally", engine.allyUnits]] as const) {
    units.forEach((unit) => occupancy.set(axialKey(unit.hex), faction));
  }
  return { scenario, turnSummary: engine.getTurnSummary(), occupancy,
    playerUnits: engine.playerUnits, botUnits: engine.botUnits, allyUnits: engine.allyUnits };
}

/** Deliberately uses the engine's terrain/path owner, rather than duplicating movement rules in a catalog checker. */
function terrainRoute(engine: GameEngine, origin: Axial, target: Axial): { path: Axial[]; summary: { cost: number } } | null {
  // Test-only access isolates map connectivity from enemy occupancy; the playable
  // route and fuel checks below still execute through the public movement API.
  const pathOwner = engine as unknown as {
    findCheapestPathToAny(from: Axial, targets: readonly Axial[], moveType: string, blockers: ReadonlySet<string>): { path: Axial[]; summary: { cost: number } } | null;
  };
  return pathOwner.findCheapestPathToAny(origin, [target], "leg", new Set());
}

for (const missionKey of getAllMissionKeys().filter((key) => key !== "campaign")) {
  registerTest(`MISSION_CATALOG_ENGINE_START_MOVE_ROUND_${missionKey}`, async ({ Then }) => {
    resetDeploymentState();
    try {
      const scenario = normalizedMission(missionKey);
      const zones = (scenario.deploymentZones ?? []).map((zone) => finalizeDeploymentZone(zone, scenario, missionKey));
      const state = ensureDeploymentState();
      // A legal, affordable infantry purchase exercises reserve deployment even
      // in authored missions that intentionally start without player formations.
      state.initialize([{ key: "infantry", label: "Infantry", remaining: 1 }]);
      state.registerZones(zones);
      const engine = new GameEngine({
        scenario,
        unitTypes: unitTypesData as UnitTypeDictionary,
        terrain: terrainData as TerrainDictionary,
        playerSide: scenario.sides.Player,
        botSide: scenario.sides.Bot,
        allySide: scenario.sides.Ally,
        botStrategyMode: "Heuristic",
        botDifficulty: "Normal",
        initialPlayerDepotStock: { ammo: 1000, fuel: 1000, rations: 1000, parts: 1000 }
      });
      engine.beginDeployment();
      const occupied = new Set([...engine.playerUnits, ...engine.botUnits, ...engine.allyUnits].map((unit) => axialKey(unit.hex)));
      const startKey = zones.filter((zone) => zone.faction === "Player").flatMap((zone) => zone.hexKeys)
        .find((key) => {
          const [col, row] = key.split(",").map(Number);
          return !occupied.has(axialKey(tupleToAxial([col, row])));
        });
      if (!startKey) throw new Error(`${missionKey}: no available player deployment hex.`);
      const [col, row] = startKey.split(",").map(Number);
      const base = tupleToAxial([col, row]);
      engine.setBaseCamp(base);
      engine.deployUnitByKey(base, "infantry");
      engine.finalizeDeployment();
      engine.startPlayerTurnPhase();

      for (const objective of scenario.objectives) {
        const route = terrainRoute(engine, base, objective.hex);
        if (!route || !Number.isFinite(route.summary.cost)) {
          throw new Error(`${missionKey}: objective ${axialKey(objective.hex)} cannot be reached from deployment by infantry.`);
        }
      }
      const actor = engine.playerUnits.find((unit) => axialKey(unit.hex) === axialKey(base));
      if (!actor) throw new Error(`${missionKey}: infantry purchase did not enter the engine roster.`);
      const destination = engine.getReachableHexes(actor.hex, actor.unitId)[0];
      if (!destination) throw new Error(`${missionKey}: freshly deployed infantry cannot make an opening move.`);
      engine.moveUnit(actor.hex, destination, actor.unitId);
      const roundBefore = engine.serialize();
      engine.endTurn();
      const roundAfter = engine.serialize();
      const replayEngine = new GameEngine({
        scenario,
        unitTypes: unitTypesData as UnitTypeDictionary,
        terrain: terrainData as TerrainDictionary,
        playerSide: scenario.sides.Player,
        botSide: scenario.sides.Bot,
        allySide: scenario.sides.Ally,
        botStrategyMode: "Heuristic",
        botDifficulty: "Normal"
      });
      replayEngine.hydrateFromSerialized(roundBefore);
      replayEngine.endTurn();
      const replayAfter = replayEngine.serialize();
      await Then("the authored battle starts, accepts a legal move, and advances a deterministic complete round", async () => {
        if (engine.turnNumber !== 2 || engine.activeFaction !== "Player") {
          throw new Error(`${missionKey}: round did not return to player turn two.`);
        }
        for (const field of ["playerPlacements", "botPlacements", "allyPlacements"] as const) {
          if (JSON.stringify(roundAfter[field]) !== JSON.stringify(replayAfter[field])) {
            throw new Error(`${missionKey}: ${field} diverged after save/resume replay.`);
          }
        }
        for (const unit of [...engine.playerUnits, ...engine.botUnits, ...engine.allyUnits]) {
          const unitRow = unit.hex.r + Math.floor(unit.hex.q / 2);
          if (unit.hex.q < 0 || unit.hex.q >= scenario.size.cols || unitRow < 0 || unitRow >= scenario.size.rows
            || unit.strength < 0 || unit.strength > 100) {
            throw new Error(`${missionKey}: invalid live formation after turn: ${JSON.stringify(unit)}.`);
          }
        }
      });
      if (missionKey !== "training") {
        await Then("real enemy turns reach a natural terminal result by the authored deadline", async () => {
          const rules = createMissionRulesController(missionKey, scenario);
          let status = rules.onTurnAdvanced(liveSnapshot(engine, scenario));
          while (status.outcome.state === "inProgress" && engine.turnNumber < scenario.turnLimit!) {
            engine.endTurn();
            status = rules.onTurnAdvanced(liveSnapshot(engine, scenario));
          }
          if (status.outcome.state === "inProgress") throw new Error(`${missionKey}: live battle stalled past its authored deadline.`);
          console.info("[MissionCatalog passive result]", { missionKey, turn: engine.turnNumber, outcome: status.outcome.state, reason: status.outcome.reason });
        });
      }
    } finally {
      resetDeploymentState();
    }
  });

  if (missionKey === "training") continue; // Guided tutorial owns training completion.
  registerTest(`MISSION_CATALOG_AUTHORED_OUTCOMES_${missionKey}`, async ({ Then }) => {
    const scenario = normalizedMission(missionKey);
    const friendlyOccupancy = new Map<string, TurnFaction>(scenario.objectives.map((objective) => [axialKey(objective.hex), "Player"]));
    const victoryController = createMissionRulesController(missionKey, scenario);
    let victory = victoryController.getStatus();
    for (let turn = 1; turn <= scenario.turnLimit! && victory.outcome.state === "inProgress"; turn += 1) {
      const snapshot = ruleSnapshot(scenario, turn, friendlyOccupancy);
      // Town Defense requires the assault to be broken, not only center occupancy.
      victory = victoryController.onTurnAdvanced(missionKey === "patrol" ? { ...snapshot, botUnits: [] } : snapshot);
    }
    const defeatController = createMissionRulesController(missionKey, scenario);
    const defeat = defeatController.onTurnAdvanced(ruleSnapshot(scenario, scenario.turnLimit!, new Map()));
    const eliminationController = createMissionRulesController(missionKey, scenario);
    const eliminated = eliminationController.onTurnAdvanced({ ...ruleSnapshot(scenario, 2, new Map()), botUnits: [] });
    await Then("published objectives resolve victory, an unmet deadline resolves defeat, and enemy elimination resolves", async () => {
      if (victory.outcome.state !== "playerVictory") throw new Error(`${missionKey}: authored win remains ${victory.outcome.state}.`);
      if (defeat.outcome.state !== "playerDefeat") throw new Error(`${missionKey}: unmet deadline produces ${defeat.outcome.state}.`);
      if (eliminated.outcome.state !== "playerVictory") throw new Error(`${missionKey}: enemy elimination remains ${eliminated.outcome.state}.`);
    });
  });
}

for (const [missionKey, target] of [["patrol_river_watch", 8], ["patrol_pointe_du_hoc", 6]] as const) {
  registerTest(`MISSION_HOLD_CLOCK_ROUND_AND_RELOAD_PARITY_${missionKey}`, async ({ Then }) => {
    const scenario = normalizedMission(missionKey);
    const occupancy = new Map<string, TurnFaction>(scenario.objectives.map((objective) => [axialKey(objective.hex), "Player"]));
    const controller = createMissionRulesController(missionKey, scenario);
    const firstSnapshot = ruleSnapshot(scenario, 1, occupancy);
    const firstStatus = controller.onTurnAdvanced(firstSnapshot);
    for (let repetition = 0; repetition < target + 1; repetition += 1) controller.onTurnAdvanced(firstSnapshot);
    const saved = controller.serializeState();
    const restored = createMissionRulesController(missionKey, scenario);
    restored.hydrateState(saved);
    const resumed = restored.onTurnAdvanced(firstSnapshot);
    await Then("repeated reads and loading the current round do not manufacture hold turns", async () => {
      if (JSON.stringify(resumed) !== JSON.stringify(firstStatus)) throw new Error(`${missionKey}: re-evaluation changed hold status.`);
      const botPhase = restored.onTurnAdvanced({ ...firstSnapshot, turnSummary: { phase: "botTurn", activeFaction: "Bot", turnNumber: 2 } });
      if (botPhase.outcome.state !== "inProgress") throw new Error(`${missionKey}: faction transition completed the hold.`);
      for (let turn = 2; turn <= target; turn += 1) {
        const status = restored.onTurnAdvanced(ruleSnapshot(scenario, turn, occupancy));
        const expected = turn === target ? "playerVictory" : "inProgress";
        if (status.outcome.state !== expected) throw new Error(`${missionKey}: round ${turn} should be ${expected}, got ${status.outcome.state}.`);
      }
      const terminal = JSON.stringify(restored.serializeState());
      restored.onTurnAdvanced(ruleSnapshot(scenario, target + 1, new Map()));
      if (JSON.stringify(restored.serializeState()) !== terminal) throw new Error(`${missionKey}: terminal mission mutated after resolution.`);
    });
  });

  registerTest(`MISSION_HOLD_CLOCK_LEGACY_SAVE_${missionKey}`, async ({ Then }) => {
    const scenario = normalizedMission(missionKey);
    const occupancy = new Map<string, TurnFaction>(scenario.objectives.map((objective) => [axialKey(objective.hex), "Player"]));
    const controller = createMissionRulesController(missionKey, scenario);
    controller.onTurnAdvanced(ruleSnapshot(scenario, 1, occupancy));
    const saved = controller.serializeState();
    const data = { ...saved.data };
    delete data.lastCountedTurn;
    const restored = createMissionRulesController(missionKey, scenario);
    restored.hydrateState({ ...saved, data });
    restored.onTurnAdvanced(ruleSnapshot(scenario, 1, occupancy));
    await Then("an older save adopts its restored round without granting another hold tick", async () => {
      const field = missionKey === "patrol_river_watch" ? "blockedFordsStreak" : "holdStreak";
      if (restored.serializeState().data[field] !== 1) throw new Error(`${missionKey}: legacy resume awarded a free hold tick.`);
    });
  });

  registerTest(`MISSION_HOLD_CLOCK_REJECTS_CORRUPT_SAVE_${missionKey}`, async ({ Then }) => {
    const scenario = normalizedMission(missionKey);
    const saved = createMissionRulesController(missionKey, scenario).serializeState();
    await Then("present malformed or future round markers fail with an actionable error", async () => {
      for (const marker of [-1, 1.5, "2", null, 99]) {
        const restored = createMissionRulesController(missionKey, scenario);
        let error: unknown;
        try {
          restored.hydrateState({ ...saved, data: { ...saved.data, lastCountedTurn: marker } });
          restored.onTurnAdvanced(ruleSnapshot(scenario, 1, new Map()));
        } catch (caught) { error = caught; }
        if (!(error instanceof Error) || !error.message.includes("hold-clock snapshot")) {
          throw new Error(`${missionKey}: malformed marker ${JSON.stringify(marker)} was not explicitly rejected.`);
        }
      }
    });
  });
}

registerTest("MISSION_RIVER_COMMS_ARRIVAL_PERMANENTLY_FAILS_INTERDICTION", async ({ Then }) => {
  const scenario = normalizedMission("patrol_river_watch");
  const controller = createMissionRulesController("patrol_river_watch", scenario);
  const comms = scenario.sides.Bot.units.find((unit) => unit.type === "Recon_Bike")!;
  const center = scenario.objectives[1].hex;
  const initial = ruleSnapshot(scenario, 1, new Map());
  controller.onTurnAdvanced({ ...initial, botUnits: [{ ...comms, hex: center }, infantry(scenario.sides.Bot.hq)] });
  const restored = createMissionRulesController("patrol_river_watch", scenario);
  restored.hydrateState(controller.serializeState());
  const later = restored.onTurnAdvanced({ ...initial, botUnits: [infantry(scenario.sides.Bot.hq)] });
  await Then("destroying the comms team after arrival cannot satisfy the before-arrival order, including after reload", async () => {
    if (later.objectives.find((objective) => objective.id === "secondary_destroy_comms")?.state !== "failed") {
      throw new Error("River Watch incorrectly rewards late comms-team destruction.");
    }
  });
});

registerTest("MISSION_PRECOMBAT_LIVE_TERTIARY_ORDERS_AGREE", async ({ Then }) => {
  await Then("Gela and Arnhem present the same survival order before and during battle", async () => {
    for (const key of ["assault_gela_landings", "assault_arnhem_bridge"] as const) {
      const live = createMissionRulesController(key, normalizedMission(key)).getStatus().objectives.find((objective) => objective.tier === "tertiary");
      const briefing = getMissionSummaryPackage(key, "Normal").objectives.find((line) => line.startsWith("Tertiary:"));
      if (briefing !== `Tertiary: ${live?.label}.`) throw new Error(`${key}: briefing '${briefing}' conflicts with live order '${live?.label}'.`);
    }
  });
});

registerTest("MISSION_CATALOG_BRIEFING_TIERS_MATCH_LIVE_RULES", async ({ Then }) => {
  await Then("every tactical briefing promises exactly the objective tiers tracked during its mission", async () => {
    for (const key of getAllMissionKeys().filter((key) => key !== "training" && key !== "campaign")) {
      const live = createMissionRulesController(key, normalizedMission(key)).getStatus().objectives;
      const briefing = getMissionSummaryPackage(key, "Normal").objectives;
      for (const tier of ["primary", "secondary", "tertiary"] as const) {
        const promised = briefing.filter((line) => line.toLowerCase().startsWith(`${tier}:`)).length;
        const tracked = live.filter((objective) => objective.tier === tier).length;
        if (promised !== tracked) throw new Error(`${key}: briefing promises ${promised} ${tier} orders; live controller tracks ${tracked}.`);
      }
    }
  });
});

registerTest("MISSION_REGISTRY_REJECTS_PROTOTYPE_KEYS", async ({ Then }) => {
  await Then("object prototype names are rejected as unknown missions with the registry's actionable error", async () => {
    for (const key of ["constructor", "toString", "__proto__"]) {
      if (isValidMission(key)) throw new Error(`Unregistered inherited key '${key}' passed the mission guard.`);
      let error: unknown;
      try { getScenarioByMissionKey(key); } catch (caught) { error = caught; }
      if (!(error instanceof Error) || !error.message.includes("Unknown mission key")) {
        throw new Error(`Unregistered inherited key '${key}' did not receive an actionable registry error.`);
      }
    }
  });
});

registerTest("SCENARIO_VALIDATION_REJECTS_INVALID_FORMATIONS_AND_STACKS", async ({ Then }) => {
  await Then("bad unit identity, coordinates, strength, hostile overlap, and over-capacity stacks have actionable errors", async () => {
    const source = structuredClone(getScenarioByMissionKey("patrol_river_watch"));
    const unit = source.sides.Bot.units[0];
    const invalid = { ...unit, type: "MissingFormation", hex: [-1, 999], strength: 0 };
    source.sides.Bot.units.push(invalid as typeof unit);
    source.sides.Bot.units.push({ ...unit }, { ...unit });
    source.sides.Bot.units.push({ ...unit, hex: [...source.sides.Player.units[0].hex] });
    const issues = validateScenarioSource(source, "patrol_river_watch").issues.join("\n");
    for (const expected of ["unknown unit type", "outside the 14x12", "strength above 0", "2-combat-formation stack limit", "overlaps an opposing formation"]) {
      if (!issues.includes(expected)) throw new Error(`Missing actionable '${expected}' validation: ${issues}`);
    }
  });
});

registerTest("MISSION_INITIATIVE_ROUND_SERVICES_BOT_LOGISTICS_EXACTLY_ONCE", async ({ Then }) => {
  resetDeploymentState();
  try {
    const scenario = normalizedMission("assault_kasserine_pass");
    const botHQ = scenario.sides.Bot.hq;
    const tank: ScenarioUnit = { ...infantry(botHQ), type: "Panzer_IV", ammo: 0, fuel: 0, unitId: "audit-stranded-tank" };
    const truck: ScenarioUnit = { ...infantry({ q: botHQ.q - 1, r: botHQ.r }), type: "Supply_Truck", ammo: 0, fuel: 60, unitId: "audit-convoy" };
    scenario.sides.Bot.units = [tank, truck];
    scenario.sides.Player.units = [{ ...infantry(scenario.sides.Player.hq), preDeployed: true }];
    const engine = new GameEngine({ scenario, unitTypes: unitTypesData as UnitTypeDictionary,
      terrain: terrainData as TerrainDictionary, playerSide: scenario.sides.Player, botSide: scenario.sides.Bot,
      botStrategyMode: "Heuristic", botDifficulty: "Normal" });
    engine.beginDeployment();
    engine.setBaseCamp(scenario.sides.Player.hq);
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
    const historyBefore = engine.getSupplyHistory("Bot").length;
    engine.executeBotActivation("audit-convoy");
    engine.executeBotActivation("audit-stranded-tank");
    await Then("individual activations cannot duplicate supply ticks and the initiative round boundary restores bot mobility", async () => {
      if (engine.getSupplyHistory("Bot").length !== historyBefore
        || engine.botUnits.find((unit) => unit.unitId === "audit-stranded-tank")?.fuel !== 0) {
        throw new Error("Bot activations applied supply before the once-per-round boundary.");
      }
      for (let round = 1; round <= 2; round += 1) {
        // The initiative UI hands the resolved round to the engine in botTurn.
        const handoff = engine.serialize();
        engine.hydrateFromSerialized({ ...handoff, phase: "botTurn", activeFaction: "Bot" });
        engine.endTurn();
        if (engine.getSupplyHistory("Bot").length !== historyBefore + round) {
          throw new Error(`Initiative round ${round} did not produce exactly one Bot supply observation.`);
        }
        if ((engine.botUnits.find((unit) => unit.unitId === "audit-stranded-tank")?.fuel ?? 0) <= 0) {
          throw new Error(`Initiative round ${round} left the adjacent supplied tank stranded.`);
        }
        engine.executeBotActivation("audit-convoy");
        if (engine.getSupplyHistory("Bot").length !== historyBefore + round) {
          throw new Error("A convoy activation duplicated completed-round supply service.");
        }
      }
    });
  } finally {
    resetDeploymentState();
  }
});

registerTest("MISSION_RIVER_COMMS_TRANSIT_EVIDENCE_SURVIVES_DUPLICATE_RELOAD_AND_SAME_ACTIVATION_DEATH", async ({ Then }) => {
  const scenario = normalizedMission("patrol_river_watch");
  const controller = createMissionRulesController("patrol_river_watch", scenario);
  const centralFord = scenario.objectives[1].hex;
  const route = [
    { q: centralFord.q - 1, r: centralFord.r },
    centralFord,
    { q: centralFord.q + 1, r: centralFord.r }
  ];
  if (!controller.observeBotMovements) throw new Error("River Watch must consume committed movement evidence.");
  controller.observeBotMovements([{ unitType: "Recon_Bike", path: route }]);
  const recorded = controller.serializeState();
  controller.observeBotMovements([{ unitType: "Recon_Bike", path: route }]);
  const duplicate = controller.serializeState();
  const restored = createMissionRulesController("patrol_river_watch", scenario);
  restored.hydrateState(recorded);
  // No unit occupies the central ford at the boundary. The crossing comms team
  // was then destroyed, as can happen during counterfire in one activation.
  const afterDeath = { ...ruleSnapshot(scenario, 2, new Map()), botUnits: [] };
  const directStatus = controller.onTurnAdvanced(afterDeath);
  const restoredStatus = restored.onTurnAdvanced(afterDeath);
  await Then("the committed transit fails the secondary before elimination resolves, including after reload", async () => {
    if (JSON.stringify(recorded) !== JSON.stringify(duplicate)) throw new Error("Duplicate movement changed mission state.");
    for (const status of [directStatus, restoredStatus]) {
      if (status.outcome.state !== "playerVictory") throw new Error("Enemy elimination must still resolve the primary victory.");
      if (status.objectives.find((objective) => objective.id === "secondary_destroy_comms")?.state !== "failed") {
        throw new Error("A comms team crossing the ford before dying incorrectly completed the secondary.");
      }
    }
    if (JSON.stringify(directStatus) !== JSON.stringify(restoredStatus)) throw new Error("Saved transit evidence diverged on resume.");
  });
});

registerTest("MISSION_RIVER_COMMS_MOVEMENT_IGNORES_UNRELATED_EVIDENCE_AND_TERMINAL_LATE_EVENTS", async ({ Then }) => {
  const scenario = normalizedMission("patrol_river_watch");
  const controller = createMissionRulesController("patrol_river_watch", scenario);
  const centralFord = scenario.objectives[1].hex;
  const bypass = [{ q: centralFord.q - 1, r: centralFord.r }, { q: centralFord.q, r: centralFord.r - 1 }];
  if (!controller.observeBotMovements) throw new Error("River Watch must consume committed movement evidence.");
  controller.observeBotMovements([
    { unitType: "Infantry_42", path: [centralFord] },
    { unitType: "Recon_Bike", path: bypass },
    { unitType: "Recon_Bike", path: [] }
  ]);
  const status = controller.onTurnAdvanced({ ...ruleSnapshot(scenario, 2, new Map()), botUnits: [] });
  const terminal = controller.serializeState();
  controller.observeBotMovements([{ unitType: "Recon_Bike", path: [centralFord] }]);
  await Then("only the comms team's actual ford transit changes the objective, and terminal truth cannot be rewritten", async () => {
    if (status.objectives.find((objective) => objective.id === "secondary_destroy_comms")?.state !== "completed") {
      throw new Error("An unrelated unit or non-crossing route incorrectly failed the comms secondary.");
    }
    if (JSON.stringify(controller.serializeState()) !== JSON.stringify(terminal)) {
      throw new Error("A late movement event changed an already-resolved mission.");
    }
  });
});
