import assert from "node:assert/strict";
import "./domEnvironment.js";
import { createRetryableTacticalBattleFlowLoader } from "../src/bootstrap/LazyTacticalBattleFlow.js";
import { initializeTacticalBattleFlow } from "../src/bootstrap/TacticalBattleFlowBootstrap.js";
import { resumeCampaignBattleWhenReady } from "../src/bootstrap/TacticalBattleResumeRouting.js";
import type { TacticalBattleFlow } from "../src/contracts/TacticalBattleFlow.js";
import type { ActiveCampaignBattleSave } from "../src/game/battle/persistence/BattleSaveTypes.js";
import { ensureBattleState } from "../src/state/BattleState.js";
import { ensureTutorialState } from "../src/state/TutorialState.js";
import { registerTest } from "./harness.js";

function createFlow(overrides: Partial<TacticalBattleFlow> = {}): TacticalBattleFlow {
  return {
    dispose() {},
    enterPrecombat() {},
    enterCampaignPrecombat() {},
    resumeActiveCampaignBattle() {},
    ...overrides
  };
}

registerTest("TACTICAL_LAZY_FLOW_DEDUPLICATES_AND_RETRIES_FAILED_LOADS", async ({ Given, When, Then }) => {
  let attempts = 0;
  let rejectFirst!: (reason: Error) => void;
  const readyFlow = createFlow();
  const ensureFlow = createRetryableTacticalBattleFlowLoader(() => {
    attempts += 1;
    if (attempts === 1) {
      return new Promise<TacticalBattleFlow>((_resolve, reject) => { rejectFirst = reject; });
    }
    return Promise.resolve(readyFlow);
  });
  let first!: Promise<TacticalBattleFlow>;
  let concurrent!: Promise<TacticalBattleFlow>;

  await Given("two callers request the tactical runtime while its first load is pending", async () => {
    first = ensureFlow();
    concurrent = ensureFlow();
  });
  await When("the shared load fails and a later caller retries", async () => {
    assert.equal(first, concurrent, "concurrent callers must share one initialization promise");
    rejectFirst(new Error("chunk unavailable"));
    await assert.rejects(first, /chunk unavailable/);
  });
  await Then("the failed memo is cleared and exactly one fresh initialization succeeds", async () => {
    assert.equal(await ensureFlow(), readyFlow);
    assert.equal(attempts, 2);
  });
});

registerTest("TACTICAL_BOOTSTRAP_ROLLS_BACK_LISTENERS_BEFORE_RETRY", async ({ Given, When, Then }) => {
  const battleState = ensureBattleState() as unknown as { battleUpdateListeners: Set<unknown> };
  const tutorialState = ensureTutorialState() as unknown as { listeners: Set<unknown> };
  const initialBattleSubscriptions = battleState.battleUpdateListeners.size;
  const initialTutorialSubscriptions = tutorialState.listeners.size;
  let sidebarButton!: HTMLButtonElement;
  let popupLayer!: HTMLElement;

  const attemptBootstrap = (): void => {
    initializeTacticalBattleFlow({
      screenManager: {} as never,
      uiState: {} as never
    });
  };

  await Given("a tactical shell whose later precombat construction fails after shared listeners bind", () => {
    document.body.innerHTML = `
      <button class="sidebar-button" data-popup="recon" aria-expanded="false">Recon</button>
      <div id="battlePopupLayer" class="popup-layer hidden" aria-hidden="true">
        <section class="battle-popup">
          <h2 data-popup-title></h2>
          <button id="battlePopupClose" type="button">Close</button>
          <div data-popup-body></div>
        </section>
      </div>
      <div id="warRoomOverlay" class="hidden" aria-hidden="true">
        <section class="war-room-surface" tabindex="-1">
          <div id="warRoomAnnouncer"></div>
          <div class="war-room-hotspot-layer"></div>
          <button id="warRoomClose" type="button">Close</button>
          <section id="warRoomDetail" class="hidden">
            <h2 id="warRoomDetailTitle"></h2>
            <div id="warRoomDetailMeta"></div>
            <div id="warRoomDetailBody"></div>
            <button id="warRoomDetailClose" type="button">Close detail</button>
          </section>
          <div data-war-room-command-strip></div>
        </section>
      </div>
    `;
    sidebarButton = document.querySelector<HTMLButtonElement>(".sidebar-button")!;
    popupLayer = document.getElementById("battlePopupLayer")!;
  });

  await When("initialization fails and the lazy boundary retries the same construction", () => {
    assert.throws(attemptBootstrap, /Precombat screen element/);
    assert.throws(attemptBootstrap, /Precombat screen element/);
    sidebarButton.click();
    document.dispatchEvent(new CustomEvent("warroom:openBattleRequisitions"));
  });

  await Then("both failed instances have released every shared listener before either can become a ghost owner", () => {
    assert.equal(popupLayer.classList.contains("hidden"), true, "disposed sidebar or War Room listeners reopened the popup");
    assert.equal(popupLayer.getAttribute("aria-hidden"), "true");
    assert.equal(sidebarButton.getAttribute("aria-expanded"), "false");
    assert.equal(battleState.battleUpdateListeners.size, initialBattleSubscriptions);
    assert.equal(tutorialState.listeners.size, initialTutorialSubscriptions);
  });
});

registerTest("TACTICAL_BATTLE_RESUME_WAITS_FOR_INITIALIZATION_BEFORE_HYDRATION", async ({ Given, When, Then }) => {
  const events: string[] = [];
  let finishLoading!: (flow: TacticalBattleFlow) => void;
  const save = {} as ActiveCampaignBattleSave;
  const ensureFlow = (): Promise<TacticalBattleFlow> => {
    events.push("load-requested");
    return new Promise((resolve) => { finishLoading = resolve; });
  };
  const screenManager = {
    beginTransition: () => events.push("transition-started"),
    endTransition: () => events.push("transition-ended"),
    showScreen() {},
    showScreenById() {},
    getCurrentScreen: () => null
  };
  let routing!: Promise<void>;

  await Given("a campaign save is selected before the tactical chunk exists", async () => {
    routing = resumeCampaignBattleWhenReady(save, ensureFlow, screenManager);
  });
  await When("the tactical runtime finishes initializing", async () => {
    assert.deepEqual(events, ["transition-started", "load-requested"]);
    finishLoading(createFlow({
      resumeActiveCampaignBattle: (received) => {
        assert.equal(received, save);
        events.push("save-hydrated");
      }
    }));
    await routing;
  });
  await Then("hydration runs only after initialization and owns the destination transition", async () => {
    assert.deepEqual(events, ["transition-started", "load-requested", "save-hydrated"]);
  });
});
