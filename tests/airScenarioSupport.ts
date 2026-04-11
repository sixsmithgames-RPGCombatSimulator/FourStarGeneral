import type {
  Axial,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types.js";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem.js";
import {
  HexMapRenderer,
  type AirShowInspectionReport
} from "../src/rendering/HexMapRenderer.js";
import {
  GameEngine,
  type AirEngagementEvent,
  type AirMissionReportEntry,
  type GameEngineConfig
} from "../src/game/GameEngine.js";
import { ensureDomEnvironment } from "./domEnvironment.js";
import {
  buildResolvedAirCombatScene,
  type ResolvedAirCombatSceneDiagnostic
} from "../src/ui/airshow/ResolvedAirCombatSceneBuilder.js";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
  movement: 5,
  moveType: "air",
  vision: 5,
  ammo: 6,
  fuel: 50,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 6,
  armor: { front: 6, side: 5, top: 5 },
  hardAttack: 12,
  softAttack: 18,
  ap: 6,
  accuracyBase: 64,
  traits: ["skirmish"],
  cost: 320,
  airSupport: {
    roles: ["escort", "cap"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

const interceptorDef: UnitTypeDefinition = {
  ...fighterDef,
  initiative: 7,
  accuracyBase: 68
};

const bomberDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
  movement: 4,
  moveType: "air",
  vision: 4,
  ammo: 4,
  fuel: 60,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 8, side: 8, top: 8 },
  hardAttack: 16,
  softAttack: 45,
  ap: 8,
  accuracyBase: 55,
  traits: ["indirect", "carpet"],
  cost: 380,
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 450,
    combatRadiusKm: 250,
    refitTurns: 2
  }
};

const flakDef: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "artillery", weight: "medium", role: "normal", signature: "large" },
  movement: 1,
  moveType: "wheel",
  vision: 3,
  ammo: 6,
  fuel: 20,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 4,
  armor: { front: 2, side: 1, top: 1 },
  hardAttack: 12,
  softAttack: 4,
  ap: 10,
  accuracyBase: 62,
  traits: ["intercept"],
  cost: 240
};

const infantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
  movement: 1,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 8,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 80
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef,
  Interceptor: interceptorDef,
  Bomber: bomberDef,
  Flak_88: flakDef,
  Infantry_42: infantryDef
} as unknown as UnitTypeDictionary;

