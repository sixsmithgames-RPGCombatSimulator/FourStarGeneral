import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  CampaignOrder,
  CampaignOrderCancellationPreview,
  CampaignReservation
} from "../src/game/campaign/orders/CampaignOrderTypes";
import {
  formatCampaignReservationLabel,
  projectCampaignOperationsWorkspace,
  type CampaignOperationsOrderSource,
  type CampaignOperationsWorkspaceProjectionInput
} from "../src/ui/campaign/CampaignOperationsWorkspaceProjection";
import { registerTest } from "./harness.js";

function orderBase(id: string, status: CampaignOrder["status"]) {
  return {
    id,
    faction: "Player" as const,
    status,
    issuedSegment: 2,
    earliestStartSegment: 3,
    targetHexKeys: ["4,4"],
    formationIds: [],
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: { valid: true, issues: [], validatedRevision: 7 }
  };
}

function cancellation(orderId: string, canCancel: boolean): CampaignOrderCancellationPreview {
  return {
    orderId,
    canCancel,
    reasonCode: canCancel ? null : "ORDER_OPERATION_INVALID",
    reason: canCancel ? "One reservation will be released." : "This order has already started or ended.",
    correctiveAction: canCancel ? "Confirm only if delay is acceptable." : "Issue a follow-on order.",
    releasedReservations: [],
    sunkCostSummary: canCancel ? "No sunk cost before execution; committed resource charges are refunded exactly." : "No cancellation was applied.",
    delaySummary: "The current order remains in force.",
    exposureSummary: "Review its lifecycle."
  };
}

function source(
  order: CampaignOrder,
  overrides: Partial<Omit<CampaignOperationsOrderSource, "order">> = {}
): CampaignOperationsOrderSource {
  return {
    order,
    reservations: [],
    cancellation: cancellation(order.id, false),
    formationName: null,
    intelRule: null,
    intelAssetLabel: null,
    redeployExecution: null,
    ...overrides
  };
}

function inputFor(orders: CampaignOperationsOrderSource[]): CampaignOperationsWorkspaceProjectionInput {
  return {
    orders,
    commitPreview: {
      canCommit: false,
      draftIds: ["production", "repair"],
      validDraftCount: 1,
      blockers: [{
        orderId: "production",
        code: "ORDER_RESOURCE_INSUFFICIENT",
        message: "The support allocation conflicts with an earlier draft.",
        reservationId: "reservation-production"
      }]
    },
    commitBusy: true,
    commitFeedback: { feedback: "Commit retained every draft.", feedbackTone: "warning" },
    formatSegment: (segment) => `T${segment}`,
    formatLabel: (value) => value === "road" ? "Road" : value,
    resolveLocationLabel: (hexKey) => ({
      "1,1": "Utah staging area",
      "4,4": "Cherbourg sector",
      "5,4": "Cotentin corridor",
      "7,7": "Enemy rear area"
    })[hexKey] ?? `Position ${hexKey}`
  };
}

