import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { BotTurnSummary } from "../src/game/GameEngine";

registerTest("BATTLESCREEN_ENEMY_ACTIVITY_LOG_SHOWS_COUNTERFIRE_DAMAGE", async ({ When, Then }) => {
  const published: Array<{ summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  (screen as any).publishActivityEvent = (event: { summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };

  const botSummary: BotTurnSummary = {
    moves: [],
    attacks: [
      {
        attackerType: "Panzer_IV",
        defenderType: "Heavy_Tank",
        from: { q: 10, r: 9 },
        target: { q: 12, r: 7 },
        inflictedDamage: 14,
        defenderDestroyed: false,
        retaliation: {
          damage: 6,
          terrainDefense: 2,
          accuracyMod: -10,
          attackerStrengthAfter: 52
        }
      }
    ],
    supplyReport: null
  };

  await When("enemy attacks are mirrored into the activity log", async () => {
    (screen as any).logBotTurnActivity(botSummary);
  });

  await Then("the attack entry should include the retaliation damage against the enemy attacker", async () => {
    if (published.length !== 1) {
      throw new Error(`Expected 1 activity entry, received ${published.length}.`);
    }

    const [entry] = published;
    if (!entry.summary.includes("Counterfire dealt 6 damage; attacker strength now 52.")) {
      throw new Error(`Expected counterfire summary in activity log, received: ${entry.summary}`);
    }

    if ((entry.details?.retaliationDamage as number | undefined) !== 6) {
      throw new Error(`Expected retaliation damage detail of 6, received ${String(entry.details?.retaliationDamage)}.`);
    }

    if ((entry.details?.attackerStrengthAfter as number | undefined) !== 52) {
      throw new Error(`Expected attacker strength detail of 52, received ${String(entry.details?.attackerStrengthAfter)}.`);
    }
  });
});
