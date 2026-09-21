/**
 * Pure projection from persistent campaign formations to player-safe command-shell rows.
 * CampaignScreen supplies location, history, and time presentation without surrendering state ownership.
 */
import type { CampaignFormationRecord } from "../../game/campaign/formations/campaignFormationTypes";
import {
  resolveCampaignFormationRecordPresentation
} from "../../game/campaign/formations/CampaignFormationPresentation";
import {
  projectCampaignFormationPosture,
  type CampaignFormationOperationalPosture
} from "../../game/campaign/formations/CampaignFormationPosture";
import { projectRuntimeHexKeyToCampaignOffset } from "./CampaignCommandProjection";
import type {
  CampaignCommandFormationView,
  CampaignCommandObjectiveView
} from "./CampaignCommandShell";
import type { CampaignLocationPresentation } from "./CampaignLocationPresentation";

interface CampaignFormationFrontSource {
  readonly key: string;
  readonly hexKeys: readonly string[];
  readonly edges?: ReadonlyArray<{ readonly opposingHexKey: string }>;
}

export interface CampaignFormationRosterProjectionInput {
  readonly formations: readonly CampaignFormationRecord[];
  readonly fronts: readonly CampaignFormationFrontSource[];
  readonly objectives: ReadonlyArray<Pick<CampaignCommandObjectiveView, "key" | "hexKey" | "status">>;
  readonly formatSegment: (segment: number) => string;
  readonly resolveLocation: (hexKey: string) => CampaignLocationPresentation;
  readonly resolveHistory: (formation: CampaignFormationRecord) => string | null;
}

type FormationPostureKey = NonNullable<CampaignCommandFormationView["postureKey"]>;

function projectPostureKey(posture: CampaignFormationOperationalPosture): FormationPostureKey {
  if (posture === "scheduledArrival" || posture === "inTransit") return posture;
  if (posture === "isolated" || posture === "refitting" || posture === "shattered") return "recovering";
  if (posture === "awaitingPlacement" || posture === "retired") return "unavailable";
  return posture;
}

function projectPersonnel(formation: CampaignFormationRecord): string {
  const pools = Object.values(formation.personnel);
  const fit = pools.reduce((sum, pool) => sum + pool.fit, 0);
  const present = pools.reduce(
    (sum, pool) => sum + pool.fit + pool.injured + pool.wounded + pool.severelyWounded,
    0
  );
  const killed = pools.reduce((sum, pool) => sum + pool.killed, 0);
  return `${fit.toLocaleString()} fit / ${present.toLocaleString()} present${killed > 0 ? ` · ${killed.toLocaleString()} lost` : ""}`;
}

function projectEquipment(formation: CampaignFormationRecord): string {
  const pools = Object.values(formation.equipment);
  const operational = pools.reduce((sum, pool) => sum + pool.operational, 0);
  const total = pools.reduce(
    (sum, pool) => sum + pool.operational + pool.damaged + pool.disabled + pool.destroyed,
    0
  );
  return total > 0 ? `${operational.toLocaleString()} / ${total.toLocaleString()} operational` : "No vehicle pool";
}

/** Projects exact formation identity, posture, condition, and placement without mutating roster records. */
export function projectCampaignFormationRoster(
  input: CampaignFormationRosterProjectionInput
): CampaignCommandFormationView[] {
  return input.formations.flatMap((formation) => {
    const presentation = resolveCampaignFormationRecordPresentation(formation);
    if (presentation.operationalRepresentation === "capacity") return [];
    const posture = projectCampaignFormationPosture(formation);
    const locationHexKey = projectRuntimeHexKeyToCampaignOffset(formation.locationHexKey);
    const availabilityLabel = formation.status === "unavailable" && formation.availableFromSegment !== undefined
      ? input.formatSegment(formation.availableFromSegment)
      : null;
    return [{
      id: formation.id,
      name: presentation.formationName,
      commandLabel: presentation.commandLabel,
      hasAuthoredSubordinateIdentity: presentation.hasAuthoredSubordinateIdentity,
      typeLabel: presentation.typeLabel,
      ownershipLabel: formation.ownership.charAt(0).toUpperCase() + formation.ownership.slice(1),
      locationHexKey,
      ...(locationHexKey ? {
        location: input.resolveLocation(locationHexKey),
        operationalFrontKey: input.fronts.find((front) => front.hexKeys.includes(locationHexKey)
          || front.edges?.some((edge) => edge.opposingHexKey === locationHexKey))?.key,
        objectiveKey: input.objectives.find((objective) => (
          objective.hexKey === locationHexKey && objective.status === "In progress"
        ))?.key
      } : {}),
      statusLabel: posture.label,
      postureKey: projectPostureKey(posture.posture),
      canReceiveOrders: posture.canReceiveOrders,
      recoveryActionVisible: posture.presentAtLocation
        && (posture.posture === "shattered" || posture.posture === "refitting"),
      blockingReason: posture.blockingReason,
      availabilityLabel,
      readiness: `${Math.round(formation.readiness)}%`,
      cohesion: `${Math.round(formation.cohesion)}%`,
      fatigue: `${Math.round(formation.fatigue)}%`,
      personnel: projectPersonnel(formation),
      equipment: projectEquipment(formation),
      supply: `Ammo ${formation.supply.ammo} · Fuel ${formation.supply.fuel} · Rations ${formation.supply.rations} · Parts ${formation.supply.parts}`,
      experience: `${formation.experience.base + formation.experience.earned} XP`,
      honors: formation.honors.map((honor) => honor.name),
      battles: formation.experience.battles,
      currentOrderId: formation.currentOrderId,
      latestHistory: availabilityLabel
        ? `Scheduled to become available ${availabilityLabel}.`
        : input.resolveHistory(formation)
    }];
  });
}
