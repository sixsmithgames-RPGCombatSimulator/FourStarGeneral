# Combat presentation audit — 2026-10-15

## 17 October follow-up

The duplicate machine-gun recording and incorrect duration metadata identified below are the subject of a bounded follow-up repair. See [the gameplay-quality follow-up](GAMEPLAY_QUALITY_FOLLOWUP_2026-10-17.md) for current verification and deployment status. Original measurements and lifecycle results remain historical; subjective overlapping-mix listening remains uncompleted.

## Intent and boundaries

Verify that combat sound follows the existing visual event, cannot strand an
attack when browser audio is blocked, and reports broken assets truthfully.
Read-only animation review follows `AIR_SHOW_NORTH_STAR_SPEC.md` and
`ITERATION_GOVERNANCE.md`: the director owns choreography, the timeline player
owns actor lifecycle, and audio must not become a second timing authority.

## Initial findings and implementation plan

- `CombatSoundManager.playWeaponSound` awaits `AudioContext.resume()` without a
  deadline. A browser may keep that promise pending until a permitted gesture;
  the renderer awaits the sound burst along with muzzle effects, so sound can
  strand combat presentation. Bound resume readiness to 250ms, skip the expired
  cue, and allow a later fresh cue to succeed. Never replay old cues on unlock.
- Muted sound requests still resume the context and create sources. Skip requests
  while muted, including requests muted while awaiting readiness/preload, so
  turning sound back on cannot reveal an old cue that started silently.
- Audio fetch/decode errors return `null`, allowing catalog loading to report
  success despite missing sounds. Surface asset-specific loading errors and
  publish unavailable audio with an actionable reason. Optional playback should
  settle without adding an unhandled rejection after a reported preload failure.
- `HexMapRenderer.playWeaponSoundBurst` wraps a sound promise without forwarding
  rejection. The same defect affects delayed formation tracers/impacts, bombs,
  rockets, muzzle flashes, and dust. One scheduling primitive must own successful
  completion and sync/async failure without changing authored delays.
- Renderer effects awaited audio catalog loading, so a stalled network/decode
  could also stop visual combat. Sound preload is now independent: a cue while
  loading is skipped, never queued; later fresh cues use the decoded catalog.

Scope: `src/audio/CombatSoundManager.ts`,
`src/rendering/CombatEffectScheduling.ts`, the delayed-effect boundaries in
`src/rendering/HexMapRenderer.ts`, focused audio/presentation tests, and this
report. The high-risk renderer impact plan is recorded in the 2026-10-15 section
of `implementation_plan.md`. No engine state, combat result, choreography,
weapon mixing, authored sound assets, or actor ownership changes.

Risk: readiness timeouts can skip a first cue on a slow browser; this is preferable
to replaying a cue after its visual moment. Retrying is limited to a new event.
Audio capability and saved volume remain separate. Broken-asset availability
recovers only after a successful catalog reload, not by silently substituting a
different sound.

## Verification

Before the correction, new tests reproduced both muted cue allocation/resume
and an indefinitely pending autoplay resume. Both failed against the prior
implementation.

After the correction:

- 20/20 audio and presentation lifecycle tests pass, including the existing
  unavailable-Web-Audio contract. Coverage includes blocked/rejected unlock,
  late unlock with no stale replay, mute during resume, pending preload with no
  visual dependency or audio backlog, failed fetch/decode and reload recovery,
  muzzle/impact separation, ended/failed-source cleanup, invalid master volume,
  exact scheduled delay, synchronous and asynchronous effect failures, public
  attacks for infantry/tank/artillery/rocket/fighter/bomber, and a subsequent
  successful attack after failure.
- 10/10 existing affected renderer regression tests pass: formation muzzle mix,
  direct fire, infantry support layers, Flak 88, artillery, bomb sticks, rockets,
  registered impact sprites, and failed impact propagation.
- Focused strict TypeScript emission and zero-warning lint pass. A separate
  temporary output tree was used; existing generated Jest output was preserved.
- Parent-coordinated browser decoding succeeded for all 15 assets in Chromium
  and Firefox. The installed Windows WebKit runtime has no Web Audio constructor
  and explicitly reports unsupported capability rather than claiming an audio
  pass. Detailed measurements are in `diagnostics/audio-audit-20261015/`.

Exact test filters: `COMBAT_SOUND_|COMBAT_PRESENTATION_` and
`HEXMAP_(SMALL_ARMS_MUZZLE|DIRECT_FIRE_ATTACK|INFANTRY_ATTACK|FLAK_88|ARCING_ARTILLERY|AIR_BOMBING|LARGE_BOMB|ROCKET_ARTILLERY|IMPACT_HITS|FAILED_IMPACT)`.

Complete repository, painted-frame, and temporal certificates are coordinated
by the parent audit. The focused tests above prove lifecycle and boundary
correctness, not a complete visual or subjective audio certificate.

## Resolved initiative presentation boundary — follow-up plan

