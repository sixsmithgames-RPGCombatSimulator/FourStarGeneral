import type { AirMissionKind } from "../../core/types";

export interface AirSortieTargetTileMission {
  readonly kind: AirMissionKind;
  readonly requiresTarget: boolean;
}

export interface AirSortieTargetTileEscortTarget {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
  readonly meta: string;
}

export interface AirSortieTargetTilePresentationInput {
  readonly mission: AirSortieTargetTileMission | null;
  readonly squadronId: string;
  readonly cardDisabled: boolean;
  readonly statusLabel: string;
  readonly assignmentMissionLabel?: string;
  readonly assignmentTargetLabel?: string;
  readonly assignmentSummary?: string;
  readonly targetValue: string;
  readonly targetIsValid: boolean;
  readonly selectedTargetLabel: string;
  readonly escortTargets: readonly AirSortieTargetTileEscortTarget[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
}

export function escapeAirSortieDataAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function getAirSortieButtonLabel(kind: AirMissionKind): string {
  switch (kind) {
    case "airCover":
      return "Assign Patrol";
    case "escort":
      return "Assign Escort";
    case "airTransport":
      return "Commit Drop";
    default:
      return "Issue Sortie";
  }
}

function renderCommittedTargetTileMarkup(input: AirSortieTargetTilePresentationInput): string {
  return `
        <div class="air-target-card air-target-card--row air-target-card--committed">
          <span class="air-target-card__eyebrow">${escapeHtml(input.assignmentMissionLabel ?? "Current Orders")}</span>
          <strong class="air-target-card__title">${escapeHtml(input.assignmentTargetLabel ?? input.statusLabel)}</strong>
          <p class="air-target-card__detail">${escapeHtml(input.assignmentSummary ?? "Squadron already committed to an active sortie.")}</p>
          <div class="air-target-card__footnote">Committed aircraft are managed from the operations log below.</div>
        </div>
      `;
}

function renderEscortTargetTileMarkup(input: AirSortieTargetTilePresentationInput): string {
  const selectedEscort = input.escortTargets.find((entry) => entry.value === input.targetValue) ?? null;
  const canSubmit = Boolean(selectedEscort);
  return `
        <div class="air-target-card air-target-card--row">
          <span class="air-target-card__eyebrow">Escort Board</span>
          <strong class="air-target-card__title">${escapeHtml(selectedEscort?.label ?? "Select Strike Package")}</strong>
          <p class="air-target-card__detail">${escapeHtml(
            selectedEscort
              ? `${selectedEscort.detail}. ${selectedEscort.meta}.`
              : input.escortTargets.length > 0
                ? "Choose the bomber stream this escort wing will protect."
                : "Queue a strike package first, then assign escorts to it from this board."
          )}</p>
          ${input.escortTargets.length > 0 ? `
            <div class="air-target-choice-grid air-target-choice-grid--row">
              ${input.escortTargets.map((entry) => `
                <button
                  type="button"
                  class="air-target-choice"
                  data-air-escort-target="${escapeAirSortieDataAttribute(entry.value)}"
                  data-air-escort-squadron="${escapeAirSortieDataAttribute(input.squadronId)}"
                  aria-pressed="${entry.value === input.targetValue ? "true" : "false"}"
                >
                  <span class="air-target-choice__copy">
                    <span class="air-target-choice__label">${escapeHtml(entry.label)}</span>
                    <span class="air-target-choice__detail">${escapeHtml(entry.detail)}</span>
                    <span class="air-target-choice__meta">${escapeHtml(entry.meta)}</span>
                  </span>
                </button>
              `).join("")}
            </div>
          ` : ""}
          <div class="air-target-actions">
            <button
              type="button"
              class="air-button primary air-button--assign"
              data-air-submit-sortie="${escapeAirSortieDataAttribute(input.squadronId)}"
              ${canSubmit ? "" : "disabled"}
            >${escapeHtml(getAirSortieButtonLabel("escort"))}</button>
          </div>
        </div>
      `;
}

function renderHexTargetTileMarkup(input: AirSortieTargetTilePresentationInput): string {
  const mission = input.mission!;
  const targetSelected = input.targetValue.length > 0;
  const title = targetSelected
    ? input.selectedTargetLabel
    : mission.kind === "airCover"
      ? "Base CAP"
      : "Awaiting map mark";
  const detail = mission.kind === "airCover" && !targetSelected
    ? "No patrol hex selected. This wing will hold base CAP over its home strip."
    : !targetSelected
      ? "Choose a hex on the map. The board will reopen once the target is marked."
      : mission.kind === "airTransport"
        ? "Airborne infantry will launch from this transport wing and drop into the marked hex."
        : mission.kind === "airCover"
          ? "Combat air patrol will center on this hex instead of remaining over the base."
          : "Strike aircraft will stage their run against the selected hex when the mission executes.";
  const pickLabel = mission.kind === "airTransport"
    ? "Choose Drop Zone"
    : mission.kind === "airCover"
      ? "Choose Patrol Hex"
      : "Choose Target";
  const canSubmit = mission.kind === "airCover"
    ? !targetSelected || input.targetIsValid
    : mission.requiresTarget
      ? input.targetIsValid
      : true;

  return `
      <div class="air-target-card air-target-card--row">
        <span class="air-target-card__eyebrow">${escapeHtml(mission.kind === "airTransport" ? "Drop Zone" : "Target Board")}</span>
        <strong class="air-target-card__title">${escapeHtml(title)}</strong>
        <p class="air-target-card__detail">${escapeHtml(detail)}</p>
        <div class="air-target-actions">
          <button
            type="button"
            class="air-button"
            data-air-pick-target="${escapeAirSortieDataAttribute(input.squadronId)}"
          >${escapeHtml(pickLabel)}</button>
          ${mission.kind === "airCover"
            ? `<button type="button" class="air-button" data-air-clear-target="${escapeAirSortieDataAttribute(input.squadronId)}" ${targetSelected ? "" : "disabled"}>Use Base CAP</button>`
            : targetSelected
              ? `<button type="button" class="air-button" data-air-clear-target="${escapeAirSortieDataAttribute(input.squadronId)}">Clear Mark</button>`
              : ""}
          <button
            type="button"
            class="air-button primary air-button--assign"
            data-air-submit-sortie="${escapeAirSortieDataAttribute(input.squadronId)}"
            ${canSubmit ? "" : "disabled"}
          >${escapeHtml(getAirSortieButtonLabel(mission.kind))}</button>
        </div>
      </div>
    `;
}

/**
 * Canonical pure target-card presenter for the Air Support sortie board.
 * PopupManager supplies current live facts and retains all DOM, event, and command ownership.
 */
export function renderAirSortieTargetTileMarkup(input: AirSortieTargetTilePresentationInput): string {
  if (!input.mission) {
    return `
        <div class="air-target-card air-target-card--row">
          <span class="air-target-card__eyebrow">Target Board</span>
          <strong class="air-target-card__title">Orders unavailable</strong>
          <p class="air-target-card__detail">Mission data is unavailable until the battle engine is active.</p>
        </div>
      `;
  }
  if (input.cardDisabled) {
    return renderCommittedTargetTileMarkup(input);
  }
  if (input.mission.kind === "escort") {
    return renderEscortTargetTileMarkup(input);
  }
  return renderHexTargetTileMarkup(input);
}
