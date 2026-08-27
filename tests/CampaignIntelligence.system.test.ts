import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import campaignScenarioData from "../src/data/campaign01.json";
import { CampaignState } from "../src/state/CampaignState";
import { deriveCampaignFrontsFromControl } from "../src/game/campaign/control/CampaignBattleControlResolver";
import {
  createCampaignRuntime,
  projectLegacyCampaignState,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import {
  buildCampaignMapView,
  buildIntelligenceBriefing,
  createCampaignKnowledgeState,
  createIntelOperation,
  recordBattlefieldIntelligence,
  resolveCampaignIntelligenceSegment,
  scheduleBaselineBotOperation
} from "../src/state/CampaignIntelligence";

function economy(faction: "Player" | "Bot") {
  return {
    faction,
    manpower: 20_000,
    supplies: 10_000,
    fuel: 10_000,
    ammo: 5_000,
    airPower: 0,
    navalPower: 0,
    intelCoverage: 0
  };
}

function intelligenceScenario(): CampaignScenarioData {
  return {
    key: "intel-system-test",
    title: "Intelligence Boundary Test",
    description: "Separated forces prevent passive observation.",
    dimensions: { cols: 8, rows: 4 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      playerRegion: {
        role: "region",
        factionControl: "Player",
        forces: [{ unitType: "Infantry_42", count: 99, label: "palette-player" }]
      },
      botRegion: {
        role: "region",
        factionControl: "Bot",
        forces: [{ unitType: "Panzer_IV", count: 77, label: "palette-secret" }]
      }
    },
    tiles: [
      {
        tile: "playerRegion",
        factionControl: "Player",
        hex: { q: 0, r: 0 },
        forces: [{ unitType: "Recon_Bike", count: 2, label: "Player scouts" }]
      },
      {
        tile: "botRegion",
        factionControl: "Bot",
        hex: { q: 5, r: 0 },
        forces: [
          { unitType: "Panzer_IV", count: 12, label: "Secret 12th Panzer" },
          { unitType: "Infantry_42", count: 8, label: "Secret infantry" }
        ]
      }
    ],
    fronts: [],
    objectives: [],
    economies: [economy("Player"), economy("Bot")]
  };
}

registerTest("CAMPAIGN_INTEL_PROJECTION_STRIPS_TRUTH", async ({ Given, Then }) => {
  const scenario = intelligenceScenario();
  const knowledge = createCampaignKnowledgeState(scenario, "Player", 0);

  await Given("an enemy force outside every friendly observation radius", async () => {
    if (knowledge.contacts.length !== 0) throw new Error("Hidden enemy should not seed a contact.");
  });

  await Then("the map projection contains neither enemy forces nor enemy economy", async () => {
    const view = buildCampaignMapView(scenario, knowledge, 0);
    const enemyTile = view.scenario.tiles.find((tile) => tile.factionControl === "Bot");
    if (enemyTile) throw new Error("Unconfirmed hostile runtime tile leaked into the map projection.");
    if (view.scenario.tilePalette.botRegion) throw new Error("Unused hostile palette truth leaked into the map projection.");
    if (view.scenario.economies.some((entry) => entry.faction === "Bot")) throw new Error("Enemy economy leaked into the map projection.");
    if (/Secret 12th Panzer|"count":12|palette-secret/.test(JSON.stringify(view))) {
      throw new Error("Exact enemy truth is serialized in the player-facing map model.");
    }
  });
});

registerTest("CAMPAIGN_INTEL_COVERAGE_DOES_NOT_REVEAL_HIDDEN_RUNTIME_NODES", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const knowledge = createCampaignKnowledgeState(scenario, "Player", 0);
  let before: string[] = [];
  let after: string[] = [];

  await Given("a Player recon screen and no briefed installation inside its collection radius", () => {
    before = buildCampaignMapView(scenario, knowledge, 0).coverage
      .map((entry) => `${entry.hexKey}:${entry.strength}`)
      .sort();
  });
  await When("a force-empty hostile runtime installation is added without Player knowledge", () => {
    scenario.tilePalette.hiddenInstallation = {
      role: "logisticsHub",
      factionControl: "Bot",
      spriteKey: "logisticsHub",
      notes: "Hidden runtime-only installation"
    };
    scenario.tiles.push({ tile: "hiddenInstallation", factionControl: "Bot", hex: { q: 2, r: 0 }, forces: [] });
    after = buildCampaignMapView(scenario, knowledge, 0).coverage
      .map((entry) => `${entry.hexKey}:${entry.strength}`)
      .sort();
  });
  await Then("coverage remains pure map geometry and the hidden node leaves no projection fingerprint", () => {
    const serialized = JSON.stringify(buildCampaignMapView(scenario, knowledge, 0));
    if (before.join("|") !== after.join("|") || /hiddenInstallation|Hidden runtime-only/.test(serialized)) {
      throw new Error("The intelligence coverage overlay disclosed an unbriefed hostile runtime node.");
    }
  });
});

