import type { ScenarioUnit } from "../../../core/types";
import type { MissionStatus } from "../../../state/missionRules";
import type {
  AirMissionReportEntry,
  SupplySnapshot
} from "../../GameEngine";
import type {
  AirOperationsSummary,
  AmmunitionExpenditure,
  MissionRecord,
  ObjectiveCompletion,
  UnitTypeCount
} from "../../../utils/rosterStorage";

/** Immutable engine-owned facts required to assemble one mission report. */
export interface BattleMissionReportingSnapshot {
  readonly currentPlayerUnits: readonly ScenarioUnit[];
  readonly currentBotUnits: readonly ScenarioUnit[];
  readonly playerSupplyHistory: readonly SupplySnapshot[];
  readonly airMissionReports: readonly AirMissionReportEntry[];
  readonly livePlayerUnitIds: readonly string[];
}

/** Presentation-independent result used by the mission-end and headquarters handoff flow. */
export interface MissionEndResolution {
  readonly success: boolean;
  readonly objectivesCompleted: number;
  readonly objectivesFailed: number;
  readonly objectivesContested: number;
  readonly casualties: number;
  readonly reason: string;
  readonly headquartersTitle: string;
  readonly headquartersAction: string;
  readonly aborted?: boolean;
}

export interface BattleMissionRecordInput extends BattleMissionReportingSnapshot {
  readonly missionKey: string;
  readonly missionTitle: string;
  readonly completedAt: string;
  readonly missionStatus: MissionStatus;
  readonly initialPlayerUnits: readonly ScenarioUnit[];
  readonly initialBotUnits: readonly ScenarioUnit[];
}

const EMPTY_AMMUNITION: Readonly<AmmunitionExpenditure> = {
  bombsDropped: 0,
  artilleryShellsFired: 0,
  rocketsFired: 0,
  smallArmsRounds: 0
};

const EMPTY_OBJECTIVES: Readonly<ObjectiveCompletion> = {
  primaryCompleted: 0,
  primaryTotal: 0,
  secondaryCompleted: 0,
  secondaryTotal: 0,
  tertiaryCompleted: 0,
  tertiaryTotal: 0
};

