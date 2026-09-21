import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RosterSnapshotEntry } from "../src/contracts/IPopupManager";
import { PopupManager } from "../src/ui/components/PopupManager";
import { projectRosterSectionPresentation } from "../src/ui/presentation/RosterEntryPresentation";
import { registerTest } from "./harness.js";

function rosterEntry(overrides: Partial<RosterSnapshotEntry> = {}): RosterSnapshotEntry {
  return {
    unitKey: "armor-1",
    label: "1st Armor",
    strength: 25,
    experience: 50,
    ammo: 1,
    fuel: 10,
    status: "reserves",
    ...overrides
  };
}

registerTest("ROSTER_ENTRY_PRESENTATION_PRESERVES_DUPLICATE_STATUS_STAT_AND_ACTION_MARKUP_PARITY", () => {
  const projected = projectRosterSectionPresentation([
    rosterEntry(),
    rosterEntry({ unitKey: "armor-2", strength: 90, ammo: 8, fuel: 60 })
  ]);

  assert.deepEqual(projected.entries.map(({ unitKey, label, status }) => ({ unitKey, label, status })), [
    { unitKey: "armor-1", label: "1st Armor #1", status: "reserves" },
    { unitKey: "armor-2", label: "1st Armor #2", status: "reserves" }
  ]);
  assert.equal(projected.entries[0]?.markup, `
      <li class="army-roster-item">
        <div class="army-roster-entry reserve-item reserves-selectable" data-unit-key="armor-1">
          <div class="reserve-visual"><span class="reserve-thumb reserve-thumb--fallback" aria-hidden="true">1A</span></div>
          <div class="reserve-copy">
            <div class="army-roster-line">
              <strong>1st Armor #1</strong>
              <span class="army-roster-status army-roster-status--reserve">Reserve</span>
            </div>
            <div class="army-roster-stats"><span class="army-roster-stat army-roster-stat--critical"><abbr title="Strength">STR</abbr><strong>25</strong></span><span class="army-roster-stat"><abbr title="Experience">EXP</abbr><strong>50</strong></span><span class="army-roster-stat army-roster-stat--critical"><abbr title="Ammo">AMMO</abbr><strong>1</strong></span><span class="army-roster-stat army-roster-stat--critical"><abbr title="Fuel">FUEL</abbr><strong>10</strong></span></div>

          </div>
          <div class="roster-actions"><button type="button" class="roster-deploy-btn" data-roster-deploy="armor-1" aria-label="Deploy 1st Armor #1 from reserves to base camp" title="Reserve call-ups arrive at base camp automatically">Deploy</button></div>
        </div>
      </li>
    `);
  assert.equal(projected.markup, projected.entries.map((entry) => entry.markup).join(""));
  assert.match(projected.entries[1]?.markup ?? "", /army-roster-stat--good[^>]*><abbr title="Strength">STR/);
  assert.match(projected.entries[1]?.markup ?? "", /army-roster-stat--good[^>]*><abbr title="Ammo">AMMO/);
  assert.match(projected.entries[1]?.markup ?? "", /army-roster-stat--good[^>]*><abbr title="Fuel">FUEL/);
});

