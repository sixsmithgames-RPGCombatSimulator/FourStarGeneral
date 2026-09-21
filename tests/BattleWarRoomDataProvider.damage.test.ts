import { registerTest } from "./harness.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BattleWarRoomDataProvider } from "../src/ui/components/BattleWarRoomDataProvider";
import { WarRoomOverlay } from "../src/ui/components/WarRoomOverlay";
import { createEmptyWarRoomData } from "../src/data/warRoomTypes";
import { BattleState } from "../src/state/BattleState";
import type {
  BattleWarRoomInputSnapshot,
  BattleRosterSnapshot,
  LogisticsSnapshot,
  RosterUnitSummary,
  SupplySnapshot
} from "../src/contracts/BattleWarRoomSnapshot";

const DAMAGED_STATUS: NonNullable<RosterUnitSummary["statusSummary"]> = {
  personnel: {
    fit: 105,
    injured: 10,
    wounded: 4,
    severelyWounded: 1,
    killed: 3,
    total: 123,
    casualties: 18,
    nonEffective: 8,
    effective: 110,
    readiness: 89
  },
  equipment: {
    operational: 16,
    damaged: 2,
    disabled: 1,
    destroyed: 1,
    total: 20,
    losses: 4,
    nonOperational: 2,
    effective: 17,
    readiness: 85
  },
  suppression: 2,
  readiness: 63,
  readinessBreakdown: {
    basis: "combined",
    personnelWeight: 0.65,
    equipmentWeight: 0.35,
    personnel: {
      total: 123,
      effective: 110,
      readiness: 89,
      loss: 11
    },
    equipment: {
      total: 20,
      effective: 17,
      readiness: 85,
      loss: 15
    }
  }
};

function createRosterUnit(): RosterUnitSummary {
  return {
    unitId: "u-damaged-armor",
    unitKey: "armor-company",
    label: "1st Armored Company",
    unitType: "Medium Tank",
    unitClass: "armor" as RosterUnitSummary["unitClass"],
    strength: 87.5,
    experience: 2,
    ammo: 6,
    fuel: 8,
    morale: 77,
    location: "2,0",
    status: "frontline",
    orders: [],
    attachments: [],
    tags: [],
    combatPower: 42,
    statusSummary: DAMAGED_STATUS
  };
}

function createRosterSnapshot(): BattleRosterSnapshot {
  const damagedUnit = createRosterUnit();
  return {
    updatedAt: "2026-05-13T12:00:00.000Z",
    frontline: [damagedUnit],
    support: [],
    reserves: [],
    casualties: [],
    metrics: {
      totalUnits: 1,
      frontline: 1,
      support: 0,
      reserve: 0,
      casualties: 0,
      combatPowerTotal: damagedUnit.combatPower,
      reserveDepth: 0
    }
  };
}

function createLogisticsSnapshot(): LogisticsSnapshot {
  return {
    turn: 3,
    deployedUnits: 3,
    connectedUnits: 3,
    isolatedUnits: 0,
    convoyUnits: 1,
    loadedConvoys: 1,
    convoyCargo: { ammo: 10, fuel: 12 },
    depotStock: { ammo: 40, fuel: 50, parts: 8 },
    supplySources: [],
    stockpiles: [],
    convoyStatuses: [],
    supportTeamStatuses: [
      {
        unitId: "u-medical",
        teamLabel: "Aid Section",
        type: "medical",
        route: "2,0",
        status: "treating",
        etaHours: 1,
        assignedUnitLabel: "1st Armored Company",
        assignedHex: "2,0",
        need: 15,
        lastTurnEffect: "stabilized 2 wounded",
        incident: null
      },
      {
        unitId: "u-maintenance",
        teamLabel: "Maintenance Section",
        type: "repair",
        route: "2,0",
        status: "repairing",
        etaHours: 2,
        assignedUnitLabel: "1st Armored Company",
        assignedHex: "2,0",
        need: 4,
        lastTurnEffect: "recovered 1 damaged vehicle",
        incident: null
      }
    ],
    priorityTargets: [
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "high",
        ammoNeed: 3,
        fuelNeed: 4,
        assignedConvoys: 1,
        status: "delivering"
      }
    ],
    careTargets: [
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "critical",
        type: "medical",
        need: 15,
        assignedAssets: 1,
        lastTurnEffect: "stabilized 2 wounded"
      },
      {
        unitId: "u-damaged-armor",
        unitLabel: "1st Armored Company",
        hex: "2,0",
        priority: "high",
        type: "repair",
        need: 4,
        assignedAssets: 1,
        lastTurnEffect: "recovered 1 damaged vehicle"
      }
    ],
    delayNodes: [],
    maintenanceBacklog: [],
    alerts: []
  };
}

