/**
 * Tutorial step definitions for the training mission walkthrough.
 * Each step provides structured guidance for the training operation.
 */
export const TUTORIAL_STEPS = [
    {
        phase: "budget_overview",
        title: "Requisition Order",
        content: "Welcome, General. This tutorial starts with requisition points (RP): the budget used to raise formations and supplies for the mission.",
        highlightSelector: "#precombatBudgetPanel",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "unit_categories",
        title: "Assemble The Force",
        content: "This mission needs infantry, armor, engineers, recon, air defense, and logistics. Each category supports the line in a different way.",
        highlightSelector: "#allocationUnitList, #allocationSupportList, #allocationLogisticsList",
        position: "right",
        arrowDirection: "left",
        allowBack: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_infantry",
        title: "Form The Line",
        content: "Add three Infantry Battalions. They hold ground and anchor the front.",
        highlightSelector: "[data-key='infantry']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_tanks",
        title: "Attach Armor",
        content: "Add one Medium Tank Company, one Heavy Tank Company, and one Tank Destroyer Company. The marker will move to each company in turn.",
        highlightSelector: "[data-key='tank'][data-quantity='0'], [data-key='heavyTankCompany'][data-quantity='0'], [data-key='tankDestroyerCompany'][data-quantity='0']",
        position: "right",
        arrowDirection: "left",
        highlightFirstMatch: true,
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_engineers",
        title: "Bring Engineers",
        content: "Add one Engineering Corps. Engineers dig in, breach obstacles, and fortify key hexes.",
        highlightSelector: "[data-key='engineer']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_flak",
        title: "Cover The Rear",
        content: "Add one Flak Battery. Keep base camp and supply routes under air cover.",
        highlightSelector: "[data-key='flakBattery']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_air_wing",
        title: "Send Recon",
        content: "Add one Recon Bike Patrol. Recon moves fast and spots enemy positions before the line commits.",
        highlightSelector: "[data-key='reconBike']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_howitzer",
        title: "Add Artillery",
        content: "Add one Howitzer Battery. These guns deploy with the force and provide direct battlefield fire.",
        highlightSelector: "[data-key='howitzer']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_ammo",
        title: "Stock Shells",
        content: "Add one Ammunition Dump. Without ammo, your guns fall silent.",
        highlightSelector: "[data-key='ammo']",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_fuel",
        title: "Recovery Teams",
        content: "Add one Medical Detachment and one Recovery & Repair Section. Treat casualties and recover damaged vehicles during the fight.",
        highlightSelector: "[data-key='medic'], [data-key='maintenance']",
        position: "left",
        arrowDirection: "right",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "review_allocation",
        title: "Begin Deployment",
        content: "Click Begin Battle to lock this force and open the deployment map.",
        highlightSelector: "#proceedToBattle",
        position: "center",
        waitForAction: true,
        actionLabel: "Begin Battle"
    },
    {
        phase: "ui_overview",
        title: "Command Rail",
        content: "These sidebar buttons open your command boards. Each board gives a short first-time brief.",
        highlightSelector: ".control-sidebar",
        position: "right",
        arrowDirection: "left",
        actionLabel: "Continue"
    },
    {
        phase: "mission_briefing",
        title: "Command Rail",
        content: "The command rail shows the operation, turn limit, current objective, and which formations can act.",
        highlightSelector: ".battle-map-header",
        position: "bottom",
        arrowDirection: "up",
        actionLabel: "Continue"
    },
    {
        phase: "deployment_panel_intro",
        title: "Deployment Board",
        content: "Use this board to set base camp and deploy your opening force.",
        highlightSelector: "#deploymentPanel",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "deployment_intro",
        title: "Deployment Plan",
        content: "Set base camp first. Deploy Evenly spreads units across open hexes. Deploy Grouped keeps them closer together.",
        highlightSelector: "#assignBaseCamp, #autoDeployEvenly, #autoDeployGrouped",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Continue"
    },
    {
        phase: "base_camp",
        title: "Establish Base Camp",
        content: "Click Zone Alpha in the deployment list to center the camera. Pick one highlighted hex, then click Assign Base Camp.",
        highlightSelector: "#battleMapCanvas, #assignBaseCamp",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "place_units",
        title: "Place The Line",
        content: "Choose a deployment mode. You can also place units one by one for full control.",
        highlightSelector: "#autoDeployEvenly, #autoDeployGrouped",
        position: "top",
        arrowDirection: "down",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "begin_battle",
        title: "Begin Battle",
        content: "Enemy movement is reported to the northeast. Click Begin Mission when deployment is complete.",
        highlightSelector: "#beginBattle",
        position: "bottom",
        arrowDirection: "up",
        waitForAction: true,
        actionLabel: "Engage Enemy"
    },
    {
        phase: "initiative_order",
        title: "Initiative Order",
        content: "Higher initiative groups act first. When the rail shows Your group, only the highlighted friendly formations can receive orders.",
        highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status]",
        position: "bottom",
        arrowDirection: "up",
        actionLabel: "Continue"
    },
    {
        phase: "active_group_units",
        title: "Choose A Formation",
        content: "Click the highlighted Recon Bike Patrol. It moves first in this training battle.",
        highlightSelector: "#battleMapCanvas [data-tutorial-guided-hex='true']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "movement_intro",
        title: "Scout Ahead",
        content: "Recon moves quickly and sees far, but is lightly armed. Drag or scroll the map, then move to the highlighted green hex. Other green outlines are legal moves.",
        highlightSelector: "#battleMapCanvas [data-tutorial-guided-hex='true']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "enemy_activation",
        title: "Enemy Response",
        content: "The enemy now answers with formations in the same initiative band. Watch the map; command returns when their movement is complete.",
        highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status], .battle-activity-log",
        highlightFirstMatch: true,
        position: "bottom",
        arrowDirection: "up",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "engineer_intro",
        title: "Select The Engineers",
        content: "The engineers are ready. Click the highlighted Engineering Corps to build fortifications.",
        highlightSelector: "#battleMapCanvas [data-tutorial-guided-hex='true']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "intel_overlay_expand",
        title: "Open The Order Card",
        content: "The compact card shows readiness at a glance. Click Expand to open the engineer's full order card.",
        highlightSelector: "#battleIntelOverlay, #battleIntelOverlayToggle",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "engineer_orders",
        title: "Build Fortifications",
        content: "Click Fortify, then choose the edge that faces the enemy.",
        highlightSelector: "#battleFortificationFacingPreview .fortification-facing-preview-svg",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "enemy_response",
        title: "Enemy Response",
        content: "Enemy formations in this band now act. Watch their movement; your infantry group is next.",
        highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status], .battle-activity-log",
        highlightFirstMatch: true,
        position: "bottom",
        arrowDirection: "up",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "artillery_support_intro",
        title: "Artillery Support",
        content: "Corps Artillery is ready off-map. Choose an observer, then send the fire mission.",
        highlightSelector: "#battleMapCanvas",
        showSpotlight: false,
        position: "right",
        arrowDirection: "left",
        waitForAction: false,
        actionLabel: "Continue"
    },
    {
        phase: "select_artillery_observer",
        title: "Choose Observer",
        content: "Click the highlighted friendly formation. It has eyes on a target and can direct Corps Artillery.",
        highlightSelector: "#battleMapCanvas [data-tutorial-guided-hex='true']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "artillery_intro",
        title: "Call Artillery",
        content: "Click Call Artillery, then select a highlighted enemy hex. The shells arrive during the turn transition.",
        highlightSelector: "#battleIntelOverlay [data-selection-action='callArtillery']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "post_artillery_enemy_response",
        title: "Enemy Response",
        content: "Enemy formations now act. Watch the map; command returns to the next friendly group when they finish.",
        highlightSelector: ".enhanced-initiative-turn-controls [data-initiative-status], .initiative-turn-controls-container [data-initiative-status], [data-initiative-status], .battle-activity-log",
        highlightFirstMatch: true,
        position: "bottom",
        arrowDirection: "up",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "select_attack_unit",
        title: "Select A Firing Unit",
        content: "Another formation has a clear shot. Click the highlighted friendly unit to prepare its fire order.",
        highlightSelector: "#battleMapCanvas [data-tutorial-guided-hex='true']",
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "smoke_demo",
        title: "Smoke Screens",
        content: "This formation can lay smoke on its own hex or a neighboring hex edge. Use smoke to block sight before a risky move or to cover a damaged unit.",
        highlightSelector: "#battleIntelOverlay [data-selection-action='laySmoke']",
        position: "right",
        arrowDirection: "left",
        actionLabel: "Continue"
    },
    {
        phase: "attack_intro",
        title: "Fire Orders",
        content: "Red outlines mark enemy formations in range. Click one, review the fire report, then confirm the attack.",
        highlightSelector: "#battleMapCanvas .hex-cell.attack-target-highlight, #battleMapCanvas .hex-tile.attack-target-highlight",
        showSpotlight: false,
        position: "right",
        arrowDirection: "left",
        waitForAction: true,
        actionLabel: "Continue"
    },
    {
        phase: "mission_objectives",
        title: "Mission Orders",
        content: "Orders: stop the enemy patrol before it reaches the coastal road.",
        highlightSelector: ".mission-summary-panel, .battle-map-header",
        position: "center",
        actionLabel: "Continue"
    },
    {
        phase: "complete",
        title: "Ready For Battle",
        content: "Good luck, General{generalName}.",
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
export function getTutorialStepNumber(phase) {
    const index = PHASE_INDEX_MAP.get(phase);
    return index === undefined ? null : index + 1;
}
export function getNextPhase(currentPhase) {
    const currentIndex = PHASE_INDEX_MAP.get(currentPhase);
    if (currentIndex === undefined)
        return null;
    if (currentPhase === "complete")
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
    return phase === "budget_overview";
}
export function getPrecombatPhases() {
    return [
        "budget_overview",
        "unit_categories",
        "select_infantry",
        "select_tanks",
        "select_engineers",
        "select_flak",
        "select_air_wing",
        "select_howitzer",
        "select_ammo",
        "select_fuel",
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
        "begin_battle"
    ];
}
export function getCombatPhases() {
    return [
        "initiative_order",
        "active_group_units",
        "movement_intro",
        "enemy_activation",
        "engineer_intro",
        "intel_overlay_expand",
        "engineer_orders",
        "enemy_response",
        "artillery_support_intro",
        "select_artillery_observer",
        "artillery_intro",
        "post_artillery_enemy_response",
        "select_attack_unit",
        "smoke_demo",
        "attack_intro",
        "mission_objectives",
        "complete"
    ];
}
