import type { CampaignDecision, CampaignPendingEngagement, CampaignScenarioData, CampaignTurnState, CampaignTileInstance, TransportMode } from "../core/campaignTypes";
import { hexDistance } from "../core/Hex";
import { getTransportMode, getApplicableTransportModes, getUnitClassification, INFANTRY_UNITS, ARMOR_MOTORIZED_UNITS, NAVAL_TRANSPORT_UNITS, NAVAL_WARSHIP_UNITS, BOMBER_UNITS, FIGHTER_UNITS } from "../data/transportModes";

// Hexes per day by unit type. Slowest selected unit determines redeploy ETA.
// Each hex = 5km, so multiply by 5 to get km/day, or divide 10 by (speed × 5) to get days per 10km.
const UNIT_SPEEDS_HEX_PER_DAY: Record<string, number> = {
  // Air units (very fast strategic movement)
  Fighter: 60,           // 300 km/day → 0.03 days per 10km
  Bomber: 45,            // 225 km/day → 0.04 days per 10km
  Interceptor: 70,       // 350 km/day → 0.03 days per 10km
  // Naval units
  Transport_Ship: 6,     // 30 km/day → 0.33 days per 10km
  Battleship: 8,         // 40 km/day → 0.25 days per 10km
  // Ground units - mechanized
  Supply_Truck: 5,       // 25 km/day → 0.4 days per 10km
  Panzer_IV: 3,          // 15 km/day → 0.67 days per 10km
  Light_Tank: 3,         // 15 km/day → 0.67 days per 10km
  Heavy_Tank: 2,         // 10 km/day → 1.0 days per 10km
  Panzer_V: 3,           // 15 km/day → 0.67 days per 10km
  // Ground units - artillery
  Howitzer_105: 2,       // 10 km/day → 1.0 days per 10km
  Artillery_155mm: 2,    // 10 km/day → 1.0 days per 10km
  Artillery_105mm: 2,    // 10 km/day → 1.0 days per 10km
  Rocket_Artillery: 3,   // 15 km/day → 0.67 days per 10km (typically self-propelled)
  SP_Artillery: 3,       // 15 km/day → 0.67 days per 10km (self-propelled)
  // Ground units - infantry
  Infantry_42: 1,        // 5 km/day → 2.0 days per 10km
  Infantry_Elite: 1,     // 5 km/day → 2.0 days per 10km
  Infantry: 1,           // 5 km/day → 2.0 days per 10km
  AT_Infantry: 1         // 5 km/day → 2.0 days per 10km
};

export type CampaignUpdateReason =
  | "scenarioLoaded"
  | "dayAdvanced"
  | "turnAdvanced"
  | "decisionsUpdated"
  | "engagementsUpdated"
  | "reset"
  | "manual";

type CampaignUpdateListener = (reason: CampaignUpdateReason) => void;

/**
 * Lightweight state container for the strategic campaign layer.
 * Surfaces subscribe/notify and read-only getters for UI components.
 */
export class CampaignState {
  private scenario: CampaignScenarioData | null = null;
  private turnState: CampaignTurnState | null = null;
  private decisions: CampaignDecision[] = [];
  private engagements: CampaignPendingEngagement[] = [];
  /** Tracks which engagement the commander is actively resolving so battle outcomes can be applied deterministically. */
  private activeEngagementId: string | null = null;
  /** Current campaign time in 3-hour segments (0 = Day 1, 00:00-03:00; 8 = Day 2, 00:00-03:00) */
  private currentSegment: number = 0;
  private readonly listeners = new Set<CampaignUpdateListener>();
  private static readonly SAVE_KEY = "fourstar.campaign.save.v1";

  subscribe(listener: CampaignUpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Returns true if there is a saved campaign snapshot in browser storage. */
  hasSave(): boolean {
    try {
      return typeof localStorage !== "undefined" && Boolean(localStorage.getItem(CampaignState.SAVE_KEY));
    } catch {
      return false;
    }
  }

  /** Saves a snapshot of the current campaign state to browser storage. */
  saveToStorage(): void {
    try {
      if (!this.scenario) return;
      const snapshot = {
        scenario: this.scenario,
        turnState: this.turnState,
        decisions: this.decisions,
        engagements: this.engagements,
        activeEngagementId: this.activeEngagementId,
        currentSegment: this.currentSegment
      };
      localStorage.setItem(CampaignState.SAVE_KEY, JSON.stringify(snapshot));
    } catch {
      /* no-op */
    }
  }

  /** Loads a previously saved snapshot from browser storage, if present. */
  loadFromStorage(): void {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CampaignState.SAVE_KEY) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        scenario: CampaignScenarioData;
        turnState: CampaignTurnState | null;
        decisions: CampaignDecision[];
        engagements: CampaignPendingEngagement[];
        activeEngagementId: string | null;
        currentSegment: number;
        currentDay: number; // Legacy support
      }>;
      if (parsed.scenario) this.scenario = parsed.scenario;
      this.turnState = parsed.turnState ?? null;
      this.decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      this.engagements = Array.isArray(parsed.engagements) ? parsed.engagements : [];
      this.activeEngagementId = parsed.activeEngagementId ?? null;

