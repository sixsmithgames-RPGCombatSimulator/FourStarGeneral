import type { AirShowPoint } from "../ui/airshow/AirShowPlaybackScene";

export interface AirShowCombatPassCorridor {
  readonly center: AirShowPoint;
  readonly axis: Readonly<{ x: number; y: number }>;
  readonly normal: Readonly<{ x: number; y: number }>;
  readonly entry: AirShowPoint;
  readonly merge: AirShowPoint;
  readonly strike: AirShowPoint;
  readonly exit: AirShowPoint;
}

interface ClampBoundsOptions {
  readonly clampCenter?: AirShowPoint;
  readonly maxHorizontalPx?: number;
  readonly maxVerticalPx?: number;
}

interface PhaseEntryBridgeOptions extends ClampBoundsOptions {
  readonly startHeadingDegrees?: number;
  readonly sideSign?: number;
  readonly carryForwardPx?: number;
}

interface HeadingLeadOptions extends ClampBoundsOptions {
  readonly startHeadingDegrees?: number;
  readonly lateralSign?: number;
  readonly leadForwardPx?: number;
  readonly leadLateralPx?: number;
}

interface EarlyTurnOptions {
  readonly maxTurnDeg?: number;
  readonly strongTurnDeg?: number;
  readonly maxFirstSegmentPx?: number;
  readonly maxWaypointsToRemove?: number;
}

interface IngressStagingOptions {
  readonly startHeadingDegrees?: number;
  readonly lateralSign?: number;
  readonly arcPx?: number;
  readonly driftPx?: number;
}

export interface AirShowCombatPassGeometryServices {
  clamp(value: number, min: number, max: number): number;
  clampPointToViewportBounds(
    point: AirShowPoint,
    center: AirShowPoint,
    maxHorizontalPx?: number,
    maxVerticalPx?: number
  ): AirShowPoint;
  normalizeVector(
    dx: number,
    dy: number,
    fallbackX?: number,
    fallbackY?: number
  ): { x: number; y: number };
  resolveAircraftHeadingDegrees(dx: number, dy: number, fallbackDegrees?: number): number;
  resolveHeadingVector(headingDegrees: number): { x: number; y: number };
  resolveVectorAngleDegrees(
    left: Readonly<{ x: number; y: number }>,
    right: Readonly<{ x: number; y: number }>
  ): number;
  resolveWaypointTurnDegrees(
    previous: AirShowPoint,
    current: AirShowPoint,
    next: AirShowPoint
  ): number;
  resolvePathHeadingDegrees(
    points: ReadonlyArray<AirShowPoint>,
    fallbackHeadingDegrees?: number
  ): number | undefined;
  projectCorridorPoint(
    corridor: AirShowCombatPassCorridor,
    alongPx: number,
    lateralPx?: number
  ): AirShowPoint;
  resolveCorridorCoordinates(
    corridor: AirShowCombatPassCorridor,
    point: AirShowPoint
  ): { alongPx: number; lateralPx: number };
  buildPhaseEntryBridge(
    start: AirShowPoint,
    toward: AirShowPoint,
    options: PhaseEntryBridgeOptions
  ): AirShowPoint[];
  buildHeadingLeadPoint(
    start: AirShowPoint,
    toward: AirShowPoint,
    options?: HeadingLeadOptions
  ): AirShowPoint;
  buildIngressStagingPath(
    start: AirShowPoint,
    stagePoint: AirShowPoint,
    nextFocusPoint: AirShowPoint,
    options?: IngressStagingOptions
  ): AirShowPoint[];
  pruneTurnWaypoint(
    path: ReadonlyArray<AirShowPoint>,
    waypointIndex: number,
    maxTurnDeg: number
  ): AirShowPoint[];
  pruneEarlyTurnWaypoints(
    path: ReadonlyArray<AirShowPoint>,
    options?: EarlyTurnOptions
  ): AirShowPoint[];
  pruneSharpTurns(
    path: ReadonlyArray<AirShowPoint>,
    maxTurnDeg: number,
    maxWaypointsToRemove?: number
  ): AirShowPoint[];
}

export interface AirShowDogfightPassOptions {
  readonly sideSign: number;
  readonly laneIndex?: number;
  readonly passSign?: number;
  readonly startHeadingDegrees?: number;
  readonly entrySeparationPx?: number;
  readonly crossSeparationPx?: number;
  readonly overshootPx?: number;
  readonly turnRadiusPx?: number;
}

