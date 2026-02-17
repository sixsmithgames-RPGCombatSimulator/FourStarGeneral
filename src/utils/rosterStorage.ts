/**
 * Roster persistence utilities for importing/exporting general profiles.
 * Handles localStorage and file-based roster management.
 */

/**
 * Default filename for roster export.
 */
export const ROSTER_FILE_NAME = "four-star-general-roster.json";

/**
 * LocalStorage key for general roster data.
 */
const ROSTER_STORAGE_KEY = "fourStarGeneral_generalRoster";
const LEGACY_ROSTER_STORAGE_KEY = "four-star-general/roster";
const LEGACY_PROFILE_STORAGE_KEY = "four-star-general/profile";

interface LegacyGeneralIdentity {
  name?: string | null;
  rank?: string | null;
  originLabel?: string | null;
  schoolLabel?: string | null;
  commissionedAt?: string | null;
}

interface LegacyGeneralMetrics {
  successRate?: number | null;
  missionsCompleted?: number | null;
  objectivesReached?: number | null;
  unitsLost?: number | null;
  unitsFielded?: number | null;
}

interface LegacyGeneralProfile {
  identity?: LegacyGeneralIdentity | null;
  metrics?: LegacyGeneralMetrics | null;
}

interface LegacyRosterStorageEntry {
  id?: string;
  createdAt?: string;
  profile?: LegacyGeneralProfile | null;
}

export interface GeneralStatBlock {
  accBonus: number;
  dmgBonus: number;
  moveBonus: number;
  supplyBonus: number;
}

export interface GeneralIdentity {
  name: string;
  rank?: string;
  affiliation?: string;
  regionKey?: string;
  regionLabel?: string;
  schoolKey?: string;
  schoolLabel?: string;
  commissionedAt?: string | null;
}

/**
 * Simplified general profile structure for roster storage.
 * Contains only essential identity and stats data.
 */
export interface GeneralRosterEntry {
  id: string;
  identity: GeneralIdentity;
  stats: GeneralStatBlock;
  serviceRecord?: {
    missionsCompleted: number;
    victoriesAchieved: number;
    unitsDeployed: number;
    casualtiesSustained: number;
  };
  createdAt?: string;
}

/**
 * In-memory roster storage.
 * Initialized from localStorage on application start.
 */
export let generalRosterEntries: GeneralRosterEntry[] = [];

/**
 * Initialize roster from localStorage.
 * Called automatically on module load.
 */
export function initializeRoster(): void {
  try {
    const stored = window.localStorage.getItem(ROSTER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        generalRosterEntries = parsed;
        return;
      }
    }

    const migrated = migrateLegacyRoster();
    if (migrated.length > 0) {
      generalRosterEntries = migrated;
      saveRosterToLocalStorage();
      return;
    }

    generalRosterEntries = [];
  } catch (error) {
    console.error("Failed to load roster from localStorage:", error);
    generalRosterEntries = [];
  }
}

function migrateLegacyRoster(): GeneralRosterEntry[] {
  try {
    const legacyRosterRaw = window.localStorage.getItem(LEGACY_ROSTER_STORAGE_KEY);
    if (legacyRosterRaw) {
      const parsed = JSON.parse(legacyRosterRaw);
      if (Array.isArray(parsed)) {
        const converted = parsed
          .map((entry) => normalizeLegacyRosterEntry(entry as LegacyRosterStorageEntry))
          .filter((entry): entry is GeneralRosterEntry => Boolean(entry));
        if (converted.length > 0) {
          return converted;
        }
      }
    }

    const legacyProfileRaw = window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY);
    if (legacyProfileRaw) {
      const legacyProfile = JSON.parse(legacyProfileRaw) as LegacyGeneralProfile;
      const normalized = normalizeLegacyProfile(legacyProfile);
      if (normalized) {
        return [normalized];
      }
    }
  } catch (error) {
    console.warn("Legacy roster migration failed", error);
  }

  return [];
}

function normalizeLegacyRosterEntry(entry: LegacyRosterStorageEntry): GeneralRosterEntry | null {
  const profile = entry.profile ?? null;
  const normalized = normalizeLegacyProfile(profile);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    id: entry.id ?? generateGeneralId(normalized.identity.name),
    createdAt: entry.createdAt ?? new Date().toISOString()
  };
}

