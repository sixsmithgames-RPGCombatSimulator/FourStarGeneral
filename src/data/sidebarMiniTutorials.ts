import type { PopupKey } from "../contracts/IPopupManager";

export const SIDEBAR_MINI_TUTORIAL_EVENT = "tutorial:sidebarMiniTutorial";

export type SidebarMiniTutorialKey =
  | "baseOperations"
  | "generalProfile"
  | "recon"
  | "airSupport"
  | "logistics"
  | "armyRoster";

export interface SidebarMiniTutorialRequest {
  readonly key: PopupKey;
  readonly force?: boolean;
}

export interface SidebarMiniTutorialStep {
  readonly title: string;
  readonly content: string;
  readonly highlightSelector: string;
  readonly highlightFirstMatch?: boolean;
  readonly position: "top" | "bottom" | "left" | "right" | "center";
  readonly arrowDirection?: "up" | "down" | "left" | "right";
  readonly actionLabel?: string;
  readonly waitForActionSelector?: string;
  readonly actionHint?: string;
}

export interface SidebarMiniTutorialDefinition {
  readonly key: SidebarMiniTutorialKey;
  readonly label: string;
  readonly steps: readonly SidebarMiniTutorialStep[];
}

export const SIDEBAR_MINI_TUTORIALS: readonly SidebarMiniTutorialDefinition[] = [
  {
    key: "baseOperations",
    label: "OPS Brief",
    steps: [
      {
        title: "The Command Post",
        content: "Use this room for the broad view: current orders, battlefield reports, losses, supply, and the time remaining.",
        highlightSelector: "#warRoomOverlay [data-war-room-command-strip]",
        position: "bottom",
        arrowDirection: "up",
        actionLabel: "Show Reports"
      },
      {
        title: "Open A Report",
        content: "The marked desks and map positions hold detailed reports. Select one whenever you need more than the command rail can show.",
        highlightSelector: "#warRoomOverlay .war-room-hotspot",
        highlightFirstMatch: true,
        position: "right",
        arrowDirection: "left",
        waitForActionSelector: "#warRoomOverlay .war-room-hotspot",
        actionHint: "Select a marked report in the room."
      },
      {
        title: "Read The Report",
        content: "The report gives the latest figures and command notes. Close it to inspect another part of the room.",
        highlightSelector: "#warRoomDetail",
        position: "right",
        arrowDirection: "left",
        actionLabel: "Brief Complete"
      }
    ]
  },
  {
    key: "generalProfile",
    label: "General Brief",
    steps: [
      {
        title: "Your Command Record",
        content: "This is your commanding officer's record. It summarizes the strengths brought to every operation.",
        highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] .general-profile__identity",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Bonuses"
      },
      {
        title: "Command Bonuses",
        content: "These figures show the active bonuses applied to movement, supply, reconnaissance, and combat.",
        highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] .general-profile__benefit",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Directives"
      },
      {
        title: "Traits And Directives",
        content: "Traits describe how this commander fights. Directives are the current orders and conditions shaping the operation.",
        highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] #generalProfileDirectives",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Brief Complete"
      }
    ]
  },
  {
    key: "recon",
    label: "Recon Brief",
    steps: [
      {
        title: "The Observation Net",
        content: "This board reports only what your reconnaissance units can see now. Old or uncertain contacts are not treated as fact.",
        highlightSelector: ".battle-popup[data-popup-key=\"recon\"] .recon-readiness-board",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Observers"
      },
      {
        title: "Your Observers",
        content: "Each row begins with the formation making the report. Its position and viewing range determine what appears beside it.",
        highlightSelector: ".battle-popup[data-popup-key=\"recon\"] .recon-observer-card",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Contacts"
      },
      {
        title: "Read The Contact",
        content: "Check the reported position, age, and confidence before acting. Move observers forward to refresh a weak or missing report.",
        highlightSelector: ".battle-popup[data-popup-key=\"recon\"] .recon-contact-item",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        actionLabel: "Brief Complete"
      }
    ]
  },
  {
    key: "airSupport",
    label: "Air Brief",
    steps: [
      {
        title: "Air Readiness",
        content: "Start here. On Deck aircraft can receive orders; In Flight aircraft are committed; Refit aircraft are not yet ready.",
        highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] .air-readiness-board",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Choose A Mission"
      },
      {
        title: "Choose The Mission",
        content: "Select the kind of sortie you need. The order board changes to show the aircraft, target, and escort choices for that mission.",
        highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-mission-tabs]",
        position: "left",
        arrowDirection: "right",
        waitForActionSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-mission-tab]",
        actionHint: "Select a mission type on the sortie board."
      },
      {
        title: "Prepare The Sortie",
        content: "When a squadron is ready, choose it, mark its target, and add an escort when needed. Review the order before sending it.",
        highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-sortie-board]",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Mission Roster"
      },
      {
        title: "Track Every Sortie",
        content: "Queued missions can still be cancelled. Once aircraft launch, follow their progress here until they return for refit.",
        highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] .air-section",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Brief Complete"
      }
    ]
  },
  {
    key: "logistics",
    label: "Logistics Brief",
    steps: [
      {
        title: "Supply Situation",
        content: "Begin with the status report. It warns when ammunition, fuel, convoy coverage, or the supply queue needs attention.",
        highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] [data-logistics-overview]",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Stocks"
      },
      {
        title: "Where The Supply Is",
        content: "These cards separate stock carried by formations, cargo moving with convoys, and reserves still held at base camp.",
        highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] [data-logistics-supply-categories]",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Priorities"
      },
      {
        title: "Set Supply Priority",
        content: "Set the first formation to Critical. Convoys serve critical formations before lower priorities.",
        highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] .logistics-priority-card [data-logistics-priority=\"critical\"]",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        waitForActionSelector: ".battle-popup[data-popup-key=\"logistics\"] .logistics-priority-card [data-logistics-priority=\"critical\"]",
        actionHint: "Set the highlighted formation to Critical priority."
      },
      {
        title: "Follow The Convoys",
        content: "Convoy status shows each load and destination. Keep these routes open or frontline formations will run short.",
        highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] .logistics-convoy-item",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        actionLabel: "Brief Complete"
      }
    ]
  },
  {
    key: "armyRoster",
    label: "Roster Brief",
    steps: [
      {
        title: "Order Of Battle",
        content: "The summary counts formations at the front, in reserve, and serving in support. Use it for a quick strength check.",
        highlightSelector: ".battle-popup[data-popup-key=\"armyRoster\"] .army-roster-summary",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Frontline"
      },
      {
        title: "Frontline Readiness",
        content: "Frontline entries show strength, ammunition, fuel, movement, and suppression. Check them before assigning the next attack.",
        highlightSelector: ".battle-popup[data-popup-key=\"armyRoster\"] [data-roster-list=\"frontline\"] .army-roster-entry",
        highlightFirstMatch: true,
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Reserves"
      },
      {
        title: "Reserves And Support",
        content: "Reserves are available for later commitment. Support formations remain off the firing line while carrying out their assigned work.",
        highlightSelector: ".battle-popup[data-popup-key=\"armyRoster\"] [data-roster-section=\"reserves\"] > header",
        position: "left",
        arrowDirection: "right",
        actionLabel: "Show Requisitions"
      },
      {
        title: "Request Reinforcements",
        content: "Open Battle Requisitions. Check each formation's cost and arrival delay before placing the order.",
        highlightSelector: ".battle-popup[data-popup-key=\"armyRoster\"] [data-open-battle-requisitions]",
        position: "left",
        arrowDirection: "right",
        waitForActionSelector: ".battle-popup[data-popup-key=\"armyRoster\"] [data-open-battle-requisitions]",
        actionHint: "Open Battle Requisitions."
      }
    ]
  }
];

const MINI_TUTORIAL_BY_KEY = new Map<SidebarMiniTutorialKey, SidebarMiniTutorialDefinition>(
  SIDEBAR_MINI_TUTORIALS.map((tutorial) => [tutorial.key, tutorial])
);

export function normalizeSidebarMiniTutorialKey(key: PopupKey): SidebarMiniTutorialKey | null {
  const normalized = key === "supplies" ? "logistics" : key;
  switch (normalized) {
    case "baseOperations":
    case "generalProfile":
    case "recon":
    case "airSupport":
    case "logistics":
    case "armyRoster":
      return normalized;
    default:
      return null;
  }
}

export function getSidebarMiniTutorial(key: PopupKey): SidebarMiniTutorialDefinition | null {
  const normalized = normalizeSidebarMiniTutorialKey(key);
  return normalized ? MINI_TUTORIAL_BY_KEY.get(normalized) ?? null : null;
}
