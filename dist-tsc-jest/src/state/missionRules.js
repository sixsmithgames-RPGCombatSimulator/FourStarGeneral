import unitTypesData from "../data/unitTypes.json";
function makeKey(hex) {
    return `${hex.q},${hex.r}`;
}
function isFriendlyOccupant(faction) {
    return faction === "Player" || faction === "Ally";
}
function toPercent(value) {
    return `${Math.max(0, Math.round(value * 100))}%`;
}
function getGroundForceScore(units) {
    return units.reduce((total, unit) => {
        const definition = unitTypesData[unit.type];
        if (!definition || definition.moveType === "air") {
            return total;
        }
        const strengthRatio = Math.max(0, Math.min(100, Number(unit.strength ?? 100))) / 100;
        return total + definition.cost * strengthRatio;
    }, 0);
}
function createRiverWatchPhase(turnNumber, blockedFordsStreak, difficulty) {
    if (difficulty !== "Easy" && blockedFordsStreak >= 2) {
        return {
            id: "phase3_escalation",
            label: "Phase 3: Reserve Pressure",
            detail: "All three fords have been blocked for two turns. Expect reserve pressure and indirect probing before dawn.",
            announcement: "River Watch escalation: your line has blocked every ford long enough to trigger reserve pressure."
        };
    }
    if (turnNumber >= 4) {
        return {
            id: "phase2_commitment",
            label: "Phase 2: Commitment",
            detail: "Enemy probes are giving way to coordinated pressure across multiple crossings. Keep your response force mobile.",
            announcement: "River Watch escalation: enemy pressure is building across multiple crossings."
        };
    }
    return {
        id: "phase1_probe",
        label: "Phase 1: Probe",
        detail: "Small infiltration teams are testing the river line. Screen the crossings and avoid overcommitting too early.",
        announcement: "River Watch is underway: enemy probes are testing the fords."
    };
}
function createRiverWatchController(scenario, difficulty) {
    const fordKeys = (scenario.objectives ?? []).map((objective, index) => ({
        key: makeKey(objective.hex),
        label: `Ford ${index + 1}`,
        hex: objective.hex
    }));
    const tracker = {
        counters: new Map(),
        outcome: { state: "inProgress" },
        blockedFordsStreak: 0,
        phase: createRiverWatchPhase(0, 0, difficulty)
    };
    const buildObjectives = (outcome, playerUnits, botUnits) => {
        const primary = {
            id: "primary_deny_fords",
            label: "Hold all fords for 8 consecutive turns",
            tier: "primary",
            state: outcome.state === "playerDefeat" ? "failed" : outcome.state === "playerVictory" ? "completed" : "inProgress",
            detail: `Player hold all: ${tracker.blockedFordsStreak}/8 turns; ${fordKeys
                .map(({ key, label }) => {
                const count = tracker.counters.get(key) ?? 0;
                return `${label}: Bot hold ${count}/8 turns`;
            })
                .join("; ")}`
        };
        const commsDestroyed = botUnits.every((unit) => unit.type !== "Recon_Bike");
        const secondary = {
            id: "secondary_destroy_comms",
            label: "Destroy the enemy comms team before it reaches the central ford",
            tier: "secondary",
            state: commsDestroyed
                ? "completed"
                : outcome.state === "inProgress"
                    ? "inProgress"
                    : "failed",
            detail: commsDestroyed
                ? "Enemy comms team eliminated before the patrol withdrew."
                : outcome.state === "inProgress"
                    ? "Enemy comms team remains active."
                    : "Enemy comms team survived the patrol action."
        };
        const playerReconAlive = playerUnits.some((unit) => unit.type === "Recon_Bike");
        const tertiary = {
            id: "tertiary_keep_recon",
            label: "Keep at least one recon unit alive",
            tier: "tertiary",
            state: playerReconAlive
                ? outcome.state === "inProgress"
                    ? "inProgress"
                    : "completed"
                : "failed",
            detail: playerReconAlive
                ? outcome.state === "inProgress"
                    ? "At least one recon element remains operational."
                    : "Recon element survived through mission resolution."
                : "All recon elements were lost before mission end."
        };
        return [primary, secondary, tertiary];
    };
    const buildMarkers = (occupancy) => {
        return fordKeys.map(({ key, label, hex }) => {
            const occupant = occupancy.get(key);
            const counter = tracker.counters.get(key) ?? 0;
            if (occupant === "Bot") {
                return {
                    hex,
                    status: "enemy",
                    counter: `${counter}/8`,
                    tooltip: `${label} - Enemy controlled. Enemy has held for ${counter} of 8 turns.`
                };
            }
            if (isFriendlyOccupant(occupant)) {
                const allFordsHeld = fordKeys.every(({ key: fordKey }) => isFriendlyOccupant(occupancy.get(fordKey)));
                return {
                    hex,
                    status: "player",
                    tooltip: allFordsHeld
                        ? `${label} - Secured. All fords have been held for ${tracker.blockedFordsStreak} of 8 turns.`
                        : `${label} - Secured. This crossing is held, but every ford must be held at once to win.`
                };
            }
            return {
                hex,
                status: "unoccupied",
                tooltip: `${label} - Contested. Move onto the ford and hold every crossing at once.`
            };
        });
    };
    const deriveStatus = (snapshot) => {
        const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
        const turnLimit = snapScenario.turnLimit ?? null;
        let outcome = tracker.outcome;
        const allFordsBlocked = fordKeys.length > 0 && fordKeys.every(({ key }) => {
            const occupant = occupancy.get(key);
            return occupant === "Player" || occupant === "Ally";
        });
        tracker.blockedFordsStreak = allFordsBlocked ? tracker.blockedFordsStreak + 1 : 0;
        tracker.phase = createRiverWatchPhase(turnSummary.turnNumber, tracker.blockedFordsStreak, difficulty);
        // Check for unit elimination victory/defeat conditions
        if (outcome.state === "inProgress") {
            if (botUnits.length === 0) {
                outcome = { state: "playerVictory", reason: "All enemy forces eliminated." };
            }
            else if (playerUnits.length === 0) {
                outcome = { state: "playerDefeat", reason: "All friendly forces eliminated." };
            }
        }
        // Check ford control for defeat (enemy holds any ford for 8 turns)
        fordKeys.forEach(({ key }) => {
            const occupant = occupancy.get(key);
            const heldByBot = occupant === "Bot";
            const previous = tracker.counters.get(key) ?? 0;
            const next = heldByBot ? previous + 1 : 0;
            tracker.counters.set(key, next);
            if (heldByBot && next >= 8 && outcome.state === "inProgress") {
                outcome = { state: "playerDefeat", reason: "Enemy secured a ford for 8 turns." };
            }
        });
        // Check for victory by denying all fords for 8 consecutive turns
        if (tracker.blockedFordsStreak >= 8 && outcome.state === "inProgress") {
            outcome = { state: "playerVictory", reason: "Denied enemy control of all fords for 8 turns." };
        }
        // Turn limit fallback (should never be reached with turnLimit = 999)
        if (turnLimit !== null && turnLimit < 999 && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
            outcome = { state: "playerVictory", reason: "Held river line through the final turn." };
        }
        tracker.outcome = outcome;
        return {
            turn: turnSummary.turnNumber,
            objectives: buildObjectives(outcome, playerUnits, botUnits),
            outcome,
            phase: tracker.phase,
            markers: buildMarkers(occupancy)
        };
    };
    return {
        onTurnAdvanced(snapshot) {
            return deriveStatus(snapshot);
        },
        getStatus() {
            return {
                turn: 0,
                objectives: buildObjectives(tracker.outcome, scenario.sides.Player.units, scenario.sides.Bot.units),
                outcome: tracker.outcome,
                phase: tracker.phase,
                markers: buildMarkers(new Map())
            };
        }
    };
}
function createTownDefenseController(scenario) {
    const townHex = scenario.objectives[0]?.hex ?? scenario.sides.Player.hq;
    const townKey = makeKey(townHex);
    const turnLimit = scenario.turnLimit ?? null;
    const initialBotForce = Math.max(getGroundForceScore(scenario.sides.Bot.units), 1);
    const tracker = {
        outcome: { state: "inProgress" },
        initialFriendlyForce: null
    };
    const buildObjective = (outcome, townOccupant, enemyForceRatio, friendlyForceRatio) => {
        const townStatus = townOccupant === "Bot"
            ? "Enemy formations are inside the town center."
            : isFriendlyOccupant(townOccupant)
                ? "Friendly forces are holding the town center."
                : "The town center is currently exposed.";
        const forceStatus = `Enemy assault strength is at ${toPercent(enemyForceRatio)} of its opening force; defenders retain ${toPercent(friendlyForceRatio)} of their starting combat power.`;
        return {
            id: "primary_repel_enemy",
            label: "Repel the enemy assault and keep the town in friendly hands",
            tier: "primary",
            state: outcome.state === "playerVictory" ? "completed" : outcome.state === "playerDefeat" ? "failed" : "inProgress",
            detail: outcome.state === "playerVictory"
                ? outcome.reason ?? "The enemy assault collapsed and withdrew from the town."
                : outcome.state === "playerDefeat"
                    ? outcome.reason ?? "The defense failed before the assault could be broken."
                    : `${townStatus} ${forceStatus}`
        };
    };
    const buildMarker = (outcome, townOccupant, enemyForceRatio, friendlyForceRatio) => {
        const status = townOccupant === "Bot"
            ? "enemy"
            : isFriendlyOccupant(townOccupant)
                ? "player"
                : "unoccupied";
        const tooltip = outcome.state === "playerVictory"
            ? `Town center - Secure. ${outcome.reason ?? "The enemy assault has broken and is retreating."}`
            : outcome.state === "playerDefeat"
                ? `Town center - Lost. ${outcome.reason ?? "The defense failed before the assault could be broken."}`
                : `Town center - ${status === "enemy" ? "Enemy pressure" : status === "player" ? "Defenders holding" : "Contested"}. Hold the objective and repel all enemies.`;
        return {
            hex: townHex,
            status,
            tooltip
        };
    };
    const deriveStatus = (snapshot) => {
        const { turnSummary, occupancy, playerUnits, botUnits } = snapshot;
        const allyUnits = snapshot.allyUnits ?? scenario.sides.Ally?.units ?? [];
        const friendlyUnits = [...playerUnits, ...allyUnits];
        const remainingFriendlyForce = getGroundForceScore(friendlyUnits);
        const remainingBotForce = getGroundForceScore(botUnits);
        if (tracker.initialFriendlyForce === null && remainingFriendlyForce > 0) {
            tracker.initialFriendlyForce = remainingFriendlyForce;
        }
        const initialFriendlyForce = Math.max(tracker.initialFriendlyForce ?? remainingFriendlyForce, 1);
        const enemyForceRatio = remainingBotForce / initialBotForce;
        const friendlyForceRatio = remainingFriendlyForce / initialFriendlyForce;
        const townOccupant = occupancy.get(townKey);
        const townHeldByFriendly = isFriendlyOccupant(townOccupant);
        let outcome = tracker.outcome;
        if (outcome.state === "inProgress") {
            if (remainingBotForce <= 0 || botUnits.length === 0) {
                outcome = { state: "playerVictory", reason: "The attacking force has been destroyed and the town remains secure." };
            }
            else if (remainingFriendlyForce <= 0 || friendlyUnits.length === 0) {
                outcome = { state: "playerDefeat", reason: "The defenders have been wiped out before the attack could be broken." };
            }
            else {
                const enemyShattered = remainingBotForce <= initialBotForce * 0.2 && remainingBotForce <= remainingFriendlyForce * 0.7;
                const enemyHopelesslyOutmatched = turnSummary.turnNumber >= 4 &&
                    remainingBotForce <= initialBotForce * 0.35 &&
                    remainingBotForce <= remainingFriendlyForce * 0.4;
                if (townHeldByFriendly && (enemyShattered || enemyHopelesslyOutmatched)) {
                    outcome = { state: "playerVictory", reason: "The enemy assault has collapsed and the survivors are retreating from the town." };
                }
                else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
                    if (townHeldByFriendly && remainingFriendlyForce >= remainingBotForce) {
                        outcome = { state: "playerVictory", reason: "The enemy attack spent itself before it could seize the town." };
                    }
                    else if (townOccupant === "Bot") {
                        outcome = { state: "playerDefeat", reason: "Enemy forces forced their way into the town before the defense could throw them back." };
                    }
                    else {
                        outcome = { state: "playerDefeat", reason: "The enemy still retained enough combat power to keep pressing the attack." };
                    }
                }
            }
        }
        tracker.outcome = outcome;
        return {
            turn: turnSummary.turnNumber,
            objectives: [buildObjective(outcome, townOccupant, enemyForceRatio, friendlyForceRatio)],
            outcome,
            markers: [buildMarker(outcome, townOccupant, enemyForceRatio, friendlyForceRatio)]
        };
    };
    return {
        onTurnAdvanced(snapshot) {
            return deriveStatus(snapshot);
        },
        getStatus() {
            const occupancy = new Map();
            scenario.sides.Player.units.forEach((unit) => {
                occupancy.set(makeKey(unit.hex), "Player");
            });
            scenario.sides.Bot.units.forEach((unit) => {
                occupancy.set(makeKey(unit.hex), "Bot");
            });
            scenario.sides.Ally?.units.forEach((unit) => {
                occupancy.set(makeKey(unit.hex), "Ally");
            });
            const seededFriendlyForce = getGroundForceScore([
                ...scenario.sides.Player.units,
                ...(scenario.sides.Ally?.units ?? [])
            ]);
            if (tracker.initialFriendlyForce === null && seededFriendlyForce > 0) {
                tracker.initialFriendlyForce = seededFriendlyForce;
            }
            const enemyForceRatio = 1;
            const friendlyForceRatio = 1;
            const townOccupant = occupancy.get(townKey);
            return {
                turn: 0,
                objectives: [buildObjective(tracker.outcome, townOccupant, enemyForceRatio, friendlyForceRatio)],
                outcome: tracker.outcome,
                markers: [buildMarker(tracker.outcome, townOccupant, enemyForceRatio, friendlyForceRatio)]
            };
        }
    };
}
function createPointeDuHocPhase(turnNumber, counterattackAnnounced) {
    if (turnNumber >= 3) {
        return {
            id: "phase2_commitment",
            label: "Phase 2: Counterattack",
            detail: "German infantry are pushing from the inland forest toward the battery. Hold every gun position simultaneously to keep the clock running.",
            announcement: counterattackAnnounced
                ? "German counterattack force is pressing from the forest road."
                : "Pointe du Hoc: German counterattack force has emerged from the forest — defend the captured positions."
        };
    }
    return {
        id: "phase1_probe",
        label: "Phase 1: Assault",
        detail: "Clear the entrenched garrison from the casemates. Engineers are needed to reduce the fortified positions.",
        announcement: "Rangers are at the cliff top — assault the battery before the garrison can reinforce."
    };
}
function createPointeDuHocController(scenario, difficulty) {
    const HOLD_TARGET = 6;
    const gunPositions = (scenario.objectives ?? []).map((objective, index) => ({
        key: makeKey(objective.hex),
        label: `Gun Position ${index + 1}`,
        hex: objective.hex
    }));
    const tracker = {
        holdStreak: 0,
        outcome: { state: "inProgress" },
        phase: createPointeDuHocPhase(0, false),
        counterattackAnnounced: false
    };
    const buildObjectives = (outcome, occupancy, playerUnits, botUnits) => {
        const capturedCount = gunPositions.filter(({ key }) => isFriendlyOccupant(occupancy.get(key))).length;
        const primary = {
            id: "primary_hold_battery",
            label: "Capture and hold all three gun positions for 6 consecutive turns",
            tier: "primary",
            state: outcome.state === "playerVictory" && tracker.holdStreak >= HOLD_TARGET
                ? "completed"
                : outcome.state === "playerDefeat"
                    ? "failed"
                    : "inProgress",
            detail: capturedCount < gunPositions.length
                ? `Assault phase: ${capturedCount}/${gunPositions.length} gun positions captured. All three must be held simultaneously to start the hold clock.`
                : `Hold phase: ${tracker.holdStreak}/${HOLD_TARGET} turns. All three positions must remain in friendly hands.`
        };
        const mgNestEliminated = botUnits.every((unit) => unit.type !== "Infantry_42" || unit.hex.q !== 5 || unit.hex.r !== 0);
        const secondary = {
            id: "secondary_mg_nest",
            label: "Destroy the MG nest at the cliff edge",
            tier: "secondary",
            state: mgNestEliminated
                ? "completed"
                : outcome.state === "inProgress"
                    ? "inProgress"
                    : "failed",
            detail: mgNestEliminated
                ? "The cliff-edge MG nest has been neutralised."
                : outcome.state === "inProgress"
                    ? "The MG nest at the cliff edge is still active."
                    : "The MG nest survived the Ranger assault."
        };
        const rangersAlive = playerUnits.length >= 3;
        const tertiary = {
            id: "tertiary_ranger_strength",
            label: "Keep at least three Ranger units alive",
            tier: "tertiary",
            state: rangersAlive
                ? outcome.state === "inProgress"
                    ? "inProgress"
                    : "completed"
                : "failed",
            detail: rangersAlive
                ? outcome.state === "inProgress"
                    ? `${playerUnits.length} Rangers remain operational.`
                    : `${playerUnits.length} Rangers survived the mission.`
                : "Fewer than three Rangers remain — the assault cost too many."
        };
        return [primary, secondary, tertiary];
    };
    const buildMarkers = (outcome, occupancy) => {
        return gunPositions.map(({ key, label, hex }) => {
            const occupant = occupancy.get(key);
            if (occupant === "Bot") {
                return {
                    hex,
                    status: "enemy",
                    counter: `${tracker.holdStreak}/${HOLD_TARGET}`,
                    tooltip: `${label} — Enemy-held. Recapture this position to resume the hold clock.`
                };
            }
            if (isFriendlyOccupant(occupant)) {
                const allHeld = gunPositions.every(({ key: gk }) => isFriendlyOccupant(occupancy.get(gk)));
                return {
                    hex,
                    status: "player",
                    counter: allHeld ? `${tracker.holdStreak}/${HOLD_TARGET}` : undefined,
                    tooltip: allHeld
                        ? `${label} — Secured. Hold clock at ${tracker.holdStreak} of ${HOLD_TARGET} turns.`
                        : `${label} — Secured, but not all positions are held. Capture the remaining guns to start the clock.`
                };
            }
            return {
                hex,
                status: "unoccupied",
                tooltip: `${label} — Unoccupied. Assault the casemate to capture this position.`
            };
        });
    };
    const deriveStatus = (snapshot) => {
        const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
        const turnLimit = snapScenario.turnLimit ?? null;
        const counterattackJustArrived = turnSummary.turnNumber === 3 && !tracker.counterattackAnnounced;
        if (counterattackJustArrived) {
            tracker.counterattackAnnounced = true;
        }
        tracker.phase = createPointeDuHocPhase(turnSummary.turnNumber, !counterattackJustArrived);
        let outcome = tracker.outcome;
        if (outcome.state === "inProgress") {
            if (botUnits.length === 0) {
                outcome = { state: "playerVictory", reason: "All German forces eliminated." };
            }
            else if (playerUnits.length === 0) {
                outcome = { state: "playerDefeat", reason: "All Ranger units were lost." };
            }
        }
        if (outcome.state === "inProgress") {
            const allGunsCaptured = gunPositions.length > 0 &&
                gunPositions.every(({ key }) => isFriendlyOccupant(occupancy.get(key)));
            if (allGunsCaptured) {
                tracker.holdStreak += 1;
            }
            else {
                tracker.holdStreak = 0;
            }
            if (tracker.holdStreak >= HOLD_TARGET) {
                outcome = { state: "playerVictory", reason: "All gun positions held for 6 consecutive turns. Pointe du Hoc is secure." };
            }
            else if (turnLimit !== null && turnSummary.turnNumber >= turnLimit) {
                outcome = { state: "playerDefeat", reason: "The assault window closed before the battery could be held. German reinforcements will retake the position." };
            }
        }
        tracker.outcome = outcome;
        return {
            turn: turnSummary.turnNumber,
            objectives: buildObjectives(outcome, occupancy, playerUnits, botUnits),
            outcome,
            phase: tracker.phase,
            markers: buildMarkers(outcome, occupancy)
        };
    };
    return {
        onTurnAdvanced(snapshot) {
            return deriveStatus(snapshot);
        },
        getStatus() {
            const emptyOccupancy = new Map();
            return {
                turn: 0,
                objectives: buildObjectives(tracker.outcome, emptyOccupancy, scenario.sides.Player.units, scenario.sides.Bot.units),
                outcome: tracker.outcome,
                phase: tracker.phase,
                markers: buildMarkers(tracker.outcome, emptyOccupancy)
            };
        }
    };
}
function createCitadelRidgeController(scenario, difficulty) {
    const strongpointKeys = [
        { key: makeKey({ q: 16, r: 4 - Math.floor(16 / 2) }), label: "North Battery", vp: 120 },
        { key: makeKey({ q: 16, r: 8 - Math.floor(16 / 2) }), label: "Central Citadel", vp: 180 },
        { key: makeKey({ q: 16, r: 12 - Math.floor(16 / 2) }), label: "South Battery", vp: 120 },
        { key: makeKey({ q: 20, r: 8 - Math.floor(20 / 2) }), label: "Command Ridge", vp: 220, mandatory: true }
    ];
    let currentOutcome = { state: "inProgress" };
    const buildObjectives = (outcome, playerUnits, botUnits, occupancy) => {
        const capturedStrongpoints = strongpointKeys.filter(({ key }) => {
            const occupant = occupancy.get(key);
            return occupant === "Player" || occupant === "Ally";
        });
        const commandRidgeCaptured = strongpointKeys
            .find((sp) => sp.mandatory)
            ?.key && (occupancy.get(strongpointKeys.find((sp) => sp.mandatory).key) === "Player"
            || occupancy.get(strongpointKeys.find((sp) => sp.mandatory).key) === "Ally");
        const primary = {
            id: "primary_break_ridge",
            label: "Seize the command ridge and at least three strongpoints",
            tier: "primary",
            state: outcome.state === "playerVictory" && commandRidgeCaptured && capturedStrongpoints.length >= 3
                ? "completed"
                : outcome.state === "playerDefeat"
                    ? "failed"
                    : "inProgress",
            detail: `Captured: ${capturedStrongpoints.length}/4 strongpoints${commandRidgeCaptured ? " (Command Ridge secured)" : " (Command Ridge required)"}. ${strongpointKeys
                .map(({ label, key }) => {
                const occupant = occupancy.get(key);
                const status = occupant === "Player" || occupant === "Ally" ? "[X]" : "[ ]";
                return `${status} ${label}`;
            })
                .join(", ")}`
        };
        const flakDestroyed = botUnits.filter((unit) => unit.type === "Flak_88").length === 0;
        const secondary = {
            id: "secondary_destroy_flak",
            label: "Destroy both flak batteries",
            tier: "secondary",
            state: flakDestroyed
                ? "completed"
                : outcome.state === "inProgress"
                    ? "inProgress"
                    : "failed",
            detail: flakDestroyed
                ? "Both flak batteries eliminated."
                : `${botUnits.filter((unit) => unit.type === "Flak_88").length} flak batteries remain operational.`
        };
        const bunkersDestroyed = botUnits.filter((unit) => unit.type === "Assault_Gun").length === 0;
        const tertiary = {
            id: "tertiary_silence_bunkers",
            label: "Silence the bunker guns",
            tier: "tertiary",
            state: bunkersDestroyed
                ? "completed"
                : outcome.state === "inProgress"
                    ? "inProgress"
                    : "failed",
            detail: bunkersDestroyed
                ? "All assault gun strongpoints silenced."
                : `${botUnits.filter((unit) => unit.type === "Assault_Gun").length} bunker guns remain operational.`
        };
        return [primary, secondary, tertiary];
    };
    const deriveStatus = (snapshot) => {
        const { turnSummary, occupancy, playerUnits, botUnits, scenario: snapScenario } = snapshot;
        const turnLimit = snapScenario.turnLimit ?? null;
        let outcome = currentOutcome;
        // Check for unit elimination conditions
        if (outcome.state === "inProgress") {
            if (botUnits.length === 0) {
                outcome = { state: "playerVictory", reason: "All enemy forces eliminated." };
            }
            else if (playerUnits.length === 0) {
                outcome = { state: "playerDefeat", reason: "All friendly forces eliminated." };
            }
        }
        // Check strongpoint capture victory
        const capturedStrongpoints = strongpointKeys.filter(({ key }) => {
            const occupant = occupancy.get(key);
            return occupant === "Player" || occupant === "Ally";
        });
        const commandRidgeKey = strongpointKeys.find((sp) => sp.mandatory)?.key;
        const commandRidgeCaptured = commandRidgeKey && (occupancy.get(commandRidgeKey) === "Player" || occupancy.get(commandRidgeKey) === "Ally");
        if (outcome.state === "inProgress" && commandRidgeCaptured && capturedStrongpoints.length >= 3) {
            outcome = { state: "playerVictory", reason: "Command ridge and sufficient strongpoints secured." };
        }
        // Check turn limit defeat
        if (turnLimit !== null && turnSummary.turnNumber >= turnLimit && outcome.state === "inProgress") {
            outcome = { state: "playerDefeat", reason: "Turn limit expired before securing objectives." };
        }
        currentOutcome = outcome;
        return {
            turn: turnSummary.turnNumber,
            objectives: buildObjectives(outcome, playerUnits, botUnits, occupancy),
            outcome
        };
    };
    return {
        onTurnAdvanced(snapshot) {
            return deriveStatus(snapshot);
        },
        getStatus() {
            const emptyOccupancy = new Map();
            return {
                turn: 0,
                objectives: buildObjectives(currentOutcome, scenario.sides.Player.units, scenario.sides.Bot.units, emptyOccupancy),
                outcome: currentOutcome
            };
        }
    };
}
export function createMissionRulesController(missionKey, scenario, difficulty = "Normal") {
    if (missionKey === "patrol") {
        return createTownDefenseController(scenario);
    }
    if (missionKey === "patrol_river_watch") {
        return createRiverWatchController(scenario, difficulty);
    }
    if (missionKey === "patrol_pointe_du_hoc") {
        return createPointeDuHocController(scenario, difficulty);
    }
    if (missionKey === "assault_citadel_ridge") {
        return createCitadelRidgeController(scenario, difficulty);
    }
    return {
        onTurnAdvanced(snapshot) {
            return {
                turn: snapshot.turnSummary.turnNumber,
                objectives: [],
                outcome: { state: "inProgress" }
            };
        },
        getStatus() {
            return { turn: 0, objectives: [], outcome: { state: "inProgress" } };
        }
    };
}
