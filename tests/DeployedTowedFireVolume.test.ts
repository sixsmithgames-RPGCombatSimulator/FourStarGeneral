import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import type { TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${label} to be ${expected} (+/- ${tolerance}), received ${actual}.`);
  }
}

function makeState(typeKey: string, experience = 1): UnitCombatState {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing unit definition '${typeKey}' for towed-fire-volume test.`);
  }
  return {
    unit: definition,
    strength: 100,
    experience,
    general: { accBonus: 0, dmgBonus: 0 }
  };
}

function makeRequest(options: {
  attackerType: string;
  defenderType: string;
  attackerHex: { q: number; r: number };
  defenderHex: { q: number; r: number };
  isSpottedOnly?: boolean;
  towState?: "deployed" | "towed";
}): AttackRequest {
  const attacker = makeState(options.attackerType);
  const defender = makeState(options.defenderType);
  return {
    attacker,
    defender,
    attackerCtx: {
      hex: options.attackerHex,
      towState: options.towState
    },
    defenderCtx: {
      terrain: plains,
      class: defender.unit.class,
      facing: "W",
      hex: options.defenderHex,
      isSpottedOnly: options.isSpottedOnly ?? false
    },
    targetFacing: "W",
    isSoftTarget: defender.unit.class === "infantry" || defender.unit.class === "specialist"
  };
}

registerTest("INDIRECT_OBSERVER_FIRE_REQUIRES_SPOTTING_BUT_SKIPS_DIRECT_FIRE_SPOT_PENALTY", async ({ Then }) => {
  const howitzerObserved = resolveAttack(makeRequest({
    attackerType: "Howitzer_105",
    defenderType: "Infantry_42",
    attackerHex: { q: 0, r: 0 },
    defenderHex: { q: 3, r: 0 },
    isSpottedOnly: false
  }));
  const howitzerSpottedOnly = resolveAttack(makeRequest({
    attackerType: "Howitzer_105",
    defenderType: "Infantry_42",
    attackerHex: { q: 0, r: 0 },
    defenderHex: { q: 3, r: 0 },
    isSpottedOnly: true
  }));

  assertClose(howitzerSpottedOnly.accuracy, howitzerObserved.accuracy, 0.001, "indirect-fire spotted accuracy");

  const atGunObserved = resolveAttack(makeRequest({
    attackerType: "AT_Gun_50mm",
    defenderType: "Heavy_Tank",
    attackerHex: { q: -1, r: 0 },
    defenderHex: { q: 0, r: 0 },
    isSpottedOnly: false
  }));
  const atGunSpottedOnly = resolveAttack(makeRequest({
    attackerType: "AT_Gun_50mm",
    defenderType: "Heavy_Tank",
    attackerHex: { q: -1, r: 0 },
    defenderHex: { q: 0, r: 0 },
    isSpottedOnly: true
  }));
  assertClose(atGunSpottedOnly.accuracy, atGunObserved.accuracy * 0.5, 0.001, "direct-fire spotted accuracy");

  await Then("observer-directed indirect fire is no longer treated as blind direct fire while direct-fire units keep the spotted penalty", () => {});
});

registerTest("DEPLOYED_TOWED_BATTERIES_GAIN_PREPARED_FIRE_VOLUME", async ({ Then }) => {
  const howitzerStandard = resolveAttack(makeRequest({
    attackerType: "Howitzer_105",
    defenderType: "Infantry_42",
    attackerHex: { q: 0, r: 0 },
    defenderHex: { q: 3, r: 0 }
  }));
  const howitzerDeployed = resolveAttack(makeRequest({
    attackerType: "Howitzer_105",
    defenderType: "Infantry_42",
    attackerHex: { q: 0, r: 0 },
    defenderHex: { q: 3, r: 0 },
    towState: "deployed"
  }));
  const flakDeployed = resolveAttack(makeRequest({
    attackerType: "Flak_88",
    defenderType: "Heavy_Tank",
    attackerHex: { q: -2, r: 0 },
    defenderHex: { q: 0, r: 0 },
    towState: "deployed"
  }));
  const atDeployed = resolveAttack(makeRequest({
    attackerType: "AT_Gun_50mm",
    defenderType: "Heavy_Tank",
    attackerHex: { q: -1, r: 0 },
    defenderHex: { q: 0, r: 0 },
    towState: "deployed"
  }));

  if (howitzerStandard.shots !== 19) {
    throw new Error(`Expected baseline howitzer volley to remain 19 shots, received ${howitzerStandard.shots}.`);
  }
  if (howitzerDeployed.shots !== 24) {
    throw new Error(`Expected deployed howitzer volley to rise to 24 shots, received ${howitzerDeployed.shots}.`);
  }
  if (flakDeployed.shots !== 53) {
    throw new Error(`Expected deployed Flak 88 volley to resolve 53 shots, received ${flakDeployed.shots}.`);
  }
  if (atDeployed.shots !== 83) {
    throw new Error(`Expected deployed AT-gun volley to resolve 83 shots, received ${atDeployed.shots}.`);
  }

  await Then("deployed towed guns use prepared-battery fire volume instead of standard maneuver shot scaling", () => {});
});