function side(hq: Axial): ScenarioSide {
  return { hq, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}

function scenario(): ScenarioData {
  const tileKey = "plains";
  const row = Array.from({ length: 8 }, () => ({ tile: tileKey }));
  return {
    name: "Air Combat Automation Scenario",
    size: { cols: 8, rows: 8 },
    tilePalette: {
      [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
    },
    tiles: Array.from({ length: 8 }, () => row),
    objectives: [],
    turnLimit: 6,
    sides: { Player: side({ q: 0, r: 0 }), Bot: side({ q: 7, r: 7 }) }
  } as unknown as ScenarioData;
}

function make(type: keyof typeof unitTypes, hex: Axial, unitId: string, extras: Partial<ScenarioUnit> = {}): ScenarioUnit {
  return {
    type: type as unknown as ScenarioUnit["type"],
    hex,
    strength: 100,
    experience: 0,
    ammo: unitTypes[type].ammo ?? 6,
    fuel: unitTypes[type].fuel ?? 50,
    entrench: 0,
    facing: "NW",
    unitId,
    ...extras
  } as ScenarioUnit;
}

function setMission(engine: GameEngine, mission: Record<string, unknown>): void {
  ((engine as unknown as { scheduledAirMissions: Map<string, unknown> }).scheduledAirMissions).set(String(mission.id), mission);
}

function buildEngine(): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }),
    botSide: side({ q: 7, r: 7 })
  };
  const engine = new GameEngine(config);

  engine.beginDeployment();
  engine.initializeFromAllocations([
    make("Fighter", { q: 0, r: 0 }, "u_pcap1"),
    make("Interceptor", { q: 1, r: 0 }, "u_pcap2"),
    make("Bomber", { q: 0, r: 1 }, "u_pbomber"),
    make("Fighter", { q: 1, r: 1 }, "u_pescort"),
    make("Infantry_42", { q: 5, r: 5 }, "u_btarget"),
    make("Infantry_42", { q: 2, r: 2 }, "u_ptarget"),
    make("Flak_88", { q: 2, r: 3 }, "u_pflak", { onSentry: true })
  ]);
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();

  const internals = engine as unknown as {
    botPlacements: Map<string, ScenarioUnit>;
  };
  internals.botPlacements.set("6,6", make("Fighter", { q: 6, r: 6 }, "u_bcap"));
  internals.botPlacements.set("7,6", make("Bomber", { q: 7, r: 6 }, "u_bbomber"));
  internals.botPlacements.set("6,7", make("Fighter", { q: 6, r: 7 }, "u_bescort"));
  internals.botPlacements.set("5,6", make("Flak_88", { q: 5, r: 6 }, "u_bflak", { onSentry: true }));

  setMission(engine, {
    id: "player-cap-1",
    template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
    faction: "Player",
    unitKey: "u_pcap1",
    originHexKey: "0,0",
    unitType: "Fighter",
    status: "inFlight",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: { q: 2, r: 2 },
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "player-cap-2",
    template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
    faction: "Player",
    unitKey: "u_pcap2",
    originHexKey: "1,0",
    unitType: "Interceptor",
    status: "inFlight",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: { q: 2, r: 2 },
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "bot-cap-1",
    template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
    faction: "Bot",
    unitKey: "u_bcap",
    originHexKey: "6,6",
    unitType: "Fighter",
    status: "inFlight",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: { q: 5, r: 5 },
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "player-strike-1",
    template: { kind: "strike", label: "Strike", description: "", allowedRoles: ["strike"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 0 },
    faction: "Player",
    unitKey: "u_pbomber",
    originHexKey: "0,1",
    unitType: "Bomber",
    status: "resolving",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: { q: 5, r: 5 },
    targetUnitKey: "u_btarget",
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "player-escort-1",
    template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
    faction: "Player",
    unitKey: "u_pescort",
    originHexKey: "1,1",
    unitType: "Fighter",
    status: "resolving",
    launchTurn: 1,
    turnsRemaining: 0,
    escortTargetUnitKey: "u_pbomber",
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "bot-strike-1",
    template: { kind: "strike", label: "Strike", description: "", allowedRoles: ["strike"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 0 },
    faction: "Bot",
    unitKey: "u_bbomber",
    originHexKey: "7,6",
    unitType: "Bomber",
    status: "resolving",
    launchTurn: 1,
    turnsRemaining: 0,
    targetHex: { q: 2, r: 2 },
    targetUnitKey: "u_ptarget",
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });
  setMission(engine, {
    id: "bot-escort-1",
    template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
    faction: "Bot",
    unitKey: "u_bescort",
    originHexKey: "6,7",
    unitType: "Fighter",
    status: "resolving",
    launchTurn: 1,
    turnsRemaining: 0,
    escortTargetUnitKey: "u_bbomber",
    interceptions: 0,
    airCombatDamageInflicted: 0,
    airCombatDamageTaken: 0,
    airCombatKills: 0
  });

  return engine;
}

export interface AirScenarioAnomaly {
  readonly code: string;
  readonly message: string;
}

export interface AirScenarioFinding {
  readonly code: string;
  readonly message: string;
}

export interface AirShowPhaseMetric {
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly meanPathLengthPx: number;
  readonly meanDisplacementPx: number;
  readonly meanEfficiency: number;
  readonly tracerCount: number;
  readonly meanTracerLengthPx: number;
  readonly meanTracerFanSpanPx: number;
  readonly flakBurstCount: number;
  readonly flakPuffCount: number;
  readonly meanFlakWidthPx: number;
  readonly meanFlakHeightPx: number;
  readonly meanEntryTurnAngleDeg: number;
  readonly maxEntryTurnAngleDeg: number;
  readonly groupMetrics: readonly AirShowPhaseGroupMetric[];
  readonly relationMetrics: readonly AirShowPhaseRelationMetric[];
  readonly tracerMetrics: readonly AirShowPhaseTracerMetric[];
  readonly flakMetrics: readonly AirShowPhaseFlakMetric[];
}

export interface AirShowPhaseGroupMetric {
  readonly label: string;
  readonly faction: "Player" | "Bot" | "Ally" | "Unknown";
  readonly combatRole: "cap" | "escort" | "strike" | "unknown";
  readonly assignmentCount: number;
  readonly centroidStart: { readonly cx: number; readonly cy: number };
  readonly centroidMid: { readonly cx: number; readonly cy: number };
  readonly centroidEnd: { readonly cx: number; readonly cy: number };
  readonly meanPathLengthPx: number;
  readonly meanDisplacementPx: number;
  readonly meanEfficiency: number;
}

export interface AirShowPhaseRelationMetric {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly separationStartPx: number;
  readonly separationMidPx: number;
  readonly separationEndPx: number;
  readonly minMidPairSeparationPx: number;
  readonly approachAngleDeg: number;
}

export interface AirShowPhaseTracerMetric {
  readonly progress: number;
  readonly sourceActorId: string;
  readonly emitter: "nose" | "center";
  readonly sourceHeadingDegrees: number;
  readonly width?: number;
  readonly lifetimeMs?: number;
  readonly streakLengthPx: number;
  readonly fanHalfAngleDeg: number;
  readonly emitterPoint: { readonly cx: number; readonly cy: number };
  readonly centerlineEndPoint: { readonly cx: number; readonly cy: number };
  readonly leftFanEndPoint?: { readonly cx: number; readonly cy: number };
  readonly rightFanEndPoint?: { readonly cx: number; readonly cy: number };
  readonly targetPoint?: { readonly cx: number; readonly cy: number };
}

export interface AirShowPhaseFlakMetric {
  readonly progress: number;
  readonly burstCenter: { readonly cx: number; readonly cy: number };
  readonly puffCount: number;
  readonly smokePuffCount: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface AirScenarioResult {
  readonly scenarioName: string;
  readonly missionReports: readonly AirMissionReportEntry[];
  readonly engagements: readonly AirEngagementEvent[];
  readonly airshowInspections: readonly {
    readonly eventType: AirEngagementEvent["type"];
    readonly missionId?: string;
    readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
    readonly report: AirShowInspectionReport;
    readonly phaseMetrics: readonly AirShowPhaseMetric[];
    readonly findings: readonly AirScenarioFinding[];
  }[];
  readonly anomalies: readonly AirScenarioAnomaly[];
  readonly findings: readonly AirScenarioFinding[];
}

function isResolvedMissionReport(report: AirMissionReportEntry): boolean {
  return (report.event ?? "resolved") === "resolved";
}

function describeMission(report: AirMissionReportEntry): string {
  const label = report.unitLabel ?? `${report.unitType} ${report.unitKey}`;
  const result = report.outcome?.result?.toUpperCase() ?? "UNKNOWN";
  const target =
    report.targetHex
      ? `${report.targetHex.q},${report.targetHex.r}`
      : report.escortTargetLabel ?? report.escortTargetUnitKey ?? "-";
  return `${report.faction} ${report.kind} ${label} -> ${target} [${result}]`;
}

function describeEngagement(event: AirEngagementEvent): string {
  if (event.type === "capClash") {
    return `capClash @ ${event.location.q},${event.location.r}: ${event.interceptors.length} allied vs ${event.escorts.length} axis CAP`;
  }
  if (event.type === "flak") {
    return `flak @ ${event.location.q},${event.location.r}: ${event.interceptors.length} battery/batteries vs ${event.bomber.label ?? event.bomber.unitType}`;
  }
  return `airToAir @ ${event.location.q},${event.location.r}: ${event.interceptors.length} interceptors, ${event.escorts.length} escorts, bomber ${event.bomber.label ?? event.bomber.unitType}`;
}

function toOffsetHexKey(hex: Axial): string {
  const offset = CoordinateSystem.axialToOffset(hex.q, hex.r);
  return `${offset.col},${offset.row}`;
}

function buildLaneOffsets(count: number): number[] {
  if (count <= 1) {
    return [0];
  }
  const spacing = 27;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => Math.round((index - mid) * spacing));
}

function lookupUnitOriginKey(engine: GameEngine, unitKey: string, faction: "Player" | "Bot" | "Ally"): string | undefined {
  const lookup = (engine as unknown as {
    lookupUnitBySquadronId: (unitKey: string, faction: "Player" | "Bot" | "Ally") => { unit: ScenarioUnit } | null;
  }).lookupUnitBySquadronId(unitKey, faction);
  if (lookup) {
    return toOffsetHexKey(lookup.unit.hex);
  }
  const missionOriginKey =
    engine
      .getScheduledAirMissions(faction)
      .find((mission) => mission.unitKey === unitKey && typeof mission.originHexKey === "string")
      ?.originHexKey
    ?? null;
  return missionOriginKey ? CoordinateSystem.axialKeyToOffsetKey(missionOriginKey) ?? undefined : undefined;
}

function lookupUnitStrength(engine: GameEngine, unitKey: string, faction: "Player" | "Bot" | "Ally"): number {
  const lookup = (engine as unknown as {
    lookupUnitBySquadronId: (unitKey: string, faction: "Player" | "Bot" | "Ally") => { unit: ScenarioUnit } | null;
  }).lookupUnitBySquadronId(unitKey, faction);
  return lookup?.unit.strength ?? 100;
}

function buildInspectableScene(
  engine: GameEngine,
  event: AirEngagementEvent,
  flakEvent: AirEngagementEvent | null
): { scene: ReturnType<typeof buildResolvedAirCombatScene>["scene"]; diagnostics: ResolvedAirCombatSceneDiagnostic } | null {
  if (event.type !== "airToAir" && event.type !== "capClash") {
    return null;
  }

  const participantOffsets = buildLaneOffsets(event.interceptors.length + event.escorts.length);
  const interceptorOffsets = participantOffsets.slice(0, event.interceptors.length);
  const escortOffsets = participantOffsets.slice(event.interceptors.length, event.interceptors.length + event.escorts.length);
  const mission = event.missionId
    ? engine.getScheduledAirMissions(event.bomber.faction).find((entry) => entry.id === event.missionId) ?? null
    : null;
  const bomberTargetHexKey = mission?.targetHex ? toOffsetHexKey(mission.targetHex) : null;
  const linkedEscortFlights =
    event.type === "airToAir"
      ? engine
          .getScheduledAirMissions(event.bomber.faction)
          .filter((entry) => entry.kind === "escort" && entry.escortTargetUnitKey === event.bomber.unitKey)
          .map((entry) => ({
            unitKey: entry.unitKey,
            originKey: entry.originHexKey ?? lookupUnitOriginKey(engine, entry.unitKey, entry.faction) ?? "",
            unitType: entry.unitType,
            faction: entry.faction,
            strength: lookupUnitStrength(engine, entry.unitKey, entry.faction)
          }))
          .filter((entry) => entry.originKey.length > 0)
      : [];

  return buildResolvedAirCombatScene(event, {
    locKey: toOffsetHexKey(event.location),
    resolveOriginKey: (unitKey, faction) => lookupUnitOriginKey(engine, unitKey, faction) ?? null,
    resolveStrength: (unitKey, faction) => lookupUnitStrength(engine, unitKey, faction),
    interceptorLaneOffsets: interceptorOffsets,
    escortLaneOffsets: escortOffsets,
    bomberLaneOffsetPx: 0,
    linkedEscortFlights,
    bomberOriginKey: lookupUnitOriginKey(engine, event.bomber.unitKey, event.bomber.faction) ?? null,
    bomberTargetKey: bomberTargetHexKey,
    flakEvent,
    includeBomber: event.type === "airToAir"
  });
}

function buildAirshowInspections(engine: GameEngine, engagements: readonly AirEngagementEvent[]): Array<{
  readonly eventType: AirEngagementEvent["type"];
  readonly missionId?: string;
  readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
  readonly report: AirShowInspectionReport;
  readonly phaseMetrics: readonly AirShowPhaseMetric[];
  readonly findings: readonly AirScenarioFinding[];
}> {
  ensureDomEnvironment();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1600");
  svg.setAttribute("height", "1200");
  const canvas = document.createElement("div");
  document.body.appendChild(svg);
  document.body.appendChild(canvas);

  const renderer = new HexMapRenderer();
  const hostFetch = globalThis.fetch?.bind(globalThis);
  const mockJsonResponse = (payload: unknown): Response =>
    ({
      ok: true,
      status: 200,
      json: async () => payload
    } as Response);
  if (hostFetch) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("data/effectSpecs.json")) {
        return mockJsonResponse([]);
      }
      if (url.endsWith("data/terrainTints.json")) {
        return mockJsonResponse([]);
      }
      if (url.endsWith("data/soundCatalog.json")) {
        return mockJsonResponse({ version: 1, assets: {} });
      }
      return hostFetch(input as RequestInfo, init);
    }) as typeof fetch;
  }
  renderer.render(svg, canvas, scenario());

  try {
    return engagements.flatMap((event) => {
      const linkedFlak =
        event.type === "airToAir" && event.missionId
          ? engagements.find((candidate) => candidate.type === "flak" && candidate.missionId === event.missionId) ?? null
          : null;
      const scene = buildInspectableScene(engine, event, linkedFlak);
      if (!scene) {
        return [];
      }
      const report = (renderer as unknown as {
        inspectResolvedAirCombatShow: (scene: Record<string, unknown>) => AirShowInspectionReport | null;
      }).inspectResolvedAirCombatShow(scene.scene as unknown as Record<string, unknown>);
      if (!report) {
        return [];
      }
      const phaseMetrics = report.phases.map((phase, phaseIndex) =>
        measurePhase(report, phase, phaseIndex > 0 ? report.phases[phaseIndex - 1] : undefined)
      );
      const findings = detectAirshowFindings(event, scene.diagnostics, phaseMetrics);
      return [{ eventType: event.type, missionId: event.missionId, diagnostics: scene.diagnostics, report, phaseMetrics, findings }];
    });
  } finally {
    if (hostFetch) {
      globalThis.fetch = hostFetch;
    }
    svg.remove();
    canvas.remove();
  }
}