      // Support both new segment system and legacy day system
      if (Number.isFinite(parsed.currentSegment)) {
        this.currentSegment = parsed.currentSegment as number;
      } else if (Number.isFinite(parsed.currentDay)) {
        // Convert legacy day to segment (assume start of day)
        this.currentSegment = ((parsed.currentDay as number) - 1) * 8;
      } else {
        this.currentSegment = 0;
      }

      this.notify("scenarioLoaded");
    } catch {
      /* no-op */
    }
  }

  emit(reason: CampaignUpdateReason = "manual"): void {
    this.notify(reason);
  }

  private notify(reason: CampaignUpdateReason): void {
    this.listeners.forEach((listener) => {
      try {
        listener(reason);
      } catch (err) {
        // console surface only; state remains intact
        console.error("[CampaignState] listener error", { reason, err });
      }
    });
  }

  setScenario(scenario: CampaignScenarioData): void {
    this.scenario = scenario;
    // Seed control-since timestamps so fronts can measure hold duration from the start.
    try {
      const segment = this.currentSegment;
      for (const t of this.scenario.tiles) {
        const palette = this.scenario.tilePalette[t.tile];
        const owner = t.factionControl ?? palette?.factionControl;
        if (owner && typeof (t as any).controlSinceSegment !== "number") {
          (t as any).controlSinceSegment = segment;
        }
      }
    } catch {}

    // Auto-calculate power values based on strategic assets
    this.updatePowerValues();

    this.notify("scenarioLoaded");
  }

  getScenario(): CampaignScenarioData | null {
    return this.scenario ? structuredClone(this.scenario) : null;
  }

  setTurnState(state: CampaignTurnState | null): void {
    this.turnState = state ? structuredClone(state) : null;
    this.notify("turnAdvanced");
  }

  getTurnState(): CampaignTurnState | null {
    return this.turnState ? structuredClone(this.turnState) : null;
  }

  /** Returns configured hex/day speed for a given unit type. Defaults to 1 if unknown. */
  getUnitSpeed(unitType: string): number {
    return UNIT_SPEEDS_HEX_PER_DAY[unitType] ?? 1;
  }

  queueDecision(decision: CampaignDecision): void {
    this.decisions.push(structuredClone(decision));
    this.notify("decisionsUpdated");
  }

  getQueuedDecisions(): CampaignDecision[] {
    return this.decisions.map((d) => structuredClone(d));
  }

  clearQueuedDecisions(): void {
    this.decisions = [];
    this.notify("decisionsUpdated");
  }

  setPendingEngagements(list: CampaignPendingEngagement[]): void {
    this.engagements = list.map((e) => structuredClone(e));
    this.notify("engagementsUpdated");
  }

  getPendingEngagements(): CampaignPendingEngagement[] {
    return this.engagements.map((e) => structuredClone(e));
  }

  /** Marks a specific pending engagement as the one the commander is resolving next. */
  setActiveEngagementId(id: string | null): void {
    this.activeEngagementId = id;
    this.notify("engagementsUpdated");
  }

  /** Returns the id of the currently active engagement, if any. */
  getActiveEngagementId(): string | null {
    return this.activeEngagementId;
  }

  /** Returns the full record for the currently active engagement, if any. */
  getActiveEngagement(): CampaignPendingEngagement | null {
    const id = this.activeEngagementId;
    if (!id) return null;
    const found = this.engagements.find((e) => e.id === id) ?? null;
    return found ? structuredClone(found) : null;
  }

  /** Returns the current campaign segment (0 = Day 1, 00:00-03:00). */
  getCurrentSegment(): number {
    return this.currentSegment;
  }

  /** Returns the current day number (1-based). */
  getCurrentDay(): number {
    return Math.floor(this.currentSegment / 8) + 1;
  }

  /** Returns the segment within the current day (0-7). */
  getSegmentOfDay(): number {
    return this.currentSegment % 8;
  }

  /**
   * Returns a human-readable time string for the current segment.
   * Example: "Day 5, 09:00-12:00"
   */
  getCurrentTimeDisplay(): string {
    const day = this.getCurrentDay();
    const segmentOfDay = this.getSegmentOfDay();
    const hourStart = segmentOfDay * 3;
    const hourEnd = hourStart + 3;
    const formatHour = (h: number) => h.toString().padStart(2, '0');
    return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
  }

  /**
   * Converts a segment number to a display string.
   * Example: segmentToTimeDisplay(16) = "Day 3, 00:00-03:00"
   */
  segmentToTimeDisplay(segment: number): string {
    const day = Math.floor(segment / 8) + 1;
    const segmentOfDay = segment % 8;
    const hourStart = segmentOfDay * 3;
    const hourEnd = hourStart + 3;
    const formatHour = (h: number) => h.toString().padStart(2, '0');
    return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
  }

  /**
   * Advances the campaign by one 3-hour segment.
   * Daily resource generation occurs every 8 segments (once per day).
   * Redeployments and front updates are processed each segment.
   */
  advanceSegment(): void {
    this.currentSegment += 1;

    // Process daily resource generation every 8 segments (at start of each new day)
    if (this.currentSegment % 8 === 0) {
      this.processDailyResourceGeneration();
    }

    // Process redeployments and front updates every segment
    this.processScheduledRedeployments();
    this.updateFrontsForHeldTiles();

    // Update power values after processing
    this.updatePowerValues();

    this.notify("dayAdvanced"); // Event name kept for compatibility
  }

  /**
   * Legacy method for compatibility. Advances by 8 segments (1 full day).
   * @deprecated Use advanceSegment() instead for granular control.
   */
  advanceDay(): void {
    for (let i = 0; i < 8; i++) {
      this.advanceSegment();
    }
  }

  /**
   * Processes daily resource generation based on controlled tiles.
   * Each controlled tile contributes to faction economy based on its supplyValue.
   */
  private processDailyResourceGeneration(): void {
    if (!this.scenario) return;

    // Calculate daily income from controlled tiles
    const playerIncome = { supplies: 0, fuel: 0, manpower: 0 };
    const botIncome = { supplies: 0, fuel: 0, manpower: 0 };

    for (const tile of this.scenario.tiles) {
      const palette = this.scenario.tilePalette[tile.tile];
      if (!palette) continue;

      const supplyValue = palette.supplyValue ?? 0;
      const faction = tile.factionControl ?? palette.factionControl;

      if (faction === "Player") {
        // Player-controlled tiles generate supplies, fuel, and manpower
        playerIncome.supplies += supplyValue;
        playerIncome.fuel += Math.round(supplyValue * 0.8); // Fuel is 80% of supply value
        playerIncome.manpower += Math.round(supplyValue * 100); // Manpower scales higher
      } else if (faction === "Bot") {
        botIncome.supplies += supplyValue;
        botIncome.fuel += Math.round(supplyValue * 0.8);
        botIncome.manpower += Math.round(supplyValue * 100);
      }
    }

    // Apply income to economies
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const playerEconomy = economies.find((e) => e.faction === "Player");
    const botEconomy = economies.find((e) => e.faction === "Bot");

    if (playerEconomy) {
      playerEconomy.supplies = (playerEconomy.supplies ?? 0) + playerIncome.supplies;
      playerEconomy.fuel = (playerEconomy.fuel ?? 0) + playerIncome.fuel;
      playerEconomy.manpower = (playerEconomy.manpower ?? 0) + playerIncome.manpower;
    }

    if (botEconomy) {
      botEconomy.supplies = (botEconomy.supplies ?? 0) + botIncome.supplies;
      botEconomy.fuel = (botEconomy.fuel ?? 0) + botIncome.fuel;
      botEconomy.manpower = (botEconomy.manpower ?? 0) + botIncome.manpower;
    }

    this.scenario.economies = economies;
    this.notify("scenarioLoaded"); // Trigger economy re-render
  }

  /**
   * Auto-calculates Air Power, Naval Power, and Intel Coverage based on strategic assets.
   * Air Power = (airbases × 10) + (aircraft count)
   * Naval Power = (naval bases × 10) + (ship count)
   * Intel Coverage = (controlled bases × 2)
   */
  private updatePowerValues(): void {
    if (!this.scenario) return;

    const playerStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };
    const botStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };

    // Count bases by faction
    for (const tile of this.scenario.tiles) {
      const palette = this.scenario.tilePalette[tile.tile];
      if (!palette) continue;

      const faction = tile.factionControl ?? palette.factionControl;
      const stats = faction === "Player" ? playerStats : faction === "Bot" ? botStats : null;
      if (!stats) continue;

      // Count bases
      if (palette.role === "airbase") stats.airbases++;
      else if (palette.role === "navalBase") stats.navalBases++;

      if (palette.role === "airbase" || palette.role === "navalBase" || palette.role === "logisticsHub" ||
          palette.role === "fortificationHeavy" || palette.role === "fortificationLight") {
        stats.bases++;
      }

      // Count units
      if (tile.forces) {
        for (const force of tile.forces) {
          const unitType = force.unitType.toLowerCase();
          if (unitType.includes("fighter") || unitType.includes("bomber")) {
            stats.aircraft += force.count;
          } else if (unitType.includes("ship") || unitType.includes("battleship") || unitType.includes("destroyer")) {
            stats.ships += force.count;
          }
        }
      }
    }

    // Calculate power values
    const calculatePower = (stats: typeof playerStats) => ({
      airPower: (stats.airbases * 10) + stats.aircraft,
      navalPower: (stats.navalBases * 10) + stats.ships,
      intelCoverage: stats.bases * 2
    });

    const playerPower = calculatePower(playerStats);
    const botPower = calculatePower(botStats);

    // Update economies
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const playerEconomy = economies.find((e) => e.faction === "Player");
    const botEconomy = economies.find((e) => e.faction === "Bot");

    if (playerEconomy) {
      playerEconomy.airPower = playerPower.airPower;
      playerEconomy.navalPower = playerPower.navalPower;
      playerEconomy.intelCoverage = playerPower.intelCoverage;
    }

    if (botEconomy) {
      botEconomy.airPower = botPower.airPower;
      botEconomy.navalPower = botPower.navalPower;
      botEconomy.intelCoverage = botPower.intelCoverage;
    }

    this.scenario.economies = economies;
  }

  /** Moves all player forces from an origin hex to an adjacent destination hex. Returns true on success. */
  moveForces(originHexKey: string, destHexKey: string): boolean {
    if (!this.scenario) return false;
    const origin = this.findTileByOffsetKey(originHexKey);
    if (!origin) return false;
    const paletteOrigin = this.scenario.tilePalette[origin.tile];
    const owner = origin.factionControl ?? paletteOrigin?.factionControl;
    if (owner !== "Player") return false;

    const moving = Array.isArray(origin.forces) ? origin.forces : [];
    if (moving.length === 0) return false;

    // Ensure destination instance exists; if absent, create a neutral region and mark as Player-controlled on arrival
    let dest = this.findTileByOffsetKey(destHexKey);
    if (!dest) {
      const coords = this.parseOffsetKeyToAxial(destHexKey);
      if (!coords) return false;
      const newDest: CampaignTileInstance = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [] } as CampaignTileInstance;
      this.scenario.tiles.push(newDest);
      dest = newDest;
    }

    // Merge force groups by unitType at destination
    const merge: Record<string, number> = {};
    (Array.isArray(dest.forces) ? dest.forces : []).forEach((g) => {
      merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
    });
    moving.forEach((g) => {
      merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
    });
    dest.forces = Object.entries(merge).map(([unitType, count]) => ({ unitType, count })) as CampaignTileInstance["forces"];

    // Set control to Player if not explicitly enemy-held
    const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
    if (destOwner !== "Bot") {
      dest.factionControl = "Player";
      (dest as any).controlSinceSegment = this.currentSegment;
    }

    // Clear origin after move
    origin.forces = [];

    this.notify("scenarioLoaded");
    return true;
  }

  /**
   * Calculates realistic resource costs for a redeployment based on unit types and transport mode.
   * Returns fuel cost, supplies cost, manpower loss, and transport capacity needed.
   */
  private calculateRedeploymentCosts(
    selections: Array<{ unitType: string; count: number }>,
    distance: number,
    transportMode: TransportMode
  ): { fuelCost: number; suppliesCost: number; manpowerLoss: number; capacityNeeded: number } {
    let totalFuel = 0;
    let totalSupplies = 0;
    let totalManpower = 0;
    let totalCapacityNeeded = 0;

    for (const sel of selections) {
      const unitCount = sel.count;
      if (unitCount <= 0) continue;

      const classification = getUnitClassification(sel.unitType);

      if (transportMode.key === "foot") {
        // ON FOOT: 0 fuel, 1 supply per man per hex
        if (INFANTRY_UNITS.includes(sel.unitType)) {
          totalSupplies += unitCount * distance * 1;
        }
      } else if (transportMode.key === "truck") {
        // TRUCK: Calculate trucks needed, then add truck cost + cargo cost
        const trucksNeeded = Math.ceil(unitCount / 100); // 100 infantry per truck
        totalCapacityNeeded += trucksNeeded;
        // Truck consumption: 3 fuel + 1 supply per truck per hex
        totalFuel += trucksNeeded * distance * 3;
        totalSupplies += trucksNeeded * distance * 1;
        // Cargo consumption: 1 supply per man per hex
        if (INFANTRY_UNITS.includes(sel.unitType)) {
          totalSupplies += unitCount * distance * 1;
        }
      } else if (transportMode.key === "armor") {
        // ARMOR/MOTORIZED: 25 fuel, 5 supply per vehicle per hex
        totalFuel += unitCount * distance * 25;
        totalSupplies += unitCount * distance * 5;
        totalManpower += unitCount * distance * 0.01; // Small attrition risk
      } else if (transportMode.key === "naval") {
        // NAVAL TRANSPORT: Calculate ships needed
        const shipsNeeded = Math.ceil(unitCount / 500); // 500 infantry per ship
        totalCapacityNeeded += shipsNeeded;
        // Ship consumption: 1750 fuel, 70 supply per ship per hex
        totalFuel += shipsNeeded * distance * 1750;
        totalSupplies += shipsNeeded * distance * 70;
        totalManpower += unitCount * distance * 0.05; // Submarine/air attack risk
      } else if (transportMode.key === "warship") {
        // WARSHIPS: 2250 fuel, 1500 supply per ship per hex
        totalFuel += unitCount * distance * 2250;
        totalSupplies += unitCount * distance * 1500;
        totalManpower += unitCount * distance * 0.02;
      } else if (transportMode.key === "fighter") {
        // FIGHTERS: 300 fuel, 1 supply per plane per hex
        totalFuel += unitCount * distance * 300;
        totalSupplies += unitCount * distance * 1;
        totalManpower += unitCount * distance * 0.001;
      } else if (transportMode.key === "bomber") {
        // BOMBERS: 750 fuel, 5 supply per plane per hex
        totalFuel += unitCount * distance * 750;
        totalSupplies += unitCount * distance * 5;
        totalManpower += unitCount * distance * 0.002;
      }
    }

    return {
      fuelCost: Math.ceil(totalFuel),
      suppliesCost: Math.ceil(totalSupplies),
      manpowerLoss: Math.floor(totalManpower),
      capacityNeeded: totalCapacityNeeded
    };
  }

  /**
   * Schedules a long-range redeployment using a specified transport mode.
   * Validates requirements (capacity, bases, resources) and reserves transport assets.
   */
  scheduleRedeploy(
    originOffsetKey: string,
    destOffsetKey: string,
    selections: Array<{ unitType: string; count: number }>,
    transportModeKey: string = "foot"
  ): { ok: boolean; reason?: string } {
    if (!this.scenario) return { ok: false, reason: "No scenario" };

    // Validate origin
    const origin = this.findTileByOffsetKey(originOffsetKey);
    if (!origin) return { ok: false, reason: "Invalid origin" };
    const paletteOrigin = this.scenario.tilePalette[origin.tile];
    const owner = origin.factionControl ?? paletteOrigin?.factionControl;
    if (owner !== "Player") return { ok: false, reason: "Origin not player-controlled" };

    // Validate destination
    const dest = this.findTileByOffsetKey(destOffsetKey);
    const paletteDest = dest ? this.scenario.tilePalette[dest.tile] : null;

    // Get transport mode
    const transportMode = getTransportMode(transportModeKey);
    if (!transportMode) return { ok: false, reason: "Invalid transport mode" };

    // Calculate distance
    const a = this.parseOffsetKeyToAxial(originOffsetKey);
    const b = this.parseOffsetKeyToAxial(destOffsetKey);
    if (!a || !b) return { ok: false, reason: "Invalid coordinates" };
    const distance = Math.max(1, hexDistance(a, b));

    // Validate unit selection
    const totalUnits = selections.reduce((sum, s) => sum + Math.max(0, s.count), 0);
    if (totalUnits <= 0) return { ok: false, reason: "No units selected" };

    // Validate unit types are compatible with transport mode
    for (const sel of selections) {
      if (sel.count <= 0) continue;
      if (transportMode.applicableUnitTypes && transportMode.applicableUnitTypes.length > 0) {
        if (!transportMode.applicableUnitTypes.includes(sel.unitType)) {
          return { ok: false, reason: `${sel.unitType} cannot use ${transportMode.label}` };
        }
      }
    }

    // Validate naval base requirements
    if (transportMode.requiresNavalBase) {
      const originRole = paletteOrigin?.role;
      const destRole = paletteDest?.role;
      if (originRole !== "navalBase" && destRole !== "navalBase") {
        return { ok: false, reason: "Naval transport requires origin or destination to be a naval base" };
      }
    }

    // Validate airbase requirements
    if (transportMode.requiresAirbase) {
      const originRole = paletteOrigin?.role;
      const destRole = paletteDest?.role;
      if (originRole !== "airbase" || destRole !== "airbase") {
        return { ok: false, reason: "Air transport requires both origin and destination to be airbases" };
      }
    }

    // Calculate realistic resource costs based on unit types and transport mode
    const costs = this.calculateRedeploymentCosts(selections, distance, transportMode);
    const fuelCost = costs.fuelCost;
    const suppliesCost = costs.suppliesCost;
    const manpowerLoss = costs.manpowerLoss;
    const capacityNeeded = costs.capacityNeeded;

    // Check and reserve resources
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const player = economies.find((e) => e.faction === "Player");
    if (!player) return { ok: false, reason: "No player economy" };

    // Validate fuel and supplies
    if ((player.fuel ?? 0) < fuelCost) {
      return { ok: false, reason: `Insufficient fuel (need ${fuelCost}, have ${player.fuel ?? 0})` };
    }
    if ((player.supplies ?? 0) < suppliesCost) {
      return { ok: false, reason: `Insufficient supplies (need ${suppliesCost}, have ${player.supplies ?? 0})` };
    }

    // Validate and reserve transport capacity
    if (capacityNeeded > 0 && transportMode.capacityType) {
      if (!player.transportCapacity) {
        return { ok: false, reason: "No transport capacity available" };
      }

      const availableKey = transportMode.capacityType;
      const available = player.transportCapacity[availableKey] ?? 0;
      const inTransit = player.transportCapacity[`${availableKey}InTransit` as keyof typeof player.transportCapacity] ?? 0;
      const totalAvailable = available - inTransit;

      if (totalAvailable < capacityNeeded) {
        return { ok: false, reason: `Insufficient ${availableKey} (need ${capacityNeeded}, available ${totalAvailable})` };
      }

      // Reserve capacity
      const inTransitKey = `${availableKey}InTransit` as keyof typeof player.transportCapacity;
      (player.transportCapacity[inTransitKey] as number) = inTransit + capacityNeeded;
    }

    // Deduct resources
    player.fuel = Math.max(0, (player.fuel ?? 0) - fuelCost);
    player.supplies = Math.max(0, (player.supplies ?? 0) - suppliesCost);
    player.manpower = Math.max(0, (player.manpower ?? 0) - manpowerLoss);

    this.scenario.economies = economies;

    // Calculate transit time based on transport mode speed (speedHexPerDay is actually hex per segment now)
    const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
    const etaSegment = this.currentSegment + timeSegments;

    // Calculate when transport returns to pool (round trip for trucks/ships, immediate for planes)
    let returnEtaSegment = etaSegment;
    if (transportMode.capacityType === "trucks" || transportMode.capacityType === "transportShips") {
      returnEtaSegment = etaSegment + timeSegments; // Round trip
    } else if (transportMode.capacityType === "transportPlanes") {
      returnEtaSegment = etaSegment; // Planes return immediately after drop
    }

    // Create redeployment decision
    const id = `dec_redeploy_${Date.now()}`;
    const decision: CampaignDecision = {
      id,
      faction: "Player",
      type: "redeploy",
      payload: {
        originOffsetKey,
        destOffsetKey,
        selections: selections.map((s) => ({ unitType: s.unitType, count: s.count })),
        transportMode: transportModeKey,
        distance,
        timeSegments,
        etaSegment,
        returnEtaSegment,
        fuelCost,
        suppliesCost,
        manpowerLoss,
        capacityReserved: capacityNeeded > 0 ? { type: transportMode.capacityType!, count: capacityNeeded } : undefined,
        status: "queued"
      },
      affectedHexKeys: [originOffsetKey, destOffsetKey]
    };

    this.queueDecision(decision);
    this.notify("scenarioLoaded");
    return { ok: true };
  }

  /** Executes due redeployments, releases transport capacity, and marks them completed. */
  private processScheduledRedeployments(): void {
    if (!this.scenario) return;
    const updated: CampaignDecision[] = [];
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const player = economies.find((e) => e.faction === "Player");

    for (const d of this.decisions) {
      if (d.type !== "redeploy") {
        updated.push(d);
        continue;
      }

      // Support both new segment system and legacy day system
      const eta = Number((d.payload as any)?.etaSegment ?? (d.payload as any)?.etaDay ?? NaN);
      const returnEta = Number((d.payload as any)?.returnEtaSegment ?? (d.payload as any)?.returnEtaDay ?? NaN);
      const status = String((d.payload as any)?.status ?? "queued");

      // Execute redeployment when forces arrive
      if (Number.isFinite(eta) && status === "queued" && eta <= this.currentSegment) {
        const originKey = String((d.payload as any)?.originOffsetKey ?? "");
        const destKey = String((d.payload as any)?.destOffsetKey ?? "");
        const selections = Array.isArray((d.payload as any)?.selections) ? ((d.payload as any).selections as Array<{ unitType: string; count: number }>) : [];
        this.executeRedeploy(originKey, destKey, selections);

        // Mark as arrived (transport may still be returning)
        const arrived = { ...d, payload: { ...(d.payload as any), status: "arrived", arrivedSegment: this.currentSegment } } as CampaignDecision;
        updated.push(arrived);
        continue;
      }

      // Release transport capacity when vehicles return
      if (Number.isFinite(returnEta) && status === "arrived" && returnEta <= this.currentSegment) {
        const capacityReserved = (d.payload as any)?.capacityReserved as { type: string; count: number } | undefined;
        if (capacityReserved && player && player.transportCapacity) {
          const inTransitKey = `${capacityReserved.type}InTransit` as keyof typeof player.transportCapacity;
          const current = (player.transportCapacity[inTransitKey] as number) ?? 0;
          (player.transportCapacity[inTransitKey] as number) = Math.max(0, current - capacityReserved.count);
        }

        // Mark as completed
        const completed = { ...d, payload: { ...(d.payload as any), status: "completed", completedSegment: this.currentSegment } } as CampaignDecision;
        updated.push(completed);
        continue;
      }

      // Keep pending decisions
      updated.push(d);
    }

    this.decisions = updated;
    if (player) {
      this.scenario.economies = economies;
    }
  }

  /** Moves a subset of forces along any distance and merges at destination; sets control day when captured. */
  private executeRedeploy(originHexKey: string, destHexKey: string, selections: Array<{ unitType: string; count: number }>): void {
    if (!this.scenario) return;
    const origin = this.findTileByOffsetKey(originHexKey);
    if (!origin) return;
    let dest = this.findTileByOffsetKey(destHexKey);
    if (!dest) {
      const coords = this.parseOffsetKeyToAxial(destHexKey);
      if (!coords) return;
      const newDest: any = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [], controlSinceSegment: this.currentSegment };
      this.scenario.tiles.push(newDest);
      dest = newDest;
    }

    const available: Record<string, number> = {};
    (origin.forces ?? []).forEach((g) => (available[g.unitType] = (available[g.unitType] ?? 0) + g.count));
    const moving: Record<string, number> = {};
    selections.forEach((s) => {
      const cap = Math.max(0, Math.min(s.count, available[s.unitType] ?? 0));
      if (cap > 0) moving[s.unitType] = (moving[s.unitType] ?? 0) + cap;
    });

    const remain: Record<string, number> = { ...available };
    Object.entries(moving).forEach(([u, c]) => (remain[u] = Math.max(0, (remain[u] ?? 0) - c)));

    origin.forces = Object.entries(remain)
      .filter(([, c]) => c > 0)
      .map(([unitType, count]) => ({ unitType, count }));

    if (!dest) return; // Safety check (should never happen)

    const destMerge: Record<string, number> = {};
    (dest.forces ?? []).forEach((g) => (destMerge[g.unitType] = (destMerge[g.unitType] ?? 0) + g.count));
    Object.entries(moving).forEach(([u, c]) => (destMerge[u] = (destMerge[u] ?? 0) + c));
    dest.forces = Object.entries(destMerge).map(([unitType, count]) => ({ unitType, count }));

    const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
    if (destOwner !== "Bot") {
      dest.factionControl = "Player";
      if (!(dest as any).controlSinceSegment) (dest as any).controlSinceSegment = this.currentSegment;
    }

    this.notify("scenarioLoaded");
  }

  /** Extends fronts by adding tiles held for 16+ segments (2 days) for both factions. */
  private updateFrontsForHeldTiles(): void {
    if (!this.scenario) return;
    const fronts = this.scenario.fronts.map((f) => ({ ...f, hexKeys: [...f.hexKeys] }));

    const ensureFront = (initiative: "Player" | "Bot") => {
      let f = fronts.find((x) => x.initiative === initiative);
      if (!f) {
        f = { key: initiative === "Player" ? "player-front" : "bot-front", label: initiative === "Player" ? "Player Front" : "Enemy Front", hexKeys: [], initiative };
        fronts.push(f);
      }
      return f;
    };

    const extendFor = (initiative: "Player" | "Bot") => {
      const front = ensureFront(initiative);
      const set = new Set<string>(front.hexKeys);
      for (const t of this.scenario!.tiles) {
        const palette = this.scenario!.tilePalette[t.tile];
        const owner = t.factionControl ?? palette?.factionControl;
        if (owner !== initiative) continue;
        const since = (t as any).controlSinceSegment ?? null;
        if (!since || this.currentSegment - since < 16) continue; // 16 segments = 2 days
        const key = this.axialToOffsetKey(t.hex.q, t.hex.r);
        if (set.has(key)) continue;
        const neighbors = this.neighborAxials(t.hex.q, t.hex.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
        const neighborOnFront = neighbors.find((k) => front.hexKeys.includes(k));
        if (neighborOnFront) {
          const idx = front.hexKeys.indexOf(neighborOnFront);
          if (idx === front.hexKeys.length - 1) front.hexKeys.push(key);
          else front.hexKeys.splice(idx + 1, 0, key);
        } else {
          front.hexKeys.push(key);
        }
        set.add(key);
      }
    };

    extendFor("Player");
    extendFor("Bot");

    this.scenario.fronts = fronts;
    this.notify("scenarioLoaded");
  }

  private estimateTimeDaysForSelection(distance: number, selections: Array<{ unitType: string; count: number }>): number {
    const speeds: number[] = selections
      .filter((s) => (s.count ?? 0) > 0)
      .map((s) => Math.max(1, this.getUnitSpeed(s.unitType)));
    const slowest = speeds.length > 0 ? Math.min(...speeds) : 1;
    return Math.max(1, Math.ceil(distance / Math.max(1, slowest)));
  }

  /** Returns true if the given offset hex key is adjacent to any Bot-controlled tile. */
  isAdjacentToEnemy(offsetHexKey: string): boolean {
    if (!this.scenario) return false;
    const coords = this.parseOffsetKeyToAxial(offsetHexKey);
    if (!coords) return false;
    const neighbors = this.neighborAxials(coords.q, coords.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
    return neighbors.some((k) => {
      const inst = this.findTileByOffsetKey(k);
      if (!inst) return false;
      const owner = inst.factionControl ?? this.scenario!.tilePalette[inst.tile]?.factionControl;
      return owner === "Bot";
    });
  }

  private findTileByOffsetKey(offsetKey: string): CampaignScenarioData["tiles"][number] | undefined {
    if (!this.scenario) return undefined;
    const coords = this.parseOffsetKeyToAxial(offsetKey);
    if (!coords) return undefined;
    return this.scenario.tiles.find((t) => t.hex.q === coords.q && t.hex.r === coords.r);
  }

  private parseOffsetKeyToAxial(offsetKey: string): { q: number; r: number } | null {
    const parts = offsetKey.split(",");
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    const q = col;
    const r = row - Math.floor(col / 2);
    return { q, r };
  }

  private axialToOffsetKey(q: number, r: number): string {
    const col = q;
    const row = r + Math.floor(q / 2);
    return `${col},${row}`;
  }

  private neighborAxials(q: number, r: number): Array<{ q: number; r: number }> {
    const dirs = [
      { q: +1, r: 0 },
      { q: +1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: +1 },
      { q: 0, r: +1 }
    ];
    return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
  }

  /**
   * Applies a battle outcome to the campaign layer by updating economies, shifting the affected front,
   * and clearing the resolved engagement from the queue. The logic is intentionally conservative and
   * uses simple placeholder math so designers can tune values later without structural changes.
   */
  applyBattleOutcome(outcome: {
    activeEngagementId?: string | null;
    frontKey?: string | null;
    result: "PlayerVictory" | "PlayerDefeat" | "Stalemate";
    casualties: number;
    spentAmmo: number;
    spentFuel: number;
  }): void {
    if (!this.scenario) {
      return;
    }

    // 1) Deduct expended resources from the Player economy (defensive guards keep totals non-negative)
    const economies = this.scenario.economies.map((e) => ({ ...e }));
    const player = economies.find((e) => e.faction === "Player");
    if (player) {
      player.supplies = Math.max(0, (player.supplies ?? 0) - Math.max(0, outcome.spentAmmo));
      player.fuel = Math.max(0, (player.fuel ?? 0) - Math.max(0, outcome.spentFuel));
      // Casualties are modeled as a manpower reduction. We use a coarse 10:1 mapping consistent with precombat caps.
      player.manpower = Math.max(0, (player.manpower ?? 0) - Math.max(0, outcome.casualties * 10));
    }
    this.scenario.economies = economies;

    // 2) Shift the front as a simple visual feedback: remove one segment toward the losing side
    const frontKey = outcome.frontKey ?? this.getActiveEngagement()?.frontKey ?? null;
    if (frontKey) {
      const fronts = this.scenario.fronts.map((f) => ({ ...f, hexKeys: [...f.hexKeys] }));
      const front = fronts.find((f) => f.key === frontKey);
      if (front) {
        if (outcome.result === "PlayerVictory") {
          // Advance the front: drop the first segment so the polyline appears to move forward.
          if (front.hexKeys.length > 1) front.hexKeys.shift();
          front.initiative = "Player";
        } else if (outcome.result === "PlayerDefeat") {
          // Lose ground: drop the last segment.
          if (front.hexKeys.length > 1) front.hexKeys.pop();
          front.initiative = "Bot";
        }
      }
      this.scenario.fronts = fronts;
    }

    // 3) Clear the resolved engagement from the queue.
    const resolvedId = outcome.activeEngagementId ?? this.activeEngagementId;
    if (resolvedId) {
      this.engagements = this.engagements.filter((e) => e.id !== resolvedId);
      if (this.activeEngagementId === resolvedId) {
        this.activeEngagementId = null;
      }
      this.notify("engagementsUpdated");
    }

    // 4) Emit a scenario mutation so renderers re-read updated fronts and economy.
    this.notify("scenarioLoaded");
  }

  reset(): void {
    this.scenario = null;
    this.turnState = null;
    this.decisions = [];
    this.engagements = [];
    this.activeEngagementId = null;
    this.currentSegment = 0;
    this.notify("reset");
  }
}

let campaignStateInstance: CampaignState | null = null;
export function ensureCampaignState(): CampaignState {
  if (!campaignStateInstance) {
    campaignStateInstance = new CampaignState();
  }
  return campaignStateInstance;
}
