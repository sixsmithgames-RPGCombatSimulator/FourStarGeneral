import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";

registerTest("HEXMAP_RECON_BIKE_WRECKS_USE_SMALL_SCATTERED_SILHOUETTES", async ({ Then }) => {
  const renderer = new HexMapRenderer() as unknown as {
    createWreckShape: (hexKey: string, wreckClass: "truck", scenarioType: string | null, cx: number, cy: number) => SVGGElement;
  };

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

  await Then("light vehicle wrecks stay low-profile and fragmented", () => {});
});
