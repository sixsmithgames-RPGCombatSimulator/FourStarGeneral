import type { AllocationCategory } from "./unitAllocation";
// Import the canonical combat stat dictionary so composition entries can reference the exact scenario unit payloads.
import unitTypes from "./unitTypes.json";

export type UnitAllocationKey =
  | "infantry"
  | "airborneDetachment"
  | "engineer"
  | "tank"
  | "heavyTankCompany"
  | "tankDestroyerCompany"
  | "assaultGunBattalion"
  | "howitzer"
  | "rocketArtilleryBattalion"
  | "spArtilleryGroup"
  | "antiTankBattery"
  | "flakBattery"
  | "recon"
  | "reconBike"
  | "scoutPlaneWing"
  | "fighter"
  | "interceptorWing"
  | "groundAttackWing"
  | "bomber"
  | "transportWing"
  | "corpsArtilleryGroup"
  | "shoreFireControlParty"
  | "apcTruckColumn"
  | "apcHalftrackCompany"
  | "supplyConvoy"
  | "ammo"
  | "fuel"
  | "medic"
  | "transport"
  | "maintenance";

// Narrow the allowable combat reference keys to the definitions already validated in `unitTypes.json`.
type UnitTypeKey = keyof typeof unitTypes;

export interface CombatReference {
  /** Links the allocation entry back to the canonical combat stats in `unitTypes.json`. */
  readonly unitType: UnitTypeKey;
}

export interface UnitCompositionProfile {
  /** Estimated number of troops assigned to the formation. */
  readonly personnel: number;
  /** Count of motorized or armored vehicles organic to the unit. */
  readonly vehicles: number;
  /** Headline equipment or stores carried by the unit. */
  readonly equipmentSummary: readonly string[];
  /** Optional operational notes that help differentiate similar entries. */
  readonly notes?: string;
  /** Optional pointer when the unit shares a combat stat line with `unitTypes.json`. */
  readonly combatReference?: CombatReference;
}

/**
 * Hand-authored manifest describing manning and materiel for each allocation entry.
 * These figures are intentionally approximate so designers can iterate quickly while
 * we wait on the finalized order of battle. Update the numbers as art/design locks in.
 */
