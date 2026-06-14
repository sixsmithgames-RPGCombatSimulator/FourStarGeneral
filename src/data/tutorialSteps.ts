/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides structured guidance for the training operation.
 */

import type { TutorialPhase, TutorialStep } from "../state/TutorialState";

export type { TutorialStep };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    phase: "budget_overview",
    title: "Requisition Order",
    content:
      "Welcome, General. This tutorial starts with requisition points (RP): the budget used to raise formations and supplies for the mission.",
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
    allowBack: true,
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
    phase: "review_allocation",
    title: "Begin Deployment",
    content:
      "Click Begin Battle to lock this force and open the deployment map.",
    highlightSelector: "#proceedToBattle",
    position: "center",
    waitForAction: true,
    actionLabel: "Begin Battle"
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
      "The top bar shows initiative: which group acts now. When it says Your group, only highlighted friendly formations can receive orders.",
    highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status]",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "active_group_units",
    title: "Choose A Formation",
    content:
      "Click the highlighted Recon Bike Patrol. It moves first in this training battle.",
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
      "Move the Recon Bike Patrol to a nearby green dashed hex. Click the destination to issue the order.",
    highlightSelector: "#battleMapCanvas .hex-cell.move-option-highlight, #battleMapCanvas .hex-tile.move-option-highlight",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "Red hexes are legal fire targets. If none appear, this patrol has no clear shot yet.",
    highlightSelector: "#battleMapCanvas .hex-cell.attack-target-highlight, #battleMapCanvas .hex-tile.attack-target-highlight",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "intel_overlay_expand",
    title: "Unit Intel",
    content:
      "The unit card shows readiness, ammo, fuel, movement, range, and facing. Click Expand to see its orders.",
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
      "Smoke appears only on formations that carry smoke rounds. This formation has smoke; use it to block sight or cover a tired unit.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='laySmoke'], #battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "spend_activation",
    title: "Finish The Group",
    content:
      "The patrol has moved. Click End Turn to finish this initiative group and pass control.",
    highlightSelector: ".enhanced-initiative-turn-controls .end-turn-btn",
    position: "bottom",
    arrowDirection: "up",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "enemy_activation",
    title: "Enemy Action",
    content:
      "Enemy groups resolve automatically. Watch the map and Activity Log; the tutorial continues when your next group is ready.",
    highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status], .battle-activity-log",
    position: "bottom",
    arrowDirection: "up",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "next_unit",
    title: "Cycle The Group",
    content:
      "Next Unit jumps between formations in the active group. Use it when several friendly formations share the same initiative.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "skip_group",
    title: "Skip Group",
    content:
      "Skip Group puts the rest of this active group on Sentry. Use it when they are already where you want them.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "Engineers shape the ground. Their card is opened here so you can see fortify, obstacle, and clearing orders.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Engineer Work",
    content:
      "Fortify, Lay Tank Traps, and Clear Path live on engineer cards. Field work spends the engineer's action.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='fortifications'], #battleIntelOverlay [data-selection-action='tankTraps'], #battleIntelOverlay [data-selection-action='clearedPath'], #battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Artillery",
    content:
      "Infantry and recon can call off-map guns when they observe an enemy. If no target is observed, the card explains why.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='callArtillery'], #battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Flak covers nearby troops against aircraft and can fight ground targets when needed. Keep it near camp, guns, or roads.",
    highlightSelector: "#battleIntelOverlay, #battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "round_handoff",
    title: "End The Turn",
    content:
      "End Turn hands off when your active groups are finished. The tutorial is ending; keep fighting from here.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "mission_objectives",
    title: "Mission Orders",
    content:
      "Orders: stop the enemy patrol before it reaches the coastal road.",
    highlightSelector: ".mission-summary-panel, .battle-map-header",
    position: "center",
    actionLabel: "Continue"
  },
  {
    phase: "complete",
    title: "Ready For Battle",
    content:
      "Good luck, General{generalName}.",
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

export function getTutorialStepNumber(phase: TutorialPhase): number | null {
  const index = PHASE_INDEX_MAP.get(phase);
  return index === undefined ? null : index + 1;
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
  return phase === "budget_overview";
}

export function getPrecombatPhases(): TutorialPhase[] {
  return [
    "budget_overview",
    "unit_categories",
    "select_infantry",
    "select_tanks",
    "select_engineers",
    "select_flak",
    "select_air_wing",
    "select_ammo",
    "select_fuel",
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
    "mission_objectives",
    "complete"
  ];
}
