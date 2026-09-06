/** Evidence-bound repair of the retired theater-wide battle-winner initiative override. */
import type { CampaignFrontLine } from "../../../core/campaignTypes";
import { computeCampaignContentHash } from "../runtime/CampaignCanonical";
import { assertCampaignRuntimeState } from "../runtime/CampaignInvariantValidator";
import { runCampaignRuntimeTransaction } from "../runtime/CampaignRuntimeTransaction";
import type { CampaignRuntimeState, CampaignScenarioDefinition } from "../runtime/campaignRuntimeTypes";

export interface CampaignFrontInitiativeRepair {
  readonly runtime: CampaignRuntimeState;
  readonly repairedFrontKeys: readonly string[];
}

function same(left: unknown, right: unknown): boolean {
  return computeCampaignContentHash(left) === computeCampaignContentHash(right);
}

function reverseFront(front: CampaignFrontLine, initiative: CampaignFrontLine["initiative"]): CampaignFrontLine {
  const edges = (front.edges ?? []).map((edge) => ({
    friendlyHexKey: edge.opposingHexKey,
    opposingHexKey: edge.friendlyHexKey
  })).sort((left, right) => left.friendlyHexKey.localeCompare(right.friendlyHexKey)
    || left.opposingHexKey.localeCompare(right.opposingHexKey));
  return { ...structuredClone(front), initiative, edges, hexKeys: [...new Set(edges.map((edge) => edge.friendlyHexKey))] };
}

/**
 * Repairs only an exact, still-current signature in the latest validated control audit.
 * No audit is rewritten: a normal transaction records the correction at a new revision.
 * Ambiguous history, changed boundaries, active battles and already-opened operations are left alone.
 * Call after envelope/content validation, before adopting the returned runtime on load.
 */
export function repairCampaignFrontInitiativeFromControlHistory(
  source: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignFrontInitiativeRepair {
  assertCampaignRuntimeState(source, definition);
  const unchanged = (): CampaignFrontInitiativeRepair => ({ runtime: structuredClone(source), repairedFrontKeys: [] });
  if (source.activeEngagementId || source.status === "victory" || source.status === "defeat") return unchanged();
  const audited = source.engagementLedgerOrder.map((id) => source.engagementLedger[id])
    .filter((entry) => entry?.controlReport && entry.package && entry.status === "resolved")
    .sort((left, right) => right.controlReport!.appliedRevision - left.controlReport!.appliedRevision);
  const latest = audited[0];
  if (!latest?.controlReport || !latest.package
    || audited[1]?.controlReport?.appliedRevision === latest.controlReport.appliedRevision) return unchanged();
  // Source validation above verifies the package/result/consequence/control/infrastructure/AAR chain.
  const report = latest.controlReport;
  const pkg = latest.package;
  const winner = report.result === "attackerVictory" ? pkg.context.attacker
    : report.result === "defenderVictory" || report.result === "withdrawal" ? pkg.context.defender : null;
  if (!winner) return unchanged();
  const [q, r] = report.battleHexKey.split(",").map(Number);
  const battleOffsetKey = `${q},${r + Math.floor(q / 2)}`;
  const repairs = new Map<string, CampaignFrontLine>();
  for (const current of source.compatibility.initialFronts) {
    const authored = definition.map.initialFronts.find((front) => front.key === current.key);
    const before = report.frontsBefore.find((front) => front.key === current.key);
    const after = report.frontsAfter.find((front) => front.key === current.key);
    if (!authored || !before?.edges?.length || !after
      || before.key === pkg.engagement.frontKey
      || before.initiative !== authored.initiative
      || before.initiative === winner || after.initiative !== winner
      || before.label !== authored.label
      || !same(before.modifiers ?? [], authored.modifiers ?? [])
      || !same(current, after)
      || !same(reverseFront(before, winner), after)) continue;
    if (before.edges.some((edge) => edge.friendlyHexKey === battleOffsetKey || edge.opposingHexKey === battleOffsetKey)) continue;
    const alreadyOpened = source.engagementOrder.some((id) => {
      const engagement = source.engagements[id]?.engagement;
      return engagement?.frontKey === before.key && engagement.attacker === before.initiative;
    }) || source.engagementLedgerOrder.some((id) => {
      const engagement = source.engagementLedger[id]?.package?.engagement;
      return engagement?.frontKey === before.key && engagement.attacker === before.initiative;
    });
    if (alreadyOpened) continue;
    const restored = reverseFront(current, before.initiative);
    const currentControlMatches = restored.edges!.every((edge) => {
      const runtimeKey = (offset: string): string => {
        const [col, row] = offset.split(",").map(Number);
        return `${col},${row - Math.floor(col / 2)}`;
      };
      const friendly = source.tiles[runtimeKey(edge.friendlyHexKey)];
      const opposing = source.tiles[runtimeKey(edge.opposingHexKey)];
      return friendly?.controller === restored.initiative
        && opposing && opposing.controller !== "Neutral" && opposing.controller !== restored.initiative;
    });
    if (currentControlMatches) repairs.set(current.key, restored);
  }
  if (repairs.size === 0) return unchanged();
  const transaction = runCampaignRuntimeTransaction(source, "repair-unrelated-front-initiative", (candidate) => {
    candidate.compatibility.initialFronts.splice(0, candidate.compatibility.initialFronts.length,
      ...candidate.compatibility.initialFronts.map((front) => structuredClone(repairs.get(front.key) ?? front)));
    return [{
      type: "stateChanged", category: "control",
      summary: "Restored unrelated front initiative from the verified battle control audit.",
      details: { engagementId: report.engagementId, controlIntegrityHash: report.integrityHash, frontKeys: [...repairs.keys()].join(", ") }
    }];
  });
  if (!transaction.ok) throw transaction.error;
  assertCampaignRuntimeState(transaction.state, definition);
  return { runtime: transaction.state, repairedFrontKeys: [...repairs.keys()] };
}
