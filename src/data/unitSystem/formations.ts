import type { UnitWeaponModel } from "../../core/types";
import type { FormationDefinition, ScenarioOnlyTacticalDefinition, TacticalDefinitionInput, TacticalStatDefinitionWithOptionalAP, UnitAllocationKey } from "./types";

function unit(input: TacticalDefinitionInput): TacticalStatDefinitionWithOptionalAP {
  if (!input.weaponModel) {
    throw new Error(`Unit definition missing required weaponModel property. All units must explicitly define their weapon model according to coding standards.`);
  }
  return {
    ...input,
    weaponModel: input.weaponModel
  };
}

function sprite(path: string): string {
  return new URL(`../../assets/units/${path}`, import.meta.url).href;
}

function scaleWeaponModel(model: UnitWeaponModel, platformCount: number): UnitWeaponModel {
  const count = Math.max(0, Math.round(platformCount));
  return {
    ...model,
    doctrine: `${model.doctrine} Authored fire volume is scaled across ${count} firing platforms for a five-minute engagement.`,
    groups: model.groups.map((group) => ({
      ...group,
      shots: Math.max(0, Math.round(group.shots * count))
    }))
  };
}

/**
 * WWII US Infantry Battalion TO&E (Feb 1944) - 770 men
 * 
 * Standard Battalion (Infantry_42):
 * - 3 Rifle Companies: 193 men each = 579 total
 *   - 27 Rifle Squads (12 men each) = 324 men
 *   - 6 Bazooka Teams (2 men each, per company weapons plt) = 36 men
 *   - 6 LMG Teams (7 men each) = 42 men
 *   - Company HQ: 105 men
 * - 1 Heavy Weapons Company: 160 men
 *   - 8 HMG Teams (9 men each) = 72 men
 *   - 6 × 81mm Mortar Teams (10 men each) = 60 men
 *   - Company HQ: 28 men
 * - Battalion HQ: 31 men
 * TOTAL: 770 men
 * 
 * AT Infantry Battalion (770 men):
 * - 2 Rifle Companies: 192 men each = 384 total (reduced rifle, no mortars)
 *   - 18 Rifle Squads = 216 men
 *   - 4 Bazooka Teams = 8 men
 *   - 4 LMG Teams = 28 men
 *   - Company HQ: 68 men each = 136
 * - 2 Heavy Weapons Companies: 178 men each = 356 total (upgraded 81mm)
 *   - 8 HMG Teams each = 144 men
 *   - 12 × 81mm Mortar Teams each = 120 men (doubled mortars)
 *   - Company HQ: 28 each = 56
 * - Battalion HQ: 30 men
 * TOTAL: 770 men
 */

