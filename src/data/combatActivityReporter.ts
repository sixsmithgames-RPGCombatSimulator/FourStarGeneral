/**
 * Combat Activity Reporter
 * 
 * Generates detailed activity reports from damage packets for:
 * - Activity logging during combat
 * - HQ damage tracking and after-action reports
 * - Medical and repair team coordination
 * 
 * @module CombatActivityReporter
 */

import type {
  VehicleComponent,
  WeaponDamageType
} from "../core/types";
import type {
  ComponentDamageDelta,
  DamagePacket,
  PersonnelDamageDelta,
  EquipmentDamageDelta,
  WeaponHitSummary
} from "../data/unitSystem/damagePackets";

/**
 * Detailed combat outcome for a single engagement.
 * Used for activity logging and HQ reporting.
 */
export interface CombatEngagementReport {
  /** Attacker unit identifier */
  attackerId: string;
  /** Attacker unit name */
  attackerName: string;
  /** Defender unit identifier */
  defenderId: string;
  /** Defender unit name */
  defenderName: string;
  /** Hex coordinates where the engagement occurred */
  engagementHex: { q: number; r: number };
  /** Total shots fired across all weapon groups */
  totalShots: number;
  /** Expected hits from all weapons */
  totalExpectedHits: number;
  /** Personnel casualties inflicted */
  personnelCasualties: PersonnelDamageDelta;
  /** Equipment damage inflicted */
  equipmentDamage: EquipmentDamageDelta;
  /** Component-specific damage for vehicle tracking */
  componentDamage: ComponentDamageDelta;
  /** Suppression value applied */
  suppression: number;
  /** Fortification damage inflicted */
  fortificationDamage: number;
  /** Per-weapon breakdown of damage */
  weaponReports: WeaponDamageReport[];
  /** Damage types used in this engagement */
  damageTypesUsed: WeaponDamageType[];
  /** Human-readable summary of the engagement */
  summary: string;
  /** Timestamp when the engagement occurred */
  timestamp: number;
}

/**
 * Detailed report for a single weapon group's damage contribution.
 */
export interface WeaponDamageReport {
  /** Weapon group identifier */
  weaponId: string;
  /** Weapon display name */
  weaponName: string;
  /** Damage type classification */
  damageType: WeaponDamageType;
  /** Shots fired from this weapon group */
  shots: number;
  /** Expected hits from this weapon */
  expectedHits: number;
  /** Personnel casualties from this weapon */
  personnel: PersonnelDamageDelta;
  /** Equipment damage from this weapon */
  equipment: EquipmentDamageDelta;
  /** Component damage from this weapon */
  componentDamage: ComponentDamageDelta;
  /** Suppression from this weapon */
  suppression: number;
  /** Hit type distribution showing effectiveness */
  hitDistribution?: {
    nonEffect: number;
    softComponent: number;
    penetrating: number;
    areaEffect: number;
  };
}

/**
 * Medical priority assessment for casualty handling.
 */
export interface MedicalPriorityReport {
  /** Unit identifier */
  unitId: string;
  /** Number of personnel requiring immediate evacuation */
  criticalCasualties: number;
  /** Number of personnel requiring field treatment */
  treatableCasualties: number;
  /** Total killed (cannot be treated) */
  killed: number;
  /** Recommended medical response level */
  recommendedResponse: "none" | "fieldDressing" | "medicalTeam" | "evacuation";
  /** Human-readable medical assessment */
  assessment: string;
}

/**
 * Repair priority assessment for damaged equipment.
 */
export interface RepairPriorityReport {
  /** Unit identifier */
  unitId: string;
  /** Components damaged but operational */
  damagedComponents: { component: VehicleComponent; count: number }[];
  /** Components disabled and non-functional */
  disabledComponents: { component: VehicleComponent; count: number }[];
  /** Components destroyed (require replacement) */
  destroyedComponents: { component: VehicleComponent; count: number }[];
  /** Recommended repair response level */
  recommendedResponse: "none" | "fieldRepair" | "workshop" | "salvage";
  /** Estimated time to restore basic mobility */
  mobilityRestorationTime: number;
  /** Estimated time to restore combat effectiveness */
  combatRestorationTime: number;
  /** Human-readable repair assessment */
  assessment: string;
}

/**
 * Generate a comprehensive combat engagement report from a damage packet.
 * 
 * @param attackerId - Identifier of the attacking unit
 * @param attackerName - Display name of the attacking unit
 * @param defenderId - Identifier of the defending unit
 * @param defenderName - Display name of the defending unit
 * @param hex - Hex coordinates where engagement occurred
 * @param packet - Damage packet containing all damage data
 * @returns Complete combat engagement report
 */
