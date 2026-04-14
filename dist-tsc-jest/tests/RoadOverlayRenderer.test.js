import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { RoadOverlayRenderer } from "../src/rendering/RoadOverlayRenderer";
registerTest("ROAD_OVERLAY_TREATS_HAMLET_AS_CONNECTED_ROAD", async ({ Given, When, Then }) => {
    let renderer;
    let hamletHasRoad = false;
    let overlayMarkup = "";
    const hamletTile = {
        terrain: "city",
        terrainType: "urban",
        density: "sparse",
        features: ["buildings"],
        recon: "intel"
    };
    const roadTile = {
        terrain: "road",
        terrainType: "rural",
        density: "sparse",
        features: [],
        recon: "intel"
    };
    await Given("a sparse urban hamlet tile adjacent to a road tile", async () => {
        renderer = new RoadOverlayRenderer();
    });
    await When("the road overlay resolves road connectivity", async () => {
        hamletHasRoad = renderer.hasRoad(hamletTile);
        overlayMarkup = renderer.drawRoadOverlay(120, 120, hamletTile, 0, 0, [[hamletTile, roadTile]], {});
    });
    await Then("the hamlet is treated as part of the road network and draws a connecting segment", async () => {
        if (!hamletHasRoad) {
            throw new Error("Expected sparse urban hamlet tile to count as a road tile for overlay rendering.");
        }
        if (!overlayMarkup.includes("<path")) {
            throw new Error(`Expected hamlet road overlay to include a connecting path, received ${overlayMarkup || "<empty>"}`);
        }
    });
});
registerTest("ROAD_OVERLAY_ACCEPTS_ROAD_FEATURES_ON_LAND_BUT_REJECTS_WATER_HOSTS", async ({ Given, When, Then }) => {
    let renderer;
    let plainsRoad = false;
    let seaRoad = false;
    let overlayMarkup = "";
    const plainsWithRoad = {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: ["road"],
        recon: "intel"
    };
    const seaWithRoad = {
        terrain: "sea",
        terrainType: "water",
        density: "average",
        features: ["road"],
        recon: "intel"
    };
    await Given("a land tile and a sea tile both marked with a road feature", async () => {
        renderer = new RoadOverlayRenderer();
    });
    await When("road-hosting eligibility is resolved", async () => {
        plainsRoad = renderer.hasRoad(plainsWithRoad);
        seaRoad = renderer.hasRoad(seaWithRoad);
        overlayMarkup = renderer.drawRoadOverlay(120, 120, plainsWithRoad, 0, 0, [[plainsWithRoad]], {});
    });
    await Then("only the land tile hosts a road overlay", async () => {
        if (!plainsRoad) {
            throw new Error("Expected the land tile to host a road overlay when it carries the road feature.");
        }
        if (seaRoad) {
            throw new Error("Expected water tiles to reject road-feature hosting.");
        }
        if (!overlayMarkup.includes("data-road-hub")) {
            throw new Error(`Expected land road feature to render road markup, received ${overlayMarkup || "<empty>"}.`);
        }
    });
});