export interface AirShowBomberInterceptPassOptions {
  readonly passStartAlongPx: number;
  readonly passEndAlongPx: number;
  readonly laneIndex?: number;
  readonly attackSideSign?: number;
  readonly startHeadingDegrees?: number;
}

interface DogfightContext {
  readonly start: AirShowPoint;
  readonly focus: AirShowPoint;
  readonly corridor: AirShowCombatPassCorridor;
  readonly services: AirShowCombatPassGeometryServices;
  readonly startHeadingDegrees?: number;
  readonly laneIndex: number;
  readonly sideSign: number;
  readonly passSign: number;
  readonly entrySeparationPx: number;
  readonly crossSeparationPx: number;
  readonly overshootPx: number;
  readonly turnRadiusPx: number;
  readonly laneSpreadPx: number;
}

interface BomberInterceptContext {
  readonly start: AirShowPoint;
  readonly corridor: AirShowCombatPassCorridor;
  readonly services: AirShowCombatPassGeometryServices;
  readonly startHeadingDegrees?: number;
  readonly passStartAlongPx: number;
  readonly passEndAlongPx: number;
  readonly laneIndex: number;
  readonly attackSideSign: number;
  readonly passDirection: number;
  readonly laneSpreadPx: number;
  readonly entryStart: AirShowPoint;
  readonly stagePoint: AirShowPoint;
  readonly gunPoint: AirShowPoint;
  readonly crossingPoint: AirShowPoint;
  readonly extendPoint: AirShowPoint;
  readonly exitPoint: AirShowPoint;
}

interface PathTurnProfile {
  readonly firstTurnDeg: number;
  readonly maxTurnDeg: number;
}

interface HeadingCommitPolicy {
  readonly triggerTurnDeg: number;
  readonly distanceFloorPx: number;
  readonly distanceCapFloorPx: number;
  readonly distanceFactor: number;
  readonly distanceCapFactor: number;
  readonly lateralCapPx: number;
  readonly lateralFactor: number;
  readonly leadFloorPx: number;
  readonly leadCapFloorPx: number;
  readonly leadFactor: number;
  readonly leadCapFactor: number;
  readonly leadLateralPx: number;
  readonly maxHorizontalPx: number;
  readonly maxVerticalPx: number;
}

function detachPath(points: ReadonlyArray<AirShowPoint>): AirShowPoint[] {
  return points.map((point) => ({ cx: point.cx, cy: point.cy }));
}

function removeNearDuplicatePoints(points: ReadonlyArray<AirShowPoint>): AirShowPoint[] {
  return points.filter((point, index) => {
    const previous = index === 0 ? null : points[index - 1];
    return !previous || Math.hypot(point.cx - previous.cx, point.cy - previous.cy) >= 2;
  });
}

function profilePathTurns(
  path: ReadonlyArray<AirShowPoint>,
  services: AirShowCombatPassGeometryServices
): PathTurnProfile {
  let maxTurnDeg = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    if (!previous || !current || !next) continue;
    maxTurnDeg = Math.max(maxTurnDeg, services.resolveWaypointTurnDegrees(previous, current, next));
  }
  const firstPoint = path[1];
  const secondPoint = path[2];
  return {
    firstTurnDeg: firstPoint && secondPoint
      ? services.resolveWaypointTurnDegrees(path[0]!, firstPoint, secondPoint)
      : 0,
    maxTurnDeg
  };
}

