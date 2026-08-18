import type { Axial } from "../core/Hex";
import type { ScenarioData, ScenarioUnit } from "../core/types";
import type { TurnSummary, TurnFaction } from "../game/GameEngine";
import type { BotDifficulty } from "../game/bot/BotPlanner";
import unitTypesData from "../data/unitSystem/derivedUnitTypes";

export type ObjectiveTier = "primary" | "secondary" | "tertiary";

export type ObjectiveState = "pending" | "inProgress" | "completed" | "failed";

export interface ObjectiveProgress {
  readonly id: string;
  readonly label: string;
  readonly tier: ObjectiveTier;
  readonly state: ObjectiveState;
  readonly detail?: string;
}

export interface ObjectiveMarkerProgress {
  readonly hex: Axial;
  readonly status: "unoccupied" | "player" | "enemy";
  readonly counter?: string;
  readonly tooltip?: string;
}

export interface MissionOutcome {
  readonly state: "inProgress" | "playerVictory" | "playerDefeat";
  readonly reason?: string;
}

export interface MissionPhaseStatus {
  readonly id: "phase1_probe" | "phase2_commitment" | "phase3_escalation";
  readonly label: string;
  readonly detail: string;
  readonly announcement: string;
}

export interface MissionStatus {
  readonly turn: number;
  readonly objectives: readonly ObjectiveProgress[];
  readonly outcome: MissionOutcome;
  readonly phase?: MissionPhaseStatus;
  readonly markers?: readonly ObjectiveMarkerProgress[];
}

export interface MissionSnapshot {
  readonly turnSummary: TurnSummary;
  readonly scenario: ScenarioData;
  readonly occupancy: ReadonlyMap<string, TurnFaction>;
  readonly playerUnits: readonly ScenarioUnit[];
  readonly botUnits: readonly ScenarioUnit[];
  readonly allyUnits?: readonly ScenarioUnit[];
}

export interface MissionRulesController {
  onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus;
  getStatus(): MissionStatus;
  serializeState(): SerializedMissionRulesState;
  hydrateState(snapshot: SerializedMissionRulesState): void;
}

/** Versioned closure state required to continue mission-specific objective rules exactly after reload. */
export interface SerializedMissionRulesState {
  readonly version: 1;
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
}

function readMissionRuleState(
  snapshot: SerializedMissionRulesState,
  expectedKind: string
): Record<string, unknown> {
  if (!snapshot || snapshot.version !== 1 || snapshot.kind !== expectedKind
    || typeof snapshot.data !== "object" || snapshot.data === null || Array.isArray(snapshot.data)) {
    throw new Error(`Mission-rule snapshot does not match '${expectedKind}'.`);
  }
  return snapshot.data as Record<string, unknown>;
}

function makeKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

function normalizeObjectiveHex(hex: Axial | readonly [number, number]): Axial {
  if (Array.isArray(hex)) {
    const [col, row] = hex;
    return { q: col, r: row - Math.floor(col / 2) };
  }

  const axial = hex as Axial;
  return { q: axial.q, r: axial.r };
}

interface FordTracker {
  readonly counters: Map<string, number>;
  outcome: MissionOutcome;
  blockedFordsStreak: number;
  phase: MissionPhaseStatus;
}

interface TownDefenseTracker {
  outcome: MissionOutcome;
  initialFriendlyForce: number | null;
}

type UnitTypeKey = keyof typeof unitTypesData;

function isFriendlyOccupant(faction: TurnFaction | undefined): boolean {
  return faction === "Player" || faction === "Ally";
}

function toPercent(value: number): string {
  return `${Math.max(0, Math.round(value * 100))}%`;
}

function getGroundForceScore(units: readonly ScenarioUnit[]): number {
  return units.reduce((total, unit) => {
    const definition = unitTypesData[unit.type as UnitTypeKey];
    if (!definition || definition.moveType === "air") {
      return total;
    }
    const strengthRatio = Math.max(0, Math.min(100, Number(unit.strength ?? 100))) / 100;
    return total + definition.cost * strengthRatio;
  }, 0);
}

function createRiverWatchPhase(turnNumber: number, blockedFordsStreak: number, difficulty: BotDifficulty): MissionPhaseStatus {
  if (difficulty !== "Easy" && blockedFordsStreak >= 2) {
    return {
      id: "phase3_escalation",
      label: "Phase 3: Reserve Pressure",
      detail: "All three fords have been blocked for two turns. Expect reserve pressure and indirect probing before dawn.",
      announcement: "River Watch escalation: your line has blocked every ford long enough to trigger reserve pressure."
    };
  }

  if (turnNumber >= 4) {
    return {
      id: "phase2_commitment",
      label: "Phase 2: Commitment",
      detail: "Enemy probes are giving way to coordinated pressure across multiple crossings. Keep your response force mobile.",
      announcement: "River Watch escalation: enemy pressure is building across multiple crossings."
    };
  }

  return {
    id: "phase1_probe",
    label: "Phase 1: Probe",
    detail: "Small infiltration teams are testing the river line. Screen the crossings and avoid overcommitting too early.",
    announcement: "River Watch is underway: enemy probes are testing the fords."
  };
}

function createRiverWatchController(scenario: ScenarioData, difficulty: BotDifficulty): MissionRulesController {
  const fordKeys = (scenario.objectives ?? []).map((objective, index) => ({
    key: makeKey(objective.hex),
    label: `Ford ${index + 1}`,
    hex: objective.hex
  }));

  const tracker: FordTracker = {
    counters: new Map<string, number>(),
    outcome: { state: "inProgress" },
    blockedFordsStreak: 0,
    phase: createRiverWatchPhase(0, 0, difficulty)
  };

  const buildObjectives = (
    outcome: MissionOutcome,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[]
  ): readonly ObjectiveProgress[] => {
    const primary: ObjectiveProgress = {
      id: "primary_deny_fords",
      label: "Hold all fords for 8 consecutive turns",
      tier: "primary",
      state: outcome.state === "playerDefeat" ? "failed" : outcome.state === "playerVictory" ? "completed" : "inProgress",
      detail: `Player hold all: ${tracker.blockedFordsStreak}/8 turns; ${fordKeys
        .map(({ key, label }) => {
          const count = tracker.counters.get(key) ?? 0;
          return `${label}: Bot hold ${count}/8 turns`;
        })
        .join("; ")}`
    };

    const commsDestroyed = botUnits.every((unit) => unit.type !== "Recon_Bike");
    const secondary: ObjectiveProgress = {
      id: "secondary_destroy_comms",
      label: "Destroy the enemy comms team before it reaches the central ford",
      tier: "secondary",
      state: commsDestroyed
        ? "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: commsDestroyed
        ? "Enemy comms team eliminated before the patrol withdrew."
        : outcome.state === "inProgress"
          ? "Enemy comms team remains active."
          : "Enemy comms team survived the patrol action."
    };

    const playerReconAlive = playerUnits.some((unit) => unit.type === "Recon_Bike");
    const tertiary: ObjectiveProgress = {
      id: "tertiary_keep_recon",
      label: "Keep at least one recon unit alive",
      tier: "tertiary",
      state: playerReconAlive
        ? outcome.state === "inProgress"
          ? "inProgress"
          : "completed"
        : "failed",
      detail: playerReconAlive
        ? outcome.state === "inProgress"
          ? "At least one recon element remains operational."
          : "Recon element survived through mission resolution."
        : "All recon elements were lost before mission end."
    };

    return [primary, secondary, tertiary] satisfies readonly ObjectiveProgress[];
  };

  const buildMarkers = (occupancy: ReadonlyMap<string, TurnFaction>): readonly ObjectiveMarkerProgress[] => {
    return fordKeys.map(({ key, label, hex }) => {
      const occupant = occupancy.get(key);
      const counter = tracker.counters.get(key) ?? 0;

      if (occupant === "Bot") {
        return {
          hex,
          status: "enemy",
          counter: `${counter}/8`,
          tooltip: `${label} - Enemy controlled. Enemy has held for ${counter} of 8 turns.`
        } satisfies ObjectiveMarkerProgress;
      }

      if (isFriendlyOccupant(occupant)) {
        const allFordsHeld = fordKeys.every(({ key: fordKey }) => isFriendlyOccupant(occupancy.get(fordKey)));
        return {
          hex,
          status: "player",
          tooltip: allFordsHeld
            ? `${label} - Secured. All fords have been held for ${tracker.blockedFordsStreak} of 8 turns.`
            : `${label} - Secured. This crossing is held, but every ford must be held at once to win.`
        } satisfies ObjectiveMarkerProgress;
      }

      return {
        hex,
        status: "unoccupied",
        tooltip: `${label} - Contested. Move onto the ford and hold every crossing at once.`
      } satisfies ObjectiveMarkerProgress;
    });
  };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;

    let outcome: MissionOutcome = tracker.outcome;
    const allFordsBlocked = fordKeys.length > 0 && fordKeys.every(({ key }) => {
      const occupant = occupancy.get(key);
      return occupant === "Player" || occupant === "Ally";
    });

    tracker.blockedFordsStreak = allFordsBlocked ? tracker.blockedFordsStreak + 1 : 0;
    tracker.phase = createRiverWatchPhase(turnSummary.turnNumber, tracker.blockedFordsStreak, difficulty);

    // Check for unit elimination victory/defeat conditions
    if (outcome.state === "inProgress") {
      if (botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "All enemy forces eliminated." };
      } else if (playerUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: "All friendly forces eliminated." };
      }
    }

    // Check ford control for defeat (enemy holds any ford for 8 turns)
    fordKeys.forEach(({ key }) => {
      const occupant = occupancy.get(key);
      const heldByBot = occupant === "Bot";
      const previous = tracker.counters.get(key) ?? 0;
      const next = heldByBot ? previous + 1 : 0;
      tracker.counters.set(key, next);
      if (heldByBot && next >= 8 && outcome.state === "inProgress") {
        outcome = { state: "playerDefeat", reason: "Enemy secured a ford for 8 turns." };
      }
    });

    // Check for victory by denying all fords for 8 consecutive turns
    if (tracker.blockedFordsStreak >= 8 && outcome.state === "inProgress") {
      outcome = { state: "playerVictory", reason: "Denied enemy control of all fords for 8 turns." };
    }

    // Turn limit fallback (should never be reached with turnLimit = 999)
    if (turnLimit !== null && turnLimit < 999 && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
      outcome = { state: "playerVictory", reason: "Held river line through the final turn." };
    }

    tracker.outcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, playerUnits, botUnits),
      outcome,
      phase: tracker.phase,
      markers: buildMarkers(occupancy)
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      return {
        turn: 0,
        objectives: buildObjectives(tracker.outcome, scenario.sides.Player.units, scenario.sides.Bot.units),
        outcome: tracker.outcome,
        phase: tracker.phase,
        markers: buildMarkers(new Map<string, TurnFaction>())
      };
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "riverWatch",
        data: {
          counters: Array.from(tracker.counters.entries()),
          outcome: structuredClone(tracker.outcome),
          blockedFordsStreak: tracker.blockedFordsStreak,
          phase: structuredClone(tracker.phase)
        }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "riverWatch");
      if (!Array.isArray(data.counters) || !Number.isInteger(data.blockedFordsStreak)) {
        throw new Error("River Watch mission-rule snapshot is malformed.");
      }
      tracker.counters.clear();
      (data.counters as Array<[string, number]>).forEach(([key, value]) => tracker.counters.set(key, value));
      tracker.outcome = structuredClone(data.outcome as MissionOutcome);
      tracker.blockedFordsStreak = Number(data.blockedFordsStreak);
      tracker.phase = structuredClone(data.phase as MissionPhaseStatus);
    }
  } satisfies MissionRulesController;
}

