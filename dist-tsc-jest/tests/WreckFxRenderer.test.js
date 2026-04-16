import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { WreckFxRenderer, getWreckFxPreset, resolveWreckFxClass, resolveWreckSeverity } from "../src/rendering/WreckFxRenderer";
function createSvgHost() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.setAttribute("id", "battleDefs");
    svg.appendChild(defs);
    const parent = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(parent);
    document.body.appendChild(svg);
    return { svg, parent };
}
registerTest("WRECK_FX_CLASSIFIER_SEPARATES_CONVOY_ARTILLERY_AND_TANK_CASES", async ({ Then }) => {
    const convoy = resolveWreckFxClass("vehicle", "Supply_Truck");
    const artillery = resolveWreckFxClass("artillery", "Howitzer_105");
    const tank = resolveWreckFxClass("tank", "Heavy_Tank");
    const reconBike = resolveWreckFxClass("recon", "Recon_Bike");
    const infantry = resolveWreckFxClass("infantry", "Infantry");
    if (convoy !== "convoy") {
        throw new Error(`Expected supply trucks to resolve as convoy wrecks, received ${convoy}.`);
    }
    if (artillery !== "artillery") {
        throw new Error(`Expected artillery guns to resolve as artillery wrecks, received ${artillery}.`);
    }
    if (tank !== "tank") {
        throw new Error(`Expected tanks to resolve as tank wrecks, received ${tank}.`);
    }
    if (reconBike !== "truck") {
        throw new Error(`Expected recon bikes to use the light vehicle/truck wreck preset, received ${reconBike}.`);
    }
    if (infantry !== "infantry") {
        throw new Error(`Expected infantry to remain infantry wrecks, received ${infantry}.`);
    }
    await Then("wreck presets distinguish low-fire infantry from heavier vehicle classes", () => { });
});
registerTest("WRECK_FX_PRESETS_SCALE_FROM_INFANTRY_TO_CONVOY", async ({ Then }) => {
    const infantry = getWreckFxPreset("infantry");
    const artillery = getWreckFxPreset("artillery");
    const tank = getWreckFxPreset("tank");
    const convoy = getWreckFxPreset("convoy");
    const infantryBurningFlames = infantry.severities.burning.counts.flame.mid;
    const artilleryBurningFlames = artillery.severities.burning.counts.flame.mid;
    const tankBurningFlames = tank.severities.burning.counts.flame.mid;
    const convoyBurningFlames = convoy.severities.burning.counts.flame.mid;
    if (!(infantryBurningFlames < artilleryBurningFlames && artilleryBurningFlames <= tankBurningFlames && tankBurningFlames <= convoyBurningFlames)) {
        throw new Error(`Expected flame counts to scale up from infantry to convoy, received infantry=${infantryBurningFlames}, artillery=${artilleryBurningFlames}, tank=${tankBurningFlames}, convoy=${convoyBurningFlames}.`);
    }
    if (infantry.heatHazeEnabled) {
        throw new Error("Expected infantry wrecks to skip heat haze.");
    }
    if (!tank.heatHazeEnabled || !artillery.heatHazeEnabled || !convoy.heatHazeEnabled) {
        throw new Error("Expected heavier wreck classes to enable heat haze support.");
    }
    const infantrySeverity = resolveWreckSeverity(infantry, 60000);
    const tankSeverity = resolveWreckSeverity(tank, 60000);
    if (infantrySeverity !== "smoldering") {
        throw new Error(`Expected infantry fires to settle quickly, received ${infantrySeverity}.`);
    }
    if (tankSeverity !== "burning") {
        throw new Error(`Expected tank fires to still be in burning state at 60s, received ${tankSeverity}.`);
    }
    await Then("starter presets reflect the intended low, medium, and large burn ladders", () => { });
});
registerTest("WRECK_FX_RENDERER_MOUNTS_LAYERED_GROUPS_FOR_TANK_WRECKS", async ({ Then }) => {
    const { svg, parent } = createSvgHost();
    const renderer = new WreckFxRenderer(svg, () => "mid");
    renderer.upsertWreck({
        hexKey: "4,4",
        parentGroup: parent,
        anchorX: 180,
        anchorY: 200,
        seed: 1234,
        wreckClass: "tank"
    });
    renderer.stepForTests(performance.now() + 16);
    const root = parent.querySelector('[data-wreck-hex="4,4"]');
    if (!root) {
        throw new Error("Expected wreck renderer to mount a root group.");
    }
    const requiredLayers = [
        ".wreck-shadow",
        ".ember-bed",
        ".flame-layer",
        ".smoke-low",
        ".smoke-mid",
        ".smoke-high",
        ".embers-air",
        ".heat-haze"
    ];
    requiredLayers.forEach((selector) => {
        if (!root.querySelector(selector)) {
            throw new Error(`Expected wreck root to contain layer ${selector}.`);
        }
    });
    const visibleFlames = Array.from(root.querySelectorAll(".flame-layer path")).filter((node) => node.style.display !== "none");
    const visibleSmoke = Array.from(root.querySelectorAll(".smoke-low path, .smoke-mid path, .smoke-high ellipse")).filter((node) => node.style.display !== "none");
    if (visibleFlames.length === 0 || visibleSmoke.length === 0) {
        throw new Error(`Expected tank wrecks to spawn both flame and smoke nodes, received flames=${visibleFlames.length}, smoke=${visibleSmoke.length}.`);
    }
    renderer.stopAll();
    await Then("the renderer mounts layered persistent wreck visuals instead of one flat blob", () => { });
});
registerTest("WRECK_FX_RENDERER_SUPPORTS_SUBTLER_DAMAGE_MODE_WITHOUT_LEGACY_FLAME_BLOBS", async ({ Then }) => {
    const { svg, parent } = createSvgHost();
    const renderer = new WreckFxRenderer(svg, () => "mid");
    renderer.upsertWreck({
        hexKey: "7,3",
        parentGroup: parent,
        anchorX: 164,
        anchorY: 188,
        seed: 4321,
        wreckClass: "truck",
        mode: "damage",
        forcedSeverity: "smoldering",
        allowFlames: false
    });
    renderer.stepForTests(performance.now() + 16);
    const root = parent.querySelector('[data-wreck-hex="7,3"]');
    if (!root) {
        throw new Error("Expected damage-mode wreck FX to mount a root group.");
    }
    if (root.getAttribute("data-wreck-mode") !== "damage") {
        throw new Error(`Expected damage-mode root, received ${root.getAttribute("data-wreck-mode")}.`);
    }
    const visibleFlames = Array.from(root.querySelectorAll(".flame-layer path")).filter((node) => node.style.display !== "none");
    const visibleSmoke = Array.from(root.querySelectorAll(".smoke-low path, .smoke-mid path, .smoke-high ellipse")).filter((node) => node.style.display !== "none");
    const visibleHaze = Array.from(root.querySelectorAll(".heat-haze ellipse")).filter((node) => node.style.display !== "none");
    if (visibleFlames.length !== 0) {
        throw new Error(`Expected non-burning damage FX to suppress flames, received ${visibleFlames.length} visible flame nodes.`);
    }
    if (visibleSmoke.length === 0) {
        throw new Error("Expected damage-mode FX to retain layered smoke.");
    }
    if (visibleHaze.length !== 0) {
        throw new Error("Expected damage-mode FX to skip heat haze.");
    }
    renderer.stopAll();
    await Then("persistent vehicle damage uses the modern layered renderer without promoting to full wreck fire", () => { });
});
