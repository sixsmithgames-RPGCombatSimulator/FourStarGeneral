import type { ScenarioData } from "../core/types";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import { buildHexMapLayout } from "./HexMapLayout";
import { renderTerrainFeatureOverlay } from "./HexMapMarkupBuilder";
import { RiverOverlayRenderer } from "./RiverOverlayRenderer";
import { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import { resolveTerrainFill } from "./TerrainFillPalette";

export interface PrecombatMiniMapPresentation {
  readonly markup: string;
  readonly viewBox: string;
  readonly tileCount: number;
  readonly width: number;
  readonly height: number;
}

const roadRenderer = new RoadOverlayRenderer();
const riverRenderer = new RiverOverlayRenderer();

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildFeatureOverlay(
  tile: TileDetails,
  cx: number,
  cy: number,
  clipId: string,
  points: string
): { readonly definitions: string; readonly overlay: string } {
  const overlay = renderTerrainFeatureOverlay(tile, cx, cy, clipId);
  if (!overlay) return { definitions: "", overlay: "" };
  return {
    definitions: `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"></polygon></clipPath></defs>`,
    overlay
  };
}

/** Builds the inert, deterministic theater overview without combat renderer state or effects. */
export function buildPrecombatMiniMapPresentation(data: ScenarioData): PrecombatMiniMapPresentation {
  const layout = buildHexMapLayout(data);
  if (layout.hexes.length === 0) {
    return { markup: "", viewBox: "0 0 1 1", tileCount: 0, width: 0, height: 0 };
  }

  const markup = layout.hexes.map(({ tile, x, y, col, row }) => {
    const cx = x - layout.minX + layout.margin;
    const cy = y - layout.minY + layout.margin;
    const points = CoordinateSystem.hexPoints(cx, cy);
    const hexKey = CoordinateSystem.makeHexKey(col, row);
    const clipId = `precombat-clip-${hexKey.replace(/[^a-z0-9]/gi, "-")}`;
    const road = roadRenderer.drawRoadOverlay(cx, cy, tile, col, row, data.tiles, data.tilePalette);
    const river = riverRenderer.drawRiverOverlay(cx, cy, tile, col, row, data.tiles, data.tilePalette);
    const features = buildFeatureOverlay(tile, cx, cy, clipId, points);
    const fill = resolveTerrainFill(tile.terrain, tile.terrainType, "briefing");

    return `<g class="hex-cell" aria-hidden="true" data-terrain="${escapeAttribute(tile.terrain)}" data-terrain-type="${escapeAttribute(tile.terrainType)}" data-features="${escapeAttribute(tile.features.join("|"))}" data-hex="${hexKey}" data-col="${col}" data-row="${row}" data-cx="${cx}" data-cy="${cy}">${features.definitions}<polygon class="hex-tile" points="${points}" fill="${fill}" fill-opacity="0.92" stroke="#272319" stroke-width="0.9" vector-effect="non-scaling-stroke" style="paint-order:stroke fill"></polygon>${road}${river}${features.overlay}</g>`;
  }).join("");

  return {
    markup,
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    tileCount: layout.hexes.length,
    width: layout.width,
    height: layout.height
  };
}

/** Applies one precomputed presentation to the precombat DOM boundary. */
export function renderPrecombatMiniMap(
  svg: SVGSVGElement,
  canvas: HTMLDivElement,
  data: ScenarioData
): PrecombatMiniMapPresentation {
  const presentation = buildPrecombatMiniMapPresentation(data);
  svg.innerHTML = presentation.markup;
  svg.setAttribute("viewBox", presentation.viewBox);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${data.name} theater overview, ${presentation.tileCount} hexes`);
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.overflow = "visible";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  return presentation;
}
