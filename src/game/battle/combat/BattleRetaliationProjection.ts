import type { ScenarioUnit } from "../../../core/types";

export type BattleRetaliationBlockReason =
  | "defenderBroken"
  | "aircraftAgainstGround"
  | "defenderTowed"
  | "defenderPinned"
  | "outOfRange"
  | "limitExhausted"
  | "aircraftRearming"
  | "aircraftAmmoDepleted"
  | "groundAmmoDepleted";

export type BattleRetaliationAmmunition =
  | {
      readonly kind: "aircraft";
      readonly needsRearm: boolean;
      readonly airShots: number;
    }
  | {
      readonly kind: "ground";
      readonly available: number | null;
      readonly cost: number;
    };

export interface BattleRetaliationProjectionInput {
  readonly defenderBefore: ScenarioUnit;
  readonly defenderAfter: ScenarioUnit;
  readonly resolvedFacing: ScenarioUnit["facing"];
  readonly defenderWasOnSentry: boolean;
  readonly defenderBecameBroken: boolean;
  readonly attackerStrength: number;
  readonly attackerIsAircraft: boolean;
  readonly defenderIsAircraft: boolean;
  readonly defenderIsBomber: boolean;
  readonly defenderTowBlocked: boolean;
  readonly defenderPinnedOrBroken: boolean;
  readonly distance: number;
  readonly rangeMin: number;
  readonly rangeMax: number;
  readonly retaliationAvailable: boolean;
  readonly ammunition: BattleRetaliationAmmunition;
  readonly notePerspective?: "enemy" | "target";
  readonly pinTowPriority?: "pinFirst" | "towFirst";
  readonly pinnedBlocksSentry?: boolean;
}

export interface BattleRetaliationProjection {
  readonly defender: ScenarioUnit;
  readonly allowed: boolean;
  readonly blockReason?: BattleRetaliationBlockReason;
  readonly note?: string;
  readonly reachedAmmunitionGate: boolean;
  readonly successNote?: string;
  readonly lineOfFireFailureNote: string;
}

function sentryAwareNote(
  wasOnSentry: boolean,
  perspective: "enemy" | "target",
  message: string
): string {
  return wasOnSentry
    ? `${perspective === "target" ? "Target is" : "Enemy unit was"} on sentry, but ${message.charAt(0).toLowerCase()}${message.slice(1)}`
    : message;
}

function groundAmmoFailureMessage(cost: number): string {
  return cost > 1
    ? `Enemy unit lacks the ${cost.toFixed(0)} ammo needed to return indirect fire.`
    : "Enemy unit has no ammunition remaining to retaliate.";
}

/**
 * Canonical, deterministic preparation for live retaliation resolution.
 * The engine supplies read-only facts and remains responsible for all RNG, debits, mutations, and publication.
 */
export function projectBattleRetaliation(
  input: BattleRetaliationProjectionInput
): BattleRetaliationProjection {
  const defender = structuredClone(input.defenderWasOnSentry ? input.defenderBefore : input.defenderAfter);
  defender.facing = input.resolvedFacing;
  defender.onSentry = false;
  const perspective = input.notePerspective ?? "enemy";
  const subject = perspective === "target" ? "Target" : "Enemy unit";

  let allowed = (input.defenderWasOnSentry || input.defenderAfter.strength > 0)
    && input.attackerStrength > 0;
  let blockReason: BattleRetaliationBlockReason | undefined;
  let note: string | undefined;
  const block = (reason: BattleRetaliationBlockReason, message: string): void => {
    allowed = false;
    blockReason = reason;
    note = sentryAwareNote(input.defenderWasOnSentry, perspective, message);
  };

  if (input.defenderBecameBroken && !input.defenderWasOnSentry) {
    block(
      "defenderBroken",
      perspective === "target"
        ? "Target is routed and cannot return fire."
        : "Enemy unit routed and cannot return fire."
    );
  }
  if (allowed && input.attackerIsAircraft && !input.defenderIsAircraft) {
    block(
      "aircraftAgainstGround",
      perspective === "target"
        ? "Ground units cannot retaliate against fast-moving aircraft."
        : "Enemy unit cannot retaliate against fast-moving aircraft."
    );
  }
  const blockTow = (): void => {
    if (allowed && input.defenderTowBlocked) {
      block("defenderTowed", `${subject} is limbered and cannot return fire until deployed.`);
    }
  };
  const blockPinned = (): void => {
    if (
      allowed
      && input.defenderPinnedOrBroken
      && (!input.defenderWasOnSentry || input.pinnedBlocksSentry === true)
    ) {
      block("defenderPinned", `${subject} is pinned and cannot return fire.`);
    }
  };
  if (input.pinTowPriority === "pinFirst") {
    blockPinned();
    blockTow();
  } else {
    blockTow();
    blockPinned();
  }

  const effectiveRangeMax = input.defenderIsBomber && input.attackerIsAircraft
    ? Math.max(input.rangeMax, 2)
    : input.rangeMax;
  if (allowed && (input.distance < input.rangeMin || input.distance > effectiveRangeMax)) {
    block("outOfRange", `${subject} is out of return-fire range.`);
  }
  if (allowed && !input.retaliationAvailable) {
    block("limitExhausted", `${subject} has already used all available retaliations this turn.`);
  }
  const reachedAmmunitionGate = allowed;
  if (allowed && input.ammunition.kind === "aircraft") {
    if (input.ammunition.needsRearm) {
      block("aircraftRearming", "Enemy aircraft must rearm before it can retaliate.");
    } else if (input.ammunition.airShots <= 0) {
      block("aircraftAmmoDepleted", "Enemy aircraft has no interception ammo remaining.");
    }
  }
  if (
    allowed
    && input.ammunition.kind === "ground"
    && input.ammunition.available !== null
    && input.ammunition.available < input.ammunition.cost
  ) {
    block("groundAmmoDepleted", groundAmmoFailureMessage(input.ammunition.cost));
  }
  if (perspective === "target" && !input.defenderWasOnSentry && input.defenderAfter.strength <= 0) {
    note = "Target is expected to be destroyed before it can return fire.";
  }

  return {
    defender,
    allowed,
    blockReason,
    note,
    reachedAmmunitionGate,
    successNote: input.defenderWasOnSentry
      ? perspective === "target"
        ? "Target is on sentry and will return fire simultaneously."
        : "Enemy unit was on sentry and returned fire simultaneously."
      : undefined,
    lineOfFireFailureNote: sentryAwareNote(
      input.defenderWasOnSentry,
      perspective,
      `${subject} lack${perspective === "target" ? "s" : "ed"} line of fire for retaliation.`
    )
  };
}
