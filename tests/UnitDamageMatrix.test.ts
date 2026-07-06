import { mkdir, writeFile } from "node:fs/promises";
import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type AttackResult } from "../src/core/Combat";
import type {
  Axial,
  FormationStatusSummary,
  ScenarioUnit,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { formationList } from "../src/data/unitSystem/formations";
import { createInitialFormationStatus, ensureFormationStatus } from "../src/data/unitSystem/status";
import {
  applyDamagePacketToUnit,
  describeDamagePacket,
  describeStatusTransitions,
  resolveDamagePacket,
  summarizeFormationStatus,
  type DamagePacket
} from "../src/data/unitSystem/damagePackets";
import terrainData from "../src/data/terrain.json";

const unitTypes = unitTypesData as UnitTypeDictionary;
const terrain = terrainData as TerrainDictionary;
const attackerHex: Axial = { q: 0, r: 0 };
const defenderHex: Axial = { q: 1, r: 0 };
const MATRIX_DATE = currentEasternDateStamp();
const MATRIX_RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_BASE = `diagnostics/unit-damage/one-hex-unit-damage-matrix-${MATRIX_DATE}`;
const FALLBACK_OUTPUT_BASE = `diagnostics/unit-damage/one-hex-unit-damage-matrix-${MATRIX_DATE}-${MATRIX_RUN_ID}`;
const LATEST_OUTPUT_BASE = "diagnostics/unit-damage/one-hex-unit-damage-matrix-latest";

type UnitKey = ScenarioUnit["type"];

interface AttackEligibility {
  eligible: boolean;
  reason: string;
}

interface MatrixOutcome {
  attackerType: UnitKey;
  defenderType: UnitKey;
  eligible: boolean;
  blockedReason: string;
  baseAttackResult: AttackResult | null;
  scaledAttackResult: AttackResult | null;
  packet: DamagePacket | null;
  before: FormationStatusSummary;
  after: FormationStatusSummary;
  strengthLoss: number;
}

function currentEasternDateStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${valueByType.get("year")}-${valueByType.get("month")}-${valueByType.get("day")}`;
}

function formationKeyForType(type: string): string | undefined {
  return formationList.find((formation) => formation.tacticalUnitType === type)?.key;
}

function makeUnit(type: UnitKey, hex: Axial, id: string): ScenarioUnit {
  const definition = unitTypes[type];
  const formationKey = formationKeyForType(type as string);
  return {
    type,
    hex: structuredClone(hex),
    strength: 100,
    experience: definition.baseExperience ?? 0,
    baseExperience: definition.baseExperience ?? 0,
    earnedExperience: 0,
    ammo: definition.ammo,
    fuel: definition.fuel,
    entrench: 0,
    facing: "W",
    unitId: id,
    formationKey,
    status: createInitialFormationStatus(type as string, formationKey)
  };
}

function makeRequest(attacker: ScenarioUnit, defender: ScenarioUnit): AttackRequest {
  const attackerDefinition = unitTypes[attacker.type];
  const defenderDefinition = unitTypes[defender.type];
  return {
    attacker: {
      unit: attackerDefinition,
      strength: attacker.strength,
      experience: attacker.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    defender: {
      unit: defenderDefinition,
      strength: defender.strength,
      experience: defender.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: { hex: attacker.hex },
    defenderCtx: {
      terrain: terrain.plains,
      class: defenderDefinition.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: false,
      isSpottedOnly: false
    },
    targetFacing: defender.facing,
    isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist",
    useTheoreticalShots: false
  };
}

/**
 * Creates a request for battlefield combat testing (uses posture/movement/suppression scalars).
 * Used for validation tests that need to verify battlefield behavior, not theoretical maximums.
 */
function makeBattlefieldRequest(attacker: ScenarioUnit, defender: ScenarioUnit): AttackRequest {
  const attackerDefinition = unitTypes[attacker.type];
  const defenderDefinition = unitTypes[defender.type];
  return {
    attacker: {
      unit: attackerDefinition,
      strength: attacker.strength,
      experience: attacker.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    defender: {
      unit: defenderDefinition,
      strength: defender.strength,
      experience: defender.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: { hex: attacker.hex },
    defenderCtx: {
      terrain: terrain.plains,
      class: defenderDefinition.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: false,
      isSpottedOnly: false
    },
    targetFacing: defender.facing,
    isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist",
    useTheoreticalShots: false // Use battlefield scalars for combat behavior validation
  };
}

function syntheticOneHitAttackResult(shots = 1): AttackResult {
  return {
    accuracy: 100,
    shots,
    damagePerHit: 0,
    expectedHits: shots,
    expectedDamage: 0,
    expectedSuppression: 0,
    effectiveAP: 0,
    facingArmor: 0,
    accuracyBreakdown: {
      baseRange: 100,
      commanderScalar: 1,
      afterCommander: 100,
      experienceScalar: 1,
      afterExperience: 100,
      terrainModifier: 0,
      terrainMultiplier: 1,
      afterTerrain: 100,
      spottedMultiplier: 1,
      finalPreClamp: 100,
      final: 100
    },
    damageBreakdown: {
      baseTableValue: 0,
      experienceScalar: 1,
      afterExperience: 0,
      commanderScalar: 1,
      final: 0
    }
  };
}

function isAircraft(definition: UnitTypeDefinition): boolean {
  return definition.moveType === "air";
}

function isBomber(type: UnitKey, definition: UnitTypeDefinition): boolean {
  return type === "Bomber" || (isAircraft(definition) && definition.combat.role === "antiInfantry");
}

function isFlak(type: UnitKey, definition: UnitTypeDefinition): boolean {
  return type === "Flak_88" || (definition.traits.includes("intercept") && !isAircraft(definition));
}

function hasIntentionalWeaponGroups(definition: UnitTypeDefinition): boolean {
  return (definition.weaponModel?.groups ?? []).some((group) => group.role !== "unarmed" && group.shots > 0);
}

function resolveAttackEligibility(
  attackerType: UnitKey,
  attackerDefinition: UnitTypeDefinition,
  defenderDefinition: UnitTypeDefinition
): AttackEligibility {
  if (!hasIntentionalWeaponGroups(attackerDefinition)) {
    return { eligible: false, reason: "attacker has no intentional combat weapon groups" };
  }
  if (attackerDefinition.rangeMax <= 0 || attackerDefinition.ammo <= 0) {
    return { eligible: false, reason: "attacker is not an intentional combat unit" };
  }

  const attackerIsAircraft = isAircraft(attackerDefinition);
  const defenderIsAircraft = isAircraft(defenderDefinition);
  if (attackerIsAircraft && attackerDefinition.combat.role === "support") {
    return { eligible: false, reason: "support aircraft are not intentional attackers" };
  }
  if (defenderIsAircraft && !attackerIsAircraft && !isFlak(attackerType, attackerDefinition)) {
    return { eligible: false, reason: "ground unit cannot target aircraft without anti-air capability" };
  }
  if (defenderIsAircraft && isBomber(attackerType, attackerDefinition)) {
    return { eligible: false, reason: "bombers only engage aircraft defensively" };
  }
  if (defenderIsAircraft && attackerIsAircraft && !attackerDefinition.airCombat?.attack) {
    return { eligible: false, reason: "aircraft lacks offensive air-combat weapons" };
  }
  return { eligible: true, reason: "" };
}

function scaleAttackResult(
  result: AttackResult,
  attackerType: UnitKey,
  attackerDefinition: UnitTypeDefinition,
  defenderDefinition: UnitTypeDefinition
): AttackResult {
  void attackerType;
  void attackerDefinition;
  void defenderDefinition;
  return result;
}

function resolveDamageEffectScalar(baseResult: AttackResult, scaledResult: AttackResult): number {
  void baseResult;
  void scaledResult;
  return 1;
}

function resolveMatrixOutcome(attackerType: UnitKey, defenderType: UnitKey, attackerPosition: Axial = attackerHex): MatrixOutcome {
  const attackerDefinition = unitTypes[attackerType];
  const defenderDefinition = unitTypes[defenderType];
  const defender = makeUnit(defenderType, defenderHex, `def-${defenderType}`);
  const before = summarizeFormationStatus(defender.status, defender.strength);
  const eligibility = resolveAttackEligibility(attackerType, attackerDefinition, defenderDefinition);

  if (!eligibility.eligible) {
    return {
      attackerType,
      defenderType,
      eligible: false,
      blockedReason: eligibility.reason,
      baseAttackResult: null,
      scaledAttackResult: null,
      packet: null,
      before,
      after: before,
      strengthLoss: 0
    };
  }

  const attacker = makeUnit(attackerType, attackerPosition, `atk-${attackerType}`);
  const baseAttackResult = resolveAttack(makeRequest(attacker, defender));
  const scaledAttackResult = scaleAttackResult(baseAttackResult, attackerType, attackerDefinition, defenderDefinition);
  const packet = resolveDamagePacket({
    attacker,
    attackerDefinition,
    attackerHex: attackerPosition,
    defender,
    defenderDefinition,
    defenderHex,
    attackResult: scaledAttackResult,
    targetFacing: defender.facing,
    effectScalar: resolveDamageEffectScalar(baseAttackResult, scaledAttackResult)
  });
  applyDamagePacketToUnit(defender, packet);
  const after = summarizeFormationStatus(defender.status, defender.strength);

  return {
    attackerType,
    defenderType,
    eligible: true,
    blockedReason: "",
    baseAttackResult,
    scaledAttackResult,
    packet,
    before,
    after,
    strengthLoss: Math.max(0, Math.round((before.readiness - after.readiness) * 100) / 100)
  };
}

function compactCell(outcome: MatrixOutcome): string {
  if (!outcome.eligible || !outcome.packet) {
    return "N/A";
  }
  const packet = outcome.packet;
  return [
    `Str -${outcome.strengthLoss}`,
    `P ${packet.personnel.killed}/${packet.personnel.severelyWounded}/${packet.personnel.wounded}/${packet.personnel.injured}`,
    `Eq ${packet.equipment.destroyed}/${packet.equipment.disabled}/${packet.equipment.damaged}`,
    `S ${Math.round(packet.suppression)}`
  ].join(" ");
}

function personnelCasualtyCount(packet: DamagePacket): number {
  return packet.personnel.killed +
    packet.personnel.severelyWounded +
    packet.personnel.wounded +
    packet.personnel.injured;
}

function weaponPersonnelCasualtyCount(packet: DamagePacket, weaponId: string): number {
  const hit = packet.weaponHits.find((entry) => entry.id === weaponId);
  if (!hit) {
    throw new Error(`Missing weapon hit summary for ${weaponId}.`);
  }
  return hit.personnel.killed +
    hit.personnel.severelyWounded +
    hit.personnel.wounded +
    hit.personnel.injured;
}

function expectTransitionLedgerMatchesPacket(outcome: MatrixOutcome): void {
  const packet = outcome.packet;
  if (!packet) {
    return;
  }
  const transitions = packet.statusTransitions;
  if (!transitions) {
    throw new Error(`${outcome.attackerType}->${outcome.defenderType} missing status transition ledger.`);
  }
  const personnelByTarget = {
    killed: transitions.personnel.filter((entry) => entry.to === "killed").reduce((sum, entry) => sum + entry.count, 0),
    severelyWounded: transitions.personnel.filter((entry) => entry.to === "severelyWounded").reduce((sum, entry) => sum + entry.count, 0),
    wounded: transitions.personnel.filter((entry) => entry.to === "wounded").reduce((sum, entry) => sum + entry.count, 0),
    injured: transitions.personnel.filter((entry) => entry.to === "injured").reduce((sum, entry) => sum + entry.count, 0)
  };
  const equipmentByTarget = {
    destroyed: transitions.equipment.filter((entry) => entry.to === "destroyed").reduce((sum, entry) => sum + entry.count, 0),
    disabled: transitions.equipment.filter((entry) => entry.to === "disabled").reduce((sum, entry) => sum + entry.count, 0),
    damaged: transitions.equipment.filter((entry) => entry.to === "damaged").reduce((sum, entry) => sum + entry.count, 0)
  };
  const checks = [
    ["killed", personnelByTarget.killed, packet.personnel.killed],
    ["severely wounded", personnelByTarget.severelyWounded, packet.personnel.severelyWounded],
    ["wounded", personnelByTarget.wounded, packet.personnel.wounded],
    ["injured", personnelByTarget.injured, packet.personnel.injured],
    ["destroyed", equipmentByTarget.destroyed, packet.equipment.destroyed],
    ["disabled", equipmentByTarget.disabled, packet.equipment.disabled],
    ["damaged", equipmentByTarget.damaged, packet.equipment.damaged]
  ] as const;
  checks.forEach(([label, actual, expected]) => {
    if (actual !== expected) {
      throw new Error(
        `${outcome.attackerType}->${outcome.defenderType} transition ledger ${label} count ${actual} did not match packet count ${expected}.`
      );
    }
  });
}

function resolveBattlefieldPacket(
  attackerType: UnitKey,
  defenderType: UnitKey,
  options: {
    stance?: "assault" | "suppressive";
    defenderAmmo?: number;
    commander?: AttackRequest["attacker"]["general"];
  } = {}
): { result: AttackResult; packet: DamagePacket } {
  const attacker = makeUnit(attackerType, attackerHex, `packet-atk-${attackerType}`);
  const defender = makeUnit(defenderType, defenderHex, `packet-def-${defenderType}`);
  if (typeof options.defenderAmmo === "number") {
    defender.ammo = options.defenderAmmo;
  }
  const baseRequest = makeBattlefieldRequest(attacker, defender);
  const request: AttackRequest = {
    ...baseRequest,
    attacker: {
      ...baseRequest.attacker,
      general: options.commander ?? baseRequest.attacker.general
    },
    attackerCtx: {
      ...baseRequest.attackerCtx,
      stance: options.stance
    },
    defenderCtx: {
      ...baseRequest.defenderCtx,
      isRushing: options.stance === "assault",
      stance: options.stance === "assault" ? "assault" : undefined
    }
  };
  const result = resolveAttack(request);
  const packet = resolveDamagePacket({
    attacker,
    attackerDefinition: unitTypes[attackerType],
    attackerHex,
    defender,
    defenderDefinition: unitTypes[defenderType],
    defenderHex,
    attackResult: result,
    targetFacing: defender.facing
  });
  return { result, packet };
}

function weaponBreakdown(packet: DamagePacket | null): string {
  if (!packet) {
    return "";
  }
  return packet.weaponHits
    .map((hit) => {
      const personnel = hit.personnel.killed + hit.personnel.severelyWounded + hit.personnel.wounded + hit.personnel.injured;
      const equipment = hit.equipment.destroyed + hit.equipment.disabled + hit.equipment.damaged;
      const outcomes = [
        personnel > 0
          ? `personnel ${hit.personnel.killed}/${hit.personnel.severelyWounded}/${hit.personnel.wounded}/${hit.personnel.injured}`
          : "",
        equipment > 0
          ? `equipment ${hit.equipment.destroyed}/${hit.equipment.disabled}/${hit.equipment.damaged}`
          : ""
      ].filter(Boolean).join(", ");
      return `${hit.label}: formation shots ${hit.baseShots}, effective shots ${hit.shots}, target hits ${hit.expectedHits.toFixed(2)}${outcomes ? `, ${outcomes}` : ""}`;
    })
    .join("; ");
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function csvValue(value: string | number | boolean | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function writeDiagnosticFile(path: string, content: string, required = true): Promise<boolean> {
  try {
    await writeFile(path, content, "utf-8");
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (!required && (code === "EBUSY" || code === "EPERM")) {
      console.warn(`[UnitDamageMatrix] Skipped locked optional diagnostic ${path}`);
      return false;
    }
    throw error;
  }
}

function pushCsvRow(csvRows: string[], outcome: MatrixOutcome): void {
  const packet = outcome.packet;
  const result = outcome.scaledAttackResult;
  const shotBreakdown = result?.shotBreakdown;
  const formationWeaponShots = packet?.weaponHits.reduce((sum, hit) => sum + hit.baseShots, 0) ?? null;
  const effectiveWeaponShots = packet?.weaponHits.reduce((sum, hit) => sum + hit.shots, 0) ?? null;
  const allocatedWeaponHits = packet?.weaponHits.reduce((sum, hit) => sum + hit.expectedHits, 0) ?? null;
  const personnelCasualties = packet
    ? packet.personnel.killed + packet.personnel.severelyWounded + packet.personnel.wounded + packet.personnel.injured
    : null;
  const equipmentStatusEvents = packet
    ? packet.equipment.destroyed + packet.equipment.disabled + packet.equipment.damaged
    : null;
  const statusEventCount = personnelCasualties !== null && equipmentStatusEvents !== null
    ? personnelCasualties + equipmentStatusEvents
    : null;
  csvRows.push([
    outcome.attackerType,
    outcome.defenderType,
    outcome.eligible,
    outcome.blockedReason,
    result?.accuracy.toFixed(2) ?? "",
    shotBreakdown?.theoreticalProfileShots ?? "",
    result?.shots ?? "",
    formationWeaponShots ?? "",
    effectiveWeaponShots ?? "",
    shotBreakdown?.posture ?? "",
    shotBreakdown?.postureScalar.toFixed(3) ?? "",
    shotBreakdown?.movementScalar.toFixed(3) ?? "",
    shotBreakdown?.suppressionState ?? "",
    shotBreakdown?.suppressionScalar.toFixed(3) ?? "",
    shotBreakdown?.finalScalar.toFixed(3) ?? "",
    result?.expectedHits.toFixed(2) ?? "",
    allocatedWeaponHits?.toFixed(2) ?? "",
    result?.expectedDamage.toFixed(2) ?? "",
    packet?.readinessLoss ?? "",
    outcome.before.readiness,
    outcome.after.readiness,
    outcome.strengthLoss,
    outcome.before.personnel.fit,
    outcome.after.personnel.fit,
    packet?.personnel.killed ?? "",
    packet?.personnel.severelyWounded ?? "",
    packet?.personnel.wounded ?? "",
    packet?.personnel.injured ?? "",
    personnelCasualties ?? "",
    outcome.before.equipment.operational,
    outcome.after.equipment.operational,
    packet?.equipment.destroyed ?? "",
    packet?.equipment.disabled ?? "",
    packet?.equipment.damaged ?? "",
    equipmentStatusEvents ?? "",
    statusEventCount ?? "",
    packet ? Math.round(packet.suppression) : "",
    packet ? packet.fortificationDamage.toFixed(2) : "",
    packet ? describeDamagePacket(packet) : "",
    packet ? describeStatusTransitions(packet.statusTransitions) : "",
    weaponBreakdown(packet)
  ].map(csvValue).join(","));
}

function expectStatusDeltaMatchesPacket(outcome: MatrixOutcome): void {
  if (!outcome.packet) {
    return;
  }
  const STATUS_DELTA_TOLERANCE = 1;
  const packet = outcome.packet;
  const personnelChecks = [
    ["killed", outcome.after.personnel.killed - outcome.before.personnel.killed, packet.personnel.killed],
    ["severely wounded", outcome.after.personnel.severelyWounded - outcome.before.personnel.severelyWounded, packet.personnel.severelyWounded],
    ["wounded", outcome.after.personnel.wounded - outcome.before.personnel.wounded, packet.personnel.wounded],
    ["injured", outcome.after.personnel.injured - outcome.before.personnel.injured, packet.personnel.injured]
  ] as const;
  const equipmentChecks = [
    ["destroyed", outcome.after.equipment.destroyed - outcome.before.equipment.destroyed, packet.equipment.destroyed],
    ["disabled", outcome.after.equipment.disabled - outcome.before.equipment.disabled, packet.equipment.disabled],
    ["damaged", outcome.after.equipment.damaged - outcome.before.equipment.damaged, packet.equipment.damaged]
  ] as const;

  [...personnelChecks, ...equipmentChecks].forEach(([label, actual, expected]) => {
    if (actual > expected + STATUS_DELTA_TOLERANCE) {
      throw new Error(
        `${outcome.attackerType}->${outcome.defenderType} applied more ${label} status than the packet reported. Expected at most ${expected + STATUS_DELTA_TOLERANCE}, got ${actual}.`
      );
    }
  });
  if (outcome.strengthLoss !== packet.readinessLoss) {
    throw new Error(
      `${outcome.attackerType}->${outcome.defenderType} readiness loss should come from status pools. Packet ${packet.readinessLoss}, derived ${outcome.strengthLoss}.`
    );
  }
}

registerTest("UNIT_STATUS_READINESS_USES_PERSONNEL_AND_EQUIPMENT_POOLS", async ({ When, Then }) => {
  let tankReadiness = 0;
  let tankEquipmentReadiness = 0;
  let infantryReadiness = 0;
  let infantryPersonnelReadiness = 0;

  await When("damage packets move actual vehicles and personnel into status buckets", async () => {
    const tank = makeUnit("Light_Tank", defenderHex, "status-tank");
    applyDamagePacketToUnit(tank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 1 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    const tankSummary = summarizeFormationStatus(tank.status, tank.strength);
    tankReadiness = tankSummary.readiness;
    tankEquipmentReadiness = tankSummary.equipment.readiness;

    const infantry = makeUnit("Infantry_42", defenderHex, "status-infantry");
    applyDamagePacketToUnit(infantry, {
      personnel: { injured: 72, wounded: 72, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    const infantrySummary = summarizeFormationStatus(infantry.status, infantry.strength);
    infantryReadiness = infantrySummary.readiness;
    infantryPersonnelReadiness = infantrySummary.personnel.readiness;
  });

  await Then("vehicle losses and reduced-capacity casualties drive precise readiness", async () => {
    if (tankReadiness !== 95 || tankEquipmentReadiness !== 95) {
      throw new Error(`Expected one destroyed vehicle in a 20-vehicle company to leave 95 readiness, got unit ${tankReadiness} and equipment ${tankEquipmentReadiness}.`);
    }
    if (infantryReadiness !== 87.5 || infantryPersonnelReadiness !== 87.5) {
      throw new Error(`Expected 72 wounded plus 72 injured in a 720-man battalion to leave 87.5 readiness, got unit ${infantryReadiness} and personnel ${infantryPersonnelReadiness}.`);
    }
  });
});

registerTest("UNIT_STATUS_PLATFORM_DAMAGE_LOSS_DOES_NOT_DECLINE_FROM_EXISTING_DAMAGE", async ({ When, Then }) => {
  const followUpPacket: DamagePacket = {
    personnel: { injured: 1, wounded: 3, severelyWounded: 1, killed: 1 },
    equipment: { damaged: 1, disabled: 1, destroyed: 0 },
    suppression: 0,
    fortificationDamage: 0,
    readinessLoss: 0,
    weaponHits: []
  };
  let freshLoss = 0;
  let damagedBefore = summarizeFormationStatus(undefined, 0);
  let damagedLoss = 0;

  await When("the same logistics damage packet is applied to fresh and already-damaged convoys", async () => {
    const fresh = makeUnit("Supply_Truck", defenderHex, "platform-fresh");
    const freshBefore = summarizeFormationStatus(fresh.status, fresh.strength);
    applyDamagePacketToUnit(fresh, followUpPacket);
    const freshAfter = summarizeFormationStatus(fresh.status, fresh.strength);
    freshLoss = Math.max(0, Math.round((freshBefore.readiness - freshAfter.readiness) * 100) / 100);

    const damaged = makeUnit("Supply_Truck", defenderHex, "platform-damaged");
    applyDamagePacketToUnit(damaged, {
      personnel: { injured: 2, wounded: 5, severelyWounded: 1, killed: 1 },
      equipment: { damaged: 1, disabled: 2, destroyed: 1 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    damagedBefore = summarizeFormationStatus(damaged.status, damaged.strength);
    applyDamagePacketToUnit(damaged, followUpPacket);
    const damagedAfter = summarizeFormationStatus(damaged.status, damaged.strength);
    damagedLoss = Math.max(0, Math.round((damagedBefore.readiness - damagedAfter.readiness) * 100) / 100);
  });

  await Then("platform readiness reports full-strength-equivalent losses from both status channels", async () => {
    if (damagedBefore.readiness >= 70 || damagedBefore.readiness <= 20) {
      throw new Error(`Expected the damaged convoy to start badly hurt but not exhausted, saw ${damagedBefore.readiness} readiness.`);
    }
    if (freshLoss < 25) {
      throw new Error(`Expected the follow-up logistics packet to represent major concrete losses, saw ${freshLoss}.`);
    }
    if (damagedLoss < freshLoss - 3) {
      throw new Error(`Existing platform damage should not dampen the same follow-up packet. Fresh ${freshLoss}, damaged ${damagedLoss}.`);
    }
  });
});

registerTest("DAMAGED_PLATFORM_PREVIEWS_EXPLAIN_LOWER_INCREMENTAL_LOSS_WITH_TRANSITIONS", async ({ Given, When, Then }) => {
  const artilleryHex: Axial = { q: -10, r: 0 };
  const freshTarget = makeUnit("Supply_Truck", defenderHex, "howitzer-fresh-supply");
  const damagedTarget = makeUnit("Supply_Truck", defenderHex, "howitzer-damaged-supply");
  const howitzer = makeUnit("Howitzer_105", artilleryHex, "howitzer-transition-attacker");
  let freshPacket: DamagePacket | null = null;
  let damagedPacket: DamagePacket | null = null;

  await Given("one fresh and one already-damaged supply convoy are both under the same howitzer mission", async () => {
    applyDamagePacketToUnit(damagedTarget, {
      personnel: { injured: 20, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 6, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    const damagedSummary = summarizeFormationStatus(damagedTarget.status, damagedTarget.strength);
    if (damagedSummary.readiness > 60 || damagedSummary.readiness < 45) {
      throw new Error(`Expected the damaged convoy to mirror a roughly half-strength target, got ${damagedSummary.readiness}.`);
    }
  });

  await When("the same howitzer attack is projected against each target", async () => {
    const freshResult = resolveAttack(makeRequest(howitzer, freshTarget));
    freshPacket = resolveDamagePacket({
      attacker: howitzer,
      attackerDefinition: unitTypes.Howitzer_105,
      attackerHex: artilleryHex,
      defender: freshTarget,
      defenderDefinition: unitTypes.Supply_Truck,
      defenderHex,
      attackResult: freshResult,
      targetFacing: freshTarget.facing,
      effectScalar: 3
    });

    const damagedResult = resolveAttack(makeRequest(howitzer, damagedTarget));
    damagedPacket = resolveDamagePacket({
      attacker: howitzer,
      attackerDefinition: unitTypes.Howitzer_105,
      attackerHex: artilleryHex,
      defender: damagedTarget,
      defenderDefinition: unitTypes.Supply_Truck,
      defenderHex,
      attackResult: damagedResult,
      targetFacing: damagedTarget.facing,
      effectScalar: 3
    });
  });

  await Then("the packet exposes whether headline effects are fresh hits or worsening existing damage", async () => {
    if (!freshPacket || !damagedPacket) {
      throw new Error("Expected both howitzer/supply packets to resolve.");
    }
    const freshTransitions = describeStatusTransitions(freshPacket.statusTransitions);
    const damagedTransitions = describeStatusTransitions(damagedPacket.statusTransitions);
    if (!freshTransitions.includes("operational->")) {
      throw new Error(`Fresh convoy packet should record fresh equipment hits, got ${freshTransitions}.`);
    }
    if (!damagedTransitions.includes("damaged->")) {
      throw new Error(`Damaged convoy packet should record worsening of existing equipment damage, got ${damagedTransitions}.`);
    }
    if (damagedPacket.readinessLoss < freshPacket.readinessLoss - 3 && !describeDamagePacket(damagedPacket).includes("worsened existing damage")) {
      throw new Error(
        `Lower follow-up loss must be explained by transition detail. Fresh ${describeDamagePacket(freshPacket)}, damaged ${describeDamagePacket(damagedPacket)}.`
      );
    }
  });
});

registerTest("UNIT_STATUS_DAMAGE_WORSENS_NON_TERMINAL_POOLS", async ({ When, Then }) => {
  let infantryBefore = summarizeFormationStatus(undefined, 0);
  let infantryAfter = summarizeFormationStatus(undefined, 0);
  let tankBefore = summarizeFormationStatus(undefined, 0);
  let tankAfter = summarizeFormationStatus(undefined, 0);
  let degradedTankBefore = summarizeFormationStatus(undefined, 0);
  let degradedTankAfter = summarizeFormationStatus(undefined, 0);
  let injuredTargetPacket: DamagePacket | null = null;
  let damagedTargetPacket: DamagePacket | null = null;

  await When("follow-up damage is applied to injured personnel and damaged vehicles", async () => {
    const infantry = makeUnit("Infantry_42", defenderHex, "worsen-infantry");
    applyDamagePacketToUnit(infantry, {
      personnel: { injured: 720, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    infantryBefore = summarizeFormationStatus(infantry.status, infantry.strength);
    applyDamagePacketToUnit(infantry, {
      personnel: { injured: 0, wounded: 72, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    infantryAfter = summarizeFormationStatus(infantry.status, infantry.strength);

    const tank = makeUnit("Light_Tank", defenderHex, "worsen-tank");
    applyDamagePacketToUnit(tank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 20, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    tankBefore = summarizeFormationStatus(tank.status, tank.strength);
    applyDamagePacketToUnit(tank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 5, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    tankAfter = summarizeFormationStatus(tank.status, tank.strength);

    const degradedTank = makeUnit("Light_Tank", defenderHex, "degraded-targeting-tank");
    applyDamagePacketToUnit(degradedTank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 20, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    applyDamagePacketToUnit(degradedTank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 10, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    degradedTankBefore = summarizeFormationStatus(degradedTank.status, degradedTank.strength);
    applyDamagePacketToUnit(degradedTank, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 1, destroyed: 1 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    degradedTankAfter = summarizeFormationStatus(degradedTank.status, degradedTank.strength);

    const saturationResult = {
      accuracy: 100,
      shots: 10000,
      damagePerHit: 1,
      expectedHits: 10000,
      expectedDamage: 100,
      expectedSuppression: 0,
      effectiveAP: 0,
      facingArmor: 0,
      accuracyBreakdown: {},
      damageBreakdown: {}
    } as AttackResult;
    const infantryAttacker = makeUnit("Infantry_42", attackerHex, "packet-infantry-attacker");
    const injuredDefender = makeUnit("Infantry_42", defenderHex, "packet-injured-defender");
    applyDamagePacketToUnit(injuredDefender, {
      personnel: { injured: 720, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 0, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    injuredTargetPacket = resolveDamagePacket({
      attacker: infantryAttacker,
      attackerDefinition: unitTypes.Infantry_42,
      attackerHex,
      defender: injuredDefender,
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: saturationResult,
      targetFacing: injuredDefender.facing,
      effectScalar: 12
    });

    const tankAttacker = makeUnit("Heavy_Tank", attackerHex, "packet-tank-attacker");
    const damagedDefender = makeUnit("Light_Tank", defenderHex, "packet-damaged-defender");
    applyDamagePacketToUnit(damagedDefender, {
      personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
      equipment: { damaged: 20, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });
    damagedTargetPacket = resolveDamagePacket({
      attacker: tankAttacker,
      attackerDefinition: unitTypes.Heavy_Tank,
      attackerHex,
      defender: damagedDefender,
      defenderDefinition: unitTypes.Light_Tank,
      defenderHex,
      attackResult: saturationResult,
      targetFacing: damagedDefender.facing,
      effectScalar: 12
    });
  });

  await Then("only KIA and destroyed vehicles are removed from later damage eligibility", async () => {
    if (infantryBefore.personnel.injured !== 720 || infantryBefore.readiness !== 75) {
      throw new Error(`Expected all-injured battalion at 75 readiness before follow-up damage, received ${JSON.stringify(infantryBefore.personnel)} readiness ${infantryBefore.readiness}.`);
    }
    if (infantryAfter.personnel.injured !== 648 || infantryAfter.personnel.wounded !== 72 || infantryAfter.readiness !== 67.5) {
      throw new Error(`Expected wounded follow-up damage to worsen injured troops, received ${JSON.stringify(infantryAfter.personnel)} readiness ${infantryAfter.readiness}.`);
    }
    if (tankBefore.equipment.damaged !== 20 || tankBefore.readiness !== 50) {
      throw new Error(`Expected all-damaged tank company at 50 readiness before follow-up damage, received ${JSON.stringify(tankBefore.equipment)} readiness ${tankBefore.readiness}.`);
    }
    if (tankAfter.equipment.damaged !== 15 || tankAfter.equipment.disabled !== 5 || tankAfter.readiness !== 37.5) {
      throw new Error(`Expected disabled follow-up damage to worsen damaged vehicles, received ${JSON.stringify(tankAfter.equipment)} readiness ${tankAfter.readiness}.`);
    }
    if (degradedTankBefore.equipment.damaged !== 10 || degradedTankBefore.equipment.disabled !== 10 || degradedTankBefore.readiness !== 25) {
      throw new Error(`Expected test tank to start as a 25-readiness mix of damaged and disabled vehicles, received ${JSON.stringify(degradedTankBefore.equipment)} readiness ${degradedTankBefore.readiness}.`);
    }
    if (degradedTankAfter.equipment.damaged !== 8 || degradedTankAfter.equipment.disabled !== 11 || degradedTankAfter.equipment.destroyed !== 1 || degradedTankAfter.readiness !== 20) {
      throw new Error(`Expected severe hits to keep damaging active damaged vehicles instead of being absorbed by disabled hulks, received ${JSON.stringify(degradedTankAfter.equipment)} readiness ${degradedTankAfter.readiness}.`);
    }
    if (!injuredTargetPacket || injuredTargetPacket.personnel.killed <= 0 || injuredTargetPacket.readinessLoss <= 0) {
      throw new Error(`Expected damage packet resolution to keep injured troops eligible for worsening, received ${injuredTargetPacket ? describeDamagePacket(injuredTargetPacket) : "no packet"}.`);
    }
    if (!damagedTargetPacket || damagedTargetPacket.equipment.destroyed <= 0 || damagedTargetPacket.readinessLoss <= 0) {
      throw new Error(`Expected damage packet resolution to keep damaged vehicles eligible for worsening, received ${damagedTargetPacket ? describeDamagePacket(damagedTargetPacket) : "no packet"}.`);
    }
  });
});

registerTest("UNIT_STATUS_LEGACY_POOL_OVERSIZE_NORMALIZATION", async ({ When, Then }) => {
  let normalizedPersonnelTotal = 0;
  let normalizedEquipmentTotal = 0;
  let packet: DamagePacket | null = null;

  await When("legacy oversized status pools are normalized before packet application", async () => {
    const attacker = makeUnit("Infantry_42", attackerHex, "legacy-normalize-attacker");
    const defender = makeUnit("Engineer", defenderHex, "legacy-normalize-defender");
    defender.formationKey = "engineer";
    defender.status = {
      personnel: {
        core: { fit: 180, injured: 80, wounded: 90, severelyWounded: 30, killed: 20 },
        legacy: { fit: 120, injured: 40, wounded: 30, severelyWounded: 15, killed: 5 }
      },
      equipment: {
        vehicles: { operational: 24, damaged: 8, disabled: 5, destroyed: 3 }
      },
      ammo: {},
      suppression: 0
    };
    defender.strength = 95;

    ensureFormationStatus(defender, defender.formationKey);
    const normalized = summarizeFormationStatus(defender.status, defender.strength);
    normalizedPersonnelTotal = normalized.personnel.total;
    normalizedEquipmentTotal = normalized.equipment.total;

    const saturationResult = {
      accuracy: 100,
      shots: 10000,
      damagePerHit: 1,
      expectedHits: 10000,
      expectedDamage: 100,
      expectedSuppression: 0,
      effectiveAP: 0,
      facingArmor: 0,
      accuracyBreakdown: {},
      damageBreakdown: {}
    } as AttackResult;

    packet = resolveDamagePacket({
      attacker,
      attackerDefinition: unitTypes.Infantry_42,
      attackerHex,
      defender,
      defenderDefinition: unitTypes.Engineer,
      defenderHex,
      attackResult: saturationResult,
      targetFacing: defender.facing,
      effectScalar: 12
    });
  });

  await Then("personnel and equipment effects stay bounded by the formation composition", async () => {
    if (normalizedPersonnelTotal !== 160 || normalizedEquipmentTotal !== 12) {
      throw new Error(`Expected engineer status normalization to 160 personnel / 12 equipment, got ${normalizedPersonnelTotal} / ${normalizedEquipmentTotal}.`);
    }
    if (!packet) {
      throw new Error("Expected a damage packet after normalization.");
    }
    const personnelEvents = packet.personnel.injured + packet.personnel.wounded + packet.personnel.severelyWounded + packet.personnel.killed;
    const equipmentEvents = packet.equipment.damaged + packet.equipment.disabled + packet.equipment.destroyed;
    if (personnelEvents > 160) {
      throw new Error(`Personnel damage should be capped to engineer composition. Got ${describeDamagePacket(packet)}.`);
    }
    if (equipmentEvents > 12) {
      throw new Error(`Equipment damage should be capped to engineer vehicle count. Got ${describeDamagePacket(packet)}.`);
    }
  });
});

registerTest("UNIT_DAMAGE_MATRIX_ONE_HEX_BALANCE_HARNESS", async ({ Given, When, Then }) => {
  const unitKeys = Object.keys(unitTypes) as UnitKey[];
  const outcomes = new Map<string, MatrixOutcome>();
  const rows: string[] = [];
  const csvRows = [
    [
      "attacker",
      "defender",
      "eligible",
      "blockedReason",
      "accuracy",
      "theoreticalProfileShots",
      "actualCombatShots",
      "formationWeaponShots",
      "effectiveWeaponShots",
      "shotPosture",
      "postureScalar",
      "movementScalar",
      "attackerSuppressionState",
      "suppressionScalar",
      "finalShotScalar",
      "actualCombatExpectedTargetHits",
      "allocatedWeaponTargetHits",
      "preStatusExpectedDamage",
      "packetReadinessLoss",
      "derivedStrengthBefore",
      "derivedStrengthAfter",
      "derivedStrengthLoss",
      "personnelFitBefore",
      "personnelFitAfter",
      "personnelKilled",
      "personnelSevere",
      "personnelWounded",
      "personnelInjured",
      "personnelCasualties",
      "equipmentOperationalBefore",
      "equipmentOperationalAfter",
      "equipmentDestroyed",
      "equipmentDisabled",
      "equipmentDamaged",
      "equipmentStatusEvents",
      "statusEventCount",
      "suppression",
      "fortificationDamage",
      "description",
      "statusTransitions",
      "weaponBreakdown"
    ].map(csvValue).join(",")
  ];

  await Given("every tactical unit type pair at the one-hex comparison range", async () => {
    rows.push(`# One-Hex Unit Damage Matrix - ${MATRIX_DATE}`);
    rows.push("");
    rows.push("The harness applies each eligible damage packet to fresh personnel/equipment status pools before reporting derived strength loss.");
    rows.push("Theoretical profile shots are the gun-range five-minute maximum; actual combat shots apply posture, movement, suppression, experience, and strength scaling.");
    rows.push("The CSV's `preStatusExpectedDamage` is the old pre-status combat scalar; status-pool columns and derived strength loss are the balancing source of truth.");
    rows.push("Cells marked `N/A` are intentionally skipped because the combat engine would not allow that target domain or attacker role.");
    rows.push("");
    rows.push("Cell format: `Str -derivedStrengthLoss P killed/severe/wounded/injured Eq destroyed/disabled/damaged S suppression`.");
    rows.push("");
    rows.push(`| Attacker | ${unitKeys.map((key) => markdownEscape(key as string)).join(" | ")} |`);
    rows.push(`|---|${unitKeys.map(() => "---").join("|")}|`);
  });

  await When("resolving and applying the damage packet grid", async () => {
    for (const attackerType of unitKeys) {
      const cells: string[] = [];
      for (const defenderType of unitKeys) {
        const outcome = resolveMatrixOutcome(attackerType, defenderType);
        const key = `${attackerType}->${defenderType}`;
        outcomes.set(key, outcome);
        const cell = compactCell(outcome);
        cells.push(`\`${markdownEscape(cell)}\``);
        pushCsvRow(csvRows, outcome);
      }
      rows.push(`| ${markdownEscape(attackerType as string)} | ${cells.join(" | ")} |`);
    }
    await mkdir("diagnostics/unit-damage", { recursive: true });
    const markdown = `${rows.join("\n")}\n`;
    const csv = `${csvRows.join("\n")}\n`;
    await writeDiagnosticFile(`${OUTPUT_BASE}.md`, markdown);
    const wroteDatedCsv = await writeDiagnosticFile(`${OUTPUT_BASE}.csv`, csv, false);
    if (!wroteDatedCsv) {
      await writeDiagnosticFile(`${FALLBACK_OUTPUT_BASE}.csv`, csv);
    }
    await writeDiagnosticFile(`${LATEST_OUTPUT_BASE}.md`, markdown, false);
    await writeDiagnosticFile(`${LATEST_OUTPUT_BASE}.csv`, csv, false);
  });

  await Then("eligible cells use status-pool damage and impossible pairings stay blocked", async () => {
    outcomes.forEach((outcome) => {
      expectStatusDeltaMatchesPacket(outcome);
      expectTransitionLedgerMatchesPacket(outcome);
      if (!outcome.packet || !outcome.scaledAttackResult) {
        return;
      }
      const allocatedShots = outcome.packet.weaponHits.reduce((sum, hit) => sum + hit.shots, 0);
      const formationShots = outcome.packet.weaponHits.reduce((sum, hit) => sum + hit.baseShots, 0);
      const shotTolerance = Math.max(1, outcome.packet.weaponHits.length);
      if (outcome.scaledAttackResult.shotBreakdown && Math.abs(formationShots - outcome.scaledAttackResult.shotBreakdown.theoreticalProfileShots) > shotTolerance) {
        throw new Error(
          `${outcome.attackerType}->${outcome.defenderType} used ${outcome.scaledAttackResult.shotBreakdown.theoreticalProfileShots} theoretical shots instead of ${formationShots} authored formation shots.`
        );
      }
      if (Math.abs(allocatedShots - outcome.scaledAttackResult.shots) > shotTolerance) {
        throw new Error(
          `${outcome.attackerType}->${outcome.defenderType} allocated ${allocatedShots} weapon shots from ${outcome.scaledAttackResult.shots} actual combat shots.`
        );
      }
      const statusEvents =
        outcome.packet.personnel.injured +
        outcome.packet.personnel.wounded +
        outcome.packet.personnel.severelyWounded +
        outcome.packet.personnel.killed +
        outcome.packet.equipment.damaged +
        outcome.packet.equipment.disabled +
        outcome.packet.equipment.destroyed;
      if (outcome.scaledAttackResult.expectedDamage >= 5 && statusEvents <= 0) {
        throw new Error(
          `${outcome.attackerType}->${outcome.defenderType} had meaningful expected damage but applied no status-pool events.`
        );
      }
    });

    const infantryVsAircraft = outcomes.get("Infantry_42->Fighter");
    if (infantryVsAircraft?.eligible !== false || !infantryVsAircraft.blockedReason.includes("aircraft")) {
      throw new Error(`Infantry should not resolve direct fire against aircraft. Got ${infantryVsAircraft?.blockedReason ?? "missing"}.`);
    }

    const supplyVsInfantry = outcomes.get("Supply_Truck->Infantry_42");
    if (supplyVsInfantry?.eligible !== false) {
      throw new Error("Supply trucks should not be treated as intentional attackers in the matrix.");
    }

    const transportVsInfantry = outcomes.get("Transport_Plane->Infantry_42");
    if (transportVsInfantry?.eligible !== false) {
      throw new Error("Transport aircraft should not be treated as intentional attackers in the matrix.");
    }
  });

  await Then("actual shot volume is reduced from theoretical profile fire without a separate low-readiness penalty", async () => {
    const regular = makeUnit("Infantry_42", attackerHex, "shot-regular");
    const veteran = makeUnit("Infantry_42", attackerHex, "shot-veteran");
    veteran.experience = 5;
    veteran.baseExperience = 5;
    const worn = makeUnit("Infantry_42", attackerHex, "shot-worn");
    worn.strength = 50;
    const defender = makeUnit("Infantry_42", defenderHex, "shot-defender");

    const standard = resolveAttack(makeBattlefieldRequest(regular, defender));
    const suppressive = resolveAttack({
      ...makeBattlefieldRequest(regular, defender),
      attackerCtx: { hex: regular.hex, stance: "suppressive" }
    });
    const moved = resolveAttack({
      ...makeBattlefieldRequest(regular, defender),
      attackerCtx: { hex: regular.hex, movementPointsUsed: 1, movementAttackWindow: 1 }
    });
    const pinned = resolveAttack({
      ...makeBattlefieldRequest(regular, defender),
      attackerCtx: { hex: regular.hex, suppressionState: "pinned" }
    });
    const broken = resolveAttack({
      ...makeBattlefieldRequest(regular, defender),
      attackerCtx: { hex: regular.hex, suppressionState: "broken" }
    });
    const veteranPinned = resolveAttack({
      ...makeBattlefieldRequest(veteran, defender),
      attackerCtx: { hex: veteran.hex, suppressionState: "pinned" }
    });
    const wornStandard = resolveAttack(makeBattlefieldRequest(worn, defender));

    if (!standard.shotBreakdown || standard.shotBreakdown.theoreticalProfileShots <= standard.shots) {
      throw new Error("Standard live fire should be below the theoretical five-minute profile maximum.");
    }
    const standardScalar = standard.shotBreakdown.finalScalar;
    if (standardScalar < 0.16 || standardScalar > 0.20) {
      throw new Error(`Fresh stationary standard fire should use about 18% of theoretical shots, got ${standardScalar}.`);
    }
    if (!suppressive.shotBreakdown || Math.abs(suppressive.shots - standard.shots) > 1) {
      throw new Error(`Suppressive fire should use same shot volume as standard fire. Standard ${standard.shots}, suppressive ${suppressive.shots}.`);
    }
    if (!moved.shotBreakdown || moved.shots >= standard.shots) {
      throw new Error(`Movement before attacking should reduce actual shots. Standard ${standard.shots}, moved ${moved.shots}.`);
    }
    if (!pinned.shotBreakdown || !broken.shotBreakdown || !(pinned.shots > broken.shots)) {
      throw new Error(`Suppression progression should reduce actual shots: pinned ${pinned.shots}, broken ${broken.shots}.`);
    }
    if (!veteranPinned.shotBreakdown || veteranPinned.shots <= pinned.shots) {
      throw new Error(`Experience should recover some pinned fire volume. Regular ${pinned.shots}, veteran ${veteranPinned.shots}.`);
    }
    if (!wornStandard.shotBreakdown || Math.abs(wornStandard.shots / standard.shots - 0.5) > 0.02) {
      throw new Error(`Reduced strength should scale shots directly without another low-readiness penalty. Full ${standard.shots}, 50% ${wornStandard.shots}.`);
    }
  });

  await Then("weapon groups are allocated from authored formation shot counts", async () => {
    const infantryVsTank = outcomes.get("Infantry_42->Light_Tank");
    const atInfantryVsTank = outcomes.get("AT_Infantry->Light_Tank");
    if (!infantryVsTank?.packet || !atInfantryVsTank?.packet) {
      throw new Error("Missing infantry or AT-infantry vs light tank packets for shot allocation validation.");
    }
    const infantryBazookas = infantryVsTank?.packet?.weaponHits.find((hit) => hit.id === "bazooka-teams");
    const atInfantryBazookas = atInfantryVsTank?.packet?.weaponHits.find((hit) => hit.id === "at-battalion-bazookas");

    if (!infantryBazookas || !atInfantryBazookas) {
      throw new Error("Missing bazooka weapon summaries for infantry/AT-infantry shot allocation validation.");
    }
    if (infantryBazookas.baseShots !== 36) {
      throw new Error(`Infantry battalion bazooka base shots should be 36 from 6 teams × 6 shots. Got ${infantryBazookas.baseShots}.`);
    }
    if (atInfantryBazookas.baseShots !== 108) {
      throw new Error(`AT infantry bazooka base shots should be 108 from 18 teams × 6 shots. Got ${atInfantryBazookas.baseShots}.`);
    }
    if (atInfantryBazookas.baseShots / infantryBazookas.baseShots !== 3) {
      throw new Error(`AT infantry bazooka base shots should be exactly 3x regular infantry. Got ${atInfantryBazookas.baseShots}/${infantryBazookas.baseShots}.`);
    }
    if (!infantryVsTank?.scaledAttackResult || !atInfantryVsTank?.scaledAttackResult) {
      throw new Error("Missing scaled attack results for bazooka effective-shot validation.");
    }
    const infantryEffectiveTotal = infantryVsTank.packet.weaponHits.reduce((sum, hit) => sum + hit.shots, 0);
    const atInfantryEffectiveTotal = atInfantryVsTank.packet.weaponHits.reduce((sum, hit) => sum + hit.shots, 0);
    if (Math.abs(infantryEffectiveTotal - infantryVsTank.scaledAttackResult.shots) > infantryVsTank.packet.weaponHits.length) {
      throw new Error(`Infantry weapon effective shots should sum to actual combat shots. Got ${infantryEffectiveTotal}/${infantryVsTank.scaledAttackResult.shots}.`);
    }
    if (Math.abs(atInfantryEffectiveTotal - atInfantryVsTank.scaledAttackResult.shots) > atInfantryVsTank.packet.weaponHits.length) {
      throw new Error(`AT infantry weapon effective shots should sum to actual combat shots. Got ${atInfantryEffectiveTotal}/${atInfantryVsTank.scaledAttackResult.shots}.`);
    }
  });

  await Then("the grid preserves the intended soft/hard damage shape", async () => {
    const infantryVsTank = outcomes.get("Infantry_42->Light_Tank");
    const tankVsInfantry = outcomes.get("Light_Tank->Infantry_42");
    const infantryVsInfantry = outcomes.get("Infantry_42->Infantry_42");
    const assaultGunVsInfantry = outcomes.get("Assault_Gun->Infantry_42");

    if (!infantryVsTank?.packet) {
      throw new Error("Missing infantry vs tank packet for damage validation.");
    }
    const infantryVsTankEqDamage = infantryVsTank.packet.equipment.damaged + infantryVsTank.packet.equipment.disabled + infantryVsTank.packet.equipment.destroyed;
    if (infantryVsTankEqDamage < 1 || infantryVsTankEqDamage > 4) {
      throw new Error(`Infantry battalion AT weapons should produce bounded live-fire equipment damage vs light tanks. Got ${compactCell(infantryVsTank)}`);
    }
    if (!tankVsInfantry?.packet || tankVsInfantry.packet.personnel.killed > 12) {
      throw new Error(`Tank HE should cause bounded personnel losses, not arbitrary percentage deletion. Got ${compactCell(tankVsInfantry!)}`);
    }
    if (!infantryVsInfantry?.packet || infantryVsInfantry.packet.personnel.wounded + infantryVsInfantry.packet.personnel.injured <= infantryVsInfantry.packet.personnel.killed) {
      throw new Error(`Infantry-vs-infantry should primarily injure and wound. Got ${compactCell(infantryVsInfantry!)}`);
    }
    if (infantryVsTank.packet.suppression >= tankVsInfantry.packet.suppression) {
      throw new Error(
        `Small arms should not suppress closed armor more than tank fire suppresses infantry. Infantry ${infantryVsTank.packet.suppression}, tank ${tankVsInfantry.packet.suppression}.`
      );
    }
    if (!assaultGunVsInfantry?.packet || !tankVsInfantry.packet) {
      throw new Error("Missing assault-gun or tank packet for suppression comparison.");
    }
    const assaultHe = unitTypes.Assault_Gun.weaponModel?.groups.find((group) => group.id === "assault-gun-he");
    const tankHe = unitTypes.Light_Tank.weaponModel?.groups.find((group) => group.id === "light-tank-he");
    if (!assaultHe || !tankHe) {
      throw new Error("Missing assault-gun or tank HE weapon group for per-platform balance validation.");
    }
    if ((assaultHe.suppressionPerHit ?? 0) <= (tankHe.suppressionPerHit ?? 0)) {
      throw new Error(
        `Assault-gun HE should suppress more per hit than tank HE. Tank ${tankHe.suppressionPerHit}, assault gun ${assaultHe.suppressionPerHit}.`
      );
    }
    if ((assaultHe.fortificationDamagePerHit ?? 0) <= (tankHe.fortificationDamagePerHit ?? 0)) {
      throw new Error(
        `Assault-gun HE should damage fortifications more per hit than tank HE. Tank ${tankHe.fortificationDamagePerHit}, assault gun ${assaultHe.fortificationDamagePerHit}.`
      );
    }

    const atInfantryVsTank = outcomes.get("AT_Infantry->Light_Tank");
    if (!atInfantryVsTank?.packet || atInfantryVsTank.packet.equipment.damaged + atInfantryVsTank.packet.equipment.disabled + atInfantryVsTank.packet.equipment.destroyed <= 0) {
      throw new Error(`AT infantry should put some equipment damage on light tanks at one hex. Got ${compactCell(atInfantryVsTank!)}`);
    }

    const armoredCarVsInfantry = outcomes.get("Recon_ArmoredCar->Infantry_42");
    if (!armoredCarVsInfantry?.packet || armoredCarVsInfantry.strengthLoss >= infantryVsInfantry.strengthLoss) {
      throw new Error(
        `Armored car fire should harass infantry, not outperform a rifle battalion in one-hex sustained fire. Infantry ${compactCell(infantryVsInfantry!)}, armored car ${compactCell(armoredCarVsInfantry!)}.`
      );
    }

    const groundAttackVsTank = outcomes.get("Ground_Attack->Light_Tank");
    if (!groundAttackVsTank?.packet || groundAttackVsTank.packet.equipment.damaged + groundAttackVsTank.packet.equipment.disabled + groundAttackVsTank.packet.equipment.destroyed <= 0) {
      throw new Error(`Ground-attack aircraft should produce at least some equipment damage on light tanks. Got ${compactCell(groundAttackVsTank!)}`);
    }

    const lightVsHeavy = outcomes.get("Light_Tank->Heavy_Tank");
    const mediumVsHeavy = outcomes.get("Panzer_IV->Heavy_Tank");
    const heavyVsHeavy = outcomes.get("Heavy_Tank->Heavy_Tank");
    const tankDestroyerVsHeavy = outcomes.get("Tank_Destroyer->Heavy_Tank");
    const atGunVsHeavy = outcomes.get("AT_Gun_50mm->Heavy_Tank");
    if (!lightVsHeavy?.packet || lightVsHeavy.packet.equipment.damaged < 1 || lightVsHeavy.packet.equipment.destroyed > 0 || lightVsHeavy.strengthLoss > 5) {
      throw new Error(`Light tanks should barely affect heavy front armor in one live-fire attack. Got ${compactCell(lightVsHeavy!)}`);
    }
    if (!atGunVsHeavy?.packet || atGunVsHeavy.packet.equipment.damaged < 1 || atGunVsHeavy.packet.equipment.disabled > 0 || atGunVsHeavy.packet.equipment.destroyed > 0 || atGunVsHeavy.strengthLoss > 5) {
      throw new Error(`57mm AT guns should scratch but not defeat heavy front armor in one live-fire attack. Got ${compactCell(atGunVsHeavy!)}`);
    }
    if (!mediumVsHeavy?.packet || mediumVsHeavy.packet.equipment.destroyed > 0 || mediumVsHeavy.strengthLoss > 20) {
      throw new Error(`Medium tanks should not wipe heavy tanks frontally in one live-fire attack. Got ${compactCell(mediumVsHeavy!)}`);
    }
    if (!heavyVsHeavy?.packet || heavyVsHeavy.packet.equipment.destroyed > 2 || heavyVsHeavy.strengthLoss > 50) {
      throw new Error(`Heavy tank duels should be severe but not full-formation deletion in one attack. Got ${compactCell(heavyVsHeavy!)}`);
    }
    if (!tankDestroyerVsHeavy?.packet || tankDestroyerVsHeavy.packet.equipment.destroyed > 2 || tankDestroyerVsHeavy.strengthLoss > 60) {
      throw new Error(`Tank destroyers should be dangerous without nearly wiping heavy tanks frontally in one attack. Got ${compactCell(tankDestroyerVsHeavy!)}`);
    }

    const heavySideHex: Axial = { q: defenderHex.q, r: defenderHex.r - 1 };
    const heavyRearHex: Axial = { q: defenderHex.q + 1, r: defenderHex.r };
    const lightVsHeavySide = resolveMatrixOutcome("Light_Tank", "Heavy_Tank", heavySideHex);
    const lightVsHeavyRear = resolveMatrixOutcome("Light_Tank", "Heavy_Tank", heavyRearHex);
    const atGunVsHeavySide = resolveMatrixOutcome("AT_Gun_50mm", "Heavy_Tank", heavySideHex);
    const atGunVsHeavyRear = resolveMatrixOutcome("AT_Gun_50mm", "Heavy_Tank", heavyRearHex);
    if (!lightVsHeavySide.packet || !lightVsHeavyRear.packet || !lightVsHeavySide.scaledAttackResult || !lightVsHeavyRear.scaledAttackResult) {
      throw new Error("Missing light-tank flank armor sanity packets.");
    }
    if (!(lightVsHeavySide.scaledAttackResult.facingArmor < lightVsHeavy.scaledAttackResult!.facingArmor)) {
      throw new Error(`Heavy side armor should be lower than front armor. Front ${lightVsHeavy.scaledAttackResult!.facingArmor}, side ${lightVsHeavySide.scaledAttackResult.facingArmor}.`);
    }
    if (!(lightVsHeavyRear.scaledAttackResult.facingArmor < lightVsHeavySide.scaledAttackResult.facingArmor)) {
      throw new Error(`Heavy rear armor should be lower than side armor. Side ${lightVsHeavySide.scaledAttackResult.facingArmor}, rear ${lightVsHeavyRear.scaledAttackResult.facingArmor}.`);
    }
    if (!(lightVsHeavySide.strengthLoss > lightVsHeavy.strengthLoss && lightVsHeavyRear.strengthLoss > lightVsHeavySide.strengthLoss)) {
      throw new Error(
        `Light tanks should damage heavy tanks more from side/rear than front. Front ${compactCell(lightVsHeavy)}, side ${compactCell(lightVsHeavySide)}, rear ${compactCell(lightVsHeavyRear)}.`
      );
    }
    if (!atGunVsHeavySide.packet || !atGunVsHeavyRear.packet) {
      throw new Error("Missing AT-gun flank armor sanity packets.");
    }
    if (!(atGunVsHeavySide.strengthLoss > atGunVsHeavy!.strengthLoss && atGunVsHeavyRear.strengthLoss > atGunVsHeavySide.strengthLoss)) {
      throw new Error(
        `57mm AT guns should scale by facing against heavy tanks. Front ${compactCell(atGunVsHeavy!)}, side ${compactCell(atGunVsHeavySide)}, rear ${compactCell(atGunVsHeavyRear)}.`
      );
    }

    const bomberVsInfantry = outcomes.get("Bomber->Infantry_42");
    if (!bomberVsInfantry?.packet || bomberVsInfantry.packet.personnel.injured + bomberVsInfantry.packet.personnel.wounded + bomberVsInfantry.packet.personnel.severelyWounded + bomberVsInfantry.packet.personnel.killed <= 0) {
      throw new Error(`Bomber strikes should apply personnel status effects to infantry. Got ${compactCell(bomberVsInfantry!)}`);
    }

    const howitzerVsInfantry = outcomes.get("Howitzer_105->Infantry_42");
    if (
      !howitzerVsInfantry?.packet ||
      howitzerVsInfantry.packet.personnel.killed < 1 ||
      howitzerVsInfantry.packet.personnel.injured +
        howitzerVsInfantry.packet.personnel.wounded +
        howitzerVsInfantry.packet.personnel.severelyWounded < 5
    ) {
      throw new Error(`Landed 105mm HE should produce dead plus several wounded/injured instead of rounding away. Got ${compactCell(howitzerVsInfantry!)}`);
    }

    const atGunVsInfantry = outcomes.get("AT_Gun_50mm->Infantry_42");
    if (!atGunVsInfantry?.packet) {
      throw new Error("Missing 57mm AT-gun HE sanity packet.");
    }
    const howitzerPersonnel =
      howitzerVsInfantry.packet.personnel.killed +
      howitzerVsInfantry.packet.personnel.severelyWounded +
      howitzerVsInfantry.packet.personnel.wounded +
      howitzerVsInfantry.packet.personnel.injured;
    const atGunPersonnel =
      atGunVsInfantry.packet.personnel.killed +
      atGunVsInfantry.packet.personnel.severelyWounded +
      atGunVsInfantry.packet.personnel.wounded +
      atGunVsInfantry.packet.personnel.injured;
    if (!(atGunPersonnel > 0 && howitzerPersonnel >= atGunPersonnel * 2 && howitzerVsInfantry.packet.personnel.killed > atGunVsInfantry.packet.personnel.killed)) {
      throw new Error(`105mm HE should be materially heavier than 57mm HE, while 57mm HE still causes light casualties. 105mm ${compactCell(howitzerVsInfantry)}, 57mm ${compactCell(atGunVsInfantry)}.`);
    }

    const spArtilleryVsSupply = outcomes.get("SP_Artillery->Supply_Truck");
    if (!spArtilleryVsSupply?.packet || spArtilleryVsSupply.packet.equipment.damaged + spArtilleryVsSupply.packet.equipment.disabled + spArtilleryVsSupply.packet.equipment.destroyed <= 0) {
      throw new Error(`Landed HE against soft-skinned logistics should produce equipment damage. Got ${compactCell(spArtilleryVsSupply!)}`);
    }
  });

  await Then("scenario-only tactical definitions still receive realistic status pools", async () => {
    const atInfantry = summarizeFormationStatus(makeUnit("AT_Infantry", defenderHex, "status-at").status, 100);
    const combatEngineer = summarizeFormationStatus(makeUnit("Combat_Engineer", defenderHex, "status-ce").status, 100);

    if (atInfantry.personnel.total !== 770 || atInfantry.equipment.total !== 0) {
      throw new Error(`AT infantry should initialize as a 770-man infantry formation. Got ${atInfantry.personnel.total} personnel and ${atInfantry.equipment.total} equipment.`);
    }
    if (combatEngineer.personnel.total !== 160 || combatEngineer.equipment.total !== 12) {
      throw new Error(`Combat engineers should initialize as 160 personnel plus 12 vehicles/platforms. Got ${combatEngineer.personnel.total} personnel and ${combatEngineer.equipment.total} equipment.`);
    }
  });

  await Then("valid soft-target contacts produce status outcomes for light combat units", async () => {
    const reconVsSupply = outcomes.get("Recon_ArmoredCar->Supply_Truck");
    const engineerVsInfantry = outcomes.get("Engineer->Infantry_42");

    if (!reconVsSupply?.packet || reconVsSupply.packet.personnel.injured + reconVsSupply.packet.personnel.wounded + reconVsSupply.packet.equipment.damaged <= 0) {
      throw new Error(`Armored car contacts against soft-skinned logistics should not vanish. Got ${compactCell(reconVsSupply!)}`);
    }
    if (!engineerVsInfantry?.packet || engineerVsInfantry.packet.personnel.injured + engineerVsInfantry.packet.personnel.wounded <= 0) {
      throw new Error(`Engineer small-arms contacts against infantry should produce at least a light personnel outcome. Got ${compactCell(engineerVsInfantry!)}`);
    }
  });

  await Then("personnel hits become concrete status losses instead of legacy abstract percent damage", async () => {
    const reconAssault = resolveBattlefieldPacket("Recon_Bike", "Infantry_42", {
      stance: "assault",
      commander: { accBonus: 25, dmgBonus: 5 }
    });
    const reconCasualties = personnelCasualtyCount(reconAssault.packet);
    if (reconCasualties < Math.floor(reconAssault.result.expectedHits * 0.45) || reconAssault.packet.readinessLoss <= 1) {
      throw new Error(
        `Recon bike assault hits should not round down to zero-strength damage. Hits ${reconAssault.result.expectedHits.toFixed(1)}, packet ${describeDamagePacket(reconAssault.packet)}.`
      );
    }

    const infantryAssault = resolveBattlefieldPacket("Infantry_42", "Infantry_42", {
      stance: "assault",
      commander: { accBonus: 25, dmgBonus: 5 }
    });
    const rifleHits = infantryAssault.packet.weaponHits.find((hit) => hit.id === "rifle-squads");
    const machineGunHits = infantryAssault.packet.weaponHits.find((hit) => hit.id === "machine-guns");
    if (!rifleHits || !machineGunHits) {
      throw new Error("Missing infantry rifle or machine-gun weapon hit summaries.");
    }
    if (weaponPersonnelCasualtyCount(infantryAssault.packet, "rifle-squads") < Math.floor(rifleHits.expectedHits * 0.85)) {
      throw new Error(`Rifle hits should convert to casualties. ${rifleHits.expectedHits.toFixed(1)} hits produced ${describeDamagePacket(infantryAssault.packet)}.`);
    }
    if (weaponPersonnelCasualtyCount(infantryAssault.packet, "machine-guns") < Math.floor(machineGunHits.expectedHits * 0.85)) {
      throw new Error(`Machine-gun hits should convert to casualties. ${machineGunHits.expectedHits.toFixed(1)} hits produced ${describeDamagePacket(infantryAssault.packet)}.`);
    }
    const bazookaHits = infantryAssault.packet.weaponHits.find((hit) => hit.id === "bazooka-teams");
    if (!bazookaHits || (bazookaHits.expectedHits >= 0.75 && weaponPersonnelCasualtyCount(infantryAssault.packet, "bazooka-teams") <= 0)) {
      throw new Error(`A direct bazooka contact against infantry should not disappear. Got ${bazookaHits?.expectedHits.toFixed(1) ?? "missing"} hits.`);
    }

    const bazookaGroup = unitTypes.Infantry_42.weaponModel?.groups.find((group) => group.id === "bazooka-teams");
    if (!bazookaGroup) {
      throw new Error("Missing infantry bazooka weapon group for direct-contact regression check.");
    }
    const bazookaOnlyDefinition: UnitTypeDefinition = {
      ...unitTypes.Infantry_42,
      weaponModel: {
        doctrine: "Synthetic bazooka-only personnel contact check.",
        groups: [bazookaGroup]
      }
    };
    const bazookaOnlyPacket = resolveDamagePacket({
      attacker: makeUnit("Infantry_42", attackerHex, "bazooka-only-attacker"),
      attackerDefinition: bazookaOnlyDefinition,
      attackerHex,
      defender: makeUnit("Infantry_42", defenderHex, "bazooka-only-defender"),
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: syntheticOneHitAttackResult(2),
      targetFacing: "W"
    });
    if (personnelCasualtyCount(bazookaOnlyPacket) <= 0) {
      throw new Error(`Bazooka-only infantry contacts should produce at least light casualties. Got ${describeDamagePacket(bazookaOnlyPacket)}.`);
    }
  });

  await Then("out-of-ammo defenders take a severe defensive damage penalty", async () => {
    const armedTarget = resolveBattlefieldPacket("Recon_Bike", "Infantry_42", {
      stance: "assault",
      commander: { accBonus: 25, dmgBonus: 5 }
    });
    const dryTarget = resolveBattlefieldPacket("Recon_Bike", "Infantry_42", {
      stance: "assault",
      commander: { accBonus: 25, dmgBonus: 5 },
      defenderAmmo: 0
    });
    if (dryTarget.packet.readinessLoss < armedTarget.packet.readinessLoss * 1.75) {
      throw new Error(
        `Out-of-ammo defenders should be dramatically more vulnerable. Armed ${describeDamagePacket(armedTarget.packet)}, dry ${describeDamagePacket(dryTarget.packet)}.`
      );
    }
  });

  await Then("repeat strikes against an already-damaged target keep translating hits into major status loss", async () => {
    const attacker = makeUnit("Infantry_42", attackerHex, "repeat-inf-atk");
    const defender = makeUnit("Infantry_42", defenderHex, "repeat-inf-def");
    applyDamagePacketToUnit(defender, {
      personnel: { injured: 180, wounded: 40, severelyWounded: 8, killed: 4 },
      equipment: { damaged: 0, disabled: 0, destroyed: 0 },
      suppression: 0,
      fortificationDamage: 0,
      readinessLoss: 0,
      weaponHits: []
    });

    const baseRequest = makeBattlefieldRequest(attacker, defender);
    const firstRequest: AttackRequest = {
      ...baseRequest,
      attacker: {
        ...baseRequest.attacker,
        general: { accBonus: 25, dmgBonus: 5 }
      }
    };
    const firstResult = resolveAttack(firstRequest);
    const firstPacket = resolveDamagePacket({
      attacker,
      attackerDefinition: unitTypes.Infantry_42,
      attackerHex,
      defender,
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: firstResult,
      targetFacing: defender.facing
    });
    applyDamagePacketToUnit(defender, firstPacket);

    const secondRequest: AttackRequest = {
      ...firstRequest,
      defender: {
        ...firstRequest.defender,
        strength: defender.strength
      }
    };
    const secondResult = resolveAttack(secondRequest);
    const secondPacket = resolveDamagePacket({
      attacker,
      attackerDefinition: unitTypes.Infantry_42,
      attackerHex,
      defender,
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: secondResult,
      targetFacing: defender.facing
    });

    if (Math.abs(secondResult.expectedHits - firstResult.expectedHits) > 1) {
      throw new Error(`Expected repeat-hit coverage to stay comparable, saw ${firstResult.expectedHits.toFixed(1)} then ${secondResult.expectedHits.toFixed(1)} hits.`);
    }
    if (secondPacket.readinessLoss < firstPacket.readinessLoss * 0.7) {
      throw new Error(
        `Repeat strikes should not lose most of their applied status damage once a unit is already hurt. First ${describeDamagePacket(firstPacket)}, second ${describeDamagePacket(secondPacket)}.`
      );
    }
  });

  await Then("single direct HE contacts use payload-specific casualty floors", async () => {
    const attacker = makeUnit("Infantry_42", attackerHex, "grenade-attacker");
    const defender = makeUnit("Infantry_42", defenderHex, "grenade-defender");
    const grenadeDefinition: UnitTypeDefinition = {
      ...unitTypes.Infantry_42,
      weaponModel: {
        doctrine: "Synthetic one-contact rifle-grenade check.",
        groups: [
          {
            id: "test-rifle-grenade",
            label: "Rifle grenade contact",
            role: "directHe",
            shots: 1,
            accuracyMultiplier: 1,
            softEffect: {
              injured: 2.2,
              wounded: 1.6,
              severelyWounded: 0.35,
              killed: 0.45,
              maxKilledPerHit: 8,
              maxCasualtiesPerHit: 12,
              blastMultiplier: 0.65,
              casualtyRoundingThreshold: 0.25,
              minimumCasualtiesPerHit: 1,
              minimumWoundedPerHit: 1
            },
            hardEffect: { damaged: 0.04, disabled: 0.01, destroyed: 0.002, armorPenetration: 3, damageType: "explosive" },
            suppressionPerHit: 0.8,
            hitDistribution: {
              vsInfantry: { nonEffect: 0, softComponent: 0, penetrating: 0, areaEffect: 1 },
              vsArmorButtoned: { nonEffect: 0.6, softComponent: 0.3, penetrating: 0.1, areaEffect: 0 },
              vsArtillery: { nonEffect: 0.2, softComponent: 0.35, penetrating: 0.45, areaEffect: 0 }
            }
          }
        ]
      }
    };
    const packet = resolveDamagePacket({
      attacker,
      attackerDefinition: grenadeDefinition,
      attackerHex,
      defender,
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: syntheticOneHitAttackResult(),
      targetFacing: defender.facing,
      effectScalar: 1
    });

    if (packet.personnel.wounded + packet.personnel.severelyWounded + packet.personnel.killed < 1) {
      throw new Error(`A direct rifle-grenade contact should wound at least one exposed soldier. Got ${describeDamagePacket(packet)}.`);
    }
  });

  await Then("missing authored hit distributions still use layered status packets", async () => {
    const attacker = makeUnit("Infantry_42", attackerHex, "default-distribution-attacker");
    const defender = makeUnit("Infantry_42", defenderHex, "default-distribution-defender");
    const defaultDistributionDefinition: UnitTypeDefinition = {
      ...unitTypes.Infantry_42,
      weaponModel: {
        doctrine: "Synthetic one-contact default distribution check.",
        groups: [
          {
            id: "test-default-rifle",
            label: "Default rifle contact",
            role: "smallArms",
            shots: 1,
            accuracyMultiplier: 1,
            softEffect: { injured: 0.65, wounded: 0.28, severelyWounded: 0.04, killed: 0.03 },
            hardEffect: { damaged: 0.002, disabled: 0, destroyed: 0, armorPenetration: 2, damageType: "bullet" },
            suppressionPerHit: 0.01
          }
        ]
      }
    };
    const packet = resolveDamagePacket({
      attacker,
      attackerDefinition: defaultDistributionDefinition,
      attackerHex,
      defender,
      defenderDefinition: unitTypes.Infantry_42,
      defenderHex,
      attackResult: syntheticOneHitAttackResult(),
      targetFacing: defender.facing,
      effectScalar: 1
    });
    const hit = packet.weaponHits.find((entry) => entry.id === "test-default-rifle");

    if (!hit?.hitTypeCounts) {
      throw new Error("Default-distribution weapon should still record layered hit type counts.");
    }
    if (personnelCasualtyCount(packet) <= 0 || packet.readinessLoss <= 0) {
      throw new Error(`Default-distribution weapon should damage status pools, got ${describeDamagePacket(packet)}.`);
    }
  });
});