function createTownDefenseController(scenario: ScenarioData): MissionRulesController {
  const townHex = scenario.objectives[0]?.hex ?? scenario.sides.Player.hq;
  const townKey = makeKey(townHex);
  const turnLimit = scenario.turnLimit ?? null;
  const initialBotForce = Math.max(getGroundForceScore(scenario.sides.Bot.units), 1);
  const tracker: TownDefenseTracker = {
    outcome: { state: "inProgress" },
    initialFriendlyForce: null
  };

  const buildObjective = (
    outcome: MissionOutcome,
    townOccupant: TurnFaction | undefined,
    enemyForceRatio: number,
    friendlyForceRatio: number
  ): ObjectiveProgress => {
    const townStatus = townOccupant === "Bot"
      ? "Enemy formations are inside the town center."
      : isFriendlyOccupant(townOccupant)
        ? "Friendly forces are holding the town center."
        : "The town center is currently exposed.";

    const forceStatus = `Enemy assault strength is at ${toPercent(enemyForceRatio)} of its opening force; defenders retain ${toPercent(friendlyForceRatio)} of their starting combat power.`;

    return {
      id: "primary_repel_enemy",
      label: "Repel the enemy assault and keep the town in friendly hands",
      tier: "primary",
      state: outcome.state === "playerVictory" ? "completed" : outcome.state === "playerDefeat" ? "failed" : "inProgress",
      detail: outcome.state === "playerVictory"
        ? outcome.reason ?? "The enemy assault collapsed and withdrew from the town."
        : outcome.state === "playerDefeat"
          ? outcome.reason ?? "The defense failed before the assault could be broken."
          : `${townStatus} ${forceStatus}`
    } satisfies ObjectiveProgress;
  };

  const buildMarker = (
    outcome: MissionOutcome,
    townOccupant: TurnFaction | undefined,
    enemyForceRatio: number,
    friendlyForceRatio: number
  ): ObjectiveMarkerProgress => {
    const status = townOccupant === "Bot"
      ? "enemy"
      : isFriendlyOccupant(townOccupant)
        ? "player"
        : "unoccupied";

    const tooltip = outcome.state === "playerVictory"
      ? `Town center - Secure. ${outcome.reason ?? "The enemy assault has broken and is retreating."}`
      : outcome.state === "playerDefeat"
        ? `Town center - Lost. ${outcome.reason ?? "The defense failed before the assault could be broken."}`
        : `Town center - ${status === "enemy" ? "Enemy pressure" : status === "player" ? "Defenders holding" : "Contested"}. Hold the objective and repel all enemies.`;

    return {
      hex: townHex,
      status,
      tooltip
    } satisfies ObjectiveMarkerProgress;
  };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits } = snapshot;
    const allyUnits = snapshot.allyUnits ?? scenario.sides.Ally?.units ?? [];
    const friendlyUnits = [...playerUnits, ...allyUnits];
    const remainingFriendlyForce = getGroundForceScore(friendlyUnits);
    const remainingBotForce = getGroundForceScore(botUnits);

    if (tracker.initialFriendlyForce === null && remainingFriendlyForce > 0) {
      tracker.initialFriendlyForce = remainingFriendlyForce;
    }

    const initialFriendlyForce = Math.max(tracker.initialFriendlyForce ?? remainingFriendlyForce, 1);
    const enemyForceRatio = remainingBotForce / initialBotForce;
    const friendlyForceRatio = remainingFriendlyForce / initialFriendlyForce;
    const townOccupant = occupancy.get(townKey);
    const townHeldByFriendly = isFriendlyOccupant(townOccupant);

    let outcome: MissionOutcome = tracker.outcome;

    if (outcome.state === "inProgress") {
      if (remainingBotForce <= 0 || botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "The attacking force has been destroyed and the town remains secure." };
      } else if (remainingFriendlyForce <= 0 || friendlyUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: "The defenders have been wiped out before the attack could be broken." };
      } else {
        const enemyShattered = remainingBotForce <= initialBotForce * 0.2 && remainingBotForce <= remainingFriendlyForce * 0.7;
        const enemyHopelesslyOutmatched =
          turnSummary.turnNumber >= 4 &&
          remainingBotForce <= initialBotForce * 0.35 &&
          remainingBotForce <= remainingFriendlyForce * 0.4;

        if (townHeldByFriendly && (enemyShattered || enemyHopelesslyOutmatched)) {
          outcome = { state: "playerVictory", reason: "The enemy assault has collapsed and the survivors are retreating from the town." };
        } else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
          if (townHeldByFriendly && remainingFriendlyForce >= remainingBotForce) {
            outcome = { state: "playerVictory", reason: "The enemy attack spent itself before it could seize the town." };
          } else if (townOccupant === "Bot") {
            outcome = { state: "playerDefeat", reason: "Enemy forces forced their way into the town before the defense could throw them back." };
          } else {
            outcome = { state: "playerDefeat", reason: "The enemy still retained enough combat power to keep pressing the attack." };
          }
        }
      }
    }

    tracker.outcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: [buildObjective(outcome, townOccupant, enemyForceRatio, friendlyForceRatio)],
      outcome,
      markers: [buildMarker(outcome, townOccupant, enemyForceRatio, friendlyForceRatio)]
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      const occupancy = new Map<string, TurnFaction>();
      scenario.sides.Player.units.forEach((unit) => {
        occupancy.set(makeKey(unit.hex), "Player");
      });
      scenario.sides.Bot.units.forEach((unit) => {
        occupancy.set(makeKey(unit.hex), "Bot");
      });
      scenario.sides.Ally?.units.forEach((unit) => {
        occupancy.set(makeKey(unit.hex), "Ally");
      });

      const seededFriendlyForce = getGroundForceScore([
        ...scenario.sides.Player.units,
        ...(scenario.sides.Ally?.units ?? [])
      ]);
      if (tracker.initialFriendlyForce === null && seededFriendlyForce > 0) {
        tracker.initialFriendlyForce = seededFriendlyForce;
      }
      const enemyForceRatio = 1;
      const friendlyForceRatio = 1;
      const townOccupant = occupancy.get(townKey);

      return {
        turn: 0,
        objectives: [buildObjective(tracker.outcome, townOccupant, enemyForceRatio, friendlyForceRatio)],
        outcome: tracker.outcome,
        markers: [buildMarker(tracker.outcome, townOccupant, enemyForceRatio, friendlyForceRatio)]
      } satisfies MissionStatus;
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "townDefense",
        data: {
          outcome: structuredClone(tracker.outcome),
          initialFriendlyForce: tracker.initialFriendlyForce
        }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "townDefense");
      if (data.initialFriendlyForce !== null && typeof data.initialFriendlyForce !== "number") {
        throw new Error("Town Defense mission-rule snapshot is malformed.");
      }
      tracker.outcome = structuredClone(data.outcome as MissionOutcome);
      tracker.initialFriendlyForce = data.initialFriendlyForce as number | null;
    }
  } satisfies MissionRulesController;
}

