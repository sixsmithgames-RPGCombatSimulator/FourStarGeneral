/**
 * Enumerates the high-level groupings displayed by the precombat allocation UI.
 */
export type AllocationCategory = "units" | "supplies" | "support" | "logistics";

/**
 * Immutable description for each selectable allocation row. UI logic depends on these definitions
 * to render consistent labels, enforce purchase limits, and compute remaining budget totals.
 */
export interface UnitAllocationOption {
  readonly key: string;
  readonly label: string;
  readonly category: AllocationCategory;
  readonly costPerUnit: number;
  readonly description: string;
  readonly maxQuantity: number;
  readonly spriteUrl?: string;
  readonly implemented?: boolean;
  readonly visibleInAllocationUi?: boolean;
  readonly depotPayload?: Readonly<{
    ammo?: number;
    fuel?: number;
    rations?: number;
    parts?: number;
  }>;
}

/**
 * Canonical allocation catalog mirrored from `PRECOMBAT_SCREEN_TODO.md`. Values remain static at
 * runtime so the UI can safely reuse references without defensive copies.
 */
export const allocationOptions = [
  {
    key: "infantry",
    label: "Infantry Battalion",
    category: "units",
    costPerUnit: 50,
    description: "Balanced line infantry with rifle companies, integral machine guns, and battalion mortars for holding ground.",
    maxQuantity: 20,
    spriteUrl: new URL("../assets/units/Infantry_Light_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "airborneDetachment",
    label: "Airborne Detachment",
    category: "units",
    costPerUnit: 100,
    description: "Elite parachute force suited for raids, rapid blocking actions, and hard-fought light-infantry work.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Infantry_Light_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "engineer",
    label: "Engineering Corps",
    category: "units",
    costPerUnit: 80,
    description: "Combat engineers able to dig in, fortify key hexes, breach obstacles, and improve crossing positions.",
    maxQuantity: 10,
    spriteUrl: new URL("../assets/units/Infantry_Engineers_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "tank",
    label: "Tank Company",
    category: "units",
    costPerUnit: 200,
    description: "Medium armor for breakthrough attacks, mobile reserve work, and direct fire against fortified positions.",
    maxQuantity: 10,
    spriteUrl: new URL("../assets/units/Tank_M4_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "heavyTankCompany",
    label: "Heavy Tank Company",
    category: "units",
    costPerUnit: 280,
    description: "Slow but punishing heavy armor built to break defended lines and absorb enemy anti-tank fire.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Tank_M26_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "tankDestroyerCompany",
    label: "Tank Destroyer Company",
    category: "units",
    costPerUnit: 255,
    description: "High-velocity anti-armor company for countering tanks from standoff positions and covered lanes.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/Tankkiller_M10_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "assaultGunBattalion",
    label: "Assault Gun Battalion",
    category: "units",
    costPerUnit: 240,
    description: "Armored assault guns providing close fire support where towed artillery would lag behind.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/Tank_Assault_M8_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "howitzer",
    label: "Howitzer Battery",
    category: "units",
    costPerUnit: 180,
    description: "Towed 105mm battery for indirect bombardment, counter-mobility fire, and sustained support of infantry attacks.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Artillery_Howitzer_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "rocketArtilleryBattalion",
    label: "Rocket Artillery Battalion",
    category: "units",
    costPerUnit: 260,
    description: "Rocket launch battalion for short, violent saturation strikes against concentrations and ford approaches.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Artillery_Calliope_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "spArtilleryGroup",
    label: "Self-Propelled Artillery Group",
    category: "units",
    costPerUnit: 275,
    description: "Armored self-propelled guns that can fire, displace, and keep pace with mechanized formations.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Artillery_M7_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "antiTankBattery",
    label: "Anti-Tank Gun Battery",
    category: "units",
    costPerUnit: 80,
    description: "Crew-served anti-tank guns ideal for covering roads, crossings, and likely armored approach lanes.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Wheeled_AT_Gun_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "flakBattery",
    label: "Flak Battery",
    category: "units",
    costPerUnit: 210,
    description: "Dual-purpose 88mm battery providing defensive flak coverage against hostile air strikes while engaging armor and soft targets.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Flak_88_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "recon",
    label: "Recon Squad",
    category: "units",
    costPerUnit: 75,
    description: "Armored reconnaissance troop for screening, spotting enemy movement, and cueing fires from safer range.",
    maxQuantity: 12,
    spriteUrl: new URL("../assets/units/Recon_ArmoredCar.png", import.meta.url).href
  },
  {
    key: "reconBike",
    label: "Recon Bike Patrol",
    category: "units",
    costPerUnit: 45,
    description: "Light two-wheel scout patrol with a smaller rider package for fast screening, flank checks, and urgent liaison work.",
    maxQuantity: 8,
    spriteUrl: new URL("../assets/units/Wheeled_Bikes_Recon_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "scoutPlaneWing",
    label: "Reconnaissance Flight",
    category: "support",
    costPerUnit: 185,
    description: "Off-map observation flight for battlefield scouting, artillery spotting, and route reconnaissance over the front.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Scout_Plane.png", import.meta.url).href
  },
  {
    key: "fighter",
    label: "Fighter Squadron",
    category: "support",
    costPerUnit: 240,
    description: "Off-map fighter cover committed to escort, interception, and local air superiority over the battle area.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Aircraft_USA_P51.png", import.meta.url).href
  },
  {
    key: "interceptorWing",
    label: "Interceptor Squadron",
    category: "support",
    costPerUnit: 255,
    description: "High-readiness interceptor package tasked with breaking up hostile reconnaissance and bombing sorties.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Aircraft_England_Spitfire.png", import.meta.url).href
  },
  {
    key: "groundAttackWing",
    label: "Close Support Squadron",
    category: "support",
    costPerUnit: 265,
    description: "Fighter-bombers assigned to timed strikes against armor, gun lines, and exposed troop concentrations.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Aircraft_USA_B25.png", import.meta.url).href
  },
  {
    key: "bomber",
    label: "Tactical Bomber Squadron",
    category: "support",
    costPerUnit: 260,
    description: "Medium bomber detachment for heavier interdiction strikes against reserves, depots, and fortified positions.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Aircraft_USA_B17.png", import.meta.url).href
  },
  {
    key: "transportWing",
    label: "Transport Flight",
    category: "support",
    costPerUnit: 190,
    description: "Transport aircraft held off-map for airborne drops, courier lifts, and emergency resupply runs.",
    maxQuantity: 2,
    spriteUrl: new URL("../assets/units/Transport_Plane.png", import.meta.url).href
  },
  {
    key: "apcHalftrackCompany",
    label: "Halftrack Carrier Company",
    category: "units",
    costPerUnit: 175,
    description: "Protected halftracks that keep mechanized infantry moving under light fire and across broken ground.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/APC_Halftrack_USA_Sideview.png", import.meta.url).href
  },
  {
    key: "supplyConvoy",
    label: "Supply Convoy",
    category: "logistics",
    costPerUnit: 40,
    description: "Forward resupply convoy carrying packaged ammunition and fuel from rear dumps to the line.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Supply_Truck.png", import.meta.url).href
  },
  {
    key: "ammo",
    label: "Ammunition Dump",
    category: "supplies",
    costPerUnit: 30,
    description: "Requisitioned shell and small-arms reserve held in revetted dumps behind the fighting line.",
    maxQuantity: 50,
    depotPayload: { ammo: 36 },
    spriteUrl: undefined
  },
  {
    key: "fuel",
    label: "Fuel Dump",
    category: "supplies",
    costPerUnit: 25,
    description: "Drummed fuel reserve and pumping gear for replenishing armored, motorized, and convoy formations.",
    maxQuantity: 50,
    depotPayload: { fuel: 54 },
    spriteUrl: undefined
  },
  {
    key: "medic",
    label: "Medical Detachment",
    category: "logistics",
    costPerUnit: 60,
    description: "Forward aid and evacuation detachment for casualty clearing, ambulance runs, and stabilization near the front.",
    maxQuantity: 15,
    implemented: false,
    spriteUrl: undefined
  },
  {
    key: "transport",
    label: "Transport Column",
    category: "logistics",
    costPerUnit: 70,
    description: "Rear-area truck lift reserved for campaign movement planning rather than tactical battle requisitions.",
    maxQuantity: 15,
    visibleInAllocationUi: false,
    spriteUrl: undefined
  },
  {
    key: "maintenance",
    label: "Recovery & Repair Section",
    category: "logistics",
    costPerUnit: 55,
    description: "Field workshop and recovery section for damaged vehicles, gun teams, and broken-down prime movers.",
    maxQuantity: 12,
    implemented: false,
    spriteUrl: undefined
  },
  {
    key: "corpsArtilleryGroup",
    label: "Corps Artillery Group",
    category: "support",
    costPerUnit: 165,
    description: "Observer-directed off-map corps guns for timed bombardments beyond the range of on-map batteries.",
    maxQuantity: 2,
    implemented: false,
    spriteUrl: undefined
  },
  {
    key: "shoreFireControlParty",
    label: "Naval Gunfire Support (NGFS)",
    category: "support",
    costPerUnit: 210,
    description: "Naval gunfire liaison team coordinating destroyer and cruiser bombardment from offshore stations.",
    maxQuantity: 1,
    implemented: false,
    spriteUrl: undefined
  }
] as const satisfies readonly UnitAllocationOption[];