function projectionFixtures(): CampaignOperationsOrderSource[] {
  const redeploy = {
    ...orderBase("redeploy", "executing"),
    kind: "redeploy",
    executionRefId: "movement-1",
    targetHexKeys: ["5,4"],
    payload: {
      originOffsetKey: "1,1",
      destinationOffsetKey: "5,4",
      originRuntimeHexKey: "1,1",
      destinationRuntimeHexKey: "4,2",
      selections: [{ unitType: "infantry", count: 2 }],
      transportModeKey: "road",
      transportCapacityType: "trucks",
      distance: 4,
      timeSegments: 2,
      etaSegment: 5,
      returnEtaSegment: 8,
      fuelCost: 1200,
      suppliesCost: 500,
      manpowerCost: 0,
      transportCapacityCost: 3
    }
  } as CampaignOrder;
  const production = {
    ...orderBase("production", "draft"),
    kind: "production",
    validation: {
      valid: false,
      issues: [{
        code: "ORDER_RESOURCE_INSUFFICIENT",
        message: "The support allocation conflicts with an earlier draft.",
        reservationId: "reservation-production"
      }],
      validatedRevision: 7
    },
    dependencies: ["redeploy"],
    payload: { allocation: { supplies: 40, fuel: 30, ammo: 20, manpower: 10 }, effectiveSegment: 6 }
  } as CampaignOrder;
  const repair = {
    ...orderBase("repair", "draft"),
    kind: "infrastructureRepair",
    payload: {
      targetOffsetHexKey: "4,4",
      targetRuntimeHexKey: "4,2",
      role: "navalBase",
      engineerFormationId: "engineers",
      sourceIntegrity: 4,
      targetIntegrity: 10,
      repairPoints: 6,
      repairRate: 2,
      durationSegments: 3,
      startSegment: 3,
      completeSegment: 6,
      suppliesCost: 300,
      manpowerCost: 25
    }
  } as CampaignOrder;
  const recovery = {
    ...orderBase("recovery", "committed"),
    kind: "formationRecovery",
    payload: {
      policyVersion: 1,
      formationId: "formation-1",
      sourceRuntimeHexKey: "4,2",
      sourceOffsetHexKey: "4,4",
      sourceStatus: "shattered",
      sourceFingerprint: "fixture",
      resumedFromOrderId: "recovery-old",
      minimumDurationSegments: 2,
      medicalWorkPoints: 10,
      equipmentWorkPoints: 4,
      damagedEquipment: 5,
      disabledEquipment: 2,
      personnelToFit: 80,
      equipmentToOperational: 3,
      permanentPersonnelLosses: 20,
      permanentEquipmentLosses: 2,
      suppliesCost: 150,
      durationSegments: 2,
      startSegment: 3,
      completeSegment: 5,
      projectedReadiness: 67.6,
      progress: {
        completedSegments: 1,
        lastProcessedSegment: 4,
        personnelReturnedToFit: 40,
        equipmentReturnedToOperational: 1,
        conditionHash: "condition"
      }
    }
  } as CampaignOrder;
  const intelligence = {
    ...orderBase("recon", "committed"),
    kind: "reconnaissance",
    targetHexKeys: ["7,7"],
    payload: {
      operationType: "airRecon",
      targetHexKey: "7,7",
      assignedAssetKey: "wing-1",
      targetContactId: null,
      durationSegments: 2,
      capacityCost: 1,
      suppliesCost: 75,
      fuelCost: 250,
      resolveSegment: 7
    }
  } as CampaignOrder;

  const reservation: CampaignReservation = {
    id: "reservation-production",
    orderId: "production",
    faction: "Player",
    kind: "resource",
    poolKey: "supplies",
    amount: 500,
    status: "held",
    createdSegment: 2
  };
  return [
    source(redeploy, { redeployExecution: { status: "arrived", arrivedSegment: 5 } }),
    source(production, { reservations: [reservation] }),
    source(repair),
    source(recovery, { formationName: "1st Infantry Division", cancellation: cancellation("recovery", true) }),
    source(intelligence, {
      intelRule: { label: "Aerial reconnaissance", targetRadius: 2 },
      intelAssetLabel: "9th Reconnaissance Wing",
      cancellation: cancellation("recon", true)
    })
  ];
}