export function generateCombatEngagementReport(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  defenderName: string,
  hex: { q: number; r: number },
  packet: DamagePacket
): CombatEngagementReport {
  const weaponReports: WeaponDamageReport[] = packet.weaponHits.map((hit) => ({
    weaponId: hit.id,
    weaponName: hit.label,
    damageType: hit.damageType ?? "bullet",
    shots: hit.shots,
    expectedHits: hit.expectedHits,
    personnel: hit.personnel,
    equipment: hit.equipment,
    componentDamage: hit.componentDamage ?? { damaged: {}, disabled: {}, destroyed: {} },
    suppression: hit.suppression,
    hitDistribution: hit.hitTypeCounts
  }));

  const totalShots = packet.weaponHits.reduce((sum: number, hit: WeaponHitSummary) => sum + hit.shots, 0);
  const totalExpectedHits = packet.weaponHits.reduce((sum: number, hit: WeaponHitSummary) => sum + hit.expectedHits, 0);

  // Build human-readable summary
  const summary = buildEngagementSummary(
    attackerName,
    defenderName,
    totalShots,
    totalExpectedHits,
    packet,
    weaponReports
  );

  return {
    attackerId,
    attackerName,
    defenderId,
    defenderName,
    engagementHex: hex,
    totalShots,
    totalExpectedHits,
    personnelCasualties: packet.personnel,
    equipmentDamage: packet.equipment,
    componentDamage: packet.componentDamage ?? { damaged: {}, disabled: {}, destroyed: {} },
    suppression: packet.suppression,
    fortificationDamage: packet.fortificationDamage,
    weaponReports,
    damageTypesUsed: Array.from(packet.damageTypesUsed ?? []),
    summary,
    timestamp: Date.now()
  };
}

/**
 * Build a human-readable summary of an engagement.
 */
function buildEngagementSummary(
  attackerName: string,
  defenderName: string,
  totalShots: number,
  totalExpectedHits: number,
  packet: DamagePacket,
  weaponReports: WeaponDamageReport[]
): string {
  const parts: string[] = [];

  // Opening statement
  parts.push(`${attackerName} engaged ${defenderName} with ${totalShots.toLocaleString()} rounds.`);

  // Hit summary
  if (totalExpectedHits > 0) {
    parts.push(`Achieved ${totalExpectedHits.toFixed(1)} expected hits.`);
  }

  // Casualty summary
  const totalCasualties = 
    packet.personnel.killed + 
    packet.personnel.severelyWounded + 
    packet.personnel.wounded + 
    packet.personnel.injured;
  
  if (totalCasualties > 0) {
    const casualtyParts: string[] = [];
    if (packet.personnel.killed > 0) casualtyParts.push(`${packet.personnel.killed.toFixed(1)} killed`);
    if (packet.personnel.severelyWounded > 0) casualtyParts.push(`${packet.personnel.severelyWounded.toFixed(1)} severely wounded`);
    if (packet.personnel.wounded > 0) casualtyParts.push(`${packet.personnel.wounded.toFixed(1)} wounded`);
    if (packet.personnel.injured > 0) casualtyParts.push(`${packet.personnel.injured.toFixed(1)} injured`);
    parts.push(`Casualties: ${casualtyParts.join(", ")}.`);
  }

  // Equipment damage summary
  const totalEquipmentDamaged = 
    packet.equipment.destroyed + 
    packet.equipment.disabled + 
    packet.equipment.damaged;
  
  if (totalEquipmentDamaged > 0) {
    const equipParts: string[] = [];
    if (packet.equipment.destroyed > 0) equipParts.push(`${packet.equipment.destroyed.toFixed(1)} destroyed`);
    if (packet.equipment.disabled > 0) equipParts.push(`${packet.equipment.disabled.toFixed(1)} disabled`);
    if (packet.equipment.damaged > 0) equipParts.push(`${packet.equipment.damaged.toFixed(1)} damaged`);
    parts.push(`Equipment: ${equipParts.join(", ")}.`);
  }

  // Component damage summary
  if (packet.componentDamage) {
    const compParts: string[] = [];
    const components = Object.keys(packet.componentDamage.damaged) as VehicleComponent[];
    if (components.length > 0) {
      compParts.push(`Components affected: ${components.join(", ")}.`);
    }
    if (compParts.length > 0) {
      parts.push(compParts.join(" "));
    }
  }

  // Weapon type summary
  if (weaponReports.length > 0) {
    const damageTypes = new Set(weaponReports.map((w) => w.damageType));
    if (damageTypes.size > 0) {
      parts.push(`Damage types: ${Array.from(damageTypes).join(", ")}.`);
    }
  }

  return parts.join(" ");
}

