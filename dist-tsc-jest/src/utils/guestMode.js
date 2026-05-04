/**
 * Guest mode utilities for Four Star General.
 * Allows play without sign-in while encouraging auth for persistence and unlocks.
 */
const GUEST_GENERAL_ID = "__GUEST_FIELD_COMMANDER__";
/**
 * Check if current session is in guest mode (not authenticated).
 */
export function isGuestMode(authContext) {
    if (!authContext) {
        return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return authContext.isAuthenticated === false || authContext.isGuest === true;
}
/**
 * Get the guest context for the current session.
 */
export function getGuestContext(authContext) {
    const isGuest = isGuestMode(authContext);
    const resolved = authContext?.resolved ?? false;
    return {
        isGuest,
        canSaveProgress: !isGuest && resolved,
        hasFullAccess: !isGuest && (authContext?.planIds?.length ?? 0) > 0,
        signInUrl: buildSignInUrl()
    };
}
/**
 * Build the sign-in URL with current page as redirect.
 */
export function buildSignInUrl() {
    const baseUrl = "https://www.sixsmithgames.com/sign-in";
    const redirectUrl = encodeURIComponent(window.location.href);
    return `${baseUrl}?redirect_url=${redirectUrl}`;
}
/**
 * Create the generic Field Commander general entry for guest users.
 */
export function createFieldCommanderGeneral() {
    return {
        id: GUEST_GENERAL_ID,
        identity: {
            name: "Field Commander",
            rank: "Provisional Officer",
            affiliation: "Allied Command • Field Operations",
            regionKey: "default",
            regionLabel: "Allied Command",
            schoolKey: "field_ops",
            schoolLabel: "Field Operations",
            commissionedAt: null
        },
        stats: {
            accBonus: 0,
            dmgBonus: 0,
            moveBonus: 0,
            supplyBonus: 0
        },
        serviceRecord: {
            missionsCompleted: 0,
            victoriesAchieved: 0,
            unitsDeployed: 0,
            casualtiesSustained: 0
        }
    };
}
/**
 * Check if the given general ID represents the guest Field Commander.
 */
export function isFieldCommander(generalId) {
    return generalId === GUEST_GENERAL_ID;
}
/**
 * Message shown to guests about signing in benefits.
 */
export const GUEST_MODE_MESSAGES = {
    signInPrompt: "Sign in to save your progress and unlock the full roster.",
    progressWarning: "Progress will not be saved in guest mode.",
    unlockPrompt: "Sign in to unlock additional factions and doctrines.",
    saveBlocked: "Create an account to preserve your service record and achievements."
};
