import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { AirEngagementEvent, BotTurnSummary } from "../src/game/GameEngine";

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

registerTest("BATTLESCREEN_DEFENSIVE_AIR_EVENTS_LOG_PLAYER_REACTIONS", async ({ When, Then }) => {
  const published: Array<{ category: string; summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  (screen as any).publishActivityEvent = (event: { category: string; summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };
  (screen as any).announceBattleUpdate = () => {};
  (screen as any).toTitleCase = (value: string) => value.replace(/_/g, " ");

  const flakEvent: AirEngagementEvent = {
    type: "flak",
    location: { q: 12, r: -6 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
    interceptors: [{ faction: "Player", unitKey: "flak-1", unitType: "Flak_88", strength: 100, hex: { q: 11, r: -5 } }],
    escorts: [],
    flakDamage: 18,
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 82,
    bomberDestroyed: false
  };

  const interceptEvent: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 12, r: -6 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 82 },
    interceptors: [{ faction: "Player", unitKey: "cap-1", unitType: "Fighter", strength: 100 }],
    escorts: [{ faction: "Bot", unitKey: "escort-1", unitType: "Fighter", strength: 100 }],
    bomberStrengthBefore: 82,
    bomberStrengthAfter: 58,
    bomberDestroyed: false
  };

  await When("player flak and CAP react during enemy air operations", async () => {
    (screen as any).announceFlakEngagement(flakEvent);
    (screen as any).announceAirInterceptEngagement(interceptEvent);
  });

  await Then("both defensive air events should appear in the player activity log", async () => {
    if (published.length !== 2) {
      throw new Error(`Expected 2 defensive air log entries, received ${published.length}.`);
    }

    if (published[0]?.category !== "player" || !published[0].summary.includes("Flak battery engaged incoming Bomber")) {
      throw new Error(`Expected player flak activity entry, saw ${JSON.stringify(published[0])}.`);
    }

    if (published[1]?.category !== "player" || !published[1].summary.includes("Player air patrol intercepted enemy Bomber")) {
      throw new Error(`Expected player interception activity entry, saw ${JSON.stringify(published[1])}.`);
    }

    if (!published[1].summary.includes("Interception damage: 24%. Bomber strength now 58.")) {
      throw new Error(`Expected interception damage summary in activity log, saw ${published[1].summary}.`);
    }

    if ((published[1].details?.interceptionDamage as number | undefined) !== 24) {
      throw new Error(`Expected interception damage detail of 24, received ${String(published[1].details?.interceptionDamage)}.`);
    }

    if ((published[1].details?.bomberStrengthAfter as number | undefined) !== 58) {
      throw new Error(`Expected bomber strength-after detail of 58, received ${String(published[1].details?.bomberStrengthAfter)}.`);
    }
  });
});
