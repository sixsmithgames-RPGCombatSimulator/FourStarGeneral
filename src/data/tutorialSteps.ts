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
      "General, enemy scouts are probing the sector. Assemble a task force, establish a blocking position, and break the patrol before it reaches the road net.",
    position: "center",
    actionLabel: "Accept Command"
  },
  {
    phase: "budget_overview",
    title: "Requisition Order",
    content:
      "You have 1,200 RP. Use the Training preset for a balanced field package, or build the same mix by hand if you want to learn each requisition lane.",
    highlightSelector: "#precombatBudgetPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "unit_categories",
    title: "Build The Task Force",
    content:
      "For this fight, the preset loads three Infantry Battalions, Engineers, medium and heavy armor, tank destroyers, two Flak Batteries, recon, supply, ammo, medical, and maintenance teams.",
    highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_infantry",
    title: "Form The Line",
    content:
      "Add three Infantry Battalions. They take ground, hold villages and woods, and give the rest of the force something solid to fight around.",
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
      "Add one Medium Tank Company, one Heavy Tank Company, and one Tank Destroyer Company. The mix gives you shock, staying power, and anti-armor reach.",
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
      "Add one Engineering Corps. Engineers dig, breach, fortify, and keep the advance from stalling at the first obstacle.",
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
      "Add two Flak Batteries. Keep base camp, reserves, and road approaches under an air-defense umbrella.",
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
      "Add one Recon Bike Patrol. Scouts widen your sight picture and make the enemy pay for moving blind.",
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
      "Add one Ammunition Dump. Guns win time only while the depot keeps them fed.",
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
      "Add one Medical Detachment and one Recovery & Repair Section. Casualties and damaged vehicles need real teams assigned before the battle starts.",
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
      "Primary objective: stop the enemy patrol before it reaches the coastal road. Expect a small mobile force. Use engineers, smoke, recon, supply, and recovery teams as one plan.",
    highlightSelector: "#precombatMissionSummary",
    position: "center",
    actionLabel: "Understood"
  },
  {
    phase: "review_allocation",
    title: "Final Check",
    content:
      "Confirm the force: three Infantry, Engineers, medium and heavy armor, tank destroyers, two Flak, recon, supply, ammo, medical, and maintenance. When it looks right, deploy.",
    highlightSelector: "#resetAllocations, #proceedToBattle",
    position: "center",
    actionLabel: "Deploy to Field"
  },
  {
    phase: "ui_overview",
    title: "Command Rail",
    content:
      "The sidebar is your command rail. Open those boards when you need them; each one gives its own command brief the first time you click it.",
    highlightSelector: ".control-sidebar",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "mission_briefing",
    title: "Battle Header",
    content:
      "The header tracks the objective, turn state, air activity, and the main battle actions. Use it to keep tempo.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_panel_intro",
    title: "Deployment Board",
    content:
      "This board places base camp and your opening formations. It shows what is staged, what zones are legal, and who still needs orders.",
    highlightSelector: "#deploymentPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_intro",
    title: "Deployment Plan",
    content:
      "First establish base camp. Then use Deploy Evenly to spread the line, Deploy Grouped to mass formations, or place units by hand for exact control.",
    highlightSelector: "#assignBaseCamp, #autoDeployEvenly, #autoDeployGrouped",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Choose a highlighted deployment-zone hex on the map, then click Assign Base Camp. Keep headquarters behind the first line; reserves and convoys route through it.",
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
      "Deploy the force. Evenly spreads units across legal hexes; Grouped keeps formations together. For full control, select a unit and click legal hexes one by one.",
    highlightSelector: "#battleMapCanvas, #deploymentUnitList, #autoDeployEvenly, #autoDeployGrouped",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "begin_battle",
    title: "Begin Battle",
    content:
      "Enemy movement is reported northeast. Begin operations. The next steps cover movement, fire orders, engineers, artillery, air, and supply under contact.",
    highlightSelector: "#beginBattle",
    position: "bottom",
    arrowDirection: "up",
    waitForAction: true,
    actionLabel: "Engage Enemy"
  },
  {
    phase: "movement_intro",
    title: "Movement",
    content:
      "Select a friendly unit. Blue hexes are movement, red hexes are attack options. Terrain, fuel, towing, and suppression all matter.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "Click a red target to attack. Check the preview before firing: armor, suppression, expected damage, and retaliation decide whether the shot is worth it.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_smoke_unit",
    title: "Pick Smoke",
    content:
      "Select one of the highlighted formations that can throw smoke. Smoke orders live on the unit intel card, not the sidebar.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "intel_overlay_expand",
    title: "Unit Intel",
    content:
      "This card is the unit's command board: status, orders, and detailed readiness. Click Expand before issuing special orders.",
    highlightSelector: "#battleIntelOverlay, #battleIntelOverlayToggle",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "smoke_demo",
    title: "Lay Smoke",
    content:
      "Click Lay Smoke, then choose your own hex or an in-range target hex and pick the edge to screen. Use smoke to break sight before you move.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='laySmoke']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "Select an Engineering Corps. Engineers control terrain: dig in, fortify, lay traps, and open lanes for the main body.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Engineer Work",
    content:
      "Issue one engineer order from the unit card. Dig In, Fortify, Lay Tank Traps, or Clear Path all count.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Artillery",
    content:
      "Use an infantry or recon spotter, call artillery, then click an observed enemy hex. Off-map guns queue the mission and punish fixed targets.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Select the Flak Battery. Its main job is automatic air defense, so position it where coverage protects headquarters, reserves, and guns.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "End Turn",
    content:
      "When movement, fire, support, and supply checks are done, end the turn. The idle warning catches formations still waiting for orders.",
    highlightSelector: "#endTurn",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "complete",
    title: "Command Certified",
    content:
      "You have the command loop: requisition, deploy, maneuver, strike, support, and resupply. Win by combining systems, not by treating them as separate menus.",
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
    "movement_intro",
    "attack_intro",
    "select_smoke_unit",
    "intel_overlay_expand",
    "smoke_demo",
    "engineer_intro",
    "engineer_orders",
    "artillery_intro",
    "flak_intro",
    "turn_end",
    "complete"
  ];
}