function distanceBetween(
  left: { readonly cx: number; readonly cy: number },
  right: { readonly cx: number; readonly cy: number }
): number {
  return Math.hypot(right.cx - left.cx, right.cy - left.cy);
}

function averagePoint(points: ReadonlyArray<{ readonly cx: number; readonly cy: number }>): { cx: number; cy: number } {
  if (points.length <= 0) {
    return { cx: 0, cy: 0 };
  }
  const totals = points.reduce(
    (acc: { cx: number; cy: number }, point) => {
      acc.cx += point.cx;
      acc.cy += point.cy;
      return acc;
    },
    { cx: 0, cy: 0 }
  );
  return {
    cx: totals.cx / points.length,
    cy: totals.cy / points.length
  };
}

function sampleInspectionPathPoint(
  points: ReadonlyArray<{ readonly cx: number; readonly cy: number }>,
  progress: number
): { cx: number; cy: number } {
  if (points.length <= 1) {
    return points[0] ?? { cx: 0, cy: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segmentLengths = points.slice(1).map((point, index) => distanceBetween(points[index]!, point));
  const totalLength = segmentLengths.reduce((sum, length) => sum + Math.max(0.0001, length), 0);
  const targetDistance = totalLength * clampedProgress;
  let traversed = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = Math.max(0.0001, segmentLengths[index] ?? 0);
    if (targetDistance <= traversed + segmentLength || index === segmentLengths.length - 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      const localProgress = Math.max(0, Math.min(1, (targetDistance - traversed) / segmentLength));
      return {
        cx: start.cx + (end.cx - start.cx) * localProgress,
        cy: start.cy + (end.cy - start.cy) * localProgress
      };
    }
    traversed += segmentLength;
  }

  return points[points.length - 1] ?? { cx: 0, cy: 0 };
}

function angleBetweenVectors(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): number {
  const leftLength = Math.hypot(left.x, left.y);
  const rightLength = Math.hypot(right.x, right.y);
  if (leftLength < 0.001 || rightLength < 0.001) {
    return 0;
  }
  const dot = (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
}

function measurePhase(
  report: AirShowInspectionReport,
  phase: AirShowInspectionReport["phases"][number],
  previousPhase?: AirShowInspectionReport["phases"][number]
): AirShowPhaseMetric {
  const allPoints = phase.assignments.flatMap((assignment) => assignment.points);
  const xs = allPoints.map((point) => point.cx);
  const ys = allPoints.map((point) => point.cy);
  const widthPx = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
  const heightPx = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
  const pathLengths = phase.assignments.map((assignment) =>
    assignment.points.slice(1).reduce((sum, point, index) => {
      const prev = assignment.points[index]!;
      return sum + Math.hypot(point.cx - prev.cx, point.cy - prev.cy);
    }, 0)
  );
  const displacements = phase.assignments.map((assignment) => {
    const start = assignment.points[0];
    const end = assignment.points[assignment.points.length - 1];
    if (!start || !end) {
      return 0;
    }
    return Math.hypot(end.cx - start.cx, end.cy - start.cy);
  });
  const meanPathLengthPx =
    pathLengths.length > 0 ? pathLengths.reduce((sum, value) => sum + value, 0) / pathLengths.length : 0;
  const meanDisplacementPx =
    displacements.length > 0 ? displacements.reduce((sum, value) => sum + value, 0) / displacements.length : 0;
  const meanEfficiency = meanPathLengthPx > 0 ? meanDisplacementPx / meanPathLengthPx : 0;
  const tracerLengths = phase.tracers.map((tracer) => tracer.streakLengthPx);
  const tracerFanSpans = phase.tracers.map((tracer) =>
    tracer.leftFanEndPoint && tracer.rightFanEndPoint
      ? distanceBetween(tracer.leftFanEndPoint, tracer.rightFanEndPoint)
      : 0
  );
  const flakWidths = phase.flakBursts.map((burst) => burst.widthPx);
  const flakHeights = phase.flakBursts.map((burst) => burst.heightPx);

  const entryTurnAngles = previousPhase
    ? phase.assignments
        .map((assignment) => {
          const previousAssignment = previousPhase.assignments.find((candidate) => candidate.actorId === assignment.actorId);
          if (!previousAssignment || previousAssignment.points.length < 2 || assignment.points.length < 2) {
            return null;
          }
          const previousTail = previousAssignment.points[previousAssignment.points.length - 1]!;
          const previousBeforeTail = previousAssignment.points[previousAssignment.points.length - 2]!;
          const currentStart = assignment.points[0]!;
          const currentNext = assignment.points[1]!;
          return angleBetweenVectors(
            { x: previousTail.cx - previousBeforeTail.cx, y: previousTail.cy - previousBeforeTail.cy },
            { x: currentNext.cx - currentStart.cx, y: currentNext.cy - currentStart.cy }
          );
        })
        .filter((angle): angle is number => typeof angle === "number")
    : [];

  const flightsById = new Map(report.flights.map((flight) => [flight.id, flight] as const));
  const groupedAssignments = new Map<string, Array<(typeof phase.assignments)[number]>>();
  phase.assignments.forEach((assignment) => {
    const flight = flightsById.get(assignment.flightId);
    const faction = flight?.faction ?? "Unknown";
    const combatRole = flight?.combatRole ?? "unknown";
    const label = `${faction} ${combatRole}`.trim();
    const bucket = groupedAssignments.get(label) ?? [];
    bucket.push(assignment);
    groupedAssignments.set(label, bucket);
  });

  const groupMetrics: AirShowPhaseGroupMetric[] = Array.from(groupedAssignments.entries()).map(([label, assignments]) => {
    const flight = flightsById.get(assignments[0]?.flightId ?? "");
    const faction = (flight?.faction ?? "Unknown") as AirShowPhaseGroupMetric["faction"];
    const combatRole = (flight?.combatRole ?? "unknown") as AirShowPhaseGroupMetric["combatRole"];
    const startCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0)));
    const midCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5)));
    const endCentroid = averagePoint(assignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 1)));
    const assignmentPathLengths = assignments.map((assignment) =>
      assignment.points.slice(1).reduce((sum, point, index) => sum + distanceBetween(assignment.points[index]!, point), 0)
    );
    const assignmentDisplacements = assignments.map((assignment) =>
      distanceBetween(sampleInspectionPathPoint(assignment.points, 0), sampleInspectionPathPoint(assignment.points, 1))
    );
    const groupMeanPathLengthPx =
      assignmentPathLengths.length > 0
        ? assignmentPathLengths.reduce((sum, value) => sum + value, 0) / assignmentPathLengths.length
        : 0;
    const groupMeanDisplacementPx =
      assignmentDisplacements.length > 0
        ? assignmentDisplacements.reduce((sum, value) => sum + value, 0) / assignmentDisplacements.length
        : 0;
    return {
      label,
      faction,
      combatRole,
      assignmentCount: assignments.length,
      centroidStart: startCentroid,
      centroidMid: midCentroid,
      centroidEnd: endCentroid,
      meanPathLengthPx: groupMeanPathLengthPx,
      meanDisplacementPx: groupMeanDisplacementPx,
      meanEfficiency: groupMeanPathLengthPx > 0 ? groupMeanDisplacementPx / groupMeanPathLengthPx : 0
    };
  });

  const relationMetrics: AirShowPhaseRelationMetric[] = [];
  for (let leftIndex = 0; leftIndex < groupMetrics.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < groupMetrics.length; rightIndex += 1) {
      const leftGroup = groupMetrics[leftIndex]!;
      const rightGroup = groupMetrics[rightIndex]!;
      if (leftGroup.faction === rightGroup.faction) {
        continue;
      }
      const leftAssignments = groupedAssignments.get(leftGroup.label) ?? [];
      const rightAssignments = groupedAssignments.get(rightGroup.label) ?? [];
      const leftMidPoints = leftAssignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5));
      const rightMidPoints = rightAssignments.map((assignment) => sampleInspectionPathPoint(assignment.points, 0.5));
      const minMidPairSeparationPx =
        leftMidPoints.length > 0 && rightMidPoints.length > 0
          ? Math.min(
              ...leftMidPoints.flatMap((leftPoint) =>
                rightMidPoints.map((rightPoint) => distanceBetween(leftPoint, rightPoint))
              )
            )
          : 0;
      const leftDirection = {
        x: leftGroup.centroidMid.cx - leftGroup.centroidStart.cx,
        y: leftGroup.centroidMid.cy - leftGroup.centroidStart.cy
      };
      const rightDirection = {
        x: rightGroup.centroidMid.cx - rightGroup.centroidStart.cx,
        y: rightGroup.centroidMid.cy - rightGroup.centroidStart.cy
      };
      relationMetrics.push({
        fromLabel: leftGroup.label,
        toLabel: rightGroup.label,
        separationStartPx: distanceBetween(leftGroup.centroidStart, rightGroup.centroidStart),
        separationMidPx: distanceBetween(leftGroup.centroidMid, rightGroup.centroidMid),
        separationEndPx: distanceBetween(leftGroup.centroidEnd, rightGroup.centroidEnd),
        minMidPairSeparationPx,
        approachAngleDeg: angleBetweenVectors(leftDirection, rightDirection)
      });
    }
  }

  return {
    label: phase.label,
    widthPx,
    heightPx,
    meanPathLengthPx,
    meanDisplacementPx,
    meanEfficiency,
    tracerCount: phase.tracers.length,
    meanTracerLengthPx:
      tracerLengths.length > 0 ? tracerLengths.reduce((sum, value) => sum + value, 0) / tracerLengths.length : 0,
    meanTracerFanSpanPx:
      tracerFanSpans.length > 0 ? tracerFanSpans.reduce((sum, value) => sum + value, 0) / tracerFanSpans.length : 0,
    flakBurstCount: phase.flakBursts.length,
    flakPuffCount: phase.flakBursts.reduce((sum, burst) => sum + burst.puffCount, 0),
    meanFlakWidthPx: flakWidths.length > 0 ? flakWidths.reduce((sum, value) => sum + value, 0) / flakWidths.length : 0,
    meanFlakHeightPx: flakHeights.length > 0 ? flakHeights.reduce((sum, value) => sum + value, 0) / flakHeights.length : 0,
    meanEntryTurnAngleDeg:
      entryTurnAngles.length > 0 ? entryTurnAngles.reduce((sum, value) => sum + value, 0) / entryTurnAngles.length : 0,
    maxEntryTurnAngleDeg: entryTurnAngles.length > 0 ? Math.max(...entryTurnAngles) : 0,
    groupMetrics,
    relationMetrics,
    tracerMetrics: phase.tracers.map((tracer) => ({
      progress: tracer.progress,
      sourceActorId: tracer.sourceActorId,
      emitter: tracer.emitter,
      sourceHeadingDegrees: tracer.sourceHeadingDegrees,
      width: tracer.width,
      lifetimeMs: tracer.lifetimeMs,
      streakLengthPx: tracer.streakLengthPx,
      fanHalfAngleDeg: tracer.fanHalfAngleDeg,
      emitterPoint: tracer.emitterPoint,
      centerlineEndPoint: tracer.centerlineEndPoint,
      leftFanEndPoint: tracer.leftFanEndPoint,
      rightFanEndPoint: tracer.rightFanEndPoint,
      targetPoint: tracer.targetPoint
    })),
    flakMetrics: phase.flakBursts.map((burst) => ({
      progress: burst.progress,
      burstCenter: burst.burstCenter,
      puffCount: burst.puffCount,
      smokePuffCount: burst.smokePuffCount,
      widthPx: burst.widthPx,
      heightPx: burst.heightPx
    }))
  };
}

