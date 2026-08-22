/** Certifies that the shipped campaign opens with real, resolvable opposing-control contacts. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CampaignState } from "../src/state/CampaignState";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";

function buildShippedScenario(): CampaignScenarioData {
  return structuredClone(campaignScenarioData) as CampaignScenarioData;
}

registerTest("CAMPAIGN_SHIPPED_OPENING_GEOGRAPHY_MATCHES_ITS_BRIEF", async ({ Given, When, Then }) => {
  const scenario = buildShippedScenario();
  let channelRole = "";

  await Given("the shipped campaign at its first player-visible command frame", () => {
    const channelTile = scenario.tiles.find((tile) => tile.hex.q === 20 && tile.hex.r === 18);
    if (!channelTile) throw new Error("The shipped campaign is missing its Channel assault-group marker.");
    channelRole = scenario.tilePalette[channelTile.tile]?.role ?? "";
  });

  await When("the authored water marker, shore lodgment, objective, and phase premise are reconciled", () => {});

  await Then("the Channel contains a task force while the established beachhead is held on the French shore", () => {
    const channelTile = scenario.tiles.find((tile) => tile.hex.q === 20 && tile.hex.r === 18);
    const beachheadTile = scenario.tiles.find((tile) => tile.hex.q === 27 && tile.hex.r === 24);
    const beachhead = scenario.objectives.find((objective) => objective.key === "secure_beachhead");
    const beachheadPhase = scenario.campaignArc?.phases.find((phase) => phase.key === "beachhead");
    const beachheadForces = beachheadTile?.forces?.filter((group) => group.label === "Beachhead Reserve") ?? [];
    if (channelRole !== "taskForce"
      || channelTile?.forces?.length
      || scenario.tilePalette[channelTile?.tile ?? ""]?.spriteKey !== "taskForce"
      || channelTile?.rotation !== 60
      || !scenario.tilePalette[channelTile?.tile ?? ""]?.notes?.includes("on station")) {
      throw new Error("The English Channel still contains a shore installation or projected ground force.");
    }
    if (scenario.tilePalette[beachheadTile?.tile ?? ""]?.role !== "fortificationLight"
      || beachheadForces.length !== 1
      || beachheadForces[0].unitType !== "Infantry_42"
      || beachheadForces[0].count !== 2) {
      throw new Error("The established shore lodgment does not contain its persistent beachhead reserve.");
    }
    if (!beachhead
      || beachhead.label !== "Hold the Beachhead"
      || beachhead.hex.q !== 27
      || beachhead.hex.r !== 24
      || !beachhead.description.includes("established lodgment")) {
      throw new Error("The first objective still describes a landing that has already happened or targets water.");
    }
    if (!scenario.description.includes("initial landings have secured")
      || beachheadPhase?.label !== "Beachhead Consolidation"
      || !beachheadPhase.description.includes("established lodgment")
      || scenario.historicalCalendar?.startDateIso !== "1944-06-07"
      || scenario.historicalCalendar.operationDayOffset !== 1) {
      throw new Error("The opening brief does not explain why Allied formations already occupy the French shore.");
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_CLOCK_ANCHORS_THE_POST_DDAY_OPENING", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  let opening = "";
  let nextDay = "";

  await Given("the shipped beachhead-consolidation campaign", () => {
    state.setScenario(buildShippedScenario());
  });

  await When("the opening and following-day command times are rendered", () => {
    opening = state.getCurrentTimeDisplay();
    nextDay = state.segmentToTimeDisplay(8);
  });

  await Then("the commander sees the exact date and D-day-relative day rather than an ambiguous Day 1", () => {
    if (opening !== "D+1 · 7 June 1944, 00:00–03:00"
      || nextDay !== "D+2 · 8 June 1944, 00:00–03:00") {
      throw new Error(`Historical campaign clock is ambiguous: '${opening}' / '${nextDay}'.`);
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_FRONTS_SURVIVE_THE_FIRST_SEGMENT", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  let advanced: ReturnType<CampaignState["advanceCampaign"]>;

  await Given("the unmodified shipped campaign with two exact opposing-control contacts", () => {
    state.setScenario(buildShippedScenario());
  });

  await When("one ordinary three-hour campaign segment resolves", () => {
    advanced = state.advanceCampaign({ mode: "segment" });
  });

  await Then("the Normandy attack and Eastern defense remain authoritative playable fronts", () => {
    if (!advanced.ok) throw new Error(advanced.error.message);
    const fronts = advanced.state.compatibility.initialFronts;
    const normandy = fronts.find((front) => front.key === "normandy_coast");
    const eastern = fronts.find((front) => front.key === "eastern_flank");
    if (normandy?.initiative !== "Player"
      || normandy.edges?.[0]?.friendlyHexKey !== "27,37"
      || normandy.edges[0].opposingHexKey !== "28,38"
      || eastern?.initiative !== "Bot"
      || eastern.edges?.[0]?.friendlyHexKey !== "30,40"
      || eastern.edges[0].opposingHexKey !== "29,39") {
      throw new Error(`First segment lost or changed the shipped fronts: ${fronts.map((front) => front.key).join(", ")}.`);
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_FIRST_ATTACK_FREEZES_REAL_TARGET_AND_FORCES", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  const engagementId = "shipped-first-port-attack";
  let prepared: ReturnType<CampaignState["prepareCampaignFrontEngagement"]>;

  await Given("the shipped Normandy front before any campaign time advances", () => {
    state.setScenario(buildShippedScenario());
  });

  await When("CampaignState prepares and commits the first Player attack", () => {
    prepared = state.prepareCampaignFrontEngagement({
      engagementId,
      frontKey: "normandy_coast",
      attacker: "Player"
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    state.setPendingEngagements([prepared.engagement]);
    state.setActiveEngagementId(engagementId);
  });

  await Then("a real Bot port, objective, formations, package, and tactical roster remain linked", () => {
    if (!prepared.ok) throw new Error(prepared.reason);
    const context = prepared.engagement.context;
    if (context.battleHexKey !== "28,38" || context.defender !== "Bot"
      || context.missionType !== "portAssault" || context.objectiveKey !== "capture_port"
      || context.availableForces.flatMap((group) => group.formationIds ?? []).length === 0
      || context.enemyForces.flatMap((group) => group.formationIds ?? []).length === 0) {
      throw new Error("The shipped first attack did not resolve authoritative target, objective, or formations.");
    }
    const planned = state.getRuntimeSnapshot();
    if (!planned) throw new Error("Preparing the shipped engagement removed campaign runtime truth.");
    const committed = state.commitCampaignEngagement({
      engagementId,
      expectedRevision: planned.revision,
      selections: [{ allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 }]
    });
    if (!committed.ok) throw new Error(committed.reason);
    const playerCommitments = committed.package.formationCommitments.filter((entry) => entry.faction === "Player" && entry.role === "attacker");
    const botCommitments = committed.package.formationCommitments.filter((entry) => entry.faction === "Bot" && entry.role === "defender");
    if (playerCommitments.length === 0 || botCommitments.length === 0) {
      throw new Error("The shipped commitment did not freeze formations on both sides.");
    }
    const runtime = state.getRuntimeSnapshot();
    if (!runtime) throw new Error("Committing the shipped engagement removed campaign runtime truth.");
    const scenario = generateCampaignBattleScenario(committed.package.context, runtime, committed.package) as unknown as {
      campaignBattlePackageId?: string;
      campaignBattleHexKey?: string;
      sides: { Bot: { units: Array<{ campaignProvenance?: { formationId: string } }> } };
    };
    const tacticalBotIds = new Set(scenario.sides.Bot.units.flatMap((unit) => unit.campaignProvenance?.formationId ?? []));
    if (scenario.campaignBattlePackageId !== committed.package.packageId
      || scenario.campaignBattleHexKey !== "28,38"
      || botCommitments.some((entry) => !tacticalBotIds.has(entry.formationId))) {
      throw new Error("Generated tactical opposition drifted from the frozen shipped defenders.");
    }
  });
});

registerTest("CAMPAIGN_FRONT_WITHOUT_A_VALID_EDGE_FAILS_CLOSED", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  const scenario = buildShippedScenario();
  scenario.fronts[0] = { ...scenario.fronts[0], edges: [] };
  let revision = -1;
  let prepared: ReturnType<CampaignState["prepareCampaignFrontEngagement"]>;

  await Given("an authored front with no current opposing-control edge", () => {
    state.setScenario(scenario);
    revision = state.getRuntimeSnapshot()?.revision ?? -1;
  });

  await When("the commander tries to prepare that front", () => {
    prepared = state.prepareCampaignFrontEngagement({
      engagementId: "invalid-front-attack",
      frontKey: "normandy_coast",
      attacker: "Player"
    });
  });

  await Then("no engagement or campaign mutation is created", () => {
    const runtime = state.getRuntimeSnapshot();
    if (prepared.ok || !prepared.reason.includes("no current opposing-control edge")
      || runtime?.revision !== revision || runtime.engagementOrder.length !== 0) {
      throw new Error("Invalid front preparation did not remain a fail-closed no-op.");
    }
  });
});
