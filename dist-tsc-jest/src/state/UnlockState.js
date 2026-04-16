import { buildPurchaseUrl, isCoreRegion, isCoreSchool, isFullGamePlan, isRegionUnlock, isSchoolUnlock, isUnitUnlock, isCampaignUnlock } from "../data/unlocks";
const DEFAULT_AUTH_CONTEXT = {
    resolved: false,
    isAuthenticated: false,
    email: null,
    subscriptionStatus: null,
    planIds: [],
    isPrivileged: false
};
function hasActiveSubscription(status) {
    return status === "active" || status === "trialing";
}
function normalizePlanIds(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => typeof entry === "string" && entry.length > 0);
}
function normalizeSubscriptionStatus(value) {
    if (value === "active" || value === "inactive" || value === "trialing" || value === "past_due") {
        return value;
    }
    return null;
}
function normalizeAuthContext(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const record = value;
    if (record.resolved !== true) {
        return null;
    }
    const isAuthenticated = record.isAuthenticated === true;
    const email = typeof record.email === "string" && record.email.length > 0 ? record.email : null;
    const planIds = normalizePlanIds(record.planIds);
    const isPrivileged = record.isPrivileged === true;
    return {
        resolved: true,
        isAuthenticated,
        email,
        subscriptionStatus: normalizeSubscriptionStatus(record.subscriptionStatus),
        planIds,
        isPrivileged
    };
}
function toSnapshot(context) {
    const fullGameAccess = context.isPrivileged || (hasActiveSubscription(context.subscriptionStatus) && context.planIds.some((planId) => isFullGamePlan(planId)));
    return {
        ...context,
        fullGameAccess
    };
}
export class UnlockState {
    constructor() {
        this.listeners = new Set();
        this.snapshot = toSnapshot(this.readBootstrapContext() ?? DEFAULT_AUTH_CONTEXT);
        if (typeof document !== "undefined") {
            document.addEventListener("fsg:authResolved", (event) => {
                const detail = event.detail;
                this.hydrate(detail);
            });
        }
    }
    readBootstrapContext() {
        if (typeof window === "undefined") {
            return null;
        }
        const authWindow = window;
        return normalizeAuthContext(authWindow.__FSG_AUTH_CONTEXT__);
    }
    emit() {
        this.listeners.forEach((listener) => listener(this.snapshot));
    }
    getSnapshot() {
        return this.snapshot;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.snapshot);
        return () => {
            this.listeners.delete(listener);
        };
    }
    hydrate(value) {
        const context = normalizeAuthContext(value);
        if (!context) {
            console.error("Unlock auth context was invalid. Expected a resolved authentication payload.", value);
            return;
        }
        this.snapshot = toSnapshot(context);
        this.emit();
    }
    hasFullGameAccess() {
        return this.snapshot.fullGameAccess;
    }
    hasRegionAccess(regionKey) {
        if (!regionKey) {
            return false;
        }
        return isCoreRegion(regionKey) || this.hasFullGameAccess();
    }
    hasSchoolAccess(schoolKey) {
        if (!schoolKey) {
            return false;
        }
        return isCoreSchool(schoolKey) || this.hasFullGameAccess();
    }
    hasUnitAccess(unitKey) {
        if (!unitKey) {
            return false;
        }
        return !isUnitUnlock(unitKey) || this.hasFullGameAccess();
    }
    isRegionLocked(regionKey) {
        if (!regionKey) {
            return false;
        }
        return isRegionUnlock(regionKey) && !this.hasRegionAccess(regionKey);
    }
    isSchoolLocked(schoolKey) {
        if (!schoolKey) {
            return false;
        }
        return isSchoolUnlock(schoolKey) && !this.hasSchoolAccess(schoolKey);
    }
    isUnitLocked(unitKey) {
        if (!unitKey) {
            return false;
        }
        return isUnitUnlock(unitKey) && !this.hasUnitAccess(unitKey);
    }
    hasCampaignAccess(campaignKey) {
        if (!campaignKey) {
            return false;
        }
        return this.hasFullGameAccess();
    }
    isCampaignLocked(campaignKey) {
        if (!campaignKey) {
            return false;
        }
        return isCampaignUnlock(campaignKey) && !this.hasCampaignAccess(campaignKey);
    }
    buildPurchaseUrlForSku(sku) {
        return buildPurchaseUrl(sku);
    }
}
const unlockState = new UnlockState();
export function ensureUnlockState() {
    return unlockState;
}
