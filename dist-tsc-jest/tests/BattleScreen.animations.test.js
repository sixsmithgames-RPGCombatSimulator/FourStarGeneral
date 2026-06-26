import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
/**
 * Verifies that player attack flow awaits HexMapRenderer.playAttackSequence before applying combat resolution.
 * Also validates that hard/soft target selection is derived from the defender's unit class.
 */
registerTest("BATTLESCREEN_PLAYER_ATTACK_AWAITS_ANIMATION", async ({ Given, When, Then }) => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((cb) => {
        cb();
        return 0;
    });
    try {
        // Minimal DOM root required by BattleScreen constructor
        const root = document.createElement("div");
        root.id = "battleScreen";
        document.body.appendChild(root);
        // Track the order of operations across stubs
        let animationCalled = false;
        let hardTargetFlag = null;
        const focusedHexes = [];
        // Fake engine exposing only the methods/fields used by executePendingAttack() and renderEngineUnits()
        const fakeEngine = {
            playerUnits: [],
            botUnits: [],
            getSupportSnapshot() {
                return { queued: [] };
            },
            getScheduledAirMissions() {
                return [];
            },
            getTurnSummary() {
                return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
            },
            previewAttack(_a, _d) {
                const result = {
                    accuracy: 60,
                    shots: 4,
                    damagePerHit: 5,
                    expectedHits: 2,
                    expectedDamage: 10,
                    expectedSuppression: 0,
                    effectiveAP: 2,
                    facingArmor: 1,
                    accuracyBreakdown: {
                        baseRange: 60,
                        commanderScalar: 1,
                        afterCommander: 60,
                        experienceScalar: 1,
                        afterExperience: 60,
                        terrainModifier: 0,
                        terrainMultiplier: 1,
                        afterTerrain: 60,
                        spottedMultiplier: 1,
                        finalPreClamp: 60,
                        final: 60
                    },
                    damageBreakdown: {
                        baseTableValue: 5,
                        experienceScalar: 1,
                        afterExperience: 5,
                        commanderScalar: 1,
                        final: 5
                    }
                };
                return {
                    attacker: {
                        type: "Infantry_42",
                        hex: { q: 0, r: 0 },
                        strength: 100,
                        experience: 0,
                        ammo: 6,
                        fuel: 0,
                        entrench: 0,
                        facing: "NW"
                    },
                    defender: {
                        // Infantry defender should be treated as a soft target (hardTargetFlag === false)
                        type: "Infantry_42",
                        hex: { q: 0, r: 1 },
                        strength: 100,
                        experience: 0,
                        ammo: 6,
                        fuel: 0,
                        entrench: 0,
                        facing: "SE"
                    },
                    result,
                    commander: { accBonus: 0, dmgBonus: 0 },
                    damageMultiplier: 1,
                    suppressionMultiplier: 1,
                    finalDamagePerHit: 5,
                    finalExpectedDamage: 10,
                    finalExpectedSuppression: 0,
                    expectedRetaliation: 0,
                    retaliationPossible: false,
                    retaliationNote: "No return fire expected."
                };
            },
            attackUnit(_a, _d) {
                // Assert animation finished before combat resolution is applied
                if (!animationCalled) {
                    throw new Error("Expected animation to complete before attackUnit was invoked");
                }
                return {
                    result: {
                        accuracy: 60,
                        shots: 4,
                        damagePerHit: 5,
                        expectedHits: 2,
                        expectedDamage: 10,
                        expectedSuppression: 0,
                        effectiveAP: 2,
                        facingArmor: 1,
                        accuracyBreakdown: {
                            baseRange: 60,
                            commanderScalar: 1,
                            afterCommander: 60,
                            experienceScalar: 1,
                            afterExperience: 60,
                            terrainModifier: 0,
                            terrainMultiplier: 1,
                            afterTerrain: 60,
                            spottedMultiplier: 1,
                            finalPreClamp: 60,
                            final: 60
                        },
                        damageBreakdown: {
                            baseTableValue: 5,
                            experienceScalar: 1,
                            afterExperience: 5,
                            commanderScalar: 1,
                            final: 5
                        }
                    },
                    defenderRemainingStrength: 90,
                    defenderDestroyed: false,
                    retaliationOccurred: false
                };
            }
        };
        // Stub BattleState facade with the minimal API consumed by BattleScreen in this path
        const fakeBattleState = {
            hasEngine() {
                return true;
            },
            ensureGameEngine() {
                return fakeEngine;
            },
            tryGetGameEngine() {
                return fakeEngine;
            },
            emitBattleUpdate() {
            },
            getCurrentTurnSummary() {
                return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
            },
            getIdlePlayerUnitKeys() {
                return [];
            }
        };
        // Renderer stub capturing the animation call and returning a resolvable promise
        const fakeRenderer = {
            async playAttackSequence(attKey, defKey, isHardTarget) {
                // Record the flag and mark as completed before resolving so subsequent code sees animation finished
                hardTargetFlag = isHardTarget;
                animationCalled = true;
            },
            syncQueuedTargetMarkers: () => { },
            markHexWrecked: () => { },
            markHexDamaged: () => { },
            advanceAftermathTurn: () => { },
            renderUnit: () => { },
            clearUnit: () => { },
            applyHexSelection: () => { }
        };
        let screen;
        await Given("a BattleScreen instance with stubbed engine and renderer", async () => {
            screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
            screen.focusCameraOnHex = async (hexKey) => {
                focusedHexes.push(hexKey);
            };
        });
        await When("executePendingAttack runs between two adjacent hexes", async () => {
            const attacker = { q: 0, r: 0 };
            const defender = { q: 0, r: 1 };
            await screen.executePendingAttack(attacker, defender);
        });
        await Then("the animation completes before damage is applied and defender is treated as soft target", async () => {
            if (!animationCalled) {
                throw new Error("Expected playAttackSequence to be invoked");
            }
            if (focusedHexes[0] !== "0,1") {
                throw new Error(`Expected player attack flow to focus defender hex 0,1 before animation, saw ${focusedHexes[0] ?? "nothing"}.`);
            }
            if (hardTargetFlag !== false) {
                throw new Error(`Expected soft target (false), saw ${hardTargetFlag}`);
            }
        });
    }
    finally {
        window.setTimeout = originalSetTimeout;
    }
});
/**
 * Verifies that bot attack animation uses hard-target explosion choice for tank-class defenders
 * and awaits the effect before proceeding.
 */
