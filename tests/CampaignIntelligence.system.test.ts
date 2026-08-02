import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CampaignState } from "../src/state/CampaignState";
import {
  buildCampaignMapView,
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
    if ((enemyTile?.forces?.length ?? 0) !== 0) throw new Error("Enemy tile forces leaked into the map projection.");
    if ((view.scenario.tilePalette.botRegion.forces?.length ?? 0) !== 0) throw new Error("Enemy palette forces leaked into the map projection.");
    if (view.scenario.economies.some((entry) => entry.faction === "Bot")) throw new Error("Enemy economy leaked into the map projection.");
    if (/Secret 12th Panzer|"count":12|palette-secret/.test(JSON.stringify(view))) {
      throw new Error("Exact enemy truth is serialized in the player-facing map model.");
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
