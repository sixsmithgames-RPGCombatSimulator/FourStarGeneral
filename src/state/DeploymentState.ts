import { axialKey } from "../core/Hex";
import type { ScenarioUnit } from "../core/types";
import { createScenarioUnitFromTemplate, deploymentTemplates, findTemplateForUnitKey } from "../game/adapters";
import { getSpriteForAllocationKey, getSpriteForScenarioType } from "../data/unitSpriteCatalog";
import { getAllocationOption } from "../data/unitAllocation";
import type { GameEngineAPI, ReserveUnit } from "../game/GameEngine";
import unitTypesSource from "../data/unitTypes.json";

export interface DeploymentPoolEntry {
  key: string;
  label: string;
  remaining: number;
  sprite?: string;
}

/**
 * Mirrors the engine reserve payload into a lightweight shape that the UI can render without mutating internals.
 */
export interface ReserveUnitSnapshot {
  unitKey: string;
  label: string;
  remaining: number;
  sprite?: string;
  status: "ready" | "exhausted";
}

/**
 * Describes a unit placed on a deployment hex along with metadata required by the UI layer.
 */
export interface DeploymentPlacementSnapshot {
  hexKey: string;
  unitKey: string;
  faction: "Player" | "Bot";
  sprite?: string;
}

/**
 * Blueprint describing a reserve entry the engine should hydrate. Bundles the originating unit key so
 * deployments keyed by allocation alias can resolve the correct scenario payload.
 */
export interface ReserveBlueprint {
  unitKey: string;
  label: string;
  unit: ScenarioUnit;
  sprite?: string;
}

/**
 * Configuration describing the capacity of a deployment zone and the hex keys that belong to it.
 */
export interface DeploymentZoneDefinition {
  zoneKey: string;
  capacity: number;
  hexKeys: readonly string[];
  name?: string;
  description?: string;
  faction?: "Player" | "Bot";
}

/**
 * Aggregated occupancy metrics for a deployment zone used by status banners.
 */
export interface DeploymentZoneUsageSummary {
  zoneKey: string;
  capacity: number;
  occupied: number;
  remaining: number;
  name?: string;
  description?: string;
  faction?: "Player" | "Bot";
}

/**
 * Optional knobs that guide how engine snapshots are mirrored into the deployment bridge.
 */
export interface DeploymentMirrorOptions {
  readonly placementHints?: ReadonlyMap<string, DeploymentPlacementSnapshot>;
}

export type { UnitAllocationOption } from "../data/unitAllocation";

/**
 * Manages the state of unit deployment including allocation pool, placement mirrors, and reserve tracking.
 * This state is synchronized with the GameEngine during deployment so UI components can render without
 * touching engine internals.
 */
export class DeploymentState {
  /** Units available for deployment including remaining counts. */
  pool: DeploymentPoolEntry[] = [];
  /** Snapshot of units already placed on the map keyed by hex ID. */
  placements = new Map<string, DeploymentPlacementSnapshot>();
  /** Reserves mirror grouped by unit key for simplified rendering. */
  reserves: ReserveUnitSnapshot[] = [];
  private initialized = false;
  private baseCampKey: string | null = null;

  private totalAllocationMap = new Map<string, number>();
  private spriteMap = new Map<string, string>();
  private reserveCountMap = new Map<string, number>();
  private committedEntries: DeploymentPoolEntry[] = [];
  private zoneDefinitions = new Map<
    string,
    { capacity: number; hexKeys: Set<string>; name?: string; description?: string; faction?: "Player" | "Bot" }
  >();
  private zoneOccupancy = new Map<string, number>();
  private hexToZoneKey = new Map<string, string>();
  private scenarioTypeAlias = new Map<string, string>();
  private unitKeyToScenarioType = new Map<string, string>();

  constructor() {
    // Pre-seed scenario → allocation aliases so player rosters derived directly from scenario data still resolve UI keys.
    this.primeSpriteCatalog();
  }

  /**
   * Initializes the deployment pool with available units.
   * @param entries - Array of deployment pool entries derived from precombat allocations.
   */
  initialize(entries: DeploymentPoolEntry[]): void {
    console.log("[DeploymentState] initialize called with entries", entries.map((e) => ({ key: e.key, remaining: e.remaining })));
    this.pool = entries.map((entry) => ({ ...entry }));
    this.committedEntries = entries.map((entry) => ({ ...entry }));
    this.initialized = true;
    this.totalAllocationMap.clear();
    this.reserves = [];
    this.reserveCountMap.clear();
    this.pool.forEach((entry) => {
      this.totalAllocationMap.set(entry.key, entry.remaining);
      this.reserveCountMap.set(entry.key, entry.remaining);
    });
    this.placements.clear();
    this.baseCampKey = null;

    // Seed the sprite cache so placement requests can reference icons without re-querying data modules.
    this.spriteMap.clear();
    this.primeSpriteCatalog();
    this.pool.forEach((entry) => {
      const sprite = entry.sprite ?? this.spriteMap.get(entry.key);
      if (sprite) {
        this.spriteMap.set(entry.key, sprite);
      }
      this.syncReserveSnapshot(entry.key, entry.remaining);
    });

    // Reset zone occupancy so any registered zones start from a clean slate.
    this.zoneOccupancy.clear();
    this.zoneDefinitions.forEach((_, zoneKey) => this.zoneOccupancy.set(zoneKey, 0));
  }