registerTest("ROSTER_ENTRY_PRESENTATION_PRESERVES_SUPPORT_AIR_EXHAUSTED_AND_DETAIL_BRANCHES", () => {
  const projected = projectRosterSectionPresentation([
    rosterEntry({
      unitKey: "artillery-support",
      label: "Corps Artillery",
      status: "support",
      supportCategory: "Artillery Support",
      strength: 3,
      fuel: null,
      logisticsRole: "repair",
      personnelStatus: {
        fit: 72,
        injured: 3,
        wounded: 2,
        severelyWounded: 1,
        killed: 2,
        total: 80,
        casualties: 8,
        readiness: 90
      },
      equipmentStatus: {
        operational: 8,
        damaged: 1,
        disabled: 1,
        destroyed: 2,
        total: 12,
        losses: 4,
        readiness: 67
      },
      suppression: 2
    }),
    rosterEntry({
      unitKey: "air\"support",
      label: "9th \"Air\" & Wing",
      status: "support",
      supportCategory: "Air Support",
      strength: 4,
      fuel: null,
      sprite: "/assets/fighter&.png"
    }),
    rosterEntry({ unitKey: "spent", label: "Spent Battalion", status: "exhausted", strength: 40, ammo: 2, fuel: 20 })
  ]);

  const artilleryMarkup = projected.entries[0]?.markup ?? "";
  assert.match(artilleryMarkup, /army-roster-status--support">Artillery Support/);
  assert.match(artilleryMarkup, /army-roster-stat--good"><abbr title="Charges Remaining">CHARGES<\/abbr><strong>3/);
  assert.doesNotMatch(artilleryMarkup, /<abbr title="Strength">STR/);
  assert.match(artilleryMarkup, /Repair logistics/);
  assert.match(artilleryMarkup, /P 72\/80 fit · 3 inj · 2 wnd · 1 sev · 2 KIA · 90% ready/);
  assert.match(artilleryMarkup, /Eq 8\/12 op · 1 dmg · 1 dis · 2 lost · 67% ready/);
  assert.match(artilleryMarkup, /Supp 2/);

  const airMarkup = projected.entries[1]?.markup ?? "";
  assert.match(airMarkup, /<abbr title="Strength">STR/);
  assert.match(airMarkup, /<abbr title="Fuel">FUEL<\/abbr><strong>—/);
  assert.doesNotMatch(airMarkup, /CHARGES/);
  assert.match(airMarkup, /data-unit-key="air&quot;support"/);
  assert.match(airMarkup, /<strong>9th &quot;Air&quot; &amp; Wing<\/strong>/);
  assert.match(airMarkup, /src="\/assets\/fighter&amp;\.png"/);

  const exhaustedMarkup = projected.entries[2]?.markup ?? "";
  assert.match(exhaustedMarkup, /army-roster-status--exhausted">Out of action/);
  assert.match(exhaustedMarkup, /army-roster-stat--warning"><abbr title="Strength">STR/);
  assert.match(exhaustedMarkup, /army-roster-stat--warning"><abbr title="Ammo">AMMO/);
  assert.match(exhaustedMarkup, /army-roster-stat--warning"><abbr title="Fuel">FUEL/);
});

registerTest("ROSTER_ENTRY_PRESENTATION_IS_DETACHED_FROM_MUTABLE_ROSTER_INPUTS", () => {
  const inputs = [rosterEntry({
    personnelStatus: {
      fit: 9,
      injured: 1,
      wounded: 0,
      severelyWounded: 0,
      killed: 0,
      total: 10,
      casualties: 1,
      readiness: 90
    }
  })];
  const projected = projectRosterSectionPresentation(inputs);
  const before = structuredClone(projected);

  inputs[0]!.label = "Mutated unit";
  inputs[0]!.strength = 100;
  inputs[0]!.personnelStatus!.fit = 0;
  inputs.push(rosterEntry({ unitKey: "late-entry" }));

  assert.deepEqual(projected, before);
  assert.notEqual(projected.entries, inputs);
});

registerTest("POPUP_MANAGER_DELEGATES_ROSTER_MARKUP_ONCE_AND_RETAINS_EVENT_OWNERSHIP", () => {
  const host = document.createElement("section");
  host.innerHTML = '<ul data-roster-list="reserves"></ul>';
  const manager = Object.create(PopupManager.prototype) as {
    renderRosterSection(
      container: HTMLElement,
      listKey: "frontline" | "reserves" | "support" | "exhausted",
      entries: RosterSnapshotEntry[]
    ): void;
  };
  const selected: string[] = [];
  const onSelect = (event: Event): void => {
    selected.push((event as CustomEvent<{ unitKey: string }>).detail.unitKey);
  };
  document.addEventListener("battle:selectReserve", onSelect);
  try {
    manager.renderRosterSection(host, "reserves", [rosterEntry()]);
    const row = host.querySelector<HTMLElement>(".army-roster-entry.reserves-selectable");
    const button = host.querySelector<HTMLButtonElement>("[data-roster-deploy]");
    assert.ok(row);
    assert.ok(button);
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.tabIndex, 0);
    assert.equal(row.querySelector("strong")?.textContent, "1st Armor");
    row.click();
    button.click();
    assert.deepEqual(selected, ["armor-1", "armor-1"]);
  } finally {
    document.removeEventListener("battle:selectReserve", onSelect);
  }
});

registerTest("POPUP_MANAGER_PRESERVES_THE_EMPTY_ROSTER_SECTION_STATE", () => {
  const host = document.createElement("section");
  host.innerHTML = '<ul data-roster-list="reserves"></ul>';
  const manager = Object.create(PopupManager.prototype) as {
    renderRosterSection(
      container: HTMLElement,
      listKey: "frontline" | "reserves" | "support" | "exhausted",
      entries: RosterSnapshotEntry[]
    ): void;
  };

  manager.renderRosterSection(host, "reserves", []);

  const list = host.querySelector<HTMLUListElement>('[data-roster-list="reserves"]');
  assert.equal(list?.children.length, 1);
  assert.equal(list?.querySelector(".army-roster-empty")?.textContent, "No units recorded.");
  assert.equal(list?.querySelector(".army-roster-entry"), null);
});

registerTest("POPUP_MANAGER_HAS_ONE_PURE_ROSTER_PRESENTATION_OWNER_WITHOUT_STATE_OR_DOM_LEAKAGE", () => {
  const managerSource = readFileSync("src/ui/components/PopupManager.ts", "utf8");
  const presentationSource = readFileSync("src/ui/presentation/RosterEntryPresentation.ts", "utf8");

  assert.equal(managerSource.match(/projectRosterSectionPresentation\(/g)?.length, 1);
  assert.match(managerSource, /list\.innerHTML = presentation\.markup/);
  assert.doesNotMatch(managerSource, /private\s+disambiguateRosterEntries\s*\(/);
  assert.doesNotMatch(managerSource, /private\s+composeRosterEntryMarkup\s*\(/);
  assert.doesNotMatch(managerSource, /private\s+extractInitials\s*\(/);
  assert.match(managerSource, /extractDisplayInitials\(profile\.identity\.name\)/);
  assert.doesNotMatch(managerSource, /Charges Remaining|Repair logistics|army-roster-stat--critical/);
  assert.match(presentationSource, /Charges Remaining/);
  assert.match(presentationSource, /Repair logistics/);
  assert.match(presentationSource, /army-roster-stat--critical/);
  assert.match(presentationSource, /extractDisplayInitials\(entry\.label\)/);
  assert.doesNotMatch(presentationSource, /\bdocument\b|\bwindow\b|addEventListener|dispatchEvent|ensureBattleState|getSidebarEngine/);
});
