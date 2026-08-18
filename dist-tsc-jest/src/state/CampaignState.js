import { hexDistance } from "../core/Hex";
import { getTransportMode } from "../data/transportModes";
import { buildEngagementContext } from "../game/campaign/EngagementContextBuilder";
import { INTEL_OPERATION_RULES, buildCampaignMapView, buildIntelligenceBriefing, calculateIntelCapacity, createCampaignKnowledgeState, createIntelOperation, findEligibleIntelAssets, getCommittedCapacity, isIntelAssetInRange, recordBattlefieldIntelligence, resolveCampaignIntelligenceSegment, scheduleBaselineBotOperation } from "./CampaignIntelligence";
import { computeCampaignContentHash, createStableCampaignRecordId } from "../game/campaign/runtime/CampaignCanonical";
import { createCampaignRuntime, projectLegacyCampaignState, splitLegacyCampaignScenario } from "../game/campaign/runtime/CampaignScenarioAdapter";
import { runCampaignRuntimeTransaction } from "../game/campaign/runtime/CampaignRuntimeTransaction";
import { campaignOffsetKeyToRuntimeHexKey, createIntelligenceOrderDraft, createProductionOrderDraft, createRedeployOrderDraft, projectCampaignOrders, removeCampaignOrderDraft, revalidateCampaignOrderBook, setCampaignOrderReservationStatus } from "../game/campaign/orders/CampaignOrderService";
import { calculateCampaignRedeploymentCosts } from "../game/campaign/orders/CampaignRedeployRules";
import { IndexedDbCampaignSaveBackend } from "../game/campaign/persistence/CampaignSaveBackend";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../game/campaign/persistence/CampaignSaveEnvelope";
import { migrateLegacyCampaignSave } from "../game/campaign/persistence/CampaignSaveMigration";
import { CampaignSaveRepository } from "../game/campaign/persistence/CampaignSaveRepository";
import { CampaignSaveError } from "../game/campaign/persistence/CampaignSaveTypes";
/** Shipped legacy localStorage record retained until a later explicit retirement policy. */
export const CAMPAIGN_LEGACY_SAVE_KEY = "fourstar.campaign.save.v1";
/** Separate marker proving a legacy record was written and verified in Campaign 2.0 storage. */
export const CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY = "fourstar.campaign.migration.v2";
/** Primary manual slot used until the named save-browser interface lands. */
export const CAMPAIGN_PRIMARY_SAVE_SLOT_ID = "campaign-primary";
/** Current application build identity embedded in live Campaign 2.0 saves. */
export const CAMPAIGN_SAVE_BUILD_VERSION = "1.0.0";
/** Current campaign rules/content identity embedded in live Campaign 2.0 saves. */
export const CAMPAIGN_SAVE_CONTENT_VERSION = "campaign-content-1";
// Hexes per day by unit type. Slowest selected unit determines redeploy ETA.
// Each hex = 5km, so multiply by 5 to get km/day, or divide 10 by (speed × 5) to get days per 10km.
const UNIT_SPEEDS_HEX_PER_DAY = {
    // Air units (very fast strategic movement)
    Fighter: 60, // 300 km/day → 0.03 days per 10km
    Bomber: 45, // 225 km/day → 0.04 days per 10km
    Interceptor: 70, // 350 km/day → 0.03 days per 10km
    // Naval units
    Transport_Ship: 6, // 30 km/day → 0.33 days per 10km
    Battleship: 8, // 40 km/day → 0.25 days per 10km
    // Ground units - mechanized
    Supply_Truck: 5, // 25 km/day → 0.4 days per 10km
    Panzer_IV: 3, // 15 km/day → 0.67 days per 10km
    Light_Tank: 3, // 15 km/day → 0.67 days per 10km
    Heavy_Tank: 2, // 10 km/day → 1.0 days per 10km
    Panzer_V: 3, // 15 km/day → 0.67 days per 10km
    // Ground units - artillery
    Howitzer_105: 2, // 10 km/day → 1.0 days per 10km
    Artillery_155mm: 2, // 10 km/day → 1.0 days per 10km
    Artillery_105mm: 2, // 10 km/day → 1.0 days per 10km
    Rocket_Artillery: 3, // 15 km/day → 0.67 days per 10km (typically self-propelled)
    SP_Artillery: 3, // 15 km/day → 0.67 days per 10km (self-propelled)
    // Ground units - infantry
    Infantry_42: 1, // 5 km/day → 2.0 days per 10km
    Infantry_Elite: 1, // 5 km/day → 2.0 days per 10km
    Infantry: 1, // 5 km/day → 2.0 days per 10km
    AT_Infantry: 1 // 5 km/day → 2.0 days per 10km
};
/**
 * Default industrial split. Chosen so that at these defaults the daily output exactly
 * matches the legacy fixed formula (supplies = capacity, fuel = 0.8×capacity,
 * manpower = 100×capacity) while opening a modest new ammo stream (0.2×capacity).
 */
export const DEFAULT_PRODUCTION_ALLOCATION = {
    supplies: 40,
    fuel: 30,
    ammo: 10,
    manpower: 20
};
/** Output per point of industrial capacity per day, at 100% allocation to that resource. */
export const PRODUCTION_RATES = {
    supplies: 2.5,
    fuel: 8 / 3,
    ammo: 2.0,
    manpower: 500
};
/** Converts capacity + allocation percentages into concrete daily resource output. */
export function computeDailyProduction(capacity, allocation) {
    return {
        supplies: Math.round(capacity * (allocation.supplies / 100) * PRODUCTION_RATES.supplies),
        fuel: Math.round(capacity * (allocation.fuel / 100) * PRODUCTION_RATES.fuel),
        ammo: Math.round(capacity * (allocation.ammo / 100) * PRODUCTION_RATES.ammo),
        manpower: Math.round(capacity * (allocation.manpower / 100) * PRODUCTION_RATES.manpower)
    };
}
/**
 * WHAT: Resolves browser localStorage without throwing in restricted/privacy/test environments.
 * WHY: Campaign 2.0 may read the legacy save and write only a migration marker, but storage absence must remain explicit.
 *
 * @returns Available legacy storage boundary or null.
 */
function resolveBrowserLegacyStorage() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    }
    catch {
        return null;
    }
}
/**
 * WHAT: Converts a canonical FNV-1a content hash into an unsigned deterministic campaign seed.
 * WHY: New compatibility sessions need reproducible runtime RNG without wall-clock or unseeded randomness.
 *
 * @param contentHash - Versioned scenario definition hash.
 * @returns Unsigned 32-bit seed.
 */
function campaignSeedFromContentHash(contentHash) {
    return Number.parseInt(contentHash.slice("fnv1a32-".length), 16) >>> 0;
}
/**
 * Lightweight state container for the strategic campaign layer.
 * Surfaces subscribe/notify and read-only getters for UI components.
 */
