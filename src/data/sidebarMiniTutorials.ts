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
      "General, this is the command post. Confirm objectives, turn pressure, readiness, and war-room hotspots before you commit the next move.",
    highlightSelector: "#warRoomOverlay .war-room-surface",
    position: "center",
    actionLabel: "Close Brief"
  },
  {
    key: "generalProfile",
    title: "GEN: Your Commander",
    content:
      "Your command traits shape the fight. Check bonuses and directives here before choosing how hard to push the line.",
    highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] #generalProfileContent",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Understood"
  },
  {
    key: "recon",
    title: "REC: Contact Picture",
    content:
      "Recon turns fog into targets. Use this board to see who has eyes on the enemy, what they spotted, and where confidence is thin.",
    highlightSelector: ".battle-popup[data-popup-key=\"recon\"] [data-recon-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Scout On"
  },
  {
    key: "airSupport",
    title: "AIR: Sortie Board",
    content:
      "Air power is off-map until you task it. Pick a mission, assign a squadron, choose a target or patrol zone, then launch the order.",
    highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Air Ready"
  },
  {
    key: "logistics",
    title: "LOG: Keep Guns Fed",
    content:
      "Logistics decides who keeps moving and firing. Watch ammo, fuel, convoy status, and priority so the front does not outrun the depot.",
    highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] #logisticsPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Supply Checked"
  },
  {
    key: "armyRoster",
    title: "ROSTER: Order of Battle",
    content:
      "This is your force ledger: deployed units, reserves, support, casualties, and current readiness. Use it before committing reserves.",
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
