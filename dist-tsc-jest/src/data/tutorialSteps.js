/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides structured guidance for the training operation.
 */
export const TUTORIAL_STEPS = [
    {
        phase: "welcome",
        title: "Welcome, Commander",
        content: "This training operation walks through the full battle loop: requisitioning a balanced force, deploying it, then using engineers, off-map artillery, flak, air support, logistics, and reserves under live conditions.",
        position: "center",
        actionLabel: "Begin Training"
    },
    {
        phase: "budget_overview",
        title: "Operational Budget",
        content: "Every mission begins with requisitions. Watch the budget board as you build a force package that can attack, hold, resupply, and defend itself from air attack.",
        highlightSelector: "#precombatBudgetPanel",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "unit_categories",
        title: "Build a Task Force",
        content: "The requisition board is split between frontline units, supplies, support, and logistics. In this tutorial, build around infantry, armor, engineers, flak, and fighter cover while keeping the convoy train intact.",
        highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
        position: "right",
        arrowDirection: "left",
        actionLabel: "Continue"
    },
    {
        phase: "select_infantry",
        title: "Line Infantry First",
        content: "Add an Infantry Battalion. Infantry will anchor your line, spot for artillery, and hold terrain that armor should not fight over alone.",
        highlightSelector: "[data-key='infantry']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "adjust_quantity",
        title: "Shape the Force",
        content: "Use the quantity controls to adjust your package. You do not need a huge force here, but you do need a balanced one that can move, breach, defend, and stay supplied.",
        highlightSelector: ".allocation-quantity",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_tanks",
        title: "Add Armor",
        content: "Add a Tank Company. Armor gives you breakthrough power and mobile fire support, but it performs best when infantry screens for it and logistics keeps it fueled.",
        highlightSelector: "[data-key='tank']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_engineers",
        title: "Add Engineers",
        content: "Add an Engineering Corps. Engineers dig in, build fortifications, lay tank traps, and clear movement lanes once the battle begins.",
        highlightSelector: "[data-key='engineer']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_flak",
        title: "Add Flak Cover",
        content: "Add a Flak Battery. It protects your base camp, gun lines, and reserves from enemy air attack and can still threaten armor and soft targets from good positions.",
        highlightSelector: "[data-key='flakBattery']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_air_wing",
        title: "Add Fighter Support",
        content: "Add a Fighter Squadron. Air wings stay off-map and will be tasked later through the Air Support board for patrol, escort, and strike coverage.",
        highlightSelector: "[data-key='fighter']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "review_allocation",
        title: "Review the Package",
        content: "Review your force before stepping off. This training battle is designed to teach engineers, flak, sorties, roster control, and logistics, and it already includes a standing convoy package plus an attached off-map heavy artillery battery for you to call once the fight starts.",
        highlightSelector: "#resetAllocations, #proceedToBattle",
        position: "center",
        actionLabel: "Continue (Dismiss)"
    },
    {
        phase: "ui_overview",
        title: "Battlefield Controls",
        content: "The left rail is your command access. From here you can review recon, task air support, inspect logistics, and open the roster without leaving the map.",
        highlightSelector: ".control-sidebar",
        position: "right",
        arrowDirection: "left",
        actionLabel: "Continue"
    },
    {
        phase: "mission_briefing",
        title: "Mission Board",
        content: "The header tracks objective, turn state, air activity, and the buttons that move the battle forward. Check it whenever you need to confirm tempo or mission state.",
        highlightSelector: ".battle-map-header",
        position: "bottom",
        arrowDirection: "up",
        actionLabel: "Continue"
    },
    {
        phase: "deployment_panel_intro",
        title: "Deployment Board",
        content: "This panel is where you assign base camp and place your battalions. It shows what is still staged, which zones are open, and the formations waiting for a hex.",
        highlightSelector: "#deploymentPanel",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "deployment_intro",
        title: "Deployment Options",
        content: "Base camp comes first. After that you can deploy evenly, group the force, or place formations manually. Put engineers where they can shape terrain and keep flak where it can shield the rear and likely air approach lanes.",
        highlightSelector: "#deploymentPanel .deployment-header-actions",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "base_camp",
        title: "Establish Base Camp",
        content: "Choose a safe deployment hex and assign Base Camp. Reserves arrive here, convoys route from here, and rear-area pressure on this hex will ripple through the whole force.",
        highlightSelector: "#assignBaseCamp, #baseCampStatus",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "place_units",
        title: "Place the Opening Line",
        content: "Deploy the battalions. Keep engineers useful, armor mobile, and flak able to cover the rear. Forests help conceal infantry, hills improve observation, and open ground speeds vehicles but exposes them.",
        highlightSelector: "#deploymentPanel .deployment-header-actions, #deploymentUnitList",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "roster_intro",
        title: "Army Roster",
        content: "The roster is your full order of battle. Use it to review frontline units, reserves, and attached support. During battle, reserve call-ups arrive at base camp automatically rather than being hand-placed.",
        highlightSelector: "#armyRosterContent",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "air_support_intro",
        title: "Air Support Board",
        content: "Air wings stay off-map. Use this board to review ready squadrons and mission tabs before combat begins. Later, you will return here to post a live sortie to a patrol zone or strike target.",
        highlightSelector: "[data-air-panel]",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "begin_battle",
        title: "Commence Operations",
        content: "Once the line is set, begin the battle. The tutorial will then walk you through movement, attacks, engineers, artillery, flak, air missions, and logistics in the live fight.",
        highlightSelector: "#beginBattle",
        position: "bottom",
        arrowDirection: "up",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "movement_intro",
        title: "Movement and Threat Range",
        content: "Select a friendly unit. Blue hexes show where it can move this activation and red hexes show valid attack targets. Terrain, suppression, towing state, and fuel all affect what the unit can actually do.",
        position: "center",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "attack_intro",
        title: "Attack with Intent",
        content: "When a red target is in range, click it to attack. Read the preview before committing: armor, suppression, expected damage, and retaliation all matter. Combined arms are safer and more decisive than isolated attacks.",
        position: "center",
        actionLabel: "Continue"
    },
    {
        phase: "engineer_intro",
        title: "Select Your Engineers",
        content: "Find and select an Engineering Corps. Engineers are your terrain-control unit: they can dig in, fortify edges, lay tank traps, and clear lanes for the battalions behind them.",
        position: "center",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "engineer_orders",
        title: "Use Engineer Orders",
        content: "With engineers selected, use the unit card to issue an engineer order. Dig In, Fortify, Lay Tank Traps, or Clear Path all count for this step and show how engineers shape the battlefield without leaving the map view.",
        highlightSelector: "#battleIntelOverlay",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "artillery_intro",
        title: "Call Off-Map Artillery",
        content: "Select an infantry or recon spotter that can observe an enemy hex, then use Call Artillery and click an observed enemy position. The heavy battery is off-map, so the fire mission is queued rather than fired by a gun on the map.",
        position: "center",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "flak_intro",
        title: "Inspect Flak Coverage",
        content: "Select your Flak Battery. Flak works mainly as an automatic air-defense umbrella, so its job is position and coverage. Keep it shielding base camp, artillery, reserves, or exposed approach routes.",
        position: "center",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "air_missions",
        title: "Post a Live Sortie",
        content: "Open the Air Support board and issue one mission. Fighters can patrol or escort, strike aircraft attack marked hexes, and transport wings support airborne drops. Each squadron is tasked from its own row.",
        highlightSelector: "[data-air-panel]",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "logistics_intro",
        title: "Check Logistics",
        content: "Use Logistics to inspect depot stock, convoy status, and the resupply queue. Convoys route automatically; your job is to watch shortages, delays, and battalion priority so the right formations get serviced first.",
        highlightSelector: "#logisticsPanel",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "turn_end",
        title: "End the Turn Deliberately",
        content: "When you have moved the formations you want, fired what matters, and checked support systems, end the turn. The idle warning will help catch units that still have actions available.",
        highlightSelector: "#endTurn",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "complete",
        title: "Training Complete",
        content: "You have now worked through the core command loop: requisitioning, deployment, reserves, engineers, off-map artillery, flak cover, air missions, and logistics. Keep combining those systems instead of treating them as separate menus.",
        position: "center",
        actionLabel: "Dismiss"
    }
];
const PHASE_INDEX_MAP = new Map(TUTORIAL_STEPS.map((step, index) => [step.phase, index]));
export function getTutorialStep(phase) {
    const index = PHASE_INDEX_MAP.get(phase);
    if (index === undefined)
        return null;
    return TUTORIAL_STEPS[index];
}
export function getNextPhase(currentPhase) {
    const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
    if (currentIndex === undefined)
        return null;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= TUTORIAL_STEPS.length)
        return "complete";
    return TUTORIAL_STEPS[nextIndex].phase;
}
export function getPreviousPhase(currentPhase) {
    const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
    if (currentIndex === undefined || currentIndex <= 0)
        return null;
    return TUTORIAL_STEPS[currentIndex - 1].phase;
}
export function isFirstPhase(phase) {
    return phase === "welcome";
}
export function getPrecombatPhases() {
    return [
        "welcome",
        "budget_overview",
        "unit_categories",
        "select_infantry",
        "adjust_quantity",
        "select_tanks",
        "select_engineers",
        "select_flak",
        "select_air_wing",
        "review_allocation"
    ];
}
export function getDeploymentPhases() {
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
export function getCombatPhases() {
    return [
        "movement_intro",
        "attack_intro",
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
