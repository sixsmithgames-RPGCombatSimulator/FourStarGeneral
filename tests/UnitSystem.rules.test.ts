import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import { getEffectiveExperience, getExperienceBonus, awardCombatExperience } from "../src/core/Experience";
import type { Axial } from "../src/core/Hex";
import type { ScenarioData, ScenarioUnit, TerrainDictionary, UnitTypeDictionary } from "../src/core/types";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
import { applyDamagePacketToUnit, summarizeFormationStatus } from "../src/data/unitSystem/damagePackets";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { getFormation } from "../src/data/unitSystem/formations";
import { buildAllocationCompositionDisplay } from "../src/data/unitSystem/formationPresentation";
import { unitComposition } from "../src/data/unitComposition";
import terrainData from "../src/data/terrain.json";
import { GameEngine, type SerializedBattleState } from "../src/game/GameEngine";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;

function makeUnit(type: ScenarioUnit["type"], hex: Axial, options: Partial<ScenarioUnit> = {}): ScenarioUnit {
  const definition = unitTypes[type];
  if (!definition) {
    throw new Error(`Missing unit definition ${String(type)}.`);
  }
  return {
    type,
    hex: structuredClone(hex),
    strength: options.strength ?? 100,
    experience: options.experience ?? definition.baseExperience ?? 0,
    baseExperience: options.baseExperience ?? options.experience ?? definition.baseExperience ?? 0,
    earnedExperience: options.earnedExperience ?? 0,
    ammo: options.ammo ?? definition.ammo,
    fuel: options.fuel ?? definition.fuel,
    entrench: options.entrench ?? 0,
    facing: options.facing ?? "SE",
    unitId: options.unitId,
    formationKey: options.formationKey,
    status: options.status ?? createInitialFormationStatus(type as string, options.formationKey)
  };
}