function buildHeadingCommitCandidate(
  path: ReadonlyArray<AirShowPoint>,
  start: AirShowPoint,
  startHeadingDegrees: number | undefined,
  lateralSign: number,
  clampCenter: AirShowPoint,
  policy: HeadingCommitPolicy,
  services: AirShowCombatPassGeometryServices
): AirShowPoint[] {
  if (typeof startHeadingDegrees !== "number" || path.length < 2) return [...path];
  const firstPoint = path[1];
  if (!firstPoint) return [...path];
  const routeDx = firstPoint.cx - start.cx;
  const routeDy = firstPoint.cy - start.cy;
  const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
  const routeForward = services.normalizeVector(routeDx, routeDy, 0, -1);
  const routeNormal = { x: -routeForward.y, y: routeForward.x };
  const headingForward = services.resolveHeadingVector(startHeadingDegrees);
  if (services.resolveVectorAngleDegrees(headingForward, routeForward) <= policy.triggerTurnDeg) {
    return [...path];
  }
  const commitDistancePx = Math.min(
    Math.max(policy.distanceFloorPx, routeDistance * policy.distanceFactor),
    Math.max(policy.distanceCapFloorPx, routeDistance * policy.distanceCapFactor)
  );
  const commitPoint = services.clampPointToViewportBounds({
    cx: start.cx + headingForward.x * commitDistancePx
      + routeNormal.x * lateralSign * Math.min(policy.lateralCapPx, routeDistance * policy.lateralFactor),
    cy: start.cy + headingForward.y * commitDistancePx
      + routeNormal.y * lateralSign * Math.min(policy.lateralCapPx, routeDistance * policy.lateralFactor)
  }, clampCenter, policy.maxHorizontalPx, policy.maxVerticalPx);
  if (Math.hypot(commitPoint.cx - start.cx, commitPoint.cy - start.cy) < 24) return [...path];
  const commitLead = services.buildHeadingLeadPoint(commitPoint, firstPoint, {
    startHeadingDegrees: services.resolveAircraftHeadingDegrees(
      commitPoint.cx - start.cx,
      commitPoint.cy - start.cy,
      startHeadingDegrees
    ),
    lateralSign,
    leadForwardPx: Math.min(
      Math.max(policy.leadFloorPx, routeDistance * policy.leadFactor),
      Math.max(policy.leadCapFloorPx, routeDistance * policy.leadCapFactor)
    ),
    leadLateralPx: policy.leadLateralPx,
    clampCenter,
    maxHorizontalPx: policy.maxHorizontalPx,
    maxVerticalPx: policy.maxVerticalPx
  });
  return services.pruneEarlyTurnWaypoints(
    removeNearDuplicatePoints([start, commitPoint, commitLead, ...path.slice(1)]),
    { maxTurnDeg: 42, strongTurnDeg: 88, maxFirstSegmentPx: 78, maxWaypointsToRemove: 1 }
  );
}

function dogfightPointFromFocus(
  context: DogfightContext,
  alongPx: number,
  lateralPx: number
): AirShowPoint {
  const focus = context.services.clampPointToViewportBounds(
    context.focus,
    context.corridor.center,
    430,
    300
  );
  return context.services.clampPointToViewportBounds({
    cx: focus.cx + context.corridor.axis.x * alongPx + context.corridor.normal.x * lateralPx,
    cy: focus.cy + context.corridor.axis.y * alongPx + context.corridor.normal.y * lateralPx
  }, context.corridor.center, 430, 300);
}

function dogfightLeadPoint(
  context: DogfightContext,
  bridgePoints: ReadonlyArray<AirShowPoint>,
  target: AirShowPoint,
  lateralSign: number,
  leadForwardPx: number
): AirShowPoint {
  const bridgeExitPoint = bridgePoints[bridgePoints.length - 1] ?? context.start;
  const bridgeExitHeadingDegrees = context.services.resolvePathHeadingDegrees(
    [context.start, ...bridgePoints],
    context.startHeadingDegrees
  );
  return context.services.buildHeadingLeadPoint(bridgeExitPoint, target, {
    startHeadingDegrees: bridgeExitHeadingDegrees,
    lateralSign,
    leadForwardPx,
    leadLateralPx: 10,
    clampCenter: context.corridor.center,
    maxHorizontalPx: 430,
    maxVerticalPx: 300
  });
}

function trimDogfightBridgeEntry(
  context: DogfightContext,
  target: AirShowPoint,
  bridgePoints: AirShowPoint[],
  lateralSign: number,
  leadForwardPx: number
): AirShowPoint[] {
  while (bridgePoints.length > 2) {
    const firstPoint = bridgePoints[0];
    const secondPoint = bridgePoints[1];
    if (!firstPoint || !secondPoint) break;
    const firstTurnDeg = context.services.resolveWaypointTurnDegrees(context.start, firstPoint, secondPoint);
    const firstSegmentPx = Math.hypot(firstPoint.cx - context.start.cx, firstPoint.cy - context.start.cy);
    if (firstTurnDeg <= 82 || firstSegmentPx >= 48) break;
    bridgePoints.shift();
  }
  let leadPoint = dogfightLeadPoint(context, bridgePoints, target, lateralSign, leadForwardPx);
  while (bridgePoints.length > 0) {
    const previous = bridgePoints.length >= 2 ? bridgePoints[bridgePoints.length - 2] : context.start;
    const current = bridgePoints[bridgePoints.length - 1];
    if (!previous || !current) break;
    const exitTurnDeg = context.services.resolveWaypointTurnDegrees(previous, current, leadPoint);
    const exitSegmentPx = Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
    if (exitTurnDeg <= 92 || exitSegmentPx >= 54) break;
    bridgePoints.pop();
    leadPoint = dogfightLeadPoint(context, bridgePoints, target, lateralSign, leadForwardPx);
  }
  return bridgePoints;
}