/** Counts formations by tactical type without retaining mutable engine objects. */
export function aggregateUnitCounts(units: readonly ScenarioUnit[]): UnitTypeCount[] {
  const counts = new Map<string, number>();
  units.forEach((unit) => counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1));
  return Array.from(counts, ([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

/** Returns only losses, never negative differences created by reinforcements. */
export function calculateUnitLosses(
  initialUnits: readonly ScenarioUnit[],
  currentUnits: readonly ScenarioUnit[]
): UnitTypeCount[] {
  const initialCounts = new Map(aggregateUnitCounts(initialUnits).map(({ type, count }) => [type, count]));
  const currentCounts = new Map(aggregateUnitCounts(currentUnits).map(({ type, count }) => [type, count]));
  return Array.from(initialCounts, ([type, initialCount]) => ({
    type,
    count: Math.max(0, initialCount - (currentCounts.get(type) ?? 0))
  }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Preserves the existing supply-history estimate while making its inputs explicit and testable. */
export function calculateAmmunitionExpenditure(
  supplyHistory: readonly SupplySnapshot[],
  deployedUnits: readonly ScenarioUnit[]
): AmmunitionExpenditure {
  const initialSnapshot = supplyHistory[0];
  const finalSnapshot = supplyHistory[supplyHistory.length - 1];
  if (!initialSnapshot || !finalSnapshot) {
    return { ...EMPTY_AMMUNITION };
  }

  const initialAmmo = initialSnapshot.categories.find((category) => category.resource === "ammo")?.total ?? 0;
  const finalAmmo = finalSnapshot.categories.find((category) => category.resource === "ammo")?.total ?? 0;
  const totalAmmoUsed = Math.max(0, initialAmmo - finalAmmo);
  const normalizedTypes = deployedUnits.map((unit) => unit.type.toLowerCase());
  const hasBombers = normalizedTypes.some((type) => type.includes("bomber"));
  const hasArtillery = normalizedTypes.some((type) => type.includes("artillery") || type.includes("howitzer"));
  const hasRockets = normalizedTypes.some((type) => type.includes("rocket"));

  return {
    bombsDropped: hasBombers ? Math.floor(totalAmmoUsed * 0.15) : 0,
    artilleryShellsFired: hasArtillery ? Math.floor(totalAmmoUsed * 0.30) : 0,
    rocketsFired: hasRockets ? Math.floor(totalAmmoUsed * 0.20) : 0,
    smallArmsRounds: Math.floor(totalAmmoUsed * 0.35)
  };
}

/** Summarizes authored objective tiers without depending on BattleScreen state. */
export function summarizeMissionObjectives(missionStatus: MissionStatus | null): ObjectiveCompletion {
  if (!missionStatus?.objectives) {
    return { ...EMPTY_OBJECTIVES };
  }
  const summarizeTier = (tier: "primary" | "secondary" | "tertiary"): readonly [number, number] => {
    const objectives = missionStatus.objectives.filter((objective) => objective.tier === tier);
    return [objectives.filter((objective) => objective.state === "completed").length, objectives.length];
  };
  const [primaryCompleted, primaryTotal] = summarizeTier("primary");
  const [secondaryCompleted, secondaryTotal] = summarizeTier("secondary");
  const [tertiaryCompleted, tertiaryTotal] = summarizeTier("tertiary");
  return {
    primaryCompleted,
    primaryTotal,
    secondaryCompleted,
    secondaryTotal,
    tertiaryCompleted,
    tertiaryTotal
  };
}

/** Projects sortie history using only immutable reporting facts from BattleState. */
export function summarizeAirOperations(
  reports: readonly AirMissionReportEntry[],
  livePlayerUnitIds: readonly string[]
): AirOperationsSummary | undefined {
  const resolvedPlayerReports = reports.filter(
    (entry) => entry.faction === "Player" && entry.event !== "refitStarted" && entry.event !== "refitCompleted"
  );
  if (resolvedPlayerReports.length === 0) {
    return undefined;
  }

  const liveUnits = new Set(livePlayerUnitIds);
  const participatingPlayerFlights = new Set<string>();
  let airCombatDamageInflicted = 0;
  let airCombatDamageTaken = 0;
  let hostileFlightsDestroyed = 0;

  resolvedPlayerReports.forEach((report) => {
    participatingPlayerFlights.add(report.unitKey);
    hostileFlightsDestroyed += Math.max(0, report.kills?.escorts ?? 0) + Math.max(0, report.kills?.cap ?? 0);
    if (report.kind === "strike") {
      airCombatDamageTaken += Math.max(0, report.bomberAttrition ?? 0);
      airCombatDamageInflicted += Math.max(0, report.interceptorAttrition ?? 0) + Math.max(0, report.escortAttrition ?? 0);
    } else if (report.kind === "escort") {
      airCombatDamageTaken += Math.max(0, report.escortAttrition ?? 0);
      airCombatDamageInflicted += Math.max(0, report.interceptorAttrition ?? 0);
    } else if (report.kind === "airCover") {
      airCombatDamageTaken += Math.max(0, report.interceptorAttrition ?? 0);
      airCombatDamageInflicted += Math.max(0, report.bomberAttrition ?? 0) + Math.max(0, report.escortAttrition ?? 0);
    }
  });

  return {
    sortiesFlown: resolvedPlayerReports.length,
    strikeSorties: resolvedPlayerReports.filter((entry) => entry.kind === "strike").length,
    escortSorties: resolvedPlayerReports.filter((entry) => entry.kind === "escort").length,
    patrolSorties: resolvedPlayerReports.filter((entry) => entry.kind === "airCover").length,
    transportSorties: resolvedPlayerReports.filter((entry) => entry.kind === "airTransport").length,
    airCombatDamageInflicted,
    airCombatDamageTaken,
    hostileFlightsDestroyed,
    playerFlightsLost: Array.from(participatingPlayerFlights).filter((unitKey) => !liveUnits.has(unitKey)).length
  };
}

/** Builds the immutable record persisted in the selected general's service history. */
export function buildBattleMissionRecord(input: BattleMissionRecordInput): MissionRecord {
  return {
    missionKey: input.missionKey,
    missionTitle: input.missionTitle,
    completedAt: input.completedAt,
    success: input.missionStatus.outcome.state === "playerVictory",
    turnsElapsed: input.missionStatus.turn,
    casualties: calculateUnitLosses(input.initialPlayerUnits, input.currentPlayerUnits),
    enemiesDestroyed: calculateUnitLosses(input.initialBotUnits, input.currentBotUnits),
    unitsDeployed: aggregateUnitCounts(input.initialPlayerUnits),
    ammunition: calculateAmmunitionExpenditure(input.playerSupplyHistory, input.initialPlayerUnits),
    objectives: summarizeMissionObjectives(input.missionStatus),
    airOperations: summarizeAirOperations(input.airMissionReports, input.livePlayerUnitIds)
  };
}

/** Resolves mission-end copy and counts without reading DOM or mutable engine state. */
export function resolveMissionEndResolution(
  missionStatus: MissionStatus | null,
  casualties: number
): MissionEndResolution {
  if (missionStatus && missionStatus.objectives.length > 0 && missionStatus.outcome.state !== "inProgress") {
    const objectivesCompleted = missionStatus.objectives.filter((objective) => objective.state === "completed").length;
    const objectivesFailed = missionStatus.objectives.filter((objective) => objective.state === "failed").length;
    const objectivesContested = missionStatus.objectives.filter(
      (objective) => objective.state === "inProgress" || objective.state === "pending"
    ).length;
    const success = missionStatus.outcome.state === "playerVictory";
    const objectiveBoard = `Objective board: ${objectivesCompleted} completed, ${objectivesFailed} failed, ${objectivesContested} contested.`;
    return {
      success,
      objectivesCompleted,
      objectivesFailed,
      objectivesContested,
      casualties,
      reason: missionStatus.outcome.reason ? `${missionStatus.outcome.reason} ${objectiveBoard}` : objectiveBoard,
      headquartersTitle: success ? "Mission completed successfully." : "Mission failed.",
      headquartersAction: success
        ? "Review the updated front and headquarters ledgers, then queue the next engagement when ready."
        : "Review the updated front, losses, and objective board before committing the next patrol."
    };
  }

  return {
    success: false,
    objectivesCompleted: 0,
    objectivesFailed: 0,
    objectivesContested: 0,
    casualties,
    reason: "Mission report used manual commander input while mission-specific objective hooks are still maturing.",
    headquartersTitle: "Mission ended.",
    headquartersAction: "Review the campaign state immediately. If the front or resources did not update, reload before continuing."
  };
}
