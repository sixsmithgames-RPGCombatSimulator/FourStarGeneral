# Campaign First-Class Interface — FCI-4 Common Order Planning

**Roadmap IDs:** FCI-040 through FCI-046  
**Implementation date:** 2026-08-18  
**Canonical plan:** `docs/CAMPAIGN_FIRST_CLASS_INTERFACE_IMPLEMENTATION_PLAN.md`

## Intent

Give redeployment, production, reconnaissance, counterintelligence, and infrastructure repair one trustworthy player loop:

1. discover a legal action and understand why an unavailable action is blocked;
2. configure the order in a familiar staged composer;
3. inspect exact targets, costs, holds, timing, risk, objective effect, and conflicts;
4. add or atomically replace a non-spending draft;
5. inspect, reprioritize, edit, or remove drafts in the common tray;
6. commit the valid set atomically with persistent success/failure feedback;
7. preview cancellation consequences before changing a committed order;
8. advance time as a separate, explicitly bounded command.

The campaign runtime remains the sole authority. UI components may format projected facts and reason codes, but may not recreate legality, costs, availability, reservation, commitment, or refund rules.

## Current behavior before FCI-4

- The runtime owns typed drafts, reservation arbitration, deterministic validation codes, all-or-nothing commit, pre-execution cancellation, and exact refunds.
- Redeployment and production use separate modal layouts; intelligence uses a drawer-local composer; repair drafts immediately from an inspector button.
- Some action availability and transport reasons are inferred in `CampaignScreen` instead of coming from state previews.
- Detailed redeployment preview does not account for other draft holds, so composer availability can diverge from the tray validator.
- The tray shows a compact label, status, ETA, validation copy, remove/cancel, and Commit, but not a complete reservation/cancellation/dependency explanation.
- Drafts cannot be reprioritized or edited. Terminal orders remain in the horizontal tray indefinitely.
- Cancellation happens directly from the tray without an in-game consequence preview.
- Commit failure copy is untyped at the interface boundary, and the player is not explicitly told that every draft was preserved.

## Expected behavior after FCI-4

### FCI-040 — authoritative action registry

- `CampaignActionRegistry` owns action identity, labels, selection/workspace applicability, and presentation of authoritative availability previews.
- State preview services return `available`, `blocked`, or `hidden`, a stable reason code, plain-language reason, and corrective action.
- Selected-hex redeployment and repair, theater production, and every intelligence/counterintelligence operation use the registry.
- Disabled controls expose the same reason and corrective action visually and accessibly.

### FCI-041 — schema-driven composer

- Every composer exposes the same seven stages: intent; target/route; participants; timing/support; effects; conflicts; draft.
- Order-specific controls remain domain appropriate, while headings, progress language, preview hierarchy, submit semantics, and edit semantics stay consistent.
- Infrastructure repair becomes a reviewed draft action instead of an immediate one-click draft.

### FCI-042 — path/area and reservation preview

- Redeployment highlights origin and destination while planning; intelligence and repair highlight their target area.
- Preview facts use the same authoritative costs, quantities, holds, start/duration/ETA, and validation that draft creation uses.
- Draft-aware resource, transport, intelligence-capacity, asset, formation, and production-slot availability is shown before Add draft.

### FCI-043 — full order tray

- Active orders show status, next transition, route/area, costs, reservations, risk/intelligence limits, dependencies, objective interaction, and cancellation policy.
- Drafts can be inspected, removed, and edited where they have configurable fields.
- Draft priority can move earlier/later; the runtime revalidates all holds after the move.
- Conflict copy includes stable reason code, blocking rule, and a corrective action.
- Completed/cancelled orders compact into bounded history instead of growing the horizontal tray.

### FCI-044 — atomic commit feedback

- Commit uses a non-mutating authoritative preflight.
- The control reports draft count, valid count, blocker count, and first corrective action.
- Success identifies how many orders moved together and keeps Advance separate.
- Failure explicitly states that no order/resource changed and all drafts remain available for correction.

### FCI-045 — cancellation preview

- Eligible committed orders open an in-game review dialog before cancellation.
- The preview names released resources/capacity/formations/assets, sunk cost, operational delay, exposure, and whether cancellation is still legal.
- Production explains that a new allocation supersedes it instead of presenting a false cancellation path.

### FCI-046 — advance and stop clarity

- Commit and Advance remain separate controls and states.
- Uncommitted drafts are called out before advancing; advancing never implies they will execute.
- Resolve/stop summaries remain persistent through the existing campaign timeline and alert system.

## Edge cases

