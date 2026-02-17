/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides guidance with professional-style overlays.
 */

import type { TutorialPhase, TutorialStep } from "../state/TutorialState";

// Re-export TutorialStep type for use by other modules
export type { TutorialStep };

/**
 * Complete list of tutorial steps in order.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // === WELCOME & INTRODUCTION ===
  {
    phase: "welcome",
    title: "Welcome, Commander",
    content:
      "Welcome to your first command assignment. This training exercise will teach you the fundamentals of tactical warfare. " +
      "You'll learn how to requisition forces, deploy units, and engage the enemy.",
    position: "center",
    actionLabel: "Begin Training"
  },

  // === PRECOMBAT PHASE: UNIT PURCHASING ===
  {
    phase: "budget_overview",
    title: "Operational Budget",
    content:
      "Every operation begins with resource allocation. Your budget determines how many units and supplies you can bring to the battlefield. " +
      "The budget panel shows your total funds and remaining balance.",
    highlightSelector: "#precombatBudgetPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Continue"
  },
  {
    phase: "unit_categories",
    title: "Force Composition",
    content:
      "Your forces are organized into categories: Combat Units (infantry, armor, artillery), Support (air squadrons), Supplies (ammunition, fuel), and Logistics. " +
      "A balanced force is key to victory.",
    highlightSelector: ".allocation-category-tabs, #allocationUnitList",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_infantry",
    title: "Infantry - The Backbone",
    content:
      "Infantry battalions are versatile and cost-effective. They excel at holding ground and fighting in difficult terrain. " +
      "Use the + button to add infantry to your force. Try adding 2-3 battalions.",
    highlightSelector: "[data-key='infantry']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Add Infantry"
  },
  {
    phase: "adjust_quantity",
    title: "Adjusting Quantities",
    content:
      "Excellent! Use + and - to adjust unit counts. Each unit has a maximum limit and cost per unit. " +
      "Watch your remaining budget as you add forces.",
    highlightSelector: ".allocation-quantity",
    position: "right",
    arrowDirection: "left",
    actionLabel: "Continue"
  },
  {
    phase: "select_tanks",
    title: "Armor - Breakthrough Power",
    content:
      "Tank companies provide mobile firepower and can break through enemy lines. They're expensive but devastating. " +
      "Add at least 1 tank company to your force.",
    highlightSelector: "[data-key='tank']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Add Tanks"
  },
  {
    phase: "select_support",
    title: "Artillery & Support",
    content:
      "Artillery provides long-range fire support, softening enemy positions before your troops advance. " +
      "Consider adding artillery or other support units to round out your force.",
    highlightSelector: "[data-key='howitzer']",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Add Artillery"
  },
  {
    phase: "review_allocation",
    title: "Review Your Force",
    content:
      "Before proceeding, review your allocations. Ensure you have a balanced force within budget. " +
      "You can reset allocations if you want to start over.",
    highlightSelector: "#resetAllocations",
    position: "bottom",
    arrowDirection: "up",
    actionLabel: "Continue"
  },
  {
    phase: "proceed_to_battle",
    title: "Ready for Deployment",
    content:
      "Your force is assembled! Click 'Begin Battle' to proceed to the deployment phase where you'll position your units on the battlefield.",
    highlightSelector: "#proceedToBattle",
    position: "top",
    arrowDirection: "down",
    waitForAction: true,
    actionLabel: "Proceed to Battle"
  },

  // === DEPLOYMENT PHASE ===
  {
    phase: "deployment_intro",
    title: "Deployment Phase",
    content:
      "Welcome to the battlefield. Before combat begins, you must deploy your forces in the designated zones. " +
      "The highlighted hexes show where you can place units.",
    position: "center",
    actionLabel: "Continue"
  },
  {
    phase: "place_units",
    title: "Placing Units",
    content:
      "Select a unit from your reserves on the left, then click a highlighted hex to place it. " +
      "Consider terrain when positioning - forests provide cover, hills offer visibility.",
    highlightSelector: ".deployment-reserves, .reserve-list",
    position: "right",
    arrowDirection: "left",
    waitForAction: true,
    actionLabel: "Deploy a Unit"
  },
  {
    phase: "base_camp",
    title: "Establish Base Camp",
    content:
      "Your base camp is your supply hub. Place it in a safe location - if it's captured or destroyed, resupply becomes difficult.",
    highlightSelector: "#baseCampAssign, .base-camp-status",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "Set Base Camp"
  },
  {
    phase: "begin_battle",
    title: "Commence Operations",
    content:
      "With your forces deployed, you're ready to begin combat operations. Click 'Begin Battle' to start your first turn.",
    highlightSelector: "#beginBattle",
    position: "top",
    arrowDirection: "down",
    waitForAction: true,
    actionLabel: "Begin Battle"
  },

  // === COMBAT PHASE ===
  {
    phase: "movement_intro",
    title: "Movement & Action",
    content:
      "Each turn, your units can move and attack. Click a friendly unit to select it - you'll see its movement range (blue) and attack range (red). " +
      "Try selecting one of your units now.",
    position: "center",
    waitForAction: true,
    actionLabel: "Select a Unit"
  },
  {
    phase: "attack_intro",
    title: "Engaging the Enemy",
    content:
      "When an enemy is within range (red hexes), click on them to attack. A preview will show expected damage. " +
      "Position is crucial - flanking attacks are more effective than frontal assaults.",
    position: "center",
    actionLabel: "Continue"
  },
  {
    phase: "turn_end",
    title: "Ending Your Turn",
    content:
      "When you've moved and attacked with your units, click 'End Turn' to let the enemy respond. " +
      "Units that haven't acted will be highlighted - don't leave them idle!",
    highlightSelector: "#endTurn",
    position: "left",
    arrowDirection: "right",
    waitForAction: true,
    actionLabel: "End Turn"
  },

  // === COMPLETION ===
  {
    phase: "complete",
    title: "Training Complete",
    content:
      "Congratulations, Commander! You've completed basic training. " +
      "Remember: combined arms, terrain advantage, and supply lines are the keys to victory. Good luck!",
    position: "center",
    actionLabel: "Dismiss"
  }
];

/**
 * Maps phases to their corresponding step index.
 */
