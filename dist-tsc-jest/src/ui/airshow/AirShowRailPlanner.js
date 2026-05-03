export const AIR_SHOW_RAIL_LANE_SPACING_PX = 42;
export const AIR_SHOW_RAIL_ROLE_SEPARATION_PX = 72;
export function resolveAirShowRailCoordinates(corridor, point) {
    const offsetX = point.cx - corridor.center.cx;
    const offsetY = point.cy - corridor.center.cy;
    return {
        alongPx: offsetX * corridor.axis.x + offsetY * corridor.axis.y,
        lateralPx: offsetX * corridor.normal.x + offsetY * corridor.normal.y
    };
}
export function projectAirShowRailPoint(corridor, alongPx, lateralPx = 0) {
    return {
        cx: corridor.center.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx,
        cy: corridor.center.cy + corridor.axis.y * alongPx + corridor.normal.y * lateralPx
    };
}
export function resolveAirShowRailLaneOffsetPx(laneIndex, role, localOffsetPx = 0) {
    const roleOffset = role === "interceptor"
        ? -AIR_SHOW_RAIL_ROLE_SEPARATION_PX
        : role === "escort"
            ? AIR_SHOW_RAIL_ROLE_SEPARATION_PX
            : 0;
    return roleOffset + laneIndex * AIR_SHOW_RAIL_LANE_SPACING_PX + localOffsetPx;
}
export function buildAirShowPresetRailPath(corridor, start, end, options = {}) {
    const startCoords = resolveAirShowRailCoordinates(corridor, start);
    const endCoords = resolveAirShowRailCoordinates(corridor, end);
    const entryProgress = options.entryProgress ?? 0.35;
    const exitProgress = options.exitProgress ?? 0.7;
    const lateralPx = options.lateralPx ?? endCoords.lateralPx;
    const midLateralPx = options.midLateralPx ?? lateralPx;
    const projectBetween = (progress, selectedLateralPx) => projectAirShowRailPoint(corridor, startCoords.alongPx + (endCoords.alongPx - startCoords.alongPx) * progress, startCoords.lateralPx + (selectedLateralPx - startCoords.lateralPx) * progress);
    return dedupeAirShowRailPath([
        start,
        projectBetween(entryProgress, midLateralPx),
        projectBetween(exitProgress, lateralPx),
        end
    ]);
}
export function measureAirShowRailPathLength(points) {
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
function dedupeAirShowRailPath(points) {
    const deduped = [];
    points.forEach((point) => {
        const previous = deduped[deduped.length - 1];
        if (!previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) > 0.5) {
            deduped.push({ cx: point.cx, cy: point.cy });
        }
    });
    return deduped;
}
