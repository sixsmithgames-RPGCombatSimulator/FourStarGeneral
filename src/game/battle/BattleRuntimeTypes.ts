/**
 * Identifiers for the participant currently taking a turn.
 * Kept outside the mutable engine so deterministic projections can depend on the
 * battle vocabulary without importing the engine implementation.
 */
export type TurnFaction = "Player" | "Bot" | "Ally";

/** Lifecycle phases shared by battle orchestration and read-only projections. */
export type BattlePhase = "deployment" | "playerTurn" | "allyTurn" | "botTurn" | "completed";
