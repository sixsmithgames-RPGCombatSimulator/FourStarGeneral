# FSG-CAM-014 old-production checkpoint provenance

These are synthetic regression checkpoints produced by unchanged production source, not exports of an account or a claim of live gameplay certification.

- Source commit: `99a3df14a050c461ed98b8cc8cd94ffc3e7d3ae9`.
- Control resolver Git blob: `dd8894bee35b665dd6d676ded4189ca720bb0e2a`.
- Generator source: `CampaignFrontInitiative.99a3df1.generator.txt` (TypeScript, retained as text so the normal test compiler does not execute or register it).
- Output: `CampaignFrontInitiative.99a3df1.json`; two complete original envelopes and slot descriptors, including their producer-generated checksums and immutable audit chains.

The generator uses the shipped scenario, actual `CampaignState.advanceCampaign`, engagement preparation and commitment, canonical formation battle seeds, result extraction, real result application, `savePostBattleAutosave`, and verified repository load. The terminal tactical result supplies an explicit outcome with every committed formation surviving at tactical turn 35; it does not simulate 35 turns of combat. Supply fields are complete, with no additional tactical supply expenditure. No campaign fronts, audit reports, hashes, cadence, AI invocation, or stored envelopes are edited to manufacture the old signature.

`beforeCounterattack` means the authored operation has never opened: after the initial ordinary advance and Omaha victory, a second ordinary advance reaches segment 2 and incorrectly opens no Caen defense. The old writer saves that already-missed window. Loading it through the current State hook repairs only the proven unrelated front; an ordinary advance to segment 3 opens the scheduled operation through the existing AI service.

`afterResolvedCounterattack` first opens the actual segment-2 Caen defense and resolves it as a stalemate, then applies Omaha victory. Its later old-writer initiative reversal must not trigger repair or recreate that resolved operation.

## Reproduction and evidence

Materialize the commit's `src` TypeScript/JSON files and `tests/domEnvironment.ts` in an isolated source directory. Copy the retained generator to that directory's `tests/generate.ts`. Compile only that entry and `src/vite-env.d.ts` with the repository compiler options, `noEmitOnError: true`, and an isolated output directory. Run the emitted generator with the repository's `tools/resolve-js-extension-loader.mjs`, with the repository root as the working directory. Its relative output path writes this fixture. The generator checks the old corruption and verifies both actual save/repository loads before writing.

This run's extraction script, isolated source/configurations, and logs are retained under `diagnostics/fsg-cam-014`:

- `baseline-source.log`, `baseline-compile.log`, `baseline-producer.log`: unchanged-source snapshot and actual old writer.
- `compat-baseline-compile.log`, `compat-baseline-red.log`: the current positive regression compiled against the old State/control implementation, with the new pure helper available only to compute the expected repair. The actual old State load still yields `Player` where the test requires `Bot`.
- `compat-compile.log`, `final-focused-green.log`, `final-owned-lint.log`: current integration and bounded control/supply regression verification.

The positive test consumes the original envelope directly. Only explicitly named negative variants alter a defensive runtime or checksum, exercising the normal transaction/validation boundary. The compatibility helper never rewrites the historical reports or original stored save; it records an eligible correction at one new runtime revision.
