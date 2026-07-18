import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext } from "../src/core/campaignTypes";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { BATTLE_TEMPLATES, selectBattleTemplate } from "../src/game/campaign/battleTemplates";

function buildContext(overrides: Partial<CampaignEngagementContext> = {}): CampaignEngagementContext {
  return {
    engagementId: "eng_gen_test",
    battleHexKey: "5,5",
    attacker: "Player",
    defender: "Bot",
    missionType: "fortifiedAssault",
    amphibious: false,
    coastal: false,
    availableForces: [],
    allocationCaps: {},
    enemyForces: [
      { hexKey: "5,5", unitType: "Infantry_42", count: 4 },
      { hexKey: "5,5", unitType: "Infantry_Elite", count: 1 },
      { hexKey: "6,5", unitType: "Panzer_IV", count: 2 },
      { hexKey: "6,5", unitType: "Artillery_105mm", count: 1 },
      { hexKey: "6,5", unitType: "Fighter", count: 3 },
      { hexKey: "6,5", unitType: "Transport_Ship", count: 2 }
    ],
    airSorties: 0,
    rpReserve: 150,
    playerForceValue: 500,
    enemyForceValue: 900,
    forceRatio: 0.55,
    templateKey: null,
    frontKey: null,
    objectiveKey: null,
    ...overrides
  };
}

registerTest("CAMPAIGN_BATTLE_TEMPLATE_SELECTION", async ({ Given, When, Then }) => {
  await Given("the seed template registry", async () => {
    const missionTypes = ["fortifiedAssault", "lineAssault", "portAssault", "airfieldRaid", "depotRaid", "meetingEngagement"] as const;
    for (const missionType of missionTypes) {
      if (!BATTLE_TEMPLATES.some((entry) => entry.missionTypes.includes(missionType))) {
        throw new Error(`No template covers mission type ${missionType}`);
      }
    }
  });

  let coastalPick = "";
  await When("a coastal fortified assault selects a template twice", async () => {
    const first = selectBattleTemplate("fortifiedAssault", true, "eng_1");
    const second = selectBattleTemplate("fortifiedAssault", true, "eng_1");
    if (first.key !== second.key) throw new Error("Selection is not deterministic per engagement id");
    coastalPick = first.key;
    if (first.terrain !== "coastal") throw new Error(`Coastal battle picked inland template ${first.key}`);
    if (!first.missionTypes.includes("fortifiedAssault")) throw new Error("Selected template does not serve the mission type");
  });

  await Then("the selection honors mission type and terrain preference", async () => {
    if (!coastalPick) throw new Error("No template selected");
  });
});

registerTest("CAMPAIGN_BATTLE_BOT_ROSTER_GENERATION", async ({ Given, When, Then }) => {
  const context = buildContext();
  let scenario: ReturnType<typeof generateCampaignBattleScenario> | null = null;

  await Given("an engagement context with a mixed enemy pool", async () => {
    // 4 + 1 infantry, 2 tanks, 1 artillery = 8 ground units; fighters and ships must not spawn.
  });

  await When("the tactical scenario is generated", async () => {
    scenario = generateCampaignBattleScenario(context);
  });

  await Then("the Bot roster mirrors the pool with mission-type entrenchment and no stacking", async () => {
    if (!scenario) throw new Error("Generator returned nothing");
    const raw = scenario as unknown as {
      name: string;
      campaignTemplateKey?: string;
      size: { cols: number; rows: number };
      sides: { Bot: { units: Array<{ hex: [number, number]; entrench: number; experience: number }>; resources: number; goal: string } };
    };
    if (!raw.name.startsWith("Fortified Assault")) throw new Error(`Scenario not renamed: ${raw.name}`);
    if (!raw.campaignTemplateKey) throw new Error("Template key not recorded on generated scenario");

    const units = raw.sides.Bot.units;
    if (units.length !== 8) throw new Error(`Expected 8 ground units, got ${units.length}`);
    if (!units.every((u) => u.entrench === 3)) throw new Error("Fortified assault should entrench defenders at 3");
    const hexes = new Set(units.map((u) => u.hex.join(",")));
    if (hexes.size !== units.length) throw new Error("Generated units stacked on the same hex");
    const inBounds = units.every(
      (u) => u.hex[0] >= 0 && u.hex[1] >= 0 && u.hex[0] < raw.size.cols && u.hex[1] < raw.size.rows
    );
    if (!inBounds) throw new Error("Generated unit placed out of bounds");
    if (!units.some((u) => u.experience > 0)) throw new Error("Elite formation lost its veterancy bonus");

    const expectedResources = Math.max(300, Math.min(1500, Math.round(context.enemyForceValue * 0.6)));
    if (raw.sides.Bot.resources !== expectedResources) {
      throw new Error(`Bot resources ${raw.sides.Bot.resources} != ${expectedResources}`);
    }

    // Empty pool keeps the authored garrison; meeting engagements start exposed.
    const neutral = generateCampaignBattleScenario(buildContext({ engagementId: "eng_neutral", enemyForces: [], enemyForceValue: 0, forceRatio: Number.POSITIVE_INFINITY }));
    const neutralUnits = (neutral as unknown as { sides: { Bot: { units: unknown[] } } }).sides.Bot.units;
    if (neutralUnits.length === 0) throw new Error("Empty pool should keep the template garrison");

    const meeting = generateCampaignBattleScenario(buildContext({ engagementId: "eng_meet", missionType: "meetingEngagement" }));
    const meetingUnits = (meeting as unknown as { sides: { Bot: { units: Array<{ entrench: number }> } } }).sides.Bot.units;
    if (!meetingUnits.every((u) => u.entrench === 0)) throw new Error("Meeting engagement should not entrench defenders");
  });
});
