import { registerTest } from "./harness.js";
import { GameEngine } from "../src/game/GameEngine";
// Inline terrain and unit definitions to keep the test deterministic and self-contained
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const terrain = { plains };
const fighterDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
    movement: 5,
    moveType: "air",
    vision: 4,
    ammo: 6,
    fuel: 50,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 6,
    armor: { front: 5, side: 4, top: 4 },
    hardAttack: 12,
    softAttack: 18,
    ap: 6,
    accuracyBase: 64,
    traits: ["skirmish"],
    cost: 320,
    airSupport: { roles: ["escort", "cap", "strike"], cruiseSpeedKph: 540, combatRadiusKm: 250, refitTurns: 1 }
};
const bomberDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
    movement: 1,
    moveType: "air",
    vision: 4,
    ammo: 4,
    fuel: 60,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 1,
    armor: { front: 10, side: 10, top: 10 },
    hardAttack: 16,
    softAttack: 45,
    ap: 8,
    accuracyBase: 55,
    traits: ["indirect", "carpet"],
    cost: 380,
    airSupport: { roles: ["strike"], cruiseSpeedKph: 450, combatRadiusKm: 200, refitTurns: 2 }
};
const infantryDef = {
    class: "infantry",
    combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
    movement: 1,
    moveType: "leg",
    vision: 2,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 3,
    armor: { front: 1, side: 1, top: 1 },
    hardAttack: 2,
    softAttack: 8,
    ap: 1,
    accuracyBase: 55,
    traits: [],
    cost: 80
};
const unitTypes = {
    Fighter: fighterDef,
    Bomber: bomberDef,
    Infantry_42: infantryDef
};
function side() {
    return { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}
function scenario() {
    const tileKey = "plains";
    const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
    return {
        name: "Layered Interception",
        size: { cols: 3, rows: 3 },
        tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
        tiles: [row, row, row],
        objectives: [],
        turnLimit: 5,
        sides: { Player: side(), Bot: side() }
    };
}
function make(type, hex) {
    return {
        type: type,
        hex,
        strength: 100,
        experience: 0,
        ammo: unitTypes[type].ammo ?? 6,
        fuel: unitTypes[type].fuel ?? 50,
        entrench: 0,
        facing: "NW"
    };
}
registerTest("AIR_INTERCEPTION_LAYERED_ESCORTS_ABSORB_CAP", async ({ Given, When, Then }) => {
    let engine;
    await Given("a bomber with two escorts attacking a hex covered by two CAP flights", async () => {
        const config = {
            scenario: scenario(),
            unitTypes,
            terrain,
            playerSide: side(),
            botSide: side()
        };
        engine = new GameEngine(config);
        // Deploy player bomber plus a ground spotter so the seeded defender becomes a legal contact.
        engine.beginDeployment();
        const bomber = make("Bomber", { q: 0, r: 0 });
        const playerSpotter = make("Infantry_42", { q: 1, r: 1 });
        bomber.unitId = "u_bomber";
        bomber.preDeployed = true;
        playerSpotter.preDeployed = true;
        engine.initializeFromAllocations([bomber, playerSpotter]);
        engine.setBaseCamp({ q: 0, r: 0 });
        engine.finalizeDeployment();
        engine.startPlayerTurnPhase();
        // Seed bot defender and two CAP fighters
        const botDef = make("Infantry_42", { q: 0, r: 1 });
        engine.botPlacements.set("0,1", botDef);
        const cap1 = make("Fighter", { q: 0, r: 2 });
        cap1.unitId = "u_cap1";
        const cap2 = make("Fighter", { q: 1, r: 2 });
        cap2.unitId = "u_cap2";
        engine.botPlacements.set("0,2", cap1);
        engine.botPlacements.set("1,2", cap2);
        // Seed two player escorts for the bomber
        const esc1 = make("Fighter", { q: 0, r: -1 });
        esc1.unitId = "u_esc1";
        const esc2 = make("Fighter", { q: 1, r: -1 });
        esc2.unitId = "u_esc2";
        engine.playerPlacements.set("0,-1", esc1);
        engine.playerPlacements.set("1,-1", esc2);
        // Register in-flight missions: two CAP over 0,1; two escorts tied to 0,0 bomber
        engine.scheduledAirMissions.set("cap1", {
            id: "cap1",
            template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
            faction: "Bot",
            unitKey: "u_cap1",
            unitType: "Fighter",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: { q: 0, r: 1 },
            escortTargetUnitKey: undefined,
            interceptions: 0
        });
        engine.scheduledAirMissions.set("cap2", {
            id: "cap2",
            template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
            faction: "Bot",
            unitKey: "u_cap2",
            unitType: "Fighter",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: { q: 0, r: 1 },
            escortTargetUnitKey: undefined,
            interceptions: 0
        });
        engine.scheduledAirMissions.set("esc1", {
            id: "esc1",
            template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
            faction: "Player",
            unitKey: "u_esc1",
            unitType: "Fighter",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: undefined,
            escortTargetUnitKey: "u_bomber",
            interceptions: 0
        });
        engine.scheduledAirMissions.set("esc2", {
            id: "esc2",
            template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
            faction: "Player",
            unitKey: "u_esc2",
            unitType: "Fighter",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: undefined,
            escortTargetUnitKey: "u_bomber",
            interceptions: 0
        });
    });
    let _result = null;
    let engagements = [];
    await When("the bomber attacks the defended hex triggering layered interceptions", async () => {
        _result = engine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
        engagements = engine.consumeAirEngagements();
    });
    await Then("both escorts and both CAP flights participate, and each mission records exactly one interception", async () => {
        // Validate event emission with both sides represented
        if (engagements.length !== 1) {
            throw new Error(`Expected one air engagement event, saw ${engagements.length}`);
        }
        const evt = engagements[0];
        if (evt.interceptors.length !== 2 || evt.escorts.length !== 2) {
            throw new Error(`Expected 2 interceptors and 2 escorts, saw ${evt.interceptors.length} and ${evt.escorts.length}`);
        }
        const cap1 = engine.scheduledAirMissions.get("cap1");
        const cap2 = engine.scheduledAirMissions.get("cap2");
        const esc1 = engine.scheduledAirMissions.get("esc1");
        const esc2 = engine.scheduledAirMissions.get("esc2");
        if (!cap1 || !cap2 || !esc1 || !esc2) {
            throw new Error("Scheduled missions missing after interception resolution");
        }
        if (cap1.interceptions !== 1 || cap2.interceptions !== 1) {
            throw new Error(`CAP missions should each record one interception, got cap1=${cap1.interceptions}, cap2=${cap2.interceptions}`);
        }
        if (esc1.interceptions !== 1 || esc2.interceptions !== 1) {
            throw new Error(`Escort missions should each record one engagement, got esc1=${esc1.interceptions}, esc2=${esc2.interceptions}`);
        }
    });
});
registerTest("AIR_INTERCEPTION_ESCORT_REPORTS_SUCCESS_AFTER_ENGAGING_INTERCEPTORS", async ({ Given, When, Then }) => {
    let engine;
    let outcome = null;
    await Given("an escort mission that already fought but lost track of its protected bomber", async () => {
        const config = {
            scenario: scenario(),
            unitTypes,
            terrain,
            playerSide: side(),
            botSide: side()
        };
        engine = new GameEngine(config);
    });
    await When("the escort mission resolves after recording an interception", async () => {
        outcome = engine.resolveEscortMission({
            id: "esc-report",
            template: {
                kind: "escort",
                label: "Escort",
                description: "",
                allowedRoles: ["escort"],
                requiresTarget: false,
                requiresFriendlyEscortTarget: true,
                durationTurns: 1
            },
            faction: "Player",
            unitKey: "u_esc1",
            unitType: "Fighter",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            escortTargetUnitKey: "u_bomber",
            interceptions: 1,
            airCombatDamageInflicted: 19,
            airCombatDamageTaken: 4,
            airCombatKills: 1
        });
    });
    await Then("the mission should report a successful escort action instead of an abort", async () => {
        const escortOutcome = outcome;
        if (escortOutcome.result !== "success") {
            throw new Error(`Expected escort mission to resolve successfully after combat, saw ${escortOutcome.result ?? "<missing>"}.`);
        }
        if (escortOutcome.interceptions !== 1) {
            throw new Error(`Expected escort mission to preserve its interception count, saw ${escortOutcome.interceptions ?? "<missing>"}.`);
        }
        if (escortOutcome.meta?.interceptorAttrition !== 19) {
            throw new Error(`Expected escort mission to preserve interceptor attrition, saw ${escortOutcome.meta?.interceptorAttrition ?? "<missing>"}.`);
        }
        if (escortOutcome.meta?.escortAttrition !== 4) {
            throw new Error(`Expected escort mission to preserve escort attrition, saw ${escortOutcome.meta?.escortAttrition ?? "<missing>"}.`);
        }
        if (escortOutcome.meta?.interceptorKills !== 1) {
            throw new Error(`Expected escort mission to preserve interceptor kills, saw ${escortOutcome.meta?.interceptorKills ?? "<missing>"}.`);
        }
    });
});
registerTest("AIR_INTERCEPTION_ESCORT_REPORTS_SUCCESS_FROM_RESOLVED_PACKAGE_STATE_WHEN_FLAK_KILLS_THE_BOMBER", async ({ Given, When, Then }) => {
    let engine;
    let outcome = null;
    await Given("an escort mission whose linked strike package was already resolved and destroyed by flak", async () => {
        const config = {
            scenario: scenario(),
            unitTypes,
            terrain,
            playerSide: side(),
            botSide: side()
        };
        engine = new GameEngine(config);
        engine.resolvedEscortMissionStateByMissionId.set("esc-report-flak", {
            missionId: "esc-report-flak",
            unitKey: "u_esc1",
            unitType: "Fighter",
            unitLabel: "Fighter @ 1,4",
            protectedUnitKey: "u_bomber",
            protectedUnitLabel: "Bomber @ 0,4",
            engaged: false,
            interceptions: 0,
            interceptorAttrition: 0,
            escortAttrition: 0,
            interceptorKills: 0,
            escortDestroyed: false,
            packageDestroyedBeforeTarget: true,
            packageDestroyedCause: "flak"
        });
    });
    await When("the escort mission resolves after the package was lost before release", async () => {
        outcome = engine.resolveEscortMission({
            id: "esc-report-flak",
            template: {
                kind: "escort",
                label: "Escort",
                description: "",
                allowedRoles: ["escort"],
                requiresTarget: false,
                requiresFriendlyEscortTarget: true,
                durationTurns: 1
            },
            faction: "Bot",
            unitKey: "u_esc1",
            unitType: "Fighter",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            escortTargetUnitKey: "u_bomber",
            interceptions: 0,
            airCombatDamageInflicted: 0,
            airCombatDamageTaken: 0,
            airCombatKills: 0
        });
    });
    await Then("the escort should still resolve successfully instead of aborting", async () => {
        const escortOutcome = outcome;
        if (escortOutcome.result !== "success") {
            throw new Error(`Expected escort mission to resolve successfully from package state, saw ${escortOutcome.result ?? "<missing>"}.`);
        }
        if (escortOutcome.interceptions !== 0) {
            throw new Error(`Expected escort mission to preserve zero direct interceptions, saw ${escortOutcome.interceptions ?? "<missing>"}.`);
        }
        if (!String(escortOutcome.details ?? "").includes("destroyed by anti-aircraft fire")) {
            throw new Error(`Expected escort details to explain the flak loss, saw ${escortOutcome.details ?? "<missing>"}.`);
        }
    });
});
registerTest("AIR_INTERCEPTION_BOMBER_TURRETS_RETURN_FIRE_WITHOUT_REUSING_GROUND_ORDNANCE", async ({ Given, When, Then }) => {
    let engine;
    let engagements = [];
    await Given("a bomber with a dedicated turret profile attacking through one CAP interceptor", async () => {
        const interceptorDef = {
            ...fighterDef,
            airCombat: {
                attack: {
                    accuracyBase: 74,
                    hardAttack: 18,
                    softAttack: 18,
                    ap: 6,
                    rangeMin: 1,
                    rangeMax: 2,
                    combat: { category: "air", weight: "light", role: "normal", signature: "small" },
                    shotsScalar: 1.1,
                    damageScalar: 2.5,
                    suppressionScalar: 2.5
                }
            }
        };
        const turretBomberDef = {
            ...bomberDef,
            airCombat: {
                turret: {
                    accuracyBase: 78,
                    hardAttack: 14,
                    softAttack: 14,
                    ap: 3,
                    rangeMin: 1,
                    rangeMax: 2,
                    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
                    shotsScalar: 1.2,
                    damageScalar: 1.6,
                    suppressionScalar: 1.1
                }
            }
        };
        const config = {
            scenario: scenario(),
            unitTypes: {
                Bomber: turretBomberDef,
                Interceptor: interceptorDef,
                Infantry_42: infantryDef
            },
            terrain,
            playerSide: side(),
            botSide: side()
        };
        engine = new GameEngine(config);
        engine.beginDeployment();
        const bomber = {
            type: "Bomber",
            hex: { q: 0, r: 0 },
            strength: 100,
            experience: 0,
            ammo: turretBomberDef.ammo ?? 4,
            fuel: turretBomberDef.fuel ?? 60,
            entrench: 0,
            facing: "NW",
            unitId: "u_bomber"
        };
        const playerSpotter = make("Infantry_42", { q: 1, r: 1 });
        bomber.preDeployed = true;
        playerSpotter.preDeployed = true;
        engine.initializeFromAllocations([bomber, playerSpotter]);
        engine.setBaseCamp({ q: 0, r: 0 });
        engine.finalizeDeployment();
        engine.startPlayerTurnPhase();
        const botDef = make("Infantry_42", { q: 0, r: 1 });
        engine.botPlacements.set("0,1", botDef);
        const cap = {
            type: "Interceptor",
            hex: { q: 0, r: 2 },
            strength: 100,
            experience: 0,
            ammo: interceptorDef.ammo ?? 6,
            fuel: interceptorDef.fuel ?? 50,
            entrench: 0,
            facing: "NW",
            unitId: "u_cap"
        };
        engine.botPlacements.set("0,2", cap);
        engine.scheduledAirMissions.set("cap", {
            id: "cap",
            template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
            faction: "Bot",
            unitKey: "u_cap",
            unitType: "Interceptor",
            status: "inFlight",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: { q: 0, r: 1 },
            escortTargetUnitKey: undefined,
            interceptions: 0
        });
    });
    await When("the bomber attacks through that interception layer", async () => {
        engine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
        engagements = engine.consumeAirEngagements();
    });
    await Then("the resulting air event should include interceptor attrition from turret fire", async () => {
        const evt = engagements.find((entry) => entry.type === "airToAir");
        if (!evt) {
            throw new Error("Expected an air-to-air engagement event for the CAP interception.");
        }
        if ((evt.interceptorAttrition ?? 0) <= 0) {
            throw new Error(`Expected bomber turret fire to inflict interceptor attrition, saw ${evt.interceptorAttrition ?? 0}.`);
        }
    });
});
registerTest("AIR_INTERCEPTION_AIR_SUPERIORITY_CLASHES_CAP_AT_ROUGHLY_HALF_STRENGTH_WHILE_BOMBER_ATTACKS_STAY_LETHAL", async ({ Given, When, Then }) => {
    let engine;
    let escortVsInterceptorDamage = 0;
    let interceptorVsBomberDamage = 0;
    await Given("an escort/interceptor matchup with extreme dogfight values plus a bomber target", async () => {
        const airSuperiorityDef = {
            ...fighterDef,
            accuracyBase: 78,
            hardAttack: 28,
            softAttack: 28,
            airSupport: { roles: ["escort", "cap"], cruiseSpeedKph: 560, combatRadiusKm: 250, refitTurns: 1 },
            airCombat: {
                attack: {
                    accuracyBase: 88,
                    hardAttack: 36,
                    softAttack: 36,
                    ap: 10,
                    rangeMin: 1,
                    rangeMax: 2,
                    combat: { category: "air", weight: "light", role: "normal", signature: "small" },
                    shotsScalar: 1.8,
                    damageScalar: 3.6,
                    suppressionScalar: 3.6
                }
            }
        };
        const strikerDef = {
            ...bomberDef,
            airCombat: {
                turret: {
                    accuracyBase: 10,
                    hardAttack: 1,
                    softAttack: 1,
                    ap: 0,
                    rangeMin: 1,
                    rangeMax: 2,
                    combat: { category: "air", weight: "light", role: "normal", signature: "large" },
                    shotsScalar: 0,
                    damageScalar: 0,
                    suppressionScalar: 0
                }
            }
        };
        const config = {
            scenario: scenario(),
            unitTypes: {
                Fighter: airSuperiorityDef,
                Interceptor: airSuperiorityDef,
                Bomber: strikerDef,
                Infantry_42: infantryDef
            },
            terrain,
            playerSide: side(),
            botSide: side()
        };
        engine = new GameEngine(config);
    });
    await When("air-superiority flights and strike aircraft resolve their direct air-combat rolls", async () => {
        escortVsInterceptorDamage = engine.resolveAirCombatDamage("Bot", {
            type: "Fighter",
            hex: { q: 0, r: 0 },
            strength: 100,
            experience: 0,
            ammo: 6,
            fuel: 50,
            entrench: 0,
            facing: "NW"
        }, {
            type: "Interceptor",
            hex: { q: 0, r: 1 },
            strength: 100,
            experience: 0,
            ammo: 6,
            fuel: 50,
            entrench: 0,
            facing: "NW"
        }, "attack");
        interceptorVsBomberDamage = engine.resolveAirCombatDamage("Player", {
            type: "Interceptor",
            hex: { q: 0, r: 0 },
            strength: 100,
            experience: 0,
            ammo: 6,
            fuel: 50,
            entrench: 0,
            facing: "NW"
        }, {
            type: "Bomber",
            hex: { q: 0, r: 1 },
            strength: 100,
            experience: 0,
            ammo: 4,
            fuel: 60,
            entrench: 0,
            facing: "NW"
        }, "attack");
    });
    await Then("fighter-versus-fighter attrition should follow raw combat math instead of an arbitrary cap", async () => {
        if (escortVsInterceptorDamage < 95) {
            throw new Error(`Expected the escort-vs-interceptor exchange to stay effectively lethal with these authored stats, saw ${escortVsInterceptorDamage}.`);
        }
        if (interceptorVsBomberDamage <= 0) {
            throw new Error(`Expected the interceptor-vs-bomber attack to still resolve meaningful damage, saw ${interceptorVsBomberDamage}.`);
        }
    });
});
