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
      "Check your force, then click Begin Battle to move to the field.",
    highlightSelector: "#resetAllocations, #proceedToBattle",
    position: "center",
    waitForAction: true,
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
      "Set base camp first. Deploy Evenly spreads units across open hexes. Deploy Grouped keeps them closer together.",
    highlightSelector: "#assignBaseCamp, #autoDeployEvenly, #autoDeployGrouped",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Click Zone Alpha in the deployment list to center the camera. Pick one highlighted hex, then click Assign Base Camp.",
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
    title: "Initiative Status",
    content:
      "Read the status line at the top. Higher initiative numbers act first. When it says Your group, the highlighted friendly units are waiting for orders.",
    highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status]",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "initiative_group",
    title: "Active Group",
    content:
      "These highlighted formations act now. Enemy formations and slower friendly units wait until their initiative comes up.",
    highlightSelector: "#battleMapCanvas .hex-cell.initiative-group-highlight, #battleMapCanvas .hex-tile.initiative-group-highlight",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "active_group_units",
    title: "Choose A Formation",
    content:
      "Click a highlighted friendly formation. Its unit card will show movement, fire, and field orders.",
    highlightSelector: "#battleMapCanvas .hex-cell.initiative-group-highlight, #battleMapCanvas .hex-tile.initiative-group-highlight",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "movement_intro",
    title: "Movement",
    content:
      "Blue hexes show legal moves for the selected formation. Click one to move, or continue if you want it to hold position.",
    highlightSelector: "#battleMapCanvas .hex-cell.move-option-highlight, #battleMapCanvas .hex-tile.move-option-highlight",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "If enemies are in range, red hexes appear on the map. Click one to preview the shot before you fire. If none appear, this formation has no shot from here.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "intel_overlay_expand",
    title: "Unit Intel",
    content:
      "The unit card shows readiness, ammo, fuel, and orders. Click Expand to see the full command list.",
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
      "Smoke orders live on the expanded unit card. They appear only for formations that carry smoke, usually infantry or engineers. Use smoke to block sight before a move or cover a damaged unit.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "spend_activation",
    title: "Finish This Formation",
    content:
      "Use Sentry when this formation is done. It holds position and stays ready to return fire.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='enterSentry']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "enemy_activation",
    title: "Enemy Action",
    content:
      "When the enemy is next, their orders resolve automatically. Watch the map and Activity Log for movement, fire, or no-contact reports.",
    highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status], .battle-activity-log",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "next_unit",
    title: "Cycle The Group",
    content:
      "Use Next Unit to jump between friendly formations that can still act in the current initiative group.",
    highlightSelector: ".enhanced-initiative-turn-controls .next-activation-btn, .initiative-turn-controls-container .next-activation-btn, .next-activation-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "skip_group",
    title: "Skip Group",
    content:
      "Skip Group sets the remaining friendly formations in this initiative group to Sentry. Use it when the group is already in good position.",
    highlightSelector: ".enhanced-initiative-turn-controls .skip-group-btn, .initiative-turn-controls-container .skip-group-btn, .skip-group-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "Engineers build the hard points: trenches, fortified edges, obstacles, and cleared routes.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Engineer Work",
    content:
      "Engineer orders live on the expanded unit card. Build before the enemy closes; field work takes time.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Artillery",
    content:
      "Artillery is strongest when infantry or recon can see the target. Observed fire lands more reliably.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Flak fires at enemy aircraft automatically. Keep it near base camp, guns, and key roads.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "round_handoff",
    title: "End The Turn",
    content:
      "Use End Turn after your formations have moved, fired, or taken Sentry positions.",
    highlightSelector: ".enhanced-initiative-turn-controls .end-turn-btn, .initiative-turn-controls-container .end-turn-btn, .end-turn-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "Battle Routine",
    content:
      "Each turn follows the same routine: check whose initiative is active, order the highlighted formations, watch enemy action, then end the turn.",
    highlightSelector: ".enhanced-initiative-turn-controls, .initiative-turn-controls-container",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Finish"
  },
  {
    phase: "complete",
    title: "Ready For Battle",
    content:
      "You are ready: requisition the force, deploy the line, give orders by initiative, and keep the objective supplied.",
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