registerTest("CAMPAIGN_INTEL_COVERAGE_EXCLUDES_SCHEDULED_FORMATIONS_UNTIL_ARRIVAL", async ({ Given, When, Then }) => {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const knowledge = createCampaignKnowledgeState(scenario, "Player", 0);
  const bristolHexKey = "5,5";
  let openingCoverage = new Set<string>();
  let firstArrivalCoverage = new Set<string>();
  let secondArrivalCoverage = new Set<string>();

  await Given("Bristol contains only divisions scheduled for segments six and eight", () => {
    const bristol = scenario.tiles.find((tile) => tile.tile === "bristolBuildUp");
    if (!bristol?.forces?.length
      || bristol.forces.some((force) => (force.availableFromSegment ?? 0) < 6)) {
      throw new Error("The shipped Bristol arrival fixture changed unexpectedly.");
    }
  });
  await When("Player coverage is projected before and at both arrival boundaries", () => {
    openingCoverage = new Set(buildCampaignMapView(scenario, knowledge, 0).coverage.map((entry) => entry.hexKey));
    firstArrivalCoverage = new Set(buildCampaignMapView(scenario, knowledge, 6).coverage.map((entry) => entry.hexKey));
    secondArrivalCoverage = new Set(buildCampaignMapView(scenario, knowledge, 8).coverage.map((entry) => entry.hexKey));
  });
  await Then("the empty hub casts no screen until its first formations actually arrive", () => {
    if (openingCoverage.has(bristolHexKey)
      || !firstArrivalCoverage.has(bristolHexKey)
      || !secondArrivalCoverage.has(bristolHexKey)) {
      throw new Error("Scheduled Bristol formations generated intelligence coverage before becoming present.");
    }
  });
});

registerTest("CAMPAIGN_BRIEFED_SITES_PROJECT_WITHOUT_HOSTILE_RUNTIME_TRUTH", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  scenario.tilePalette.botRegion = {
    ...scenario.tilePalette.botRegion,
    role: "navalBase",
    spriteKey: "navalBase",
    mapLabel: "Hidden runtime name",
    notes: "Hidden live installation note",
    supplyValue: 99,
    productionCapacity: 88,
    navalCapacity: 77
  };
  scenario.tiles.push({
    tile: "botRegion",
    factionControl: "Bot",
    hex: { q: 6, r: 0 },
    forces: [{ unitType: "Infantry_Elite", count: 14, label: "Hidden second garrison" }]
  });
  scenario.briefedStrategicSites = [{
    key: "briefed-port",
    observerFaction: "Player",
    hex: { q: 5, r: 0 },
    label: "Charted coastal port",
    role: "navalBase",
    summary: "Port facilities are charted here; current control, condition, and garrison are unconfirmed.",
    sourceLabel: "Pre-operation naval survey",
    spriteKey: "navalBase",
    category: "enemyInstallation",
    locationPrecision: "fixed"
  }];
  scenario.briefedStrategicRegions = [{
    key: "thames-network",
    observerFaction: "Player",
    label: "Thames build-up network",
    category: "alliedSupport",
    summary: "A dispersed support network outside the exact registered map.",
    sourceLabel: "Naval loading plan",
    locations: ["Tilbury", "Harwich"],
    commandStatus: "Context only"
  }];
  const knowledge = createCampaignKnowledgeState(scenario, "Player", 0);
  let view: ReturnType<typeof buildCampaignMapView>;

  await Given("one charted site and two hidden hostile runtime installations", () => {});
  await When("the Player-safe campaign map is assembled", () => {
    view = buildCampaignMapView(scenario, knowledge, 0);
  });
  await Then("only the authored fixed-site briefing survives and no mutable enemy truth is serialized", () => {
    const sites = view.knownStrategicSites ?? [];
    const regions = view.knownStrategicRegions ?? [];
    const serialized = JSON.stringify(view);
    if (sites.length !== 1
      || sites[0]?.id !== "briefed-port"
      || sites[0]?.locationHexKey !== "5,2"
      || sites[0]?.sourceLabel !== "Pre-operation naval survey"
      || regions.length !== 1
      || regions[0]?.label !== "Thames build-up network"
      || view.scenario.tiles.some((tile) => tile.factionControl === "Bot")
      || view.scenario.tilePalette.botRegion
      || view.scenario.briefedStrategicSites
      || view.scenario.briefedStrategicRegions
      || /Hidden runtime name|Hidden live installation note|Hidden second garrison|Secret 12th Panzer|navalCapacity|productionCapacity|supplyValue/.test(serialized)
      || /observerFaction|factionControl":"Bot/.test(JSON.stringify(sites))) {
      throw new Error(`Known-site projection crossed the opposing-truth boundary: ${serialized}`);
    }
  });
});

