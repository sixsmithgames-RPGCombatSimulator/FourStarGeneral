/**
 * AirShowLogger - Structured logging for air show operations
 *
 * Per-effect logs are gated behind the VERY_NOISY_DEBUG flag.
 * Package-level logs are always emitted for operational visibility.
 */
const VERY_NOISY_DEBUG = false;
/**
 * Logs the start of an air show package
 */
export function logAirShowPackageStart(packageId, scenario, owner, missionIds, roles, targetHex) {
    console.log(`AirShowPackageStart ${packageId} ${scenario} ${owner} [${missionIds.join(",")}] [${roles.join(",")}] ${targetHex ?? "none"}`);
}
/**
 * Logs the start of a beat within a package
 */
export function logAirShowBeatStart(packageId, beatIndex, beatType, actors) {
    console.log(`AirShowBeatStart ${packageId} ${beatIndex} ${beatType} [${actors.join(",")}]`);
}
/**
 * Logs an actor state transition
 */
export function logAirShowActorTransition(packageId, unitKey, role, fromState, toState, reason) {
    const reasonSuffix = reason ? ` ${reason}` : "";
    console.log(`AirShowActorTransition ${packageId} ${unitKey} ${role} ${fromState} ${toState}${reasonSuffix}`);
}
/**
 * Logs an effect being triggered
 */
export function logAirShowEffect(packageId, effectType, location, context) {
    const locStr = typeof location === "string" ? location : `${Math.round(location.x)},${Math.round(location.y)}`;
    const beatInfo = context?.beatIndex !== undefined ? ` beat=${context.beatIndex}` : "";
    const missionInfo = context?.missionId ? ` mission=${context.missionId}` : "";
    const unitInfo = context?.unitKey ? ` unit=${context.unitKey}` : "";
    console.log(`AirShowEffect ${packageId} ${effectType} ${locStr}${beatInfo}${missionInfo}${unitInfo}`);
}
/**
 * Logs ownership assertion for debugging component boundaries
 */
export function logAirShowOwnershipAssert(packageId, owner, fallbackOwner) {
    console.log(`AirShowOwnershipAssert ${packageId} owner=${owner} fallbackOwner=${fallbackOwner ?? "none"}`);
}
/**
 * Logs the end of an air show package
 */
export function logAirShowPackageEnd(packageId, outcome, survivingActors, destroyedActors, egressComplete) {
    console.log(`AirShowPackageEnd ${packageId} ${outcome} surviving=[${survivingActors.join(",")}] destroyed=[${destroyedActors.join(",")}] egress=${egressComplete ? "complete" : "incomplete"}`);
}
/**
 * Logs report linkage for audit trail
 */
export function logAirShowReportLink(packageId, reportIds, activityLogIds, liveTargetHex) {
    console.log(`AirShowReportLink ${packageId} reports=[${reportIds.join(",")}] logs=[${activityLogIds.join(",")}] targetHex=${liveTargetHex ?? "none"}`);
}
// ============================================================================
// Debug/Noisy Logging (gated behind VERY_NOISY_DEBUG)
// ============================================================================
/**
 * Logs detailed effect debugging information (very noisy)
 */
export function debugAirShowEffect(message, details) {
    if (!VERY_NOISY_DEBUG)
        return;
    if (details) {
        console.log(`[AirShow:DEBUG] ${message}`, details);
    }
    else {
        console.log(`[AirShow:DEBUG] ${message}`);
    }
}
/**
 * Logs detailed phase information (very noisy)
 */
export function debugAirShowPhase(phase, details) {
    if (!VERY_NOISY_DEBUG)
        return;
    console.log(`[AirShow:DEBUG:Phase] ${phase}`, details);
}
/**
 * Logs detailed actor position/animation info (very noisy)
 */
export function debugAirShowActor(actorId, action, details) {
    if (!VERY_NOISY_DEBUG)
        return;
    if (details) {
        console.log(`[AirShow:DEBUG:Actor:${actorId}] ${action}`, details);
    }
    else {
        console.log(`[AirShow:DEBUG:Actor:${actorId}] ${action}`);
    }
}
/**
 * Logs detailed sprite/flight information (very noisy)
 */
export function debugAirShowSprite(spriteId, action, details) {
    if (!VERY_NOISY_DEBUG)
        return;
    if (details) {
        console.log(`[AirShow:DEBUG:Sprite:${spriteId}] ${action}`, details);
    }
    else {
        console.log(`[AirShow:DEBUG:Sprite:${spriteId}] ${action}`);
    }
}
