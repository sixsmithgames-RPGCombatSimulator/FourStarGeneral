import type { Axial } from "../core/Hex";
import type { ScenarioData, ScenarioUnit } from "../core/types";
import type { TurnSummary, TurnFaction } from "../game/GameEngine";
import type { BotDifficulty } from "../game/bot/BotPlanner";

export type ObjectiveTier = "primary" | "secondary" | "tertiary";

export type ObjectiveState = "pending" | "inProgress" | "completed" | "failed";

export interface ObjectiveProgress {
  readonly id: string;
  readonly label: string;
  readonly tier: ObjectiveTier;
  readonly state: ObjectiveState;
  readonly detail?: string;
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
}

export interface MissionSnapshot {
  readonly turnSummary: TurnSummary;
  readonly scenario: ScenarioData;
  readonly occupancy: ReadonlyMap<string, TurnFaction>;
  readonly playerUnits: readonly ScenarioUnit[];
  readonly botUnits: readonly ScenarioUnit[];
}

export interface MissionRulesController {
  onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus;
  getStatus(): MissionStatus;
}

function makeKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

interface FordTracker {
  readonly counters: Map<string, number>;
  outcome: MissionOutcome;
  blockedFordsStreak: number;
  phase: MissionPhaseStatus;
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
    label: `Ford ${index + 1}`
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
      label: "Deny enemy control of any ford for 8 consecutive turns",
      tier: "primary",
      state: outcome.state === "playerDefeat" ? "failed" : outcome.state === "playerVictory" ? "completed" : "inProgress",
      detail: fordKeys
        .map(({ key, label }) => {
          const count = tracker.counters.get(key) ?? 0;
          return `${label}: Bot hold ${count}/8 turns`;
        })
        .join("; ")
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

    if (turnLimit !== null && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
      outcome = { state: "playerVictory", reason: "Held river line through the final turn." };
    }

    tracker.outcome = outcome;

    return {
      turn: turnSummary.turnNumber,
      objectives: buildObjectives(outcome, playerUnits, botUnits),
      outcome,
      phase: tracker.phase
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
        phase: tracker.phase
      };
    }
  } satisfies MissionRulesController;
}

export function createMissionRulesController(missionKey: string, scenario: ScenarioData, difficulty: BotDifficulty = "Normal"): MissionRulesController {
  if (missionKey === "patrol_river_watch") {
    return createRiverWatchController(scenario, difficulty);
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
    }
  } satisfies MissionRulesController;
}
