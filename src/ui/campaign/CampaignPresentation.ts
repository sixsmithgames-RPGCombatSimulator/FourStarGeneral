import type { CampaignBriefedStrategicRegion } from "../../core/campaignTypes";

interface TheaterRegionPresentationInput {
  readonly id: string;
  readonly label: string;
  readonly category: CampaignBriefedStrategicRegion["category"];
  readonly summary: string;
  readonly sourceLabel: string;
  readonly commandStatus: string;
}

interface TheaterRegionPresentation {
  readonly label: string;
  readonly categoryLabel: string;
  readonly summary: string;
  readonly sourceLabel: string;
  readonly commandStatus: string;
}

const REGION_PRESENTATION_OVERRIDES: Readonly<Record<string, Omit<TheaterRegionPresentation, "categoryLabel">>> = {
  briefed_thames_nore: {
    label: "Thames and Nore reinforcement ports",
    summary: "British follow-on formations, vehicles, personnel ships, and stores are assembled through the eastern ports and Thames approaches.",
    sourceLabel: "NEPTUNE loading and assembly plan",
    commandStatus: "Briefing only · outside the opening D+1 command area"
  },
  briefed_eastern_convoys: {
    label: "Eastern convoy routes",
    summary: "Escorts, coastal forces, returning vessels, and stores traffic operate through the eastern ports.",
    sourceLabel: "NEPTUNE loading and assembly plan",
    commandStatus: "Briefing only · no orders available here"
  },
  briefed_airborne_departure_belt: {
    label: "Southern England airborne departure fields",
    summary: "American airborne formations launched from southern English airfields and are already ashore on D+1.",
    sourceLabel: "First U.S. Army airborne brief",
    commandStatus: "Briefing only · airborne formations already ashore"
  }
};

const FRIENDLY_BASE_SUMMARIES: Readonly<Record<string, string>> = {
  Bristol: "Bristol Channel depots supporting the first American follow-on divisions.",
  Plymouth: "Western embarkation ports supporting Utah-bound forces and stores.",
  Portland: "Omaha-bound embarkation ports for forces and stores.",
  Portsmouth: "Eastern embarkation ports supporting Sword and British follow-on forces.",
  Southampton: "Solent embarkation ports supporting Gold and Juno."
};

/** Keeps research provenance and storage taxonomy out of the field-command presentation. */
export function resolveCampaignTheaterRegionPresentation(
  input: TheaterRegionPresentationInput
): TheaterRegionPresentation {
  const override = REGION_PRESENTATION_OVERRIDES[input.id];
  return {
    label: override?.label ?? input.label,
    categoryLabel: input.category === "enemyInstallation"
      ? "Known opposing region"
      : input.category === "alliedSupport"
        ? "Allied theater support"
        : "Strategic geography",
    summary: override?.summary ?? input.summary,
    sourceLabel: override?.sourceLabel ?? input.sourceLabel,
    commandStatus: override?.commandStatus ?? input.commandStatus
  };
}

/** Related places exclude the selected base itself so the inspector does not repeat its title. */
export function projectCampaignAssociatedLocations(
  displayLabel: string | undefined,
  locations: readonly string[] | undefined
): string[] {
  const principal = displayLabel?.trim().toLocaleLowerCase();
  return (locations ?? []).filter((location) => location.trim().toLocaleLowerCase() !== principal);
}

/** Replaces administrative scenario prose with the concise operational role of an Allied base. */
export function resolveCampaignFriendlyBaseSummary(
  displayLabel: string | undefined,
  fallback: string
): string {
  return displayLabel ? FRIENDLY_BASE_SUMMARIES[displayLabel] ?? fallback : fallback;
}

/** Describes consolidated friendly-base geography with concrete place types, never a generic network. */
export function describeCampaignAssociatedLocations(roleLabel: string, count: number): string | null {
  if (count <= 0) return null;
  const noun = roleLabel === "Air base"
    ? "satellite airfield"
    : roleLabel === "Naval base"
      ? "associated anchorage"
      : roleLabel === "Logistics and embarkation"
        ? "associated port"
        : "associated location";
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}
