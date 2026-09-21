/**
 * Player-facing Axis names for shared tactical types.
 *
 * Bot formations currently reuse the deterministic Player combat definitions, while the sprite
 * catalog swaps in German equipment and uniforms. These labels keep enemy copy aligned with that
 * presentation without changing combat data, persistence keys, or intelligence state.
 */
const AXIS_UNIT_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Infantry_42: "Grenadier Battalion",
  Infantry: "Grenadier Battalion",
  Infantry_Elite: "Panzergrenadier Battalion",
  Infantry_mg: "Grenadier Machine-Gun Company",
  Infantry_bazooka: "Panzerschreck Team",
  Infantry_mortar: "8 cm Mortar Section",
  AT_Infantry: "Panzerjäger Infantry Company",
  Paratrooper: "Fallschirmjäger Battalion",
  Engineer: "Pionier Battalion",
  Combat_Engineer: "Sturmpionier Battalion",
  AT_Gun_50mm: "5 cm PaK 38 Battery",
  Flak_88: "8.8 cm FlaK Battery",
  SPAA: "Flakpanzer Battery",
  Recon_ArmoredCar: "Sd.Kfz. 222 Reconnaissance Troop",
  Recon: "Armored Reconnaissance Troop",
  Recon_Bike: "Kradschützen Patrol",
  Supply_Truck: "Nachschubkolonne",
  APC_Halftrack: "Sd.Kfz. 251 Panzergrenadier Company",
  Light_Tank: "Panzer Training Company",
  Medium_Tank: "Panzer IV Company",
  Panzer_IV: "Panzer IV Company",
  Panzer_V: "Panther Company",
  Heavy_Tank: "Tiger I Company",
  Assault_Gun: "StuG III Battery",
  Tank_Destroyer: "Marder III Company",
  Anti_Tank_Tank: "Panzerjäger Company",
  Howitzer_105: "10.5 cm leFH 18 Battery",
  Howitzer: "10.5 cm leFH 18 Battery",
  Artillery_105mm: "10.5 cm leFH 18 Battery",
  Artillery_155mm: "15 cm Artillery Battery",
  Rocket_Artillery: "Nebelwerfer Battalion",
  SP_Artillery: "Hummel Battery",
  Scout_Plane: "Aufklärungsstaffel",
  Fighter: "Bf 109 Fighter Staffel",
  Interceptor: "Fw 190 Fighter Staffel",
  Ground_Attack: "Ju 87 Stuka Staffel",
  Bomber: "He 177 Bomber Staffel",
  Bomber_Elite: "He 177 Bomber Staffel",
  Transport_Plane: "Luftwaffe Transport Staffel"
});

/** Converts a stable tactical type key into readable neutral presentation copy. */
export function formatTacticalUnitTypeLabel(unitType: string): string {
  return unitType
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Resolves faction-aware tactical nomenclature without exposing persistent formation identity.
 * Unknown Bot types deliberately retain a readable neutral label instead of inventing a unit name.
 */
export function resolveFactionUnitTypeLabel(
  unitType: string,
  faction: "Player" | "Bot" | "Ally"
): string {
  if (faction === "Bot") {
    return AXIS_UNIT_TYPE_LABELS[unitType] ?? formatTacticalUnitTypeLabel(unitType);
  }
  return formatTacticalUnitTypeLabel(unitType);
}
