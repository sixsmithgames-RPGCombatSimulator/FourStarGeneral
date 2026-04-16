import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
registerTest("HEXMAP_ANIMATE_UNIT_MOVE", async ({ Given, When, Then }) => {
    const viewport = document.createElement("div");
    viewport.style.width = "300px";
    viewport.style.height = "200px";
    viewport.style.overflow = "hidden";
    Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });
    const canvas = document.createElement("div");
    canvas.id = "battleMapCanvas";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "battleHexMap";
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    const scenario = {
        name: "Animation Harness",
        size: { cols: 2, rows: 1 },
        tilePalette: {
            PLAINS: {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: [[{ tile: "PLAINS" }, { tile: "PLAINS" }]],
        objectives: [],
        turnLimit: 1,
        sides: {
            Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
            Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
        }
    };
    const renderer = new HexMapRenderer();
    await Given("a rendered map and unit icon", async () => {
        renderer.render(svg, canvas, scenario);
        renderer.renderUnit("0,0", {
            type: "Infantry",
            hex: { q: 0, r: 0 },
            strength: 10,
            experience: 0,
            ammo: 6,
            fuel: 0,
            entrench: 0,
            facing: "NW"
        }, "Player");
        renderer.renderUnit("1,0", {
            type: "Infantry",
            hex: { q: 1, r: 0 },
            strength: 10,
            experience: 0,
            ammo: 6,
            fuel: 0,
            entrench: 0,
            facing: "NW"
        }, "Player");
    });
    const rafCallbacks = [];
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
    };
    await When("animateUnitMove runs from the first hex to the second", async () => {
        const animation = renderer.animateUnitMove("0,0", "1,0", 200);
        // Flush queued frames: simulate steady progression to completion.
        let timestamp = performance.now();
        while (rafCallbacks.length > 0) {
            const cb = rafCallbacks.shift();
            if (!cb)
                break;
            timestamp += 50;
            cb(timestamp);
        }
        await animation;
    });
    window.requestAnimationFrame = originalRaf;
    await Then("the ghost is removed and original icon opacity restored", async () => {
        const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
        if (ghostCount !== 0) {
            throw new Error(`Expected zero ghost sprites, found ${ghostCount}`);
        }
        const movingGroup = svg.querySelector("[data-hex='0,0'] g.unit-stack");
        if (!movingGroup) {
            throw new Error("Original unit icon missing after animation");
        }
        if (movingGroup.style.opacity && movingGroup.style.opacity !== "") {
            throw new Error(`Expected original icon opacity reset, got ${movingGroup.style.opacity}`);
        }
    });
    await When("animateUnitMove runs with zero duration", async () => {
        // Zero-duration transitions should bypass RAF scheduling; throw if a frame is unexpectedly requested.
        window.requestAnimationFrame = () => {
            throw new Error("Zero-duration animation should not schedule requestAnimationFrame");
        };
        await renderer.animateUnitMove("0,0", "1,0", 0);
    });
    window.requestAnimationFrame = originalRaf;
    await Then("the zero-duration path snap-cleans the ghost and restores opacity", async () => {
        const ghostCount = svg.querySelectorAll(".unit-move-ghost").length;
        if (ghostCount !== 0) {
            throw new Error(`Expected zero ghost sprites after zero-duration run, found ${ghostCount}`);
        }
        const movingGroup = svg.querySelector("[data-hex='0,0'] g.unit-stack");
        if (!movingGroup) {
            throw new Error("Original unit icon missing after zero-duration animation");
        }
        if (movingGroup.style.opacity && movingGroup.style.opacity !== "") {
            throw new Error(`Expected original icon opacity reset after zero-duration run, got ${movingGroup.style.opacity}`);
        }
        viewport.remove();
    });
});
registerTest("HEXMAP_RENDER_REUSES_COMBAT_ANIMATOR_WHEN_EFFECTS_LAYER_IS_PRESERVED", async ({ Given, When, Then }) => {
    const viewport = document.createElement("div");
    viewport.style.width = "320px";
    viewport.style.height = "220px";
    viewport.style.overflow = "hidden";
    Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });
    const canvas = document.createElement("div");
    canvas.id = "battleMapCanvas";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "battleHexMap";
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    const scenario = {
        name: "Combat Animator Reuse Harness",
        size: { cols: 1, rows: 1 },
        tilePalette: {
            PLAINS: {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: [[{ tile: "PLAINS" }]],
        objectives: [],
        turnLimit: 1,
        sides: {
            Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
            Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
        }
    };
    const renderer = new HexMapRenderer();
    let initialAnimator = null;
    let initialEffectsLayer = null;
    let rerenderedAnimator = null;
    let rerenderedEffectsLayer = null;
    await Given("a rendered map with an initialized combat effects layer", async () => {
        renderer.render(svg, canvas, scenario);
        initialAnimator = renderer.combatAnimator;
        initialEffectsLayer = renderer.combatEffectsLayer;
    });
    await When("the map re-renders while preserving the same effects layer node", async () => {
        renderer.render(svg, canvas, scenario);
        rerenderedAnimator = renderer.combatAnimator;
        rerenderedEffectsLayer = renderer.combatEffectsLayer;
    });
    await Then("the renderer reuses the same combat animator instance instead of resetting it", async () => {
        if (!initialEffectsLayer || !rerenderedEffectsLayer) {
            throw new Error("Expected combat effects layer to exist before and after re-render.");
        }
        if (initialEffectsLayer !== rerenderedEffectsLayer) {
            throw new Error("Expected HexMapRenderer to preserve the same combat effects layer DOM node across re-render.");
        }
        if (!initialAnimator || !rerenderedAnimator) {
            throw new Error("Expected combat animator to exist before and after re-render.");
        }
        if (initialAnimator !== rerenderedAnimator) {
            throw new Error("Expected HexMapRenderer to reuse the existing combat animator when the effects layer is preserved.");
        }
        viewport.remove();
    });
});
registerTest("HEXMAP_RENDERUNIT_REJECTS_MALFORMED_FACING_WITHOUT_CRASHING", async ({ Given, When, Then }) => {
    const viewport = document.createElement("div");
    viewport.style.width = "300px";
    viewport.style.height = "200px";
    Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });
    const canvas = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    const scenario = {
        name: "Facing Guard Harness",
        size: { cols: 1, rows: 1 },
        tilePalette: {
            PLAINS: {
                terrain: "plains",
                terrainType: "grass",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: [[{ tile: "PLAINS" }]],
        objectives: [],
        turnLimit: 1,
        sides: {
            Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
            Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
        }
    };
    const renderer = new HexMapRenderer();
    await Given("a rendered map", async () => {
        renderer.render(svg, canvas, scenario);
    });
    let thrown = null;
    await When("a unit render request carries a malformed facing value", async () => {
        try {
            renderer.renderUnit("0,0", {
                type: "Infantry",
                hex: { q: 0, r: 0 },
                strength: 10,
                experience: 0,
                ammo: 6,
                fuel: 0,
                entrench: 0,
                facing: "BROKEN"
            }, "Player");
        }
        catch (error) {
            thrown = error;
        }
    });
    await Then("the renderer keeps drawing the unit instead of throwing", async () => {
        if (thrown) {
            throw new Error(`Expected malformed facing to be tolerated, received ${String(thrown)}`);
        }
        const unit = svg.querySelector("g.unit-stack");
        if (!unit) {
            throw new Error("Expected the unit stack to render despite malformed facing input.");
        }
        viewport.remove();
    });
});
registerTest("HEXMAP_DIRECT_FIRE_ATTACK_SPAWNS_ONE_CENTERED_IMPACT_HIT", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const combatCalls = [];
    await Given("a direct-fire renderer path with all non-impact visuals stubbed", async () => {
        renderer.hexElementMap.set("0,0", {});
        renderer.hexElementMap.set("1,0", {});
        renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
        renderer.setHexFacingAngle = () => { };
        renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "vehicle" : "infantry");
        renderer.getUnitScenarioTypeAt = () => "Recon_ArmoredCar";
        renderer.isSmallArmsAttack = () => false;
        renderer.isArcingArtilleryAttack = () => false;
        renderer.isAirStrafingAttack = () => false;
        renderer.isAirBombingAttack = () => false;
        renderer.playFlashOverlay = async () => { };
        renderer.playMuzzleFlash = async () => { };
        renderer.playTargetMarker = async () => { };
        renderer.playRecoilNudge = async () => { };
        renderer.playHitShake = async () => { };
        renderer.playSparkBurst = async () => { };
        renderer.playDustCloudLinger = async () => { };
        renderer.playProjectileTracer = async () => { };
        renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
            combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
        };
    });
    await When("the attack sequence reaches its direct-fire impact branch", async () => {
        await renderer.playAttackSequence("0,0", "1,0", false);
    });
    await Then("it schedules direct-fire combat animations targeting defender", async () => {
        // Direct-fire attacks use weapon-specific animations (mg, cannon, small_arms), not impactHits
        // impactHits is reserved for armor spark burst effects on hard targets
        const directFireCalls = combatCalls.filter((call) => ["mg", "cannon", "small_arms"].includes(call.animationType));
        if (directFireCalls.length === 0) {
            throw new Error(`Expected at least one direct-fire combat animation (mg/cannon/small_arms), found none. Available calls: ${combatCalls.map(c => c.animationType).join(", ")}`);
        }
        // Verify animations target the defender hex
        const defenderCalls = directFireCalls.filter((call) => call.hexKey === "1,0");
        if (defenderCalls.length === 0) {
            throw new Error(`Expected direct-fire animations to target defender hex 1,0, none found.`);
        }
    });
});
registerTest("HEXMAP_FLAK_88_USES_DIRECT_FIRE_CANNON_VISUALS", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const combatCalls = [];
    let arcedProjectileCalls = 0;
    const originalSetTimeout = window.setTimeout;
    await Given("a Flak 88 attack path with animation hooks stubbed", async () => {
        window.setTimeout = ((handler, _timeout, ...args) => {
            if (typeof handler === "function") {
                handler(...args);
            }
            return 0;
        });
        renderer.hexElementMap.set("0,0", {});
        renderer.hexElementMap.set("1,0", {});
        renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
        renderer.setHexFacingAngle = () => { };
        renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "specialist" : "tank");
        renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Flak_88" : "Medium_Tank");
        renderer.playFlashOverlay = async () => { };
        renderer.playMuzzleFlash = async () => { };
        renderer.playTargetMarker = async () => { };
        renderer.playRecoilNudge = async () => { };
        renderer.playHitShake = async () => { };
        renderer.playSparkBurst = async () => { };
        renderer.playDustCloudLinger = async () => { };
        renderer.playProjectileTracer = async () => { };
        renderer.playArcedProjectile = async () => {
            arcedProjectileCalls += 1;
        };
        renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
            combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
        };
    });
    await When("the Flak 88 attack sequence plays", async () => {
        await renderer.playAttackSequence("0,0", "1,0", true);
    });
    window.setTimeout = originalSetTimeout;
    await Then("it stays on direct-fire cannon visuals and never uses the artillery arc branch", async () => {
        if (arcedProjectileCalls !== 0) {
            throw new Error(`Expected Flak 88 to avoid artillery arcs, found ${arcedProjectileCalls} arc calls.`);
        }
        // Flak 88 uses cannon animation type for direct-fire attacks, not impactHits
        const cannonCalls = combatCalls.filter((call) => call.animationType === "cannon");
        if (cannonCalls.length === 0) {
            throw new Error(`Expected at least one cannon animation for Flak 88, found none. Available calls: ${combatCalls.map(c => c.animationType).join(", ")}`);
        }
        const [cannonCall] = cannonCalls;
        if (!cannonCall || cannonCall.hexKey !== "1,0") {
            throw new Error(`Expected Flak 88 cannon animation to target defender hex 1,0, received ${JSON.stringify(cannonCall)}.`);
        }
    });
});
registerTest("HEXMAP_ARCING_ARTILLERY_ATTACK_SPAWNS_STAGGERED_SMALL_BURSTS", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const combatCalls = [];
    const originalSetTimeout = window.setTimeout;
    await Given("an arcing-artillery renderer path with all non-impact visuals stubbed", async () => {
        window.setTimeout = ((handler, _timeout, ...args) => {
            if (typeof handler === "function") {
                handler(...args);
            }
            return 0;
        });
        renderer.hexElementMap.set("0,0", {});
        renderer.hexElementMap.set("1,0", {});
        renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
        renderer.setHexFacingAngle = () => { };
        renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "artillery" : "tank");
        renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Howitzer_105" : "Medium_Tank");
        renderer.isSmallArmsAttack = () => false;
        renderer.isArcingArtilleryAttack = () => true;
        renderer.isAirStrafingAttack = () => false;
        renderer.isAirBombingAttack = () => false;
        renderer.playFlashOverlay = async () => { };
        renderer.playMuzzleFlash = async () => { };
        renderer.playTargetMarker = async () => { };
        renderer.playRecoilNudge = async () => { };
        renderer.playHitShake = async () => { };
        renderer.playSparkBurst = async () => { };
        renderer.playDustCloudLinger = async () => { };
        renderer.playProjectileTracer = async () => { };
        renderer.playArcedProjectile = async () => { };
        renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
            combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
        };
    });
    await When("the attack sequence reaches its arcing-artillery impact branch", async () => {
        await renderer.playAttackSequence("0,0", "1,0", true);
    });
    window.setTimeout = originalSetTimeout;
    await Then("it schedules several smaller explosion bursts on the defender hex", async () => {
        const impactCalls = combatCalls.filter((call) => call.animationType === "explosionLarge" || call.animationType === "explosionSmall");
        if (impactCalls.length !== 4) {
            throw new Error(`Expected exactly four artillery explosion animations, found ${impactCalls.length}.`);
        }
        for (const impactCall of impactCalls) {
            if (impactCall.animationType !== "explosionSmall") {
                throw new Error(`Expected artillery burst to use explosionSmall, received ${impactCall.animationType}.`);
            }
            if (impactCall.hexKey !== "1,0") {
                throw new Error(`Expected artillery burst to target defender hex 1,0, received ${impactCall.hexKey}.`);
            }
        }
        const offsetImpacts = impactCalls.filter((call) => call.offsetX !== 0 || call.offsetY !== 0);
        if (offsetImpacts.length !== 4) {
            throw new Error(`Expected all artillery bursts to land off-center, found ${offsetImpacts.length} offset bursts.`);
        }
        const uniqueOffsets = new Set(offsetImpacts.map((call) => `${call.offsetX},${call.offsetY}`));
        if (uniqueOffsets.size !== 4) {
            throw new Error(`Expected four distinct artillery burst offsets, found ${uniqueOffsets.size}.`);
        }
        const spreadXs = offsetImpacts.map((call) => Math.abs(call.offsetX));
        const spreadYs = offsetImpacts.map((call) => Math.abs(call.offsetY));
        if (Math.max(...spreadXs) < 8 || Math.max(...spreadYs) < 8) {
            throw new Error("Expected artillery bursts to spread visibly away from the center of the hex.");
        }
    });
});
registerTest("HEXMAP_AIR_BOMBING_ATTACK_SPAWNS_ONE_CENTERED_EXPLOSION", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const combatCalls = [];
    const originalSetTimeout = window.setTimeout;
    await Given("an air-bombing renderer path with all non-impact visuals stubbed", async () => {
        window.setTimeout = ((handler, _timeout, ...args) => {
            if (typeof handler === "function") {
                handler(...args);
            }
            return 0;
        });
        renderer.hexElementMap.set("0,0", {});
        renderer.hexElementMap.set("1,0", {});
        renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
        renderer.setHexFacingAngle = () => { };
        renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "air" : "tank");
        renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Bomber" : "Medium_Tank");
        renderer.isSmallArmsAttack = () => false;
        renderer.isArcingArtilleryAttack = () => false;
        renderer.isAirStrafingAttack = () => false;
        renderer.isAirBombingAttack = () => true;
        renderer.playFlashOverlay = async () => { };
        renderer.playMuzzleFlash = async () => { };
        renderer.playTargetMarker = async () => { };
        renderer.playRecoilNudge = async () => { };
        renderer.playHitShake = async () => { };
        renderer.playSparkBurst = async () => { };
        renderer.playDustCloudLinger = async () => { };
        renderer.playProjectileTracer = async () => { };
        renderer.playArcedProjectile = async () => { };
        renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
            combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
        };
    });
    await When("the attack sequence reaches its air-bombing impact branch", async () => {
        await renderer.playAttackSequence("0,0", "1,0", true);
    });
    window.setTimeout = originalSetTimeout;
    await Then("it schedules exactly one centered bombing explosion animation", async () => {
        const impactCalls = combatCalls.filter((call) => call.animationType === "explosionLarge" || call.animationType === "explosionSmall");
        if (impactCalls.length !== 1) {
            throw new Error(`Expected exactly one bombing explosion animation, found ${impactCalls.length}.`);
        }
        const [impactCall] = impactCalls;
        if (!impactCall) {
            throw new Error("Expected one bombing explosion animation call.");
        }
        if (impactCall.hexKey !== "1,0") {
            throw new Error(`Expected bombing explosion to target defender hex 1,0, received ${impactCall.hexKey}.`);
        }
        if (impactCall.offsetX !== 0 || impactCall.offsetY !== 0) {
            throw new Error(`Expected centered bombing explosion offsets (0,0), received (${impactCall.offsetX}, ${impactCall.offsetY}).`);
        }
    });
});
registerTest("HEXMAP_ROCKET_ARTILLERY_ATTACK_SPAWNS_TRIPLE_BARRAGE_SALVOS", async ({ Given, When, Then }) => {
    const renderer = new HexMapRenderer();
    const combatCalls = [];
    let arcedProjectileCalls = 0;
    const originalSetTimeout = window.setTimeout;
    await Given("a rocket-artillery renderer path with non-impact visuals stubbed", async () => {
        window.setTimeout = ((handler, _timeout, ...args) => {
            if (typeof handler === "function") {
                handler(...args);
            }
            return 0;
        });
        renderer.hexElementMap.set("0,0", {});
        renderer.hexElementMap.set("1,0", {});
        renderer.extractHexCenter = () => ({ cx: 100, cy: 100 });
        renderer.setHexFacingAngle = () => { };
        renderer.getUnitClassAt = (hexKey) => (hexKey === "0,0" ? "artillery" : "tank");
        renderer.getUnitScenarioTypeAt = (hexKey) => (hexKey === "0,0" ? "Rocket_Artillery" : "Medium_Tank");
        renderer.isSmallArmsAttack = () => false;
        renderer.isArcingArtilleryAttack = () => true;
        renderer.isAirStrafingAttack = () => false;
        renderer.isAirBombingAttack = () => false;
        renderer.playFlashOverlay = async () => { };
        renderer.playMuzzleFlash = async () => { };
        renderer.playTargetMarker = async () => { };
        renderer.playRecoilNudge = async () => { };
        renderer.playHitShake = async () => { };
        renderer.playSparkBurst = async () => { };
        renderer.playDustCloudLinger = async () => { };
        renderer.playProjectileTracer = async () => { };
        renderer.playArcedProjectile = async () => {
            arcedProjectileCalls += 1;
        };
        renderer.playCombatAnimation = async (animationType, hexKey, offsetX = 0, offsetY = 0, scale = 1) => {
            combatCalls.push({ animationType, hexKey, offsetX, offsetY, scale });
        };
    });
    await When("the rocket artillery attack sequence resolves", async () => {
        await renderer.playAttackSequence("0,0", "1,0", true);
    });
    window.setTimeout = originalSetTimeout;
    await Then("it plays three artillery-style salvos with spread-out small explosions", async () => {
        if (arcedProjectileCalls !== 3) {
            throw new Error(`Expected three rocket-tracer lob animations, received ${arcedProjectileCalls}.`);
        }
        const impactCalls = combatCalls.filter((call) => call.animationType === "explosionSmall");
        if (impactCalls.length !== 12) {
            throw new Error(`Expected twelve small rocket-artillery explosions, found ${impactCalls.length}.`);
        }
        const uniqueOffsets = new Set(impactCalls.map((call) => `${call.offsetX},${call.offsetY}`));
        if (uniqueOffsets.size < 10) {
            throw new Error(`Expected rocket-artillery salvos to spread across many distinct impact points, found ${uniqueOffsets.size}.`);
        }
    });
});
registerTest("HEXMAP_RENDERUNIT_DOES_NOT_ADD_WATER_TRANSPORT_OVERLAY", async ({ Given, When, Then }) => {
    const viewport = document.createElement("div");
    viewport.style.width = "300px";
    viewport.style.height = "200px";
    Object.defineProperty(viewport, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 200, configurable: true });
    const canvas = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    const scenario = {
        name: "Water Tile Harness",
        size: { cols: 1, rows: 1 },
        tilePalette: {
            OPEN_WATER: {
                terrain: "sea",
                terrainType: "water",
                density: "average",
                features: [],
                recon: "intel"
            }
        },
        tiles: [[{ tile: "OPEN_WATER" }]],
        objectives: [],
        turnLimit: 1,
        sides: {
            Player: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] },
            Bot: { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] }
        }
    };
    const renderer = new HexMapRenderer();
    await Given("a rendered water hex", async () => {
        renderer.render(svg, canvas, scenario);
    });
    await When("a unit is rendered on the water tile", async () => {
        renderer.renderUnit("0,0", {
            type: "Infantry",
            hex: { q: 0, r: 0 },
            strength: 10,
            experience: 0,
            ammo: 6,
            fuel: 0,
            entrench: 0,
            facing: "NW"
        }, "Player");
    });
    await Then("the renderer keeps only the unit sprite and does not add a transport ship overlay", async () => {
        const overlay = svg.querySelector(".unit-boat-overlay");
        if (overlay) {
            throw new Error("Expected no transport ship overlay to render on water tiles.");
        }
        const unitIcons = svg.querySelectorAll("image.unit-icon");
        if (unitIcons.length !== 1) {
            throw new Error(`Expected only one unit icon image on the water tile, found ${unitIcons.length}.`);
        }
        viewport.remove();
    });
});
