/** Certifies the shipped D+1 Normandy campaign's geography, forces, fronts, and first tactical handoff. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { CampaignState } from "../src/state/CampaignState";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";

function buildShippedScenario(): CampaignScenarioData {
  return structuredClone(campaignScenarioData) as CampaignScenarioData;
}

registerTest("CAMPAIGN_SHIPPED_DPLUS1_GEOGRAPHY_AND_ORDER_OF_BATTLE_ARE_COHERENT", async ({ Given, When, Then }) => {
  const scenario = buildShippedScenario();

  await Given("the shipped campaign at 00:00 on 7 June 1944", () => {});

  await When("its map bounds, named coast, airborne lodgments, fleets, and operational force labels are reconciled", () => {});

  await Then("the five beaches run west to east on the Normandy coast and every authored tile is inside the declared grid", () => {
    const outOfBounds = scenario.tiles.flatMap((tile, index) => {
      const col = tile.hex.q;
      const row = tile.hex.r + Math.floor(tile.hex.q / 2);
      return col < 0 || col >= scenario.dimensions.cols || row < 0 || row >= scenario.dimensions.rows
        ? [`${index}:${col},${row}`]
        : [];
    });
    const beachLabels = scenario.tiles
      .map((tile) => ({ tile, palette: scenario.tilePalette[tile.tile] }))
      .filter(({ palette }) => ["Utah", "Omaha", "Gold", "Juno", "Sword"].includes(palette?.mapLabel ?? ""))
      .sort((left, right) => left.tile.hex.q - right.tile.hex.q)
      .map(({ palette }) => palette.mapLabel);
    if (outOfBounds.length > 0
      || beachLabels.join("|") !== "Utah|Omaha|Gold|Juno|Sword"
      || scenario.historicalCalendar?.startDateIso !== "1944-06-07"
      || scenario.historicalCalendar.operationDayOffset !== 1
      || !scenario.description.includes("five Allied beachheads")) {
      throw new Error(`D+1 geography is incoherent: bounds=${outOfBounds.join(",")} beaches=${beachLabels.join("|")}.`);
    }
  });

  await Then("the fleets are in the Channel while beaches, airborne zones, ports, and ground forces remain on land", () => {
    const water = new Set(scenario.mapExtents?.waterHexes ?? []);
    const invalidWater = [...water].filter((key) => {
      const [q, r] = key.split(",").map(Number);
      const row = r + Math.floor(q / 2);
      return !Number.isInteger(q) || !Number.isInteger(r)
        || q < 0 || q >= scenario.dimensions.cols || row < 0 || row >= scenario.dimensions.rows;
    });
    const wronglyPlaced = scenario.tiles.filter((tile) => {
      const isWater = water.has(`${tile.hex.q},${tile.hex.r}`);
      const isFleet = scenario.tilePalette[tile.tile]?.role === "taskForce";
      return isFleet !== isWater;
    });
    const cherbourg = scenario.tiles.find((tile) => scenario.tilePalette[tile.tile]?.mapLabel === "Cherbourg");
    const utah = scenario.tiles.find((tile) => scenario.tilePalette[tile.tile]?.mapLabel === "Utah");
    const cherbourgDisplayRow = cherbourg ? cherbourg.hex.r + Math.floor(cherbourg.hex.q / 2) : Number.NaN;
    const utahDisplayRow = utah ? utah.hex.r + Math.floor(utah.hex.q / 2) : Number.NaN;
    const lodgment = scenario.objectives.find((objective) => objective.key === "hold_lodgment");
    const heldHexes = new Set((lodgment?.conditions ?? []).flatMap((condition) => (
      condition.kind === "controlHex" && condition.hex ? [`${condition.hex.q},${condition.hex.r}`] : []
    )));
    if (invalidWater.length > 0
      || wronglyPlaced.length > 0
      || !cherbourg || !utah
      || cherbourg.hex.q >= utah.hex.q
      || cherbourgDisplayRow > utahDisplayRow
      || !heldHexes.has("1,21")
      || !heldHexes.has("11,15")) {
      throw new Error(`Land/water or Cotentin geography is incoherent: invalidWater=${invalidWater.join(",")} wronglyPlaced=${wronglyPlaced.map((tile) => tile.tile).join(",")}.`);
    }
  });

  await Then("the abstract order of battle contains the source-backed landing, airborne, coastal-defense, and reserve formations", () => {
    const labels = scenario.tiles.flatMap((tile) => tile.forces?.map((force) => force.label ?? "") ?? []);
    const required = [
      "U.S. 4th Infantry Division",
      "U.S. 1st Infantry Division",
      "U.S. 29th Infantry Division",
      "British 50th Infantry Division",
      "3rd Canadian Infantry Division",
      "British 3rd Infantry Division",
      "U.S. 82nd Airborne Division",
      "U.S. 101st Airborne Division",
      "British 6th Airborne Division",
      "709th Infantry Division",
      "91st Air Landing Division",
      "6th Fallschirmjaeger Regiment",
      "352nd Infantry Division",
      "716th Infantry Division",
      "21st Panzer Division",
      "Panzer Lehr Division",
      "12th SS Panzer Division"
    ];
    const missing = required.filter((name) => !labels.some((label) => label.includes(name)));
    const fleets = scenario.tiles.filter((tile) => scenario.tilePalette[tile.tile]?.role === "taskForce");
    const fleetKeys = fleets.map((tile) => `${tile.hex.q},${tile.hex.r + Math.floor(tile.hex.q / 2)}`).sort();
    if (missing.length > 0 || fleetKeys.join("|") !== "3,18|8,18" || fleets.some((tile) => (tile.forces?.length ?? 0) > 0)) {
      throw new Error(`D+1 order of battle is incomplete: missing=${missing.join(",")} fleets=${fleetKeys.join("|")}.`);
    }
  });
});

registerTest("CAMPAIGN_SCENARIO_REJECTS_AUTHORED_TILES_OUTSIDE_ITS_GRID", async ({ Given, When, Then }) => {
  const scenario = buildShippedScenario();
  let rejected = false;

  await Given("an otherwise valid campaign with one overscan-only tile", () => {
    scenario.tiles[0] = { ...scenario.tiles[0], hex: { q: 12, r: 40 } };
  });

  await When("the authored scenario is split into runtime content", () => {
    try {
      splitLegacyCampaignScenario(scenario);
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("outside the declared");
    }
  });

  await Then("invalid geography fails before runtime creation", () => {
    if (!rejected) throw new Error("An out-of-bounds authored tile was accepted through renderer overscan.");
  });
});

registerTest("CAMPAIGN_SHIPPED_CLOCK_ANCHORS_THE_DPLUS1_OPENING", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  let opening = "";
  let nextDay = "";

  await Given("the shipped D+1 Normandy campaign", () => {
    state.setScenario(buildShippedScenario());
  });
  await When("the opening and following-day command times are rendered", () => {
    opening = state.getCurrentTimeDisplay();
    nextDay = state.segmentToTimeDisplay(8);
  });
  await Then("the commander sees calendar and D-day-relative time", () => {
    if (opening !== "D+1 · 7 June 1944, 00:00–03:00" || nextDay !== "D+2 · 8 June 1944, 00:00–03:00") {
      throw new Error(`Historical campaign clock is ambiguous: '${opening}' / '${nextDay}'.`);
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_FRONTS_SURVIVE_THE_FIRST_SEGMENT", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  let advanced: ReturnType<CampaignState["advanceCampaign"]>;

  await Given("the four exact D+1 opposing-control sectors", () => {
    state.setScenario(buildShippedScenario());
  });
  await When("one ordinary three-hour campaign segment resolves", () => {
    advanced = state.advanceCampaign({ mode: "segment" });
  });
  await Then("the Utah, central beaches, eastern beaches, and Caen counterattack remain named playable fronts", () => {
    if (!advanced.ok) throw new Error(advanced.error.message);
    const fronts = advanced.state.compatibility.initialFronts;
    const required = ["utah_cotentin", "omaha_gold", "juno_sword", "caen_airborne_flank"];
    const missing = required.filter((key) => !fronts.some((front) => front.key === key));
    const allEdgesRemainExact = fronts.every((front) => (front.edges?.length ?? 0) > 0
      && front.edges!.every((edge) => edge.friendlyHexKey !== edge.opposingHexKey));
    if (missing.length > 0 || !allEdgesRemainExact) {
      throw new Error(`First segment lost the D+1 sectors: ${fronts.map((front) => front.key).join(", ")}.`);
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_FIRST_ATTACK_FREEZES_REAL_TARGET_AND_FORCES", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  const engagementId = "shipped-omaha-gold-attack";
  let prepared: ReturnType<CampaignState["prepareCampaignFrontEngagement"]>;

  await Given("the shared 352nd Infantry Division position between Omaha and Gold", () => {
    state.setScenario(buildShippedScenario());
  });
  await When("CampaignState prepares and commits the first Player attack", () => {
    prepared = state.prepareCampaignFrontEngagement({ engagementId, frontKey: "omaha_gold", attacker: "Player" });
    if (!prepared.ok) throw new Error(prepared.reason);
    state.setPendingEngagements([prepared.engagement]);
    state.setActiveEngagementId(engagementId);
  });
  await Then("the 352nd position, both Allied staging sectors, and tactical provenance remain linked", () => {
    if (!prepared.ok) throw new Error(prepared.reason);
    const context = prepared.engagement.context;
    if (context.battleHexKey !== "5,20" || context.defender !== "Bot"
      || context.missionType !== "fortifiedAssault"
      || context.availableForces.flatMap((group) => group.formationIds ?? []).length === 0
      || context.enemyForces.flatMap((group) => group.formationIds ?? []).length === 0) {
      throw new Error("The D+1 first attack did not freeze a real sector and formations on both sides.");
    }
    const planned = state.getRuntimeSnapshot();
    if (!planned) throw new Error("Preparing the shipped engagement removed campaign runtime truth.");
    const committed = state.commitCampaignEngagement({
      engagementId,
      expectedRevision: planned.revision,
      selections: [{ allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 }]
    });
    if (!committed.ok) throw new Error(committed.reason);
    const botCommitments = committed.package.formationCommitments.filter((entry) => entry.faction === "Bot" && entry.role === "defender");
    const runtime = state.getRuntimeSnapshot();
    if (!runtime) throw new Error("Committing the shipped engagement removed campaign runtime truth.");
    const generated = generateCampaignBattleScenario(committed.package.context, runtime, committed.package) as unknown as {
      campaignBattlePackageId?: string;
      campaignBattleHexKey?: string;
      sides: { Bot: { units: Array<{ campaignProvenance?: { formationId: string } }> } };
    };
    const tacticalBotIds = new Set(generated.sides.Bot.units.flatMap((unit) => unit.campaignProvenance?.formationId ?? []));
    if (generated.campaignBattlePackageId !== committed.package.packageId
      || generated.campaignBattleHexKey !== "5,20"
      || botCommitments.length === 0
      || botCommitments.some((entry) => !tacticalBotIds.has(entry.formationId))) {
      throw new Error("Generated tactical opposition drifted from the frozen 352nd position.");
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
    prepared = state.prepareCampaignFrontEngagement({ engagementId: "invalid-front-attack", frontKey: "utah_cotentin", attacker: "Player" });
  });
  await Then("no engagement or campaign mutation is created", () => {
    const runtime = state.getRuntimeSnapshot();
    if (prepared.ok || !prepared.reason.includes("no current opposing-control edge")
      || runtime?.revision !== revision || runtime.engagementOrder.length !== 0) {
      throw new Error("Invalid front preparation did not remain a fail-closed no-op.");
    }
  });
});
