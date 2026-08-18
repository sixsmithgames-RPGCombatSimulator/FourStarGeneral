# Campaign verification certificate — 2026-08-15

## Result

The current campaign implementation passed its deterministic campaign suite, production build, and two real browser campaign-to-tactical stories. No blocking campaign defect remains in the tested scope.

This certificate covers campaign command, persistence, fog/intelligence, formations, AI planning, engagement creation, tactical handoff in both directions, and exact formation provenance. It does not claim that every possible multi-week campaign permutation has been exhaustively played.

## Environment

- Workspace: `C:\FourStarGeneral`
- Date: 2026-08-15
- Browser target: Vite development server at `http://127.0.0.1:4173/`
- Browser driver: agent-browser 0.34.0
- Production compiler/bundler: TypeScript and Vite 5.4.20
- Local browser entitlement: a local `fsg:authResolved` event was injected for certification. Production identity-provider behavior was not part of this campaign test.

## Automated verification

### Dedicated campaign certificate

Command:

```text
npm run test:campaign
```

Result: **113 passed, 0 failed, exit 0** across 29 imported suites. The dedicated runner uses top-level `await`, so Node remains alive until every registered campaign scenario completes.

Coverage includes:

- campaign map rendering and state observation;
- runtime initialization, scenario cutover, and atomic validation;
- save/load, persisted infrastructure, and tactical save completeness/UX;
- intelligence, counter-intelligence inputs, fog-limited engagement context, and contact confidence;
- command workspaces, typed orders, segment resolution, and advance controls;
- formation creation, exact campaign-to-tactical provenance, engagement ledgers, and result extraction;
- campaign battle generation, template selection, defensive geometry, deployment-zone copy, and logistics minimums;
- battle consequences, campaign control, objectives, end states, and after-action reports;
- strategic AI assessment, planning, and offensive engagement creation;
- screen transitions, precombat presentation, and authoritative tactical mission handoff.

### Repository smoke and production build

- `npm test`: exit 0; 65 pass markers emitted by the existing broad smoke entrypoint.
- `npm run build`: exit 0; TypeScript and production Vite bundle completed successfully.
- Scoped `git diff --check`: no whitespace errors in the campaign implementation and certificate files.

The broad `tests/index.ts` entrypoint uses a legacy unobserved async IIFE and is therefore treated only as a smoke check. `npm run test:campaign` is the authoritative, fully awaited campaign certificate.

## Browser stories

### Campaign command and persistence

The real campaign UI was exercised across all six command workspaces:

1. Situation
2. Forces
3. Logistics
4. Intelligence
5. Air/Naval
6. HQ

Verified behavior:

- the intelligence drawer opens and presents the limited operational picture;
- a production allocation draft was created with the default 40/30/10/20 split and committed as a typed campaign order;
- a campaign was saved at revision 0/segment 0, advanced to revision 1/segment 1, and restored to revision 0/segment 0;
- a second save at revision 2 survived a hard browser reload and restored the exact committed order;
- the final browser error log was empty.

### Player-initiated attack

A real Player logistics formation was positioned next to the Bot-held target and the normal campaign queue/precombat path was used.

- Engagement: **Port Assault — Hex 28,38**
- Precombat banner: correct campaign engagement and target hex
- Tactical mission key: `campaign`, not the default training mission
- Generated battlefield: 504 hexes and 4 objectives
- Tactical scenario: **Port Assault — Hex 28,38**
- Enemy presentation: campaign intelligence visibility rules remained active

This verifies that campaign intent, engagement identity, and generated scenario context survive the campaign → precombat → tactical boundary.

### Enemy offensive and mandatory defense

Fresh campaigns do not naturally begin in contact, so a deterministic certification setup positioned the forces and invoked the real campaign AI offensive service inside the real campaign transaction. No engagement DOM was fabricated.

- Engagement: **Enemy Offensive · Depot Raid Defense — Hex 27,37**
- Frozen attackers: 2 Bot infantry formations
- Frozen defenders: 10 exact Player formations
  - 5 Panzer IV formations
  - 5 campaign `Artillery_155mm` formations represented by deployable howitzer tactical proxies
- Intelligence briefing: one medium-confidence contact plus explicit unknowns
- Player response: mandatory defense; allocations remained locked to the frozen campaign force package
- Generated battlefield: Carentan defensive template, 468 hexes
- Deployment zones: player-facing defensive names and descriptions, with authored defender geometry preserved
- Base camp: assigned by a real map click
- Tactical reserve: all 10 exact formations appeared (5 tanks and 5 howitzers)
- Auto-deploy: completed with no remaining units
- Begin Mission: succeeded and entered live tactical play
- Final browser error log: empty

This verifies the reverse direction: strategic AI → frozen campaign engagement → defensive precombat → exact tactical deployment → live battle.

## Defects found and corrected

1. **Campaign editor mutation was not atomic.** Moving an objective-bearing base to an invalid tile could partially corrupt the live scenario before validation failed. Scenario replacement now clones, validates, and splits before assigning live state; the UI reports a structured warning.
2. **Campaign context broke the precombat layout.** The engagement banner mounted inside the budget grid and stretched the panel. It now mounts in the precombat header and remains full-width outside allocation controls.
3. **Campaign attacks could load Coastal Push.** BattleScreen previously trusted UI mission state even though campaign flow bypasses LandingScreen. Frozen precombat mission information is now authoritative, and campaign queueing synchronizes the UI mission key.
4. **Players could manually queue enemy-initiative fronts.** Bot initiative is now blocked from the normal player launch action; frozen enemy offensives still expose the dedicated defensive response.
5. **Defensive templates could be inverted twice.** Templates now declare their authored player role. Already-defensive maps preserve player ground; attacker-authored maps invert exactly once and receive neutral, player-facing deployment copy.
6. **Heavy artillery could lose campaign provenance.** `Artillery_155mm` had mapped to an abstract support asset without a deployment template. It now uses a deployable howitzer proxy while retaining the exact campaign formation ID and original campaign unit type for result extraction and consequences.
7. **Unopposed flak damage had no player announcement.** The tactical handoff path now announces flak results even when no air-to-air interception event accompanies the strike.

## Residual risks and next automation step

- There is not yet a checked-in browser E2E spec for the full campaign story. The real browser certificate above was executed interactively with agent-browser.
- Natural strategic AI contact depends on player redeployment and campaign geography. The enemy-offensive browser story therefore used deterministic setup followed by the real AI service and transaction.
- Hidden screens can emit non-fatal zero-size MapViewport initialization warnings; visible campaign and tactical maps rendered correctly.
- Local development emits the expected Clerk guest/bootstrap warning when certification uses the injected local entitlement event.

The highest-value follow-up is to encode the two browser stories as a stable campaign Playwright spec while retaining `npm run test:campaign` as the deterministic engine/state gate.