function detectAirshowFindings(
  event: AirEngagementEvent,
  diagnostics: ResolvedAirCombatSceneDiagnostic,
  phaseMetrics: readonly AirShowPhaseMetric[]
): AirScenarioFinding[] {
  const findings: AirScenarioFinding[] = [];
  if (diagnostics.linkedEscortMissingFromEventUnitKeys.length > 0) {
    findings.push({
      code: "linked-escort-missing-from-event",
      message:
        `${event.type} ${event.missionId ?? "<no-mission>"} omitted linked escort unit(s): ` +
        diagnostics.linkedEscortMissingFromEventUnitKeys.join(", ")
    });
  }
  if (diagnostics.unresolvedOriginUnitKeys.length > 0) {
    findings.push({
      code: "unresolved-airshow-origins",
      message:
        `${event.type} ${event.missionId ?? "<no-mission>"} could not resolve origin hexes for: ` +
        diagnostics.unresolvedOriginUnitKeys.join(", ")
    });
  }
  phaseMetrics.forEach((metric) => {
    if (metric.label.includes("ingress") && metric.meanDisplacementPx < 90) {
      findings.push({
        code: "compressed-ingress",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only displaced aircraft ` +
          `${Math.round(metric.meanDisplacementPx)}px on average.`
      });
    }
    if (metric.label.includes("ingress")) {
      metric.groupMetrics.forEach((group) => {
        if (group.meanDisplacementPx < 90) {
          findings.push({
            code: "compressed-ingress-group",
            message:
              `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only moved ${group.label} ` +
              `${Math.round(group.meanDisplacementPx)}px on average.`
          });
        }
      });
    }
    if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.widthPx < 140 && metric.heightPx < 140) {
      findings.push({
        code: "collapsed-combat-volume",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} stayed in a ` +
          `${Math.round(metric.widthPx)}x${Math.round(metric.heightPx)}px box.`
      });
    }
    if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.meanPathLengthPx > 260 && metric.meanEfficiency < 0.22) {
      findings.push({
        code: "orbit-heavy-maneuver",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} displaced aircraft only ` +
          `${Math.round(metric.meanEfficiency * 100)}% of their travelled path.`
      });
    }
    if (metric.label === "target-run") {
      metric.groupMetrics
        .filter((group) => group.combatRole === "escort")
        .forEach((group) => {
          if (group.meanDisplacementPx < 80) {
            findings.push({
              code: "static-target-screen",
              message:
                `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} kept ${group.label} moving only ` +
                `${Math.round(group.meanDisplacementPx)}px on average.`
            });
          }
        });
    }
    if (metric.label.includes("bomber-pass")) {
      metric.groupMetrics
        .filter((group) => group.combatRole === "escort")
        .forEach((group) => {
          if (group.meanDisplacementPx < 40) {
            findings.push({
              code: "static-bomber-screen",
              message:
                `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} kept ${group.label} screening only ` +
                `${Math.round(group.meanDisplacementPx)}px on average.`
            });
          }
        });
    }
    if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount <= 0) {
      findings.push({
        code: "missing-tracer-phase",
        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} scheduled no tracers.`
      });
    }
    if (metric.meanEntryTurnAngleDeg > 110 || metric.maxEntryTurnAngleDeg > 145) {
      findings.push({
        code: "hard-phase-reversal",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} enters with mean/max turn ` +
          `${Math.round(metric.meanEntryTurnAngleDeg)}/${Math.round(metric.maxEntryTurnAngleDeg)} degrees.`
      });
    }
    if (metric.label.includes("clash")) {
      metric.relationMetrics.forEach((relation) => {
        if (relation.approachAngleDeg < 40 && relation.separationMidPx > 80) {
          findings.push({
            code: "parallel-dogfight-approach",
            message:
              `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} keeps ${relation.fromLabel} and ${relation.toLabel} ` +
              `moving only ${Math.round(relation.approachAngleDeg)} degrees apart while still ${Math.round(relation.separationMidPx)}px apart.`
          });
        }
      });
    }
    if ((metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount > 0) {
      if (metric.meanTracerLengthPx < 180) {
        findings.push({
          code: "short-tracers",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only paints ` +
            `${Math.round(metric.meanTracerLengthPx)}px tracer streaks on average.`
        });
      }
      if (metric.meanTracerFanSpanPx < 26) {
        findings.push({
          code: "narrow-tracer-fan",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only fans tracers ` +
            `${Math.round(metric.meanTracerFanSpanPx)}px wide on average.`
        });
      }
    }
    if (metric.label === "target-run" && metric.flakBurstCount > 0) {
      if (metric.flakMetrics.some((flak) => flak.progress < 0.6)) {
        findings.push({
          code: "early-flak-window",
          message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} schedules flak before the final approach window.`
        });
      }
      if (metric.meanFlakWidthPx < 120) {
        findings.push({
          code: "narrow-flak-belt",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only spreads flak ` +
            `${Math.round(metric.meanFlakWidthPx)}px wide on average.`
        });
      }
      if (metric.flakPuffCount < 18) {
        findings.push({
          code: "sparse-flak-belt",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only schedules ` +
            `${metric.flakPuffCount} flak puffs total.`
        });
      }
    }
  });
  return findings;
}

