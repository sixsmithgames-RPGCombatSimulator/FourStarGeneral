import {
  buildPurchaseUrl,
  isCoreRegion,
  isCoreSchool,
  isFullGamePlan,
  isRegionUnlock,
  isSchoolUnlock,
  isUnitUnlock
} from "../data/unlocks";

export type UnlockSubscriptionStatus = "active" | "inactive" | "trialing" | "past_due" | null;

export interface UnlockAuthContext {
  resolved: boolean;
  isAuthenticated: boolean;
  email: string | null;
  subscriptionStatus: UnlockSubscriptionStatus;
  planIds: readonly string[];
  isPrivileged: boolean;
}

export interface UnlockSnapshot extends UnlockAuthContext {
  fullGameAccess: boolean;
}

type UnlockListener = (snapshot: UnlockSnapshot) => void;

const DEFAULT_AUTH_CONTEXT: UnlockAuthContext = {
  resolved: false,
  isAuthenticated: false,
  email: null,
  subscriptionStatus: null,
  planIds: [],
  isPrivileged: false
};

function hasActiveSubscription(status: UnlockSubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

function normalizePlanIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function normalizeSubscriptionStatus(value: unknown): UnlockSubscriptionStatus {
  if (value === "active" || value === "inactive" || value === "trialing" || value === "past_due") {
    return value;
  }
  return null;
}

function normalizeAuthContext(value: unknown): UnlockAuthContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
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

function toSnapshot(context: UnlockAuthContext): UnlockSnapshot {
  const fullGameAccess = context.isPrivileged || (
    hasActiveSubscription(context.subscriptionStatus) && context.planIds.some((planId) => isFullGamePlan(planId))
  );
  return {
    ...context,
    fullGameAccess
  };
}

export class UnlockState {
  private snapshot: UnlockSnapshot;
  private readonly listeners = new Set<UnlockListener>();

  constructor() {
    this.snapshot = toSnapshot(this.readBootstrapContext() ?? DEFAULT_AUTH_CONTEXT);
    if (typeof document !== "undefined") {
      document.addEventListener("fsg:authResolved", (event) => {
        const detail = (event as CustomEvent<UnlockAuthContext>).detail;
        this.hydrate(detail);
      });
    }
  }

  private readBootstrapContext(): UnlockAuthContext | null {
    if (typeof window === "undefined") {
      return null;
    }
    const authWindow = window as Window & { __FSG_AUTH_CONTEXT__?: unknown };
    return normalizeAuthContext(authWindow.__FSG_AUTH_CONTEXT__);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  getSnapshot(): UnlockSnapshot {
    return this.snapshot;
  }

  subscribe(listener: UnlockListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hydrate(value: unknown): void {
    const context = normalizeAuthContext(value);
    if (!context) {
      console.error("Unlock auth context was invalid. Expected a resolved authentication payload.", value);
      return;
    }
    this.snapshot = toSnapshot(context);
    this.emit();
  }

  hasFullGameAccess(): boolean {
    return this.snapshot.fullGameAccess;
  }

  hasRegionAccess(regionKey: string | null | undefined): boolean {
    if (!regionKey) {
      return false;
    }
    return isCoreRegion(regionKey) || this.hasFullGameAccess();
  }

  hasSchoolAccess(schoolKey: string | null | undefined): boolean {
    if (!schoolKey) {
      return false;
    }
    return isCoreSchool(schoolKey) || this.hasFullGameAccess();
  }

  hasUnitAccess(unitKey: string | null | undefined): boolean {
    if (!unitKey) {
      return false;
    }
    return !isUnitUnlock(unitKey) || this.hasFullGameAccess();
  }

  isRegionLocked(regionKey: string | null | undefined): boolean {
    if (!regionKey) {
      return false;
    }
    return isRegionUnlock(regionKey) && !this.hasRegionAccess(regionKey);
  }

  isSchoolLocked(schoolKey: string | null | undefined): boolean {
    if (!schoolKey) {
      return false;
    }
    return isSchoolUnlock(schoolKey) && !this.hasSchoolAccess(schoolKey);
  }

  isUnitLocked(unitKey: string | null | undefined): boolean {
    if (!unitKey) {
      return false;
    }
    return isUnitUnlock(unitKey) && !this.hasUnitAccess(unitKey);
  }

  buildPurchaseUrlForSku(sku: string): string {
    return buildPurchaseUrl(sku);
  }
}

const unlockState = new UnlockState();

export function ensureUnlockState(): UnlockState {
  return unlockState;
}
