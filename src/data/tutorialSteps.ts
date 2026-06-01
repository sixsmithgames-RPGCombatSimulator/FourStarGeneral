/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides structured guidance for the training operation.
 */

import type { TutorialPhase, TutorialStep } from "../state/TutorialState";

export type { TutorialStep };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    phase: "welcome",
    title: "Field Command",
    content:
      "Enemy scouts are probing this sector. Build your force, set your base camp, and stop the patrol before it reaches the road.",
    position: "center",
    actionLabel: "Accept Command"
  },
  {
    phase: "budget_overview",
    title: "Requisition Order",
    content:
      "You have 1,200 RP. Use the Training preset for a ready force, or build it by hand to learn each category.",
    highlightSelector: "#precombatBudgetPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "unit_categories",
    title: "Build The Task Force",
    content:
      "This mission needs infantry, armor, engineers, recon, air defense, and logistics. Each category supports the line in a different way.",
    highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_infantry",
    title: "Form The Line",
    content:
      "Add three Infantry Battalions. They hold ground and anchor the front.",
    highlightSelector: "[data-key='infantry']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_tanks",
    title: "Attach Armor",
    content:
      "Add one Medium Tank Company, one Heavy Tank Company, and one Tank Destroyer Company. This gives you breakthrough power and anti-tank fire.",
    highlightSelector: "[data-key='tank'], [data-key='heavyTankCompany'], [data-key='tankDestroyerCompany']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_engineers",
    title: "Bring Engineers",
    content:
      "Add one Engineering Corps. Engineers dig in, breach obstacles, and fortify key hexes.",
    highlightSelector: "[data-key='engineer']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_flak",
    title: "Cover The Rear",
    content:
      "Add two Flak Batteries. Keep base camp and supply routes under air cover.",
    highlightSelector: "[data-key='flakBattery']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_air_wing",
    title: "Send Recon",
    content:
      "Add one Recon Bike Patrol. Recon finds enemy positions before your main force commits.",
    highlightSelector: "[data-key='reconBike']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_ammo",
    title: "Stock Shells",
    content:
      "Add one Ammunition Dump. Without ammo, your guns fall silent.",
    highlightSelector: "[data-key='ammo']",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_fuel",
    title: "Recovery Teams",
    content:
      "Add one Medical Detachment and one Recovery & Repair Section. Treat casualties and recover damaged vehicles during the fight.",
    highlightSelector: "[data-key='medic'], [data-key='maintenance']",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "mission_objectives",
    title: "Mission Orders",
    content:
      "Primary objective: stop the enemy patrol before it reaches the coastal road. Expect a mobile enemy force.",
    highlightSelector: "#precombatMissionSummary",
    position: "center",
    actionLabel: "Understood"
  },
  {
    phase: "review_allocation",
    title: "Final Check",
    content:
      "Check your force, then deploy. You are ready to move to the field.",
    highlightSelector: "#resetAllocations, #proceedToBattle",
    position: "center",
    actionLabel: "Deploy to Field"
  },
  {
    phase: "ui_overview",
    title: "Command Rail",
    content:
      "These sidebar buttons open your command boards. Each board gives a short first-time brief.",
    highlightSelector: ".control-sidebar",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "mission_briefing",
    title: "Battle Header",
    content:
      "The header shows objective status, turn phase, and key battle buttons.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_panel_intro",
    title: "Deployment Board",
    content:
      "Use this board to set base camp and deploy your opening force.",
    highlightSelector: "#deploymentPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_intro",
    title: "Deployment Plan",
    content:
      "Set base camp first. Deploy Evenly spreads units out. Deploy Grouped places units in tighter stacks.",
    highlightSelector: "#assignBaseCamp, #autoDeployEvenly, #autoDeployGrouped",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Click Zone Alpha in the deployment list to center the camera. Pick a highlighted hex, then click Assign Base Camp. Zone Alpha is your only deployment sector; Bravo is enemy ground.",
    highlightSelector: "#battleMapCanvas, #assignBaseCamp",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "place_units",
    title: "Place The Line",
    content:
      "Choose a deployment mode. You can also place units one by one for full control.",
    highlightSelector: "#autoDeployEvenly, #autoDeployGrouped",
    position: "top",
    arrowDirection: "down",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "begin_battle",
    title: "Begin Battle",
    content:
      "Enemy movement is reported to the northeast. Click Begin Mission when deployment is complete.",
    highlightSelector: "#beginBattle",
    position: "bottom",
    arrowDirection: "up",
    waitForAction: true,
    actionLabel: "Engage Enemy"
  },
  {
    phase: "initiative_order",
    title: "Initiative Order",
    content:
      "Initiative decides who acts first. Units with higher initiative act before slower units. Air missions are managed from the Air board.",
    highlightSelector: ".initiative-turn-controls-container [data-initiative-status], .battle-map-header__phase",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Read The Clock"
  },
  {
    phase: "initiative_group",
    title: "Active Group",
    content:
      "Highlighted units are the active initiative group. Give orders to these units before the next group takes its turn.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Hold Tempo"
  },
  {
    phase: "active_group_units",
    title: "Choose A Formation",
    content:
      "Select a highlighted friendly unit. Only highlighted units can act right now.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "movement_intro",
    title: "Movement",
    content:
      "Blue hexes show where the unit can move this turn. Terrain, fuel, and suppression can reduce movement.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "Red hexes are valid targets. Check the fire preview before you attack.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "intel_overlay_expand",
    title: "Unit Intel",
    content:
      "This unit card shows readiness, ammo, fuel, and special orders. Expand it now.",
    highlightSelector: "#battleIntelOverlay, #battleIntelOverlayToggle",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "smoke_demo",
    title: "Smoke Orders",
    content:
      "Not every unit can lay smoke. Select infantry or engineers, expand the unit card, then use Lay Smoke.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='laySmoke']",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "spend_activation",
    title: "Spend The Activation",
    content:
      "Set the active recon unit to Sentry. This ends its action and passes play to the next unit.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='enterSentry']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "enemy_activation",
    title: "Enemy Tempo",
    content:
      "When enemy units are next in initiative order, they act automatically. Watch the status line and activity log.",
    highlightSelector: ".initiative-turn-controls-container [data-initiative-status], #battleMapCanvas",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "next_unit",
    title: "Cycle The Group",
    content:
      "Use Next Unit to cycle friendly units in the active group before committing an order.",
    highlightSelector: ".initiative-turn-controls-container .next-activation-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "skip_group",
    title: "Skip With Intent",
    content:
      "Skip Group sets the remaining friendly units in this group to sentry.",
    highlightSelector: ".initiative-turn-controls-container .skip-group-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "Engineers can dig in, fortify edges, lay obstacles, and clear routes.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Engineer Work",
    content:
      "Engineer actions are on the expanded unit card. Use them to shape the battlefield before the enemy closes.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Artillery",
    content:
      "Spot with infantry or recon before calling artillery. Observed targets are hit more reliably.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Flak fires at enemy aircraft automatically. Keep flak near base camp, guns, and road approaches.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "round_handoff",
    title: "Round Handoff",
    content:
      "Use End Turn when your current orders are complete and you are ready to hand off.",
    highlightSelector: ".initiative-turn-controls-container .end-turn-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "Command Loop",
    content:
      "Battle routine: check initiative, command active units, watch enemy actions, then end turn when your line is set.",
    highlightSelector: ".initiative-turn-controls-container, #battleMapCanvas",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Command On"
  },
  {
    phase: "complete",
    title: "Command Certified",
    content:
      "You are ready: requisition, deploy, fight, and resupply. Hold the objective and keep your force supplied.",
    position: "center",
    actionLabel: "Dismiss"
  }
];