The initiative UI rebuilt movement from only origin/destination, discarding the
engine's route around blocked hexes. Attack visuals then read the current lead
unit at the firing hex after combat had already advanced or destroyed the real
attacker. A secondary stacked formation could therefore emit another unit's
weapon effects and sound, despite correct deterministic combat resolution.

Intent: consume the exact committed movement path and explicit attacker identity
and type supplied by the initiative result. Pass immutable presentation context
through the existing effect selectors; do not overwrite per-hex caches or create
a second combat authority. Old callers without context retain their existing
hex-based API. Recoil/facing must not affect an unrelated survivor when the
attacker no longer occupies the firing hex. All authored effect profiles,
sound choices for a given formation, and timing remain unchanged.

Scope: initiative playback in `BattleScreen.ts`, explicit optional attack context
in `HexMapRenderer.ts`, and focused route/stack/absent-attacker regression tests.
The parent owns initiative event production, shared registrations, and line-budget
ratchets. Risk: a context missed by a nested selector could still choose the lead
unit's muzzle/impact sound; tests must observe public playback through those
selectors, including concurrent attacks with different identities. Visual
movement actors remain subject to existing visibility and lifecycle ownership.

The screen also observes authoritative bot movement before mission scoring or
any animation wait. Conventional turns use a clone-only pending-summary read;
initiative results use the committed path even if the mover is subsequently
destroyed. Legacy endpoint-only visual callers never manufacture mission
transit evidence. This preserves River Watch's comms-runner rule across turn
ordering and saved mission ledgers.

Focused verification: all eight new route/identity tests pass. The final combined
run passes 27/27 route, identity, lifecycle, and authored-effect regressions. Strict
TypeScript emission and zero-warning changed-file lint pass. The new pure
presentation helpers preserve the old weapon-role mixture and waypoint conversion
without adding combat rules or shared mutable rendering state.

Destroyed or advanced attackers retain their authored shot/impact profile at
the resolved firing hex; this change does not resurrect a removed sprite or
invent casualties. The later identity cross-review below extends this context
to all attack modes and identifies the actual first counterfire participant.

## Final identity cross-review follow-up

The release review found two remaining consumers of mutable hex occupants:
movement with an explicit missing unit ID fell back to the whole stack, and
player/conventional attack playback did not pass the new resolved actor context.
Intent: an absent actor must never move, hide, face, or recoil an unrelated
survivor. Keep ID-less legacy movement behavior unchanged. Feed player previews
and canonical resolved attack metadata into the same immutable presentation
projection used by initiative playback, including counterfire identity where
the resolver identifies it. Do not infer a dead actor from current occupants.
Risk: aggregate counterfire may have a different actor from the primary defender;
only the outcome owner may identify that actor. Tests must observe rendered DOM
at movement priming, plus actual screen-to-renderer contexts in every mode.
Authored effect timing, geometry, damage, RNG, and simulation state stay unchanged.

Result: the missing-mover DOM test failed against the old whole-stack behavior
and passes after exact-ID selection. All three screen paths now pass immutable
forward and counterfire participants. Player forward fire reads the canonical
preview; player return fire reads the first `targetRichDefenders` entry marked
`retaliationOccurred`. Bot modes consume the outcome projection's optional
attacker/defender IDs and its distinct first-retaliator metadata. Seven focused
route/cross-mode/missing-actor checks pass; the expanded lifecycle, movement,
identity, and player sequencing slice passes 27/27. Strict TypeScript and
changed-file diff checks pass. Renderer and screen are smaller, at 6,466 and
14,361 verifier lines; no architecture allowance was widened.

Compatibility limitation: legacy results without counterfire identity retain
their authored defender-type cue but never claim a particular surviving sprite.
As before, aggregate stacked counterfire has one presentation sequence; its cue
now belongs to the first actual retaliator rather than the selected primary
target. This change does not invent extra shots for every aggregated participant.

## Ownership and remaining quality observations

`AirShowDirector` still owns the immutable timeline and the renderer still has
one elapsed-time player. Impact, flak, and smoke failure observation never waits
on effects or alters actor paths. One `CombatSoundManager` remains the audio
owner. Muzzle visuals explicitly suppress duplicate sound; impact-only cues do
not repeat muzzle transients. The new scheduler observes detached effect errors
immediately but preserves rejection for attacks that join those effects later.

The asset audit found two quality issues that are not repaired by changing
playback timing: `mg_fire_02.mp3` and `mg_fire_03.mp3` are byte-identical, and
decoded files last roughly 1–2 seconds while catalog duration metadata says
180–820ms. That metadata is not used by production timing. Browser decoding
reports sample peaks of roughly 1.00–1.14; default master gain 0.7 leaves headroom
for an individual sample, but this does not certify overlapping mixed output.
A controlled real-mix recording/listening pass remains necessary before claiming
the soundtrack is balanced. No authored sound, gain staging, or limiter was
invented to disguise these unmeasured concerns. Airshow flak/tracer effects remain
as authored; this repair does not add guessed sound effects.