  /**
   * Stores the commander-approved deployment pool so the engine can rebuild reserves after screen swaps.
   * This helper preserves sprite keys and totals exactly as the precombat flow determined them.
   */
  recordCommittedEntries(entries: readonly DeploymentPoolEntry[]): void {
    this.committedEntries = entries.map((entry) => ({ ...entry }));
    console.log("[DeploymentState] recordCommittedEntries", {
      count: this.committedEntries.length,
      keys: this.committedEntries.map((e) => e.key)
    });
  }

  /**
   * Indicates whether the commander has committed any deployment entries. Battle orchestration relies on
   * this flag to decide when a fresh engine needs to be reseeded after the precombat flow completes.
   */
  hasCommittedEntries(): boolean {
    return this.committedEntries.length > 0;
  }

  /**
   * Supplies the list of committed entry keys so orchestration layers can log or assert expectations without mutating state.
   */
  getCommittedEntryKeys(): string[] {
    return this.committedEntries.map((entry) => entry.key);
  }

  private primeSpriteCatalog(): void {
    deploymentTemplates.forEach((template) => {
      const scenarioType = template.type as string;
      // Register only when missing so late overrides can update mappings without duplication.
      if (!this.scenarioTypeAlias.has(scenarioType)) {
        this.scenarioTypeAlias.set(scenarioType, template.key);
      }
      if (!this.unitKeyToScenarioType.has(template.key)) {
        this.unitKeyToScenarioType.set(template.key, scenarioType);
      }

      const sprite = getSpriteForAllocationKey(template.key) ?? getSpriteForScenarioType(scenarioType);
      if (sprite && !this.spriteMap.has(template.key)) {
        this.spriteMap.set(template.key, sprite);
      }
    });
  }

  /**
   * Converts the committed deployment pool into `ScenarioUnit` payloads using allocation templates.
   * The generated units use placeholder hexes; the battle engine positions them during deployment.
   */
  toScenarioUnits(): ScenarioUnit[] {
    return this.toReserveBlueprints().map((blueprint) => structuredClone(blueprint.unit));
  }

  /**
   * Supplies a blueprint list that the engine can use to construct reserves with unit-key associations.
   */
  toReserveBlueprints(): ReserveBlueprint[] {
    const source = this.committedEntries.length > 0 ? this.committedEntries : this.pool;
    const sourceKind = this.committedEntries.length > 0 ? "committed" : "pool";
    const blueprints: ReserveBlueprint[] = [];
    source.forEach((entry) => {
      const template = findTemplateForUnitKey(entry.key);
      if (!template) {
        console.warn(`Deployment template missing for key '${entry.key}'. Skipping committed entry.`);
        return;
      }
      for (let index = 0; index < entry.remaining; index += 1) {
        const unit = createScenarioUnitFromTemplate(template, { q: 0, r: 0 });
        blueprints.push({
          unitKey: entry.key,
          label: entry.label,
          unit,
          sprite: entry.sprite
        });
      }
    });
    console.log("[DeploymentState] toReserveBlueprints", { source: sourceKind, entries: source.map((e) => ({ key: e.key, remaining: e.remaining })), blueprintCount: blueprints.length });
    return blueprints;
  }

  /**
   * Resets the deployment state to empty.
   */
  reset(): void {
    this.pool = [];
    this.placements.clear();
    this.reserves = [];
    this.initialized = false;
    this.totalAllocationMap.clear();
    this.spriteMap.clear();
    this.reserveCountMap.clear();
    this.baseCampKey = null;
    this.zoneOccupancy.clear();
  }

  /**
   * Checks if deployment state has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Finds a pool entry by its key.
   * @param key - The unit type key to search for
   * @returns The matching pool entry or undefined
   */
  findEntry(key: string): DeploymentPoolEntry | undefined {
    return this.pool.find((entry) => entry.key === key);
  }

