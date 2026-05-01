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
import { HexMapRenderer } from "../src/rendering/HexMapRenderer.js";
import type {
  AirShowInspectionFlight,
  AirShowInspectionFlightActor,
  AirShowInspectionReport,
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene
} from "../src/ui/airshow/AirShowPlaybackScene.js";
import {
  GameEngine,
  type AirEngagementEvent,
  type AirMissionArrival,
  type AirMissionReportEntry,
  type GameEngineConfig,
  type SerializedAirMission
} from "../src/game/GameEngine.js";
import { ensureDomEnvironment } from "./domEnvironment.js";
import {
  buildResolvedAirCombatScene,
  type ResolvedAirCombatSceneDiagnostic
} from "../src/ui/airshow/ResolvedAirCombatSceneBuilder.js";
import { buildCoordinatedAirClusterPlaybackPlan } from "../src/ui/airshow/ClusterAirPlaybackPlanner.js";
import {
  resolveAirInterceptBomberArrivalDelayMs
} from "../src/ui/airshow/AirShowPlaybackPolicy.js";
import {
  buildCoordinatedAirClusterTimingPolicy,
  buildResolvedAirCombatSceneTimingPolicy
} from "../src/ui/airshow/AirShowTimingPolicies.js";
import {
  sampleAirShowWaypointPath,
  sampleAirShowWaypointPoints
} from "../src/ui/airshow/AirShowPathMath.js";
import { HEX_WIDTH } from "../src/core/balance.js";

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
  const row = Array.from({ length: 16 }, () => ({ tile: tileKey }));
  return {
    name: "Air Combat Automation Scenario",
    size: { cols: 16, rows: 16 },
    tilePalette: {
      [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
    },
    tiles: Array.from({ length: 16 }, () => row),
    objectives: [],
    turnLimit: 6,
    sides: { Player: side({ q: 0, r: 2 }), Bot: side({ q: 14, r: 14 }) }
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

const airCoverTemplate = {
  kind: "airCover",
  label: "CAP",
  description: "",
  allowedRoles: ["cap"],
  requiresTarget: false,
  requiresFriendlyEscortTarget: false,
  durationTurns: 1
} as const;

const strikeTemplate = {
  kind: "strike",
  label: "Strike",
  description: "",
  allowedRoles: ["strike"],
  requiresTarget: true,
  requiresFriendlyEscortTarget: false,
  durationTurns: 0
} as const;

const escortTemplate = {
  kind: "escort",
  label: "Escort",
  description: "",
  allowedRoles: ["escort"],
  requiresTarget: false,
  requiresFriendlyEscortTarget: true,
  durationTurns: 1
} as const;

function buildEngine(): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 2 }),
    botSide: side({ q: 14, r: 14 })
  };
  const engine = new GameEngine(config);
  const playerUnits: ScenarioUnit[] = [
    make("Fighter", { q: 0, r: 0 }, "u_pcap1"),
    make("Interceptor", { q: 1, r: 0 }, "u_pcap2"),
    make("Fighter", { q: 0, r: 1 }, "u_pcap3"),
    make("Infantry_42", { q: 3, r: 2 }, "u_ptarget1"),
    make("Infantry_42", { q: 4, r: 2 }, "u_ptarget2"),
    make("Infantry_42", { q: 3, r: 3 }, "u_ptarget3"),
    make("Infantry_42", { q: 4, r: 3 }, "u_ptarget4"),
    make("Flak_88", { q: 2, r: 2 }, "u_pflak1", { onSentry: true }),
    make("Flak_88", { q: 5, r: 2 }, "u_pflak2", { onSentry: true }),
    make("Flak_88", { q: 2, r: 4 }, "u_pflak3", { onSentry: true }),
    make("Flak_88", { q: 5, r: 4 }, "u_pflak4", { onSentry: true })
  ];
  const botUnits: ScenarioUnit[] = [
    make("Bomber", { q: 13, r: 14 }, "u_bbomber1"),
    make("Bomber", { q: 14, r: 14 }, "u_bbomber2"),
    make("Bomber", { q: 13, r: 13 }, "u_bbomber3"),
    make("Bomber", { q: 14, r: 13 }, "u_bbomber4"),
    make("Fighter", { q: 12, r: 14 }, "u_bescort1"),
    make("Fighter", { q: 12, r: 13 }, "u_bescort2")
  ];

  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 2 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();

  const internals = engine as unknown as {
    playerPlacements: Map<string, ScenarioUnit>;
    botPlacements: Map<string, ScenarioUnit>;
    invalidateRosterCache: () => void;
    rebuildPlayerIdleUnitSet: () => void;
  };
  playerUnits.forEach((unit) => {
    internals.playerPlacements.set(`${unit.hex.q},${unit.hex.r}`, structuredClone(unit));
  });
  botUnits.forEach((unit) => {
    internals.botPlacements.set(`${unit.hex.q},${unit.hex.r}`, unit);
  });
  internals.invalidateRosterCache();
  internals.rebuildPlayerIdleUnitSet();

  [
    {
      id: "player-cap-1",
      unitKey: "u_pcap1",
      originHexKey: "0,0",
      unitType: "Fighter",
      targetHex: { q: 3, r: 2 }
    },
    {
      id: "player-cap-2",
      unitKey: "u_pcap2",
      originHexKey: "1,0",
      unitType: "Interceptor",
      targetHex: { q: 4, r: 2 }
    },
    {
      id: "player-cap-3",
      unitKey: "u_pcap3",
      originHexKey: "0,1",
      unitType: "Fighter",
      targetHex: { q: 3, r: 3 }
    }
  ].forEach((mission) => {
    setMission(engine, {
      ...mission,
      template: airCoverTemplate,
      faction: "Player",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
  });

  [
    {
      id: "bot-strike-1",
      unitKey: "u_bbomber1",
      originHexKey: "13,14",
      targetHex: { q: 3, r: 2 },
      targetUnitKey: "u_ptarget1"
    },
    {
      id: "bot-strike-2",
      unitKey: "u_bbomber2",
      originHexKey: "14,14",
      targetHex: { q: 4, r: 2 },
      targetUnitKey: "u_ptarget2"
    },
    {
      id: "bot-strike-3",
      unitKey: "u_bbomber3",
      originHexKey: "13,13",
      targetHex: { q: 3, r: 3 },
      targetUnitKey: "u_ptarget3"
    },
    {
      id: "bot-strike-4",
      unitKey: "u_bbomber4",
      originHexKey: "14,13",
      targetHex: { q: 4, r: 3 },
      targetUnitKey: "u_ptarget4"
    }
  ].forEach((mission) => {
    setMission(engine, {
      ...mission,
      template: strikeTemplate,
      faction: "Bot",
      unitType: "Bomber",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
  });

  [
    {
      id: "bot-escort-1",
      unitKey: "u_bescort1",
      originHexKey: "12,14",
      escortTargetUnitKey: "u_bbomber1"
    },
    {
      id: "bot-escort-2",
      unitKey: "u_bescort2",
      originHexKey: "12,13",
      escortTargetUnitKey: "u_bbomber2"
    }
  ].forEach((mission) => {
    setMission(engine, {
      ...mission,
      template: escortTemplate,
      faction: "Bot",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
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
  readonly meanSpeedPxPerSec: number;
  readonly tracerCount: number;
  readonly meanTracerLengthPx: number;
  readonly meanVisibleTracerLengthPx: number;
  readonly meanTracerFanSpanPx: number;
  readonly meanTracerAlignmentDeg: number;
  readonly maxTracerAlignmentDeg: number;
  readonly meanTracerRangePx: number;
  readonly maxTracerRangePx: number;
  readonly flakBurstCount: number;
  readonly flakFlashCount: number;
  readonly flakPuffCount: number;
  readonly meanFlakWidthPx: number;
  readonly meanFlakHeightPx: number;
  readonly meanEntryTurnAngleDeg: number;
  readonly maxEntryTurnAngleDeg: number;
  readonly meanWaypointTurnAngleDeg: number;
  readonly maxWaypointTurnAngleDeg: number;
  readonly meanFirstWaypointTurnAngleDeg: number;
  readonly maxFirstWaypointTurnAngleDeg: number;
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
  readonly meanSpeedPxPerSec: number;
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
  readonly visibleLengthPx: number;
  readonly fanHalfAngleDeg: number;
  readonly emitterPoint: { readonly cx: number; readonly cy: number };
  readonly centerlineEndPoint: { readonly cx: number; readonly cy: number };
  readonly leftFanEndPoint?: { readonly cx: number; readonly cy: number };
  readonly rightFanEndPoint?: { readonly cx: number; readonly cy: number };
  readonly targetPoint?: { readonly cx: number; readonly cy: number };
  readonly targetAlignmentDeg?: number;
  readonly targetRangePx?: number;
}

export interface AirShowPhaseFlakMetric {
  readonly progress: number;
  readonly burstCenter: { readonly cx: number; readonly cy: number };
  readonly sampledBomberCenter?: { readonly cx: number; readonly cy: number };
  readonly rangeReferenceCenter?: { readonly cx: number; readonly cy: number };
  readonly rangeToReferencePx?: number;
  readonly flashCount: number;
  readonly puffCount: number;
  readonly smokePuffCount: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface AirScenarioResult {
  readonly scenarioName: string;
  readonly arrivals: readonly AirMissionArrival[];
  readonly missionReports: readonly AirMissionReportEntry[];
  readonly engagements: readonly AirEngagementEvent[];
  readonly expectedFlakCoverageByMissionId: Readonly<Record<string, readonly string[]>>;
  readonly playbackProjection: AirScenarioPlaybackProjection;
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
  readonly legacyDiagnosticFindings: readonly AirScenarioFinding[];
}

export interface AirScenarioPlaybackFlight {
  readonly missionId: string;
  readonly faction: "Player" | "Bot" | "Ally";
  readonly kind: string;
  readonly unitKey: string;
  readonly originKey: string;
  readonly destKey: string;
  readonly unitType: string;
  readonly strength: number;
  readonly laneOffsetPx: number;
  readonly targetHexKey: string | null;
  readonly escortTargetUnitKey?: string;
}

export interface AirScenarioPlaybackOperationSummary {
  readonly kind: "linkedStrike" | "flight" | "event";
  readonly missionId?: string;
  readonly unitKey?: string;
  readonly focusKey: string | null;
  readonly label: string;
  readonly linkedEventTypes?: readonly AirEngagementEvent["type"][];
  readonly escortUnitKeys?: readonly string[];
}

export interface AirScenarioPlaybackClusterSummary {
  readonly index: number;
  readonly focusKeys: readonly string[];
  readonly operationSummaries: readonly AirScenarioPlaybackOperationSummary[];
}

export interface AirScenarioCoordinatedPlanSummary {
  readonly clusterIndex: number;
  readonly focusKey: string | null;
  readonly coveredMissionIds: readonly string[];
  readonly hasFighterScene: boolean;
  readonly fighterSceneInterceptorCount: number;
  readonly fighterSceneEscortCount: number;
  readonly fighterScenePhaseLabels: readonly string[];
  readonly fighterSceneTracerCount: number;
  readonly fighterSceneDurationMs: number;
  readonly fighterSceneFlakBurstCount: number;
  readonly strikeSortieMissionIds: readonly string[];
  readonly residualOperationLabels: readonly string[];
  readonly bomberStartDelayMs: number;
  readonly fighterIngressLeadMs: number;
  readonly sceneReport: AirShowInspectionReport | null;
  readonly scenePhaseMetrics: readonly AirShowPhaseMetric[];
  readonly sceneFindings: readonly AirScenarioFinding[];
}

export interface AirScenarioPlaybackProjection {
  readonly preparedFlights: readonly AirScenarioPlaybackFlight[];
  readonly linkedStrikeMissionIds: readonly string[];
  readonly standaloneFlightMissionIds: readonly string[];
  readonly standaloneEventMissionIds: readonly string[];
  readonly clusters: readonly AirScenarioPlaybackClusterSummary[];
  readonly coordinatedPlans: readonly AirScenarioCoordinatedPlanSummary[];
}

const SYNTHETIC_SCENARIO_MISSION_PREFIX = "synthetic-scenario-";

function dedupeFindings(findings: readonly AirScenarioFinding[]): AirScenarioFinding[] {
  const seen = new Set<string>();
  const deduped: AirScenarioFinding[] = [];
  findings.forEach((finding) => {
    const key = `${finding.code}::${finding.message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(finding);
  });
  return deduped;
}

function collectAuthoritativeAirScenarioFindings(
  playbackProjection: AirScenarioPlaybackProjection,
  airshowInspections: readonly {
    readonly eventType: AirEngagementEvent["type"];
    readonly missionId?: string;
    readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
    readonly report: AirShowInspectionReport;
    readonly phaseMetrics: readonly AirShowPhaseMetric[];
    readonly findings: readonly AirScenarioFinding[];
  }[]
): {
  readonly findings: readonly AirScenarioFinding[];
  readonly legacyDiagnosticFindings: readonly AirScenarioFinding[];
} {
  const coordinatedMissionIds = new Set(
    playbackProjection.coordinatedPlans.flatMap((plan) => plan.coveredMissionIds)
  );
  const blockingFindings: AirScenarioFinding[] = playbackProjection.coordinatedPlans.flatMap((plan) => plan.sceneFindings);
  const legacyDiagnosticFindings: AirScenarioFinding[] = [];

  airshowInspections.forEach((inspection) => {
    const missionId = inspection.missionId ?? null;
    const isSyntheticScenario = missionId?.startsWith(SYNTHETIC_SCENARIO_MISSION_PREFIX) ?? false;
    const coveredByCoordinatedPlayback = missionId ? coordinatedMissionIds.has(missionId) : false;
    if (coveredByCoordinatedPlayback && !isSyntheticScenario) {
      legacyDiagnosticFindings.push(...inspection.findings);
      return;
    }
    blockingFindings.push(...inspection.findings);
  });

  return {
    findings: dedupeFindings(blockingFindings),
    legacyDiagnosticFindings: dedupeFindings(legacyDiagnosticFindings)
  };
}

function snapshotExpectedFlakCoverage(
  engine: GameEngine
): Readonly<Record<string, readonly string[]>> {
  const getAllUnitsForFaction = (engine as unknown as {
    getAllUnitsForFaction: (faction: "Player" | "Bot" | "Ally") => ScenarioUnit[];
  }).getAllUnitsForFaction.bind(engine);
  const coverage: Record<string, readonly string[]> = {};
  const factions: Array<"Player" | "Bot" | "Ally"> = ["Player", "Bot", "Ally"];
  const remainingShotsByUnitId = new Map<string, number>();
  const resolveUnitKey = (unit: ScenarioUnit): string => unit.unitId ?? `${unit.type}@${unit.hex.q},${unit.hex.r}`;

  factions.forEach((faction) => {
    getAllUnitsForFaction(faction).forEach((unit) => {
      const definition = unitTypes[unit.type as keyof typeof unitTypes];
      if (!unitDefinitionHasTrait(definition, "intercept")) {
        return;
      }
      remainingShotsByUnitId.set(resolveUnitKey(unit), unit.onSentry === true ? 2 : 1);
    });
    engine
      .getScheduledAirMissions(faction)
      .filter((mission) => mission.kind === "strike" && mission.targetHex)
      .forEach((mission) => {
        const opponentFaction: "Player" | "Bot" | "Ally" =
          mission.faction === "Player" ? "Bot" : "Player";
        const coveringUnits = getAllUnitsForFaction(opponentFaction)
          .filter((unit) => {
            const definition = unitTypes[unit.type as keyof typeof unitTypes];
            return unitDefinitionHasTrait(definition, "intercept")
              && (remainingShotsByUnitId.get(resolveUnitKey(unit)) ?? 0) > 0
              && axialDistance(unit.hex, mission.targetHex!) <= 2;
          });
        coveringUnits.forEach((unit) => {
          const unitKey = resolveUnitKey(unit);
          remainingShotsByUnitId.set(unitKey, Math.max(0, (remainingShotsByUnitId.get(unitKey) ?? 0) - 1));
        });
        coverage[mission.id] = coveringUnits.map((unit) => `${unit.type} ${unit.unitId ?? `${unit.hex.q},${unit.hex.r}`}`);
      });
  });

  return coverage;
}

function inspectCoordinatedScene(
  scene: ResolvedAirShowScene | null,
  subjectLabel: string,
  strikeSortieMissionIds: readonly string[]
): {
  readonly report: AirShowInspectionReport;
  readonly phaseLabels: readonly string[];
  readonly tracerCount: number;
  readonly flakBurstCount: number;
  readonly durationMs: number;
  readonly phaseMetrics: readonly AirShowPhaseMetric[];
  readonly findings: readonly AirScenarioFinding[];
} | null {
  if (!scene) {
    return null;
  }

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
    const report = renderer.inspectResolvedAirCombatShow(scene);
    if (!report) {
      return null;
    }
    const phaseMetrics = report.phases.map((phase, phaseIndex) =>
      measurePhase(report, phase, phaseIndex > 0 ? report.phases[phaseIndex - 1] : undefined)
    );
    const findings: AirScenarioFinding[] = [];
    const fighterIngress = report.phases.find((phase) => phase.label === "fighter-ingress");
    const targetRunMetric = phaseMetrics.find((phase) => phase.label === "target-run");
    const phaseTimingAuditByLabel = new Map(report.phaseTimingAudit.map((phase) => [phase.label, phase] as const));
    const meanRealizedSpeedPxPerMs = (
      label: string,
      roles: ReadonlyArray<"interceptor" | "escort" | "bomber">
    ): number | null => {
      const phaseAudit = phaseTimingAuditByLabel.get(label);
      if (!phaseAudit) {
        return null;
      }
      const relevantRoles = phaseAudit.roles.filter(
        (role) => roles.includes(role.role) && role.assignmentCount > 0 && Number.isFinite(role.realizedSpeedPxPerMs)
      );
      if (relevantRoles.length <= 0) {
        return null;
      }
      return relevantRoles.reduce((sum, role) => sum + role.realizedSpeedPxPerMs, 0) / relevantRoles.length;
    };

    if (fighterIngress) {
      const bomberAssignments = fighterIngress.assignments.filter((assignment) => assignment.role === "bomber");
      const fighterAssignments = fighterIngress.assignments.filter(
        (assignment) => assignment.role === "interceptor" || assignment.role === "escort"
      );

      if (strikeSortieMissionIds.length > 0 && bomberAssignments.length === 0) {
        findings.push({
          code: "coordinated-missing-bomber-ingress",
          message: `${subjectLabel} has strike sorties but fighter-ingress renders no bomber assignments.`
        });
      }

      if (bomberAssignments.length > 0 && fighterAssignments.length > 0) {
        const averageDistance = (
          assignments: ReadonlyArray<(typeof fighterIngress.assignments)[number]>,
          progress: number
        ): number =>
          assignments.reduce((sum, assignment) => {
            const nearest = assignment.sampledPositions.reduce((closest, sample) =>
              Math.abs(sample.progress - progress) < Math.abs(closest.progress - progress) ? sample : closest
            );
            return sum + distanceBetween(nearest, report.center);
          }, 0) / assignments.length;

        const fighterMeanDistance = averageDistance(fighterAssignments, 1);
        const bomberMeanDistance = averageDistance(bomberAssignments, 1);
        if (bomberMeanDistance + 20 < fighterMeanDistance) {
          findings.push({
            code: "coordinated-bombers-leading-fighters",
            message:
              `${subjectLabel} places bombers ${Math.round(fighterMeanDistance - bomberMeanDistance)}px deeper than fighters ` +
              `by the end of fighter-ingress.`
          });
        }
      }
    }

    if (strikeSortieMissionIds.length > 0) {
      const fighterIngressFighterSpeed = meanRealizedSpeedPxPerMs("fighter-ingress", ["interceptor", "escort"]);
      const fighterIngressBomberSpeed = meanRealizedSpeedPxPerMs("fighter-ingress", ["bomber"]);
      if (fighterIngressFighterSpeed !== null && fighterIngressBomberSpeed !== null) {
        const ratio = fighterIngressFighterSpeed / Math.max(fighterIngressBomberSpeed, 1e-6);
        if (fighterIngressFighterSpeed <= fighterIngressBomberSpeed || ratio < 1.5) {
          findings.push({
            code: "coordinated-fighter-ingress-speed-regression",
            message:
              `${subjectLabel} resolves fighter-ingress speeds too close together ` +
              `(fighters=${fighterIngressFighterSpeed.toFixed(3)} px/ms, ` +
              `bombers=${fighterIngressBomberSpeed.toFixed(3)} px/ms, ratio=${ratio.toFixed(2)}:1).`
          });
        }
      }

      const bomberIngressAudit = phaseTimingAuditByLabel.get("bomber-ingress");
      const bomberIngressBomberRole = bomberIngressAudit?.roles.find(
        (role) => role.role === "bomber" && role.assignmentCount > 0
      );
      if (bomberIngressBomberRole && Math.abs(bomberIngressBomberRole.speedDeltaPxPerMs) > 0.015) {
        findings.push({
          code: "coordinated-bomber-ingress-off-target-speed",
          message:
            `${subjectLabel} resolves bomber-ingress at ${bomberIngressBomberRole.realizedSpeedPxPerMs.toFixed(3)} px/ms ` +
            `instead of ${bomberIngressBomberRole.targetSpeedPxPerMs.toFixed(3)} px/ms.`
        });
      }
    }

    if (strikeSortieMissionIds.length > 0 && !targetRunMetric) {
      findings.push({
        code: "coordinated-missing-target-run",
        message: `${subjectLabel} has strike sorties but no target-run phase in the coordinated scene.`
      });
    }

    if (targetRunMetric && strikeSortieMissionIds.length > 0 && targetRunMetric.flakBurstCount <= 0) {
      findings.push({
        code: "coordinated-missing-flak",
        message: `${subjectLabel} target-run scheduled no flak bursts for the coordinated strike package.`
      });
    }

    return {
      report,
      phaseLabels: report.phases.map((phase) => phase.label),
      tracerCount: report.phases.reduce((sum, phase) => sum + phase.tracers.length, 0),
      flakBurstCount: report.phases.reduce((sum, phase) => sum + phase.flakBursts.length, 0),
      durationMs: report.phases.reduce((sum, phase) => sum + phase.durationMs, 0),
      phaseMetrics,
      findings
    };
  } finally {
    if (hostFetch) {
      globalThis.fetch = hostFetch;
    }
    svg.remove();
    canvas.remove();
  }
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

function resolvePlayerHqKey(engine: GameEngine): string | null {
  const playerHq = engine.getPlayerHq();
  return playerHq ? toOffsetHexKey(playerHq) : null;
}

function resolveBotHqKey(engine: GameEngine): string | null {
  const botHq = engine.getBotHq();
  return botHq ? toOffsetHexKey(botHq) : null;
}

function buildLiveCoordinatedPlanOptions(engine: GameEngine) {
  return {
    ...buildCoordinatedAirClusterTimingPolicy(),
    playerHqKey: resolvePlayerHqKey(engine),
    botHqKey: resolveBotHqKey(engine)
  };
}

function buildLiveResolvedSceneTimingPolicy(event: AirEngagementEvent) {
  if (event.type === "capClash") {
    return undefined;
  }
  return buildResolvedAirCombatSceneTimingPolicy(resolveAirInterceptBomberArrivalDelayMs());
}

function offsetHexKeyToAxial(hexKey: string | null | undefined): Axial | null {
  if (!hexKey) {
    return null;
  }
  const parsed = CoordinateSystem.parseHexKey(hexKey);
  if (!parsed) {
    return null;
  }
  return CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
}

function lookupUnitHex(engine: GameEngine, unitKey: string, faction: "Player" | "Bot" | "Ally"): Axial | null {
  const lookup = (engine as unknown as {
    lookupUnitBySquadronId: (candidate: string, side: "Player" | "Bot" | "Ally") => { unit: ScenarioUnit } | null;
  }).lookupUnitBySquadronId(unitKey, faction);
  return lookup?.unit?.hex ? structuredClone(lookup.unit.hex) : null;
}

function findScheduledMissionById(
  engine: GameEngine,
  missionId: string,
  faction: "Player" | "Bot" | "Ally"
): SerializedAirMission | null {
  return engine.getScheduledAirMissions(faction).find((entry) => entry.id === missionId) ?? null;
}

function findLinkedStrikeMissionForEscort(
  engine: GameEngine,
  protectedSquadronId: string | undefined | null,
  faction: "Player" | "Bot" | "Ally"
): SerializedAirMission | null {
  if (!protectedSquadronId) {
    return null;
  }
  const matches = engine
    .getScheduledAirMissions(faction)
    .filter((entry) => entry.kind === "strike" && entry.unitKey === protectedSquadronId);
  return matches.find((entry) => entry.status !== "completed") ?? matches[0] ?? null;
}

function resolvePlaybackTargetHex(
  engine: GameEngine,
  flight: {
    readonly missionId: string;
    readonly faction: "Player" | "Bot" | "Ally";
    readonly targetHex?: Axial;
    readonly escortTargetUnitKey?: string;
  }
): Axial | null {
  const mission = findScheduledMissionById(engine, flight.missionId, flight.faction);
  if (mission?.targetHex) {
    return structuredClone(mission.targetHex);
  }

  const escortedSquadronId = mission?.escortTargetUnitKey ?? flight.escortTargetUnitKey;
  if (escortedSquadronId) {
    const linkedStrike = findLinkedStrikeMissionForEscort(engine, escortedSquadronId, flight.faction);
    if (linkedStrike?.targetHex) {
      return structuredClone(linkedStrike.targetHex);
    }
    return lookupUnitHex(engine, escortedSquadronId, flight.faction);
  }

  return flight.targetHex ? structuredClone(flight.targetHex) : null;
}

function buildLaneOffsets(count: number): number[] {
  if (count <= 1) {
    return [0];
  }
  const spacing = 27;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => Math.round((index - mid) * spacing));
}

function buildPreparedPlaybackFlights(
  engine: GameEngine,
  arrivals: readonly AirMissionArrival[]
): AirScenarioPlaybackFlight[] {
  const unresolved: Array<Omit<AirScenarioPlaybackFlight, "laneOffsetPx">> = [];

  arrivals.forEach((arrival) => {
    const originKey = arrival.originHexKey ? CoordinateSystem.axialKeyToOffsetKey(arrival.originHexKey) : null;
    const targetHex = resolvePlaybackTargetHex(engine, {
      missionId: arrival.missionId,
      faction: arrival.faction,
      targetHex: arrival.targetHex,
      escortTargetUnitKey: arrival.escortTargetUnitKey
    });
    const destKey = targetHex ? toOffsetHexKey(targetHex) : null;
    const silentPatrolStationing =
      arrival.kind === "airCover"
      && !arrival.targetHex
      && !arrival.targetUnitKey
      && !arrival.escortTargetUnitKey;

    if ((!originKey || !destKey) && !silentPatrolStationing) {
      return;
    }

    if (!originKey || !destKey) {
      return;
    }

    unresolved.push({
      missionId: arrival.missionId,
      faction: arrival.faction,
      kind: arrival.kind,
      unitKey: arrival.unitKey,
      originKey,
      destKey,
      unitType: arrival.unitType,
      strength: arrival.unitStrength ?? lookupUnitStrength(engine, arrival.unitKey, arrival.faction),
      targetHexKey: targetHex ? toOffsetHexKey(targetHex) : null,
      escortTargetUnitKey: arrival.escortTargetUnitKey
    });
  });

  const grouped = new Map<string, Array<Omit<AirScenarioPlaybackFlight, "laneOffsetPx">>>();
  unresolved.forEach((flight) => {
    const groupKey = `${flight.originKey}->${flight.destKey}`;
    const group = grouped.get(groupKey) ?? [];
    group.push(flight);
    grouped.set(groupKey, group);
  });

  const preparedFlights: AirScenarioPlaybackFlight[] = [];
  grouped.forEach((group) => {
    const offsets = buildLaneOffsets(group.length);
    group.forEach((flight, index) => {
      preparedFlights.push({
        ...flight,
        laneOffsetPx: offsets[index] ?? 0
      });
    });
  });

  return preparedFlights;
}

function buildFallbackPlaybackArrivals(engine: GameEngine): AirMissionArrival[] {
  const factions: Array<"Player" | "Bot" | "Ally"> = ["Player", "Bot", "Ally"];
  const seenMissionIds = new Set<string>();
  const arrivals: AirMissionArrival[] = [];

  factions.forEach((faction) => {
    engine.getScheduledAirMissions(faction).forEach((mission) => {
      if (seenMissionIds.has(mission.id)) {
        return;
      }
      seenMissionIds.add(mission.id);
      arrivals.push({
        missionId: mission.id,
        faction: mission.faction,
        unitKey: mission.unitKey,
        originHexKey: mission.originHexKey,
        unitType: mission.unitType,
        unitStrength: lookupUnitStrength(engine, mission.unitKey, mission.faction),
        kind: mission.kind,
        targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
        targetUnitKey: mission.targetUnitKey,
        escortTargetUnitKey: mission.escortTargetUnitKey
      });
    });
  });

  return arrivals;
}

function buildPlaybackProjection(
  engine: GameEngine,
  arrivals: readonly AirMissionArrival[],
  engagements: readonly AirEngagementEvent[]
): AirScenarioPlaybackProjection {
  const preparedFlights = buildPreparedPlaybackFlights(engine, arrivals);
  const linkedEventsByMissionId = new Map<string, AirEngagementEvent[]>();
  const linkedEventsByBomberUnitKey = new Map<string, AirEngagementEvent[]>();

  engagements.forEach((event) => {
    if (event.missionId) {
      const linked = linkedEventsByMissionId.get(event.missionId) ?? [];
      linked.push(event);
      linkedEventsByMissionId.set(event.missionId, linked);
    }
    const linkedToBomber = linkedEventsByBomberUnitKey.get(event.bomber.unitKey) ?? [];
    linkedToBomber.push(event);
    linkedEventsByBomberUnitKey.set(event.bomber.unitKey, linkedToBomber);
  });

  const linkedEscortFlights = new Map<string, AirScenarioPlaybackFlight[]>();
  const nonEscortFlights: AirScenarioPlaybackFlight[] = [];
  preparedFlights.forEach((flight) => {
    if (flight.kind === "escort" && flight.escortTargetUnitKey) {
      const escorts = linkedEscortFlights.get(flight.escortTargetUnitKey) ?? [];
      escorts.push(flight);
      linkedEscortFlights.set(flight.escortTargetUnitKey, escorts);
      return;
    }
    nonEscortFlights.push(flight);
  });

  const linkedStrikeFlights: Array<{
    readonly flight: AirScenarioPlaybackFlight;
    readonly linkedEvents: readonly AirEngagementEvent[];
    readonly escorts: readonly AirScenarioPlaybackFlight[];
  }> = [];
  const linkedStrikeMissionIds = new Set<string>();
  const claimedAirBattleUnitKeys = new Set<string>();
  const claimedLinkedEvents = new Set<AirEngagementEvent>();

  nonEscortFlights.forEach((flight) => {
    const linkedEvents = Array.from(
      new Set([
        ...(linkedEventsByMissionId.get(flight.missionId) ?? []),
        ...(linkedEventsByBomberUnitKey.get(flight.unitKey) ?? [])
      ])
    );
    if (flight.kind !== "strike" || linkedEvents.length <= 0) {
      return;
    }
    linkedStrikeMissionIds.add(flight.missionId);
    linkedEvents.forEach((event) => claimedLinkedEvents.add(event));
    const linkedEscorts = linkedEscortFlights.get(flight.unitKey) ?? [];
    linkedEvents.forEach((event) => {
      if (event.type !== "airToAir") {
        return;
      }
      event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
      event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
      linkedEscorts.forEach((escortFlight) => claimedAirBattleUnitKeys.add(escortFlight.unitKey));
    });
    linkedStrikeFlights.push({
      flight,
      linkedEvents,
      escorts: linkedEscorts
    });
    linkedEscortFlights.delete(flight.unitKey);
  });

  engagements.forEach((event) => {
    if (event.type !== "capClash") {
      return;
    }
    event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
    event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
  });

  const standaloneFlights: AirScenarioPlaybackFlight[] = [];
  nonEscortFlights.forEach((flight) => {
    if (linkedStrikeMissionIds.has(flight.missionId)) {
      return;
    }
    if ((flight.kind === "airCover" || flight.kind === "escort") && claimedAirBattleUnitKeys.has(flight.unitKey)) {
      return;
    }
    standaloneFlights.push(flight);
  });

  linkedEscortFlights.forEach((escorts) => {
    escorts
      .filter((flight) => !claimedAirBattleUnitKeys.has(flight.unitKey))
      .forEach((flight) => standaloneFlights.push(flight));
  });

  const standaloneEvents = engagements.filter((event) => !claimedLinkedEvents.has(event));
  const operations: Array<{
    readonly kind: "linkedStrike" | "flight" | "event";
    readonly index: number;
    readonly focusHex: Axial | null;
    readonly focusKey: string | null;
    readonly summary: AirScenarioPlaybackOperationSummary;
  }> = [];
  let index = 0;

  standaloneEvents
    .filter((event) => event.type === "capClash")
    .forEach((event) => {
      const focusKey = toOffsetHexKey(event.location);
      operations.push({
        kind: "event",
        index,
        focusHex: structuredClone(event.location),
        focusKey,
        summary: {
          kind: "event",
          missionId: event.missionId,
          unitKey: event.bomber.unitKey,
          focusKey,
          label: `${event.type}:${event.missionId ?? event.bomber.unitKey}`
        }
      });
      index += 1;
    });

  linkedStrikeFlights.forEach(({ flight, linkedEvents, escorts }) => {
    const focusHex = resolvePlaybackTargetHex(engine, flight) ?? offsetHexKeyToAxial(flight.destKey);
    const focusKey = focusHex ? toOffsetHexKey(focusHex) : flight.destKey;
    operations.push({
      kind: "linkedStrike",
      index,
      focusHex,
      focusKey,
      summary: {
        kind: "linkedStrike",
        missionId: flight.missionId,
        unitKey: flight.unitKey,
        focusKey,
        label: `linkedStrike:${flight.missionId}:${flight.unitKey}`,
        linkedEventTypes: linkedEvents.map((event) => event.type),
        escortUnitKeys: escorts.map((escort) => escort.unitKey)
      }
    });
    index += 1;
  });

  standaloneFlights.forEach((flight) => {
    const focusHex = resolvePlaybackTargetHex(engine, flight) ?? offsetHexKeyToAxial(flight.destKey);
    const focusKey = focusHex ? toOffsetHexKey(focusHex) : flight.destKey;
    operations.push({
      kind: "flight",
      index,
      focusHex,
      focusKey,
      summary: {
        kind: "flight",
        missionId: flight.missionId,
        unitKey: flight.unitKey,
        focusKey,
        label: `flight:${flight.missionId}:${flight.kind}:${flight.unitKey}`
      }
    });
    index += 1;
  });

  standaloneEvents
    .filter((event) => event.type !== "capClash")
    .forEach((event) => {
      const focusKey = toOffsetHexKey(event.location);
      operations.push({
        kind: "event",
        index,
        focusHex: structuredClone(event.location),
        focusKey,
        summary: {
          kind: "event",
          missionId: event.missionId,
          unitKey: event.bomber.unitKey,
          focusKey,
          label: `${event.type}:${event.missionId ?? event.bomber.unitKey}`
        }
      });
      index += 1;
    });

  const clusters: AirScenarioPlaybackClusterSummary[] = [];
  const clusterOperationGroups: typeof operations[] = [];
  const visited = new Set<number>();
  for (let startIndex = 0; startIndex < operations.length; startIndex += 1) {
    if (visited.has(startIndex)) {
      continue;
    }
    const clusterOperations: typeof operations = [];
    const queue = [startIndex];
    visited.add(startIndex);
    while (queue.length > 0) {
      const currentIndex = queue.shift();
      if (currentIndex === undefined) {
        continue;
      }
      const current = operations[currentIndex]!;
      clusterOperations.push(current);
      for (let candidateIndex = 0; candidateIndex < operations.length; candidateIndex += 1) {
        if (visited.has(candidateIndex)) {
          continue;
        }
        const candidate = operations[candidateIndex]!;
        const sameFocus = current.focusKey && candidate.focusKey && current.focusKey === candidate.focusKey;
        const nearbyFocus =
          current.focusHex
          && candidate.focusHex
          && axialDistance(current.focusHex, candidate.focusHex) <= 8;
        if (!sameFocus && !nearbyFocus) {
          continue;
        }
        visited.add(candidateIndex);
        queue.push(candidateIndex);
      }
    }
    clusterOperations.sort((left, right) => left.index - right.index);
    clusterOperationGroups.push(clusterOperations);
    const focusKeys = Array.from(
      new Set(clusterOperations.map((operation) => operation.focusKey).filter((focusKey): focusKey is string => Boolean(focusKey)))
    );
    clusters.push({
      index: clusters.length,
      focusKeys,
      operationSummaries: clusterOperations.map((operation) => operation.summary)
    });
  }

  const coordinatedPlans = clusterOperationGroups
    .map((clusterOperations, clusterIndex) => {
      const plan = buildCoordinatedAirClusterPlaybackPlan(
        clusterOperations
          .map((operation) => {
            if (operation.kind === "linkedStrike") {
              const linkedStrike = linkedStrikeFlights.find(
                (entry) => entry.flight.missionId === operation.summary.missionId
              );
              if (!linkedStrike) {
                return null;
              }
              return {
                kind: "linkedStrike" as const,
                index: operation.index,
                focusHex: operation.focusHex,
                focusKey: operation.focusKey,
                flight: linkedStrike.flight,
                linkedEvents: linkedStrike.linkedEvents,
                escorts: linkedStrike.escorts
              };
            }
            if (operation.kind === "flight") {
              const standaloneFlight = standaloneFlights.find(
                (entry) => entry.missionId === operation.summary.missionId
              );
              if (!standaloneFlight) {
                return null;
              }
              return {
                kind: "flight" as const,
                index: operation.index,
                focusHex: operation.focusHex,
                focusKey: operation.focusKey,
                flight: standaloneFlight
              };
            }
            const standaloneEvent = standaloneEvents.find(
              (event) =>
                event.type === operation.summary.label.split(":")[0]
                && (event.missionId ?? event.bomber.unitKey) === (operation.summary.missionId ?? operation.summary.unitKey)
            );
            if (!standaloneEvent) {
              return null;
            }
            return {
              kind: "event" as const,
              index: operation.index,
              focusHex: operation.focusHex ?? structuredClone(standaloneEvent.location),
              focusKey: operation.focusKey ?? toOffsetHexKey(standaloneEvent.location),
              event: standaloneEvent
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => !!entry),
        {
          resolveOriginKey: (unitKey, faction) => lookupUnitOriginKey(engine, unitKey, faction) ?? null,
          resolveStrength: (unitKey, faction) => lookupUnitStrength(engine, unitKey, faction),
          ...buildLiveCoordinatedPlanOptions(engine)
        }
      );
      if (!plan) {
        return null;
      }
      const fighterSceneInspection = inspectCoordinatedScene(
        plan.scene,
        `coordinated cluster #${clusterIndex + 1}`,
        Array.from(plan.strikeMissionIds)
      );
      return {
        clusterIndex,
        focusKey: plan.focusKey,
        coveredMissionIds: clusterOperations
          .map((operation) => operation.summary.missionId)
          .filter((missionId): missionId is string => typeof missionId === "string" && missionId.length > 0),
        hasFighterScene: !!plan.scene,
        fighterSceneInterceptorCount: plan.scene?.interceptors.length ?? 0,
        fighterSceneEscortCount: plan.scene?.escorts.length ?? 0,
        fighterScenePhaseLabels: fighterSceneInspection?.phaseLabels ?? [],
        fighterSceneTracerCount: fighterSceneInspection?.tracerCount ?? 0,
        fighterSceneDurationMs: fighterSceneInspection?.durationMs ?? 0,
        fighterSceneFlakBurstCount: fighterSceneInspection?.flakBurstCount ?? 0,
        strikeSortieMissionIds: Array.from(plan.strikeMissionIds),
        residualOperationLabels: Array.from(plan.residualOperations.map((entry) => {
          if (entry.kind === "linkedStrike") {
            return `linkedStrike:${entry.flight.missionId}`;
          }
          if (entry.kind === "flight") {
            return `flight:${entry.flight.missionId}`;
          }
          return `event:${entry.event.type}:${entry.event.missionId ?? entry.event.bomber.unitKey}`;
        })),
        bomberStartDelayMs: plan.bomberStartDelayMs,
        fighterIngressLeadMs: plan.fighterIngressLeadMs,
        sceneReport: fighterSceneInspection?.report ?? null,
        scenePhaseMetrics: fighterSceneInspection?.phaseMetrics ?? [],
        sceneFindings: fighterSceneInspection?.findings ?? []
      } satisfies AirScenarioCoordinatedPlanSummary;
    })
    .filter(Boolean) as AirScenarioCoordinatedPlanSummary[];

  return {
    preparedFlights,
    linkedStrikeMissionIds: linkedStrikeFlights.map((entry) => entry.flight.missionId),
    standaloneFlightMissionIds: standaloneFlights.map((flight) => flight.missionId),
    standaloneEventMissionIds: standaloneEvents.map((event) => event.missionId ?? event.type),
    clusters,
    coordinatedPlans
  };
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
            originKey:
              (entry.originHexKey ? CoordinateSystem.axialKeyToOffsetKey(entry.originHexKey) : null)
              ?? lookupUnitOriginKey(engine, entry.unitKey, entry.faction)
              ?? "",
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
    includeBomber: event.type === "airToAir",
    phaseTimings: buildLiveResolvedSceneTimingPolicy(event),
    playerHqKey: resolvePlayerHqKey(engine),
    botHqKey: resolveBotHqKey(engine)
  });
}

function buildSyntheticInspectableCases(): Array<{
  readonly event: AirEngagementEvent;
  readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
  readonly scene: ResolvedAirShowScene;
}> {
  const makeFlight = (
    id: string,
    role: ResolvedAirShowFlightSpec["role"],
    combatRole: NonNullable<ResolvedAirShowFlightSpec["combatRole"]>,
    originHexKey: string,
    laneOffsetPx: number,
    scenarioType: string,
    faction: "Player" | "Bot",
    strengthBefore: number,
    strengthAfterEscortPhase = strengthBefore,
    finalStrength = strengthBefore
  ): ResolvedAirShowFlightSpec => ({
    id,
    scenarioType,
    faction,
    originHexKey,
    strengthBefore,
    strengthAfterEscortPhase,
    finalStrength,
    laneOffsetPx,
    role,
    combatRole
  });
  const makeParticipant = (
    unitKey: string,
    renderRole: "interceptor" | "escort" | "bomber",
    combatRole: "cap" | "escort" | "strike",
    originHexKey: string
  ): ResolvedAirCombatSceneDiagnostic["participants"][number] => ({
    unitKey,
    renderRole,
    combatRole,
    source: "event",
    originHexKey
  });
  const makeBomber = (unitKey: string, faction: "Player" | "Bot") => ({
    unitKey,
    unitType: "Bomber",
    label: unitKey,
    faction,
    strength: 100
  });
  const makeFighter = (unitKey: string, faction: "Player" | "Bot", unitType = "Fighter", strength = 100) => ({
    unitKey,
    unitType,
    label: unitKey,
    faction,
    strength
  });
  const makeDiagnostics = (
    eventType: "airToAir" | "capClash",
    participants: ResolvedAirCombatSceneDiagnostic["participants"]
  ): ResolvedAirCombatSceneDiagnostic => ({
    eventType,
    bomberIncluded: participants.some((participant) => participant.renderRole === "bomber"),
    participants,
    linkedEscortUnitKeys: participants
      .filter((participant) => participant.renderRole === "escort" && participant.combatRole === "escort")
      .map((participant) => participant.unitKey),
    eventEscortUnitKeys: participants
      .filter((participant) => participant.renderRole === "escort")
      .map((participant) => participant.unitKey),
    linkedEscortMissingFromEventUnitKeys: [],
    oppositionCapFlightUnitKeys: participants
      .filter((participant) => participant.renderRole === "escort" && participant.combatRole === "cap")
      .map((participant) => participant.unitKey),
    unresolvedOriginUnitKeys: []
  });
  const makeFlakBursts = (count: number): NonNullable<ResolvedAirShowScene["flakBursts"]> =>
    Array.from({ length: count }, (_, index) => ({
      // Keep the barrage in the late final-approach window so diagnostics catch
      // regressions where flak starts bursting while the strike package is still far
      // from the target hex.
      progress: Math.min(0.94, 0.82 + index * 0.006),
      count: 1,
      scale: 0.34 + index * 0.01,
      alongOffsetPx: -12 + Math.sin((index / Math.max(1, count - 1)) * Math.PI) * 8,
      lateralOffsetPx: (index - (count - 1) / 2) * 14,
      alongSpreadPx: 62,
      lateralSpreadPx: 98,
      puffCount: 22,
      smokePuffCount: 28,
      smokeScale: 1.28 + index * 0.018
    }));

  const scenario1Participants = [
    makeParticipant("synthetic-s1-escort", "escort", "escort", "1,6"),
    makeParticipant("synthetic-s1-bomber", "bomber", "strike", "1,7")
  ] as const;
  const scenario2Participants = [makeParticipant("synthetic-s2-bomber", "bomber", "strike", "1,7")] as const;
  const scenario3Participants = [
    makeParticipant("synthetic-s3-interceptor-a", "interceptor", "cap", "6,2"),
    makeParticipant("synthetic-s3-interceptor-b", "interceptor", "cap", "6,3"),
    makeParticipant("synthetic-s3-bomber", "bomber", "strike", "1,7")
  ] as const;
  const scenario4Participants = [
    makeParticipant("synthetic-s4-player-cap-a", "interceptor", "cap", "0,1"),
    makeParticipant("synthetic-s4-player-cap-b", "interceptor", "cap", "0,2"),
    makeParticipant("synthetic-s4-axis-cap", "escort", "cap", "7,6")
  ] as const;
  const scenario5Participants = [
    makeParticipant("synthetic-s5-interceptor-a", "interceptor", "cap", "6,1"),
    makeParticipant("synthetic-s5-interceptor-b", "interceptor", "cap", "6,2"),
    makeParticipant("synthetic-s5-interceptor-c", "interceptor", "cap", "6,3"),
    makeParticipant("synthetic-s5-escort-a", "escort", "escort", "1,5"),
    makeParticipant("synthetic-s5-escort-b", "escort", "escort", "1,6"),
    makeParticipant("synthetic-s5-bomber", "bomber", "strike", "1,7")
  ] as const;

  return [
    {
      event: {
        type: "airToAir",
        missionId: "synthetic-scenario-1-escort-strike-no-interceptors",
        location: { q: 4, r: 4 },
        interceptors: [],
        escorts: [makeFighter("synthetic-s1-escort", "Player")],
        bomber: makeBomber("synthetic-s1-bomber", "Player"),
        escortExchanges: [],
        bomberPassExchanges: []
      } as unknown as AirEngagementEvent,
      diagnostics: makeDiagnostics("airToAir", [...scenario1Participants]),
      scene: {
        kind: "airToAir",
        hexKey: "4,4",
        interceptors: [],
        escorts: [makeFlight("synthetic-s1-escort", "escort", "escort", "1,6", 42, "Fighter", "Player", 100)],
        bomber: makeFlight("synthetic-s1-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100),
        escortExchanges: [],
        bomberPassExchanges: [],
        bomberTargetHexKey: "5,5",
        bomberArrivalDelayMs: 260,
        flakBursts: makeFlakBursts(18)
      }
    },
    {
      event: {
        type: "airToAir",
        missionId: "synthetic-scenario-2-strike-only",
        location: { q: 4, r: 4 },
        interceptors: [],
        escorts: [],
        bomber: makeBomber("synthetic-s2-bomber", "Player"),
        escortExchanges: [],
        bomberPassExchanges: []
      } as unknown as AirEngagementEvent,
      diagnostics: makeDiagnostics("airToAir", [...scenario2Participants]),
      scene: {
        kind: "airToAir",
        hexKey: "4,4",
        interceptors: [],
        escorts: [],
        bomber: makeFlight("synthetic-s2-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100),
        escortExchanges: [],
        bomberPassExchanges: [],
        bomberTargetHexKey: "5,5",
        flakBursts: makeFlakBursts(18)
      }
    },
    {
      event: {
        type: "airToAir",
        missionId: "synthetic-scenario-3-strike-plus-interceptors-no-escorts",
        location: { q: 4, r: 4 },
        interceptors: [
          makeFighter("synthetic-s3-interceptor-a", "Bot"),
          makeFighter("synthetic-s3-interceptor-b", "Bot", "Interceptor")
        ],
        escorts: [],
        bomber: makeBomber("synthetic-s3-bomber", "Player"),
        escortExchanges: [],
        bomberPassExchanges: [
          { attackerUnitKey: "synthetic-s3-interceptor-a", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 },
          { attackerUnitKey: "synthetic-s3-interceptor-b", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 }
        ]
      } as unknown as AirEngagementEvent,
      diagnostics: makeDiagnostics("airToAir", [...scenario3Participants]),
      scene: {
        kind: "airToAir",
        hexKey: "4,4",
        interceptors: [
          makeFlight("synthetic-s3-interceptor-a", "interceptor", "cap", "6,2", -30, "Fighter", "Bot", 100, 100, 92),
          makeFlight("synthetic-s3-interceptor-b", "interceptor", "cap", "6,3", 30, "Interceptor", "Bot", 100, 100, 88)
        ],
        escorts: [],
        bomber: makeFlight("synthetic-s3-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100, 82, 82),
        escortExchanges: [],
        bomberPassExchanges: [
          { attackerUnitKey: "synthetic-s3-interceptor-a", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 },
          { attackerUnitKey: "synthetic-s3-interceptor-b", defenderUnitKey: "synthetic-s3-bomber", defenderStrengthAfter: 82 }
        ],
        bomberTargetHexKey: "5,5",
        flakBursts: makeFlakBursts(18)
      }
    },
    {
      event: {
        type: "capClash",
        missionId: "synthetic-scenario-4-cap-clash",
        location: { q: 4, r: 4 },
        interceptors: [
          makeFighter("synthetic-s4-player-cap-a", "Player", "Fighter", 58),
          makeFighter("synthetic-s4-player-cap-b", "Player", "Interceptor", 63)
        ],
        escorts: [makeFighter("synthetic-s4-axis-cap", "Bot", "Fighter", 42)]
      } as unknown as AirEngagementEvent,
      diagnostics: makeDiagnostics("capClash", [...scenario4Participants]),
      scene: {
        kind: "capClash",
        hexKey: "4,4",
        interceptors: [
          makeFlight("synthetic-s4-player-cap-a", "interceptor", "cap", "0,1", -24, "Fighter", "Player", 100, 58, 58),
          makeFlight("synthetic-s4-player-cap-b", "interceptor", "cap", "0,2", 24, "Interceptor", "Player", 100, 63, 63)
        ],
        escorts: [makeFlight("synthetic-s4-axis-cap", "escort", "cap", "7,6", 0, "Fighter", "Bot", 100, 42, 42)],
        bomber: null,
        escortExchanges: [
          { attackerUnitKey: "synthetic-s4-player-cap-a", defenderUnitKey: "synthetic-s4-axis-cap", defenderStrengthAfter: 71 },
          { attackerUnitKey: "synthetic-s4-player-cap-b", defenderUnitKey: "synthetic-s4-axis-cap", defenderStrengthAfter: 42 }
        ],
        bomberPassExchanges: []
      }
    },
    {
      event: {
        type: "airToAir",
        missionId: "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack",
        location: { q: 4, r: 4 },
        interceptors: [
          makeFighter("synthetic-s5-interceptor-a", "Bot", "Fighter", 25),
          makeFighter("synthetic-s5-interceptor-b", "Bot", "Interceptor", 25),
          makeFighter("synthetic-s5-interceptor-c", "Bot", "Fighter", 25)
        ],
        escorts: [
          makeFighter("synthetic-s5-escort-a", "Player", "Fighter", 25),
          makeFighter("synthetic-s5-escort-b", "Player", "Interceptor", 25)
        ],
        bomber: makeBomber("synthetic-s5-bomber", "Player"),
        escortExchanges: [
          { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-escort-a", defenderStrengthAfter: 25 },
          { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-escort-b", defenderStrengthAfter: 25 }
        ],
        bomberPassExchanges: [
          { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
          { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
          { attackerUnitKey: "synthetic-s5-interceptor-c", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 }
        ]
      } as unknown as AirEngagementEvent,
      diagnostics: makeDiagnostics("airToAir", [...scenario5Participants]),
      scene: {
        kind: "airToAir",
        hexKey: "4,4",
        interceptors: [
          makeFlight("synthetic-s5-interceptor-a", "interceptor", "cap", "6,1", -54, "Fighter", "Bot", 25, 25, 25),
          makeFlight("synthetic-s5-interceptor-b", "interceptor", "cap", "6,2", 0, "Interceptor", "Bot", 25, 25, 25),
          makeFlight("synthetic-s5-interceptor-c", "interceptor", "cap", "6,3", 54, "Fighter", "Bot", 25, 25, 25)
        ],
        escorts: [
          makeFlight("synthetic-s5-escort-a", "escort", "escort", "1,5", -36, "Fighter", "Player", 25, 25, 25),
          makeFlight("synthetic-s5-escort-b", "escort", "escort", "1,6", 36, "Interceptor", "Player", 25, 25, 25)
        ],
        bomber: makeFlight("synthetic-s5-bomber", "bomber", "strike", "1,7", 0, "Bomber", "Player", 100, 100, 78),
        escortExchanges: [
          { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-escort-a", defenderStrengthAfter: 25 },
          { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-escort-b", defenderStrengthAfter: 25 }
        ],
        bomberPassExchanges: [
          { attackerUnitKey: "synthetic-s5-interceptor-a", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
          { attackerUnitKey: "synthetic-s5-interceptor-b", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 },
          { attackerUnitKey: "synthetic-s5-interceptor-c", defenderUnitKey: "synthetic-s5-bomber", defenderStrengthAfter: 78 }
        ],
        bomberTargetHexKey: "5,5",
        bomberArrivalDelayMs: 220,
        flakBursts: makeFlakBursts(20)
      }
    }
  ];
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
    const inspect = (
      event: AirEngagementEvent,
      scene: ResolvedAirShowScene,
      diagnostics: ResolvedAirCombatSceneDiagnostic
    ): {
      readonly eventType: AirEngagementEvent["type"];
      readonly missionId?: string;
      readonly diagnostics: ResolvedAirCombatSceneDiagnostic;
      readonly report: AirShowInspectionReport;
      readonly phaseMetrics: readonly AirShowPhaseMetric[];
      readonly findings: readonly AirScenarioFinding[];
    } | null => {
      const report = (renderer as unknown as {
        inspectResolvedAirCombatShow: (scene: Record<string, unknown>) => AirShowInspectionReport | null;
      }).inspectResolvedAirCombatShow(scene as unknown as Record<string, unknown>);
      if (!report) {
        return null;
      }
      const phaseMetrics = report.phases.map((phase, phaseIndex) =>
        measurePhase(report, phase, phaseIndex > 0 ? report.phases[phaseIndex - 1] : undefined)
      );
      const findings = detectAirshowFindings(
        event,
        diagnostics,
        report,
        phaseMetrics,
        (scene.flakBursts?.length ?? 0) > 0
      );
      return { eventType: event.type, missionId: event.missionId, diagnostics, report, phaseMetrics, findings };
    };

    const engineCases = engagements.flatMap((event) => {
      const linkedFlak =
        event.type === "airToAir" && event.missionId
          ? engagements.find((candidate) => candidate.type === "flak" && candidate.missionId === event.missionId) ?? null
          : null;
      const scene = buildInspectableScene(engine, event, linkedFlak);
      if (!scene) {
        return [];
      }
      const inspection = inspect(event, scene.scene, scene.diagnostics);
      return inspection ? [inspection] : [];
    });

    const syntheticCases = buildSyntheticInspectableCases().flatMap((entry) => {
      const inspection = inspect(entry.event, entry.scene, entry.diagnostics);
      return inspection ? [inspection] : [];
    });

    return [...engineCases, ...syntheticCases];
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
  return sampleAirShowWaypointPath(points, progress).point;
}

function sampleInspectionPath(
  points: ReadonlyArray<{ readonly cx: number; readonly cy: number }>,
  sampleCount = 15
): readonly { point: { cx: number; cy: number }; derivative: { dx: number; dy: number } }[] {
  return sampleAirShowWaypointPoints(points, sampleCount);
}

function sampleInspectionAssignmentPoint(
  assignment: Pick<
    AirShowInspectionReport["phases"][number]["assignments"][number],
    "points" | "sampledPositions"
  >,
  progress: number
): { cx: number; cy: number } {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const sampledPositions = assignment.sampledPositions;
  if (sampledPositions.length > 0) {
    const first = sampledPositions[0]!;
    if (clampedProgress <= first.progress || sampledPositions.length === 1) {
      return { cx: first.cx, cy: first.cy };
    }
    const last = sampledPositions[sampledPositions.length - 1]!;
    if (clampedProgress >= last.progress) {
      return { cx: last.cx, cy: last.cy };
    }
    for (let index = 1; index < sampledPositions.length; index += 1) {
      const previous = sampledPositions[index - 1]!;
      const current = sampledPositions[index]!;
      if (clampedProgress > current.progress) {
        continue;
      }
      const span = Math.max(0.0001, current.progress - previous.progress);
      const ratio = Math.max(0, Math.min(1, (clampedProgress - previous.progress) / span));
      return {
        cx: previous.cx + (current.cx - previous.cx) * ratio,
        cy: previous.cy + (current.cy - previous.cy) * ratio
      };
    }
    return { cx: last.cx, cy: last.cy };
  }
  return sampleInspectionPathPoint(assignment.points, clampedProgress);
}

function sampleInspectionAssignmentPath(
  assignment: Pick<
    AirShowInspectionReport["phases"][number]["assignments"][number],
    "points" | "sampledPositions"
  >,
  sampleCount = 15
): readonly { point: { cx: number; cy: number }; derivative: { dx: number; dy: number } }[] {
  const resolvedSampleCount = Math.max(2, sampleCount);
  const step = 1 / Math.max(1, resolvedSampleCount - 1);
  return Array.from({ length: resolvedSampleCount }, (_, index) => {
    const progress = index / Math.max(1, resolvedSampleCount - 1);
    const point = sampleInspectionAssignmentPoint(assignment, progress);
    const previousPoint = sampleInspectionAssignmentPoint(assignment, Math.max(0, progress - step));
    const nextPoint = sampleInspectionAssignmentPoint(assignment, Math.min(1, progress + step));
    return {
      point,
      derivative: {
        dx: nextPoint.cx - previousPoint.cx,
        dy: nextPoint.cy - previousPoint.cy
      }
    };
  });
}

function axialDistance(left: Axial, right: Axial): number {
  const dq = left.q - right.q;
  const dr = left.r - right.r;
  const ds = (-left.q - left.r) - (-right.q - right.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

function unitDefinitionHasTrait(
  definition: { readonly traits?: readonly string[] | string[] } | undefined,
  trait: string
): boolean {
  if (!definition || !Array.isArray(definition.traits)) {
    return false;
  }
  return (definition.traits as readonly string[]).includes(trait);
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

function resolveSampledBoundaryVector(
  sampledPositions: readonly {
    readonly cx: number;
    readonly cy: number;
  }[],
  edge: "start" | "end"
): { x: number; y: number } | null {
  if (sampledPositions.length < 2) {
    return null;
  }
  if (edge === "start") {
    const boundary = sampledPositions[0]!;
    const reference = sampledPositions.find((sample, index) =>
      index > 0 && Math.hypot(sample.cx - boundary.cx, sample.cy - boundary.cy) > 0.5
    );
    if (!reference) {
      return null;
    }
    return {
      x: reference.cx - boundary.cx,
      y: reference.cy - boundary.cy
    };
  }
  const boundary = sampledPositions[sampledPositions.length - 1]!;
  for (let index = sampledPositions.length - 2; index >= 0; index -= 1) {
    const reference = sampledPositions[index]!;
    if (Math.hypot(boundary.cx - reference.cx, boundary.cy - reference.cy) <= 0.5) {
      continue;
    }
    return {
      x: boundary.cx - reference.cx,
      y: boundary.cy - reference.cy
    };
  }
  return null;
}

export function resolveInspectionAssignmentBoundaryPoint(
  assignment: Pick<
    AirShowInspectionReport["phases"][number]["assignments"][number],
    "points" | "sampledPositions"
  >,
  edge: "start" | "end"
): { cx: number; cy: number } | null {
  const sampledBoundary =
    edge === "start"
      ? assignment.sampledPositions[0]
      : assignment.sampledPositions[assignment.sampledPositions.length - 1];
  if (sampledBoundary) {
    return {
      cx: sampledBoundary.cx,
      cy: sampledBoundary.cy
    };
  }
  const rawBoundary =
    edge === "start"
      ? assignment.points[0]
      : assignment.points[assignment.points.length - 1];
  return rawBoundary ? { cx: rawBoundary.cx, cy: rawBoundary.cy } : null;
}

function measurePhase(
  report: AirShowInspectionReport,
  phase: AirShowInspectionReport["phases"][number],
  previousPhase?: AirShowInspectionReport["phases"][number]
): AirShowPhaseMetric {
  const sampledAssignments = phase.assignments.map((assignment) => ({
    assignment,
    samples: sampleInspectionAssignmentPath(assignment, 17)
  }));
  const allPoints = sampledAssignments.flatMap((entry) => entry.samples.map((sample) => sample.point));
  const xs = allPoints.map((point) => point.cx);
  const ys = allPoints.map((point) => point.cy);
  const widthPx = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
  const heightPx = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;
  const pathLengths = sampledAssignments.map(({ samples }) =>
    samples.slice(1).reduce((sum, sample, index) => {
      const prev = samples[index]!.point;
      return sum + Math.hypot(sample.point.cx - prev.cx, sample.point.cy - prev.cy);
    }, 0)
  );
  const waypointTurnAngles = sampledAssignments.flatMap(({ samples }) =>
    samples.slice(2).map((sample, index) => {
      const first = samples[index]!.point;
      const second = samples[index + 1]!.point;
      return angleBetweenVectors(
        { x: second.cx - first.cx, y: second.cy - first.cy },
        { x: sample.point.cx - second.cx, y: sample.point.cy - second.cy }
      );
    })
  );
  const firstWaypointTurnAngles = sampledAssignments
    .map(({ samples }) => {
      if (samples.length < 3) {
        return null;
      }
      const first = samples[0]!.point;
      const second = samples[1]!.point;
      const third = samples[2]!.point;
      return angleBetweenVectors(
        { x: second.cx - first.cx, y: second.cy - first.cy },
        { x: third.cx - second.cx, y: third.cy - second.cy }
      );
    })
    .filter((angle): angle is number => typeof angle === "number");
  const displacements = sampledAssignments.map(({ samples }) => {
    const start = samples[0]?.point;
    const end = samples[samples.length - 1]?.point;
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
  const visibleTracerLengths = phase.tracers.map((tracer) => tracer.visibleLengthPx);
  const tracerFanSpans = phase.tracers.map((tracer) =>
    tracer.leftFanEndPoint && tracer.rightFanEndPoint
      ? distanceBetween(tracer.leftFanEndPoint, tracer.rightFanEndPoint)
      : 0
  );
  const tracerAlignmentAngles = phase.tracers
    .map((tracer) => {
      if (!tracer.targetPoint) {
        return null;
      }
      return angleBetweenVectors(
        {
          x: tracer.centerlineEndPoint.cx - tracer.emitterPoint.cx,
          y: tracer.centerlineEndPoint.cy - tracer.emitterPoint.cy
        },
        {
          x: tracer.targetPoint.cx - tracer.emitterPoint.cx,
          y: tracer.targetPoint.cy - tracer.emitterPoint.cy
        }
      );
    })
    .filter((angle): angle is number => typeof angle === "number");
  const tracerRanges = phase.tracers
    .map((tracer) => {
      if (!tracer.targetPoint) {
        return null;
      }
      return distanceBetween(tracer.emitterPoint, tracer.targetPoint);
    })
    .filter((range): range is number => typeof range === "number");
  const flakWidths = phase.flakBursts.map((burst) => burst.widthPx);
  const flakHeights = phase.flakBursts.map((burst) => burst.heightPx);
  const flakFlashCounts = phase.flakBursts.map((burst) => burst.flashCount);

  const entryTurnAngles = previousPhase
    ? phase.assignments
        .map((assignment) => {
          const previousAssignment = previousPhase.assignments.find((candidate) => candidate.actorId === assignment.actorId);
          if (!previousAssignment) {
            return null;
          }
          const previousVector = resolveSampledBoundaryVector(previousAssignment.sampledPositions, "end");
          const currentVector = resolveSampledBoundaryVector(assignment.sampledPositions, "start");
          if (!previousVector || !currentVector) {
            return null;
          }
          return angleBetweenVectors(previousVector, currentVector);
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
    const startCentroid = averagePoint(assignments.map((assignment) => sampleInspectionAssignmentPoint(assignment, 0)));
    const midCentroid = averagePoint(assignments.map((assignment) => sampleInspectionAssignmentPoint(assignment, 0.5)));
    const endCentroid = averagePoint(assignments.map((assignment) => sampleInspectionAssignmentPoint(assignment, 1)));
    const assignmentPathLengths = assignments.map((assignment) => {
      const samples = sampleInspectionAssignmentPath(assignment, 17);
      return samples.slice(1).reduce((sum, sample, index) => sum + distanceBetween(samples[index]!.point, sample.point), 0);
    });
    const assignmentDisplacements = assignments.map((assignment) =>
      distanceBetween(sampleInspectionAssignmentPoint(assignment, 0), sampleInspectionAssignmentPoint(assignment, 1))
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
      meanEfficiency: groupMeanPathLengthPx > 0 ? groupMeanDisplacementPx / groupMeanPathLengthPx : 0,
      meanSpeedPxPerSec: groupMeanPathLengthPx / Math.max(0.001, phase.durationMs / 1000)
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
      const leftMidPoints = leftAssignments.map((assignment) => sampleInspectionAssignmentPoint(assignment, 0.5));
      const rightMidPoints = rightAssignments.map((assignment) => sampleInspectionAssignmentPoint(assignment, 0.5));
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
    meanSpeedPxPerSec: meanPathLengthPx / Math.max(0.001, phase.durationMs / 1000),
    tracerCount: phase.tracers.length,
    meanTracerLengthPx:
      tracerLengths.length > 0 ? tracerLengths.reduce((sum, value) => sum + value, 0) / tracerLengths.length : 0,
    meanVisibleTracerLengthPx:
      visibleTracerLengths.length > 0
        ? visibleTracerLengths.reduce((sum, value) => sum + value, 0) / visibleTracerLengths.length
        : 0,
    meanTracerFanSpanPx:
      tracerFanSpans.length > 0 ? tracerFanSpans.reduce((sum, value) => sum + value, 0) / tracerFanSpans.length : 0,
    meanTracerAlignmentDeg:
      tracerAlignmentAngles.length > 0
        ? tracerAlignmentAngles.reduce((sum, value) => sum + value, 0) / tracerAlignmentAngles.length
        : 0,
    maxTracerAlignmentDeg: tracerAlignmentAngles.length > 0 ? Math.max(...tracerAlignmentAngles) : 0,
    meanTracerRangePx:
      tracerRanges.length > 0 ? tracerRanges.reduce((sum, value) => sum + value, 0) / tracerRanges.length : 0,
    maxTracerRangePx: tracerRanges.length > 0 ? Math.max(...tracerRanges) : 0,
    flakBurstCount: phase.flakBursts.length,
    flakFlashCount: flakFlashCounts.reduce((sum, value) => sum + value, 0),
    flakPuffCount: phase.flakBursts.reduce((sum, burst) => sum + burst.puffCount, 0),
    meanFlakWidthPx: flakWidths.length > 0 ? flakWidths.reduce((sum, value) => sum + value, 0) / flakWidths.length : 0,
    meanFlakHeightPx: flakHeights.length > 0 ? flakHeights.reduce((sum, value) => sum + value, 0) / flakHeights.length : 0,
    meanEntryTurnAngleDeg:
      entryTurnAngles.length > 0 ? entryTurnAngles.reduce((sum, value) => sum + value, 0) / entryTurnAngles.length : 0,
    maxEntryTurnAngleDeg: entryTurnAngles.length > 0 ? Math.max(...entryTurnAngles) : 0,
    meanWaypointTurnAngleDeg:
      waypointTurnAngles.length > 0 ? waypointTurnAngles.reduce((sum, value) => sum + value, 0) / waypointTurnAngles.length : 0,
    maxWaypointTurnAngleDeg: waypointTurnAngles.length > 0 ? Math.max(...waypointTurnAngles) : 0,
    meanFirstWaypointTurnAngleDeg:
      firstWaypointTurnAngles.length > 0
        ? firstWaypointTurnAngles.reduce((sum, value) => sum + value, 0) / firstWaypointTurnAngles.length
        : 0,
    maxFirstWaypointTurnAngleDeg: firstWaypointTurnAngles.length > 0 ? Math.max(...firstWaypointTurnAngles) : 0,
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
      visibleLengthPx: tracer.visibleLengthPx,
      fanHalfAngleDeg: tracer.fanHalfAngleDeg,
      emitterPoint: tracer.emitterPoint,
      centerlineEndPoint: tracer.centerlineEndPoint,
      leftFanEndPoint: tracer.leftFanEndPoint,
      rightFanEndPoint: tracer.rightFanEndPoint,
      targetPoint: tracer.targetPoint,
      targetAlignmentDeg: tracer.targetPoint
        ? angleBetweenVectors(
            {
              x: tracer.centerlineEndPoint.cx - tracer.emitterPoint.cx,
              y: tracer.centerlineEndPoint.cy - tracer.emitterPoint.cy
            },
            {
              x: tracer.targetPoint.cx - tracer.emitterPoint.cx,
              y: tracer.targetPoint.cy - tracer.emitterPoint.cy
            }
          )
        : undefined,
      targetRangePx: tracer.targetPoint ? distanceBetween(tracer.emitterPoint, tracer.targetPoint) : undefined
    })),
    flakMetrics: phase.flakBursts.map((burst) => {
      const sampledBomberCenter =
        burst.sampledBomberCenter
        ?? (burst.targetSource === "bomberPath" ? burst.targetCenter : undefined);
      const rangeReferenceCenter = burst.rangeReferenceCenter ?? burst.targetCenter;
      return {
        progress: burst.progress,
        burstCenter: burst.burstCenter,
        sampledBomberCenter,
        rangeReferenceCenter,
        rangeToReferencePx: sampledBomberCenter ? distanceBetween(sampledBomberCenter, rangeReferenceCenter) : undefined,
        flashCount: burst.flashCount,
        puffCount: burst.puffCount,
        smokePuffCount: burst.smokePuffCount,
        widthPx: burst.widthPx,
        heightPx: burst.heightPx
      };
    })
  };
}

interface AirShowPhaseContinuityGap {
  readonly actorId: string;
  readonly role: AirShowInspectionReport["phases"][number]["assignments"][number]["role"];
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly gapPx: number;
}

function collectPhaseContinuityGaps(report: AirShowInspectionReport): AirShowPhaseContinuityGap[] {
  const gaps: AirShowPhaseContinuityGap[] = [];
  for (let phaseIndex = 1; phaseIndex < report.phases.length; phaseIndex += 1) {
    const previousPhase = report.phases[phaseIndex - 1];
    const currentPhase = report.phases[phaseIndex];
    const previousAssignmentsByActor = new Map(
      previousPhase.assignments.map((assignment) => [assignment.actorId, assignment] as const)
    );
    currentPhase.assignments.forEach((assignment) => {
      const previousAssignment = previousAssignmentsByActor.get(assignment.actorId);
      const previousEnd = previousAssignment
        ? resolveInspectionAssignmentBoundaryPoint(previousAssignment, "end")
        : null;
      const currentStart = resolveInspectionAssignmentBoundaryPoint(assignment, "start");
      if (!previousEnd || !currentStart) {
        return;
      }
      gaps.push({
        actorId: assignment.actorId,
        role: assignment.role,
        fromLabel: previousPhase.label,
        toLabel: currentPhase.label,
        gapPx: distanceBetween(previousEnd, currentStart)
      });
    });
  }
  return gaps;
}

function detectAirshowFindings(
  event: AirEngagementEvent,
  diagnostics: ResolvedAirCombatSceneDiagnostic,
  report: AirShowInspectionReport,
  phaseMetrics: readonly AirShowPhaseMetric[],
  expectedFlakOnTargetRun: boolean
): AirScenarioFinding[] {
  const findings: AirScenarioFinding[] = [];
  const isSyntheticScenario = event.missionId?.startsWith(SYNTHETIC_SCENARIO_MISSION_PREFIX) ?? false;
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
  const fighterIngressMetric = phaseMetrics.find((metric) => metric.label === "fighter-ingress");
  if (fighterIngressMetric) {
    const capGroups = fighterIngressMetric.groupMetrics.filter((group) => group.combatRole === "cap");
    const escortGroups = fighterIngressMetric.groupMetrics.filter((group) => group.combatRole === "escort");
    if (capGroups.length > 0 && escortGroups.length > 0) {
      const capEndDistancePx =
        capGroups.reduce((sum, group) => sum + distanceBetween(group.centroidEnd, report.center), 0) / capGroups.length;
      const escortEndDistancePx =
        escortGroups.reduce((sum, group) => sum + distanceBetween(group.centroidEnd, report.center), 0) / escortGroups.length;
      if (escortEndDistancePx + 28 < capEndDistancePx) {
        findings.push({
          code: "escort-ingress-overreach",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} fighter ingress places escorts ${Math.round(capEndDistancePx - escortEndDistancePx)}px ` +
            `deeper into the contested center than the defending CAP.`
        });
      }
    }
  }
  const bomberGapPhase = report.phases.find((phase) => phase.label === "bomber-gap");
  if (bomberGapPhase && bomberGapPhase.durationMs > 1400) {
    findings.push({
      code: "long-bomber-gap",
      message:
        `${event.type} ${event.missionId ?? "<no-mission>"} inserts a ${bomberGapPhase.durationMs}ms bomber-gap drift window ` +
        `between the dogfight and strike run.`
    });
  }
  const bomberGapMetric = phaseMetrics.find((metric) => metric.label === "bomber-gap");
  if (bomberGapMetric) {
    bomberGapMetric.groupMetrics
      .filter((group) => group.combatRole !== "strike")
      .forEach((group) => {
        if (group.meanDisplacementPx < 90 || group.meanSpeedPxPerSec < 110) {
          findings.push({
            code: "static-bomber-gap-screen",
            message:
              `${event.type} ${event.missionId ?? "<no-mission>"} keeps ${group.label} drifting only ` +
              `${Math.round(group.meanDisplacementPx)}px at ${Math.round(group.meanSpeedPxPerSec)}px/s during bomber-gap.`
          });
        }
      });
  }
  const continuityGaps = collectPhaseContinuityGaps(report);
  const worstBomberGap = continuityGaps
    .filter((gap) => gap.role === "bomber")
    .sort((left, right) => right.gapPx - left.gapPx)[0];
  if (worstBomberGap && worstBomberGap.gapPx > 8) {
    findings.push({
      code: "bomber-phase-pop",
      message:
        `${event.type} ${event.missionId ?? "<no-mission>"} moves bomber actor ${worstBomberGap.actorId} ` +
        `${Math.round(worstBomberGap.gapPx)}px between ${worstBomberGap.fromLabel} and ${worstBomberGap.toLabel}.`
    });
  }
  phaseMetrics.forEach((metric) => {
    if (!isSyntheticScenario && metric.label.includes("ingress") && metric.meanDisplacementPx < 90) {
      findings.push({
        code: "compressed-ingress",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only displaced aircraft ` +
          `${Math.round(metric.meanDisplacementPx)}px on average.`
      });
    }
    if (!isSyntheticScenario && metric.label.includes("ingress")) {
      metric.groupMetrics.forEach((group) => {
        if (group.meanDisplacementPx < 50) {
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
      if (expectedFlakOnTargetRun && metric.flakBurstCount <= 0) {
        findings.push({
          code: "missing-flak-target-run",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} expected flak coverage on target-run but scheduled no flak bursts.`
        });
      }
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
    if (!isSyntheticScenario && (metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount <= 0) {
      findings.push({
        code: "missing-tracer-phase",
        message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} scheduled no tracers.`
      });
    }
    if (!isSyntheticScenario && (metric.meanEntryTurnAngleDeg > 110 || metric.maxEntryTurnAngleDeg > 145)) {
      findings.push({
        code: "hard-phase-reversal",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} enters with mean/max turn ` +
          `${Math.round(metric.meanEntryTurnAngleDeg)}/${Math.round(metric.maxEntryTurnAngleDeg)} degrees.`
      });
    }
    const isScramblePhase = metric.label.includes("scramble");
    const isEgressPhase = metric.label === "egress";
    const isBomberManeuverPhase = metric.label.includes("pass") || metric.label === "target-run" || metric.label === "bomber-ingress";
    const waypointMeanThreshold = isScramblePhase ? 56 : isEgressPhase ? 34 : isBomberManeuverPhase ? 32 : 26;
    const waypointMaxThreshold = isScramblePhase ? 180 : isEgressPhase ? 180 : isBomberManeuverPhase ? 176 : 160;
    if (
      metric.meanWaypointTurnAngleDeg > waypointMeanThreshold ||
      (metric.maxWaypointTurnAngleDeg > waypointMaxThreshold
        && metric.meanWaypointTurnAngleDeg > waypointMeanThreshold * 0.92)
    ) {
      findings.push({
        code: "sharp-waypoint-turn",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} bends within the path at ` +
          `${Math.round(metric.meanWaypointTurnAngleDeg)}/${Math.round(metric.maxWaypointTurnAngleDeg)} degrees.`
      });
    }
    const isClashPhase = metric.label.includes("clash");
    // Clash phases involve convergence from arbitrary ingress positions; the linear first-segment
    // interpolation makes the first-turn metric unreliable here — disable it (set to 180).
    const firstTurnMeanThreshold = isScramblePhase || isClashPhase ? 180 : isEgressPhase ? 42 : isBomberManeuverPhase ? 38 : 34;
    const firstTurnMaxThreshold = isScramblePhase || isClashPhase ? 180 : isEgressPhase ? 75 : isBomberManeuverPhase ? 130 : 60;
    if (
      metric.meanFirstWaypointTurnAngleDeg > firstTurnMeanThreshold ||
      metric.maxFirstWaypointTurnAngleDeg > firstTurnMaxThreshold
    ) {
      findings.push({
        code: "jerky-phase-entry",
        message:
          `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} turns too sharply at its first waypoint ` +
          `(${Math.round(metric.meanFirstWaypointTurnAngleDeg)}/${Math.round(metric.maxFirstWaypointTurnAngleDeg)} degrees).`
      });
    }
    if (!isSyntheticScenario && metric.label.includes("clash")) {
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
    if (!isSyntheticScenario && (metric.label.includes("clash") || metric.label.includes("pass")) && metric.tracerCount > 0) {
      if (metric.meanTracerLengthPx < 96 || metric.meanVisibleTracerLengthPx < 8) {
        findings.push({
          code: "short-tracers",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} only paints ` +
            `${Math.round(metric.meanTracerLengthPx)}/${Math.round(metric.meanVisibleTracerLengthPx)}px tracer streaks on average.`
        });
      }
      if (metric.meanTracerAlignmentDeg > 24 || metric.maxTracerAlignmentDeg > 38) {
        findings.push({
          code: "misaligned-tracers",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} aims tracers ` +
            `${Math.round(metric.meanTracerAlignmentDeg)}/${Math.round(metric.maxTracerAlignmentDeg)} degrees away from target.`
        });
      }
      if (metric.meanTracerFanSpanPx > 18) {
        findings.push({
          code: "laser-fan-tracers",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} spreads tracer fans across ` +
            `${Math.round(metric.meanTracerFanSpanPx)}px on average instead of tight forward bursts.`
        });
      }
      if (metric.meanTracerRangePx > 150 || metric.maxTracerRangePx > 210) {
        findings.push({
          code: "detached-tracer-fire",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} fires from ` +
            `${Math.round(metric.meanTracerRangePx)}/${Math.round(metric.maxTracerRangePx)}px away from targets.`
        });
      }
    }
    if (metric.label === "target-run" && metric.flakBurstCount > 0) {
      const outOfRangeFlak = metric.flakMetrics.find(
        (flak) => typeof flak.rangeToReferencePx === "number" && flak.rangeToReferencePx > HEX_WIDTH * 8.25
      );
      if (outOfRangeFlak) {
        findings.push({
          code: "early-flak-window",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} schedules flak ` +
            `${Math.round(outOfRangeFlak.rangeToReferencePx ?? 0)}px from its battery/target reference before the eight-hex engagement window.`
        });
      }
      if (metric.flakMetrics.some((flak) => flak.progress > 0.94)) {
        findings.push({
          code: "late-flak-window",
          message: `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} lets flak slip past the target approach and into bomb-release timing.`
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
      if (metric.flakFlashCount > Math.max(14, Math.round(metric.flakPuffCount * 0.45))) {
        findings.push({
          code: "overbright-flak-barrage",
          message:
            `${event.type} ${event.missionId ?? "<no-mission>"} phase ${metric.label} still shows ` +
            `${metric.flakFlashCount} visible flak flashes for ${metric.flakPuffCount} scheduled puffs.`
        });
      }
    }
  });
  return findings;
}

function detectAnomalies(
  engine: GameEngine,
  missionReports: readonly AirMissionReportEntry[],
  engagements: readonly AirEngagementEvent[],
  expectedFlakCoverageByMissionId: Readonly<Record<string, readonly string[]>>
): AirScenarioAnomaly[] {
  const anomalies: AirScenarioAnomaly[] = [];
  const internals = engine as unknown as {
    playerPlacements: Map<string, ScenarioUnit>;
    botPlacements: Map<string, ScenarioUnit>;
    aaEngagementsByUnitId?: Map<string, number>;
    aaEngagementLimitsByUnitId?: Map<string, number>;
  };
  const hasDefendingFlakCoverage = (report: AirMissionReportEntry): boolean => {
    if (!report.targetHex) {
      return false;
    }
    const defendingPlacements = report.faction === "Bot" ? internals.playerPlacements : internals.botPlacements;
    return Array.from(defendingPlacements.values()).some((unit) => {
      const definition = unitTypes[unit.type as keyof typeof unitTypes];
      if (!unitDefinitionHasTrait(definition, "intercept")) {
        return false;
      }
      const unitKey = unit.unitId ?? `${unit.type}@${unit.hex.q},${unit.hex.r}`;
      const engagementLimit = internals.aaEngagementLimitsByUnitId?.get(unitKey) ?? (unit.onSentry === true ? 2 : 1);
      const engagements = internals.aaEngagementsByUnitId?.get(unitKey) ?? 0;
      if (engagements >= engagementLimit) {
        return false;
      }
      return axialDistance(unit.hex, report.targetHex!) <= 2;
    });
  };

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
      const hasFlakEvent = engagements.some((event) => event.type === "flak" && event.missionId === report.missionId);
      const expectedCoverage = expectedFlakCoverageByMissionId[report.missionId] ?? [];
      if (report.outcome?.result !== "destroyed" && expectedCoverage.length > 0 && !hasFlakEvent) {
        anomalies.push({
          code: "missing-flak-engagement",
          message:
            `${describeMission(report)} entered a target hex covered by sentry flak (${expectedCoverage.join(", ")}), but no flak engagement event was recorded.`
        });
      } else if (report.outcome?.result !== "destroyed" && hasDefendingFlakCoverage(report) && !hasFlakEvent) {
        anomalies.push({
          code: "missing-flak-engagement-live-state",
          message:
            `${describeMission(report)} appears to have defending flak coverage in the resolved state, but no flak engagement event was recorded.`
        });
      }
    });

  return anomalies;
}

export function runAirScenario(): AirScenarioResult {
  const engine = buildEngine();
  const expectedFlakCoverageByMissionId = snapshotExpectedFlakCoverage(engine);
  (engine as unknown as { resolveReadyAirMissionsForRound: () => void }).resolveReadyAirMissionsForRound();
  const arrivals = (() => {
    const consumed = engine.consumeAirMissionArrivals();
    return consumed.length > 0 ? consumed : buildFallbackPlaybackArrivals(engine);
  })();
  const missionReports = engine.getAirMissionReports().filter(isResolvedMissionReport);
  const engagements = engine.consumeAirEngagements();
  const playbackProjection = buildPlaybackProjection(engine, arrivals, engagements);
  const airshowInspections = buildAirshowInspections(engine, engagements);
  const { findings, legacyDiagnosticFindings } = collectAuthoritativeAirScenarioFindings(
    playbackProjection,
    airshowInspections
  );
  return {
    scenarioName: "Air Combat Automation Scenario",
    arrivals,
    missionReports,
    engagements,
    expectedFlakCoverageByMissionId,
    playbackProjection,
    airshowInspections,
    anomalies: detectAnomalies(engine, missionReports, engagements, expectedFlakCoverageByMissionId),
    findings,
    legacyDiagnosticFindings
  };
}

export function formatAirScenarioReport(result: AirScenarioResult): string {
  const formatPoint = (point: { readonly cx: number; readonly cy: number } | undefined): string =>
    point ? `(${Math.round(point.cx)},${Math.round(point.cy)})` : "(n/a)";
  const formatHeading = (headingDegrees: number | undefined): string =>
    typeof headingDegrees === "number" && Number.isFinite(headingDegrees)
      ? `${Math.round(headingDegrees)}deg`
      : "n/a";
  const formatPxPer100Ms = (speedPxPer100Ms: number | undefined): string =>
    typeof speedPxPer100Ms === "number" && Number.isFinite(speedPxPer100Ms)
      ? `${speedPxPer100Ms.toFixed(1)}px/100ms`
      : "n/a";
  const describeSpeedWindow = (
    sampledPositions: readonly {
      readonly timeMs: number;
      readonly cx: number;
      readonly cy: number;
    }[]
  ): {
    readonly minPxPer100Ms: number;
    readonly meanPxPer100Ms: number;
    readonly maxPxPer100Ms: number;
  } | null => {
    const segmentSpeeds = sampledPositions
      .slice(1)
      .map((sample, index) => {
        const previous = sampledPositions[index];
        if (!previous) {
          return null;
        }
        const dt = sample.timeMs - previous.timeMs;
        if (dt <= 0) {
          return null;
        }
        const distancePx = Math.hypot(sample.cx - previous.cx, sample.cy - previous.cy);
        return (distancePx / dt) * 100;
      })
      .filter((speed): speed is number => typeof speed === "number" && Number.isFinite(speed));
    if (segmentSpeeds.length <= 0) {
      return null;
    }
    return {
      minPxPer100Ms: Math.min(...segmentSpeeds),
      meanPxPer100Ms: segmentSpeeds.reduce((sum, speed) => sum + speed, 0) / segmentSpeeds.length,
      maxPxPer100Ms: Math.max(...segmentSpeeds)
    };
  };
  const describeSampleTrack = (
    sampledPositions: readonly {
      readonly timeMs: number;
      readonly progress: number;
      readonly cx: number;
      readonly cy: number;
      readonly headingDegrees: number;
    }[]
  ): string =>
    sampledPositions
      .map((sample, index) => {
        const previous = index > 0 ? sampledPositions[index - 1] : null;
        const speedLabel = previous
          ? (() => {
              const dt = sample.timeMs - previous.timeMs;
              if (dt <= 0) {
                return "spd=n/a";
              }
              const distancePx = Math.hypot(sample.cx - previous.cx, sample.cy - previous.cy);
              return `spd=${formatPxPer100Ms((distancePx / dt) * 100)}`;
            })()
          : "spd=start";
        return `t=${sample.timeMs}ms p=${sample.progress.toFixed(2)} pos=(${Math.round(sample.cx)},${Math.round(sample.cy)}) hdg=${formatHeading(sample.headingDegrees)} ${speedLabel}`;
      })
      .join(" | ");
  const describeActor = (
    inspectionReport: AirShowInspectionReport,
    assignment: AirShowInspectionReport["phases"][number]["assignments"][number]
  ): string => {
    const flight = inspectionReport.flights.find((entry) => entry.id === assignment.flightId);
    const actor = flight?.actors.find((entry) => entry.actorId === assignment.actorId);
    const speedWindow = describeSpeedWindow(assignment.sampledPositions);
    const roleLabel = flight?.combatRole ? `${assignment.role}/${flight.combatRole}` : assignment.role;
    return [
      `${assignment.actorId}`,
      `${flight?.faction ?? "Unknown"}`,
      `${flight?.scenarioType ?? assignment.role}`,
      `${roleLabel}`,
      `flight=${assignment.flightId}`,
      actor ? `anchor=${formatPoint(actor.position)} ${formatHeading(actor.headingDegrees)}` : null,
      speedWindow
        ? `speed[min/mean/max]=${formatPxPer100Ms(speedWindow.minPxPer100Ms)}/${formatPxPer100Ms(speedWindow.meanPxPer100Ms)}/${formatPxPer100Ms(speedWindow.maxPxPer100Ms)}`
        : null
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
  };
  const lines: string[] = [];
  lines.push(`Scenario: ${result.scenarioName}`);
  lines.push(`Mission arrivals: ${result.arrivals.length}`);
  lines.push(`Mission reports: ${result.missionReports.length}`);
  lines.push(`Engagement events: ${result.engagements.length}`);
  lines.push("");
  lines.push("Mission arrivals:");
  result.arrivals.forEach((arrival) => {
    const targetHex = arrival.targetHex ? `${arrival.targetHex.q},${arrival.targetHex.r}` : arrival.escortTargetUnitKey ?? "none";
    lines.push(`- ${arrival.faction} ${arrival.kind} ${arrival.unitType} ${arrival.unitKey} -> ${targetHex}`);
  });
  lines.push("");
  lines.push("Mission results:");
  result.missionReports.forEach((report) => {
    lines.push(`- ${describeMission(report)}`);
  });
  lines.push("");
  lines.push("Expected flak coverage snapshot:");
  const flakMissionIds = Object.keys(result.expectedFlakCoverageByMissionId).sort();
  if (flakMissionIds.length > 0) {
    flakMissionIds.forEach((missionId) => {
      const batteries = result.expectedFlakCoverageByMissionId[missionId] ?? [];
      lines.push(`- ${missionId}: ${batteries.length > 0 ? batteries.join(", ") : "none"}`);
    });
  } else {
    lines.push("- none");
  }
  lines.push("");
  lines.push("Engagement timeline:");
  result.engagements.forEach((event) => {
    lines.push(`- ${describeEngagement(event)}`);
  });
  lines.push("");
  lines.push("Playback projection:");
  lines.push(
    `- prepared=${result.playbackProjection.preparedFlights.length} linkedStrikeOps=${result.playbackProjection.linkedStrikeMissionIds.length} ` +
    `standaloneFlights=${result.playbackProjection.standaloneFlightMissionIds.length} standaloneEvents=${result.playbackProjection.standaloneEventMissionIds.length} ` +
    `clusters=${result.playbackProjection.clusters.length} coordinatedPlans=${result.playbackProjection.coordinatedPlans.length}`
  );
  result.playbackProjection.preparedFlights.forEach((flight) => {
    lines.push(
      `  flight ${flight.missionId} ${flight.kind} ${flight.unitKey} ${flight.originKey}->${flight.destKey} lane=${flight.laneOffsetPx}`
      + (flight.escortTargetUnitKey ? ` escortTarget=${flight.escortTargetUnitKey}` : "")
    );
  });
  result.playbackProjection.clusters.forEach((cluster) => {
    lines.push(
      `  cluster #${cluster.index + 1} focus=${cluster.focusKeys.join(" | ") || "<none>"} ops=${cluster.operationSummaries.length}`
    );
    cluster.operationSummaries.forEach((operation) => {
      lines.push(
        `    ${operation.label} focus=${operation.focusKey ?? "<none>"}`
        + (operation.linkedEventTypes && operation.linkedEventTypes.length > 0
          ? ` events=${operation.linkedEventTypes.join("|")}`
          : "")
        + (operation.escortUnitKeys && operation.escortUnitKeys.length > 0
          ? ` escorts=${operation.escortUnitKeys.join("|")}`
          : "")
      );
    });
  });
  result.playbackProjection.coordinatedPlans.forEach((plan) => {
    lines.push(
      `  coordinated cluster #${plan.clusterIndex + 1} focus=${plan.focusKey ?? "<none>"} ` +
      `coveredMissionIds=${plan.coveredMissionIds.join("|") || "<none>"} ` +
      `fighterScene=${plan.hasFighterScene} interceptors=${plan.fighterSceneInterceptorCount} escorts=${plan.fighterSceneEscortCount} ` +
      `strikeSorties=${plan.strikeSortieMissionIds.join("|") || "<none>"} bomberDelayMs=${plan.bomberStartDelayMs} ` +
      `fighterLeadMs=${plan.fighterIngressLeadMs} fighterSceneDurationMs=${plan.fighterSceneDurationMs} tracers=${plan.fighterSceneTracerCount} flak=${plan.fighterSceneFlakBurstCount}`
    );
    if (plan.fighterScenePhaseLabels.length > 0) {
      lines.push(`    fighterScenePhases=${plan.fighterScenePhaseLabels.join(" -> ")}`);
    }
    if (plan.residualOperationLabels.length > 0) {
      lines.push(`    residual=${plan.residualOperationLabels.join(" | ")}`);
    }
    if (plan.sceneFindings.length > 0) {
      plan.sceneFindings.forEach((finding) => {
        lines.push(`    finding ${finding.code}: ${finding.message}`);
      });
    }
  });
  lines.push("");
  const coordinatedGeometryPlans = result.playbackProjection.coordinatedPlans.filter((plan) => plan.sceneReport);
  if (coordinatedGeometryPlans.length > 0) {
    lines.push("Coordinated airshow geometry:");
    coordinatedGeometryPlans.forEach((plan) => {
      const report = plan.sceneReport;
      if (!report) {
        return;
      }
      lines.push(
        `- coordinated cluster #${plan.clusterIndex + 1} focus=${plan.focusKey ?? "<none>"} center=(${Math.round(report.center.cx)},${Math.round(report.center.cy)}) phases=${report.phases.length} sorties=${plan.strikeSortieMissionIds.join("|") || "<none>"}`
      );
      if (report.flights.length > 0) {
        lines.push("  flight roster:");
        report.flights.forEach((flight) => {
          const activeActors = flight.actors.filter((actor) => actor.active);
          const actorSummary = flight.actors
            .map((actor) =>
              `${actor.actorId}@${formatPoint(actor.position)} ${formatHeading(actor.headingDegrees)} ${actor.active ? "active" : "inactive"}`
            )
            .join(" | ");
          lines.push(
            `    ${flight.id} ${flight.faction ?? "Unknown"} ${flight.scenarioType} ${flight.role}/${flight.combatRole ?? "unknown"} ` +
            `strength=${flight.strengthBefore}->${flight.strengthAfterEscortPhase ?? flight.strengthBefore}->${flight.finalStrength ?? flight.strengthBefore} ` +
            `actors=${flight.actors.length} active=${activeActors.length} origin=${flight.originHexKey ?? "<none>"}`
          );
          lines.push(`      ${actorSummary}`);
        });
      }
      report.phases.forEach((phase) => {
        const metrics = plan.scenePhaseMetrics.find((entry) => entry.label === phase.label);
        lines.push(
          `  phase ${phase.label} ${phase.durationMs}ms assignments=${phase.assignments.length} tracers=${phase.tracers.length}` +
          (metrics
            ? ` box=${Math.round(metrics.widthPx)}x${Math.round(metrics.heightPx)} path=${Math.round(metrics.meanPathLengthPx)} disp=${Math.round(metrics.meanDisplacementPx)} eff=${Math.round(metrics.meanEfficiency * 100)}%` +
              ` speed=${Math.round(metrics.meanSpeedPxPerSec)}` +
              ` turn=${Math.round(metrics.meanEntryTurnAngleDeg)}/${Math.round(metrics.maxEntryTurnAngleDeg)}` +
              ` pathTurn=${Math.round(metrics.meanWaypointTurnAngleDeg)}/${Math.round(metrics.maxWaypointTurnAngleDeg)}` +
              ` firstTurn=${Math.round(metrics.meanFirstWaypointTurnAngleDeg)}/${Math.round(metrics.maxFirstWaypointTurnAngleDeg)}` +
              ` tracerLen=${Math.round(metrics.meanTracerLengthPx)}/${Math.round(metrics.meanVisibleTracerLengthPx)} tracerFan=${Math.round(metrics.meanTracerFanSpanPx)}` +
              ` tracerAlign=${Math.round(metrics.meanTracerAlignmentDeg)}/${Math.round(metrics.maxTracerAlignmentDeg)}` +
              ` tracerRange=${Math.round(metrics.meanTracerRangePx)}/${Math.round(metrics.maxTracerRangePx)}` +
              (metrics.flakBurstCount > 0
                ? ` flak=${metrics.flakBurstCount}x${metrics.flakFlashCount}/${metrics.flakPuffCount} belt=${Math.round(metrics.meanFlakWidthPx)}x${Math.round(metrics.meanFlakHeightPx)}`
                : "")
            : "")
        );
        metrics?.groupMetrics.forEach((group) => {
          lines.push(
            `    group ${group.label}: n=${group.assignmentCount} start=${formatPoint(group.centroidStart)} ` +
            `mid=${formatPoint(group.centroidMid)} end=${formatPoint(group.centroidEnd)} ` +
            `path=${Math.round(group.meanPathLengthPx)} disp=${Math.round(group.meanDisplacementPx)} eff=${Math.round(group.meanEfficiency * 100)}% speed=${Math.round(group.meanSpeedPxPerSec)}`
          );
        });
        metrics?.relationMetrics.forEach((relation) => {
          lines.push(
            `    relation ${relation.fromLabel} -> ${relation.toLabel}: ` +
            `sep(start=${Math.round(relation.separationStartPx)}, mid=${Math.round(relation.separationMidPx)}, end=${Math.round(relation.separationEndPx)}) ` +
            `closestMid=${Math.round(relation.minMidPairSeparationPx)} angle=${Math.round(relation.approachAngleDeg)}`
          );
        });
        phase.assignments.forEach((assignment) => {
          const compactPoints = sampleInspectionPath(assignment.points, 7)
            .map((sample) => sample.point)
            .map((point) => `(${Math.round(point.cx)},${Math.round(point.cy)})`)
            .join(" -> ");
          lines.push(`    actor ${describeActor(report, assignment)}`);
          lines.push(`      authoredPath=${compactPoints}`);
          lines.push(`      samples=${describeSampleTrack(assignment.sampledPositions)}`);
        });
        metrics?.tracerMetrics.forEach((tracer) => {
          const fanLabel =
            tracer.leftFanEndPoint && tracer.rightFanEndPoint
              ? ` fan=${formatPoint(tracer.leftFanEndPoint)} | ${formatPoint(tracer.centerlineEndPoint)} | ${formatPoint(tracer.rightFanEndPoint)}`
              : ` centerline=${formatPoint(tracer.centerlineEndPoint)}`;
          lines.push(
            `    tracer ${Math.round(tracer.progress * 100)}% ${tracer.sourceActorId} ${tracer.emitter} ` +
            `heading=${Math.round(tracer.sourceHeadingDegrees)} len=${Math.round(tracer.streakLengthPx)}/${Math.round(tracer.visibleLengthPx)} fanHalf=${Math.round(tracer.fanHalfAngleDeg)} ` +
            `width=${tracer.width?.toFixed(2) ?? "?"} life=${Math.round(tracer.lifetimeMs ?? 0)} ` +
            `emit=${formatPoint(tracer.emitterPoint)}${fanLabel}` +
            (tracer.targetPoint ? ` targetRef=${formatPoint(tracer.targetPoint)}` : "") +
            (typeof tracer.targetAlignmentDeg === "number" ? ` align=${Math.round(tracer.targetAlignmentDeg)}` : "") +
            (typeof tracer.targetRangePx === "number" ? ` range=${Math.round(tracer.targetRangePx)}` : "")
          );
        });
        phase.flakBursts.forEach((flak, index) => {
          const metric = metrics?.flakMetrics[index];
          lines.push(
            `    flak ${Math.round(flak.progress * 100)}% bomber=${flak.bomberUnitKey ?? "<none>"} targetHex=${flak.targetHexKey ?? "<none>"} ` +
            `target=${formatPoint(flak.targetCenter)} source=${flak.targetSource} center=${formatPoint(flak.burstCenter)} ` +
            `flash/puffs=${flak.flashCount}/${flak.puffCount}/${flak.smokePuffCount} ` +
            `belt=${Math.round(flak.widthPx)}x${Math.round(flak.heightPx)}` +
            (metric ? ` metricBelt=${Math.round(metric.widthPx)}x${Math.round(metric.heightPx)}` : "")
          );
          lines.push(
            `      points=${flak.points.map((point) => formatPoint(point)).join(" | ")}`
          );
        });
      });
    });
    lines.push("");
  }
  if (result.airshowInspections.length > 0) {
    lines.push("Legacy per-event airshow geometry:");
    const coordinatedMissionIds = new Set(
      result.playbackProjection.coordinatedPlans.flatMap((plan) => plan.coveredMissionIds)
    );
    result.airshowInspections.forEach((inspectionEntry) => {
      const coveredByCoordinatedPlayback = inspectionEntry.missionId
        ? coordinatedMissionIds.has(inspectionEntry.missionId)
        : false;
      lines.push(
        `- ${inspectionEntry.eventType}${inspectionEntry.missionId ? ` (${inspectionEntry.missionId})` : ""} ` +
        `center=(${Math.round(inspectionEntry.report.center.cx)},${Math.round(inspectionEntry.report.center.cy)}) phases=${inspectionEntry.report.phases.length}` +
        ` authoritative=${coveredByCoordinatedPlayback ? "no" : "yes"}`
      );
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
              ` speed=${Math.round(metrics.meanSpeedPxPerSec)}` +
              ` turn=${Math.round(metrics.meanEntryTurnAngleDeg)}/${Math.round(metrics.maxEntryTurnAngleDeg)}` +
              ` pathTurn=${Math.round(metrics.meanWaypointTurnAngleDeg)}/${Math.round(metrics.maxWaypointTurnAngleDeg)}` +
              ` firstTurn=${Math.round(metrics.meanFirstWaypointTurnAngleDeg)}/${Math.round(metrics.maxFirstWaypointTurnAngleDeg)}` +
              ` tracerLen=${Math.round(metrics.meanTracerLengthPx)}/${Math.round(metrics.meanVisibleTracerLengthPx)} tracerFan=${Math.round(metrics.meanTracerFanSpanPx)}` +
              ` tracerAlign=${Math.round(metrics.meanTracerAlignmentDeg)}/${Math.round(metrics.maxTracerAlignmentDeg)}` +
              ` tracerRange=${Math.round(metrics.meanTracerRangePx)}/${Math.round(metrics.maxTracerRangePx)}` +
              (metrics.flakBurstCount > 0
                ? ` flak=${metrics.flakBurstCount}x${metrics.flakFlashCount}/${metrics.flakPuffCount} belt=${Math.round(metrics.meanFlakWidthPx)}x${Math.round(metrics.meanFlakHeightPx)}`
                : "")
            : "")
        );
        metrics?.groupMetrics.forEach((group) => {
          lines.push(
            `    group ${group.label}: n=${group.assignmentCount} start=${formatPoint(group.centroidStart)} ` +
            `mid=${formatPoint(group.centroidMid)} end=${formatPoint(group.centroidEnd)} ` +
            `path=${Math.round(group.meanPathLengthPx)} disp=${Math.round(group.meanDisplacementPx)} eff=${Math.round(group.meanEfficiency * 100)}% speed=${Math.round(group.meanSpeedPxPerSec)}`
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
          const compactPoints = sampleInspectionPath(assignment.points, 7)
            .map((sample) => sample.point)
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
            `heading=${Math.round(tracer.sourceHeadingDegrees)} len=${Math.round(tracer.streakLengthPx)}/${Math.round(tracer.visibleLengthPx)} fanHalf=${Math.round(tracer.fanHalfAngleDeg)} ` +
            `width=${tracer.width?.toFixed(2) ?? "?"} life=${Math.round(tracer.lifetimeMs ?? 0)} ` +
            `emit=${formatPoint(tracer.emitterPoint)}${fanLabel}` +
            (tracer.targetPoint ? ` targetRef=${formatPoint(tracer.targetPoint)}` : "") +
            (typeof tracer.targetAlignmentDeg === "number" ? ` align=${Math.round(tracer.targetAlignmentDeg)}` : "") +
            (typeof tracer.targetRangePx === "number" ? ` range=${Math.round(tracer.targetRangePx)}` : "")
          );
        });
        metrics?.flakMetrics.slice(0, 3).forEach((flak) => {
          lines.push(
            `    flak ${Math.round(flak.progress * 100)}% center=${formatPoint(flak.burstCenter)} ` +
            `flash/puffs=${flak.flashCount}/${flak.puffCount}/${flak.smokePuffCount} ` +
            `belt=${Math.round(flak.widthPx)}x${Math.round(flak.heightPx)}`
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
  lines.push("Legacy diagnostics:");
  if (result.legacyDiagnosticFindings.length > 0) {
    result.legacyDiagnosticFindings.forEach((finding) => {
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

export interface AirScenarioDiagnosticTextFile {
  readonly relativePath: string;
  readonly content: string;
}

type AirScenarioDiagnosticAnimation = {
  readonly id: string;
  readonly title: string;
  readonly category: "coordinated" | "inspection";
  readonly report: AirShowInspectionReport;
  readonly phaseMetrics: readonly AirShowPhaseMetric[];
  readonly findings: readonly AirScenarioFinding[];
  readonly metadata: readonly string[];
};

function sanitizeDiagnosticFileSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    || "unnamed";
}

function formatSceneTimeMs(value: number): string {
  return `${Math.round(value).toString().padStart(5, "0")}ms`;
}

function describeSampleSpeedPxPer100Ms(
  current: { readonly timeMs: number; readonly cx: number; readonly cy: number },
  previous: { readonly timeMs: number; readonly cx: number; readonly cy: number } | null
): string {
  if (!previous) {
    return "start";
  }
  const dt = current.timeMs - previous.timeMs;
  if (dt <= 0) {
    return "n/a";
  }
  const distancePx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
  return `${((distancePx / dt) * 100).toFixed(1)}px/100ms`;
}

function collectAirScenarioDiagnosticAnimations(result: AirScenarioResult): AirScenarioDiagnosticAnimation[] {
  const animations: AirScenarioDiagnosticAnimation[] = [];

  result.playbackProjection.coordinatedPlans.forEach((plan, index) => {
    if (!plan.sceneReport) {
      return;
    }
    animations.push({
      id: `animation-${String(animations.length + 1).padStart(3, "0")}`,
      title: `coordinated-cluster-${index + 1}-${sanitizeDiagnosticFileSegment(plan.focusKey ?? "none")}`,
      category: "coordinated",
      report: plan.sceneReport,
      phaseMetrics: plan.scenePhaseMetrics,
      findings: plan.sceneFindings,
      metadata: [
        `focus=${plan.focusKey ?? "<none>"}`,
        `coveredMissionIds=${plan.coveredMissionIds.join("|") || "<none>"}`,
        `strikeSorties=${plan.strikeSortieMissionIds.join("|") || "<none>"}`,
        `fighterScene=${plan.hasFighterScene}`,
        `fighterSceneDurationMs=${plan.fighterSceneDurationMs}`,
        `bomberStartDelayMs=${plan.bomberStartDelayMs}`,
        `fighterIngressLeadMs=${plan.fighterIngressLeadMs}`,
        `tracers=${plan.fighterSceneTracerCount}`,
        `flakBursts=${plan.fighterSceneFlakBurstCount}`
      ]
    });
  });

  result.airshowInspections.forEach((inspection, index) => {
    animations.push({
      id: `animation-${String(animations.length + 1).padStart(3, "0")}`,
      title: `${inspection.eventType}-${sanitizeDiagnosticFileSegment(inspection.missionId ?? `inspection-${index + 1}`)}`,
      category: "inspection",
      report: inspection.report,
      phaseMetrics: inspection.phaseMetrics,
      findings: inspection.findings,
      metadata: [
        `eventType=${inspection.eventType}`,
        `missionId=${inspection.missionId ?? "<none>"}`,
        `bomberIncluded=${inspection.diagnostics.bomberIncluded}`,
        `linkedEscortUnitKeys=${inspection.diagnostics.linkedEscortUnitKeys.join("|") || "<none>"}`,
        `eventEscortUnitKeys=${inspection.diagnostics.eventEscortUnitKeys.join("|") || "<none>"}`,
        `unresolvedOrigins=${inspection.diagnostics.unresolvedOriginUnitKeys.join("|") || "<none>"}`
      ]
    });
  });

  return animations;
}

function buildAirScenarioAnimationIndexText(animation: AirScenarioDiagnosticAnimation): string {
  const phaseStartTimes = animation.report.phases.reduce<number[]>((starts, phase, index) => {
    if (index === 0) {
      starts.push(0);
      return starts;
    }
    starts.push((starts[index - 1] ?? 0) + animation.report.phases[index - 1]!.durationMs);
    return starts;
  }, []);
  const lines: string[] = [];
  lines.push(`Animation: ${animation.id}`);
  lines.push(`Title: ${animation.title}`);
  lines.push(`Category: ${animation.category}`);
  lines.push(`Hex: ${animation.report.hexKey}`);
  lines.push(`Center: (${Math.round(animation.report.center.cx)},${Math.round(animation.report.center.cy)})`);
  lines.push(`BomberTarget: ${animation.report.bomberTarget ? `(${Math.round(animation.report.bomberTarget.cx)},${Math.round(animation.report.bomberTarget.cy)})` : "<none>"}`);
  lines.push(`Flights: ${animation.report.flights.length}`);
  lines.push(`Phases: ${animation.report.phases.length}`);
  lines.push(`Metadata:`);
  animation.metadata.forEach((entry) => lines.push(`- ${entry}`));
  lines.push(`Findings:`);
  if (animation.findings.length > 0) {
    animation.findings.forEach((finding) => lines.push(`- [${finding.code}] ${finding.message}`));
  } else {
    lines.push(`- none`);
  }
  lines.push(`Phase Timeline:`);
  animation.report.phases.forEach((phase, index) => {
    const startMs = phaseStartTimes[index] ?? 0;
    const endMs = startMs + phase.durationMs;
    const metric = animation.phaseMetrics[index];
    lines.push(
      `- ${phase.label} sceneT=${formatSceneTimeMs(startMs)}..${formatSceneTimeMs(endMs)} duration=${phase.durationMs}ms ` +
      `assignments=${phase.assignments.length} tracers=${phase.tracers.length} flak=${phase.flakBursts.length}` +
      (metric
        ? ` speed=${Math.round(metric.meanSpeedPxPerSec)}px/s path=${Math.round(metric.meanPathLengthPx)} disp=${Math.round(metric.meanDisplacementPx)}`
        : "")
    );
    phase.tracers.forEach((tracer, tracerIndex) => {
      const sceneTimeMs = startMs + phase.durationMs * tracer.progress;
      lines.push(
        `  tracer#${tracerIndex + 1} sceneT=${formatSceneTimeMs(sceneTimeMs)} src=${tracer.sourceActorId} ` +
        `target=${tracer.targetActorId ?? "<point>"} emit=${tracer.emitter} ` +
        `emitPos=(${Math.round(tracer.emitterPoint.cx)},${Math.round(tracer.emitterPoint.cy)}) ` +
        `heading=${Math.round(tracer.sourceHeadingDegrees)}deg len=${Math.round(tracer.streakLengthPx)} vis=${Math.round(tracer.visibleLengthPx)}`
      );
    });
    phase.flakBursts.forEach((flak, flakIndex) => {
      const sceneTimeMs = startMs + phase.durationMs * flak.progress;
      lines.push(
        `  flak#${flakIndex + 1} sceneT=${formatSceneTimeMs(sceneTimeMs)} bomber=${flak.bomberUnitKey ?? "<none>"} ` +
        `targetHex=${flak.targetHexKey ?? "<none>"} target=(${Math.round(flak.targetCenter.cx)},${Math.round(flak.targetCenter.cy)}) ` +
        `source=${flak.targetSource} center=(${Math.round(flak.burstCenter.cx)},${Math.round(flak.burstCenter.cy)}) ` +
        `flash/puffs=${flak.flashCount}/${flak.puffCount}/${flak.smokePuffCount}`
      );
    });
  });
  lines.push(`Sprite Files:`);
  animation.report.flights.forEach((flight) => {
    flight.actors.forEach((actor) => {
      lines.push(
        `- sprites/${animation.id}__${sanitizeDiagnosticFileSegment(actor.actorId)}.txt :: ${actor.actorId} ${flight.faction ?? "Unknown"} ${flight.scenarioType} ${flight.role}/${flight.combatRole ?? "unknown"}`
      );
    });
  });
  return lines.join("\n");
}

function buildAirScenarioSpriteTimelineText(
  animation: AirScenarioDiagnosticAnimation,
  flight: AirShowInspectionFlight,
  actor: AirShowInspectionFlightActor
): string {
  const phaseStartTimes = animation.report.phases.reduce<number[]>((starts, phase, index) => {
    if (index === 0) {
      starts.push(0);
      return starts;
    }
    starts.push((starts[index - 1] ?? 0) + animation.report.phases[index - 1]!.durationMs);
    return starts;
  }, []);
  const lines: string[] = [];
  lines.push(`Animation: ${animation.id}`);
  lines.push(`Title: ${animation.title}`);
  lines.push(`Sprite: ${actor.actorId}`);
  lines.push(`Flight: ${flight.id}`);
  lines.push(`Faction: ${flight.faction ?? "Unknown"}`);
  lines.push(`Type: ${flight.scenarioType}`);
  lines.push(`Role: ${flight.role}/${flight.combatRole ?? "unknown"}`);
  lines.push(`OriginHex: ${flight.originHexKey ?? "<none>"}`);
  lines.push(`InitialAnchor: (${Math.round(actor.position.cx)},${Math.round(actor.position.cy)}) heading=${Math.round(actor.headingDegrees)}deg active=${actor.active}`);
  lines.push(`Strength: ${flight.strengthBefore}->${flight.strengthAfterEscortPhase ?? flight.strengthBefore}->${flight.finalStrength ?? flight.strengthBefore}`);
  lines.push(`Timeline:`);

  animation.report.phases.forEach((phase, phaseIndex) => {
    const assignment = phase.assignments.find((entry) => entry.actorId === actor.actorId);
    if (!assignment) {
      return;
    }
    const phaseStartMs = phaseStartTimes[phaseIndex] ?? 0;
    lines.push(`- phase=${phase.label} sceneT=${formatSceneTimeMs(phaseStartMs)}..${formatSceneTimeMs(phaseStartMs + phase.durationMs)} duration=${phase.durationMs}ms`);
    assignment.sampledPositions.forEach((sample, sampleIndex) => {
      const previous = sampleIndex > 0 ? assignment.sampledPositions[sampleIndex - 1] ?? null : null;
      const sceneTimeMs = phaseStartMs + sample.timeMs;
      lines.push(
        `  sceneT=${formatSceneTimeMs(sceneTimeMs)} phaseT=${formatSceneTimeMs(sample.timeMs)} progress=${sample.progress.toFixed(2)} ` +
        `pos=(${Math.round(sample.cx)},${Math.round(sample.cy)}) heading=${Math.round(sample.headingDegrees)}deg ` +
        `speed=${describeSampleSpeedPxPer100Ms(sample, previous)}`
      );
    });
  });

  return lines.join("\n");
}

export function buildAirScenarioDiagnosticTextFiles(result: AirScenarioResult): readonly AirScenarioDiagnosticTextFile[] {
  const animations = collectAirScenarioDiagnosticAnimations(result);
  const files: AirScenarioDiagnosticTextFile[] = [];
  const indexLines: string[] = [];
  indexLines.push(`Scenario: ${result.scenarioName}`);
  indexLines.push(`Animations: ${animations.length}`);
  indexLines.push(`Findings: ${result.findings.length}`);
  indexLines.push(`Anomalies: ${result.anomalies.length}`);
  indexLines.push(`Bundle Layout:`);
  indexLines.push(`- summary.txt`);
  indexLines.push(`- animations/<animation>.txt`);
  indexLines.push(`- sprites/<animation>__<sprite>.txt`);
  indexLines.push(``);
  indexLines.push(`Animations:`);

  animations.forEach((animation) => {
    const animationFile = `animations/${animation.id}__${sanitizeDiagnosticFileSegment(animation.title)}.txt`;
    indexLines.push(
      `- ${animationFile} :: phases=${animation.report.phases.length} sprites=${animation.report.flights.reduce((sum, flight) => sum + flight.actors.length, 0)} findings=${animation.findings.length}`
    );
    files.push({
      relativePath: animationFile,
      content: buildAirScenarioAnimationIndexText(animation)
    });

    animation.report.flights.forEach((flight) => {
      flight.actors.forEach((actor) => {
        files.push({
          relativePath: `sprites/${animation.id}__${sanitizeDiagnosticFileSegment(actor.actorId)}.txt`,
          content: buildAirScenarioSpriteTimelineText(animation, flight, actor)
        });
      });
    });
  });

  files.unshift({
    relativePath: "index.txt",
    content: indexLines.join("\n")
  });

  return files;
}

export function formatAirScenarioSummary(result: AirScenarioResult): string {
  const animations = collectAirScenarioDiagnosticAnimations(result);
  const lines: string[] = [];
  lines.push(`Scenario: ${result.scenarioName}`);
  lines.push(`Mission arrivals: ${result.arrivals.length}`);
  lines.push(`Mission reports: ${result.missionReports.length}`);
  lines.push(`Engagement events: ${result.engagements.length}`);
  lines.push(`Diagnostic animations: ${animations.length}`);
  lines.push(`Per-animation files: diagnostics/air-scenario/<timestamp>/animations/`);
  lines.push(`Per-sprite files: diagnostics/air-scenario/<timestamp>/sprites/`);
  lines.push(``);
  lines.push(`Findings:`);
  if (result.findings.length > 0) {
    result.findings.forEach((finding) => lines.push(`- [${finding.code}] ${finding.message}`));
  } else {
    lines.push(`- none`);
  }
  if (result.anomalies.length > 0) {
    lines.push(``);
    lines.push(`Anomalies:`);
    result.anomalies.forEach((anomaly) => lines.push(`- [${anomaly.code}] ${anomaly.message}`));
  }
  return lines.join("\n");
}
