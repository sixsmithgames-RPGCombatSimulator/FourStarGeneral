/**
 * Observe a concurrently running effect immediately, preserving its rejection
 * for the owning attack's later join. Lead-in effects can otherwise reject before
 * the impact delay finishes and before that join attaches its handlers.
 */
export function observeCombatEffect<T>(effect: Promise<T>): Promise<T> {
  void effect.catch((error: unknown) => {
    console.error("[CombatEffects] Combat presentation effect failed:", error);
  });
  return effect;
}

/** Run an effect at its authored delay and forward both sync and async failures. */
export function scheduleCombatEffect(delayMs: number, effect: () => void | Promise<unknown>): Promise<void> {
  return observeCombatEffect(new Promise<void>((resolve, reject) => {
    window.setTimeout(() => {
      try {
        void Promise.resolve(effect()).then(() => resolve(), reject);
      } catch (error) {
        reject(error);
      }
    }, delayMs);
  }));
}
