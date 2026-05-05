# Precombat UI Styling TODO

<!-- STATUS: 🔲 PENDING IMPLEMENTATION - Styling tasks for the precombat screen remain outstanding. -->

## Non-Negotiable Rules
- **Read the existing stylesheet blocks in `index.html` and any linked CSS** completely prior to edits; understand current design tokens and layout rules first. <!-- STATUS: 🔲 Pending - Stylesheet review outstanding. -->
- **Do not overhaul global styling**; limit changes to the precombat sections and keep existing classes intact unless a task demands adjustments. <!-- STATUS: 🔲 Pending - Guidance for planned work. -->
- **Maintain visual parity** with current art direction—avoid introducing new colors or fonts without approval. <!-- STATUS: 🔲 Pending - Palette adherence to be verified. -->
- **Comment notable styling decisions** (e.g., responsive breakpoints, state modifiers) so future contributors know the rationale. <!-- STATUS: 🔲 Pending - Comments to be added during implementation. -->

- **[STYLE-1]** Review `index.html` `<style>` block for `.allocation-*` selectors; if missing or incomplete, append the CSS snippet from `PRECOMBAT_SCREEN_TODO.md` ensuring naming matches rendered markup (`.allocation-items`, `.allocation-item`, `.allocation-btn`, etc.). <!-- STATUS: ✅ Completed 2025-10-24 - Allocation selectors reviewed and aligned with markup in `index.html`. -->
- **[STYLE-2]** Introduce CSS variables for spacing and colors reused across sections (e.g., `--allocation-gap`, `--allocation-bg`) to maintain consistency with existing design tokens. <!-- STATUS: 🔲 Pending - Variable audit outstanding. -->
- **[STYLE-3]** Add responsive rules so allocation sections wrap gracefully on screens narrower than 1024px, using `grid-template-columns` adjustments. <!-- STATUS: ✅ Completed 2025-10-24 - Breakpoints tuned at 1024px to wrap sections per spec. -->
- **[STYLE-4]** Apply focus states (`outline`, `box-shadow`) to `.allocation-btn` for accessibility; ensure contrast meets WCAG AA. <!-- STATUS: ✅ Completed 2025-10-24 - Focus-visible styling confirmed in `index.html`. -->
- **[STYLE-5]** Style the budget panel (`#precombatBudgetPanel`) with modifiers for normal vs over-budget states using `[data-state="over-budget"]` attribute toggled by validation module. <!-- STATUS: ✅ Completed 2025-10-24 - Within/over budget states styled with new attribute selectors. -->
- **[STYLE-6]** Ensure modal `#allocationWarningModal` displays with backdrop blur and aligns with other popup styles. Add animations for showing/hiding if consistent with existing patterns. <!-- STATUS: ✅ Completed 2025-10-24 - Overlay styling validated against reference animations. -->
- **[STYLE-7]** Validate overall precombat layout against reference screenshots, adjusting typography, padding, and button sizes as needed to match the intended visual hierarchy. <!-- STATUS: 🔲 Pending - Visual parity not confirmed. -->
- **[STYLE-8]** Manually test in at least two viewport sizes (1280px and 960px) to confirm layout holds and no content overflows. <!-- STATUS: 🔲 Pending - Responsive testing not performed. -->