function makeScenario(overrides: Partial<ScenarioData> = {}): ScenarioData {
  const row = Array.from({ length: 7 }, () => ({ tile: "plain" }));
  return {
    name: "Unit System Rule Test",
    size: { cols: 7, rows: 3 },
    tilePalette: {
      plain: {
        terrain: "plains",
        terrainType: "rural",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row],
    objectives: [{ hex: { q: 2, r: 1 }, owner: "Bot", vp: 1 }],
    turnLimit: 8,
    sides: {
      Player: {
        hq: { q: 0, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      },
      Bot: {
        hq: { q: 6, r: 1 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
      }
    },
    ...overrides
  };
}

function makeEngine(state: SerializedBattleState, scenario: ScenarioData = makeScenario()): GameEngine {
  return GameEngine.fromSerialized({
    scenario,
    unitTypes,
    terrain,
    playerSide: scenario.sides.Player,
    botSide: scenario.sides.Bot
  }, state);
}

function makeState(overrides: Partial<SerializedBattleState> = {}): SerializedBattleState {
  return {
    phase: "playerTurn",
    activeFaction: "Player",
    turnNumber: 1,
    baseCamp: { hex: { q: 0, r: 1 }, key: "0,1" },
    playerPlacements: [],
    botPlacements: [],
    reserves: [],
    ...overrides
  };
}

registerTest("UNIT_SYSTEM_INFANTRY_AIRBORNE_AND_ASSAULT_GUN_RULES", async ({ Given, When, Then }) => {
  let failures: string[] = [];

  await Given("the derived unit-system tactical catalog", async () => {
    failures = [];
  });

  await When("checking the requested infantry, airborne, and assault-gun corrections", async () => {
    const infantry = unitTypes.Infantry_42;
    const paratrooper = unitTypes.Paratrooper;
    const engineer = unitTypes.Engineer;
    const combatEngineer = unitTypes.Combat_Engineer;
    const atInfantry = unitTypes.AT_Infantry;
    const assaultGun = unitTypes.Assault_Gun;
    const tank = unitTypes.Light_Tank;
    const airborneFormation = getFormation("airborneDetachment");
    const mediumTankFormation = getFormation("tank");
    const heavyTankFormation = getFormation("heavyTankCompany");
    const tankDestroyerFormation = getFormation("tankDestroyerCompany");
    const assaultGunFormation = getFormation("assaultGunBattalion");
    const airborneComposition = unitComposition.airborneDetachment;
    const tankComposition = unitComposition.tank;
    const heavyTankComposition = unitComposition.heavyTankCompany;
    const tankDestroyerComposition = unitComposition.tankDestroyerCompany;
    const assaultGunComposition = unitComposition.assaultGunBattalion;
    const totalWeaponShots = (definition: UnitTypeDictionary[keyof UnitTypeDictionary]) =>
      definition.weaponModel?.groups.reduce((sum, group) => sum + Math.max(0, group.shots), 0) ?? 0;
    const fallbackStatusTotals = (type: string) => {
      const status = createInitialFormationStatus(type);
      return {
        personnel: Object.values(status.personnel).reduce((sum, pool) => sum + pool.fit, 0),
        equipment: Object.values(status.equipment).reduce((sum, pool) => sum + pool.operational, 0)
      };
    };

    if (infantry.rangeMax !== 4 || infantry.vision !== 4) failures.push("Infantry_42 should fire and spot to 4 hexes.");
    if (paratrooper.rangeMax !== 4 || paratrooper.vision !== 4) failures.push("Paratrooper should fire and spot to 4 hexes.");
    if (engineer.rangeMax !== 4 || engineer.vision !== 4) failures.push("Engineer should fire and spot to 4 hexes.");
    if (combatEngineer.rangeMax !== 4 || combatEngineer.vision !== 4) failures.push("Combat_Engineer should fire and spot to 4 hexes.");
    if (atInfantry.rangeMax !== 6 || atInfantry.vision !== 4) failures.push("AT_Infantry should fire to 6 at spotted targets and spot to 4.");
    if ("shotsScalar" in paratrooper || "shotsScalar" in engineer || "shotsScalar" in combatEngineer) {
      failures.push("Formation shot volume should come from authored weapon-model counts, not legacy tactical shot scalars.");
    }
    if (totalWeaponShots(paratrooper) >= totalWeaponShots(infantry)) failures.push("Paratrooper company should produce fewer authored weapon shots than the infantry battalion.");
    if ((paratrooper.baseExperience ?? 0) <= (infantry.baseExperience ?? 0)) failures.push("Paratroopers should start more experienced than regular infantry.");
    if (airborneFormation?.requisition.category !== "support") failures.push("Airborne detachment should live in the support requisition category.");
    if (airborneFormation?.requisition.requiresTransportFlight !== true) failures.push("Airborne detachment should require a transport flight.");
    if (!airborneComposition.personnelBreakdown.some((entry) => entry.count === 150 && /parachute/i.test(entry.label))) {
      failures.push("Airborne composition should expose its 150-man parachute company breakdown.");
    }
    if (!tankComposition.vehicleBreakdown.some((entry) => entry.quantity === 20 && /tank/i.test(entry.label))) {
      failures.push("Medium tank composition should expose its 20-tank breakdown.");
    }
    if (mediumTankFormation?.label !== "Medium Tank Company" || mediumTankFormation.requisition.costPerUnit !== 100) {
      failures.push("Medium Tank Company should cost 100 RP.");
    }
    if (heavyTankComposition.vehicles !== 14 || heavyTankFormation?.requisition.costPerUnit !== 140) {
      failures.push("Heavy Tank Company should field 14 tanks and cost 140 RP.");
    }
    if (tankDestroyerComposition.vehicles !== 12 || tankDestroyerFormation?.requisition.costPerUnit !== 80) {
      failures.push("Tank Destroyer Company should field 12 tank destroyers and cost 80 RP.");
    }
    if (assaultGunComposition.vehicles !== 6 || assaultGunFormation?.label !== "Assault Gun Battery" || assaultGunFormation.echelon !== "battery" || assaultGunFormation.requisition.costPerUnit !== 50) {
      failures.push("Assault Gun Battery should field 6 assault guns and cost 50 RP.");
    }
    if (fallbackStatusTotals("Light_Tank").equipment !== 20 || fallbackStatusTotals("Panzer_IV").equipment !== 20) {
      failures.push("Medium tank fallback status pools should field 20 tanks, including scenario-only Panzer_IV.");
    }
    if (fallbackStatusTotals("Heavy_Tank").equipment !== 14) {
      failures.push("Heavy tank fallback status pools should field 14 tanks.");
    }
    if (fallbackStatusTotals("Tank_Destroyer").equipment !== 12) {
      failures.push("Tank destroyer fallback status pools should field 12 tank destroyers.");
    }
    if (fallbackStatusTotals("Assault_Gun").equipment !== 6) {
      failures.push("Assault gun fallback status pools should field 6 assault guns.");
    }
    if (fallbackStatusTotals("Panzer_IV").personnel !== 120) {
      failures.push("Scenario-only Panzer_IV should use the medium tank company crew/support fallback.");
    }
    if (assaultGun.accuracyBase >= tank.accuracyBase) failures.push("Assault guns should be less accurate than comparable tanks.");
    if (assaultGun.suppressionRole !== "veryHigh" || assaultGun.fortificationDamage !== "veryHigh") {
      failures.push("Assault guns should have very high suppression and fortification damage.");
    }
    if (tank.fortificationDamage !== "medium" || !["medium", "high"].includes(tank.suppressionRole ?? "none")) {
      failures.push("Tanks should keep medium fortification damage and medium/high suppression.");
    }
  });

  await Then("the unit catalog reflects the aggressive unit-system plan", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" "));
    }
  });
});

