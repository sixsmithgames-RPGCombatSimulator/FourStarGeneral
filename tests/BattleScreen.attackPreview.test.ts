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
          facing: "N" as ScenarioUnit["facing"]
        }
      ];
    },
    getUnitCommandState() {
      return {
        suppressionState: "clear",
        suppressorCount: 0
      };
    },
    previewAttack(_attacker: Axial, _defender: Axial) {
      const result: AttackResult = {
        accuracy: 25.3575,
        shots: 6,
        damagePerHit: 0.231,
        expectedHits: 1.52145,
        expectedDamage: 0.35145495,
        expectedSuppression: 0.30429,
        effectiveAP: 11,
        facingArmor: 18,
        accuracyBreakdown: {
          baseRange: 18,
          experienceBonus: 3,
          commanderScalar: 1.05,
          baseWithCommander: 18.9,
          experienceWithCommander: 3.15,
          combinedAfterCommander: 22.05,
          terrainModifier: 0,
          terrainMultiplier: 1,
          afterTerrain: 25.3575,
          spottedMultiplier: 1,
          finalPreClamp: 25.3575,
          final: 25.3575
        },
        damageBreakdown: {
          baseTableValue: 2,
          experienceScalar: 1.1,
          afterExperience: 2.2,
          commanderScalar: 1.05,
          final: 0.231
        }
      };

      return {
        attacker: {
          type: "AT_Gun_50mm" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 1,
          ammo: 5,
          fuel: 0,
          entrench: 0,
          facing: "N" as ScenarioUnit["facing"]
        },
        defender: {
          type: "Heavy_Tank" as unknown as ScenarioUnit["type"],
          hex: { q: 2, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 35,
          entrench: 0,
          facing: "S" as ScenarioUnit["facing"]
        },
        result,
        commander: { accBonus: 5, dmgBonus: 5 },
        damageMultiplier: 1,
        suppressionMultiplier: 1,
        finalDamagePerHit: 0.231,
        finalExpectedDamage: 0.35145495,
        finalExpectedSuppression: 0.30429,
        expectedRetaliation: 0,
        retaliationPossible: false,
        retaliationNote: "No return fire expected."
      };
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
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
      "Pen x0.10 (AP 11 vs Armor 18, margin -7)"
    ];

    for (const snippet of requiredSnippets) {
      if (!previewText.includes(snippet)) {
        throw new Error(`Expected attack preview to include '${snippet}', received '${previewText}'.`);
      }
    }
  });
});
