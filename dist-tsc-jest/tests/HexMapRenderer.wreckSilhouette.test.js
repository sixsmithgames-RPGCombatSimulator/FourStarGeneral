import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
registerTest("HEXMAP_RECON_BIKE_WRECKS_USE_SMALL_SCATTERED_SILHOUETTES", async ({ Then }) => {
    const renderer = new HexMapRenderer();
    const wreck = renderer.createWreckShape("4,4", "truck", "Recon_Bike", 120, 120);
    const rects = Array.from(wreck.querySelectorAll("rect"));
    const wheels = Array.from(wreck.querySelectorAll("circle"));
    const paths = Array.from(wreck.querySelectorAll("path"));
    const widestRect = rects.reduce((max, rect) => Math.max(max, Number(rect.getAttribute("width") ?? 0)), 0);
    if (wreck.childElementCount < 10) {
        throw new Error(`Expected recon bike wrecks to be composed from many small pieces, received ${wreck.childElementCount} nodes.`);
    }
    if (wheels.length < 2) {
        throw new Error(`Expected recon bike wrecks to keep small wheel/frame cues, received ${wheels.length} wheel rings.`);
    }
    if (widestRect > 6) {
        throw new Error(`Expected recon bike wreck fragments to stay small at map scale, received a ${widestRect}px-wide rect.`);
    }
    if (paths.length < 2) {
        throw new Error(`Expected recon bike wrecks to include thin frame/scrap strokes, received ${paths.length} path elements.`);
    }
    await Then("light vehicle wrecks stay low-profile and fragmented", () => { });
});
registerTest("HEXMAP_DAMAGED_VEHICLES_USE_LAYERED_AFTERMATH_FX_WITHOUT_LEGACY_ANIMATE_NODES", async ({ Given, When, Then }) => {
    const viewport = document.createElement("div");
    viewport.style.width = "240px";
    viewport.style.height = "180px";
    const canvas = document.createElement("div");
    canvas.id = "battleMapCanvas";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "battleHexMap";
    canvas.appendChild(svg);
    viewport.appendChild(canvas);
    document.body.appendChild(viewport);
    const scenario = {
        name: "Aftermath Harness",
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
    await Given("a rendered vehicle on a single battlefield hex", async () => {
        renderer.render(svg, canvas, scenario);
        renderer.renderUnit("0,0", {
            type: "Recon_ArmoredCar",
            hex: { q: 0, r: 0 },
            strength: 42,
            experience: 0,
            ammo: 6,
            fuel: 30,
            entrench: 0,
            facing: "NE"
        }, "Player");
    });
    await When("the hex is marked as damaged but not wrecked", async () => {
        renderer.markHexDamaged("0,0", "vehicle", 42, 2);
        renderer.wreckFxRenderer?.stepForTests(performance.now() + 16);
    });
    await Then("the aftermath overlay uses the pooled layered FX renderer instead of legacy animate nodes", async () => {
        const cell = svg.querySelector('[data-hex="0,0"]');
        if (!cell) {
            throw new Error("Expected rendered hex cell.");
        }
        const overlay = cell.querySelector(".aftermath-overlay");
        if (!overlay) {
            throw new Error("Expected a damage aftermath overlay.");
        }
        const fxRoot = overlay.querySelector('[data-wreck-mode="damage"]');
        if (!fxRoot) {
            throw new Error("Expected damaged vehicles to mount the modern layered aftermath renderer.");
        }
        const legacyAnimateNodes = overlay.querySelectorAll("animate, animateTransform");
        if (legacyAnimateNodes.length !== 0) {
            throw new Error(`Expected no legacy SMIL aftermath nodes, found ${legacyAnimateNodes.length}.`);
        }
        const visibleSmoke = Array.from(fxRoot.querySelectorAll(".smoke-low path, .smoke-mid path, .smoke-high ellipse"))
            .filter((node) => node.style.display !== "none");
        if (visibleSmoke.length === 0) {
            throw new Error("Expected the layered damage aftermath renderer to show smoke particles.");
        }
        renderer.wreckFxRenderer?.stopAll();
        viewport.remove();
    });
});
