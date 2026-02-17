# TODO: Battle Combat Interaction

<!-- STATUS: 📌 IN PROGRESS - Battle-screen combat interactions need iterative implementation. Logged 2025-10-26. -->

## Objective
- Provide a step-by-step checklist for activating direct combat actions on the battle screen without regressing existing deployment or movement flows.

## Non-Negotiable Rules
- Reuse the current BattleScreen orchestration; do not introduce new global state or modal frameworks.
- Keep combat prompts accessible (keyboard focusable, screen-reader friendly message text).
- Ensure engine calls remain synchronous and validated before mutating state to avoid desyncs (per CODEX Section 7).
- Comment every new helper describing what it does and why, honoring the user preference memory.

## Tasks
- **[Combat-1] Attack Confirmation Prompt** <!-- STATUS: 🔲 Pending - BattleScreen should ask for confirmation before resolving attacks triggered via hex selection. -->
  - Detect when the player clicks an attackable enemy hex after selecting a friendly unit.
  - Surface a confirmation dialog naming the attacking and defending units and target hex.
  - Only resolve the attack when the commander confirms; otherwise leave the state untouched and announce the cancellation.
- **[Combat-2] Battle Log Announcement** <!-- STATUS: 🔲 Pending - Announce attack outcomes through the HUD announcement queue so commanders receive consistent feedback. -->
  - After a confirmed attack resolves, push a concise message summarizing damage and losses.
  - When an attack is cancelled, broadcast a cancellation notice to keep the queue in sync.
- **[Combat-3] UI Polish & Accessibility** <!-- STATUS: 🔲 Pending - Ensure the confirmation dialog and attack overlays meet accessibility guidelines. -->
  - Provide focus trapping, keyboard shortcuts (Enter to confirm, Escape to cancel), and ARIA roles for the dialog.
  - Verify icon or highlight states differentiate move targets from attack targets for color-blind accessibility.