  /**
   * Updates the remaining count for a specific unit type.
   * @param key - The unit type key
   * @param remaining - The new remaining count
   */
  updateRemaining(key: string, remaining: number): void {
    const entry = this.findEntry(key);
    if (entry) {
      entry.remaining = remaining;
    }
  }

  /**
   * Records a unit placement for the provided hex while keeping aggregate counters aligned.
   * @param hexKey - Axial string key identifying the hex (e.g., "0,2").
   * @param unitKey - Allocation key used by the UI (e.g., "infantryBattalion").
   * @param faction - Owning faction, defaults to the player.
   */
  setPlacement(hexKey: string, unitKey: string, faction: "Player" | "Bot" = "Player"): void {
    const sprite = this.spriteMap.get(unitKey);
    this.placements.set(hexKey, { hexKey, unitKey, faction, sprite });
    this.adjustRemainingCount(unitKey, -1);
    this.decrementReserveCount(unitKey);
    this.incrementZoneOccupancy(hexKey);
  }

  /**
   * Removes any placement stored for the provided hex and restores counts.
   */
  clearPlacement(hexKey: string): void {
    const snapshot = this.placements.get(hexKey);
    if (!snapshot) {
      return;
    }
    this.placements.delete(hexKey);
    this.adjustRemainingCount(snapshot.unitKey, 1);
    this.incrementReserveCount(snapshot.unitKey);
    this.decrementZoneOccupancy(hexKey);
  }

  /**
   * Returns the total number of units deployed (allocated minus remaining).
   */
  getTotalDeployed(): number {
    return this.pool.reduce((sum, entry) => {
      return sum + (this.getUnitCount(entry.key) - entry.remaining);
    }, 0);
  }

  /**
   * Registers the total allocation available for a unit type.
   * This value is used to compute deployed counts in the battle UI.
   */
  setTotalAllocatedUnits(key: string, total: number): void {
    this.totalAllocationMap.set(key, total);
  }

  /**
   * Retrieves the total allocation for a unit type.
   * Falls back to the remaining count if explicit totals were not set.
   */
  getUnitCount(key: string): number {
    if (this.totalAllocationMap.has(key)) {
      return this.totalAllocationMap.get(key)!;
    }
    return this.reserveCountMap.get(key) ?? this.findEntry(key)?.remaining ?? 0;
  }

  /**
   * Reports the number of units currently deployed for the provided key.
   */
  getDeployedCount(key: string): number {
    return this.getUnitCount(key) - (this.reserveCountMap.get(key) ?? 0);
  }

  /**
   * Reports the number of units remaining in reserve for the provided key.
   */
  getReserveCount(key: string): number {
    return this.reserveCountMap.get(key) ?? 0;
  }

  /**
   * Converts internal pool state into roster entries summarizing deployed and reserve counts so UI layers
   * can present battle rosters without re-implementing allocation math.
   */
  buildRosterEntries(): readonly { unitKey: string; label: string; deployed: number; reserve: number; total: number; sprite?: string }[] {
    return this.pool.map((entry) => {
      const total = this.getUnitCount(entry.key);
      const reserve = this.getReserveCount(entry.key);
      const deployed = Math.max(0, total - reserve);
      return {
        unitKey: entry.key,
        label: entry.label,
        deployed,
        reserve,
        total,
        sprite: this.spriteMap.get(entry.key)
      };
    });
  }

  /**
   * Supplies a defensive copy of placement snapshots so UI layers cannot mutate internal state.
   */
  getPlacements(): DeploymentPlacementSnapshot[] {
    return Array.from(this.placements.values(), (placement) => ({ ...placement }));
  }

  /**
   * Surfaces the sprite path registered for the provided unit key, if any.
   * UI consumers rely on this to render consistent icons across loadout and reserve lists.
   * The bridge only records paths that were explicitly registered (e.g., via allocation data),
   * so callers must handle the undefined case by showing a fallback glyph.
   */
  getSpritePath(unitKey: string): string | undefined {
    return this.spriteMap.get(unitKey);
  }

  getUnitKeyForScenarioType(scenarioType: string): string | null {
    return this.ensureScenarioAliasForType(scenarioType);
  }

  /**
   * Retrieves the placement snapshot assigned to a specific hex key, if present.
   */
  getPlacement(hexKey: string): DeploymentPlacementSnapshot | null {
    const snapshot = this.placements.get(hexKey);
    return snapshot ? { ...snapshot } : null;
  }

  /**
   * Exposes the mirrored base camp hex key reported by the engine, or null if unassigned.
   */
  getBaseCampKey(): string | null {
    return this.baseCampKey;
  }

