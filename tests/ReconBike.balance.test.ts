import { registerTest } from "./harness.js";
import { resolveAttack } from "../src/core/Combat";
import type { AttackRequest, UnitCombatState } from "../src/core/Combat";
import unitTypesData from "../src/data/unitTypes.json";
import type { TerrainDefinition, UnitTypeDefinition } from "../src/core/types";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;

function makeUnitState(typeKey: "Infantry_42" | "Recon_Bike"): UnitCombatState {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing unit type '${typeKey}' for recon bike balance test.`);
  }
  return {
    unit: definition,
    strength: 100,
    experience: 0,
    general: { accBonus: 0, dmgBonus: 0 }
  };
}

function makeSoftTargetRequest(
  attackerType: "Infantry_42" | "Recon_Bike",
  options?: { stance?: "assault" | "suppressive" }
): AttackRequest {
  return {
    attacker: makeUnitState(attackerType),
    defender: makeUnitState("Infantry_42"),
    attackerCtx: {
      hex: { q: 0, r: 0 },
      stance: options?.stance
    },
    defenderCtx: {
      terrain: plains,
      class: "infantry",
      facing: "S",
      hex: { q: 0, r: 1 },
      isRushing: options?.stance === "assault",
      isSpottedOnly: false,
      stance: options?.stance === "assault" ? "assault" : undefined
    },
    targetFacing: "S",
    isSoftTarget: true
  };
}

registerTest("RECON_BIKE_BALANCE_TRACKS_INFANTRY_RANGE_BUT_NOT_INFANTRY_FIREPOWER", async ({ Then }) => {
  const infantryDef = unitTypes.Infantry_42;
  const reconBikeDef = unitTypes.Recon_Bike;
  if (!infantryDef || !reconBikeDef) {
    throw new Error("Expected Infantry_42 and Recon_Bike definitions to be present.");
  }

  const infantryAttack = resolveAttack(makeSoftTargetRequest("Infantry_42"));
  const reconBikeSuppressive = resolveAttack(makeSoftTargetRequest("Recon_Bike", { stance: "suppressive" }));
  const reconBikeAssault = resolveAttack(makeSoftTargetRequest("Recon_Bike", { stance: "assault" }));

  if (reconBikeDef.rangeMin !== infantryDef.rangeMin || reconBikeDef.rangeMax !== infantryDef.rangeMax) {
    throw new Error(
      `Expected recon bike and infantry to share the same direct-fire range band, received bike ${reconBikeDef.rangeMin}-${reconBikeDef.rangeMax} vs infantry ${infantryDef.rangeMin}-${infantryDef.rangeMax}.`
    );
  }
  if (reconBikeSuppressive.accuracy >= infantryAttack.accuracy) {
    throw new Error(
      `Expected recon bike suppressive fire to stay less accurate than infantry at the same range, received bike ${reconBikeSuppressive.accuracy}% vs infantry ${infantryAttack.accuracy}%.`
    );
  }
  if (reconBikeSuppressive.expectedDamage >= infantryAttack.expectedDamage) {
    throw new Error(
      `Expected recon bike suppressive fire to stay below infantry expected damage, received bike ${reconBikeSuppressive.expectedDamage} vs infantry ${infantryAttack.expectedDamage}.`
    );
  }
  if (reconBikeAssault.expectedDamage <= reconBikeSuppressive.expectedDamage) {
    throw new Error(
      `Expected recon bike assault to outperform its suppressive fire, received assault ${reconBikeAssault.expectedDamage} vs suppressive ${reconBikeSuppressive.expectedDamage}.`
    );
  }

  await Then("recon bikes stay close-range scouts rather than outperforming line infantry in standard fire", () => {});
});