interface PointeDuHocTracker {
  holdStreak: number;
  outcome: MissionOutcome;
  phase: MissionPhaseStatus;
  counterattackAnnounced: boolean;
}

function createPointeDuHocPhase(turnNumber: number, counterattackAnnounced: boolean): MissionPhaseStatus {
  if (turnNumber >= 3) {
    return {
      id: "phase2_commitment",
      label: "Phase 2: Counterattack",
      detail: "German infantry are pushing from the inland forest toward the battery. Hold every gun position simultaneously to keep the clock running.",
      announcement: counterattackAnnounced
        ? "German counterattack force is pressing from the forest road."
        : "Pointe du Hoc: German counterattack force has emerged from the forest — defend the captured positions."
    };
  }

  return {
    id: "phase1_probe",
    label: "Phase 1: Assault",
    detail: "Break through the forward ridge line and clear each gun emplacement before the inland reserve can counterattack.",
    announcement: "Assault force is in position. Seize the battery line before reinforcements arrive."
  };
}

function createPointeDuHocController(scenario: ScenarioData, difficulty: BotDifficulty): MissionRulesController {
  const HOLD_TARGET = 6;

  const gunPositions = (scenario.objectives ?? []).map((objective, index) => ({
    key: makeKey(objective.hex),
    label: `Gun Position ${index + 1}`,
    hex: objective.hex
  }));
  const gunPositionKeys = new Set(gunPositions.map(({ key }) => key));
  const batteryUnitTypes = new Set<ScenarioUnit["type"]>(["Howitzer_105", "Flak_88", "AT_Gun_50mm"]);

  const tracker: PointeDuHocTracker = {
    holdStreak: 0,
    outcome: { state: "inProgress" },
    phase: createPointeDuHocPhase(0, false),
    counterattackAnnounced: false
  };

  const buildObjectives = (
    outcome: MissionOutcome,
    occupancy: ReadonlyMap<string, TurnFaction>,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[]
  ): readonly ObjectiveProgress[] => {
    const capturedCount = gunPositions.filter(({ key }) => isFriendlyOccupant(occupancy.get(key))).length;

    const primary: ObjectiveProgress = {
      id: "primary_hold_battery",
      label: "Capture and hold all three gun positions for 6 consecutive turns",
      tier: "primary",
      state: outcome.state === "playerVictory" && tracker.holdStreak >= HOLD_TARGET
        ? "completed"
        : outcome.state === "playerDefeat"
          ? "failed"
          : "inProgress",
      detail: capturedCount < gunPositions.length
        ? `Assault phase: ${capturedCount}/${gunPositions.length} gun positions captured. All three must be held simultaneously to start the hold clock.`
        : `Hold phase: ${tracker.holdStreak}/${HOLD_TARGET} turns. All three positions must remain in friendly hands.`
    };

    const batteryUnitsRemaining = botUnits.filter(
      (unit) => batteryUnitTypes.has(unit.type) && gunPositionKeys.has(makeKey(unit.hex))
    ).length;
    const secondary: ObjectiveProgress = {
      id: "secondary_battery_kills",
      label: "Neutralize all battery emplacements",
      tier: "secondary",
      state: batteryUnitsRemaining <= 0
        ? "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: batteryUnitsRemaining <= 0
        ? "All gun emplacements on the ridge have been silenced."
        : outcome.state === "inProgress"
          ? `${batteryUnitsRemaining} battery emplacement${batteryUnitsRemaining === 1 ? "" : "s"} still firing.`
          : "At least one battery emplacement survived the assault."
    };

    const assaultForceOperational = playerUnits.length >= 3;
    const tertiary: ObjectiveProgress = {
      id: "tertiary_assault_force",
      label: "Keep at least three assault units operational",
      tier: "tertiary",
      state: assaultForceOperational
        ? outcome.state === "inProgress"
          ? "inProgress"
          : "completed"
        : "failed",
      detail: assaultForceOperational
        ? outcome.state === "inProgress"
          ? `${playerUnits.length} assault units remain operational.`
          : `${playerUnits.length} assault units survived the mission.`
        : "Fewer than three assault units remain operational."
    };

    return [primary, secondary, tertiary] satisfies readonly ObjectiveProgress[];
  };

  const buildMarkers = (
    outcome: MissionOutcome,
    occupancy: ReadonlyMap<string, TurnFaction>
  ): readonly ObjectiveMarkerProgress[] => {
    return gunPositions.map(({ key, label, hex }) => {
      const occupant = occupancy.get(key);

      if (occupant === "Bot") {
        return {
          hex,
          status: "enemy",
          counter: `${tracker.holdStreak}/${HOLD_TARGET}`,
          tooltip: `${label} — Enemy-held. Recapture this position to resume the hold clock.`
        } satisfies ObjectiveMarkerProgress;
      }

      if (isFriendlyOccupant(occupant)) {
        const allHeld = gunPositions.every(({ key: gk }) => isFriendlyOccupant(occupancy.get(gk)));
        return {
          hex,
          status: "player",
          counter: allHeld ? `${tracker.holdStreak}/${HOLD_TARGET}` : undefined,
          tooltip: allHeld
            ? `${label} — Secured. Hold clock at ${tracker.holdStreak} of ${HOLD_TARGET} turns.`
            : `${label} — Secured, but not all positions are held. Capture the remaining guns to start the clock.`
        } satisfies ObjectiveMarkerProgress;
      }

      return {
        hex,
        status: "unoccupied",
        tooltip: `${label} — Unoccupied. Move a unit onto the emplacement to capture this position.`
      } satisfies ObjectiveMarkerProgress;
    });
  };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;

    const counterattackJustArrived = turnSummary.turnNumber === 3 && !tracker.counterattackAnnounced;
    if (counterattackJustArrived) {
      tracker.counterattackAnnounced = true;
    }
    tracker.phase = createPointeDuHocPhase(turnSummary.turnNumber, !counterattackJustArrived);

    let outcome: MissionOutcome = tracker.outcome;

    if (outcome.state === "inProgress") {
      if (botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "All German forces eliminated." };
      } else if (playerUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: "All assault units were lost." };
      }
    }

    if (outcome.state === "inProgress") {
      const allGunsCaptured = gunPositions.length > 0 &&
        gunPositions.every(({ key }) => isFriendlyOccupant(occupancy.get(key)));

      if (allGunsCaptured) {
        tracker.holdStreak += 1;
      } else {
        tracker.holdStreak = 0;
      }

      if (tracker.holdStreak >= HOLD_TARGET) {
        outcome = { state: "playerVictory", reason: "All gun positions held for 6 consecutive turns. Pointe du Hoc is secure." };
      } else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
        outcome = { state: "playerDefeat", reason: "The assault window closed before the battery could be held. German reinforcements will retake the position." };
      }
    }

    tracker.outcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, occupancy, playerUnits, botUnits),
      outcome,
      phase: tracker.phase,
      markers: buildMarkers(outcome, occupancy)
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      const emptyOccupancy = new Map<string, TurnFaction>();
      return {
        turn: 0,
        objectives: buildObjectives(tracker.outcome, emptyOccupancy, scenario.sides.Player.units, scenario.sides.Bot.units),
        outcome: tracker.outcome,
        phase: tracker.phase,
        markers: buildMarkers(tracker.outcome, emptyOccupancy)
      };
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "pointeDuHoc",
        data: {
          holdStreak: tracker.holdStreak,
          outcome: structuredClone(tracker.outcome),
          phase: structuredClone(tracker.phase),
          counterattackAnnounced: tracker.counterattackAnnounced
        }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "pointeDuHoc");
      if (!Number.isInteger(data.holdStreak) || typeof data.counterattackAnnounced !== "boolean") {
        throw new Error("Pointe du Hoc mission-rule snapshot is malformed.");
      }
      tracker.holdStreak = Number(data.holdStreak);
      tracker.outcome = structuredClone(data.outcome as MissionOutcome);
      tracker.phase = structuredClone(data.phase as MissionPhaseStatus);
      tracker.counterattackAnnounced = data.counterattackAnnounced;
    }
  } satisfies MissionRulesController;
}

interface TwoBridgesTracker {
  outcome: MissionOutcome;
  phase: MissionPhaseStatus;
}

function createTwoBridgesPhase(turnNumber: number, capturedObjectiveCount: number, bastionCaptured: boolean): MissionPhaseStatus {
  if (turnNumber >= 12 || bastionCaptured || capturedObjectiveCount >= 2) {
    return {
      id: "phase3_escalation",
      label: "Phase 3: Bastion Push",
      detail: "Bridge control has opened the approach. Commit reserves against the bastion before the defenders rebuild the line.",
      announcement: "Two Bridges escalation: the bastion is exposed. Drive the assault home."
    };
  }

  if (turnNumber >= 5 || capturedObjectiveCount >= 1) {
    return {
      id: "phase2_commitment",
      label: "Phase 2: Bridge Fight",
      detail: "The crossing fight is fully joined. Hold captured bridgeheads while armor and engineers force the second route.",
      announcement: "Two Bridges escalation: bridgehead fighting has begun."
    };
  }

  return {
    id: "phase1_probe",
    label: "Phase 1: Approach",
    detail: "Reconnoiter both crossings, suppress the near bank, and choose where the main assault will break through.",
    announcement: "Two Bridges assault has begun. Recon the crossings and prepare the breach."
  };
}

