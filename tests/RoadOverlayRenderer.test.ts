import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { RoadOverlayRenderer } from "../src/rendering/RoadOverlayRenderer";
import type { TilePalette } from "../src/core/types";
import type { TileDetails } from "../src/rendering/CoordinateSystem";

registerTest("ROAD_OVERLAY_TREATS_HAMLET_AS_CONNECTED_ROAD", async ({ Given, When, Then }) => {
  let renderer: RoadOverlayRenderer;
  let hamletHasRoad = false;
  let overlayMarkup = "";

  const hamletTile: TileDetails = {
    terrain: "city",
    terrainType: "urban",
    density: "sparse",
    features: ["buildings"],
    recon: "intel"
  };

  const roadTile: TileDetails = {
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
    overlayMarkup = renderer.drawRoadOverlay(
      120,
      120,
      hamletTile,
      0,
      0,
      [[hamletTile, roadTile]],
      {} as TilePalette
    );
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
  let renderer: RoadOverlayRenderer;
  let plainsRoad = false;
  let seaRoad = false;
  let overlayMarkup = "";

  const plainsWithRoad: TileDetails = {
    terrain: "plains",
    terrainType: "grass",
    density: "average",
    features: ["road"],
    recon: "intel"
  };

  const seaWithRoad: TileDetails = {
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
    overlayMarkup = renderer.drawRoadOverlay(
      120,
      120,
      plainsWithRoad,
      0,
      0,
      [[plainsWithRoad]],
      {} as TilePalette
    );
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
