import { registerTest } from "./harness.js";
import { GameEngine } from "../src/game/GameEngine";
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const terrain = {
    plains
};
const fighterDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "normal", signature: "small" },
    movement: 8,
    moveType: "air",
    vision: 4,
    ammo: 6,
    fuel: 55,
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
    airSupport: {
        roles: ["escort", "cap"],
        cruiseSpeedKph: 540,
        combatRadiusKm: 250,
        refitTurns: 1
    }
};
const bomberDef = {
    class: "air",
    combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "large" },
    movement: 6,
    moveType: "air",
    vision: 4,
    ammo: 1,
    fuel: 60,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 1,
    armor: { front: 10, side: 10, top: 10 },
    hardAttack: 70,
    softAttack: 50,
    ap: 16,
    accuracyBase: 55,
    traits: ["indirect"],
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
    movement: 2,
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
const artilleryDef = {
    class: "artillery",
    combat: { category: "artillery", weight: "medium", role: "support", signature: "large" },
    movement: 1,
    moveType: "wheel",
    vision: 2,
    ammo: 5,
    fuel: 0,
    rangeMin: 2,
    rangeMax: 4,
    initiative: 2,
    armor: { front: 2, side: 2, top: 1 },
    hardAttack: 8,
    softAttack: 24,
    ap: 3,
    accuracyBase: 52,
    traits: ["indirect"],
    cost: 180
};
const tankDef = {
    class: "tank",
    combat: { category: "tank", weight: "medium", role: "normal", signature: "large" },
    movement: 3,
    moveType: "track",
    vision: 3,
    ammo: 6,
    fuel: 55,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 4,
    armor: { front: 10, side: 8, top: 6 },
    hardAttack: 20,
    softAttack: 12,
    ap: 10,
    accuracyBase: 60,
    traits: [],
    cost: 220
};
const flakDef = {
    class: "specialist",
    combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
    movement: 1,
    moveType: "wheel",
    vision: 4,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 5,
    initiative: 4,
    armor: { front: 3, side: 2, top: 2 },
    hardAttack: 220,
    softAttack: 220,
    ap: 20,
    accuracyBase: 75,
    traits: ["intercept"],
    cost: 220
};
const reconDef = {
    class: "recon",
    combat: { category: "recon", weight: "light", role: "normal", signature: "small" },
    movement: 4,
    moveType: "wheel",
    vision: 4,
    ammo: 4,
    fuel: 50,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 5,
    armor: { front: 2, side: 1, top: 1 },
    hardAttack: 4,
    softAttack: 8,
    ap: 1,
    accuracyBase: 58,
    traits: [],
    cost: 95
};
const groundAttackDef = {
    class: "air",
    combat: { category: "air", weight: "light", role: "antiVehicle", signature: "medium" },
    movement: 8,
    moveType: "air",
    vision: 4,
    ammo: 5,
    fuel: 55,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 5,
    armor: { front: 6, side: 5, top: 4 },
    hardAttack: 20,
    softAttack: 35,
    ap: 5,
    accuracyBase: 60,
    traits: ["carpet"],
    cost: 380,
    airSupport: {
        roles: ["strike"],
        cruiseSpeedKph: 420,
        combatRadiusKm: 240,
        refitTurns: 2
    }
};
const unitTypes = {
    Fighter: fighterDef,
    Bomber: bomberDef,
    Infantry_42: infantryDef,
    Howitzer_105: artilleryDef,
    Panzer_IV: tankDef,
    Flak_88: flakDef,
    Recon_Bike: reconDef,
    GroundAttack: groundAttackDef
};
function side() {
    return {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
    };
}
function scenario() {
    const tileKey = "plains";
    const row = [
        { tile: tileKey },
        { tile: tileKey },
        { tile: tileKey },
        { tile: tileKey }
    ];
    return {
        name: "Bot Air Heuristic",
        size: { cols: 4, rows: 4 },
        tilePalette: {
            [tileKey]: {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: [row, row, row, row],
        objectives: [{ hex: { q: 2, r: 1 }, owner: "Player", vp: 250 }],
        turnLimit: 5,
        sides: { Player: side(), Bot: side() }
    };
}
function make(type, hex) {
    const definition = unitTypes[type];
    return {
        type: type,
        hex,
        strength: 100,
        experience: 0,
        ammo: definition?.ammo ?? 6,
        fuel: definition?.fuel ?? 50,
        entrench: 0,
        facing: "NW"
    };
}
function createBotTurnEngine() {
    const config = {
        scenario: scenario(),
        unitTypes,
        terrain,
        playerSide: side(),
        botSide: side()
    };
    const engine = new GameEngine(config);
    engine._phase = "botTurn";
    engine._activeFaction = "Bot";
    return engine;
}
registerTest("BOT_AIR_HEURISTIC_SKIPS_CAP_WHEN_PLAYER_HAS_NO_STRIKE_AIRCRAFT", async ({ Given, When, Then }) => {
    let engine;
    await Given("a bot fighter with a player-held objective to cover, but only player interceptors in the air order of battle", async () => {
        engine = createBotTurnEngine();
        const botFighter = make("Fighter", { q: 0, r: 0 });
        botFighter.unitId = "bot-cap";
        engine.botPlacements.set("0,0", botFighter);
        const playerInterceptor = make("Fighter", { q: 3, r: 0 });
        playerInterceptor.unitId = "player-cap";
        engine.playerPlacements.set("3,0", playerInterceptor);
    });
    await When("the bot evaluates heuristic air operations", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("it should not waste a CAP sortie because the player has no strike aircraft", async () => {
        const missions = Array.from(engine.scheduledAirMissions.values());
        if (missions.length !== 0) {
            throw new Error(`Expected no bot air missions to be queued, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_ESCORTS_BOMBERS_WHEN_PLAYER_FIELDS_INTERCEPTORS", async ({ Given, When, Then }) => {
    let engine;
    await Given("a bot bomber package and a player interceptor presence protecting a ground target", async () => {
        engine = createBotTurnEngine();
        const botBomber = make("Bomber", { q: 0, r: 0 });
        botBomber.unitId = "bot-bomber";
        engine.botPlacements.set("0,0", botBomber);
        const botEscort = make("Fighter", { q: 1, r: 0 });
        botEscort.unitId = "bot-escort";
        engine.botPlacements.set("1,0", botEscort);
        const playerInterceptor = make("Fighter", { q: 3, r: 0 });
        playerInterceptor.unitId = "player-cap";
        engine.playerPlacements.set("3,0", playerInterceptor);
        const playerTarget = make("Infantry_42", { q: 2, r: 1 });
        engine.playerPlacements.set("2,1", playerTarget);
    });
    await When("the bot queues heuristic air operations", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("it should queue a strike and pair an escort instead of spending the fighter on CAP", async () => {
        const missions = Array.from(engine.scheduledAirMissions.values());
        const strike = missions.find((mission) => mission.template.kind === "strike") ?? null;
        const escort = missions.find((mission) => mission.template.kind === "escort") ?? null;
        const cap = missions.find((mission) => mission.template.kind === "airCover") ?? null;
        if (!strike) {
            throw new Error(`Expected a bot strike mission to be queued, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
        }
        if (!escort) {
            throw new Error(`Expected a bot escort mission to be queued alongside the strike, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
        }
        if (escort.escortTargetUnitKey !== strike.unitKey) {
            throw new Error(`Expected escort to protect ${strike.unitKey}, saw ${escort.escortTargetUnitKey ?? "<missing>"}.`);
        }
        if (cap) {
            throw new Error("Expected the bot to reserve its fighter for escort instead of queuing CAP.");
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_SKIPS_LONE_BOMBER_RUNS_INTO_HEAVY_FLAK", async ({ Given, When, Then }) => {
    let engine;
    await Given("a single bot bomber facing an artillery target protected by overlapping player flak", async () => {
        engine = createBotTurnEngine();
        const botBomber = make("Bomber", { q: 0, r: 0 });
        botBomber.unitId = "bot-bomber";
        engine.botPlacements.set("0,0", botBomber);
        const playerArtillery = make("Howitzer_105", { q: 2, r: 1 });
        playerArtillery.unitId = "player-artillery";
        engine.playerPlacements.set("2,1", playerArtillery);
        const firstFlak = make("Flak_88", { q: 2, r: 0 });
        firstFlak.onSentry = true;
        firstFlak.unitId = "player-flak-a";
        engine.playerPlacements.set("2,0", firstFlak);
        const secondFlak = make("Flak_88", { q: 3, r: 1 });
        secondFlak.onSentry = true;
        secondFlak.unitId = "player-flak-b";
        engine.playerPlacements.set("3,1", secondFlak);
    });
    await When("the bot evaluates whether the strike is worth launching", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("it should decline the sortie instead of throwing away the bomber", async () => {
        const strikeMissions = Array.from(engine.scheduledAirMissions.values()).filter((mission) => mission.template.kind === "strike");
        if (strikeMissions.length !== 0) {
            throw new Error(`Expected heavy flak to deter a lone bomber strike, but queued ${strikeMissions.length} strike mission(s).`);
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_GROUND_ATTACK_PREFERS_ARMOR_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
    let engine;
    await Given("an anti-vehicle strike aircraft with a closer infantry target and a farther tank", async () => {
        engine = createBotTurnEngine();
        const attacker = make("GroundAttack", { q: 0, r: 0 });
        attacker.unitId = "bot-ground-attack";
        engine.botPlacements.set("0,0", attacker);
        const infantry = make("Infantry_42", { q: 2, r: 0 });
        infantry.unitId = "player-infantry";
        engine.playerPlacements.set("2,0", infantry);
        const tank = make("Panzer_IV", { q: 4, r: 0 });
        tank.unitId = "player-tank";
        engine.playerPlacements.set("4,0", tank);
    });
    await When("the bot evaluates strike assignments", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("it should queue the anti-vehicle sortie against the armored target", async () => {
        const strike = Array.from(engine.scheduledAirMissions.values()).find((mission) => mission.template.kind === "strike");
        if (!strike?.targetHex || `${strike.targetHex.q},${strike.targetHex.r}` !== "4,0") {
            throw new Error(`Expected anti-vehicle strike to target armor at 4,0, saw ${strike?.targetHex ? `${strike.targetHex.q},${strike.targetHex.r}` : "no strike"}.`);
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_BOMBERS_PREFER_ARTILLERY_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
    let engine;
    await Given("a bomber package choosing between nearby infantry and a farther artillery battery", async () => {
        engine = createBotTurnEngine();
        const bomber = make("Bomber", { q: 0, r: 0 });
        bomber.unitId = "bot-bomber";
        engine.botPlacements.set("0,0", bomber);
        const infantry = make("Infantry_42", { q: 2, r: 0 });
        infantry.unitId = "player-infantry";
        engine.playerPlacements.set("2,0", infantry);
        const artillery = make("Howitzer_105", { q: 4, r: 0 });
        artillery.unitId = "player-artillery";
        engine.playerPlacements.set("4,0", artillery);
    });
    await When("the bomber target list is ranked", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("the artillery battery should be selected ahead of the infantry convenience shot", async () => {
        const strike = Array.from(engine.scheduledAirMissions.values()).find((mission) => mission.template.kind === "strike");
        if (!strike?.targetHex || `${strike.targetHex.q},${strike.targetHex.r}` !== "4,0") {
            throw new Error(`Expected bomber strike to target artillery at 4,0, saw ${strike?.targetHex ? `${strike.targetHex.q},${strike.targetHex.r}` : "no strike"}.`);
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_SPLITS_MULTIPLE_BOMBERS_ACROSS_VALUABLE_TARGETS", async ({ Given, When, Then }) => {
    let engine;
    await Given("two bombers with both artillery and armor available as worthwhile targets", async () => {
        engine = createBotTurnEngine();
        const firstBomber = make("Bomber", { q: 0, r: 0 });
        firstBomber.unitId = "bot-bomber-a";
        engine.botPlacements.set("0,0", firstBomber);
        const secondBomber = make("Bomber", { q: 0, r: 1 });
        secondBomber.unitId = "bot-bomber-b";
        engine.botPlacements.set("0,1", secondBomber);
        const artillery = make("Howitzer_105", { q: 4, r: 0 });
        artillery.unitId = "player-artillery";
        engine.playerPlacements.set("4,0", artillery);
        const tank = make("Panzer_IV", { q: 4, r: 1 });
        tank.unitId = "player-tank";
        engine.playerPlacements.set("4,1", tank);
    });
    await When("the bot assigns both bomber sorties for the turn", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("the queued strikes should cover both valuable targets before doubling up", async () => {
        const strikeTargets = Array.from(engine.scheduledAirMissions.values())
            .filter((mission) => mission.template.kind === "strike")
            .map((mission) => mission.targetHex ? `${mission.targetHex.q},${mission.targetHex.r}` : "<missing>")
            .sort();
        const expected = ["4,0", "4,1"];
        if (strikeTargets.length !== expected.length || strikeTargets.some((target, index) => target !== expected[index])) {
            throw new Error(`Expected bomber targets ${expected.join(", ")}, saw ${strikeTargets.join(", ")}.`);
        }
    });
});
registerTest("BOT_AIR_HEURISTIC_ESCORTED_STRIKES_ACCEPT_LOSSES_TO_KILL_A_RECON_OBSERVER", async ({ Given, When, Then }) => {
    let engine;
    await Given("an escorted bomber package facing a player recon unit that is spotting bot armor for artillery and CAP", async () => {
        engine = createBotTurnEngine();
        const botBomber = make("Bomber", { q: 0, r: 0 });
        botBomber.unitId = "bot-bomber";
        engine.botPlacements.set("0,0", botBomber);
        const botEscort = make("Fighter", { q: 1, r: 0 });
        botEscort.unitId = "bot-escort";
        engine.botPlacements.set("1,0", botEscort);
        const botTank = make("Panzer_IV", { q: 5, r: 1 });
        botTank.unitId = "bot-tank";
        engine.botPlacements.set("5,1", botTank);
        const secondBotTank = make("Panzer_IV", { q: 5, r: 2 });
        secondBotTank.unitId = "bot-tank-b";
        engine.botPlacements.set("5,2", secondBotTank);
        const playerObserver = make("Recon_Bike", { q: 4, r: 1 });
        playerObserver.unitId = "player-observer";
        engine.playerPlacements.set("4,1", playerObserver);
        const playerArtillery = make("Howitzer_105", { q: 6, r: 1 });
        playerArtillery.unitId = "player-artillery";
        engine.playerPlacements.set("6,1", playerArtillery);
        const playerInterceptor = make("Fighter", { q: 6, r: 0 });
        playerInterceptor.unitId = "player-cap";
        engine.playerPlacements.set("6,0", playerInterceptor);
    });
    await When("the bot evaluates whether the observer kill is worth an escorted strike", async () => {
        engine.maybeScheduleHeuristicAirOps();
    });
    await Then("it should queue a strike on the observer and reserve the fighter as escort", async () => {
        const missions = Array.from(engine.scheduledAirMissions.values());
        const strike = missions.find((mission) => mission.template.kind === "strike") ?? null;
        const escort = missions.find((mission) => mission.template.kind === "escort") ?? null;
        if (!strike?.targetHex || `${strike.targetHex.q},${strike.targetHex.r}` !== "4,1") {
            throw new Error(`Expected the escorted strike to target recon observer 4,1, saw ${strike?.targetHex ? `${strike.targetHex.q},${strike.targetHex.r}` : "no strike"}.`);
        }
        if (!escort) {
            throw new Error("Expected an escort mission to be queued for the observer strike.");
        }
        if (escort.escortTargetUnitKey !== strike.unitKey) {
            throw new Error(`Expected escort to protect ${strike.unitKey}, saw ${escort.escortTargetUnitKey ?? "<missing>"}.`);
        }
    });
});