function createTwoBridgesController(scenario: ScenarioData, _difficulty: BotDifficulty): MissionRulesController {
  const assaultObjectives = (scenario.objectives ?? []).slice(0, 3).map((objective, index) => {
    const hex = normalizeObjectiveHex(objective.hex);
    const labels = ["North Bridge", "South Bridge", "Bastion City"] as const;
    return {
      key: makeKey(hex),
      label: labels[index] ?? `Objective ${index + 1}`,
      hex
    };
  });
  const supplyObjective = scenario.objectives?.[3]
    ? {
        key: makeKey(normalizeObjectiveHex(scenario.objectives[3].hex)),
        label: "Western Supply Base",
        hex: normalizeObjectiveHex(scenario.objectives[3].hex)
      }
    : null;

  const tracker: TwoBridgesTracker = {
    outcome: { state: "inProgress" },
    phase: createTwoBridgesPhase(0, 0, false)
  };

  const countCapturedAssaultObjectives = (occupancy: ReadonlyMap<string, TurnFaction>): number =>
    assaultObjectives.filter(({ key }) => isFriendlyOccupant(occupancy.get(key))).length;

  const buildObjectives = (
    outcome: MissionOutcome,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[],
    occupancy: ReadonlyMap<string, TurnFaction>
  ): readonly ObjectiveProgress[] => {
    const capturedCount = countCapturedAssaultObjectives(occupancy);

    const primary: ObjectiveProgress = {
      id: "primary_secure_crossings",
      label: "Seize both bridges and the bastion city",
      tier: "primary",
      state: outcome.state === "playerVictory"
        ? "completed"
        : outcome.state === "playerDefeat"
          ? "failed"
          : "inProgress",
      detail: `Captured ${capturedCount}/${assaultObjectives.length}: ${assaultObjectives
        .map(({ key, label }) => `${isFriendlyOccupant(occupancy.get(key)) ? "[X]" : "[ ]"} ${label}`)
        .join(", ")}`
    };

    const supplyHeld = supplyObjective ? isFriendlyOccupant(occupancy.get(supplyObjective.key)) : playerUnits.length > 0;
    const secondary: ObjectiveProgress = {
      id: "secondary_hold_supply_base",
      label: "Keep the western supply base in friendly hands",
      tier: "secondary",
      state: supplyHeld
        ? outcome.state === "inProgress"
          ? "inProgress"
          : "completed"
        : "failed",
      detail: supplyHeld
        ? "The western supply base remains available for the bridge assault."
        : "The western supply base is no longer held by friendly forces."
    };

    const fireSupportRemaining = botUnits.filter((unit) => unit.type === "Howitzer_105" || unit.type === "Flak_88").length;
    const tertiary: ObjectiveProgress = {
      id: "tertiary_silence_fire_support",
      label: "Silence enemy artillery and air-defense guns",
      tier: "tertiary",
      state: fireSupportRemaining === 0
        ? "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: fireSupportRemaining === 0
        ? "Enemy fire-support guns are out of action."
        : `${fireSupportRemaining} enemy fire-support guns remain operational.`
    };

    return [primary, secondary, tertiary] satisfies readonly ObjectiveProgress[];
  };

  const buildMarkers = (occupancy: ReadonlyMap<string, TurnFaction>): readonly ObjectiveMarkerProgress[] => {
    const capturedCount = countCapturedAssaultObjectives(occupancy);
    const assaultMarkers = assaultObjectives.map(({ key, label, hex }) => {
      const occupant = occupancy.get(key);
      const status = isFriendlyOccupant(occupant) ? "player" : occupant === "Bot" ? "enemy" : "unoccupied";
      return {
        hex,
        status,
        counter: `${capturedCount}/${assaultObjectives.length}`,
        tooltip: `${label} - ${status === "player" ? "secured" : status === "enemy" ? "enemy-held" : "unoccupied"}.`
      } satisfies ObjectiveMarkerProgress;
    });

    if (!supplyObjective) {
      return assaultMarkers;
    }

    const supplyOccupant = occupancy.get(supplyObjective.key);
    const supplyStatus = isFriendlyOccupant(supplyOccupant) ? "player" : supplyOccupant === "Bot" ? "enemy" : "unoccupied";
    return [
      ...assaultMarkers,
      {
        hex: supplyObjective.hex,
        status: supplyStatus,
        tooltip: `${supplyObjective.label} - ${supplyStatus === "player" ? "secure" : "threatened"}.`
      } satisfies ObjectiveMarkerProgress
    ];
  };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;
    let outcome: MissionOutcome = tracker.outcome;
    const capturedCount = countCapturedAssaultObjectives(occupancy);
    const bastionCaptured = assaultObjectives[2] ? isFriendlyOccupant(occupancy.get(assaultObjectives[2].key)) : false;

    tracker.phase = createTwoBridgesPhase(turnSummary.turnNumber, capturedCount, bastionCaptured);

    if (outcome.state === "inProgress") {
      if (botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "Enemy bridge defense collapsed." };
      } else if (playerUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: "All friendly assault forces were destroyed." };
      } else if (capturedCount >= assaultObjectives.length) {
        outcome = { state: "playerVictory", reason: "Both bridges and the bastion city are secured." };
      } else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
        outcome = { state: "playerDefeat", reason: "Assault window closed before both bridges and the bastion were secured." };
      }
    }

    tracker.outcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, playerUnits, botUnits, occupancy),
      outcome,
      phase: tracker.phase,
      markers: buildMarkers(occupancy)
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      const emptyOccupancy = new Map<string, TurnFaction>();
      return {
        turn: 0,
        objectives: buildObjectives(tracker.outcome, scenario.sides.Player.units, scenario.sides.Bot.units, emptyOccupancy),
        outcome: tracker.outcome,
        phase: tracker.phase,
        markers: buildMarkers(emptyOccupancy)
      };
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "twoBridges",
        data: {
          outcome: structuredClone(tracker.outcome),
          phase: structuredClone(tracker.phase)
        }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "twoBridges");
      tracker.outcome = structuredClone(data.outcome as MissionOutcome);
      tracker.phase = structuredClone(data.phase as MissionPhaseStatus);
    }
  } satisfies MissionRulesController;
}

type HistoricalSecondaryRule =
  | {
      readonly kind: "destroyTypes";
      readonly id: string;
      readonly label: string;
      readonly targetTypes: readonly ScenarioUnit["type"][];
    }
  | {
      readonly kind: "protectObjectives";
      readonly id: string;
      readonly label: string;
      readonly indexes: readonly number[];
      readonly requiredCount: number;
    };

type HistoricalTertiaryRule =
  | {
      readonly kind: "surviveCount";
      readonly id: string;
      readonly label: string;
      readonly minCount: number;
    }
  | {
      readonly kind: "unitTypeAlive";
      readonly id: string;
      readonly label: string;
      readonly unitTypes: readonly ScenarioUnit["type"][];
      readonly minCount: number;
    }
  | {
      readonly kind: "destroyTypes";
      readonly id: string;
      readonly label: string;
      readonly targetTypes: readonly ScenarioUnit["type"][];
    };

interface HistoricalBattleConfig {
  readonly victoryMode: "capture" | "hold";
  readonly primaryId: string;
  readonly primaryLabel: string;
  readonly objectiveLabels: readonly string[];
  readonly primaryObjectiveIndexes: readonly number[];
  readonly requiredPrimaryCount?: number;
  readonly mandatoryObjectiveIndexes?: readonly number[];
  readonly instantDefeatObjectiveIndexes?: readonly number[];
  readonly secondary: HistoricalSecondaryRule;
  readonly tertiary?: HistoricalTertiaryRule;
  readonly phase1Label: string;
  readonly phase1Detail: string;
  readonly phase1Announcement: string;
  readonly phase2Label: string;
  readonly phase2Detail: string;
  readonly phase2Announcement: string;
  readonly phase3Label: string;
  readonly phase3Detail: string;
  readonly phase3Announcement: string;
  readonly victoryReason: string;
  readonly timerDefeatReason: string;
  readonly eliminationDefeatReason: string;
}

