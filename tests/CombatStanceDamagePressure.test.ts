import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type AttackResult } from "../src/core/Combat";
import type { Axial, ScenarioUnit, TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { applyDamagePacketToUnit, resolveDamagePacket, summarizeFormationStatus, type DamagePacket } from "../src/data/unitSystem/damagePackets";
import { formationList } from "../src/data/unitSystem/formations";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;
const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

type TestedStance = "fireAtWill" | "assault" | "suppressive";
type TestUnitKey = "Infantry_42" | "Recon_Bike" | "Tank_Destroyer" | "Light_Tank" | "Flak_88" | "Bomber";

function formationKeyForType(type: string): string | undefined {
  return formationList.find((formation) => formation.tacticalUnitType === type)?.key;
}

function makeUnit(type: TestUnitKey, hex: Axial, id: string): ScenarioUnit {
  const definition = unitTypes[type];
  if (!definition) {
    throw new Error(`Missing '${type}' definition for stance damage pressure test.`);
  }
  const formationKey = formationKeyForType(type);
  return {
    type,
    hex: structuredClone(hex),
    strength: 100,
    experience: definition.baseExperience ?? 0,
    baseExperience: definition.baseExperience ?? 0,
    earnedExperience: 0,
    ammo: definition.ammo,
    fuel: definition.fuel,
    entrench: 0,
    facing: "E",
    unitId: id,
    formationKey,
    status: createInitialFormationStatus(type, formationKey)
  };
}

function syntheticAttackResult(shots: number): AttackResult {
  return {
    accuracy: 100,
    shots,
    damagePerHit: 0,
    expectedHits: shots,
    expectedDamage: 0,
    expectedSuppression: 0,
    effectiveAP: 99,
    facingArmor: 0,
    accuracyBreakdown: {
      baseRange: 100,
      commanderScalar: 1,
      afterCommander: 100,
      experienceScalar: 1,
      afterExperience: 100,
      terrainModifier: 0,
      terrainMultiplier: 1,
      afterTerrain: 100,
      spottedMultiplier: 1,
      finalPreClamp: 100,
      final: 100
    },
    damageBreakdown: {
      baseTableValue: 0,
      experienceScalar: 1,
      afterExperience: 0,
      commanderScalar: 1,
      final: 0
    }
  };
}

function resolveSyntheticPacket(attackerType: TestUnitKey, defenderType: TestUnitKey, shots: number): DamagePacket {
  const attacker = makeUnit(attackerType, { q: 0, r: 0 }, `${attackerType}-synthetic-attacker`);
  const defender = makeUnit(defenderType, { q: 1, r: 0 }, `${defenderType}-synthetic-defender`);
  return resolveDamagePacket({
    attacker,
    attackerDefinition: unitTypes[attackerType],
    attackerHex: attacker.hex,
    defender,
    defenderDefinition: unitTypes[defenderType],
    defenderHex: defender.hex,
    attackResult: syntheticAttackResult(shots),
    targetFacing: defender.facing
  });
}

function buildRequest(defender: ScenarioUnit, stance: TestedStance): AttackRequest {
  const attackerDefinition = unitTypes.Infantry_42;
  const defenderDefinition = unitTypes.Recon_Bike;
  const attackerHex: Axial = { q: 0, r: 0 };
  const defenderHex: Axial = { q: 1, r: 0 };
  return {
    attacker: {
      unit: attackerDefinition,
      strength: 98.19,
      experience: attackerDefinition.baseExperience ?? 0,
      general: { accBonus: 25, dmgBonus: 5 }
    },
    defender: {
      unit: defenderDefinition,
      strength: defender.strength,
      experience: defender.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: {
      hex: attackerHex,
      stance: stance === "fireAtWill" ? undefined : stance,
      suppressionState: "clear"
    },
    defenderCtx: {
      terrain: plains,
      class: defenderDefinition.class,
      facing: defender.facing,
      hex: defenderHex,
      isRushing: stance === "assault",
      isSpottedOnly: false
    },
    targetFacing: defender.facing,
    isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist",
    useTheoreticalShots: false
  };
}

function previewDamage(defender: ScenarioUnit, stance: TestedStance): { expectedHits: number; packet: DamagePacket } {
  const attacker = makeUnit("Infantry_42", { q: 0, r: 0 }, `stance-attacker-${stance}`);
  const attackResult = resolveAttack(buildRequest(defender, stance));
  const packet = resolveDamagePacket({
    attacker,
    attackerDefinition: unitTypes.Infantry_42,
    attackerHex: attacker.hex,
    defender,
    defenderDefinition: unitTypes.Recon_Bike,
    defenderHex: defender.hex,
    attackResult,
    targetFacing: defender.facing,
    suppressionScalar: stance === "suppressive" ? 2 : 1
  });
  return { expectedHits: attackResult.expectedHits, packet };
}

registerTest("ASSAULT_CONTACT_PRESSURE_INCREASES_SEVERITY_AGAINST_DAMAGED_RECON", async ({ Given, When, Then }) => {
  const defender = makeUnit("Recon_Bike", { q: 1, r: 0 }, "damaged-recon-target");
  let fireAtWill: ReturnType<typeof previewDamage>;
  let assault: ReturnType<typeof previewDamage>;
  let suppressive: ReturnType<typeof previewDamage>;

  await Given("a recon bike unit whose fit personnel are already depleted but wounded personnel can still fight", async () => {
    applyDamagePacketToUnit(defender, {
      personnel: { killed: 2, severelyWounded: 2, wounded: 15, injured: 35 },
      equipment: { destroyed: 0, disabled: 1, damaged: 2 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    const summary = summarizeFormationStatus(defender.status, defender.strength);
    if (summary.personnel.fit !== 0 || Math.abs(summary.readiness - 43.21) > 0.01) {
      throw new Error(`Unexpected damaged recon baseline: fit ${summary.personnel.fit}, readiness ${summary.readiness}.`);
    }
  });

  await When("the same infantry attack is previewed in each combat stance", async () => {
    fireAtWill = previewDamage(defender, "fireAtWill");
    assault = previewDamage(defender, "assault");
    suppressive = previewDamage(defender, "suppressive");
  });

  await Then("assault converts its extra close-range contacts into higher readiness loss instead of capping to the same damage", async () => {
    if (assault.expectedHits <= fireAtWill.expectedHits * 2) {
      throw new Error(`Assault did not produce the expected contact-pressure increase (${fireAtWill.expectedHits} -> ${assault.expectedHits}).`);
    }
    if (assault.packet.readinessLoss <= fireAtWill.packet.readinessLoss + 1) {
      throw new Error(`Assault readiness loss should exceed Fire at Will (${fireAtWill.packet.readinessLoss} vs ${assault.packet.readinessLoss}).`);
    }
    const fireAtWillSevereEffects = fireAtWill.packet.personnel.severelyWounded + fireAtWill.packet.personnel.killed;
    const assaultSevereEffects = assault.packet.personnel.severelyWounded + assault.packet.personnel.killed;
    if (assaultSevereEffects <= fireAtWillSevereEffects) {
      throw new Error(`Assault should promote over-cap contacts into more severe personnel effects (${fireAtWillSevereEffects} vs ${assaultSevereEffects} severe-or-KIA).`);
    }
  });

  await Then("suppressing fire keeps normal casualty damage while increasing suppression", async () => {
    if (Math.abs(suppressive.packet.readinessLoss - fireAtWill.packet.readinessLoss) > 0.01) {
      throw new Error(`Suppressing fire should not change direct casualty readiness loss (${fireAtWill.packet.readinessLoss} vs ${suppressive.packet.readinessLoss}).`);
    }
    if (suppressive.packet.suppression <= fireAtWill.packet.suppression * 1.9) {
      throw new Error(`Suppressing fire should materially increase suppression (${fireAtWill.packet.suppression} vs ${suppressive.packet.suppression}).`);
    }
  });
});

registerTest("OVER_CAP_EQUIPMENT_PRESSURE_PROMOTES_VEHICLE_AND_AIR_SEVERITY", async ({ When, Then }) => {
  let lightTankLightPressure: DamagePacket;
  let lightTankHeavyPressure: DamagePacket;
  let bomberHeavyFlakPressure: DamagePacket;

  await When("vehicle and aircraft targets receive more equipment contacts than their platform capacity", async () => {
    lightTankLightPressure = resolveSyntheticPacket("Tank_Destroyer", "Light_Tank", 100);
    lightTankHeavyPressure = resolveSyntheticPacket("Tank_Destroyer", "Light_Tank", 2000);
    bomberHeavyFlakPressure = resolveSyntheticPacket("Flak_88", "Bomber", 100);
  });

  await Then("excess vehicle contacts upgrade damage severity instead of disappearing at the target cap", async () => {
    const lightSevere = lightTankLightPressure.equipment.disabled + lightTankLightPressure.equipment.destroyed;
    const heavySevere = lightTankHeavyPressure.equipment.disabled + lightTankHeavyPressure.equipment.destroyed;
    if (heavySevere <= lightSevere) {
      throw new Error(`Heavy equipment pressure should increase disabled/destroyed outcomes (${lightSevere} vs ${heavySevere}).`);
    }
    if (lightTankHeavyPressure.readinessLoss <= lightTankLightPressure.readinessLoss) {
      throw new Error(`Heavy equipment pressure should increase readiness loss (${lightTankLightPressure.readinessLoss} vs ${lightTankHeavyPressure.readinessLoss}).`);
    }
  });

  await Then("aircraft damage pressure can destroy aircraft rather than only marking them damaged", async () => {
    if (bomberHeavyFlakPressure.equipment.destroyed <= 0) {
      throw new Error(`Heavy flak pressure should destroy at least one aircraft, received ${JSON.stringify(bomberHeavyFlakPressure.equipment)}.`);
    }
    if (bomberHeavyFlakPressure.readinessLoss <= 0) {
      throw new Error("Heavy flak pressure should produce concrete aircraft readiness loss.");
    }
  });
});