function detectAnomalies(
  missionReports: readonly AirMissionReportEntry[],
  engagements: readonly AirEngagementEvent[]
): AirScenarioAnomaly[] {
  const anomalies: AirScenarioAnomaly[] = [];

  missionReports
    .filter(isResolvedMissionReport)
    .filter((report) => report.kind === "strike")
    .forEach((report) => {
      if (report.outcome?.result !== "destroyed") {
        return;
      }
      const strikeEvents = engagements.filter((event) => event.missionId === report.missionId);
      const hasCause = strikeEvents.some((event) => event.bomberDestroyed === true);
      if (!hasCause) {
        anomalies.push({
          code: "missing-destruction-cause",
          message: `${describeMission(report)} was destroyed without any matching air-to-air or flak kill event.`
        });
      }
    });

  missionReports
    .filter(isResolvedMissionReport)
    .filter((report) => report.kind === "escort")
    .forEach((report) => {
      if (report.outcome?.result === "aborted") {
        anomalies.push({
          code: "escort-aborted",
          message: `${describeMission(report)} resolved as ABORTED.`
        });
      }
    });

  missionReports
    .filter(isResolvedMissionReport)
    .filter((report) => report.kind === "strike")
    .forEach((report) => {
      const activeEscorts = missionReports.filter(
        (candidate) =>
          isResolvedMissionReport(candidate)
          &&
          candidate.kind === "escort"
          && candidate.escortTargetUnitKey === report.unitKey
          && candidate.outcome?.result !== "aborted"
      );
      const strikeAirEvent = engagements.find((event) => event.type === "airToAir" && event.missionId === report.missionId);
      if (activeEscorts.length > 0 && strikeAirEvent && (strikeAirEvent.escorts?.length ?? 0) <= 0) {
        anomalies.push({
          code: "escort-missing-from-air-event",
          message: `${describeMission(report)} had ${activeEscorts.length} resolved escort report(s), but its air-to-air event showed no escorts.`
        });
      }
    });

  return anomalies;
}

