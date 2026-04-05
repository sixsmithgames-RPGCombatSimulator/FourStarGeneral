"use strict";
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
var harness_js_1 = require("./harness.js");
var GameEngine_1 = require("../src/game/GameEngine");
var plains = {
    moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
    defense: 0,
    accMod: 0,
    blocksLOS: false
};
var terrain = {
    plains: plains
};
var fighterDef = {
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
var bomberDef = {
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
var infantryDef = {
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
var artilleryDef = {
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
var flakDef = {
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
var unitTypes = {
    Fighter: fighterDef,
    Bomber: bomberDef,
    Infantry_42: infantryDef,
    Howitzer_105: artilleryDef,
    Flak_88: flakDef
};
function side() {
    return {
        hq: { q: 0, r: 0 },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
    };
}
function scenario() {
    var _a;
    var tileKey = "plains";
    var row = [
        { tile: tileKey },
        { tile: tileKey },
        { tile: tileKey },
        { tile: tileKey }
    ];
    return {
        name: "Bot Air Heuristic",
        size: { cols: 4, rows: 4 },
        tilePalette: (_a = {},
            _a[tileKey] = {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            },
            _a),
        tiles: [row, row, row, row],
        objectives: [{ hex: { q: 2, r: 1 }, owner: "Player", vp: 250 }],
        turnLimit: 5,
        sides: { Player: side(), Bot: side() }
    };
}
function make(type, hex) {
    var _a, _b;
    return {
        type: type,
        hex: hex,
        strength: 100,
        experience: 0,
        ammo: (_a = unitTypes[type].ammo) !== null && _a !== void 0 ? _a : 6,
        fuel: (_b = unitTypes[type].fuel) !== null && _b !== void 0 ? _b : 50,
        entrench: 0,
        facing: "NW"
    };
}
function createBotTurnEngine() {
    var config = {
        scenario: scenario(),
        unitTypes: unitTypes,
        terrain: terrain,
        playerSide: side(),
        botSide: side()
    };
    var engine = new GameEngine_1.GameEngine(config);
    engine._phase = "botTurn";
    engine._activeFaction = "Bot";
    return engine;
}
(0, harness_js_1.registerTest)("BOT_AIR_HEURISTIC_SKIPS_CAP_WHEN_PLAYER_HAS_NO_STRIKE_AIRCRAFT", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("a bot fighter with a player-held objective to cover, but only player interceptors in the air order of battle", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var botFighter, playerInterceptor;
                    return __generator(this, function (_a) {
                        engine = createBotTurnEngine();
                        botFighter = make("Fighter", { q: 0, r: 0 });
                        botFighter.unitId = "bot-cap";
                        engine.botPlacements.set("0,0", botFighter);
                        playerInterceptor = make("Fighter", { q: 3, r: 0 });
                        playerInterceptor.unitId = "player-cap";
                        engine.playerPlacements.set("3,0", playerInterceptor);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the bot evaluates heuristic air operations", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.maybeScheduleHeuristicAirOps();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("it should not waste a CAP sortie because the player has no strike aircraft", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var missions;
                        return __generator(this, function (_a) {
                            missions = Array.from(engine.scheduledAirMissions.values());
                            if (missions.length !== 0) {
                                throw new Error("Expected no bot air missions to be queued, saw ".concat(missions.map(function (mission) { return mission.template.kind; }).join(", "), "."));
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
(0, harness_js_1.registerTest)("BOT_AIR_HEURISTIC_ESCORTS_BOMBERS_WHEN_PLAYER_FIELDS_INTERCEPTORS", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("a bot bomber package and a player interceptor presence protecting a ground target", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var botBomber, botEscort, playerInterceptor, playerTarget;
                    return __generator(this, function (_a) {
                        engine = createBotTurnEngine();
                        botBomber = make("Bomber", { q: 0, r: 0 });
                        botBomber.unitId = "bot-bomber";
                        engine.botPlacements.set("0,0", botBomber);
                        botEscort = make("Fighter", { q: 1, r: 0 });
                        botEscort.unitId = "bot-escort";
                        engine.botPlacements.set("1,0", botEscort);
                        playerInterceptor = make("Fighter", { q: 3, r: 0 });
                        playerInterceptor.unitId = "player-cap";
                        engine.playerPlacements.set("3,0", playerInterceptor);
                        playerTarget = make("Infantry_42", { q: 2, r: 1 });
                        engine.playerPlacements.set("2,1", playerTarget);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the bot queues heuristic air operations", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.maybeScheduleHeuristicAirOps();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("it should queue a strike and pair an escort instead of spending the fighter on CAP", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var missions, strike, escort, cap;
                        var _a, _b, _c, _d;
                        return __generator(this, function (_e) {
                            missions = Array.from(engine.scheduledAirMissions.values());
                            strike = (_a = missions.find(function (mission) { return mission.template.kind === "strike"; })) !== null && _a !== void 0 ? _a : null;
                            escort = (_b = missions.find(function (mission) { return mission.template.kind === "escort"; })) !== null && _b !== void 0 ? _b : null;
                            cap = (_c = missions.find(function (mission) { return mission.template.kind === "airCover"; })) !== null && _c !== void 0 ? _c : null;
                            if (!strike) {
                                throw new Error("Expected a bot strike mission to be queued, saw ".concat(missions.map(function (mission) { return mission.template.kind; }).join(", "), "."));
                            }
                            if (!escort) {
                                throw new Error("Expected a bot escort mission to be queued alongside the strike, saw ".concat(missions.map(function (mission) { return mission.template.kind; }).join(", "), "."));
                            }
                            if (escort.escortTargetUnitKey !== strike.unitKey) {
                                throw new Error("Expected escort to protect ".concat(strike.unitKey, ", saw ").concat((_d = escort.escortTargetUnitKey) !== null && _d !== void 0 ? _d : "<missing>", "."));
                            }
                            if (cap) {
                                throw new Error("Expected the bot to reserve its fighter for escort instead of queuing CAP.");
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
(0, harness_js_1.registerTest)("BOT_AIR_HEURISTIC_SKIPS_LONE_BOMBER_RUNS_INTO_HEAVY_FLAK", function (_a) { return __awaiter(void 0, [_a], void 0, function (_b) {
    var engine;
    var Given = _b.Given, When = _b.When, Then = _b.Then;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, Given("a single bot bomber facing an artillery target protected by overlapping player flak", function () { return __awaiter(void 0, void 0, void 0, function () {
                    var botBomber, playerArtillery, firstFlak, secondFlak;
                    return __generator(this, function (_a) {
                        engine = createBotTurnEngine();
                        botBomber = make("Bomber", { q: 0, r: 0 });
                        botBomber.unitId = "bot-bomber";
                        engine.botPlacements.set("0,0", botBomber);
                        playerArtillery = make("Howitzer_105", { q: 2, r: 1 });
                        playerArtillery.unitId = "player-artillery";
                        engine.playerPlacements.set("2,1", playerArtillery);
                        firstFlak = make("Flak_88", { q: 2, r: 0 });
                        firstFlak.onSentry = true;
                        firstFlak.unitId = "player-flak-a";
                        engine.playerPlacements.set("2,0", firstFlak);
                        secondFlak = make("Flak_88", { q: 3, r: 1 });
                        secondFlak.onSentry = true;
                        secondFlak.unitId = "player-flak-b";
                        engine.playerPlacements.set("3,1", secondFlak);
                        return [2 /*return*/];
                    });
                }); })];
            case 1:
                _c.sent();
                return [4 /*yield*/, When("the bot evaluates whether the strike is worth launching", function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            engine.maybeScheduleHeuristicAirOps();
                            return [2 /*return*/];
                        });
                    }); })];
            case 2:
                _c.sent();
                return [4 /*yield*/, Then("it should decline the sortie instead of throwing away the bomber", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var strikeMissions;
                        return __generator(this, function (_a) {
                            strikeMissions = Array.from(engine.scheduledAirMissions.values()).filter(function (mission) { return mission.template.kind === "strike"; });
                            if (strikeMissions.length !== 0) {
                                throw new Error("Expected heavy flak to deter a lone bomber strike, but queued ".concat(strikeMissions.length, " strike mission(s)."));
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
