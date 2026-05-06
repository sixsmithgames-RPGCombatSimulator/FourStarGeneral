/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides structured guidance for the training operation.
 */

import type { TutorialPhase, TutorialStep } from "../state/TutorialState";

export type { TutorialStep };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    phase: "welcome",
    title: "Field Certification: Operation Coastal Shield",
    content:
      "General, your command awaits. German scouts have been sighted probing our coastal sector near Hill 47. Your orders are clear: assemble a combat team, establish a blocking position, and engage the enemy patrol. This exercise will run you through the full command cycle—requisition, deployment, and live-fire operations. You'll lead infantry, armor, engineers, and air support while managing supply lines under combat conditions. The Germans are moving. Time is critical.",
    position: "center",
    actionLabel: "Accept Command"
  },
  {
    phase: "budget_overview",
    title: "Requisition Authority",
    content:
      "You have 1,200 Requisition Points for this training operation. Spend them wisely—every formation you commission will be under your direct command in the field. Your force must include infantry for the line, armor for breakthrough, engineers for obstacles, flak for air defense, and fighter cover for protection. Watch your balance as you build.",
    highlightSelector: "#precombatBudgetPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "unit_categories",
    title: "Assemble Your Combat Team",
    content:
      "The requisition board lists available formations. For this operation, you will need: two Infantry Battalions for the assault line, one Tank Company for armor punch, one Engineering Corps for obstacles and fortification, one Flak Battery for air defense, one Fighter Squadron for overhead protection, plus ammunition and fuel reserves. One Supply Convoy is already attached as a mission minimum—without logistics, your armor runs dry and your guns fall silent.",
    highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_infantry",
    title: "Commission Infantry",
    content:
      "Your first priority: two Infantry Battalions. These men will take and hold ground, spot for your guns, and secure terrain that armor cannot hold alone. Click the plus button twice to add two battalions to your order of battle.",
    highlightSelector: "[data-key='infantry']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_tanks",
    title: "Add Armor Support",
    content:
      "Now add one Tank Company. Your Shermans provide the punch to break enemy positions and the mobility to respond where the fight is hottest. Armor needs infantry support to survive—remember, tanks don't hold ground, they take it.",
    highlightSelector: "[data-key='tank']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_engineers",
    title: "Commission Engineers",
    content:
      "Add one Engineering Corps. These troops dig fortifications, lay tank traps, breach obstacles, and clear lanes for your advance. In this terrain, you'll need them to create defensible positions.",
    highlightSelector: "[data-key='engineer']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_flak",
    title: "Establish Air Defense",
    content:
      "Add one Flak Battery. The 88s will protect your base camp and reserves from German air attack, and they can engage ground targets when positioned well. Never underestimate enemy air power.",
    highlightSelector: "[data-key='flakBattery']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "select_air_wing",
    title: "Request Fighter Cover",
    content:
      "Add one Fighter Squadron for air superiority. These fighters stay off-map until you task them through the Air Support board for patrol, interception, or escort missions.",
    highlightSelector: "[data-key='fighter']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "mission_objectives",
    title: "Mission Briefing",
    content:
      "PRIMARY OBJECTIVE: Intercept and destroy the German patrol before they reach the coastal road. SUCCESS CRITERIA: Eliminate 50% of enemy combat strength while preserving your command structure. TACTICAL GUIDANCE: Use engineers to fortify key positions, deploy smoke screens to blind enemy observation, coordinate air support with ground operations, and maintain your supply line. Intelligence reports indicate a small but mobile enemy force—expect contact within the first turn.",
    highlightSelector: "#precombatMissionSummary",
    position: "center",
    actionLabel: "Understood"
  },
  {
    phase: "review_allocation",
    title: "Final Inspection",
    content:
      "Review your order of battle before deployment. You should have: two Infantry Battalions, one Tank Company, one Engineering Corps, one Flak Battery, one Fighter Squadron, plus ammunition and fuel reserves. The Supply Convoy is already attached—without it, your armor runs dry and your guns fall silent. When ready, deploy to the field.",
    highlightSelector: "#resetAllocations, #proceedToBattle",
    position: "center",
    actionLabel: "Deploy to Field"
  },
  {
    phase: "ui_overview",
    title: "Battlefield Controls",
    content:
      "The left rail is your command access. From here you can review recon, task air support, inspect logistics, and open the roster without leaving the map.",
    highlightSelector: ".control-sidebar",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "mission_briefing",
    title: "Mission Board",
    content:
      "The header tracks objective, turn state, air activity, and the buttons that move the battle forward. Check it whenever you need to confirm tempo or mission state.",
    highlightSelector: ".battle-map-header",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_panel_intro",
    title: "Deployment Board",
    content:
      "This panel is where you assign base camp and place your battalions. It shows what is still staged, which zones are open, and the formations waiting for a hex.",
    highlightSelector: "#deploymentPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "deployment_intro",
    title: "Deployment Options",
    content:
      "Base camp comes first. After that you can deploy evenly, group the force, or place formations manually. Put engineers where they can shape terrain and keep flak where it can shield the rear and likely air approach lanes.",
    highlightSelector: "#deploymentPanel .deployment-header-actions",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Choose a safe deployment hex and assign Base Camp. Reserves arrive here, convoys route from here, and rear-area pressure on this hex will ripple through the whole force.",
    highlightSelector: "#assignBaseCamp, #baseCampStatus",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "place_units",
    title: "Place the Opening Line",
    content:
      "Deploy the battalions. Keep engineers useful, armor mobile, and flak able to cover the rear. Forests help conceal infantry, hills improve observation, and open ground speeds vehicles but exposes them.",
    highlightSelector: "#deploymentPanel .deployment-header-actions, #deploymentUnitList",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "roster_intro",
    title: "Army Roster",
    content:
      "The roster is your full order of battle. Use it to review frontline units, reserves, and attached support. During battle, reserve call-ups arrive at base camp automatically rather than being hand-placed.",
    highlightSelector: "#armyRosterContent",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "air_support_intro",
    title: "Air Support Board",
    content:
      "Air wings stay off-map. Use this board to review ready squadrons and mission tabs before combat begins. Later, you will return here to post a live sortie to a patrol zone or strike target.",
    highlightSelector: "[data-air-panel]",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "begin_battle",
    title: "Commence Operations — Contact Expected",
    content:
      "The enemy patrol has been sighted approaching from the northeast. They are close—expect contact within the first turn. Begin operations immediately. The tutorial will guide you through movement, combat, smoke deployment, engineers, artillery, and combined arms coordination during live engagement.",
    highlightSelector: "#beginBattle",
    position: "bottom",
    arrowDirection: "up",
    waitForAction: true,
    actionLabel: "Engage Enemy"
  },
  {
    phase: "movement_intro",
    title: "Movement and Threat Range",
    content:
      "Select a friendly unit. Blue hexes show where it can move this activation and red hexes show valid attack targets. Terrain, suppression, towing state, and fuel all affect what the unit can actually do.",
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "attack_intro",
    title: "Attack with Intent",
    content:
      "When a red target is in range, click it to attack. Read the preview before committing: armor, suppression, expected damage, and retaliation all matter. Combined arms are safer and more decisive than isolated attacks. Look for the 'Lay Smoke' option—it blocks line of sight and can protect your units from enemy fire.",
    position: "center",
    actionLabel: "Continue"
  },
  {
    phase: "smoke_demo",
    title: "Tactical Smoke Deployment",
    content:
      "Critical tactic: Use the Lay Smoke order to create visual screens. Smoke blocks line of sight along a hex edge, preventing enemy units from seeing or firing through it. Deploy smoke to: protect advancing units, shield wounded formations, or mask your movements. Select a unit with smoke capability and choose 'Lay Smoke' on the appropriate edge.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "engineer_intro",
    title: "Select Your Engineers",
    content:
      "Find and select an Engineering Corps. Engineers are your terrain-control unit: they can dig in, fortify edges, lay tank traps, and clear lanes for the battalions behind them.",
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "engineer_orders",
    title: "Use Engineer Orders",
    content:
      "With engineers selected, use the unit card to issue an engineer order. Dig In, Fortify, Lay Tank Traps, or Clear Path all count for this step and show how engineers shape the battlefield without leaving the map view.",
    highlightSelector: "#battleIntelOverlay",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "artillery_intro",
    title: "Call Off-Map Artillery",
    content:
      "Select an infantry or recon spotter that can observe an enemy hex, then use Call Artillery and click an observed enemy position. The heavy battery is off-map, so the fire mission is queued rather than fired by a gun on the map.",
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "flak_intro",
    title: "Inspect Flak Coverage",
    content:
      "Select your Flak Battery. Flak works mainly as an automatic air-defense umbrella, so its job is position and coverage. Keep it shielding base camp, artillery, reserves, or exposed approach routes.",
    position: "center",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "air_missions",
    title: "Post a Live Sortie",
    content:
      "Open the Air Support board and issue one mission. Fighters can patrol or escort, strike aircraft attack marked hexes, and transport wings support airborne drops. Each squadron is tasked from its own row.",
    highlightSelector: "[data-air-panel]",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "logistics_intro",
    title: "Supply Convoy Operations",
    content:
      "Use Logistics to inspect depot stock, convoy status, and the resupply queue. Automated supply convoys route from your base camp to forward units based on Logistics priorities. You cannot directly control individual convoys, but you can influence them: set battalion priority (High/Medium/Low) to determine who gets resupplied first, and monitor the queue to anticipate shortages. During heavy combat, ammunition and fuel will deplete rapidly—stay ahead of demand by checking logistics every turn.",
    highlightSelector: "#logisticsPanel",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "End the Turn Deliberately",
    content:
      "When you have moved the formations you want, fired what matters, and checked support systems, end the turn. The idle warning will help catch units that still have actions available.",
    highlightSelector: "#endTurn",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Continue"
  },
  {
    phase: "complete",
    title: "Training Complete",
    content:
      "You have now worked through the core command loop: requisitioning, deployment, reserves, engineers, off-map artillery, flak cover, air missions, and logistics. Keep combining those systems instead of treating them as separate menus.",
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
