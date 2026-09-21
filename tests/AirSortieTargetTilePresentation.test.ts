import "./domEnvironment.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AirMissionKind, AirMissionTemplate } from "../src/core/types";
import { PopupManager } from "../src/ui/components/PopupManager";
import {
  renderAirSortieTargetTileMarkup,
  type AirSortieTargetTilePresentationInput
} from "../src/ui/presentation/AirSortieTargetTilePresentation";
import { registerTest } from "./harness.js";

function mission(kind: AirMissionKind, requiresTarget: boolean): AirSortieTargetTilePresentationInput["mission"] {
  return { kind, requiresTarget };
}

function targetTileInput(
  overrides: Partial<AirSortieTargetTilePresentationInput> = {}
): AirSortieTargetTilePresentationInput {
  return {
    mission: mission("strike", true),
    squadronId: "sq-default",
    cardDisabled: false,
    statusLabel: "Ready",
    targetValue: "",
    targetIsValid: false,
    selectedTargetLabel: "",
    escortTargets: [],
    ...overrides
  };
}

function presentationCases(): readonly AirSortieTargetTilePresentationInput[] {
  const escortTargets = [{
    value: "strike-1",
    label: "Package & One",
    detail: "Target <A>",
    meta: "Launch > B"
  }];
  return [
    targetTileInput({ mission: null, squadronId: "sq-none" }),
    targetTileInput({
      squadronId: "sq-committed",
      cardDisabled: true,
      statusLabel: "In & Flight",
      assignmentMissionLabel: "Strike <Now>",
      assignmentTargetLabel: "Hex > 3",
      assignmentSummary: "Committed & moving"
    }),
    targetTileInput({ mission: mission("escort", true), squadronId: "sq-no-escort" }),
    targetTileInput({
      mission: mission("escort", true),
      squadronId: "sq-e",
      targetValue: "strike-1",
      escortTargets
    }),
    targetTileInput({ squadronId: "sq-empty" }),
    targetTileInput({
      squadronId: "sq-a",
      targetValue: "bad-target",
      selectedTargetLabel: "bad-target"
    }),
    targetTileInput({
      squadronId: "sq-b",
      targetValue: "2,3",
      targetIsValid: true,
      selectedTargetLabel: "Enemy Armor @ 2,4"
    }),
    targetTileInput({ mission: mission("airCover", false), squadronId: "sq-cap" }),
    targetTileInput({
      mission: mission("airCover", false),
      squadronId: "sq-cap-marked",
      targetValue: "4,5",
      targetIsValid: true,
      selectedTargetLabel: "Friendly Fighter @ 4,7"
    }),
    targetTileInput({
      mission: mission("airTransport", true),
      squadronId: "sq-t",
      targetValue: "6,7",
      targetIsValid: true,
      selectedTargetLabel: "Drop Zone 6,10"
    }),
    targetTileInput({
      mission: mission("airCover", false),
      squadronId: "sq-cap-malformed",
      targetValue: "bad-cap",
      targetIsValid: false,
      selectedTargetLabel: "bad-cap"
    }),
    targetTileInput({
      mission: mission("escort", true),
      squadronId: 'sq" autofocus data-squadron-injected="yes',
      targetValue: 'strike" onclick="evil" data-target-injected="yes',
      escortTargets: [{
        value: 'strike" onclick="evil" data-target-injected="yes',
        label: "Quoted package",
        detail: "Target coast",
        meta: "Launch strip"
      }]
    })
  ];
}

function markupRoot(markup: string): HTMLElement {
  const host = document.createElement("section");
  host.innerHTML = markup;
  const root = host.firstElementChild;
  assert.ok(root instanceof HTMLElement);
  return root;
}

registerTest("AIR_SORTIE_TARGET_TILE_PRESENTATION_PRESERVES_ALL_LEGACY_BRANCH_MARKUP", () => {
  const outputs = presentationCases().map(renderAirSortieTargetTileMarkup);
  const signature = createHash("sha256").update(JSON.stringify(outputs)).digest("hex");

  assert.equal(signature, "5e214529915d91ad98065cfafcf73c861751c304a6a4b6ce9cf33b948a161cd3");
  assert.deepEqual(outputs.map((output) => output.length), [339, 441, 642, 1333, 759, 848, 847, 845, 876, 839, 878, 1471]);
  assert.match(outputs[1] ?? "", /Strike &lt;Now&gt;/);
  assert.match(outputs[1] ?? "", /Hex &gt; 3/);
  assert.match(outputs[1] ?? "", /Committed &amp; moving/);
  assert.match(outputs[3] ?? "", /Package &amp; One/);
  assert.match(outputs[3] ?? "", /Target &lt;A&gt;\. Launch &gt; B\./);
});

