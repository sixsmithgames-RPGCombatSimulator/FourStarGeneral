# Campaign Mode — Class A+ Gap Review

Date: 2026-07-18. Scope: `CampaignScreen.ts`, `CampaignState.ts`, `CampaignMapRenderer.ts`, `campaignTypes.ts`, `campaign01.json`, `design/CAMPAIGN_MAP_DESIGN.md`, and the battle→campaign handoff in `BattleScreen.ts`. This review assumes the campaign-lockout auth race (fixed 2026-07-18 in `CampaignScreen.initialize()`) is deployed.

## Where the campaign stands

The strategic layer is a solid Phase 3 build per the design doc: the map renders with fronts, bases, and forces; the 3-hour segment clock drives daily income; redeployment has real cost modeling (transport modes, capacity reservation, round-trip returns); engagements queue into the tactical flow and battle outcomes feed back into economy and front polylines. Save/load works locally, and the built-in scenario editor is impressively complete. What follows are the gaps between this and a Class A+ campaign, in priority order.

## Gap 1 — There is no opponent (highest priority)

The Bot faction never acts. It has an economy that accrues income and power values that are computed, but no code moves its forces, launches attacks, contests tiles, or reacts to the player's advance. The campaign is currently a logistics sandbox in which the only pressure is resource cost. The design doc explicitly calls for AI mirroring of player operations ("AI behavior mirrors these operations to expand or collapse fronts"), and this is the single largest blocker to the mode feeling like a game. A credible first pass does not need deep planning: a per-day Bot phase that reinforces threatened tiles from its logistics hubs, advances toward weakly held player territory, and forces engagements when it reaches contact would transform the experience. The tactical `BotPlanner` already demonstrates the house style for this kind of heuristic work.

## Gap 2 — Battles are not generated from campaign state

When an engagement is queued, the tactical battle uses the generic "campaign" mission blueprint rather than a scenario built from what is actually on the map: the forces on the contested tiles, the terrain role of the hex (airbase, fortification, port), supply posture, and who is attacking whom. This is design-doc Phase 4 ("convert committed decisions into tactical battle blueprints") and it is the second half of what makes a campaign layer meaningful — the feeling that the strategic situation you created is the battle you fight.

## Gap 3 — Battle outcomes barely change the map

`applyBattleOutcome()` is self-described placeholder math: victory shifts one point off a front polyline, defeat pops one off the end, and no tile ever changes ownership as a result of battle. Casualties map to manpower at a coarse 10:1, and the ammo/fuel deltas passed in from `BattleScreen` are frequently zero because the supply-snapshot delta is unimplemented (the `else` branch at BattleScreen.ts:8630 hard-codes zeros). Winning a battle should capture the contested hex, transfer or destroy the defending forces, and move the front by recomputing it from the new control map — not by editing the polyline cosmetically.

## Gap 4 — No campaign victory, defeat, or arc

The scenario data model has an `objectives` list, but nothing tracks objective completion, no code evaluates a campaign win or loss, and the turn limit is 999 with no end state. A Class A+ campaign needs a defined arc: objective tracking with visible progress, a victory screen that credits the general's service record, a defeat condition (e.g., losing the staging ports or running the economy dry), and ideally a campaign-days budget that creates urgency.

## Gap 5 — Income has nowhere to go

Controlled tiles generate supplies, fuel, and manpower daily, but the only sink is redeployment cost. There is no production or reinforcement loop: no way to spend manpower to raise or replace units, no way to convert supplies into new transport capacity or aircraft, no repair/refit for depleted formations returning from battle. The economy therefore trends monotonically upward and stops mattering after the first few days. Closing this loop (even a simple "requisition units at logistics hubs, delivered after N segments" mechanic) makes the income map strategically meaningful and gives the Bot AI something to threaten.

## Gap 6 — Persistence is a single local slot, despite working auth

Campaign saves live in one `localStorage` key (`fourstar.campaign.save.v1`) on one browser. The Clerk integration now resolves entitlements correctly, but progress is not tied to the account: playing on another machine (or clearing storage) loses the campaign. The general roster has the same exposure. For a commercial Class A+ target, campaign and roster snapshots should sync to a backend keyed by the Clerk user id, with the local copy as cache/fallback, plus at least a couple of named save slots and save-format versioning (the code already handles one legacy migration, day→segment, so the pattern exists).

## Gap 7 — Turn-loop and UX friction

The segment clock advances one 3-hour segment per click, so passing a quiet day is eight clicks. An "advance until something happens" control (next arrival, next contact, next day) is standard for the genre. Other polish items: the scenario editor (Edit Mode, Export JSON) is developer tooling but ships visible in the player sidebar and should be gated behind a dev flag; the campaign card on the landing screen ignores the experience gate that the mission list enforces (3 missions / 2 victories), so the two surfaces disagree about who may enter; there is no campaign onboarding or tutorial layer, and the front/objective tooltips described in the design doc ("Eastern Front – Heavy Resistance, Engagements: 3 active") are not implemented. Partial intel / fog of war was explicitly deferred and remains absent — `intelCoverage` is computed but never consumed.

## Gap 8 — Test coverage is thin at exactly the risky joints

Campaign tests cover renderer output, status messaging, and state observation — three files. Untested: redeployment cost math and capacity reservation/release, segment processing (arrivals, round-trip returns, front extension after 16 segments), `applyBattleOutcome`, save/load round-trips including legacy migration, and unlock gating under late auth hydration. Today's lockout bug was precisely the kind of race a "hydrate after initialize" test would have caught; adding one alongside the fix is cheap insurance.

## Suggested order of attack

Bot strategic AI (Gap 1) and battle generation from campaign state (Gap 2) are the game-defining pair and justify the most effort. Territory-changing battle outcomes (Gap 3) is small and should ride along with Gap 2 since they touch the same handoff. Victory conditions (Gap 4) then give the loop a destination. Production (Gap 5) and cloud saves (Gap 6) round out the commercial feel, and the UX items (Gap 7) can be folded in continuously, with the editor dev-gating and the multi-segment advance button as the quickest wins.
