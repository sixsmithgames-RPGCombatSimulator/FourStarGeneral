import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext } from "../src/core/campaignTypes";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { BATTLE_TEMPLATES, selectBattleTemplate } from "../src/game/campaign/battleTemplates";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { createMissionRulesController } from "../src/state/missionRules";

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
      const compatible = selectBattleTemplate(missionType, false, `central_${missionType}`, "central_channel");
      if (!compatible.campaignKeys.includes("central_channel")) {
        throw new Error(`${missionType} selected a template outside the Western Europe campaign.`);
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
      campaignPlayerRole?: string;
      campaignMissionType?: string;
      campaignBattleHexKey?: string;
      deploymentZones: Array<{ label: string; description?: string }>;
      size: { cols: number; rows: number };
      sides: { Bot: { units: Array<{ hex: [number, number]; entrench: number; experience: number }>; resources: number; goal: string } };
    };
    if (!raw.name.startsWith("Fortified Assault")) throw new Error(`Scenario not renamed: ${raw.name}`);
    if (!raw.campaignTemplateKey) throw new Error("Template key not recorded on generated scenario");
    if (raw.campaignPlayerRole !== "attacker" || raw.campaignMissionType !== "fortifiedAssault" || raw.campaignBattleHexKey !== "5,5") {
      throw new Error("Generated campaign battle lost its frozen engagement identity metadata.");
    }
    const zoneCopy = raw.deploymentZones.map((zone) => `${zone.label} ${zone.description ?? ""}`).join(" ");
    if (/Eighth Army|minefield|Tebessa|Argentan|Bastogne|Carentan/i.test(zoneCopy)) {
      throw new Error(`Generated deployment copy leaked its authored template identity: ${zoneCopy}`);
    }

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

    // Empty campaign opposition cannot be replaced by an unrelated authored garrison.
    let emptyPoolRejected = false;
    try {
      generateCampaignBattleScenario(buildContext({
        engagementId: "eng_empty_opposition",
        enemyForces: [],
        enemyForceValue: 0,
        forceRatio: Number.POSITIVE_INFINITY
      }));
    } catch (error) {
      emptyPoolRejected = error instanceof Error && error.message.includes("no committed opposing ground formation");
    }
    if (!emptyPoolRejected) throw new Error("Empty campaign opposition was replaced by a template garrison.");

    const meeting = generateCampaignBattleScenario(buildContext({ engagementId: "eng_meet", missionType: "meetingEngagement" }));
    const meetingUnits = (meeting as unknown as { sides: { Bot: { units: Array<{ entrench: number }> } } }).sides.Bot.units;
    if (!meetingUnits.every((u) => u.entrench === 0)) throw new Error("Meeting engagement should not entrench defenders");
  });
});

