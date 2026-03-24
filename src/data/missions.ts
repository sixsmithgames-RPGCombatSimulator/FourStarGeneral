/**
 * Mission metadata and briefing content.
 * Defines all available mission types with their titles and detailed briefing text.
 */

import type { BotDifficulty } from "../game/bot/BotPlanner";
import type { MissionKey } from "../state/UIState";

/**
 * Human-readable mission titles for display in the UI.
 * Maps mission keys to their display names.
 */
export const missionTitles: Record<MissionKey, string> = {
  training: "Training Exercise",
  patrol: "Border Patrol",
  patrol_river_watch: "River Crossing Watch",
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

  patrol_river_watch:
    "Recon reports enemy infiltrators massing along the river. Multiple shallow fords cut through the bend—if they slip across, they'll have a lodgment before dawn. " +
    "Deploy your patrols to occupy and hold each crossing with your units.\n\n" +
    "VICTORY: Hold ALL THREE fords simultaneously with your forces for 8 consecutive turns.\n" +
    "DEFEAT: Mission fails if the enemy secures and holds any ford for 8 consecutive turns.",

  assault:
    "Execute a tactical assault on enemy positions to secure strategic objectives. " +
    "Expect heavy resistance and well-fortified defenses. Air and artillery support available on request.",

  campaign:
    "Launch the Western Europe offensive to liberate occupied territory and secure critical ports. " +
    "Advance fronts, manage scarce resources, and coordinate air support over multiple linked operations."
};

export interface MissionSummaryPackage {
  readonly objectives: readonly string[];
  readonly turnLimit: number;
  readonly doctrine: string;
  readonly supplies: ReadonlyArray<{ readonly label: string; readonly amount: string }>;
}

export type MissionCategory = "training" | "patrol" | "assault" | "campaign";

export interface MissionDeploymentZoneDoctrine {
  readonly zoneKey: string;
  readonly minimumCapacity: number;
  readonly minimumFrontage: number;
  readonly minimumDepth: number;
}

export interface MissionDeploymentValidationProfile {
  readonly minimumPlayerZoneCapacityTotal: number;
  readonly minimumPlayerZoneFrontage: number;
  readonly minimumPlayerZoneDepth: number;
}

export interface MissionDeploymentProfile {
  readonly preferredZoneKey: string | null;
  readonly focusLabel: string;
  readonly validation: MissionDeploymentValidationProfile;
  readonly zoneDoctrine: readonly MissionDeploymentZoneDoctrine[];
}

export interface MissionProfile {
  readonly title: string;
  readonly briefing: string;
  readonly category: MissionCategory;
  readonly summary: MissionSummaryPackage;
  readonly deployment: MissionDeploymentProfile;
}

const RIVER_WATCH_TURN_LIMIT_BY_DIFFICULTY: Record<BotDifficulty, number> = {
  Easy: 14,
  Normal: 12,
  Hard: 11
};

export const missionSummaryPackages: Record<MissionKey, MissionSummaryPackage> = {
  training: {
    objectives: [
      "Execute training maneuvers without exceeding casualty thresholds.",
      "Rotate every unit type through live-fire exercises."
    ],
    turnLimit: 8,
    doctrine: "Emphasize combined-arms rehearsal; focus on communication drills over live combat.",
    supplies: [
      { label: "Rations", amount: "Full stock" },
      { label: "Fuel", amount: "Minimal usage expected" },
      { label: "Ammo", amount: "Live-fire allotment only" }
    ]
  },
  patrol: {
    objectives: [
      "Reconnoiter border checkpoints and report hostile sightings.",
      "Maintain radio contact with HQ at each waypoint."
    ],
    turnLimit: 30,
    doctrine: "Maintain flexible response posture; adhere to reconnaissance-in-force doctrine.",
    supplies: [
      { label: "Rations", amount: "Standard patrol pack" },
      { label: "Fuel", amount: "50% reserve" },
      { label: "Ammo", amount: "Issue combat load" }
    ]
  },
  patrol_river_watch: {
    objectives: [
      "Primary: Hold all three fords simultaneously for 8 consecutive turns.",
      "Secondary: Destroy the enemy comms team before it reaches the central ford.",
      "Tertiary: Keep at least one recon unit alive."
    ],
    turnLimit: 99,
    doctrine: "Occupy all three crossings with your units. Shift forces between hedgerow lanes before the enemy can mass. Hold the two off-map 81mm mortar fire missions for the ford that starts to buckle.",
    supplies: [
      { label: "Predeployed Patrol", amount: "2 rifle squads, engineers, recon bike patrol" },
      { label: "Off-map 81mm Mortar", amount: "2 fire missions" },
      { label: "Duration", amount: "11-14 turns depending on difficulty" }
    ]
  },
  assault: {
    objectives: [
      "Seize primary defensive line within allotted turns.",
      "Neutralize hardened positions before reinforcements arrive."
    ],
    turnLimit: 99,
    doctrine: "Coordinate armored thrust with artillery suppression per breakthrough doctrine.",
    supplies: [
      { label: "Rations", amount: "Forward stockpile" },
      { label: "Fuel", amount: "Full combat reserve" },
      { label: "Ammo", amount: "High consumption expected" }
    ]
  },
  campaign: {
    objectives: [
      "Capture sequential strategic nodes to cut enemy logistics.",
      "Sustain momentum across multi-phase offensive."
    ],
    turnLimit: 999,
    doctrine: "Apply deep operations doctrine; safeguard supply corridors at all times.",
    supplies: [
      { label: "Rations", amount: "Bulk depot established" },
      { label: "Fuel", amount: "Escort convoys nightly" },
      { label: "Ammo", amount: "Allocate heavy artillery shells" }
    ]
  }
};

