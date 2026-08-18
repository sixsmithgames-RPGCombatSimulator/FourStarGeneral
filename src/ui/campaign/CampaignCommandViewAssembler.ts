/**
 * MODULE: CampaignCommandViewAssembler
 * WHAT: Finalizes immutable, faction-safe view models for campaign command components.
 * WHY: UI components must never receive mutable runtime objects or forbidden opposing truth.
 *
 * DEPENDENCIES: CampaignCommandShell view contracts only.
 * EXPORTS: CampaignCommandViewAssembler and projection-safety assertions.
 */

import type { CampaignCommandShellView } from "./CampaignCommandShell";

const FORBIDDEN_PROJECTION_KEYS = new Set([
  "rawRuntime",
  "randomStreams",
  "randomSeed",
  "hiddenForces",
  "hiddenOrders",
  "enemyEconomy",
  "botEconomy",
  "opposingTruth"
]);

function assertSafeNode(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeNode(entry, `${path}[${index}]`));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_PROJECTION_KEYS.has(key)) {
      throw new Error(`Campaign command projection contains forbidden key '${key}' at ${path}.`);
    }
    assertSafeNode(child, `${path}.${key}`);
  });
}

function cloneAndFreezeProjection<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreezeProjection(entry))) as T;
  }
  const clone: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    clone[key] = cloneAndFreezeProjection(child);
  });
  return Object.freeze(clone) as T;
}

/** Throws when a view-model tree contains a key reserved for hidden campaign truth. */
export function assertCampaignCommandProjectionSafe(value: unknown): void {
  assertSafeNode(value, "campaignCommandView");
}

/** Creates a detached, deeply frozen view so rendering cannot mutate controller-owned projections. */
export class CampaignCommandViewAssembler {
  public assemble(source: CampaignCommandShellView): CampaignCommandShellView {
    assertCampaignCommandProjectionSafe(source);
    return cloneAndFreezeProjection(source);
  }
}
