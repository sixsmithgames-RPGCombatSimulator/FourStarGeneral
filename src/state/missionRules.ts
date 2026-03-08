import type { Axial } from "../core/Hex";
import type { ScenarioData, ScenarioUnit } from "../core/types";
import type { TurnSummary, TurnFaction } from "../game/GameEngine";

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

export interface MissionStatus {
  readonly turn: number;
  readonly objectives: readonly ObjectiveProgress[];
  readonly outcome: MissionOutcome;
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
}

function createRiverWatchController(scenario: ScenarioData): MissionRulesController {
  const fordKeys = (scenario.objectives ?? []).map((objective, index) => ({
    key: makeKey(objective.hex),
    label: `Ford ${index + 1}`
  }));

  const tracker: FordTracker = { counters: new Map<string, number>(), outcome: { state: "inProgress" } };

  const deriveStatus = (snapshot: MissionSnapshot): MissionStatus => {
    const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
    const turnLimit = snapScenario.turnLimit ?? null;

    let outcome: MissionOutcome = tracker.outcome;

    fordKeys.forEach(({ key }) => {
      const occupant = occupancy.get(key);
      const heldByBot = occupant === "Bot";
      const previous = tracker.counters.get(key) ?? 0;
      const next = heldByBot ? previous + 1 : 0;
      tracker.counters.set(key, next);
      if (heldByBot && next >= 4 && outcome.state === "inProgress") {
        outcome = { state: "playerDefeat", reason: "Enemy secured a ford for 4 turns." };
      }
    });

    if (turnLimit !== null && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
      outcome = { state: "playerVictory", reason: "Held river line through the final turn." };
    }

    tracker.outcome = outcome;

    const primary: ObjectiveProgress = {
      id: "primary_deny_fords",
      label: "Deny enemy control of any ford for 4 consecutive turns",
      tier: "primary",
      state: outcome.state === "playerDefeat" ? "failed" : outcome.state === "playerVictory" ? "completed" : "inProgress",
      detail: fordKeys
        .map(({ key, label }) => {
          const count = tracker.counters.get(key) ?? 0;
          return `${label}: Bot hold ${count}/4 turns`;
        })
        .join("; ")
    };

    const commsDestroyed = botUnits.every((unit) => unit.type !== "Recon_Bike");
    const secondary: ObjectiveProgress = {
      id: "secondary_destroy_comms",
      label: "Destroy the enemy comms team before it reaches the central ford",
      tier: "secondary",
      state: commsDestroyed ? "completed" : "inProgress"
    };

    const playerReconAlive = playerUnits.some((unit) => unit.type === "Recon_Bike");
    const tertiary: ObjectiveProgress = {
      id: "tertiary_keep_recon",
      label: "Keep at least one recon unit alive",
      tier: "tertiary",
      state: playerReconAlive ? "inProgress" : "failed"
    };

    return {
      turn: turnSummary.turnNumber,
      objectives: [primary, secondary, tertiary],
      outcome
    } satisfies MissionStatus;
  };

  return {
    onTurnAdvanced(snapshot: MissionSnapshot): MissionStatus {
      return deriveStatus(snapshot);
    },
    getStatus(): MissionStatus {
      return {
        turn: 0,
        objectives: [],
        outcome: tracker.outcome
      };
    }
  } satisfies MissionRulesController;
}

export function createMissionRulesController(missionKey: string, scenario: ScenarioData): MissionRulesController {
  if (missionKey === "patrol_river_watch") {
    return createRiverWatchController(scenario);
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
