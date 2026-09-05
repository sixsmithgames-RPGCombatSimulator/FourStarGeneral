/**
 * Access-gate regressions for live run FSG-CAMPAIGN-20260905-160156.
 * Uses the real screen lifecycle and entitlement authority. Native tab order,
 * hit testing, accessibility-tree exclusion and compact geometry belong to 082.
 */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { CampaignState } from "../src/state/CampaignState";
import { UnlockState, type UnlockAuthContext } from "../src/state/UnlockState";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";
import { ScreenManager } from "../src/ui/screens/ScreenManager";
import { buildSignInUrl } from "../src/utils/guestMode";

const guest: UnlockAuthContext = {
  resolved: true, isAuthenticated: false, email: null, subscriptionStatus: null,
  planIds: [], isPrivileged: false, isGuest: true
};

/** Mounts completed shell markup and real transition/entitlement boundaries. */
function mountAccessFixture(): {
  root: HTMLElement; app: HTMLElement; screen: CampaignScreen;
  manager: ScreenManager; unlock: UnlockState; entry: HTMLButtonElement;
} {
  document.body.innerHTML = `
    <div id="screenTransitionStatus" class="hidden" aria-hidden="true"><span data-screen-transition-copy></span></div>
    <main id="app">
      <section id="landingScreen"><button id="enterCampaign">Enter Campaign</button></section>
      <section id="campaignScreen" class="hidden" aria-hidden="true">
        <div class="campaign-layout">
          <div class="campaign-map"><div class="campaign-map-viewport"><svg id="campaignHexMap"></svg></div></div>
          <aside class="campaign-sidebar"><section class="selection-section"><div id="campaignSelectionInfo"></div></section>
            <div class="action-section"><button id="campaignQueueEngagement">Queue Tactical Engagement</button></div>
          </aside>
        </div>
      </section>
    </main>
    <aside id="previouslyIsolated" aria-hidden="true" inert><button>Unavailable</button></aside>`;
  const root = document.getElementById("campaignScreen")!;
  const app = document.getElementById("app")!;
  const entry = document.getElementById("enterCampaign") as HTMLButtonElement;
  const alreadyIsolated = document.getElementById("previouslyIsolated")!;
  alreadyIsolated.inert = true;
  const manager = new ScreenManager();
  manager.registerScreen("campaign", root);
  manager.registerScreen("landing", document.getElementById("landingScreen")!);
  manager.showScreenById("landing");
  const unlock = new UnlockState();
  unlock.hydrate(guest);
  // Rendering is outside this gate test; retain real screen, state and auth consumers.
  const screen = new CampaignScreen(manager, { setIntelContactsVisible() {} } as never);
  Object.defineProperty(screen, "campaignState", { value: new CampaignState() });
  Object.defineProperty(screen, "unlockState", { value: unlock });
  screen.initialize();
  entry.addEventListener("click", () => manager.showScreenById("campaign"));
  return { root, app, screen, manager, unlock, entry };
}

/** A DOM boundary key, not a substitute for the parent's native-browser Tab test. */
function pressKey(target: Element, key: string, shiftKey = false): KeyboardEvent {
  const event = new window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

registerTest("FSG_CAM_083_ACCESS_GATE_CANONICAL_SIGN_IN_AND_COMPLETE_SHELL_ISOLATION", async () => {
  const fixture = mountAccessFixture();
  try {
    fixture.entry.focus();
    assert.equal(document.querySelector("#campaignLockOverlay"), null, "Hidden initialization must not mount a global gate");
    assert.equal(document.activeElement, fixture.entry);
    fixture.entry.click();
    const gate = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="campaignLockTitle"]');
    assert.ok(gate, "The access gate must be a labelled dialog");
    assert.equal(gate.getAttribute("aria-modal"), "true");
    const description = gate.getAttribute("aria-describedby")!.split(" ")
      .map((id) => document.getElementById(id)?.textContent).join(" ");
    assert.match(description, /subscription/);
    const signIn = gate.querySelector<HTMLAnchorElement>("[data-lock-sign-in]")!;
    assert.ok(signIn, "Existing subscribers need a direct sign-in action");
    const canonical = new URL(buildSignInUrl());
    const actual = new URL(signIn.href);
    assert.equal(actual.origin, canonical.origin);
    assert.equal(actual.pathname, canonical.pathname);
    assert.equal(actual.searchParams.get("redirect_url"), new URL("/play?mode=campaign", window.location.origin).href);
    assert.equal(document.activeElement, signIn);
    assert.equal(fixture.root.inert, true);
    assert.equal(fixture.root.getAttribute("aria-hidden"), "true");
    assert.ok(fixture.root.querySelector("#campaignCommandReports"), "Isolation must cover the completed shell");
    assert.ok(fixture.root.querySelector(".campaign-order-tray"));
    assert.equal(gate.closest('[aria-hidden="true"]'), null, "The modal must remain outside its isolated background");
  } finally {
    fixture.screen.disposeCampaignAccessGate();
    fixture.manager.endTransition();
  }
});