function createSupplySnapshot(): SupplySnapshot {
  return {
    faction: "Player",
    turn: 3,
    phase: "playerTurn",
    updatedAt: "2026-05-13T12:00:00.000Z",
    categories: [
      {
        resource: "ammo",
        label: "Ammunition",
        total: 16,
        frontlineTotal: 16,
        reserveTotal: 0,
        stockpileTotal: 40,
        averagePerUnit: 5.3,
        consumptionPerTurn: 2,
        estimatedDepletionTurns: 8,
        trend: [18, 17, 16],
        status: "stable"
      },
      {
        resource: "fuel",
        label: "Fuel",
        total: 20,
        frontlineTotal: 20,
        reserveTotal: 0,
        stockpileTotal: 50,
        averagePerUnit: 6.7,
        consumptionPerTurn: 3,
        estimatedDepletionTurns: 7,
        trend: [24, 22, 20],
        status: "stable"
      }
    ],
    alerts: [],
    stockpile: {
      ammo: 40,
      fuel: 50,
      rations: 0,
      parts: 8
    },
    ledger: []
  };
}

function createWarRoomInput(
  overrides: Partial<BattleWarRoomInputSnapshot> = {}
): BattleWarRoomInputSnapshot {
  return {
    turn: { phase: "playerTurn", activeFaction: "Player", turnNumber: 3 },
    roster: createRosterSnapshot(),
    reserves: [],
    mission: {
      missionKey: "training",
      title: "Damage Verification",
      briefing: "HQ should report detailed losses.",
      objectives: ["Hold the line."],
      doctrine: "Preserve combat power.",
      turnLimit: 12,
      baselineSupplies: []
    },
    logistics: createLogisticsSnapshot(),
    playerSupply: createSupplySnapshot(),
    enemyContacts: [],
    reconnaissanceUnits: [],
    combatReports: [],
    airMissionReports: [],
    campaign: null,
    ...overrides
  };
}