  /**
   * Registers zone capacity metadata so the deployment screen can surface remaining slot counts.
   * Call this once after loading scenario data before invoking mirrorEngineState().
   */
  registerZones(definitions: DeploymentZoneDefinition[]): void {
    this.zoneDefinitions.clear();
    this.hexToZoneKey.clear();
    definitions.forEach((definition) => {
      const hexKeySet = new Set(definition.hexKeys);
      this.zoneDefinitions.set(definition.zoneKey, {
        capacity: definition.capacity,
        hexKeys: hexKeySet,
        name: definition.name,
        description: definition.description,
        faction: definition.faction
      });
      definition.hexKeys.forEach((hexKey) => this.hexToZoneKey.set(hexKey, definition.zoneKey));
    });
    this.recalculateZoneOccupancy();
  }

  getZoneHexes(zoneKey: string): readonly string[] {
    const definition = this.zoneDefinitions.get(zoneKey);
    if (!definition) {
      return [];
    }
    return Array.from(definition.hexKeys);
  }

  getZoneDefinition(zoneKey: string): { capacity: number; name?: string; description?: string; faction?: "Player" | "Bot" } | null {
    const definition = this.zoneDefinitions.get(zoneKey);
    if (!definition) {
      return null;
    }
    return {
      capacity: definition.capacity,
      name: definition.name,
      description: definition.description,
      faction: definition.faction
    };
  }

  getZoneKeyForHex(hexKey: string): string | null {
    return this.hexToZoneKey.get(hexKey) ?? null;
  }

  /**
   * Determines whether a hex belongs to one of the player's deployment zones.
   * Used post-deployment to restrict reserve call-ups to the base camp sector.
   */
  isHexWithinPlayerZone(hexKey: string): boolean {
    const zoneKey = this.hexToZoneKey.get(hexKey);
    if (!zoneKey) {
      return false;
    }
    const definition = this.zoneDefinitions.get(zoneKey);
    return definition?.faction !== "Bot";
  }

  getScenarioTypeForUnitKey(unitKey: string): string | null {
    return this.unitKeyToScenarioType.get(unitKey) ?? null;
  }

  /**
   * Calculates remaining capacity for the provided zone.
   * Returns null when the zone definition has not been registered yet.
   */
  getRemainingZoneCapacity(zoneKey: string): number | null {
    const definition = this.zoneDefinitions.get(zoneKey);
    if (!definition) {
      return null;
    }
    const occupied = this.zoneOccupancy.get(zoneKey) ?? 0;
    return Math.max(0, definition.capacity - occupied);
  }

  /**
   * Returns a summary of all registered zones including occupied and remaining slot counts.
   */
  getZoneUsageSummaries(): DeploymentZoneUsageSummary[] {
    return Array.from(this.zoneDefinitions.entries(), ([zoneKey, definition]) => {
      const occupied = this.zoneOccupancy.get(zoneKey) ?? 0;
      const remaining = Math.max(0, definition.capacity - occupied);
      return {
        zoneKey,
        capacity: definition.capacity,
        occupied,
        remaining,
        name: definition.name,
        description: definition.description,
        faction: definition.faction
      };
    });
  }

