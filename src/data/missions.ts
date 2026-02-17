/**
 * Mission metadata and briefing content.
 * Defines all available mission types with their titles and detailed briefing text.
 */

import type { MissionKey } from "../state/UIState";

/**
 * Human-readable mission titles for display in the UI.
 * Maps mission keys to their display names.
 */
export const missionTitles: Record<MissionKey, string> = {
  training: "Training Exercise",
  patrol: "Border Patrol",
  assault: "Tactical Assault",
  // Campaign is surfaced on the landing screen as "Western Europe" to anchor the first grand-operation offering.
  campaign: "Western Europe Campaign"
};

/**
 * Detailed mission briefing text for each mission type.
 * Displayed to the player on the landing screen when selecting a mission.
 */
export const missionBriefings: Record<MissionKey, string> = {
  training:
    "This is a low-stakes training exercise designed to familiarize your forces with operational procedures. " +
    "Focus on unit coordination and terrain assessment. No hostile contact expected.",

  patrol:
    "Conduct a routine border patrol to secure the perimeter and identify potential enemy reconnaissance units. " +
    "Maintain defensive posture and report any suspicious activity. Light resistance anticipated.",

  assault:
    "Execute a tactical assault on enemy positions to secure strategic objectives. " +
    "Expect heavy resistance and well-fortified defenses. Air and artillery support available on request.",

  campaign:
    "Launch the Western Europe offensive to liberate occupied territory and secure critical ports. " +
    "Advance fronts, manage scarce resources, and coordinate air support over multiple linked operations."
};

/**
 * Get mission title by key.
 * @param mission - Mission key identifier
 * @returns Human-readable mission title
 */
export function getMissionTitle(mission: MissionKey): string {
  return missionTitles[mission] ?? "Unknown Mission";
}

/**
 * Get mission briefing text by key.
 * @param mission - Mission key identifier
 * @returns Detailed mission briefing text
 */
export function getMissionBriefing(mission: MissionKey): string {
  return missionBriefings[mission] ?? "No briefing available.";
}

/**
 * Get all available mission keys.
 * @returns Array of all mission keys
 */
export function getAllMissionKeys(): MissionKey[] {
  return Object.keys(missionTitles) as MissionKey[];
}

/**
 * Check if a mission key is valid.
 * @param key - Key to validate
 * @returns True if the mission exists
 */
export function isValidMission(key: string): key is MissionKey {
  return key in missionTitles;
}
