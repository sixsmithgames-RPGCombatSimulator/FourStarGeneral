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

export interface SidebarMiniTutorialDefinition {
  readonly key: SidebarMiniTutorialKey;
  readonly title: string;
  readonly content: string;
  readonly highlightSelector: string;
  readonly position: "top" | "bottom" | "left" | "right" | "center";
  readonly arrowDirection?: "up" | "down" | "left" | "right";
  readonly actionLabel: string;
}

export const SIDEBAR_MINI_TUTORIALS: readonly SidebarMiniTutorialDefinition[] = [
  {
    key: "baseOperations",
    title: "OPS: Command Post",
    content:
      "This is the command post. Check objectives, turn status, and reports before issuing major orders.",
    highlightSelector: "#warRoomOverlay .war-room-surface",
    position: "center",
    actionLabel: "Close Brief"
  },
  {
    key: "generalProfile",
    title: "GEN: Your Commander",
    content:
      "This board shows commander bonuses and directives. Review it before choosing where to press or hold.",
    highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] #generalProfileContent",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Understood"
  },
  {
    key: "recon",
    title: "REC: Contact Picture",
    content:
      "Recon reveals enemy positions and terrain. Use it early so your guns and armor are not firing blind.",
    highlightSelector: ".battle-popup[data-popup-key=\"recon\"] [data-recon-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Scout On"
  },
  {
    key: "airSupport",
    title: "AIR: Sortie Board",
    content:
      "Plan air missions here. Choose strike or patrol, assign a target area, then let sorties resolve.",
    highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Air Ready"
  },
  {
    key: "logistics",
    title: "LOG: Keep Guns Fed",
    content:
      "Logistics keeps your force fighting. Track ammo and fuel, set priorities, and protect supply convoys.",
    highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] #logisticsPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Supply Checked"
  },
  {
    key: "armyRoster",
    title: "ROSTER: Order of Battle",
    content:
      "Roster shows deployed units, reserves, losses, readiness, and initiative. Check it before major attacks.",
    highlightSelector: ".battle-popup[data-popup-key=\"armyRoster\"] #armyRosterContent",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Roster Reviewed"
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
