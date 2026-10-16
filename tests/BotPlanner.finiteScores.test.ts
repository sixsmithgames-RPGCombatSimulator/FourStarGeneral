import assert from "node:assert/strict";
import type { Axial } from "../src/core/Hex.js";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes.js";
import { GameEngine } from "../src/game/GameEngine.js";
import {
  planHeuristicBotTurn,
  type BotDifficulty,
  type BotPlannerInput,
  type PlannerUnitSnapshot
} from "../src/game/bot/BotPlanner.js";
import { registerTest } from "./harness.js";
import { makeConfig, makeLegacyState, makeScenario } from "./TacticalSaveCompleteness.test.js";

const infantryDefinition = unitTypesData.Infantry_42;

function createInfantrySnapshot(unitId: string, hex: Axial): PlannerUnitSnapshot {
  return {
    unit: {
      type: "Infantry_42",
      unitId,
      hex: structuredClone(hex),
      strength: 100,
      experience: 0,
      ammo: infantryDefinition.ammo,
      fuel: infantryDefinition.fuel,
      entrench: 0,
      facing: "SE"
    },
    definition: infantryDefinition
  };
}

function createSingleAttackInput(
  expectedDamage: number,
  expectedRetaliation: number,
  difficulty: BotDifficulty
): BotPlannerInput {
  const bot = createInfantrySnapshot("finite-score-bot", { q: 0, r: 0 });
  const player = createInfantrySnapshot("finite-score-player", { q: 1, r: 0 });
  return {
    botUnits: [bot],
    playerUnits: [player],
    objectives: [],
    occupancy: new Map([
      ["0,0", "bot"],
      ["1,0", "player"]
    ]),
    map: {
      inBounds: (hex) => hex.q === 0 && hex.r === 0,
      terrainAt: () => null,
      movementCost: () => 1
    },
    losAllows: () => true,
    movementAllowance: () => 0,
    attackEstimator: () => ({ expectedDamage, expectedRetaliation }),
    difficulty
  };
}

interface PlannerEngineHarness {
  readonly botPlacements: unknown;
  readonly playerPlacements: unknown;
  readonly allyPlacements: unknown;
  readonly botDifficulty: BotDifficulty;
  buildPlannerInputFor(
    acting: unknown,
    opposing: unknown,
    difficulty: BotDifficulty,
    opposingExtras?: unknown[]
  ): BotPlannerInput;
}

registerTest("BOT_PLANNER_SHIPPED_INFANTRY_SCORE_AND_EXECUTION_STAY_FINITE", async ({ Given, When, Then }) => {
  const engine = GameEngine.fromSerialized(makeConfig(makeScenario()), makeLegacyState());
  const harness = engine as unknown as PlannerEngineHarness;
  const input = harness.buildPlannerInputFor(
    harness.botPlacements,
    harness.playerPlacements,
    harness.botDifficulty,
    [harness.allyPlacements]
  );
  let plans = planHeuristicBotTurn(input);
  const executionLogs: string[] = [];
  let executedAttackCount = 0;

  await Given("the shipped infantry definition without a legacy top-level AP value", async () => {
    assert.equal(infantryDefinition.ap, undefined);
  });

  await When("the planner scores the observed save fixture and the engine executes that Bot turn", async () => {
    plans = planHeuristicBotTurn(input);
    const originalLog = console.log;
    console.log = (...parts: unknown[]) => { executionLogs.push(parts.map(String).join(" ")); };
    try {
      engine.endTurn();
      executedAttackCount = engine.consumeBotTurnSummary()?.attacks.length ?? 0;
    } finally {
      console.log = originalLog;
    }
  });

  await Then("every returned and logged plan score is finite and the infantry attack still executes", async () => {
    assert.ok(plans.length > 0, "The source arithmetic fix must retain the infantry plan instead of relying on quarantine.");
    assert.ok(plans.every((plan) => Number.isFinite(plan.score)));
    assert.equal(executedAttackCount, 1);
    const planLogs = executionLogs.filter((line) => line.startsWith("[Bot AI] Plan for "));
    assert.ok(planLogs.length > 0, "Expected the executed Bot plan to reach the diagnostic log.");
    assert.equal(executionLogs.some((line) => /score: (?:NaN|[+-]?Infinity)/.test(line)), false);
    planLogs.forEach((line) => {
      const match = /score: ([^,)]+)/.exec(line);
      assert.ok(match && Number.isFinite(Number(match[1])), `Expected a finite logged plan score, received '${line}'.`);
    });
  });
});