registerTest("CAMPAIGN_OPERATIONS_WORKSPACE_PRESERVES_ORDER_COPY_LIFECYCLE_AND_COMMIT_PARITY", () => {
  const projected = projectCampaignOperationsWorkspace(inputFor(projectionFixtures()));

  assert.deepEqual(projected.orders.map((order) => ({
    id: order.id,
    label: order.label,
    status: order.status,
    eta: order.eta,
    canEdit: order.canEdit,
    canMoveEarlier: order.canMoveEarlier,
    canMoveLater: order.canMoveLater,
    canCancel: order.canCancel
  })), [
    { id: "redeploy", label: "Redeploy formation", status: "executing", eta: "Transport available T8", canEdit: false, canMoveEarlier: false, canMoveLater: false, canCancel: false },
    { id: "production", label: "Set Allied support allocation", status: "conflict", eta: "Effective T6", canEdit: true, canMoveEarlier: false, canMoveLater: true, canCancel: false },
    { id: "repair", label: "Repair naval Base", status: "draft", eta: "ETA T6", canEdit: false, canMoveEarlier: true, canMoveLater: false, canCancel: false },
    { id: "recovery", label: "Formation recovery continuation", status: "committed", eta: "ETA T5", canEdit: false, canMoveEarlier: false, canMoveLater: false, canCancel: true },
    { id: "recon", label: "Aerial reconnaissance", status: "committed", eta: "ETA T7", canEdit: false, canMoveEarlier: false, canMoveLater: false, canCancel: true }
  ]);
  assert.equal(projected.orders[0].detail, "Formations arrived at Cotentin corridor; trucks return T8.");
  assert.equal(projected.orders[0].timingSummary, "T3 start · Arrival T5 · Transport available T8");
  assert.equal(projected.orders[0].nextTransition, "Trucks return T8");
  assert.equal(projected.orders[1].reservationSummaries?.[0], "500 supplies · held");
  assert.equal(projected.orders[1].dependencySummary, "1 linked order dependency");
  assert.equal(projected.orders[2].routeSummary, "Cherbourg sector · Grid 4,4");
  assert.equal(projected.orders[3].detail, "1st Infantry Division · 80 surviving personnel · 3 equipment · projected readiness 68%");
  assert.equal(projected.orders[3].costSummary, "150 supply · 6 hours");
  assert.equal(projected.orders[4].detail, "Enemy rear area · 9th Reconnaissance Wing");
  assert.equal(projected.orders[4].routeSummary, "Enemy rear area · Grid 7,7 · radius 2 hex");
  assert.deepEqual(projected.orderCommit, {
    busy: true,
    draftCount: 2,
    validDraftCount: 1,
    blockerCount: 1,
    firstBlocker: "The support allocation conflicts with an earlier draft.",
    firstCorrectiveAction: "Reduce the order, release a competing hold, or wait for additional stocks.",
    feedback: "Commit retained every draft.",
    feedbackTone: "warning"
  });
});

registerTest("CAMPAIGN_OPERATIONS_WORKSPACE_DETACHES_MUTABLE_ORDER_COMMIT_AND_RESERVATION_INPUTS", () => {
  const sources = projectionFixtures();
  const input = inputFor(sources);
  const projected = projectCampaignOperationsWorkspace(input);
  const before = structuredClone(projected);
  const production = sources[1].order as unknown as {
    targetHexKeys: string[];
    dependencies: string[];
    validation: { issues: Array<{ message: string }> };
  };
  production.targetHexKeys.push("9,9");
  production.dependencies.push("later-order");
  production.validation.issues[0].message = "Mutated validation";
  (sources[1].reservations[0] as CampaignReservation).status = "released";
  (sources[3].cancellation as { sunkCostSummary: string }).sunkCostSummary = "Mutated cancellation";
  (input.commitPreview.blockers as unknown as Array<{ message: string }>)[0].message = "Mutated blocker";
  (input.commitPreview.draftIds as string[]).push("later-order");
  (input.commitFeedback as { feedback: string }).feedback = "Mutated feedback";

  assert.deepEqual(projected, before);
  assert.deepEqual(projected.orders[1].mapHexKeys, ["4,4"]);
  assert.deepEqual(projected.orders[1].validationMessages, ["The support allocation conflicts with an earlier draft."]);
  assert.equal(formatCampaignReservationLabel(sources[1].reservations[0]), "500 supplies");
});

registerTest("CAMPAIGN_SCREEN_CONSUMES_THE_CANONICAL_OPERATIONS_PROJECTION_WITHOUT_INLINE_FALLBACK", () => {
  const sourceText = readFileSync("src/ui/screens/CampaignScreen.ts", "utf8");
  const shellProjectionText = readFileSync("src/ui/campaign/CampaignCommandShellViewProjection.ts", "utf8");
  assert.match(sourceText, /projectCampaignOperationsWorkspace\(\{/);
  assert.match(sourceText, /operations,/);
  assert.match(shellProjectionText, /orders:\s*input\.operations\.orders/);
  assert.match(shellProjectionText, /orderCommit:\s*input\.operations\.orderCommit/);
  assert.doesNotMatch(sourceText, /private\s+projectCommandOrder\s*\(/);
  assert.doesNotMatch(sourceText, /private\s+campaignReservationLabel\s*\(/);
});
