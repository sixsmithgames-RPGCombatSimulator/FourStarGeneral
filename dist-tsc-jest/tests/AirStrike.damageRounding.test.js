import { registerTest } from "./harness.js";
import { GameEngine } from "../src/game/GameEngine";
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const terrain = { plains };
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
    airSupport: {
        roles: ["strike"],
        cruiseSpeedKph: 450,
        combatRadiusKm: 200,
        refitTurns: 2
    }
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
    Bomber: bomberDef,
    Infantry_42: infantryDef
};
function baseSide(overrides) {
    return {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: [],
        ...overrides
    };
}
function buildScenario() {
    const tileKey = "plains";
    const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
    return {
        name: "Bomber Damage Rounding",
        size: { cols: 3, rows: 3 },
        tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
        tiles: [row, row, row],
        objectives: [],
        turnLimit: 5,
        sides: { Player: baseSide(), Bot: baseSide() }
    };
}
function makeUnit(type, hex) {
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
registerTest("AIR_STRIKE_BOMBER_DAMAGE_NEVER_ROUNDS_TO_ZERO", async ({ Given, When, Then }) => {
    let engine;
    const targetHex = { q: 1, r: 0 };
    const originHex = { q: 0, r: 0 };
    await Given("a low-strength bomber with extremely low accuracy conducts a strike on a ground unit", async () => {
        const config = {
            scenario: buildScenario(),
            unitTypes,
            terrain,
            playerSide: baseSide(),
            botSide: baseSide({ general: { accBonus: -99, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 } })
        };
        engine = new GameEngine(config);
        engine.beginDeployment();
        engine.initializeFromAllocations([]);
        engine.setBaseCamp({ q: 0, r: 0 });
        engine.finalizeDeployment();
        engine.startPlayerTurnPhase();
        const defender = makeUnit("Infantry_42", targetHex);
        engine.playerPlacements.set("1,0", defender);
        const bomber = makeUnit("Bomber", originHex);
        bomber.unitId = "u_bomber";
        bomber.strength = 13;
        engine.botPlacements.set("0,0", bomber);
        engine._activeFaction = "Bot";
    });
    await When("the bomber strike mission resolves", async () => {
        const result = engine.tryScheduleAirMission({ kind: "strike", faction: "Bot", unitHex: originHex, targetHex });
        if (!result.ok) {
            throw new Error(`Failed to schedule strike: ${result.code} ${result.reason}`);
        }
        // Prime the roster cache before resolution, mimicking the UI reading it earlier in the turn.
        engine.getRosterSnapshot();
        engine.stepAirMissionsForFaction("Bot");
        engine.stepAirMissionsForFaction("Bot");
    });
    await Then("the defender loses at least 1 strength", async () => {
        const updated = engine.playerPlacements.get("1,0");
        if (!updated) {
            throw new Error("Defender missing after strike");
        }
        if (updated.strength >= 100) {
            throw new Error(`Expected defender strength to drop below 100, saw ${updated.strength}`);
        }
        // Ensure cached roster reflects the new value (regression: stale cached roster could still show 100).
        const roster = engine.getRosterSnapshot();
        const summary = roster.frontline.find((u) => u.location === "1,0") ?? null;
        if (!summary) {
            throw new Error("Roster snapshot missing defender after strike");
        }
        if (summary.strength >= 100) {
            throw new Error(`Expected roster snapshot to show reduced strength, saw ${summary.strength}`);
        }
    });
});
registerTest("AIR_STRIKE_TARGET_RICH_DAMAGE_HITS_EVERY_STACKED_DEFENDER_BUT_SPENDS_ONE_AMMO", async ({ Given, When, Then }) => {
    let engine;
    const targetHex = { q: 1, r: 0 };
    const originHex = { q: 0, r: 0 };
    await Given("a bomber striking two stacked defenders on the same hex", async () => {
        const config = {
            scenario: buildScenario(),
            unitTypes,
            terrain,
            playerSide: baseSide(),
            botSide: baseSide()
        };
        engine = new GameEngine(config);
        engine.beginDeployment();
        engine.initializeFromAllocations([]);
        engine.setBaseCamp({ q: 0, r: 0 });
        engine.finalizeDeployment();
        engine.startPlayerTurnPhase();
        const defenderAlpha = { ...makeUnit("Infantry_42", targetHex), unitId: "stack-alpha" };
        const defenderBravo = { ...makeUnit("Infantry_42", targetHex), unitId: "stack-bravo" };
        engine.addUnitToFactionHex("Player", defenderAlpha);
        engine.addUnitToFactionHex("Player", defenderBravo);
        const bomber = { ...makeUnit("Bomber", originHex), unitId: "u_bomber" };
        bomber.strength = 13;
        engine.botPlacements.set("0,0", bomber);
        engine._activeFaction = "Bot";
    });
    await When("the bomber strike mission resolves against the stack", async () => {
        const result = engine.tryScheduleAirMission({ kind: "strike", faction: "Bot", unitHex: originHex, targetHex });
        if (!result.ok) {
            throw new Error(`Failed to schedule strike: ${result.code} ${result.reason}`);
        }
        engine.stepAirMissionsForFaction("Bot");
        engine.stepAirMissionsForFaction("Bot");
    });
    await Then("both defenders should be damaged while the bomber only spends one ammo salvo", async () => {
        const defenders = engine.getHexStackMembers(targetHex, "Player");
        if (defenders.length !== 2) {
            throw new Error(`Expected both stacked defenders to remain addressable after the strike, saw ${defenders.length}.`);
        }
        const alpha = defenders.find((entry) => entry.unitId === "stack-alpha")?.unit ?? null;
        const bravo = defenders.find((entry) => entry.unitId === "stack-bravo")?.unit ?? null;
        if (!alpha || !bravo) {
            throw new Error(`Expected both stacked defenders to still be identifiable, saw ${JSON.stringify(defenders)}.`);
        }
        if (alpha.strength >= 100 || bravo.strength >= 100) {
            throw new Error(`Expected both stacked defenders to take full strike damage, saw alpha=${alpha.strength}, bravo=${bravo.strength}.`);
        }
        const bomberAfter = engine.botPlacements.get("0,0");
        if (!bomberAfter) {
            throw new Error("Expected the bomber to survive this deterministic strike.");
        }
        if (bomberAfter.ammo !== 3) {
            throw new Error(`Expected the bomber to spend exactly one ammo on the target-rich strike, saw ${bomberAfter.ammo}.`);
        }
    });
});
registerTest("BOT_DIRECT_AIR_STRIKE_TARGET_RICH_DAMAGE_HITS_EVERY_STACKED_DEFENDER_BUT_SPENDS_ONE_AMMO", async ({ Given, When, Then }) => {
    let engine;
    let attack = null;
    const targetHex = { q: 1, r: 0 };
    const originHex = { q: 0, r: 0 };
    await Given("a bot bomber directly attacks two stacked ground defenders", async () => {
        const config = {
            scenario: buildScenario(),
            unitTypes,
            terrain,
            playerSide: baseSide(),
            botSide: baseSide()
        };
        engine = new GameEngine(config);
        engine.beginDeployment();
        engine.initializeFromAllocations([]);
        engine.setBaseCamp({ q: 0, r: 0 });
        engine.finalizeDeployment();
        engine.startPlayerTurnPhase();
        const defenderAlpha = { ...makeUnit("Infantry_42", targetHex), unitId: "bot-stack-alpha" };
        const defenderBravo = { ...makeUnit("Infantry_42", targetHex), unitId: "bot-stack-bravo" };
        engine.addUnitToFactionHex("Player", defenderAlpha);
        engine.addUnitToFactionHex("Player", defenderBravo);
        const bomber = { ...makeUnit("Bomber", originHex), unitId: "bot-bomber-direct" };
        bomber.strength = 13;
        engine.addUnitToFactionHex("Bot", bomber);
    });
    await When("the bot attack resolver executes the strike directly", async () => {
        const bomber = engine.findUnitInFactionAtHex(originHex, "Bot", "bot-bomber-direct");
        if (!bomber) {
            throw new Error("Bot bomber missing before direct attack.");
        }
        attack = engine.resolveBotAttack(bomber, originHex, targetHex);
    });
    await Then("both defenders should take damage while the bomber spends one ammo salvo", async () => {
        if (!attack) {
            throw new Error("Expected bot direct air strike to resolve.");
        }
        const defenders = engine.getHexStackMembers(targetHex, "Player");
        if (defenders.length !== 2) {
            throw new Error(`Expected both stacked defenders to remain after the direct strike, saw ${defenders.length}.`);
        }
        const alpha = defenders.find((entry) => entry.unitId === "bot-stack-alpha")?.unit ?? null;
        const bravo = defenders.find((entry) => entry.unitId === "bot-stack-bravo")?.unit ?? null;
        if (!alpha || !bravo) {
            throw new Error(`Expected both defenders to remain identifiable, saw ${JSON.stringify(defenders)}.`);
        }
        if (alpha.strength >= 100 || bravo.strength >= 100) {
            throw new Error(`Expected both stacked defenders to take direct bot strike damage, saw alpha=${alpha.strength}, bravo=${bravo.strength}.`);
        }
        const bomberAfter = engine.findUnitInFactionAtHex(originHex, "Bot", "bot-bomber-direct");
        if (!bomberAfter) {
            throw new Error("Expected the bot bomber to survive the direct strike.");
        }
        if (bomberAfter.ammo !== 3) {
            throw new Error(`Expected the bot bomber to spend exactly one ammo on the target-rich direct strike, saw ${bomberAfter.ammo}.`);
        }
        if ((attack.inflictedDamage ?? 0) <= 0) {
            throw new Error(`Expected the bot direct strike summary to report aggregate damage, saw ${JSON.stringify(attack)}.`);
        }
        if (attack.defenderDestroyed) {
            throw new Error("Expected the stacked defenders to survive this deterministic direct strike test.");
        }
    });
});
