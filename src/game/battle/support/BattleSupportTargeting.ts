import type { Axial, UnitTypeDefinition } from "../../../core/types";
import { hexDistance } from "../../../core/Hex";
import type {
  EnemyContactSnapshot,
  SupportSnapshot,
  UnitCommandState
} from "../BattleRuntimeContracts";

export type ArtilleryObserverDefinition = Pick<UnitTypeDefinition, "class" | "moveType" | "vision">;

export interface ArtilleryTargetingInput {
  readonly callerHex: Axial | null;
  readonly definition: ArtilleryObserverDefinition | null;
  readonly commandState: UnitCommandState | null;
  readonly currentTurn: number;
  readonly enemyContacts: readonly EnemyContactSnapshot[];
  readonly support: SupportSnapshot;
}

export type ArtilleryObservationInput = Pick<
  ArtilleryTargetingInput,
  "callerHex" | "definition" | "currentTurn" | "enemyContacts"
>;

export interface ArtilleryActionProjection {
  readonly available: boolean;
  readonly reason: string | null;
  readonly assetId: string | null;
  readonly assetLabel: string | null;
  readonly targetHexes: readonly Axial[];
}

/** Keeps observer eligibility in the game layer instead of duplicating it in presentation code. */
export function canDefinitionObserveArtillery(definition: ArtilleryObserverDefinition | null): boolean {
  if (!definition) {
    return false;
  }
  return definition.class === "infantry"
    || definition.class === "recon"
    || (definition.class === "specialist" && definition.moveType === "leg");
}

/** Returns unique, current-turn contacts that the observer can adjust fire onto. */
export function resolveObservedArtilleryTargetHexes(input: ArtilleryObservationInput): readonly Axial[] {
  const observationRange = Math.max(
    2,
    (input.definition?.vision ?? 0) + (input.definition?.class === "recon" ? 1 : 0)
  );
  const targetHexes = new Map<string, Axial>();
  input.enemyContacts.forEach((contact) => {
    if (!input.callerHex) {
      return;
    }
    if (contact.lastSeenTurn !== input.currentTurn || contact.state === "spotted") {
      return;
    }
    if (hexDistance(input.callerHex, contact.hex) > observationRange) {
      return;
    }
    targetHexes.set(`${contact.hex.q},${contact.hex.r}`, structuredClone(contact.hex));
  });
  return Array.from(targetHexes.values());
}

/**
 * Projects the exact observed target set and support availability presented by
 * the battle command rail. The counter-intuitive spotted-contact exclusion is
 * preserved intentionally as existing gameplay behavior.
 */
export function resolveArtilleryActionProjection(input: ArtilleryTargetingInput): ArtilleryActionProjection {
  const { commandState, definition, support } = input;
  if (!commandState || commandState.isAutomated || !canDefinitionObserveArtillery(definition)) {
    return { available: false, reason: null, assetId: null, assetLabel: null, targetHexes: [] };
  }

  const readyAsset = support.ready.find((asset) => asset.type === "artillery" && asset.charges > 0) ?? null;
  const knownAsset = readyAsset
    ?? support.queued.find((asset) => asset.type === "artillery")
    ?? support.cooldown.find((asset) => asset.type === "artillery")
    ?? support.maintenance.find((asset) => asset.type === "artillery")
    ?? null;
  const suppressionState = commandState.suppressionState;
  if (suppressionState === "pinned" || suppressionState === "broken") {
    const label = suppressionState === "broken" ? "Broken" : "Pinned";
    return {
      available: false,
      reason: `${label} battalions cannot adjust ${knownAsset?.label ?? "off-map fire support"} until the suppression is broken.`,
      assetId: null,
      assetLabel: knownAsset?.label ?? null,
      targetHexes: []
    };
  }
  if (!readyAsset) {
    const queuedAsset = support.queued.find((asset) => asset.type === "artillery") ?? null;
    return {
      available: false,
      reason: queuedAsset
        ? `${queuedAsset.label} is already tasked.`
        : `No ${knownAsset?.label ?? "off-map fire support"} is ready for this mission.`,
      assetId: null,
      assetLabel: knownAsset?.label ?? null,
      targetHexes: []
    };
  }

  const targets = resolveObservedArtilleryTargetHexes(input);
  if (targets.length === 0) {
    return {
      available: false,
      reason: `No observed enemy hex is close enough to adjust ${readyAsset.label}.`,
      assetId: readyAsset.id,
      assetLabel: readyAsset.label,
      targetHexes: targets
    };
  }
  return {
    available: true,
    reason: null,
    assetId: readyAsset.id,
    assetLabel: readyAsset.label,
    targetHexes: targets
  };
}