function buildMonotonicDogfightApproach(
  context: DogfightContext,
  target: AirShowPoint,
  lateralSign: number
): AirShowPoint[] {
  const routeDx = target.cx - context.start.cx;
  const routeDy = target.cy - context.start.cy;
  const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
  const routeForward = context.services.normalizeVector(routeDx, routeDy, 0, -1);
  const routeNormal = { x: -routeForward.y, y: routeForward.x };
  const buildPoint = (floorPx: number, factor: number, capFloorPx: number, capFactor: number,
    lateralCapPx: number, lateralFactor: number): AirShowPoint =>
    context.services.clampPointToViewportBounds({
      cx: context.start.cx
        + routeForward.x * Math.min(Math.max(floorPx, routeDistance * factor), Math.max(capFloorPx, routeDistance * capFactor))
        + routeNormal.x * lateralSign * Math.min(lateralCapPx, routeDistance * lateralFactor),
      cy: context.start.cy
        + routeForward.y * Math.min(Math.max(floorPx, routeDistance * factor), Math.max(capFloorPx, routeDistance * capFactor))
        + routeNormal.y * lateralSign * Math.min(lateralCapPx, routeDistance * lateralFactor)
    }, context.corridor.center, 430, 300);
  return removeNearDuplicatePoints([
    context.start,
    buildPoint(30, 0.22, 48, 0.32, 14, 0.05),
    buildPoint(68, 0.56, 92, 0.72, 6, 0.025),
    target
  ]);
}

function evaluateDogfightEntry(
  context: DogfightContext,
  path: ReadonlyArray<AirShowPoint>,
  target: AirShowPoint
): PathTurnProfile & { firstPointRecedes: boolean } {
  const profile = profilePathTurns(path, context.services);
  const firstPoint = path[1];
  return {
    ...profile,
    firstPointRecedes: !!firstPoint
      && Math.hypot(firstPoint.cx - target.cx, firstPoint.cy - target.cy)
        > Math.hypot(context.start.cx - target.cx, context.start.cy - target.cy) + 8
  };
}

function buildDogfightEntryTurn(
  context: DogfightContext,
  target: AirShowPoint,
  lateralSign: number,
  carryForwardPx: number,
  leadForwardPx: number
): AirShowPoint[] {
  const bridgePoints = trimDogfightBridgeEntry(
    context,
    target,
    [...context.services.buildPhaseEntryBridge(context.start, target, {
      startHeadingDegrees: context.startHeadingDegrees,
      sideSign: lateralSign,
      clampCenter: context.corridor.center,
      carryForwardPx,
      maxHorizontalPx: 430,
      maxVerticalPx: 300
    })],
    lateralSign,
    leadForwardPx
  );
  const leadPoint = dogfightLeadPoint(context, bridgePoints, target, lateralSign, leadForwardPx);
  const entryPath = [context.start, ...bridgePoints, leadPoint, target];
  const smoothed = context.services.pruneEarlyTurnWaypoints(entryPath, {
    maxTurnDeg: 48, strongTurnDeg: 104, maxFirstSegmentPx: 70, maxWaypointsToRemove: 2
  });
  let resolved = context.services.pruneTurnWaypoint(smoothed, smoothed.length - 2, 56);
  const profile = evaluateDogfightEntry(context, resolved, target);
  if (profile.firstTurnDeg > 54 || profile.maxTurnDeg > 112 || profile.firstPointRecedes) {
    const monotonic = context.services.pruneEarlyTurnWaypoints(
      buildMonotonicDogfightApproach(context, target, lateralSign),
      { maxTurnDeg: 50, strongTurnDeg: 110, maxFirstSegmentPx: 74, maxWaypointsToRemove: 1 }
    );
    resolved = context.services.pruneTurnWaypoint(monotonic, monotonic.length - 2, 60);
  }
  return buildHeadingCommitCandidate(
    resolved,
    context.start,
    context.startHeadingDegrees,
    lateralSign,
    context.corridor.center,
    {
      triggerTurnDeg: 34,
      distanceFloorPx: 52, distanceCapFloorPx: 86, distanceFactor: 0.22, distanceCapFactor: 0.34,
      lateralCapPx: 14, lateralFactor: 0.05,
      leadFloorPx: 32, leadCapFloorPx: 48, leadFactor: 0.14, leadCapFactor: 0.2,
      leadLateralPx: 10, maxHorizontalPx: 430, maxVerticalPx: 300
    },
    context.services
  );
}

