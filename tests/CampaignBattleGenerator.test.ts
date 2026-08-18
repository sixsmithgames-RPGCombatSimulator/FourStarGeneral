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

registerTest("CAMPAIGN_BATTLE_PLAYER_DEFENSE_REORIENTS_THE_TACTICAL_MAP", async ({ Given, When, Then }) => {
  const context = buildContext({
    engagementId: "eng_player_defense",
    attacker: "Bot",
    defender: "Player",
    availableForces: [
      { hexKey: "4,5", unitType: "Panzer_IV", count: 2 },
      { hexKey: "4,5", unitType: "Infantry_42", count: 2 }
    ],
    allocationCaps: { tank: 2, infantry: 2 },
    enemyForces: [{ hexKey: "5,5", unitType: "Infantry_42", count: 2 }],
    playerForceValue: 400,
    enemyForceValue: 200,
    forceRatio: 2
  });
  let scenario: ReturnType<typeof generateCampaignBattleScenario> | null = null;

  await Given("a committed campaign engagement where Bot owns the initiative and Player owns the defended hex", () => {});
  await When("the campaign generator reuses an authored assault map", () => {
    scenario = generateCampaignBattleScenario(context);
  });
  await Then("deployment zones, objectives, HQ orientation, doctrine, and Bot roster all face the Player defense", () => {
    if (!scenario) throw new Error("Defensive generator returned no scenario.");
    const raw = scenario as unknown as {
      name: string;
      deploymentZones: Array<{ faction: string }>;
      objectives: Array<{ owner: string }>;
      sides: {
        Player: { units: unknown[]; goal?: string };
        Bot: { units: Array<{ entrench: number }>; goal?: string; resources?: number };
      };
    };
    if (!raw.name.includes("Defense")
      || raw.sides.Player.units.length !== 0
      || raw.sides.Bot.units.length !== 4
      || raw.sides.Bot.units.some((unit) => unit.entrench !== 0)
      || !raw.sides.Player.goal?.includes("Hold")
      || !raw.sides.Bot.goal?.match(/Breach|Break|Capture|Overrun|Seize/)) {
      throw new Error("Generated scenario did not establish the Player-defense tactical orientation.");
    }
    const playerZones = raw.deploymentZones.filter((zone) => zone.faction === "Player").length;
    const botZones = raw.deploymentZones.filter((zone) => zone.faction === "Bot").length;
    if (playerZones === 0 || botZones === 0 || !raw.objectives.some((objective) => objective.owner === "Player")) {
      throw new Error("Defensive deployment or objective ownership was not inverted.");
    }
    const expectedBotResources = Math.max(300, Math.min(1500, Math.round(context.playerForceValue * 0.6)));
    if (raw.sides.Bot.resources !== expectedBotResources) {
      throw new Error("Bot attacker resources did not derive from the campaign attacker force value.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_PLAYER_DEFENSE_PRESERVES_AUTHORED_DEFENSIVE_GEOMETRY", async ({ Given, When, Then }) => {
  let engagementId = "";
  let scenario: ReturnType<typeof generateCampaignBattleScenario> | null = null;

  await Given("a depot defense that deterministically selects the authored Bastogne defensive map", async () => {
    for (let index = 0; index < 500; index += 1) {
      const candidate = `eng_bastogne_defense_${index}`;
      if (selectBattleTemplate("depotRaid", false, candidate).key === "depot_bastogne") {
        engagementId = candidate;
        break;
      }
    }
    if (!engagementId) throw new Error("Could not select the Bastogne campaign template deterministically.");
  });

  await When("the Bot attacks Player-held depot ground", async () => {
    scenario = generateCampaignBattleScenario(buildContext({
      engagementId,
      missionType: "depotRaid",
      attacker: "Bot",
      defender: "Player",
      availableForces: [{ hexKey: "8,0", unitType: "Panzer_IV", count: 2 }],
      allocationCaps: { tank: 2 },
      enemyForces: [{ hexKey: "13,10", unitType: "Infantry_42", count: 2 }],
      playerForceValue: 200,
      enemyForceValue: 200,
      forceRatio: 1
    }));
  });

  await Then("Player keeps the Bastogne perimeter while Bot keeps the German encirclement approaches", async () => {
    if (!scenario) throw new Error("Defensive Bastogne scenario was not generated.");
    const raw = scenario as unknown as {
      campaignTemplateKey: string;
      campaignTemplatePlayerRole: string;
      deploymentZones: Array<{ faction: string; label: string; description?: string }>;
      objectives: Array<{ owner: string }>;
    };
    const playerLabels = raw.deploymentZones.filter((zone) => zone.faction === "Player").map((zone) => zone.label);
    const botLabels = raw.deploymentZones.filter((zone) => zone.faction === "Bot").map((zone) => zone.label);
    if (raw.campaignTemplateKey !== "depot_bastogne" || raw.campaignTemplatePlayerRole !== "defender") {
      throw new Error("Generated defense did not retain its authored defensive-orientation metadata.");
    }
    if (!playerLabels.includes("Bastogne Core") || playerLabels.some((label) => label.includes("Encirclement"))) {
      throw new Error(`Player received the wrong defensive zones: ${playerLabels.join(", ")}.`);
    }
    if (!botLabels.includes("North Encirclement") || !botLabels.includes("East Encirclement")) {
      throw new Error(`Bot lost the authored attack approaches: ${botLabels.join(", ")}.`);
    }
    if (raw.objectives.some((objective) => objective.owner !== "Player")) {
      throw new Error("Bastogne defense objectives were inverted away from Player ownership.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_INVERTED_DEFENSE_USES_PLAYER_FACING_ZONE_COPY", async ({ Given, When, Then }) => {
  let engagementId = "";
  let scenario: ReturnType<typeof generateCampaignBattleScenario> | null = null;

  await Given("a depot defense that selects the attack-oriented Carentan map", async () => {
    for (let index = 0; index < 500; index += 1) {
      const candidate = `eng_carentan_defense_${index}`;
      if (selectBattleTemplate("depotRaid", false, candidate).key === "raid_carentan") {
        engagementId = candidate;
        break;
      }
    }
    if (!engagementId) throw new Error("Could not select the Carentan campaign template deterministically.");
  });

  await When("the authored attacker and defender sides are inverted for a Player defense", async () => {
    scenario = generateCampaignBattleScenario(buildContext({
      engagementId,
      missionType: "depotRaid",
      attacker: "Bot",
      defender: "Player",
      availableForces: [{ hexKey: "4,5", unitType: "Infantry_42", count: 2 }],
      allocationCaps: { infantry: 2 },
      enemyForces: [{ hexKey: "5,5", unitType: "Panzer_IV", count: 2 }],
      playerForceValue: 200,
      enemyForceValue: 200,
      forceRatio: 1
    }));
  });

  await Then("zone labels describe friendly defense and enemy attack without stale historical faction copy", async () => {
    if (!scenario) throw new Error("Defensive Carentan scenario was not generated.");
    const zones = (scenario as unknown as {
      deploymentZones: Array<{ faction: string; label: string; description: string }>;
    }).deploymentZones;
    const playerCopy = zones.filter((zone) => zone.faction === "Player").map((zone) => `${zone.label} ${zone.description}`).join(" ");
    const botCopy = zones.filter((zone) => zone.faction === "Bot").map((zone) => `${zone.label} ${zone.description}`).join(" ");
    if (!playerCopy.includes("Friendly defensive deployment area") || /\b(German|Axis)\b/i.test(playerCopy)) {
      throw new Error(`Player defensive zone copy remained factionally stale: ${playerCopy}.`);
    }
    if (!botCopy.includes("Enemy attack assembly area") || /\b(Allied|American|British|Eighth Army|U\.S\.)\b/i.test(botCopy)) {
      throw new Error(`Bot attack-zone copy remained factionally stale: ${botCopy}.`);
    }
  });
});