const weaponModels = {
  // Squad-level base units
  rifleSquad: {
    doctrine: "12-man rifle squad: 10 rifles/SMGs, 1 BAR (automatic rifle), 1 grenadier. ~25 rounds per rifleman per 5-min engagement.",
    groups: [
      { id: "squad-rifles", label: "Rifles and SMGs (10 men)", role: "smallArms", shots: 250, accuracyMultiplier: 1, softEffect: { injured: 0.65, wounded: 0.28, severelyWounded: 0.04, killed: 0.03 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.012, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      { id: "squad-bar", label: "Browning Automatic Rifle", role: "machineGun", shots: 40, accuracyMultiplier: 0.95, softEffect: { injured: 0.75, wounded: 0.32, severelyWounded: 0.05, killed: 0.04 }, hardEffect: { damaged: 0.004, disabled: 0.001, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.035, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "squad-grenadier", label: "Rifle grenadier (1 man)", role: "directHe", shots: 2, accuracyMultiplier: 0.72, softEffect: { injured: 2.2, wounded: 1.6, severelyWounded: 0.35, killed: 0.45, maxKilledPerHit: 8, maxCasualtiesPerHit: 12, blastMultiplier: 0.65, casualtyRoundingThreshold: 0.25, minimumCasualtiesPerHit: 1, minimumWoundedPerHit: 1 }, hardEffect: { damaged: 0.04, disabled: 0.01, destroyed: 0.002, armorPenetration: 3, damageType: "explosive" }, suppressionPerHit: 0.8, fortificationDamagePerHit: 0.45, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.60, softComponent: 0.30, penetrating: 0.10, areaEffect: 0 }, vsArtillery: { nonEffect: 0.20, softComponent: 0.35, penetrating: 0.45, areaEffect: 0 } } }
    ]
  },
  bazookaTeam: {
    doctrine: "2-man bazooka team (gunner + loader). Cannot operate rifles simultaneously. ~6 shots per 5-minute engagement.",
    groups: [
      { id: "bazooka", label: "M9A1 Bazooka (2 crew)", role: "antiTank", shots: 6, accuracyMultiplier: 0.72, softEffect: { injured: 0.2, wounded: 0.08, severelyWounded: 0.02, killed: 0.02 }, hardEffect: { damaged: 2.4, disabled: 0.9, destroyed: 0.25, armorPenetration: 12, damageType: "shapedCharge" }, suppressionPerHit: 0.08, fortificationDamagePerHit: 0.2, hitDistribution: { vsInfantry: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.20, penetrating: 0.70, areaEffect: 0 } } }
    ]
  },
  lmgTeam: {
    doctrine: "7-man light machine gun team: 1 M1919A4, 1 assistant, 5 ammo bearers/scouts. ~150 rounds per 5-min engagement.",
    groups: [
      { id: "lmg-m1919", label: "M1919A4 LMG team (7 crew)", role: "machineGun", shots: 150, accuracyMultiplier: 0.95, softEffect: { injured: 0.75, wounded: 0.32, severelyWounded: 0.05, killed: 0.04 }, hardEffect: { damaged: 0.004, disabled: 0.001, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.04, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } }
    ]
  },
  hmgTeam: {
    doctrine: "9-man heavy machine gun team: 1 M1917A1 .30 cal, 1 assistant, 7 ammo bearers. ~200 rounds per 5-min engagement.",
    groups: [
      { id: "hmg-m1917", label: "M1917A1 HMG team (9 crew)", role: "machineGun", shots: 200, accuracyMultiplier: 0.92, softEffect: { injured: 0.80, wounded: 0.35, severelyWounded: 0.06, killed: 0.05 }, hardEffect: { damaged: 0.005, disabled: 0.002, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.06, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.93, softComponent: 0.07, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.07, softComponent: 0.18, penetrating: 0.75, areaEffect: 0 } } }
    ]
  },
  mortar81Team: {
    doctrine: "10-man 81mm mortar squad: 1 M1 mortar, 3 crew, 6 ammo bearers. ~8 rounds per 5-minute engagement sustained fire.",
    groups: [
      { id: "mortar-81mm", label: "M1 81mm mortar (10 crew)", role: "indirectHe", shots: 8, accuracyMultiplier: 0.75, softEffect: { injured: 3.5, wounded: 2.5, severelyWounded: 0.6, killed: 0.7, maxKilledPerHit: 12, maxCasualtiesPerHit: 16, blastMultiplier: 0.95, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.12, disabled: 0.04, destroyed: 0.01, armorPenetration: 5, damageType: "explosive" }, suppressionPerHit: 1.2, fortificationDamagePerHit: 0.8, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.45, softComponent: 0.35, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.30, penetrating: 0.55, areaEffect: 0 } } }
    ]
  },

  // INFANTRY BATTALION (770 men) - TO&E Feb 1944
  // 27 rifle squads + 6 bazooka teams + 6 LMG teams + 8 HMG teams + 6 mortar81 teams
  infantryBattalion: {
    doctrine: "US Infantry Battalion (770 men): 3 Rifle Companies + 1 Heavy Weapons Company. 27 rifle squads, 6 bazookas, 14 MGs, 6 × 81mm mortars.",
    groups: [
      // 27 rifle squads × 292 shots = 7,884 (rifles 250 + BAR 40 + grenadier 2)
      { id: "rifle-squads", label: "Rifle Squads (27 squads × 12 men)", role: "smallArms", shots: 7884, accuracyMultiplier: 1, softEffect: { injured: 0.65, wounded: 0.28, severelyWounded: 0.04, killed: 0.03 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.015, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      // 6 LMG teams × 150 = 900, 8 HMG teams × 200 = 1600, total 2,500
      { id: "machine-guns", label: "MGs (6 LMG + 8 HMG teams)", role: "machineGun", shots: 2500, accuracyMultiplier: 0.94, softEffect: { injured: 0.78, wounded: 0.34, severelyWounded: 0.055, killed: 0.045 }, hardEffect: { damaged: 0.0045, disabled: 0.0015, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.05, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.935, softComponent: 0.065, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.075, softComponent: 0.175, penetrating: 0.75, areaEffect: 0 } } },
      // 6 bazooka teams × 6 = 36
      { id: "bazooka-teams", label: "Bazooka Teams (6 teams × 2 men)", role: "antiTank", shots: 36, accuracyMultiplier: 0.72, softEffect: { injured: 0.2, wounded: 0.08, severelyWounded: 0.02, killed: 0.02 }, hardEffect: { damaged: 2.4, disabled: 0.9, destroyed: 0.25, armorPenetration: 12, damageType: "shapedCharge" }, suppressionPerHit: 0.08, fortificationDamagePerHit: 0.2, hitDistribution: { vsInfantry: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.20, penetrating: 0.70, areaEffect: 0 } } },
      // 6 mortar81 teams × 8 = 48
      { id: "mortar-81s", label: "81mm Mortars (6 tubes)", role: "indirectHe", shots: 48, accuracyMultiplier: 0.75, softEffect: { injured: 3.5, wounded: 2.5, severelyWounded: 0.6, killed: 0.7, maxKilledPerHit: 12, maxCasualtiesPerHit: 16, blastMultiplier: 0.95, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.12, disabled: 0.04, destroyed: 0.01, armorPenetration: 5, damageType: "explosive" }, suppressionPerHit: 1.2, fortificationDamagePerHit: 0.8, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.45, softComponent: 0.35, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.30, penetrating: 0.55, areaEffect: 0 } } }
    ]
  },

  // AT INFANTRY BATTALION (770 men) - Specialist formation
  // 18 rifle squads + 4 bazooka teams + 4 LMG teams + 16 HMG teams + 12 mortar81 teams
  antiTankInfantry: {
    doctrine: "AT Infantry Battalion (770 men): 2 Rifle Companies + 2 Heavy Weapons Companies. 18 rifle squads, 4 bazookas, 20 MGs, 12 × 81mm mortars, + additional 14 bazooka teams.",
    groups: [
      // 18 rifle squads × 292 = 5,256
      { id: "security-rifle-squads", label: "Security Rifle Squads (18 squads)", role: "smallArms", shots: 5256, accuracyMultiplier: 1, softEffect: { injured: 0.65, wounded: 0.28, severelyWounded: 0.04, killed: 0.03 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.015, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      // 4 LMG × 150 + 16 HMG × 200 = 600 + 3,200 = 3,800
      { id: "at-battalion-mgs", label: "MGs (4 LMG + 16 HMG teams)", role: "machineGun", shots: 3800, accuracyMultiplier: 0.94, softEffect: { injured: 0.78, wounded: 0.34, severelyWounded: 0.055, killed: 0.045 }, hardEffect: { damaged: 0.0045, disabled: 0.0015, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.05, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.935, softComponent: 0.065, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.075, softComponent: 0.175, penetrating: 0.75, areaEffect: 0 } } },
      // 18 bazooka teams × 6 = 108 (6 in rifle companies + 12 additional)
      { id: "at-battalion-bazookas", label: "Bazooka Teams (18 teams)", role: "antiTank", shots: 108, accuracyMultiplier: 0.72, softEffect: { injured: 0.2, wounded: 0.08, severelyWounded: 0.02, killed: 0.02 }, hardEffect: { damaged: 2.4, disabled: 0.9, destroyed: 0.25, armorPenetration: 12, damageType: "shapedCharge" }, suppressionPerHit: 0.08, fortificationDamagePerHit: 0.2, hitDistribution: { vsInfantry: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.20, penetrating: 0.70, areaEffect: 0 } } },
      // 12 mortar81 teams × 8 = 96 (6 per heavy weapons company × 2)
      { id: "at-battalion-mortars", label: "81mm Mortars (12 tubes)", role: "indirectHe", shots: 96, accuracyMultiplier: 0.75, softEffect: { injured: 3.5, wounded: 2.5, severelyWounded: 0.6, killed: 0.7, maxKilledPerHit: 12, maxCasualtiesPerHit: 16, blastMultiplier: 0.95, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.12, disabled: 0.04, destroyed: 0.01, armorPenetration: 5, damageType: "explosive" }, suppressionPerHit: 1.2, fortificationDamagePerHit: 0.8, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.45, softComponent: 0.35, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.30, penetrating: 0.55, areaEffect: 0 } } }
    ]
  },
  airborneCompany: {
    doctrine: "Parachute infantry company (150 men): 9 rifle squads, 4 portable MG teams, 3 light mortars, and 3 portable AT teams. Five-minute gunnery-range fire volume is formation-wide.",
    groups: [
      { id: "airborne-small-arms", label: "Airborne rifles and SMGs (9 squads)", role: "smallArms", shots: 2628, accuracyMultiplier: 1.08, softEffect: { injured: 0.58, wounded: 0.24, severelyWounded: 0.035, killed: 0.025 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.014, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      { id: "airborne-mg-fire", label: "Portable machine guns (4 teams)", role: "machineGun", shots: 600, accuracyMultiplier: 1, softEffect: { injured: 0.66, wounded: 0.28, severelyWounded: 0.045, killed: 0.035 }, hardEffect: { damaged: 0.003, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.04, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "airborne-light-mortars", label: "Light mortars (3 tubes)", role: "directHe", shots: 24, accuracyMultiplier: 0.78, softEffect: { injured: 1.8, wounded: 1.25, severelyWounded: 0.28, killed: 0.32, maxKilledPerHit: 8, maxCasualtiesPerHit: 10, blastMultiplier: 0.75, casualtyRoundingThreshold: 0.25 }, hardEffect: { damaged: 0.03, disabled: 0.008, destroyed: 0.001, armorPenetration: 3, damageType: "explosive" }, suppressionPerHit: 0.75, fortificationDamagePerHit: 0.35, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.60, softComponent: 0.30, penetrating: 0.10, areaEffect: 0 }, vsArtillery: { nonEffect: 0.20, softComponent: 0.35, penetrating: 0.45, areaEffect: 0 } } },
      { id: "airborne-at-weapons", label: "Portable anti-tank weapons (3 teams)", role: "antiTank", shots: 18, accuracyMultiplier: 0.82, softEffect: { injured: 0.25, wounded: 0.1, severelyWounded: 0.02, killed: 0.02 }, hardEffect: { damaged: 0.38, disabled: 0.18, destroyed: 0.07, armorPenetration: 12, damageType: "shapedCharge" }, suppressionPerHit: 0.1, fortificationDamagePerHit: 0.2, hitDistribution: { vsInfantry: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.20, penetrating: 0.70, areaEffect: 0 } } }
    ]
  },
  engineers: {
    doctrine: "Engineer company (160 men): 120 riflemen/engineers firing, 6 automatic-weapon teams, and 12 demolition placements over a five-minute close fight.",
    groups: [
      { id: "engineer-small-arms", label: "Engineer small arms (120 men)", role: "smallArms", shots: 3000, accuracyMultiplier: 0.98, softEffect: { injured: 0.50, wounded: 0.20, severelyWounded: 0.03, killed: 0.02 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.012, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      { id: "engineer-assault-weapons", label: "Automatic assault weapons (6 teams)", role: "machineGun", shots: 900, accuracyMultiplier: 0.95, softEffect: { injured: 0.60, wounded: 0.25, severelyWounded: 0.04, killed: 0.03 }, hardEffect: { damaged: 0.004, disabled: 0.001, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.045, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "engineer-demolitions", label: "Satchels, mines, and demolition charges (12 placements)", role: "demolition", shots: 12, accuracyMultiplier: 0.72, softEffect: { injured: 1.4, wounded: 1.1, severelyWounded: 0.35, killed: 0.35, maxKilledPerHit: 8, maxCasualtiesPerHit: 10, blastMultiplier: 0.9, casualtyRoundingThreshold: 0.25 }, hardEffect: { damaged: 0.45, disabled: 0.28, destroyed: 0.12, armorPenetration: 8, damageType: "explosive" }, suppressionPerHit: 0.9, fortificationDamagePerHit: 4.5, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.25, softComponent: 0.35, penetrating: 0.40, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 } } }
    ]
  },
  combatEngineers: {
    doctrine: "Combat engineer company (160 men): higher density of automatic weapons and breaching charges than line engineers, counted across the full formation.",
    groups: [
      { id: "combat-engineer-small-arms", label: "Engineer small arms (120 men)", role: "smallArms", shots: 3000, accuracyMultiplier: 0.98, softEffect: { injured: 0.52, wounded: 0.22, severelyWounded: 0.032, killed: 0.02 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.012, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } },
      { id: "combat-engineer-assault-weapons", label: "Assault automatic weapons (8 teams)", role: "machineGun", shots: 1200, accuracyMultiplier: 0.95, softEffect: { injured: 0.62, wounded: 0.27, severelyWounded: 0.045, killed: 0.035 }, hardEffect: { damaged: 0.004, disabled: 0.001, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.05, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "combat-engineer-demolitions", label: "Heavy demolition charges (18 placements)", role: "demolition", shots: 18, accuracyMultiplier: 0.72, softEffect: { injured: 1.6, wounded: 1.25, severelyWounded: 0.42, killed: 0.42, maxKilledPerHit: 9, maxCasualtiesPerHit: 11, blastMultiplier: 1.05, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.52, disabled: 0.34, destroyed: 0.16, armorPenetration: 10, damageType: "explosive" }, suppressionPerHit: 1, fortificationDamagePerHit: 5.5, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 }, vsArtillery: { nonEffect: 0.12, softComponent: 0.23, penetrating: 0.65, areaEffect: 0 } } }
    ]
  },
  lightTank: scaleWeaponModel({
    doctrine: "Light tanks rely on cannon HE, coaxial machine guns, and limited AP fire.",
    groups: [
      { id: "light-tank-he", label: "37-50mm HE rounds", role: "directHe", shots: 30, accuracyMultiplier: 0.92, softEffect: { injured: 0.75, wounded: 0.7, severelyWounded: 0.16, killed: 0.18, maxKilledPerHit: 7, maxCasualtiesPerHit: 8, blastMultiplier: 0.45, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.08, disabled: 0.03, destroyed: 0.01, armorPenetration: 6, damageType: "explosive" }, suppressionPerHit: 0.55, fortificationDamagePerHit: 0.75, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.55, softComponent: 0.30, penetrating: 0.15, areaEffect: 0 }, vsArtillery: { nonEffect: 0.30, softComponent: 0.35, penetrating: 0.35, areaEffect: 0 } } },
      { id: "light-tank-mg", label: "Coaxial and hull machine guns", role: "machineGun", shots: 210, accuracyMultiplier: 0.9, softEffect: { injured: 0.42, wounded: 0.18, severelyWounded: 0.025, killed: 0.018 }, hardEffect: { damaged: 0.003, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.04, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "light-tank-ap", label: "Armor-piercing rounds", role: "antiTank", shots: 22, accuracyMultiplier: 0.9, softEffect: { injured: 0.15, wounded: 0.05, severelyWounded: 0.012, killed: 0.01 }, hardEffect: { damaged: 0.30, disabled: 0.06, destroyed: 0.015, armorPenetration: 12, damageType: "kinetic" }, suppressionPerHit: 0.1, fortificationDamagePerHit: 0.2, hitDistribution: { vsInfantry: { nonEffect: 0.25, softComponent: 0.35, penetrating: 0.40, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.20, softComponent: 0.25, penetrating: 0.55, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.20, penetrating: 0.65, areaEffect: 0 } } }
    ]
  }, 20),
  stuartLightTank: scaleWeaponModel({
    doctrine: "M3/M5 Stuart light tanks with 37mm M6 gun. Fast and agile with limited firepower suitable for reconnaissance and screening. The 37mm gun can engage light armor but struggles against medium tanks.",
    groups: [
      { id: "stuart-he", label: "37mm HE rounds", role: "directHe", shots: 35, accuracyMultiplier: 0.90, softEffect: { injured: 0.55, wounded: 0.5, severelyWounded: 0.12, killed: 0.14, maxKilledPerHit: 5, maxCasualtiesPerHit: 6, blastMultiplier: 0.35, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.05, disabled: 0.02, destroyed: 0.005, armorPenetration: 5, damageType: "explosive" }, suppressionPerHit: 0.42, fortificationDamagePerHit: 0.55, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.60, softComponent: 0.28, penetrating: 0.12, areaEffect: 0 }, vsArtillery: { nonEffect: 0.35, softComponent: 0.38, penetrating: 0.27, areaEffect: 0 } } },
      { id: "stuart-mg", label: "Coaxial and hull .30 cal MGs", role: "machineGun", shots: 220, accuracyMultiplier: 0.88, softEffect: { injured: 0.40, wounded: 0.17, severelyWounded: 0.024, killed: 0.016 }, hardEffect: { damaged: 0.0025, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.038, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "stuart-ap", label: "37mm APC rounds", role: "antiTank", shots: 26, accuracyMultiplier: 0.88, softEffect: { injured: 0.14, wounded: 0.045, severelyWounded: 0.010, killed: 0.008 }, hardEffect: { damaged: 0.22, disabled: 0.045, destroyed: 0.010, armorPenetration: 10, damageType: "kinetic" }, suppressionPerHit: 0.085, fortificationDamagePerHit: 0.18, hitDistribution: { vsInfantry: { nonEffect: 0.28, softComponent: 0.38, penetrating: 0.34, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.28, softComponent: 0.28, penetrating: 0.44, areaEffect: 0 }, vsArtillery: { nonEffect: 0.20, softComponent: 0.22, penetrating: 0.58, areaEffect: 0 } } }
    ]
  }, 24),
  mediumTank: scaleWeaponModel({
    doctrine: "Medium tank company fire separates HE and AP main-gun shots from coaxial machine-gun suppression.",
    groups: [
      { id: "medium-tank-he", label: "75mm HE rounds", role: "directHe", shots: 45, accuracyMultiplier: 0.94, softEffect: { injured: 1.15, wounded: 1, severelyWounded: 0.22, killed: 0.28, maxKilledPerHit: 10, maxCasualtiesPerHit: 12, blastMultiplier: 0.65, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.12, disabled: 0.05, destroyed: 0.015, armorPenetration: 8, damageType: "explosive" }, suppressionPerHit: 0.8, fortificationDamagePerHit: 1.05, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.50, softComponent: 0.30, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.25, softComponent: 0.30, penetrating: 0.45, areaEffect: 0 } } },
      { id: "medium-tank-mg", label: "Coaxial and hull machine guns", role: "machineGun", shots: 320, accuracyMultiplier: 0.92, softEffect: { injured: 0.44, wounded: 0.19, severelyWounded: 0.028, killed: 0.02 }, hardEffect: { damaged: 0.003, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.045, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "medium-tank-ap", label: "75mm armor-piercing rounds", role: "antiTank", shots: 30, accuracyMultiplier: 0.95, softEffect: { injured: 0.18, wounded: 0.07, severelyWounded: 0.015, killed: 0.012 }, hardEffect: { damaged: 0.26, disabled: 0.1, destroyed: 0.035, armorPenetration: 14, damageType: "kinetic" }, suppressionPerHit: 0.12, fortificationDamagePerHit: 0.25, hitDistribution: { vsInfantry: { nonEffect: 0.22, softComponent: 0.33, penetrating: 0.45, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.22, penetrating: 0.63, areaEffect: 0 }, vsArtillery: { nonEffect: 0.12, softComponent: 0.18, penetrating: 0.70, areaEffect: 0 } } }
    ]
  }, 20),
  heavyTank: scaleWeaponModel({
    doctrine: "Heavy tanks fire fewer but more powerful AP and HE rounds with strong machine-gun suppression.",
    groups: [
      { id: "heavy-tank-he", label: "Heavy tank HE rounds", role: "directHe", shots: 34, accuracyMultiplier: 0.95, softEffect: { injured: 1.4, wounded: 1.25, severelyWounded: 0.3, killed: 0.36, maxKilledPerHit: 10, maxCasualtiesPerHit: 13, blastMultiplier: 0.8, casualtyRoundingThreshold: 0.3, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.14, disabled: 0.06, destroyed: 0.02, armorPenetration: 9, damageType: "explosive" }, suppressionPerHit: 0.95, fortificationDamagePerHit: 1.1, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.45, softComponent: 0.30, penetrating: 0.25, areaEffect: 0 }, vsArtillery: { nonEffect: 0.22, softComponent: 0.28, penetrating: 0.50, areaEffect: 0 } } },
      { id: "heavy-tank-mg", label: "Coaxial and hull machine guns", role: "machineGun", shots: 260, accuracyMultiplier: 0.9, softEffect: { injured: 0.44, wounded: 0.19, severelyWounded: 0.028, killed: 0.02 }, hardEffect: { damaged: 0.003, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" }, suppressionPerHit: 0.045, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "heavy-tank-ap", label: "High-velocity AP rounds", role: "antiTank", shots: 26, accuracyMultiplier: 0.96, softEffect: { injured: 0.2, wounded: 0.08, severelyWounded: 0.018, killed: 0.015 }, hardEffect: { damaged: 0.36, disabled: 0.16, destroyed: 0.07, armorPenetration: 18, damageType: "kinetic" }, suppressionPerHit: 0.14, fortificationDamagePerHit: 0.25, hitDistribution: { vsInfantry: { nonEffect: 0.20, softComponent: 0.32, penetrating: 0.48, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.10, softComponent: 0.18, penetrating: 0.72, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.15, penetrating: 0.77, areaEffect: 0 } } }
    ]
  }, 14),
  assaultGun: scaleWeaponModel({
    doctrine: "Assault guns trade tank-like accuracy for larger HE and demolition-like effects against troops and works.",
    groups: [
      { id: "assault-gun-he", label: "Large-caliber HE rounds", role: "directHe", shots: 42, accuracyMultiplier: 0.82, softEffect: { injured: 1.6, wounded: 1.35, severelyWounded: 0.34, killed: 0.4, maxKilledPerHit: 10, maxCasualtiesPerHit: 13, blastMultiplier: 0.95, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.16, disabled: 0.07, destroyed: 0.02, armorPenetration: 8 }, suppressionPerHit: 2.5, fortificationDamagePerHit: 3.5, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.48, softComponent: 0.32, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.25, softComponent: 0.30, penetrating: 0.45, areaEffect: 0 } } },
      { id: "assault-gun-mg", label: "Defensive machine guns", role: "machineGun", shots: 130, accuracyMultiplier: 0.8, softEffect: { injured: 0.38, wounded: 0.16, severelyWounded: 0.022, killed: 0.015 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.04, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } },
      { id: "assault-gun-ap", label: "Limited AP rounds", role: "antiTank", shots: 18, accuracyMultiplier: 0.82, softEffect: { injured: 0.15, wounded: 0.06, severelyWounded: 0.012, killed: 0.01 }, hardEffect: { damaged: 0.18, disabled: 0.06, destroyed: 0.02, armorPenetration: 10, damageType: "kinetic" }, suppressionPerHit: 0.12, fortificationDamagePerHit: 0.3, hitDistribution: { vsInfantry: { nonEffect: 0.25, softComponent: 0.35, penetrating: 0.40, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.18, softComponent: 0.22, penetrating: 0.60, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.20, penetrating: 0.65, areaEffect: 0 } } }
    ]
  }, 6),
  tankDestroyer: scaleWeaponModel({
    doctrine: "Tank destroyers concentrate accurate AP shots and carry limited HE or machine-gun fire.",
    groups: [
      { id: "tank-destroyer-ap", label: "High-velocity AP rounds", role: "antiTank", shots: 34, accuracyMultiplier: 1.02, softEffect: { injured: 0.16, wounded: 0.06, severelyWounded: 0.014, killed: 0.012 }, hardEffect: { damaged: 0.32, disabled: 0.12, destroyed: 0.045, armorPenetration: 20, damageType: "kinetic" }, suppressionPerHit: 0.12, fortificationDamagePerHit: 0.25, hitDistribution: { vsInfantry: { nonEffect: 0.18, softComponent: 0.30, penetrating: 0.52, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.08, softComponent: 0.15, penetrating: 0.77, areaEffect: 0 }, vsArtillery: { nonEffect: 0.06, softComponent: 0.12, penetrating: 0.82, areaEffect: 0 } } },
      { id: "tank-destroyer-he", label: "Limited HE rounds", role: "directHe", shots: 10, accuracyMultiplier: 0.92, softEffect: { injured: 0.9, wounded: 0.75, severelyWounded: 0.16, killed: 0.18, maxKilledPerHit: 8, maxCasualtiesPerHit: 10, blastMultiplier: 0.55, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.08, disabled: 0.03, destroyed: 0.01, armorPenetration: 6 }, suppressionPerHit: 0.45, fortificationDamagePerHit: 0.55, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.55, softComponent: 0.30, penetrating: 0.15, areaEffect: 0 }, vsArtillery: { nonEffect: 0.28, softComponent: 0.32, penetrating: 0.40, areaEffect: 0 } } },
      { id: "tank-destroyer-mg", label: "Machine guns", role: "machineGun", shots: 90, accuracyMultiplier: 0.85, softEffect: { injured: 0.34, wounded: 0.14, severelyWounded: 0.02, killed: 0.012 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.03, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } }
    ]
  }, 12),
  artillery: {
    doctrine: "Six-gun 105mm howitzer battery: 6 tubes firing 15 rounds each during a five-minute gunnery-range mission.",
    groups: [
      { id: "howitzer-shells", label: "105mm HE shells (6 tubes)", role: "indirectHe", shots: 90, accuracyMultiplier: 0.68, softEffect: { injured: 1.7, wounded: 1.45, severelyWounded: 0.32, killed: 0.38, maxKilledPerHit: 10, maxCasualtiesPerHit: 14, blastMultiplier: 1.6, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.18, disabled: 0.08, destroyed: 0.025, armorPenetration: 10 }, suppressionPerHit: 1.4, fortificationDamagePerHit: 1.8, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.40, softComponent: 0.35, penetrating: 0.25, areaEffect: 0 }, vsArtillery: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 } } }
    ]
  },
  rocketArtillery: {
    doctrine: "Four rocket launch vehicles firing a full 12-rocket launcher salvo during a five-minute fire mission.",
    groups: [
      { id: "rocket-salvo", label: "Rocket salvo", role: "indirectHe", shots: 48, accuracyMultiplier: 0.42, softEffect: { injured: 1.35, wounded: 1.1, severelyWounded: 0.28, killed: 0.32, maxKilledPerHit: 9, maxCasualtiesPerHit: 12, blastMultiplier: 1.15, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.14, disabled: 0.06, destroyed: 0.02, armorPenetration: 8 }, suppressionPerHit: 1.7, fortificationDamagePerHit: 1.35, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.45, softComponent: 0.35, penetrating: 0.20, areaEffect: 0 }, vsArtillery: { nonEffect: 0.25, softComponent: 0.30, penetrating: 0.45, areaEffect: 0 } } }
    ]
  },
  spArtillery: {
    doctrine: "Eight self-propelled guns firing 15 HE rounds each during a five-minute gunnery-range mission.",
    groups: [
      { id: "sp-howitzer-shells", label: "Self-propelled HE shells (8 guns)", role: "indirectHe", shots: 120, accuracyMultiplier: 0.72, softEffect: { injured: 1.6, wounded: 1.35, severelyWounded: 0.3, killed: 0.35, maxKilledPerHit: 10, maxCasualtiesPerHit: 13, blastMultiplier: 1.45, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.16, disabled: 0.07, destroyed: 0.022, armorPenetration: 10 }, suppressionPerHit: 1.35, fortificationDamagePerHit: 1.65, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.40, softComponent: 0.35, penetrating: 0.25, areaEffect: 0 }, vsArtillery: { nonEffect: 0.20, softComponent: 0.30, penetrating: 0.50, areaEffect: 0 } } }
    ]
  },
  antiTankGun: scaleWeaponModel({
    doctrine: "Six-gun 57mm anti-tank battery firing mostly AP with a small HE allotment.",
    groups: [
      { id: "at-gun-ap", label: "57mm AP rounds", role: "antiTank", shots: 42, accuracyMultiplier: 1, softEffect: { injured: 0.12, wounded: 0.04, severelyWounded: 0.01, killed: 0.008 }, hardEffect: { damaged: 0.53, disabled: 0.16, destroyed: 0.045, armorPenetration: 13, damageType: "kinetic" }, suppressionPerHit: 0.08, fortificationDamagePerHit: 0.18, hitDistribution: { vsInfantry: { nonEffect: 0.30, softComponent: 0.35, penetrating: 0.35, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.20, softComponent: 0.25, penetrating: 0.55, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.20, penetrating: 0.65, areaEffect: 0 } } },
      { id: "at-gun-he", label: "57mm HE rounds", role: "directHe", shots: 6, accuracyMultiplier: 0.9, softEffect: { injured: 0.65, wounded: 0.45, severelyWounded: 0.1, killed: 0.12, maxKilledPerHit: 5, maxCasualtiesPerHit: 6, blastMultiplier: 0.6, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.05, disabled: 0.012, destroyed: 0.002, armorPenetration: 5 }, suppressionPerHit: 0.3, fortificationDamagePerHit: 0.3, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.65, softComponent: 0.25, penetrating: 0.10, areaEffect: 0 }, vsArtillery: { nonEffect: 0.35, softComponent: 0.30, penetrating: 0.35, areaEffect: 0 } } }
    ]
  }, 6),
  flak88: scaleWeaponModel({
    doctrine: "Dual-purpose 88mm guns can be devastating against armor and still dangerous with HE.",
    groups: [
      { id: "flak-88-ap", label: "88mm AP rounds", role: "antiTank", shots: 36, accuracyMultiplier: 1, softEffect: { injured: 0.18, wounded: 0.06, severelyWounded: 0.014, killed: 0.012 }, hardEffect: { damaged: 0.36, disabled: 0.16, destroyed: 0.07, armorPenetration: 18, damageType: "kinetic" }, suppressionPerHit: 0.14, fortificationDamagePerHit: 0.25, hitDistribution: { vsInfantry: { nonEffect: 0.15, softComponent: 0.28, penetrating: 0.57, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.06, softComponent: 0.12, penetrating: 0.82, areaEffect: 0 }, vsArtillery: { nonEffect: 0.05, softComponent: 0.10, penetrating: 0.85, areaEffect: 0 } } },
      { id: "flak-88-he", label: "88mm HE rounds", role: "directHe", shots: 10, accuracyMultiplier: 0.88, softEffect: { injured: 1.2, wounded: 1, severelyWounded: 0.24, killed: 0.28, maxKilledPerHit: 9, maxCasualtiesPerHit: 11, blastMultiplier: 0.85, casualtyRoundingThreshold: 0.3, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.1, disabled: 0.04, destroyed: 0.01, armorPenetration: 7 }, suppressionPerHit: 0.75, fortificationDamagePerHit: 0.9, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.42, softComponent: 0.33, penetrating: 0.25, areaEffect: 0 }, vsArtillery: { nonEffect: 0.22, softComponent: 0.28, penetrating: 0.50, areaEffect: 0 } } }
    ]
  }, 4),
  reconBike: {
    doctrine: "Motorcycle recon platoon (54 men, 18 bikes): dismounted scouts and 6 light automatic weapons counted across the full patrol.",
    groups: [
      { id: "recon-bike-small-arms", label: "Motorcycle small arms (36 scouts)", role: "smallArms", shots: 900, accuracyMultiplier: 1, softEffect: { injured: 0.42, wounded: 0.16, severelyWounded: 0.02, killed: 0.012 }, hardEffect: { damaged: 0.001, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.01, hitDistribution: { vsInfantry: { nonEffect: 0.02, softComponent: 0, penetrating: 0.98, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.96, softComponent: 0.04, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.12, softComponent: 0.13, penetrating: 0.75, areaEffect: 0 } } },
      { id: "recon-bike-lmg", label: "Light machine guns (6 teams)", role: "machineGun", shots: 900, accuracyMultiplier: 0.95, softEffect: { injured: 0.50, wounded: 0.20, severelyWounded: 0.03, killed: 0.02 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.025, hitDistribution: { vsInfantry: { nonEffect: 0.02, softComponent: 0, penetrating: 0.98, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.95, softComponent: 0.05, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.10, softComponent: 0.15, penetrating: 0.75, areaEffect: 0 } } }
    ]
  },
  armoredCar: scaleWeaponModel({
    doctrine: "Armored cars combine autocannon or light cannon fire with machine guns.",
    groups: [
      { id: "armored-car-cannon", label: "Light cannon/autocannon", role: "directHe", shots: 18, accuracyMultiplier: 0.9, softEffect: { injured: 0.4, wounded: 0.25, severelyWounded: 0.05, killed: 0.04, maxKilledPerHit: 3, maxCasualtiesPerHit: 5, blastMultiplier: 0.3, casualtyRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.45, disabled: 0.16, destroyed: 0.05, armorPenetration: 7 }, suppressionPerHit: 0.35, fortificationDamagePerHit: 0.35, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.52, softComponent: 0.30, penetrating: 0.18, areaEffect: 0 }, vsArtillery: { nonEffect: 0.28, softComponent: 0.32, penetrating: 0.40, areaEffect: 0 } } },
      { id: "armored-car-mg", label: "Vehicle machine guns", role: "machineGun", shots: 120, accuracyMultiplier: 0.9, softEffect: { injured: 0.44, wounded: 0.18, severelyWounded: 0.025, killed: 0.018 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.03, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } }
    ]
  }, 18),
  apc: scaleWeaponModel({
    doctrine: "Halftracks provide machine-gun fire and light armored mobility.",
    groups: [
      { id: "halftrack-mg", label: "Halftrack machine guns", role: "machineGun", shots: 150, accuracyMultiplier: 0.88, softEffect: { injured: 0.40, wounded: 0.16, severelyWounded: 0.022, killed: 0.015 }, hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.035, hitDistribution: { vsInfantry: { nonEffect: 0.01, softComponent: 0, penetrating: 0.99, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.94, softComponent: 0.06, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.08, softComponent: 0.17, penetrating: 0.75, areaEffect: 0 } } }
    ]
  }, 24),
  logisticsDefense: {
    doctrine: "Logistics columns have only light local defense.",
    groups: [
      { id: "logistics-small-arms", label: "Drivers' small arms", role: "smallArms", shots: 36, accuracyMultiplier: 0.75, softEffect: { injured: 0.35, wounded: 0.13, severelyWounded: 0.018, killed: 0.01 }, hardEffect: { damaged: 0.0005, disabled: 0, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.004, hitDistribution: { vsInfantry: { nonEffect: 0.05, softComponent: 0, penetrating: 0.95, areaEffect: 0 }, vsArmorButtoned: { nonEffect: 0.97, softComponent: 0.03, penetrating: 0, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.10, penetrating: 0.75, areaEffect: 0 } } }
    ]
  },
  airFighter: scaleWeaponModel({
    doctrine: "Fighter strafing uses brief machine-gun or cannon passes; air combat still uses the air profile.",
    groups: [
      { id: "fighter-strafe", label: "Fighter strafing guns", role: "airGun", shots: 120, accuracyMultiplier: 0.7, softEffect: { injured: 0.6, wounded: 0.3, severelyWounded: 0.06, killed: 0.03, maxKilledPerHit: 2, maxCasualtiesPerHit: 4 }, hardEffect: { damaged: 0.45, disabled: 0.18, destroyed: 0.06, armorPenetration: 6 }, suppressionPerHit: 0.18, fortificationDamagePerHit: 0.12, hitDistribution: { vsInfantry: { nonEffect: 0.10, softComponent: 0, penetrating: 0, areaEffect: 0.90 }, vsArmorButtoned: { nonEffect: 0.75, softComponent: 0.10, penetrating: 0.15, areaEffect: 0 }, vsArtillery: { nonEffect: 0.65, softComponent: 0.15, penetrating: 0.20, areaEffect: 0 } } }
    ]
  }, 12),
  airInterceptor: scaleWeaponModel({
    doctrine: "Interceptor strafing uses brief machine-gun or cannon passes; air combat still uses the air profile.",
    groups: [
      { id: "interceptor-strafe", label: "Interceptor strafing guns", role: "airGun", shots: 120, accuracyMultiplier: 0.7, softEffect: { injured: 0.6, wounded: 0.3, severelyWounded: 0.06, killed: 0.03, maxKilledPerHit: 2, maxCasualtiesPerHit: 4 }, hardEffect: { damaged: 0.45, disabled: 0.18, destroyed: 0.06, armorPenetration: 6 }, suppressionPerHit: 0.18, fortificationDamagePerHit: 0.12, hitDistribution: { vsInfantry: { nonEffect: 0.10, softComponent: 0, penetrating: 0, areaEffect: 0.90 }, vsArmorButtoned: { nonEffect: 0.75, softComponent: 0.10, penetrating: 0.15, areaEffect: 0 }, vsArtillery: { nonEffect: 0.65, softComponent: 0.15, penetrating: 0.20, areaEffect: 0 } } }
    ]
  }, 16),
  groundAttack: scaleWeaponModel({
    doctrine: "Close air support combines strafing with a small bomb or rocket load.",
    groups: [
      { id: "ground-attack-strafe", label: "Cannon and machine-gun strafing", role: "airGun", shots: 150, accuracyMultiplier: 0.74, softEffect: { injured: 0.7, wounded: 0.34, severelyWounded: 0.07, killed: 0.035, maxKilledPerHit: 2, maxCasualtiesPerHit: 5 }, hardEffect: { damaged: 0.14, disabled: 0.05, destroyed: 0.015, armorPenetration: 8 }, suppressionPerHit: 0.22, fortificationDamagePerHit: 0.12, hitDistribution: { vsInfantry: { nonEffect: 0.08, softComponent: 0, penetrating: 0, areaEffect: 0.92 }, vsArmorButtoned: { nonEffect: 0.85, softComponent: 0.12, penetrating: 0.03, areaEffect: 0 }, vsArtillery: { nonEffect: 0.72, softComponent: 0.18, penetrating: 0.10, areaEffect: 0 } } },
      { id: "ground-attack-rockets", label: "Rockets and light bombs", role: "airRocket", shots: 8, accuracyMultiplier: 0.55, softEffect: { injured: 6, wounded: 4, severelyWounded: 1, killed: 1, maxKilledPerHit: 10, maxCasualtiesPerHit: 18, blastMultiplier: 0.95, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 2, disabled: 1, destroyed: 0.35, armorPenetration: 12 }, suppressionPerHit: 2.2, fortificationDamagePerHit: 2.4, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.20, softComponent: 0.35, penetrating: 0.45, areaEffect: 0 }, vsArtillery: { nonEffect: 0.15, softComponent: 0.25, penetrating: 0.60, areaEffect: 0 } } }
    ]
  }, 8),
  bomber: scaleWeaponModel({
    doctrine: "Bombers deliver few high-blast hits with major suppression and fortification damage.",
    groups: [
      { id: "bomber-bombs", label: "Bomb load", role: "airBomb", shots: 12, accuracyMultiplier: 0.5, softEffect: { injured: 5, wounded: 4, severelyWounded: 1, killed: 1, maxKilledPerHit: 12, maxCasualtiesPerHit: 24, blastMultiplier: 1.1, casualtyRoundingThreshold: 0.25, fatalityRoundingThreshold: 0.3 }, hardEffect: { damaged: 0.8, disabled: 0.35, destroyed: 0.12, armorPenetration: 10 }, suppressionPerHit: 2.8, fortificationDamagePerHit: 3.4, hitDistribution: { vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1.0 }, vsArmorButtoned: { nonEffect: 0.15, softComponent: 0.30, penetrating: 0.55, areaEffect: 0 }, vsArtillery: { nonEffect: 0.12, softComponent: 0.23, penetrating: 0.65, areaEffect: 0 } } }
    ]
  }, 6),
  scoutPlane: scaleWeaponModel({
    doctrine: "Scout aircraft are armed lightly, primarily for self-defense.",
    groups: [
      { id: "scout-plane-gun", label: "Light aircraft gun", role: "airGun", shots: 30, accuracyMultiplier: 0.55, softEffect: { injured: 0.30, wounded: 0.12, severelyWounded: 0.018, killed: 0.01 }, hardEffect: { damaged: 0.006, disabled: 0.001, destroyed: 0, armorPenetration: 2 }, suppressionPerHit: 0.012, hitDistribution: { vsInfantry: { nonEffect: 0.15, softComponent: 0, penetrating: 0, areaEffect: 0.85 }, vsArmorButtoned: { nonEffect: 0.92, softComponent: 0.07, penetrating: 0.01, areaEffect: 0 }, vsArtillery: { nonEffect: 0.80, softComponent: 0.12, penetrating: 0.08, areaEffect: 0 } } }
    ]
  }, 6),
  unarmed: {
    doctrine: "No intentional combat fire; any losses come from enemy attacks or scenario effects.",
    groups: []
  }
} as const satisfies Record<string, UnitWeaponModel>;

