import { HEX_HEIGHT, HEX_WIDTH } from "../core/balance";
import { axialDirections } from "../core/Hex";
import type { ScenarioData, TerrainDictionary } from "../core/types";
import terrainData from "../data/terrain.json";
import { CoordinateSystem, type TileDetails } from "./CoordinateSystem";
import type { RiverOverlayRenderer } from "./RiverOverlayRenderer";
import type { RoadOverlayRenderer } from "./RoadOverlayRenderer";
import type { TerrainRenderer } from "./TerrainRenderer";
import type { RenderableHex } from "./HexMapLayout";

export type { RenderableHex } from "./HexMapLayout";

const HEX_DEFAULT_STROKE = "#2a2a2a";
const HEX_DEFAULT_STROKE_WIDTH = 1;

export interface HexMapMarkupServices {
  readonly terrainRenderer: Pick<
    TerrainRenderer,
    "getTerrainFill" | "generateHexTooltip" | "getTerrainSprite" | "getBeachWaterSprite"
  >;
  readonly roadRenderer: Pick<RoadOverlayRenderer, "drawRoadOverlay">;
  readonly riverRenderer: Pick<RiverOverlayRenderer, "drawRiverOverlay">;
}

/**
 * Builds inert terrain-colored rings around the real battlefield boundary.
 * The result is deterministic for the supplied hex order and renderer services.
 */
export function buildFringeHexMarkup(
  realAxialKeys: ReadonlySet<string>,
  hexes: readonly RenderableHex[],
  minX: number,
  minY: number,
  margin: number,
  services: Pick<HexMapMarkupServices, "terrainRenderer">
): string {
  if (hexes.length === 0) {
    return "";
  }

  // Build a lookup from axial key → terrain fill so fringe hexes can sample their nearest neighbour.
  const fillByAxialKey = new Map<string, string>();
  for (const hex of hexes) {
    const { q, r } = CoordinateSystem.offsetToAxial(hex.col, hex.row);
    const key = `${q},${r}`;
    const fill = services.terrainRenderer.getTerrainFill(hex.tile.terrain, hex.tile.terrainType);
    fillByAxialKey.set(key, fill);
  }

  // Five rings fade the boundary smoothly from near-full terrain colour to invisible.
  // Opacities follow an exponential decay: ring 0 (innermost) is most visible, ring 4 nearly gone.
  const FRINGE_RINGS = 5;
  const RING_OPACITY = [0.55, 0.38, 0.22, 0.10, 0.04];

  // Collect fringe hexes ring by ring. allFringeKeys tracks every hex already assigned to any
  // ring so the inner-loop claim check stays O(1) regardless of ring count.
  const fringeGroups: Array<{ q: number; r: number; fill: string; opacity: number }[]> = [];
  const allFringeKeys = new Set<string>();
  // The frontier expands one shell at a time; start from the real map boundary.
  let frontierKeys = new Set(realAxialKeys);

  for (let ring = 0; ring < FRINGE_RINGS; ring++) {
    const ringCandidates = new Map<string, { q: number; r: number }>();

    // Expand every frontier hex outward; collect neighbours not already placed.
    for (const key of frontierKeys) {
      const [qStr, rStr] = key.split(",");
      const q = Number(qStr);
      const r = Number(rStr);
      for (const dir of axialDirections) {
        const nq = q + dir.q;
        const nr = r + dir.r;
        const nkey = `${nq},${nr}`;
        if (!realAxialKeys.has(nkey) && !allFringeKeys.has(nkey) && !ringCandidates.has(nkey)) {
          ringCandidates.set(nkey, { q: nq, r: nr });
        }
      }
    }

    const opacity = RING_OPACITY[ring] ?? 0;
    const ringEntries: { q: number; r: number; fill: string; opacity: number }[] = [];

    for (const { q, r } of ringCandidates.values()) {
      // Sample fill from the closest real neighbour found within a search radius equal to
      // (ring + 1) steps so outer rings can still reach a real tile for colour sampling.
      let fill: string | null = null;
      const searchRadius = ring + 2;
      outerSearch: for (let dist = 1; dist <= searchRadius; dist++) {
        for (const dir of axialDirections) {
          const sq = q + dir.q * dist;
          const sr = r + dir.r * dist;
          const candidate = fillByAxialKey.get(`${sq},${sr}`);
          if (candidate) {
            fill = candidate;
            break outerSearch;
          }
        }
      }
      if (fill === null) {
        continue;
      }
      ringEntries.push({ q, r, fill, opacity });
      allFringeKeys.add(`${q},${r}`);
    }

    fringeGroups.push(ringEntries);
    // The next ring expands from the candidates we just placed, not the whole history.
    frontierKeys = new Set(ringCandidates.keys());
  }

  // Emit SVG polygons for every fringe hex. No clip-paths, no interaction attributes, no data-hex.
  const polygons: string[] = [];
  for (const ring of fringeGroups) {
    for (const { q, r, fill, opacity } of ring) {
      const { x, y } = CoordinateSystem.axialToPixel(q, r);
      const cx = x - minX + margin;
      const cy = y - minY + margin;
      const points = CoordinateSystem.hexPoints(cx, cy);
      polygons.push(
        `<polygon points="${points}" fill="${fill}" fill-opacity="${opacity}" stroke="none" style="pointer-events:none;" />`
      );
    }
  }

  if (polygons.length === 0) {
    return "";
  }

  return `<g id="fringeLayer" aria-hidden="true" style="pointer-events:none;">${polygons.join("")}</g>`;
}

