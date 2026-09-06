import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { neighbors } from "../src/core/Hex";
import type { ScenarioData, ScenarioSide, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import terrainData from "../src/data/terrain.json";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { GameEngine } from "../src/game/GameEngine";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import type { SelectionIntel } from "../src/ui/announcements/AnnouncementTypes";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

registerTest("BATTLE_SCREEN_BLOCKED_FRESH_SELECTION_REPORTS_LEGAL_OPTIONS_WITHOUT_SPENDING_ACTIONS", async ({ Given, When, Then }) => {
  const selectedHex = { q: 1, r: 1 };
  const selectedId = "blocked-16th-infantry";
  const unit = (unitId: string, hex: ScenarioUnit["hex"]): ScenarioUnit => ({
    unitId, hex, type: "Infantry_42", strength: 100, experience: 0,
    ammo: 6, fuel: 0, entrench: 0, facing: "NE", preDeployed: true,
    controlledBy: "Player"
  });
  const selectedUnit: ScenarioUnit = {
    ...unit(selectedId, selectedHex),
    campaignProvenance: {
      campaignId: "blocked-selection-fixture", formationId: selectedId,
      engagementId: "blocked-selection", sourceRevision: 1, sourceSegment: 0,
      faction: "Player", ownership: "core", formationName: "16th Infantry",
      campaignUnitType: "Infantry_42"
    }
  };
  const adjacentHexes = neighbors(selectedHex);
  const side = (units: ScenarioUnit[]): ScenarioSide => ({
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  });
  const scenario: ScenarioData = {
    name: "Fresh infantry surrounded by full friendly stacks",
    size: { cols: 3, rows: 3 },
    tilePalette: {
      plain: { terrain: "plains", terrainType: "rural", density: "average", features: [], recon: "intel" }
    },
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ tile: "plain" }))),
    objectives: [], turnLimit: 0,
    sides: {
      Player: side([selectedUnit, ...adjacentHexes.flatMap((hex, index) => [
        unit(`neighbor-${index}-a`, hex), unit(`neighbor-${index}-b`, hex)
      ])]),
      Bot: side([])
    }
  };
  const unitTypes = unitTypesData as UnitTypeDictionary;
  const engine = new GameEngine({
    scenario, unitTypes, terrain: terrainData as TerrainDictionary,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot,
    botStrategyMode: "Simple"
  });
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  const { col, row } = CoordinateSystem.axialToOffset(selectedHex.q, selectedHex.r);
  const selectedKey = CoordinateSystem.makeHexKey(col, row);
  const published: NonNullable<SelectionIntel>[] = [];
  const announcements: string[] = [];
  // Skip unrelated constructor/UI wiring, retaining the real selection caller,
  // exact-ID resolution, engine queries, action summary and intel projection.
  const screen = Object.assign(Object.create(BattleScreen.prototype), {
    battleState: { ensureGameEngine: () => engine },
    unitTypes, selectedHexKey: selectedKey, selectedPlayerUnitId: selectedId,
    isInitiativeSystemEnabled: false, initiativeMethods: null,
    playerMoveHexes: new Set<string>(), playerAttackHexes: new Set<string>(),
    hexMapRenderer: null, baseCampStatus: document.createElement("div"),
    syncQueuedTargetMarkers: () => {},
    announceBattleUpdate: (message: string) => { announcements.push(message); },
    completeGuidedTutorialSelectionFromClick: () => {},
    syncTutorialPhaseWithCurrentContext: () => {},
    publishSelectionIntel: (intel: SelectionIntel | null) => { if (intel) published.push(intel); },
    lookupTerrainName: () => "Plains",
    canUnitDigIn: () => false,
    buildTowToggle: () => null,
    buildBattleIntelStatusChips: () => [],
    buildBattleIntelActions: () => [],
    buildBattleIntelDetailSections: () => [],
    buildBattleIntelNotes: () => []
  }) as {
    updateSelectionFeedback: (key: string) => void;
    selectedPlayerUnitId: string | null;
  };

  await Given("fresh 16th Infantry has 3/3 movement but all six neighboring stacks are full", async () => {
    assert.equal(engine.getTurnSummary().phase, "playerTurn");
    assert.deepEqual(engine.getHexStackMembers(selectedHex, "Player").map((member) => member.unitId), [selectedId]);
    for (const hex of adjacentHexes) assert.equal(engine.getHexStackMembers(hex, "Player").length, 2);
    assert.deepEqual(engine.getMovementBudget(selectedHex, selectedId), { max: 3, remaining: 3 });
    assert.deepEqual(engine.getReachableHexes(selectedHex, selectedId), []);
    assert.deepEqual(engine.getAttackableTargets(selectedHex, selectedId), []);
  });
  const before = engine.serialize();
  const beforeCommand = engine.getUnitCommandState(selectedHex, selectedId);
  // Fresh units use the engine's default unspent flags; no entry is persisted
  // until an action changes them. Sentry eligibility also requires no actions spent.
  assert.deepEqual(before.actionFlags?.Player, []);
  assert.equal(beforeCommand?.unitId, selectedId);
  assert.equal(beforeCommand?.canEnterSentry, true);

  await When("the actual selection-feedback caller publishes the blocked unit's intel", async () => {
    screen.updateSelectionFeedback(selectedKey);
  });

  await Then("selection preserves the exact unit, allowance, action flags and serialized state", async () => {
    assert.equal(screen.selectedPlayerUnitId, selectedId);
    assert.deepEqual(engine.getMovementBudget(selectedHex, selectedId), { max: 3, remaining: 3 });
    assert.deepEqual(engine.getUnitCommandState(selectedHex, selectedId), beforeCommand);
    assert.deepEqual(engine.serialize().actionFlags, before.actionFlags);
    assert.deepEqual(engine.serialize(), before);
    assert.equal(published.length, 1);
    const intel = published[0];
    assert.equal(intel.kind, "battle");
    if (intel.kind !== "battle") throw new Error("Expected battle selection intel.");
    assert.equal(intel.unitLabel, "16th Infantry");
    assert.equal(intel.movementRemaining, 3);
    assert.equal(intel.movementMax, 3);
    assert.equal(intel.moveOptions, 0);
    assert.equal(intel.attackOptions, 0);
    assert.deepEqual(announcements, [intel.statusMessage]);
    assert.doesNotMatch(intel.statusMessage, /already moved|attacked this turn|unit has moved/i);
    assert.match(intel.statusMessage, /No legal movement or attack options are currently available\./);
  });
});

