import { registerTest } from "./harness.js";
import { GameEngine } from "../src/game/GameEngine";
const plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
const marsh = {
    moveCost: { leg: 2, wheel: 4, track: 3, air: 1 },
    defense: -1,
    accMod: -10,
    blocksLOS: false
};
const forest = {
    moveCost: { leg: 2, wheel: 3, track: 2, air: 1 },
    defense: 4,
    accMod: -32,
    blocksLOS: true
};
const road = {
    moveCost: { leg: 1, wheel: 0.5, track: 0.75, air: 1 },
    defense: 0,
    accMod: 6,
    blocksLOS: false
};
const sea = {
    moveCost: { leg: 999, wheel: 999, track: 999, air: 1 },
    defense: 0,
    accMod: 20,
    blocksLOS: false
};
const terrain = {
    plains,
    marsh,
    forest,
    road,
    sea
};
const engineerDef = {
    class: "specialist",
    combat: { category: "specialist", weight: "light", role: "antiInfantry", signature: "small" },
    movement: 2,
    moveType: "leg",
    vision: 2,
    ammo: 5,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 1,
    initiative: 3,
    armor: { front: 1, side: 1, top: 1 },
    hardAttack: 4,
    softAttack: 10,
    ap: 2,
    accuracyBase: 58,
    traits: ["engineer"],
    cost: 120
};
const truckDef = {
    class: "vehicle",
    combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
    movement: 2,
    moveType: "wheel",
    vision: 2,
    ammo: 0,
    fuel: 40,
    rangeMin: 0,
    rangeMax: 0,
    initiative: 1,
    armor: { front: 1, side: 1, top: 1 },
    hardAttack: 0,
    softAttack: 0,
    ap: 0,
    accuracyBase: 0,
    traits: [],
    cost: 80
};
const smokeTankDef = {
    class: "tank",
    combat: { category: "tank", weight: "medium", role: "normal", signature: "medium" },
    movement: 4,
    moveType: "track",
    vision: 4,
    ammo: 3,
    fuel: 40,
    rangeMin: 1,
    rangeMax: 4,
    initiative: 4,
    armor: { front: 12, side: 8, top: 4 },
    hardAttack: 20,
    softAttack: 25,
    ap: 10,
    accuracyBase: 60,
    traits: ["zoc"],
    cost: 160
};
const unitTypes = {
    TestEngineer: engineerDef,
    TestTruck: truckDef,
    TestSmokeTank: smokeTankDef
};
function side(hq = { q: 0, r: 0 }, units = []) {
    return {
        hq,
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units
    };
}
function buildScenario(tilePalette, tiles) {
    return {
        name: "Engineer Fieldworks",
        size: { cols: tiles[0]?.length ?? 0, rows: tiles.length },
        tilePalette,
        tiles,
        objectives: [],
        turnLimit: 6,
        sides: {
            Player: side({ q: 0, r: 0 }),
            Bot: side({ q: 5, r: 3 })
        }
    };
}
function createEngine(playerUnits, options = {}) {
    const tilePalette = options.tilePalette ?? {
        PLAINS: {
            terrain: "plains",
            terrainType: "grass",
            density: "average",
            features: [],
            recon: "intel"
        }
    };
    const tiles = options.tiles ?? Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => ({ tile: "PLAINS" })));
    const config = {
        scenario: buildScenario(tilePalette, tiles),
        unitTypes,
        terrain,
        playerSide: side({ q: 0, r: 0 }, playerUnits.map((unit) => ({ ...unit, preDeployed: true }))),
        botSide: side({ q: 5, r: 3 }),
        botStrategyMode: "Simple"
    };
    const engine = new GameEngine(config);
    engine.beginDeployment();
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
    return { engine, config };
}
registerTest("ENGINEER_FIELDWORKS_REQUIRE_A_FRESH_START_AND_STILL_END_THE_TURN", async ({ Then }) => {
    const engineerTemplate = {
        type: "TestEngineer",
        hex: { q: 1, r: 1 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 0,
        entrench: 0,
        facing: "NE"
    };
    for (const [type, facing] of [
        ["fortifications", "SE"],
        ["tankTraps", "E"],
        ["clearedPath", null]
    ]) {
        const { engine } = createEngine([structuredClone(engineerTemplate)]);
        const before = engine.getUnitCommandState(engineerTemplate.hex);
        if (!before?.buildModificationAvailability[type].available) {
            throw new Error(`Expected ${type} to be available to a fresh engineer, received ${JSON.stringify(before)}.`);
        }
        const moved = engine.moveUnit(engineerTemplate.hex, { q: 2, r: 1 });
        if (!moved) {
            throw new Error(`Expected engineer move test setup for ${type} to succeed.`);
        }
        const afterMove = engine.getUnitCommandState({ q: 2, r: 1 });
        if (afterMove?.buildModificationAvailability[type].available) {
            throw new Error(`Expected ${type} to require a fresh start, received ${JSON.stringify(afterMove)}.`);
        }
        const { engine: freshEngine } = createEngine([structuredClone(engineerTemplate)]);
        const built = freshEngine.buildHexModification(engineerTemplate.hex, type, facing ?? undefined);
        if (!built) {
            throw new Error(`Expected fresh engineer to build ${type}.`);
        }
        const movementBudget = freshEngine.getMovementBudget(engineerTemplate.hex);
        if (!movementBudget || movementBudget.remaining !== 0) {
            throw new Error(`Expected ${type} to consume the engineer's remaining movement, received ${JSON.stringify(movementBudget)}.`);
        }
        const afterBuild = freshEngine.getUnitCommandState(engineerTemplate.hex);
        if (!afterBuild || afterBuild.canBuildModification || afterBuild.canEnterSentry) {
            throw new Error(`Expected ${type} to consume the rest of the turn, received ${JSON.stringify(afterBuild)}.`);
        }
    }
    await Then("all engineer fieldworks start fresh and burn the rest of the turn", () => { });
});
registerTest("SMOKE_ACTION_DELEGATES_FROM_GENERIC_MODIFICATION_PATH", async ({ Then }) => {
    const smokeTank = {
        type: "TestSmokeTank",
        unitId: "smoke-tank",
        hex: { q: 1, r: 1 },
        strength: 100,
        experience: 0,
        ammo: 3,
        fuel: 40,
        entrench: 0,
        facing: "NE"
    };
    const { engine } = createEngine([smokeTank]);
    const before = engine.getUnitCommandState(smokeTank.hex, smokeTank.unitId);
    if (!before?.canLaySmoke || !before.buildModificationAvailability.smoke.available) {
        throw new Error(`Expected a fresh tank to be able to lay smoke, received ${JSON.stringify(before)}.`);
    }
    const targetKeys = engine.resolveSmokeTargetHexKeys(smokeTank.hex, smokeTank.unitId);
    if (targetKeys.length === 0) {
        throw new Error("Expected smoke-capable tank to expose in-range smoke target hexes.");
    }
    const movementBefore = engine.getMovementBudget(smokeTank.hex, smokeTank.unitId)?.remaining ?? -1;
    if (!engine.buildHexModification(smokeTank.hex, "smoke", "E", smokeTank.unitId)) {
        throw new Error("Expected generic smoke modification call to delegate to laySmoke.");
    }
    const smokeMods = engine.getHexModifications(smokeTank.hex).filter((modification) => modification.type === "smoke");
    if (smokeMods.length !== 1 || smokeMods[0]?.facing !== "E" || smokeMods[0]?.expiresOnTurn !== 2) {
        throw new Error(`Expected one expiring east-edge smoke screen, received ${JSON.stringify(smokeMods)}.`);
    }
    const [updatedTank] = engine.serialize().playerPlacements;
    if (updatedTank?.ammo !== 2) {
        throw new Error(`Expected smoke to consume one ammo from the live unit, received ${updatedTank?.ammo}.`);
    }
    const after = engine.getUnitCommandState(smokeTank.hex, smokeTank.unitId);
    if (after?.canLaySmoke || engine.resolveSmokeTargetHexKeys(smokeTank.hex, smokeTank.unitId).length !== 0) {
        throw new Error(`Expected smoke to be limited to once per turn, received ${JSON.stringify(after)}.`);
    }
    const movementAfter = engine.getMovementBudget(smokeTank.hex, smokeTank.unitId)?.remaining ?? -1;
    if (movementAfter !== movementBefore) {
        throw new Error(`Expected smoke to leave movement available, before=${movementBefore}, after=${movementAfter}.`);
    }
    if (engine.buildHexModification(smokeTank.hex, "smoke", "W", smokeTank.unitId)) {
        throw new Error("Expected second smoke action in the same turn to be rejected.");
    }
    engine.endTurn();
    if (engine.getHexModifications(smokeTank.hex).some((modification) => modification.type === "smoke")) {
        throw new Error("Expected smoke to expire at the start of the next player turn.");
    }
    await Then("smoke behaves as a smoke action through both engine entry points", () => { });
});
registerTest("FORTIFICATIONS_AND_TANK_TRAPS_CAN_SHARE_THE_SAME_EDGE", async ({ Then }) => {
    const engineerA = {
        type: "TestEngineer",
        unitId: "eng-a",
        hex: { q: 1, r: 1 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 0,
        entrench: 0,
        facing: "NE"
    };
    const engineerB = { ...engineerA, unitId: "eng-b", facing: "SE" };
    const engineerC = { ...engineerA, unitId: "eng-c", facing: "E" };
    const { engine } = createEngine([engineerA, engineerB, engineerC]);
    if (!engine.buildHexModification(engineerA.hex, "fortifications", "SE", engineerA.unitId)) {
        throw new Error("Expected fortifications to build on the SE edge.");
    }
    if (!engine.buildHexModification(engineerB.hex, "tankTraps", "SE", engineerB.unitId)) {
        throw new Error("Expected tank traps to coexist with fortifications on the same edge.");
    }
    if (engine.buildHexModification(engineerC.hex, "tankTraps", "SE", engineerC.unitId)) {
        throw new Error("Expected duplicate tank traps on the same edge to be rejected.");
    }
    const modifications = engine.getHexModificationSnapshots()
        .sort((left, right) => String(left.type).localeCompare(String(right.type)));
    if (modifications.length !== 2) {
        throw new Error(`Expected one fortification and one tank-trap record, received ${JSON.stringify(modifications)}.`);
    }
    if (modifications[0]?.facing !== "SE" || modifications[1]?.facing !== "SE") {
        throw new Error(`Expected both edge works to remain bound to the same SE edge, received ${JSON.stringify(modifications)}.`);
    }
    await Then("tank traps and fortifications can layer on the same edge without duplicating their own type", () => { });
});
registerTest("CLEARED_PATHS_STACK_TO_LEVEL_THREE_AND_CUT_MARSH_COST_TOWARD_ROADS", async ({ Then }) => {
    const tilePalette = {
        PLAINS: {
            terrain: "plains",
            terrainType: "grass",
            density: "average",
            features: [],
            recon: "intel"
        },
        MARSH: {
            terrain: "marsh",
            terrainType: "grass",
            density: "average",
            features: [],
            recon: "intel"
        }
    };
    const tiles = [
        [{ tile: "PLAINS" }, { tile: "MARSH" }, { tile: "PLAINS" }],
        [{ tile: "PLAINS" }, { tile: "PLAINS" }, { tile: "PLAINS" }]
    ];
    const truck = {
        type: "TestTruck",
        unitId: "truck",
        hex: { q: 0, r: 0 },
        strength: 100,
        experience: 0,
        ammo: 0,
        fuel: 40,
        entrench: 0,
        facing: "E"
    };
    const engineer = {
        type: "TestEngineer",
        unitId: "eng-1",
        hex: { q: 1, r: 0 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 0,
        entrench: 0,
        facing: "NE"
    };
    const { engine } = createEngine([truck, engineer], { tilePalette, tiles });
    const marshHex = { q: 1, r: 0 };
    const reachableBefore = engine.getReachableHexes(truck.hex, truck.unitId).some((hex) => hex.q === marshHex.q && hex.r === marshHex.r);
    if (reachableBefore) {
        throw new Error("Expected truck to be unable to enter an uncleared marsh hex.");
    }
    if (!engine.buildHexModification(marshHex, "clearedPath", undefined, engineer.unitId)) {
        throw new Error("Expected first engineer to cut a level-1 cleared path.");
    }
    const levelOne = engine.getHexModificationSnapshots().find((modification) => modification.type === "clearedPath");
    if ((levelOne?.level ?? 0) !== 1) {
        throw new Error(`Expected cleared path level 1 after first build, received ${JSON.stringify(levelOne)}.`);
    }
    const reachableLevelOne = engine.getReachableHexes(truck.hex, truck.unitId).some((hex) => hex.q === marshHex.q && hex.r === marshHex.r);
    if (reachableLevelOne) {
        throw new Error("Expected level-1 clear path to still leave the marsh too expensive for the truck.");
    }
    engine.endTurn();
    if (!engine.buildHexModification(marshHex, "clearedPath", undefined, engineer.unitId)) {
        throw new Error("Expected second engineer pass to improve the cleared path to level 2.");
    }
    const levelTwo = engine.getHexModificationSnapshots().find((modification) => modification.type === "clearedPath");
    if ((levelTwo?.level ?? 0) !== 2) {
        throw new Error(`Expected cleared path level 2 after second build, received ${JSON.stringify(levelTwo)}.`);
    }
    const reachableLevelTwo = engine.getReachableHexes(truck.hex, truck.unitId).some((hex) => hex.q === marshHex.q && hex.r === marshHex.r);
    if (!reachableLevelTwo) {
        throw new Error("Expected level-2 clear path to bring marsh movement into truck range.");
    }
    engine.endTurn();
    if (!engine.buildHexModification(marshHex, "clearedPath", undefined, engineer.unitId)) {
        throw new Error("Expected third engineer pass to improve the cleared path to level 3.");
    }
    const levelThree = engine.getHexModificationSnapshots().find((modification) => modification.type === "clearedPath");
    if ((levelThree?.level ?? 0) !== 3) {
        throw new Error(`Expected cleared path level 3 after third build, received ${JSON.stringify(levelThree)}.`);
    }
    engine.endTurn();
    const levelCapState = engine.getUnitCommandState(marshHex, engineer.unitId);
    if (!levelCapState || levelCapState.buildModificationAvailability.clearedPath.available) {
        throw new Error(`Expected fresh engineers to be blocked from over-building a level-3 clear path, received ${JSON.stringify(levelCapState)}.`);
    }
    await Then("cleared paths stack to three levels and progressively road the hex for movement", () => { });
});
registerTest("ROAD_FEATURES_CREATE_ROAD_MOVEMENT_ON_LAND_BUT_NOT_WATER", async ({ Then }) => {
    const tilePalette = {
        PLAINS: {
            terrain: "plains",
            terrainType: "grass",
            density: "average",
            features: [],
            recon: "intel"
        },
        FOREST_ROAD: {
            terrain: "forest",
            terrainType: "grass",
            density: "average",
            features: ["road"],
            recon: "intel"
        },
        SEA_ROAD: {
            terrain: "sea",
            terrainType: "water",
            density: "average",
            features: ["road"],
            recon: "intel"
        }
    };
    const tiles = [
        [{ tile: "PLAINS" }, { tile: "FOREST_ROAD" }, { tile: "SEA_ROAD" }]
    ];
    const truck = {
        type: "TestTruck",
        unitId: "truck-road",
        hex: { q: 0, r: 0 },
        strength: 100,
        experience: 0,
        ammo: 0,
        fuel: 40,
        entrench: 0,
        facing: "E"
    };
    const { engine } = createEngine([truck], { tilePalette, tiles });
    const reachable = engine.getReachableHexes(truck.hex, truck.unitId);
    const reachesForestRoad = reachable.some((hex) => hex.q === 1 && hex.r === 0);
    const reachesSeaRoad = reachable.some((hex) => hex.q === 2 && hex.r === -1);
    if (!reachesForestRoad) {
        throw new Error("Expected a road feature on forest to grant road-style movement.");
    }
    if (reachesSeaRoad) {
        throw new Error("Expected water tiles to reject road-feature hosting and remain impassable.");
    }
    await Then("road features can be authored on land tiles without leaking onto water", () => { });
});