  /**
   * Mirrors the active GameEngine state into DeploymentState.
   * Call immediately after engine deployment actions (deploy, recall, finalize) so UI mirrors stay accurate.
   */
  mirrorEngineState(engine: GameEngineAPI, options: DeploymentMirrorOptions = {}): void {
    this.initialized = true;

    const previousPlacements = new Map(this.placements);

    this.placements.clear();

    const playerPlacements = engine.getPlayerPlacementsSnapshot();
    const placementCounts = new Map<string, number>();
    playerPlacements.forEach((unit) => {
      const hexKey = axialKey(unit.hex);
      const hint = options.placementHints?.get(hexKey) ?? previousPlacements.get(hexKey);
      const unitKey = this.resolveUnitKeyFromScenario(unit, hint?.unitKey);
      const sprite = hint?.sprite ?? this.resolveSpriteForUnit(unitKey);
      this.placements.set(hexKey, { hexKey, unitKey, faction: "Player", sprite });
      placementCounts.set(unitKey, (placementCounts.get(unitKey) ?? 0) + 1);
    });

    this.baseCampKey = engine.baseCamp ? engine.baseCamp.key : null;

    const reserveSnapshot = engine.getReserveSnapshot();
    const aggregated = this.aggregateReserves(reserveSnapshot);

    // Adopt the engine's reserve counts as the authoritative source so deploy-by-key aligns with the queue.
    this.reserveCountMap.clear();
    aggregated.counts.forEach((value, key) => this.reserveCountMap.set(key, value));

    console.log("[DeploymentState] mirrorEngineState", {
      poolSize: this.pool.length,
      committedEntries: this.committedEntries.map((entry) => ({ key: entry.key, remaining: entry.remaining })),
      totalAllocationMap: Array.from(this.totalAllocationMap.entries()),
      reserveCounts: Array.from(this.reserveCountMap.entries()),
      engineReserves: reserveSnapshot.map((reserve, index) => ({
        index,
        allocationKey: reserve.allocationKey ?? null,
        scenarioType: reserve.unit.type,
        inferredKey: reserve.allocationKey ?? this.resolveUnitKeyFromScenario(reserve.unit)
      }))
    });

    const previousPoolKeys = new Set(this.pool.map((entry) => entry.key));
    const shouldRestoreCommittedPool = this.pool.length === 0
      || this.committedEntries.length > this.pool.length
      || this.committedEntries.some((entry) => entry.remaining > 0 && !this.pool.some((poolEntry) => poolEntry.key === entry.key));

    if (shouldRestoreCommittedPool && this.committedEntries.length > 0) {
      console.debug("[DeploymentState] Restoring committed pool", {
        reason: shouldRestoreCommittedPool,
        poolKeys: Array.from(previousPoolKeys.values()),
        committedKeys: this.committedEntries.map((entry) => entry.key)
      });
      // Reinstate the commander-approved roster whenever the pool drifts (e.g., engine snapshot omits a key still owed to the player).
      const restoredPool = this.committedEntries.map((entry) => ({ ...entry }));
      restoredPool.forEach((entry) => this.totalAllocationMap.set(entry.key, entry.remaining));
      console.log("[DeploymentState] Restored pool from committed entries", {
        pool: restoredPool.map((entry) => ({ key: entry.key, remaining: entry.remaining })),
        reason: {
          poolLength: restoredPool.length,
          committedLength: this.committedEntries.length,
          previouslyMissingKeys: this.committedEntries
            .filter((entry) => !previousPoolKeys.has(entry.key))
            .map((entry) => entry.key)
        }
      });
      this.pool = restoredPool;
    } else if (this.pool.length === 0 && aggregated.snapshots.length > 0) {
      // No precombat data exists; blend engine reserves with already deployed counts so totals stay accurate for status copy.
      const aggregatedByKey = new Map(aggregated.snapshots.map((snapshot) => [snapshot.unitKey, snapshot] as const));
      const rosterKeys = new Set<string>([...aggregatedByKey.keys(), ...placementCounts.keys()]);

      console.debug("[DeploymentState] Synthesizing pool from engine snapshot", {
        aggregatedReserveKeys: Array.from(aggregatedByKey.keys()),
        placementKeys: Array.from(placementCounts.keys())
      });

      const synthesizedPool: DeploymentPoolEntry[] = Array.from(rosterKeys, (unitKey) => {
        const allocation = getAllocationOption(unitKey);
        if (!allocation) {
          throw new Error(`No allocation metadata registered for engine reserve key '${unitKey}'.`);
        }
        const reserveSnapshot = aggregatedByKey.get(unitKey);
        const remaining = reserveSnapshot?.remaining ?? 0;
        const deployed = placementCounts.get(unitKey) ?? 0;
        const total = remaining + deployed;
        this.totalAllocationMap.set(unitKey, total);
        const sprite = reserveSnapshot?.sprite ?? this.resolveSpriteForUnit(unitKey);
        return {
          key: unitKey,
          label: allocation.label,
          remaining,
          sprite
        } satisfies DeploymentPoolEntry;
      });

      this.pool = synthesizedPool;
      if (this.committedEntries.length === 0) {
        console.debug("[DeploymentState] Capturing synthesized pool as committed entries", {
          synthesizedKeys: synthesizedPool.map((entry) => entry.key)
        });
        this.committedEntries = synthesizedPool.map((entry) => ({ ...entry }));
      }

      console.log("[DeploymentState] Initialized pool from engine reserves and placements", {
        pool: synthesizedPool.map((entry) => ({
          key: entry.key,
          label: entry.label,
          remaining: entry.remaining,
          total: this.getUnitCount(entry.key),
          deployed: placementCounts.get(entry.key) ?? 0,
          scenarioType: this.unitKeyToScenarioType.get(entry.key) ?? null
        }))
      });
    }

    // Update remaining counts using the authoritative reserve map so UI mirrors the engine queue exactly.
    // Normalize omitted keys: if the engine does not report reserves for a unit key and there are no
    // player placements for that key, drop it from the pool and zero its total so it does not count
    // as "deployed". If there ARE player placements, keep the entry but clamp the total to the placed count.
    const reserveSnapshots = new Map<string, ReserveUnitSnapshot>();
    const normalizedPool: DeploymentPoolEntry[] = [];
    this.pool.forEach((entry) => {
      let engineRemaining = this.reserveCountMap.get(entry.key);
      if (engineRemaining === undefined) {
        const deployedCount = placementCounts.get(entry.key) ?? 0;
        console.warn("[DeploymentState] Engine snapshot omitted exhausted unit key; normalizing totals.", {
          unitKey: entry.key,
          totalBudget: this.getUnitCount(entry.key),
          deployedCount
        });
        if (deployedCount <= 0) {
          // No reserves and no placements: remove from pool and ensure totals do not inflate deployed counts.
          this.totalAllocationMap.set(entry.key, 0);
          return; // skip push to normalizedPool
        }
        // There are on-map units but no reserves to deploy. Reflect that as total = deployed, remaining = 0.
        engineRemaining = 0;
        this.totalAllocationMap.set(entry.key, deployedCount);
      }

      entry.remaining = engineRemaining;
      this.reserveCountMap.set(entry.key, engineRemaining);

      const sprite = this.spriteMap.get(entry.key);
      const status: ReserveUnitSnapshot["status"] = engineRemaining > 0 ? "ready" : "exhausted";
      reserveSnapshots.set(entry.key, {
        unitKey: entry.key,
        label: entry.label,
        remaining: engineRemaining,
        sprite,
        status
      });

      normalizedPool.push(entry);
    });
    this.pool = normalizedPool;

    // Merge any engine-only keys not represented in the committed pool (e.g., scenario defaults).
    aggregated.snapshots.forEach((snapshot) => {
      if (reserveSnapshots.has(snapshot.unitKey)) {
        return;
      }
      reserveSnapshots.set(snapshot.unitKey, snapshot);
    });

    this.reserves = Array.from(reserveSnapshots.values());

    this.recalculateZoneOccupancy();
  }

