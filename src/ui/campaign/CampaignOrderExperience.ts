/**
 * MODULE: CampaignOrderExperience
 * WHAT: Defines the common action registry, reason explanations, and staged order-composer presentation.
 * WHY: Every shipped campaign order must use one discoverable workflow without duplicating domain legality in UI code.
 *
 * DEPENDENCIES: Player-safe authoritative preview and order reason-code contracts only.
 * EXPORTS: CampaignActionRegistry, shared action/composer types, reason explanations, and composer decoration.
 */

import type { CampaignIntelOperationType } from "../../core/campaignIntelTypes";
import type {
  CampaignOrderActionPreview,
  CampaignOrderKind,
  CampaignOrderValidationCode,
  CampaignOrderValidationIssue
} from "../../game/campaign/orders/CampaignOrderTypes";

/** Stable action identities used by selection, workspace, tests, and future localization. */
export type CampaignActionId =
  | "redeploy"
  | "production"
  | "infrastructureRepair"
  | `intelligence:${CampaignIntelOperationType}`;

/** Context sent to the authoritative preview provider; it contains no campaign truth. */
export interface CampaignActionContext {
  readonly selectionKind: "hex" | "formation" | "front" | "objective" | "order" | "contact" | "report" | "none";
  readonly selectionId: string | null;
  readonly targetContactId?: string | null;
  readonly assignedAssetKey?: string | null;
  readonly excludeOrderId?: string | null;
}

/** Complete legal/blocked/hidden action presentation consumed by controls. */
export interface CampaignActionDescriptor {
  readonly id: CampaignActionId;
  readonly label: string;
  readonly selectionKinds: readonly CampaignActionContext["selectionKind"][];
  readonly orderKind: CampaignOrderKind;
  readonly availability: "available" | "blocked" | "hidden";
  readonly reasonCode: CampaignOrderValidationCode | null;
  readonly reason: string | null;
  readonly correctiveAction: string | null;
  readonly mapHexKeys: readonly string[];
}

/** Callback boundary through which the registry asks state-owned preview services for current legality. */
export type CampaignActionPreviewProvider = (
  actionId: CampaignActionId,
  context: CampaignActionContext
) => CampaignOrderActionPreview;

interface CampaignActionDefinition {
  readonly id: CampaignActionId;
  readonly label: string;
  readonly selectionKinds: readonly CampaignActionContext["selectionKind"][];
  readonly orderKind: CampaignOrderKind;
}

const INTELLIGENCE_ACTIONS: readonly CampaignIntelOperationType[] = [
  "groundRecon",
  "airRecon",
  "verify",
  "counterRecon",
  "opsec",
  "phantom"
];

const ACTION_DEFINITIONS: readonly CampaignActionDefinition[] = [
  { id: "redeploy", label: "Plan redeployment", selectionKinds: ["hex", "formation"], orderKind: "redeploy" },
  { id: "production", label: "Allocate support", selectionKinds: ["none"], orderKind: "production" },
  { id: "infrastructureRepair", label: "Plan reconstruction", selectionKinds: ["hex"], orderKind: "infrastructureRepair" },
  ...INTELLIGENCE_ACTIONS.map((type): CampaignActionDefinition => ({
    id: `intelligence:${type}`,
    label: type === "groundRecon" ? "Ground recon"
      : type === "airRecon" ? "Air reconnaissance"
        : type === "verify" ? "Verify contact"
          : type === "counterRecon" ? "Counter-recon"
            : type === "opsec" ? "Operational security"
              : "Phantom concentration",
    selectionKinds: type === "verify" ? ["contact", "hex"] : ["hex"],
    orderKind: type === "counterRecon" || type === "opsec" || type === "phantom"
      ? "counterIntelligence"
      : "reconnaissance"
  }))
];

/** Converts an intelligence operation identity into the common action registry key. */
export function getCampaignIntelligenceActionId(type: CampaignIntelOperationType): CampaignActionId {
  return `intelligence:${type}`;
}

/** Reads the operation identity from a registry key without trusting arbitrary string parsing elsewhere. */
export function getCampaignIntelOperationType(actionId: CampaignActionId): CampaignIntelOperationType | null {
  if (!actionId.startsWith("intelligence:")) return null;
  const candidate = actionId.slice("intelligence:".length) as CampaignIntelOperationType;
  return INTELLIGENCE_ACTIONS.includes(candidate) ? candidate : null;
}

/**
 * Maps presentation metadata to authoritative action previews.
 * The registry never derives availability from rendered text, button state, or resource values.
 */
export class CampaignActionRegistry {
  public constructor(private readonly previewProvider: CampaignActionPreviewProvider) {}

  /** Resolves one descriptor through the current authoritative preview provider. */
  public resolve(actionId: CampaignActionId, context: CampaignActionContext): CampaignActionDescriptor {
    const definition = ACTION_DEFINITIONS.find((entry) => entry.id === actionId);
    if (!definition) throw new Error(`Campaign action ${actionId} is not registered.`);
    const preview = this.previewProvider(actionId, context);
    return {
      ...definition,
      availability: preview.availability,
      reasonCode: preview.reasonCode,
      reason: preview.reason,
      correctiveAction: preview.correctiveAction,
      mapHexKeys: [...preview.mapHexKeys]
    };
  }

  /** Resolves every action that belongs to the supplied selection context, including explainable blockers. */
  public list(context: CampaignActionContext): readonly CampaignActionDescriptor[] {
    return ACTION_DEFINITIONS
      .filter((definition) => definition.selectionKinds.includes(context.selectionKind))
      .map((definition) => this.resolve(definition.id, context))
      .filter((descriptor) => descriptor.availability !== "hidden");
  }
}

