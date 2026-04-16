function createSide(hqQ, hqR) {
    return {
        hq: { q: hqQ, r: hqR },
        general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
        units: []
    };
}
export function buildAirshowHarnessFixture() {
    const tileKey = "plains";
    const row = Array.from({ length: 10 }, () => ({ tile: tileKey }));
    const renderScenario = {
        name: "Airshow Harness Scenario",
        size: { cols: 10, rows: 10 },
        tilePalette: {
            [tileKey]: {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: Array.from({ length: 10 }, () => row),
        objectives: [],
        turnLimit: 6,
        sides: {
            Player: createSide(0, 0),
            Bot: createSide(9, 9)
        }
    };
    const missionId = "e2e-airshow-contested-package";
    const locKey = "5,7";
    const bomberOriginKey = "1,7";
    const bomberTargetKey = "7,8";
    const bomberArrivalDelayMs = 220;
    const playerHqKey = "0,0";
    const botHqKey = "9,13";
    const originKeysByUnitId = {
        "cap-1": "8,6",
        "cap-2": "8,7",
        "cap-3": "8,8",
        "escort-1": "2,6",
        "escort-2": "2,7",
        "bomber-1": bomberOriginKey
    };
    const strengthByUnitId = {
        "cap-1": 25,
        "cap-2": 25,
        "cap-3": 25,
        "escort-1": 25,
        "escort-2": 25,
        "bomber-1": 100
    };
    const engagement = {
        type: "airToAir",
        missionId,
        location: { q: 5, r: 5 },
        bomber: {
            faction: "Player",
            unitKey: "bomber-1",
            unitType: "Bomber",
            strength: strengthByUnitId["bomber-1"]
        },
        interceptors: [
            { faction: "Bot", unitKey: "cap-1", unitType: "Fighter", strength: strengthByUnitId["cap-1"] },
            { faction: "Bot", unitKey: "cap-2", unitType: "Interceptor", strength: strengthByUnitId["cap-2"] },
            { faction: "Bot", unitKey: "cap-3", unitType: "Fighter", strength: strengthByUnitId["cap-3"] }
        ],
        escorts: [
            { faction: "Player", unitKey: "escort-1", unitType: "Fighter", strength: strengthByUnitId["escort-1"] },
            { faction: "Player", unitKey: "escort-2", unitType: "Interceptor", strength: strengthByUnitId["escort-2"] }
        ],
        bomberStrengthBefore: strengthByUnitId["bomber-1"],
        bomberStrengthAfter: strengthByUnitId["bomber-1"],
        bomberDestroyed: false,
        interceptorAttrition: 0,
        interceptorKills: 0,
        escortAttrition: 0,
        escortKills: 0,
        escortsEngaged: 2,
        interceptorsAfterEscortPhase: 3,
        escortsAfterEscortPhase: 2,
        escortExchanges: [
            {
                phase: "escortClash",
                attackerFaction: "Bot",
                attackerUnitKey: "cap-1",
                attackerUnitType: "Fighter",
                defenderFaction: "Player",
                defenderUnitKey: "escort-1",
                defenderUnitType: "Fighter",
                attackerStrengthBefore: 25,
                attackerStrengthAfter: 25,
                defenderStrengthBefore: 25,
                defenderStrengthAfter: 25,
                damageToDefender: 0,
                retaliationDamage: 0,
                attackerDestroyed: false,
                defenderDestroyed: false,
                visualPasses: 1
            },
            {
                phase: "escortClash",
                attackerFaction: "Bot",
                attackerUnitKey: "cap-2",
                attackerUnitType: "Interceptor",
                defenderFaction: "Player",
                defenderUnitKey: "escort-2",
                defenderUnitType: "Interceptor",
                attackerStrengthBefore: 25,
                attackerStrengthAfter: 25,
                defenderStrengthBefore: 25,
                defenderStrengthAfter: 25,
                damageToDefender: 0,
                retaliationDamage: 0,
                attackerDestroyed: false,
                defenderDestroyed: false,
                visualPasses: 1
            }
        ],
        bomberPassExchanges: [
            {
                phase: "bomberPass",
                attackerFaction: "Bot",
                attackerUnitKey: "cap-1",
                attackerUnitType: "Fighter",
                defenderFaction: "Player",
                defenderUnitKey: "bomber-1",
                defenderUnitType: "Bomber",
                attackerStrengthBefore: 25,
                attackerStrengthAfter: 25,
                defenderStrengthBefore: 100,
                defenderStrengthAfter: 100,
                damageToDefender: 0,
                retaliationDamage: 0,
                attackerDestroyed: false,
                defenderDestroyed: false,
                visualPasses: 1
            },
            {
                phase: "bomberPass",
                attackerFaction: "Bot",
                attackerUnitKey: "cap-2",
                attackerUnitType: "Interceptor",
                defenderFaction: "Player",
                defenderUnitKey: "bomber-1",
                defenderUnitType: "Bomber",
                attackerStrengthBefore: 25,
                attackerStrengthAfter: 25,
                defenderStrengthBefore: 100,
                defenderStrengthAfter: 100,
                damageToDefender: 0,
                retaliationDamage: 0,
                attackerDestroyed: false,
                defenderDestroyed: false,
                visualPasses: 1
            },
            {
                phase: "bomberPass",
                attackerFaction: "Bot",
                attackerUnitKey: "cap-3",
                attackerUnitType: "Fighter",
                defenderFaction: "Player",
                defenderUnitKey: "bomber-1",
                defenderUnitType: "Bomber",
                attackerStrengthBefore: 25,
                attackerStrengthAfter: 25,
                defenderStrengthBefore: 100,
                defenderStrengthAfter: 100,
                damageToDefender: 0,
                retaliationDamage: 0,
                attackerDestroyed: false,
                defenderDestroyed: false,
                visualPasses: 1
            }
        ],
        interceptorStrengthsAfterEscortPhase: [25, 25, 25],
        escortStrengthsAfterEscortPhase: [25, 25],
        interceptorFinalStrengths: [25, 25, 25],
        escortFinalStrengths: [25, 25]
    };
    const flakEvent = {
        type: "flak",
        missionId,
        location: { q: 7, r: 5 },
        bomber: {
            faction: "Player",
            unitKey: "bomber-1",
            unitType: "Bomber",
            strength: strengthByUnitId["bomber-1"]
        },
        interceptors: [
            {
                faction: "Bot",
                unitKey: "flak-1",
                unitType: "Flak_88",
                strength: 100,
                hex: { q: 7, r: 4 }
            },
            {
                faction: "Bot",
                unitKey: "flak-2",
                unitType: "Flak_88",
                strength: 100,
                hex: { q: 7, r: 6 }
            }
        ],
        escorts: [],
        flakDamage: 0,
        bomberStrengthBefore: strengthByUnitId["bomber-1"],
        bomberStrengthAfter: strengthByUnitId["bomber-1"],
        bomberDestroyed: false
    };
    const linkedEscortFlights = [
        {
            missionId: "escort-live-1",
            faction: "Player",
            kind: "escort",
            unitKey: "escort-1",
            originKey: originKeysByUnitId["escort-1"],
            destKey: locKey,
            unitType: "Fighter",
            strength: strengthByUnitId["escort-1"],
            laneOffsetPx: -27,
            escortTargetUnitKey: "bomber-1"
        },
        {
            missionId: "escort-live-2",
            faction: "Player",
            kind: "escort",
            unitKey: "escort-2",
            originKey: originKeysByUnitId["escort-2"],
            destKey: locKey,
            unitType: "Interceptor",
            strength: strengthByUnitId["escort-2"],
            laneOffsetPx: 27,
            escortTargetUnitKey: "bomber-1"
        }
    ];
    return {
        missionId,
        locKey,
        bomberOriginKey,
        bomberTargetKey,
        bomberArrivalDelayMs,
        renderScenario,
        engagement,
        flakEvent,
        linkedEscortFlights,
        originKeysByUnitId,
        strengthByUnitId,
        playerHqKey,
        botHqKey
    };
}