const PHASE_INDEX_MAP = new Map<TutorialPhase, number>(
  TUTORIAL_STEPS.map((step, index) => [step.phase, index])
);

export function getTutorialStep(phase: TutorialPhase): TutorialStep | null {
  const index = PHASE_INDEX_MAP.get(phase);
  if (index === undefined) return null;
  return TUTORIAL_STEPS[index];
}

export function getNextPhase(currentPhase: TutorialPhase): TutorialPhase | null {
  const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
  if (currentIndex === undefined) return null;
  if (currentPhase === "complete") return null;

  const nextIndex = currentIndex + 1;
  if (nextIndex >= TUTORIAL_STEPS.length) return "complete";

  return TUTORIAL_STEPS[nextIndex].phase;
}

export function getPreviousPhase(currentPhase: TutorialPhase): TutorialPhase | null {
  const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
  if (currentIndex === undefined || currentIndex <= 0) return null;

  return TUTORIAL_STEPS[currentIndex - 1].phase;
}

export function isFirstPhase(phase: TutorialPhase): boolean {
  return phase === "welcome";
}

export function getPrecombatPhases(): TutorialPhase[] {
  return [
    "welcome",
    "budget_overview",
    "unit_categories",
    "select_infantry",
    "select_tanks",
    "select_engineers",
    "select_flak",
    "select_air_wing",
    "select_ammo",
    "select_fuel",
    "mission_objectives",
    "review_allocation"
  ];
}

export function getDeploymentPhases(): TutorialPhase[] {
  return [
    "ui_overview",
    "mission_briefing",
    "deployment_panel_intro",
    "deployment_intro",
    "base_camp",
    "place_units",
    "begin_battle"
  ];
}

export function getCombatPhases(): TutorialPhase[] {
  return [
    "initiative_order",
    "initiative_group",
    "active_group_units",
    "movement_intro",
    "attack_intro",
    "intel_overlay_expand",
    "smoke_demo",
    "spend_activation",
    "enemy_activation",
    "next_unit",
    "skip_group",
    "engineer_intro",
    "engineer_orders",
    "artillery_intro",
    "flak_intro",
    "round_handoff",
    "turn_end",
    "complete"
  ];
}