const historicalBattleConfigs: Record<string, HistoricalBattleConfig> = {
  assault_el_alamein: {
    victoryMode: "capture",
    primaryId: "primary_break_el_alamein_line",
    primaryLabel: "Break the El Alamein ridge and minefield line",
    objectiveLabels: ["Miteiriya Ridge", "Minefield Gap", "Tel el Eisa", "Axis Supply Track"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_destroy_axis_reserve",
      label: "Destroy the Axis armored reserve",
      targetTypes: ["Panzer_IV", "Heavy_Tank", "Assault_Gun"]
    },
    tertiary: {
      kind: "unitTypeAlive",
      id: "tertiary_keep_breach_engineers",
      label: "Keep an engineer formation operational",
      unitTypes: ["Engineer"],
      minCount: 1
    },
    phase1Label: "Phase 1: Minefield Contact",
    phase1Detail: "The ridges are under observation. Put engineers on the breach lanes and keep armor behind the gun line.",
    phase1Announcement: "El Alamein: contact along the mine belt. Prepare the breach.",
    phase2Label: "Phase 2: Ridge Breach",
    phase2Detail: "The minefield gap is contested. Commit armor only where infantry and guns have opened the corridor.",
    phase2Announcement: "El Alamein escalation: the ridge fight is fully engaged.",
    phase3Label: "Phase 3: Desert Breakout",
    phase3Detail: "Axis reserves are reacting. Cut the supply track before the line can reform.",
    phase3Announcement: "El Alamein final phase: drive through the gap and sever the Axis track.",
    victoryReason: "The El Alamein line is breached and the Axis supply track is cut.",
    timerDefeatReason: "The desert line held until the assault window closed.",
    eliminationDefeatReason: "All friendly El Alamein assault forces were destroyed."
  },
  assault_kasserine_pass: {
    victoryMode: "hold",
    primaryId: "primary_hold_pass_line",
    primaryLabel: "Hold Tebessa road and enough pass objectives",
    objectiveLabels: ["Tebessa Supply Road", "Northern Pass", "Southern Pass", "Axis Assembly Valley"],
    primaryObjectiveIndexes: [0, 1, 2],
    requiredPrimaryCount: 2,
    mandatoryObjectiveIndexes: [0],
    instantDefeatObjectiveIndexes: [0],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_destroy_spearhead",
      label: "Destroy the German armored spearhead",
      targetTypes: ["Panzer_IV", "Heavy_Tank", "Assault_Gun"]
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_blocking_force",
      label: "Keep at least five friendly formations operational",
      minCount: 5
    },
    phase1Label: "Phase 1: Contact",
    phase1Detail: "Enemy scouts are entering the valley. Confirm roadblocks and keep armor in reserve.",
    phase1Announcement: "Kasserine Pass: German reconnaissance is probing the road line.",
    phase2Label: "Phase 2: Armored Commitment",
    phase2Detail: "The panzer spearhead is committed into the pass lanes. Stop the armor before it reaches Tebessa road.",
    phase2Announcement: "Kasserine Pass escalation: the armored thrust is in the valley.",
    phase3Label: "Phase 3: Breakthrough Check",
    phase3Detail: "The decisive pressure is on the supply road. Hold the line until the attack loses momentum.",
    phase3Announcement: "Kasserine Pass final phase: hold Tebessa road at all costs.",
    victoryReason: "Kasserine Pass held and the supply road remains open.",
    timerDefeatReason: "The pass defense failed its final hold check.",
    eliminationDefeatReason: "All friendly pass-defense forces were destroyed."
  },
  assault_gela_landings: {
    victoryMode: "capture",
    primaryId: "primary_expand_gela_beachhead",
    primaryLabel: "Capture Gela, Ponte Olivo, and Highway 115",
    objectiveLabels: ["Gela Port", "Ponte Olivo Airfield", "Highway 115", "Beachhead Anchor"],
    primaryObjectiveIndexes: [0, 1, 2],
    secondary: {
      kind: "protectObjectives",
      id: "secondary_hold_beachhead",
      label: "Keep the beachhead anchor in friendly hands",
      indexes: [3],
      requiredCount: 1
    },
    tertiary: {
      kind: "unitTypeAlive",
      id: "tertiary_keep_engineers",
      label: "Keep an engineer formation operational",
      unitTypes: ["Engineer"],
      minCount: 1
    },
    phase1Label: "Phase 1: Beachhead",
    phase1Detail: "The landing line is ashore. Hold the sand while the first inland push forms.",
    phase1Announcement: "Gela: beachhead established. Prepare for the armored counterattack.",
    phase2Label: "Phase 2: Counterattack",
    phase2Detail: "German armor is pressing the highway. Break the attack and keep moving inland.",
    phase2Announcement: "Gela escalation: German armor is moving on the beachhead.",
    phase3Label: "Phase 3: Inland Breakout",
    phase3Detail: "The beachhead has room to breathe. Secure the airfield and highway before the window closes.",
    phase3Announcement: "Gela final phase: drive inland and seal the beachhead.",
    victoryReason: "Gela, Ponte Olivo, and Highway 115 are secured.",
    timerDefeatReason: "The Gela beachhead was not expanded before the assault window closed.",
    eliminationDefeatReason: "All friendly beachhead forces were destroyed."
  },
  assault_anzio_beachhead: {
    victoryMode: "hold",
    primaryId: "primary_hold_anzio_beachhead",
    primaryLabel: "Hold Anzio port and enough beachhead objectives",
    objectiveLabels: ["Anzio Port", "Beachhead Perimeter", "Alban Hills Road", "Campoleone Station"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    requiredPrimaryCount: 3,
    mandatoryObjectiveIndexes: [0],
    instantDefeatObjectiveIndexes: [0],
    secondary: {
      kind: "protectObjectives",
      id: "secondary_preserve_perimeter",
      label: "Keep the perimeter and Campoleone line in friendly hands",
      indexes: [1, 3],
      requiredCount: 2
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_beachhead_force",
      label: "Keep at least seven friendly formations operational",
      minCount: 7
    },
    phase1Label: "Phase 1: Beachhead Shelling",
    phase1Detail: "The lodgment is shallow. Keep the port secure and site guns before the hill attack forms.",
    phase1Announcement: "Anzio: the beachhead is under pressure from the Alban Hills.",
    phase2Label: "Phase 2: Counterattack",
    phase2Detail: "Enemy armor is driving for the port roads. Hold the perimeter and counterpunch at Campoleone.",
    phase2Announcement: "Anzio escalation: German armor is entering the beachhead perimeter.",
    phase3Label: "Phase 3: Final Hold",
    phase3Detail: "The defense window is closing. Keep Anzio port and enough inland ground in friendly hands.",
    phase3Announcement: "Anzio final phase: hold the port and perimeter.",
    victoryReason: "Anzio port held and the beachhead remains viable.",
    timerDefeatReason: "The Anzio beachhead failed its final hold check.",
    eliminationDefeatReason: "All friendly Anzio defenders were destroyed."
  },
  assault_monte_cassino: {
    victoryMode: "capture",
    primaryId: "primary_open_route_six",
    primaryLabel: "Capture Cassino, the Rapido crossing, monastery heights, and Route 6",
    objectiveLabels: ["Cassino Town", "Rapido Crossing", "Monastery Heights", "Route 6"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_silence_cassino_guns",
      label: "Destroy enemy guns on the heights and approaches",
      targetTypes: ["Flak_88", "Howitzer_105", "AT_Gun_50mm"]
    },
    tertiary: {
      kind: "unitTypeAlive",
      id: "tertiary_keep_crossing_engineers",
      label: "Keep an engineer formation operational",
      unitTypes: ["Engineer"],
      minCount: 1
    },
    phase1Label: "Phase 1: Rapido Line",
    phase1Detail: "The river crossing is under fire from town and heights. Suppress before the engineers move.",
    phase1Announcement: "Monte Cassino: the Rapido line is under observation.",
    phase2Label: "Phase 2: Town Fight",
    phase2Detail: "Cassino is shattered but defended. Clear blocks before armor moves onto Route 6.",
    phase2Announcement: "Monte Cassino escalation: the fight has entered the town.",
    phase3Label: "Phase 3: Heights Assault",
    phase3Detail: "Route 6 will not open until the monastery heights are cleared.",
    phase3Announcement: "Monte Cassino final phase: take the heights and open Route 6.",
    victoryReason: "Cassino is cleared and Route 6 is open.",
    timerDefeatReason: "Route 6 remained closed when the assault window ended.",
    eliminationDefeatReason: "All friendly Monte Cassino assault forces were destroyed."
  },
  assault_omaha_beach: {
    victoryMode: "capture",
    primaryId: "primary_open_omaha_exits",
    primaryLabel: "Open every Omaha beach exit and seize the ridge",
    objectiveLabels: ["Vierville Draw", "D-1 Exit", "Colleville Ridge", "Battery Control"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_silence_beach_guns",
      label: "Destroy enemy artillery and flak covering the beach",
      targetTypes: ["Howitzer_105", "Flak_88"]
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_assault_waves",
      label: "Keep at least four assault formations operational",
      minCount: 4
    },
    phase1Label: "Phase 1: Beach Under Fire",
    phase1Detail: "Assault waves are exposed below the bluffs. Clear lanes and get engineers to the draws.",
    phase1Announcement: "Omaha Beach: assault waves are under the guns.",
    phase2Label: "Phase 2: Draw Fight",
    phase2Detail: "The draws are contested. Push infantry through any breach before the defenders reset.",
    phase2Announcement: "Omaha Beach escalation: the draw fight is fully joined.",
    phase3Label: "Phase 3: Ridge Push",
    phase3Detail: "The beach exits are opening. Seize the ridge controls and silence the remaining guns.",
    phase3Announcement: "Omaha Beach final phase: get off the beach and secure the ridge.",
    victoryReason: "Omaha beach exits are open for follow-on forces.",
    timerDefeatReason: "The assault stalled before the exits could be opened.",
    eliminationDefeatReason: "All friendly assault waves were destroyed."
  },
  assault_carentan: {
    victoryMode: "capture",
    primaryId: "primary_link_beachheads",
    primaryLabel: "Capture the causeway, Carentan, and rail station",
    objectiveLabels: ["Northern Causeway", "Carentan Town Center", "Rail Station", "Douve Bridgehead"],
    primaryObjectiveIndexes: [0, 1, 2],
    secondary: {
      kind: "protectObjectives",
      id: "secondary_hold_douve_bridgehead",
      label: "Keep the Douve bridgehead secure",
      indexes: [3],
      requiredCount: 1
    },
    tertiary: {
      kind: "destroyTypes",
      id: "tertiary_destroy_town_guns",
      label: "Destroy enemy assault guns and anti-tank guns",
      targetTypes: ["Assault_Gun", "AT_Gun_50mm"]
    },
    phase1Label: "Phase 1: Causeway",
    phase1Detail: "The approach is narrow and exposed. Keep engineers close to the bridgehead.",
    phase1Announcement: "Carentan: advance along the causeway and keep the bridgehead open.",
    phase2Label: "Phase 2: Town Fight",
    phase2Detail: "The town is engaged. Infantry must clear blocks before armor can move freely.",
    phase2Announcement: "Carentan escalation: the fight has moved into the town.",
    phase3Label: "Phase 3: Corridor Link",
    phase3Detail: "The beachhead corridor is within reach. Secure the station and prevent a counterattack.",
    phase3Announcement: "Carentan final phase: link the beachheads through the town.",
    victoryReason: "Carentan is secured and the beachheads are linked.",
    timerDefeatReason: "The corridor remained broken when the operation window closed.",
    eliminationDefeatReason: "All friendly Carentan assault forces were destroyed."
  },
  assault_arnhem_bridge: {
    victoryMode: "hold",
    primaryId: "primary_hold_arnhem_bridge",
    primaryLabel: "Hold Arnhem Bridge and enough airborne objectives",
    objectiveLabels: ["Arnhem Bridge", "Oosterbeek Perimeter", "Drop Zone Y", "Southern Relief Road"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    requiredPrimaryCount: 3,
    mandatoryObjectiveIndexes: [0],
    instantDefeatObjectiveIndexes: [0],
    secondary: {
      kind: "protectObjectives",
      id: "secondary_preserve_airborne_line",
      label: "Keep Oosterbeek perimeter and Drop Zone Y in friendly hands",
      indexes: [1, 2],
      requiredCount: 2
    },
    tertiary: {
      kind: "unitTypeAlive",
      id: "tertiary_preserve_airborne_companies",
      label: "Keep at least four airborne or engineer formations operational",
      unitTypes: ["Paratrooper", "Engineer"],
      minCount: 4
    },
    phase1Label: "Phase 1: Bridge Seizure",
    phase1Detail: "The bridge party is isolated. Keep the crossing held while the perimeter consolidates.",
    phase1Announcement: "Arnhem: airborne forces hold the bridge. Prepare for armor from the south.",
    phase2Label: "Phase 2: Perimeter Pressure",
    phase2Detail: "Enemy armor is closing. Hold Oosterbeek and keep the drop zone open.",
    phase2Announcement: "Arnhem escalation: the airborne perimeter is under heavy pressure.",
    phase3Label: "Phase 3: Relief Window",
    phase3Detail: "Relief is still fighting up the road. The bridge must stay in friendly hands.",
    phase3Announcement: "Arnhem final phase: hold the bridge until relief can break through.",
    victoryReason: "Arnhem Bridge held long enough for the relief corridor to remain possible.",
    timerDefeatReason: "Arnhem Bridge or the airborne line failed before relief could arrive.",
    eliminationDefeatReason: "All friendly Arnhem airborne forces were destroyed."
  },
  assault_falaise_pocket: {
    victoryMode: "capture",
    primaryId: "primary_close_falaise_pocket",
    primaryLabel: "Close the Falaise pocket at every control point",
    objectiveLabels: ["Chambois", "Trun", "Argentan Road", "Escape Gap"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_destroy_trapped_armor",
      label: "Destroy enemy armor trapped inside the pocket",
      targetTypes: ["Panzer_IV", "Heavy_Tank", "Assault_Gun", "Tank_Destroyer"]
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_pincer_force",
      label: "Keep at least seven friendly formations operational",
      minCount: 7
    },
    phase1Label: "Phase 1: Jaw Movement",
    phase1Detail: "Both Allied pincers are moving. Keep pressure on Trun and Argentan Road.",
    phase1Announcement: "Falaise: the pocket is forming. Close both jaws.",
    phase2Label: "Phase 2: Pocket Compression",
    phase2Detail: "The trapped force is bunching on the roads. Block Chambois before the armor escapes.",
    phase2Announcement: "Falaise escalation: enemy columns are pushing for the eastern gap.",
    phase3Label: "Phase 3: Escape Gap",
    phase3Detail: "The pocket is nearly closed. Seal the escape gap and destroy remaining armor.",
    phase3Announcement: "Falaise final phase: close the last exit.",
    victoryReason: "The Falaise pocket is closed and the escape route is cut.",
    timerDefeatReason: "Enemy forces kept the Falaise escape route open.",
    eliminationDefeatReason: "All friendly Falaise pincer forces were destroyed."
  },
  assault_hurtgen_forest: {
    victoryMode: "capture",
    primaryId: "primary_clear_hurtgen_forest",
    primaryLabel: "Capture Huertgen village, Kall Trail, Hill 400, and Roer Dam road",
    objectiveLabels: ["Huertgen Village", "Kall Trail", "Hill 400", "Roer Dam Road"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_silence_forest_guns",
      label: "Destroy enemy guns and armor covering the forest roads",
      targetTypes: ["Flak_88", "Howitzer_105", "AT_Gun_50mm", "Assault_Gun", "Panzer_IV", "Heavy_Tank"]
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_forest_force",
      label: "Keep at least six friendly formations operational",
      minCount: 6
    },
    phase1Label: "Phase 1: Tree Line",
    phase1Detail: "The forest hides the main defense. Advance in bounds and keep guns close to the road.",
    phase1Announcement: "Hurtgen Forest: contact at the tree line.",
    phase2Label: "Phase 2: Kall Trail",
    phase2Detail: "The trail network is contested. Engineers must keep the route open for armor and supply.",
    phase2Announcement: "Hurtgen Forest escalation: fighting has reached the Kall Trail.",
    phase3Label: "Phase 3: Ridge And Dam Road",
    phase3Detail: "Hill 400 and the Roer road are the decisive ground. Clear them before attrition stalls the assault.",
    phase3Announcement: "Hurtgen Forest final phase: take the ridge and dam road.",
    victoryReason: "The Hurtgen objectives are cleared and the Roer approach is open.",
    timerDefeatReason: "The forest line held until the operation window closed.",
    eliminationDefeatReason: "All friendly Hurtgen assault forces were destroyed."
  },
  assault_bastogne: {
    victoryMode: "hold",
    primaryId: "primary_hold_bastogne",
    primaryLabel: "Hold Bastogne until relief arrives",
    objectiveLabels: ["Bastogne Center", "Neffe Road", "Mardasson Ridge", "Southern Relief Road"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    requiredPrimaryCount: 3,
    mandatoryObjectiveIndexes: [0],
    instantDefeatObjectiveIndexes: [0],
    secondary: {
      kind: "protectObjectives",
      id: "secondary_preserve_road_net",
      label: "Keep at least two road junctions in friendly hands",
      indexes: [1, 2, 3],
      requiredCount: 2
    },
    tertiary: {
      kind: "surviveCount",
      id: "tertiary_preserve_garrison",
      label: "Keep at least seven friendly formations operational",
      minCount: 7
    },
    phase1Label: "Phase 1: Encirclement",
    phase1Detail: "German probes are testing the outer roads. Keep the town center supplied.",
    phase1Announcement: "Bastogne: the perimeter is surrounded. Hold the road hub.",
    phase2Label: "Phase 2: Panzer Pressure",
    phase2Detail: "Armored attacks are converging on the roads. Shift reserves through the town center.",
    phase2Announcement: "Bastogne escalation: German armor is pressing the perimeter.",
    phase3Label: "Phase 3: Relief Window",
    phase3Detail: "Relief is approaching. Hold Bastogne and enough roads until the line reconnects.",
    phase3Announcement: "Bastogne final phase: relief is near. Hold the center.",
    victoryReason: "Bastogne held until relief reached the perimeter.",
    timerDefeatReason: "Bastogne failed the relief hold check.",
    eliminationDefeatReason: "All friendly Bastogne defenders were destroyed."
  },
  assault_remagen: {
    victoryMode: "capture",
    primaryId: "primary_secure_rhine_bridgehead",
    primaryLabel: "Capture the bridge, tunnel, ridge, and engineer park",
    objectiveLabels: ["Ludendorff Bridge", "East-Bank Tunnel", "Erpeler Ley Ridge", "Engineer Park"],
    primaryObjectiveIndexes: [0, 1, 2, 3],
    secondary: {
      kind: "destroyTypes",
      id: "secondary_silence_demolition_support",
      label: "Destroy enemy engineers, flak, and artillery",
      targetTypes: ["Engineer", "Flak_88", "Howitzer_105"]
    },
    tertiary: {
      kind: "unitTypeAlive",
      id: "tertiary_keep_engineers",
      label: "Keep an engineer formation operational",
      unitTypes: ["Engineer"],
      minCount: 1
    },
    phase1Label: "Phase 1: Bridge Rush",
    phase1Detail: "The bridge is still standing. Move fast before demolition and ridge fire seal it.",
    phase1Announcement: "Remagen: rush the Ludendorff Bridge before the enemy can close the crossing.",
    phase2Label: "Phase 2: East Bank",
    phase2Detail: "The crossing fight is open. Clear the tunnel and engineer park while armor holds the bridge.",
    phase2Announcement: "Remagen escalation: east-bank fighting has begun.",
    phase3Label: "Phase 3: Bridgehead Expansion",
    phase3Detail: "The bridgehead must expand beyond the river road. Secure the ridge before counterattack.",
    phase3Announcement: "Remagen final phase: expand the Rhine bridgehead.",
    victoryReason: "The Rhine bridgehead is secure and expanding.",
    timerDefeatReason: "The bridgehead was not secured before the crossing window closed.",
    eliminationDefeatReason: "All friendly Remagen assault forces were destroyed."
  }
};

function createHistoricalBattlePhase(config: HistoricalBattleConfig, turnNumber: number, primaryFriendlyCount: number, turnLimit: number | null): MissionPhaseStatus {
  const limit = turnLimit ?? 18;
  const phase2Turn = Math.max(4, Math.floor(limit * 0.33));
  const phase3Turn = Math.max(8, Math.floor(limit * 0.66));
  const required = config.requiredPrimaryCount ?? config.primaryObjectiveIndexes.length;

  if (turnNumber >= phase3Turn || primaryFriendlyCount >= required) {
    return {
      id: "phase3_escalation",
      label: config.phase3Label,
      detail: config.phase3Detail,
      announcement: config.phase3Announcement
    };
  }

  if (turnNumber >= phase2Turn || primaryFriendlyCount > 0) {
    return {
      id: "phase2_commitment",
      label: config.phase2Label,
      detail: config.phase2Detail,
      announcement: config.phase2Announcement
    };
  }

  return {
    id: "phase1_probe",
    label: config.phase1Label,
    detail: config.phase1Detail,
    announcement: config.phase1Announcement
  };
}

function createHistoricalBattleController(scenario: ScenarioData, config: HistoricalBattleConfig): MissionRulesController {
  const objectivePoints = (scenario.objectives ?? []).map((objective, index) => {
    const hex = normalizeObjectiveHex(objective.hex);
    return {
      index,
      key: makeKey(hex),
      label: config.objectiveLabels[index] ?? `Objective ${index + 1}`,
      hex
    };
  });
  const primaryIndexes = new Set(config.primaryObjectiveIndexes);
  const mandatoryIndexes = new Set(config.mandatoryObjectiveIndexes ?? []);
  const instantDefeatIndexes = new Set(config.instantDefeatObjectiveIndexes ?? []);

  let currentOutcome: MissionOutcome = { state: "inProgress" };
  let currentPhase = createHistoricalBattlePhase(config, 0, 0, scenario.turnLimit ?? null);

  const isObjectiveFriendly = (occupancy: ReadonlyMap<string, TurnFaction>, index: number): boolean => {
    const point = objectivePoints.find((objective) => objective.index === index);
    return point ? isFriendlyOccupant(occupancy.get(point.key)) : false;
  };

  const countFriendlyObjectives = (occupancy: ReadonlyMap<string, TurnFaction>, indexes: readonly number[]): number =>
    indexes.filter((index) => isObjectiveFriendly(occupancy, index)).length;

  const buildSecondary = (
    outcome: MissionOutcome,
    occupancy: ReadonlyMap<string, TurnFaction>,
    botUnits: readonly ScenarioUnit[]
  ): ObjectiveProgress => {
    const rule = config.secondary;
    if (rule.kind === "destroyTypes") {
      const remaining = botUnits.filter((unit) => rule.targetTypes.includes(unit.type)).length;
      return {
        id: rule.id,
        label: rule.label,
        tier: "secondary",
        state: remaining === 0
          ? "completed"
          : outcome.state === "inProgress"
            ? "inProgress"
            : "failed",
        detail: remaining === 0
          ? "Target formations are out of action."
          : `${remaining} target formation${remaining === 1 ? "" : "s"} remain operational.`
      };
    }

    const held = countFriendlyObjectives(occupancy, rule.indexes);
    const targetMet = held >= rule.requiredCount;
    return {
      id: rule.id,
      label: rule.label,
      tier: "secondary",
      state: targetMet
        ? outcome.state === "inProgress"
          ? "inProgress"
          : "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: `${held}/${rule.requiredCount} protected objective${rule.requiredCount === 1 ? "" : "s"} held.`
    };
  };

  const buildTertiary = (
    outcome: MissionOutcome,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[]
  ): ObjectiveProgress | null => {
    const rule = config.tertiary;
    if (!rule) {
      return null;
    }

    if (rule.kind === "destroyTypes") {
      const remaining = botUnits.filter((unit) => rule.targetTypes.includes(unit.type)).length;
      return {
        id: rule.id,
        label: rule.label,
        tier: "tertiary",
        state: remaining === 0
          ? "completed"
          : outcome.state === "inProgress"
            ? "inProgress"
            : "failed",
        detail: remaining === 0
          ? "Target formations are out of action."
          : `${remaining} target formation${remaining === 1 ? "" : "s"} began the battle as priority targets.`
      };
    }

    if (rule.kind === "surviveCount") {
      const survives = playerUnits.length >= rule.minCount;
      return {
        id: rule.id,
        label: rule.label,
        tier: "tertiary",
        state: survives
          ? outcome.state === "inProgress"
            ? "inProgress"
            : "completed"
          : "failed",
        detail: `${playerUnits.length}/${rule.minCount} friendly formation${rule.minCount === 1 ? "" : "s"} operational.`
      };
    }

    const alive = playerUnits.filter((unit) => rule.unitTypes.includes(unit.type)).length;
    const targetMet = alive >= rule.minCount;
    return {
      id: rule.id,
      label: rule.label,
      tier: "tertiary",
      state: targetMet
        ? outcome.state === "inProgress"
          ? "inProgress"
          : "completed"
        : "failed",
      detail: `${alive}/${rule.minCount} required formation${rule.minCount === 1 ? "" : "s"} operational.`
    };
  };

  const buildObjectives = (
    outcome: MissionOutcome,
    occupancy: ReadonlyMap<string, TurnFaction>,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[]
  ): readonly ObjectiveProgress[] => {
    const primaryFriendlyCount = countFriendlyObjectives(occupancy, config.primaryObjectiveIndexes);
    const required = config.requiredPrimaryCount ?? config.primaryObjectiveIndexes.length;
    const mandatoryHeld = Array.from(mandatoryIndexes).every((index) => isObjectiveFriendly(occupancy, index));
    const primaryComplete = config.victoryMode === "capture"
      ? primaryFriendlyCount >= required && mandatoryHeld
      : outcome.state === "playerVictory";

    const primary: ObjectiveProgress = {
      id: config.primaryId,
      label: config.primaryLabel,
      tier: "primary",
      state: primaryComplete || outcome.state === "playerVictory"
        ? "completed"
        : outcome.state === "playerDefeat"
          ? "failed"
          : "inProgress",
      detail: `${primaryFriendlyCount}/${required} required objective${required === 1 ? "" : "s"} friendly-held. ${objectivePoints
        .filter((objective) => primaryIndexes.has(objective.index))
        .map(({ index, label }) => `${isObjectiveFriendly(occupancy, index) ? "[X]" : "[ ]"} ${label}`)
        .join(", ")}`
    };

    const objectives: ObjectiveProgress[] = [primary, buildSecondary(outcome, occupancy, botUnits)];
    const tertiary = buildTertiary(outcome, playerUnits, botUnits);
    if (tertiary) {
      objectives.push(tertiary);
    }
    return objectives;
  };

  const buildMarkers = (occupancy: ReadonlyMap<string, TurnFaction>): readonly ObjectiveMarkerProgress[] =>
    objectivePoints.map(({ key, label, hex }) => {
      const occupant = occupancy.get(key);
      const status = isFriendlyOccupant(occupant) ? "player" : occupant === "Bot" ? "enemy" : "unoccupied";
      return {
        hex,
        status,
        tooltip: `${label} - ${status === "player" ? "friendly-held" : status === "enemy" ? "enemy-held" : "unoccupied"}.`
      } satisfies ObjectiveMarkerProgress;
    });

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;
    const primaryFriendlyCount = countFriendlyObjectives(occupancy, config.primaryObjectiveIndexes);
    const required = config.requiredPrimaryCount ?? config.primaryObjectiveIndexes.length;
    const mandatoryHeld = Array.from(mandatoryIndexes).every((index) => isObjectiveFriendly(occupancy, index));
    currentPhase = createHistoricalBattlePhase(config, turnSummary.turnNumber, primaryFriendlyCount, turnLimit);

    let outcome: MissionOutcome = currentOutcome;

    if (outcome.state === "inProgress") {
      if (botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "All enemy forces eliminated." };
      } else if (playerUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: config.eliminationDefeatReason };
      }
    }

    if (outcome.state === "inProgress" && config.victoryMode === "hold") {
      const instantLoss = Array.from(instantDefeatIndexes).some((index) => {
        const point = objectivePoints.find((objective) => objective.index === index);
        return point ? occupancy.get(point.key) === "Bot" : false;
      });
      if (instantLoss) {
        outcome = { state: "playerDefeat", reason: config.timerDefeatReason };
      } else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
        outcome = primaryFriendlyCount >= required && mandatoryHeld
          ? { state: "playerVictory", reason: config.victoryReason }
          : { state: "playerDefeat", reason: config.timerDefeatReason };
      }
    }

    if (outcome.state === "inProgress" && config.victoryMode === "capture") {
      if (primaryFriendlyCount >= required && mandatoryHeld) {
        outcome = { state: "playerVictory", reason: config.victoryReason };
      } else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
        outcome = { state: "playerDefeat", reason: config.timerDefeatReason };
      }
    }

    currentOutcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, occupancy, playerUnits, botUnits),
      outcome,
      phase: currentPhase,
      markers: buildMarkers(occupancy)
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      const emptyOccupancy = new Map<string, TurnFaction>();
      return {
        turn: 0,
        objectives: buildObjectives(currentOutcome, emptyOccupancy, scenario.sides.Player.units, scenario.sides.Bot.units),
        outcome: currentOutcome,
        phase: currentPhase,
        markers: buildMarkers(emptyOccupancy)
      };
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "historicalBattle",
        data: {
          outcome: structuredClone(currentOutcome),
          phase: structuredClone(currentPhase)
        }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "historicalBattle");
      currentOutcome = structuredClone(data.outcome as MissionOutcome);
      currentPhase = structuredClone(data.phase as MissionPhaseStatus);
    }
  } satisfies MissionRulesController;
}