function buildDogfightReengagePath(context: DogfightContext): AirShowPoint[] {
  const { entrySeparationPx, laneIndex, laneSpreadPx, overshootPx, sideSign, turnRadiusPx } = context;
  const approachEntry = dogfightPointFromFocus(
    context,
    sideSign * Math.max(18, entrySeparationPx * 0.1),
    sideSign * Math.max(54, entrySeparationPx * 0.36 + laneSpreadPx * 0.12)
  );
  const approachTurn = buildDogfightEntryTurn(context, approachEntry, sideSign, 52, 42);
  const commitPoint = dogfightPointFromFocus(
    context,
    sideSign * Math.max(8, context.crossSeparationPx * 0.45),
    sideSign * Math.max(8, context.crossSeparationPx * 0.6 + laneIndex * 4)
  );
  const breakApex = dogfightPointFromFocus(
    context,
    sideSign * Math.max(44, turnRadiusPx * 0.3),
    -sideSign * Math.max(52, turnRadiusPx * 0.34 + laneSpreadPx * 0.12)
  );
  const rejoinArc = dogfightPointFromFocus(
    context,
    sideSign * Math.max(92, overshootPx * 0.52),
    -sideSign * Math.max(70, turnRadiusPx * 0.46 + laneSpreadPx * 0.14)
  );
  const egressEnd = dogfightPointFromFocus(
    context,
    sideSign * Math.max(138, overshootPx * 0.8),
    -sideSign * Math.max(40, turnRadiusPx * 0.24 + laneSpreadPx * 0.08)
  );
  const smoothed = context.services.pruneEarlyTurnWaypoints(
    [...approachTurn, commitPoint, breakApex, rejoinArc, egressEnd],
    { maxTurnDeg: 48, strongTurnDeg: 104, maxFirstSegmentPx: 76, maxWaypointsToRemove: 2 }
  );
  return context.services.pruneSharpTurns(smoothed, 116, 2);
}

function buildDogfightInitialPath(context: DogfightContext): AirShowPoint[] {
  const { entrySeparationPx, laneIndex, laneSpreadPx, overshootPx, passSign, sideSign, turnRadiusPx } = context;
  const turnInPoint = dogfightPointFromFocus(
    context,
    -sideSign * Math.max(24, entrySeparationPx * 0.15),
    sideSign * Math.max(74, entrySeparationPx * 0.48 + laneSpreadPx * 0.14 + passSign * 4)
  );
  const entryTurn = buildDogfightEntryTurn(context, turnInPoint, sideSign, 58, 48);
  const mergePoint = dogfightPointFromFocus(
    context,
    -sideSign * Math.max(6, context.crossSeparationPx * 0.3),
    sideSign * Math.max(22, context.crossSeparationPx * 1.4 + laneIndex * 22)
  );
  const crossingPoint = dogfightPointFromFocus(
    context,
    sideSign * Math.max(10, context.crossSeparationPx * 0.52),
    -sideSign * Math.max(10, context.crossSeparationPx * 0.92 - 6 + laneIndex * 18)
  );
  const breakExit = dogfightPointFromFocus(
    context,
    sideSign * Math.max(50, overshootPx * 0.28),
    -sideSign * Math.max(62, turnRadiusPx * 0.42 + laneSpreadPx * 0.1 + passSign * 6)
  );
  const egressPoint = dogfightPointFromFocus(
    context,
    sideSign * Math.max(104, overshootPx * 0.6),
    -sideSign * Math.max(46, turnRadiusPx * 0.32 + laneSpreadPx * 0.08)
  );
  return context.services.pruneSharpTurns(
    [...entryTurn, mergePoint, crossingPoint, breakExit, egressPoint],
    118,
    2
  );
}

