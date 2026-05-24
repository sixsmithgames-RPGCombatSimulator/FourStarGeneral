import { registerTest } from "./harness.js";
import { pickFacingArmor, resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import { combat as combatBalance } from "../src/core/balance";
import type { Axial, ScenarioUnit, TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { resolveDamagePacket, describeDamagePacket } from "../src/data/unitSystem/damagePackets";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
import { formationList } from "../src/data/unitSystem/formations";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;

function formationKeyForType(type: string): string | undefined {
  return formationList.find((formation) => formation.tacticalUnitType === type)?.key;
}

function makeCombatState(
  typeKey: "Infantry_42" | "Medium_Tank" | "Heavy_Tank",
  general: { accBonus: number; dmgBonus: number } = { accBonus: 0, dmgBonus: 0 }
): UnitCombatState {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing '${typeKey}' definition for infantry assault flank tests.`);
  }
  return {
    unit: definition,
    strength: 100,
    experience: definition.baseExperience ?? 0,
    general
  };
}

function makeScenarioUnit(typeKey: "Infantry_42" | "Medium_Tank" | "Heavy_Tank", hex: Axial, id: string): ScenarioUnit {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing '${typeKey}' definition for infantry assault flank tests.`);
  }
  const formationKey = formationKeyForType(typeKey);
  return {
    type: typeKey,
    hex: structuredClone(hex),
    strength: 100,
    experience: definition.baseExperience ?? 0,
    baseExperience: definition.baseExperience ?? 0,
    earnedExperience: 0,
    ammo: definition.ammo,
    fuel: definition.fuel,
    entrench: 0,
    facing: "W",
    unitId: id,
    formationKey,
    status: createInitialFormationStatus(typeKey, formationKey)
  };
}

function makeAttackRequest(options: {
  readonly attackerType: "Infantry_42" | "Medium_Tank" | "Heavy_Tank";
  readonly defenderType: "Infantry_42" | "Medium_Tank" | "Heavy_Tank";
  readonly attackerHex: Axial;
  readonly defenderHex: Axial;
  readonly targetFacing: ScenarioUnit["facing"];
  readonly stance?: "assault";
  readonly general?: { accBonus: number; dmgBonus: number };
}): AttackRequest {
  const attacker = makeCombatState(options.attackerType, options.general);
  const defender = makeCombatState(options.defenderType);
  const defenderDefinition = defender.unit;

  return {
    attacker,
    defender,
    attackerCtx: {
      hex: options.attackerHex,
      stance: options.stance
    },
    defenderCtx: {
      terrain: plains,
      class: defenderDefinition.class,
      facing: options.targetFacing,
      hex: options.defenderHex,
      isRushing: options.stance === "assault",
      isSpottedOnly: false,
      stance: options.stance === "assault" ? "assault" : undefined
    },
    targetFacing: options.targetFacing,
    isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist",
    useTheoreticalShots: false
  };
}

registerTest("INFANTRY_ASSAULT_AUTO_FLANK_REDUCES_TANK_ARMOR_FROM_FRONTAL_ARC", async ({ Then }) => {
  const heavyTank = unitTypes.Heavy_Tank;
  if (!heavyTank) {
    throw new Error("Missing Heavy_Tank definition for assault flank test.");
  }

  const attackerHex: Axial = { q: -1, r: 0 };
  const defenderHex: Axial = { q: 0, r: 0 };
  const frontArmor = pickFacingArmor(attackerHex, defenderHex, "W", heavyTank, "infantry");
  const assaultArmor = pickFacingArmor(attackerHex, defenderHex, "W", heavyTank, "infantry", "assault");
  const rearArmor = heavyTank.armor.rear ?? Math.max(1, Math.round(heavyTank.armor.side * 0.75));
  const expectedAssaultArmor = heavyTank.armor.side * (1 - combatBalance.penetration.assaultFlankRearBlendFromFront)
    + rearArmor * combatBalance.penetration.assaultFlankRearBlendFromFront;

  if (!(frontArmor > assaultArmor)) {
    throw new Error(`Expected assault auto-flank to reduce frontal heavy-tank armor (${frontArmor} -> ${assaultArmor}).`);
  }
  if (Math.abs(assaultArmor - expectedAssaultArmor) > 0.001) {
    throw new Error(`Expected assault armor ${expectedAssaultArmor.toFixed(3)}, got ${assaultArmor.toFixed(3)}.`);
  }

  await Then("infantry assault no longer resolves as pure front-plate contact against tanks", () => {});
});