/**
 * Generate a medical priority report from personnel casualties.
 * 
 * @param unitId - Unit identifier
 * @param personnel - Personnel damage delta
 * @returns Medical priority assessment
 */
export function generateMedicalPriorityReport(
  unitId: string,
  personnel: PersonnelDamageDelta
): MedicalPriorityReport {
  const criticalCasualties = personnel.severelyWounded;
  const treatableCasualties = personnel.wounded + personnel.injured;
  const killed = personnel.killed;

  let recommendedResponse: MedicalPriorityReport["recommendedResponse"] = "none";
  if (criticalCasualties >= 5) {
    recommendedResponse = "evacuation";
  } else if (criticalCasualties >= 2 || treatableCasualties >= 10) {
    recommendedResponse = "medicalTeam";
  } else if (treatableCasualties >= 3) {
    recommendedResponse = "fieldDressing";
  }

  const assessment = buildMedicalAssessment(criticalCasualties, treatableCasualties, killed);

  return {
    unitId,
    criticalCasualties,
    treatableCasualties,
    killed,
    recommendedResponse,
    assessment
  };
}

/**
 * Build human-readable medical assessment.
 */
function buildMedicalAssessment(
  critical: number,
  treatable: number,
  killed: number
): string {
  const parts: string[] = [];

  if (killed > 0) {
    parts.push(`${killed.toFixed(1)} KIA.`);
  }

  if (critical > 0) {
    parts.push(`${critical.toFixed(1)} require immediate evacuation.`);
  }

  if (treatable > 0) {
    parts.push(`${treatable.toFixed(1)} can be treated in field.`);
  }

  if (parts.length === 0) {
    return "No casualties reported.";
  }

  return parts.join(" ");
}

/**
 * Generate a repair priority report from equipment and component damage.
 * 
 * @param unitId - Unit identifier
 * @param equipment - Equipment damage delta
 * @param componentDamage - Component-specific damage
 * @returns Repair priority assessment
 */
export function generateRepairPriorityReport(
  unitId: string,
  equipment: EquipmentDamageDelta,
  componentDamage?: ComponentDamageDelta
): RepairPriorityReport {
  // Extract damaged components
  const damagedComponents: RepairPriorityReport["damagedComponents"] = [];
  const disabledComponents: RepairPriorityReport["disabledComponents"] = [];
  const destroyedComponents: RepairPriorityReport["destroyedComponents"] = [];

  if (componentDamage) {
    Object.entries(componentDamage.damaged).forEach(([component, count]) => {
      const countNum = count as number;
      if (countNum > 0) damagedComponents.push({ component: component as VehicleComponent, count: countNum });
    });
    Object.entries(componentDamage.disabled).forEach(([component, count]) => {
      const countNum = count as number;
      if (countNum > 0) disabledComponents.push({ component: component as VehicleComponent, count: countNum });
    });
    Object.entries(componentDamage.destroyed).forEach(([component, count]) => {
      const countNum = count as number;
      if (countNum > 0) destroyedComponents.push({ component: component as VehicleComponent, count: countNum });
    });
  }

  // Determine recommended response
  let recommendedResponse: RepairPriorityReport["recommendedResponse"] = "none";
  if (destroyedComponents.length > 0 || equipment.destroyed >= 2) {
    recommendedResponse = "salvage";
  } else if (disabledComponents.length > 0 || equipment.disabled >= 2) {
    recommendedResponse = "workshop";
  } else if (damagedComponents.length > 0 || equipment.damaged >= 3) {
    recommendedResponse = "fieldRepair";
  }

  // Calculate restoration times (simplified estimates)
  const mobilityRestorationTime = calculateMobilityRestorationTime(
    damagedComponents,
    disabledComponents,
    destroyedComponents
  );
  const combatRestorationTime = calculateCombatRestorationTime(
    damagedComponents,
    disabledComponents,
    destroyedComponents
  );

  const assessment = buildRepairAssessment(
    damagedComponents,
    disabledComponents,
    destroyedComponents,
    equipment,
    mobilityRestorationTime,
    combatRestorationTime
  );

  return {
    unitId,
    damagedComponents,
    disabledComponents,
    destroyedComponents,
    recommendedResponse,
    mobilityRestorationTime,
    combatRestorationTime,
    assessment
  };
}