registerTest("AIR_SORTIE_TARGET_TILE_PRESENTATION_PRESERVES_ACTION_AND_ACCESSIBILITY_STATES", () => {
  const roots = presentationCases().map((input) => markupRoot(renderAirSortieTargetTileMarkup(input)));
  const assignButton = (index: number): HTMLButtonElement | null =>
    roots[index]?.querySelector<HTMLButtonElement>("[data-air-submit-sortie]") ?? null;

  assert.equal(roots[0]?.querySelector("button"), null);
  assert.equal(roots[1]?.querySelector("button"), null);
  assert.equal(assignButton(2)?.disabled, true);
  assert.equal(assignButton(2)?.textContent?.trim(), "Assign Escort");
  assert.equal(roots[3]?.querySelector('[data-air-escort-target="strike-1"]')?.getAttribute("aria-pressed"), "true");
  assert.equal(assignButton(3)?.disabled, false);
  assert.equal(assignButton(4)?.disabled, true);
  assert.equal(roots[4]?.querySelector("[data-air-clear-target]"), null);
  assert.equal(assignButton(5)?.disabled, true);
  assert.ok(roots[5]?.querySelector("[data-air-clear-target]"));
  assert.equal(assignButton(6)?.disabled, false);
  assert.equal(assignButton(7)?.disabled, false);
  assert.equal(roots[7]?.querySelector<HTMLButtonElement>("[data-air-clear-target]")?.disabled, true);
  assert.equal(assignButton(7)?.textContent?.trim(), "Assign Patrol");
  assert.equal(roots[8]?.querySelector<HTMLButtonElement>("[data-air-clear-target]")?.disabled, false);
  assert.equal(roots[9]?.querySelector("[data-air-pick-target]")?.textContent?.trim(), "Choose Drop Zone");
  assert.equal(assignButton(9)?.textContent?.trim(), "Commit Drop");
  assert.equal(roots[10]?.querySelector(".air-target-card__title")?.textContent, "bad-cap");
  assert.equal(assignButton(10)?.disabled, true);
  assert.equal(roots[10]?.querySelector<HTMLButtonElement>("[data-air-clear-target]")?.disabled, false);
});

