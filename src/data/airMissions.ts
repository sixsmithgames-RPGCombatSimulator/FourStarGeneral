import type { AirMissionTemplate } from "../core/types";

/**
 * Static catalog of player-facing Air Support missions.
 * Each entry defines who can fly the mission plus the UX copy surfaced in the planner.
 */
export const AIR_MISSION_TEMPLATES: readonly AirMissionTemplate[] = [
  {
    kind: "strike",
    label: "Strike Target",
    description: "Fly a sortie to attack a designated enemy hex and return to base within the turn.",
    allowedRoles: ["strike"],
    requiresTarget: true,
    requiresFriendlyEscortTarget: false,
    durationTurns: 0
  },
  {
    kind: "escort",
    label: "Escort Bombers",
    description: "Protect a friendly strike package by intercepting hostile fighters along the route.",
    allowedRoles: ["escort", "cap"],
    requiresTarget: false,
    requiresFriendlyEscortTarget: true,
    durationTurns: 0
  },
  {
    kind: "airCover",
    label: "Air Cover",
    description: "Provide combat air patrol over a zone or base, engaging enemy bombers that enter the area.",
    allowedRoles: ["cap"],
    // Target is optional: if provided, CAP covers that hex; if omitted, CAP covers the squadron's base hex.
    requiresTarget: false,
    requiresFriendlyEscortTarget: false,
    durationTurns: 1
  },
  {
    kind: "airTransport",
    label: "Airborne Drop",
    description: "Fly an airborne infantry detachment to a target hex and deploy them behind enemy lines.",
    allowedRoles: ["transport"],
    requiresTarget: true,
    requiresFriendlyEscortTarget: false,
    durationTurns: 0
  }
] as const;