registerTest("CAMPAIGN_BRIEFED_SITES_PERSIST_AS_CONTENT_BUT_NEVER_FORM_FRONTS", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  scenario.briefedStrategicSites = [{
    key: "adjacent-charted-site",
    observerFaction: "Player",
    hex: { q: 1, r: 0 },
    label: "Charted relay station",
    role: "intelNode",
    summary: "The fixed relay location is known; current activity is not.",
    sourceLabel: "Theater signals directory",
    spriteKey: "logisticsHub",
    category: "enemyInstallation",
    locationPrecision: "fixed"
  }];
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "briefed-site-front-boundary",
    seed: 7,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {}
  });
  let projection: ReturnType<typeof projectLegacyCampaignState>;

  await Given("a briefing site adjacent to friendly runtime ground but no runtime tile for the site", () => {});
  await When("the authored definition is projected and current fronts are derived", () => {
    projection = projectLegacyCampaignState(definition, runtime);
  });
  await Then("the site survives authored-content projection without entering tile truth or front legality", () => {
    if (definition.map.briefedStrategicSites?.[0]?.key !== "adjacent-charted-site"
      || projection.scenario.briefedStrategicSites?.[0]?.key !== "adjacent-charted-site"
      || runtime.tileOrder.includes("1,0")
      || deriveCampaignFrontsFromControl(runtime).length !== 0) {
      throw new Error("A knowledge-only strategic site became mutable tile or front truth.");
    }
  });
});

registerTest("CAMPAIGN_INTEL_COLLECTION_DECAYS", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);
  const operation = createIntelOperation(player, "groundRecon", "5,2", 0, "0,0:Recon_Bike");
  player.operations.push(operation);
  let resolved: Record<string, typeof player> = { Player: player, Bot: bot };

  await Given("a ground reconnaissance order against an unobserved sector", async () => {});

  await When("the collection window resolves", async () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 1) as Record<string, typeof player>;
  });

  await Then("the report creates a banded contact without an exact unit count", async () => {
    const view = buildCampaignMapView(scenario, resolved.Player, 1);
    if (view.enemyContacts.length !== 1) throw new Error(`Expected one fused contact, found ${view.enemyContacts.length}.`);
    const serialized = JSON.stringify(view.enemyContacts[0]);
    if (view.enemyContacts[0].level === "unknown") throw new Error("Collection did not produce an actionable contact.");
    if (serialized.includes("truthEntityKey") || serialized.includes("synthetic") || serialized.includes('"count"')) {
      throw new Error("Player contact contains internal correlation or exact-count fields.");
    }
  });

  await When("two more segments pass without another source", async () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 2) as Record<string, typeof player>;
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 3) as Record<string, typeof player>;
  });

  await Then("the contact becomes stale and its location uncertainty expands", async () => {
    const contact = resolved.Player.contacts[0];
    if (contact.state !== "stale" && contact.state !== "lost") throw new Error(`Expected stale/lost contact, got ${contact.state}.`);
    if (contact.uncertaintyRadius < 2) throw new Error("Mobile contact uncertainty did not expand with age.");
  });
});

