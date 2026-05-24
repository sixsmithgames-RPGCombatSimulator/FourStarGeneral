import type {
  AirCombatProfile,
  AirSupportProfile,
  CombatClassification,
  FacingDirection,
  MoveType,
  UnitTypeDefinition,
  UnitWeaponModel
} from "../../core/types";

export type FormationAllocationCategory = "units" | "supplies" | "support" | "logistics";

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
  | "apcHalftrackCompany"
  | "supplyConvoy"
  | "ammo"
  | "fuel"
  | "medic"
  | "transport"
  | "maintenance";

export type UnitTypeKey =
  | "Infantry_42"
  | "AT_Infantry"
  | "Paratrooper"
  | "Engineer"
  | "Combat_Engineer"
  | "AT_Gun_50mm"
  | "Flak_88"
  | "Recon_Bike"
  | "Recon_ArmoredCar"
  | "Scout_Plane"
  | "APC_Halftrack"
  | "Supply_Truck"
  | "Panzer_IV"
  | "Heavy_Tank"
  | "Light_Tank"
  | "Medium_Tank"
  | "Assault_Gun"
  | "Tank_Destroyer"
  | "Howitzer_105"
  | "Rocket_Artillery"
  | "SP_Artillery"
  | "Fighter"
  | "Interceptor"
  | "Ground_Attack"
  | "Bomber"
  | "Transport_Plane";

export type FormationPurpose =
  | "lineInfantry"
  | "airborne"
  | "engineer"
  | "recon"
  | "armorBreakthrough"
  | "tankDestroyer"
  | "assaultGunSupport"
  | "indirectFire"
  | "airDefense"
  | "closeAirSupport"
  | "fighter"
  | "transport"
  | "logistics"
  | "medical"
  | "maintenance";

export type CanonPlatformId = string;
export type CanonWeaponId = string;
export type CanonAmmoId = string;

export interface WeaponIssueDefinition {
  readonly weaponId: CanonWeaponId;
  readonly count?: number;
  readonly ammoMix?: readonly { readonly ammoId: CanonAmmoId; readonly rounds: number; readonly priority?: number }[];
}

export interface PersonnelElementDefinition {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly role: "rifle" | "crew" | "engineer" | "medic" | "hq" | "driver" | "maintenance" | "aircrew";
  readonly weaponRefs?: readonly WeaponIssueDefinition[];
}

export interface EquipmentElementDefinition {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  readonly platformId?: CanonPlatformId;
  readonly weaponRefs?: readonly WeaponIssueDefinition[];
  readonly purpose: readonly FormationPurpose[];
  readonly canonStatus?: "linked" | "missing" | "abstract";
}

export interface TacticalStatDefinition extends UnitTypeDefinition {
  readonly baseExperience?: number;
  readonly fortificationDamage?: "none" | "low" | "medium" | "high" | "veryHigh";
  readonly suppressionRole?: "none" | "low" | "medium" | "high" | "veryHigh";
}

/**
 * Extended tactical definition for platform+weapon system compatibility.
 * This interface allows units to transition from legacy AP to weapon model AP.
 */
export interface TacticalStatDefinitionWithOptionalAP extends Omit<UnitTypeDefinition, 'ap'> {
  /** @deprecated Legacy AP value - platform+weapon system uses weapon model armorPenetration */
  readonly ap?: number;
  readonly baseExperience?: number;
  readonly fortificationDamage?: "none" | "low" | "medium" | "high" | "veryHigh";
  readonly suppressionRole?: "none" | "low" | "medium" | "high" | "veryHigh";
}

export interface StartingLoadoutPolicy {
  readonly strength: number;
  readonly ammo: number;
  readonly fuel: number;
  readonly entrench: number;
  readonly facing: FacingDirection;
  readonly baseExperience: number;
}

export interface FormationRequisitionDefinition {
  readonly category: FormationAllocationCategory;
  readonly costPerUnit: number;
  readonly maxQuantity: number;
  readonly implemented?: boolean;
  readonly visibleInAllocationUi?: boolean;
  readonly depotPayload?: Readonly<{
    ammo?: number;
    fuel?: number;
    rations?: number;
    parts?: number;
  }>;
  readonly inBattleAllowed?: boolean;
  readonly requiresTransportFlight?: boolean;
}

export interface FormationDefinition {
  readonly key: UnitAllocationKey;
  readonly label: string;
  readonly shortLabel?: string;
  readonly historicalDescription: string;
  readonly gameplayDescription: string;
  readonly category: "units" | "supplies" | "support" | "logistics";
  readonly purpose: readonly FormationPurpose[];
  readonly echelon?: string;
  readonly vehicles?: number;
  readonly notes?: string;
  readonly personnel: readonly PersonnelElementDefinition[];
  readonly equipment: readonly EquipmentElementDefinition[];
  readonly equipmentSummary: readonly string[];
  readonly tacticalUnitType?: UnitTypeKey;
  readonly tactical?: TacticalStatDefinitionWithOptionalAP;
  readonly startingLoadout?: StartingLoadoutPolicy;
  readonly requisition: FormationRequisitionDefinition;
  readonly spriteUrl?: string;
}

export interface WeaponEffectProfile {
  readonly key: string;
  readonly attackKind:
    | "smallArms"
    | "machineGun"
    | "mortar"
    | "directHe"
    | "indirectHe"
    | "armorPiercing"
    | "heat"
    | "demolition"
    | "airBomb"
    | "airRocket"
    | "smoke";
  readonly fallbackCategory?: string;
  readonly personnelLethality: number;
  readonly vehicleKillPower: number;
  readonly vehicleDisablePower: number;
  readonly armorPenetration: number;
  readonly fortificationDamage: number;
  readonly suppression: number;
}

export interface ScenarioOnlyTacticalDefinition {
  readonly type: UnitTypeKey;
  readonly tactical: TacticalStatDefinitionWithOptionalAP;
  readonly historicalDescription: string;
}

export interface TacticalDefinitionInput {
  readonly class: UnitTypeDefinition["class"];
  readonly combat: CombatClassification;
  readonly weaponEffectType?: string;
  readonly movement: number;
  readonly moveType: MoveType;
  readonly vision: number;
  readonly ammo: number;
  readonly fuel: number;
  readonly rangeMin: number;
  readonly rangeMax: number;
  readonly initiative: number;
  readonly armor: UnitTypeDefinition["armor"];
  readonly hardAttack: number;
  readonly softAttack: number;
  /** @deprecated Legacy AP value - platform+weapon system uses weapon model armorPenetration */
  readonly ap?: number;
  readonly accuracyBase: number;
  readonly traits: string[];
  readonly cost: number;
  readonly airSupport?: AirSupportProfile;
  readonly airCombat?: AirCombatProfile;
  readonly baseExperience?: number;
  readonly fortificationDamage?: TacticalStatDefinition["fortificationDamage"];
  readonly suppressionRole?: TacticalStatDefinition["suppressionRole"];
  readonly weaponModel?: UnitWeaponModel;
}
