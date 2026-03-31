import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

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