function createCitadelRidgeController(scenario: ScenarioData, difficulty: BotDifficulty): MissionRulesController {
  const strongpointKeys = [
    { key: makeKey({ q: 16, r: 4 - Math.floor(16 / 2) }), label: "North Battery", vp: 120 },
    { key: makeKey({ q: 16, r: 8 - Math.floor(16 / 2) }), label: "Central Citadel", vp: 180 },
    { key: makeKey({ q: 16, r: 12 - Math.floor(16 / 2) }), label: "South Battery", vp: 120 },
    { key: makeKey({ q: 20, r: 8 - Math.floor(20 / 2) }), label: "Command Ridge", vp: 220, mandatory: true }
  ];

  let currentOutcome: MissionOutcome = { state: "inProgress" };

  const buildObjectives = (
    outcome: MissionOutcome,
    playerUnits: readonly ScenarioUnit[],
    botUnits: readonly ScenarioUnit[],
    occupancy: ReadonlyMap<string, TurnFaction>
  ): readonly ObjectiveProgress[] => {
    const capturedStrongpoints = strongpointKeys.filter(({ key }) => {
      const occupant = occupancy.get(key);
      return occupant === "Player" || occupant === "Ally";
    });
    const commandRidgeCaptured = strongpointKeys
      .find((sp) => sp.mandatory)
      ?.key && (occupancy.get(strongpointKeys.find((sp) => sp.mandatory)!.key) === "Player"
                || occupancy.get(strongpointKeys.find((sp) => sp.mandatory)!.key) === "Ally");

    const primary: ObjectiveProgress = {
      id: "primary_break_ridge",
      label: "Seize the command ridge and at least three strongpoints",
      tier: "primary",
      state: outcome.state === "playerVictory" && commandRidgeCaptured && capturedStrongpoints.length >= 3
        ? "completed"
        : outcome.state === "playerDefeat"
          ? "failed"
          : "inProgress",
      detail: `Captured: ${capturedStrongpoints.length}/4 strongpoints${commandRidgeCaptured ? " (Command Ridge secured)" : " (Command Ridge required)"}. ${strongpointKeys
        .map(({ label, key }) => {
          const occupant = occupancy.get(key);
          const status = occupant === "Player" || occupant === "Ally" ? "[X]" : "[ ]";
          return `${status} ${label}`;
        })
        .join(", ")}`
    };

    const flakDestroyed = botUnits.filter((unit) => unit.type === "Flak_88").length === 0;
    const secondary: ObjectiveProgress = {
      id: "secondary_destroy_flak",
      label: "Destroy both flak batteries",
      tier: "secondary",
      state: flakDestroyed
        ? "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: flakDestroyed
        ? "Both flak batteries eliminated."
        : `${botUnits.filter((unit) => unit.type === "Flak_88").length} flak batteries remain operational.`
    };

    const bunkersDestroyed = botUnits.filter((unit) => unit.type === "Assault_Gun").length === 0;
    const tertiary: ObjectiveProgress = {
      id: "tertiary_silence_bunkers",
      label: "Silence the bunker guns",
      tier: "tertiary",
      state: bunkersDestroyed
        ? "completed"
        : outcome.state === "inProgress"
          ? "inProgress"
          : "failed",
      detail: bunkersDestroyed
        ? "All assault gun strongpoints silenced."
        : `${botUnits.filter((unit) => unit.type === "Assault_Gun").length} bunker guns remain operational.`
    };

    return [primary, secondary, tertiary] satisfies readonly ObjectiveProgress[];
  };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;

    let outcome: MissionOutcome = currentOutcome;

    // Check for unit elimination conditions
    if (outcome.state === "inProgress") {
      if (botUnits.length === 0) {
        outcome = { state: "playerVictory", reason: "All enemy forces eliminated." };
      } else if (playerUnits.length === 0) {
        outcome = { state: "playerDefeat", reason: "All friendly forces eliminated." };
      }
    }

    // Check strongpoint capture victory
    const capturedStrongpoints = strongpointKeys.filter(({ key }) => {
      const occupant = occupancy.get(key);
      return occupant === "Player" || occupant === "Ally";
    });
    const commandRidgeKey = strongpointKeys.find((sp) => sp.mandatory)?.key;
    const commandRidgeCaptured = commandRidgeKey && (occupancy.get(commandRidgeKey) === "Player" || occupancy.get(commandRidgeKey) === "Ally");

    if (outcome.state === "inProgress" && commandRidgeCaptured && capturedStrongpoints.length >= 3) {
      outcome = { state: "playerVictory", reason: "Command ridge and sufficient strongpoints secured." };
    }

    // Check turn limit defeat
    if (turnLimit !== null && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
      outcome = { state: "playerDefeat", reason: "Turn limit expired before securing objectives." };
    }

    currentOutcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, playerUnits, botUnits, occupancy),
      outcome
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      const emptyOccupancy = new Map<string, TurnFaction>();
      return {
        turn: 0,
        objectives: buildObjectives(currentOutcome, scenario.sides.Player.units, scenario.sides.Bot.units, emptyOccupancy),
        outcome: currentOutcome
      };
    },
    serializeState(): SerializedMissionRulesState {
      return {
        version: 1,
        kind: "citadelRidge",
        data: { outcome: structuredClone(currentOutcome) }
      };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      const data = readMissionRuleState(snapshot, "citadelRidge");
      currentOutcome = structuredClone(data.outcome as MissionOutcome);
    }
  } satisfies MissionRulesController;
}

