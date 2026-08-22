/** Certifies the shipped D+1 Normandy campaign's geography, forces, fronts, and first tactical handoff. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { CampaignState } from "../src/state/CampaignState";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { resolveCampaignAIEngagements } from "../src/game/campaign/ai/CampaignAIEngagementService";

function buildShippedScenario(): CampaignScenarioData {
  return structuredClone(campaignScenarioData) as CampaignScenarioData;
}

registerTest("CAMPAIGN_SHIPPED_DPLUS1_THEATER_GEOGRAPHY_AND_ORDER_OF_BATTLE_ARE_COHERENT", async ({ Given, When, Then }) => {
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
    const utah = scenario.tiles.find((tile) => scenario.tilePalette[tile.tile]?.mapLabel === "Utah");
    const sword = scenario.tiles.find((tile) => scenario.tilePalette[tile.tile]?.mapLabel === "Sword");
    const beachFrontageHexes = utah && sword
      ? Math.max(
        Math.abs(sword.hex.q - utah.hex.q),
        Math.abs(sword.hex.r - utah.hex.r),
        Math.abs((-sword.hex.q - sword.hex.r) - (-utah.hex.q - utah.hex.r))
      )
      : Number.NaN;
    const anchors = new Map((scenario.mapExtents?.registrationAnchors ?? []).map((anchor) => [anchor.key, anchor]));
    const calibrationFailures = (scenario.mapExtents?.distanceCalibrations ?? []).filter((calibration) => {
      const from = anchors.get(calibration.fromAnchorKey);
      const to = anchors.get(calibration.toAnchorKey);
      if (!from || !to) return true;
      const distance = Math.max(
        Math.abs(from.hex.q - to.hex.q),
        Math.abs(from.hex.r - to.hex.r),
        Math.abs((-from.hex.q - from.hex.r) - (-to.hex.q - to.hex.r))
      ) * (scenario.hexScaleKm ?? 0);
      return Math.abs(distance - calibration.expectedDistanceKm) > calibration.toleranceKm;
    });
    if (outOfBounds.length > 0
      || beachLabels.join("|") !== "Utah|Omaha|Gold|Juno|Sword"
      || scenario.hexScaleKm !== 10
      || scenario.dimensions.cols !== 58 || scenario.dimensions.rows !== 50
      || scenario.background.gridLayout !== "flatTopOddQ"
      || scenario.background.nativeWidth !== 1024 || scenario.background.nativeHeight !== 1024
      || scenario.background.stretchMode !== "contain"
      || beachFrontageHexes !== 8
      || anchors.size < 6
      || (scenario.mapExtents?.distanceCalibrations?.length ?? 0) < 3
      || calibrationFailures.length > 0
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
      || Math.abs(cherbourgDisplayRow - utahDisplayRow) > 1
      || !heldHexes.has("21,16")
      || !heldHexes.has("23,16")
      || !heldHexes.has("31,7")) {
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
      "U.S. 2nd Ranger Battalion",
      "British 51st Highland Division",
      "British 22nd Armoured Brigade",
      "709th Infantry Division",
      "243rd Infantry Division",
      "91st Air Landing Division",
      "6th Fallschirmjaeger Regiment",
      "352nd Infantry Division",
      "716th Infantry Division",
      "21st Panzer Division",
      "Panzer Lehr Division",
      "12th SS Panzer Division",
      "30th Mobile Brigade"
    ];
    const missing = required.filter((name) => !labels.some((label) => label.includes(name)));
    const fleets = scenario.tiles.filter((tile) => scenario.tilePalette[tile.tile]?.role === "taskForce");
    const fleetKeys = fleets.map((tile) => `${tile.hex.q},${tile.hex.r + Math.floor(tile.hex.q / 2)}`).sort();
    const airborneLocations = scenario.tiles
      .filter((tile) => tile.forces?.some((force) => force.label?.includes("U.S. 82nd Airborne Division") || force.label?.includes("U.S. 101st Airborne Division")))
      .map((tile) => `${tile.hex.q},${tile.hex.r}`);
    const namedEnglishHubs = scenario.tiles.filter((tile) => {
      const palette = scenario.tilePalette[tile.tile];
      const row = tile.hex.r + Math.floor(tile.hex.q / 2);
      return row <= 10 && palette?.factionControl === "Player" && Boolean(palette.mapLabel)
        && (palette.role === "airbase" || palette.role === "logisticsHub");
    });
    if (missing.length > 0
      || fleetKeys.join("|") !== "22,20|26,18"
      || fleets.some((tile) => (tile.forces?.length ?? 0) > 0)
      || new Set(airborneLocations).size !== 2
      || namedEnglishHubs.length < 7) {
      throw new Error(`D+1 order of battle is incomplete: missing=${missing.join(",")} fleets=${fleetKeys.join("|")}.`);
    }
  });

  await Then("the German coastal divisions are depleted and major armored reserves are unavailable until D+2", () => {
    const allGroups = scenario.tiles.flatMap((tile) => tile.forces ?? []);
    const countFor = (fragment: string): number => allGroups
      .filter((group) => group.label?.includes(fragment))
      .reduce((sum, group) => sum + group.count, 0);
    const delayedArmored = allGroups.filter((group) => group.label?.includes("Panzer Lehr Division") || group.label?.includes("12th SS Panzer Division"));
    if (countFor("352nd Infantry Division") !== 3
      || countFor("716th Infantry Division") !== 1
      || countFor("21st Panzer Division") !== 2
      || delayedArmored.length !== 4
      || delayedArmored.some((group) => group.availableFromSegment !== 8)) {
      throw new Error("D+1 German strength or reinforcement availability reverted to paper-strength/instant-ready values.");
    }
  });

  await Then("the full campaign arc remains visible from the lodgment through the Seine", () => {
    const phases = scenario.campaignArc?.phases.map((phase) => phase.key) ?? [];
    const victoryKeys = new Set(scenario.campaignArc?.victoryObjectiveKeys ?? []);
    const requiredObjectives = ["hold_lodgment", "capture_cherbourg", "secure_caen", "break_saint_lo", "open_avranches", "close_falaise", "close_argentan", "reach_the_seine"];
    const briefedSites = scenario.briefedStrategicSites ?? [];
    const knownSites = new Set(briefedSites.map((site) => site.label));
    const toOffsetKey = (hex: { q: number; r: number }): string => `${hex.q},${hex.r + Math.floor(hex.q / 2)}`;
    const toAxial = (hexKey: string): { q: number; r: number } => {
      const [q, row] = hexKey.split(",").map(Number);
      return { q, r: row - Math.floor(q / 2) };
    };
    const hexDistance = (left: { q: number; r: number }, right: { q: number; r: number }): number => Math.max(
      Math.abs(left.q - right.q),
      Math.abs(left.r - right.r),
      Math.abs((-left.q - left.r) - (-right.q - right.r))
    );
    const botTiles = scenario.tiles.filter((tile) => scenario.tilePalette[tile.tile]?.factionControl === "Bot");
    const botKeys = new Set(botTiles.map((tile) => toOffsetKey(tile.hex)));
    const playerKeys = new Set(scenario.tiles
      .filter((tile) => scenario.tilePalette[tile.tile]?.factionControl === "Player")
      .map((tile) => toOffsetKey(tile.hex)));
    const briefedSitesOnFriendlyTiles = briefedSites
      .filter((site) => playerKeys.has(toOffsetKey(site.hex)))
      .map((site) => site.key);
    const reachable = new Set(scenario.fronts.flatMap((front) => front.edges ?? [])
      .map((edge) => edge.opposingHexKey)
      .filter((key) => botKeys.has(key)));
    let added = true;
    while (added) {
      added = false;
      botTiles.forEach((tile) => {
        const key = toOffsetKey(tile.hex);
        if (reachable.has(key)) return;
        if ([...reachable].some((candidate) => hexDistance(tile.hex, toAxial(candidate)) === 1)) {
          reachable.add(key);
          added = true;
        }
      });
    }
    const unreachablePrimaryTargets = scenario.objectives
      .filter((objective) => objective.category === "primary" && objective.owner === "Bot")
      .filter((objective) => !reachable.has(toOffsetKey(objective.hex)))
      .map((objective) => objective.key);
    if (phases.join("|") !== "lodgment|expansion|breakout|encirclement|pursuit"
      || requiredObjectives.some((key) => !victoryKeys.has(key))
      || !knownSites.has("Cherbourg") || !knownSites.has("Caen")
      || !knownSites.has("Saint-Lô") || !knownSites.has("Rouen and the Seine crossings")
      || !knownSites.has("Pas-de-Calais defenses") || !knownSites.has("Brest")
      || briefedSites.length !== 13
      || briefedSitesOnFriendlyTiles.length > 0
      || unreachablePrimaryTargets.length > 0) {
      throw new Error("The registered full-theater map collapsed back into a beachhead-only vignette.");
    }
  });
});

registerTest("CAMPAIGN_SCENARIO_REJECTS_AUTHORED_TILES_OUTSIDE_ITS_GRID", async ({ Given, When, Then }) => {
  const scenario = buildShippedScenario();
  let rejected = false;

  await Given("an otherwise valid campaign with one overscan-only tile", () => {
    scenario.tiles[0] = { ...scenario.tiles[0], hex: { q: scenario.dimensions.cols, r: 0 } };
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

registerTest("CAMPAIGN_SHIPPED_CAEN_COUNTERATTACK_NATURALLY_INTERRUPTS_TIME", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });

  await Given("the authored Caen-Orne counterattack front and its adjacent British airborne defense", () => {
    state.setScenario(buildShippedScenario());
  });
  const first = state.advanceCampaign({ mode: "segment" });
  await When("the published two-segment counterattack cadence is reached through ordinary campaign time", () => {
    if (!first.ok || first.state.activeEngagementId !== null) {
      throw new Error("The counterattack fired before its published operational cadence.");
    }
  });
  const second = state.advanceCampaign({ mode: "segment" });
  await Then("one exact Bot attack creates a mandatory Player defense from mapped formations", () => {
    if (!second.ok) throw new Error(second.error.message);
    const engagementId = second.state.activeEngagementId;
    const engagement = engagementId ? second.state.engagements[engagementId] : null;
    const pkg = engagementId ? second.state.engagementLedger[engagementId]?.package : null;
    const attackers = pkg?.formationCommitments.filter((entry) => entry.faction === "Bot" && entry.role === "attacker") ?? [];
    const defenders = pkg?.formationCommitments.filter((entry) => entry.faction === "Player" && entry.role === "defender") ?? [];
    const defenderAllocations = defenders.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.allocationKey] = (counts[entry.allocationKey] ?? 0) + 1;
      return counts;
    }, {});
    const defenderCampaignTypes = defenders.reduce<Record<string, number>>((counts, entry) => {
      const campaignType = second.state.formations[entry.formationId]?.campaignUnitType ?? "missing";
      counts[campaignType] = (counts[campaignType] ?? 0) + 1;
      return counts;
    }, {});
    if (!engagementId || !engagement || engagement.status !== "inBattle" || !pkg
      || engagement.engagement.frontKey !== "caen_airborne_flank"
      || engagement.engagement.context?.battleHexKey !== "31,22"
      || attackers.length === 0 || defenders.length === 0
      || Object.keys(defenderAllocations).length !== 3
      || defenderAllocations.airborneDetachment !== 6 || defenderAllocations.infantry !== 9 || defenderAllocations.tank !== 3
      || Object.keys(defenderCampaignTypes).length !== 3
      || defenderCampaignTypes.Paratrooper !== 6 || defenderCampaignTypes.Infantry_42 !== 9 || defenderCampaignTypes.Medium_Tank !== 3
      || second.state.status !== "engagement"
      || second.report.stopReason !== "engagement") {
      throw new Error("The published Caen counterattack did not produce one exact mandatory defense.");
    }

    const resolved = structuredClone(second.state);
    const ledger = resolved.engagementLedger[engagementId];
    ledger.status = "resolved";
    resolved.activeEngagementId = null;
    resolved.status = "planning";
    resolved.engagementOrder.splice(0, resolved.engagementOrder.length,
      ...resolved.engagementOrder.filter((id) => id !== engagementId));
    delete resolved.engagements[engagementId];
    const planning = resolved.aiPlanningByFaction?.Bot;
    const behavior = resolved.aiBehaviorsByFaction?.Bot;
    if (!planning || !behavior) throw new Error("The counterattack did not retain its AI planning boundary.");
    (planning.portfolio.selectedPlans as unknown as unknown[]).splice(0, planning.portfolio.selectedPlans.length);
    (behavior.directives as unknown as unknown[]).splice(0, behavior.directives.length);
    const repeated = resolveCampaignAIEngagements(resolved, splitLegacyCampaignScenario(buildShippedScenario()), []);
    if (repeated.length > 0 || resolved.activeEngagementId !== null) {
      throw new Error("The resolved authored counterattack opened again from its retained ledger history.");
    }
  });
});

registerTest("CAMPAIGN_SHIPPED_FIRST_ATTACK_FREEZES_REAL_TARGET_AND_FORCES", async ({ Given, When, Then }) => {
  const state = new CampaignState({ legacyStorage: null });
  const engagementId = "shipped-omaha-gold-attack";
  let prepared: ReturnType<CampaignState["prepareCampaignFrontEngagement"]>;

  await Given("the 352nd Infantry Division position immediately inland from Omaha", () => {
    state.setScenario(buildShippedScenario());
  });
  await When("CampaignState prepares and commits the first Player attack", () => {
    prepared = state.prepareCampaignFrontEngagement({
      engagementId,
      frontKey: "omaha_gold",
      attacker: "Player",
      requestedTargetHexKey: "24,24"
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    state.setPendingEngagements([prepared.engagement]);
    state.setActiveEngagementId(engagementId);
  });
  await Then("the 352nd position, both Allied staging sectors, and tactical provenance remain linked", () => {
    if (!prepared.ok) throw new Error(prepared.reason);
    const context = prepared.engagement.context;
    if (context.battleHexKey !== "24,24" || context.defender !== "Bot"
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
      sides: {
        Player: { units: Array<{ campaignProvenance?: { formationId: string } }> };
        Bot: { units: Array<{ campaignProvenance?: { formationId: string } }> };
      };
    };
    const tacticalBotIds = new Set(generated.sides.Bot.units.flatMap((unit) => unit.campaignProvenance?.formationId ?? []));
    if (generated.campaignBattlePackageId !== committed.package.packageId
      || generated.campaignBattleHexKey !== "24,24"
      || generated.sides.Player.units.length !== 0
      || botCommitments.length === 0
      || botCommitments.some((entry) => !tacticalBotIds.has(entry.formationId))) {
      throw new Error("Generated tactical forces drifted from the frozen campaign package.");
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
