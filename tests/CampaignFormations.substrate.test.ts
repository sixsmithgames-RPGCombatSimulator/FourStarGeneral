/**
 * MODULE: CampaignFormations.substrate.test
 * WHAT: Certifies deterministic campaign formation identity, placement conservation, save continuity, and tactical provenance.
 * WHY: C20-020 is the identity foundation for commitment, result extraction, consequences, and multi-battle formation history.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext, CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  createCampaignRuntime,
  projectLegacyCampaignState,
  splitLegacyCampaignScenario,
  type CreateCampaignRuntimeOptions
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { resolveCampaignSegment } from "../src/game/campaign/runtime/CampaignSegmentResolver";
import {
  createCampaignFormationRecord,
  isCampaignFormationPresentAtLocation,
  reconcileCampaignFormationForceCounts,
  retireCampaignFormation
} from "../src/game/campaign/formations/FormationLifecycleService";
import { resolveCampaignFormationPresentation } from "../src/game/campaign/formations/CampaignFormationPresentation";
import {
  attachCampaignFormationProvenanceToContext,
  createCampaignFormationBattleSeed,
  extractCampaignFormationTacticalSnapshot,
  isCampaignFormationBattleEligible,
  selectCampaignFormationsForAllocation
} from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import {
  commitCampaignOrderDrafts,
  createRedeployOrderDraft
} from "../src/game/campaign/orders/CampaignOrderService";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { DeploymentState } from "../src/state/DeploymentState";

function buildFormationScenario(): CampaignScenarioData {
  return {
    key: "formation-substrate",
    title: "Formation Substrate",
    description: "Persistent formation certification fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "logisticsHub", factionControl: "Player", supplyValue: 4 },
      bot: { role: "fortificationLight", factionControl: "Bot", supplyValue: 2 }
    },
    tiles: [
      {
        tile: "player",
        factionControl: "Player",
        hex: { q: 0, r: 0 },
        forces: [{ unitType: "Infantry_42", count: 2, label: "1st Infantry Brigade" }]
      },
      { tile: "player", factionControl: "Player", hex: { q: 0, r: 1 }, forces: [] },
      {
        tile: "bot",
        factionControl: "Bot",
        hex: { q: 1, r: 0 },
        forces: [{ unitType: "Panzer_IV", count: 1, label: "Panzer Reserve" }]
      }
    ],
    fronts: [{ key: "front", label: "Test Front", hexKeys: ["0,0", "1,0"], initiative: "Player" }],
    objectives: [],
    economies: [
      {
        faction: "Player",
        manpower: 1000,
        supplies: 500,
        fuel: 300,
        ammo: 200,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 900,
        supplies: 450,
        fuel: 280,
        ammo: 180,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

function runtimeOptions(scenario: CampaignScenarioData): CreateCampaignRuntimeOptions {
  return {
    campaignId: "campaign_formations_test",
    seed: 0x24f020,
    currentSegment: 12,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 12),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 12)
    }
  };
}

function buildAuthoredArrivalScenario(): CampaignScenarioData {
  return {
    key: "authored-arrival-contract",
    title: "Authored Arrival Contract",
    description: "Scheduled formation availability certification fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "logisticsHub", factionControl: "Player", supplyValue: 4 },
      bot: { role: "fortificationLight", factionControl: "Bot", supplyValue: 2 }
    },
    tiles: [
      {
        tile: "player",
        factionControl: "Player",
        hex: { q: 0, r: 0 },
        forces: [
          { unitType: "Engineer", count: 1, label: "Beachhead engineers" },
          {
            unitType: "Infantry_42",
            count: 2,
            label: "U.S. follow-on formations",
            availableFromSegment: 2,
            availabilityCopy: "U.S. follow-on formations arrived at the staging area."
          }
        ]
      },
      { tile: "player", factionControl: "Player", hex: { q: 0, r: 1 }, forces: [] },
      {
        tile: "bot",
        factionControl: "Bot",
        hex: { q: 2, r: 0 },
        forces: [
          { unitType: "Infantry_42", count: 1, label: "German security force" },
          {
            unitType: "Panzer_IV",
            count: 2,
            label: "German assembling reserve",
            availableFromSegment: 3,
            availabilityCopy: "German assembling formations entered the operational reserve."
          },
          {
            unitType: "Infantry_42",
            count: 1,
            label: "German assembling reserve infantry",
            availableFromSegment: 3,
            availabilityCopy: "German assembling formations entered the operational reserve."
          }
        ]
      }
    ],
    fronts: [],
    objectives: [],
    economies: [
      {
        faction: "Player",
        manpower: 1000,
        supplies: 500,
        fuel: 300,
        ammo: 200,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 900,
        supplies: 450,
        fuel: 280,
        ammo: 180,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

function arrivalRuntimeOptions(scenario: CampaignScenarioData): CreateCampaignRuntimeOptions {
  return {
    campaignId: "campaign_authored_arrivals_test",
    seed: 0x24f021,
    currentSegment: 1,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 1),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 1)
    }
  };
}

function buildEngagementContext(): CampaignEngagementContext {
  return {
    engagementId: "eng_formations",
    battleHexKey: "1,0",
    attacker: "Player",
    defender: "Bot",
    missionType: "lineAssault",
    amphibious: false,
    coastal: false,
    availableForces: [{ hexKey: "0,0", unitType: "Infantry_42", count: 2 }],
    allocationCaps: { infantry: 2 },
    enemyForces: [{ hexKey: "1,0", unitType: "Panzer_IV", count: 1 }],
    airSorties: 0,
    rpReserve: 150,
    playerForceValue: 200,
    enemyForceValue: 150,
    forceRatio: 4 / 3,
    templateKey: null,
    frontKey: "front",
    objectiveKey: null
  };
}

registerTest("CAMPAIGN_FORMATIONS_USE_PERIOD_COMMANDS_AND_AUTHORED_AIR_IDENTITIES", async ({ Given, When, Then }) => {
  let easternFighters: ReturnType<typeof resolveCampaignFormationPresentation>[] = [];

  await Given("the six fighter records assigned to the Tangmere sector", () => {
    easternFighters = Array.from({ length: 6 }, (_, legacyOrdinal) => resolveCampaignFormationPresentation({
      legacyLabel: "Eastern tactical fighter groups",
      legacyOrdinal,
      unitType: "Fighter"
    }));
  });

  await When("their player-facing order of battle is resolved", () => {});

  await Then("the actual RCAF wings, squadrons, and aircraft type replace global generated ordinals", () => {
    const names = easternFighters.map((entry) => entry.formationName);
    const commands = new Set(easternFighters.map((entry) => entry.commandLabel));
    if (names.join("|") !== [
      "No. 401 Squadron RCAF",
      "No. 411 Squadron RCAF",
      "No. 412 Squadron RCAF",
      "No. 403 Squadron RCAF",
      "No. 416 Squadron RCAF",
      "No. 421 Squadron RCAF"
    ].join("|")
      || !commands.has("No. 126 (RCAF) Wing")
      || !commands.has("No. 127 (RCAF) Wing")
      || easternFighters.some((entry) => entry.typeLabel !== "Spitfire IX fighter squadron"
        || !entry.hasAuthoredSubordinateIdentity
        || /groups?\s+\d+$/i.test(entry.formationName))) {
      throw new Error(`Tangmere formation presentation is not a stable historical hierarchy: ${JSON.stringify(easternFighters)}.`);
    }
  });
});

registerTest("CAMPAIGN_FORMATIONS_RESOLVE_SOURCE_BACKED_DDAY_GROUND_HIERARCHIES", async ({ Given, When, Then }) => {
  const exactGroups = [
    ["U.S. 4th Infantry Division battalions", 9, "Infantry_42"],
    ["VII Corps engineer groups", 2, "Engineer"],
    ["V Corps engineer groups", 2, "Engineer"],
    ["British 50th Infantry Division battalions", 9, "Infantry_42"],
    ["British 8th Armoured Brigade regiments", 3, "Medium_Tank"],
    ["British 22nd Armoured Brigade advance groups", 3, "Medium_Tank"],
    ["3rd Canadian Infantry Division battalions", 9, "Infantry_42"],
    ["2nd Canadian Armoured Brigade regiments", 3, "Medium_Tank"],
    ["British 3rd Infantry Division battalions", 9, "Infantry_42"],
    ["British 27th Armoured Brigade regiments", 3, "Medium_Tank"],
    ["British 6th Airborne Division groups", 6, "Paratrooper"]
  ] as const;
  let resolved: ReturnType<typeof resolveCampaignFormationPresentation>[][] = [];

  await Given("the source-backed U.S., British, and Canadian D-Day formation groups", async () => {
    resolved = exactGroups.map(([legacyLabel, count, unitType]) => Array.from(
      { length: count },
      (_, legacyOrdinal) => resolveCampaignFormationPresentation({ legacyLabel, legacyOrdinal, unitType })
    ));
  });

  await When("their stable campaign presentation is resolved", async () => {});

  await Then("every exact record has one subordinate identity at the correct command echelon", async () => {
    const allExact = resolved.every((group, groupIndex) => {
      const expectedCount = exactGroups[groupIndex]![1];
      return group.length === expectedCount
        && new Set(group.map((entry) => entry.formationName)).size === expectedCount
        && group.every((entry) => entry.hasAuthoredSubordinateIdentity
          && entry.commandLabel !== entry.formationName
          && !/(?:groups?|battalions|regiments|columns)\s+\d+$/i.test(entry.formationName));
    });
    const sword = resolved[8]!;
    const orne = resolved[10]!;
    const utah = resolved[0]!;
    if (!allExact
      || sword[0]?.formationName !== "1st Battalion, Suffolk Regiment"
      || sword[8]?.formationName !== "2nd Battalion, King's Shropshire Light Infantry"
      || orne[2]?.formationName !== "1st Canadian Parachute Battalion"
      || orne[5]?.commandLabel !== "5th Parachute Brigade"
      || utah[0]?.commandLabel !== "8th Infantry Regiment"
      || utah[8]?.formationName !== "3d Battalion, 22d Infantry Regiment") {
      throw new Error(`Ground formation presentation diverged from the OOB manifest: ${JSON.stringify(resolved)}.`);
    }
  });
});

registerTest("CAMPAIGN_FORMATIONS_KEEP_ABSTRACT_STRENGTH_STEPS_GROUPED", async ({ Given, When, Then }) => {
  let omahaSteps: ReturnType<typeof resolveCampaignFormationPresentation>[] = [];
  let americanAirborne: ReturnType<typeof resolveCampaignFormationPresentation>[][] = [];

  await Given("three campaign strength steps under the 16th Infantry Regiment", async () => {
    omahaSteps = Array.from({ length: 3 }, (_, legacyOrdinal) => resolveCampaignFormationPresentation({
      legacyLabel: "U.S. 1st Infantry Division battalions",
      legacyOrdinal,
      unitType: "Infantry_42"
    }));
    americanAirborne = ["U.S. 82nd Airborne Division groups", "U.S. 101st Airborne Division groups"].map(
      (legacyLabel) => Array.from({ length: 6 }, (_, legacyOrdinal) => resolveCampaignFormationPresentation({
        legacyLabel,
        legacyOrdinal,
        unitType: "Paratrooper"
      }))
    );
  });

  await When("the UI resolves an intentionally aggregate formation count", async () => {});

  await Then("it uses the real command without inventing numbered battalions", async () => {
    if (omahaSteps.some((entry) => entry.commandLabel !== "16th Infantry Regiment"
      || entry.formationName !== "16th Infantry Regiment"
      || entry.hasAuthoredSubordinateIdentity)) {
      throw new Error(`Abstract strength steps were presented as invented subordinates: ${JSON.stringify(omahaSteps)}.`);
    }
    const expectedAirborneCommands = ["82d Airborne Division", "101st Airborne Division"];
    if (americanAirborne.some((division, divisionIndex) => division.some((entry) => (
      entry.commandLabel !== expectedAirborneCommands[divisionIndex]
      || entry.formationName !== expectedAirborneCommands[divisionIndex]
      || entry.typeLabel !== "airborne strength group"
      || entry.hasAuthoredSubordinateIdentity
    )))) {
      throw new Error(`Airborne records claimed false subordinate tactical identities: ${JSON.stringify(americanAirborne)}.`);
    }
  });
});

registerTest("CAMPAIGN_FORMATIONS_DETERMINISTIC_LEGACY_REGISTRY", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const first = createCampaignRuntime(definition, runtimeOptions(scenario));
  const second = createCampaignRuntime(definition, runtimeOptions(scenario));

  await Given("three aggregate campaign counts in authored tile/group order", async () => {});

  await When("the same legacy campaign is adapted twice", async () => {});

  await Then("each count becomes one identical, complete, persistently placed formation", async () => {
    if (first.formationOrder.length !== 3) throw new Error(`Expected three formations, got ${first.formationOrder.length}.`);
    if (computeCampaignContentHash(first.formations) !== computeCampaignContentHash(second.formations)
      || computeCampaignContentHash(first.formationOrder) !== computeCampaignContentHash(second.formationOrder)) {
      throw new Error("Identical campaign inputs produced different formation identity or records.");
    }
    const infantry = first.formationOrder.map((id) => first.formations[id]).filter((entry) => entry.campaignUnitType === "Infantry_42");
    if (infantry.length !== 2
      || new Set(infantry.map((entry) => entry.id)).size !== 2
      || infantry.some((entry) => entry.personnel.core?.fit <= 0 || entry.battleHistory[0]?.type !== "formed")) {
      throw new Error("Legacy infantry did not receive unique identity, complete personnel pools, and origin history.");
    }
    if (first.formationOrder.some((id) => first.formations[id].status !== "ready"
      || first.formations[id].availableFromSegment !== undefined
      || first.formations[id].availabilityCopy !== undefined)) {
      throw new Error("Legacy force groups without availability metadata did not preserve immediate readiness.");
    }
    if (validateCampaignRuntimeState(first).length !== 0) throw new Error("Seeded formation runtime failed invariants.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_AUTHORED_ARRIVALS_START_UNAVAILABLE", async ({ Given, When, Then }) => {
  const scenario = buildAuthoredArrivalScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), arrivalRuntimeOptions(scenario));
  const playerArrivals = runtime.formationOrder
    .map((id) => runtime.formations[id])
    .filter((formation) => formation.faction === "Player" && formation.availableFromSegment === 2);
  const germanArrivals = runtime.formationOrder
    .map((id) => runtime.formations[id])
    .filter((formation) => formation.faction === "Bot" && formation.availableFromSegment === 3);

  await Given("authored U.S. follow-on and German assembling formations with future arrival segments", async () => {});

  await When("the campaign runtime is seeded before either arrival boundary", async () => {});

  await Then("future formations retain identity but are absent from orders, combat, and operational force totals", async () => {
    if (playerArrivals.length !== 2 || germanArrivals.length !== 3
      || [...playerArrivals, ...germanArrivals].some((formation) => formation.status !== "unavailable")) {
      throw new Error("Future authored groups were not seeded as unavailable persistent formations.");
    }
    if (runtime.tiles["0,0"].forces.some((force) => force.unitType === "Infantry_42")
      || runtime.tiles["2,0"].forces.some((force) => force.unitType === "Panzer_IV")) {
      throw new Error("Scheduled formations leaked into the operational aggregate projection before arrival.");
    }
    const scheduled = playerArrivals[0];
    if (!scheduled || isCampaignFormationBattleEligible(scheduled)) {
      throw new Error("A scheduled U.S. follow-on formation was considered battle eligible.");
    }
    const orderRuntime = structuredClone(runtime);
    const draft = createRedeployOrderDraft(orderRuntime, {
      faction: "Player",
      payload: {
        originOffsetKey: "0,0",
        destinationOffsetKey: "0,1",
        originRuntimeHexKey: "0,0",
        destinationRuntimeHexKey: "0,1",
        selections: [{ unitType: "Infantry_42", count: 1 }],
        transportModeKey: "foot",
        transportCapacityType: null,
        distance: 1,
        timeSegments: 1,
        etaSegment: 2,
        returnEtaSegment: 2,
        fuelCost: 0,
        suppliesCost: 1,
        manpowerCost: 0,
        transportCapacityCost: 0,
        formationIds: [scheduled.id]
      }
    });
    if (!draft.validation.issues.some((issue) => issue.code === "ORDER_FORCE_UNAVAILABLE")) {
      throw new Error("A scheduled formation could be selected for a redeployment order before arrival.");
    }
    if (validateCampaignRuntimeState(runtime).length !== 0) throw new Error("Scheduled formation runtime failed invariants.");

    const malformed = buildAuthoredArrivalScenario();
    const malformedGroup = malformed.tiles[0].forces?.[1];
    if (!malformedGroup) throw new Error("Arrival validation fixture is missing its scheduled force group.");
    malformedGroup.availableFromSegment = 1.5;
    let rejected = false;
    try {
      splitLegacyCampaignScenario(malformed);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("A fractional authored arrival segment was accepted.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_AUTHORED_ARRIVALS_RELEASE_DETERMINISTICALLY", async ({ Given, When, Then }) => {
  const scenario = buildAuthoredArrivalScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, arrivalRuntimeOptions(scenario));
  const segmentTwo = resolveCampaignSegment(runtime, definition);
  const repeatedSegmentTwo = resolveCampaignSegment(runtime, definition);

  await Given("scheduled force groups tied to separate U.S. and German segment boundaries", async () => {});

  await When("campaign time crosses segment two and then segment three", async () => {
    if (!segmentTwo.ok) throw new Error(segmentTwo.error.message);
    if (!repeatedSegmentTwo.ok) throw new Error(repeatedSegmentTwo.error.message);
  });

  await Then("each group releases once with authored copy, refreshed totals, and deterministic state", async () => {
    if (!segmentTwo.ok || !repeatedSegmentTwo.ok) throw new Error("Segment two did not resolve.");
    if (computeCampaignContentHash(segmentTwo.state) !== computeCampaignContentHash(repeatedSegmentTwo.state)) {
      throw new Error("Repeating the same arrival boundary produced different campaign truth.");
    }
    const usArrivals = segmentTwo.state.formationOrder
      .map((id) => segmentTwo.state.formations[id])
      .filter((formation) => formation.faction === "Player" && formation.availableFromSegment === 2);
    const germanWaiting = segmentTwo.state.formationOrder
      .map((id) => segmentTwo.state.formations[id])
      .filter((formation) => formation.faction === "Bot" && formation.availableFromSegment === 3);
    const usEvents = segmentTwo.state.eventLog.filter((event) => event.summary === "U.S. follow-on formations arrived at the staging area.");
    if (usArrivals.some((formation) => formation.status !== "ready")
      || germanWaiting.some((formation) => formation.status !== "unavailable")
      || usEvents.length !== 1
      || usEvents[0].details.formationCount !== 2
      || !segmentTwo.state.tiles["0,0"].forces.some((force) => force.unitType === "Infantry_42" && force.count === 2)) {
      throw new Error("The U.S. segment-two release did not update identity, event history, and force projection exactly once.");
    }

    const segmentThree = resolveCampaignSegment(segmentTwo.state, definition);
    if (!segmentThree.ok) throw new Error(segmentThree.error.message);
    const germanArrivals = segmentThree.state.formationOrder
      .map((id) => segmentThree.state.formations[id])
      .filter((formation) => formation.faction === "Bot" && formation.availableFromSegment === 3);
    const germanEvents = segmentThree.state.eventLog.filter((event) => event.summary === "German assembling formations entered the operational reserve.");
    if (germanArrivals.some((formation) => formation.status !== "ready")
      || germanEvents.length !== 1
      || germanEvents[0].details.formationCount !== 3
      || !segmentThree.state.tiles["2,0"].forces.some((force) => force.unitType === "Panzer_IV" && force.count === 2)) {
      throw new Error("The German segment-three release did not update identity, event history, and force projection exactly once.");
    }
    if (validateCampaignRuntimeState(segmentThree.state).length !== 0) {
      throw new Error("Released formation runtime failed invariants.");
    }
  });
});

registerTest("CAMPAIGN_FORMATIONS_RECONCILE_MOVEMENT_AND_RETIREMENT", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const initialInfantryIds = [...runtime.tiles["0,0"].formationIds];
  let movedId = "";

  await Given("two persistent infantry records at the origin and an empty friendly destination", async () => {});

  await When("one legacy aggregate count moves and is then terminally retired", async () => {
    runtime.tiles["0,0"].forces = [{ unitType: "Infantry_42", count: 1, label: "1st Infantry Brigade" }];
    runtime.tiles["0,1"].forces = [{ unitType: "Infantry_42", count: 1, label: "1st Infantry Brigade" }];
    const reconciled = reconcileCampaignFormationForceCounts(runtime, 12, "formation movement test");
    movedId = reconciled.movedFormationIds[0] ?? "";
    if (!movedId) throw new Error("Aggregate movement did not identify the relocated persistent formation.");
    if (!retireCampaignFormation(runtime, movedId, "destroyed", 12, "Formation retirement test.")) {
      throw new Error("Formation retirement was rejected.");
    }
  });

  await Then("movement preserves identity and retirement removes placement without deleting history", async () => {
    if (!initialInfantryIds.includes(movedId)) throw new Error("Movement replaced the formation with a new identity.");
    const retired = runtime.formations[movedId];
    if (!retired || retired.status !== "destroyed" || retired.locationHexKey !== null || retired.retiredSegment !== 12) {
      throw new Error("Retired formation did not retain a terminal campaign record.");
    }
    if (!retired.battleHistory.some((entry) => entry.type === "moved")
      || retired.battleHistory[retired.battleHistory.length - 1]?.type !== "retired"
      || runtime.tiles["0,1"].formationIds.includes(movedId)) {
      throw new Error("Formation movement/retirement history or placement is incomplete.");
    }
    if (validateCampaignRuntimeState(runtime).length !== 0) throw new Error("Lifecycle mutations left an invalid runtime.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_SAVE_AND_INVARIANT_CONTINUITY", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  let validation: ReturnType<typeof validateCampaignSaveEnvelope> | null = null;

  await Given("a complete formation registry inside authoritative campaign truth", async () => {});

  await When("the runtime is checksummed and validated through the named save envelope", async () => {
    const timestamp = "2026-08-04T12:00:00.000Z";
    const envelope = createCampaignSaveEnvelope({
      saveId: "save_formations_roundtrip",
      slotType: "manual",
      gameMode: "campaign",
      createdAt: timestamp,
      updatedAt: timestamp,
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: runtime.scenarioKey,
      campaignId: runtime.campaignId,
      engagementId: null,
      display: {
        campaignTitle: scenario.title,
        segment: runtime.currentSegment,
        phaseLabel: "Planning",
        lastEventSummary: runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? null,
        playTimeSeconds: 0,
        difficulty: null,
        result: null,
        thumbnailKey: null
      },
      payload: {
        runtime,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "formations", selectedEntityId: runtime.formationOrder[0], mapCenter: null, mapZoom: null }
      }
    });
    validation = validateCampaignSaveEnvelope(structuredClone(envelope));
  });

  await Then("formation identity and pools survive exactly while corrupt placement/projection is rejected", async () => {
    if (!validation?.ok) throw new Error(validation?.error.message ?? "Formation envelope did not validate.");
    if (computeCampaignContentHash(validation.envelope.payload.runtime.formations) !== computeCampaignContentHash(runtime.formations)) {
      throw new Error("Save validation changed formation identity or condition state.");
    }
    const corruptPlacement = structuredClone(runtime);
    corruptPlacement.tiles["0,0"].formationIds.push(corruptPlacement.tiles["0,0"].formationIds[0]);
    const placementCodes = new Set(validateCampaignRuntimeState(corruptPlacement).map((issue) => issue.code));
    if (!placementCodes.has("FORMATION_PLACEMENT_INVALID")) throw new Error("Duplicate formation placement was accepted.");
    const corruptProjection = structuredClone(runtime);
    corruptProjection.tiles["0,0"].forces[0].count += 1;
    const projectionCodes = new Set(validateCampaignRuntimeState(corruptProjection).map((issue) => issue.code));
    if (!projectionCodes.has("FORMATION_PROJECTION_INVALID")) throw new Error("Divergent aggregate force projection was accepted.");
  });
});

registerTest("CAMPAIGN_FORMATION_REDEPLOY_TRANSIT_IS_NOT_LOCATION_PRESENCE", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, runtimeOptions(scenario));
  const movingId = runtime.tiles["0,0"].formationIds[0];
  if (!movingId) throw new Error("Transit fixture has no persistent formation to move.");
  let restored: typeof runtime | null = null;

  await Given("one exact ready formation selected for a one-segment redeployment", async () => {
    const order = createRedeployOrderDraft(runtime, {
      faction: "Player",
      payload: {
        originOffsetKey: "0,0",
        destinationOffsetKey: "0,1",
        originRuntimeHexKey: "0,0",
        destinationRuntimeHexKey: "0,1",
        selections: [{ unitType: "Infantry_42", count: 1 }],
        transportModeKey: "foot",
        transportCapacityType: null,
        distance: 1,
        timeSegments: 1,
        etaSegment: runtime.currentSegment + 1,
        returnEtaSegment: runtime.currentSegment + 1,
        fuelCost: 0,
        suppliesCost: 1,
        manpowerCost: 0,
        transportCapacityCost: 0,
        formationIds: [movingId]
      }
    });
    if (!order.validation.valid) throw new Error(order.validation.issues[0]?.message ?? "Exact redeployment draft is invalid.");
    commitCampaignOrderDrafts(runtime, [order.id]);
  });

  await When("the committed in-transit runtime crosses a checksummed save/load boundary", async () => {
    const moving = runtime.formations[movingId];
    const projected = projectLegacyCampaignState(definition, runtime).scenario;
    const origin = projected.tiles.find((tile) => tile.hex.q === 0 && tile.hex.r === 0);
    const originInfantry = origin?.forces?.find((force) => force.unitType === "Infantry_42")?.count ?? 0;
    if (moving.status !== "inTransit" || isCampaignFormationPresentAtLocation(moving)
      || isCampaignFormationBattleEligible(moving) || originInfantry !== 1) {
      throw new Error("Committed transit remained present or battle eligible at its departure location.");
    }

    const context = buildEngagementContext();
    context.availableForces = [{ hexKey: "0,0", unitType: "Infantry_42", count: 1 }];
    context.allocationCaps = { ...context.allocationCaps, infantry: 1 };
    const withProvenance = attachCampaignFormationProvenanceToContext(context, runtime);
    const projectedIds = withProvenance.availableForces.flatMap((group) => group.formationIds ?? []);
    const exactSelection = selectCampaignFormationsForAllocation(runtime, withProvenance, "infantry", 1);
    if (withProvenance.allocationCaps.infantry !== 1
      || projectedIds.includes(movingId) || exactSelection.some((formation) => formation.id === movingId)) {
      throw new Error("An in-transit formation leaked into engagement context or exact commitment selection.");
    }

    const timestamp = "2026-08-26T12:00:00.000Z";
    const envelope = createCampaignSaveEnvelope({
      saveId: "save_formation_transit_roundtrip",
      slotType: "manual",
      gameMode: "campaign",
      createdAt: timestamp,
      updatedAt: timestamp,
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: runtime.scenarioKey,
      campaignId: runtime.campaignId,
      engagementId: null,
      display: {
        campaignTitle: scenario.title,
        segment: runtime.currentSegment,
        phaseLabel: "Planning",
        lastEventSummary: runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? null,
        playTimeSeconds: 0,
        difficulty: null,
        result: null,
        thumbnailKey: null
      },
      payload: {
        runtime,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "formations", selectedEntityId: movingId, mapCenter: null, mapZoom: null }
      }
    });
    const validation = validateCampaignSaveEnvelope(structuredClone(envelope));
    if (!validation.ok) throw new Error(validation.error.message);
    restored = validation.envelope.payload.runtime;
    if (computeCampaignContentHash(restored) !== computeCampaignContentHash(runtime)
      || restored.formations[movingId]?.status !== "inTransit") {
      throw new Error("In-transit identity, order state, or location projection changed across save/load.");
    }
  });

  await Then("arrival restores the same formation at the destination and only then returns it to combat", async () => {
    if (!restored) throw new Error("The transit save did not restore.");
    const arrival = resolveCampaignSegment(restored, definition);
    if (!arrival.ok) throw new Error(arrival.error.message);
    const moved = arrival.state.formations[movingId];
    const originCount = arrival.state.tiles["0,0"].forces
      .filter((force) => force.unitType === "Infantry_42")
      .reduce((sum, force) => sum + force.count, 0);
    const destinationCount = arrival.state.tiles["0,1"].forces
      .filter((force) => force.unitType === "Infantry_42")
      .reduce((sum, force) => sum + force.count, 0);
    const arrivedBaseContext = buildEngagementContext();
    arrivedBaseContext.availableForces = [
      { hexKey: "0,0", unitType: "Infantry_42", count: 1 },
      { hexKey: "0,1", unitType: "Infantry_42", count: 1 }
    ];
    const arrivedContext = attachCampaignFormationProvenanceToContext(arrivedBaseContext, arrival.state);
    const arrivedIds = arrivedContext.availableForces.flatMap((group) => group.formationIds ?? []);
    if (moved.status !== "ready" || moved.locationHexKey !== "0,1"
      || !isCampaignFormationPresentAtLocation(moved) || !isCampaignFormationBattleEligible(moved)
      || originCount !== 1 || destinationCount !== 1 || !arrivedIds.includes(movingId)) {
      throw new Error(`The exact formation did not reappear once, at its destination, after arrival: ${JSON.stringify({
        status: moved.status,
        locationHexKey: moved.locationHexKey,
        present: isCampaignFormationPresentAtLocation(moved),
        battleEligible: isCampaignFormationBattleEligible(moved),
        originCount,
        destinationCount,
        arrivedIds,
        movingId,
        currentOrderId: moved.currentOrderId
      })}`);
    }
    if (validateCampaignRuntimeState(arrival.state).length !== 0) {
      throw new Error("Redeployment arrival left formation placement or aggregate projection invalid.");
    }
  });
});

registerTest("CAMPAIGN_FORMATIONS_TACTICAL_PROVENANCE", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const context = attachCampaignFormationProvenanceToContext(buildEngagementContext(), runtime);
  const friendly = selectCampaignFormationsForAllocation(runtime, context, "infantry", 1)[0];
  const botId = context.enemyForces[0]?.formationIds?.[0];

  await Given("friendly and enemy engagement pools linked to persistent records", async () => {
    if (!friendly || !botId) throw new Error("Formation provenance was not attached to engagement force pools.");
    friendly.name = "Legacy infantry group 1";
  });

  await When("campaign records become friendly deployment and generated enemy tactical units", async () => {});

  await Then("both scales retain deterministic provenance without sharing mutable status pools", async () => {
    const seed = createCampaignFormationBattleSeed(friendly, {
      campaignId: runtime.campaignId,
      engagementId: context.engagementId,
      sourceRevision: runtime.revision,
      sourceSegment: runtime.currentSegment,
      hex: { q: 0, r: 0 }
    });
    if (!seed || seed.unit.campaignProvenance?.formationId !== friendly.id) {
      throw new Error("Friendly tactical seed lost its campaign formation identity.");
    }
    const expectedPresentation = resolveCampaignFormationPresentation({
      legacyLabel: friendly.origin.legacyLabel,
      legacyOrdinal: friendly.origin.legacyOrdinal,
      unitType: friendly.campaignUnitType
    });
    if (seed.unit.campaignProvenance.formationName !== expectedPresentation.formationName) {
      throw new Error("Tactical seed froze a legacy stored name instead of the corrected origin-backed identity.");
    }
    const deployment = new DeploymentState();
    deployment.initialize([{ key: "infantry", label: "Infantry Battalion", remaining: 1, campaignUnits: [seed.unit] }]);
    const reserveUnit = deployment.toScenarioUnits()[0];
    if (reserveUnit?.campaignProvenance?.formationId !== friendly.id || reserveUnit.unitId !== seed.tacticalUnitId) {
      throw new Error("Friendly precombat reserve hydration discarded persistent formation provenance.");
    }
    const originalFit = friendly.personnel.core?.fit ?? 0;
    if (seed.unit.status?.personnel.core) seed.unit.status.personnel.core.fit = Math.max(0, originalFit - 10);
    if ((friendly.personnel.core?.fit ?? 0) !== originalFit) throw new Error("Tactical status mutation leaked into campaign truth.");
    const snapshot = extractCampaignFormationTacticalSnapshot(seed.unit);
    if (snapshot?.campaignFormationId !== friendly.id || snapshot.tacticalUnitId !== seed.tacticalUnitId) {
      throw new Error("Tactical provenance snapshot could not recover the persistent formation identity.");
    }

    const generated = generateCampaignBattleScenario(context, runtime, undefined, "central_channel");
    const rawBotUnits = (generated as unknown as {
      sides: { Bot: { units: Array<{ campaignProvenance?: { formationId: string }; unitId?: string }> } };
    }).sides.Bot.units;
    const persistentBot = rawBotUnits.find((unit) => unit.campaignProvenance?.formationId === botId);
    if (!persistentBot?.unitId) throw new Error("Generated enemy roster lost campaign provenance or deterministic tactical ID.");
    const normalized = normalizeScenarioSource(generated as unknown as RawScenarioInput, { turnLimit: 12 });
    const normalizedBot = normalized.sides.Bot.units.find((unit) => unit.campaignProvenance?.formationId === botId);
    if (!normalizedBot || normalizedBot.unitId !== persistentBot.unitId || !normalizedBot.status) {
      throw new Error("Scenario normalization discarded campaign provenance, stable unit ID, or formation pools.");
    }
  });
});

registerTest("CAMPAIGN_FORMATION_SELECTION_EXCLUDES_READY_FORMATIONS_WITH_ACTIVE_ORDERS", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const context = attachCampaignFormationProvenanceToContext(buildEngagementContext(), runtime);
  const infantryIds = context.availableForces
    .filter((group) => group.unitType === "Infantry_42")
    .flatMap((group) => group.formationIds ?? []);
  let selectedIds: string[] = [];

  await Given("two ready formations are at the front but one already owns a campaign order", () => {
    const ordered = runtime.formations[infantryIds[0]];
    if (!ordered || infantryIds.length !== 2) throw new Error("Ordered-formation fixture is incomplete.");
    ordered.currentOrderId = "order-already-committed";
  });

  await When("the exact precombat selector requests every formation behind the aggregate cap", () => {
    selectedIds = selectCampaignFormationsForAllocation(runtime, context, "infantry", 2).map((formation) => formation.id);
  });

  await Then("only the order-free formation remains selectable for a voluntary attack commitment", () => {
    const orderedId = infantryIds[0];
    const freeId = infantryIds[1];
    if (selectedIds.length !== 1 || selectedIds[0] !== freeId
      || !isCampaignFormationBattleEligible(runtime.formations[orderedId])) {
      throw new Error(`Active-order eligibility diverged: ${JSON.stringify({ infantryIds, selectedIds })}`);
    }
  });
});

registerTest("CAMPAIGN_ENGAGEMENT_CONTEXT_EXCLUDES_SHATTERED_DEFENDERS_BEFORE_PRECOMBAT", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const botId = runtime.formationOrder.find((formationId) => runtime.formations[formationId]?.faction === "Bot") ?? "";
  let context: CampaignEngagementContext;

  await Given("a defeated formation remains physically recorded at the opposing front hex", () => {
    if (!botId || !runtime.formations[botId]) throw new Error("Shattered-defender fixture is incomplete.");
    runtime.formations[botId].status = "shattered";
  });

  await When("the follow-on engagement context is rebuilt from current campaign truth", () => {
    context = attachCampaignFormationProvenanceToContext(buildEngagementContext(), runtime);
  });

  await Then("the unavailable defender is removed before the player enters a stale uncommittable plan", () => {
    if (context.enemyForces.length !== 0 || context.enemyForceValue !== 0
      || context.forceRatio !== Number.MAX_SAFE_INTEGER) {
      throw new Error(`Unavailable defender leaked into the engagement context: ${JSON.stringify(context.enemyForces)}`);
    }
  });
});

registerTest("CAMPAIGN_HEAVY_ARTILLERY_RETAINS_EXACT_TACTICAL_PROVENANCE", async ({ Given, When, Then }) => {
  const formation = createCampaignFormationRecord({
    id: "formation-heavy-artillery",
    faction: "Player",
    ownership: "core",
    name: "1st Heavy Artillery Group",
    campaignUnitType: "Artillery_155mm",
    locationHexKey: "2,2",
    createdSegment: 0,
    origin: {
      kind: "authored",
      initialHexKey: "2,2",
      legacyGroupIndex: null,
      legacyOrdinal: null,
      legacyLabel: "Heavy Artillery"
    }
  });
  let seed: ReturnType<typeof createCampaignFormationBattleSeed> = null;

  await Given("a persistent heavy-artillery formation committed to a tactical engagement", async () => {
    if (formation.formationKey !== "howitzer") {
      throw new Error(`Expected a deployable howitzer proxy, received ${formation.formationKey}.`);
    }
  });

  await When("the campaign formation is converted to its battle-owned unit", async () => {
    seed = createCampaignFormationBattleSeed(formation, {
      campaignId: "campaign-heavy-artillery",
      engagementId: "engagement-heavy-artillery",
      sourceRevision: 3,
      sourceSegment: 4,
      hex: { q: 0, r: 0 }
    });
  });

  await Then("the deployable proxy keeps the exact persistent identity required by result extraction", async () => {
    if (!seed || seed.unit.type !== "Howitzer_105"
      || seed.unit.campaignProvenance?.formationId !== formation.id
      || seed.unit.campaignProvenance.campaignUnitType !== "Artillery_155mm") {
      throw new Error("Heavy artillery did not receive a complete exact-provenance tactical representation.");
    }
  });
});