registerTest("CAMPAIGN_COUNTERINTEL_AND_DECEPTION_ARE_FACTION_LOCAL", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);
  player.operations.push(createIntelOperation(player, "groundRecon", "5,2", 0, "0,0:Recon_Bike"));
  let resolved = resolveCampaignIntelligenceSegment(scenario, { Player: player, Bot: bot }, 1);
  const priorConfidence = resolved.Player.contacts[0]?.confidence ?? 0;

  await Given("the player has a contact and the enemy has its own counter-recon resources", async () => {
    if (priorConfidence <= 0) throw new Error("Collection prerequisite did not produce a contact.");
    resolved.Bot.operations.push(createIntelOperation(resolved.Bot, "counterRecon", "5,2", 1, "5,2:Infantry_42"));
    resolved.Bot.operations.push(createIntelOperation(resolved.Bot, "phantom", "1,0", 0));
  });

  await When("enemy counter-recon and phantom operations resolve", async () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 2);
  });

  await Then("counter-recon degrades the player's belief and deception appears only as a normal projected contact", async () => {
    const realContact = resolved.Player.contacts.find((contact) => contact.truthEntityKey === "force:5,2");
    if (!realContact || realContact.confidence >= priorConfidence) throw new Error("Counter-recon did not degrade the opposing picture.");
    const view = buildCampaignMapView(scenario, resolved.Player, 2);
    const phantom = view.enemyContacts.find((contact) => contact.locationHexKey === "1,0");
    if (!phantom) throw new Error("Observable phantom activity did not enter the enemy picture.");
    if (/synthetic|deception:|truthEntityKey/.test(JSON.stringify(phantom))) throw new Error("The deception contact exposes its hidden adjudication fields.");
  });
});

registerTest("CAMPAIGN_AI_HAS_NO_MAGIC_COLLECTION_TARGET", async ({ Given, Then }) => {
  const scenario = intelligenceScenario();
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);

  await Given("the bot has no contact, objective, or front hint about the hidden player force", async () => {});

  await Then("baseline AI cannot target that force from raw scenario truth", async () => {
    const operation = scheduleBaselineBotOperation(scenario, bot, 0);
    if (operation !== null) throw new Error(`Bot selected ${operation.targetHexKey} despite having no knowledge-derived target.`);
  });
});

registerTest("CAMPAIGN_INTEL_ASSETS_COMMIT_AND_OBEY_RANGE", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const state = new CampaignState();
  const distantState = new CampaignState();
  state.setScenario(structuredClone(scenario));
  distantState.setScenario(structuredClone(scenario));
  const asset = state.getEligibleIntelAssets("groundRecon", "Player", "5,2")[0];
  const distantAsset = distantState.getEligibleIntelAssets("groundRecon", "Player")[0];
  let firstResult: ReturnType<CampaignState["scheduleIntelOperation"]> | null = null;
  let duplicateResult: ReturnType<CampaignState["scheduleIntelOperation"]> | null = null;
  let distantResult: ReturnType<CampaignState["scheduleIntelOperation"]> | null = null;

  await Given("one ground-recon asset and targets inside and outside its operating radius", async () => {
    if (!asset || !distantAsset) throw new Error("Test scenario did not expose its recon asset.");
  });

  await When("the asset is assigned twice and another copy is sent out of range", async () => {
    firstResult = state.scheduleIntelOperation({ type: "groundRecon", targetHexKey: "5,2", assignedAssetKey: asset!.assetKey });
    duplicateResult = state.scheduleIntelOperation({ type: "groundRecon", targetHexKey: "5,2", assignedAssetKey: asset!.assetKey });
    distantResult = distantState.scheduleIntelOperation({ type: "groundRecon", targetHexKey: "7,3", assignedAssetKey: distantAsset!.assetKey });
  });

  await Then("the first order succeeds while duplicate and out-of-range assignments are rejected", async () => {
    if (!firstResult?.ok) throw new Error("Valid first assignment was rejected.");
    if (duplicateResult?.ok) throw new Error("A committed reconnaissance asset was assigned twice.");
    if (distantResult?.ok) throw new Error("A ground-recon asset was assigned beyond its operating range.");
  });
});

registerTest("CAMPAIGN_INTEL_ASSET_CHOICES_AGGREGATE_AUTHORED_FORMATIONS", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  scenario.tiles[0]!.forces = [
    { unitType: "Recon_Bike", count: 1, label: "2nd Cavalry Reconnaissance Squadron" },
    { unitType: "Recon_Bike", count: 2, label: "4th Cavalry Reconnaissance Squadron" }
  ];
  const state = new CampaignState({ legacyStorage: null });
  let assets: ReturnType<CampaignState["getEligibleIntelAssets"]> = [];

  await Given("two authored reconnaissance groups share one operational asset key", () => {
    state.setScenario(scenario);
  });
  await When("the Intelligence composer requests eligible ground reconnaissance assets", () => {
    assets = state.getEligibleIntelAssets("groundRecon", "Player");
  });
  await Then("one unique option uses authored names, total availability, and a player-facing location", () => {
    if (assets.length !== 1
      || !assets[0]!.label.includes("2nd Cavalry Reconnaissance Squadron")
      || !assets[0]!.label.includes("4th Cavalry Reconnaissance Squadron")
      || !assets[0]!.label.includes("3 groups")
      || !assets[0]!.label.includes("Hex 0,0")
      || /Recon_Bike|0,0:Recon_Bike/.test(assets[0]!.label)) {
      throw new Error(`Intelligence assets remain duplicated or implementation-facing: ${JSON.stringify(assets)}`);
    }
    if (state.getIntelAssetDisplayLabel("groundRecon", assets[0]!.assetKey) !== assets[0]!.label) {
      throw new Error("Committed intelligence orders cannot recover the same player-facing asset label.");
    }
  });
});