registerTest("AIR_SORTIE_TARGET_TILE_PRESENTATION_IS_DETERMINISTIC_AND_DOES_NOT_MUTATE_INPUTS", () => {
  const input = targetTileInput({
    mission: mission("escort", true),
    squadronId: 'sq" autofocus data-squadron-injected="yes',
    targetValue: 'package" onclick="evil" data-target-injected="yes',
    escortTargets: [{
      value: 'package" onclick="evil" data-target-injected="yes',
      label: "A & B\u00a0Wing",
      detail: "Target <west>",
      meta: "Launch > coast"
    }]
  });
  const before = structuredClone(input);
  const first = renderAirSortieTargetTileMarkup(input);
  const second = renderAirSortieTargetTileMarkup(input);

  assert.equal(second, first);
  assert.deepEqual(input, before);
  const root = markupRoot(first);
  const choice = root.querySelector<HTMLButtonElement>("[data-air-escort-target]");
  const assign = root.querySelector<HTMLButtonElement>("[data-air-submit-sortie]");
  assert.equal(choice?.dataset.airEscortSquadron, input.squadronId);
  assert.equal(choice?.dataset.airEscortTarget, input.targetValue);
  assert.equal(assign?.dataset.airSubmitSortie, input.squadronId);
  assert.equal(choice?.hasAttribute("autofocus"), false);
  assert.equal(choice?.hasAttribute("onclick"), false);
  assert.equal(choice?.hasAttribute("data-squadron-injected"), false);
  assert.equal(choice?.hasAttribute("data-target-injected"), false);
  assert.equal(assign?.hasAttribute("autofocus"), false);
  assert.equal(assign?.hasAttribute("data-squadron-injected"), false);
  assert.match(first, /data-air-escort-squadron="sq&quot;/);
  assert.match(first, /data-air-escort-target="package&quot;/);
  assert.match(first, /A &amp; B&nbsp;Wing/);
  assert.match(first, /Target &lt;west&gt;\. Launch &gt; coast\./);
});

registerTest("POPUP_MANAGER_ADAPTS_LIVE_SQUADRON_TARGETS_ONCE_WITHOUT_CROSS_CARD_BLEED", () => {
  const manager = Object.create(PopupManager.prototype) as {
    airPlannerState: {
      missionKind: AirMissionKind | "";
      squadronValue: string;
      targetValue: string;
      targetValues: Record<string, string>;
      targetSquadronId: string;
      feedback: string;
      feedbackTone: "neutral" | "warning" | "success";
      suspendedForMapPick: boolean;
    };
    renderAirSortieTargetTileMarkup(engine: unknown, view: unknown, card: unknown): string;
    renderAirSortieRowMarkup(engine: unknown, view: unknown, card: unknown): string;
  };
  manager.airPlannerState = {
    missionKind: "strike",
    squadronValue: "sq-valid",
    targetValue: "2,3",
    targetValues: {
      "strike:sq-invalid": "bad-target",
      "strike:sq-valid": "2,3"
    },
    targetSquadronId: "",
    feedback: "",
    feedbackTone: "neutral",
    suspendedForMapPick: false
  };
  const engine = {
    botUnits: [{ type: "Enemy_Armor", hex: { q: 2, r: 3 } }],
    playerUnits: []
  };
  const selectedMission: AirMissionTemplate = {
    kind: "strike",
    label: "Strike",
    description: "",
    allowedRoles: ["strike"],
    requiresTarget: true,
    requiresFriendlyEscortTarget: false,
    durationTurns: 1
  };
  const card = (squadronId: string): Record<string, unknown> => ({
    value: squadronId,
    squadronId,
    originValue: "0,0",
    label: "Strike Wing",
    shortLabel: "SW",
    locationLabel: "0,0",
    roleLabel: "Strike",
    strength: 100,
    statusLabel: "Ready",
    statusClass: "ready",
    isReserve: false,
    disabled: false,
    refitTurns: 1,
    combatRadiusKm: 10,
    combatRadiusHex: 40
  });
  const invalidCard = card("sq-invalid");
  const validCard = card("sq-valid");
  const view = {
    missionTabs: [],
    selectedMission,
    squadronCards: [invalidCard, validCard],
    selectedSquadron: validCard,
    escortTargets: []
  };

  const invalidRoot = markupRoot(manager.renderAirSortieTargetTileMarkup(engine, view, invalidCard));
  const validRoot = markupRoot(manager.renderAirSortieTargetTileMarkup(engine, view, validCard));

  assert.equal(invalidRoot.querySelector(".air-target-card__title")?.textContent, "bad-target");
  assert.equal(invalidRoot.querySelector<HTMLButtonElement>("[data-air-submit-sortie]")?.disabled, true);
  assert.equal(validRoot.querySelector(".air-target-card__title")?.textContent, "Enemy Armor @ 2,4");
  assert.equal(validRoot.querySelector<HTMLButtonElement>("[data-air-submit-sortie]")?.disabled, false);
  assert.equal(invalidRoot.querySelector("[data-air-submit-sortie]")?.getAttribute("data-air-submit-sortie"), "sq-invalid");
  assert.equal(validRoot.querySelector("[data-air-submit-sortie]")?.getAttribute("data-air-submit-sortie"), "sq-valid");

  const maliciousSquadronId = 'sq" autofocus onclick="evil" data-squadron-injected="yes';
  const maliciousCard = card(maliciousSquadronId);
  const maliciousRowMarkup = manager.renderAirSortieRowMarkup(engine, {
    ...view,
    squadronCards: [maliciousCard],
    selectedSquadron: maliciousCard
  }, maliciousCard);
  const maliciousRow = markupRoot(maliciousRowMarkup);
  const maliciousSquadronButton = maliciousRow.querySelector<HTMLButtonElement>(".air-squadron-card");
  assert.equal(maliciousSquadronButton?.dataset.airSquadron, maliciousSquadronId);
  assert.equal(maliciousSquadronButton?.hasAttribute("autofocus"), false);
  assert.equal(maliciousSquadronButton?.hasAttribute("onclick"), false);
  assert.equal(maliciousSquadronButton?.hasAttribute("data-squadron-injected"), false);
  assert.match(
    maliciousRowMarkup,
    /data-air-squadron="sq&quot; autofocus onclick=&quot;evil&quot; data-squadron-injected=&quot;yes"/
  );
});

registerTest("AIR_SORTIE_TARGET_TILE_HAS_ONE_PURE_PRESENTATION_OWNER_WITHOUT_ENGINE_STATE_OR_DOM_AUTHORITY", () => {
  const managerSource = readFileSync("src/ui/components/PopupManager.ts", "utf8");
  const presentationSource = readFileSync("src/ui/presentation/AirSortieTargetTilePresentation.ts", "utf8");

  assert.equal(managerSource.match(/renderAirSortieTargetTilePresentation\(/g)?.length, 1);
  assert.match(presentationSource, /export function renderAirSortieTargetTileMarkup\(/);
  assert.match(presentationSource, /export function escapeAirSortieDataAttribute\(/);
  assert.equal(managerSource.match(/escapeAirSortieDataAttribute\(/g)?.length, 1);
  assert.doesNotMatch(managerSource, /data-air-squadron="\$\{this\.escapeHtml\(/);
  for (const deadMethodRoot of [
    "renderAirTargetPanelMarkup",
    "populateAirMissionKind",
    "updateAirSupportBrief",
    "disableEscortUnlessBomberScheduled",
    "populateEligibleSquadrons",
    "populateTargets"
  ]) {
    assert.doesNotMatch(
      managerSource,
      new RegExp(`\\b${deadMethodRoot}\\b`),
      `${deadMethodRoot} identifier must not return`
    );
  }
  assert.doesNotMatch(managerSource, /Queue a strike package first|Use Base CAP|Choose Drop Zone|Commit Drop/);
  assert.match(presentationSource, /Queue a strike package first/);
  assert.match(presentationSource, /Use Base CAP/);
  assert.match(presentationSource, /Choose Drop Zone/);
  assert.match(presentationSource, /Commit Drop/);
  assert.doesNotMatch(
    presentationSource,
    /BattleSidebarEngine|ensureBattleState|getSidebarEngine|\bdocument\b|\bwindow\b|HTMLElement|addEventListener|dispatchEvent/
  );
});
