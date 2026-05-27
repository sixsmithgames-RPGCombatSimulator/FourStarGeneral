import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { ScenarioUnit } from "../src/core/types";

function mountBattleScreenRoot(): HTMLElement {
  document.body.innerHTML = "<div id=\"battleScreen\"></div>";
  const root = document.getElementById("battleScreen");
  if (!root) {
    throw new Error("Battle screen root was not created for test");
  }
  return root;
}

function createPlayerUnit(unitId: string, q: number, r: number): ScenarioUnit {
  return {
    unitId,
    type: "Infantry_42",
    hex: { q, r },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 20,
    entrench: 0,
    facing: "NE",
    controlledBy: "Player",
    onSentry: false
  };
}

registerTest("BATTLESCREEN_INITIATIVE_ACTIONS_REQUIRE_CURRENT_ACTIVATION_UNIT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let activeAllowed = false;
  let inactiveAllowed = true;

  await Given("initiative mode with a current player activation", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({ unitId: "u_player_1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 })
    };
  });

  await When("eligibility is checked for the active and inactive unit ids", async () => {
    activeAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_1");
    inactiveAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_2");
  });

  await Then("only the current activation unit can act", async () => {
    if (!activeAllowed) {
      throw new Error("Expected current activation unit to be eligible for initiative actions.");
    }
    if (inactiveAllowed) {
      throw new Error("Expected non-active units to be blocked during initiative actions.");
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_PROCEED_ADVANCES_ONLY_CURRENT_ACTIVATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let queue: {
    currentIndex: number;
    currentTurn: number;
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder: number }>;
  };
  let playerLead: ScenarioUnit;
  let playerWing: ScenarioUnit;

  await Given("an interleaved initiative queue with two player units in one initiative band", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeGroupCursorUnitId = null;
    (screen as any).initiativeGroupSessionId = null;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).syncInitiativeTurnControlsState = () => {};
    (screen as any).focusCurrentInitiativeActivation = () => {};
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).confirmInitiativeProceedWithPendingUnits = async () => true;

    playerLead = createPlayerUnit("u_player_1", 2, 2);
    playerWing = createPlayerUnit("u_player_2", 3, 2);
    const botUnit = {
      unitId: "u_bot_1",
      type: "Infantry_42",
      hex: { q: 6, r: 2 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 20,
      entrench: 0,
      facing: "NE",
      controlledBy: "AI"
    } as ScenarioUnit;

    const playerActionFlags = new Map<string, { movementPointsUsed: number; attacksUsed: number }>();
    const playerUnits = [playerLead, playerWing];
    const engine = {
      playerUnits,
      botUnits: [botUnit],
      playerActionFlags,
      enterSentry: (_hex: { q: number; r: number }, unitId?: string) => {
        const target = playerUnits.find((unit) => unit.unitId === unitId);
        if (!target) {
          return false;
        }
        target.onSentry = true;
        return true;
      }
    };

    queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 },
        { unitId: "u_bot_1", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_2", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 2 }
      ]
    };

    (screen as any).battleState = {
      ensureGameEngine: () => engine
    };

    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => {
        const next = queue.activations.find((activation, index) => index >= queue.currentIndex && !activation.isActivated) ?? null;
        return next ? { ...next } : null;
      },
      completeUnitActivation: (unitId: string) => {
        const activation = queue.activations[queue.currentIndex];
        if (!activation || activation.unitId !== unitId) {
          throw new Error(`Expected to complete ${activation?.unitId ?? "none"}, received ${unitId}`);
        }
        activation.isActivated = true;
        queue.currentIndex += 1;
      }
    };
  });

  await When("the player presses Proceed", async () => {
    await (screen as any).handleProceedToNext();
  });

  await Then("only the current player activation is completed and the next player unit is preserved", async () => {
    if (!queue.activations[0]?.isActivated) {
      throw new Error("Expected the current player activation to complete on Proceed.");
    }
    if (queue.activations[2]?.isActivated) {
      throw new Error("Expected later player activations in the same initiative band to remain pending after Proceed.");
    }
    if (queue.currentIndex !== 1) {
      throw new Error(`Expected queue to advance to the bot activation index (1), received ${queue.currentIndex}.`);
    }
    if (!playerLead.onSentry) {
      throw new Error("Expected Proceed to place an uncommanded current unit on sentry before advancing.");
    }
    if (playerWing.onSentry) {
      throw new Error("Expected untouched player wing unit to remain off sentry.");
    }
  });
});
