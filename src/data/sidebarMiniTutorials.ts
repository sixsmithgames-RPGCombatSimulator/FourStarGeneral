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
      "General, this is the command post. Check objectives, round pressure, and theater reports before committing the next initiative group.",
    highlightSelector: "#warRoomOverlay .war-room-surface",
    position: "center",
    actionLabel: "Close Brief"
  },
  {
    key: "generalProfile",
    title: "GEN: Your Commander",
    content:
      "Your command traits shape tempo. Check bonuses and directives before deciding whether to press, hold, or conserve the line.",
    highlightSelector: ".battle-popup[data-popup-key=\"generalProfile\"] #generalProfileContent",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Understood"
  },
  {
    key: "recon",
    title: "REC: Contact Picture",
    content:
      "Recon acts early and turns fog into targets. Use fast eyes to reveal threats before slower guns and armor commit.",
    highlightSelector: ".battle-popup[data-popup-key=\"recon\"] [data-recon-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Scout On"
  },
  {
    key: "airSupport",
    title: "AIR: Sortie Board",
    content:
      "Aircraft sit outside the ground initiative clock. Task sorties here, choose targets or patrol zones, then let air resolve on its own timing.",
    highlightSelector: ".battle-popup[data-popup-key=\"airSupport\"] [data-air-panel]",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Air Ready"
  },
  {
    key: "logistics",
    title: "LOG: Keep Guns Fed",
    content:
      "Logistics is slow tempo, decisive effect. Set priorities, watch ammo and fuel, and keep convoys from chasing a front they cannot reach.",
    highlightSelector: ".battle-popup[data-popup-key=\"logistics\"] #logisticsPanel",
    position: "left",
    arrowDirection: "right",
    actionLabel: "Supply Checked"
  },
  {
    key: "armyRoster",
    title: "ROSTER: Order of Battle",
    content:
      "Your force ledger shows deployed units, reserves, losses, readiness, and initiative values. Use it before committing the next group.",
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