/** Builds the deterministic SVG presentation for one real battlefield hex. */
export function buildHexTileMarkup(
  hex: RenderableHex,
  minX: number,
  minY: number,
  margin: number,
  data: ScenarioData,
  services: HexMapMarkupServices
): string {
  const { tile, x, y, col, row } = hex;
  const cx = x - minX + margin;
  const cy = y - minY + margin;

  const points = CoordinateSystem.hexPoints(cx, cy);
  const fill = services.terrainRenderer.getTerrainFill(tile.terrain, tile.terrainType);
  const tooltip = services.terrainRenderer.generateHexTooltip(tile);
  const hexKey = CoordinateSystem.makeHexKey(col, row);
  const clipId = `clip-${hexKey.replace(/[^a-z0-9]/gi, "-")}`;
  let sprite = services.terrainRenderer.getTerrainSprite(tile, col, row);
  // Beach water-edge detection: rotate Terrain_Beach_Water.png to face the nearest sea neighbour.
  // Rotation degrees are clockwise from the art's native NW-water orientation.
  const BEACH_WATER_ROTATION_DEG = [120, 60, 0, 300, 240, 180] as const;
  let beachWaterRotationDeg: number | null = null;
  if (tile.terrain.toLowerCase() === "beach") {
    const currentAxial = CoordinateSystem.offsetToAxial(col, row);
    for (let dirIdx = 0; dirIdx < axialDirections.length; dirIdx += 1) {
      const dir = axialDirections[dirIdx];
      const nq = currentAxial.q + dir.q;
      const nr = currentAxial.r + dir.r;
      const { col: nCol, row: nRow } = CoordinateSystem.axialToOffset(nq, nr);
      if (nRow >= 0 && nRow < data.tiles.length && nCol >= 0 && nCol < data.tiles[nRow].length) {
        const neighborTile = CoordinateSystem.resolveTile(data.tiles[nRow][nCol], data.tilePalette);
        if (neighborTile && neighborTile.terrain.toLowerCase() === "sea") {
          sprite = services.terrainRenderer.getBeachWaterSprite();
          beachWaterRotationDeg = BEACH_WATER_ROTATION_DEG[dirIdx];
          break;
        }
      }
    }
  }

  // Look up terrain definition for LOS and combat stats
  const terrainDef = (terrainData as TerrainDictionary)[tile.terrain as keyof TerrainDictionary];
  const defense = terrainDef?.defense ?? 0;
  const accMod = terrainDef?.accMod ?? 0;
  const blocksLOS = terrainDef?.blocksLOS ?? false;

  // Apply a small overscan so varied sprite art fully covers the hex without obvious borders.
  const spriteOverscan = 1.08; // 8% zoom keeps edges masked while preserving centering.
  const imageWidth = HEX_WIDTH * spriteOverscan;
  const imageHeight = HEX_HEIGHT * spriteOverscan;
  const imageX = cx - imageWidth / 2;
  const imageY = cy - imageHeight / 2;

  const roadOverlay = services.roadRenderer.drawRoadOverlay(
    cx,
    cy,
    tile,
    col,
    row,
    data.tiles,
    data.tilePalette
  );
  const riverOverlay = services.riverRenderer.drawRiverOverlay(
    cx,
    cy,
    tile,
    col,
    row,
    data.tiles,
    data.tilePalette
  );
  const featureOverlay = renderTerrainFeatureOverlay(tile, cx, cy, clipId);

  return `
      <g class="hex-cell" data-terrain="${tile.terrain}" data-terrain-type="${tile.terrainType}" data-features="${tile.features.join("|")}" data-hex="${hexKey}" data-col="${col}" data-row="${row}" data-cx="${cx}" data-cy="${cy}" data-clip-id="${clipId}" data-defense="${defense}" data-acc-mod="${accMod}" data-blocks-los="${blocksLOS}">
        <defs>
          <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
            <polygon points="${points}"></polygon>
          </clipPath>
        </defs>
        ${sprite ? `<image href="${sprite}" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" class="terrain-sprite"${beachWaterRotationDeg !== null ? ` transform="rotate(${beachWaterRotationDeg},${cx},${cy})"` : ""} />` : ""}
        <polygon class="hex-tile" points="${points}" fill="${fill}" fill-opacity="${sprite ? (tile.terrain.toLowerCase() === "sea" || beachWaterRotationDeg !== null ? 0.08 : 0.35) : 1}" stroke="${HEX_DEFAULT_STROKE}" stroke-width="${HEX_DEFAULT_STROKE_WIDTH}"></polygon>
        ${roadOverlay}
        ${riverOverlay}
        ${featureOverlay}
        <title>${tooltip}</title>
      </g>
    `;
}

export function renderTerrainFeatureOverlay(tile: TileDetails, cx: number, cy: number, clipId: string): string {
  if (tile.features.length === 0) {
    return "";
  }

  const features = new Set(tile.features.map((feature) => feature.toLowerCase()));
  const overlays: string[] = [];

  if (features.has("shallow")) {
    overlays.push(renderShallowCrossingOverlay(cx, cy, clipId));
  }
  if (features.has("ford")) {
    overlays.push(renderFordOverlay(cx, cy, clipId));
  }
  if (features.has("bridge") && features.has("rubble")) {
    overlays.push(renderRubbleBridgeOverlay(cx, cy, clipId));
  }

  return overlays.join("");
}

function renderShallowCrossingOverlay(cx: number, cy: number, clipId: string): string {
  const startX = cx - HEX_WIDTH * 0.24;
  const endX = cx + HEX_WIDTH * 0.24;
  const topY = cy - HEX_HEIGHT * 0.12;
  const midY = cy;
  const bottomY = cy + HEX_HEIGHT * 0.12;

  return `
      <g class="terrain-feature-overlay terrain-feature-overlay--shallow" clip-path="url(#${clipId})" opacity="0.95">
        <path d="M ${startX} ${topY} C ${cx - HEX_WIDTH * 0.12} ${topY - 4}, ${cx + HEX_WIDTH * 0.04} ${topY + 4}, ${endX} ${topY}" fill="none" stroke="#d8ecf7" stroke-width="2.4" stroke-linecap="round" />
        <path d="M ${startX} ${midY} C ${cx - HEX_WIDTH * 0.1} ${midY - 5}, ${cx + HEX_WIDTH * 0.08} ${midY + 5}, ${endX} ${midY}" fill="none" stroke="#f3f8fb" stroke-width="2.8" stroke-linecap="round" />
        <path d="M ${startX} ${bottomY} C ${cx - HEX_WIDTH * 0.08} ${bottomY - 4}, ${cx + HEX_WIDTH * 0.12} ${bottomY + 4}, ${endX} ${bottomY}" fill="none" stroke="#d8ecf7" stroke-width="2.4" stroke-linecap="round" />
      </g>
    `;
}

function renderFordOverlay(cx: number, cy: number, clipId: string): string {
  const stoneOffsets = [-20, -10, 0, 10, 20];
  const stones = stoneOffsets
    .map((offset, index) => {
      const radius = index % 2 === 0 ? 3.4 : 2.8;
      const y = cy + (index % 2 === 0 ? -2 : 2);
      return `<circle cx="${cx + offset}" cy="${y}" r="${radius}" fill="#d7c099" fill-opacity="0.95" stroke="#755f41" stroke-width="0.9" />`;
    })
    .join("");

  return `
      <g class="terrain-feature-overlay terrain-feature-overlay--ford" clip-path="url(#${clipId})">
        <path d="M ${cx - HEX_WIDTH * 0.28} ${cy} L ${cx + HEX_WIDTH * 0.28} ${cy}" fill="none" stroke="#8b6f47" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.85" />
        ${stones}
      </g>
    `;
}

function renderRubbleBridgeOverlay(cx: number, cy: number, clipId: string): string {
  const beamWidth = HEX_WIDTH * 0.2;
  const beamHeight = 5;
  const rubble = [
    { x: cx - 9, y: cy + 6, r: 2.4 },
    { x: cx - 3, y: cy + 8, r: 2.1 },
    { x: cx + 5, y: cy + 7, r: 2.5 },
    { x: cx + 11, y: cy + 5, r: 1.9 }
  ]
    .map(({ x, y, r }) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#756451" fill-opacity="0.95" />`)
    .join("");

  return `
      <g class="terrain-feature-overlay terrain-feature-overlay--rubble-bridge" clip-path="url(#${clipId})" opacity="0.95">
        <rect x="${cx - beamWidth - 4}" y="${cy - beamHeight / 2}" width="${beamWidth}" height="${beamHeight}" rx="1.4" fill="#6c5945" />
        <rect x="${cx + 4}" y="${cy - beamHeight / 2}" width="${beamWidth}" height="${beamHeight}" rx="1.4" fill="#6c5945" />
        <line x1="${cx - 4}" y1="${cy - 3}" x2="${cx + 4}" y2="${cy + 3}" stroke="#4f4031" stroke-width="2" />
        <line x1="${cx - 4}" y1="${cy + 3}" x2="${cx + 4}" y2="${cy - 3}" stroke="#4f4031" stroke-width="2" />
        ${rubble}
      </g>
    `;
}