registerTest("BATTLE_SCREEN_SELECTION_INTEL_NOTES_SKIP_REDUNDANT_SENTRY_AND_FORTIFICATION_COPY", async ({ Then }) => {
  const fakeScreen = {
    canUnitDigIn: () => false,
    describeHexModification: () => "fortifications"
  };

  const notes = (BattleScreen.prototype as unknown as {
    buildBattleIntelNotes: (unit: unknown, commandState: unknown) => string[];
  }).buildBattleIntelNotes.call(
    fakeScreen,
    { type: "AT_Gun_50mm", entrench: 0 },
    {
      suppressionState: "none",
      suppressorCount: 0,
      isOnSentry: true,
      canEnterSentry: false,
      sentryReason: "Hold position and stay uncommitted this turn to set sentry.",
      existingHexModification: { type: "fortifications" },
      canDigIn: false,
      digInReason: null,
      isEngineer: false,
      canBuildModification: false,
      buildReason: null
    }
  );

  await Then("redundant sentry and fortification notes are excluded", async () => {
    if (notes.some((note) => note.includes("Sentry"))) {
      throw new Error(`Expected sentry note to be omitted because the action card already covers it, received ${JSON.stringify(notes)}.`);
    }
    if (notes.some((note) => note.includes("fortifications"))) {
      throw new Error(`Expected existing fortification note to be omitted because the chip already covers it, received ${JSON.stringify(notes)}.`);
    }
    if (!notes.includes("Use the movement and attack overlays on the map to issue this unit's next order.")) {
      throw new Error(`Expected the generic fallback guidance to remain after redundant notes are removed, received ${JSON.stringify(notes)}.`);
    }
  });
});

