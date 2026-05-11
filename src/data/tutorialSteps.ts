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
      "You have 1,200 RP. Buy only what the mission needs: infantry to hold, armor to punch, engineers to shape ground, flak to guard the rear, and fighters to contest the sky.",
    highlightSelector: "#precombatBudgetPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "unit_categories",
    title: "Build The Task Force",
    content:
      "For this fight, requisition two Infantry Battalions, one Tank Company, one Engineering Corps, one Flak Battery, one Fighter Squadron, plus ammo and fuel under Logistics. A Supply Convoy is already attached.",
    highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_infantry",
    title: "Form The Line",
    content:
      "Add two Infantry Battalions. They take ground, hold villages and woods, and give the rest of the force something solid to fight around.",
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
      "Add one Tank Company. Armor gives you speed and shock, but it needs infantry nearby when the enemy digs in.",
    highlightSelector: "[data-key='tank']",
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
      "Add one Flak Battery. Keep base camp, reserves, and road approaches under an air-defense umbrella.",
    highlightSelector: "[data-key='flakBattery']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_air_wing",
    title: "Call Fighters",
    content:
      "Add one Fighter Squadron. It stays off-map until you task it from the Air board, then it can patrol, intercept, or escort.",
    highlightSelector: "[data-key='fighter']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "mission_objectives",
    title: "Mission Orders",
    content:
      "Primary objective: stop the enemy patrol before it reaches the coastal road. Expect a small mobile force. Use engineers, smoke, supply, and air support as one plan.",
    highlightSelector: "#precombatMissionSummary",
    position: "center",
    actionLabel: "Understood"
  },
  {
    phase: "review_allocation",
    title: "Final Check",
    content:
      "Confirm the force: two Infantry, one Tank Company, Engineers, Flak, Fighters, ammo, fuel, and the attached Supply Convoy. When it looks right, deploy.",
    highlightSelector: "#resetAllocations, #proceedToBattle",
    position: "center",
    actionLabel: "Deploy to Field"
  },
  {
    phase: "ui_overview",
    title: "Command Rail",
    content:
      "The sidebar is your command rail. Each menu opens a focused board, and each board now gives a one-time command brief the first time you open it.",
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
      "Place base camp first. Then deploy evenly, group the force, or place units by hand. Keep engineers near hard ground and flak near the rear.",
    highlightSelector: "#deploymentPanel .deployment-header-actions",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Assign base camp on a safe deployment hex. Reserves and convoys route through it, so do not plant headquarters where the enemy can punish it early.",
    highlightSelector: "#assignBaseCamp, #baseCampStatus",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "place_units",
    title: "Place The Line",
    content:
      "Deploy the force. Infantry wants cover, armor wants lanes, engineers want useful terrain, and flak wants reach over the rear.",
    highlightSelector: "#deploymentPanel .deployment-header-actions, #deploymentUnitList",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "roster_intro",
    title: "Roster Board",
    content:
      "Open the Roster. It is the order of battle: deployed units, reserves, support, losses, and readiness at a glance.",
    highlightSelector: "#armyRosterContent",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "air_support_intro",
    title: "Air Board",
    content:
      "Open Air Support. Squadrons stay off-map until ordered. Review readiness now; task sorties when the map gives you a reason.",
    highlightSelector: "[data-air-panel]",
    position: "left",
    arrowDirection: "right",
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
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Fire Orders",
    content:
      "Click a red target to attack. Check the preview before firing: armor, suppression, expected damage, and retaliation decide whether the shot is worth it.",
    position: "center",
    actionLabel: "Continue"
  },
  {
    phase: "smoke_demo",
    title: "Smoke",
    content:
      "Use Lay Smoke to block line of sight across a hex edge. Screen an advance, cover a damaged unit, or break enemy observation before moving.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Engineers",
    content:
      "Select an Engineering Corps. Engineers control terrain: dig in, fortify, lay traps, and open lanes for the main body.",
    position: "center",
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
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Flak Coverage",
    content:
      "Select the Flak Battery. Its main job is automatic air defense, so position it where coverage protects headquarters, reserves, and guns.",
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "air_missions",
    title: "Air Missions",
    content:
      "Open Air Support and issue one mission. Fighters patrol or escort; strike aircraft hit marked hexes. Task each squadron from its row.",
    highlightSelector: "[data-air-panel]",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "logistics_intro",
    title: "Logistics",
    content:
      "Open Logistics. Watch depot stock, convoy status, and unit priority. You do not drive trucks by hand; you set priorities before ammo and fuel become the crisis.",
    highlightSelector: "#logisticsPanel",
    position: "left",
    arrowDirection: "right",
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
    "roster_intro",
    "air_support_intro",
    "begin_battle"
  ];
}

export function getCombatPhases(): TutorialPhase[] {
  return [
    "movement_intro",
    "attack_intro",
    "smoke_demo",
    "engineer_intro",
    "engineer_orders",
    "artillery_intro",
    "flak_intro",
    "air_missions",
    "logistics_intro",
    "turn_end",
    "complete"
  ];
}