  /**
   * Supplies a read-only view of current reserves to keep UI rendering code functional while avoiding accidental mutation.
   */
  getReserves(): ReserveUnitSnapshot[] {
    return this.reserves.map((reserve) => ({ ...reserve }));
  }

  cacheFrozenReserves(reserveUnits: ReserveUnit[]): void {
    const aggregated = this.aggregateReserves(reserveUnits);

    // Start from the aggregated engine snapshot so battle rescans overwrite any stale campaign allocations.
    this.reserveCountMap.clear();
    aggregated.counts.forEach((value, key) => this.reserveCountMap.set(key, value));

    // Ensure every pool entry reflects the latest engine count, even when the unit disappeared from reserves.
    this.pool = this.pool.map((entry) => {
      const remaining = this.reserveCountMap.get(entry.key) ?? 0;
      return { ...entry, remaining };
    });

    // Preserve the rendered reserve list in the same order as the pool for predictable UI updates.
    const poolOrder = new Map(this.pool.map((entry, index) => [entry.key, index] as const));
    this.reserves = aggregated.snapshots.sort((a, b) => {
      const indexA = poolOrder.get(a.unitKey);
      const indexB = poolOrder.get(b.unitKey);
      if (indexA === undefined && indexB === undefined) {
        return a.unitKey.localeCompare(b.unitKey);
      }
      if (indexA === undefined) {
        return 1;
      }
      if (indexB === undefined) {
        return -1;
      }
      return indexA - indexB;
    });
  }

  /**
   * Allows external wiring (e.g., precombat setup) to register sprite paths for a specific unit key.
   * This ensures the deployment panel and reserve list reuse consistent imagery.
   */
  registerSprite(key: string, spritePath: string): void {
    this.spriteMap.set(key, spritePath);
    const entry = this.findEntry(key);
    if (entry) {
      entry.sprite = spritePath;
    }
    this.updateReserveSprite(key, spritePath);
    this.updatePlacementSprites(key, spritePath);
  }

  /**
   * Records the mapping between UI allocation keys and scenario unit types returned by the engine.
   * Needed so mirrorEngineState() can translate ScenarioUnit.type back into UI-friendly keys.
   */
  registerScenarioAlias(unitKey: string, scenarioType: string): void {
    this.scenarioTypeAlias.set(scenarioType, unitKey);
    this.unitKeyToScenarioType.set(unitKey, scenarioType);
  }

  /**
   * Internal helper adjusting remaining counts while preventing negative totals.
   */
  private adjustRemainingCount(unitKey: string, delta: number): void {
    const entry = this.findEntry(unitKey);
    if (!entry) {
      return;
    }
    entry.remaining = Math.max(0, entry.remaining + delta);
  }

  /**
   * Increases aggregated reserve count for a unit and refreshes derived snapshots.
   */
  private incrementReserveCount(unitKey: string): void {
    const next = (this.reserveCountMap.get(unitKey) ?? 0) + 1;
    this.reserveCountMap.set(unitKey, next);
    this.syncReserveSnapshot(unitKey, next);
  }

