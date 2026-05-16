import type { WeaponEffectProfile } from "./types";

export const weaponEffectProfiles = [
  {
    key: "small-arms-ball",
    attackKind: "smallArms",
    fallbackCategory: "Infantry",
    personnelLethality: 0.35,
    vehicleKillPower: 0.02,
    vehicleDisablePower: 0.05,
    armorPenetration: 1,
    fortificationDamage: 0.05,
    suppression: 0.35
  },
  {
    key: "machine-gun",
    attackKind: "machineGun",
    fallbackCategory: "Support Weapon",
    personnelLethality: 0.3,
    vehicleKillPower: 0.03,
    vehicleDisablePower: 0.08,
    armorPenetration: 2,
    fortificationDamage: 0.08,
    suppression: 0.7
  },
  {
    key: "tank-he",
    attackKind: "directHe",
    fallbackCategory: "Vehicle Weapon",
    personnelLethality: 0.45,
    vehicleKillPower: 0.2,
    vehicleDisablePower: 0.35,
    armorPenetration: 8,
    fortificationDamage: 0.55,
    suppression: 0.65
  },
  {
    key: "assault-gun-he",
    attackKind: "directHe",
    fallbackCategory: "Vehicle Weapon",
    personnelLethality: 0.55,
    vehicleKillPower: 0.16,
    vehicleDisablePower: 0.35,
    armorPenetration: 7,
    fortificationDamage: 0.9,
    suppression: 0.95
  },
  {
    key: "demolition",
    attackKind: "demolition",
    fallbackCategory: "Explosive",
    personnelLethality: 0.65,
    vehicleKillPower: 0.3,
    vehicleDisablePower: 0.45,
    armorPenetration: 10,
    fortificationDamage: 1,
    suppression: 0.8
  },
  {
    key: "indirect-he",
    attackKind: "indirectHe",
    fallbackCategory: "Explosive",
    personnelLethality: 0.5,
    vehicleKillPower: 0.12,
    vehicleDisablePower: 0.35,
    armorPenetration: 6,
    fortificationDamage: 0.65,
    suppression: 0.9
  }
] as const satisfies readonly WeaponEffectProfile[];

export function getWeaponEffectProfile(key: string): WeaponEffectProfile | undefined {
  return weaponEffectProfiles.find((profile) => profile.key === key);
}