export function buildAirShowDogfightPassPath(input: {
  readonly start: AirShowPoint;
  readonly focus: AirShowPoint;
  readonly corridor: AirShowCombatPassCorridor;
  readonly options: AirShowDogfightPassOptions;
  readonly services: AirShowCombatPassGeometryServices;
}): AirShowPoint[] {
  const laneIndex = input.options.laneIndex ?? 0;
  const context: DogfightContext = {
    ...input,
    startHeadingDegrees: input.options.startHeadingDegrees,
    laneIndex,
    sideSign: input.options.sideSign >= 0 ? 1 : -1,
    passSign: (input.options.passSign ?? 1) >= 0 ? 1 : -1,
    entrySeparationPx: input.options.entrySeparationPx ?? 176,
    crossSeparationPx: input.options.crossSeparationPx ?? 24,
    overshootPx: input.options.overshootPx ?? 184,
    turnRadiusPx: input.options.turnRadiusPx ?? 162,
    laneSpreadPx: laneIndex * 45
  };
  return detachPath(context.passSign < 0
    ? buildDogfightReengagePath(context)
    : buildDogfightInitialPath(context));
}

function buildBomberInterceptContext(input: {
  readonly start: AirShowPoint;
  readonly corridor: AirShowCombatPassCorridor;
  readonly options: AirShowBomberInterceptPassOptions;
  readonly services: AirShowCombatPassGeometryServices;
}): BomberInterceptContext {
  const laneIndex = input.options.laneIndex ?? 0;
  const attackSideSign = input.options.attackSideSign ?? 1;
  const currentProjection = input.services.resolveCorridorCoordinates(input.corridor, input.start);
  const passDirection = input.options.passEndAlongPx >= currentProjection.alongPx ? 1 : -1;
  const laneSpreadPx = laneIndex * 42;
  const clampPoint = (point: AirShowPoint): AirShowPoint =>
    input.services.clampPointToViewportBounds(point, input.corridor.center, 420, 280);
  const pointOnCorridor = (alongPx: number, lateralPx: number): AirShowPoint =>
    clampPoint(input.services.projectCorridorPoint(input.corridor, alongPx, lateralPx));
  const stageAlongPx = input.services.clamp(
    currentProjection.alongPx + (input.options.passStartAlongPx - currentProjection.alongPx) * 0.48,
    Math.min(currentProjection.alongPx, input.options.passStartAlongPx) - 10,
    Math.max(currentProjection.alongPx, input.options.passStartAlongPx) + 10
  );
  return {
    start: input.start,
    corridor: input.corridor,
    services: input.services,
    startHeadingDegrees: input.options.startHeadingDegrees,
    passStartAlongPx: input.options.passStartAlongPx,
    passEndAlongPx: input.options.passEndAlongPx,
    laneIndex,
    attackSideSign,
    passDirection,
    laneSpreadPx,
    entryStart: clampPoint({
      cx: input.start.cx + laneIndex * 3.2,
      cy: input.start.cy + attackSideSign * laneIndex * 1.2
    }),
    stagePoint: pointOnCorridor(stageAlongPx, laneSpreadPx + attackSideSign * 58),
    gunPoint: pointOnCorridor(
      input.options.passStartAlongPx + passDirection * 12,
      laneSpreadPx + attackSideSign * 16
    ),
    crossingPoint: pointOnCorridor(
      input.options.passEndAlongPx + passDirection * 14,
      laneIndex * 10 - attackSideSign * 4
    ),
    extendPoint: pointOnCorridor(
      input.options.passEndAlongPx + passDirection * 56,
      laneIndex * 12 - attackSideSign * 26
    ),
    exitPoint: pointOnCorridor(
      input.options.passEndAlongPx + passDirection * 92,
      laneIndex * 14 - attackSideSign * 52
    )
  };
}

function evaluateBomberInterceptEntry(
  context: BomberInterceptContext,
  path: ReadonlyArray<AirShowPoint>
): PathTurnProfile & { earlyRegression: boolean; firstPointRecedes: boolean } {
  const profile = profilePathTurns(path, context.services);
  let earlyRegression = false;
  for (let index = 1; index < Math.min(path.length, 4); index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    const previousAlongPx = context.services.resolveCorridorCoordinates(context.corridor, previous).alongPx;
    const currentAlongPx = context.services.resolveCorridorCoordinates(context.corridor, current).alongPx;
    if ((currentAlongPx - previousAlongPx) * context.passDirection < -6) {
      earlyRegression = true;
      break;
    }
  }
  const firstPoint = path[1];
  const secondPoint = path[2];
  return {
    ...profile,
    firstTurnDeg: firstPoint && secondPoint
      ? context.services.resolveWaypointTurnDegrees(context.start, firstPoint, secondPoint)
      : 0,
    earlyRegression,
    firstPointRecedes: !!firstPoint
      && Math.hypot(firstPoint.cx - context.stagePoint.cx, firstPoint.cy - context.stagePoint.cy)
        > Math.hypot(context.start.cx - context.stagePoint.cx, context.start.cy - context.stagePoint.cy) + 6
  };
}

