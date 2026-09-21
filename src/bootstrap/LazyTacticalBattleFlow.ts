import type { TacticalBattleFlow } from "../contracts/TacticalBattleFlow";

/** Deduplicates concurrent chunk requests while allowing a failed load to be retried. */
export function createRetryableTacticalBattleFlowLoader(
  factory: () => Promise<TacticalBattleFlow>
): () => Promise<TacticalBattleFlow> {
  let pending: Promise<TacticalBattleFlow> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(factory)
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
}
