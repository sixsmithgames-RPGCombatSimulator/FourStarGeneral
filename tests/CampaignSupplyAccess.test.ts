/** The shared read must preserve the operational control resolver's supply policy. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { getCampaignFriendlySupplyNetwork, hasCampaignFriendlySupplyAccess } from "../src/game/campaign/logistics/CampaignSupplyAccess";
import { CampaignState } from "../src/state/CampaignState";

registerTest("CAMPAIGN_SUPPLY_ACCESS_PRESERVES_SOURCE_RULES_FACTION_BOUNDARIES_AND_READ_PURITY", async ({ When, Then }) => {
  const scenario: CampaignScenarioData = {
    key: "supply-access", title: "Supply access", description: "Canonical connectivity boundaries.",
    hexScaleKm: 10, dimensions: { cols: 8, rows: 6 }, background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      hub: { role: "logisticsHub", factionControl: "Player", supplyValue: 0 },
      plain: { role: "region", factionControl: "Player", supplyValue: 0 },
      depot: { role: "region", factionControl: "Bot", supplyValue: 1 }
    },
    tiles: [
      { tile: "hub", hex: { q: 0, r: 0 }, factionControl: "Player", forces: [] },
      { tile: "plain", hex: { q: 1, r: 0 }, factionControl: "Player", forces: [] },
      { tile: "plain", hex: { q: 2, r: 0 }, factionControl: "Bot", forces: [] },
      { tile: "plain", hex: { q: 3, r: 0 }, factionControl: "Player", forces: [] },
      { tile: "depot", hex: { q: 2, r: 1 }, factionControl: "Bot", forces: [] },
      { tile: "depot", hex: { q: 4, r: 0 }, factionControl: "Neutral", forces: [] },
      { tile: "depot", hex: { q: 6, r: 0 }, factionControl: "Player", forces: [] }
    ],
    fronts: [], objectives: [],
    economies: ["Player", "Bot"].map((faction) => ({
      faction, manpower: 0, supplies: 0, fuel: 0, ammo: 0, airPower: 0, navalPower: 0, intelCoverage: 0
    }))
  };
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(scenario);
  const runtime = campaign.getRuntimeSnapshot();
  assert.ok(runtime);
  const definition = splitLegacyCampaignScenario(scenario);
  const source = structuredClone(runtime);
  let player: ReturnType<typeof getCampaignFriendlySupplyNetwork>;
  await When("recovery and operational callers inspect supply across friendly, enemy and neutral cells", () => {
    player = getCampaignFriendlySupplyNetwork(runtime, definition, "Player");
    assert.deepEqual([...player.sources].sort(), ["0,0", "6,0"]);
    assert.deepEqual([...player.reachable].sort(), ["0,0", "1,0", "6,0"]);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "1,0"), true);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "3,0"), false);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "2,0"), false);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "4,0"), false);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "missing"), false);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Bot", "2,0"), true);
  });
  await Then("reads own no live state and cannot lend another faction supply", () => {
    assert.deepEqual(runtime, source);
    (player.reachable as Set<string>).clear();
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Player", "1,0"), true);
    assert.equal(hasCampaignFriendlySupplyAccess(runtime, definition, "Bot", "1,0"), false);
    assert.deepEqual(runtime, source);
  });
});
