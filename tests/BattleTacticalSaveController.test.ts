import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { TurnSummary } from "../src/game/GameEngine";
import { BattleState, type BattleTurnSnapshot } from "../src/state/BattleState";
import {
  BattleTacticalSaveController,
  type BattleTacticalSaveUiStability
} from "../src/ui/controllers/BattleTacticalSaveController";

function createControllerHarness(args: {
  turn: BattleTurnSnapshot | null;
  ui?: Partial<BattleTacticalSaveUiStability>;
}): BattleTacticalSaveController {
  const root = document.createElement("section");
  document.body.appendChild(root);
  const ui: BattleTacticalSaveUiStability = {
    initializationComplete: true,
    combatTransactionActive: false,
    tacticalDecisionOpen: false,
    initiativeActive: false,
    initiativeAtBoundary: false,
    ...args.ui
  };
  const battleState = {
    getBattleTurnSnapshot: () => args.turn ? structuredClone(args.turn) : null,
    getCampaignBridgeState: () => ({ campaignId: "campaign", engagementId: "engagement" }),
    getAssignedCommanderId: () => null,
    ensureGameEngine: () => { throw new Error("Controller crossed the BattleState facade."); },
    tryGetGameEngine: () => { throw new Error("Controller crossed the BattleState facade."); }
  } as unknown as BattleState;
  return new BattleTacticalSaveController({
    root,
    battleState,
    getStatusElement: () => null,
    getUiStability: () => ui,
    getPresentationContext: () => ({ difficulty: "Normal", selectedHexKey: "1,1", mapZoom: 2 }),
    captureActiveBattle: () => { throw new Error("Availability must not capture a save."); },
    resumeActiveBattle: () => { throw new Error("Availability must not resume a save."); },
    showBattleScreen: () => { throw new Error("Availability must not navigate."); },
    announce: () => { throw new Error("Availability must not announce."); }
  });
}

registerTest("BATTLE_STATE_TURN_SNAPSHOT_IS_DETACHED_AND_OPTIONAL", async ({ Given, When, Then }) => {
  const battleState = new BattleState();
  let summary: TurnSummary = {
    turnNumber: 4,
    phase: "playerTurn",
    activeFaction: "Player"
  } as TurnSummary;
  let snapshot: BattleTurnSnapshot | null = null;

  await Given("an initialized engine summary behind BattleState", () => {
    (battleState as unknown as { gameEngine: { getTurnSummary(): TurnSummary } }).gameEngine = {
      getTurnSummary: () => summary
    };
  });
  await When("the tactical turn projection is read and the engine summary later changes", () => {
    snapshot = battleState.getBattleTurnSnapshot();
    summary = { ...summary, turnNumber: 9, activeFaction: "Bot" };
  });
  await Then("the returned projection retains only the detached boundary facts", () => {
    assert.deepEqual(snapshot, { turnNumber: 4, phase: "playerTurn", activeFaction: "Player" });
    battleState.resetEngineState();
    assert.equal(battleState.getBattleTurnSnapshot(), null);
  });
});

registerTest("BATTLE_TACTICAL_SAVE_CONTROLLER_USES_TYPED_TURN_BOUNDARIES", async ({ Given, When, Then }) => {
  let deploymentAvailability: ReturnType<BattleTacticalSaveController["getTacticalSaveAvailability"]>;
  let activationAvailability: ReturnType<BattleTacticalSaveController["getTacticalSaveAvailability"]>;
  let blockedAvailability: ReturnType<BattleTacticalSaveController["getTacticalSaveAvailability"]>;

  await Given("detached deployment, activation-boundary, and active-combat contexts", () => {});
  await When("the controller evaluates them without accessing GameEngine", () => {
    deploymentAvailability = createControllerHarness({
      turn: { turnNumber: 1, phase: "deployment", activeFaction: "Player" }
    }).getTacticalSaveAvailability();
    activationAvailability = createControllerHarness({
      turn: { turnNumber: 3, phase: "playerTurn", activeFaction: "Player" },
      ui: { initiativeActive: true, initiativeAtBoundary: true }
    }).getTacticalSaveAvailability();
    blockedAvailability = createControllerHarness({
      turn: { turnNumber: 3, phase: "playerTurn", activeFaction: "Player" },
      ui: { combatTransactionActive: true }
    }).getTacticalSaveAvailability();
  });
  await Then("the exact save boundary kinds and blocking copy are preserved", () => {
    assert.equal(deploymentAvailability.stable, true);
    assert.equal(deploymentAvailability.boundary?.kind, "deploymentActionComplete");
    assert.equal(activationAvailability.stable, true);
    assert.equal(activationAvailability.boundary?.kind, "activationBoundary");
    assert.deepEqual(blockedAvailability, {
      stable: false,
      boundary: null,
      reason: "A combat or animation transaction is still resolving."
    });
  });
});
