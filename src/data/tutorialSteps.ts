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
      "For this fight, the preset loads a balanced force: fast scouts, engineers, infantry, armor, flak, supply, ammo, medical, and maintenance teams.",
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
      "Confirm the force. Initiative matters now: scouts seize tempo, infantry and engineers shape the fight, armor hits later, and logistics keeps the line alive.",
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
      "First establish base camp. Deploy Evenly places one unit per hex from lowest to highest initiative. Deploy Grouped follows the same initiative order but places two units per hex before moving outward.",
    highlightSelector: "#assignBaseCamp, #autoDeployEvenly, #autoDeployGrouped",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Click a highlighted hex inside Zone Alpha, then click Assign Base Camp. Zone Alpha is your only deployment sector in this operation; Bravo is enemy ground.",
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
      "Choose a deployment mode. Deploy Evenly spreads across open hexes; Deploy Grouped packs formations into tighter stacks. For full control, deploy units one by one onto legal hexes.",
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
      "Enemy movement is reported northeast. Begin operations. The next brief teaches the initiative clock: who acts now, who waits, and when to hand off tempo.",
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
      "Initiative is the battle clock, General. Higher ratings act first: recon and engineers seize tempo, line units follow, armor and guns answer later. Aircraft stay on the Air board.",
    highlightSelector: ".initiative-turn-controls-container [data-initiative-status], .battle-map-header__phase",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Read The Clock"
  },
  {
    phase: "initiative_group",
    title: "Active Group",
    content:
      "The highlighted formations are the active group. Work the useful orders in this initiative band before lower bands answer. If the enemy shares the tempo, their activations will cut in.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Hold Tempo"
  },
  {
    phase: "active_group_units",
    title: "Choose A Formation",
    content:
      "Select a highlighted friendly formation. Only the active group can take orders now; other units will report when their initiative comes up.",
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
      "Blue hexes are movement. Roads, terrain, fuel, towing, suppression, and facing decide whether a move is worth spending this activation.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "Red hexes are fire options. Check the preview before firing: armor, suppression, expected damage, and retaliation decide whether the shot is worth the tempo.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "intel_overlay_expand",
    title: "Unit Intel",
    content:
      "This card is the formation's command board: readiness, orders, initiative, and special actions. Expand it before issuing smoke or engineer work.",
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
      "Smoke is not a universal order. When infantry or engineers activate, select that formation, expand this card, and use Lay Smoke to screen a hex edge.",
    highlightSelector: "#battleIntelOverlay [data-selection-action='laySmoke']",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "spend_activation",
    title: "Spend The Activation",
    content:
      "Put the active recon patrol on Sentry. Sentry spends the activation, keeps eyes forward, and lets the next initiative band report in.",
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
      "Enemy formations act when their place in the order arrives. Watch the initiative status after every order so you know whether the next move is yours or theirs.",
    highlightSelector: ".initiative-turn-controls-container [data-initiative-status], #battleMapCanvas",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "next_unit",
    title: "Cycle The Group",
    content:
      "Use Next Unit to cycle eligible formations in the active band before committing an order. A General checks the whole group before spending tempo.",
    highlightSelector: ".initiative-turn-controls-container .next-activation-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "skip_group",
    title: "Skip With Intent",
    content:
      "Skip Group puts the remaining friendly formations in this initiative band on sentry. Use it when the line is set, not because the clock feels loud.",
    highlightSelector: ".initiative-turn-controls-container .skip-group-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "When engineers activate, spend them on terrain control: dig in, fortify, lay tank traps, or clear a route for the main body.",
    highlightSelector: "#battleIntelOverlay",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Engineer Work",
    content:
      "Engineer orders live on the expanded unit card. They are not glamorous, General, but terrain work wins battles before the first shell lands.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Artillery",
    content:
      "Use infantry or recon spotters before calling artillery. Guns act best against observed, fixed targets; blind fire spends ammunition and initiative poorly.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Flak batteries are slow on the initiative clock, but their air defense is automatic. Place coverage over base camp, guns, reserves, and road approaches.",
    highlightSelector: "#battleMapCanvas",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "round_handoff",
    title: "Round Handoff",
    content:
      "End Turn is the hard pass. In initiative mode it can place unused formations on sentry and release the rest of the round. Press it when you mean it.",
    highlightSelector: ".initiative-turn-controls-container .end-turn-btn",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "Command Loop",
    content:
      "That is the loop: read initiative, command the active group, spend useful orders, watch enemy tempo, then hand off the round only when the line is set.",
    highlightSelector: ".initiative-turn-controls-container, #battleMapCanvas",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Command On"
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