registerTest("WAR_ROOM_PROVIDER_USES_DETAILED_DAMAGE_STATUS_FOR_HQ_CHANNELS", async ({ Given, Then }) => {
  let provider!: BattleWarRoomDataProvider;

  await Given("an HQ data provider backed by roster status pools and logistics recovery queues", async () => {
    const fakeBattleState = {
      getWarRoomInputSnapshot: () => createWarRoomInput(),
      subscribeToBattleUpdates: () => () => undefined
    };
    provider = new BattleWarRoomDataProvider(fakeBattleState as unknown as BattleState);
  });

  await Then("the HQ snapshot exposes personnel, equipment, logistics, readiness, and field-report damage details", async () => {
    const snapshot = provider.getSnapshot();

    if (snapshot.casualtyLedger.kia !== 3 || snapshot.casualtyLedger.wia !== 15) {
      throw new Error(`Expected detailed personnel ledger KIA 3 / WIA 15, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.casualtyLedger.injured !== 10 || snapshot.casualtyLedger.wounded !== 4 || snapshot.casualtyLedger.severelyWounded !== 1) {
      throw new Error(`Expected separated injury severities, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.casualtyLedger.equipmentDamaged !== 2 || snapshot.casualtyLedger.equipmentDisabled !== 1 || snapshot.casualtyLedger.equipmentDestroyed !== 1) {
      throw new Error(`Expected detailed equipment ledger, saw ${JSON.stringify(snapshot.casualtyLedger)}.`);
    }
    if (snapshot.readinessState.percentage !== 63 || snapshot.readinessState.personnelReadiness !== 89 || snapshot.readinessState.equipmentReadiness !== 85) {
      throw new Error(`Expected readiness to come from detailed status pools, saw ${JSON.stringify(snapshot.readinessState)}.`);
    }
    if (!snapshot.requisitions.some((entry) => entry.item.includes("Medical treatment")) || !snapshot.requisitions.some((entry) => entry.item.includes("Equipment repair"))) {
      throw new Error(`Expected medical and repair requisitions, saw ${JSON.stringify(snapshot.requisitions)}.`);
    }
    if (snapshot.logisticsSummary.supportTeamCount !== 2 || snapshot.logisticsSummary.careRequestCount !== 2) {
      throw new Error(`Expected HQ logistics summary to include support teams and care queue, saw ${JSON.stringify(snapshot.logisticsSummary)}.`);
    }
    if (!snapshot.commandOrders.some((entry) => entry.title.includes("Damage Assessment") && entry.objective.includes("2 damaged, 1 disabled, 1 destroyed"))) {
      throw new Error(`Expected damage assessment field report with equipment detail, saw ${JSON.stringify(snapshot.commandOrders)}.`);
    }

    provider.dispose();
  });
});

registerTest("WAR_ROOM_PROVIDER_PRESERVES_FROZEN_CAMPAIGN_TIME", async ({ Given, Then }) => {
  let provider!: BattleWarRoomDataProvider;

  await Given("a tactical battle committed during the D+1 morning campaign segment", async () => {
    const fakeBattleState = {
      getWarRoomInputSnapshot: () => createWarRoomInput({
        turn: { phase: "playerTurn", activeFaction: "Player", turnNumber: 4 },
        mission: {
          missionKey: "campaign",
          campaignTitle: "Normandy Campaign",
          title: "Omaha-Gold Engagement",
          briefing: "Hold the campaign line.",
          objectives: ["Hold the line."],
          doctrine: "Preserve the committed force.",
          turnLimit: null,
          baselineSupplies: []
        },
        campaign: {
          committedSegment: 11,
          scenarioTitle: "Normandy Campaign",
          historicalCalendar: { startDateIso: "1944-06-06", operationDayOffset: 0 }
        }
      }),
      subscribeToBattleUpdates: () => () => undefined
    };
    provider = new BattleWarRoomDataProvider(fakeBattleState as unknown as BattleState);
  });

  await Then("the War Room reports the frozen campaign date instead of tactical turn four", async () => {
    const timing = provider.getSnapshot().campaignClock;
    if (timing.day !== 2
      || timing.dayLabel !== "D+1 · 7 June 1944"
      || timing.time !== "09:00–12:00"
      || timing.note !== "Normandy Campaign"
      || timing.phase !== "Tactical Engagement") {
      throw new Error(`Expected exact committed campaign timing, saw ${JSON.stringify(timing)}.`);
    }
    const timeAuthority = readFileSync("src/game/campaign/CampaignSegmentTime.ts", "utf8");
    const campaignStateSource = readFileSync("src/state/CampaignState.ts", "utf8");
    const providerSource = readFileSync("src/ui/components/BattleWarRoomDataProvider.ts", "utf8");
    assert.match(timeAuthority, /export function formatCampaignSegmentTime\(/);
    assert.doesNotMatch(campaignStateSource, /const dayIndex = Math\.floor\(segment \/ 8\)/);
    assert.doesNotMatch(providerSource, /const dayIndex = Math\.floor\(segment \/ 8\)/);
    provider.dispose();
  });
});

registerTest("WAR_ROOM_PROVIDER_DELEGATES_TO_THE_STATE_BOUNDARY_AND_PRESERVES_UPDATE_SUBSCRIPTIONS", async ({ Given, When, Then }) => {
  let boundaryReads = 0;
  let directEngineReads = 0;
  let updateListener: (() => void) | null = null;
  let unsubscribeCount = 0;
  let publishedUpdates = 0;
  let provider!: BattleWarRoomDataProvider;

  await Given("a BattleState seam whose legacy engine accessors fail if the provider reaches through", () => {
    const fakeBattleState = {
      getWarRoomInputSnapshot: () => {
        boundaryReads += 1;
        return createWarRoomInput();
      },
      hasEngine: () => {
        directEngineReads += 1;
        throw new Error("War Room must not inspect engine readiness directly.");
      },
      ensureGameEngine: () => {
        directEngineReads += 1;
        throw new Error("War Room must not receive the live GameEngine.");
      },
      subscribeToBattleUpdates: (listener: () => void) => {
        updateListener = listener;
        return () => { unsubscribeCount += 1; };
      }
    };
    provider = new BattleWarRoomDataProvider(fakeBattleState as unknown as BattleState);
    provider.subscribe(() => { publishedUpdates += 1; });
  });

  await When("the provider reads data, receives a battle update, and is disposed", () => {
    provider.getSnapshot();
    (updateListener as (() => void) | null)?.();
    provider.dispose();
  });

  await Then("one canonical detached read supplies the view and the state subscription is released", () => {
    assert.equal(boundaryReads, 1);
    assert.equal(directEngineReads, 0);
    assert.equal(publishedUpdates, 1);
    assert.equal(unsubscribeCount, 1);
  });
});

registerTest("BATTLE_STATE_WAR_ROOM_BOUNDARY_IS_DETACHED_AND_RESET_CLEARS_ITS_SOLE_SUPPLY_CACHE", async ({ Given, When, Then }) => {
  const state = new BattleState();
  const roster = createRosterSnapshot();
  const logistics = createLogisticsSnapshot();
  const supply = createSupplySnapshot();
  const engine = {
    playerUnits: [{ type: "Recon", hex: { q: 2, r: 1 } }],
    getTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 3 }),
    getRosterSnapshot: () => roster,
    getReserveSnapshot: () => [],
    getLogisticsSnapshot: () => logistics,
    getSupplySnapshot: () => supply,
    getEnemyContactSnapshot: () => [],
    getCombatReports: () => [],
    getAirMissionReports: () => []
  };
  let first!: NonNullable<ReturnType<BattleState["getWarRoomInputSnapshot"]>>;
  let second!: NonNullable<ReturnType<BattleState["getWarRoomInputSnapshot"]>>;

  await Given("a live authority behind BattleState's single War Room read boundary", () => {
    Object.defineProperty(state, "gameEngine", { value: engine, writable: true });
  });

  await When("a consumer mutates its projection and the state is read again before reset", () => {
    first = state.getWarRoomInputSnapshot()!;
    (first.roster.frontline[0] as { label: string }).label = "mutated UI label";
    first.playerSupply!.stockpile.ammo = -1;
    first.reconnaissanceUnits[0]!.hex.q = 99;
    second = state.getWarRoomInputSnapshot()!;
  });

  await Then("engine facts and the sole cached supply snapshot remain detached, then reset atomically", () => {
    assert.equal(roster.frontline[0]!.label, "1st Armored Company");
    assert.equal(supply.stockpile.ammo, 40);
    assert.equal(engine.playerUnits[0]!.hex.q, 2);
    assert.equal(second.roster.frontline[0]!.label, "1st Armored Company");
    assert.equal(second.playerSupply!.stockpile.ammo, 40);
    assert.equal(second.reconnaissanceUnits[0]!.hex.q, 2);
    assert.equal(state.getSupplySnapshot("Player")!.stockpile.ammo, 40);

    state.resetEngineState();
    assert.equal(state.getWarRoomInputSnapshot(), null);
    assert.equal(state.getSupplySnapshot("Player"), null);
  });
});

