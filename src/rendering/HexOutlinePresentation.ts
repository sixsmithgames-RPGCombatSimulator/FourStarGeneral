import { CoordinateSystem } from "./CoordinateSystem";
import type { RenderableHex } from "./HexMapLayout";

/** Keeps tactical borders above neighboring terrain without changing the map's hit targets. */
export function buildHexOutlineLayerMarkup(hexes: readonly RenderableHex[], minX: number, minY: number, margin: number): string {
  const outlines: string = hexes.map((hex: RenderableHex): string => {
    const cx: number = hex.x - minX + margin;
    const cy: number = hex.y - minY + margin;
    const points: string = CoordinateSystem.hexPoints(cx, cy);
    // Inset the border visually so adjacent highlighted hexes retain their own complete perimeter.
    return `<g class="hex-outline-cell" data-outline-hex="${CoordinateSystem.makeHexKey(hex.col, hex.row)}" transform="translate(${cx} ${cy}) scale(0.93) translate(${-cx} ${-cy})">
      <polygon class="hex-outline-casing" points="${points}" vector-effect="non-scaling-stroke"></polygon>
      <polygon class="hex-outline-core" points="${points}" vector-effect="non-scaling-stroke"></polygon>
    </g>`;
  }).join("");
  return `<g class="hex-outline-layer" aria-hidden="true" pointer-events="none">${outlines}</g>`;
}