registerTest("BATTLESCREEN_BOT_ATTACK_ANIMATION_HARD_TARGET", async ({ Given, When, Then }) => {
    // Minimal DOM root required by BattleScreen constructor
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
        root.id = "battleScreen";
        document.body.appendChild(root);
    }
    // Make timeouts run instantly so the sequence doesn't stall the test
    const originalSetTimeout = window.setTimeout;
    // @ts-expect-error – deliberately narrowing signature in test context
    window.setTimeout = (cb) => {
        cb();
        return 0;
    };
    let lastHardTargetFlag = null;
    let animationCount = 0;
    const focusedHexes = [];
    const fakeEngine = {
        playerUnits: [],
        botUnits: [],
        getSupportSnapshot() {
            return { queued: [] };
        },
        getScheduledAirMissions() {
            return [];
        },
        getTurnSummary() {
            return { phase: "botTurn", activeFaction: "Bot", turnNumber: 1 };
        }
    };
    const fakeBattleState = {
        hasEngine: () => true,
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        getIdlePlayerUnitKeys: () => [],
        getCurrentTurnSummary: () => ({ phase: "botTurn", activeFaction: "Bot", turnNumber: 1 })
    };
    const fakeRenderer = {
        async playAttackSequence(_attKey, _defKey, isHardTarget) {
            lastHardTargetFlag = isHardTarget;
            animationCount += 1;
        },
        syncQueuedTargetMarkers: () => { },
        markHexWrecked: () => { },
        markHexDamaged: () => { },
        advanceAftermathTurn: () => { },
        renderUnit: () => { },
        clearUnit: () => { },
        applyHexSelection: () => { }
    };
    let screen;
    await Given("a BattleScreen instance for bot animation test", async () => {
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
        screen.focusCameraOnHex = async (hexKey) => {
            focusedHexes.push(hexKey);
        };
    });
    const summary = {
        moves: [],
        attacks: [
            {
                attackerType: "Infantry_42",
                defenderType: "Panzer_IV",
                from: { q: 0, r: 0 },
                target: { q: 0, r: 1 },
                inflictedDamage: 0,
                defenderDestroyed: false
            }
        ],
        supplyReport: null
    };
    await When("the bot attack sequence is played", async () => {
        await screen.playBotTurnAnimations(summary);
    });
    await Then("the renderer receives a hard-target flag and an animation call", async () => {
        if (animationCount < 1) {
            throw new Error("Expected at least one bot attack animation to run");
        }
        if (lastHardTargetFlag !== true) {
            throw new Error(`Expected hard target (true) for tank-class defender, saw ${lastHardTargetFlag}`);
        }
    });
    // Restore timeout behavior for subsequent tests
    window.setTimeout = originalSetTimeout;
});
registerTest("BATTLESCREEN_SUPPORT_ARTILLERY_IMPACTS_WAIT_FOR_FOCUS_AND_USE_BARRAGE", async ({ Given, When, Then }) => {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
        root.id = "battleScreen";
        document.body.appendChild(root);
    }
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((cb) => {
        cb();
        return 0;
    });
    const callOrder = [];
    let explosionCalls = 0;
    let barrageCalls = 0;
    const fakeEngine = {
        botUnits: [
            {
                type: "Recon_Bike",
                hex: { q: 8, r: 1 },
                strength: 78,
                experience: 0,
                ammo: 4,
                fuel: 30,
                entrench: 0,
                facing: "NW"
            }
        ],
        getSupportSnapshot() {
            return { queued: [] };
        },
        getScheduledAirMissions() {
            return [];
        },
        getTurnSummary() {
            return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
        }
    };
    const fakeBattleState = {
        hasEngine: () => true,
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine
    };
    const fakeRenderer = {
        async playArtillerySupportImpact() {
            callOrder.push("barrage");
            barrageCalls += 1;
        },
        async playExplosion() {
            explosionCalls += 1;
        },
        markHexWrecked: () => { },
        markHexDamaged: () => { },
        advanceAftermathTurn: () => { },
        renderUnit: () => { },
        clearUnit: () => { },
        applyHexSelection: () => { },
        syncQueuedTargetMarkers: () => { }
    };
    let screen;
    await Given("a battle screen with a queued support impact", async () => {
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
        screen.focusCameraOnHex = async (hexKey) => {
            callOrder.push(`focus:${hexKey}`);
        };
        screen.freezeCamera = () => { };
        screen.unfreezeCamera = () => { };
        screen.renderEngineUnits = () => { };
        screen.announceBattleUpdate = () => { };
        screen.publishActivityEvent = () => { };
    });
    await When("support artillery impacts are played", async () => {
        await screen.playSupportImpacts([
            {
                assetId: "support-artillery-alpha",
                label: "Corps Artillery Group",
                targetHex: { q: 8, r: 1 },
                targetFaction: "Bot",
                hit: true,
                damage: 22,
                destroyed: false,
                targetUnitType: "Recon_Bike"
            }
        ]);
    });
    await Then("the camera focuses before the barrage starts and the single-pop helper is not used", async () => {
        if (callOrder[0] !== "focus:8,5" || callOrder[1] !== "barrage") {
            throw new Error(`Expected support impact flow to focus hex 8,5 before barrage, saw ${callOrder.join(" -> ") || "nothing"}.`);
        }
        if (barrageCalls !== 1) {
            throw new Error(`Expected exactly one artillery barrage call, found ${barrageCalls}.`);
        }
        if (explosionCalls !== 0) {
            throw new Error(`Expected support artillery path to avoid playExplosion, found ${explosionCalls} call(s).`);
        }
    });
    window.setTimeout = originalSetTimeout;
});
registerTest("BATTLESCREEN_ATTACK_DIALOG_PRESERVES_ASSAULT_SELECTION", async ({ Given, When, Then }) => {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    root.id = "battleScreen";
    root.innerHTML = `
    <div id="battleAttackConfirm" class="battle-dialog hidden" aria-hidden="true">
      <div class="battle-dialog__surface">
        <div class="attack-stance-selector">
          <label class="stance-label">Combat Stance:</label>
          <div class="stance-buttons">
            <button type="button" id="stanceAssault" class="stance-button" data-stance="assault">
              <span class="stance-heading">
                <span class="stance-name">Assault</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
            <button type="button" id="stanceSuppressive" class="stance-button" data-stance="suppressive">
              <span class="stance-heading">
                <span class="stance-name">Suppressive</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
          </div>
        </div>
        <div id="battleAttackConfirmBody"></div>
        <button type="button" id="battleAttackConfirmAccept">Attack</button>
        <button type="button" id="battleAttackConfirmCancel">Cancel</button>
      </div>
    </div>
  `;
    if (!root.parentElement) {
        document.body.appendChild(root);
    }
    let lastRequestedStance;
    const fakeEngine = {
        getPlayerPlacementsSnapshot() {
            return [
                {
                    type: "Infantry_42",
                    hex: { q: 0, r: 0 },
                    strength: 100,
                    experience: 0,
                    ammo: 6,
                    fuel: 0,
                    entrench: 0,
                    facing: "NW"
                }
            ];
        },
        getHexStackMembers() {
            return [
                {
                    unitId: "u_inf_1",
                    unit: {
                        type: "Infantry_42",
                        hex: { q: 0, r: 0 },
                        strength: 100,
                        experience: 0,
                        ammo: 6,
                        fuel: 0,
                        entrench: 0,
                        facing: "NW"
                    },
                    faction: "Player"
                }
            ];
        },
        getUnitCommandState() {
            return {
                suppressionState: "clear",
                suppressorCount: 0
            };
        },
        getTurnSummary() {
            return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
        },
        previewAttack(_a, _d, stance) {
            lastRequestedStance = stance;
            const result = {
                accuracy: stance === "assault" ? 60 : 40,
                shots: 4,
                damagePerHit: 5,
                expectedHits: 2,
                expectedDamage: 10,
                expectedSuppression: 2,
                effectiveAP: 2,
                facingArmor: 1,
                accuracyBreakdown: {
                    baseRange: stance === "assault" ? 60 : 40,
                    commanderScalar: 1,
                    afterCommander: stance === "assault" ? 60 : 40,
                    experienceScalar: 1,
                    afterExperience: stance === "assault" ? 60 : 40,
                    terrainModifier: 0,
                    terrainMultiplier: 1,
                    afterTerrain: stance === "assault" ? 60 : 40,
                    spottedMultiplier: 1,
                    finalPreClamp: stance === "assault" ? 60 : 40,
                    final: stance === "assault" ? 60 : 40
                },
                damageBreakdown: {
                    baseTableValue: 5,
                    experienceScalar: 1,
                    afterExperience: 5,
                    commanderScalar: 1,
                    final: 5
                }
            };
            return {
                attacker: {
                    type: "Infantry_42",
                    hex: { q: 0, r: 0 },
                    strength: 100,
                    experience: 0,
                    ammo: 6,
                    fuel: 0,
                    entrench: 0,
                    facing: "NW"
                },
                defender: {
                    type: "Infantry_42",
                    hex: { q: 0, r: 1 },
                    strength: 100,
                    experience: 0,
                    ammo: 6,
                    fuel: 0,
                    entrench: 0,
                    facing: "SE"
                },
                result,
                commander: { accBonus: 0, dmgBonus: 0 },
                damageMultiplier: 1,
                suppressionMultiplier: 1,
                finalDamagePerHit: 5,
                finalExpectedDamage: 10,
                finalExpectedSuppression: 2,
                expectedRetaliation: 4,
                retaliationPossible: true
            };
        }
    };
    const fakeBattleState = {
        hasEngine: () => true,
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        getIdlePlayerUnitKeys: () => [],
        getCurrentTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 }),
        getPrecombatMissionInfo: () => null
    };
    let screen;
    await Given("a battle screen with an infantry attacker in the confirm-attack dialog", async () => {
        screen = new BattleScreen({}, fakeBattleState, { getActivePopup: () => null, closePopup: () => { } }, null, null, null, null, null, null);
        screen.cacheElements();
        screen.promptAttackConfirmation({ q: 0, r: 0 }, { q: 0, r: 1 });
    });
    await When("the commander switches to assault stance", async () => {
        const assaultBtn = document.getElementById("stanceAssault");
        assaultBtn?.click();
    });
    await Then("the dialog keeps assault selected after the preview refresh", async () => {
        const assaultBtn = document.getElementById("stanceAssault");
        const suppressiveBtn = document.getElementById("stanceSuppressive");
        if (lastRequestedStance !== "assault") {
            throw new Error(`Expected refreshed preview to request assault stance, saw ${lastRequestedStance}`);
        }
        if (!assaultBtn?.classList.contains("stance-active")) {
            throw new Error("Expected assault button to remain visibly selected after refresh.");
        }
        if (suppressiveBtn?.classList.contains("stance-active")) {
            throw new Error("Expected suppressive button to clear its selected state after assault was chosen.");
        }
    });
});
registerTest("BATTLESCREEN_AIR_OPERATIONS_LINK_FLAK_TO_STRIKE_INGRESS", async ({ Given, When, Then }) => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((cb) => {
        cb();
        return 0;
    });
    try {
        const root = document.getElementById("battleScreen") ?? document.createElement("div");
        if (!root.parentElement) {
            root.id = "battleScreen";
            document.body.appendChild(root);
        }
        const callOrder = [];
        const announcements = [];
        const fakeEngine = {
            playerUnits: [],
            botUnits: [
                {
                    type: "Medium_Tank",
                    hex: { q: 0, r: 0 },
                    strength: 74,
                    experience: 0,
                    ammo: 4,
                    fuel: 20,
                    entrench: 0,
                    facing: "NW"
                }
            ],
            reserveUnits: [],
            allyUnits: [],
            getScheduledAirMissions() {
                return [
                    {
                        id: "air-1",
                        targetHex: { q: 0, r: 0 },
                        outcome: {
                            type: "strike",
                            result: "partial",
                            defenderType: "Medium_Tank",
                            defenderDestroyed: false,
                            meta: {
                                flakAttrition: 24,
                                bomberAttrition: 0
                            }
                        }
                    }
                ];
            },
            getTurnSummary() {
                return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
            }
        };
        const fakeBattleState = {
            hasEngine: () => true,
            ensureGameEngine: () => fakeEngine,
            tryGetGameEngine: () => fakeEngine
        };
        const fakeRenderer = {
            async animateAircraftFlyover(fromKey, toKey, _unitType, _durationMs, onProgress, endProgress = 1) {
                callOrder.push(`flight:${fromKey}->${toKey}:${endProgress.toFixed(2)}`);
                onProgress?.(0.72, 180, 120);
                onProgress?.(0.9, 200, 140);
            },
            async playFlakBurstAt(_x, _y, count) {
                callOrder.push(`flak:${count}`);
            },
            async playExplosion(hexKey) {
                callOrder.push(`impact:${hexKey}`);
            },
            async playDustCloud(hexKey) {
                callOrder.push(`dust:${hexKey}`);
            },
            async playDogfight() { },
            async playAirDamageSmokeTrailAt() {
                callOrder.push("trail");
            },
            markHexDamaged: () => {
                callOrder.push("markDamaged");
            },
            markHexWrecked: () => { },
            advanceAftermathTurn: () => { },
            renderUnit: () => { },
            clearUnit: () => { },
            applyHexSelection: () => { },
            syncQueuedTargetMarkers: () => { }
        };
        let screen;
        await Given("a battle screen with a mission-linked flak strike", async () => {
            screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
            screen.focusCameraOnHex = async (hexKey) => {
                callOrder.push(`focus:${hexKey}`);
            };
            screen.renderEngineUnits = () => {
                callOrder.push("render");
            };
            screen.announceBattleUpdate = (message) => {
                announcements.push(message);
            };
        });
        const arrivals = [
            {
                missionId: "air-1",
                faction: "Player",
                unitKey: "u_bomber",
                originHexKey: "1,0",
                unitType: "Bomber",
                kind: "strike",
                targetHex: { q: 0, r: 0 }
            }
        ];
        const engagements = [
            {
                type: "flak",
                missionId: "air-1",
                location: { q: 0, r: 0 },
                bomber: { faction: "Player", unitKey: "u_bomber", unitType: "Bomber" },
                interceptors: [
                    { faction: "Bot", unitKey: "aa-1", unitType: "Flak_88", hex: { q: 0, r: 1 } },
                    { faction: "Bot", unitKey: "aa-2", unitType: "Flak_88", hex: { q: 1, r: 1 } }
                ],
                escorts: [],
                flakDamage: 24,
                bomberStrengthBefore: 100,
                bomberStrengthAfter: 76,
                bomberDestroyed: false
            }
        ];
        await When("air operations are played", async () => {
            await screen.playAirOperations(arrivals, engagements);
        });
        await Then("flak bursts occur during ingress before the strike impact and the bomber returns", async () => {
            if (callOrder[0] !== "focus:0,0") {
                throw new Error(`Expected focus on the target hex before air playback, saw ${callOrder[0] ?? "nothing"}.`);
            }
            const flakIndex = callOrder.findIndex((entry) => entry.startsWith("flak:"));
            const impactIndex = callOrder.findIndex((entry) => entry.startsWith("impact:"));
            const returnFlightIndex = callOrder.findIndex((entry) => entry === "flight:0,0->1,0:1.00");
            if (flakIndex < 0) {
                throw new Error(`Expected mission-linked flak bursts during ingress, saw ${JSON.stringify(callOrder)}.`);
            }
            if (impactIndex < 0 || flakIndex > impactIndex) {
                throw new Error(`Expected flak to occur before strike impact, saw ${JSON.stringify(callOrder)}.`);
            }
            if (returnFlightIndex < 0) {
                throw new Error(`Expected bomber egress flight after the strike, saw ${JSON.stringify(callOrder)}.`);
            }
            if (!announcements.some((message) => message.includes("2 Flak batteries engaged incoming Bomber. AA damage: 24%. Bomber strength now 76."))) {
                throw new Error(`Expected flak engagement announcement with damage totals, saw ${JSON.stringify(announcements)}.`);
            }
        });
    }
    finally {
        window.setTimeout = originalSetTimeout;
    }
});
registerTest("BATTLESCREEN_AIR_OPERATIONS_STOP_DESTROYED_BOMBER_BEFORE_TARGET", async ({ Given, When, Then }) => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((cb) => {
        cb();
        return 0;
    });
    try {
        const root = document.getElementById("battleScreen") ?? document.createElement("div");
        if (!root.parentElement) {
            root.id = "battleScreen";
            document.body.appendChild(root);
        }
        const callOrder = [];
        const fakeEngine = {
            playerUnits: [],
            botUnits: [],
            reserveUnits: [],
            allyUnits: [],
            getScheduledAirMissions() {
                return [
                    {
                        id: "air-2",
                        targetHex: { q: 0, r: 0 },
                        outcome: {
                            type: "strike",
                            result: "aborted",
                            meta: {
                                flakAttrition: 100,
                                bomberAttrition: 0
                            }
                        }
                    }
                ];
            },
            getTurnSummary() {
                return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
            }
        };
        const fakeBattleState = {
            hasEngine: () => true,
            ensureGameEngine: () => fakeEngine,
            tryGetGameEngine: () => fakeEngine
        };
        const fakeRenderer = {
            async animateAircraftFlyover(fromKey, toKey, _unitType, _durationMs, onProgress, endProgress = 1) {
                callOrder.push(`flight:${fromKey}->${toKey}:${endProgress.toFixed(2)}`);
                onProgress?.(0.74, 180, 120);
            },
            async playFlakBurstAt() {
                callOrder.push("flak");
            },
            async playExplosion() {
                callOrder.push("impact");
            },
            async playDustCloud() {
                callOrder.push("dust");
            },
            async playAirDamageSmokeTrailAt() {
                callOrder.push("trail");
            },
            markHexDamaged: () => { },
            markHexWrecked: () => { },
            advanceAftermathTurn: () => { },
            renderUnit: () => { },
            clearUnit: () => { },
            applyHexSelection: () => { },
            syncQueuedTargetMarkers: () => { }
        };
        let screen;
        await Given("a mission-linked flak event that destroys the bomber", async () => {
            screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
            screen.focusCameraOnHex = async (hexKey) => {
                callOrder.push(`focus:${hexKey}`);
            };
            screen.announceBattleUpdate = () => { };
        });
        const arrivals = [
            {
                missionId: "air-2",
                faction: "Player",
                unitKey: "u_bomber",
                originHexKey: "1,0",
                unitType: "Bomber",
                kind: "strike",
                targetHex: { q: 0, r: 0 }
            }
        ];
        const engagements = [
            {
                type: "flak",
                missionId: "air-2",
                location: { q: 0, r: 0 },
                bomber: { faction: "Player", unitKey: "u_bomber", unitType: "Bomber" },
                interceptors: [
                    { faction: "Bot", unitKey: "aa-1", unitType: "Flak_88", hex: { q: 0, r: 1 } }
                ],
                escorts: [],
                flakDamage: 100,
                bomberStrengthBefore: 100,
                bomberStrengthAfter: 0,
                bomberDestroyed: true
            }
        ];
        await When("the linked air operation plays", async () => {
            await screen.playAirOperations(arrivals, engagements);
        });
        await Then("the bomber stops short of the target and no strike impact or return leg is played", async () => {
            if (!callOrder.includes("flight:1,0->0,0:0.84")) {
                throw new Error(`Expected destroyed bomber ingress to stop short of the target, saw ${JSON.stringify(callOrder)}.`);
            }
            if (callOrder.some((entry) => entry === "impact" || entry === "dust")) {
                throw new Error(`Did not expect a strike impact after bomber destruction, saw ${JSON.stringify(callOrder)}.`);
            }
            if (callOrder.some((entry) => entry === "flight:0,0->1,0:1.00" || entry === "trail")) {
                throw new Error(`Did not expect a return leg for a destroyed bomber, saw ${JSON.stringify(callOrder)}.`);
            }
        });
    }
    finally {
        window.setTimeout = originalSetTimeout;
    }
});
registerTest("BATTLESCREEN_AIR_OPERATIONS_LAUNCH_LINKED_STRIKES_IN_PARALLEL", async ({ Given, When, Then }) => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = ((cb) => {
        cb();
        return 0;
    });
    try {
        const root = document.getElementById("battleScreen") ?? document.createElement("div");
        if (!root.parentElement) {
            root.id = "battleScreen";
            document.body.appendChild(root);
        }
        const startedFlights = [];
        let releaseFlights = null;
        const flightsReleased = new Promise((resolve) => {
            releaseFlights = resolve;
        });
        const fakeEngine = {
            playerUnits: [],
            botUnits: [],
            reserveUnits: [],
            allyUnits: [],
            getScheduledAirMissions() {
                return [];
            },
            getTurnSummary() {
                return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
            }
        };
        const fakeBattleState = {
            hasEngine: () => true,
            ensureGameEngine: () => fakeEngine,
            tryGetGameEngine: () => fakeEngine
        };
        const fakeRenderer = {
            async playFlakBurstAt() { },
            async playExplosion() { },
            async playDustCloud() { },
            async playDogfight() { },
            async playAirDamageSmokeTrailAt() { },
            markHexDamaged: () => { },
            markHexWrecked: () => { },
            advanceAftermathTurn: () => { },
            renderUnit: () => { },
            clearUnit: () => { },
            applyHexSelection: () => { },
            syncQueuedTargetMarkers: () => { }
        };
        let screen;
        await Given("two strike missions resolve with linked flak events", async () => {
            screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
            screen.focusCameraOnHex = async () => { };
            screen.waitForNextFrame = async () => { };
            screen.announceBattleUpdate = () => { };
            screen.publishActivityEvent = () => { };
            screen.renderEngineUnits = () => { };
            screen.collectAirMissionFlights = async () => [
                {
                    missionId: "strike-1",
                    faction: "Bot",
                    kind: "strike",
                    unitKey: "b1",
                    originKey: "0,10",
                    destKey: "12,-6",
                    unitType: "Bomber",
                    strength: 100,
                    laneOffsetPx: -9
                },
                {
                    missionId: "strike-2",
                    faction: "Bot",
                    kind: "strike",
                    unitKey: "b2",
                    originKey: "1,10",
                    destKey: "13,-6",
                    unitType: "Bomber",
                    strength: 100,
                    laneOffsetPx: 9
                }
            ];
            screen.playMissionStrikeOperation = async (flight) => {
                startedFlights.push(flight.missionId);
                await flightsReleased;
            };
        });
        const arrivals = [];
        const engagements = [
            {
                type: "flak",
                missionId: "strike-1",
                location: { q: 12, r: -6 },
                bomber: { faction: "Bot", unitKey: "b1", unitType: "Bomber", strength: 100 },
                interceptors: [{ faction: "Player", unitKey: "aa-1", unitType: "Flak_88", strength: 100, hex: { q: 11, r: -5 } }],
                escorts: [],
                flakDamage: 0,
                bomberStrengthBefore: 100,
                bomberStrengthAfter: 100,
                bomberDestroyed: false
            },
            {
                type: "flak",
                missionId: "strike-2",
                location: { q: 13, r: -6 },
                bomber: { faction: "Bot", unitKey: "b2", unitType: "Bomber", strength: 100 },
                interceptors: [{ faction: "Player", unitKey: "aa-2", unitType: "Flak_88", strength: 100, hex: { q: 12, r: -5 } }],
                escorts: [],
                flakDamage: 0,
                bomberStrengthBefore: 100,
                bomberStrengthAfter: 100,
                bomberDestroyed: false
            }
        ];
        let playback = null;
        await When("the combined air-operations sequence begins", async () => {
            playback = screen.playAirOperations(arrivals, engagements);
            await Promise.resolve();
            await Promise.resolve();
        });
        await Then("both strike packages should start before the first one finishes", async () => {
            if (startedFlights.length < 2) {
                throw new Error(`Expected both strike flights to begin in parallel, saw ${JSON.stringify(startedFlights)}.`);
            }
            releaseFlights?.();
            await playback;
        });
    }
    finally {
        window.setTimeout = originalSetTimeout;
    }
});
registerTest("BATTLESCREEN_STRIKE_USES_CONTINUOUS_SORTIE_WHEN_RENDERER_SUPPORTS_IT", async ({ Given, When, Then }) => {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
        root.id = "battleScreen";
        document.body.appendChild(root);
    }
    const callOrder = [];
    const fakeEngine = {
        playerUnits: [],
        botUnits: [
            {
                type: "Medium_Tank",
                hex: { q: 0, r: 0 },
                strength: 74,
                experience: 0,
                ammo: 4,
                fuel: 20,
                entrench: 0,
                facing: "NW"
            }
        ],
        reserveUnits: [],
        allyUnits: [],
        getScheduledAirMissions() {
            return [
                {
                    id: "sortie-1",
                    targetHex: { q: 0, r: 0 },
                    outcome: {
                        type: "strike",
                        result: "partial",
                        defenderType: "Medium_Tank",
                        defenderDestroyed: false,
                        meta: {
                            flakAttrition: 0,
                            bomberAttrition: 0
                        }
                    }
                }
            ];
        },
        getTurnSummary() {
            return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 };
        }
    };
    const fakeBattleState = {
        hasEngine: () => true,
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine
    };
    const fakeRenderer = {
        async animateAircraftSortie(_fromKey, _toKey, _returnKey, _unitType, options) {
            callOrder.push("sortie-start");
            await options?.onTargetPass?.();
            callOrder.push("sortie-end");
        },
        async animateAircraftFlyover() {
            throw new Error("Expected continuous sortie path instead of separate flyover legs.");
        },
        async playExplosion() {
            callOrder.push("impact");
        },
        async playDustCloud() {
            callOrder.push("dust");
        },
        async playAirDamageSmokeTrailAt() { },
        markHexDamaged: () => {
            callOrder.push("markDamaged");
        },
        markHexWrecked: () => { },
        advanceAftermathTurn: () => { },
        renderUnit: () => { },
        clearUnit: () => { },
        applyHexSelection: () => { },
        syncQueuedTargetMarkers: () => { }
    };
    let screen;
    await Given("a battle screen with renderer support for continuous sorties", async () => {
        screen = new BattleScreen({}, fakeBattleState, {}, fakeRenderer, null, null, null, {}, null);
        screen.focusCameraOnHex = async () => { };
        screen.waitForNextFrame = async () => { };
        screen.announceBattleUpdate = () => { };
        screen.publishActivityEvent = () => { };
        screen.renderEngineUnits = () => { };
    });
    await When("a strike mission plays", async () => {
        await screen.playMissionStrikeOperation({
            missionId: "sortie-1",
            faction: "Player",
            kind: "strike",
            unitKey: "u_bomber",
            originKey: "1,0",
            destKey: "0,0",
            unitType: "Bomber",
            strength: 100,
            laneOffsetPx: 0
        }, [], [], fakeRenderer, fakeEngine, true);
    });
    await Then("impact resolves during the sortie rather than after a separate return animation", async () => {
        const sortieStartIndex = callOrder.indexOf("sortie-start");
        const impactIndex = callOrder.indexOf("impact");
        const sortieEndIndex = callOrder.indexOf("sortie-end");
        if (sortieStartIndex < 0 || impactIndex < 0 || sortieEndIndex < 0) {
            throw new Error(`Expected sortie start, impact, and sortie end markers, saw ${JSON.stringify(callOrder)}.`);
        }
        if (!(sortieStartIndex < impactIndex && impactIndex < sortieEndIndex)) {
            throw new Error(`Expected impact to occur during the continuous sortie, saw ${JSON.stringify(callOrder)}.`);
        }
    });
});
registerTest("BATTLESCREEN_INITIATIVE_BOT_RETALIATION_WAITS_FOR_FOCUS_PACING", async ({ Given, When, Then }) => {
    let screen;
    const focusCalls = [];
    const sequenceCalls = [];
    const waitDurations = [];
    await Given("an initiative bot activation that includes retaliation", async () => {
        screen = Object.create(BattleScreen.prototype);
        screen.isInitiativeSystemEnabled = true;
        screen.battleAnimationMode = "regular";
        screen.mapViewport = {};
        screen.hexMapRenderer = {
            playAttackSequence: async (attackerHexKey, defenderHexKey, isHardTarget) => {
                sequenceCalls.push(`${attackerHexKey}->${defenderHexKey}:${isHardTarget ? "hard" : "soft"}`);
            }
        };
        screen.unitTypes = {
            Infantry_42: { class: "infantry" },
            Panzer_IV: { class: "tank" }
        };
        screen.toOffsetHexKey = (hex) => (hex ? `${hex.q},${hex.r}` : null);
        screen.isBotUnitVisibleToPlayer = () => false;
        screen.waitForNextFrame = async () => { };
        screen.waitMs = async (durationMs) => {
            waitDurations.push(durationMs);
        };
        screen.focusCameraOnHex = async (hexKey) => {
            focusCalls.push(hexKey);
        };
        screen.renderEngineUnits = () => { };
        screen.logInitiativeBotActivationActivity = () => { };
        screen.toMovePathKeys = () => [];
        screen.resolveMoveAnimationDuration = () => 0;
    });
    await When("the activation animation pipeline runs", async () => {
        await screen.handleInitiativeBotActivation({
            unitId: "u_bot_1",
            ownerId: "bot",
            unitType: "Infantry_42",
            moved: false,
            fromHex: { q: 4, r: 4 },
            toHex: { q: 4, r: 4 },
            visibleBefore: false,
            visibleAfter: false,
            attacks: [
                {
                    attackerType: "Infantry_42",
                    defenderType: "Panzer_IV",
                    fromHex: { q: 4, r: 4 },
                    targetHex: { q: 4, r: 5 },
                    inflictedDamage: 9,
                    defenderDestroyed: false,
                    retaliation: {
                        damage: 6,
                        attackerStrengthAfter: 84
                    }
                }
            ]
        });
    });
    await Then("camera focus and pacing include a retaliation beat before completion", async () => {
        const expectedFocus = ["4,4", "4,5", "4,4"];
        if (focusCalls.length !== expectedFocus.length || focusCalls.some((value, index) => value !== expectedFocus[index])) {
            throw new Error(`Expected focus order ${JSON.stringify(expectedFocus)}, received ${JSON.stringify(focusCalls)}.`);
        }
        const expectedSequences = ["4,4->4,5:hard", "4,5->4,4:soft"];
        if (sequenceCalls.length !== expectedSequences.length ||
            sequenceCalls.some((value, index) => value !== expectedSequences[index])) {
            throw new Error(`Expected attack sequence order ${JSON.stringify(expectedSequences)}, received ${JSON.stringify(sequenceCalls)}.`);
        }
        const hasTargetSettlePause = waitDurations.includes(240);
        const retaliationPauseCount = waitDurations.filter((duration) => duration === 220).length;
        if (!hasTargetSettlePause || retaliationPauseCount < 2) {
            throw new Error(`Expected pacing waits to include target settle (240ms) and retaliation beats (>=2x220ms), received ${JSON.stringify(waitDurations)}.`);
        }
    });
});