registerTest("WAR_ROOM_DIRECTIVE_ACKNOWLEDGEMENT_GIVES_VISIBLE_AND_ACCESSIBLE_FEEDBACK", async ({ Given, When, Then }) => {
  let overlay!: WarRoomOverlay;

  await Given("an open War Room command-order report with one active directive", async () => {
    document.body.innerHTML = `
      <div id="warRoomOverlay" class="war-room-overlay hidden" aria-hidden="true">
        <div class="war-room-surface" tabindex="-1">
          <div id="warRoomAnnouncer" aria-live="polite"></div>
          <div data-war-room-command-strip></div>
          <div class="war-room-hotspot-layer"></div>
          <button id="warRoomClose" type="button">Close</button>
          <div id="warRoomDetail" class="hidden">
            <button id="warRoomDetailClose" type="button">Close details</button>
            <h3 id="warRoomDetailTitle"></h3>
            <p id="warRoomDetailMeta"></p>
            <div id="warRoomDetailBody"></div>
          </div>
        </div>
      </div>`;
    const snapshot = createEmptyWarRoomData();
    snapshot.commandOrders = [{
      title: "Mission Objective 1",
      objective: "Secure the eastern crossing.",
      priority: "high"
    }];
    overlay = new WarRoomOverlay({
      dataProvider: { getSnapshot: () => snapshot },
      hotspots: [{
        id: "orders",
        label: "Command Orders",
        ariaDescription: "Review active directives.",
        coords: { x: 0, y: 0, width: 10, height: 10 },
        focusOrder: 1,
        dataKey: "commandOrders"
      }]
    });
    overlay.open();
    document.querySelector<HTMLButtonElement>('[data-hotspot-id="orders"]')?.click();
  });

  await When("the commander acknowledges the directive", async () => {
    const acknowledge = document.querySelector<HTMLButtonElement>('[data-war-room-action="acknowledge-directive"]');
    if (!acknowledge || acknowledge.disabled) {
      throw new Error("Expected an enabled directive acknowledgement control before activation.");
    }
    acknowledge.click();
  });

  await Then("the action becomes acknowledged and the live region confirms it", async () => {
    const acknowledged = document.querySelector<HTMLButtonElement>('[data-war-room-action="acknowledge-directive"]');
    const announcement = document.querySelector<HTMLElement>("#warRoomAnnouncer")?.textContent ?? "";
    if (!acknowledged?.disabled || acknowledged.textContent?.trim() !== "Acknowledged") {
      throw new Error("Expected the acknowledged directive to become visibly disabled instead of remaining an enabled no-op.");
    }
    if (announcement !== "Mission Objective 1 acknowledged.") {
      throw new Error(`Expected accessible acknowledgement feedback, saw '${announcement}'.`);
    }
    overlay.dispose();
    document.body.innerHTML = "";
  });
});