function buildMonotonicBomberInterceptPath(context: BomberInterceptContext): AirShowPoint[] {
  const routeDx = context.stagePoint.cx - context.entryStart.cx;
  const routeDy = context.stagePoint.cy - context.entryStart.cy;
  const routeDistance = Math.max(1, Math.hypot(routeDx, routeDy));
  const routeForward = context.services.normalizeVector(
    routeDx,
    routeDy,
    context.corridor.axis.x,
    context.corridor.axis.y
  );
  const routeNormal = { x: -routeForward.y, y: routeForward.x };
  const buildPoint = (floorPx: number, factor: number, capFloorPx: number, capFactor: number,
    lateralCapPx: number, lateralFactor: number): AirShowPoint =>
    context.services.clampPointToViewportBounds({
      cx: context.entryStart.cx
        + routeForward.x * Math.min(Math.max(floorPx, routeDistance * factor), Math.max(capFloorPx, routeDistance * capFactor))
        + routeNormal.x * context.attackSideSign * Math.min(lateralCapPx, routeDistance * lateralFactor),
      cy: context.entryStart.cy
        + routeForward.y * Math.min(Math.max(floorPx, routeDistance * factor), Math.max(capFloorPx, routeDistance * capFactor))
        + routeNormal.y * context.attackSideSign * Math.min(lateralCapPx, routeDistance * lateralFactor)
    }, context.corridor.center, 420, 280);
  return removeNearDuplicatePoints([
    context.entryStart,
    buildPoint(28, 0.18, 44, 0.24, 12, 0.04),
    buildPoint(72, 0.44, 104, 0.56, 6, 0.02),
    context.stagePoint,
    context.gunPoint,
    context.crossingPoint,
    context.extendPoint,
    context.exitPoint
  ]);
}

function buildStagedBomberInterceptPath(context: BomberInterceptContext): AirShowPoint[] {
  const stagedPath = context.services.buildIngressStagingPath(
    context.entryStart,
    context.stagePoint,
    context.gunPoint,
    {
      startHeadingDegrees: context.startHeadingDegrees,
      lateralSign: context.attackSideSign,
      arcPx: 28 + Math.abs(context.laneIndex) * 6,
      driftPx: 10 + Math.abs(context.laneIndex) * 2
    }
  );
  return removeNearDuplicatePoints([
    ...stagedPath,
    context.gunPoint,
    context.crossingPoint,
    context.extendPoint,
    context.exitPoint
  ]);
}

function finalizeBomberInterceptCandidate(
  context: BomberInterceptContext,
  path: ReadonlyArray<AirShowPoint>,
  policy: EarlyTurnOptions & { sharpTurnDeg: number; sharpTurnRemovals: number }
): AirShowPoint[] {
  return context.services.pruneSharpTurns(
    context.services.pruneEarlyTurnWaypoints([...path], policy),
    policy.sharpTurnDeg,
    policy.sharpTurnRemovals
  );
}

function scoreBomberInterceptPath(
  context: BomberInterceptContext,
  path: ReadonlyArray<AirShowPoint>
): { path: AirShowPoint[]; score: number } {
  const profile = evaluateBomberInterceptEntry(context, path);
  return {
    path: [...path],
    score: profile.firstTurnDeg * 2.2 + profile.maxTurnDeg
      + (profile.earlyRegression ? 420 : 0)
      + (profile.firstPointRecedes ? 240 : 0)
  };
}

