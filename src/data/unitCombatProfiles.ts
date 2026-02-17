// Read the core combat tuning so we can expose the same shot-per-turn heuristics in documentation.
import { combat } from "../core/balance";
// Pull in the canonical unit stat definitions so we can annotate each allocation entry with combat metrics.
import unitTypes from "./unitTypes.json";
import type { UnitAllocationKey } from "./unitComposition";

type UnitTypeKey = keyof typeof unitTypes;

/**
 * Canonical armor fallback used when an allocation entry has no matching combat unit definition.
 */
const EMPTY_ARMOR = Object.freeze({ front: 0, side: 0, top: 0 });

/**
 * We map allocation keys to the underlying combat unit so the documentation can surface a single
 * authoritative source of soft/hard attack, armor, and mobility values. Logistics-only entries do
 * not have combat stats, so we zero them out while still emitting a profile for completeness.
 */
const COMBAT_MAPPING: readonly [UnitAllocationKey, UnitTypeKey | null][] = [
  ["infantry", "Infantry_42"],
  ["airborneDetachment", "Paratrooper"],
  ["engineer", "Engineer"],
  ["tank", "Panzer_IV"],
  ["heavyTankCompany", "Heavy_Tank"],
  ["tankDestroyerCompany", "Tank_Destroyer"],
  ["assaultGunBattalion", "Assault_Gun"],
  ["howitzer", "Howitzer_105"],
  ["rocketArtilleryBattalion", "Rocket_Artillery"],
  ["spArtilleryGroup", "SP_Artillery"],
  ["antiTankBattery", "AT_Gun_50mm"],
  ["flakBattery", "Flak_88"],
  ["recon", "Recon_ArmoredCar"],
  ["reconBike", "Recon_Bike"],
  ["scoutPlaneWing", "Scout_Plane"],
  ["fighter", "Fighter"],
  ["interceptorWing", "Interceptor"],
  ["groundAttackWing", "Ground_Attack"],
  ["bomber", "Bomber"],
  ["transportWing", "Transport_Plane"],
  ["apcTruckColumn", "APC_Truck"],
  ["apcHalftrackCompany", "APC_Halftrack"],
  ["supplyConvoy", "Supply_Truck"],
  ["ammo", null],
  ["fuel", null],
  ["medic", null],
  ["transport", null],
  ["maintenance", null]
];

export interface UnitCombatProfile {
  readonly key: UnitAllocationKey;
  readonly unitType: UnitTypeKey | null;
  /** Mirrors the combat classification used by the balance tables. */
  readonly unitClass: keyof typeof combat.damage.shotsPerTurn | null;
  readonly softAttack: number;
  readonly hardAttack: number;
  readonly armor: { readonly front: number; readonly side: number; readonly top: number };
  readonly movement: number;
  readonly fuel: number;
  readonly ammo: number;
  /** Estimated fuel draw per tactical turn (simple heuristic derived from onboard fuel stores). */
  readonly fuelConsumptionPerTurn: number;
  /** Estimated ammunition expenditure per major engagement. */
  readonly ammoConsumptionPerEngagement: number;
  /** Baseline volleys fired during a five-minute tactical turn, sourced from `core/balance.ts`. */
  readonly shotsPerTurn: number;
}

/**
 * Derives lightweight sustainment estimates from fuel/ammo pool sizes. The constants favor clarity
 * over simulation precision so designers can quickly compare formations during iteration.
 */
function estimateConsumption(stats: { fuel: number; ammo: number }): {
  fuelPerTurn: number;
  ammoPerEngagement: number;
} {
  const fuelPerTurn = stats.fuel > 0 ? Math.max(1, Math.round(stats.fuel / 12)) : 0;
  const ammoPerEngagement = stats.ammo > 0 ? Math.max(1, Math.round(stats.ammo / 2)) : 0;
  return { fuelPerTurn, ammoPerEngagement };
}

export const unitCombatProfiles: readonly UnitCombatProfile[] = COMBAT_MAPPING.map(([key, unitType]) => {
  if (!unitType) {
    return {
      key,
      unitType: null,
      unitClass: null,
      softAttack: 0,
      hardAttack: 0,
      armor: EMPTY_ARMOR,
      movement: 0,
      fuel: 0,
      ammo: 0,
      fuelConsumptionPerTurn: 0,
      ammoConsumptionPerEngagement: 0,
      shotsPerTurn: 0
    } satisfies UnitCombatProfile;
  }

  const stats = unitTypes[unitType];
  const unitClass = stats.class as keyof typeof combat.damage.shotsPerTurn;
  const shotsPerTurn = combat.damage.shotsPerTurn[unitClass] ?? 0;
  const { fuelPerTurn, ammoPerEngagement } = estimateConsumption(stats);

  return {
    key,
    unitType,
    unitClass,
    softAttack: stats.softAttack,
    hardAttack: stats.hardAttack,
    armor: stats.armor,
    movement: stats.movement,
    fuel: stats.fuel,
    ammo: stats.ammo,
    fuelConsumptionPerTurn: fuelPerTurn,
    ammoConsumptionPerEngagement: ammoPerEngagement,
    shotsPerTurn
  } satisfies UnitCombatProfile;
});
