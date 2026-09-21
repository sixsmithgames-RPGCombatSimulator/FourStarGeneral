export interface TutorialInitiativeActivation {
  readonly unitId: string;
  readonly ownerId: "player" | "bot";
  readonly initiative: number;
  readonly isActivated: boolean;
  readonly sortOrder?: number;
}

export interface TutorialInitiativeQueue {
  readonly currentIndex?: number;
  readonly activations?: readonly TutorialInitiativeActivation[];
}

export interface TutorialInitiativeGroup {
  readonly initiative: number;
  readonly ownerId: "player" | "bot";
  readonly activations: TutorialInitiativeActivation[];
}

export interface TutorialNextGroupIntent {
  readonly taughtInitiative: number | null;
  readonly activePlayerBandMatches: boolean;
  readonly deferredPlayerUnitIds: readonly string[];
}

export function resolveActiveInitiativeGroup(
  queue: TutorialInitiativeQueue | null | undefined
): TutorialInitiativeGroup | null {
  const activations = queue?.activations;
  if (!activations || activations.length === 0) {
    return null;
  }

  const startIndex = typeof queue.currentIndex === "number" ? queue.currentIndex : 0;
  const activeActivation = activations.find((activation, index) =>
    index >= startIndex && !activation.isActivated
  );
  if (!activeActivation) {
    return null;
  }

  return {
    initiative: activeActivation.initiative,
    ownerId: activeActivation.ownerId,
    activations: activations.filter((activation, index) =>
      index >= startIndex &&
      !activation.isActivated &&
      activation.ownerId === activeActivation.ownerId &&
      activation.initiative === activeActivation.initiative
    )
  };
}

/**
 * Binds the tutorial's Next Group command to the player band that just acted.
 * Automated activations may become current before the click handler runs; in
 * that case same-band player peers are deferred without touching later bands.
 */
export function resolveTutorialNextGroupIntent(
  queue: TutorialInitiativeQueue | null | undefined
): TutorialNextGroupIntent {
  const activations = queue?.activations ?? [];
  const currentIndex = Math.max(0, Math.min(
    typeof queue?.currentIndex === "number" ? queue.currentIndex : 0,
    activations.length
  ));
  const completedPlayerActivation = activations
    .slice(0, currentIndex)
    .reverse()
    .find((activation) => activation.ownerId === "player" && activation.isActivated);
  const activeGroup = resolveActiveInitiativeGroup(queue);
  const taughtInitiative = completedPlayerActivation?.initiative
    ?? (activeGroup?.ownerId === "player" ? activeGroup.initiative : null);

  if (taughtInitiative === null) {
    return { taughtInitiative: null, activePlayerBandMatches: false, deferredPlayerUnitIds: [] };
  }

  return {
    taughtInitiative,
    activePlayerBandMatches:
      activeGroup?.ownerId === "player" && activeGroup.initiative === taughtInitiative,
    deferredPlayerUnitIds: activations
      .slice(currentIndex)
      .filter((activation) =>
        !activation.isActivated &&
        activation.ownerId === "player" &&
        activation.initiative === taughtInitiative
      )
      .map((activation) => activation.unitId)
  };
}
