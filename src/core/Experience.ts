import type { ScenarioUnit } from "./types";

export const EXPERIENCE_MAX_POINTS = 5;
export const EXPERIENCE_BONUS_PER_POINT = 0.03;
export const EXPERIENCE_MAX_BONUS = EXPERIENCE_MAX_POINTS * EXPERIENCE_BONUS_PER_POINT;

function clampExperience(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(EXPERIENCE_MAX_POINTS, Math.trunc(value)));
}

export function getBaseExperience(unit: Pick<ScenarioUnit, "baseExperience" | "experience">): number {
  return clampExperience(unit.baseExperience ?? unit.experience ?? 0);
}

export function getEarnedExperience(unit: Pick<ScenarioUnit, "earnedExperience">): number {
  return clampExperience(unit.earnedExperience ?? 0);
}

export function getEffectiveExperience(unit: Pick<ScenarioUnit, "baseExperience" | "earnedExperience" | "experience">): number {
  return clampExperience(getBaseExperience(unit) + getEarnedExperience(unit));
}

export function getExperienceBonus(unit: Pick<ScenarioUnit, "baseExperience" | "earnedExperience" | "experience">): number {
  return Math.min(EXPERIENCE_MAX_BONUS, getEffectiveExperience(unit) * EXPERIENCE_BONUS_PER_POINT);
}

export function getExperienceScalar(unit: Pick<ScenarioUnit, "baseExperience" | "earnedExperience" | "experience">): number {
  return 1 + getExperienceBonus(unit);
}

export function awardCombatExperience(unit: ScenarioUnit, points = 1): boolean {
  const base = getBaseExperience(unit);
  const earned = getEarnedExperience(unit);
  const room = Math.max(0, EXPERIENCE_MAX_POINTS - base - earned);
  if (room <= 0 || points <= 0) {
    unit.baseExperience = base;
    unit.earnedExperience = earned;
    unit.experience = getEffectiveExperience(unit);
    return false;
  }

  unit.baseExperience = base;
  unit.earnedExperience = earned + Math.min(room, Math.trunc(points));
  unit.experience = getEffectiveExperience(unit);
  return true;
}

export function seedUnitExperience(unit: ScenarioUnit, baseExperience: number): ScenarioUnit {
  const seeded = structuredClone(unit);
  seeded.baseExperience = clampExperience(seeded.baseExperience ?? baseExperience);
  seeded.earnedExperience = clampExperience(seeded.earnedExperience ?? 0);
  seeded.experience = getEffectiveExperience(seeded);
  return seeded;
}