registerTest("UNIT_SYSTEM_ALLOCATION_COMPOSITION_DISPLAY_POLICES_DUPLICATE_COUNTS", async ({ When, Then }) => {
  const failures: string[] = [];

  await When("allocation composition chips are built from every formation", async () => {
    const formatCount = (value: number) => Math.max(0, Math.round(value)).toLocaleString();
    const leadingCount = /^(\d[\d,]*)\s+(.+)$/;

    Object.entries(unitComposition).forEach(([key, composition]) => {
      const display = buildAllocationCompositionDisplay(composition, { maxDetails: 12 });

      display.details.forEach((detail) => {
        const match = detail.match(leadingCount);
        if (match && (match[1] === formatCount(composition.personnel) || match[1] === "1")) {
          failures.push(`${key} detail repeats personnel or single-item headline count: ${detail}`);
        }
        if (/\b\d{3,}\s+(rifle|engineer|parachute).*\bcompan/i.test(detail)) {
          failures.push(`${key} detail reads like a count of companies instead of personnel: ${detail}`);
        }
        if (/support vehicles and major platforms/i.test(detail) || /\borganic\b/i.test(detail) || /\bplatforms?\b/i.test(detail)) {
          failures.push(`${key} detail contains duplicate or unclear allocation copy: ${detail}`);
        }
      });

      const lowerDetails = display.details.map((detail) => detail.toLowerCase());
      const hasDetail = (pattern: RegExp) => lowerDetails.some((detail) => pattern.test(detail));
      if (hasDetail(/heavy tanks/) && hasDetail(/heavy breakthrough tanks/)) {
        failures.push(`${key} repeats heavy tank platform details.`);
      }
      if (hasDetail(/tank destroyers/) && hasDetail(/dedicated tank destroyers/)) {
        failures.push(`${key} repeats tank-destroyer platform details.`);
      }
      if (hasDetail(/rocket launch vehicles/) && hasDetail(/rocket launch trucks/)) {
        failures.push(`${key} repeats rocket-launch platform details.`);
      }
      if (key === "infantry" && (hasDetail(/3 rifle companies/) || hasDetail(/weapons company/) || hasDetail(/attached anti-tank section/))) {
        failures.push("infantry allocation card should not repeat battalion/company/subsection organization chips.");
      }
      if (key === "engineer" && (hasDetail(/pontoon bridging kits/) || hasDetail(/earthmoving tools/))) {
        failures.push("engineer allocation card should not repeat aggregate engineering-tool chips as sub-capability chips.");
      }

      display.summary.forEach((summary) => {
        if (lowerDetails.includes(summary.toLowerCase())) {
          failures.push(`${key} repeats summary chip in details: ${summary}`);
        }
        if (/\borganic\b/i.test(summary) || /vehicles\/platforms/i.test(summary) || /\bplatforms?\b/i.test(summary)) {
          failures.push(`${key} summary contains unclear allocation copy: ${summary}`);
        }
      });
    });
  });

  await Then("allocation chips do not repeat summary counts or imply impossible company counts", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
  });
});

registerTest("UNIT_SYSTEM_FORMATION_WIDE_FIRE_VOLUME_AUDIT", async ({ When, Then }) => {
  const failures: string[] = [];
  const totalWeaponShots = (definition: UnitTypeDictionary[keyof UnitTypeDictionary]) =>
    definition.weaponModel?.groups.reduce((sum, group) => sum + Math.max(0, group.shots), 0) ?? 0;
  const statusTotals = (type: string) => {
    const status = createInitialFormationStatus(type);
    return {
      personnel: Object.values(status.personnel).reduce((sum, pool) => sum + pool.fit, 0),
      equipment: Object.values(status.equipment).reduce((sum, pool) => sum + pool.operational, 0)
    };
  };

  await When("checking five-minute gunnery-range fire volumes against formation strength", async () => {
    const expectedShots: Record<string, number> = {
      Infantry_42: 10468,
      AT_Infantry: 9260,
      Paratrooper: 3270,
      Engineer: 3912,
      Combat_Engineer: 4218,
      Light_Tank: 5240,
      Panzer_IV: 7900,
      Heavy_Tank: 4480,
      Assault_Gun: 1140,
      Tank_Destroyer: 1608,
      Howitzer_105: 90,
      Rocket_Artillery: 48,
      SP_Artillery: 120,
      AT_Gun_50mm: 288,
      Flak_88: 184,
      Recon_Bike: 1800,
      Recon_ArmoredCar: 2484,
      Scout_Plane: 180,
      Fighter: 1440,
      Interceptor: 1920,
      Ground_Attack: 1264,
      Bomber: 72,
      APC_Halftrack: 3600,
      Supply_Truck: 36,
      Transport_Plane: 0
    };
    const expectedFallbacks: Record<string, { personnel: number; equipment: number }> = {
      Infantry_42: { personnel: 720, equipment: 0 },
      AT_Infantry: { personnel: 770, equipment: 0 },
      Paratrooper: { personnel: 150, equipment: 0 },
      Engineer: { personnel: 160, equipment: 12 },
      Combat_Engineer: { personnel: 160, equipment: 12 },
      Light_Tank: { personnel: 120, equipment: 20 },
      Panzer_IV: { personnel: 120, equipment: 20 },
      Heavy_Tank: { personnel: 96, equipment: 14 },
      Assault_Gun: { personnel: 54, equipment: 6 },
      Tank_Destroyer: { personnel: 90, equipment: 12 },
      Howitzer_105: { personnel: 180, equipment: 18 },
      Rocket_Artillery: { personnel: 150, equipment: 12 },
      SP_Artillery: { personnel: 140, equipment: 8 },
      AT_Gun_50mm: { personnel: 132, equipment: 18 },
      Flak_88: { personnel: 160, equipment: 16 },
      Recon_Bike: { personnel: 54, equipment: 18 },
      Recon_ArmoredCar: { personnel: 150, equipment: 18 },
      Scout_Plane: { personnel: 90, equipment: 6 },
      Fighter: { personnel: 120, equipment: 12 },
      Interceptor: { personnel: 160, equipment: 16 },
      Ground_Attack: { personnel: 130, equipment: 8 },
      Bomber: { personnel: 150, equipment: 6 },
      Transport_Plane: { personnel: 200, equipment: 10 },
      APC_Halftrack: { personnel: 180, equipment: 24 },
      Supply_Truck: { personnel: 48, equipment: 8 }
    };

    Object.entries(expectedShots).forEach(([type, expected]) => {
      const definition = unitTypes[type as keyof typeof unitTypes];
      if (!definition) {
        failures.push(`${type} is missing from the derived tactical catalog.`);
        return;
      }
      const actual = totalWeaponShots(definition);
      if (actual !== expected) {
        failures.push(`${type} should author ${expected} full-formation shots, saw ${actual}.`);
      }
    });

    Object.entries(expectedFallbacks).forEach(([type, expected]) => {
      const actual = statusTotals(type);
      if (actual.personnel !== expected.personnel || actual.equipment !== expected.equipment) {
        failures.push(
          `${type} fallback status should track ${expected.personnel} personnel/${expected.equipment} platforms, ` +
          `saw ${actual.personnel}/${actual.equipment}.`
        );
      }
    });
  });

  await Then("weapon models and status fallbacks use whole-unit composition counts", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
  });
});

