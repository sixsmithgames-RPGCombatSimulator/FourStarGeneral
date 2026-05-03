import type { AirShowPlannerPoint, AirShowPlannerRole } from "./AirShowPlanner";

export interface AirShowRailCorridor {
  readonly center: AirShowPlannerPoint;
  readonly axis: { readonly x: number; readonly y: number };
  readonly normal: { readonly x: number; readonly y: number };
}

export interface AirShowRailPathOptions {
  readonly lateralPx?: number;
  readonly midLateralPx?: number;
  readonly entryProgress?: number;
  readonly exitProgress?: number;
}

export const AIR_SHOW_RAIL_LANE_SPACING_PX = 42;
export const AIR_SHOW_RAIL_ROLE_SEPARATION_PX = 72;

export function resolveAirShowRailCoordinates(
  corridor: AirShowRailCorridor,
  point: AirShowPlannerPoint
): { alongPx: number; lateralPx: number } {
  const offsetX = point.cx - corridor.center.cx;
  const offsetY = point.cy - corridor.center.cy;
  return {
    alongPx: offsetX * corridor.axis.x + offsetY * corridor.axis.y,
    lateralPx: offsetX * corridor.normal.x + offsetY * corridor.normal.y
  };
}

export function projectAirShowRailPoint(
  corridor: AirShowRailCorridor,
  alongPx: number,
  lateralPx = 0
): AirShowPlannerPoint {
  return {
    cx: corridor.center.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx,
    cy: corridor.center.cy + corridor.axis.y * alongPx + corridor.normal.y * lateralPx
  };
}

export function resolveAirShowRailLaneOffsetPx(
  laneIndex: number,
  role: AirShowPlannerRole,
  localOffsetPx = 0
): number {
  const roleOffset =
    role === "interceptor"
      ? -AIR_SHOW_RAIL_ROLE_SEPARATION_PX
      : role === "escort"
        ? AIR_SHOW_RAIL_ROLE_SEPARATION_PX
        : 0;
  return roleOffset + laneIndex * AIR_SHOW_RAIL_LANE_SPACING_PX + localOffsetPx;
}

export function buildAirShowPresetRailPath(
  corridor: AirShowRailCorridor,
  start: AirShowPlannerPoint,
  end: AirShowPlannerPoint,
  options: AirShowRailPathOptions = {}
): AirShowPlannerPoint[] {
  const startCoords = resolveAirShowRailCoordinates(corridor, start);
  const endCoords = resolveAirShowRailCoordinates(corridor, end);
  const entryProgress = options.entryProgress ?? 0.35;
  const exitProgress = options.exitProgress ?? 0.7;
  const lateralPx = options.lateralPx ?? endCoords.lateralPx;
  const midLateralPx = options.midLateralPx ?? lateralPx;
  const projectBetween = (progress: number, selectedLateralPx: number): AirShowPlannerPoint =>
    projectAirShowRailPoint(
      corridor,
      startCoords.alongPx + (endCoords.alongPx - startCoords.alongPx) * progress,
      startCoords.lateralPx + (selectedLateralPx - startCoords.lateralPx) * progress
    );

  return dedupeAirShowRailPath([
    start,
    projectBetween(entryProgress, midLateralPx),
    projectBetween(exitProgress, lateralPx),
    end
  ]);
}

export function measureAirShowRailPathLength(points: ReadonlyArray<AirShowPlannerPoint>): number {
  let lengthPx = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }
    lengthPx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
  }
  return lengthPx;
}

function dedupeAirShowRailPath(points: ReadonlyArray<AirShowPlannerPoint>): AirShowPlannerPoint[] {
  const deduped: AirShowPlannerPoint[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5) {
      deduped.push({ cx: point.cx, cy: point.cy });
    }
  });
  return deduped;
}
