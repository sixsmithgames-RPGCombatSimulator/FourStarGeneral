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
    costPerUnit: 50_000,
    description: "Balanced line infantry with rifle companies, integral machine guns, and battalion mortars for holding ground.",
    maxQuantity: 20,
    spriteUrl: new URL("../assets/units/Infantry.png", import.meta.url).href
  },
  {
    key: "airborneDetachment",
    label: "Airborne Detachment",
    category: "units",
    costPerUnit: 100_000,
    description: "Elite parachute force suited for raids, rapid blocking actions, and hard-fought light-infantry work.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Paratrooper.png", import.meta.url).href
  },
  {
    key: "engineer",
    label: "Engineering Corps",
    category: "units",
    costPerUnit: 80_000,
    description: "Combat engineers able to dig in, fortify key hexes, breach obstacles, and improve crossing positions.",
    maxQuantity: 10,
    spriteUrl: new URL("../assets/units/Engineer.png", import.meta.url).href
  },
  {
    key: "tank",
    label: "Tank Company",
    category: "units",
    costPerUnit: 200_000,
    description: "Medium armor for breakthrough attacks, mobile reserve work, and direct fire against fortified positions.",
    maxQuantity: 10,
    spriteUrl: new URL("../assets/units/Medium_Tank.png", import.meta.url).href
  },
  {
    key: "heavyTankCompany",
    label: "Heavy Tank Company",
    category: "units",
    costPerUnit: 280_000,
    description: "Slow but punishing heavy armor built to break defended lines and absorb enemy anti-tank fire.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Heavy_Tank.png", import.meta.url).href
  },
  {
    key: "tankDestroyerCompany",
    label: "Tank Destroyer Company",
    category: "units",
    costPerUnit: 255_000,
    description: "High-velocity anti-armor company for countering tanks from standoff positions and covered lanes.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/Anti_Tank_Tank.png", import.meta.url).href
  },
  {
    key: "assaultGunBattalion",
    label: "Assault Gun Battalion",
    category: "units",
    costPerUnit: 240_000,
    description: "Armored assault guns providing close fire support where towed artillery would lag behind.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/Assault_Gun.png", import.meta.url).href
  },
  {
    key: "howitzer",
    label: "Howitzer Battery",
    category: "units",
    costPerUnit: 180_000,
    description: "Towed 105mm battery for indirect bombardment, counter-mobility fire, and sustained support of infantry attacks.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Howitzer_105.png", import.meta.url).href
  },
  {
    key: "rocketArtilleryBattalion",
    label: "Rocket Artillery Battalion",
    category: "units",
    costPerUnit: 260_000,
    description: "Rocket launch battalion for short, violent saturation strikes against concentrations and ford approaches.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Rocket_Artillery.png", import.meta.url).href
  },
  {
    key: "spArtilleryGroup",
    label: "Self-Propelled Artillery Group",
    category: "units",
    costPerUnit: 275_000,
    description: "Armored self-propelled guns that can fire, displace, and keep pace with mechanized formations.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/SP_Artillery.png", import.meta.url).href
  },
  {
    key: "antiTankBattery",
    label: "Anti-Tank Gun Battery",
    category: "units",
    costPerUnit: 165_000,
    description: "Crew-served anti-tank guns ideal for covering roads, crossings, and likely armored approach lanes.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/AT_Gun_50mm.png", import.meta.url).href
  },
  {
    key: "flakBattery",
    label: "Flak Battery",
    category: "units",
    costPerUnit: 210_000,
    description: "Heavy anti-air battery that also threatens light vehicles and exposed ground targets with direct fire.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Flak_88.png", import.meta.url).href
  },
  {
    key: "recon",
    label: "Recon Squad",
    category: "units",
    costPerUnit: 75_000,
    description: "Armored reconnaissance troop for screening, spotting enemy movement, and cueing fires from safer range.",
    maxQuantity: 12,
    spriteUrl: new URL("../assets/units/Recon_ArmoredCar.png", import.meta.url).href
  },
  {
    key: "reconBike",
    label: "Recon Bike Patrol",
    category: "units",
    costPerUnit: 45_000,
    description: "Light two-wheel scout patrol with a smaller rider package for fast screening, flank checks, and urgent liaison work.",
    maxQuantity: 8,
    spriteUrl: new URL("../assets/units/Recon_Bike.png", import.meta.url).href
  },
  {
    key: "scoutPlaneWing",
    label: "Scout Plane Wing",
    category: "units",
    costPerUnit: 185_000,
    description: "Observation aircraft for battlefield scouting, route checks, and extended contact reporting.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Scout_Plane.png", import.meta.url).href
  },
  {
    key: "fighter",
    label: "Fighter Squadron",
    category: "units",
    costPerUnit: 240_000,
    description: "Air-superiority squadron for escort cover, interception, and protection of friendly air operations.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Fighter.png", import.meta.url).href
  },
  {
    key: "interceptorWing",
    label: "Interceptor Wing",
    category: "units",
    costPerUnit: 255_000,
    description: "High-speed interceptors optimized for stopping hostile aircraft before they reach the frontline.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Interceptor.png", import.meta.url).href
  },
  {
    key: "groundAttackWing",
    label: "Ground Attack Wing",
    category: "units",
    costPerUnit: 265_000,
    description: "Close-support strike aircraft armed for anti-vehicle attacks and rapid battlefield interdiction.",
    maxQuantity: 3,
    spriteUrl: new URL("../assets/units/Ground_Attack.png", import.meta.url).href
  },
  {
    key: "bomber",
    label: "Tactical Bomber Wing",
    category: "units",
    costPerUnit: 260_000,
    description: "Tactical bomber package for heavier area strikes against concentrations, depots, and strongpoints.",
    maxQuantity: 4,
    spriteUrl: new URL("../assets/units/Bomber.png", import.meta.url).href
  },
  {
    key: "transportWing",
    label: "Transport Air Wing",
    category: "units",
    costPerUnit: 190_000,
    description: "Transport aircraft package for airborne drops, emergency lift, and rapid supply relocation.",
    maxQuantity: 2,
    spriteUrl: new URL("../assets/units/Transport_Plane.png", import.meta.url).href
  },
  {
    key: "apcTruckColumn",
    label: "APC Truck Column",
    category: "units",
    costPerUnit: 140_000,
    description: "Motor transport column for shifting infantry and support teams between threatened sectors.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/APC_Truck.png", import.meta.url).href
  },
  {
    key: "apcHalftrackCompany",
    label: "APC Halftrack Company",
    category: "units",
    costPerUnit: 175_000,
    description: "Protected halftracks that keep mechanized infantry moving under light fire and rough conditions.",
    maxQuantity: 5,
    spriteUrl: new URL("../assets/units/APC_Halftrack.png", import.meta.url).href
  },
  {
    key: "supplyConvoy",
    label: "Supply Convoy",
    category: "logistics",
    costPerUnit: 40_000,
    description: "Dedicated sustainment convoy carrying fuel and ammunition forward so battalions can keep fighting.",
    maxQuantity: 6,
    spriteUrl: new URL("../assets/units/Supply_Truck.png", import.meta.url).href
  },
  {
    key: "ammo",
    label: "Ammunition Cache",
    category: "supplies",
    costPerUnit: 30_000,
    description: "Forward ammunition stock for artillery, anti-tank guns, and prolonged frontline engagements.",
    maxQuantity: 50,
    spriteUrl: undefined
  },
  {
    key: "fuel",
    label: "Fuel Depot",
    category: "supplies",
    costPerUnit: 25_000,
    description: "Fuel reserve package to keep armored, motorized, and logistics formations operating.",
    maxQuantity: 50,
    spriteUrl: undefined
  },
  {
    key: "medic",
    label: "Medical Team",
    category: "support",
    costPerUnit: 60_000,
    description: "Forward aid and evacuation team for stabilizing casualties near the fighting.",
    maxQuantity: 15,
    spriteUrl: undefined
  },
  {
    key: "transport",
    label: "Transport Column",
    category: "logistics",
    costPerUnit: 70_000,
    description: "General-purpose truck lift for moving men, stores, and reserve supplies behind the line.",
    maxQuantity: 15,
    spriteUrl: undefined
  },
  {
    key: "maintenance",
    label: "Maintenance Crew",
    category: "logistics",
    costPerUnit: 55_000,
    description: "Mobile repair and recovery detachment for keeping armored and motorized equipment serviceable.",
    maxQuantity: 12,
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