registerTest("UNIT_SYSTEM_EXPERIENCE_CAPS_AND_INTENTIONAL_ATTACK_AWARD", async ({ Given, When, Then }) => {
  let trainedBonus = 0;
  let cappedEffective = 0;
  let earnedAfterAttack = 0;
  let battleRequisitionPoints = 0;

  await Given("a trained unit and a live player attack", async () => {
    const veteran = makeUnit("Paratrooper", { q: 0, r: 0 }, { baseExperience: 2, earnedExperience: 4 });
    awardCombatExperience(veteran);
    cappedEffective = getEffectiveExperience(veteran);
    trainedBonus = getExperienceBonus(veteran);
  });

  await When("the player performs an intentional attack against an enemy", async () => {
    const attacker = makeUnit("Infantry_42", { q: 1, r: 1 }, { unitId: "player-infantry", formationKey: "infantry" });
    const defender = makeUnit("Infantry_42", { q: 2, r: 1 }, { unitId: "bot-infantry", formationKey: "infantry", facing: "NW" });
    const engine = makeEngine(makeState({
      playerPlacements: [attacker],
      botPlacements: [defender]
    }));

    const result = engine.attackUnit(attacker.hex, defender.hex, "suppressive", "player-infantry", "bot-infantry");
    if (!result) {
      throw new Error("Expected the player attack to resolve.");
    }
    const [updatedAttacker] = engine.serialize().playerPlacements;
    earnedAfterAttack = updatedAttacker?.earnedExperience ?? 0;
    battleRequisitionPoints = engine.getBattleRequisitionSnapshot().points;
  });

  await Then("experience is capped at 15 percent and intentional attacks award one earned point", async () => {
    if (cappedEffective !== 5) {
      throw new Error(`Expected effective experience to cap at 5, received ${cappedEffective}.`);
    }
    if (Math.abs(trainedBonus - 0.15) > 0.0001) {
      throw new Error(`Expected maximum experience bonus to be 15%, received ${trainedBonus}.`);
    }
    if (earnedAfterAttack !== 1) {
      throw new Error(`Expected intentional attack to award 1 earned experience, received ${earnedAfterAttack}.`);
    }
    if (battleRequisitionPoints < 1) {
      throw new Error("Expected meaningful combat damage to award at least 1 battle requisition point.");
    }
  });
});

registerTest("UNIT_SYSTEM_FIRE_ORDERS_AND_ASSAULT_RANGE_RULES", async ({ When, Then }) => {
  const failures: string[] = [];

  await When("previewing normal fire, suppressing fire, and a non-adjacent assault attempt", async () => {
    const attacker = makeUnit("Infantry_42", { q: 1, r: 1 }, {
      unitId: "player-fire-orders",
      formationKey: "infantry",
      ammo: 6
    });
    const defender = makeUnit("Infantry_42", { q: 2, r: 1 }, {
      unitId: "bot-fire-orders",
      formationKey: "infantry",
      facing: "NW"
    });
    const engine = makeEngine(makeState({
      playerPlacements: [attacker],
      botPlacements: [defender]
    }));

    const fireAtWill = engine.previewAttack(attacker.hex, defender.hex, "fireAtWill", attacker.unitId, defender.unitId);
    const suppressingFire = engine.previewAttack(attacker.hex, defender.hex, "suppressive", attacker.unitId, defender.unitId);
    if (!fireAtWill || !suppressingFire) {
      throw new Error("Expected both Fire at Will and Suppressing Fire previews to resolve.");
    }

    if (fireAtWill.result.shots !== suppressingFire.result.shots) {
      failures.push(`Suppressing Fire should not change shot volume (${fireAtWill.result.shots} vs ${suppressingFire.result.shots}).`);
    }
    if (Math.abs(fireAtWill.result.accuracy - suppressingFire.result.accuracy) > 0.0001) {
      failures.push(`Suppressing Fire should not change accuracy (${fireAtWill.result.accuracy} vs ${suppressingFire.result.accuracy}).`);
    }
    const fireDamage = fireAtWill.projectedDamage?.readinessLoss ?? fireAtWill.finalExpectedDamage;
    const suppressingDamage = suppressingFire.projectedDamage?.readinessLoss ?? suppressingFire.finalExpectedDamage;
    if (Math.abs(fireDamage - suppressingDamage) > 0.01) {
      failures.push(`Suppressing Fire should not change damage readiness loss (${fireDamage} vs ${suppressingDamage}).`);
    }
    if (fireAtWill.finalExpectedSuppression <= 0) {
      failures.push("Expected Fire at Will to project positive suppression for infantry fire.");
    } else if (Math.abs(suppressingFire.finalExpectedSuppression - fireAtWill.finalExpectedSuppression * 2) > 0.1) {
      failures.push(
        `Suppressing Fire should double suppression (${fireAtWill.finalExpectedSuppression} -> ${suppressingFire.finalExpectedSuppression}).`
      );
    }

    const result = engine.attackUnit(attacker.hex, defender.hex, "suppressive", attacker.unitId, defender.unitId);
    if (!result) {
      throw new Error("Expected Suppressing Fire attack to resolve.");
    }
    const updatedAttacker = engine.serialize().playerPlacements.find((unit) => unit.unitId === attacker.unitId);
    if (!updatedAttacker) {
      throw new Error("Expected attacker to remain after suppressing fire.");
    }
    if (updatedAttacker.ammo !== attacker.ammo - 2) {
      failures.push(`Suppressing Fire should spend double ammo, expected ${attacker.ammo - 2}, saw ${updatedAttacker.ammo}.`);
    }

    const rangeAttacker = makeUnit("Infantry_42", { q: 1, r: 1 }, {
      unitId: "player-range-assault",
      formationKey: "infantry",
      ammo: 6
    });
    const rangeDefender = makeUnit("Infantry_42", { q: 4, r: 1 }, {
      unitId: "bot-range-assault",
      formationKey: "infantry",
      facing: "NW"
    });
    const rangeEngine = makeEngine(makeState({
      playerPlacements: [rangeAttacker],
      botPlacements: [rangeDefender]
    }));
    let assaultMessage = "";
    try {
      rangeEngine.attackUnit(rangeAttacker.hex, rangeDefender.hex, "assault", rangeAttacker.unitId, rangeDefender.unitId);
    } catch (error) {
      assaultMessage = error instanceof Error ? error.message : String(error);
    }
    if (!/adjacent/i.test(assaultMessage)) {
      failures.push(`Expected non-adjacent assault to be blocked with an adjacency message, saw '${assaultMessage || "<no error>"}'.`);
    }
  });

  await Then("combat orders should preserve fire math except for the intended suppression and ammo changes", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
  });
});