registerTest("INFANTRY_BAZOOKA_ASSAULT_PACKET_APPLIES_STRONGER_ANTI_TANK_DAMAGE_THAN_STANDARD_ADJACENT_FIRE", async ({ Then }) => {
  const infantryDefinition = unitTypes.Infantry_42;
  if (!infantryDefinition?.weaponModel) {
    throw new Error("Missing Infantry_42 weapon model.");
  }
  const bazookaGroup = infantryDefinition.weaponModel.groups.find((group) => group.id === "bazooka-teams");
  if (!bazookaGroup) {
    throw new Error("Missing infantry bazooka weapon group.");
  }
  const bazookaOnlyAttackerDefinition: UnitTypeDefinition = {
    ...infantryDefinition,
    weaponModel: {
      doctrine: "Synthetic bazooka-only anti-tank assault regression.",
      groups: [bazookaGroup]
    }
  };

  const attackerHex: Axial = { q: -1, r: 0 };
  const defenderHex: Axial = { q: 0, r: 0 };
  const attackerUnit = makeScenarioUnit("Infantry_42", attackerHex, "assault-bazooka-attacker");
  const defenderUnitStandard = makeScenarioUnit("Medium_Tank", defenderHex, "assault-bazooka-defender-standard");
  const defenderUnitAssault = makeScenarioUnit("Medium_Tank", defenderHex, "assault-bazooka-defender-assault");

  const commander = { accBonus: 25, dmgBonus: 5 };
  const standardRequest = makeAttackRequest({
    attackerType: "Infantry_42",
    defenderType: "Medium_Tank",
    attackerHex,
    defenderHex,
    targetFacing: "W",
    general: commander
  });
  const assaultRequest = makeAttackRequest({
    attackerType: "Infantry_42",
    defenderType: "Medium_Tank",
    attackerHex,
    defenderHex,
    targetFacing: "W",
    stance: "assault",
    general: commander
  });

  const standardResult = resolveAttack(standardRequest);
  const assaultResult = resolveAttack(assaultRequest);
  const standardPacket = resolveDamagePacket({
    attacker: attackerUnit,
    attackerDefinition: bazookaOnlyAttackerDefinition,
    attackerHex,
    defender: defenderUnitStandard,
    defenderDefinition: unitTypes.Medium_Tank,
    defenderHex,
    attackResult: standardResult,
    targetFacing: "W"
  });
  const assaultPacket = resolveDamagePacket({
    attacker: attackerUnit,
    attackerDefinition: bazookaOnlyAttackerDefinition,
    attackerHex,
    defender: defenderUnitAssault,
    defenderDefinition: unitTypes.Medium_Tank,
    defenderHex,
    attackResult: assaultResult,
    targetFacing: "W",
    attackerStance: "assault"
  });

  const standardEquipmentEvents =
    standardPacket.equipment.damaged + standardPacket.equipment.disabled + standardPacket.equipment.destroyed;
  const assaultEquipmentEvents =
    assaultPacket.equipment.damaged + assaultPacket.equipment.disabled + assaultPacket.equipment.destroyed;

  if (assaultResult.facingArmor >= standardResult.facingArmor) {
    throw new Error(
      `Expected assault auto-flank armor to be lower. Standard armor ${standardResult.facingArmor}, assault armor ${assaultResult.facingArmor}.`
    );
  }
  if (!(assaultPacket.readinessLoss > standardPacket.readinessLoss * 1.9)) {
    throw new Error(
      `Expected assault bazooka strike to produce materially heavier tank damage outcomes. Standard ${describeDamagePacket(standardPacket)}, assault ${describeDamagePacket(assaultPacket)}.`
    );
  }
  if (assaultEquipmentEvents < standardEquipmentEvents) {
    throw new Error(
      `Assault flank geometry should not reduce anti-tank equipment effects. Standard ${describeDamagePacket(standardPacket)}, assault ${describeDamagePacket(assaultPacket)}.`
    );
  }

  await Then("adjacent infantry assault meaningfully improves bazooka anti-tank packet outcomes via flank geometry", () => {});
});

registerTest("TANK_GUNNERS_GET_CLOSE_DEFENSE_ACCURACY_BOOST_VS_ASSAULTING_INFANTRY", async ({ Then }) => {
  const attackerHex: Axial = { q: 0, r: 0 };
  const defenderHex: Axial = { q: 0, r: 1 };
  const baseRequest = makeAttackRequest({
    attackerType: "Medium_Tank",
    defenderType: "Infantry_42",
    attackerHex,
    defenderHex,
    targetFacing: "SE"
  });

  const assaultRequest: AttackRequest = {
    ...baseRequest,
    attackerCtx: {
      ...baseRequest.attackerCtx,
      stance: "assault"
    },
    defenderCtx: {
      ...baseRequest.defenderCtx,
      isRushing: true,
      stance: "assault"
    }
  };

  const baseResult = resolveAttack(baseRequest);
  const assaultResult = resolveAttack(assaultRequest);

  if (!(assaultResult.accuracy > baseResult.accuracy)) {
    throw new Error(`Expected tank close-defense accuracy boost against assaulting infantry (${baseResult.accuracy}% -> ${assaultResult.accuracy}%).`);
  }

  await Then("tank counterfire posture is materially more accurate against infantry that closes for assault", () => {});
});
