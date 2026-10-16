import type { UnitActivation } from "../../core/InitiativeQueue";
import type { BotTurnSummary } from "../GameEngine";

/** Engine-owned bot action boundary shared with conventional turns. */
export interface BotActivationEngine {
  executeBotActivation(unitId: string): BotTurnSummary;
}

/** Initiative selects who acts; the engine remains the sole planner and action authority. */
export class InitiativeBotIntegration {
  constructor(private readonly gameEngine: BotActivationEngine) {}

  /** Execute exactly the stable formation ID selected by the initiative queue. */
  executeActivation(activation: UnitActivation): BotTurnSummary {
    if (activation.ownerId !== "bot") {
      throw new Error(`Cannot issue an enemy bot order for ${activation.ownerId} unit '${activation.unitId}'.`);
    }
    return this.gameEngine.executeBotActivation(activation.unitId);
  }
}
