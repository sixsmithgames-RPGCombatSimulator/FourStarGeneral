# Implementation Plan: Unlock Purchase Flow and Free-Core Catalog Alignment

## Context
The live site now markets Four Star General as a free-core tactical prototype with 2 starter colleges, 2 starter factions, and paid unlock depth beyond that baseline. The app currently exposes only 1 free college and 1 free faction, does not enforce unlock ownership in commissioning or precombat allocation, and routes purchase CTAs to pricing without any entitlement-aware UI. The website currently supports authenticated free-core access plus full-app subscription access for `fourstargeneral` or `bundle`, but it does not yet expose granular per-item checkout or per-item Clerk metadata for unit unlocks.

## Goals
1. Align the in-app free-core catalog with the current marketed baseline of 2 starter colleges and 2 starter factions.
2. Introduce a shared entitlement state that consumes the live Clerk metadata contract already used by the website.
3. Gate locked colleges, factions, and unit requisitions in landing and precombat flows while preserving previewability and clear purchase CTAs.
4. Structure the client unlock logic so granular item entitlements can be added later without rewriting the UI layers.
5. Verify the slice with targeted tests and document the remaining website/backend work for true per-item purchases.

## Steps
1) Patch `src/data/unlocks.ts` to reflect the 2-college / 2-faction free-core baseline and centralize the full-unlock plan identifiers.
2) Introduce a shared unlock entitlement state that hydrates from the auth bootstrap in `index.html` and exposes ownership checks for regions, schools, and units.
3) Update `LandingScreen` commissioning flows so locked options remain previewable, cannot be commissioned without entitlement, and surface purchase CTAs.
4) Update `PrecombatScreen` allocation flows so locked units show roster-unlock CTAs instead of requisition controls while preserving scenario-provided baseline assets.
5) Run `npx tsc --noEmit`, touched-file ESLint, and `npm test`, then document the shipped client behavior and the deferred website work for granular SKU purchases.

## Impact/Blast Radius
- Primary files: `index.html`, `src/data/unlocks.ts`, `src/state/UnlockState.ts`, `src/ui/screens/LandingScreen.ts`, `src/ui/screens/PrecombatScreen.ts`, `src/main.ts`.
- Supporting consumers at risk: auth bootstrap timing, commissioning select state, precombat allocation rerendering, budget/proceed gating, and any future website-driven entitlement expansion.
- Validation-sensitive behaviors: starter option availability, locked-content purchase buttons, scenario baseline unit handling, and entitlement refresh after Clerk auth resolution.
- Known non-goals: no website checkout implementation, no Stripe SKU rollout, no backend persistence service, and no mission/campaign unlock gating beyond the existing app-level access contract.

## Validation
- Type/lint: `npx tsc --noEmit` and touched-file ESLint with zero warnings.
- Tests: `npm test` plus new unlock coverage for entitlement rules and locked allocation behavior.
- Manual checklist:
  - landing commissioning shows 2 starter factions and 2 starter colleges as usable without purchase
  - locked colleges and factions remain inspectable and expose purchase CTAs without allowing commissioning
  - locked unit rows in precombat show unlock CTAs and cannot be incremented without entitlement
  - authenticated users with the `fourstargeneral` or `bundle` plan can requisition the full roster
  - pricing redirects continue to land on the main site while carrying unlock context for future granular checkout