export const unitComposition: Record<UnitAllocationKey, UnitCompositionProfile> = {
  infantry: {
    combatReference: { unitType: "Infantry_42" },
    personnel: 720,
    vehicles: 0,
    equipmentSummary: [
      "3 rifle companies",
      "1 weapons company with MG and mortar platoons",
      "Attached anti-tank section"
    ],
    notes: "Baseline infantry regiment referenced by multiple campaign scenarios."
  },
  airborneDetachment: {
    combatReference: { unitType: "Paratrooper" },
    personnel: 240,
    vehicles: 0,
    equipmentSummary: [
      "4 parachute infantry platoons",
      "Light mortar section",
      "Pathfinder radios"
    ],
    notes: "Air-delivered unit requiring dedicated transport flight support."
  },
  engineer: {
    combatReference: { unitType: "Engineer" },
    personnel: 160,
    vehicles: 12,
    equipmentSummary: [
      "Pontoon bridging kits",
      "Explosive breaching gear",
      "Earthmoving tools"
    ]
  },
  tank: {
    combatReference: { unitType: "Panzer_IV" },
    personnel: 60,
    vehicles: 25,
    equipmentSummary: ["25 medium tanks", "Organic maintenance and recovery detachment"],
    notes: "Standard armored company-sized formation in campaign rosters."
  },
  heavyTankCompany: {
    combatReference: { unitType: "Heavy_Tank" },
    personnel: 96,
    vehicles: 8,
    equipmentSummary: ["8 heavy breakthrough tanks", "Recovery vehicle"],
    notes: "Heavier armor and ammunition footprint than the baseline tank company."
  },
  tankDestroyerCompany: {
    combatReference: { unitType: "Tank_Destroyer" },
    personnel: 90,
    vehicles: 6,
    equipmentSummary: ["6 dedicated tank destroyers", "Spotter jeeps"],
    notes: "Pairs long-range guns with reconnaissance liaison teams."
  },
  assaultGunBattalion: {
    combatReference: { unitType: "Assault_Gun" },
    personnel: 110,
    vehicles: 6,
    equipmentSummary: ["6 assault guns", "Forward observation detachment"],
    notes: "Indirect fire capable with armored protection for frontline pushes."
  },
  howitzer: {
    combatReference: { unitType: "Howitzer_105" },
    personnel: 180,
    vehicles: 18,
    equipmentSummary: ["6 towed 105mm howitzers", "12 prime movers"],
    notes: "Includes fire direction center and ammunition train."
  },
  rocketArtilleryBattalion: {
    combatReference: { unitType: "Rocket_Artillery" },
    personnel: 150,
    vehicles: 12,
    equipmentSummary: ["4 rocket launch trucks", "Reload vehicles"],
    notes: "Designed for saturation bombardment and rapid displacement."
  },
  spArtilleryGroup: {
    combatReference: { unitType: "SP_Artillery" },
    personnel: 140,
    vehicles: 8,
    equipmentSummary: ["8 self-propelled guns", "Armored ammunition carriers"],
    notes: "Armored chassis allows shoot-and-scoot tactics after firing."
  },
  antiTankBattery: {
    combatReference: { unitType: "AT_Gun_50mm" },
    personnel: 132,
    vehicles: 18,
    equipmentSummary: ["6 50mm AT guns", "12 towing trucks"],
    notes: "Crew-served guns with integral ammo limbers and logistics detail."
  },
  flakBattery: {
    combatReference: { unitType: "Flak_88" },
    personnel: 160,
    vehicles: 16,
    equipmentSummary: ["4 heavy AA guns", "Radar trailer", "Ammunition loaders"],
    notes: "Ready to provide both strategic air defense and point-defense coverage."
  },
  recon: {
    combatReference: { unitType: "Recon_ArmoredCar" },
    personnel: 150,
    vehicles: 18,
    equipmentSummary: ["18 armored cars", "Signals relay section"],
    notes: "Mobility-first unit for screening and intelligence gathering."
  },
  reconBike: {
    combatReference: { unitType: "Recon_Bike" },
    personnel: 54,
    vehicles: 18,
    equipmentSummary: ["18 reconnaissance motorbikes", "9 two-bike scout pairs"],
    notes: "Smaller liaison-heavy patrol focused on fast screening, courier work, and flank checks."
  },
  scoutPlaneWing: {
    combatReference: { unitType: "Scout_Plane" },
    personnel: 90,
    vehicles: 6,
    equipmentSummary: ["6 reconnaissance aircraft", "Photo interpretation section"],
    notes: "Off-map reconnaissance package with pilots, fitters, and aerial observers."
  },
  fighter: {
    combatReference: { unitType: "Fighter" },
    personnel: 120,
    vehicles: 12,
    equipmentSummary: ["12 fighter aircraft", "Readiness dispersal crews"],
    notes: "Maintained off-map and committed as escort, CAP, or interception sorties."
  },
  interceptorWing: {
    combatReference: { unitType: "Interceptor" },
    personnel: 160,
    vehicles: 16,
    equipmentSummary: ["16 interceptor aircraft", "Scramble control section"],
    notes: "Held at high readiness for defensive counter-air duties."
  },
  groundAttackWing: {
    combatReference: { unitType: "Ground_Attack" },
    personnel: 130,
    vehicles: 8,
    equipmentSummary: ["8 fighter-bombers", "Rocket and bomb dump"],
    notes: "Tasked for close support and interdiction sorties over the battlefield."
  },
  bomber: {
    combatReference: { unitType: "Bomber" },
    personnel: 150,
    vehicles: 6,
    equipmentSummary: ["6 tactical bombers", "Bomb preparation crew"],
    notes: "Medium bombers assigned to heavier off-map strike packages."
  },
  transportWing: {
    combatReference: { unitType: "Transport_Plane" },
    personnel: 140,
    vehicles: 5,
    equipmentSummary: ["5 transport aircraft", "Cargo rigging section"],
    notes: "Supports airborne insertions, courier flights, and emergency aerial resupply."
  },
  corpsArtilleryGroup: {
    personnel: 36,
    vehicles: 4,
    equipmentSummary: ["3 off-map fire missions", "Forward observer party"],
    notes: "Planned support asset representing corps artillery held beyond the battle area."
  },
  shoreFireControlParty: {
    personnel: 18,
    vehicles: 2,
    equipmentSummary: ["2 naval fire missions", "Shore observer team"],
    notes: "Planned support asset for destroyer and cruiser gunfire coordination."
  },
  apcTruckColumn: {
    combatReference: { unitType: "APC_Truck" },
    personnel: 120,
    vehicles: 28,
    equipmentSummary: ["24 troop lorries", "4 dispatch jeeps"],
    notes: "Configured to shuttle infantry between rear staging areas and jump-off points."
  },
  apcHalftrackCompany: {
    combatReference: { unitType: "APC_Halftrack" },
    personnel: 180,
    vehicles: 24,
    equipmentSummary: ["24 halftracks", "Field repair trailer"],
    notes: "Provides protected battlefield lift for mechanized infantry detachments."
  },
  supplyConvoy: {
    combatReference: { unitType: "Supply_Truck" },
    personnel: 48,
    vehicles: 8,
    equipmentSummary: ["6 supply lorries", "2 fuel bowsers"],
    notes: "Small forward convoy shuttling mixed loads from rear dumps to frontline units."
  },
  ammo: {
    personnel: 28,
    vehicles: 0,
    equipmentSummary: ["Shell revetments", "Ready-use ammunition stacks"],
    notes: "Static ammunition dump feeding artillery, anti-tank guns, and frontline resupply points."
  },
  fuel: {
    personnel: 18,
    vehicles: 0,
    equipmentSummary: ["Drummed fuel stocks", "Pump and hose sets"],
    notes: "Static fuel dump for replenishing armored, motorized, and logistics formations."
  },
  medic: {
    personnel: 32,
    vehicles: 4,
    equipmentSummary: ["Aid-post section", "Ambulance pair", "Field dressings"],
    notes: "Planned logistics service combining casualty collection, stabilization, and evacuation."
  },
  transport: {
    personnel: 90,
    vehicles: 26,
    equipmentSummary: ["20 cargo trucks", "6 liaison jeeps"],
    notes: "Campaign-level rear-area lift kept outside the tactical requisition screen."
  },
  maintenance: {
    personnel: 54,
    vehicles: 6,
    equipmentSummary: ["Workshop lorry", "Recovery tractor", "Spare parts trailer"],
    notes: "Keeps damaged vehicles, guns, and prime movers serviceable near the front."
  }
};

export interface AllocationCompositionRecord extends UnitCompositionProfile {
  readonly key: UnitAllocationKey;
  readonly label: string;
  readonly category: AllocationCategory;
}
