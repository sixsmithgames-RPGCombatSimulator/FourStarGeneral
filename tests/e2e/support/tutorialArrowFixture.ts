import { TutorialOverlay } from '../../../src/ui/components/TutorialOverlay';
import { ensureTutorialState, type TutorialPhase } from '../../../src/state/TutorialState';
import { SIDEBAR_MINI_TUTORIAL_EVENT } from '../../../src/data/sidebarMiniTutorials';
import { mountAirReadinessFixture, disposeAirReadinessFixture } from './airReadinessFixture';

let overlay: TutorialOverlay | null = null;

/** Mount the real Air board and tutorial; subsequent brief transitions use real buttons. */
export function mountAirBrief(): void {
  mountAirReadinessFixture();
  overlay = new TutorialOverlay();
  overlay.initialize();
  document.dispatchEvent(new CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, { detail: { key: 'airSupport' } }));
}

/** Isolated layout contract using authored steps, not a replacement positioning implementation. */
export function mountAnchoredStep(phase: TutorialPhase): void {
  overlay = new TutorialOverlay();
  overlay.initialize();
  ensureTutorialState().jumpToPhase(phase);
}

/** Dispose subscriptions and observers before the browser context is released. */
export function dispose(): void {
  overlay?.dispose();
  overlay = null;
  ensureTutorialState().endTutorial();
  disposeAirReadinessFixture();
}