export class CampaignState {
    /**
     * WHAT: Creates campaign state over injectable persistence boundaries.
     * WHY: Production IndexedDB and deterministic tests must exercise identical runtime ownership and save behavior.
     *
     * @param options - Optional backend, legacy storage, and version identities.
     */
    constructor(options = {}) {
        this.scenario = null;
        /** Frozen authored content resolved at the latest explicit setScenario/load boundary. */
        this.scenarioDefinition = null;
        /** Defensive legacy-shaped authored source used only to resolve current content during v1/v2 migration. */
        this.authoredScenarioSource = null;
        /** Only authoritative mutable campaign truth while a scenario is loaded. */
        this.runtime = null;
        /** Hash of the at-rest derived compatibility projection used to skip no-op notifications. */
        this.compatibilityProjectionHash = null;
        this.turnState = null;
        this.decisions = [];
        this.engagements = [];
        /** Tracks which engagement the commander is actively resolving so battle outcomes can be applied deterministically. */
        this.activeEngagementId = null;
        /** Current campaign time in 3-hour segments (0 = Day 1, 00:00-03:00; 8 = Day 2, 00:00-03:00) */
        this.currentSegment = 0;
        this.headquartersStatusMessage = null;
        /** Faction-specific operational pictures. Raw campaign truth never leaves through these projections. */
        this.intelligenceByFaction = {};
        this.listeners = new Set();
        const backend = options.saveBackend ?? new IndexedDbCampaignSaveBackend();
        this.saveRepository = new CampaignSaveRepository(backend);
        this.legacyStorage = options.legacyStorage === undefined ? resolveBrowserLegacyStorage() : options.legacyStorage;
        this.buildVersion = options.buildVersion ?? CAMPAIGN_SAVE_BUILD_VERSION;
        this.contentVersion = options.contentVersion ?? CAMPAIGN_SAVE_CONTENT_VERSION;
    }
    /**
     * WHAT: Captures the current compatibility draft in the exact legacy adapter contract.
     * WHY: Change detection and runtime reconciliation must include every field current CampaignState methods can mutate.
     *
     * @returns Defensive compatibility projection candidate.
     * @throws Error when no scenario is loaded.
     */
    captureCompatibilityProjection() {
        if (!this.scenario)
            throw new Error("Cannot capture campaign compatibility state without a scenario.");
        return {
            scenario: structuredClone(this.scenario),
            currentSegment: this.currentSegment,
            turnState: structuredClone(this.turnState),
            activeEngagementId: this.activeEngagementId,
            queuedDecisions: structuredClone(this.decisions),
            engagements: structuredClone(this.engagements),
            intelligenceByFaction: structuredClone(this.intelligenceByFaction)
        };
    }
    /**
     * WHAT: Computes stable change identity for one complete compatibility projection.
     * WHY: UI-only/no-op notifications must not create campaign revisions or domain events.
     *
     * @param projection - Complete current compatibility state.
     * @returns Canonical deterministic hash.
     */
    computeCompatibilityProjectionHash(projection) {
        return computeCampaignContentHash(projection);
    }
    /**
     * WHAT: Replaces every compatibility field with a fresh defensive projection of committed runtime truth.
     * WHY: The existing scenario-shaped object may serve as a temporary rule draft but cannot persist as an independent authority.
     *
     * @param runtime - Valid committed runtime.
     */
    hydrateCompatibilityProjection(runtime) {
        if (!this.scenarioDefinition)
            throw new Error("Cannot project campaign runtime without an authored definition.");
        const projection = projectLegacyCampaignState(this.scenarioDefinition, runtime);
        this.scenario = projection.scenario;
        this.currentSegment = projection.currentSegment;
        this.turnState = projection.turnState;
        this.activeEngagementId = projection.activeEngagementId;
        this.decisions = projection.queuedDecisions;
        this.engagements = projection.engagements;
        this.intelligenceByFaction = projection.intelligenceByFaction;
        this.compatibilityProjectionHash = this.computeCompatibilityProjectionHash(projection);
    }
    /**
     * WHAT: Creates first authoritative runtime truth from the loaded authored definition and initialized compatibility draft.
     * WHY: `setScenario()` must enter the Campaign 2.0 ownership model before any listener observes campaign state.
     */
    createAuthoritativeRuntime() {
        if (!this.scenario || !this.scenarioDefinition) {
            throw new Error("Cannot create campaign runtime without scenario content and definition.");
        }
        const contentHash = computeCampaignContentHash(this.scenarioDefinition);
        const campaignId = createStableCampaignRecordId("campaign", "live-session", this.scenarioDefinition.key, contentHash);
        this.runtime = createCampaignRuntime(this.scenarioDefinition, {
            campaignId,
            seed: campaignSeedFromContentHash(contentHash),
            currentSegment: this.currentSegment,
            turnState: this.turnState,
            queuedDecisions: this.decisions,
            engagements: this.engagements,
            activeEngagementId: this.activeEngagementId,
            knowledgeByFaction: this.intelligenceByFaction,
            runtimeSeedOverride: {
                tiles: this.scenario.tiles,
                economies: this.scenario.economies,
                fronts: this.scenario.fronts
            }
        });
        this.hydrateCompatibilityProjection(this.runtime);
    }
    /**
     * WHAT: Reconciles a changed compatibility draft through one validated runtime transaction and restores safe truth on failure.
     * WHY: Existing synchronous rule methods can remain behavior-compatible while runtime becomes the only committed owner.
     *
     * @param reason - Existing stable mutation/notification reason recorded in the domain event.
     */
    reconcileCompatibilityProjection(reason) {
        if (!this.scenario)
            return;
        if (!this.scenarioDefinition)
            this.scenarioDefinition = splitLegacyCampaignScenario(this.scenario);
        if (!this.runtime) {
            this.createAuthoritativeRuntime();
            return;
        }
        const projection = this.captureCompatibilityProjection();
        const projectionHash = this.computeCompatibilityProjectionHash(projection);
        if (projectionHash === this.compatibilityProjectionHash)
            return;
        const safeRuntime = this.runtime;
        try {
            const candidate = createCampaignRuntime(this.scenarioDefinition, {
                campaignId: safeRuntime.campaignId,
                seed: safeRuntime.rng.baseSeed,
                currentSegment: projection.currentSegment,
                turnState: projection.turnState,
                queuedDecisions: projection.queuedDecisions,
                engagements: projection.engagements,
                activeEngagementId: projection.activeEngagementId,
                knowledgeByFaction: projection.intelligenceByFaction,
                runtimeSeedOverride: {
                    tiles: projection.scenario.tiles,
                    economies: projection.scenario.economies,
                    fronts: projection.scenario.fronts
                }
            });
            const result = runCampaignRuntimeTransaction(safeRuntime, `compatibility:${reason}`, (draft) => {
                draft.currentSegment = candidate.currentSegment;
                draft.status = safeRuntime.status === "victory" || safeRuntime.status === "defeat"
                    ? safeRuntime.status
                    : candidate.status;
                draft.activeEngagementId = candidate.activeEngagementId;
                draft.tileOrder.splice(0, draft.tileOrder.length, ...candidate.tileOrder);
                draft.tiles = structuredClone(candidate.tiles);
                draft.factionOrder.splice(0, draft.factionOrder.length, ...candidate.factionOrder);
                draft.factions = structuredClone(candidate.factions);
                draft.engagementOrder.splice(0, draft.engagementOrder.length, ...candidate.engagementOrder);
                draft.engagements = structuredClone(candidate.engagements);
                draft.knowledgeByFaction = structuredClone(candidate.knowledgeByFaction);
                draft.compatibility = structuredClone(candidate.compatibility);
                this.synchronizeTypedOrderExecution(draft);
                revalidateCampaignOrderBook(draft);
                return [{
                        type: "stateChanged",
                        category: reason === "intelligenceUpdated" ? "intelligence" : "system",
                        summary: `Compatibility campaign state committed: ${reason}.`,
                        details: { reason, currentSegment: candidate.currentSegment }
                    }];
            });
            if (!result.ok)
                throw result.error;
            this.runtime = result.state;
            this.hydrateCompatibilityProjection(result.state);
        }
        catch (error) {
            this.runtime = safeRuntime;
            this.hydrateCompatibilityProjection(safeRuntime);
            throw error;
        }
    }
    /**
     * Commits one order-domain mutation through the authoritative runtime boundary and refreshes compatibility/UI projections.
     * The source runtime is retained byte-for-byte when the mutator throws or violates an invariant.
     */
    transactCampaignOrders(label, summary, mutator, eventDetails = {}) {
        if (!this.runtime || !this.scenarioDefinition)
            return { ok: false, reason: "No campaign runtime is loaded." };
        const result = runCampaignRuntimeTransaction(this.runtime, label, (draft) => {
            mutator(draft);
            return [{
                    type: "stateChanged",
                    category: "orders",
                    summary,
                    details: { ...eventDetails, currentSegment: draft.currentSegment }
                }];
        });
        if (!result.ok)
            return { ok: false, reason: result.error.message };
        this.runtime = result.state;
        this.hydrateCompatibilityProjection(result.state);
        this.notify("ordersUpdated");
        return { ok: true };
    }
    /** Mirrors compatibility execution progress into typed order lifecycle without making compatibility authoritative. */
    synchronizeTypedOrderExecution(runtime) {
        runtime.orderOrder.forEach((orderId) => {
            const order = runtime.orders[orderId];
            if (!order || (order.status !== "committed" && order.status !== "executing"))
                return;
            if (order.kind === "redeploy") {
                const decision = runtime.compatibility.queuedDecisions.find((entry) => entry.id === order.executionRefId);
                const status = typeof decision?.payload.status === "string" ? decision.payload.status : null;
                if (status === "arrived")
                    order.status = "executing";
                if (status === "completed")
                    order.status = "completed";
            }
            else if (order.kind === "production") {
                if (runtime.currentSegment >= order.payload.effectiveSegment)
                    order.status = "completed";
            }
            else {
                const operation = runtime.knowledgeByFaction[String(order.faction)]?.operations
                    .find((entry) => entry.id === order.executionRefId);
                if (!operation)
                    return;
                if (operation.status === "active")
                    order.status = "executing";
                if (operation.status === "complete" || operation.status === "partial")
                    order.status = "completed";
                if (operation.status === "aborted" || operation.status === "compromised")
                    order.status = "blocked";
            }
        });
    }
    /**
     * WHAT: Returns a defensive snapshot of authoritative Campaign 2.0 truth.
     * WHY: Persistence, diagnostics, and integration tests must not read or mutate the compatibility cache as authority.
     *
     * @returns Runtime snapshot or null when no campaign is loaded.
     */
    getRuntimeSnapshot() {
        return this.runtime ? structuredClone(this.runtime) : null;
    }
    /** Returns authoritative typed orders in deterministic planning/resolution order. */
    getCampaignOrders() {
        return this.runtime ? projectCampaignOrders(this.runtime) : [];
    }
    /** Summarizes valid draft holds for player-facing resource/capacity affordances. */
    getCampaignDraftReservations(faction = "Player") {
        const summary = { resources: {}, transport: {}, intelligenceCapacity: 0, assets: 0, formations: 0 };
        if (!this.runtime)
            return summary;
        this.runtime.reservationOrder.forEach((id) => {
            const reservation = this.runtime?.reservations[id];
            if (!reservation || reservation.faction !== faction || reservation.status !== "held")
                return;
            if (reservation.kind === "resource")
                summary.resources[reservation.poolKey] = (summary.resources[reservation.poolKey] ?? 0) + reservation.amount;
            if (reservation.kind === "transport")
                summary.transport[reservation.poolKey] = (summary.transport[reservation.poolKey] ?? 0) + reservation.amount;
            if (reservation.kind === "intelligenceCapacity")
                summary.intelligenceCapacity += reservation.amount;
            if (reservation.kind === "asset")
                summary.assets += reservation.amount;
            if (reservation.kind === "formation")
                summary.formations += reservation.amount;
        });
        return structuredClone(summary);
    }
    /** Adds a non-spending redeployment draft using the same exact preview as the planner. */
    createRedeployDraft(originOffsetKey, destinationOffsetKey, selections, transportModeKey = "foot") {
        const preview = this.previewRedeploy(originOffsetKey, destinationOffsetKey, selections, transportModeKey);
        const transportMode = getTransportMode(transportModeKey);
        const originRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(originOffsetKey);
        const destinationRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(destinationOffsetKey);
        if (!this.runtime || !preview || !transportMode || !originRuntimeHexKey || !destinationRuntimeHexKey) {
            return { ok: false, reason: "The redeployment route or transport mode is invalid." };
        }
        if (!preview.ok)
            return { ok: false, reason: preview.issues[0] ?? "The redeployment draft is invalid." };
        const activeSelections = selections
            .filter((selection) => selection.count > 0)
            .map((selection) => ({ unitType: selection.unitType, count: Math.floor(selection.count) }));
        let returnEtaSegment = preview.etaSegment;
        if (transportMode.capacityType === "trucks" || transportMode.capacityType === "transportShips") {
            returnEtaSegment += preview.timeSegments;
        }
        const payload = {
            originOffsetKey,
            destinationOffsetKey,
            originRuntimeHexKey,
            destinationRuntimeHexKey,
            selections: activeSelections,
            transportModeKey,
            transportCapacityType: transportMode.capacityType ?? null,
            distance: preview.distance,
            timeSegments: preview.timeSegments,
            etaSegment: preview.etaSegment,
            returnEtaSegment,
            fuelCost: preview.fuelCost,
            suppliesCost: preview.suppliesCost,
            manpowerCost: preview.manpowerLoss,
            transportCapacityCost: preview.capacityNeeded
        };
        let createdId = null;
        const result = this.transactCampaignOrders("orders:create-redeploy-draft", `Redeployment draft added from ${originOffsetKey} to ${destinationOffsetKey}.`, (draft) => { createdId = createRedeployOrderDraft(draft, { faction: "Player", payload }).id; }, { kind: "redeploy", originOffsetKey, destinationOffsetKey });
        if (!result.ok)
            return result;
        const order = createdId && this.runtime?.orders[createdId];
        return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The redeployment draft was not retained." };
    }
    /** Normalizes a production mix to the exact persisted 100-percent allocation contract. */
    normalizeProductionAllocation(allocation) {
        const clamped = {
            supplies: Math.max(0, Number(allocation.supplies) || 0),
            fuel: Math.max(0, Number(allocation.fuel) || 0),
            ammo: Math.max(0, Number(allocation.ammo) || 0),
            manpower: Math.max(0, Number(allocation.manpower) || 0)
        };
        const total = clamped.supplies + clamped.fuel + clamped.ammo + clamped.manpower;
        if (total <= 0)
            return null;
        const normalized = {
            supplies: Math.round((clamped.supplies / total) * 100),
            fuel: Math.round((clamped.fuel / total) * 100),
            ammo: Math.round((clamped.ammo / total) * 100),
            manpower: Math.round((clamped.manpower / total) * 100)
        };
        const drift = 100 - Object.values(normalized).reduce((sum, value) => sum + value, 0);
        if (drift !== 0) {
            const keys = ["supplies", "fuel", "ammo", "manpower"];
            const largest = keys.reduce((best, key) => normalized[key] > normalized[best] ? key : best, keys[0]);
            normalized[largest] += drift;
        }
        return normalized;
    }
    /** Adds an exclusive next-delivery production draft without changing the active allocation. */
    createProductionDraft(allocation) {
        if (!this.runtime)
            return { ok: false, reason: "No campaign runtime is loaded." };
        const normalized = this.normalizeProductionAllocation(allocation);
        if (!normalized)
            return { ok: false, reason: "Allocation must be greater than zero." };
        const remainder = this.runtime.currentSegment % 8;
        const effectiveSegment = this.runtime.currentSegment + (remainder === 0 ? 8 : 8 - remainder);
        let createdId = null;
        const result = this.transactCampaignOrders("orders:create-production-draft", "Production allocation draft added.", (draft) => {
            createdId = createProductionOrderDraft(draft, { faction: "Player", allocation: normalized, effectiveSegment }).id;
        }, { kind: "production", effectiveSegment });
        if (!result.ok)
            return result;
        const order = createdId && this.runtime?.orders[createdId];
        return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The production draft was not retained." };
    }
    /** Adds an intelligence/counterintelligence draft after current target and asset rule checks. */
    createIntelOperationDraft(options) {
        if (!this.runtime || !this.scenario)
            return { ok: false, reason: "No campaign scenario is loaded." };
        const faction = options.faction ?? "Player";
        const target = this.parseOffsetKeyToAxial(options.targetHexKey);
        if (!target)
            return { ok: false, reason: "Choose a valid campaign hex." };
        const state = this.ensureKnowledgeState(faction);
        const rule = INTEL_OPERATION_RULES[options.type];
        const assets = this.getEligibleIntelAssets(options.type, faction, options.targetHexKey);
        if (rule.requiresAsset !== "none") {
            if (!options.assignedAssetKey)
                return { ok: false, reason: "Assign an eligible formation or air unit." };
            if (!assets.some((asset) => asset.assetKey === options.assignedAssetKey)) {
                return { ok: false, reason: "The selected asset is unavailable, ineligible, or out of range for this operation." };
            }
        }
        if (rule.requiresAsset === "friendlyForce") {
            const targetTile = this.findTileByOffsetKey(options.targetHexKey);
            const owner = targetTile ? targetTile.factionControl ?? this.scenario.tilePalette[targetTile.tile]?.factionControl : null;
            if (owner !== faction || (targetTile?.forces?.length ?? 0) === 0) {
                return { ok: false, reason: "Operational Security must protect a friendly force concentration." };
            }
        }
        if (options.type === "verify" && !state.contacts.some((contact) => contact.id === options.targetContactId)) {
            return { ok: false, reason: "Select an existing contact to verify." };
        }
        const payload = {
            operationType: options.type,
            targetHexKey: options.targetHexKey,
            assignedAssetKey: options.assignedAssetKey ?? null,
            targetContactId: options.targetContactId ?? null,
            durationSegments: rule.durationSegments,
            capacityCost: rule.capacityCost,
            suppliesCost: rule.suppliesCost,
            fuelCost: rule.fuelCost,
            resolveSegment: this.runtime.currentSegment + rule.durationSegments
        };
        const kind = options.type === "counterRecon" || options.type === "opsec" || options.type === "phantom"
            ? "counterIntelligence"
            : "reconnaissance";
        let createdId = null;
        const result = this.transactCampaignOrders("orders:create-intelligence-draft", `${rule.label} draft added for ${options.targetHexKey}.`, (draft) => {
            createdId = createIntelligenceOrderDraft(draft, { faction, kind, payload }).id;
        }, { kind, operationType: options.type, targetHexKey: options.targetHexKey });
        if (!result.ok)
            return result;
        const order = createdId && this.runtime?.orders[createdId];
        return order ? { ok: true, order: structuredClone(order) } : { ok: false, reason: "The intelligence draft was not retained." };
    }
    /** Removes one uncommitted draft and releases/rebalances all affected proposed holds. */
    removeCampaignOrder(orderId) {
        const order = this.runtime?.orders[orderId];
        if (!order)
            return { ok: false, reason: "Order not found." };
        if (order.status !== "draft")
            return { ok: false, reason: "Only a draft can be removed." };
        return this.transactCampaignOrders("orders:remove-draft", `Draft order ${orderId} removed.`, (draft) => {
            if (!removeCampaignOrderDraft(draft, orderId))
                throw new Error("The order is no longer an editable draft.");
        }, { orderId });
    }
    /** Commits selected drafts (or all drafts) in one validated all-or-nothing runtime revision. */
    commitCampaignOrders(orderIds) {
        if (!this.runtime)
            return { ok: false, reason: "No campaign runtime is loaded." };
        const requested = orderIds
            ? [...new Set(orderIds)]
            : this.runtime.orderOrder.filter((id) => this.runtime?.orders[id]?.status === "draft");
        if (requested.length === 0)
            return { ok: false, reason: "There are no draft orders to commit." };
        const result = this.transactCampaignOrders("orders:commit", `${requested.length} campaign order${requested.length === 1 ? "" : "s"} committed atomically.`, (draft) => {
            revalidateCampaignOrderBook(draft);
            const orders = requested.map((id) => draft.orders[id]);
            const missing = orders.findIndex((order) => !order || order.status !== "draft");
            if (missing >= 0)
                throw new Error(`Order ${requested[missing]} is missing or no longer a draft.`);
            const invalid = orders.find((order) => !order.validation.valid);
            if (invalid)
                throw new Error(invalid.validation.issues[0]?.message ?? `Order ${invalid.id} is invalid.`);
            orders.forEach((order) => this.applyCommittedCampaignOrder(draft, order));
            revalidateCampaignOrderBook(draft);
        }, { orderCount: requested.length });
        return result.ok ? { ok: true, committedCount: requested.length } : result;
    }
    /** Applies one already-validated draft to the transaction candidate. */
    applyCommittedCampaignOrder(runtime, order) {
        const faction = runtime.factions[String(order.faction)];
        if (!faction)
            throw new Error(`Issuing faction ${order.faction} is unavailable.`);
        if (order.kind === "redeploy") {
            const economy = faction.economy;
            if (economy.fuel < order.payload.fuelCost || economy.supplies < order.payload.suppliesCost || economy.manpower < order.payload.manpowerCost) {
                throw new Error("Redeployment resources changed before commit.");
            }
            economy.fuel -= order.payload.fuelCost;
            economy.supplies -= order.payload.suppliesCost;
            economy.manpower -= order.payload.manpowerCost;
            if (order.payload.transportCapacityType && order.payload.transportCapacityCost > 0) {
                const capacity = economy.transportCapacity;
                if (!capacity)
                    throw new Error("Transport capacity is unavailable.");
                const key = `${order.payload.transportCapacityType}InTransit`;
                capacity[key] = (capacity[key] ?? 0) + order.payload.transportCapacityCost;
            }
            const decisionId = createStableCampaignRecordId("decision", runtime.campaignId, order.id, "redeploy");
            runtime.compatibility.queuedDecisions.push({
                id: decisionId,
                faction: order.faction,
                type: "redeploy",
                payload: {
                    originOffsetKey: order.payload.originOffsetKey,
                    destOffsetKey: order.payload.destinationOffsetKey,
                    selections: structuredClone(order.payload.selections),
                    transportMode: order.payload.transportModeKey,
                    distance: order.payload.distance,
                    timeSegments: order.payload.timeSegments,
                    etaSegment: order.payload.etaSegment,
                    returnEtaSegment: order.payload.returnEtaSegment,
                    fuelCost: order.payload.fuelCost,
                    suppliesCost: order.payload.suppliesCost,
                    manpowerLoss: order.payload.manpowerCost,
                    capacityReserved: order.payload.transportCapacityType
                        ? { type: order.payload.transportCapacityType, count: order.payload.transportCapacityCost }
                        : undefined,
                    status: "queued",
                    typedOrderId: order.id
                },
                affectedHexKeys: [order.payload.originOffsetKey, order.payload.destinationOffsetKey]
            });
            order.executionRefId = decisionId;
        }
        else if (order.kind === "production") {
            faction.economy.productionAllocation = structuredClone(order.payload.allocation);
            order.executionRefId = createStableCampaignRecordId("production", runtime.campaignId, order.id, order.payload.effectiveSegment);
        }
        else {
            const economy = faction.economy;
            if (economy.supplies < order.payload.suppliesCost || economy.fuel < order.payload.fuelCost) {
                throw new Error("Intelligence resources changed before commit.");
            }
            const knowledge = runtime.knowledgeByFaction[String(order.faction)];
            if (!knowledge)
                throw new Error("Faction intelligence state is unavailable.");
            economy.supplies -= order.payload.suppliesCost;
            economy.fuel -= order.payload.fuelCost;
            const operation = createIntelOperation(knowledge, order.payload.operationType, order.payload.targetHexKey, runtime.currentSegment, order.payload.assignedAssetKey ?? undefined, order.payload.targetContactId ?? undefined);
            knowledge.operations.push(operation);
            order.executionRefId = operation.id;
        }
        order.status = "committed";
        order.validation = { valid: true, issues: [], validatedRevision: runtime.revision };
        setCampaignOrderReservationStatus(runtime, order, "consumed");
    }
    /** Cancels a committed movement/intelligence order only while its execution adapter has not begun. */
    cancelCampaignOrder(orderId) {
        const order = this.runtime?.orders[orderId];
        if (!order)
            return { ok: false, reason: "Order not found." };
        if (order.status === "draft")
            return this.removeCampaignOrder(orderId);
        if (order.status !== "committed")
            return { ok: false, reason: "This order has already started or ended." };
        if (order.kind === "production")
            return { ok: false, reason: "A committed production allocation cannot be cancelled; issue a new allocation draft." };
        return this.transactCampaignOrders("orders:cancel", `Committed ${order.kind} order ${orderId} cancelled before execution.`, (draft) => {
            const candidate = draft.orders[orderId];
            if (!candidate || candidate.status !== "committed")
                throw new Error("The order is no longer cancellable.");
            const economy = draft.factions[String(candidate.faction)]?.economy;
            if (!economy)
                throw new Error("The issuing economy is unavailable.");
            if (candidate.kind === "redeploy") {
                const index = draft.compatibility.queuedDecisions.findIndex((entry) => entry.id === candidate.executionRefId);
                const decision = draft.compatibility.queuedDecisions[index];
                if (index < 0 || decision?.payload.status !== "queued")
                    throw new Error("Redeployment has already begun.");
                economy.fuel += candidate.payload.fuelCost;
                economy.supplies += candidate.payload.suppliesCost;
                economy.manpower += candidate.payload.manpowerCost;
                if (candidate.payload.transportCapacityType && candidate.payload.transportCapacityCost > 0) {
                    const capacity = economy.transportCapacity;
                    const key = `${candidate.payload.transportCapacityType}InTransit`;
                    if (capacity)
                        capacity[key] = Math.max(0, (capacity[key] ?? 0) - candidate.payload.transportCapacityCost);
                }
                draft.compatibility.queuedDecisions.splice(index, 1);
            }
            else {
                if (candidate.kind === "production")
                    throw new Error("A production allocation cannot be cancelled after commit.");
                const knowledge = draft.knowledgeByFaction[String(candidate.faction)];
                const index = knowledge?.operations.findIndex((entry) => entry.id === candidate.executionRefId) ?? -1;
                const operation = index >= 0 ? knowledge?.operations[index] : null;
                if (!knowledge || !operation || operation.status !== "planned")
                    throw new Error("Intelligence operation has already begun.");
                economy.supplies += candidate.payload.suppliesCost;
                economy.fuel += candidate.payload.fuelCost;
                knowledge.operations.splice(index, 1);
            }
            candidate.status = "cancelled";
            setCampaignOrderReservationStatus(draft, candidate, "released");
            revalidateCampaignOrderBook(draft);
        }, { orderId, kind: order.kind });
    }
    /**
     * WHAT: Returns a defensive snapshot of the frozen authored definition.
     * WHY: Save content checks and certification need to prove runtime/definition identity without mutation access.
     *
     * @returns Definition snapshot or null when no campaign is loaded.
     */
    getScenarioDefinitionSnapshot() {
        return this.scenarioDefinition ? structuredClone(this.scenarioDefinition) : null;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `loadPrimaryCampaign()`. */
    hasSave() {
        try {
            return Boolean(this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY));
        }
        catch {
            return false;
        }
    }
    /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `savePrimaryCampaign()`. */
    saveToStorage() {
        try {
            if (!this.scenario)
                return;
            this.reconcileCompatibilityProjection("manual");
            const snapshot = {
                saveVersion: 2,
                scenario: this.scenario,
                turnState: this.turnState,
                decisions: this.decisions,
                engagements: this.engagements,
                activeEngagementId: this.activeEngagementId,
                currentSegment: this.currentSegment,
                intelligenceByFaction: this.intelligenceByFaction
            };
            this.legacyStorage?.setItem(CAMPAIGN_LEGACY_SAVE_KEY, JSON.stringify(snapshot));
        }
        catch {
            /* no-op */
        }
    }
    /** @deprecated Legacy synchronous localStorage compatibility only; live UI uses `loadPrimaryCampaign()`. */
    loadFromStorage() {
        try {
            const raw = this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY) ?? null;
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (parsed.scenario) {
                this.scenario = parsed.scenario;
                if (!this.scenarioDefinition || this.scenarioDefinition.key !== parsed.scenario.key) {
                    this.authoredScenarioSource = structuredClone(parsed.scenario);
                    this.scenarioDefinition = splitLegacyCampaignScenario(parsed.scenario);
                    this.runtime = null;
                    this.compatibilityProjectionHash = null;
                }
            }
            this.turnState = parsed.turnState ?? null;
            this.decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
            this.engagements = Array.isArray(parsed.engagements) ? parsed.engagements : [];
            this.activeEngagementId = parsed.activeEngagementId ?? null;
            // Support both new segment system and legacy day system
            if (Number.isFinite(parsed.currentSegment)) {
                this.currentSegment = parsed.currentSegment;
            }
            else if (Number.isFinite(parsed.currentDay)) {
                // Convert legacy day to segment (assume start of day)
                this.currentSegment = (parsed.currentDay - 1) * 8;
            }
            else {
                this.currentSegment = 0;
            }
            if (parsed.intelligenceByFaction && typeof parsed.intelligenceByFaction === "object") {
                this.intelligenceByFaction = structuredClone(parsed.intelligenceByFaction);
            }
            else if (this.scenario) {
                // v1 migration: the old scalar intelCoverage had no knowledge semantics, so seed a truthful
                // baseline from scenario briefings and direct/front-line observation.
                this.initializeCampaignIntelligence();
            }
            this.refreshIntelCapacity();
            this.notify("scenarioLoaded");
        }
        catch {
            /* no-op */
        }
    }
    /**
     * WHAT: Returns the currently resolved authored identity required for safe save hydration.
     * WHY: A valid checksum cannot authorize applying runtime state to different or changed scenario content.
     *
     * @returns Current scenario key/content hash.
     * @throws CampaignSaveError when no authored scenario is resolved.
     */
    getExpectedSaveContent() {
        if (!this.scenarioDefinition) {
            throw new CampaignSaveError("CONTENT_MISMATCH", "No authored campaign scenario is loaded for save validation.");
        }
        return {
            scenarioKey: this.scenarioDefinition.key,
            scenarioContentHash: computeCampaignContentHash(this.scenarioDefinition)
        };
    }
    /**
     * WHAT: Hydrates a verified envelope into authoritative runtime and regenerates the compatibility projection.
     * WHY: Load/recovery must never assign legacy fields independently or bypass current authored-content policy.
     *
     * @param envelope - Candidate current or recovery envelope.
     * @throws CampaignSaveError when checksum, runtime, or content identity is invalid.
     */
    applyCampaignSaveEnvelope(envelope) {
        const validation = validateCampaignSaveEnvelope(envelope, this.getExpectedSaveContent());
        if (!validation.ok)
            throw validation.error;
        this.runtime = structuredClone(validation.envelope.payload.runtime);
        this.hydrateCompatibilityProjection(this.runtime);
        this.notify("scenarioLoaded");
    }
    /**
     * WHAT: Saves authoritative runtime into the primary copy-on-write Campaign 2.0 slot.
     * WHY: Live Save must use verified IndexedDB persistence and must never claim success after a failed write.
     *
     * @param request - Explicit timestamp, label, play metadata, commander link, and UI resume context.
     * @returns Atomically committed slot index.
     */
    async savePrimaryCampaign(request) {
        this.reconcileCompatibilityProjection("manual");
        if (!this.runtime || !this.scenarioDefinition) {
            throw new CampaignSaveError("INVALID_ENVELOPE", "No authoritative campaign runtime is available to save.");
        }
        const runtime = structuredClone(this.runtime);
        const saveId = createStableCampaignRecordId("save", runtime.campaignId, runtime.revision, request.timestamp, "primary-manual");
        const lastEventSummary = runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? null;
        const envelope = createCampaignSaveEnvelope({
            saveId,
            slotType: "manual",
            gameMode: "campaign",
            createdAt: request.timestamp,
            updatedAt: request.timestamp,
            buildVersion: this.buildVersion,
            contentVersion: this.contentVersion,
            scenarioKey: runtime.scenarioKey,
            campaignId: runtime.campaignId,
            engagementId: runtime.activeEngagementId,
            display: {
                campaignTitle: this.scenarioDefinition.title,
                segment: runtime.currentSegment,
                phaseLabel: runtime.status === "engagement" ? "Tactical engagement" : "Campaign planning",
                lastEventSummary,
                playTimeSeconds: request.playTimeSeconds,
                difficulty: request.difficulty,
                result: runtime.status === "victory" ? "victory" : runtime.status === "defeat" ? "defeat" : null,
                thumbnailKey: null
            },
            payload: {
                runtime,
                activeBattle: null,
                commanderRosterLink: request.commanderRosterLink,
                uiResumeContext: structuredClone(request.uiResumeContext)
            }
        });
        return this.saveRepository.saveSlot({
            slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
            label: request.label,
            envelope
        });
    }
    /**
     * WHAT: Converts unknown storage failures into stable save errors for state/UI results.
     * WHY: Load callers need one predictable result union even when a backend throws outside envelope validation.
     *
     * @param error - Unknown persistence failure.
     * @param action - Diagnostic action phrase.
     * @returns Stable CampaignSaveError.
     */
    normalizeSaveError(error, action) {
        if (error instanceof CampaignSaveError)
            return error;
        const detail = error instanceof Error ? error.message : String(error);
        return new CampaignSaveError("STORAGE_FAILED", `Campaign save failed while ${action}: ${detail}`, { action, detail });
    }
    /**
     * WHAT: Loads the verified primary Campaign 2.0 slot or performs first-use pure legacy migration/write-through.
     * WHY: The original localStorage save must remain untouched until a new envelope is durable and successfully hydrated.
     *
     * @param request - Explicit migration/save metadata and observation timestamp.
     * @returns Applied current/migrated save or failure with optional unapplied recovery candidate.
     */
    async loadPrimaryCampaign(request) {
        let expectedContent;
        try {
            expectedContent = this.getExpectedSaveContent();
        }
        catch (error) {
            return { ok: false, error: this.normalizeSaveError(error, "resolving authored content"), recoveryCandidate: null };
        }
        const loadOptions = {
            observedAt: request.timestamp,
            expectedContent
        };
        try {
            const stored = await this.saveRepository.loadSlot(CAMPAIGN_PRIMARY_SAVE_SLOT_ID, loadOptions);
            if (stored.ok) {
                this.applyCampaignSaveEnvelope(stored.envelope);
                return { ok: true, envelope: stored.envelope, source: "campaign2", warning: null };
            }
            if (stored.error.code !== "SLOT_NOT_FOUND")
                return stored;
            const legacyRaw = this.legacyStorage?.getItem(CAMPAIGN_LEGACY_SAVE_KEY) ?? null;
            if (!legacyRaw)
                return stored;
            if (!this.authoredScenarioSource) {
                return {
                    ok: false,
                    error: new CampaignSaveError("MIGRATION_FAILED", "Legacy campaign save exists but no authored scenario source is loaded for migration."),
                    recoveryCandidate: null
                };
            }
            const authoredScenario = structuredClone(this.authoredScenarioSource);
            const migrated = migrateLegacyCampaignSave(legacyRaw, {
                resolveScenario: (scenarioKey) => scenarioKey === authoredScenario.key ? structuredClone(authoredScenario) : null,
                buildVersion: this.buildVersion,
                contentVersion: this.contentVersion,
                createdAt: request.timestamp,
                updatedAt: request.timestamp,
                slotType: "manual",
                playTimeSeconds: request.playTimeSeconds,
                difficulty: request.difficulty,
                commanderRosterLink: request.commanderRosterLink,
                uiResumeContext: structuredClone(request.uiResumeContext)
            });
            await this.saveRepository.saveSlot({
                slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
                label: request.label,
                envelope: migrated.envelope
            });
            const verified = await this.saveRepository.loadSlot(CAMPAIGN_PRIMARY_SAVE_SLOT_ID, loadOptions);
            if (!verified.ok)
                return verified;
            this.scenarioDefinition = migrated.definition;
            this.applyCampaignSaveEnvelope(verified.envelope);
            let warning = null;
            try {
                this.legacyStorage?.setItem(CAMPAIGN_LEGACY_MIGRATION_MARKER_KEY, JSON.stringify({
                    sourceHash: migrated.sourceHash,
                    sourceVersion: migrated.sourceVersion,
                    saveId: verified.envelope.saveId,
                    checksum: verified.envelope.checksum,
                    migratedAt: request.timestamp
                }));
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                warning = `Campaign migrated successfully, but its migration marker could not be written: ${detail}`;
            }
            return { ok: true, envelope: verified.envelope, source: "legacyMigration", warning };
        }
        catch (error) {
            return { ok: false, error: this.normalizeSaveError(error, "loading the primary campaign slot"), recoveryCandidate: null };
        }
    }
    /**
     * WHAT: Applies a repository-verified prior save only after the caller/player explicitly accepts recovery.
     * WHY: Recovery discovery must never silently replace the requested current slot state.
     *
     * @param candidate - Independently validated repository recovery candidate.
     * @returns Applied recovery result; the slot pointer remains unchanged until a later explicit save.
     */
    restorePrimaryCampaignRecovery(candidate) {
        this.applyCampaignSaveEnvelope(candidate.envelope);
        return { ok: true, envelope: candidate.envelope, source: "recovery", warning: null };
    }
    emit(reason = "manual") {
        this.notify(reason);
    }
    notify(reason) {
        if (reason !== "reset")
            this.reconcileCompatibilityProjection(reason);
        this.listeners.forEach((listener) => {
            try {
                listener(reason);
            }
            catch (err) {
                // console surface only; state remains intact
                console.error("[CampaignState] listener error", { reason, err });
            }
        });
    }
    setScenario(scenario) {
        this.authoredScenarioSource = structuredClone(scenario);
        this.scenarioDefinition = splitLegacyCampaignScenario(scenario);
        this.runtime = null;
        this.compatibilityProjectionHash = null;
        this.scenario = structuredClone(scenario);
        // Seed control-since timestamps so fronts can measure hold duration from the start.
        try {
            const segment = this.currentSegment;
            for (const t of this.scenario.tiles) {
                const palette = this.scenario.tilePalette[t.tile];
                const owner = t.factionControl ?? palette?.factionControl;
                if (owner && typeof t.controlSinceSegment !== "number") {
                    t.controlSinceSegment = segment;
                }
            }
        }
        catch { }
        // Auto-calculate power values based on strategic assets
        this.updatePowerValues();
        this.initializeCampaignIntelligence();
        this.notify("scenarioLoaded");
    }
    getScenario() {
        return this.scenario ? structuredClone(this.scenario) : null;
    }
    /** Returns the sanitized campaign projection for one observing faction. */
    getCampaignMapView(faction = "Player") {
        if (!this.scenario)
            return null;
        const state = this.ensureKnowledgeState(faction);
        return buildCampaignMapView(this.scenario, state, this.currentSegment);
    }
    /** Returns only the seed-free operation projection needed by the intelligence drawer. */
    getIntelOperations(faction = "Player") {
        if (!this.scenario)
            return [];
        return this.ensureKnowledgeState(faction).operations.map(({ seed: _seed, ...operation }) => structuredClone(operation));
    }
    getIntelContactsAtHex(hexKey, faction = "Player") {
        const view = this.getCampaignMapView(faction);
        if (!view)
            return [];
        return view.enemyContacts.filter((contact) => {
            const center = this.parseOffsetKeyToAxial(hexKey);
            const location = this.parseOffsetKeyToAxial(contact.locationHexKey);
            return Boolean(center && location && hexDistance(center, location) <= contact.uncertaintyRadius);
        });
    }
    hasActionableEnemyContactNear(hexKey, faction = "Player", radius = 1) {
        const origin = this.parseOffsetKeyToAxial(hexKey);
        const view = this.getCampaignMapView(faction);
        if (!origin || !view)
            return false;
        return view.enemyContacts.some((contact) => {
            const location = this.parseOffsetKeyToAxial(contact.locationHexKey);
            return Boolean(location && hexDistance(origin, location) <= radius + contact.uncertaintyRadius);
        });
    }
    getIntelBriefEvents(faction = "Player") {
        if (!this.scenario)
            return [];
        return structuredClone(this.ensureKnowledgeState(faction).briefEvents)
            .sort((a, b) => b.segment - a.segment);
    }
    markIntelBriefsRead(faction = "Player") {
        if (!this.scenario)
            return;
        const state = this.ensureKnowledgeState(faction);
        state.briefEvents.forEach((event) => { event.read = true; });
        this.notify("intelligenceUpdated");
    }
    getIntelOperationRules() {
        return structuredClone(INTEL_OPERATION_RULES);
    }
    getEligibleIntelAssets(type, faction = "Player", targetHexKey) {
        if (!this.scenario)
            return [];
        const state = this.ensureKnowledgeState(faction);
        const committedAssets = new Set(state.operations
            .filter((operation) => operation.status === "planned" || operation.status === "active")
            .map((operation) => operation.assignedAssetKey)
            .filter((assetKey) => Boolean(assetKey)));
        return findEligibleIntelAssets(this.scenario, faction, type)
            .filter((asset) => !committedAssets.has(asset.assetKey))
            .filter((asset) => !targetHexKey || isIntelAssetInRange(asset.hexKey, targetHexKey, type));
    }
    scheduleIntelOperation(options) {
        if (!this.scenario)
            return { ok: false, reason: "No campaign scenario is loaded." };
        const faction = options.faction ?? "Player";
        const target = this.parseOffsetKeyToAxial(options.targetHexKey);
        if (!target)
            return { ok: false, reason: "Choose a valid campaign hex." };
        const state = this.ensureKnowledgeState(faction);
        const rule = INTEL_OPERATION_RULES[options.type];
        const committed = getCommittedCapacity(state);
        if (committed + rule.capacityCost > state.capacityTotal) {
            return { ok: false, reason: `This order needs ${rule.capacityCost} Intelligence Capacity; ${Math.max(0, state.capacityTotal - committed)} is available.` };
        }
        const assets = this.getEligibleIntelAssets(options.type, faction, options.targetHexKey);
        if (rule.requiresAsset !== "none") {
            if (!options.assignedAssetKey)
                return { ok: false, reason: "Assign an eligible formation or air unit." };
            if (!assets.some((asset) => asset.assetKey === options.assignedAssetKey)) {
                return { ok: false, reason: "The selected asset is unavailable, ineligible, or out of range for this operation." };
            }
        }
        if (rule.requiresAsset === "friendlyForce") {
            const targetTile = this.findTileByOffsetKey(options.targetHexKey);
            const owner = targetTile ? (targetTile.factionControl ?? this.scenario.tilePalette[targetTile.tile]?.factionControl) : null;
            if (owner !== faction || (targetTile?.forces?.length ?? 0) === 0) {
                return { ok: false, reason: "Operational Security must protect a friendly force concentration." };
            }
        }
        if (options.type === "verify") {
            const contact = state.contacts.find((candidate) => candidate.id === options.targetContactId);
            if (!contact)
                return { ok: false, reason: "Select an existing contact to verify." };
        }
        const economy = this.scenario.economies.find((entry) => entry.faction === faction);
        if (!economy || economy.supplies < rule.suppliesCost || economy.fuel < rule.fuelCost) {
            return { ok: false, reason: `Insufficient resources: requires ${rule.suppliesCost} supplies and ${rule.fuelCost} fuel.` };
        }
        economy.supplies = Math.max(0, economy.supplies - rule.suppliesCost);
        economy.fuel = Math.max(0, economy.fuel - rule.fuelCost);
        const operation = createIntelOperation(state, options.type, options.targetHexKey, this.currentSegment, options.assignedAssetKey, options.targetContactId);
        state.operations.push(operation);
        this.notify("intelligenceUpdated");
        const { seed: _seed, ...publicOperation } = operation;
        return { ok: true, operation: structuredClone(publicOperation) };
    }
    buildIntelligenceBriefing(battleHexKey, faction = "Player") {
        if (!this.scenario)
            return null;
        return buildIntelligenceBriefing(this.ensureKnowledgeState(faction), battleHexKey, this.currentSegment);
    }
    /** Builds the truth-bearing tactical payload inside the state boundary while freezing a safe briefing. */
    buildCampaignEngagementContext(options, briefingFaction = "Player") {
        if (!this.scenario)
            return null;
        const intelligenceBriefing = buildIntelligenceBriefing(this.ensureKnowledgeState(briefingFaction), options.battleHexKey, this.currentSegment);
        return buildEngagementContext(this.scenario, { ...options, intelligenceBriefing });
    }
    initializeCampaignIntelligence() {
        if (!this.scenario) {
            this.intelligenceByFaction = {};
            return;
        }
        this.intelligenceByFaction = {
            Player: createCampaignKnowledgeState(this.scenario, "Player", this.currentSegment),
            Bot: createCampaignKnowledgeState(this.scenario, "Bot", this.currentSegment)
        };
    }
    ensureKnowledgeState(faction) {
        const key = String(faction);
        let state = this.intelligenceByFaction[key];
        if (!state) {
            if (!this.scenario)
                throw new Error("Cannot initialize campaign intelligence without a scenario.");
            state = createCampaignKnowledgeState(this.scenario, faction, this.currentSegment);
            this.intelligenceByFaction[key] = state;
        }
        return state;
    }
    refreshIntelCapacity() {
        if (!this.scenario)
            return;
        for (const [faction, state] of Object.entries(this.intelligenceByFaction)) {
            state.capacityTotal = calculateIntelCapacity(this.scenario, faction);
        }
    }
    setTurnState(state) {
        this.turnState = state ? structuredClone(state) : null;
        this.notify("turnAdvanced");
    }
    getTurnState() {
        return this.turnState ? structuredClone(this.turnState) : null;
    }
    /** Returns configured hex/day speed for a given unit type. Defaults to 1 if unknown. */
    getUnitSpeed(unitType) {
        return UNIT_SPEEDS_HEX_PER_DAY[unitType] ?? 1;
    }
    queueDecision(decision) {
        this.decisions.push(structuredClone(decision));
        this.notify("decisionsUpdated");
    }
    getQueuedDecisions() {
        return this.decisions.map((d) => structuredClone(d));
    }
    clearQueuedDecisions() {
        this.decisions = [];
        this.notify("decisionsUpdated");
    }
    setPendingEngagements(list) {
        this.engagements = list.map((e) => structuredClone(e));
        this.notify("engagementsUpdated");
    }
    getPendingEngagements() {
        return this.engagements.map((e) => structuredClone(e));
    }
    /** Marks a specific pending engagement as the one the commander is resolving next. */
    setActiveEngagementId(id) {
        this.activeEngagementId = id;
        this.notify("engagementsUpdated");
    }
    /** Returns the id of the currently active engagement, if any. */
    getActiveEngagementId() {
        return this.activeEngagementId;
    }
    /** Returns the full record for the currently active engagement, if any. */
    getActiveEngagement() {
        const id = this.activeEngagementId;
        if (!id)
            return null;
        const found = this.engagements.find((e) => e.id === id) ?? null;
        return found ? structuredClone(found) : null;
    }
    setHeadquartersStatusMessage(message) {
        this.headquartersStatusMessage = message ? { ...message } : null;
        this.notify("headquartersStatusUpdated");
    }
    getHeadquartersStatusMessage() {
        return this.headquartersStatusMessage ? { ...this.headquartersStatusMessage } : null;
    }
    /** Returns the current campaign segment (0 = Day 1, 00:00-03:00). */
    getCurrentSegment() {
        return this.currentSegment;
    }
    /** Returns the current day number (1-based). */
    getCurrentDay() {
        return Math.floor(this.currentSegment / 8) + 1;
    }
    /** Returns the segment within the current day (0-7). */
    getSegmentOfDay() {
        return this.currentSegment % 8;
    }
    /**
     * Returns a human-readable time string for the current segment.
     * Example: "Day 5, 09:00-12:00"
     */
    getCurrentTimeDisplay() {
        const day = this.getCurrentDay();
        const segmentOfDay = this.getSegmentOfDay();
        const hourStart = segmentOfDay * 3;
        const hourEnd = hourStart + 3;
        const formatHour = (h) => h.toString().padStart(2, '0');
        return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
    }
    /**
     * Converts a segment number to a display string.
     * Example: segmentToTimeDisplay(16) = "Day 3, 00:00-03:00"
     */
    segmentToTimeDisplay(segment) {
        const day = Math.floor(segment / 8) + 1;
        const segmentOfDay = segment % 8;
        const hourStart = segmentOfDay * 3;
        const hourEnd = hourStart + 3;
        const formatHour = (h) => h.toString().padStart(2, '0');
        return `Day ${day}, ${formatHour(hourStart)}:00-${formatHour(hourEnd)}:00`;
    }
    /**
     * Advances the campaign by one 3-hour segment.
     * Daily resource generation occurs every 8 segments (once per day).
     * Redeployments and front updates are processed each segment.
     */
    advanceSegment() {
        this.currentSegment += 1;
        // Process daily resource generation every 8 segments (at start of each new day)
        if (this.currentSegment % 8 === 0) {
            this.processDailyResourceGeneration();
        }
        // Process redeployments and front updates every segment
        this.processScheduledRedeployments();
        this.updateFrontsForHeldTiles();
        // Update power values after processing
        this.updatePowerValues();
        // Resolve observations, report fusion, staleness, and counterintelligence symmetrically.
        if (this.scenario) {
            for (const faction of ["Player", "Bot"])
                this.ensureKnowledgeState(faction);
            const bot = this.intelligenceByFaction.Bot;
            const botOperation = scheduleBaselineBotOperation(this.scenario, bot, this.currentSegment);
            if (botOperation) {
                const botEconomy = this.scenario.economies.find((entry) => entry.faction === "Bot");
                if (botEconomy && botEconomy.supplies >= botOperation.suppliesCost && botEconomy.fuel >= botOperation.fuelCost) {
                    botEconomy.supplies -= botOperation.suppliesCost;
                    botEconomy.fuel -= botOperation.fuelCost;
                    bot.operations.push(botOperation);
                }
            }
            this.intelligenceByFaction = resolveCampaignIntelligenceSegment(this.scenario, this.intelligenceByFaction, this.currentSegment);
        }
        this.notify("dayAdvanced"); // Event name kept for compatibility
        this.notify("intelligenceUpdated");
    }
    /**
     * Legacy method for compatibility. Advances by 8 segments (1 full day).
     * @deprecated Use advanceSegment() instead for granular control.
     */
    advanceDay() {
        for (let i = 0; i < 8; i++) {
            this.advanceSegment();
        }
    }
    /**
     * Processes daily resource generation based on controlled tiles.
     * Each controlled tile contributes to faction economy based on its supplyValue.
     */
    processDailyResourceGeneration() {
        if (!this.scenario)
            return;
        // Player output honors the commander's industrial allocation; Bot keeps the legacy
        // fixed formula so enemy balance is unchanged by the allocation feature.
        let playerCapacity = 0;
        const botIncome = { supplies: 0, fuel: 0, manpower: 0 };
        for (const tile of this.scenario.tiles) {
            const palette = this.scenario.tilePalette[tile.tile];
            if (!palette)
                continue;
            const supplyValue = palette.supplyValue ?? 0;
            const faction = tile.factionControl ?? palette.factionControl;
            if (faction === "Player") {
                playerCapacity += supplyValue;
            }
            else if (faction === "Bot") {
                botIncome.supplies += supplyValue;
                botIncome.fuel += Math.round(supplyValue * 0.8);
                botIncome.manpower += Math.round(supplyValue * 100);
            }
        }
        // Apply income to economies
        const economies = this.scenario.economies.map((e) => ({ ...e }));
        const playerEconomy = economies.find((e) => e.faction === "Player");
        const botEconomy = economies.find((e) => e.faction === "Bot");
        if (playerEconomy) {
            const output = computeDailyProduction(playerCapacity, this.getProductionAllocation());
            playerEconomy.supplies = (playerEconomy.supplies ?? 0) + output.supplies;
            playerEconomy.fuel = (playerEconomy.fuel ?? 0) + output.fuel;
            playerEconomy.ammo = (playerEconomy.ammo ?? 0) + output.ammo;
            playerEconomy.manpower = (playerEconomy.manpower ?? 0) + output.manpower;
        }
        if (botEconomy) {
            botEconomy.supplies = (botEconomy.supplies ?? 0) + botIncome.supplies;
            botEconomy.fuel = (botEconomy.fuel ?? 0) + botIncome.fuel;
            botEconomy.manpower = (botEconomy.manpower ?? 0) + botIncome.manpower;
        }
        this.scenario.economies = economies;
        this.notify("scenarioLoaded"); // Trigger economy re-render
    }
    /** Returns the player's industrial allocation, falling back to the balanced default. */
    getProductionAllocation() {
        const player = this.scenario?.economies.find((e) => e.faction === "Player");
        const alloc = player?.productionAllocation;
        if (!alloc)
            return { ...DEFAULT_PRODUCTION_ALLOCATION };
        return { ...alloc };
    }
    /**
     * Stores a new industrial allocation on the Player economy (so it persists through
     * both localStorage snapshots and JSON exports). Values are clamped to >= 0 and
     * normalized to sum to exactly 100.
     */
    setProductionAllocation(allocation) {
        if (!this.scenario)
            return { ok: false, reason: "No scenario" };
        const player = this.scenario.economies.find((e) => e.faction === "Player");
        if (!player)
            return { ok: false, reason: "No player economy" };
        const clamped = {
            supplies: Math.max(0, Number(allocation.supplies) || 0),
            fuel: Math.max(0, Number(allocation.fuel) || 0),
            ammo: Math.max(0, Number(allocation.ammo) || 0),
            manpower: Math.max(0, Number(allocation.manpower) || 0)
        };
        const total = clamped.supplies + clamped.fuel + clamped.ammo + clamped.manpower;
        if (total <= 0)
            return { ok: false, reason: "Allocation must be greater than zero" };
        // Normalize to 100, assigning rounding drift to the largest bucket to keep the sum exact.
        const normalized = {
            supplies: Math.round((clamped.supplies / total) * 100),
            fuel: Math.round((clamped.fuel / total) * 100),
            ammo: Math.round((clamped.ammo / total) * 100),
            manpower: Math.round((clamped.manpower / total) * 100)
        };
        const drift = 100 - (normalized.supplies + normalized.fuel + normalized.ammo + normalized.manpower);
        if (drift !== 0) {
            const keys = ["supplies", "fuel", "ammo", "manpower"];
            const largest = keys.reduce((best, k) => (normalized[k] > normalized[best] ? k : best), keys[0]);
            normalized[largest] += drift;
        }
        player.productionAllocation = normalized;
        this.notify("scenarioLoaded");
        return { ok: true };
    }
    /**
     * Snapshot of the player's war economy production: total capacity, where it comes
     * from, what today's allocation yields, and when the next production tick lands.
     */
    getProductionReport() {
        if (!this.scenario)
            return null;
        const sources = [];
        let capacity = 0;
        for (const tile of this.scenario.tiles) {
            const palette = this.scenario.tilePalette[tile.tile];
            if (!palette)
                continue;
            const faction = tile.factionControl ?? palette.factionControl;
            if (faction !== "Player")
                continue;
            const supplyValue = palette.supplyValue ?? 0;
            if (supplyValue <= 0)
                continue;
            capacity += supplyValue;
            sources.push({
                offsetKey: this.axialToOffsetKey(tile.hex.q, tile.hex.r),
                tile: tile.tile,
                role: palette.role ?? null,
                supplyValue
            });
        }
        sources.sort((a, b) => b.supplyValue - a.supplyValue);
        const allocation = this.getProductionAllocation();
        const remainder = this.currentSegment % 8;
        return {
            capacity,
            allocation,
            daily: computeDailyProduction(capacity, allocation),
            sources,
            segmentsUntilNextTick: remainder === 0 ? 8 : 8 - remainder
        };
    }
    /**
     * Auto-calculates Air Power, Naval Power, and Intel Coverage based on strategic assets.
     * Air Power = (airbases × 10) + (aircraft count)
     * Naval Power = (naval bases × 10) + (ship count)
     * Intel Coverage = (controlled bases × 2)
     */
    updatePowerValues() {
        if (!this.scenario)
            return;
        const playerStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };
        const botStats = { airbases: 0, navalBases: 0, bases: 0, aircraft: 0, ships: 0 };
        // Count bases by faction
        for (const tile of this.scenario.tiles) {
            const palette = this.scenario.tilePalette[tile.tile];
            if (!palette)
                continue;
            const faction = tile.factionControl ?? palette.factionControl;
            const stats = faction === "Player" ? playerStats : faction === "Bot" ? botStats : null;
            if (!stats)
                continue;
            // Count bases
            if (palette.role === "airbase")
                stats.airbases++;
            else if (palette.role === "navalBase")
                stats.navalBases++;
            if (palette.role === "airbase" || palette.role === "navalBase" || palette.role === "logisticsHub" ||
                palette.role === "fortificationHeavy" || palette.role === "fortificationLight") {
                stats.bases++;
            }
            // Count units
            if (tile.forces) {
                for (const force of tile.forces) {
                    const unitType = force.unitType.toLowerCase();
                    if (unitType.includes("fighter") || unitType.includes("bomber")) {
                        stats.aircraft += force.count;
                    }
                    else if (unitType.includes("ship") || unitType.includes("battleship") || unitType.includes("destroyer")) {
                        stats.ships += force.count;
                    }
                }
            }
        }
        // Calculate power values
        const calculatePower = (stats) => ({
            airPower: (stats.airbases * 10) + stats.aircraft,
            navalPower: (stats.navalBases * 10) + stats.ships,
            intelCoverage: stats.bases * 2
        });
        const playerPower = calculatePower(playerStats);
        const botPower = calculatePower(botStats);
        // Update economies
        const economies = this.scenario.economies.map((e) => ({ ...e }));
        const playerEconomy = economies.find((e) => e.faction === "Player");
        const botEconomy = economies.find((e) => e.faction === "Bot");
        if (playerEconomy) {
            playerEconomy.airPower = playerPower.airPower;
            playerEconomy.navalPower = playerPower.navalPower;
            playerEconomy.intelCoverage = playerPower.intelCoverage;
        }
        if (botEconomy) {
            botEconomy.airPower = botPower.airPower;
            botEconomy.navalPower = botPower.navalPower;
            botEconomy.intelCoverage = botPower.intelCoverage;
        }
        this.scenario.economies = economies;
    }
    /** Moves all player forces from an origin hex to an adjacent destination hex. Returns true on success. */
    moveForces(originHexKey, destHexKey) {
        if (!this.scenario)
            return false;
        const origin = this.findTileByOffsetKey(originHexKey);
        if (!origin)
            return false;
        const paletteOrigin = this.scenario.tilePalette[origin.tile];
        const owner = origin.factionControl ?? paletteOrigin?.factionControl;
        if (owner !== "Player")
            return false;
        const moving = Array.isArray(origin.forces) ? origin.forces : [];
        if (moving.length === 0)
            return false;
        // Ensure destination instance exists; if absent, create a neutral region and mark as Player-controlled on arrival
        let dest = this.findTileByOffsetKey(destHexKey);
        if (!dest) {
            const coords = this.parseOffsetKeyToAxial(destHexKey);
            if (!coords)
                return false;
            const newDest = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [] };
            this.scenario.tiles.push(newDest);
            dest = newDest;
        }
        // Merge force groups by unitType at destination
        const merge = {};
        (Array.isArray(dest.forces) ? dest.forces : []).forEach((g) => {
            merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
        });
        moving.forEach((g) => {
            merge[g.unitType] = (merge[g.unitType] ?? 0) + g.count;
        });
        dest.forces = Object.entries(merge).map(([unitType, count]) => ({ unitType, count }));
        // Set control to Player if not explicitly enemy-held
        const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
        if (destOwner !== "Bot") {
            dest.factionControl = "Player";
            dest.controlSinceSegment = this.currentSegment;
        }
        // Clear origin after move
        origin.forces = [];
        this.notify("scenarioLoaded");
        return true;
    }
    /**
     * Calculates realistic resource costs for a redeployment based on unit types and transport mode.
     * Returns fuel cost, supplies cost, manpower loss, and transport capacity needed.
     */
    /**
     * Non-mutating preview of a redeploy order. Returns the exact costs and validation
     * results scheduleRedeploy() would apply, so UI previews never drift from engine rules.
     */
    previewRedeploy(originOffsetKey, destOffsetKey, selections, transportModeKey) {
        if (!this.scenario)
            return null;
        const transportMode = getTransportMode(transportModeKey);
        const a = this.parseOffsetKeyToAxial(originOffsetKey);
        const b = this.parseOffsetKeyToAxial(destOffsetKey);
        if (!transportMode || !a || !b)
            return null;
        const issues = [];
        const distance = Math.max(1, hexDistance(a, b));
        const origin = this.findTileByOffsetKey(originOffsetKey);
        const paletteOrigin = origin ? this.scenario.tilePalette[origin.tile] : null;
        const dest = this.findTileByOffsetKey(destOffsetKey);
        const paletteDest = dest ? this.scenario.tilePalette[dest.tile] : null;
        const active = selections.filter((s) => s.count > 0);
        if (active.length === 0) {
            issues.push("No units selected");
        }
        for (const sel of active) {
            if (transportMode.applicableUnitTypes && transportMode.applicableUnitTypes.length > 0 && !transportMode.applicableUnitTypes.includes(sel.unitType)) {
                issues.push(`${sel.unitType} cannot use ${transportMode.label}`);
            }
        }
        if (transportMode.requiresNavalBase && paletteOrigin?.role !== "navalBase" && paletteDest?.role !== "navalBase") {
            issues.push("Requires a naval base at origin or destination");
        }
        if (transportMode.requiresAirbase && (paletteOrigin?.role !== "airbase" || paletteDest?.role !== "airbase")) {
            issues.push("Requires airbases at both origin and destination");
        }
        const costs = calculateCampaignRedeploymentCosts(active, distance, transportMode);
        const player = this.scenario.economies.find((e) => e.faction === "Player");
        const fuelAvailable = player?.fuel ?? 0;
        const suppliesAvailable = player?.supplies ?? 0;
        if (fuelAvailable < costs.fuelCost) {
            issues.push(`Insufficient fuel (need ${costs.fuelCost.toLocaleString()}, have ${fuelAvailable.toLocaleString()})`);
        }
        if (suppliesAvailable < costs.suppliesCost) {
            issues.push(`Insufficient supplies (need ${costs.suppliesCost.toLocaleString()}, have ${suppliesAvailable.toLocaleString()})`);
        }
        let capacityAvailable = null;
        if (transportMode.capacityType) {
            const cap = player?.transportCapacity;
            const available = cap ? (cap[transportMode.capacityType] ?? 0) : 0;
            const inTransit = cap ? (cap[`${transportMode.capacityType}InTransit`] ?? 0) : 0;
            capacityAvailable = available - inTransit;
            if (costs.capacityNeeded > capacityAvailable) {
                issues.push(`Insufficient ${transportMode.capacityType} (need ${costs.capacityNeeded}, available ${capacityAvailable})`);
            }
        }
        const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
        return {
            ok: issues.length === 0,
            issues,
            distance,
            timeSegments,
            etaSegment: this.currentSegment + timeSegments,
            fuelCost: costs.fuelCost,
            suppliesCost: costs.suppliesCost,
            manpowerLoss: costs.manpowerLoss,
            capacityNeeded: costs.capacityNeeded,
            capacityAvailable,
            fuelAvailable,
            suppliesAvailable
        };
    }
    /**
     * Schedules a long-range redeployment using a specified transport mode.
     * Validates requirements (capacity, bases, resources) and reserves transport assets.
     */
    scheduleRedeploy(originOffsetKey, destOffsetKey, selections, transportModeKey = "foot") {
        if (!this.scenario)
            return { ok: false, reason: "No scenario" };
        // Validate origin
        const origin = this.findTileByOffsetKey(originOffsetKey);
        if (!origin)
            return { ok: false, reason: "Invalid origin" };
        const paletteOrigin = this.scenario.tilePalette[origin.tile];
        const owner = origin.factionControl ?? paletteOrigin?.factionControl;
        if (owner !== "Player")
            return { ok: false, reason: "Origin not player-controlled" };
        // Validate destination
        const dest = this.findTileByOffsetKey(destOffsetKey);
        const paletteDest = dest ? this.scenario.tilePalette[dest.tile] : null;
        // Get transport mode
        const transportMode = getTransportMode(transportModeKey);
        if (!transportMode)
            return { ok: false, reason: "Invalid transport mode" };
        // Calculate distance
        const a = this.parseOffsetKeyToAxial(originOffsetKey);
        const b = this.parseOffsetKeyToAxial(destOffsetKey);
        if (!a || !b)
            return { ok: false, reason: "Invalid coordinates" };
        const distance = Math.max(1, hexDistance(a, b));
        // Validate unit selection
        const totalUnits = selections.reduce((sum, s) => sum + Math.max(0, s.count), 0);
        if (totalUnits <= 0)
            return { ok: false, reason: "No units selected" };
        // Validate unit types are compatible with transport mode
        for (const sel of selections) {
            if (sel.count <= 0)
                continue;
            if (transportMode.applicableUnitTypes && transportMode.applicableUnitTypes.length > 0) {
                if (!transportMode.applicableUnitTypes.includes(sel.unitType)) {
                    return { ok: false, reason: `${sel.unitType} cannot use ${transportMode.label}` };
                }
            }
        }
        // Validate naval base requirements
        if (transportMode.requiresNavalBase) {
            const originRole = paletteOrigin?.role;
            const destRole = paletteDest?.role;
            if (originRole !== "navalBase" && destRole !== "navalBase") {
                return { ok: false, reason: "Naval transport requires origin or destination to be a naval base" };
            }
        }
        // Validate airbase requirements
        if (transportMode.requiresAirbase) {
            const originRole = paletteOrigin?.role;
            const destRole = paletteDest?.role;
            if (originRole !== "airbase" || destRole !== "airbase") {
                return { ok: false, reason: "Air transport requires both origin and destination to be airbases" };
            }
        }
        // Calculate realistic resource costs based on unit types and transport mode
        const costs = calculateCampaignRedeploymentCosts(selections, distance, transportMode);
        const fuelCost = costs.fuelCost;
        const suppliesCost = costs.suppliesCost;
        const manpowerLoss = costs.manpowerLoss;
        const capacityNeeded = costs.capacityNeeded;
        // Check and reserve resources
        const economies = this.scenario.economies.map((e) => ({ ...e }));
        const player = economies.find((e) => e.faction === "Player");
        if (!player)
            return { ok: false, reason: "No player economy" };
        // Validate fuel and supplies
        if ((player.fuel ?? 0) < fuelCost) {
            return { ok: false, reason: `Insufficient fuel (need ${fuelCost}, have ${player.fuel ?? 0})` };
        }
        if ((player.supplies ?? 0) < suppliesCost) {
            return { ok: false, reason: `Insufficient supplies (need ${suppliesCost}, have ${player.supplies ?? 0})` };
        }
        // Validate and reserve transport capacity
        if (capacityNeeded > 0 && transportMode.capacityType) {
            if (!player.transportCapacity) {
                return { ok: false, reason: "No transport capacity available" };
            }
            const availableKey = transportMode.capacityType;
            const available = player.transportCapacity[availableKey] ?? 0;
            const inTransit = player.transportCapacity[`${availableKey}InTransit`] ?? 0;
            const totalAvailable = available - inTransit;
            if (totalAvailable < capacityNeeded) {
                return { ok: false, reason: `Insufficient ${availableKey} (need ${capacityNeeded}, available ${totalAvailable})` };
            }
            // Reserve capacity
            const inTransitKey = `${availableKey}InTransit`;
            player.transportCapacity[inTransitKey] = inTransit + capacityNeeded;
        }
        // Deduct resources
        player.fuel = Math.max(0, (player.fuel ?? 0) - fuelCost);
        player.supplies = Math.max(0, (player.supplies ?? 0) - suppliesCost);
        player.manpower = Math.max(0, (player.manpower ?? 0) - manpowerLoss);
        this.scenario.economies = economies;
        // Calculate transit time based on transport mode speed (speedHexPerDay is actually hex per segment now)
        const timeSegments = Math.max(1, Math.ceil(distance / transportMode.speedHexPerDay));
        const etaSegment = this.currentSegment + timeSegments;
        // Calculate when transport returns to pool (round trip for trucks/ships, immediate for planes)
        let returnEtaSegment = etaSegment;
        if (transportMode.capacityType === "trucks" || transportMode.capacityType === "transportShips") {
            returnEtaSegment = etaSegment + timeSegments; // Round trip
        }
        else if (transportMode.capacityType === "transportPlanes") {
            returnEtaSegment = etaSegment; // Planes return immediately after drop
        }
        // Create redeployment decision
        const id = `dec_redeploy_${Date.now()}`;
        const decision = {
            id,
            faction: "Player",
            type: "redeploy",
            payload: {
                originOffsetKey,
                destOffsetKey,
                selections: selections.map((s) => ({ unitType: s.unitType, count: s.count })),
                transportMode: transportModeKey,
                distance,
                timeSegments,
                etaSegment,
                returnEtaSegment,
                fuelCost,
                suppliesCost,
                manpowerLoss,
                capacityReserved: capacityNeeded > 0 ? { type: transportMode.capacityType, count: capacityNeeded } : undefined,
                status: "queued"
            },
            affectedHexKeys: [originOffsetKey, destOffsetKey]
        };
        this.queueDecision(decision);
        this.notify("scenarioLoaded");
        return { ok: true };
    }
    /** Executes due redeployments, releases transport capacity, and marks them completed. */
    processScheduledRedeployments() {
        if (!this.scenario)
            return;
        const updated = [];
        const economies = this.scenario.economies.map((e) => ({ ...e }));
        const player = economies.find((e) => e.faction === "Player");
        for (const d of this.decisions) {
            if (d.type !== "redeploy") {
                updated.push(d);
                continue;
            }
            // Support both new segment system and legacy day system
            const eta = Number(d.payload?.etaSegment ?? d.payload?.etaDay ?? NaN);
            const returnEta = Number(d.payload?.returnEtaSegment ?? d.payload?.returnEtaDay ?? NaN);
            const status = String(d.payload?.status ?? "queued");
            // Execute redeployment when forces arrive
            if (Number.isFinite(eta) && status === "queued" && eta <= this.currentSegment) {
                const originKey = String(d.payload?.originOffsetKey ?? "");
                const destKey = String(d.payload?.destOffsetKey ?? "");
                const selections = Array.isArray(d.payload?.selections) ? d.payload.selections : [];
                this.executeRedeploy(originKey, destKey, selections);
                // Mark as arrived (transport may still be returning)
                const arrived = { ...d, payload: { ...d.payload, status: "arrived", arrivedSegment: this.currentSegment } };
                updated.push(arrived);
                continue;
            }
            // Release transport capacity when vehicles return
            if (Number.isFinite(returnEta) && status === "arrived" && returnEta <= this.currentSegment) {
                const capacityReserved = d.payload?.capacityReserved;
                if (capacityReserved && player && player.transportCapacity) {
                    const inTransitKey = `${capacityReserved.type}InTransit`;
                    const current = player.transportCapacity[inTransitKey] ?? 0;
                    player.transportCapacity[inTransitKey] = Math.max(0, current - capacityReserved.count);
                }
                // Mark as completed
                const completed = { ...d, payload: { ...d.payload, status: "completed", completedSegment: this.currentSegment } };
                updated.push(completed);
                continue;
            }
            // Keep pending decisions
            updated.push(d);
        }
        this.decisions = updated;
        if (player) {
            this.scenario.economies = economies;
        }
    }
    /** Moves a subset of forces along any distance and merges at destination; sets control day when captured. */
    executeRedeploy(originHexKey, destHexKey, selections) {
        if (!this.scenario)
            return;
        const origin = this.findTileByOffsetKey(originHexKey);
        if (!origin)
            return;
        let dest = this.findTileByOffsetKey(destHexKey);
        if (!dest) {
            const coords = this.parseOffsetKeyToAxial(destHexKey);
            if (!coords)
                return;
            const newDest = { tile: "neutralRegion", factionControl: "Player", hex: coords, forces: [], controlSinceSegment: this.currentSegment };
            this.scenario.tiles.push(newDest);
            dest = newDest;
        }
        const available = {};
        (origin.forces ?? []).forEach((g) => (available[g.unitType] = (available[g.unitType] ?? 0) + g.count));
        const moving = {};
        selections.forEach((s) => {
            const cap = Math.max(0, Math.min(s.count, available[s.unitType] ?? 0));
            if (cap > 0)
                moving[s.unitType] = (moving[s.unitType] ?? 0) + cap;
        });
        const remain = { ...available };
        Object.entries(moving).forEach(([u, c]) => (remain[u] = Math.max(0, (remain[u] ?? 0) - c)));
        origin.forces = Object.entries(remain)
            .filter(([, c]) => c > 0)
            .map(([unitType, count]) => ({ unitType, count }));
        if (!dest)
            return; // Safety check (should never happen)
        const destMerge = {};
        (dest.forces ?? []).forEach((g) => (destMerge[g.unitType] = (destMerge[g.unitType] ?? 0) + g.count));
        Object.entries(moving).forEach(([u, c]) => (destMerge[u] = (destMerge[u] ?? 0) + c));
        dest.forces = Object.entries(destMerge).map(([unitType, count]) => ({ unitType, count }));
        const destOwner = dest.factionControl ?? this.scenario.tilePalette[dest.tile]?.factionControl;
        if (destOwner !== "Bot") {
            dest.factionControl = "Player";
            if (!dest.controlSinceSegment)
                dest.controlSinceSegment = this.currentSegment;
        }
        this.notify("scenarioLoaded");
    }
    /** Extends fronts by adding tiles held for 16+ segments (2 days) for both factions. */
    updateFrontsForHeldTiles() {
        if (!this.scenario)
            return;
        const fronts = this.scenario.fronts.map((f) => ({ ...f, hexKeys: [...f.hexKeys] }));
        const ensureFront = (initiative) => {
            let f = fronts.find((x) => x.initiative === initiative);
            if (!f) {
                f = { key: initiative === "Player" ? "player-front" : "bot-front", label: initiative === "Player" ? "Player Front" : "Enemy Front", hexKeys: [], initiative };
                fronts.push(f);
            }
            return f;
        };
        const extendFor = (initiative) => {
            const front = ensureFront(initiative);
            const set = new Set(front.hexKeys);
            for (const t of this.scenario.tiles) {
                const palette = this.scenario.tilePalette[t.tile];
                const owner = t.factionControl ?? palette?.factionControl;
                if (owner !== initiative)
                    continue;
                const since = t.controlSinceSegment ?? null;
                if (!since || this.currentSegment - since < 16)
                    continue; // 16 segments = 2 days
                const key = this.axialToOffsetKey(t.hex.q, t.hex.r);
                if (set.has(key))
                    continue;
                const neighbors = this.neighborAxials(t.hex.q, t.hex.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
                const neighborOnFront = neighbors.find((k) => front.hexKeys.includes(k));
                if (neighborOnFront) {
                    const idx = front.hexKeys.indexOf(neighborOnFront);
                    if (idx === front.hexKeys.length - 1)
                        front.hexKeys.push(key);
                    else
                        front.hexKeys.splice(idx + 1, 0, key);
                }
                else {
                    front.hexKeys.push(key);
                }
                set.add(key);
            }
        };
        extendFor("Player");
        extendFor("Bot");
        this.scenario.fronts = fronts;
        this.notify("scenarioLoaded");
    }
    estimateTimeDaysForSelection(distance, selections) {
        const speeds = selections
            .filter((s) => (s.count ?? 0) > 0)
            .map((s) => Math.max(1, this.getUnitSpeed(s.unitType)));
        const slowest = speeds.length > 0 ? Math.min(...speeds) : 1;
        return Math.max(1, Math.ceil(distance / Math.max(1, slowest)));
    }
    /** Returns the controlling faction of the tile at the given offset hex key, or null when no tile exists. */
    getTileOwner(offsetHexKey) {
        if (!this.scenario)
            return null;
        const inst = this.findTileByOffsetKey(offsetHexKey);
        if (!inst)
            return null;
        return inst.factionControl ?? this.scenario.tilePalette[inst.tile]?.factionControl ?? null;
    }
    /**
     * Returns the offset hex key of the first Bot-controlled tile adjacent to the given hex, or null.
     * Used to resolve the contested battle hex when the player queues a proximity engagement.
     */
    findAdjacentEnemyHexKey(offsetHexKey) {
        if (!this.scenario)
            return null;
        const coords = this.parseOffsetKeyToAxial(offsetHexKey);
        if (!coords)
            return null;
        for (const ax of this.neighborAxials(coords.q, coords.r)) {
            const key = this.axialToOffsetKey(ax.q, ax.r);
            const inst = this.findTileByOffsetKey(key);
            if (!inst)
                continue;
            const owner = inst.factionControl ?? this.scenario.tilePalette[inst.tile]?.factionControl;
            if (owner === "Bot")
                return key;
        }
        return null;
    }
    /** Returns true if the given offset hex key is adjacent to any Bot-controlled tile. */
    isAdjacentToEnemy(offsetHexKey) {
        if (!this.scenario)
            return false;
        const coords = this.parseOffsetKeyToAxial(offsetHexKey);
        if (!coords)
            return false;
        const neighbors = this.neighborAxials(coords.q, coords.r).map((ax) => this.axialToOffsetKey(ax.q, ax.r));
        return neighbors.some((k) => {
            const inst = this.findTileByOffsetKey(k);
            if (!inst)
                return false;
            const owner = inst.factionControl ?? this.scenario.tilePalette[inst.tile]?.factionControl;
            return owner === "Bot";
        });
    }
    findTileByOffsetKey(offsetKey) {
        if (!this.scenario)
            return undefined;
        const coords = this.parseOffsetKeyToAxial(offsetKey);
        if (!coords)
            return undefined;
        return this.scenario.tiles.find((t) => t.hex.q === coords.q && t.hex.r === coords.r);
    }
    parseOffsetKeyToAxial(offsetKey) {
        const parts = offsetKey.split(",");
        const col = Number(parts[0]);
        const row = Number(parts[1]);
        if (!Number.isFinite(col) || !Number.isFinite(row))
            return null;
        const q = col;
        const r = row - Math.floor(col / 2);
        return { q, r };
    }
    axialToOffsetKey(q, r) {
        const col = q;
        const row = r + Math.floor(q / 2);
        return `${col},${row}`;
    }
    neighborAxials(q, r) {
        const dirs = [
            { q: +1, r: 0 },
            { q: +1, r: -1 },
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: -1, r: +1 },
            { q: 0, r: +1 }
        ];
        return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
    }
    /**
     * Applies a battle outcome to the campaign layer by updating economies, shifting the affected front,
     * and clearing the resolved engagement from the queue. The logic is intentionally conservative and
     * uses simple placeholder math so designers can tune values later without structural changes.
     */
    applyBattleOutcome(outcome) {
        if (!this.scenario) {
            return;
        }
        const resolvedId = outcome.activeEngagementId ?? this.activeEngagementId;
        const resolvedEngagement = resolvedId
            ? this.engagements.find((engagement) => engagement.id === resolvedId) ?? null
            : null;
        const battleHexKey = resolvedEngagement?.context?.battleHexKey ?? resolvedEngagement?.hexKeys[0] ?? null;
        // 1) Deduct expended resources from the Player economy (defensive guards keep totals non-negative)
        const economies = this.scenario.economies.map((e) => ({ ...e }));
        const player = economies.find((e) => e.faction === "Player");
        if (player) {
            player.supplies = Math.max(0, (player.supplies ?? 0) - Math.max(0, outcome.spentAmmo));
            player.fuel = Math.max(0, (player.fuel ?? 0) - Math.max(0, outcome.spentFuel));
            // Casualties are modeled as a manpower reduction. We use a coarse 10:1 mapping consistent with precombat caps.
            player.manpower = Math.max(0, (player.manpower ?? 0) - Math.max(0, outcome.casualties * 10));
        }
        this.scenario.economies = economies;
        // 2) Shift the front as a simple visual feedback: remove one segment toward the losing side
        const frontKey = outcome.frontKey ?? this.getActiveEngagement()?.frontKey ?? null;
        if (frontKey) {
            const fronts = this.scenario.fronts.map((f) => ({ ...f, hexKeys: [...f.hexKeys] }));
            const front = fronts.find((f) => f.key === frontKey);
            if (front) {
                if (outcome.result === "PlayerVictory") {
                    // Advance the front: drop the first segment so the polyline appears to move forward.
                    if (front.hexKeys.length > 1)
                        front.hexKeys.shift();
                    front.initiative = "Player";
                }
                else if (outcome.result === "PlayerDefeat") {
                    // Lose ground: drop the last segment.
                    if (front.hexKeys.length > 1)
                        front.hexKeys.pop();
                    front.initiative = "Bot";
                }
            }
            this.scenario.fronts = fronts;
        }
        // 3) Clear the resolved engagement from the queue.
        if (resolvedId) {
            this.engagements = this.engagements.filter((e) => e.id !== resolvedId);
            if (this.activeEngagementId === resolvedId) {
                this.activeEngagementId = null;
            }
            this.notify("engagementsUpdated");
        }
        // 4) Both combatants receive the same class of first-hand battlefield report. The fusion
        // remains faction-local, so neither AI nor UI gains access to the opponent's knowledge state.
        if (battleHexKey) {
            for (const faction of ["Player", "Bot"]) {
                this.intelligenceByFaction[faction] = recordBattlefieldIntelligence(this.scenario, this.ensureKnowledgeState(faction), battleHexKey, this.currentSegment);
            }
            this.notify("intelligenceUpdated");
        }
        // 5) Emit a scenario mutation so renderers re-read updated fronts and economy.
        this.notify("scenarioLoaded");
    }
    reset() {
        this.scenario = null;
        this.scenarioDefinition = null;
        this.authoredScenarioSource = null;
        this.runtime = null;
        this.compatibilityProjectionHash = null;
        this.turnState = null;
        this.decisions = [];
        this.engagements = [];
        this.activeEngagementId = null;
        this.currentSegment = 0;
        this.headquartersStatusMessage = null;
        this.intelligenceByFaction = {};
        this.notify("reset");
    }
}
let campaignStateInstance = null;
export function ensureCampaignState() {
    if (!campaignStateInstance) {
        campaignStateInstance = new CampaignState();
    }
    return campaignStateInstance;
}
