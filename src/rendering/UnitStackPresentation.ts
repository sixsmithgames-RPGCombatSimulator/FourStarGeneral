import { normalizeFacingDirection, type ScenarioUnit } from "../core/types";
import { getCompositeSpritesForUnit } from "../data/unitSpriteCatalog";
import { CoordinateSystem } from "./CoordinateSystem";

export const MIN_STRENGTH_PER_STACK_ACTOR = 25;

export type ReconStatusKey = "unknown" | "spotted" | "identified" | "visible";
export type RenderedSuppressionState = "clear" | "suppressed" | "pinned" | "broken";
export type RenderedStatusPip = "sentry" | "suppressed" | "pinned" | "broken";
export type UnitStackFaction = "Player" | "Bot" | "Ally";
export type UnitStackLayoutVariant = "diamond" | "corners";

export interface RenderedUnitStackMember {
  readonly unit: ScenarioUnit;
  readonly faction: UnitStackFaction;
  readonly reconStatus?: ReconStatusKey | boolean;
}

export interface UnitStackLayoutSpec {
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
}

export interface UnitStackFormationPresentation {
  readonly slot: number;
  readonly unitId: string | null;
  readonly scenarioType: string;
  readonly controlledBy: ScenarioUnit["controlledBy"] | null;
  readonly faction: UnitStackFaction;
  readonly reconStatus: ReconStatusKey;
  readonly facing: ScenarioUnit["facing"];
  readonly facingAngleDeg: number;
  readonly layout: readonly UnitStackLayoutSpec[];
  readonly spriteHrefs: readonly (string | null)[];
  readonly hasRegisteredSprites: boolean;
  readonly decorationOffset: Readonly<{ dx: number; dy: number }>;
  readonly entrenchmentLevel: number;
  readonly suppressionState: RenderedSuppressionState;
  readonly statusPips: readonly RenderedStatusPip[];
}

export interface UnitStackPresentation {
  readonly formations: readonly UnitStackFormationPresentation[];
  readonly primary: Readonly<{
    scenarioType: string;
    reconStatus: ReconStatusKey;
    suppressionState: RenderedSuppressionState;
    sentryState: "on" | "off";
    entrenchmentLevel: number;
    facingAngleDeg: number;
  }>;
}

export const UNKNOWN_CONTACT_SPRITE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <polygon points="32,4 60,32 32,60 4,32" fill="#451313" stroke="#f3b36b" stroke-width="4"/>
    <circle cx="32" cy="32" r="12" fill="#0d1017" opacity="0.9"/>
    <text x="32" y="39" text-anchor="middle" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#f9d49a">?</text>
  </svg>`
)}`;

export function resolveUnitStackCount(strength: number): number {
  const normalized = Math.max(0, Math.min(100, strength));
  return Math.max(1, Math.min(4, Math.ceil(normalized / MIN_STRENGTH_PER_STACK_ACTOR)));
}

export function resolveUnitStackLayout(
  count: number,
  variant: UnitStackLayoutVariant = "diamond",
  scaleMultiplier = 1,
  spreadMultiplier = 1
): readonly UnitStackLayoutSpec[] {
  const normalizedCount = Math.max(1, Math.min(4, Math.round(count)));
  const spread = 20 * spreadMultiplier;
  const scale = ({ 1: 0.82, 2: 0.76, 3: 0.7, 4: 0.66 }[normalizedCount] ?? 0.7) * scaleMultiplier;
  if (normalizedCount <= 1) {
    return variant === "corners" ? [{ ox: -spread, oy: -spread, scale }] : [{ ox: 0, oy: 0, scale }];
  }
  if (normalizedCount === 2) {
    return variant === "corners"
      ? [{ ox: -spread, oy: -spread, scale }, { ox: spread, oy: -spread, scale }]
      : [{ ox: -spread, oy: 0, scale }, { ox: spread, oy: 0, scale }];
  }
  if (normalizedCount === 3) {
    return variant === "corners"
      ? [{ ox: -spread, oy: -spread, scale }, { ox: spread, oy: -spread, scale }, { ox: -spread, oy: spread, scale }]
      : [{ ox: 0, oy: -spread, scale }, { ox: -spread, oy: 0, scale }, { ox: spread, oy: 0, scale }];
  }
  return variant === "corners"
    ? [
        { ox: -spread, oy: -spread, scale }, { ox: spread, oy: -spread, scale },
        { ox: -spread, oy: spread, scale }, { ox: spread, oy: spread, scale }
      ]
    : [
        { ox: 0, oy: -spread, scale }, { ox: spread, oy: 0, scale },
        { ox: 0, oy: spread, scale }, { ox: -spread, oy: 0, scale }
      ];
}