function prependBomberHeadingCommit(
  context: BomberInterceptContext,
  path: ReadonlyArray<AirShowPoint>
): AirShowPoint[] {
  const candidate = buildHeadingCommitCandidate(
    path,
    context.start,
    context.startHeadingDegrees,
    context.attackSideSign,
    context.corridor.center,
    {
      triggerTurnDeg: 32,
      distanceFloorPx: 32, distanceCapFloorPx: 58, distanceFactor: 0.14, distanceCapFactor: 0.24,
      lateralCapPx: 12, lateralFactor: 0.04,
      leadFloorPx: 18, leadCapFloorPx: 30, leadFactor: 0.1, leadCapFactor: 0.15,
      leadLateralPx: 6, maxHorizontalPx: 420, maxVerticalPx: 280
    },
    context.services
  );
  if (candidate.length === path.length && candidate.every((point, index) => point === path[index])) {
    return candidate;
  }
  const baseProfile = evaluateBomberInterceptEntry(context, path);
  const candidateProfile = evaluateBomberInterceptEntry(context, candidate);
  if (
    candidateProfile.firstTurnDeg > 52
    || candidateProfile.earlyRegression
    || candidateProfile.firstPointRecedes
    || candidateProfile.firstTurnDeg > baseProfile.firstTurnDeg + 4
    || candidateProfile.maxTurnDeg > baseProfile.maxTurnDeg + 10
  ) {
    return [...path];
  }
  return candidate;
}

function buildPrimaryBomberInterceptPath(context: BomberInterceptContext): AirShowPoint[] {
  const entryBridgePoints = context.services.buildPhaseEntryBridge(
    context.entryStart,
    context.stagePoint,
    {
      startHeadingDegrees: context.startHeadingDegrees,
      sideSign: context.attackSideSign,
      carryForwardPx: 56,
      clampCenter: context.corridor.center,
      maxHorizontalPx: 420,
      maxVerticalPx: 280
    }
  );
  const bridgeExitPoint = entryBridgePoints[entryBridgePoints.length - 1] ?? context.entryStart;
  const bridgeExitHeadingDegrees = context.services.resolvePathHeadingDegrees(
    [context.entryStart, ...entryBridgePoints],
    context.startHeadingDegrees
  );
  const headingLead = context.services.buildHeadingLeadPoint(bridgeExitPoint, context.stagePoint, {
    startHeadingDegrees: bridgeExitHeadingDegrees,
    lateralSign: context.attackSideSign,
    leadForwardPx: 36,
    leadLateralPx: 12,
    clampCenter: context.corridor.center,
    maxHorizontalPx: 420,
    maxVerticalPx: 280
  });
  const headingLeadIndex = 1 + entryBridgePoints.length;
  const path = [
    context.entryStart,
    ...entryBridgePoints,
    headingLead,
    context.stagePoint,
    context.gunPoint,
    context.crossingPoint,
    context.extendPoint,
    context.exitPoint
  ];
  const pruned = context.services.pruneEarlyTurnWaypoints(
    context.services.pruneTurnWaypoint(path, headingLeadIndex, 52),
    { maxTurnDeg: 44, strongTurnDeg: 88, maxFirstSegmentPx: 72, maxWaypointsToRemove: 3 }
  );
  return context.services.pruneSharpTurns(pruned, 96, 3);
}

export function buildAirShowBomberInterceptPassPath(input: {
  readonly start: AirShowPoint;
  readonly corridor: AirShowCombatPassCorridor;
  readonly options: AirShowBomberInterceptPassOptions;
  readonly services: AirShowCombatPassGeometryServices;
}): AirShowPoint[] {
  const context = buildBomberInterceptContext(input);
  let resolved = buildPrimaryBomberInterceptPath(context);
  const profile = evaluateBomberInterceptEntry(context, resolved);
  if (
    profile.firstTurnDeg > 54
    || profile.maxTurnDeg > 132
    || profile.earlyRegression
    || profile.firstPointRecedes
  ) {
    const staged = finalizeBomberInterceptCandidate(context, buildStagedBomberInterceptPath(context), {
      maxTurnDeg: 44, strongTurnDeg: 88, maxFirstSegmentPx: 76, maxWaypointsToRemove: 2,
      sharpTurnDeg: 104, sharpTurnRemovals: 2
    });
    const monotonic = finalizeBomberInterceptCandidate(context, buildMonotonicBomberInterceptPath(context), {
      maxTurnDeg: 46, strongTurnDeg: 92, maxFirstSegmentPx: 78, maxWaypointsToRemove: 1,
      sharpTurnDeg: 112, sharpTurnRemovals: 2
    });
    resolved = [staged, monotonic]
      .filter((path) => path.length >= 2)
      .map((path) => scoreBomberInterceptPath(context, path))
      .sort((left, right) => left.score - right.score)[0]?.path ?? monotonic;
  }
  return detachPath(prependBomberHeadingCommit(context, resolved));
}
