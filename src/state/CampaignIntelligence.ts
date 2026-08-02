import { hexDistance } from "../core/Hex";
import type {
  CampaignEnemyContactView,
  CampaignIntelBriefEvent,
  CampaignIntelClaim,
  CampaignIntelOperation,
  CampaignIntelOperationRule,
  CampaignIntelOperationType,
  CampaignIntelSourceReport,
  CampaignIntelligenceBriefing,
  CampaignKnowledgeState,
  CampaignMapViewModel,
  IntelConfidenceBand,
  IntelKnowledgeLevel,
  IntelStrengthBand
} from "../core/campaignIntelTypes";
import { CAMPAIGN_INTEL_SAVE_VERSION } from "../core/campaignIntelTypes";
import type {
  CampaignFactionKey,
  CampaignForceGroup,
  CampaignScenarioData,
  CampaignTileInstance
} from "../core/campaignTypes";

export const INTEL_OPERATION_RULES: Readonly<Record<CampaignIntelOperationType, CampaignIntelOperationRule>> = Object.freeze({
  groundRecon: {
    label: "Ground Recon Patrol",
    shortLabel: "Ground Recon",
    description: "Send scouts through a local sector for strong location and classification reports.",
    durationSegments: 1,
    capacityCost: 1,
    suppliesCost: 15,
    fuelCost: 10,
    targetRadius: 2,
    assetRangeHex: 5,
    requiresAsset: "groundRecon"
  },
  airRecon: {
    label: "Aerial Reconnaissance",
    shortLabel: "Air Recon",
    description: "Photograph a broad area quickly, accepting sortie, interception, and weather risk.",
    durationSegments: 1,
    capacityCost: 2,
    suppliesCost: 10,
    fuelCost: 35,
    targetRadius: 4,
    assetRangeHex: 15,
    requiresAsset: "air"
  },
  verify: {
    label: "Verify Contact",
    shortLabel: "Verify",
    description: "Retask an independent source against a reported contact. Results may remain inconclusive.",
    durationSegments: 1,
    capacityCost: 1,
    suppliesCost: 10,
    fuelCost: 5,
    targetRadius: 1,
    assetRangeHex: 6,
    requiresAsset: "security"
  },
  counterRecon: {
    label: "Counter-Recon Sweep",
    shortLabel: "Counter-Recon",
    description: "Search a sector for hostile observers and degrade the enemy's local picture.",
    durationSegments: 1,
    capacityCost: 1,
    suppliesCost: 20,
    fuelCost: 10,
    targetRadius: 2,
    assetRangeHex: 5,
    requiresAsset: "security"
  },
  opsec: {
    label: "Operational Security",
    shortLabel: "OPSEC",
    description: "Reduce radio and logistics signatures around a friendly concentration for nine hours.",
    durationSegments: 3,
    capacityCost: 1,
    suppliesCost: 10,
    fuelCost: 0,
    targetRadius: 1,
    assetRangeHex: 0,
    requiresAsset: "friendlyForce"
  },
  phantom: {
    label: "Phantom Concentration",
    shortLabel: "Phantom",
    description: "Prepare false radio and logistics signatures that enemy collection may interpret as a force concentration.",
    durationSegments: 2,
    capacityCost: 2,
    suppliesCost: 50,
    fuelCost: 10,
    targetRadius: 2,
    requiresAsset: "none"
  }
});

const KNOWLEDGE_RANK: Record<IntelKnowledgeLevel, number> = {
  unknown: 0,
  reported: 1,
  located: 2,
  identified: 3,
  assessed: 4
};

const ENEMY_FACTION: Record<string, string> = { Player: "Bot", Bot: "Player" };

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function confidenceBand(confidence: number): IntelConfidenceBand {
  if (confidence >= 70) return "high";
  if (confidence >= 40) return "medium";
  return "low";
}

export function knowledgeLevelForConfidence(confidence: number): IntelKnowledgeLevel {
  if (confidence >= 80) return "assessed";
  if (confidence >= 60) return "identified";
  if (confidence >= 40) return "located";
  if (confidence >= 20) return "reported";
  return "unknown";
}

export function axialToOffsetKey(q: number, r: number): string {
  return `${q},${r + Math.floor(q / 2)}`;
}

export function offsetKeyToAxial(key: string): { q: number; r: number } | null {
  const [colText, rowText] = key.split(",");
  const col = Number(colText);
  const row = Number(rowText);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return { q: col, r: row - Math.floor(col / 2) };
}

function tileOwner(scenario: CampaignScenarioData, tile: CampaignTileInstance): CampaignFactionKey {
  return tile.factionControl ?? scenario.tilePalette[tile.tile]?.factionControl ?? "Neutral";
}

function opposingFaction(faction: CampaignFactionKey): CampaignFactionKey {
  return ENEMY_FACTION[String(faction)] ?? (faction === "Player" ? "Bot" : "Player");
}

function forceDomain(unitType: string): CampaignIntelClaim["domain"] {
  const normalized = unitType.toLowerCase();
  if (/fighter|bomber|interceptor|air|plane/.test(normalized)) return "air";
  if (/ship|battleship|destroyer|naval/.test(normalized)) return "naval";
  if (/supply|truck|transport/.test(normalized)) return "logistics";
  return "ground";
}