registerTest("BATTLE_SCREEN_STACK_UNIT_SELECTOR_SWITCHES_THE_ACTIVE_UNIT_ON_A_SHARED_HEX", async ({ Then }) => {
  let refreshedHexKey: string | null = null;
  const fakeScreen = {
    selectedHexKey: "6,9",
    selectedPlayerUnitId: "engineer_1",
    getPlayerStackMembersAtHex: () => ([
      {
        unitId: "engineer_1",
        unit: { type: "Engineer", strength: 100 },
        isAutomated: false
      },
      {
        unitId: "infantry_2",
        unit: { type: "Infantry_42", strength: 76 },
        isAutomated: false
      }
    ]),
    updateSelectionFeedback: (hexKey: string | null) => {
      refreshedHexKey = hexKey;
    }
  };

  await (BattleScreen.prototype as unknown as {
    executeSelectionIntelAction: (this: typeof fakeScreen, actionId: string) => Promise<void>;
  }).executeSelectionIntelAction.call(fakeScreen, "selectUnit:infantry_2");

  await Then("the chosen stack member becomes the active unit and the overlay refreshes in place", async () => {
    if (fakeScreen.selectedPlayerUnitId !== "infantry_2") {
      throw new Error(`Expected stack selector to activate infantry_2, received ${fakeScreen.selectedPlayerUnitId}.`);
    }
    if (refreshedHexKey !== "6,9") {
      throw new Error(`Expected stack selector to refresh intel for 6,9, received ${refreshedHexKey}.`);
    }
  });
});

registerTest("BATTLE_SCREEN_MOVE_FAILURE_MESSAGE_EXPLAINS_THE_PROBLEM_AND_FIX", async ({ Then }) => {
  const message = (BattleScreen.prototype as unknown as {
    buildMoveFailureMessage: (error: unknown) => string;
  }).buildMoveFailureMessage(new Error("This battery must choose Move Out before it can be towed."));

  await Then("tow-state move failures tell the commander exactly what to do next", async () => {
    if (!message.includes("This battery must choose Move Out before it can be towed.")) {
      throw new Error(`Expected move failure message to include the engine reason, received '${message}'.`);
    }
    if (!message.includes("Use Move Out first, then pick a destination hex.")) {
      throw new Error(`Expected move failure message to include the corrective step, received '${message}'.`);
    }
  });
});

registerTest("BATTLE_SCREEN_AMMO_HELPERS_DISTINGUISH_LOW_AMMO_FROM_ALREADY_ATTACKED", async ({ Then }) => {
  const helpers = BattleScreen.prototype as unknown as {
    buildBattleActionSummary: (moveOptions: number, attackOptions: number, ammoStatusMessage: string | null) => string;
    buildBattleAmmoStatusMessage: (
      this: {
        resolveBattleAttackAmmoCost: (definition: unknown) => number;
        formatBattleResourceValue: (value: number | null) => string;
      },
      unit: unknown,
      definition: unknown
    ) => string | null;
    resolveBattleAttackAmmoCost: (definition: unknown) => number;
    formatBattleResourceValue: (value: number | null) => string;
  };

  const fakeScreen = {
    resolveBattleAttackAmmoCost: helpers.resolveBattleAttackAmmoCost,
    formatBattleResourceValue: helpers.formatBattleResourceValue
  };

  const standardAmmoMessage = helpers.buildBattleAmmoStatusMessage.call(
    fakeScreen,
    { ammo: 1 },
    { moveType: "tracked", class: "tank", traits: [] }
  );
  const lowAmmoMessage = helpers.buildBattleAmmoStatusMessage.call(
    fakeScreen,
    { ammo: 1 },
    { moveType: "towed", class: "artillery", traits: [] }
  );
  const actionSummary = helpers.buildBattleActionSummary(3, 0, lowAmmoMessage);
  const blockedMovementSummary = helpers.buildBattleActionSummary(0, 2, null);
  const blockedLowAmmoSummary = helpers.buildBattleActionSummary(0, 0, lowAmmoMessage);

  await Then("one ammo is still enough for a one-cost attack while higher-cost attacks explain the real blocker", async () => {
    if (standardAmmoMessage !== null) {
      throw new Error(`Expected one ammo to remain attack-capable for standard attacks, received '${standardAmmoMessage}'.`);
    }
    if (!lowAmmoMessage?.includes("needs 2 ammo") || !lowAmmoMessage.includes("has 1 remaining")) {
      throw new Error(`Expected low-artillery-ammo message to explain the precise shortage, received '${lowAmmoMessage ?? "null"}'.`);
    }
    if (actionSummary.includes("already moved and attacked") || actionSummary.includes("attacked this turn")) {
      throw new Error(`Expected low-ammo summary to avoid the already-attacked explanation, received '${actionSummary}'.`);
    }
    if (!actionSummary.includes("No attack options are available until the unit is resupplied.")) {
      throw new Error(`Expected low-ammo summary to direct the player toward resupply, received '${actionSummary}'.`);
    }
    assert.doesNotMatch(blockedMovementSummary, /unit has moved/i);
    assert.match(blockedMovementSummary, /No legal movement options\. 2 attack targets available\./);
    assert.match(blockedLowAmmoSummary, /No legal movement or attack options are currently available\./);
  });
});