export function runAirScenario(): AirScenarioResult {
  const engine = buildEngine();
  (engine as unknown as { resolveReadyAirMissionsForRound: () => void }).resolveReadyAirMissionsForRound();
  const missionReports = engine.getAirMissionReports().filter(isResolvedMissionReport);
  const engagements = engine.consumeAirEngagements();
  const airshowInspections = buildAirshowInspections(engine, engagements);
  const findings = airshowInspections.flatMap((entry) => entry.findings);
  return {
    scenarioName: "Air Combat Automation Scenario",
    missionReports,
    engagements,
    airshowInspections,
    anomalies: detectAnomalies(missionReports, engagements),
    findings
  };
}

export function formatAirScenarioReport(result: AirScenarioResult): string {
  const formatPoint = (point: { readonly cx: number; readonly cy: number } | undefined): string =>
    point ? `(${Math.round(point.cx)},${Math.round(point.cy)})` : "(n/a)";
  const lines: string[] = [];
  lines.push(`Scenario: ${result.scenarioName}`);
  lines.push(`Mission reports: ${result.missionReports.length}`);
  lines.push(`Engagement events: ${result.engagements.length}`);
  lines.push("");
  lines.push("Mission results:");
  result.missionReports.forEach((report) => {
    lines.push(`- ${describeMission(report)}`);
  });
  lines.push("");
  lines.push("Engagement timeline:");
  result.engagements.forEach((event) => {
    lines.push(`- ${describeEngagement(event)}`);
  });
  lines.push("");
  if (result.airshowInspections.length > 0) {
    lines.push("Airshow geometry:");
    result.airshowInspections.forEach((inspectionEntry) => {
      lines.push(`- ${inspectionEntry.eventType}${inspectionEntry.missionId ? ` (${inspectionEntry.missionId})` : ""} center=(${Math.round(inspectionEntry.report.center.cx)},${Math.round(inspectionEntry.report.center.cy)}) phases=${inspectionEntry.report.phases.length}`);
      lines.push(
        `  diagnostics escorts(event=${inspectionEntry.diagnostics.eventEscortUnitKeys.length}, linked=${inspectionEntry.diagnostics.linkedEscortUnitKeys.length}) ` +
        `bomberIncluded=${inspectionEntry.diagnostics.bomberIncluded} unresolvedOrigins=${inspectionEntry.diagnostics.unresolvedOriginUnitKeys.length}`
      );
      if (inspectionEntry.diagnostics.linkedEscortMissingFromEventUnitKeys.length > 0) {
        lines.push(`    missingFromEvent: ${inspectionEntry.diagnostics.linkedEscortMissingFromEventUnitKeys.join(", ")}`);
      }
      if (inspectionEntry.diagnostics.oppositionCapFlightUnitKeys.length > 0) {
        lines.push(`    oppositionLaneCAP: ${inspectionEntry.diagnostics.oppositionCapFlightUnitKeys.join(", ")}`);
      }
      inspectionEntry.report.phases.forEach((phase) => {
        const metrics = inspectionEntry.phaseMetrics.find((entry) => entry.label === phase.label);
        lines.push(
          `  phase ${phase.label} ${phase.durationMs}ms assignments=${phase.assignments.length} tracers=${phase.tracers.length}` +
          (metrics
            ? ` box=${Math.round(metrics.widthPx)}x${Math.round(metrics.heightPx)} path=${Math.round(metrics.meanPathLengthPx)} disp=${Math.round(metrics.meanDisplacementPx)} eff=${Math.round(metrics.meanEfficiency * 100)}%` +
              ` turn=${Math.round(metrics.meanEntryTurnAngleDeg)}/${Math.round(metrics.maxEntryTurnAngleDeg)} tracerLen=${Math.round(metrics.meanTracerLengthPx)} tracerFan=${Math.round(metrics.meanTracerFanSpanPx)}` +
              (metrics.flakBurstCount > 0
                ? ` flak=${metrics.flakBurstCount}x${metrics.flakPuffCount} belt=${Math.round(metrics.meanFlakWidthPx)}x${Math.round(metrics.meanFlakHeightPx)}`
                : "")
            : "")
        );
        metrics?.groupMetrics.forEach((group) => {
          lines.push(
            `    group ${group.label}: n=${group.assignmentCount} start=${formatPoint(group.centroidStart)} ` +
            `mid=${formatPoint(group.centroidMid)} end=${formatPoint(group.centroidEnd)} ` +
            `path=${Math.round(group.meanPathLengthPx)} disp=${Math.round(group.meanDisplacementPx)} eff=${Math.round(group.meanEfficiency * 100)}%`
          );
        });
        metrics?.relationMetrics.forEach((relation) => {
          lines.push(
            `    relation ${relation.fromLabel} -> ${relation.toLabel}: ` +
            `sep(start=${Math.round(relation.separationStartPx)}, mid=${Math.round(relation.separationMidPx)}, end=${Math.round(relation.separationEndPx)}) ` +
            `closestMid=${Math.round(relation.minMidPairSeparationPx)} angle=${Math.round(relation.approachAngleDeg)}`
          );
        });
        phase.assignments.slice(0, 6).forEach((assignment) => {
          const compactPoints = assignment.points
            .map((point) => `(${Math.round(point.cx)},${Math.round(point.cy)})`)
            .join(" -> ");
          lines.push(`    ${assignment.actorId}: ${compactPoints}`);
        });
        metrics?.tracerMetrics.slice(0, 4).forEach((tracer) => {
          const fanLabel =
            tracer.leftFanEndPoint && tracer.rightFanEndPoint
              ? ` fan=${formatPoint(tracer.leftFanEndPoint)} | ${formatPoint(tracer.centerlineEndPoint)} | ${formatPoint(tracer.rightFanEndPoint)}`
              : ` centerline=${formatPoint(tracer.centerlineEndPoint)}`;
          lines.push(
            `    tracer ${Math.round(tracer.progress * 100)}% ${tracer.sourceActorId} ${tracer.emitter} ` +
            `heading=${Math.round(tracer.sourceHeadingDegrees)} len=${Math.round(tracer.streakLengthPx)} fanHalf=${Math.round(tracer.fanHalfAngleDeg)} ` +
            `width=${tracer.width?.toFixed(2) ?? "?"} life=${Math.round(tracer.lifetimeMs ?? 0)} ` +
            `emit=${formatPoint(tracer.emitterPoint)}${fanLabel}` +
            (tracer.targetPoint ? ` targetRef=${formatPoint(tracer.targetPoint)}` : "")
          );
        });
        metrics?.flakMetrics.slice(0, 3).forEach((flak) => {
          lines.push(
            `    flak ${Math.round(flak.progress * 100)}% center=${formatPoint(flak.burstCenter)} ` +
            `puffs=${flak.puffCount}/${flak.smokePuffCount} belt=${Math.round(flak.widthPx)}x${Math.round(flak.heightPx)}`
          );
        });
      });
    });
    lines.push("");
  }
  lines.push("Diagnostics:");
  if (result.findings.length > 0) {
    result.findings.forEach((finding) => {
      lines.push(`- [${finding.code}] ${finding.message}`);
    });
  } else {
    lines.push("- none");
  }
  lines.push("");
  if (result.anomalies.length > 0) {
    lines.push("Anomalies:");
    result.anomalies.forEach((anomaly) => {
      lines.push(`- [${anomaly.code}] ${anomaly.message}`);
    });
  } else {
    lines.push("Anomalies:");
    lines.push("- none");
  }
  return lines.join("\n");
}