const allocationEntries = allocationOptions as readonly UnitAllocationOption[];

/**
 * Mapping helper that enables constant-time lookups by key during quantity adjustments.
 */
export const ALLOCATION_BY_KEY = Object.freeze(
  Object.fromEntries(allocationEntries.map((option) => [option.key, option]))
) as Readonly<Record<UnitAllocationOption["key"], UnitAllocationOption>>;

/**
 * Cached category partitions so the precombat screen can render filtered lists without re-running
 * expensive array filters on every state change.
 */
export const ALLOCATION_BY_CATEGORY = (() => {
  const categoryMap = new Map<AllocationCategory, UnitAllocationOption[]>();
  for (const option of allocationEntries) {
    const bucket = categoryMap.get(option.category);
    if (bucket) {
      bucket.push(option);
    } else {
      categoryMap.set(option.category, [option]);
    }
  }

  return new Map(
    Array.from(categoryMap.entries(), ([category, options]) => [
      category,
      Object.freeze(options) as readonly UnitAllocationOption[]
    ])
  ) as ReadonlyMap<AllocationCategory, readonly UnitAllocationOption[]>;
})();

const allocationKeySet = new Set<string>(allocationEntries.map((option) => option.key));

/**
 * Runtime guard shielding downstream callers from typos when receiving user input or parsing saves.
 */
export function isAllocationKey(value: string): value is UnitAllocationOption["key"] {
  return allocationKeySet.has(value);
}

/**
 * Public lookup that safely unwraps an allocation entry while preserving type narrowing from the guard.
 */
export function getAllocationOption(key: string): UnitAllocationOption | undefined {
  if (isAllocationKey(key)) {
    return ALLOCATION_BY_KEY[key];
  }
  return undefined;
}