- No campaign/runtime loaded: actions are hidden or blocked with a load-campaign corrective action.
- Invalid or opposing selected hex: no enemy truth beyond the Player projection; actions explain only the visible control/selection limitation.
- A draft changes availability while its composer is open: Add/Replace performs an authoritative transaction and preserves the prior draft on replacement failure.
- Reprioritizing one draft can move a conflict to another: every affected draft is revalidated and the tray announces the new first blocker.
- Production has no cancellable pre-execution adapter after commitment: the UI directs the player to issue a replacement allocation.
- Repair has no meaningful editable field in the shipped domain: remove/recreate is available, while a misleading Edit control is omitted.
- Terminal order history is compacted visually but remains in authoritative state, saves, inspectors, and resolution records.
- Compact/zoom layouts keep Commit, Advance, blocker text, and per-order actions keyboard reachable.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Preview and commit drift | Preview reads runtime-owned rules and draft-aware reservation truth; focused parity tests compare projected and committed values. |
| Draft loss during edit | Replacement removes and recreates inside one runtime transaction; rollback retains the original order. |
| Reorder corrupts reservations | Only draft positions may move; the complete book is revalidated and runtime invariants run before publication. |
| Enemy-truth leak | New views contain only Player-owned orders and Player-safe map/contact inputs; no Bot order or economy payload enters the shell. |
| Accidental direct mutation | UI continues to call `CampaignState`; components receive frozen/projected view data and callbacks only. |
| Tray DOM growth | Only active states render as tray cards; terminal count compacts into history/timeline affordance. |
| Popup inconsistency/focus loss | Common composer/cancellation structure uses the existing in-game dialog surface and restores the invoking control when closed. |

No file in `src/engine`, `BattleScreen.ts`, `HexMapRenderer.ts`, or coordinate/combat math is in scope. `CampaignMapRenderer` is consumed only through its existing highlight API.

## Verification plan

- Focused domain tests: draft-aware previews, stable reason codes, atomic replacement rollback, priority revalidation, cancellation preview/refund parity, and commit preflight preservation.
- Focused command tests: common seven-stage schema, blocker/corrective feedback, full tray facts/actions, terminal compaction, and accessible cancellation gesture.
- Campaign suite: `npm run test:campaign`.
- Type/build: `npm run build`.
- Zero-warning lint on affected TypeScript, then repository lint when feasible.
- Full smoke: `npm test` before completion.
- Player journey: external-browser extension only, following Gate 3 and the relevant Gate 10 viewport/keyboard checks. If the extension or isolated live deployment is unavailable, record that as an acceptance blocker and do not substitute localhost automation for live certification.

## Change traceability

- **Intent:** one first-class, explainable, authoritative order loop.
- **Scope:** campaign order state/service APIs, campaign command projections/components/styles, focused tests, and campaign roadmap documentation.
- **Known limitation:** new action families whose domain services are not implemented remain hidden; FCI-4 does not invent air/naval, replacement, refit, upgrade, or weather orders.
- **Verification record:** see the implemented surface and gate record below.

## Implemented surface

- `CampaignOrderExperience.ts` defines the stable action registry, typed explanation mapping, and the idempotent seven-stage composer schema.
- `CampaignState.ts` owns action, production, intelligence, repair, commit, cancellation, and reservation previews; preview calculations subtract existing draft holds and default commitment is strictly Player-faction scoped.
- `CampaignOrderService.ts` supports deterministic earlier/later draft priority movement followed by complete reservation revalidation.
- `CampaignCommandShell.ts` and `CampaignContextInspector.ts` present full active-order facts, conflict codes/corrections, terminal compaction, edit/remove/reorder/cancel controls, and atomic commit status without importing campaign rules.
- `CampaignScreen.ts` connects the registry and previews to redeployment, production, intelligence/counterintelligence, infrastructure-repair, tray, cancellation, and advance flows. Replacing a draft occurs within one runtime transaction, so failed replacement retains the original order exactly.
- `campaign-command.css` provides common stage, preview, conflict, map-highlight, detailed tray, feedback, cancellation-dialog, compact, and zoom-safe presentation rules.

## Automated gate record

| Gate | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`) | Pass |
| Focused ESLint on the affected TypeScript/test surface | Pass, zero warnings |
| Campaign regression/certification suite (`npm run test:campaign`) | Pass |
| Production build (`npm run build`) | Pass |
| Repository lint (`npm run lint`) | Pass with zero errors; 166 existing warnings remain outside the FCI-4 surface |
| Full repository suite (`npm test`) | Pass |
| Action registry and shared composer contract | Pass |
| Full tray, conflict explanation, priority/edit/cancel routing, and safe-text contract | Pass |
| Draft-aware preview, atomic replacement rollback, commit preservation, cancellation/refund parity | Pass |
| Intelligence asset-hold preview and Player/Bot commit isolation | Pass |

The external-browser public-build check is recorded at `test-results/campaign-playtest/FSG-CAMPAIGN-20260818-113750/issue-log.md`. The canonical live site still serves the legacy production-specific direct-apply flow, so it does not contain this FCI-4 candidate and cannot provide a live visual/keyboard/timed certificate yet. No live state was changed and no deployment was performed. The formal timed thirty-second participant study and live external-browser visual certificate remain separate acceptance evidence; they are not replaced by source-level DOM automation or localhost-only browser runs.
