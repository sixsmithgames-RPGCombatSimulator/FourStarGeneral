/**
 * AirShowLogger - Structured logging for air show operations
 * 
 * Per-effect logs are gated behind the VERY_NOISY_DEBUG flag.
 * Package-level logs are always emitted for operational visibility.
 */

const VERY_NOISY_DEBUG = false;

export type AirShowRole = "interceptor" | "escort" | "bomber";
export type AirShowActorState = "ingress" | "engaged" | "evading" | "striking" | "egress" | "destroyed" | "suppressed";
export type AirShowEffectType = "tracer" | "flak" | "explosion" | "smoke" | "bomb" | "debris" | "fadeIn" | "fadeOut" | "orbit" | "pass";

export interface AirShowLogContext {
  readonly packageId: string;
  readonly scenario?: string;
  readonly owner?: string;
  readonly missionIds?: readonly string[];
  readonly roles?: readonly AirShowRole[];
  readonly targetHex?: string | null;
}

export interface AirShowBeatContext {
  readonly beatIndex: number;
  readonly beatType: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly actors: readonly string[]; // actor IDs
}

export interface AirShowActorTransitionContext {
  readonly missionId?: string;
  readonly unitKey: string;
  readonly role: AirShowRole;
  readonly fromState: AirShowActorState;
  readonly toState: AirShowActorState;
  readonly reason?: string;
}

export interface AirShowEffectContext {
  readonly beatIndex?: number;
  readonly missionId?: string;
  readonly unitKey?: string;
  readonly effectType: AirShowEffectType;
  readonly location: { readonly x: number; readonly y: number } | string;
  readonly metadata?: Record<string, unknown>;
}

export interface AirShowPackageEndContext {
  readonly outcome: "success" | "aborted" | "defeated" | "partial";
  readonly survivingActors: readonly string[];
  readonly destroyedActors: readonly string[];
  readonly egressComplete: boolean;
}

export interface AirShowReportLinkContext {
  readonly reportIds: readonly string[];
  readonly activityLogIds: readonly string[];
  readonly liveTargetHex: string | null;
}

/**
 * Logs the start of an air show package
 */
export function logAirShowPackageStart(
  packageId: string,
  scenario: string,
  owner: string,
  missionIds: readonly string[],
  roles: readonly AirShowRole[],
  targetHex: string | null
): void {
  console.log(
    `AirShowPackageStart ${packageId} ${scenario} ${owner} [${missionIds.join(",")}] [${roles.join(",")}] ${targetHex ?? "none"}`
  );
}

/**
 * Logs the start of a beat within a package
 */
export function logAirShowBeatStart(
  packageId: string,
  beatIndex: number,
  beatType: string,
  actors: readonly string[]
): void {
  console.log(
    `AirShowBeatStart ${packageId} ${beatIndex} ${beatType} [${actors.join(",")}]`
  );
}

/**
 * Logs an actor state transition
 */
export function logAirShowActorTransition(
  packageId: string,
  unitKey: string,
  role: AirShowRole,
  fromState: AirShowActorState,
  toState: AirShowActorState,
  reason?: string
): void {
  const reasonSuffix = reason ? ` ${reason}` : "";
  console.log(
    `AirShowActorTransition ${packageId} ${unitKey} ${role} ${fromState} ${toState}${reasonSuffix}`
  );
}

/**
 * Logs an effect being triggered
 */
export function logAirShowEffect(
  packageId: string,
  effectType: AirShowEffectType,
  location: { x: number; y: number } | string,
  context?: {
    readonly beatIndex?: number;
    readonly missionId?: string;
    readonly unitKey?: string;
  }
): void {
  const locStr = typeof location === "string" ? location : `${Math.round(location.x)},${Math.round(location.y)}`;
  const beatInfo = context?.beatIndex !== undefined ? ` beat=${context.beatIndex}` : "";
  const missionInfo = context?.missionId ? ` mission=${context.missionId}` : "";
  const unitInfo = context?.unitKey ? ` unit=${context.unitKey}` : "";
  console.log(
    `AirShowEffect ${packageId} ${effectType} ${locStr}${beatInfo}${missionInfo}${unitInfo}`
  );
}

/**
 * Logs ownership assertion for debugging component boundaries
 */
export function logAirShowOwnershipAssert(
  packageId: string,
  owner: string,
  fallbackOwner: string | null
): void {
  console.log(
    `AirShowOwnershipAssert ${packageId} owner=${owner} fallbackOwner=${fallbackOwner ?? "none"}`
  );
}

/**
 * Logs the end of an air show package
 */
export function logAirShowPackageEnd(
  packageId: string,
  outcome: AirShowPackageEndContext["outcome"],
  survivingActors: readonly string[],
  destroyedActors: readonly string[],
  egressComplete: boolean
): void {
  console.log(
    `AirShowPackageEnd ${packageId} ${outcome} surviving=[${survivingActors.join(",")}] destroyed=[${destroyedActors.join(",")}] egress=${egressComplete ? "complete" : "incomplete"}`
  );
}

/**
 * Logs report linkage for audit trail
 */
export function logAirShowReportLink(
  packageId: string,
  reportIds: readonly string[],
  activityLogIds: readonly string[],
  liveTargetHex: string | null
): void {
  console.log(
    `AirShowReportLink ${packageId} reports=[${reportIds.join(",")}] logs=[${activityLogIds.join(",")}] targetHex=${liveTargetHex ?? "none"}`
  );
}

// ============================================================================
// Debug/Noisy Logging (gated behind VERY_NOISY_DEBUG)
// ============================================================================

/**
 * Logs detailed effect debugging information (very noisy)
 */
export function debugAirShowEffect(
  message: string,
  details?: Record<string, unknown>
): void {
  if (!VERY_NOISY_DEBUG) return;
  if (details) {
    console.log(`[AirShow:DEBUG] ${message}`, details);
  } else {
    console.log(`[AirShow:DEBUG] ${message}`);
  }
}

/**
 * Logs detailed phase information (very noisy)
 */
export function debugAirShowPhase(
  phase: string,
  details: Record<string, unknown>
): void {
  if (!VERY_NOISY_DEBUG) return;
  console.log(`[AirShow:DEBUG:Phase] ${phase}`, details);
}

/**
 * Logs detailed actor position/animation info (very noisy)
 */
export function debugAirShowActor(
  actorId: string,
  action: string,
  details?: Record<string, unknown>
): void {
  if (!VERY_NOISY_DEBUG) return;
  if (details) {
    console.log(`[AirShow:DEBUG:Actor:${actorId}] ${action}`, details);
  } else {
    console.log(`[AirShow:DEBUG:Actor:${actorId}] ${action}`);
  }
}

/**
 * Logs detailed sprite/flight information (very noisy)
 */
export function debugAirShowSprite(
  spriteId: string,
  action: string,
  details?: Record<string, unknown>
): void {
  if (!VERY_NOISY_DEBUG) return;
  if (details) {
    console.log(`[AirShow:DEBUG:Sprite:${spriteId}] ${action}`, details);
  } else {
    console.log(`[AirShow:DEBUG:Sprite:${spriteId}] ${action}`);
  }
}
