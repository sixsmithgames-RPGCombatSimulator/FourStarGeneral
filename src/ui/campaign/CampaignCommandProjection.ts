/** Small, pure adapters that keep runtime coordinate contracts out of campaign presentation components. */

import { CoordinateSystem } from "../../rendering/CoordinateSystem";

/** Converts the runtime's axial `q,r` identity into the campaign UI/map's offset `col,row` identity. */
export function projectRuntimeHexKeyToCampaignOffset(runtimeHexKey: string | null): string | null {
  if (!runtimeHexKey) return null;
  const coordinates = runtimeHexKey.split(",").map(Number);
  if (coordinates.length !== 2 || !coordinates.every(Number.isInteger)) return null;
  const offset = CoordinateSystem.axialToOffset(coordinates[0], coordinates[1]);
  return CoordinateSystem.makeHexKey(offset.col, offset.row);
}
