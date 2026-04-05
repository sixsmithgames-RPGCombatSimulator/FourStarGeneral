"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var Hex_1 = require("../src/core/Hex");
var BotPlanner_1 = require("../src/game/bot/BotPlanner");
var GameEngine_1 = require("../src/game/GameEngine");
var harness_1 = require("./harness");
var plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
var woods = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 3,
    accMod: -1,
    blocksLOS: true
};
var terrain = { plains: plains };
var playerInfantryDef = {
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
    hardAttack: 4,
    softAttack: 10,
    ap: 1,
    accuracyBase: 55,
    traits: [],
    cost: 70
};
var playerTankDef = {
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
var playerArtilleryDef = {
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
var antiTankGunDef = {
    class: "specialist",
    combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
    movement: 1,
    moveType: "wheel",
    vision: 2,
    ammo: 6,
    fuel: 0,
    rangeMin: 1,
    rangeMax: 2,
    initiative: 3,
    armor: { front: 2, side: 1, top: 1 },
    hardAttack: 24,
    softAttack: 6,
    ap: 12,
    accuracyBase: 58,
    traits: [],
    cost: 120
};
var bomberDef = {
    class: "air",
    combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "large" },
    movement: 6,
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
        combatRadiusKm: 260,
        refitTurns: 2
    }
};
var groundAttackDef = {
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
var strikeUnitTypes = {
    TestInfantry: playerInfantryDef,
    TestTank: playerTankDef,
    TestArtillery: playerArtilleryDef,
    TestBomber: bomberDef,
    TestGroundAttack: groundAttackDef
};
function createPlannerSnapshot(type, definition, hex) {
    return {
        unit: {
            type: type,
            hex: __assign({}, hex),
            strength: 100,
            experience: 0,
            ammo: definition.ammo,
            fuel: definition.fuel,
            entrench: 0,
            facing: "NW"
        },
        definition: definition
    };
}
function side(hq, units) {
    if (hq === void 0) { hq = { q: 0, r: 0 }; }
    if (units === void 0) { units = []; }
    return {
        hq: hq,
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: units
    };
}
function createScenario(playerUnits, botUnits) {
    var _a;
    var tileKey = "plains";
    var row = Array.from({ length: 8 }, function () { return ({ tile: tileKey }); });
    return {
        name: "Bot Targeting Heuristic Test",
        size: { cols: 8, rows: 8 },
        tilePalette: (_a = {},
            _a[tileKey] = {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            },
            _a),
        tiles: [row, row, row, row, row, row, row, row],
        objectives: [],
        turnLimit: 6,
        sides: {
            Player: side({ q: 0, r: 0 }, playerUnits),
            Bot: side({ q: 7, r: 0 }, botUnits)
        }
    };
}
function createHeuristicEngine(playerUnits, botUnits) {
    var preDeployedPlayers = playerUnits.map(function (unit) { return (__assign(__assign({}, unit), { preDeployed: true })); });
    var cfg = {
        scenario: createScenario(preDeployedPlayers, botUnits),
        unitTypes: strikeUnitTypes,
        terrain: terrain,
        playerSide: side({ q: 0, r: 0 }, preDeployedPlayers),
        botSide: side({ q: 7, r: 0 }, botUnits),
        botStrategyMode: "Heuristic"
    };
    var engine = new GameEngine_1.GameEngine(cfg);
    engine.beginDeployment();
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();
    return engine;
}
(0, harness_1.registerTest)("BOT_PLANNER_STAGES_FOR_ARMORED_TARGETS_WITH_A_REAL_FIRING_LANE", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var plannedDestination;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                plannedDestination = "";
                return [4 /*yield*/, Given("an anti-tank gun with a closer infantry contact but only a viable lane toward armor", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var botUnit, playerInfantry, playerTank, infantryKey, input, plan;
                        return __generator(this, function (_a) {
                            botUnit = createPlannerSnapshot("BotATGun", antiTankGunDef, { q: 0, r: 0 });
                            playerInfantry = createPlannerSnapshot("EnemyInfantry", playerInfantryDef, { q: 0, r: 3 });
                            playerTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });
                            infantryKey = (0, Hex_1.axialKey)(playerInfantry.unit.hex);
                            input = {
                                botUnits: [botUnit],
                                playerUnits: [playerInfantry, playerTank],
                                objectives: [],
                                occupancy: new Map([
                                    [(0, Hex_1.axialKey)(botUnit.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(playerInfantry.unit.hex), "player"],
                                    [(0, Hex_1.axialKey)(playerTank.unit.hex), "player"]
                                ]),
                                map: {
                                    inBounds: function () { return true; },
                                    terrainAt: function () { return plains; },
                                    movementCost: function () { return 1; }
                                },
                                losAllows: function (_attackerHex, targetHex) { return (0, Hex_1.axialKey)(targetHex) !== infantryKey; },
                                movementAllowance: function () { return 1; },
                                attackEstimator: function (attacker, attackerHex, defender) {
                                    var _a, _b;
                                    var distance = (0, Hex_1.hexDistance)(attackerHex, defender.unit.hex);
                                    var inRange = distance >= ((_a = attacker.definition.rangeMin) !== null && _a !== void 0 ? _a : 1) && distance <= ((_b = attacker.definition.rangeMax) !== null && _b !== void 0 ? _b : 1);
                                    if (!inRange) {
                                        return null;
                                    }
                                    if ((0, Hex_1.axialKey)(defender.unit.hex) === infantryKey) {
                                        return null;
                                    }
                                    return {
                                        expectedDamage: defender.definition.class === "tank" ? 18 : 6,
                                        expectedRetaliation: defender.definition.class === "tank" ? 3 : 8
                                    };
                                },
                                difficulty: "Normal"
                            };
                            plan = (0, BotPlanner_1.planHeuristicBotTurn)(input)[0];
                            plannedDestination = plan ? (0, Hex_1.axialKey)(plan.destination) : "";
                            return [2 /*return*/];
                        });
                    }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the planner scores setup moves instead of simple nearest-enemy pressure", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the unit stages east toward the armored target instead of north toward the blocked infantry", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (plannedDestination !== "1,0") {
                                throw new Error("Expected the anti-tank gun to stage toward armor at 1,0, but planner chose ".concat(plannedDestination || "no move", "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_PLANNER_HOLDS_A_GOOD_FIRING_LANE_INSTEAD_OF_SHUFFLING_SIDEWAYS", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var plannedDestination;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                plannedDestination = "";
                return [4 /*yield*/, Given("an anti-tank gun already covering an armored target from a useful staging hex", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var botUnit, blocker, playerTank, input, plan;
                        return __generator(this, function (_a) {
                            botUnit = createPlannerSnapshot("BotATGun", antiTankGunDef, { q: 0, r: 0 });
                            blocker = createPlannerSnapshot("BotBlocker", playerInfantryDef, { q: 1, r: 0 });
                            playerTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 2, r: 0 });
                            input = {
                                botUnits: [botUnit, blocker],
                                playerUnits: [playerTank],
                                objectives: [],
                                occupancy: new Map([
                                    [(0, Hex_1.axialKey)(botUnit.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(blocker.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(playerTank.unit.hex), "player"]
                                ]),
                                map: {
                                    inBounds: function () { return true; },
                                    terrainAt: function () { return plains; },
                                    movementCost: function () { return 1; }
                                },
                                losAllows: function () { return true; },
                                movementAllowance: function () { return 1; },
                                attackEstimator: function () { return null; },
                                difficulty: "Normal"
                            };
                            plan = (0, BotPlanner_1.planHeuristicBotTurn)(input).find(function (candidate) { return (0, Hex_1.axialKey)(candidate.origin) === "0,0"; });
                            plannedDestination = plan ? (0, Hex_1.axialKey)(plan.destination) : "";
                            return [2 /*return*/];
                        });
                    }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the planner compares lateral movement against simply holding the lane", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the unit should stay put instead of sidestepping without improving range or LOS", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (plannedDestination !== "0,0") {
                                throw new Error("Expected the anti-tank gun to hold at 0,0, but planner chose ".concat(plannedDestination || "no move", "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_PLANNER_PATHS_THROUGH_FRIENDLY_HEXES_TO_JOIN_THE_ASSAULT_LINE", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var plannedDestination;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                plannedDestination = "";
                return [4 /*yield*/, Given("a rear tank queued behind a friendly screen in a one-hex-wide lane toward enemy armor", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var rearTank, frontScreen, enemyTank, input, plan;
                        return __generator(this, function (_a) {
                            rearTank = createPlannerSnapshot("RearTank", playerTankDef, { q: 0, r: 0 });
                            frontScreen = createPlannerSnapshot("FrontScreen", playerInfantryDef, { q: 1, r: 0 });
                            enemyTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });
                            input = {
                                botUnits: [rearTank, frontScreen],
                                playerUnits: [enemyTank],
                                objectives: [],
                                occupancy: new Map([
                                    [(0, Hex_1.axialKey)(rearTank.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(frontScreen.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(enemyTank.unit.hex), "player"]
                                ]),
                                map: {
                                    inBounds: function (hex) { return hex.r === 0 && hex.q >= 0 && hex.q <= 4; },
                                    terrainAt: function () { return plains; },
                                    movementCost: function () { return 1; }
                                },
                                losAllows: function () { return true; },
                                movementAllowance: function () { return 2; },
                                attackEstimator: function () { return null; },
                                difficulty: "Normal"
                            };
                            plan = (0, BotPlanner_1.planHeuristicBotTurn)(input).find(function (candidate) { return (0, Hex_1.axialKey)(candidate.origin) === "0,0"; });
                            plannedDestination = plan ? (0, Hex_1.axialKey)(plan.destination) : "";
                            return [2 /*return*/];
                        });
                    }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the planner evaluates a follow-on move behind the lead element", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the rear tank should plan through the friendly screen instead of stalling in place", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (plannedDestination !== "2,0") {
                                throw new Error("Expected the rear tank to form up at 2,0, but planner chose ".concat(plannedDestination || "no move", "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_PLANNER_PREFERS_A_MASKED_APPROACH_OVER_AN_EXPOSED_STRAIGHT_LUNGE", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var plannedDestination;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                plannedDestination = "";
                return [4 /*yield*/, Given("a tank can either close under woods cover or step into view of multiple defenders", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var botTank, botInfantry, enemyTank, enemyArtillery, artilleryKey, input, plan;
                        return __generator(this, function (_a) {
                            botTank = createPlannerSnapshot("BotTank", playerTankDef, { q: 0, r: 0 });
                            botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 1, r: 2 });
                            enemyTank = createPlannerSnapshot("EnemyTank", playerTankDef, { q: 4, r: 0 });
                            enemyArtillery = createPlannerSnapshot("EnemyArtillery", playerArtilleryDef, { q: 4, r: 2 });
                            artilleryKey = (0, Hex_1.axialKey)(enemyArtillery.unit.hex);
                            input = {
                                botUnits: [botTank, botInfantry],
                                playerUnits: [enemyTank, enemyArtillery],
                                objectives: [],
                                occupancy: new Map([
                                    [(0, Hex_1.axialKey)(botTank.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(botInfantry.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(enemyTank.unit.hex), "player"],
                                    [artilleryKey, "player"]
                                ]),
                                map: {
                                    inBounds: function () { return true; },
                                    terrainAt: function (hex) { return (0, Hex_1.axialKey)(hex) === "1,1" ? woods : plains; },
                                    movementCost: function () { return 1; }
                                },
                                losAllows: function (attackerHex, targetHex) {
                                    var attackerKey = (0, Hex_1.axialKey)(attackerHex);
                                    if ((0, Hex_1.axialKey)(targetHex) === artilleryKey && attackerKey === "1,1") {
                                        return false;
                                    }
                                    return true;
                                },
                                movementAllowance: function () { return 2; },
                                attackEstimator: function () { return null; },
                                difficulty: "Normal"
                            };
                            plan = (0, BotPlanner_1.planHeuristicBotTurn)(input).find(function (candidate) { return (0, Hex_1.axialKey)(candidate.origin) === "0,0"; });
                            plannedDestination = plan ? (0, Hex_1.axialKey)(plan.destination) : "";
                            return [2 /*return*/];
                        });
                    }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the planner scores staging hexes for the armored push", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the tank should choose the masked woods approach instead of the fully exposed center hex", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (plannedDestination !== "1,1") {
                                throw new Error("Expected the tank to stage at 1,1, but planner chose ".concat(plannedDestination || "no move", "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_GROUND_ATTACK_STRIKES_ARMOR_OVER_CLOSER_INFANTRY", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("a bot ground-attack aircraft with a nearby infantry unit and a farther armored target", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var infantry, tank, attacker;
                    return __generator(this, function (_a) {
                        infantry = {
                            type: "TestInfantry",
                            hex: { q: 2, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 6,
                            fuel: 0,
                            entrench: 0,
                            facing: "NW"
                        };
                        tank = {
                            type: "TestTank",
                            hex: { q: 4, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 6,
                            fuel: 55,
                            entrench: 0,
                            facing: "NW"
                        };
                        attacker = {
                            type: "TestGroundAttack",
                            hex: { q: 0, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 5,
                            fuel: 55,
                            entrench: 0,
                            facing: "NW"
                        };
                        engine = createHeuristicEngine([infantry, tank], [attacker]);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the player ends the turn and the bot schedules its strike mission", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.endTurn();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the strike report should show the armored unit as the chosen target", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var strikeReport;
                        return __generator(this, function (_a) {
                            strikeReport = engine.getAirMissionReports().find(function (entry) { return entry.faction === "Bot" && entry.kind === "strike"; });
                            if (!(strikeReport === null || strikeReport === void 0 ? void 0 : strikeReport.targetHex)) {
                                throw new Error("Expected a bot strike report with a recorded target hex.");
                            }
                            if ((0, Hex_1.axialKey)(strikeReport.targetHex) !== "4,0") {
                                throw new Error("Expected ground-attack aircraft to target armor at 4,0, but it struck ".concat((0, Hex_1.axialKey)(strikeReport.targetHex), "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_LEVEL_BOMBERS_STRIKE_ARTILLERY_OVER_CLOSER_INFANTRY", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("a bot bomber with a nearby infantry unit and a farther artillery battery", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var infantry, artillery, attacker;
                    return __generator(this, function (_a) {
                        infantry = {
                            type: "TestInfantry",
                            hex: { q: 2, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 6,
                            fuel: 0,
                            entrench: 0,
                            facing: "NW"
                        };
                        artillery = {
                            type: "TestArtillery",
                            hex: { q: 4, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 5,
                            fuel: 0,
                            entrench: 0,
                            facing: "NW"
                        };
                        attacker = {
                            type: "TestBomber",
                            hex: { q: 0, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 4,
                            fuel: 60,
                            entrench: 0,
                            facing: "NW"
                        };
                        engine = createHeuristicEngine([infantry, artillery], [attacker]);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the bot executes its heuristic air tasking", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.endTurn();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the strike report should show the artillery battery as the chosen target", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var strikeReport;
                        return __generator(this, function (_a) {
                            strikeReport = engine.getAirMissionReports().find(function (entry) { return entry.faction === "Bot" && entry.kind === "strike"; });
                            if (!(strikeReport === null || strikeReport === void 0 ? void 0 : strikeReport.targetHex)) {
                                throw new Error("Expected a bot strike report with a recorded target hex.");
                            }
                            if ((0, Hex_1.axialKey)(strikeReport.targetHex) !== "4,0") {
                                throw new Error("Expected bomber strike to target artillery at 4,0, but it struck ".concat((0, Hex_1.axialKey)(strikeReport.targetHex), "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_LEVEL_MULTIPLE_BOMBERS_QUEUE_MULTIPLE_STRIKES", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("two bot bombers and two valuable ground targets", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var artillery, tank, firstBomber, secondBomber;
                    return __generator(this, function (_a) {
                        artillery = {
                            type: "TestArtillery",
                            hex: { q: 4, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 5,
                            fuel: 0,
                            entrench: 0,
                            facing: "NW"
                        };
                        tank = {
                            type: "TestTank",
                            hex: { q: 4, r: 1 },
                            strength: 100,
                            experience: 0,
                            ammo: 6,
                            fuel: 55,
                            entrench: 0,
                            facing: "NW"
                        };
                        firstBomber = {
                            type: "TestBomber",
                            hex: { q: 0, r: 0 },
                            strength: 100,
                            experience: 0,
                            ammo: 4,
                            fuel: 60,
                            entrench: 0,
                            facing: "NW"
                        };
                        secondBomber = {
                            type: "TestBomber",
                            hex: { q: 0, r: 1 },
                            strength: 100,
                            experience: 0,
                            ammo: 4,
                            fuel: 60,
                            entrench: 0,
                            facing: "NW"
                        };
                        engine = createHeuristicEngine([artillery, tank], [firstBomber, secondBomber]);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the bot runs its air-tasking pass for the turn", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.endTurn();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("both bombers should resolve strike missions against meaningful targets", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var strikeReports, resolvedTargets, expectedTargets;
                        return __generator(this, function (_a) {
                            strikeReports = engine.getAirMissionReports().filter(function (entry) { return entry.faction === "Bot" && entry.kind === "strike" && entry.event === "resolved"; });
                            if (strikeReports.length !== 2) {
                                throw new Error("Expected 2 resolved bot strike reports, received ".concat(strikeReports.length, "."));
                            }
                            resolvedTargets = strikeReports
                                .map(function (entry) { return (entry.targetHex ? (0, Hex_1.axialKey)(entry.targetHex) : "<missing>"); })
                                .sort();
                            expectedTargets = ["4,0", "4,1"];
                            if (resolvedTargets.length !== expectedTargets.length || resolvedTargets.some(function (target, index) { return target !== expectedTargets[index]; })) {
                                throw new Error("Expected bombers to divide strikes across 4,0 and 4,1, but received ".concat(resolvedTargets.join(", "), "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, harness_1.registerTest)("BOT_PLANNER_INFANTRY_MARCHES_THROUGH_COVER_TOWARD_HIGH_VALUE_GUNS", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var plannedDestination;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                plannedDestination = "";
                return [4 /*yield*/, Given("an infantry unit choosing between a covered approach and an exposed shortcut toward enemy guns", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var botInfantry, supportInfantry, enemyArtillery, enemyInfantry, enemyInfantryKey, input, plan;
                        return __generator(this, function (_a) {
                            botInfantry = createPlannerSnapshot("BotInfantry", playerInfantryDef, { q: 0, r: 1 });
                            supportInfantry = createPlannerSnapshot("SupportInfantry", playerInfantryDef, { q: 0, r: 2 });
                            enemyArtillery = createPlannerSnapshot("EnemyArtillery", playerArtilleryDef, { q: 4, r: 1 });
                            enemyInfantry = createPlannerSnapshot("EnemyInfantry", playerInfantryDef, { q: 3, r: 2 });
                            enemyInfantryKey = (0, Hex_1.axialKey)(enemyInfantry.unit.hex);
                            input = {
                                botUnits: [botInfantry, supportInfantry],
                                playerUnits: [enemyArtillery, enemyInfantry],
                                objectives: [],
                                occupancy: new Map([
                                    [(0, Hex_1.axialKey)(botInfantry.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(supportInfantry.unit.hex), "bot"],
                                    [(0, Hex_1.axialKey)(enemyArtillery.unit.hex), "player"],
                                    [enemyInfantryKey, "player"]
                                ]),
                                map: {
                                    inBounds: function (hex) { return hex.q >= 0 && hex.q <= 5 && hex.r >= 0 && hex.r <= 5; },
                                    terrainAt: function (hex) { return (0, Hex_1.axialKey)(hex) === "1,1" ? woods : plains; },
                                    movementCost: function () { return 1; }
                                },
                                losAllows: function (attackerHex, targetHex) {
                                    if ((0, Hex_1.axialKey)(attackerHex) === "1,1" && (0, Hex_1.axialKey)(targetHex) === enemyInfantryKey) {
                                        return false;
                                    }
                                    return true;
                                },
                                movementAllowance: function () { return 1; },
                                attackEstimator: function () { return null; },
                                difficulty: "Normal"
                            };
                            plan = (0, BotPlanner_1.planHeuristicBotTurn)(input).find(function (candidate) { return (0, Hex_1.axialKey)(candidate.origin) === "0,1"; });
                            plannedDestination = plan ? (0, Hex_1.axialKey)(plan.destination) : "";
                            return [2 /*return*/];
                        });
                    }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the planner weighs approach timing against exposure on the way in", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("the infantry should advance through the covered hex instead of drifting into the open", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (plannedDestination !== "1,1") {
                                throw new Error("Expected infantry to march through covered hex 1,1, but planner chose ".concat(plannedDestination || "no move", "."));
                            }
                            return [2 /*return*/];
                        });
                    }); })];
            case 3:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
