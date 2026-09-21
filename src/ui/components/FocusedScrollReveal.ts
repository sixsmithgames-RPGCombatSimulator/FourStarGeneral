const FOCUS_REVEAL_GUTTER_PX = 2;

/** Keeps a focused control wholly visible by moving only its designated scroll owner. */
export function revealElementWithinScrollOwner(owner: HTMLElement, target: HTMLElement): void {
  if (!owner.contains(target) || owner === target) return;
  const ownerRect = owner.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  // Borders are not part of the scrollable client viewport. Comparing with the
  // border box can leave a focus ring clipped at either edge (notably in WebKit).
  const visibleTop = owner.clientHeight > 0 ? ownerRect.top + owner.clientTop : ownerRect.top;
  const visibleBottom = owner.clientHeight > 0 ? visibleTop + owner.clientHeight : ownerRect.bottom;
  if (targetRect.top < visibleTop + FOCUS_REVEAL_GUTTER_PX) {
    owner.scrollTop -= visibleTop + FOCUS_REVEAL_GUTTER_PX - targetRect.top;
  } else if (targetRect.bottom > visibleBottom - FOCUS_REVEAL_GUTTER_PX) {
    owner.scrollTop += targetRect.bottom - visibleBottom + FOCUS_REVEAL_GUTTER_PX;
  }
}

/** Establishes focus without implicit document scrolling, then reveals it in one owned pane. */
export function focusAndRevealWithinScrollOwner(target: HTMLElement, owner: HTMLElement | null): void {
  target.focus({ preventScroll: true });
  if (!owner) return;
  const revealWhileOwned = (): void => {
    // Layout can settle after focus or a disclosure rerender. Never let that
    // deferred correction pull the pane back after the user has moved on.
    if (document.activeElement !== target || !target.isConnected || !owner.isConnected) return;
    revealElementWithinScrollOwner(owner, target);
  };
  revealWhileOwned();
  window.requestAnimationFrame(revealWhileOwned);
}