function forceClassification(forces: readonly CampaignForceGroup[]): string {
  const text = forces.map((force) => force.unitType.toLowerCase()).join(" ");
  if (/heavy_tank|panzer_v|panzer_iv|tank/.test(text)) return "Armored formation";
  if (/rocket|artillery|howitzer/.test(text)) return "Artillery formation";
  if (/fighter|bomber|interceptor|plane/.test(text)) return "Air formation";
  if (/ship|battleship|destroyer/.test(text)) return "Naval force";
  if (/supply|truck|transport/.test(text)) return "Logistics column";
  if (/infantry|recon/.test(text)) return "Infantry formation";
  return "Ground formation";
}

function strengthBandForCount(count: number): IntelStrengthBand {
  if (count <= 1) return "trace";
  if (count <= 3) return "light";
  if (count <= 6) return "moderate";
  if (count <= 10) return "heavy";
  return "massed";
}

function totalForceCount(forces: readonly CampaignForceGroup[]): number {
  return forces.reduce((sum, force) => sum + Math.max(0, force.count), 0);
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicVariation(seed: number, span: number): number {
  const mixed = Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0;
  return (mixed % (span * 2 + 1)) - span;
}

function nextId(state: CampaignKnowledgeState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}-${String(state.faction).toLowerCase()}-${state.nextId}`;
}

function contactLabel(contact: CampaignEnemyContactView): string {
  if (contact.level === "reported") return `${contact.domain === "unknown" ? "Enemy" : contact.domain} activity reported`;
  if (contact.level === "located") return `${contact.domain === "unknown" ? "Enemy" : contact.domain} force located`;
  return contact.classificationBand ?? `${contact.domain === "unknown" ? "Enemy" : contact.domain} formation`;
}

function contactNote(level: IntelKnowledgeLevel, sourceLabel: string): string {
  switch (level) {
    case "assessed":
      return `Multiple details assessed from ${sourceLabel}. Conditions may change after observation.`;
    case "identified":
      return `Likely classification derived from ${sourceLabel}; exact strength remains uncertain.`;
    case "located":
      return `Location is usable for planning, but classification is incomplete.`;
    default:
      return `Uncorroborated activity from ${sourceLabel}; collect another source before committing.`;
  }
}

function createBriefEvent(
  state: CampaignKnowledgeState,
  segment: number,
  kind: CampaignIntelBriefEvent["kind"],
  title: string,
  detail: string,
  contactId?: string,
  operationId?: string
): void {
  state.briefEvents.push({
    id: nextId(state, "brief"),
    segment,
    kind,
    title,
    detail,
    contactId,
    operationId,
    read: false
  });
  if (state.briefEvents.length > 80) state.briefEvents.splice(0, state.briefEvents.length - 80);
}

function reportForTile(
  state: CampaignKnowledgeState,
  tile: CampaignTileInstance,
  forces: readonly CampaignForceGroup[],
  sourceType: CampaignIntelSourceReport["sourceType"],
  sourceLabel: string,
  segment: number,
  reliability: number,
  radius: number,
  sourceAssetKey?: string
): CampaignIntelSourceReport {
  const locationHexKey = axialToOffsetKey(tile.hex.q, tile.hex.r);
  const domains = new Set(forces.map((force) => forceDomain(force.unitType)));
  const domain = domains.size === 1 ? Array.from(domains)[0] : "ground";
  const truthEntityKey = `force:${locationHexKey}`;
  return {
    id: nextId(state, "report"),
    observerFaction: state.faction,
    sourceType,
    sourceLabel,
    sourceAssetKey,
    observedSegment: segment,
    receivedSegment: segment,
    reliability: clamp(reliability),
    correlationKeys: [truthEntityKey],
    claims: [{
      subjectKind: "force",
      locationHexKey,
      uncertaintyRadius: radius,
      domain,
      classificationBand: forceClassification(forces),
      strengthBand: strengthBandForCount(totalForceCount(forces)),
      readinessBand: reliability >= 80 ? "ready" : undefined,
      supplyBand: reliability >= 85 ? "adequate" : undefined,
      movementState: "stationary",
      truthEntityKey
    }]
  };
}

function fuseReport(state: CampaignKnowledgeState, report: CampaignIntelSourceReport): void {
  state.sourceReports.push(structuredClone(report));
  if (state.sourceReports.length > 240) state.sourceReports.splice(0, state.sourceReports.length - 240);

  for (const claim of report.claims) {
    const correlationKey = claim.truthEntityKey ?? report.correlationKeys[0];
    let contact = state.contacts.find((candidate) =>
      correlationKey ? candidate.truthEntityKey === correlationKey : candidate.locationHexKey === claim.locationHexKey
    );
    const priorLevel = contact?.level ?? "unknown";
    const independentSource = contact ? !contact.sourceLabels.includes(report.sourceLabel) : true;
    const confidenceGain = Math.round(report.reliability * (independentSource ? 0.72 : 0.45));

    if (!contact) {
      const confidence = clamp(Math.max(20, confidenceGain));
      const level = knowledgeLevelForConfidence(confidence);
      contact = {
        id: nextId(state, "contact"),
        observerFaction: state.faction,
        subjectKind: claim.subjectKind,
        level,
        state: "current",
        confidence,
        locationHexKey: claim.locationHexKey,
        uncertaintyRadius: Math.max(0, claim.uncertaintyRadius),
        domain: claim.domain ?? "unknown",
        classificationBand: level === "identified" || level === "assessed" ? claim.classificationBand : undefined,
        strengthBand: level === "identified" || level === "assessed" ? claim.strengthBand : undefined,
        readinessBand: level === "assessed" ? claim.readinessBand : undefined,
        supplyBand: level === "assessed" ? claim.supplyBand : undefined,
        movementState: claim.movementState,
        movementDirection: claim.movementDirection,
        lastObservedSegment: report.observedSegment,
        lastUpdatedSegment: report.receivedSegment,
        sourceReportIds: [report.id],
        sourceLabels: [report.sourceLabel],
        analystNotes: [contactNote(level, report.sourceLabel)],
        truthEntityKey: correlationKey
      };
      state.contacts.push(contact);
      createBriefEvent(state, report.receivedSegment, "new", "New enemy contact", `${contact.classificationBand ?? "Activity"} reported near ${contact.locationHexKey}.`, contact.id);
      continue;
    }

    const conflictingLocation = contact.locationHexKey !== claim.locationHexKey && report.reliability < contact.confidence;
    if (conflictingLocation) {
      contact.state = "disputed";
      contact.confidence = clamp(contact.confidence - 12);
      contact.analystNotes.unshift(`Conflicting ${report.sourceLabel} report places activity near ${claim.locationHexKey}.`);
      createBriefEvent(state, report.receivedSegment, "disputed", "Contact disputed", `Reports conflict around ${contact.locationHexKey}.`, contact.id);
    } else {
      contact.locationHexKey = claim.locationHexKey;
      contact.uncertaintyRadius = Math.min(contact.uncertaintyRadius, Math.max(0, claim.uncertaintyRadius));
      contact.confidence = clamp(Math.max(contact.confidence, confidenceGain) + (independentSource ? 8 : 2));
      contact.state = "current";
    }
    contact.level = knowledgeLevelForConfidence(contact.confidence);
    contact.domain = claim.domain ?? contact.domain;
    if (KNOWLEDGE_RANK[contact.level] >= KNOWLEDGE_RANK.identified) {
      contact.classificationBand = claim.classificationBand ?? contact.classificationBand;
      contact.strengthBand = claim.strengthBand ?? contact.strengthBand;
    }
    if (contact.level === "assessed") {
      contact.readinessBand = claim.readinessBand ?? contact.readinessBand;
      contact.supplyBand = claim.supplyBand ?? contact.supplyBand;
    }
    contact.movementState = claim.movementState ?? contact.movementState;
    contact.movementDirection = claim.movementDirection ?? contact.movementDirection;
    contact.lastObservedSegment = Math.max(contact.lastObservedSegment, report.observedSegment);
    contact.lastUpdatedSegment = report.receivedSegment;
    if (!contact.sourceReportIds.includes(report.id)) contact.sourceReportIds.push(report.id);
    if (!contact.sourceLabels.includes(report.sourceLabel)) contact.sourceLabels.push(report.sourceLabel);
    contact.analystNotes.unshift(contactNote(contact.level, report.sourceLabel));
    contact.analystNotes = contact.analystNotes.slice(0, 4);

    if (KNOWLEDGE_RANK[contact.level] > KNOWLEDGE_RANK[priorLevel]) {
      createBriefEvent(state, report.receivedSegment, "upgraded", "Contact upgraded", `${contact.locationHexKey} is now ${contact.level}.`, contact.id);
    }
  }
}

function friendlyTiles(scenario: CampaignScenarioData, faction: CampaignFactionKey): CampaignTileInstance[] {
  return scenario.tiles.filter((tile) => tileOwner(scenario, tile) === faction);
}

function enemyForceTiles(scenario: CampaignScenarioData, faction: CampaignFactionKey): CampaignTileInstance[] {
  const enemy = opposingFaction(faction);
  return scenario.tiles.filter((tile) => tileOwner(scenario, tile) === enemy && (tile.forces?.length ?? 0) > 0);
}

function isReconUnit(unitType: string): boolean {
  return /recon|scout|armoredcar|bike/i.test(unitType);
}

function isAirUnit(unitType: string): boolean {
  return /fighter|bomber|interceptor|plane|air/i.test(unitType);
}

function isSecurityUnit(unitType: string): boolean {
  return /recon|scout|infantry|engineer|armoredcar|bike/i.test(unitType);
}

function tileHasMatchingAsset(tile: CampaignTileInstance, predicate: (unitType: string) => boolean): CampaignForceGroup | null {
  return tile.forces?.find((force) => force.count > 0 && predicate(force.unitType)) ?? null;
}

export function calculateIntelCapacity(scenario: CampaignScenarioData, faction: CampaignFactionKey): number {
  let total = 2;
  for (const tile of friendlyTiles(scenario, faction)) {
    const definition = scenario.tilePalette[tile.tile];
    if (definition?.role === "intelNode") total += 2;
    if (definition?.role === "airbase" || definition?.role === "navalBase" || definition?.role === "logisticsHub") total += 1;
    for (const force of tile.forces ?? []) {
      if (isReconUnit(force.unitType)) total += Math.min(2, force.count);
      else if (/scout_plane/i.test(force.unitType)) total += Math.min(2, force.count);
    }
  }
  return Math.max(2, Math.min(12, total));
}

export function createCampaignKnowledgeState(
  scenario: CampaignScenarioData,
  faction: CampaignFactionKey,
  segment: number
): CampaignKnowledgeState {
  const state: CampaignKnowledgeState = {
    version: CAMPAIGN_INTEL_SAVE_VERSION,
    faction,
    contacts: [],
    sourceReports: [],
    operations: [],
    briefEvents: [],
    capacityTotal: calculateIntelCapacity(scenario, faction),
    lastResolvedSegment: segment,
    nextId: 0
  };

  const friendlies = friendlyTiles(scenario, faction).filter((tile) => (tile.forces?.length ?? 0) > 0);
  for (const enemyTile of enemyForceTiles(scenario, faction)) {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestObserver: CampaignTileInstance | null = null;
    for (const friendly of friendlies) {
      const distance = hexDistance(friendly.hex, enemyTile.hex);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestObserver = friendly;
      }
    }
    const frontDistance = scenario.fronts.reduce((best, front) => {
      for (const key of front.hexKeys) {
        const axial = offsetKeyToAxial(key);
        if (axial) best = Math.min(best, hexDistance(axial, enemyTile.hex));
      }
      return best;
    }, Number.POSITIVE_INFINITY);

    if (bestObserver && bestDistance <= 1) {
      const report = reportForTile(state, enemyTile, enemyTile.forces ?? [], "directContact", "Front-line observation", segment, 92, 0);
      fuseReport(state, report);
    } else if (bestObserver && bestDistance <= 3 && tileHasMatchingAsset(bestObserver, isReconUnit)) {
      const report = reportForTile(state, enemyTile, enemyTile.forces ?? [], "groundRecon", "Forward reconnaissance", segment, 72, 1);
      fuseReport(state, report);
    } else if (frontDistance <= 2) {
      const report = reportForTile(state, enemyTile, enemyTile.forces ?? [], "historicalBrief", "Theater briefing", segment, 38, 2);
      fuseReport(state, report);
    }
  }

  state.briefEvents.forEach((event) => { event.read = true; });
  return state;
}

export function getCommittedCapacity(state: CampaignKnowledgeState): number {
  return state.operations
    .filter((operation) => operation.status === "planned" || operation.status === "active")
    .reduce((sum, operation) => sum + operation.capacityCommitted, 0);
}

export function findEligibleIntelAssets(
  scenario: CampaignScenarioData,
  faction: CampaignFactionKey,
  type: CampaignIntelOperationType
): Array<{ assetKey: string; label: string; hexKey: string }> {
  const rule = INTEL_OPERATION_RULES[type];
  if (rule.requiresAsset === "none") return [];
  const result: Array<{ assetKey: string; label: string; hexKey: string }> = [];
  for (const tile of friendlyTiles(scenario, faction)) {
    const hexKey = axialToOffsetKey(tile.hex.q, tile.hex.r);
    for (const force of tile.forces ?? []) {
      const eligible =
        rule.requiresAsset === "groundRecon" ? isReconUnit(force.unitType) :
        rule.requiresAsset === "air" ? isAirUnit(force.unitType) :
        rule.requiresAsset === "security" ? isSecurityUnit(force.unitType) :
        rule.requiresAsset === "friendlyForce";
      if (!eligible || force.count <= 0) continue;
      result.push({
        assetKey: `${hexKey}:${force.unitType}`,
        label: `${force.unitType.replace(/_/g, " ")} at ${hexKey}`,
        hexKey
      });
    }
  }
  return result;
}

export function isIntelAssetInRange(
  assetHexKey: string,
  targetHexKey: string,
  type: CampaignIntelOperationType
): boolean {
  const range = INTEL_OPERATION_RULES[type].assetRangeHex;
  if (range === undefined) return true;
  const asset = offsetKeyToAxial(assetHexKey);
  const target = offsetKeyToAxial(targetHexKey);
  return Boolean(asset && target && hexDistance(asset, target) <= range);
}

function hasActiveOpsec(knowledge: CampaignKnowledgeState, targetHexKey: string, segment: number): boolean {
  const target = offsetKeyToAxial(targetHexKey);
  if (!target) return false;
  return knowledge.operations.some((operation) => {
    if (operation.type !== "opsec" || operation.status !== "active" || operation.resolveSegment < segment) return false;
    const center = offsetKeyToAxial(operation.targetHexKey);
    return Boolean(center && hexDistance(center, target) <= INTEL_OPERATION_RULES.opsec.targetRadius);
  });
}

function decayContacts(state: CampaignKnowledgeState, segment: number): void {
  for (const contact of state.contacts) {
    if (contact.level === "unknown") continue;
    const age = Math.max(0, segment - contact.lastObservedSegment);
    if (age <= 0) continue;
    const mobile = contact.subjectKind === "force";
    const decay = mobile ? 12 : 5;
    const previousLevel = contact.level;
    contact.confidence = clamp(contact.confidence - decay);
    contact.level = knowledgeLevelForConfidence(contact.confidence);
    contact.lastUpdatedSegment = segment;
    if (mobile) contact.uncertaintyRadius = Math.min(6, contact.uncertaintyRadius + 1);
    if (contact.level === "unknown") contact.state = "lost";
    else if (age >= 2) contact.state = "stale";
    if (KNOWLEDGE_RANK[contact.level] < KNOWLEDGE_RANK[previousLevel]) {
      createBriefEvent(state, segment, "downgraded", "Contact confidence fell", `${contact.locationHexKey} degraded from ${previousLevel} to ${contact.level}.`, contact.id);
    } else if (contact.state === "stale" && age === 2) {
      createBriefEvent(state, segment, "stale", "Contact is stale", `No fresh observation near ${contact.locationHexKey}.`, contact.id);
    }
  }
}

function collectPassiveReports(
  scenario: CampaignScenarioData,
  state: CampaignKnowledgeState,
  enemyState: CampaignKnowledgeState,
  segment: number
): CampaignIntelSourceReport[] {
  const reports: CampaignIntelSourceReport[] = [];
  const enemies = enemyForceTiles(scenario, state.faction);
  for (const observer of friendlyTiles(scenario, state.faction)) {
    if ((observer.forces?.length ?? 0) === 0) continue;
    const reconAsset = tileHasMatchingAsset(observer, isReconUnit);
    const radius = reconAsset ? 3 : 1;
    for (const enemyTile of enemies) {
      const distance = hexDistance(observer.hex, enemyTile.hex);
      if (distance > radius) continue;
      const enemyHex = axialToOffsetKey(enemyTile.hex.q, enemyTile.hex.r);
      const opsecPenalty = hasActiveOpsec(enemyState, enemyHex, segment) ? 24 : 0;
      const reliability = (reconAsset ? 78 : 92) - distance * 8 - opsecPenalty;
      reports.push(reportForTile(
        state,
        enemyTile,
        enemyTile.forces ?? [],
        reconAsset ? "groundRecon" : "directContact",
        reconAsset ? "Recon screen" : "Front-line observation",
        segment,
        reliability,
        Math.max(0, distance - 1),
        reconAsset ? `${axialToOffsetKey(observer.hex.q, observer.hex.r)}:${reconAsset.unitType}` : undefined
      ));
    }
  }
  return reports;
}

function tilesInRadius(scenario: CampaignScenarioData, centerHexKey: string, radius: number): CampaignTileInstance[] {
  const center = offsetKeyToAxial(centerHexKey);
  if (!center) return [];
  return scenario.tiles.filter((tile) => hexDistance(center, tile.hex) <= radius);
}

function resolveCollectionOperation(
  scenario: CampaignScenarioData,
  state: CampaignKnowledgeState,
  operation: CampaignIntelOperation,
  segment: number
): CampaignIntelSourceReport[] {
  const rule = INTEL_OPERATION_RULES[operation.type];
  const enemy = opposingFaction(state.faction);
  const candidateTiles = tilesInRadius(scenario, operation.targetHexKey, rule.targetRadius)
    .filter((tile) => tileOwner(scenario, tile) === enemy && (tile.forces?.length ?? 0) > 0);
  const reports: CampaignIntelSourceReport[] = [];
  const variation = deterministicVariation(operation.seed, 8);
  const source = operation.type === "airRecon" ? "airRecon" : operation.type === "verify" ? "groundRecon" : "groundRecon";
  const label = operation.type === "airRecon" ? "Aerial photo interpretation" : operation.type === "verify" ? "Independent verification patrol" : "Ground reconnaissance patrol";
  const baseReliability = operation.type === "airRecon" ? 72 : operation.type === "verify" ? 84 : 80;
  for (const tile of candidateTiles) {
    const distance = hexDistance(offsetKeyToAxial(operation.targetHexKey)!, tile.hex);
    reports.push(reportForTile(
      state,
      tile,
      tile.forces ?? [],
      source,
      label,
      segment,
      baseReliability + variation - distance * 5,
      operation.type === "airRecon" ? Math.max(0, Math.floor(distance / 2)) : Math.max(0, distance - 1),
      operation.assignedAssetKey
    ));
  }
  return reports;
}

function degradeEnemyKnowledgeInArea(
  enemyState: CampaignKnowledgeState,
  targetHexKey: string,
  radius: number,
  segment: number
): number {
  const center = offsetKeyToAxial(targetHexKey);
  if (!center) return 0;
  let affected = 0;
  for (const contact of enemyState.contacts) {
    const location = offsetKeyToAxial(contact.locationHexKey);
    if (!location || hexDistance(center, location) > radius || contact.level === "unknown") continue;
    contact.confidence = clamp(contact.confidence - 20);
    contact.level = knowledgeLevelForConfidence(contact.confidence);
    contact.state = contact.level === "unknown" ? "lost" : "disputed";
    contact.uncertaintyRadius = Math.min(6, contact.uncertaintyRadius + 1);
    contact.lastUpdatedSegment = segment;
    affected += 1;
  }
  return affected;
}

function enemyCanObserveDeception(
  scenario: CampaignScenarioData,
  enemyState: CampaignKnowledgeState,
  targetHexKey: string
): boolean {
  const target = offsetKeyToAxial(targetHexKey);
  if (!target) return false;
  const enemy = enemyState.faction;
  if (friendlyTiles(scenario, enemy).some((tile) => (tile.forces?.length ?? 0) > 0 && hexDistance(tile.hex, target) <= 5)) return true;
  return enemyState.contacts.some((contact) => {
    const location = offsetKeyToAxial(contact.locationHexKey);
    return Boolean(location && contact.level !== "unknown" && hexDistance(location, target) <= 4);
  });
}

function resolveOperationsForFaction(
  scenario: CampaignScenarioData,
  state: CampaignKnowledgeState,
  enemyState: CampaignKnowledgeState,
  segment: number
): void {
  for (const operation of state.operations) {
    if (operation.status === "planned" && operation.startSegment <= segment) operation.status = "active";
    if (operation.status !== "active" || operation.resolveSegment > segment) continue;

    let reports: CampaignIntelSourceReport[] = [];
    if (operation.type === "groundRecon" || operation.type === "airRecon" || operation.type === "verify") {
      reports = resolveCollectionOperation(scenario, state, operation, segment);
      reports.forEach((report) => fuseReport(state, report));
      operation.status = reports.length > 0 ? "complete" : "partial";
      operation.publicOutcome = reports.length > 0
        ? { summary: "Collection complete", detail: `${reports.length} usable report${reports.length === 1 ? "" : "s"} received.`, reportsProduced: reports.length }
        : { summary: "No usable observation", detail: "The assigned source found no corroborated enemy activity in the target area.", reportsProduced: 0 };
    } else if (operation.type === "counterRecon") {
      const affected = degradeEnemyKnowledgeInArea(enemyState, operation.targetHexKey, INTEL_OPERATION_RULES.counterRecon.targetRadius, segment);
      operation.status = affected > 0 ? "complete" : "partial";
      operation.publicOutcome = {
        summary: affected > 0 ? "Enemy collection disrupted" : "Sweep completed",
        detail: affected > 0 ? "Hostile observation quality in the sector was degraded." : "No hostile observer was confirmed.",
        reportsProduced: 0
      };
    } else if (operation.type === "phantom") {
      const observed = enemyCanObserveDeception(scenario, enemyState, operation.targetHexKey);
      if (observed) {
        const syntheticKey = `deception:${operation.id}`;
        const report: CampaignIntelSourceReport = {
          id: nextId(enemyState, "report"),
          observerFaction: enemyState.faction,
          sourceType: "deception",
          sourceLabel: "Uncorroborated logistics and radio traffic",
          observedSegment: segment,
          receivedSegment: segment,
          reliability: 58 + deterministicVariation(operation.seed, 7),
          correlationKeys: [syntheticKey],
          claims: [{
            subjectKind: "force",
            locationHexKey: operation.targetHexKey,
            uncertaintyRadius: 2,
            domain: "ground",
            classificationBand: "Possible armored concentration",
            strengthBand: "heavy",
            movementState: "preparing",
            truthEntityKey: syntheticKey,
            synthetic: true
          }]
        };
        fuseReport(enemyState, report);
      }
      operation.status = observed ? "complete" : "partial";
      operation.publicOutcome = observed
        ? { summary: "False signatures projected", detail: "The deception story is active. Enemy reaction remains unconfirmed until observed.", reportsProduced: 0 }
        : { summary: "Projection completed", detail: "No evidence yet shows that hostile collection acquired the false signatures.", reportsProduced: 0 };
    } else if (operation.type === "opsec") {
      operation.status = "complete";
      operation.publicOutcome = { summary: "OPSEC cycle complete", detail: "The protected force reduced its observable signature for nine hours.", reportsProduced: 0 };
    }

    if (operation.publicOutcome) {
      createBriefEvent(state, segment, "operation", operation.publicOutcome.summary, operation.publicOutcome.detail, undefined, operation.id);
    }
  }
}

export function resolveCampaignIntelligenceSegment(
  scenario: CampaignScenarioData,
  knowledgeByFaction: Record<string, CampaignKnowledgeState>,
  segment: number
): Record<string, CampaignKnowledgeState> {
  const result: Record<string, CampaignKnowledgeState> = {};
  for (const [faction, state] of Object.entries(knowledgeByFaction)) {
    const cloned = structuredClone(state);
    cloned.version = CAMPAIGN_INTEL_SAVE_VERSION;
    cloned.capacityTotal = calculateIntelCapacity(scenario, faction);
    decayContacts(cloned, segment);
    result[faction] = cloned;
  }

  const factions = Object.keys(result);
  for (const faction of factions) {
    const state = result[faction];
    const enemyState = result[String(opposingFaction(faction))];
    if (!enemyState) continue;
    collectPassiveReports(scenario, state, enemyState, segment).forEach((report) => fuseReport(state, report));
  }
  for (const faction of factions) {
    const state = result[faction];
    const enemyState = result[String(opposingFaction(faction))];
    if (!enemyState) continue;
    resolveOperationsForFaction(scenario, state, enemyState, segment);
    state.lastResolvedSegment = segment;
  }
  return result;
}

export function createIntelOperation(
  state: CampaignKnowledgeState,
  type: CampaignIntelOperationType,
  targetHexKey: string,
  segment: number,
  assignedAssetKey?: string,
  targetContactId?: string
): CampaignIntelOperation {
  const rule = INTEL_OPERATION_RULES[type];
  const id = nextId(state, "intel-op");
  return {
    id,
    faction: state.faction,
    type,
    status: "planned",
    targetHexKey,
    targetContactId,
    assignedAssetKey,
    capacityCommitted: rule.capacityCost,
    suppliesCost: rule.suppliesCost,
    fuelCost: rule.fuelCost,
    startSegment: segment,
    resolveSegment: segment + rule.durationSegments,
    seed: hashSeed(`${id}:${segment}:${targetHexKey}`),
    publicOutcome: null
  };
}

function classificationVisible(level: IntelKnowledgeLevel): boolean {
  return level === "identified" || level === "assessed";
}

export function projectEnemyContact(contact: CampaignKnowledgeState["contacts"][number], segment: number): CampaignEnemyContactView | null {
  if (contact.level === "unknown" || contact.state === "lost") return null;
  const view: CampaignEnemyContactView = {
    id: contact.id,
    subjectKind: contact.subjectKind,
    level: contact.level,
    state: contact.state,
    confidenceBand: confidenceBand(contact.confidence),
    locationHexKey: contact.locationHexKey,
    uncertaintyRadius: contact.uncertaintyRadius,
    domain: contact.domain,
    label: "",
    classificationBand: classificationVisible(contact.level) ? contact.classificationBand : undefined,
    strengthBand: classificationVisible(contact.level) ? contact.strengthBand : undefined,
    readinessBand: contact.level === "assessed" ? contact.readinessBand : undefined,
    supplyBand: contact.level === "assessed" ? contact.supplyBand : undefined,
    movementState: contact.movementState,
    movementDirection: contact.movementDirection,
    lastObservedSegment: contact.lastObservedSegment,
    ageSegments: Math.max(0, segment - contact.lastObservedSegment),
    sourceLabels: [...contact.sourceLabels],
    analystNotes: [...contact.analystNotes]
  };
  view.label = contactLabel(view);
  return view;
}

function coverageForFaction(scenario: CampaignScenarioData, faction: CampaignFactionKey): CampaignMapViewModel["coverage"] {
  const values = new Map<string, "screened" | "observed" | "priority">();
  for (const tile of friendlyTiles(scenario, faction)) {
    if ((tile.forces?.length ?? 0) === 0) continue;
    const radius = tileHasMatchingAsset(tile, isReconUnit) ? 3 : 1;
    for (const candidate of scenario.tiles) {
      const distance = hexDistance(tile.hex, candidate.hex);
      if (distance > radius) continue;
      const key = axialToOffsetKey(candidate.hex.q, candidate.hex.r);
      const strength = distance === 0 ? "priority" : radius >= 3 ? "observed" : "screened";
      const previous = values.get(key);
      if (!previous || (previous === "screened" && strength !== "screened") || strength === "priority") values.set(key, strength);
    }
  }
  return Array.from(values, ([hexKey, strength]) => ({ hexKey, strength }));
}

export function buildCampaignMapView(
  scenario: CampaignScenarioData,
  state: CampaignKnowledgeState,
  segment: number
): CampaignMapViewModel {
  const sanitized = structuredClone(scenario);
  for (const tile of sanitized.tiles) {
    if (tileOwner(sanitized, tile) !== state.faction) {
      tile.forces = [];
    }
  }
  for (const definition of Object.values(sanitized.tilePalette)) {
    if (definition.factionControl !== state.faction) definition.forces = [];
  }
  sanitized.economies = sanitized.economies.filter((economy) => economy.faction === state.faction);
  const contacts = state.contacts
    .map((contact) => projectEnemyContact(contact, segment))
    .filter((contact): contact is CampaignEnemyContactView => contact !== null)
    .sort((a, b) => b.lastObservedSegment - a.lastObservedSegment);
  const committed = getCommittedCapacity(state);
  return {
    observerFaction: state.faction,
    scenario: sanitized,
    enemyContacts: contacts,
    coverage: coverageForFaction(scenario, state.faction),
    capacity: {
      total: state.capacityTotal,
      committed,
      available: Math.max(0, state.capacityTotal - committed)
    },
    unreadReportCount: state.briefEvents.filter((event) => !event.read).length,
    currentSegment: segment
  };
}

function resistanceFromContacts(contacts: CampaignEnemyContactView[]): CampaignIntelligenceBriefing["resistanceBand"] {
  if (contacts.length === 0) return "unknown";
  const score: Record<IntelStrengthBand, number> = { trace: 1, light: 2, moderate: 4, heavy: 7, massed: 11 };
  const total = contacts.reduce((sum, contact) => sum + (contact.strengthBand ? score[contact.strengthBand] : 2), 0);
  if (total <= 2) return "light";
  if (total <= 6) return "comparable";
  if (total <= 10) return "heavy";
  return "overwhelming";
}

export function buildIntelligenceBriefing(
  state: CampaignKnowledgeState,
  battleHexKey: string,
  segment: number
): CampaignIntelligenceBriefing {
  const center = offsetKeyToAxial(battleHexKey);
  const contacts = state.contacts
    .map((contact) => projectEnemyContact(contact, segment))
    .filter((contact): contact is CampaignEnemyContactView => {
      if (!contact || !center) return false;
      const location = offsetKeyToAxial(contact.locationHexKey);
      return Boolean(location && hexDistance(center, location) <= 2 + contact.uncertaintyRadius);
    });
  const resistanceBand = resistanceFromContacts(contacts);
  const averageConfidence = contacts.length > 0
    ? contacts.reduce((sum, contact) => sum + (contact.confidenceBand === "high" ? 80 : contact.confidenceBand === "medium" ? 55 : 25), 0) / contacts.length
    : 15;
  const briefingConfidence = confidenceBand(averageConfidence);
  const summary = resistanceBand === "unknown"
    ? "Enemy strength is unknown. No current source adequately covers the battle area."
    : `Enemy resistance is assessed as ${resistanceBand}, with ${briefingConfidence} confidence.`;
  return {
    observerFaction: state.faction,
    generatedSegment: segment,
    battleHexKey,
    confidenceBand: briefingConfidence,
    resistanceBand,
    summary,
    contacts: contacts.map((contact) => ({
      contactId: contact.id,
      label: contact.label,
      level: contact.level,
      confidenceBand: contact.confidenceBand,
      strengthBand: contact.strengthBand,
      locationHexKey: contact.locationHexKey,
      uncertaintyRadius: contact.uncertaintyRadius,
      ageSegments: contact.ageSegments
    })),
    explicitUnknowns: contacts.length === 0
      ? ["Defender strength", "Reserve locations", "Readiness and supply"]
      : [
          ...(contacts.every((contact) => !contact.readinessBand) ? ["Defender readiness"] : []),
          ...(contacts.every((contact) => !contact.supplyBand) ? ["Defender supply state"] : []),
          "Unobserved reserves outside the collection area"
        ]
  };
}

export function scheduleBaselineBotOperation(
  scenario: CampaignScenarioData,
  state: CampaignKnowledgeState,
  segment: number
): CampaignIntelOperation | null {
  if (getCommittedCapacity(state) >= state.capacityTotal) return null;
  if (state.operations.some((operation) => operation.status === "planned" || operation.status === "active")) return null;
  const stale = state.contacts.find((contact) => contact.state === "stale" || contact.state === "disputed");
  let targetHexKey = stale?.locationHexKey;
  if (!targetHexKey) {
    const enemyObjective = scenario.objectives.find((objective) => objective.owner !== state.faction);
    targetHexKey = enemyObjective
      ? axialToOffsetKey(enemyObjective.hex.q, enemyObjective.hex.r)
      : scenario.fronts[0]?.hexKeys[0];
  }
  if (!targetHexKey) return null;
  let type: CampaignIntelOperationType = stale ? "verify" : "groundRecon";
  let assets = findEligibleIntelAssets(scenario, state.faction, type)
    .filter((asset) => isIntelAssetInRange(asset.hexKey, targetHexKey, type));
  if (assets.length === 0) {
    type = "phantom";
    assets = [];
  }
  const rule = INTEL_OPERATION_RULES[type];
  if (getCommittedCapacity(state) + rule.capacityCost > state.capacityTotal) return null;
  return createIntelOperation(state, type, targetHexKey, segment, assets[0]?.assetKey, stale?.id);
}

/**
 * Converts first-hand combat observations into a high-reliability source report. The report still
 * contains bands rather than exact force counts, and it is fused only into the observer's picture.
 */
export function recordBattlefieldIntelligence(
  scenario: CampaignScenarioData,
  knowledge: CampaignKnowledgeState,
  battleHexKey: string,
  segment: number
): CampaignKnowledgeState {
  const state = structuredClone(knowledge);
  const center = offsetKeyToAxial(battleHexKey);
  if (!center) return state;

  const observed = enemyForceTiles(scenario, state.faction)
    .filter((tile) => hexDistance(center, tile.hex) <= 1);
  for (const tile of observed) {
    fuseReport(state, reportForTile(
      state,
      tile,
      tile.forces ?? [],
      "battleReport",
      "After-action and prisoner reports",
      segment,
      94,
      0
    ));
  }

  createBriefEvent(
    state,
    segment,
    "operation",
    "Battlefield intelligence received",
    observed.length > 0
      ? `${observed.length} enemy formation report${observed.length === 1 ? "" : "s"} entered the operational picture near ${battleHexKey}.`
      : `No enemy formation could be corroborated after the action near ${battleHexKey}.`
  );
  return state;
}
