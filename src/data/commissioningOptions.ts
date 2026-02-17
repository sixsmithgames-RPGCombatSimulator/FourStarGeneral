import type { GeneralStatBlock } from "../utils/rosterStorage";

export interface CommissionOption {
  key: string;
  label: string;
  summary: string;
  statAdjustments: Partial<GeneralStatBlock>;
}

const REGION_DATA: readonly CommissionOption[] = [
  {
    key: "atlantic-alliance",
    label: "Atlantic Alliance",
    summary: "Veteran naval networks improve supply reliability and fire planning.",
    statAdjustments: {
      supplyBonus: 10,
      accBonus: 5
    }
  },
  {
    key: "northern-reach",
    label: "Northern Reach",
    summary: "Arctic warfare expertise sharpens precision under harsh conditions.",
    statAdjustments: {
      accBonus: 10,
      moveBonus: 5
    }
  },
  {
    key: "eastern-steppes",
    label: "Eastern Steppes",
    summary: "Mobile cavalry traditions keep formations moving and well supplied.",
    statAdjustments: {
      moveBonus: 10,
      supplyBonus: 5
    }
  },
  {
    key: "southern-republics",
    label: "Southern Republics",
    summary: "Jungle campaigns reward aggressive strikes and resilient logistics.",
    statAdjustments: {
      dmgBonus: 10,
      supplyBonus: 5
    }
  },
  {
    key: "western-protectorate",
    label: "Western Protectorate",
    summary: "Combined arms doctrine blends maneuver warfare with precise fire.",
    statAdjustments: {
      moveBonus: 5,
      dmgBonus: 5,
      accBonus: 5
    }
  }
] as const;

const SCHOOL_DATA: readonly CommissionOption[] = [
  {
    key: "imperial-war-academy",
    label: "Imperial War Academy",
    summary: "Decades of operational art training reinforce decisive assaults.",
    statAdjustments: {
      dmgBonus: 10,
      accBonus: 5
    }
  },
  {
    key: "coastal-defense-college",
    label: "Coastal Defense College",
    summary: "Naval integration programs stress sustainment and precision fires.",
    statAdjustments: {
      supplyBonus: 10,
      accBonus: 5
    }
  },
  {
    key: "mountain-ranger-school",
    label: "Mountain Ranger School",
    summary: "High-altitude drills demand swift movement across rough terrain.",
    statAdjustments: {
      moveBonus: 10,
      accBonus: 5
    }
  },
  {
    key: "armored-command-college",
    label: "Armored Command College",
    summary: "Heavy armor tactics focus on shock action and rapid exploitation.",
    statAdjustments: {
      moveBonus: 5,
      dmgBonus: 10
    }
  },
  {
    key: "strategic-logistics-institute",
    label: "Strategic Logistics Institute",
    summary: "Supply chain mastery ensures relentless operational tempo.",
    statAdjustments: {
      supplyBonus: 15
    }
  }
] as const;

export const REGION_OPTIONS = REGION_DATA;
export const SCHOOL_OPTIONS = SCHOOL_DATA;

export function findRegionOption(key: string | null | undefined): CommissionOption | null {
  if (!key) {
    return null;
  }
  return REGION_DATA.find((option) => option.key === key) ?? null;
}

export function findSchoolOption(key: string | null | undefined): CommissionOption | null {
  if (!key) {
    return null;
  }
  return SCHOOL_DATA.find((option) => option.key === key) ?? null;
}
