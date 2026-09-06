/** Frozen briefing consumer contracts: enemy wording cannot relabel or mutate the Player's committed force. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData, CampaignEngagementContext } from "../src/core/campaignTypes";
import type { CampaignIntelligenceBriefing } from "../src/core/campaignIntelTypes";
import type { CampaignBattlePackage } from "../src/game/campaign/engagements/CampaignEngagementLedgerTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { getAllocationOption, type UnitAllocationOption } from "../src/data/unitAllocation";
import { ensureCampaignState } from "../src/state/CampaignState";
import { BattleState } from "../src/state/BattleState";
import { PrecombatScreen } from "../src/ui/screens/PrecombatScreen";

const markup = new JSDOM(readFileSync("index.html", "utf8")).window.document.querySelector("#precombatScreen")!.outerHTML;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function scenario(): CampaignScenarioData {
  return {
    key: "central_channel", title: "Precombat intelligence contract", description: "Opposing forces on adjacent positions.",
    dimensions: { cols: 4, rows: 2 }, background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: { player: { role: "region", factionControl: "Player" }, bot: { role: "region", factionControl: "Bot" } },
    tiles: [
      { tile: "player", hex: { q: 2, r: 0 }, forces: [{ unitType: "Infantry_42", count: 9 }, { unitType: "Paratrooper", count: 6 }, { unitType: "Medium_Tank", count: 3 }] },
      { tile: "bot", hex: { q: 1, r: 0 }, forces: [{ unitType: "Infantry_42", count: 21 }] }
    ],
    fronts: [], objectives: [],
    economies: ["Player", "Bot"].map(faction => ({ faction, manpower: 100000, supplies: 1000, fuel: 1000, ammo: 1000, airPower: 0, navalPower: 0, intelCoverage: 0 }))
  };
}
function committedPackage(defending: boolean, contacts: 0 | 2): CampaignBattlePackage {
  const campaign = ensureCampaignState(); campaign.reset(); campaign.setScenario(scenario());
  const context = campaign.buildCampaignEngagementContext({
    engagementId: `briefing-${defending ? "defense" : "attack"}-${contacts}`,
    attacker: defending ? "Bot" : "Player", battleHexKey: defending ? "2,1" : "1,0"
  }, "Player");
  assert.ok(context);
  // Supply legacy briefing prose before canonical commitment; never rewrite an existing package or its hashes.
  const briefing: CampaignIntelligenceBriefing = {
    observerFaction: "Player", generatedSegment: 0, battleHexKey: context.battleHexKey,
    confidenceBand: contacts ? "medium" : "low", resistanceBand: "unknown",
    summary: "Enemy strength and number of formations are not assessed.",
    contacts: Array.from({ length: contacts }, (_, index) => ({
      contactId: `known-contact-${index}`, label: `Reported ground activity ${index}`, level: "located",
      confidenceBand: "medium", locationHexKey: "1,0", uncertaintyRadius: 1, ageSegments: 0
    })),
    explicitUnknowns: contacts
      ? ["Defender strength and number of formations", "Defender readiness", "Defender supply state", "Unobserved reserves outside the collection area"]
      : ["Defender strength", "Reserve locations", "Readiness and supply", "Defender readiness beyond the collection area"]
  };
  context.intelligenceBriefing = briefing;
  campaign.setPendingEngagements([{
    id: context.engagementId, frontKey: null, objectiveKey: null, attacker: context.attacker, defender: context.defender,
    hexKeys: [context.battleHexKey], tags: defending ? ["player-defense"] : [], context
  }]);
  campaign.setActiveEngagementId(context.engagementId);
  const committed = campaign.commitCampaignEngagement({
    engagementId: context.engagementId, expectedRevision: campaign.getRuntimeSnapshot()!.revision,
    selections: defending ? [{ allocationKey: "infantry", category: "units", quantity: 21, unitRpCost: 50 }] : [
      { allocationKey: "infantry", category: "units", quantity: 9, unitRpCost: 50 },
      { allocationKey: "airborneDetachment", category: "units", quantity: 6, unitRpCost: 40 },
      { allocationKey: "tank", category: "units", quantity: 3, unitRpCost: 100 }
    ]
  });
  assert.ok(committed.ok, committed.ok ? "" : committed.reason);
  // A serialized snapshot with its original identity/hash models the existing saved-briefing consumer boundary.
  return freeze(JSON.parse(JSON.stringify(committed.package)) as CampaignBattlePackage);
}
interface PrecombatConsumer {
  activeMissionKey: "campaign";
  engagementContext: CampaignEngagementContext;
  campaignBattlePackage: CampaignBattlePackage;
  cacheElements(): void;
  primeAllocationState(): void;
  rerenderAllocations(): void;
  renderEngagementContextBanner(): void;
  getEffectiveMaxQuantity(option: UnitAllocationOption): number;
}

for (const defending of [false, true]) for (const contacts of [0, 2] as const) {
  registerTest(`FSG_CAM_100_PRECOMBAT_INTELLIGENCE_${defending ? "DEFENDER" : "ATTACKER"}_${contacts}_CONTACTS`, () => {
    const pkg = committedPackage(defending, contacts);
    const campaign = ensureCampaignState();
    const beforeRuntime = campaign.getRuntimeSnapshot();
    const serialized = JSON.stringify(pkg);
    const hash = computeCampaignContentHash(pkg);
    document.body.innerHTML = markup;
    const screen = new PrecombatScreen({ showScreen() {}, showScreenById() {}, getCurrentScreen() { return null; } }, new BattleState());
    // Exercise the shipped banner and allocation/budget consumers, without map painting or tactical setup.
    const consumer = screen as unknown as PrecombatConsumer;
    consumer.activeMissionKey = "campaign"; consumer.campaignBattlePackage = pkg; consumer.engagementContext = pkg.context;
    consumer.cacheElements(); consumer.primeAllocationState(); consumer.rerenderAllocations();
    const root = screen.getElement();
    const budgetBefore = [root.querySelector("#budgetSpent")!.textContent, root.querySelector("#budgetRemaining")!.textContent];
    const allocationBefore = root.querySelector("#allocationUnitList")!.innerHTML;
    try {
      assert.equal(pkg.context.intelligenceBriefing?.observerFaction, "Player");
      // Ordinary attack retains the existing catalog cap; mandatory defense retains all six committed airborne formations.
      for (const [key, expected] of [["infantry", 9], ["airborneDetachment", defending ? 6 : 4], ["tank", 3]] as const) {
        assert.equal(consumer.getEffectiveMaxQuantity(getAllocationOption(key)!), expected);
      }
      if (defending) assert.deepEqual(budgetBefore, ["990 RP used", "0 RP available"]);
      else assert.equal(budgetBefore.reduce((sum, text) => sum + Number(text?.replace(/[^0-9]/g, "")), 0), 1160);
      consumer.renderEngagementContextBanner();
      const banner = root.querySelector<HTMLElement>("#engagementContextBanner")!;
      assert.ok(banner);
      assert.match(banner.textContent!, new RegExp(`Enemy estimate.*Unknown resistance · ${contacts ? "medium" : "low"} confidence · ${contacts} contacts`));
      if (defending) assert.match(banner.textContent!, /Committed defense.*18 formations: 12 line formations · 6 airborne formations already on the ground/);
      else assert.match(banner.textContent!, /Forces in range.*18 combat-ready ground formations/);
      const details = banner.querySelector<HTMLDetailsElement>("details")!;
      assert.equal(details.open, false); details.open = true;
      const expected = contacts
        ? "Enemy strength and number of formations · Enemy readiness · Enemy supply state · Unobserved reserves outside the collection area"
        : "Enemy strength · Reserve locations · Readiness and supply · Defender readiness beyond the collection area";
      assert.equal(details.textContent, `4 intelligence unknowns${expected}`);
      assert.doesNotMatch(banner.textContent!, /21 formations|1,050|1050|heavy resistance|overwhelming resistance/i);
      consumer.renderEngagementContextBanner();
      assert.equal(root.querySelector("#engagementContextBanner details")!.textContent, `4 intelligence unknowns${expected}`);
      assert.deepEqual([root.querySelector("#budgetSpent")!.textContent, root.querySelector("#budgetRemaining")!.textContent], budgetBefore);
      assert.equal(root.querySelector("#allocationUnitList")!.innerHTML, allocationBefore);
      assert.equal(JSON.stringify(pkg), serialized);
      assert.equal(computeCampaignContentHash(pkg), hash);
      assert.deepEqual(campaign.getActiveCampaignBattlePackage(), pkg);
      assert.deepEqual(campaign.getRuntimeSnapshot(), beforeRuntime);
    } finally { campaign.reset(); root.remove(); }
  });
}