  /**
   * Decreases aggregated reserve count for a unit and refreshes derived snapshots.
   */
  private decrementReserveCount(unitKey: string): void {
    if (!this.reserveCountMap.has(unitKey)) {
      return;
    }
    const next = Math.max(0, (this.reserveCountMap.get(unitKey) ?? 0) - 1);
    if (next === 0) {
      this.reserveCountMap.delete(unitKey);
    } else {
      this.reserveCountMap.set(unitKey, next);
    }
    this.syncReserveSnapshot(unitKey, next);
  }

  /**
   * Ensures the reserve snapshot entry for the provided unit key reflects the latest remaining count.
   */
  private syncReserveSnapshot(unitKey: string, remaining: number): void {
    const index = this.reserves.findIndex((reserve) => reserve.unitKey === unitKey);
    const status: ReserveUnitSnapshot["status"] = remaining > 0 ? "ready" : "exhausted";
    if (index >= 0) {
      this.reserves[index] = {
        ...this.reserves[index],
        remaining,
        status
      };
      return;
    }
    if (remaining <= 0) {
      return;
    }
    this.reserves.push({
      unitKey,
      label: this.getLabelForUnitKey(unitKey),
      remaining,
      sprite: this.spriteMap.get(unitKey),
      status
    });
  }

  /**
   * Resolves a friendly label for a unit key falling back to the key when the pool has not been initialized yet.
   */
  getLabelForUnitKey(unitKey: string): string {
    const entry = this.findEntry(unitKey);
    if (entry) {
      return entry.label;
    }
    const allocation = getAllocationOption(unitKey);
    if (allocation) {
      return allocation.label;
    }
    return unitKey;
  }

  /**
   * Populates sprite and alias caches using pre-known pool entries so mirror operations have defaults.
   * The caller should provide `scenarioType` when a specific engine template is known; otherwise
   * the deployment bridge will fall back to inference when mirroring engine snapshots.
   */
  primeSpriteAndAliasCaches(entries: ReadonlyArray<{
    key: string;
    sprite?: string;
    scenarioType?: string;
  }>): void {
    entries.forEach((entry) => {
      if (entry.sprite) {
        this.spriteMap.set(entry.key, entry.sprite);
      }
      if (entry.scenarioType) {
        this.scenarioTypeAlias.set(entry.scenarioType, entry.key);
      }
    });
  }

  /**
   * Recomputes zone occupancy counts using the current placement map.
   */
  private recalculateZoneOccupancy(): void {
    this.zoneOccupancy.clear();
    this.zoneDefinitions.forEach((definition, zoneKey) => {
      this.zoneOccupancy.set(zoneKey, 0);
      definition.hexKeys.forEach((hexKey) => this.hexToZoneKey.set(hexKey, zoneKey));
    });

    this.placements.forEach((_, hexKey) => this.incrementZoneOccupancy(hexKey));
  }

  /**
   * Applies a +1 occupancy delta for the zone containing the supplied hex key.
   */
  private incrementZoneOccupancy(hexKey: string): void {
    const zoneKey = this.hexToZoneKey.get(hexKey);
    if (!zoneKey) {
      return;
    }
    this.zoneOccupancy.set(zoneKey, (this.zoneOccupancy.get(zoneKey) ?? 0) + 1);
  }

  /**
   * Applies a -1 occupancy delta for the zone containing the supplied hex key.
   */
  private decrementZoneOccupancy(hexKey: string): void {
    const zoneKey = this.hexToZoneKey.get(hexKey);
    if (!zoneKey) {
      return;
    }
    const next = Math.max(0, (this.zoneOccupancy.get(zoneKey) ?? 0) - 1);
    this.zoneOccupancy.set(zoneKey, next);
  }

  /**
   * Looks up the allocation key associated with a ScenarioUnit.
   */
  private resolveUnitKeyFromScenario(unit: ScenarioUnit, fallback?: string): string {
    const scenarioType = unit.type as string;
    const alias = this.ensureScenarioAliasForType(scenarioType);
    if (alias) {
      return alias;
    }
    if (fallback) {
      console.error("[DeploymentState] Falling back to provided unit key alias", {
        scenarioType,
        fallback
      });
      throw new Error(`Scenario type '${unit.type as string}' is not registered. Refusing fallback alias '${fallback}'.`);
    }
    throw new Error(`Scenario type '${unit.type as string}' is not registered with DeploymentState.`);
  }