/** UI explanation paired with a stable validation reason code. */
export interface CampaignOrderReasonExplanation {
  readonly code: CampaignOrderValidationCode;
  readonly message: string;
  readonly correctiveAction: string;
}

const CORRECTIVE_ACTIONS: Readonly<Record<CampaignOrderValidationCode, string>> = {
  ORDER_FACTION_INVALID: "Return to the current campaign and issue the order for a friendly command.",
  ORDER_SOURCE_INVALID: "Select a current friendly origin and review the route again.",
  ORDER_TARGET_INVALID: "Choose a legal target from the current Player-visible operational picture.",
  ORDER_SELECTION_INVALID: "Correct the selected participants or quantities before committing.",
  ORDER_TRANSPORT_INVALID: "Choose a compatible transport mode or route and refresh the preview.",
  ORDER_ALLOCATION_INVALID: "Assign a non-negative support mix totaling 100 percent.",
  ORDER_OPERATION_INVALID: "Reopen the planner and rebuild the operation from current rules.",
  ORDER_INFRASTRUCTURE_INVALID: "Review the facility's current condition and create a fresh reconstruction plan.",
  ORDER_RESERVATION_CONFLICT: "Remove, edit, or reprioritize the earlier draft that holds the same pool.",
  ORDER_RESOURCE_INSUFFICIENT: "Reduce the order, release a competing hold, or wait for additional stocks.",
  ORDER_CAPACITY_INSUFFICIENT: "Reduce the order, release a competing hold, or wait for capacity to return.",
  ORDER_ASSET_UNAVAILABLE: "Choose an eligible uncommitted asset or release it from an earlier draft.",
  ORDER_FORCE_UNAVAILABLE: "Choose a ready uncommitted formation or release it from an earlier order."
};

/** Adds a stable recovery instruction to an authoritative validation issue. */
export function explainCampaignOrderValidationIssue(issue: CampaignOrderValidationIssue): CampaignOrderReasonExplanation {
  return { code: issue.code, message: issue.message, correctiveAction: CORRECTIVE_ACTIONS[issue.code] };
}

/** Returns the stable corrective instruction for a validation reason code. */
export function getCampaignOrderCorrectiveAction(code: CampaignOrderValidationCode): string {
  return CORRECTIVE_ACTIONS[code];
}

/** Stable IDs for the shared seven-stage campaign order journey. */
export type CampaignOrderComposerStageId =
  | "intent"
  | "target"
  | "participants"
  | "timing"
  | "effects"
  | "conflicts"
  | "draft";

/** One stage in an order-kind schema. */
export interface CampaignOrderComposerStage {
  readonly id: CampaignOrderComposerStageId;
  readonly label: string;
  readonly description: string;
}

/** Common schema used to decorate every shipped order-specific composer. */
export interface CampaignOrderComposerSchema {
  readonly kind: CampaignOrderKind;
  readonly eyebrow: string;
  readonly stages: readonly CampaignOrderComposerStage[];
}

const COMMON_STAGES: readonly CampaignOrderComposerStage[] = [
  { id: "intent", label: "Intent", description: "Confirm the command purpose and subject." },
  { id: "target", label: "Target", description: "Confirm the target, area, or route." },
  { id: "participants", label: "Participants", description: "Assign formations, assets, or priorities." },
  { id: "timing", label: "Timing", description: "Review start, duration, ETA, posture, and support." },
  { id: "effects", label: "Effects", description: "Review costs, holds, risk, and objective interaction." },
  { id: "conflicts", label: "Conflicts", description: "Resolve dependencies and blocking rules." },
  { id: "draft", label: "Draft", description: "Add or replace the non-spending draft." }
];

/** Returns the common composer schema for a shipped order kind. */
export function getCampaignOrderComposerSchema(kind: CampaignOrderKind): CampaignOrderComposerSchema {
  return {
    kind,
    eyebrow: kind === "redeploy" ? "Movement order"
      : kind === "production" ? "Support directive"
        : kind === "infrastructureRepair" ? "Reconstruction order"
          : kind === "counterIntelligence" ? "Counterintelligence order"
            : "Intelligence collection order",
    stages: COMMON_STAGES
  };
}

/**
 * Adds the shared semantic stage guide to an order-specific composer without taking ownership of its fields.
 * Calling it repeatedly is idempotent so live preview rerenders remain safe.
 */
export function decorateCampaignOrderComposer(
  container: HTMLElement,
  kind: CampaignOrderKind,
  summary: string,
  editing = false
): void {
  container.classList.add("campaign-order-composer");
  container.dataset.orderKind = kind;
  container.dataset.orderMode = editing ? "edit" : "create";
  container.querySelector(":scope > .campaign-order-composer__guide")?.remove();
  const schema = getCampaignOrderComposerSchema(kind);
  const guide = document.createElement("section");
  guide.className = "campaign-order-composer__guide";
  guide.setAttribute("aria-label", "Order planning stages");
  const heading = document.createElement("header");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = `${schema.eyebrow} · ${editing ? "Edit draft" : "New draft"}`;
  const title = document.createElement("strong");
  title.textContent = summary;
  heading.append(eyebrow, title);
  const list = document.createElement("ol");
  list.className = "campaign-order-composer__stages";
  schema.stages.forEach((stage, index) => {
    const item = document.createElement("li");
    item.dataset.orderStage = stage.id;
    item.title = stage.description;
    const number = document.createElement("span");
    number.textContent = String(index + 1);
    const label = document.createElement("strong");
    label.textContent = stage.label;
    item.append(number, label);
    list.appendChild(item);
  });
  guide.append(heading, list);
  container.prepend(guide);
}