registerTest("CAMPAIGN_BATTLE_GENERATION_FAILS_CLOSED_WITHOUT_CAMPAIGN_IDENTITY", async ({ Given, When, Then }) => {
  let unknownCampaignRejected = false;
  let neutralDefenderRejected = false;

  await Given("a tactical request whose campaign key or opposing faction cannot be proven", () => {});

  await When("the campaign generator validates the request before selecting a playable map", () => {
    try {
      generateCampaignBattleScenario(buildContext(), {
        campaignId: "campaign-unknown",
        scenarioKey: "unknown_theater",
        revision: 1,
        currentSegment: 0,
        formations: {}
      });
    } catch (error) {
      unknownCampaignRejected = error instanceof Error && error.message.includes("no approved tactical template pool");
    }
    try {
      generateCampaignBattleScenario(buildContext({ defender: "Neutral" }));
    } catch (error) {
      neutralDefenderRejected = error instanceof Error && error.message.includes("two opposing campaign factions");
    }
  });

  await Then("no generic standalone scenario or substituted theater can launch", () => {
    if (!unknownCampaignRejected || !neutralDefenderRejected) {
      throw new Error("Campaign generation did not fail closed for untrusted campaign identity.");
    }
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
    if (!playerLabels.every((label) => label.startsWith("Friendly Defense Sector"))) {
      throw new Error(`Player received the wrong defensive zones: ${playerLabels.join(", ")}.`);
    }
    if (!botLabels.every((label) => label.startsWith("Opposing Attack Assembly Area"))) {
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
    if (!playerCopy.includes("Friendly Defense Sector") || /\b(German|Axis)\b/i.test(playerCopy)) {
      throw new Error(`Player defensive zone copy remained factionally stale: ${playerCopy}.`);
    }
    if (!botCopy.includes("Opposing Attack Assembly Area") || /\b(Allied|American|British|Eighth Army|U\.S\.)\b/i.test(botCopy)) {
      throw new Error(`Bot attack-zone copy remained factionally stale: ${botCopy}.`);
    }
  });
});

registerTest("CAMPAIGN_BATTLE_FREEZES_THEATER_COMPATIBLE_TEMPLATE_AND_TERMINAL_RULES", async ({ Given, When, Then }) => {
  let generated: ReturnType<typeof generateCampaignBattleScenario> | null = null;

  await Given("a Western Europe meeting engagement whose old hash pool included desert templates", async () => {
    for (let index = 0; index < 100; index += 1) {
      const selected = selectBattleTemplate("meetingEngagement", false, `western_meeting_${index}`, "central_channel");
      if (!selected.campaignKeys.includes("central_channel") || /el_alamein|kasserine/.test(selected.key)) {
        throw new Error(`Western Europe selected incompatible template ${selected.key}.`);
      }
    }
  });

  await When("the engagement freezes a compatible template and enters campaign mission rules", async () => {
    generated = generateCampaignBattleScenario(buildContext({
      engagementId: "eng_frozen_western_meeting",
      missionType: "meetingEngagement",
      templateKey: "meeting_two_bridges"
    }));
  });

  await Then("the same template, engagement-specific objectives, and a real terminal result survive", async () => {
    if (!generated) throw new Error("Campaign battle was not generated.");
    const raw = generated as unknown as { campaignTemplateKey: string; turnLimit: number; deploymentZones: Array<{ label: string; description: string }> };
    if (raw.campaignTemplateKey !== "meeting_two_bridges") {
      throw new Error(`Frozen template drifted to ${raw.campaignTemplateKey}.`);
    }
    if (raw.turnLimit !== 0) {
      throw new Error(`Campaign meeting engagement retained a fixed template deadline: ${raw.turnLimit}.`);
    }
    const normalized = normalizeScenarioSource(generated as unknown as RawScenarioInput, { turnLimit: 0 });
    const controller = createMissionRulesController("campaign", normalized);
    const initial = controller.getStatus();
    if (initial.objectives.length !== 2 || initial.objectives[0]?.label !== "Secure the engagement area") {
      throw new Error("Campaign tactical rules did not expose engagement-specific objectives.");
    }
    if (!initial.objectives[0]?.detail?.includes("No fixed tactical deadline")) {
      throw new Error(`Campaign objective still advertised a tactical deadline: ${initial.objectives[0]?.detail}`);
    }

    const authoredFriendlyControl = normalized.objectives.filter((objective) => objective.owner === "Player").length;
    if (!initial.objectives[0]?.detail?.includes(`Friendly control: ${authoredFriendlyControl}/${normalized.objectives.length}`)) {
      throw new Error(`Campaign objective control did not begin from authored ownership: ${initial.objectives[0]?.detail}`);
    }

    const capturableObjective = normalized.objectives.find((objective) => objective.owner === "Bot");
    if (!capturableObjective) throw new Error("Campaign scenario did not expose an opposing objective for control persistence testing.");
    const capturableKey = `${capturableObjective.hex.q},${capturableObjective.hex.r}`;
    const controlController = createMissionRulesController("campaign", normalized);
    const friendlyUnit = structuredClone(normalized.sides.Player.units[0] ?? normalized.sides.Bot.units[0]!);
    const captured = controlController.onTurnAdvanced({
      turnSummary: { turnNumber: 2 } as never,
      scenario: normalized,
      occupancy: new Map([[capturableKey, "Player"]]),
      playerUnits: [friendlyUnit],
      botUnits: normalized.sides.Bot.units,
      allyUnits: normalized.sides.Ally?.units
    });
    const capturedCount = authoredFriendlyControl + 1;
    if (!captured.objectives[0]?.detail?.includes(`Friendly control: ${capturedCount}/${normalized.objectives.length}`)) {
      throw new Error(`Campaign capture was not recorded: ${captured.objectives[0]?.detail}`);
    }
    const vacated = controlController.onTurnAdvanced({
      turnSummary: { turnNumber: 3 } as never,
      scenario: normalized,
      occupancy: new Map(),
      playerUnits: [friendlyUnit],
      botUnits: normalized.sides.Bot.units,
      allyUnits: normalized.sides.Ally?.units
    });
    if (!vacated.objectives[0]?.detail?.includes(`Friendly control: ${capturedCount}/${normalized.objectives.length}`)) {
      throw new Error(`A vacated campaign objective forgot its controlling side: ${vacated.objectives[0]?.detail}`);
    }
    const controlSnapshot = controlController.serializeState();
    const restoredControlController = createMissionRulesController("campaign", normalized);
    restoredControlController.hydrateState(controlSnapshot);
    if (!restoredControlController.getStatus().objectives[0]?.detail?.includes(`Friendly control: ${capturedCount}/${normalized.objectives.length}`)) {
      throw new Error("Campaign objective control did not survive tactical save hydration.");
    }
    const recaptured = restoredControlController.onTurnAdvanced({
      turnSummary: { turnNumber: 4 } as never,
      scenario: normalized,
      occupancy: new Map([[capturableKey, "Bot"]]),
      playerUnits: [friendlyUnit],
      botUnits: normalized.sides.Bot.units,
      allyUnits: normalized.sides.Ally?.units
    });
    if (!recaptured.objectives[0]?.detail?.includes(`Friendly control: ${authoredFriendlyControl}/${normalized.objectives.length}`)) {
      throw new Error(`Opposing recapture did not change persistent campaign control: ${recaptured.objectives[0]?.detail}`);
    }

    const ongoing = controller.onTurnAdvanced({
      turnSummary: { turnNumber: 30 } as never,
      scenario: normalized,
      occupancy: new Map(),
      playerUnits: [friendlyUnit],
      botUnits: normalized.sides.Bot.units,
      allyUnits: normalized.sides.Ally?.units
    });
    if (ongoing.outcome.state !== "inProgress") {
      throw new Error(`Campaign battle ended from elapsed turns instead of battlefield conditions: ${ongoing.outcome.state}.`);
    }

    const occupancy = new Map<string, "Player">();
    normalized.objectives?.forEach((objective) => occupancy.set(`${objective.hex.q},${objective.hex.r}`, "Player"));
    const terminal = controller.onTurnAdvanced({
      turnSummary: { turnNumber: 31 } as never,
      scenario: normalized,
      occupancy,
      playerUnits: [friendlyUnit],
      botUnits: normalized.sides.Bot.units,
      allyUnits: normalized.sides.Ally?.units
    });
    if (terminal.outcome.state !== "playerVictory" || terminal.objectives[0]?.state !== "completed") {
      throw new Error("Campaign tactical rules remained non-terminal after every engagement objective was secured.");
    }

    const defense = generateCampaignBattleScenario(buildContext({
      engagementId: "eng_unbounded_player_defense",
      missionType: "depotRaid",
      attacker: "Bot",
      defender: "Player",
      templateKey: "depot_bastogne",
      availableForces: [{ hexKey: "5,5", unitType: "Infantry_42", count: 2 }]
    }));
    const normalizedDefense = normalizeScenarioSource(defense as unknown as RawScenarioInput, { turnLimit: 0 });
    let defenseController = createMissionRulesController("campaign", normalizedDefense);
    const defenseFriendlyUnit = structuredClone(normalizedDefense.sides.Bot.units[0]!);
    const initialDefense = defenseController.getStatus();
    if (initialDefense.outcome.state !== "inProgress" || initialDefense.objectives[0]?.state !== "inProgress") {
      throw new Error("Campaign defense ended merely because authored positions began under friendly control.");
    }
    let defenseVictory = initialDefense;
    normalizedDefense.objectives.forEach((objective, index) => {
      const movedFriendlyUnit = { ...structuredClone(defenseFriendlyUnit), hex: structuredClone(objective.hex) };
      defenseVictory = defenseController.onTurnAdvanced({
        turnSummary: { turnNumber: 6 + index } as never,
        scenario: normalizedDefense,
        occupancy: new Map([[`${objective.hex.q},${objective.hex.r}`, "Player"]]),
        playerUnits: [movedFriendlyUnit],
        botUnits: normalizedDefense.sides.Bot.units,
        allyUnits: normalizedDefense.sides.Ally?.units
      });
      if (index < normalizedDefense.objectives.length - 1 && defenseVictory.outcome.state !== "inProgress") {
        throw new Error(`Campaign defense ended before its formation secured every objective (step ${index + 1}).`);
      }
      if (index === 1 && index < normalizedDefense.objectives.length - 1) {
        const restoredDefenseController = createMissionRulesController("campaign", normalizedDefense);
        restoredDefenseController.hydrateState(defenseController.serializeState());
        if (!restoredDefenseController.getStatus().objectives[0]?.detail?.includes("Secured positions: 2/")) {
          throw new Error("Sequential defender objective progress did not survive tactical save hydration.");
        }
        defenseController = restoredDefenseController;
      }
    });
    if (defenseVictory.outcome.state !== "playerVictory"
      || defenseVictory.objectives[0]?.state !== "completed"
      || defenseVictory.objectives[1]?.state !== "inProgress"
      || !defenseVictory.outcome.reason?.includes("secured every defended position")) {
      throw new Error("Campaign defense did not end naturally after one formation sequentially secured every defended objective.");
    }

    const forceCollapseController = createMissionRulesController("campaign", normalizedDefense);
    const partialFriendlyControl = new Map<string, "Player">();
    const firstDefenseObjective = normalizedDefense.objectives[0];
    if (firstDefenseObjective) {
      partialFriendlyControl.set(`${firstDefenseObjective.hex.q},${firstDefenseObjective.hex.r}`, "Player");
    }
    const supportTruck = {
      ...structuredClone(normalizedDefense.sides.Bot.units[0]!),
      type: "Supply_Truck"
    } as typeof normalizedDefense.sides.Bot.units[number];
    const forceCollapseVictory = forceCollapseController.onTurnAdvanced({
      turnSummary: { turnNumber: 7 } as never,
      scenario: normalizedDefense,
      occupancy: partialFriendlyControl,
      playerUnits: [defenseFriendlyUnit],
      botUnits: [supportTruck],
      allyUnits: normalizedDefense.sides.Ally?.units
    });
    if (forceCollapseVictory.outcome.state !== "playerVictory"
      || forceCollapseVictory.objectives[0]?.state !== "inProgress"
      || forceCollapseVictory.objectives[1]?.state !== "completed") {
      throw new Error("A surviving support convoy blocked force-collapse victory or completed the wrong objective.");
    }

    const defenseDefeatController = createMissionRulesController("campaign", normalizedDefense);
    const opposingControl = new Map<string, "Bot">();
    normalizedDefense.objectives.forEach((objective) => opposingControl.set(`${objective.hex.q},${objective.hex.r}`, "Bot"));
    const defenseDefeat = defenseDefeatController.onTurnAdvanced({
      turnSummary: { turnNumber: 35 } as never,
      scenario: normalizedDefense,
      occupancy: opposingControl,
      playerUnits: [defenseFriendlyUnit],
      botUnits: normalizedDefense.sides.Bot.units,
      allyUnits: normalizedDefense.sides.Ally?.units
    });
    if (defenseDefeat.outcome.state !== "playerDefeat") {
      throw new Error("Campaign defense did not end after opposing forces secured every defended objective.");
    }
  });
});