/**
 * Calculate estimated time to restore mobility (in hours).
 */
function calculateMobilityRestorationTime(
  damaged: { component: VehicleComponent; count: number }[],
  disabled: { component: VehicleComponent; count: number }[],
  destroyed: { component: VehicleComponent; count: number }[]
): number {
  let time = 0;

  // Mobility-critical components
  const mobilityComponents: VehicleComponent[] = ["engine", "tracks", "suspension"];

  damaged.forEach((c) => {
    if (mobilityComponents.includes(c.component)) time += 1 * c.count;
  });
  disabled.forEach((c) => {
    if (mobilityComponents.includes(c.component)) time += 4 * c.count;
  });
  destroyed.forEach((c) => {
    if (mobilityComponents.includes(c.component)) time += 24 * c.count; // Requires replacement parts
  });

  return Math.min(time, 72); // Cap at 72 hours
}

/**
 * Calculate estimated time to restore combat effectiveness (in hours).
 */
function calculateCombatRestorationTime(
  damaged: { component: VehicleComponent; count: number }[],
  disabled: { component: VehicleComponent; count: number }[],
  destroyed: { component: VehicleComponent; count: number }[]
): number {
  let time = 0;

  // Combat-critical components
  const combatComponents: VehicleComponent[] = ["gun", "turret", "optics", "radio"];

  damaged.forEach((c) => {
    if (combatComponents.includes(c.component)) time += 2 * c.count;
  });
  disabled.forEach((c) => {
    if (combatComponents.includes(c.component)) time += 8 * c.count;
  });
  destroyed.forEach((c) => {
    if (combatComponents.includes(c.component)) time += 48 * c.count; // Requires replacement parts
  });

  return Math.min(time, 168); // Cap at 1 week
}

/**
 * Build human-readable repair assessment.
 */
function buildRepairAssessment(
  damaged: { component: VehicleComponent; count: number }[],
  disabled: { component: VehicleComponent; count: number }[],
  destroyed: { component: VehicleComponent; count: number }[],
  equipment: EquipmentDamageDelta,
  mobilityTime: number,
  combatTime: number
): string {
  const parts: string[] = [];

  if (destroyed.length > 0 || equipment.destroyed > 0) {
    parts.push(`${Math.ceil(equipment.destroyed)} vehicles destroyed.`);
  }

  if (disabled.length > 0 || equipment.disabled > 0) {
    parts.push(`${Math.ceil(equipment.disabled)} vehicles disabled.`);
  }

  if (damaged.length > 0 || equipment.damaged > 0) {
    parts.push(`${Math.ceil(equipment.damaged)} vehicles damaged.`);
  }

  if (mobilityTime > 0) {
    parts.push(`Mobility restoration: ~${mobilityTime}h.`);
  }

  if (combatTime > 0) {
    parts.push(`Combat restoration: ~${combatTime}h.`);
  }

  if (parts.length === 0) {
    return "No damage reported.";
  }

  return parts.join(" ");
}

/**
 * Format a combat report for activity log display.
 * 
 * @param report - Combat engagement report
 * @returns Formatted activity log sections
 */
