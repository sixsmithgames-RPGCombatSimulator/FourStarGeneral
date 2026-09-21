export type BattleAircraftAttackUnavailableReason =
  | "insufficient-flight-time"
  | "ammunition-state-unavailable"
  | "needs-rearm"
  | "air-ammunition-depleted"
  | "ground-ammunition-depleted";

export interface BattleAircraftAttackManeuverInput {
  readonly attackerIsAircraft: boolean;
  readonly defenderIsAircraft: boolean;
  readonly movementAllowance: number;
  readonly movementPointsUsed: number;
}

export interface BattleAircraftAttackAmmunitionInput {
  readonly defenderIsAircraft: boolean;
  /** Null is an invalid/unavailable live snapshot and fails closed. */
  readonly ammunition: {
    readonly air: number;
    readonly ground: number;
    readonly needsRearm: boolean;
  } | null;
}

export interface BattleAircraftAttackAvailabilityProjection {
  readonly unavailableReason: BattleAircraftAttackUnavailableReason | null;
  readonly unavailableMessage: string | null;
}

export interface BattleAircraftAttackManeuverProjection extends BattleAircraftAttackAvailabilityProjection {
  readonly maneuverCost: number;
}

const AMMUNITION_UNAVAILABLE_MESSAGES: Readonly<Record<Exclude<BattleAircraftAttackUnavailableReason, "insufficient-flight-time">, string>> = {
  "ammunition-state-unavailable": "This squadron's ammunition state is unavailable and the attack cannot proceed.",
  "needs-rearm": "This squadron must return to base to rearm before flying another sortie.",
  "air-ammunition-depleted": "The fighter wing has exhausted its interception ammo and needs to rearm at base.",
  "ground-ammunition-depleted": "The squadron has expended its bomb load and must rearm at the base camp before attacking ground targets again."
};

function unavailable(
  unavailableReason: BattleAircraftAttackUnavailableReason,
  defenderIsAircraft: boolean
): BattleAircraftAttackAvailabilityProjection {
  const unavailableMessage = unavailableReason === "insufficient-flight-time"
    ? defenderIsAircraft
      ? "This squadron expended its flight time and cannot execute another aerial dogfight this turn."
      : "This squadron lacks the flight time to line up another ground strike this turn."
    : AMMUNITION_UNAVAILABLE_MESSAGES[unavailableReason];
  return { unavailableReason, unavailableMessage };
}

/**
 * Projects the movement stage of the aircraft resource gate. Keeping this
 * stage independent lets GameEngine reject insufficient flight time before it
 * initializes a legacy aircraft-ammunition entry.
 */
export function projectBattleAircraftAttackManeuverReadiness(
  input: BattleAircraftAttackManeuverInput
): BattleAircraftAttackManeuverProjection {
  if (!input.attackerIsAircraft) {
    return { maneuverCost: 0, unavailableReason: null, unavailableMessage: null };
  }

  const maneuverCost = input.defenderIsAircraft ? 2 : 1;
  const remainingMovement = input.movementAllowance - input.movementPointsUsed;
  if (remainingMovement + 1e-6 < maneuverCost) {
    return {
      maneuverCost,
      ...unavailable("insufficient-flight-time", input.defenderIsAircraft)
    };
  }
  return { maneuverCost, unavailableReason: null, unavailableMessage: null };
}

/**
 * Projects the ammunition stage after GameEngine has intentionally fetched or
 * initialized the live registry entry. Null fails closed rather than silently
 * treating missing authority as an empty ammunition pool.
 */
export function projectBattleAircraftAttackAmmunitionReadiness(
  input: BattleAircraftAttackAmmunitionInput
): BattleAircraftAttackAvailabilityProjection {
  if (!input.ammunition) {
    return unavailable("ammunition-state-unavailable", input.defenderIsAircraft);
  }
  if (input.ammunition.needsRearm) {
    return unavailable("needs-rearm", input.defenderIsAircraft);
  }
  if (input.defenderIsAircraft && input.ammunition.air <= 0) {
    return unavailable("air-ammunition-depleted", input.defenderIsAircraft);
  }
  if (!input.defenderIsAircraft && input.ammunition.ground <= 0) {
    return unavailable("ground-ammunition-depleted", input.defenderIsAircraft);
  }
  return { unavailableReason: null, unavailableMessage: null };
}
