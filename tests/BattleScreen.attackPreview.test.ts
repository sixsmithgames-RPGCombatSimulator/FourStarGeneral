import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { AttackResult } from "../src/core/Combat";
import type { Axial, ScenarioUnit } from "../src/core/types";

registerTest("BATTLESCREEN_ATTACK_DIALOG_EXPLAINS_AT_GUN_RANGE_AND_PENETRATION_MATH", async ({ Given, When, Then }) => {
  const root = document.createElement("div");
  root.id = "battleScreen";
  root.innerHTML = `
    <div id="battleAttackConfirm" class="battle-dialog hidden" aria-hidden="true">
      <div class="battle-dialog__surface">
        <div class="attack-stance-selector">
          <label class="stance-label">Combat Stance:</label>
          <div class="stance-buttons">
            <button type="button" id="stanceAssault" class="stance-button" data-stance="assault">
              <span class="stance-heading">
                <span class="stance-name">Assault</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
            <button type="button" id="stanceSuppressive" class="stance-button" data-stance="suppressive">
              <span class="stance-heading">
                <span class="stance-name">Suppressive</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
          </div>
        </div>
        <div id="battleAttackConfirmBody"></div>
        <button type="button" id="battleAttackConfirmAccept">Attack</button>
        <button type="button" id="battleAttackConfirmCancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const fakeEngine = {
    getPlayerPlacementsSnapshot() {
      return [
        {
          type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 1,
          ammo: 5,
          fuel: 0,
          entrench: 0,
          facing: "NW" as ScenarioUnit["facing"]
        }
      ];
    },
    getUnitCommandState() {
      return {
        suppressionState: "clear",
        suppressorCount: 0
      };
    },
    getTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    },
    getHexStackMembers() {
      return [
        {
          unitId: "u_at_1",
          unit: {
            type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
            hex: { q: 0, r: 0 },
            strength: 100,
            experience: 1,
            ammo: 5,
            fuel: 0,
            entrench: 0,
            facing: "NW" as ScenarioUnit["facing"]
          },
          faction: "Player"
        }
      ];
    },
    previewAttack(_attacker: Axial, _defender: Axial) {
      const result: AttackResult = {
        accuracy: 22.38705,
        shots: 120,
        damagePerHit: 0.2163,
        expectedHits: 26.86446,
        expectedDamage: 5.810782698,
        expectedSuppression: 5.372892,
        effectiveAP: 10,
        facingArmor: 18,
        accuracyBreakdown: {
          baseRange: 18,
          commanderScalar: 1.05,
          afterCommander: 18.9,
          experienceScalar: 1.03,
          afterExperience: 19.467,
          terrainModifier: 0,
          terrainMultiplier: 1,
          afterTerrain: 22.38705,
          spottedMultiplier: 1,
          finalPreClamp: 22.38705,
          final: 22.38705
        },
        damageBreakdown: {
          baseTableValue: 2,
          experienceScalar: 1.03,
          afterExperience: 2.06,
          commanderScalar: 1.05,
          final: 0.2163
        }
      };

      return {
        attacker: {
          type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 1,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NW" as ScenarioUnit["facing"]
        },
        defender: {
          type: "Heavy_Tank" as unknown as ScenarioUnit["type"],
          hex: { q: 2, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 35,
          entrench: 0,
          facing: "SE" as ScenarioUnit["facing"]
        },
        result,
        commander: { accBonus: 5, dmgBonus: 5 },
        damageMultiplier: 1,
        suppressionMultiplier: 1,
        finalDamagePerHit: 0.2163,
        finalExpectedDamage: 5.810782698,
        finalExpectedSuppression: 5.372892,
        expectedRetaliation: 0,
        retaliationPossible: false,
        retaliationNote: "No return fire expected."
      };
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine,
    getIdlePlayerUnitKeys: () => [],
    getCurrentTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 }),
    getPrecombatMissionInfo: () => null
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;

  await Given("a battle screen with a valid AT-gun attack preview", async () => {
    screen = new BattleScreen(
      {} as never,
      fakeBattleState,
      { getActivePopup: () => null, closePopup: () => {} } as never,
      null,
      null,
      null,
      null,
      null,
      null
    );
    (screen as any).cacheElements();
  });

  await When("the commander opens the attack dialog", async () => {
    (screen as any).promptAttackConfirmation({ q: 0, r: 0 }, { q: 2, r: 0 });
  });

  await Then("the breakdown exposes range-table accuracy, hard attack, and penetration math", async () => {
    const previewText = document.getElementById("battleAttackConfirmBody")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const requiredSnippets = [
      "Weapon Inputs:",
      "Accuracy base 55%",
      "Hard attack 50",
      "AP 10",
      "Range table 18.0%",
      "Unit accuracy x1.00 (55/55)",
      "x Signature 1.15 (large)",
      "Hard attack x1.00 (50/50)",
      "Pen x0.10 (AP 10 vs Armor 18, margin -8)"
    ];

    for (const snippet of requiredSnippets) {
      if (!previewText.includes(snippet)) {
        throw new Error(`Expected attack preview to include '${snippet}', received '${previewText}'.`);
      }
    }
  });
});

registerTest("BATTLESCREEN_ATTACK_DETAILS_CAP_DAMAGE_DISPLAY_AT_100_PERCENT", async ({ Given, When, Then }) => {
  let root: HTMLDivElement;
  const overkillEngine = {
    getPlayerPlacementsSnapshot: () => [],
    getUnitCommandState: () => null,
    getTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const),
    getHexStackMembers: () => []
  };
  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => overkillEngine,
    tryGetGameEngine: () => overkillEngine,
    getIdlePlayerUnitKeys: () => [],
    getCurrentTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 }),
    getPrecombatMissionInfo: () => null
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;
  let sections: Array<{ title: string; entries: Array<{ label: string; value: string }> }> = [];

  await Given("a battle screen with an overkill preview and resolution", async () => {
    root = document.createElement("div");
    root.id = "battleScreen";
    document.body.appendChild(root);
    screen = new BattleScreen(
      {} as never,
      fakeBattleState,
      { getActivePopup: () => null, closePopup: () => {} } as never,
      null,
      null,
      null,
      null,
      null,
      null
    );

    const preview = {
      attacker: { type: "Flak_88", strength: 100 },
      defender: { type: "Assault_Gun", strength: 94 },
      result: {
        accuracy: 37,
        shots: 240,
        expectedHits: 88.1,
        effectiveAP: 19,
        facingArmor: 9
      },
      finalExpectedDamage: 468.3,
      finalDamagePerHit: 5.31
    } as unknown as import("../src/game/GameEngine").CombatPreview;

    const resolution = {
      defenderRemainingStrength: 0,
      attackerRemainingStrength: 100,
      retaliationOccurred: false
    } as unknown as import("../src/game/GameEngine").AttackResolution;

    sections = (screen as unknown as {
      buildPlayerAttackDetails: (
        resolution: import("../src/game/GameEngine").AttackResolution,
        preview: import("../src/game/GameEngine").CombatPreview | null,
        meta: { attackerHex: string; defenderHex: string; inflictedDamage: number; retaliationDamage: number }
      ) => Array<{ title: string; entries: Array<{ label: string; value: string }> }>;
    }).buildPlayerAttackDetails(resolution, preview, {
      attackerHex: "10,2",
      defenderHex: "10,4",
      inflictedDamage: 468,
      retaliationDamage: 0
    });
  });

  await When("attack details are composed for the activity panel", async () => {
    // Assertions live in Then.
  });

  await Then("expected and final damage display values stop at 100", async () => {
    const previewSection = sections.find((section) => section.title === "Preview Odds");
    const outcomeSection = sections.find((section) => section.title === "Outcome");
    const expectedDamage = previewSection?.entries.find((entry) => entry.label === "Projected Readiness Loss")?.value;
    const dealtDamage = outcomeSection?.entries.find((entry) => entry.label === "Damage Dealt")?.value;

    if (expectedDamage !== "100.0%") {
      throw new Error(`Expected capped preview damage of 100.0%, received '${expectedDamage ?? "<missing>"}'.`);
    }
    if (dealtDamage !== "100") {
      throw new Error(`Expected capped dealt damage of 100, received '${dealtDamage ?? "<missing>"}'.`);
    }

    root.remove();
  });
});