registerTest("BOT_PLANNER_QUARANTINES_NON_FINITE_SCORES_WITHOUT_DROPPING_NEGATIVE_SCORES", async ({ Given, When, Then }) => {
  let invalidPlans: ReturnType<typeof planHeuristicBotTurn>[] = [];
  let negativePlans: ReturnType<typeof planHeuristicBotTurn> = [];

  await Given("malformed attack estimates and a separate legitimate unfavorable attack estimate", async () => {});

  await When("the plans cross the public planner boundary", async () => {
    invalidPlans = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((score) =>
      planHeuristicBotTurn(createSingleAttackInput(score, 0, "Normal"))
    );
    negativePlans = planHeuristicBotTurn(createSingleAttackInput(0, 100, "Easy"));
  });

  await Then("non-finite candidates are rejected before sorting while finite negative scores remain valid", async () => {
    invalidPlans.forEach((plans) => assert.deepEqual(plans, []));
    assert.equal(negativePlans.length, 1);
    assert.ok(Number.isFinite(negativePlans[0].score));
    assert.ok(negativePlans[0].score < 0);
  });
});

registerTest("BOT_PLANNER_SHIPPED_FORMATIONS_ADVANCE_AGAINST_ARMOR_AT_EVERY_DIFFICULTY", async ({ Given, When, Then }) => {
  const formations = Object.entries(unitTypesData).filter(([, definition]) =>
    definition.moveType !== "air"
    && definition.class !== "artillery"
    && definition.class !== "recon"
    && definition.combat.role !== "support"
    && definition.hardAttack > 0
  );
  const armor = Object.entries(unitTypesData).find(([, definition]) => definition.class === "tank");
  assert.ok(armor, "The shipped roster must contain armor for the challenge fixture.");
  const plans: Array<{ type: string; difficulty: BotDifficulty; actions: ReturnType<typeof planHeuristicBotTurn> }> = [];

  await Given("shipped formations whose canonical weapon model does not require legacy top-level AP", async () => {
    assert.ok(formations.length >= 5, "Exercise the real combat roster, not only a synthetic infantry definition.");
    assert.ok(formations.some(([, definition]) => definition.ap === undefined));
  });

  await When("each difficulty sees known enemy armor beyond this turn's firing range in an open lane", async () => {
    for (const difficulty of ["Easy", "Normal", "Hard"] as const) {
      for (const [type, definition] of formations) {
        const bot = createInfantrySnapshot(`pressure-${type}`, { q: 0, r: 0 });
        const player = createInfantrySnapshot("known-enemy-armor", { q: 30, r: 0 });
        const input: BotPlannerInput = {
          ...createSingleAttackInput(0, 0, difficulty),
          botUnits: [{ unit: { ...bot.unit, type: type as typeof bot.unit.type }, definition }],
          playerUnits: [{ unit: { ...player.unit, type: armor[0] as typeof player.unit.type }, definition: armor[1] }],
          occupancy: new Map([["0,0", "bot"], ["30,0", "player"]]),
          map: {
            inBounds: (hex) => hex.r === 0 && hex.q >= 0 && hex.q <= 30,
            terrainAt: () => null,
            movementCost: () => 1
          },
          movementAllowance: () => 2,
          attackEstimator: () => null
        };
        plans.push({ type, difficulty, actions: planHeuristicBotTurn(input) });
      }
    }
  });

  await Then("every formation retains a finite legal pressure plan instead of silently disappearing", async () => {
    for (const { type, difficulty, actions } of plans) {
      const label = `${difficulty} ${type}`;
      assert.equal(actions.length, 1, `${label} lost its plan.`);
      const [action] = actions;
      assert.ok(Number.isFinite(action.score), `${label} produced a non-finite score.`);
      assert.ok(action.destination.q > 0 && action.destination.q <= 2, `${label} should advance within its two-point budget.`);
      assert.equal(action.attackTarget, null, `${label} cannot shoot a target thirty hexes away.`);
    }
  });
});