registerTest("FSG_CAM_083_ACCESS_GATE_KEYS_TRANSITION_RETURN_AND_REENTRY", async () => {
  const fixture = mountAccessFixture();
  try {
    fixture.entry.focus();
    fixture.entry.click();
    const gate = document.getElementById("campaignLockOverlay")!;
    const actions = Array.from(gate.querySelectorAll<HTMLElement>("a[href], button"));
    assert.equal(actions.length, 3);
    actions[2].focus();
    assert.equal(pressKey(actions[2], "Tab").defaultPrevented, true);
    assert.equal(document.activeElement, actions[0]);
    pressKey(actions[0], "Tab", true);
    assert.equal(document.activeElement, actions[2]);
    let escapedKeys = 0;
    const detectEscape = (): void => { escapedKeys += 1; };
    document.addEventListener("keydown", detectEscape);
    try { pressKey(actions[0], "1"); } finally { document.removeEventListener("keydown", detectEscape); }
    assert.equal(escapedKeys, 0, "Gate keys must not reach campaign/global workspace shortcuts");
    fixture.manager.endTransition();
    assert.equal(fixture.root.inert, true, "Clearing app transition inertness must not unlock campaign controls");
    fixture.root.querySelector<HTMLButtonElement>("#campaignCommandReports")!.focus();
    assert.ok(gate.contains(document.activeElement), "Late focus restoration must remain inside the gate");
    assert.equal(pressKey(actions[0], "Escape").defaultPrevented, true);
    assert.equal(document.querySelector("#campaignLockOverlay"), null);
    assert.equal(fixture.manager.getCurrentScreen()?.id, "landingScreen");
    assert.equal(document.activeElement, fixture.entry);
    assert.equal(fixture.root.getAttribute("aria-hidden"), "true", "Closing must preserve the hidden campaign state");
    fixture.entry.click();
    assert.equal(document.querySelectorAll("#campaignLockOverlay").length, 1);
    document.querySelector<HTMLButtonElement>("[data-lock-return]")!.click();
    assert.equal(document.activeElement, fixture.entry);
    assert.equal(fixture.unlock.isCampaignLocked("campaign"), true, "Returning must not alter entitlement authority");
  } finally {
    fixture.screen.disposeCampaignAccessGate();
    fixture.manager.endTransition();
  }
});

registerTest("FSG_CAM_083_ACCESS_GATE_AUTH_REFRESH_GRANT_REVOKE_AND_DISPOSE", async () => {
  const fixture = mountAccessFixture();
  try {
    fixture.entry.focus();
    fixture.unlock.hydrate({ ...guest, isAuthenticated: true, isGuest: false });
    assert.equal(document.querySelector("#campaignLockOverlay"), null);
    assert.equal(document.activeElement, fixture.entry, "Hidden auth resolution must not steal focus");
    fixture.entry.click();
    assert.match(document.querySelector("[data-lock-recovery]")?.textContent ?? "", /this account/i);
    const reports = fixture.root.querySelector<HTMLButtonElement>("#campaignCommandReports")!;
    fixture.manager.endTransition();
    fixture.unlock.hydrate({ ...guest, isAuthenticated: true, isGuest: false, isPrivileged: true });
    assert.equal(document.querySelector("#campaignLockOverlay"), null);
    assert.equal(fixture.root.inert, false);
    assert.equal(fixture.app.inert, false, "Late entitlement must not restore an obsolete app transition lock");
    assert.equal(document.getElementById("screenTransitionStatus")!.getAttribute("aria-hidden"), "true");
    assert.equal(fixture.root.getAttribute("aria-hidden"), "false");
    assert.equal(document.getElementById("previouslyIsolated")!.inert, true);
    assert.equal(document.getElementById("previouslyIsolated")!.getAttribute("aria-hidden"), "true");
    reports.focus();
    fixture.unlock.hydrate(guest);
    assert.ok(document.getElementById("campaignLockOverlay"));
    fixture.unlock.hydrate({ ...guest, isAuthenticated: true, isGuest: false });
    assert.match(document.querySelector("[data-lock-recovery]")?.textContent ?? "", /this account/i);
    assert.equal(document.querySelector<HTMLElement>("[data-lock-sign-in]")!.hidden, true);
    assert.equal(document.activeElement, document.querySelector("[data-lock-plans]"), "Auth refresh moves focus before hiding guest sign-in");
    fixture.unlock.hydrate({ ...guest, isPrivileged: true });
    assert.equal(document.activeElement, reports, "Entitlement arrival restores the prior campaign focus");
    fixture.unlock.hydrate(guest);
    fixture.screen.disposeCampaignAccessGate();
    assert.equal(document.querySelector("#campaignLockOverlay"), null);
    fixture.unlock.hydrate({ ...guest, isPrivileged: true });
    fixture.unlock.hydrate(guest);
    fixture.manager.showScreenById("campaign");
    assert.equal(document.querySelector("#campaignLockOverlay"), null, "Disposed auth and screen handlers must stay detached");
    reports.focus();
    assert.equal(document.activeElement, reports, "Disposed focus guards must not survive the screen");
  } finally {
    fixture.screen.disposeCampaignAccessGate();
    fixture.manager.endTransition();
  }
});