registerTest("CAMPAIGN_INTEL_BRIEFINGS_REPORT_ONE_NET_CHANGE_PER_CONTACT", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  scenario.tiles.splice(1, 0, {
    tile: "playerRegion",
    factionControl: "Player",
    hex: { q: 0, r: 1 },
    forces: [{ unitType: "Recon_Bike", count: 1, label: "Supporting reconnaissance squadron" }]
  });
  scenario.tiles[2]!.hex = { q: 1, r: 0 };
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);
  player.contacts = [];
  player.sourceReports = [];
  player.briefEvents = [];
  let resolved: Record<string, typeof player> = { Player: player, Bot: bot };

  await Given("two independent observers can report the same previously unknown enemy concentration", () => {});
  await When("all passive collection and confidence changes resolve in one segment", () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 1) as Record<string, typeof player>;
  });
  await Then("the player receives one new-contact brief and no synthetic upgrade/downgrade storm", () => {
    const contact = resolved.Player.contacts[0];
    if (!contact) throw new Error("Passive observers did not create the expected contact.");
    const events = resolved.Player.briefEvents.filter((event) => event.segment === 1 && event.contactId === contact.id);
    if (events.length !== 1 || events[0]!.kind !== "new"
      || events.some((event) => event.kind === "upgraded" || event.kind === "downgraded")) {
      throw new Error(`One contact produced redundant same-segment reports: ${JSON.stringify(events)}`);
    }
  });
});

registerTest("CAMPAIGN_INTEL_GROUPS_ROUTINE_MULTI_CONTACT_DECLINES", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);
  const baseContact = {
    observerFaction: "Player" as const,
    subjectKind: "force" as const,
    level: "located" as const,
    state: "current" as const,
    confidence: 46,
    uncertaintyRadius: 0,
    domain: "ground" as const,
    lastObservedSegment: 0,
    lastUpdatedSegment: 0,
    sourceReportIds: ["report-old"],
    sourceLabels: ["Old patrol report"],
    analystNotes: ["No recent confirmation."]
  };
  player.contacts = [
    { ...baseContact, id: "contact-aging-1", locationHexKey: "5,2", truthEntityKey: "force:5,2" },
    { ...baseContact, id: "contact-aging-2", locationHexKey: "7,3", truthEntityKey: "force:7,3" }
  ];
  player.briefEvents = [];
  let resolved: Record<string, typeof player> = { Player: player, Bot: bot };

  await Given("multiple old contacts genuinely lose confidence during the same quiet resolution", () => {});
  await When("the campaign resolves their net end-of-segment intelligence state", () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 2) as Record<string, typeof player>;
  });
  await Then("one briefing delta summarizes the routine decline without hiding current contact detail", () => {
    const events = resolved.Player.briefEvents.filter((event) => event.segment === 2
      && (event.kind === "downgraded" || event.kind === "stale"));
    if (events.length !== 1
      || events[0]!.contactId !== undefined
      || !events[0]!.detail.includes("2 contact assessments")) {
      throw new Error(`Routine confidence loss still floods unread reporting: ${JSON.stringify(events)}`);
    }
    if (resolved.Player.contacts.length !== 2 || resolved.Player.contacts.some((contact) => contact.level !== "reported")) {
      throw new Error("Briefing aggregation changed authoritative contact assessments.");
    }
  });
});

