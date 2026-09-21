import type { BattleSidebarEngine } from "../contracts/BattleSidebarEngine";
import type { Axial, ScenarioUnit } from "../core/types";
import type { GameEngine, LogisticsSnapshot, SupplySnapshot, TurnFaction } from "../game/GameEngine";

type SidebarAirMissionRequest = Parameters<BattleSidebarEngine["tryScheduleAirMission"]>[0];
type SidebarSupplyPriority = Parameters<BattleSidebarEngine["setSupplyPriority"]>[1];

/**
 * State-owned adapter for battle sidebar capabilities. Read models are detached
 * from the mutable engine while commands preserve the engine's exact behavior.
 */
class StateOwnedBattleSidebarEngine implements BattleSidebarEngine {
  constructor(private readonly resolveEngine: () => GameEngine) {}

  get phase(): BattleSidebarEngine["phase"] {
    return this.resolveEngine().phase;
  }

  get activeFaction(): TurnFaction {
    return this.resolveEngine().activeFaction;
  }

  get playerUnits(): readonly ScenarioUnit[] {
    return structuredClone(this.resolveEngine().playerUnits);
  }

  get botUnits(): readonly ScenarioUnit[] {
    return structuredClone(this.resolveEngine().botUnits);
  }

  get reserveUnits(): BattleSidebarEngine["reserveUnits"] {
    return structuredClone(this.resolveEngine().reserveUnits);
  }

  getSupplySnapshot(faction?: TurnFaction): SupplySnapshot {
    return structuredClone(this.resolveEngine().getSupplySnapshot(faction));
  }

  getBattleRequisitionSnapshot(): ReturnType<BattleSidebarEngine["getBattleRequisitionSnapshot"]> {
    return structuredClone(this.resolveEngine().getBattleRequisitionSnapshot());
  }

  getPlayerReconReports(): ReturnType<BattleSidebarEngine["getPlayerReconReports"]> {
    return structuredClone(this.resolveEngine().getPlayerReconReports());
  }

  getReconIntelSnapshot(): ReturnType<BattleSidebarEngine["getReconIntelSnapshot"]> {
    return structuredClone(this.resolveEngine().getReconIntelSnapshot());
  }

  deployCounterIntel(targetHex: Axial): ReturnType<BattleSidebarEngine["deployCounterIntel"]> {
    return structuredClone(this.resolveEngine().deployCounterIntel(targetHex));
  }

  verifyIntelBrief(briefId: string): ReturnType<BattleSidebarEngine["verifyIntelBrief"]> {
    return structuredClone(this.resolveEngine().verifyIntelBrief(briefId));
  }

  listAirMissionTemplates(): ReturnType<BattleSidebarEngine["listAirMissionTemplates"]> {
    return structuredClone(this.resolveEngine().listAirMissionTemplates());
  }

  getScheduledAirMissions(faction?: TurnFaction): ReturnType<BattleSidebarEngine["getScheduledAirMissions"]> {
    return structuredClone(this.resolveEngine().getScheduledAirMissions(faction));
  }

  tryScheduleAirMission(request: SidebarAirMissionRequest): ReturnType<BattleSidebarEngine["tryScheduleAirMission"]> {
    return structuredClone(this.resolveEngine().tryScheduleAirMission(request));
  }

  getAirSupportSummary(): ReturnType<BattleSidebarEngine["getAirSupportSummary"]> {
    return structuredClone(this.resolveEngine().getAirSupportSummary());
  }

  getAircraftCombatRadiusHex(origin: Axial, unitId?: string | null): number | null {
    return this.resolveEngine().getAircraftCombatRadiusHex(origin, unitId);
  }

  getAircraftRefitTurns(origin: Axial, unitId?: string | null): number | null {
    return this.resolveEngine().getAircraftRefitTurns(origin, unitId);
  }

  cancelQueuedAirMission(missionId: string): boolean {
    return this.resolveEngine().cancelQueuedAirMission(missionId);
  }

  getCommanderBenefits(): ReturnType<BattleSidebarEngine["getCommanderBenefits"]> {
    return structuredClone(this.resolveEngine().getCommanderBenefits());
  }

  getLogisticsSnapshot(): LogisticsSnapshot {
    return structuredClone(this.resolveEngine().getLogisticsSnapshot());
  }

  setSupplyPriority(unitId: string, priority: SidebarSupplyPriority): boolean {
    return this.resolveEngine().setSupplyPriority(unitId, priority);
  }
}

/** Builds the stable sidebar boundary owned and retained by one BattleState instance. */
export function createBattleSidebarEngineFacade(resolveEngine: () => GameEngine): BattleSidebarEngine {
  return new StateOwnedBattleSidebarEngine(resolveEngine);
}
