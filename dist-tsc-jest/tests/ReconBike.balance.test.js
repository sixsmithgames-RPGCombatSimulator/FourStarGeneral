import { registerTest } from "./harness.js";
import { resolveAttack } from "../src/core/Combat";
import { isSoftCombatTarget, resolveWeaponHitDistribution } from "../src/core/armorEffects";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { applyDamagePacketToUnit, resolveDamagePacket, summarizeFormationStatus } from "../src/data/unitSystem/damagePackets";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const unitTypes = unitTypesData;
function makeUnitState(typeKey) {
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
function makeScenarioUnit(typeKey, hex, id) {
    const definition = unitTypes[typeKey];
    if (!definition) {
        throw new Error(`Missing unit type '${typeKey}' for recon bike packet test.`);
    }
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
        facing: "SE",
        unitId: id,
        status: createInitialFormationStatus(typeKey)
    };
}
function makeSoftTargetRequest(attackerType, options) {
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
            facing: "SE",
            hex: { q: 0, r: 1 },
            isRushing: options?.stance === "assault",
            isSpottedOnly: false,
            stance: options?.stance === "assault" ? "assault" : undefined
        },
        targetFacing: "SE",
        isSoftTarget: true
    };
}
function makeReconBikeTargetRequest(options) {
    return {
        attacker: makeUnitState("Infantry_42"),
        defender: makeUnitState("Recon_Bike"),
        attackerCtx: {
            hex: { q: 0, r: 0 },
            stance: options?.stance
        },
        defenderCtx: {
            terrain: plains,
            class: "recon",
            facing: "SE",
            hex: { q: 0, r: 1 },
            isRushing: false,
            isSpottedOnly: false,
            stance: undefined
        },
        targetFacing: "SE",
        isSoftTarget: isSoftCombatTarget(unitTypes.Recon_Bike)
    };
}
function resolvePacketForRequest(attackerType, defenderType, request) {
    const attacker = makeScenarioUnit(attackerType, request.attackerCtx.hex, `${attackerType}-packet-attacker`);
    const defender = makeScenarioUnit(defenderType, request.defenderCtx.hex, `${defenderType}-packet-defender`);
    const result = resolveAttack(request);
    return resolveDamagePacket({
        attacker,
        attackerDefinition: unitTypes[attackerType],
        attackerHex: attacker.hex,
        defender,
        defenderDefinition: unitTypes[defenderType],
        defenderHex: defender.hex,
        attackResult: result,
        targetFacing: defender.facing
    });
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
        throw new Error(`Expected recon bike and infantry to share the same direct-fire range band, received bike ${reconBikeDef.rangeMin}-${reconBikeDef.rangeMax} vs infantry ${infantryDef.rangeMin}-${infantryDef.rangeMax}.`);
    }
    if (reconBikeSuppressive.accuracy >= infantryAttack.accuracy) {
        throw new Error(`Expected recon bike suppressive fire to stay less accurate than infantry at the same range, received bike ${reconBikeSuppressive.accuracy}% vs infantry ${infantryAttack.accuracy}%.`);
    }
    if (reconBikeSuppressive.expectedDamage >= infantryAttack.expectedDamage) {
        throw new Error(`Expected recon bike suppressive fire to stay below infantry expected damage, received bike ${reconBikeSuppressive.expectedDamage} vs infantry ${infantryAttack.expectedDamage}.`);
    }
    if (reconBikeAssault.expectedDamage <= reconBikeSuppressive.expectedDamage) {
        throw new Error(`Expected recon bike assault to outperform its suppressive fire, received assault ${reconBikeAssault.expectedDamage} vs suppressive ${reconBikeSuppressive.expectedDamage}.`);
    }
    await Then("recon bikes stay close-range scouts rather than outperforming line infantry in standard fire", () => { });
});
registerTest("LIGHT_ARMOR_DAMPENS_SMALL_ARMS_DAMAGE_WITHOUT_NULLIFYING_IT", async ({ Then }) => {
    const infantryDef = unitTypes.Infantry_42;
    const reconBikeDef = unitTypes.Recon_Bike;
    const armoredReconDef = unitTypes.Recon_ArmoredCar;
    if (!infantryDef || !reconBikeDef || !armoredReconDef) {
        throw new Error("Expected infantry, motorcycle recon, and armored recon definitions for target classification checks.");
    }
    const rifleGroup = infantryDef.weaponModel?.groups.find((group) => group.id === "rifle-squads");
    if (!rifleGroup?.hitDistribution) {
        throw new Error("Expected the infantry rifle group to expose authored target distributions.");
    }
    const infantryVsReconBikeRequest = makeReconBikeTargetRequest({ stance: "assault" });
    const infantryVsReconBike = resolveAttack(infantryVsReconBikeRequest);
    const infantryVsReconBikePacket = resolvePacketForRequest("Infantry_42", "Recon_Bike", infantryVsReconBikeRequest);
    if (!(infantryVsReconBike.damagePerHit > 0) || !(infantryVsReconBike.expectedDamage > 0)) {
        throw new Error(`Expected light armor to reduce infantry damage instead of nullifying it, received damagePerHit=${infantryVsReconBike.damagePerHit}, expectedDamage=${infantryVsReconBike.expectedDamage}.`);
    }
    if (infantryVsReconBike.expectedDamage > infantryVsReconBikeRequest.defender.strength) {
        throw new Error(`Expected recon readiness estimate to stay within remaining strength, received ${infantryVsReconBike.expectedDamage}.`);
    }
    if (infantryVsReconBikePacket.readinessLoss <= 0 || infantryVsReconBikePacket.readinessLoss > 100) {
        throw new Error(`Expected bounded, nonzero detailed recon damage, received ${infantryVsReconBikePacket.readinessLoss}.`);
    }
    if (!isSoftCombatTarget(reconBikeDef)) {
        throw new Error("Recon Bike patrols must use soft-target attack values because riders lack enclosed armor.");
    }
    if (isSoftCombatTarget(armoredReconDef)) {
        throw new Error("Armored recon cars must remain protected hard targets.");
    }
    const reconDistribution = resolveWeaponHitDistribution(rifleGroup, reconBikeDef);
    if (JSON.stringify(reconDistribution) !== JSON.stringify(rifleGroup.hitDistribution.vsArtillery)) {
        throw new Error(`Expected exposed recon distribution, received ${JSON.stringify(reconDistribution)}.`);
    }
    if (reconDistribution.penetrating >= rifleGroup.hitDistribution.vsInfantry.penetrating) {
        throw new Error("Motorcycle patrols should retain more contact protection than dismounted infantry.");
    }
    await Then("light armor trims small-arms lethality without making bike units immune", () => { });
});
registerTest("RECON_PLATFORM_DAMAGE_CHANNELS_CANNOT_MASK_NEW_CASUALTIES", async ({ Given, When, Then }) => {
    const defender = makeScenarioUnit("Recon_Bike", { q: 2, r: 1 }, "damaged-recon-readiness-target");
    let equipmentOnlyReadiness = 0;
    let readinessAfterPersonnelCasualty = 0;
    await Given("a recon patrol whose motorcycle losses already set the formation readiness floor", () => {
        applyDamagePacketToUnit(defender, {
            personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
            equipment: { damaged: 0, disabled: 2, destroyed: 0 },
            suppression: 0,
            fortificationDamage: 0,
            readinessLoss: 0,
            weaponHits: []
        });
        equipmentOnlyReadiness = summarizeFormationStatus(defender.status, defender.strength).readiness;
    });
    await When("one additional scout becomes injured", () => {
        applyDamagePacketToUnit(defender, {
            personnel: { injured: 1, wounded: 0, severelyWounded: 0, killed: 0 },
            equipment: { damaged: 0, disabled: 0, destroyed: 0 },
            suppression: 0,
            fortificationDamage: 0,
            readinessLoss: 0,
            weaponHits: []
        });
        readinessAfterPersonnelCasualty = summarizeFormationStatus(defender.status, defender.strength).readiness;
    });
    await Then("the recorded casualty causes additional readiness loss instead of being hidden by motorcycle status", () => {
        if (Math.abs(equipmentOnlyReadiness - 88.89) > 0.01) {
            throw new Error(`Expected two disabled bikes to leave 88.89 readiness, received ${equipmentOnlyReadiness}.`);
        }
        if (readinessAfterPersonnelCasualty >= equipmentOnlyReadiness) {
            throw new Error(`A newly injured scout must reduce readiness below the existing equipment floor (${equipmentOnlyReadiness} -> ${readinessAfterPersonnelCasualty}).`);
        }
    });
});
registerTest("RANGED_INFANTRY_CONTACTS_DAMAGE_AN_ALREADY_DAMAGED_RECON_PATROL", async ({ Given, When, Then }) => {
    const attackerHex = { q: 0, r: 0 };
    const defenderHex = { q: 2, r: 1 };
    const attacker = makeScenarioUnit("Infantry_42", attackerHex, "ranged-infantry-recon-attacker");
    const defender = makeScenarioUnit("Recon_Bike", defenderHex, "ranged-damaged-recon-target");
    let result;
    let packet;
    await Given("a damaged motorcycle patrol engaged by a full infantry battalion at range three", () => {
        applyDamagePacketToUnit(defender, {
            personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
            equipment: { damaged: 0, disabled: 2, destroyed: 0 },
            suppression: 0,
            fortificationDamage: 0,
            readinessLoss: 0,
            weaponHits: []
        });
    });
    await When("the deterministic attack and detailed damage packet are resolved", () => {
        const request = {
            attacker: makeUnitState("Infantry_42"),
            defender: { ...makeUnitState("Recon_Bike"), strength: defender.strength },
            attackerCtx: { hex: attackerHex },
            defenderCtx: {
                terrain: plains,
                class: "recon",
                facing: defender.facing,
                hex: defenderHex,
                isRushing: false,
                isSpottedOnly: false
            },
            targetFacing: defender.facing,
            isSoftTarget: true
        };
        result = resolveAttack(request);
        packet = resolveDamagePacket({
            attacker,
            attackerDefinition: unitTypes.Infantry_42,
            attackerHex,
            defender,
            defenderDefinition: unitTypes.Recon_Bike,
            defenderHex,
            attackResult: result,
            targetFacing: defender.facing
        });
    });
    await Then("physical contacts translate into multiple scout casualties and measurable readiness loss", () => {
        const personnelEffects = packet.personnel.injured + packet.personnel.wounded + packet.personnel.severelyWounded + packet.personnel.killed;
        if (result.expectedHits < 5) {
            throw new Error(`The regression requires meaningful physical contacts, received ${result.expectedHits.toFixed(2)}.`);
        }
        if (personnelEffects < 3) {
            throw new Error(`Expected exposed recon contacts to affect multiple scouts, received ${personnelEffects}.`);
        }
        if (packet.readinessLoss <= 0) {
            throw new Error(`Expected nonzero readiness loss for ${personnelEffects} personnel effects, received ${packet.readinessLoss}.`);
        }
    });
});
