import type { ScenarioData, ScenarioSide } from "../core/types";
import type { AirEngagementEvent } from "../game/GameEngine";

export interface AirshowHarnessFixture {
  readonly missionId: string;
  readonly locKey: string;
  readonly bomberOriginKey: string;
  readonly bomberTargetKey: string;
  readonly bomberArrivalDelayMs: number;
  readonly renderScenario: ScenarioData;
  readonly engagement: AirEngagementEvent;
  readonly flakEvent: AirEngagementEvent;
  readonly linkedEscortFlights: readonly Record<string, unknown>[];
  readonly originKeysByUnitId: Readonly<Record<string, string>>;
  readonly strengthByUnitId: Readonly<Record<string, number>>;
  readonly playerHqKey: string;
  readonly botHqKey: string;
}

function createSide(hqQ: number, hqR: number): ScenarioSide {
  return {
    hq: { q: hqQ, r: hqR },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

export function buildAirshowHarnessFixture(): AirshowHarnessFixture {
  const tileKey = "plains";
  const row = Array.from({ length: 10 }, () => ({ tile: tileKey }));
  const renderScenario = {
    name: "Airshow Harness Scenario",
    size: { cols: 10, rows: 10 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: Array.from({ length: 10 }, () => row),
    objectives: [],
    turnLimit: 6,
    sides: {
      Player: createSide(0, 0),
      Bot: createSide(9, 5)
    }
  } as unknown as ScenarioData;

  const missionId = "e2e-airshow-contested-package";
  const locKey = "5,7";
  const bomberOriginKey = "1,7";
  const bomberTargetKey = "7,8";
  const bomberArrivalDelayMs = 220;
  const playerHqKey = "0,0";
  const botHqKey = "9,9";

  const originKeysByUnitId = {
    "cap-1": "8,6",
    "cap-2": "8,7",
    "cap-3": "8,8",
    "escort-1": "2,6",
    "escort-2": "2,7",
    "bomber-1": bomberOriginKey
  } as const;

  const strengthByUnitId = {
    "cap-1": 25,
    "cap-2": 25,
    "cap-3": 25,
    "escort-1": 25,
    "escort-2": 25,
    "bomber-1": 100
  } as const;

  const engagement: AirEngagementEvent = {
    type: "airToAir",
    missionId,
    location: { q: 5, r: 5 },
    bomber: {
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: strengthByUnitId["bomber-1"]
    },
    interceptors: [
      { faction: "Bot", unitKey: "cap-1", unitType: "Fighter", strength: strengthByUnitId["cap-1"] },
      { faction: "Bot", unitKey: "cap-2", unitType: "Interceptor", strength: strengthByUnitId["cap-2"] },
      { faction: "Bot", unitKey: "cap-3", unitType: "Fighter", strength: strengthByUnitId["cap-3"] }
    ],
    escorts: [
      { faction: "Player", unitKey: "escort-1", unitType: "Fighter", strength: strengthByUnitId["escort-1"] },
      { faction: "Player", unitKey: "escort-2", unitType: "Interceptor", strength: strengthByUnitId["escort-2"] }
    ],
    bomberStrengthBefore: strengthByUnitId["bomber-1"],
    bomberStrengthAfter: strengthByUnitId["bomber-1"],
    bomberDestroyed: false,
    interceptorAttrition: 0,
    interceptorKills: 0,
    escortAttrition: 0,
    escortKills: 0,
    escortsEngaged: 2,
    interceptorsAfterEscortPhase: 3,
    escortsAfterEscortPhase: 2,
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "escort-1",
        defenderUnitType: "Fighter",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 25,
        defenderStrengthAfter: 25,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-2",
        attackerUnitType: "Interceptor",
        defenderFaction: "Player",
        defenderUnitKey: "escort-2",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 25,
        defenderStrengthAfter: 25,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-2",
        attackerUnitType: "Interceptor",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-3",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    interceptorStrengthsAfterEscortPhase: [25, 25, 25],
    escortStrengthsAfterEscortPhase: [25, 25],
    interceptorFinalStrengths: [25, 25, 25],
    escortFinalStrengths: [25, 25]
  };

  const flakEvent: AirEngagementEvent = {
    type: "flak",
    missionId,
    location: { q: 7, r: 5 },
    bomber: {
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: strengthByUnitId["bomber-1"]
    },
    interceptors: [
      {
        faction: "Bot",
        unitKey: "flak-1",
        unitType: "Flak_88",
        strength: 100,
        hex: { q: 7, r: 4 }
      },
      {
        faction: "Bot",
        unitKey: "flak-2",
        unitType: "Flak_88",
        strength: 100,
        hex: { q: 7, r: 6 }
      }
    ],
    escorts: [],
    flakDamage: 0,
    bomberStrengthBefore: strengthByUnitId["bomber-1"],
    bomberStrengthAfter: strengthByUnitId["bomber-1"],
    bomberDestroyed: false
  };

  const linkedEscortFlights = [
    {
      missionId: "escort-live-1",
      faction: "Player",
      kind: "escort",
      unitKey: "escort-1",
      originKey: originKeysByUnitId["escort-1"],
      destKey: locKey,
      unitType: "Fighter",
      strength: strengthByUnitId["escort-1"],
      laneOffsetPx: -27,
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "escort-live-2",
      faction: "Player",
      kind: "escort",
      unitKey: "escort-2",
      originKey: originKeysByUnitId["escort-2"],
      destKey: locKey,
      unitType: "Interceptor",
      strength: strengthByUnitId["escort-2"],
      laneOffsetPx: 27,
      escortTargetUnitKey: "bomber-1"
    }
  ] as const;

  return {
    missionId,
    locKey,
    bomberOriginKey,
    bomberTargetKey,
    bomberArrivalDelayMs,
    renderScenario,
    engagement,
    flakEvent,
    linkedEscortFlights,
    originKeysByUnitId,
    strengthByUnitId,
    playerHqKey,
    botHqKey
  };
}

export function buildAirshowHarnessFixtureLarge(): AirshowHarnessFixture {
  const tileKey = "plains";
  const row = Array.from({ length: 20 }, () => ({ tile: tileKey }));
  const renderScenario = {
    name: "Airshow Harness Scenario (Large)",
    size: { cols: 20, rows: 20 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: Array.from({ length: 20 }, () => row),
    objectives: [],
    turnLimit: 6,
    sides: {
      Player: createSide(0, 0),
      Bot: createSide(19, 10)
    }
  } as unknown as ScenarioData;

  const missionId = "e2e-airshow-contested-package-large";
  const locKey = "10,10";
  const bomberOriginKey = "2,10";
  const bomberTargetKey = "15,10";
  const bomberArrivalDelayMs = 220;
  const playerHqKey = "0,0";
  const botHqKey = "19,19";

  const originKeysByUnitId = {
    "cap-1": "17,8",
    "cap-2": "17,10",
    "cap-3": "17,12",
    "escort-1": "3,8",
    "escort-2": "3,12",
    "bomber-1": bomberOriginKey
  } as const;

  const strengthByUnitId = {
    "cap-1": 25,
    "cap-2": 25,
    "cap-3": 25,
    "escort-1": 25,
    "escort-2": 25,
    "bomber-1": 100
  } as const;

  const engagement: AirEngagementEvent = {
    type: "airToAir",
    missionId,
    location: { q: 10, r: 10 },
    bomber: {
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: strengthByUnitId["bomber-1"]
    },
    interceptors: [
      { faction: "Bot", unitKey: "cap-1", unitType: "Fighter", strength: strengthByUnitId["cap-1"] },
      { faction: "Bot", unitKey: "cap-2", unitType: "Interceptor", strength: strengthByUnitId["cap-2"] },
      { faction: "Bot", unitKey: "cap-3", unitType: "Fighter", strength: strengthByUnitId["cap-3"] }
    ],
    escorts: [
      { faction: "Player", unitKey: "escort-1", unitType: "Fighter", strength: strengthByUnitId["escort-1"] },
      { faction: "Player", unitKey: "escort-2", unitType: "Interceptor", strength: strengthByUnitId["escort-2"] }
    ],
    bomberStrengthBefore: strengthByUnitId["bomber-1"],
    bomberStrengthAfter: strengthByUnitId["bomber-1"],
    bomberDestroyed: false,
    interceptorAttrition: 0,
    interceptorKills: 0,
    escortAttrition: 0,
    escortKills: 0,
    escortsEngaged: 2,
    interceptorsAfterEscortPhase: 3,
    escortsAfterEscortPhase: 2,
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "escort-1",
        defenderUnitType: "Fighter",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 25,
        defenderStrengthAfter: 25,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-2",
        attackerUnitType: "Interceptor",
        defenderFaction: "Player",
        defenderUnitKey: "escort-2",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 25,
        defenderStrengthAfter: 25,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-2",
        attackerUnitType: "Interceptor",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      },
      {
        phase: "bomberPass",
        attackerFaction: "Bot",
        attackerUnitKey: "cap-3",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 25,
        attackerStrengthAfter: 25,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    interceptorStrengthsAfterEscortPhase: [25, 25, 25],
    escortStrengthsAfterEscortPhase: [25, 25],
    interceptorFinalStrengths: [25, 25, 25],
    escortFinalStrengths: [25, 25]
  };

  const flakEvent: AirEngagementEvent = {
    type: "flak",
    missionId,
    location: { q: 15, r: 10 },
    bomber: {
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: strengthByUnitId["bomber-1"]
    },
    interceptors: [
      {
        faction: "Bot",
        unitKey: "flak-1",
        unitType: "Flak_88",
        strength: 100,
        hex: { q: 15, r: 9 }
      },
      {
        faction: "Bot",
        unitKey: "flak-2",
        unitType: "Flak_88",
        strength: 100,
        hex: { q: 15, r: 11 }
      }
    ],
    escorts: [],
    flakDamage: 0,
    bomberStrengthBefore: strengthByUnitId["bomber-1"],
    bomberStrengthAfter: strengthByUnitId["bomber-1"],
    bomberDestroyed: false
  };

  const linkedEscortFlights = [
    {
      missionId: "escort-live-1",
      faction: "Player",
      kind: "escort",
      unitKey: "escort-1",
      originKey: originKeysByUnitId["escort-1"],
      destKey: locKey,
      unitType: "Fighter",
      strength: strengthByUnitId["escort-1"],
      laneOffsetPx: -27,
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "escort-live-2",
      faction: "Player",
      kind: "escort",
      unitKey: "escort-2",
      originKey: originKeysByUnitId["escort-2"],
      destKey: locKey,
      unitType: "Interceptor",
      strength: strengthByUnitId["escort-2"],
      laneOffsetPx: 27,
      escortTargetUnitKey: "bomber-1"
    }
  ] as const;

  return {
    missionId,
    locKey,
    bomberOriginKey,
    bomberTargetKey,
    bomberArrivalDelayMs,
    renderScenario,
    engagement,
    flakEvent,
    linkedEscortFlights,
    originKeysByUnitId,
    strengthByUnitId,
    playerHqKey,
    botHqKey
  };
}
