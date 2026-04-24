import type { Axial, ScenarioData, ScenarioUnit } from "../core/types";
import type {
  AirEngagementEvent,
  AirMissionArrival,
  SerializedAirMission
} from "../game/GameEngine";
import { CoordinateSystem } from "../rendering/CoordinateSystem";
import type { AirShowPlaybackCapture } from "../ui/airshow/AirShowPlaybackCapture";
import { buildAirshowHarnessFixture } from "./airshowHarnessFixture";

function cloneValue<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function offsetKeyToAxial(offsetKey: string): Axial {
  const parsed = CoordinateSystem.parseHexKey(offsetKey);
  if (!parsed) {
    throw new Error(`Invalid offset hex key "${offsetKey}" in airshow playback capture fixture.`);
  }
  return CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
}

function offsetKeyToAxialKey(offsetKey: string): string {
  const axial = offsetKeyToAxial(offsetKey);
  return CoordinateSystem.makeHexKey(axial.q, axial.r);
}

function makeAirUnit(unitId: string, type: string, offsetKey: string, strength: number): ScenarioUnit {
  return {
    type: type as ScenarioUnit["type"],
    hex: offsetKeyToAxial(offsetKey),
    strength,
    experience: 0,
    ammo: 6,
    fuel: 60,
    entrench: 0,
    facing: "NW",
    unitId
  } as ScenarioUnit;
}

function makeMission(input: {
  id: string;
  kind: "strike" | "escort" | "airCover";
  faction: "Player" | "Bot" | "Ally";
  unitKey: string;
  unitType: string;
  originOffsetKey: string;
  targetOffsetKey?: string;
  escortTargetUnitKey?: string;
}): SerializedAirMission {
  return {
    id: input.id,
    kind: input.kind,
    faction: input.faction,
    unitKey: input.unitKey,
    originHexKey: offsetKeyToAxialKey(input.originOffsetKey),
    unitType: input.unitType,
    status: "resolving",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: input.targetOffsetKey ? offsetKeyToAxial(input.targetOffsetKey) : undefined,
    escortTargetUnitKey: input.escortTargetUnitKey
  };
}