registerTest("UNIT_SYSTEM_AIR_AND_LOGISTICS_READINESS_USES_STATUS_POOLS", async ({ When, Then }) => {
  const failures: string[] = [];

  const expectClose = (label: string, actual: number, expected: number, tolerance = 0.01): void => {
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(`${label} expected ${expected} readiness, saw ${actual}.`);
    }
  };

  const applyDestroyedPlatform = (formationKey: "supplyConvoy" | "medic" | "maintenance"): number => {
    const unit = makeUnit("Supply_Truck", { q: 1, r: 1 }, {
      unitId: `status-${formationKey}`,
      formationKey
    });
    applyDamagePacketToUnit(unit, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 1 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    return summarizeFormationStatus(unit.status, unit.strength).readiness;
  };

  await When("aircraft and logistics formations lose concrete platforms", async () => {
    const fighter = makeUnit("Fighter", { q: 1, r: 1 }, {
      unitId: "status-fighter",
      formationKey: "fighter"
    });
    applyDamagePacketToUnit(fighter, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 1 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    expectClose("fighter squadron one aircraft destroyed", summarizeFormationStatus(fighter.status, fighter.strength).readiness, 91.67);

    expectClose("supply convoy one truck destroyed", applyDestroyedPlatform("supplyConvoy"), 87.5);
    expectClose("medical detachment one vehicle destroyed", applyDestroyedPlatform("medic"), 75);
    expectClose("maintenance section one vehicle destroyed", applyDestroyedPlatform("maintenance"), 83.33);
  });

  await Then("strength should come from each formation's actual platform count", async () => {
    if (failures.length > 0) {
      throw new Error(failures.join(" | "));
    }
  });
});

registerTest("UNIT_SYSTEM_UNESCORTED_BOT_BOMBERS_TRIGGER_CLOSE_FLAK_DEFENSE", async ({ When, Then }) => {
  const targetHex: Axial = { q: 2, r: 1 };
  const botBomber = makeUnit("Bomber", { q: 0, r: 1 }, {
    unitId: "bot-unescorted-bomber",
    formationKey: "bomber"
  });
  const playerTarget = makeUnit("Infantry_42", targetHex, {
    unitId: "player-flak-protected-target",
    formationKey: "infantry"
  });
  const playerFlak = makeUnit("Flak_88", targetHex, {
    unitId: "player-close-flak",
    formationKey: "flakBattery"
  });
  let engagements: ReturnType<GameEngine["consumeAirEngagements"]> = [];
  let flakAmmoAfter = playerFlak.ammo;

  await When("a bot strike resolves without CAP or escort over a hex occupied by player flak", async () => {
    const engine = makeEngine(makeState({
      playerPlacements: [playerTarget, playerFlak],
      botPlacements: [botBomber],
      airMissions: [{
        id: "bot-unescorted-strike-close-flak",
        kind: "strike",
        faction: "Bot",
        unitKey: "bot-unescorted-bomber",
        originHexKey: "0,1",
        unitType: "Bomber",
        status: "resolving",
        launchTurn: 1,
        turnsRemaining: 0,
        targetHex,
        targetUnitKey: "player-flak-protected-target",
        interceptions: 0,
        airCombatDamageInflicted: 0,
        airCombatDamageTaken: 0,
        airCombatKills: 0
      }]
    }));

    (engine as unknown as { resolveReadyAirMissionsForRound: () => void }).resolveReadyAirMissionsForRound();
    engagements = engine.consumeAirEngagements();
    const flakAfter = engine.getHexStackMembers(targetHex, "Player")
      .find((entry) => entry.unitId === "player-close-flak")?.unit;
    flakAmmoAfter = flakAfter?.ammo ?? flakAmmoAfter;
  });

  await Then("close flak should still engage before ordnance release", async () => {
    const airToAirEvent = engagements.find((event) => event.type === "airToAir");
    if (airToAirEvent) {
      throw new Error("Did not expect CAP interception or escort combat in this no-CAP/no-escort strike.");
    }
    const flakEvent = engagements.find((event) => event.type === "flak" && event.missionId === "bot-unescorted-strike-close-flak");
    if (!flakEvent) {
      throw new Error(`Expected a flak event for the unescorted bot bomber, saw ${engagements.map((event) => `${event.type}:${event.missionId ?? "none"}`).join(", ") || "no air events"}.`);
    }
    if (!flakEvent.interceptors.some((entry) => entry.unitKey === "player-close-flak")) {
      throw new Error(`Expected the close player Flak 88 to engage, saw ${JSON.stringify(flakEvent.interceptors)}.`);
    }
    if (flakAmmoAfter !== playerFlak.ammo - 1) {
      throw new Error(`Expected close flak to spend one ammo, saw ${flakAmmoAfter} from starting ${playerFlak.ammo}.`);
    }
  });
});

registerTest("UNIT_SYSTEM_FOLDING_REQUIRES_SAME_TYPE_AND_MERGES_STATUS", async ({ When, Then }) => {
  let sameTypeStrength = 0;
  let mixedResult: ScenarioUnit | null = null;

  await When("folding understrength units in the same hex", async () => {
    const sameTypeEngine = makeEngine(makeState({
      playerPlacements: [
        makeUnit("Infantry_42", { q: 1, r: 1 }, { unitId: "inf-a", strength: 35, formationKey: "infantry" }),
        makeUnit("Infantry_42", { q: 1, r: 1 }, { unitId: "inf-b", strength: 40, formationKey: "infantry" })
      ]
    }));
    const folded = sameTypeEngine.combinePlayerUnits("inf-a", "inf-b");
    sameTypeStrength = folded?.strength ?? 0;

    const mixedEngine = makeEngine(makeState({
      playerPlacements: [
        makeUnit("Infantry_42", { q: 1, r: 1 }, { unitId: "inf-c", strength: 35, formationKey: "infantry" }),
        makeUnit("Engineer", { q: 1, r: 1 }, { unitId: "eng-a", strength: 35, formationKey: "engineer" })
      ]
    }));
    mixedResult = mixedEngine.combinePlayerUnits("inf-c", "eng-a");
  });

  await Then("same-type units can fold together while mixed unit types are rejected", async () => {
    if (sameTypeStrength !== 75) {
      throw new Error(`Expected same-type folding to consolidate to 75 strength, received ${sameTypeStrength}.`);
    }
    if (mixedResult !== null) {
      throw new Error("Expected mixed unit-type folding to be rejected.");
    }
  });
});

registerTest("UNIT_SYSTEM_BATTLE_REQUISITIONS_AND_TRANSPORT_AIRLIFT", async ({ Given, When, Then }) => {
  let airborneArrivalTurn = 0;
  let normalSupplyArrivalTurn = 0;
  let secondAirliftRejected = "";
  let airborneReserveCount = 0;

  await Given("a scenario with one transport flight and in-battle requisition points", async () => {});

  await When("requesting an airborne company and a normal supply shipment", async () => {
    const scenario = makeScenario({
      mainSupplyDistanceTurns: 3,
      allowedBattleRequisitions: ["airborneDetachment", "ammo"]
    });
    const engine = makeEngine(makeState({
      reserves: [
        makeUnit("Transport_Plane", { q: 0, r: 1 }, { unitId: "transport-wing", formationKey: "transportWing" })
      ],
      battleRequisitionPoints: 120,
      battleRequisitionPointsEarned: 120
    }), scenario);

    const airborne = engine.requestBattleRequisition("airborneDetachment");
    if (!airborne.ok) {
      throw new Error(`Expected airborne requisition to succeed, received ${airborne.reason}.`);
    }
    airborneArrivalTurn = airborne.requisition.arrivalTurn;

    const secondAirlift = engine.requestBattleRequisition("ammo", { useTransportAirlift: true });
    secondAirliftRejected = secondAirlift.ok ? "" : secondAirlift.reason;

    const ammo = engine.requestBattleRequisition("ammo");
    if (!ammo.ok) {
      throw new Error(`Expected normal ammo requisition to succeed, received ${ammo.reason}.`);
    }
    normalSupplyArrivalTurn = ammo.requisition.arrivalTurn;

    engine.endTurn();
    airborneReserveCount = engine.serialize().airborneReserves?.filter((unit) => unit.type === "Paratrooper").length ?? 0;
  });

  await Then("transport performs exactly one next-turn airlift while normal supply follows scenario distance", async () => {
    if (airborneArrivalTurn !== 2) {
      throw new Error(`Expected airborne transport arrival on turn 2, received ${airborneArrivalTurn}.`);
    }
    if (normalSupplyArrivalTurn !== 4) {
      throw new Error(`Expected normal supply arrival after 3 turns on turn 4, received ${normalSupplyArrivalTurn}.`);
    }
    if (!secondAirliftRejected.includes("No transport flight")) {
      throw new Error(`Expected second same-turn airlift to be rejected, received "${secondAirliftRejected}".`);
    }
    if (airborneReserveCount !== 1) {
      throw new Error(`Expected one parachute company to arrive in airborne reserves, received ${airborneReserveCount}.`);
    }
  });
});

registerTest("UNIT_SYSTEM_BATTLE_REQUISITION_SCENARIO_PASSIVE_INCOME", async ({ Given, When, Then }) => {
  let openingPoints = 0;
  let nextTurnPoints = 0;

  await Given("a scenario with scripted opening and per-turn requisition income", async () => {});

  await When("the battle advances from turn one to turn two", async () => {
    const scenario = makeScenario({
      battleRequisitionStartingPoints: 25,
      battleRequisitionPointsPerTurn: 25,
      allowedBattleRequisitions: ["ammo", "infantry", "shoreFireControlParty"]
    });
    const engine = makeEngine(makeState(), scenario);

    openingPoints = engine.getBattleRequisitionSnapshot().points;
    engine.endTurn();
    nextTurnPoints = engine.getBattleRequisitionSnapshot().points;
  });

  await Then("the scenario grants its opening pool and passive income every new player turn", async () => {
    if (openingPoints !== 25) {
      throw new Error(`Expected opening battle requisition points to be 25, received ${openingPoints}.`);
    }
    if (nextTurnPoints !== 50) {
      throw new Error(`Expected turn-two battle requisition points to be 50 after passive income, received ${nextTurnPoints}.`);
    }
  });
});

registerTest("UNIT_SYSTEM_ASSAULT_GUNS_USE_PLATFORM_LEVEL_HEAVY_HE_EFFECTS", async ({ Then }) => {
  const assaultGun = unitTypes.Assault_Gun;
  const tank = unitTypes.Light_Tank;
  const defender = unitTypes.Infantry_42;
  const plains = terrain.plains;
  const assaultHe = assaultGun.weaponModel?.groups.find((group) => group.id === "assault-gun-he");
  const tankHe = tank.weaponModel?.groups.find((group) => group.id === "light-tank-he");

  const makeState = (definition: typeof assaultGun): UnitCombatState => ({
    unit: definition,
    strength: 100,
    experience: definition.baseExperience ?? 0,
    general: { accBonus: 0, dmgBonus: 0 }
  });
  const makeRequest = (definition: typeof assaultGun): AttackRequest => ({
    attacker: makeState(definition),
    defender: makeState(defender),
    attackerCtx: { hex: { q: 0, r: 1 } },
    defenderCtx: {
      terrain: plains,
      class: defender.class,
      facing: "NW",
      hex: { q: 1, r: 1 },
      fortified: true
    },
    targetFacing: "NW",
    isSoftTarget: true
  });

  const assault = resolveAttack(makeRequest(assaultGun));
  const tankResult = resolveAttack(makeRequest(tank));

  await Then("assault guns trade accuracy for heavier per-platform HE without requiring higher total company suppression", async () => {
    if (!(assault.accuracy < tankResult.accuracy)) {
      throw new Error(`Expected assault gun accuracy ${assault.accuracy} to be below tank accuracy ${tankResult.accuracy}.`);
    }
    if (!assaultHe || !tankHe) {
      throw new Error("Missing assault-gun or tank HE weapon groups.");
    }
    if ((assaultHe.suppressionPerHit ?? 0) <= (tankHe.suppressionPerHit ?? 0)) {
      throw new Error(
        `Assault-gun HE should suppress more per hit than tank HE (${assaultHe.suppressionPerHit} vs ${tankHe.suppressionPerHit}).`
      );
    }
    if ((assaultHe.fortificationDamagePerHit ?? 0) <= (tankHe.fortificationDamagePerHit ?? 0)) {
      throw new Error(
        `Assault-gun HE should damage fortifications more per hit than tank HE (${assaultHe.fortificationDamagePerHit} vs ${tankHe.fortificationDamagePerHit}).`
      );
    }
    if (!(assault.expectedSuppression < tankResult.expectedSuppression)) {
      throw new Error(
        `Six assault guns should not be forced above a twenty-tank company's total suppression (${assault.expectedSuppression} vs ${tankResult.expectedSuppression}).`
      );
    }
  });
});

registerTest("UNIT_SYSTEM_COMBAT_DEGRADES_FORTIFICATION_INTEGRITY", async ({ When, Then }) => {
  let integrityAfterAttack = 100;
  let damageState: string | null = null;

  await When("an assault gun attacks a fortified enemy hex", async () => {
    const attacker = makeUnit("Assault_Gun", { q: 1, r: 1 }, { unitId: "assault-gun", formationKey: "assaultGunBattalion" });
    const defender = makeUnit("Infantry_42", { q: 2, r: 1 }, { unitId: "fortified-infantry", formationKey: "infantry", facing: "NW" });
    const engine = makeEngine(makeState({
      playerPlacements: [attacker],
      botPlacements: [defender],
      hexModifications: [{
        type: "fortifications",
        hex: { q: 2, r: 1 },
        faction: "Bot",
        facing: "W",
        integrity: 100,
        maxIntegrity: 100,
        damageState: "intact"
      }]
    }));

    const result = engine.attackUnit(attacker.hex, defender.hex, undefined, "assault-gun", "fortified-infantry");
    if (!result) {
      throw new Error("Expected assault gun attack against fortified infantry to resolve.");
    }
    const [fortification] = engine.serialize().hexModifications ?? [];
    integrityAfterAttack = fortification?.integrity ?? 100;
    damageState = fortification?.damageState ?? null;
  });

  await Then("the fortification records structural damage", async () => {
    if (!(integrityAfterAttack < 100)) {
      throw new Error(`Expected fortification integrity to fall below 100, received ${integrityAfterAttack}.`);
    }
    if (damageState === "intact" || damageState === null) {
      throw new Error(`Expected fortification damage state to change, received ${String(damageState)}.`);
    }
  });
});

registerTest("UNIT_SYSTEM_STATUS_DAMAGE_DRIVES_PREVIEW_RESOLUTION_AND_REPORTS", async ({ When, Then }) => {
  let previewRetaliationReadiness = 0;
  let resolutionRetaliationReadiness = 0;
  let retaliationExpectedDamage = 0;
  let attackerStrengthAfter = 0;
  let reportRetaliationDamage = 0;
  let reportRetaliationSummary = "";

  await When("a Flak 88 battery fires on adjacent infantry that can return fire", async () => {
    const attacker = makeUnit("Flak_88", { q: 1, r: 1 }, {
      unitId: "player-flak",
      formationKey: "flakBattery",
      facing: "NE"
    });
    const defender = makeUnit("Infantry_42", { q: 2, r: 1 }, {
      unitId: "bot-infantry",
      formationKey: "infantry",
      entrench: 2,
      facing: "SE"
    });
    const engine = makeEngine(makeState({
      playerPlacements: [attacker],
      botPlacements: [defender],
      enemyContactStates: [{
        unitId: "bot-infantry",
        state: "visible",
        lastSeenTurn: 1,
        lastKnownHex: { q: 2, r: 1 },
        lastKnownStrength: 100,
        knownUnitType: "Infantry_42",
        source: "test"
      }]
    }));

    const preview = engine.previewAttack(attacker.hex, defender.hex, undefined, "player-flak", "bot-infantry");
    if (!preview?.projectedRetaliationDamage) {
      throw new Error("Expected preview to include status-pool retaliation damage.");
    }
    previewRetaliationReadiness = preview.projectedRetaliationDamage.readinessLoss;

    const result = engine.attackUnit(attacker.hex, defender.hex, undefined, "player-flak", "bot-infantry");
    if (!result?.retaliationDamage) {
      throw new Error("Expected attack resolution to include status-pool retaliation damage.");
    }
    resolutionRetaliationReadiness = result.retaliationDamage.readinessLoss;
    retaliationExpectedDamage = result.retaliationResult?.expectedDamage ?? 0;
    attackerStrengthAfter = result.attackerRemainingStrength ?? -1;

    const reports = engine.getCombatReports();
    const report = reports[reports.length - 1];
    reportRetaliationDamage = report?.retaliation?.damage ?? -1;
    reportRetaliationSummary = report?.retaliation?.statusSummary ?? "";
  });

  await Then("preview, live resolution, combat reports, and visible strength all use the same status-pool damage", async () => {
    if (previewRetaliationReadiness !== resolutionRetaliationReadiness) {
      throw new Error(`Expected preview retaliation readiness ${previewRetaliationReadiness} to match resolution ${resolutionRetaliationReadiness}.`);
    }
    if (reportRetaliationDamage !== resolutionRetaliationReadiness) {
      throw new Error(`Expected combat report retaliation damage ${reportRetaliationDamage} to match resolution ${resolutionRetaliationReadiness}.`);
    }
    if (attackerStrengthAfter !== 100 - resolutionRetaliationReadiness) {
      throw new Error(`Expected attacker strength ${attackerStrengthAfter} to reflect retaliation readiness loss ${resolutionRetaliationReadiness}.`);
    }
    if (!(retaliationExpectedDamage > 0)) {
      throw new Error("Expected retaliation expectedDamage to remain a positive combat estimate.");
    }
    if (!/readiness -\d+/.test(reportRetaliationSummary)) {
      throw new Error(`Expected combat report to carry a status summary, saw '${reportRetaliationSummary}'.`);
    }
  });
});

registerTest("UNIT_SYSTEM_BOT_ATTACK_REPORTS_STATUS_POOL_DAMAGE", async ({ When, Then }) => {
  let summaryDamage = "";
  let summaryRetaliation = "";
  let reportDamage = 0;
  let reportSummary = "";

  await When("the bot attacks during its turn", async () => {
    const player = makeUnit("Flak_88", { q: 1, r: 1 }, {
      unitId: "player-flak",
      formationKey: "flakBattery",
      facing: "NE"
    });
    const bot = makeUnit("Infantry_42", { q: 2, r: 1 }, {
      unitId: "bot-infantry",
      formationKey: "infantry",
      facing: "SW"
    });
    const engine = makeEngine(makeState({
      playerPlacements: [player],
      botPlacements: [bot]
    }));

    engine.endTurn();
    const botSummary = engine.consumeBotTurnSummary();
    const attack = botSummary?.attacks[0];
    if (!attack) {
      throw new Error("Expected adjacent bot infantry to attack.");
    }
    summaryDamage = attack.damageSummary ?? "";
    summaryRetaliation = attack.retaliation?.summary ?? "";

    const reports = engine.getCombatReports();
    const report = reports[reports.length - 1];
    reportDamage = report?.attackResult.damage ?? -1;
    reportSummary = report?.attackResult.statusSummary ?? "";
  });

  await Then("the bot summary and combat report carry actual status-pool effects", async () => {
    if (!/readiness -\d+/.test(summaryDamage)) {
      throw new Error(`Expected bot attack summary to include status effects, saw '${summaryDamage}'.`);
    }
    if (summaryRetaliation && !/readiness -\d+/.test(summaryRetaliation)) {
      throw new Error(`Expected bot retaliation summary to include status effects, saw '${summaryRetaliation}'.`);
    }
    if (reportDamage < 0 || !/readiness -\d+/.test(reportSummary)) {
      throw new Error(`Expected combat report to use status damage, saw damage=${reportDamage}, summary='${reportSummary}'.`);
    }
  });
});
