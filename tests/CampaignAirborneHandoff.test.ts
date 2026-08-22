import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioSide, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import terrainData from "../src/data/terrain.json";
import { createScenarioUnitFromTemplate, findTemplateForUnitKey } from "../src/game/adapters";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import { ensureDeploymentState, resetDeploymentState } from "../src/state/DeploymentState";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function side(): ScenarioSide {
  return {
    hq: { q: 0, r: 1 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

function scenario(): ScenarioData {
  const row = Array.from({ length: 7 }, () => ({ tile: "plain" }));
  return {
    name: "Campaign Airborne Ground Handoff",
    size: { cols: 7, rows: 3 },
    tilePalette: {
      plain: {
        terrain: "plains",
        terrainType: "rural",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 0,
    sides: { Player: side(), Bot: side() }
  } as ScenarioData;
}

function engineFor(activeScenario: ScenarioData): GameEngine {
  const config: GameEngineConfig = {
    scenario: activeScenario,
    unitTypes,
    terrain,
    playerSide: activeScenario.sides.Player,
    botSide: activeScenario.sides.Bot
  };
  return new GameEngine(config);
}

function campaignAirborneUnit(index: number): ScenarioUnit {
  const template = findTemplateForUnitKey("airborneDetachment");
  if (!template) throw new Error("Airborne deployment template is unavailable.");
  const unit = createScenarioUnitFromTemplate(template, { q: 0, r: 0 });
  return {
    ...unit,
    unitId: `campaign-airborne-${index}`,
    campaignProvenance: {
      campaignId: "western-europe",
      formationId: `british-6th-airborne-${index}`,
      engagementId: "caen-counterattack",
      sourceRevision: 2,
      sourceSegment: 2,
      faction: "Player",
      ownership: "core",
      formationName: `British 6th Airborne group ${index}`,
      campaignUnitType: "Paratrooper"
    }
  };
}

function lineInfantryUnit(): ScenarioUnit {
  const template = findTemplateForUnitKey("infantry");
  if (!template) throw new Error("Infantry deployment template is unavailable.");
  return createScenarioUnitFromTemplate(template, { q: 0, r: 0 });
}

registerTest("CAMPAIGN_AIRBORNE_FORMATIONS_ENTER_TACTICAL_BATTLE_ON_THE_GROUND", async ({ Given, When, Then }) => {
  let groundTypes: string[] = [];
  let campaignRosterReserves = 0;
  let serializedCampaignAirborne = 0;
  let genericGroundCount = -1;
  let genericAirborneCount = -1;
  const normalizationWarnings: string[] = [];

  await Given("two campaign airborne formations already ashore and one ordinary line formation", async () => {
    resetDeploymentState();
  });

  await When("the campaign package and an ordinary airborne requisition cross the deployment boundary", async () => {
    const deploymentState = ensureDeploymentState();
    const campaignAirborne = [campaignAirborneUnit(1), campaignAirborneUnit(2)];
    const infantry = lineInfantryUnit();
    deploymentState.initialize([
      {
        key: "airborneDetachment",
        label: "Parachute Infantry Company",
        remaining: campaignAirborne.length,
        campaignUnits: campaignAirborne
      },
      {
        key: "infantry",
        label: "Infantry Battalion",
        remaining: 1,
        campaignUnits: [infantry]
      }
    ]);

    const campaignEngine = engineFor(scenario());
    campaignEngine.initializeFromAllocations([...campaignAirborne, infantry]);
    groundTypes = campaignEngine.getReserveSnapshot().map((entry) => String(entry.unit.type)).sort();
    campaignRosterReserves = campaignEngine.getRosterSnapshot().metrics.reserve;
    serializedCampaignAirborne = campaignEngine.serialize().airborneReserves?.length ?? 0;

    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const message = args.map((entry) => String(entry)).join(" ");
      if (message.includes("Engine snapshot omitted exhausted unit key")) {
        normalizationWarnings.push(message);
      }
    };
    try {
      deploymentState.mirrorEngineState(campaignEngine);
    } finally {
      console.warn = originalWarn;
    }

    resetDeploymentState();
    const genericDeployment = ensureDeploymentState();
    genericDeployment.initialize([{
      key: "airborneDetachment",
      label: "Parachute Infantry Company",
      remaining: 1
    }]);
    const genericEngine = engineFor(scenario());
    genericEngine.initializeFromAllocations([createScenarioUnitFromTemplate(
      findTemplateForUnitKey("airborneDetachment")!,
      { q: 0, r: 0 }
    )]);
    genericGroundCount = genericEngine.getReserveSnapshot().length;
    genericAirborneCount = genericEngine.serialize().airborneReserves?.length ?? 0;
  });

  await Then("campaign airborne fights as ground infantry while a new airborne requisition still waits for air transport", async () => {
    try {
      const expectedTypes = ["Infantry_42", "Paratrooper", "Paratrooper"].sort();
      if (JSON.stringify(groundTypes) !== JSON.stringify(expectedTypes)) {
        throw new Error(`Expected the complete campaign ground package, received ${JSON.stringify(groundTypes)}.`);
      }
      if (campaignRosterReserves !== 3 || serializedCampaignAirborne !== 0) {
        throw new Error(`Campaign airborne was hidden from the tactical reserve roster (${campaignRosterReserves}) or diverted to air reserves (${serializedCampaignAirborne}).`);
      }
      if (normalizationWarnings.length > 0) {
        throw new Error(`Campaign handoff emitted an exhausted-key normalization warning: ${normalizationWarnings.join(" | ")}`);
      }
      if (genericGroundCount !== 0 || genericAirborneCount !== 1) {
        throw new Error(`Generic airborne requisition routing changed: ground=${genericGroundCount}, airborne=${genericAirborneCount}.`);
      }
    } finally {
      resetDeploymentState();
    }
  });
});