export function buildAirshowPlaybackCaptureFixture(): AirShowPlaybackCapture {
  const harnessFixture = buildAirshowHarnessFixture();
  const missionId = harnessFixture.missionId;
  const scenario = cloneValue(harnessFixture.renderScenario);

  const playerUnits: ScenarioUnit[] = [
    makeAirUnit("bomber-1", "Bomber", harnessFixture.bomberOriginKey, harnessFixture.strengthByUnitId["bomber-1"]),
    makeAirUnit("escort-1", "Fighter", harnessFixture.originKeysByUnitId["escort-1"], harnessFixture.strengthByUnitId["escort-1"]),
    makeAirUnit("escort-2", "Interceptor", harnessFixture.originKeysByUnitId["escort-2"], harnessFixture.strengthByUnitId["escort-2"])
  ];
  const botUnits: ScenarioUnit[] = [
    makeAirUnit("cap-1", "Fighter", harnessFixture.originKeysByUnitId["cap-1"], harnessFixture.strengthByUnitId["cap-1"]),
    makeAirUnit("cap-2", "Interceptor", harnessFixture.originKeysByUnitId["cap-2"], harnessFixture.strengthByUnitId["cap-2"]),
    makeAirUnit("cap-3", "Fighter", harnessFixture.originKeysByUnitId["cap-3"], harnessFixture.strengthByUnitId["cap-3"])
  ];

  const scenarioWithUnits: ScenarioData = {
    ...scenario,
    sides: {
      ...scenario.sides,
      Player: {
        ...scenario.sides.Player,
        units: playerUnits
      },
      Bot: {
        ...scenario.sides.Bot,
        units: botUnits
      }
    }
  };

  const arrivals: AirMissionArrival[] = [
    {
      missionId,
      faction: "Player",
      unitKey: "bomber-1",
      originHexKey: offsetKeyToAxialKey(harnessFixture.bomberOriginKey),
      unitType: "Bomber",
      unitStrength: harnessFixture.strengthByUnitId["bomber-1"],
      kind: "strike",
      targetHex: offsetKeyToAxial(harnessFixture.bomberTargetKey)
    },
    {
      missionId: "escort-live-1",
      faction: "Player",
      unitKey: "escort-1",
      originHexKey: offsetKeyToAxialKey(harnessFixture.originKeysByUnitId["escort-1"]),
      unitType: "Fighter",
      unitStrength: harnessFixture.strengthByUnitId["escort-1"],
      kind: "escort",
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "escort-live-2",
      faction: "Player",
      unitKey: "escort-2",
      originHexKey: offsetKeyToAxialKey(harnessFixture.originKeysByUnitId["escort-2"]),
      unitType: "Interceptor",
      unitStrength: harnessFixture.strengthByUnitId["escort-2"],
      kind: "escort",
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "cap-live-1",
      faction: "Bot",
      unitKey: "cap-1",
      originHexKey: offsetKeyToAxialKey(harnessFixture.originKeysByUnitId["cap-1"]),
      unitType: "Fighter",
      unitStrength: harnessFixture.strengthByUnitId["cap-1"],
      kind: "airCover",
      targetHex: cloneValue(harnessFixture.engagement.location)
    },
    {
      missionId: "cap-live-2",
      faction: "Bot",
      unitKey: "cap-2",
      originHexKey: offsetKeyToAxialKey(harnessFixture.originKeysByUnitId["cap-2"]),
      unitType: "Interceptor",
      unitStrength: harnessFixture.strengthByUnitId["cap-2"],
      kind: "airCover",
      targetHex: cloneValue(harnessFixture.engagement.location)
    },
    {
      missionId: "cap-live-3",
      faction: "Bot",
      unitKey: "cap-3",
      originHexKey: offsetKeyToAxialKey(harnessFixture.originKeysByUnitId["cap-3"]),
      unitType: "Fighter",
      unitStrength: harnessFixture.strengthByUnitId["cap-3"],
      kind: "airCover",
      targetHex: cloneValue(harnessFixture.engagement.location)
    }
  ];

  const playerMissions: SerializedAirMission[] = [
    makeMission({
      id: missionId,
      kind: "strike",
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Bomber",
      originOffsetKey: harnessFixture.bomberOriginKey,
      targetOffsetKey: harnessFixture.bomberTargetKey
    }),
    makeMission({
      id: "escort-live-1",
      kind: "escort",
      faction: "Player",
      unitKey: "escort-1",
      unitType: "Fighter",
      originOffsetKey: harnessFixture.originKeysByUnitId["escort-1"],
      escortTargetUnitKey: "bomber-1"
    }),
    makeMission({
      id: "escort-live-2",
      kind: "escort",
      faction: "Player",
      unitKey: "escort-2",
      unitType: "Interceptor",
      originOffsetKey: harnessFixture.originKeysByUnitId["escort-2"],
      escortTargetUnitKey: "bomber-1"
    })
  ];
  const botMissions: SerializedAirMission[] = [
    makeMission({
      id: "cap-live-1",
      kind: "airCover",
      faction: "Bot",
      unitKey: "cap-1",
      unitType: "Fighter",
      originOffsetKey: harnessFixture.originKeysByUnitId["cap-1"],
      targetOffsetKey: harnessFixture.locKey
    }),
    makeMission({
      id: "cap-live-2",
      kind: "airCover",
      faction: "Bot",
      unitKey: "cap-2",
      unitType: "Interceptor",
      originOffsetKey: harnessFixture.originKeysByUnitId["cap-2"],
      targetOffsetKey: harnessFixture.locKey
    }),
    makeMission({
      id: "cap-live-3",
      kind: "airCover",
      faction: "Bot",
      unitKey: "cap-3",
      unitType: "Fighter",
      originOffsetKey: harnessFixture.originKeysByUnitId["cap-3"],
      targetOffsetKey: harnessFixture.locKey
    })
  ];

  return {
    version: 1,
    recordedAtIso: "2026-04-24T00:00:00.000Z",
    missionKey: "airshow-replay-fixture",
    source: "BattleScreen.playAirOperations",
    scenario: scenarioWithUnits,
    arrivals,
    events: [cloneValue(harnessFixture.engagement), cloneValue(harnessFixture.flakEvent)] as AirEngagementEvent[],
    playerUnits,
    botUnits,
    allyUnits: [],
    reserveUnits: [],
    scheduledMissionsByFaction: {
      Player: playerMissions,
      Bot: botMissions,
      Ally: []
    },
    playerHq: cloneValue(scenarioWithUnits.sides.Player.hq),
    botHq: cloneValue(scenarioWithUnits.sides.Bot.hq),
    playerHqKey: harnessFixture.playerHqKey,
    botHqKey: harnessFixture.botHqKey,
    operations: [],
    clusters: [],
    eventSceneCaptures: [],
    violations: [],
    error: null
  };
}