registerTest("CAMPAIGN_INTEL_OPERATION_BRIEF_ROUTES_TO_ITS_PROJECTED_CONTACT", async ({ Given, When, Then }) => {
  const scenario = intelligenceScenario();
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  const bot = createCampaignKnowledgeState(scenario, "Bot", 0);
  player.operations.push(createIntelOperation(player, "groundRecon", "5,2", 0, "0,0:Recon_Bike"));
  let resolved = resolveCampaignIntelligenceSegment(scenario, { Player: player, Bot: bot }, 1);
  const contactId = resolved.Player.contacts[0]?.id;

  await Given("a commander verifies one existing projected contact", () => {
    if (!contactId) throw new Error("The prerequisite collection did not produce a projected contact.");
    resolved.Player.briefEvents.forEach((event) => { event.read = true; });
    resolved.Player.operations.push(createIntelOperation(
      resolved.Player,
      "verify",
      "5,2",
      1,
      "0,0:Infantry_42",
      contactId
    ));
  });
  await When("the verification result reaches the Intelligence briefing", () => {
    resolved = resolveCampaignIntelligenceSegment(scenario, resolved, 2);
  });
  await Then("the operation report points only to the safe contact identity", () => {
    const event = resolved.Player.briefEvents.find((entry) => entry.segment === 2 && entry.kind === "operation");
    if (!event || event.contactId !== contactId) {
      throw new Error(`Verification report cannot route to its projected contact: ${JSON.stringify(event)}`);
    }
  });
});

registerTest("CAMPAIGN_INTEL_NEVER_CALLS_UNASSESSED_STRENGTH_LIGHT", async ({ Given, Then }) => {
  const scenario = intelligenceScenario();
  const player = createCampaignKnowledgeState(scenario, "Player", 0);
  player.contacts.push({
    id: "contact-unassessed",
    observerFaction: "Player",
    subjectKind: "force",
    level: "located",
    state: "current",
    confidence: 58,
    locationHexKey: "5,2",
    uncertaintyRadius: 0,
    domain: "ground",
    lastObservedSegment: 0,
    lastUpdatedSegment: 0,
    sourceReportIds: ["report-1"],
    sourceLabels: ["Forward patrol"],
    analystNotes: ["Location confirmed; strength unassessed."],
    truthEntityKey: "force:5,2"
  });

  await Given("a located enemy contact whose formation strength has not been assessed", () => {});
  await Then("the engagement briefing says strength and formation count are unknown", () => {
    const briefing = buildIntelligenceBriefing(player, "5,2", 0);
    if (briefing.resistanceBand !== "unknown"
      || !/strength and number of formations are not assessed/i.test(briefing.summary)
      || !briefing.explicitUnknowns.some((entry) => /number of formations/i.test(entry))) {
      throw new Error(`The briefing still presents an unknown concentration as light resistance: ${JSON.stringify(briefing)}`);
    }
  });
});

registerTest("CAMPAIGN_BATTLE_REPORT_AND_SAVE_PERSIST", async ({ Given, When, Then }) => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage
  });
  window.localStorage.clear();
  const scenario = intelligenceScenario();
  const initial = createCampaignKnowledgeState(scenario, "Player", 0);
  const postBattle = recordBattlefieldIntelligence(scenario, initial, "5,2", 0);
  const state = new CampaignState();

  await Given("a completed battle and a scheduled campaign intelligence operation", async () => {
    if (!postBattle.sourceReports.some((report) => report.sourceType === "battleReport")) {
      throw new Error("Battlefield handoff did not generate a battle report.");
    }
    state.setScenario(scenario);
    const asset = state.getEligibleIntelAssets("groundRecon", "Player")[0];
    const scheduled = state.scheduleIntelOperation({
      type: "groundRecon",
      targetHexKey: "5,2",
      assignedAssetKey: asset?.assetKey
    });
    if (!scheduled.ok) throw new Error(`Could not schedule persistence test operation: ${scheduled.reason}`);
    if ("seed" in scheduled.operation) throw new Error("Scheduling returned an internal operation seed to the caller.");
    state.saveToStorage();
  });

  const restored = new CampaignState();
  await When("a fresh campaign state loads the local versioned snapshot", async () => {
    restored.loadFromStorage();
  });

  await Then("operations persist while public views remain seed-free and truth-free", async () => {
    const operations = restored.getIntelOperations("Player");
    if (operations.length !== 1) throw new Error(`Expected one restored operation, found ${operations.length}.`);
    if ("seed" in operations[0]) throw new Error("Operation seed leaked through the UI projection.");
    const view = restored.getCampaignMapView("Player");
    if (!view || view.scenario.economies.some((entry) => entry.faction === "Bot")) {
      throw new Error("Restored player view contains enemy economy truth.");
    }
  });
});
