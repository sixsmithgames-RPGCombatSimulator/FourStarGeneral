export const AIR_SHOW_OFF_MAP_DISTANCE_PX = 500;
function normalizeVector(dx, dy, fallbackX = 1, fallbackY = 0) {
    const length = Math.hypot(dx, dy);
    if (length > 0.0001) {
        return { x: dx / length, y: dy / length };
    }
    const fallbackLength = Math.max(0.0001, Math.hypot(fallbackX, fallbackY));
    return {
        x: fallbackX / fallbackLength,
        y: fallbackY / fallbackLength
    };
}
export function buildAirShowMapBounds(centers, hexWidth, hexHeight) {
    if (centers.length === 0) {
        return null;
    }
    const halfWidth = hexWidth * 0.5;
    const halfHeight = hexHeight * 0.5;
    return {
        minX: Math.min(...centers.map((center) => center.cx)) - halfWidth,
        maxX: Math.max(...centers.map((center) => center.cx)) + halfWidth,
        minY: Math.min(...centers.map((center) => center.cy)) - halfHeight,
        maxY: Math.max(...centers.map((center) => center.cy)) + halfHeight
    };
}
export function resolveAirShowBoundsRayIntersection(origin, direction, bounds) {
    const candidates = [];
    const epsilon = 0.0001;
    if (Math.abs(direction.x) > epsilon) {
        const tMinX = (bounds.minX - origin.cx) / direction.x;
        const yAtMinX = origin.cy + direction.y * tMinX;
        if (tMinX >= 0 && yAtMinX >= bounds.minY - epsilon && yAtMinX <= bounds.maxY + epsilon) {
            candidates.push({ t: tMinX, point: { cx: bounds.minX, cy: yAtMinX } });
        }
        const tMaxX = (bounds.maxX - origin.cx) / direction.x;
        const yAtMaxX = origin.cy + direction.y * tMaxX;
        if (tMaxX >= 0 && yAtMaxX >= bounds.minY - epsilon && yAtMaxX <= bounds.maxY + epsilon) {
            candidates.push({ t: tMaxX, point: { cx: bounds.maxX, cy: yAtMaxX } });
        }
    }
    if (Math.abs(direction.y) > epsilon) {
        const tMinY = (bounds.minY - origin.cy) / direction.y;
        const xAtMinY = origin.cx + direction.x * tMinY;
        if (tMinY >= 0 && xAtMinY >= bounds.minX - epsilon && xAtMinY <= bounds.maxX + epsilon) {
            candidates.push({ t: tMinY, point: { cx: xAtMinY, cy: bounds.minY } });
        }
        const tMaxY = (bounds.maxY - origin.cy) / direction.y;
        const xAtMaxY = origin.cx + direction.x * tMaxY;
        if (tMaxY >= 0 && xAtMaxY >= bounds.minX - epsilon && xAtMaxY <= bounds.maxX + epsilon) {
            candidates.push({ t: tMaxY, point: { cx: xAtMaxY, cy: bounds.maxY } });
        }
    }
    if (candidates.length === 0) {
        return null;
    }
    candidates.sort((left, right) => left.t - right.t);
    return candidates[0].point;
}
export function resolveAirShowFallbackOrigin(center, faction, bounds, options = {}) {
    const offsetPx = options.offsetPx ?? AIR_SHOW_OFF_MAP_DISTANCE_PX;
    const hexHeight = options.hexHeight ?? 0;
    const sign = faction === "Bot" ? 1 : -1;
    if (bounds) {
        return {
            cx: sign >= 0 ? bounds.maxX + offsetPx : bounds.minX - offsetPx,
            cy: Math.max(bounds.minY - 220, Math.min(bounds.maxY + 220, center.cy + sign * hexHeight * 0.75))
        };
    }
    return {
        cx: center.cx + sign * (248 + offsetPx),
        cy: center.cy - sign * 126
    };
}
export function resolveAirShowHqAxis(playerHq, botHq, mapBounds, offsetPx = AIR_SHOW_OFF_MAP_DISTANCE_PX) {
    if (!playerHq || !botHq || !mapBounds) {
        return null;
    }
    const axis = normalizeVector(playerHq.cx - botHq.cx, playerHq.cy - botHq.cy, 1, 0);
    const playerBoundary = resolveAirShowBoundsRayIntersection(playerHq, axis, mapBounds)
        ?? {
            cx: mapBounds.minX,
            cy: playerHq.cy
        };
    const botBoundary = resolveAirShowBoundsRayIntersection(botHq, { x: -axis.x, y: -axis.y }, mapBounds)
        ?? {
            cx: mapBounds.maxX,
            cy: botHq.cy
        };
    return {
        axis,
        mapBounds,
        playerBoundary,
        botBoundary,
        playerOrigin: {
            cx: playerBoundary.cx + axis.x * offsetPx,
            cy: playerBoundary.cy + axis.y * offsetPx
        },
        botOrigin: {
            cx: botBoundary.cx - axis.x * offsetPx,
            cy: botBoundary.cy - axis.y * offsetPx
        }
    };
}
export function buildAirShowInspectionOriginPlan(hqAxis, offsetPx = AIR_SHOW_OFF_MAP_DISTANCE_PX) {
    return {
        offsetPx,
        axis: { cx: hqAxis.axis.x, cy: hqAxis.axis.y },
        mapBounds: { ...hqAxis.mapBounds },
        playerBoundary: { cx: hqAxis.playerBoundary.cx, cy: hqAxis.playerBoundary.cy },
        botBoundary: { cx: hqAxis.botBoundary.cx, cy: hqAxis.botBoundary.cy },
        playerOrigin: { cx: hqAxis.playerOrigin.cx, cy: hqAxis.playerOrigin.cy },
        botOrigin: { cx: hqAxis.botOrigin.cx, cy: hqAxis.botOrigin.cy }
    };
}
export function buildAirShowPhaseTimingAudit(label, durationMs, samples, roleTargetSpeeds) {
    const roles = Array.from(new Set(samples.map((sample) => sample.role))).map((role) => {
        const roleSamples = samples.filter((sample) => sample.role === role);
        const meanPathLengthPx = roleSamples.length > 0
            ? roleSamples.reduce((sum, sample) => sum + sample.pathLengthPx, 0) / roleSamples.length
            : 0;
        const meanActiveDurationMs = roleSamples.length > 0
            ? roleSamples.reduce((sum, sample) => {
                return sum + Math.max(0, sample.activeDurationMs ?? durationMs);
            }, 0) / roleSamples.length
            : durationMs;
        const targetSpeedPxPerMs = roleTargetSpeeds.get(role) ?? 0;
        const expectedDurationMs = meanPathLengthPx > 0 && targetSpeedPxPerMs > 0
            ? meanPathLengthPx / targetSpeedPxPerMs
            : 0;
        const realizedSpeedPxPerMs = meanPathLengthPx > 0 && meanActiveDurationMs > 0
            ? meanPathLengthPx / meanActiveDurationMs
            : 0;
        return {
            role,
            assignmentCount: roleSamples.length,
            targetSpeedPxPerMs,
            meanPathLengthPx,
            expectedDurationMs,
            phaseDurationMs: durationMs,
            realizedDurationMs: meanActiveDurationMs,
            realizedSpeedPxPerMs,
            speedDeltaPxPerMs: realizedSpeedPxPerMs - targetSpeedPxPerMs
        };
    });
    return {
        label,
        durationMs,
        roles
    };
}