const missionCategories: Record<MissionKey, MissionCategory> = {
  training: "training",
  patrol: "patrol",
  patrol_river_watch: "patrol",
  assault: "assault",
  campaign: "campaign"
};

const missionDeploymentProfiles: Record<MissionKey, MissionDeploymentProfile> = {
  training: {
    preferredZoneKey: "zone-alpha",
    focusLabel: "training line",
    validation: {
      minimumPlayerZoneCapacityTotal: 20,
      minimumPlayerZoneFrontage: 5,
      minimumPlayerZoneDepth: 4
    },
    zoneDoctrine: [
      {
        zoneKey: "zone-alpha",
        minimumCapacity: 12,
        minimumFrontage: 5,
        minimumDepth: 4
      },
      {
        zoneKey: "zone-bravo",
        minimumCapacity: 16,
        minimumFrontage: 5,
        minimumDepth: 4
      }
    ]
  },
  patrol: {
    preferredZoneKey: "zone-alpha",
    focusLabel: "patrol line",
    validation: {
      minimumPlayerZoneCapacityTotal: 16,
      minimumPlayerZoneFrontage: 5,
      minimumPlayerZoneDepth: 3
    },
    zoneDoctrine: [
      {
        zoneKey: "zone-alpha",
        minimumCapacity: 12,
        minimumFrontage: 5,
        minimumDepth: 4
      },
      {
        zoneKey: "zone-bravo",
        minimumCapacity: 16,
        minimumFrontage: 5,
        minimumDepth: 4
      }
    ]
  },
  patrol_river_watch: {
    preferredZoneKey: "allied-start",
    focusLabel: "line of departure",
    validation: {
      minimumPlayerZoneCapacityTotal: 16,
      minimumPlayerZoneFrontage: 5,
      minimumPlayerZoneDepth: 3
    },
    zoneDoctrine: [
      {
        zoneKey: "allied-start",
        minimumCapacity: 16,
        minimumFrontage: 5,
        minimumDepth: 3
      }
    ]
  },
  assault: {
    preferredZoneKey: "zone-alpha",
    focusLabel: "assault line",
    validation: {
      minimumPlayerZoneCapacityTotal: 20,
      minimumPlayerZoneFrontage: 5,
      minimumPlayerZoneDepth: 4
    },
    zoneDoctrine: [
      {
        zoneKey: "zone-alpha",
        minimumCapacity: 12,
        minimumFrontage: 5,
        minimumDepth: 4
      },
      {
        zoneKey: "zone-bravo",
        minimumCapacity: 16,
        minimumFrontage: 5,
        minimumDepth: 4
      }
    ]
  },
  campaign: {
    preferredZoneKey: "zone-alpha",
    focusLabel: "forward line",
    validation: {
      minimumPlayerZoneCapacityTotal: 20,
      minimumPlayerZoneFrontage: 5,
      minimumPlayerZoneDepth: 4
    },
    zoneDoctrine: [
      {
        zoneKey: "zone-alpha",
        minimumCapacity: 12,
        minimumFrontage: 5,
        minimumDepth: 4
      },
      {
        zoneKey: "zone-bravo",
        minimumCapacity: 16,
        minimumFrontage: 5,
        minimumDepth: 4
      }
    ]
  }
};

export function getMissionProfile(mission: MissionKey, difficulty: BotDifficulty): MissionProfile {
  return {
    title: getMissionTitle(mission),
    briefing: getMissionBriefing(mission),
    category: missionCategories[mission],
    summary: getMissionSummaryPackage(mission, difficulty),
    deployment: missionDeploymentProfiles[mission]
  };
}

export function getMissionDeploymentProfile(mission: MissionKey): MissionDeploymentProfile {
  return missionDeploymentProfiles[mission];
}

export function getMissionDeploymentZoneDoctrine(mission: MissionKey, zoneKey: string): MissionDeploymentZoneDoctrine | null {
  return missionDeploymentProfiles[mission].zoneDoctrine.find((zone) => zone.zoneKey === zoneKey) ?? null;
}

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

export function getMissionTurnLimit(mission: MissionKey, difficulty: BotDifficulty): number {
  if (mission === "patrol_river_watch") {
    return RIVER_WATCH_TURN_LIMIT_BY_DIFFICULTY[difficulty];
  }

  return missionSummaryPackages[mission].turnLimit;
}

export function getMissionSummaryPackage(mission: MissionKey, difficulty: BotDifficulty): MissionSummaryPackage {
  const summary = missionSummaryPackages[mission];
  const turnLimit = getMissionTurnLimit(mission, difficulty);

  if (mission !== "patrol_river_watch") {
    return summary;
  }

  return {
    ...summary,
    turnLimit
  };
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
