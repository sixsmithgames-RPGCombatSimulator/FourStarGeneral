"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocationKeyToScenarioType = void 0;
exports.getSpriteForScenarioType = getSpriteForScenarioType;
exports.getSpriteForAllocationKey = getSpriteForAllocationKey;
var adapters_1 = require("../game/adapters");
/**
 * Resolves the absolute URL for a sprite asset bundled under `src/assets/units/`.
 * Using `import.meta.url` keeps paths correct regardless of build tooling.
 */
var unitSprite = function (fileName) { return new URL("../assets/units/".concat(fileName), import.meta.url).href; };
/**
 * Direct mapping from engine `ScenarioUnit.type` values to concrete sprite assets.
 * This table mirrors the art catalogue so both AI and player-owned units render consistently.
 */
var SCENARIO_SPRITES = {
    Infantry_42: unitSprite("Infantry.png"),
    AT_Infantry: unitSprite("Infantry_Elite.png"),
    Paratrooper: unitSprite("Paratrooper.png"),
    Engineer: unitSprite("Engineer.png"),
    Combat_Engineer: unitSprite("Combat_Engineer.png"),
    AT_Gun_50mm: unitSprite("AT_Gun_50mm.png"),
    Flak_88: unitSprite("Flak_88.png"),
    Recon_ArmoredCar: unitSprite("Recon_ArmoredCar.png"),
    Recon_Bike: unitSprite("Recon_Bike.png"),
    APC_Truck: unitSprite("APC_Truck.png"),
    APC_Halftrack: unitSprite("APC_Halftrack.png"),
    Supply_Truck: unitSprite("Supply_Truck.png"),
    Panzer_IV: unitSprite("Light_Tank.png"),
    Heavy_Tank: unitSprite("Heavy_Tank.png"),
    Tank_Destroyer: unitSprite("Anti_Tank_Tank.png"),
    Assault_Gun: unitSprite("Assault_Gun.png"),
    Howitzer_105: unitSprite("Howitzer_105.png"),
    Rocket_Artillery: unitSprite("Rocket_Artillery.png"),
    SP_Artillery: unitSprite("SP_Artillery.png"),
    Scout_Plane: unitSprite("Scout_Plane.png"),
    Fighter: unitSprite("Fighter.png"),
    Interceptor: unitSprite("Interceptor.png"),
    Ground_Attack: unitSprite("Ground_Attack.png"),
    Bomber: unitSprite("Bomber.png"),
    Transport_Plane: unitSprite("Transport_Plane.png"),
    Infantry: unitSprite("Infantry.png"),
    Howitzer: unitSprite("Howitzer_105.png"),
    Panzer_V: unitSprite("Panzer_V.png"),
    Light_Tank: unitSprite("Light_Tank.png"),
    Anti_Tank_Tank: unitSprite("Anti_Tank_Tank.png"),
    SPAA: unitSprite("Flak_88.png"),
    Recon: unitSprite("Recon_ArmoredCar.png"),
    Bomber_Elite: unitSprite("Bomber.png"),
    Transport_Ship: unitSprite("Transport_Ship.png"),
    Battleship: unitSprite("Battleship.png"),
    Infantry_Elite: unitSprite("Infantry_Elite.png"),
    Artillery_155mm: unitSprite("Howitzer_105.png"),
    Artillery_105mm: unitSprite("Howitzer_105.png")
};
var FACTION_AIRCRAFT_SPRITES = {
    Fighter: {
        Player: unitSprite("Aircraft_USA_P51.png"),
        Ally: unitSprite("Aircraft_USA_P51.png"),
        Bot: unitSprite("Aircraft_German_BF109.png"),
        fallback: unitSprite("Aircraft_USA_P51.png")
    },
    Interceptor: {
        Player: unitSprite("Aircraft_England_Spitfire.png"),
        Ally: unitSprite("Aircraft_England_Spitfire.png"),
        Bot: unitSprite("Aircraft_German_FW190.png"),
        fallback: unitSprite("Aircraft_England_Spitfire.png")
    },
    Ground_Attack: {
        Player: unitSprite("Aircraft_USA_B25.png"),
        Ally: unitSprite("Aircraft_USA_B25.png"),
        Bot: unitSprite("Aircraft_German_JU87.png"),
        fallback: unitSprite("Aircraft_USA_B25.png")
    },
    Bomber: {
        Player: unitSprite("Aircraft_USA_B17.png"),
        Ally: unitSprite("Aircraft_USA_B17.png"),
        Bot: unitSprite("Aircraft_German_HE177.png"),
        fallback: unitSprite("Aircraft_USA_B17.png")
    },
    Bomber_Elite: {
        Player: unitSprite("Aircraft_USA_B17.png"),
        Ally: unitSprite("Aircraft_USA_B17.png"),
        Bot: unitSprite("Aircraft_German_HE177.png"),
        fallback: unitSprite("Aircraft_USA_B17.png")
    }
};
function normalizeSpriteFaction(faction) {
    if (faction === "Bot") {
        return "Bot";
    }
    if (faction === "Ally") {
        return "Ally";
    }
    if (faction === "Player") {
        return "Player";
    }
    return null;
}
function resolveScenarioSprite(scenarioType, faction) {
    var _a, _b, _c;
    var aircraftSpriteSet = FACTION_AIRCRAFT_SPRITES[scenarioType];
    if (aircraftSpriteSet) {
        var spriteFaction = normalizeSpriteFaction(faction);
        if (spriteFaction && aircraftSpriteSet[spriteFaction]) {
            return aircraftSpriteSet[spriteFaction];
        }
        return (_c = (_b = (_a = aircraftSpriteSet.Player) !== null && _a !== void 0 ? _a : aircraftSpriteSet.Ally) !== null && _b !== void 0 ? _b : aircraftSpriteSet.Bot) !== null && _c !== void 0 ? _c : aircraftSpriteSet.fallback;
    }
    return SCENARIO_SPRITES[scenarioType];
}
/**
 * Allocation keys point to ScenarioUnit templates. This lookup allows UI-only data (e.g., deployment options)
 * to translate into a concrete engine type and therefore the correct sprite.
 */
exports.allocationKeyToScenarioType = {};
adapters_1.deploymentTemplates.forEach(function (template) {
    exports.allocationKeyToScenarioType[template.key] = template.type;
});
var ALLOCATION_SPRITES = {};
Object.entries(exports.allocationKeyToScenarioType).forEach(function (_a) {
    var allocationKey = _a[0], scenarioType = _a[1];
    var sprite = resolveScenarioSprite(scenarioType, "Player");
    if (sprite) {
        ALLOCATION_SPRITES[allocationKey] = sprite;
    }
});
/**
 * Retrieves the sprite URL registered for a given engine scenario type.
 */
function getSpriteForScenarioType(scenarioType, faction) {
    return resolveScenarioSprite(scenarioType, faction);
}
/**
 * Retrieves the sprite URL for a deployment allocation key, if the catalogue includes one.
 */
function getSpriteForAllocationKey(allocationKey, faction) {
    var _a;
    var scenarioType = exports.allocationKeyToScenarioType[allocationKey];
    if (scenarioType) {
        return (_a = resolveScenarioSprite(scenarioType, faction)) !== null && _a !== void 0 ? _a : ALLOCATION_SPRITES[allocationKey];
    }
    return ALLOCATION_SPRITES[allocationKey];
}