export function createMissionRulesController(missionKey: string, scenario: ScenarioData, difficulty: BotDifficulty = "Normal"): MissionRulesController {
  if (missionKey === "patrol") {
    return createTownDefenseController(scenario);
  }
  if (missionKey === "patrol_river_watch") {
    return createRiverWatchController(scenario, difficulty);
  }
  if (missionKey === "patrol_pointe_du_hoc") {
    return createPointeDuHocController(scenario, difficulty);
  }
  if (missionKey === "assault") {
    return createTwoBridgesController(scenario, difficulty);
  }
  const historicalConfig = historicalBattleConfigs[missionKey];
  if (historicalConfig) {
    return createHistoricalBattleController(scenario, historicalConfig);
  }
  if (missionKey === "assault_citadel_ridge") {
    return createCitadelRidgeController(scenario, difficulty);
  }

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return {
        turn: snapshot.turnSummary.turnNumber,
        objectives: [],
        outcome: { state: "inProgress" }
      } satisfies MissionStatus;
    },
    getStatus(): MissionStatus {
      return { turn: 0, objectives: [], outcome: { state: "inProgress" } } satisfies MissionStatus;
    },
    serializeState(): SerializedMissionRulesState {
      return { version: 1, kind: "generic", data: {} };
    },
    hydrateState(snapshot: SerializedMissionRulesState): void {
      readMissionRuleState(snapshot, "generic");
    }
  } satisfies MissionRulesController;
}