registerTest("BATTLE_SCREEN_DOES_NOT_RENDER_SPOTTED_CONTACT_MARKERS_OVER_FRIENDLY_STACKS", async ({ Then }) => {
  const renderCalls: Array<{ hexKey: string; members: Array<{ faction: string; unit: { type: string } }> }> = [];
  const playerUnit = {
    type: "Infantry_42",
    hex: { q: 6, r: 5 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 0,
    entrench: 0,
    facing: "SE" as const,
    unitId: "player_1"
  };
  const fakeEngine = {
    getHexModificationSnapshots: () => [],
    playerUnits: [playerUnit],
    allyUnits: [],
    botUnits: [{
      type: "Recon_Bike",
      hex: { q: 6, r: 5 },
      strength: 25,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "NW" as const,
      unitId: "bot_contact"
    }],
    getHexStackMembers: () => ([{
      unitId: "player_1",
      unit: playerUnit,
      faction: "Player",
      isAutomated: false
    }]),
    getEnemyContactSnapshot: () => ([{
      unitId: "bot_contact",
      hex: { q: 6, r: 5 },
      state: "spotted" as const,
      lastSeenTurn: 5,
      source: "Stale contact"
    }])
  };
  const fakeScreen = {
    hexMapRenderer: {
      clearDebugMarkers: () => {},
      clearAllHexModifications: () => {},
      renderUnitStack: (hexKey: string, members: Array<{ faction: string; unit: { type: string } }>) => {
        renderCalls.push({ hexKey, members });
      }
    },
    battleState: {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine
    },
    clearAllUnitIcons: () => {},
    refreshIdleUnitHighlights: () => {},
    syncQueuedTargetMarkers: () => {},
    unitTypes: {
      Infantry_42: { moveType: "leg" },
      Recon_Bike: { moveType: "wheel" }
    },
    debugPlacementOverlayEnabled: false,
    buildEnemyContactRenderUnit: () => ({
      type: "Recon_Bike",
      hex: { q: 6, r: 5 },
      strength: 25,
      experience: 0,
      ammo: 0,
      fuel: 0,
      entrench: 0,
      facing: "NW" as const,
      unitId: "bot_contact"
    })
  };

  (BattleScreen.prototype as unknown as {
    renderEngineUnits: (this: typeof fakeScreen) => void;
  }).renderEngineUnits.call(fakeScreen);

  const expectedHexKey = (() => {
    const { col, row } = CoordinateSystem.axialToOffset(playerUnit.hex.q, playerUnit.hex.r);
    return CoordinateSystem.makeHexKey(col, row);
  })();

  await Then("only the friendly stack is rendered on the shared hex", async () => {
    if (renderCalls.length !== 1) {
      throw new Error(`Expected exactly one stack render on the friendly-controlled hex, received ${renderCalls.length}.`);
    }
    const [call] = renderCalls;
    if (!call || call.hexKey !== expectedHexKey) {
      throw new Error(`Expected the rendered stack to remain on ${expectedHexKey}, received ${call?.hexKey ?? "none"}.`);
    }
    if (call.members.length !== 1 || call.members[0]?.faction !== "Player") {
      throw new Error(`Expected only the player stack to render, received ${JSON.stringify(call.members)}.`);
    }
  });
});
