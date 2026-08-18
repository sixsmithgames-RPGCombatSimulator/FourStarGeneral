/** Browser-DOM component and stable metadata for the six campaign workspaces. */

import type { CampaignWorkspaceId } from "../CampaignCommandUIState";

export interface CampaignWorkspaceDefinition {
  readonly id: CampaignWorkspaceId;
  readonly shortLabel: string;
  readonly label: string;
  readonly description: string;
  readonly shortcut: string;
}

export const CAMPAIGN_WORKSPACES: readonly CampaignWorkspaceDefinition[] = Object.freeze([
  { id: "situation", shortLabel: "SIT", label: "Situation", description: "Objectives, alerts, and command priorities", shortcut: "1" },
  { id: "forces", shortLabel: "FOR", label: "Forces", description: "Player formations and current locations", shortcut: "2" },
  { id: "logistics", shortLabel: "LOG", label: "Logistics", description: "Resources, transport, and production", shortcut: "3" },
  { id: "intelligence", shortLabel: "INT", label: "Intelligence", description: "Contacts, coverage, and operations", shortcut: "4" },
  { id: "airNaval", shortLabel: "A/N", label: "Air & Naval", description: "Available theater support assets", shortcut: "5" },
  { id: "headquarters", shortLabel: "HQ", label: "Headquarters", description: "Session, records, and campaign tools", shortcut: "6" }
]);

function createTextElement(tagName: keyof HTMLElementTagNameMap, className: string, value: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = value;
  return element;
}

export function createCampaignWorkspaceRail(): HTMLElement {
  const rail = document.createElement("nav");
  rail.className = "campaign-workspace-rail";
  rail.setAttribute("aria-label", "Campaign workspaces");
  rail.setAttribute("role", "tablist");
  CAMPAIGN_WORKSPACES.forEach((workspace, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `campaignWorkspaceTab-${workspace.id}`;
    button.className = "campaign-workspace-tab";
    button.dataset.campaignWorkspaceTab = workspace.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "campaignWorkspacePanel");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");
    button.setAttribute("aria-keyshortcuts", workspace.shortcut);
    button.tabIndex = index === 0 ? 0 : -1;
    button.title = `${workspace.label} — ${workspace.description} · Shortcut ${workspace.shortcut}`;
    button.append(
      createTextElement("span", "campaign-workspace-tab__mark", workspace.shortLabel),
      createTextElement("span", "campaign-workspace-tab__label", workspace.label)
    );
    rail.appendChild(button);
  });
  return rail;
}