function normalizeLegacyProfile(profile: LegacyGeneralProfile | null): GeneralRosterEntry | null {
  if (!profile || !profile.identity) {
    return null;
  }

  const identity = profile.identity;
  const name = typeof identity.name === "string" ? identity.name.trim() : "";
  if (!name) {
    return null;
  }

  const rank = identity.rank ?? undefined;
  const regionLabel = identity.originLabel ?? undefined;
  const schoolLabel = identity.schoolLabel ?? undefined;
  const affiliationParts: string[] = [];
  if (rank) {
    affiliationParts.push(rank);
  }
  if (regionLabel) {
    affiliationParts.push(regionLabel);
  }
  if (schoolLabel) {
    affiliationParts.push(schoolLabel);
  }
  const affiliation = affiliationParts.length > 0 ? affiliationParts.join(" • ") : undefined;

  const metrics = profile.metrics ?? {};

  return {
    id: generateGeneralId(name),
    identity: {
      name,
      rank,
      affiliation,
      regionKey: regionLabel ? slugifyValue(regionLabel) || undefined : undefined,
      regionLabel,
      schoolKey: schoolLabel ? slugifyValue(schoolLabel) || undefined : undefined,
      schoolLabel,
      commissionedAt: identity.commissionedAt ?? null
    },
    stats: {
      accBonus: Number(metrics.successRate ?? 0),
      dmgBonus: Number(metrics.objectivesReached ?? 0),
      moveBonus: Number(metrics.unitsFielded ?? 0),
      supplyBonus: Number(metrics.unitsLost ?? 0)
    },
    serviceRecord: {
      missionsCompleted: Number(metrics.missionsCompleted ?? 0),
      victoriesAchieved: Math.round((metrics.successRate ?? 0) * (metrics.missionsCompleted ?? 0)),
      unitsDeployed: Number(metrics.unitsFielded ?? 0),
      casualtiesSustained: Number(metrics.unitsLost ?? 0)
    },
    createdAt: new Date().toISOString()
  };
}

function slugifyValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateGeneralId(name: string): string {
  const slug = slugifyValue(name);
  return `${slug || "general"}-${Date.now()}`;
}

/**
 * Save current roster to localStorage.
 */
export function saveRosterToLocalStorage(): void {
  try {
    window.localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(generalRosterEntries));
  } catch (error) {
    console.error("Failed to save roster to localStorage:", error);
  }
}

/**
 * Add a general to the roster.
 * @param entry - General roster entry to add
 */
export function addGeneralToRoster(entry: GeneralRosterEntry): void {
  generalRosterEntries.push(entry);
  saveRosterToLocalStorage();
}

/**
 * Remove a general from the roster by ID.
 * @param generalId - ID of the general to remove
 * @returns True if general was found and removed
 */
export function removeGeneralFromRoster(generalId: string): boolean {
  const initialLength = generalRosterEntries.length;
  generalRosterEntries = generalRosterEntries.filter((entry) => entry.id !== generalId);
  const removed = generalRosterEntries.length < initialLength;
  if (removed) {
    saveRosterToLocalStorage();
  }
  return removed;
}

/**
 * Find a general in the roster by ID.
 * @param generalId - ID of the general to find
 * @returns General roster entry or null if not found
 */
export function findGeneralById(generalId: string): GeneralRosterEntry | null {
  return generalRosterEntries.find((entry) => entry.id === generalId) ?? null;
}

/**
 * Update an existing general's data in the roster.
 * @param generalId - ID of the general to update
 * @param updates - Partial general data to merge
 * @returns True if general was found and updated
 */
export function updateGeneral(generalId: string, updates: Partial<GeneralRosterEntry>): boolean {
  const index = generalRosterEntries.findIndex((entry) => entry.id === generalId);
  if (index === -1) {
    return false;
  }
  generalRosterEntries[index] = { ...generalRosterEntries[index], ...updates };
  saveRosterToLocalStorage();
  return true;
}

/**
 * Export roster to a JSON file.
 * Triggers a browser download of the roster data.
 */
export function saveRosterToFile(): void {
  const data = JSON.stringify(generalRosterEntries, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = ROSTER_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import roster from a JSON file.
 * Merges imported data with existing roster (avoiding duplicates by ID).
 * @param file - File object containing roster JSON data
 * @throws Error if file cannot be parsed or contains invalid data
 */
export async function loadRosterFromFile(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid roster file format: expected array of general entries");
  }

  // Validate each entry has required fields
  for (const entry of parsed) {
    if (!entry.id || !entry.identity || !entry.stats) {
      throw new Error("Invalid roster entry: missing required fields (id, identity, stats)");
    }
  }

  // Merge with existing roster, avoiding duplicates by ID
  const existingIds = new Set(generalRosterEntries.map((entry) => entry.id));
  const newEntries = parsed.filter((entry: GeneralRosterEntry) => !existingIds.has(entry.id));

  generalRosterEntries.push(...newEntries);
  saveRosterToLocalStorage();
}

/**
 * Clear all generals from the roster.
 * @param confirm - Safety confirmation flag (must be true to proceed)
 */
export function clearRoster(confirm: boolean): void {
  if (!confirm) {
    throw new Error("Roster clear requires confirmation");
  }
  generalRosterEntries = [];
  saveRosterToLocalStorage();
}

/**
 * Get count of generals in roster.
 * @returns Number of generals in roster
 */
export function getRosterCount(): number {
  return generalRosterEntries.length;
}

/**
 * Get all generals in the roster.
 * @returns Copy of roster entries array
 */
export function getAllGenerals(): GeneralRosterEntry[] {
  return [...generalRosterEntries];
}

let rosterInitialized = false;

export function ensureRosterInitialized(): void {
  if (!rosterInitialized) {
    initializeRoster();
    rosterInitialized = true;
  }
}

// Initialize roster on module load
initializeRoster();
rosterInitialized = true;