export function resolveRenderedSuppressionState(unit: ScenarioUnit): RenderedSuppressionState {
  const suppressorCount = unit.suppressedBy?.length ?? 0;
  if (suppressorCount >= 2) return unit.strength < 25 ? "broken" : "pinned";
  return suppressorCount === 1 ? "suppressed" : "clear";
}

function normalizeReconStatus(reconStatus: ReconStatusKey | boolean | undefined): ReconStatusKey {
  return typeof reconStatus === "boolean"
    ? (reconStatus ? "spotted" : "visible")
    : (reconStatus ?? "visible");
}

function resolveFacingAngleDeg(facing: ScenarioUnit["facing"]): number {
  const vectors: Record<ScenarioUnit["facing"], { q: number; r: number }> = {
    E: { q: 1, r: 0 }, NE: { q: 1, r: -1 }, NW: { q: 0, r: -1 },
    W: { q: -1, r: 0 }, SW: { q: -1, r: 1 }, SE: { q: 0, r: 1 }
  };
  const origin = CoordinateSystem.axialToPixel(0, 0);
  const target = CoordinateSystem.axialToPixel(vectors[facing].q, vectors[facing].r);
  return (Math.atan2(target.y - origin.y, target.x - origin.x) * 180) / Math.PI;
}

function prioritizeVisibleMembers(members: readonly RenderedUnitStackMember[]): RenderedUnitStackMember[] {
  return [...members]
    .sort((left, right) => {
      const convoyPriority = Number(left.unit.type === "Supply_Truck") - Number(right.unit.type === "Supply_Truck");
      return convoyPriority || (right.unit.strength ?? 0) - (left.unit.strength ?? 0);
    })
    .slice(0, 2);
}

/** Produces detached, deterministic unit-stack geometry and status presentation without touching the DOM. */
export function prepareUnitStackPresentation(
  members: readonly RenderedUnitStackMember[]
): UnitStackPresentation | null {
  const visibleMembers = prioritizeVisibleMembers(members);
  if (visibleMembers.length === 0) return null;
  const stacked = visibleMembers.length > 1;
  const formations = visibleMembers.map((member, slot): UnitStackFormationPresentation => {
    const variant: UnitStackLayoutVariant = slot === 0 ? "diamond" : "corners";
    const reconStatus = normalizeReconStatus(member.reconStatus);
    const facing = normalizeFacingDirection(member.unit.facing);
    const actorCount = resolveUnitStackCount(member.unit.strength);
    const sprites = reconStatus === "spotted"
      ? null
      : getCompositeSpritesForUnit(String(member.unit.type), member.faction, actorCount, reconStatus, facing);
    const suppressionState = resolveRenderedSuppressionState(member.unit);
    const statusPips: RenderedStatusPip[] = [];
    if (member.unit.onSentry) statusPips.push("sentry");
    if (suppressionState !== "clear") statusPips.push(suppressionState);
    return {
      slot,
      unitId: member.unit.unitId ?? null,
      scenarioType: String(member.unit.type),
      controlledBy: member.unit.controlledBy ?? null,
      faction: member.faction,
      reconStatus,
      facing,
      facingAngleDeg: resolveFacingAngleDeg(facing),
      layout: resolveUnitStackLayout(actorCount, variant, stacked ? 0.74 : 1, stacked ? 0.72 : 1),
      spriteHrefs: Array.from({ length: actorCount }, (_, index) => (
        reconStatus === "spotted" ? UNKNOWN_CONTACT_SPRITE : (sprites?.[index] ?? null)
      )),
      hasRegisteredSprites: reconStatus === "spotted" || sprites !== null,
      decorationOffset: stacked
        ? (variant === "corners" ? { dx: 12, dy: 2 } : { dx: -12, dy: 2 })
        : { dx: 0, dy: 0 },
      entrenchmentLevel: Math.max(0, Math.min(2, Math.round(member.unit.entrench ?? 0))),
      suppressionState,
      statusPips
    };
  });
  const primary = formations[0]!;
  return {
    formations,
    primary: {
      scenarioType: primary.scenarioType,
      reconStatus: primary.reconStatus,
      suppressionState: primary.suppressionState,
      sentryState: primary.statusPips.includes("sentry") ? "on" : "off",
      entrenchmentLevel: primary.entrenchmentLevel,
      facingAngleDeg: primary.facingAngleDeg
    }
  };
}