const tactical = {
  Infantry_42: unit({
    class: "infantry",
    combat: { category: "infantry", weight: "light", role: "normal", signature: "tiny" },
    weaponEffectType: "small_arms",
    movement: 1.5,
    moveType: "leg",
    vision: 4,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 2,
    armor: { front: 2, side: 2, top: 2 },
    hardAttack: 4,
    softAttack: 25,
    accuracyBase: 60,
    traits: ["zoc"],
    cost: 100,
    baseExperience: 0,
    fortificationDamage: "low",
    suppressionRole: "medium",
    weaponModel: weaponModels.infantryBattalion
  }),
  AT_Infantry: unit({
    class: "infantry",
    combat: { category: "infantry", weight: "heavy", role: "antiTank", signature: "tiny" },
    weaponEffectType: "cannon",
    movement: 1,
    moveType: "leg",
    vision: 4,
    ammo: 7,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 6,
    initiative: 3,
    armor: { front: 2, side: 2, top: 2 },
    hardAttack: 22,
    softAttack: 20,
    accuracyBase: 66,
    traits: ["zoc"],
    cost: 150,
    baseExperience: 0,
    fortificationDamage: "low",
    suppressionRole: "low",
    weaponModel: weaponModels.antiTankInfantry
  }),
  ParInfantry_42: unit({
    class: "infantry",
    combat: { category: "infantry", weight: "light", role: "normal", signature: "tiny" },
    weaponEffectType: "small_arms",
    movement: 1.5,
    moveType: "leg",
    vision: 4,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 2,
    armor: { front: 2, side: 2, top: 2 },
    hardAttack: 4,
    softAttack: 25,
    accuracyBase: 50,
    cost: 20,
    traits: ["zoc"],
    baseExperience: 2,
    fortificationDamage: "low",
    suppressionRole: "medium",
    weaponModel: weaponModels.airborneCompany
  }),
  Engineer: unit({
    class: "specialist",
    combat: { category: "specialist", weight: "light", role: "antiInfantry", signature: "small" },
    weaponEffectType: "small_arms",
    movement: 2,
    moveType: "leg",
    vision: 4,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 3,
    armor: { front: 4, side: 2, top: 2 },
    hardAttack: 8,
    softAttack: 20,
    accuracyBase: 62,
    traits: ["entrenchBuster", "engineer"],
    cost: 160,
    baseExperience: 1,
    fortificationDamage: "veryHigh",
    suppressionRole: "high",
    weaponModel: weaponModels.engineers
  }),
  Combat_Engineer: unit({
    class: "specialist",
    combat: { category: "specialist", weight: "light", role: "antiInfantry", signature: "small" },
    weaponEffectType: "small_arms",
    movement: 2,
    moveType: "leg",
    vision: 4,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 3,
    armor: { front: 4, side: 3, top: 2 },
    hardAttack: 12,
    softAttack: 22,
    accuracyBase: 60,
    traits: ["entrenchBuster", "suppression", "engineer"],
    cost: 190,
    baseExperience: 1,
    fortificationDamage: "veryHigh",
    suppressionRole: "high",
    weaponModel: weaponModels.combatEngineers
  }),
  AT_Gun_50mm: unit({
    class: "specialist",
    combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 2,
    moveType: "wheel",
    vision: 2,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 3,
    armor: { front: 6, side: 1, top: 1 },
    hardAttack: 50,
    softAttack: 5,
    accuracyBase: 55,
    traits: [],
    cost: 140,
    baseExperience: 1,
    fortificationDamage: "low",
    suppressionRole: "low",
    weaponModel: weaponModels.antiTankGun
  }),
  Flak_88: unit({
    class: "specialist",
    combat: { category: "specialist", weight: "heavy", role: "antiTank", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 0.5,
    moveType: "wheel",
    vision: 5,
    ammo: 8,
    fuel: 20,
    rangeMin: 2,
    rangeMax: 8,
    initiative: 2,
    armor: { front: 4, side: 2, top: 2 },
    hardAttack: 70,
    softAttack: 15,
    accuracyBase: 62,
    traits: ["intercept"],
    cost: 250,
    baseExperience: 1,
    fortificationDamage: "medium",
    suppressionRole: "medium",
    weaponModel: weaponModels.flak88
  }),
  Recon_Bike: unit({
    class: "recon",
    combat: { category: "recon", weight: "light", role: "normal", signature: "tiny" },
    weaponEffectType: "mg",
    movement: 4,
    moveType: "wheel",
    vision: 4,
    ammo: 5,
    fuel: 30,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 4,
    armor: { front: 2, side: 1, top: 1 },
    hardAttack: 3,
    softAttack: 16,
    accuracyBase: 55,
    traits: ["zoc"],
    cost: 180,
    baseExperience: 1,
    fortificationDamage: "none",
    suppressionRole: "low",
    weaponModel: weaponModels.reconBike
  }),
  Recon_ArmoredCar: unit({
    class: "recon",
    combat: { category: "recon", weight: "medium", role: "normal", signature: "medium" },
    weaponEffectType: "mg",
    movement: 3,
    moveType: "wheel",
    vision: 5,
    ammo: 6,
    fuel: 45,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 4,
    armor: { front: 6, side: 5, top: 3 },
    hardAttack: 12,
    softAttack: 20,
    accuracyBase: 60,
    traits: ["zoc"],
    cost: 220,
    baseExperience: 1,
    fortificationDamage: "low",
    suppressionRole: "medium",
    weaponModel: weaponModels.armoredCar
  }),
  Scout_Plane: unit({
    class: "recon",
    combat: { category: "air", weight: "light", role: "support", signature: "small" },
    weaponEffectType: "mg",
    movement: 12,
    moveType: "air",
    vision: 6,
    ammo: 2,
    fuel: 55,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 5,
    armor: { front: 4, side: 4, top: 4 },
    hardAttack: 1,
    softAttack: 8,
    accuracyBase: 58,
    traits: ["skirmish"],
    cost: 240,
    baseExperience: 2,
    airSupport: { roles: ["recon"], cruiseSpeedKph: 320, combatRadiusKm: 90, refitTurns: 1 },
    fortificationDamage: "none",
    suppressionRole: "low",
    weaponModel: weaponModels.scoutPlane
  }),
  APC_Halftrack: unit({
    class: "vehicle",
    combat: { category: "vehicle", weight: "medium", role: "normal", signature: "medium" },
    weaponEffectType: "mg",
    movement: 3,
    moveType: "track",
    vision: 3,
    ammo: 2,
    fuel: 50,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 3,
    armor: { front: 6, side: 5, top: 3 },
    hardAttack: 1,
    softAttack: 18,
    accuracyBase: 55,
    traits: [],
    cost: 160,
    baseExperience: 0,
    fortificationDamage: "none",
    suppressionRole: "medium",
    weaponModel: weaponModels.apc
  }),
  Supply_Truck: unit({
    class: "vehicle",
    combat: { category: "vehicle", weight: "medium", role: "support", signature: "large" },
    weaponEffectType: "small_arms",
    movement: 2,
    moveType: "wheel",
    vision: 2,
    ammo: 0,
    fuel: 70,
    rangeMin: 0,
    rangeMax: 0,
    initiative: 1,
    armor: { front: 3, side: 2, top: 2 },
    hardAttack: 1,
    softAttack: 1,
    accuracyBase: 0,
    traits: [],
    cost: 90,
    baseExperience: 0,
    fortificationDamage: "none",
    suppressionRole: "none",
    weaponModel: weaponModels.logisticsDefense
  }),
  Light_Tank: unit({
    class: "tank",
    combat: { category: "tank", weight: "light", role: "normal", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 4,
    moveType: "track",
    vision: 4,
    ammo: 6,
    fuel: 45,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 4,
    armor: { front: 12, side: 6, top: 3 },
    hardAttack: 20,
    softAttack: 30,
    accuracyBase: 58,
    traits: ["zoc"],
    cost: 220,
    baseExperience: 1,
    fortificationDamage: "medium",
    suppressionRole: "medium",
    weaponModel: weaponModels.lightTank
  }),
  Medium_Tank: unit({
    class: "tank",
    combat: { category: "tank", weight: "medium", role: "normal", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 4,
    moveType: "track",
    vision: 4,
    ammo: 6,
    fuel: 45,
    rangeMin: 1,
    rangeMax: 5,
    initiative: 4,
    armor: { front: 15, side: 8, top: 4 },
    hardAttack: 29,
    softAttack: 36,
    accuracyBase: 59,
    traits: ["zoc"],
    cost: 260,
    baseExperience: 1,
    fortificationDamage: "medium",
    suppressionRole: "medium",
    weaponModel: weaponModels.mediumTank
  }),
  Heavy_Tank: unit({
    class: "tank",
    combat: { category: "tank", weight: "heavy", role: "normal", signature: "large" },
    weaponEffectType: "cannon",
    movement: 3,
    moveType: "track",
    vision: 3,
    ammo: 6,
    fuel: 35,
    rangeMin: 1,
    rangeMax: 6,
    initiative: 5,
    armor: { front: 18, side: 10, top: 5 },
    hardAttack: 38,
    softAttack: 42,
    accuracyBase: 60,
    traits: ["zoc"],
    cost: 300,
    baseExperience: 1,
    fortificationDamage: "medium",
    suppressionRole: "medium",
    weaponModel: weaponModels.heavyTank
  }),
  Assault_Gun: unit({
    class: "tank",
    combat: { category: "tank", weight: "medium", role: "antiInfantry", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 4,
    moveType: "track",
    vision: 3,
    ammo: 6,
    fuel: 30,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 4,
    armor: { front: 11, side: 9, top: 4 },
    hardAttack: 20,
    softAttack: 45,
    accuracyBase: 50,
    traits: ["zoc", "suppression"],
    cost: 180,
    baseExperience: 1,
    fortificationDamage: "veryHigh",
    suppressionRole: "veryHigh",
    weaponModel: weaponModels.assaultGun
  }),
  Tank_Destroyer: unit({
    class: "tank",
    combat: { category: "tank", weight: "medium", role: "antiTank", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 3,
    moveType: "track",
    vision: 3,
    ammo: 6,
    fuel: 35,
    rangeMin: 1,
    rangeMax: 6,
    initiative: 5,
    armor: { front: 11, side: 8, top: 4 },
    hardAttack: 55,
    softAttack: 10,
    accuracyBase: 68,
    traits: ["zoc"],
    cost: 380,
    baseExperience: 2,
    fortificationDamage: "low",
    suppressionRole: "low",
    weaponModel: weaponModels.tankDestroyer
  }),
  Howitzer_105: unit({
    class: "artillery",
    combat: { category: "artillery", weight: "medium", role: "antiInfantry", signature: "large" },
    weaponEffectType: "cannon",
    movement: 2,
    moveType: "wheel",
    vision: 4,
    ammo: 8,
    fuel: 2,
    rangeMin: 3,
    rangeMax: 32,
    initiative: 1,
    armor: { front: 2, side: 2, top: 2 },
    hardAttack: 50,
    softAttack: 50,
    accuracyBase: 50,
    traits: ["indirect", "suppression"],
    cost: 260,
    baseExperience: 1,
    fortificationDamage: "high",
    suppressionRole: "veryHigh",
    weaponModel: weaponModels.artillery
  }),
  Rocket_Artillery: unit({
    class: "artillery",
    combat: { category: "artillery", weight: "heavy", role: "antiInfantry", signature: "large" },
    weaponEffectType: "cannon",
    movement: 3,
    moveType: "track",
    vision: 2,
    ammo: 5,
    fuel: 30,
    rangeMin: 4,
    rangeMax: 16,
    initiative: 1,
    armor: { front: 3, side: 3, top: 2 },
    hardAttack: 50,
    softAttack: 60,
    accuracyBase: 48,
    traits: ["indirect", "suppression"],
    cost: 350,
    baseExperience: 1,
    fortificationDamage: "high",
    suppressionRole: "veryHigh",
    weaponModel: weaponModels.rocketArtillery
  }),
  SP_Artillery: unit({
    class: "artillery",
    combat: { category: "artillery", weight: "medium", role: "normal", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 3,
    moveType: "track",
    vision: 3,
    ammo: 6,
    fuel: 40,
    rangeMin: 3,
    rangeMax: 32,
    initiative: 2,
    armor: { front: 6, side: 5, top: 3 },
    hardAttack: 20,
    softAttack: 52,
    accuracyBase: 55,
    traits: ["indirect"],
    cost: 360,
    baseExperience: 1,
    fortificationDamage: "high",
    suppressionRole: "veryHigh",
    weaponModel: weaponModels.spArtillery
  }),
  Fighter: unit({
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "small" },
    weaponEffectType: "mg",
    movement: 10,
    moveType: "air",
    vision: 4,
    ammo: 6,
    fuel: 50,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 6,
    armor: { front: 2, side: 2, top: 2 },
    hardAttack: 12,
    softAttack: 18,
    accuracyBase: 64,
    traits: ["skirmish"],
    cost: 320,
    baseExperience: 2,
    airSupport: { roles: ["escort", "cap"], cruiseSpeedKph: 540, combatRadiusKm: 250, refitTurns: 1 },
    airCombat: {
      attack: {
        accuracyBase: 68,
        hardAttack: 18,
        softAttack: 18,
        rangeMin: 1,
        rangeMax: 2,
        combat: { category: "air", weight: "light", role: "normal", signature: "medium" },
        shotsScalar: 1.1,
        damageScalar: 1.5,
        suppressionScalar: 2.6
      }
    },
    fortificationDamage: "none",
    suppressionRole: "low",
    weaponModel: weaponModels.airFighter
  }),
  Interceptor: unit({
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "small" },
    weaponEffectType: "cannon",
    movement: 12,
    moveType: "air",
    vision: 5,
    ammo: 7,
    fuel: 55,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 7,
    armor: { front: 2, side: 2, top: 1 },
    hardAttack: 15,
    softAttack: 12,
    accuracyBase: 66,
    traits: ["skirmish"],
    cost: 350,
    baseExperience: 2,
    airSupport: { roles: ["escort", "cap"], cruiseSpeedKph: 600, combatRadiusKm: 220, refitTurns: 1 },
    airCombat: {
      attack: {
        accuracyBase: 74,
        hardAttack: 20,
        softAttack: 20,
        rangeMin: 1,
        rangeMax: 2,
        combat: { category: "air", weight: "light", role: "normal", signature: "small" },
        shotsScalar: 1.15,
        damageScalar: 1.5,
        suppressionScalar: 2.9
      }
    },
    fortificationDamage: "none",
    suppressionRole: "low",
    weaponModel: weaponModels.airInterceptor
  }),
  Ground_Attack: unit({
    class: "air",
    combat: { category: "air", weight: "light", role: "antiVehicle", signature: "small" },
    weaponEffectType: "cannon",
    movement: 8,
    moveType: "air",
    vision: 4,
    ammo: 1,
    fuel: 55,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 5,
    armor: { front: 6, side: 5, top: 6 },
    hardAttack: 50,
    softAttack: 35,
    accuracyBase: 60,
    traits: ["skirmish"],
    cost: 400,
    baseExperience: 2,
    airSupport: { roles: ["strike"], cruiseSpeedKph: 420, combatRadiusKm: 180, refitTurns: 2 },
    airCombat: {
      attack: {
        accuracyBase: 60,
        hardAttack: 50,
        softAttack: 35,
        rangeMin: 1,
        rangeMax: 2,
        combat: { category: "air", weight: "light", role: "antiVehicle", signature: "small" },
        shotsScalar: 1.05,
        damageScalar: 2.2,
        suppressionScalar: 3.4
      }
    },
    fortificationDamage: "medium",
    suppressionRole: "high",
    weaponModel: weaponModels.groundAttack
  }),
  Bomber: unit({
    class: "air",
    combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "medium" },
    weaponEffectType: "cannon",
    movement: 6,
    moveType: "air",
    vision: 4,
    ammo: 1,
    fuel: 60,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 1,
    armor: { front: 10, side: 10, top: 7 },
    hardAttack: 70,
    softAttack: 50,
    accuracyBase: 52,
    traits: ["skirmish"],
    cost: 450,
    baseExperience: 2,
    airSupport: { roles: ["strike"], cruiseSpeedKph: 380, combatRadiusKm: 160, refitTurns: 3 },
    airCombat: {
      attack: {
        accuracyBase: 52,
        hardAttack: 70,
        softAttack: 50,
        rangeMin: 1,
        rangeMax: 1,
        combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "medium" },
        shotsScalar: 1,
        damageScalar: 2.6,
        suppressionScalar: 4.2
      }
    },
    fortificationDamage: "high",
    suppressionRole: "veryHigh",
    weaponModel: weaponModels.bomber
  }),
  Transport_Plane: unit({
    class: "air",
    combat: { category: "air", weight: "light", role: "support", signature: "medium" },
    weaponEffectType: "small_arms",
    movement: 8,
    moveType: "air",
    vision: 3,
    ammo: 0,
    fuel: 65,
    rangeMin: 0,
    rangeMax: 0,
    initiative: 3,
    armor: { front: 4, side: 4, top: 4 },
    hardAttack: 1,
    softAttack: 1,
    accuracyBase: 0,
    traits: [],
    cost: 410,
    baseExperience: 0,
    airSupport: { roles: ["transport"], cruiseSpeedKph: 350, combatRadiusKm: 300, refitTurns: 2 },
    fortificationDamage: "none",
    suppressionRole: "none",
    weaponModel: weaponModels.unarmed
  })
} as const;

export const unitFormations = {
  infantry: {
    key: "infantry",
    label: "Infantry Battalion",
    shortLabel: "Infantry",
    historicalDescription: "A rifle battalion-sized line formation built around rifle companies, machine guns, mortars, and a small anti-tank section.",
    gameplayDescription: "Holds ground, digs in, and projects rifle and support-weapon fire out to four hexes with modest lethality but steady suppression.",
    category: "units",
    purpose: ["lineInfantry"],
    echelon: "battalion",
    personnel: [{ id: "rifle-companies", label: "Rifle and weapons company personnel", count: 720, role: "rifle" }],
    vehicles: 0,
    equipment: [
      { id: "rifles", label: "Rifles, BARs, MGs, mortars", quantity: 1, purpose: ["lineInfantry"], canonStatus: "abstract" }
    ],
    equipmentSummary: ["3 rifle companies", "1 weapons company with MG and mortar platoons", "Attached anti-tank section"],
    tacticalUnitType: "Infantry_42",
    tactical: tactical.Infantry_42,
    startingLoadout: { strength: 100, ammo: 6, fuel: 0, entrench: 1, facing: "NW", baseExperience: 0 },
    requisition: { category: "units", costPerUnit: 50, maxQuantity: 20, inBattleAllowed: true },
    spriteUrl: sprite("Infantry_Light_USA_Sideview.png")
  },
  airborneDetachment: {
    key: "airborneDetachment",
    label: "Parachute Infantry Company",
    shortLabel: "Airborne Company",
    historicalDescription: "A company of roughly 150 parachute infantry with compact radios, mixed small arms, light crew-served weapons, and airborne training.",
    gameplayDescription: "Elite light infantry with fewer men and fewer shots than a battalion, but better training and flexible battlefield employment. Requires a transport flight.",
    category: "support",
    purpose: ["airborne"],
    echelon: "company",
    personnel: [{ id: "parachute-company", label: "Parachute infantry company personnel", count: 150, role: "rifle" }],
    vehicles: 0,
    equipment: [
      { id: "airborne-weapons", label: "Airborne small arms, light mortars, radios", quantity: 1, purpose: ["airborne"], canonStatus: "abstract" }
    ],
    equipmentSummary: ["1 parachute infantry company", "Mixed airborne small arms and light support weapons", "Pathfinder radios"],
    notes: "Must be deployed by a requisitioned transport flight.",
    tacticalUnitType: "Paratrooper",
    tactical: tactical.ParInfantry_42,
    startingLoadout: { strength: 100, ammo: 8, fuel: 0, entrench: 0, facing: "NW", baseExperience: 2 },
    requisition: { category: "support", costPerUnit: 40, maxQuantity: 4, requiresTransportFlight: true, inBattleAllowed: true },
    spriteUrl: sprite("Infantry_Light_USA_Sideview.png")
  },
  engineer: {
    key: "engineer",
    label: "Engineering Corps",
    historicalDescription: "Combat engineers with demolition stores, bridging gear, wire and mine tools, and field construction equipment.",
    gameplayDescription: "Builds, breaches, and repairs fortifications. Infantry can dig in; engineers handle actual fortification work.",
    category: "units",
    purpose: ["engineer"],
    echelon: "company",
    personnel: [{ id: "engineer-company", label: "Engineer company personnel", count: 160, role: "engineer" }],
    vehicles: 12,
    equipment: [{ id: "engineer-tools", label: "Demolition, bridging, and earthwork tools", quantity: 1, purpose: ["engineer"], canonStatus: "abstract" }],
    equipmentSummary: ["Pontoon bridging kits", "Explosive breaching gear", "Earthmoving tools"],
    tacticalUnitType: "Engineer",
    tactical: tactical.Engineer,
    startingLoadout: { strength: 100, ammo: 6, fuel: 0, entrench: 1, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 80, maxQuantity: 10, inBattleAllowed: true },
    spriteUrl: sprite("Infantry_Engineers_USA_Sideview.png")
  },
  tank: {
    key: "tank",
    label: "Medium Tank Company",
    historicalDescription: "Medium armor company using Sherman-like tank troops for mobile direct fire, breakthrough support, and counterattack work.",
    gameplayDescription: "Accurate direct fire with medium-high suppression and medium fortification damage.",
    category: "units",
    purpose: ["armorBreakthrough"],
    echelon: "company",
    personnel: [{ id: "tank-crews", label: "Tank crews and maintenance detail", count: 120, role: "crew" }],
    vehicles: 20,
    equipment: [{ id: "medium-tanks", label: "Medium tanks", quantity: 20, platformId: "US_M4A3_75W_LATE", purpose: ["armorBreakthrough"], canonStatus: "linked" }],
    equipmentSummary: ["20 medium tanks", "Attached maintenance and recovery team"],
    tacticalUnitType: "Light_Tank",
    tactical: tactical.Light_Tank,
    startingLoadout: { strength: 100, ammo: 6, fuel: 45, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 100, maxQuantity: 10 },
    spriteUrl: sprite("Tank_M4_USA_Sideview.png")
  },
  heavyTankCompany: {
    key: "heavyTankCompany",
    label: "Heavy Tank Company",
    historicalDescription: "Heavy breakthrough tanks concentrated to absorb anti-tank fire and force defended lines.",
    gameplayDescription: "High armor, strong direct fire, high suppression, and medium fortification damage.",
    category: "units",
    purpose: ["armorBreakthrough"],
    echelon: "company",
    personnel: [{ id: "heavy-tank-crews", label: "Heavy tank crews", count: 96, role: "crew" }],
    vehicles: 14,
    equipment: [{ id: "heavy-tanks", label: "Heavy tanks", quantity: 14, platformId: "DE_TIGER_I_E", purpose: ["armorBreakthrough"], canonStatus: "linked" }],
    equipmentSummary: ["14 heavy breakthrough tanks", "Recovery vehicle"],
    tacticalUnitType: "Heavy_Tank",
    tactical: tactical.Heavy_Tank,
    startingLoadout: { strength: 100, ammo: 6, fuel: 35, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 140, maxQuantity: 4 },
    spriteUrl: sprite("Tank_M26_USA_Sideview.png")
  },
  tankDestroyerCompany: {
    key: "tankDestroyerCompany",
    label: "Tank Destroyer Company",
    historicalDescription: "Tank destroyers organized around high-velocity guns for ambushes, covered lanes, and counter-armor defense.",
    gameplayDescription: "Excellent anti-armor accuracy and penetration, low fortification damage, lower suppression than tanks.",
    category: "units",
    purpose: ["tankDestroyer"],
    echelon: "company",
    personnel: [{ id: "td-crews", label: "Tank destroyer crews", count: 90, role: "crew" }],
    vehicles: 12,
    equipment: [{ id: "tank-destroyers", label: "Tank destroyers", quantity: 12, platformId: "US_M10_GMC_EARLY", purpose: ["tankDestroyer"], canonStatus: "linked" }],
    equipmentSummary: ["12 dedicated tank destroyers", "Spotter jeeps"],
    tacticalUnitType: "Tank_Destroyer",
    tactical: tactical.Tank_Destroyer,
    startingLoadout: { strength: 100, ammo: 6, fuel: 35, entrench: 0, facing: "NW", baseExperience: 2 },
    requisition: { category: "units", costPerUnit: 80, maxQuantity: 5 },
    spriteUrl: sprite("Tankkiller_M10_USA_Sideview.png")
  },
  assaultGunBattalion: {
    key: "assaultGunBattalion",
    label: "Assault Gun Battery",
    historicalDescription: "Armored direct-fire guns assigned to batter strongpoints and support infantry with high-explosive fire.",
    gameplayDescription: "Less accurate than tanks, but delivers very high suppression and very high fortification damage.",
    category: "units",
    purpose: ["assaultGunSupport"],
    echelon: "battery",
    personnel: [{ id: "assault-gun-crews", label: "Assault gun crews and support detail", count: 54, role: "crew" }],
    vehicles: 6,
    equipment: [{ id: "assault-guns", label: "Assault guns", quantity: 6, platformId: "DE_STUG_III_G", purpose: ["assaultGunSupport"], canonStatus: "linked" }],
    equipmentSummary: ["6 assault guns", "Forward observation detachment"],
    tacticalUnitType: "Assault_Gun",
    tactical: tactical.Assault_Gun,
    startingLoadout: { strength: 100, ammo: 6, fuel: 30, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 50, maxQuantity: 5 },
    spriteUrl: sprite("Tank_Assault_M8_USA_Sideview.png")
  },
  howitzer: {
    key: "howitzer",
    label: "Howitzer Battery",
    historicalDescription: "Towed 105mm battery with prime movers, fire direction, and ammunition detail.",
    gameplayDescription: "Indirect fire for sustained suppression, casualty pressure, and fortification degradation.",
    category: "units",
    purpose: ["indirectFire"],
    echelon: "battery",
    personnel: [{ id: "howitzer-crews", label: "Gun crews and fire direction", count: 180, role: "crew" }],
    vehicles: 18,
    equipment: [{ id: "105mm-howitzers", label: "Towed 105mm howitzers", quantity: 6, purpose: ["indirectFire"], canonStatus: "missing" }],
    equipmentSummary: ["6 towed 105mm howitzers", "12 prime movers"],
    tacticalUnitType: "Howitzer_105",
    tactical: tactical.Howitzer_105,
    startingLoadout: { strength: 100, ammo: 8, fuel: 2, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 180, maxQuantity: 6 },
    spriteUrl: sprite("Artillery_Howitzer_USA_Sideview.png")
  },
  rocketArtilleryBattalion: {
    key: "rocketArtilleryBattalion",
    label: "Rocket Artillery Battalion",
    historicalDescription: "Truck or track-mounted rocket launchers with reload vehicles for short, violent saturation fires.",
    gameplayDescription: "Strong area suppression and fortification damage with lower precision than tube artillery.",
    category: "units",
    purpose: ["indirectFire"],
    echelon: "battalion",
    personnel: [{ id: "rocket-crews", label: "Rocket launcher crews", count: 150, role: "crew" }],
    vehicles: 12,
    equipment: [{ id: "rocket-launchers", label: "Rocket launch vehicles", quantity: 4, purpose: ["indirectFire"], canonStatus: "missing" }],
    equipmentSummary: ["4 rocket launch trucks", "Reload vehicles"],
    tacticalUnitType: "Rocket_Artillery",
    tactical: tactical.Rocket_Artillery,
    startingLoadout: { strength: 100, ammo: 5, fuel: 30, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 260, maxQuantity: 4 },
    spriteUrl: sprite("Artillery_Calliope_USA_Sideview.png")
  },
  spArtilleryGroup: {
    key: "spArtilleryGroup",
    label: "Self-Propelled Artillery Group",
    historicalDescription: "Armored self-propelled guns with ammunition carriers for fire-and-displace support.",
    gameplayDescription: "Mobile indirect fire, high suppression, and strong fortification damage.",
    category: "units",
    purpose: ["indirectFire"],
    echelon: "battery",
    personnel: [{ id: "spg-crews", label: "Self-propelled gun crews", count: 140, role: "crew" }],
    vehicles: 8,
    equipment: [{ id: "sp-guns", label: "Self-propelled guns", quantity: 8, purpose: ["indirectFire"], canonStatus: "missing" }],
    equipmentSummary: ["8 self-propelled guns", "Armored ammunition carriers"],
    tacticalUnitType: "SP_Artillery",
    tactical: tactical.SP_Artillery,
    startingLoadout: { strength: 100, ammo: 6, fuel: 40, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 275, maxQuantity: 4 },
    spriteUrl: sprite("Artillery_M7_USA_Sideview.png")
  },
  antiTankBattery: {
    key: "antiTankBattery",
    label: "Anti-Tank Gun Battery",
    historicalDescription: "Crew-served 57mm anti-tank guns sited to cover roads, crossings, and armored approach lanes.",
    gameplayDescription: "High hard attack and good range, weak mobility, low anti-fortification value.",
    category: "units",
    purpose: ["tankDestroyer"],
    echelon: "battery",
    personnel: [{ id: "at-gun-crews", label: "Anti-tank gun crews", count: 132, role: "crew" }],
    vehicles: 18,
    equipment: [{ id: "at-guns", label: "57mm anti-tank guns", quantity: 6, weaponRefs: [{ weaponId: "UK_6PDR" }], purpose: ["tankDestroyer"], canonStatus: "linked" }],
    equipmentSummary: ["6 57mm AT guns", "12 towing trucks"],
    tacticalUnitType: "AT_Gun_50mm",
    tactical: tactical.AT_Gun_50mm,
    startingLoadout: { strength: 100, ammo: 6, fuel: 0, entrench: 1, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 80, maxQuantity: 6 },
    spriteUrl: sprite("Wheeled_AT_Gun_USA_Sideview.png")
  },
  flakBattery: {
    key: "flakBattery",
    label: "Flak Battery",
    historicalDescription: "Dual-purpose 88mm battery with heavy gun crews, ammunition detail, and fire-control support.",
    gameplayDescription: "Engages aircraft, armor, and visible targets; medium suppression and fortification damage.",
    category: "units",
    purpose: ["airDefense", "tankDestroyer"],
    echelon: "battery",
    personnel: [{ id: "flak-crews", label: "88mm gun crews", count: 160, role: "crew" }],
    vehicles: 16,
    equipment: [{ id: "flak-88", label: "Flak 36 88mm guns", quantity: 4, platformId: "DE_FLAK36_88_TOWED", purpose: ["airDefense"], canonStatus: "linked" }],
    equipmentSummary: ["4 heavy AA guns", "Radar trailer", "Ammunition loaders"],
    tacticalUnitType: "Flak_88",
    tactical: tactical.Flak_88,
    startingLoadout: { strength: 100, ammo: 6, fuel: 0, entrench: 1, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 210, maxQuantity: 6 },
    spriteUrl: sprite("Flak_88_USA_Sideview.png")
  },
  recon: {
    key: "recon",
    label: "Recon Squad",
    historicalDescription: "Armored reconnaissance troop with radios, light cannon or machine guns, and crews trained to screen and report.",
    gameplayDescription: "High vision and useful skirmishing, but not built to hold ground.",
    category: "units",
    purpose: ["recon"],
    echelon: "platoon",
    personnel: [{ id: "recon-crews", label: "Armored car crews and scouts", count: 150, role: "crew" }],
    vehicles: 18,
    equipment: [{ id: "armored-cars", label: "Armored cars", quantity: 18, purpose: ["recon"], canonStatus: "missing" }],
    equipmentSummary: ["18 armored cars", "Signals relay section"],
    tacticalUnitType: "Recon_ArmoredCar",
    tactical: tactical.Recon_ArmoredCar,
    startingLoadout: { strength: 100, ammo: 6, fuel: 45, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 75, maxQuantity: 12, inBattleAllowed: true },
    spriteUrl: sprite("Wheeled_Recon_Armored_Car_Greyhound_USA_Sideview.png")
  },
  reconBike: {
    key: "reconBike",
    label: "Recon Bike Patrol",
    historicalDescription: "Small motorbike scout patrol for flank checks, courier runs, and quick contact reports.",
    gameplayDescription: "Fast and observant, with light weapons and little staying power.",
    category: "units",
    purpose: ["recon"],
    echelon: "platoon",
    personnel: [{ id: "bike-scouts", label: "Motorbike scouts", count: 54, role: "rifle" }],
    vehicles: 18,
    equipment: [{ id: "recon-bikes", label: "Reconnaissance motorbikes", quantity: 18, purpose: ["recon"], canonStatus: "missing" }],
    equipmentSummary: ["18 reconnaissance motorbikes", "9 two-bike scout pairs"],
    tacticalUnitType: "Recon_Bike",
    tactical: tactical.Recon_Bike,
    startingLoadout: { strength: 100, ammo: 5, fuel: 30, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "units", costPerUnit: 45, maxQuantity: 8, inBattleAllowed: true },
    spriteUrl: sprite("Wheeled_Bikes_Recon_USA_Sideview.png")
  },
  scoutPlaneWing: {
    key: "scoutPlaneWing",
    label: "Reconnaissance Flight",
    historicalDescription: "Off-map reconnaissance aircraft with photo interpretation and artillery-spotting support.",
    gameplayDescription: "Provides aerial scouting and spotting, not meaningful ground combat.",
    category: "support",
    purpose: ["recon"],
    echelon: "wing",
    personnel: [{ id: "recon-aircrew", label: "Recon aircrew and interpreters", count: 90, role: "aircrew" }],
    vehicles: 6,
    equipment: [{ id: "scout-aircraft", label: "Reconnaissance aircraft", quantity: 6, purpose: ["recon"], canonStatus: "missing" }],
    equipmentSummary: ["6 reconnaissance aircraft", "Photo interpretation section"],
    tacticalUnitType: "Scout_Plane",
    tactical: tactical.Scout_Plane,
    startingLoadout: { strength: 100, ammo: 2, fuel: 55, entrench: 0, facing: "NW", baseExperience: 2 },
    requisition: { category: "support", costPerUnit: 185, maxQuantity: 3 },
    spriteUrl: sprite("Scout_Plane.png")
  },
  fighter: {
    key: "fighter",
    label: "Fighter Squadron",
    historicalDescription: "Fighter squadron assigned to escort, interception, and local air superiority.",
    gameplayDescription: "Protects strike packages and contests enemy air support.",
    category: "support",
    purpose: ["fighter"],
    echelon: "wing",
    personnel: [{ id: "fighter-aircrew", label: "Fighter pilots and ground crews", count: 120, role: "aircrew" }],
    vehicles: 12,
    equipment: [{ id: "fighters", label: "Fighter aircraft", quantity: 12, purpose: ["fighter"], canonStatus: "missing" }],
    equipmentSummary: ["12 fighter aircraft", "Readiness dispersal crews"],
    tacticalUnitType: "Fighter",
    tactical: tactical.Fighter,
    startingLoadout: { strength: 100, ammo: 6, fuel: 50, entrench: 0, facing: "NW", baseExperience: 2 },
    requisition: { category: "support", costPerUnit: 240, maxQuantity: 4 },
    spriteUrl: sprite("Aircraft_USA_P51.png")
  },
  interceptorWing: {
    key: "interceptorWing",
    label: "Interceptor Squadron",
    historicalDescription: "High-readiness fighters tasked with breaking up enemy reconnaissance and bombing sorties.",
    gameplayDescription: "Fast CAP and escort aircraft with strong air-to-air performance.",
    category: "support",
    purpose: ["fighter"],
    echelon: "wing",
    personnel: [{ id: "interceptor-aircrew", label: "Interceptor pilots and ground crews", count: 160, role: "aircrew" }],
    vehicles: 16,
    equipment: [{ id: "interceptors", label: "Interceptor aircraft", quantity: 16, purpose: ["fighter"], canonStatus: "missing" }],
    equipmentSummary: ["16 interceptor aircraft", "Scramble control section"],
    tacticalUnitType: "Interceptor",
    tactical: tactical.Interceptor,
    startingLoadout: { strength: 100, ammo: 7, fuel: 55, entrench: 0, facing: "NW", baseExperience: 2 },
    requisition: { category: "support", costPerUnit: 255, maxQuantity: 3 },
    spriteUrl: sprite("Aircraft_England_Spitfire.png")
  },
  groundAttackWing: {
    key: "groundAttackWing",
    label: "Close Support Squadron",
    historicalDescription: "Fighter-bomber squadron armed for low-altitude attacks on vehicles, gun lines, and troops.",
    gameplayDescription: "Strike support against armor and exposed positions.",
    category: "support",
    purpose: ["closeAirSupport"],
    echelon: "wing",
    personnel: [{ id: "cas-aircrew", label: "Close-support aircrew", count: 130, role: "aircrew" }],
    vehicles: 8,
    equipment: [{ id: "fighter-bombers", label: "Fighter-bombers", quantity: 8, purpose: ["closeAirSupport"], canonStatus: "missing" }],
    equipmentSummary: ["8 fighter-bombers", "Rocket and bomb dump"],
    tacticalUnitType: "Ground_Attack",
    tactical: tactical.Ground_Attack,
    startingLoadout: { strength: 100, ammo: 1, fuel: 55, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "support", costPerUnit: 265, maxQuantity: 3 },
    spriteUrl: sprite("Aircraft_USA_B25.png")
  },
  bomber: {
    key: "bomber",
    label: "Tactical Bomber Squadron",
    historicalDescription: "Medium bomber detachment used for interdiction, depot strikes, and fortified-position attacks.",
    gameplayDescription: "Heavy suppression and strong fortification damage, but lower precision than direct-fire weapons.",
    category: "support",
    purpose: ["closeAirSupport"],
    echelon: "wing",
    personnel: [{ id: "bomber-aircrew", label: "Bomber aircrew and armorers", count: 150, role: "aircrew" }],
    vehicles: 6,
    equipment: [{ id: "bombers", label: "Tactical bombers", quantity: 6, purpose: ["closeAirSupport"], canonStatus: "missing" }],
    equipmentSummary: ["6 tactical bombers", "Bomb preparation crew"],
    tacticalUnitType: "Bomber",
    tactical: tactical.Bomber,
    startingLoadout: { strength: 100, ammo: 1, fuel: 60, entrench: 0, facing: "NW", baseExperience: 1 },
    requisition: { category: "support", costPerUnit: 260, maxQuantity: 4 },
    spriteUrl: sprite("Aircraft_USA_B17.png")
  },
  transportWing: {
    key: "transportWing",
    label: "Transport Flight",
    historicalDescription: "Transport aircraft and cargo riggers held off-map for airborne insertion, courier lifts, and emergency resupply.",
    gameplayDescription: "Each transport flight can bring either one supply requisition or one parachute company next turn. It cannot do both in the same turn.",
    category: "support",
    purpose: ["transport"],
    echelon: "wing",
    personnel: [{ id: "transport-aircrew", label: "Transport aircrew and cargo riggers", count: 200, role: "aircrew" }],
    vehicles: 10,
    equipment: [{ id: "transport-aircraft", label: "Transport aircraft", quantity: 10, purpose: ["transport"], canonStatus: "missing" }],
    equipmentSummary: ["10 transport aircraft", "Cargo rigging section"],
    notes: "Airlifts one parachute infantry company or one supply requisition for next-turn arrival.",
    tacticalUnitType: "Transport_Plane",
    tactical: tactical.Transport_Plane,
    startingLoadout: { strength: 100, ammo: 0, fuel: 65, entrench: 0, facing: "NW", baseExperience: 0 },
    requisition: { category: "support", costPerUnit: 190, maxQuantity: 2 },
    spriteUrl: sprite("Transport_Plane.png")
  },
  apcHalftrackCompany: {
    key: "apcHalftrackCompany",
    label: "Halftrack Carrier Company",
    historicalDescription: "Protected troop carriers with machine-gun mounts and field repair support.",
    gameplayDescription: "Keeps mechanized troops moving under light fire and contributes suppressive machine-gun fire.",
    category: "units",
    purpose: ["logistics"],
    echelon: "company",
    personnel: [{ id: "halftrack-crews", label: "Halftrack crews and riders", count: 180, role: "driver" }],
    vehicles: 24,
    equipment: [{ id: "halftracks", label: "Halftracks", quantity: 24, platformId: "DE_SDKFZ_251_1", purpose: ["logistics"], canonStatus: "linked" }],
    equipmentSummary: ["24 halftracks", "Field repair trailer"],
    tacticalUnitType: "APC_Halftrack",
    tactical: tactical.APC_Halftrack,
    startingLoadout: { strength: 100, ammo: 2, fuel: 50, entrench: 0, facing: "NW", baseExperience: 0 },
    requisition: { category: "units", costPerUnit: 175, maxQuantity: 5 },
    spriteUrl: sprite("APC_Halftrack_USA_Sideview.png")
  },
  supplyConvoy: {
    key: "supplyConvoy",
    label: "Supply Convoy",
    historicalDescription: "Forward lorries and fuel bowsers carrying packaged ammunition and fuel from rear dumps.",
    gameplayDescription: "Automated logistics unit for tactical resupply.",
    category: "logistics",
    purpose: ["logistics"],
    echelon: "platoon",
    personnel: [{ id: "convoy-drivers", label: "Drivers and handlers", count: 48, role: "driver" }],
    vehicles: 8,
    equipment: [{ id: "supply-lorries", label: "Supply lorries and fuel bowsers", quantity: 8, platformId: "DE_OPEL_BLITZ_36S", purpose: ["logistics"], canonStatus: "linked" }],
    equipmentSummary: ["6 supply lorries", "2 fuel bowsers"],
    tacticalUnitType: "Supply_Truck",
    tactical: tactical.Supply_Truck,
    startingLoadout: { strength: 100, ammo: 0, fuel: 70, entrench: 0, facing: "NW", baseExperience: 0 },
    requisition: { category: "logistics", costPerUnit: 40, maxQuantity: 6, inBattleAllowed: true },
    spriteUrl: sprite("Wheeled_Supply_USA_Sideview.png")
  },
  ammo: {
    key: "ammo",
    label: "Ammunition Dump",
    historicalDescription: "Revetted shell and small-arms reserve positioned behind the fighting line.",
    gameplayDescription: "In-battle supply purchase that replenishes depot ammunition after delivery delay.",
    category: "supplies",
    purpose: ["logistics"],
    personnel: [{ id: "ammo-handlers", label: "Ammunition handlers", count: 28, role: "driver" }],
    vehicles: 0,
    equipment: [{ id: "ammo-stores", label: "Ready-use ammunition stacks", quantity: 1, purpose: ["logistics"], canonStatus: "abstract" }],
    equipmentSummary: ["Shell revetments", "Ready-use ammunition stacks"],
    requisition: { category: "supplies", costPerUnit: 30, maxQuantity: 50, depotPayload: { ammo: 36 }, inBattleAllowed: true }
  },
  fuel: {
    key: "fuel",
    label: "Fuel Dump",
    historicalDescription: "Drummed fuel stocks with pump and hose gear for armored, motorized, and convoy formations.",
    gameplayDescription: "In-battle supply purchase that replenishes depot fuel after delivery delay.",
    category: "supplies",
    purpose: ["logistics"],
    personnel: [{ id: "fuel-handlers", label: "Fuel handlers", count: 18, role: "driver" }],
    vehicles: 0,
    equipment: [{ id: "fuel-stores", label: "Drummed fuel stocks", quantity: 1, purpose: ["logistics"], canonStatus: "abstract" }],
    equipmentSummary: ["Drummed fuel stocks", "Pump and hose sets"],
    requisition: { category: "supplies", costPerUnit: 25, maxQuantity: 50, depotPayload: { fuel: 54 }, inBattleAllowed: true }
  },
  medic: {
    key: "medic",
    label: "Medical Detachment",
    historicalDescription: "Forward aid and evacuation detachment with ambulance pair and dressing station.",
    gameplayDescription: "Automated medical logistics unit that treats injured and wounded personnel by priority using the supply-truck logistics pattern.",
    category: "logistics",
    purpose: ["medical"],
    echelon: "platoon",
    personnel: [{ id: "medical-staff", label: "Aid-post staff", count: 32, role: "medic" }],
    vehicles: 4,
    equipment: [{ id: "aid-post", label: "Aid post and ambulances", quantity: 1, purpose: ["medical"], canonStatus: "abstract" }],
    equipmentSummary: ["Aid-post section", "Ambulance pair", "Field dressings"],
    tacticalUnitType: "Supply_Truck",
    tactical: tactical.Supply_Truck,
    startingLoadout: { strength: 100, ammo: 0, fuel: 70, entrench: 0, facing: "NW", baseExperience: 0 },
    requisition: { category: "logistics", costPerUnit: 60, maxQuantity: 15, inBattleAllowed: true },
    spriteUrl: sprite("Wheeled_Supply_USA_Sideview.png")
  },
  transport: {
    key: "transport",
    label: "Transport Column",
    historicalDescription: "Rear-area truck lift reserved for campaign movement planning.",
    gameplayDescription: "Hidden campaign logistics entry, not a tactical battle purchase.",
    category: "logistics",
    purpose: ["transport"],
    personnel: [{ id: "truck-column", label: "Truck column drivers", count: 90, role: "driver" }],
    vehicles: 26,
    equipment: [{ id: "truck-lift", label: "Cargo trucks and liaison jeeps", quantity: 26, purpose: ["transport"], canonStatus: "abstract" }],
    equipmentSummary: ["20 cargo trucks", "6 liaison jeeps"],
    requisition: { category: "logistics", costPerUnit: 70, maxQuantity: 15, visibleInAllocationUi: false }
  },
  maintenance: {
    key: "maintenance",
    label: "Recovery & Repair Section",
    historicalDescription: "Field workshop and recovery section for damaged vehicles, guns, and prime movers.",
    gameplayDescription: "Automated repair logistics unit that restores damaged and disabled vehicles or equipment by priority using the supply-truck logistics pattern.",
    category: "logistics",
    purpose: ["maintenance"],
    echelon: "platoon",
    personnel: [{ id: "maintenance-staff", label: "Workshop and recovery staff", count: 54, role: "maintenance" }],
    vehicles: 6,
    equipment: [{ id: "repair-section", label: "Workshop lorry and recovery tractor", quantity: 1, purpose: ["maintenance"], canonStatus: "abstract" }],
    equipmentSummary: ["Workshop lorry", "Recovery tractor", "Spare parts trailer"],
    tacticalUnitType: "Supply_Truck",
    tactical: tactical.Supply_Truck,
    startingLoadout: { strength: 100, ammo: 0, fuel: 70, entrench: 0, facing: "NW", baseExperience: 0 },
    requisition: { category: "logistics", costPerUnit: 55, maxQuantity: 12, inBattleAllowed: true },
    spriteUrl: sprite("Wheeled_Supply_USA_Sideview.png")
  },
  corpsArtilleryGroup: {
    key: "corpsArtilleryGroup",
    label: "Corps Artillery Group",
    historicalDescription: "Observer-directed off-map corps artillery fire missions.",
    gameplayDescription: "Planned off-map fire support.",
    category: "support",
    purpose: ["indirectFire"],
    personnel: [{ id: "corps-observers", label: "Forward observer party", count: 36, role: "hq" }],
    vehicles: 4,
    equipment: [{ id: "corps-fires", label: "Off-map fire missions", quantity: 3, purpose: ["indirectFire"], canonStatus: "abstract" }],
    equipmentSummary: ["3 off-map fire missions", "Forward observer party"],
    requisition: { category: "support", costPerUnit: 90, maxQuantity: 2, inBattleAllowed: true }
  },
  shoreFireControlParty: {
    key: "shoreFireControlParty",
    label: "Naval Gunfire Support (NGFS)",
    historicalDescription: "Shore fire-control party coordinating destroyer and cruiser bombardment from offshore stations.",
    gameplayDescription: "Planned naval fire support.",
    category: "support",
    purpose: ["indirectFire"],
    personnel: [{ id: "naval-observers", label: "Shore observer team", count: 18, role: "hq" }],
    vehicles: 2,
    equipment: [{ id: "naval-fires", label: "Naval fire missions", quantity: 2, purpose: ["indirectFire"], canonStatus: "abstract" }],
    equipmentSummary: ["2 naval fire missions", "Shore observer team"],
    requisition: { category: "support", costPerUnit: 70, maxQuantity: 1, inBattleAllowed: true }
  }
} as const satisfies Record<UnitAllocationKey, FormationDefinition>;

export const formationList = Object.freeze(Object.values(unitFormations)) as readonly FormationDefinition[];

export const scenarioOnlyTacticalDefinitions = [
  {
    type: "AT_Infantry",
    tactical: tactical.AT_Infantry,
    historicalDescription: "Infantry anti-tank teams carrying rifles, grenades, and dedicated close anti-armor weapons."
  },
  {
    type: "Combat_Engineer",
    tactical: tactical.Combat_Engineer,
    historicalDescription: "Assault engineer element with heavier breaching, demolition, and close-assault equipment."
  },
  {
    type: "Medium_Tank",
    tactical: tactical.Medium_Tank,
    historicalDescription: "Medium tank with balanced armor and firepower for breakthrough and mobile operations."
  },
  {
    type: "Panzer_IV",
    tactical: unit({
      ...tactical.Light_Tank,
      class: "tank",
      combat: { category: "tank", weight: "medium", role: "normal", signature: "medium" },
      movement: 3,
      vision: 3,
      ammo: 7,
      fuel: 40,
      armor: { front: 15, side: 8, top: 4 },
      hardAttack: 28,
      softAttack: 40,
      accuracyBase: 65,
      cost: 300,
      baseExperience: 1,
      fortificationDamage: "medium",
      suppressionRole: "high",
      weaponModel: weaponModels.mediumTank
    }),
    historicalDescription: "German Panzer IV H medium tank company equivalent."
  }
] as const satisfies readonly ScenarioOnlyTacticalDefinition[];

export function getFormation(key: string): FormationDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(unitFormations, key)
    ? unitFormations[key as UnitAllocationKey]
    : undefined;
}

export function isUnitAllocationKey(value: string): value is UnitAllocationKey {
  return Object.prototype.hasOwnProperty.call(unitFormations, value);
}

export function getDeployableFormations(): readonly FormationDefinition[] {
  return formationList.filter((formation) => Boolean(formation.tacticalUnitType && formation.startingLoadout));
}