  /**
   * Guarantees an allocation key mapping exists for the supplied scenario type, deriving it from deployment templates when needed.
   * Enables campaign scenarios without precombat preparation to surface player reserves while keeping bot units segregated.
   */
  private ensureScenarioAliasForType(scenarioType: string): string | null {
    const existing = this.scenarioTypeAlias.get(scenarioType);
    if (existing) {
      return existing;
    }

    const template = deploymentTemplates.find((candidate) => candidate.type === scenarioType);
    if (!template) {
      return null;
    }

    this.registerScenarioAlias(template.key, scenarioType);

    const sprite = getSpriteForAllocationKey(template.key) ?? getSpriteForScenarioType(scenarioType);
    if (sprite) {
      this.spriteMap.set(template.key, sprite);
    }

    return template.key;
  }

  /**
   * Aggregates engine reserve entries into counts and UI-friendly snapshots.
   */
  private aggregateReserves(reserveUnits: ReserveUnit[]): {
    counts: Map<string, number>;
    snapshots: ReserveUnitSnapshot[];
  } {
    const counts = new Map<string, number>();
    const spriteOverrides = new Map<string, string | undefined>();

    reserveUnits.forEach((entry) => {
      // Exclude aircraft from ground reserve snapshots so squadrons are managed solely via Air Support.
      const def = entry.definition as any;
      const moveType = def?.moveType ?? (unitTypesSource as any)[entry.unit.type]?.moveType;
      if (moveType === "air") {
        return;
      }
      const unitKey = entry.allocationKey ?? this.resolveUnitKeyFromScenario(entry.unit);
      counts.set(unitKey, (counts.get(unitKey) ?? 0) + 1);

      // Preserve the association between allocation key and scenario type so deploy-by-key lookups
      // succeed even when the commander bypasses precombat (engine defaults expose scenario types).
      const scenarioType = entry.unit.type as string;
      if (!this.unitKeyToScenarioType.has(unitKey)) {
        this.registerScenarioAlias(unitKey, scenarioType);
      }

      const sprite = entry.sprite ?? this.resolveSpriteForUnit(unitKey);
      if (sprite) {
        this.spriteMap.set(unitKey, sprite);
      }

      if (!spriteOverrides.has(unitKey)) {
        spriteOverrides.set(unitKey, sprite);
      }
    });

    const snapshots = Array.from(counts.entries(), ([unitKey, remaining]) => {
      const status: ReserveUnitSnapshot["status"] = remaining > 0 ? "ready" : "exhausted";
      return {
        unitKey,
        label: this.getLabelForUnitKey(unitKey),
        remaining,
        sprite: spriteOverrides.get(unitKey),
        status
      } satisfies ReserveUnitSnapshot;
    });

    return { counts, snapshots };
  }

  /**
   * Normalizes sprite lookups using registered overrides or cached deployment pool sprites.
   */
  private resolveSpriteForUnit(unitKey: string): string | undefined {
    const registered = this.spriteMap.get(unitKey);
    if (registered) {
      return registered;
    }
    // Attempt a late lookup using the scenario alias map so engine-provided units that were not part of
    // the initial allocation still use consistent iconography.
    const scenarioType = this.unitKeyToScenarioType.get(unitKey);
    if (scenarioType) {
      const catalogSprite = getSpriteForScenarioType(scenarioType);
      if (catalogSprite) {
        this.spriteMap.set(unitKey, catalogSprite);
        return catalogSprite;
      }
    }
    const allocationSprite = getSpriteForAllocationKey(unitKey);
    if (allocationSprite) {
      this.spriteMap.set(unitKey, allocationSprite);
      return allocationSprite;
    }
    return undefined;
  }

  /**
   * Updates reserve snapshots with a late-registered sprite path.
   */
  private updateReserveSprite(unitKey: string, spritePath: string): void {
    const index = this.reserves.findIndex((reserve) => reserve.unitKey === unitKey);
    if (index >= 0) {
      this.reserves[index] = { ...this.reserves[index], sprite: spritePath };
    }
  }

  /**
   * Updates placement snapshots with a late-registered sprite path.
   */
  private updatePlacementSprites(unitKey: string, spritePath: string): void {
    this.placements.forEach((placement, hexKey) => {
      if (placement.unitKey === unitKey) {
        this.placements.set(hexKey, { ...placement, sprite: spritePath });
      }
    });
  }
}

/**
 * Singleton instance accessor for deployment state.
 * TODO: Consider dependency injection instead of singleton pattern.
 */
let deploymentStateInstance: DeploymentState | null = null;

export function ensureDeploymentState(): DeploymentState {
  if (!deploymentStateInstance) {
    deploymentStateInstance = new DeploymentState();
  }
  return deploymentStateInstance;
}

export function resetDeploymentState(): void {
  if (deploymentStateInstance) {
    deploymentStateInstance.reset();
  }
}
