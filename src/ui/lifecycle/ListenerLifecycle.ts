/** Owns event listeners and cleanup callbacks behind one idempotent disposal boundary. */
export class ListenerLifecycle {
  private readonly cleanupCallbacks: Array<() => void> = [];
  private disposed = false;

  addEventListener(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.addCleanup(() => target.removeEventListener(type, listener));
  }

  addCleanup(cleanup: () => void): void {
    if (this.disposed) {
      cleanup();
      return;
    }
    this.cleanupCallbacks.push(cleanup);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const callbacks = this.cleanupCallbacks.splice(0).reverse();
    for (const cleanup of callbacks) {
      try {
        cleanup();
      } catch (error) {
        console.error("[ListenerLifecycle] Cleanup failed", error);
      }
    }
  }
}