const PHASE_INDEX_MAP = new Map<TutorialPhase, number>(
  TUTORIAL_STEPS.map((step, index) => [step.phase, index])
);

/**
 * Gets the tutorial step for a given phase.
 */
export function getTutorialStep(phase: TutorialPhase): TutorialStep | null {
  const index = PHASE_INDEX_MAP.get(phase);
  if (index === undefined) return null;
  return TUTORIAL_STEPS[index];
}

/**
 * Gets the next phase after the current one.
 */
export function getNextPhase(currentPhase: TutorialPhase): TutorialPhase | null {
  const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
  if (currentIndex === undefined) return null;

  const nextIndex = currentIndex + 1;
  if (nextIndex >= TUTORIAL_STEPS.length) return "complete";

  return TUTORIAL_STEPS[nextIndex].phase;
}

/**
 * Gets the previous phase before the current one.
 */
export function getPreviousPhase(currentPhase: TutorialPhase): TutorialPhase | null {
  const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
  if (currentIndex === undefined || currentIndex <= 0) return null;

  return TUTORIAL_STEPS[currentIndex - 1].phase;
}

/**
 * Checks if this is the first phase (no back available).
 */
export function isFirstPhase(phase: TutorialPhase): boolean {
  return phase === "welcome";
}

/**
 * Gets the ordered list of phases for precombat.
 */
export function getPrecombatPhases(): TutorialPhase[] {
  return [
    "welcome",
    "budget_overview",
    "unit_categories",
    "select_infantry",
    "adjust_quantity",
    "select_tanks",
    "select_support",
    "review_allocation",
    "proceed_to_battle"
  ];
}

/**
 * Gets the ordered list of phases for deployment.
 */
export function getDeploymentPhases(): TutorialPhase[] {
  return ["deployment_intro", "place_units", "base_camp", "begin_battle"];
}

/**
 * Gets the ordered list of phases for combat.
 */
export function getCombatPhases(): TutorialPhase[] {
  return ["movement_intro", "attack_intro", "turn_end", "complete"];
}