export function formatCombatReportForActivityLog(report: CombatEngagementReport): {
  title: string;
  sections: { header: string; content: string }[];
} {
  const sections: { header: string; content: string }[] = [];

  // Overview section
  sections.push({
    header: "Engagement Overview",
    content: `${report.attackerName} vs ${report.defenderName}\n` +
      `Location: (${report.engagementHex.q}, ${report.engagementHex.r})\n` +
      `Total Rounds: ${report.totalShots.toLocaleString()}\n` +
      `Expected Hits: ${report.totalExpectedHits.toFixed(1)}`
  });

  // Weapon breakdown
  if (report.weaponReports.length > 0) {
    const weaponContent = report.weaponReports.map((w) => {
      const parts: string[] = [
        `${w.weaponName}: ${w.shots} shots, ${w.expectedHits.toFixed(1)} hits`,
        `Type: ${w.damageType}`
      ];
      
      const totalPersonnel = w.personnel.killed + w.personnel.severelyWounded + 
        w.personnel.wounded + w.personnel.injured;
      if (totalPersonnel > 0) {
        parts.push(`Casualties: ${totalPersonnel.toFixed(1)}`);
      }
      
      const totalEquip = w.equipment.destroyed + w.equipment.disabled + w.equipment.damaged;
      if (totalEquip > 0) {
        parts.push(`Equipment: ${totalEquip.toFixed(1)}`);
      }

      return parts.join(" | ");
    }).join("\n");

    sections.push({
      header: "Weapon Breakdown",
      content: weaponContent
    });
  }

  // Component damage
  const damagedComps = Object.entries(report.componentDamage.damaged)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);
  const disabledComps = Object.entries(report.componentDamage.disabled)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);
  const destroyedComps = Object.entries(report.componentDamage.destroyed)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);

  if (damagedComps.length > 0 || disabledComps.length > 0 || destroyedComps.length > 0) {
    const compContent: string[] = [];
    
    if (damagedComps.length > 0) {
      compContent.push("Damaged: " + damagedComps.map(([c, v]: [string, number]) => `${c} (${v.toFixed(1)})`).join(", "));
    }
    if (disabledComps.length > 0) {
      compContent.push("Disabled: " + disabledComps.map(([c, v]: [string, number]) => `${c} (${v.toFixed(1)})`).join(", "));
    }
    if (destroyedComps.length > 0) {
      compContent.push("Destroyed: " + destroyedComps.map(([c, v]: [string, number]) => `${c} (${v.toFixed(1)})`).join(", "));
    }

    sections.push({
      header: "Component Damage",
      content: compContent.join("\n")
    });
  }

  // Medical report
  const medicalReport = generateMedicalPriorityReport(report.defenderId, report.personnelCasualties);
  if (medicalReport.recommendedResponse !== "none") {
    sections.push({
      header: "Medical Assessment",
      content: medicalReport.assessment + `\nRecommended: ${medicalReport.recommendedResponse}`
    });
  }

  // Repair report
  const repairReport = generateRepairPriorityReport(
    report.defenderId,
    report.equipmentDamage,
    report.componentDamage
  );
  if (repairReport.recommendedResponse !== "none") {
    sections.push({
      header: "Repair Assessment",
      content: repairReport.assessment + `\nRecommended: ${repairReport.recommendedResponse}`
    });
  }

  return {
    title: `Combat: ${report.attackerName} vs ${report.defenderName}`,
    sections
  };
}

/**
 * Aggregate multiple combat reports into an after-action summary.
 * 
 * @param reports - Array of combat engagement reports
 * @returns Aggregated after-action report
 */
export function generateAfterActionReport(
  reports: CombatEngagementReport[]
): {
  totalEngagements: number;
  totalRoundsFired: number;
  totalCasualties: PersonnelDamageDelta;
  totalEquipmentDamage: EquipmentDamageDelta;
  damageTypesUsed: WeaponDamageType[];
  summary: string;
} {
  const totalEngagements = reports.length;
  const totalRoundsFired = reports.reduce((sum, r) => sum + r.totalShots, 0);
  
  const totalCasualties: PersonnelDamageDelta = {
    killed: reports.reduce((sum, r) => sum + r.personnelCasualties.killed, 0),
    severelyWounded: reports.reduce((sum, r) => sum + r.personnelCasualties.severelyWounded, 0),
    wounded: reports.reduce((sum, r) => sum + r.personnelCasualties.wounded, 0),
    injured: reports.reduce((sum, r) => sum + r.personnelCasualties.injured, 0)
  };

  const totalEquipmentDamage: EquipmentDamageDelta = {
    destroyed: reports.reduce((sum, r) => sum + r.equipmentDamage.destroyed, 0),
    disabled: reports.reduce((sum, r) => sum + r.equipmentDamage.disabled, 0),
    damaged: reports.reduce((sum, r) => sum + r.equipmentDamage.damaged, 0)
  };

  const allDamageTypes = new Set<WeaponDamageType>();
  reports.forEach((r) => r.damageTypesUsed.forEach((t) => allDamageTypes.add(t)));

  const summary = `${totalEngagements} engagements. ${totalRoundsFired.toLocaleString()} rounds fired. ` +
    `Casualties: ${totalCasualties.killed.toFixed(1)} KIA, ` +
    `${(totalCasualties.severelyWounded + totalCasualties.wounded + totalCasualties.injured).toFixed(1)} WIA. ` +
    `Equipment: ${totalEquipmentDamage.destroyed.toFixed(1)} destroyed, ` +
    `${totalEquipmentDamage.disabled.toFixed(1)} disabled.`;

  return {
    totalEngagements,
    totalRoundsFired,
    totalCasualties,
    totalEquipmentDamage,
    damageTypesUsed: Array.from(allDamageTypes),
    summary
  };
}
