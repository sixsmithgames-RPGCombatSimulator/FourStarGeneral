import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { AirEngagementEvent, AirMissionReportEntry, BotTurnSummary } from "../src/game/GameEngine";

registerTest("BATTLESCREEN_ENEMY_ACTIVITY_LOG_SHOWS_COUNTERFIRE_DAMAGE", async ({ When, Then }) => {
  const published: Array<{ summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  (screen as any).publishActivityEvent = (event: { summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };

  const botSummary: BotTurnSummary = {
    moves: [],
    attacks: [
      {
        attackerType: "Panzer_IV",
        defenderType: "Heavy_Tank",
        from: { q: 10, r: 9 },
        target: { q: 12, r: 7 },
        inflictedDamage: 14,
        defenderDestroyed: false,
        retaliation: {
          damage: 6,
          terrainDefense: 2,
          accuracyMod: -10,
          attackerStrengthAfter: 52
        }
      }
    ],
    supplyReport: null
  };

  await When("enemy attacks are mirrored into the activity log", async () => {
    (screen as any).logBotTurnActivity(botSummary);
  });

  await Then("the attack entry should include the retaliation damage against the enemy attacker", async () => {
    if (published.length !== 1) {
      throw new Error(`Expected 1 activity entry, received ${published.length}.`);
    }

    const [entry] = published;
    if (!entry.summary.includes("Counterfire dealt 6 damage; attacker strength now 52.")) {
      throw new Error(`Expected counterfire summary in activity log, received: ${entry.summary}`);
    }

    if ((entry.details?.retaliationDamage as number | undefined) !== 6) {
      throw new Error(`Expected retaliation damage detail of 6, received ${String(entry.details?.retaliationDamage)}.`);
    }

    if ((entry.details?.attackerStrengthAfter as number | undefined) !== 52) {
      throw new Error(`Expected attacker strength detail of 52, received ${String(entry.details?.attackerStrengthAfter)}.`);
    }
  });
});

registerTest("BATTLESCREEN_DEFENSIVE_AIR_EVENTS_LOG_PLAYER_REACTIONS", async ({ When, Then }) => {
  const published: Array<{ category: string; summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  (screen as any).publishActivityEvent = (event: { category: string; summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };
  (screen as any).announceBattleUpdate = () => {};
  (screen as any).toTitleCase = (value: string) => value.replace(/_/g, " ");

  const flakEvent: AirEngagementEvent = {
    type: "flak",
    location: { q: 12, r: -6 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
    interceptors: [{ faction: "Player", unitKey: "flak-1", unitType: "Flak_88", strength: 100, hex: { q: 11, r: -5 } }],
    escorts: [],
    flakDamage: 18,
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 82,
    bomberDestroyed: false
  };

  const interceptEvent: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 12, r: -6 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 82 },
    interceptors: [{ faction: "Player", unitKey: "cap-1", unitType: "Fighter", strength: 100 }],
    escorts: [{ faction: "Bot", unitKey: "escort-1", unitType: "Fighter", strength: 100 }],
    bomberStrengthBefore: 82,
    bomberStrengthAfter: 58,
    bomberDestroyed: false,
    interceptorAttrition: 17,
    interceptorKills: 1
  };

  await When("player flak and CAP react during enemy air operations", async () => {
    (screen as any).announceFlakEngagement(flakEvent);
    (screen as any).announceAirInterceptEngagement(interceptEvent);
  });

  await Then("both defensive air events should appear in the player activity log", async () => {
    if (published.length !== 2) {
      throw new Error(`Expected 2 defensive air log entries, received ${published.length}.`);
    }

    if (published[0]?.category !== "player" || !published[0].summary.includes("Flak battery engaged incoming Bomber")) {
      throw new Error(`Expected player flak activity entry, saw ${JSON.stringify(published[0])}.`);
    }

    if (published[1]?.category !== "player" || !published[1].summary.includes("Player air patrol intercepted enemy Bomber")) {
      throw new Error(`Expected player interception activity entry, saw ${JSON.stringify(published[1])}.`);
    }

    if (!published[1].summary.includes("Interception damage: 24%. Bomber strength now 58.")) {
      throw new Error(`Expected interception damage summary in activity log, saw ${published[1].summary}.`);
    }

    if (!published[1].summary.includes("Interceptors took 17% damage and lost 1 flight.")) {
      throw new Error(`Expected interceptor attrition summary in activity log, saw ${published[1].summary}.`);
    }

    if ((published[1].details?.interceptionDamage as number | undefined) !== 24) {
      throw new Error(`Expected interception damage detail of 24, received ${String(published[1].details?.interceptionDamage)}.`);
    }

    if ((published[1].details?.interceptorAttrition as number | undefined) !== 17) {
      throw new Error(`Expected interceptor attrition detail of 17, received ${String(published[1].details?.interceptorAttrition)}.`);
    }

    if ((published[1].details?.interceptorKills as number | undefined) !== 1) {
      throw new Error(`Expected interceptor kill detail of 1, received ${String(published[1].details?.interceptorKills)}.`);
    }

    if ((published[1].details?.bomberStrengthAfter as number | undefined) !== 58) {
      throw new Error(`Expected bomber strength-after detail of 58, received ${String(published[1].details?.bomberStrengthAfter)}.`);
    }
  });
});

registerTest("BATTLESCREEN_AIR_MISSION_LOGS_SURFACE_ESCORT_AND_CAP_ATTRITION", async ({ When, Then }) => {
  const published: Array<{ category: string; summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  const reports: AirMissionReportEntry[] = [
    {
      id: "escort-report-1",
      missionId: "escort-1",
      turnResolved: 3,
      timestamp: "2026-04-03T03:16:00.000Z",
      faction: "Bot",
      unitType: "Fighter",
      unitKey: "escort-1",
      kind: "escort",
      escortTargetUnitKey: "bomber-1",
      interceptions: 1,
      interceptorAttrition: 21,
      outcome: {
        type: "escort",
        result: "success",
        details: "Escort engaged hostile interceptors while covering the linked strike package.",
        refitRequired: true,
        interceptions: 1,
        protectedUnitKey: "bomber-1",
        meta: {
          interceptorAttrition: 21,
          interceptorKills: 1,
          escortAttrition: 6
        }
      }
    },
    {
      id: "cap-report-1",
      missionId: "cap-1",
      turnResolved: 3,
      timestamp: "2026-04-03T03:16:00.000Z",
      faction: "Player",
      unitType: "Interceptor",
      unitKey: "cap-1",
      kind: "airCover",
      targetHex: { q: 14, r: -7 },
      interceptions: 1,
      bomberAttrition: 24,
      interceptorAttrition: 9,
      outcome: {
        type: "airCover",
        result: "success",
        details: "Combat air patrol disrupted the strike package.",
        refitRequired: true,
        interceptions: 1,
        protectedHex: { q: 14, r: -7 },
        meta: {
          bomberAttrition: 24,
          capKills: 1,
          interceptorAttrition: 9
        }
      }
    }
  ];

  (screen as any).seenAirReportIds = new Set<string>();
  (screen as any).battleState = {
    ensureGameEngine: () => ({
      getAirMissionReports: () => reports
    })
  };
  (screen as any).publishActivityEvent = (event: { category: string; summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };
  (screen as any).resolveAirSquadronLabel = () => "Bomber @ 1,11";

  await When("resolved escort and CAP reports are mirrored into the activity log", async () => {
    (screen as any).syncAirMissionLogs();
  });

  await Then("the summaries should include the missing air-combat attrition details", async () => {
    if (published.length !== 2) {
      throw new Error(`Expected 2 air mission activity entries, received ${published.length}.`);
    }

    if (!published[0]!.summary.includes("21 damage to interceptors")) {
      throw new Error(`Expected escort summary to include interceptor attrition, saw ${published[0]!.summary}.`);
    }

    if (!published[0]!.summary.includes("1 interceptor destroyed")) {
      throw new Error(`Expected escort summary to include interceptor kill count, saw ${published[0]!.summary}.`);
    }

    if (!published[0]!.summary.includes("escort losses 6%")) {
      throw new Error(`Expected escort summary to include escort losses, saw ${published[0]!.summary}.`);
    }

    if (!published[1]!.summary.includes("24 damage to strike package")) {
      throw new Error(`Expected CAP summary to include bomber attrition, saw ${published[1]!.summary}.`);
    }

    if (!published[1]!.summary.includes("strike package destroyed")) {
      throw new Error(`Expected CAP summary to include strike-package kill, saw ${published[1]!.summary}.`);
    }

    if (!published[1]!.summary.includes("patrol losses 9%")) {
      throw new Error(`Expected CAP summary to include patrol losses, saw ${published[1]!.summary}.`);
    }

    if (!published[1]!.summary.includes("target 14,0")) {
      throw new Error(`Expected CAP summary to use player-facing offset coordinates, saw ${published[1]!.summary}.`);
    }
  });
});

registerTest("BATTLESCREEN_AIR_MISSION_LOGS_FORMAT_STRIKE_TARGETS_IN_OFFSET_COORDINATES", async ({ When, Then }) => {
  const published: Array<{ category: string; summary: string; details?: Record<string, unknown> }> = [];
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;

  const reports: AirMissionReportEntry[] = [
    {
      id: "strike-report-1",
      missionId: "strike-1",
      turnResolved: 7,
      timestamp: "2026-04-04T04:29:00.000Z",
      faction: "Bot",
      unitType: "Bomber",
      unitKey: "bomber-1",
      kind: "strike",
      targetHex: { q: 14, r: -7 },
      outcome: {
        type: "strike",
        result: "partial",
        details: "Strike package damaged the target.",
        refitRequired: true,
        damageInflicted: 24,
        defenderType: "Artillery_105"
      }
    }
  ];

  (screen as any).seenAirReportIds = new Set<string>();
  (screen as any).battleState = {
    ensureGameEngine: () => ({
      getAirMissionReports: () => reports
    })
  };
  (screen as any).publishActivityEvent = (event: { category: string; summary: string; details?: Record<string, unknown> }) => {
    published.push(event);
  };

  await When("resolved strike reports are mirrored into the activity log", async () => {
    (screen as any).syncAirMissionLogs();
  });

  await Then("the strike summary should use offset map coordinates instead of raw axial coordinates", async () => {
    if (published.length !== 1) {
      throw new Error(`Expected 1 strike activity entry, received ${published.length}.`);
    }

    if (!published[0]!.summary.includes("target 14,0")) {
      throw new Error(`Expected strike summary to use offset coordinates, saw ${published[0]!.summary}.`);
    }

    if (published[0]!.summary.includes("14,-7")) {
      throw new Error(`Did not expect raw axial coordinates in the strike summary, saw ${published[0]!.summary}.`);
    }
  });
});
