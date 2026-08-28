/**
 * MODULE: CampaignFormationPresentation
 * WHAT: Resolves stable, player-facing WWII command and formation names from authored campaign origins.
 * WHY: Persistent formation IDs are rules truth, but legacy aggregate labels and theater-global ordinals are not a credible order of battle.
 *
 * DEPENDENCIES: Campaign formation origin metadata only; this module does not read mutable campaign state.
 * EXPORTS: Deterministic presentation for fresh seeds, existing saves, map summaries, orders, and inspectors.
 */

export interface CampaignFormationPresentationInput {
  readonly legacyLabel: string | null | undefined;
  readonly legacyOrdinal: number | null | undefined;
  readonly unitType: string;
}

export interface CampaignFormationPresentation {
  readonly formationName: string;
  readonly commandLabel: string;
  readonly typeLabel: string;
  readonly hasAuthoredSubordinateIdentity: boolean;
}

interface AuthoredCommand {
  readonly commandLabel: string;
  readonly typeLabel: string;
  readonly formationNames: readonly string[];
}

const AUTHORED_COMMANDS: Readonly<Record<string, readonly AuthoredCommand[]>> = Object.freeze({
  "Eastern tactical fighter groups": [
    {
      commandLabel: "No. 126 (RCAF) Wing",
      typeLabel: "Spitfire IX fighter squadron",
      formationNames: [
        "No. 401 Squadron RCAF",
        "No. 411 Squadron RCAF",
        "No. 412 Squadron RCAF"
      ]
    },
    {
      commandLabel: "No. 127 (RCAF) Wing",
      typeLabel: "Spitfire IX fighter squadron",
      formationNames: [
        "No. 403 Squadron RCAF",
        "No. 416 Squadron RCAF",
        "No. 421 Squadron RCAF"
      ]
    }
  ],
  "Western tactical fighter groups": [
    {
      commandLabel: "No. 121 Wing RAF",
      typeLabel: "Typhoon fighter-bomber squadron",
      formationNames: [
        "No. 174 Squadron RAF",
        "No. 175 Squadron RAF",
        "No. 245 Squadron RAF"
      ]
    },
    {
      commandLabel: "No. 122 Wing RAF",
      typeLabel: "Mustang fighter squadron",
      formationNames: [
        "No. 19 Squadron RAF",
        "No. 65 Squadron RAF",
        "No. 122 Squadron RAF"
      ]
    }
  ],
  "Eastern medium bomber groups": [
    {
      commandLabel: "No. 2 Group RAF",
      typeLabel: "Medium-bomber squadron",
      formationNames: [
        "No. 88 Squadron RAF",
        "No. 342 Squadron RAF",
        "No. 226 Squadron RAF",
        "No. 98 Squadron RAF"
      ]
    }
  ],
  "Western medium bomber groups": [
    {
      commandLabel: "No. 2 Group RAF",
      typeLabel: "Medium-bomber squadron",
      formationNames: [
        "No. 180 Squadron RAF",
        "No. 320 (Netherlands) Squadron RAF",
        "No. 107 Squadron RAF",
        "No. 305 (Polish) Squadron RAF"
      ]
    }
  ]
});

const ABSTRACT_COMMAND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "Western embarkation supply columns": "Western Task Force Service Command",
  "Omaha embarkation supply columns": "U.S. First Army Service Command",
  "Solent supply columns": "British Second Army Service Command",
  "Eastern embarkation supply columns": "British Second Army Service Command",
  "Utah follow-on battalion groups": "U.S. First Army Reinforcement Command",
  "Omaha follow-on battalion groups": "U.S. First Army Reinforcement Command",
  "Gold and Juno follow-on battalion groups": "British Second Army Reinforcement Command",
  "Sword follow-on battalion groups": "British Second Army Reinforcement Command"
});

const BASE_COMMAND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Bristol: "U.S. First Army",
  Exeter: "Second Tactical Air Force",
  Plymouth: "U.S. First Army",
  Portland: "U.S. First Army",
  Portsmouth: "British Second Army",
  Southampton: "British Second Army",
  Tangmere: "Second Tactical Air Force"
});

function formatFormationType(unitType: string): string {
  return unitType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCommandLabel(label: string | null | undefined, unitType: string): string {
  const trimmed = label?.trim();
  if (!trimmed) return formatFormationType(unitType);
  return trimmed
    .replace(/\s+(?:advance|follow-on)\s+(?:battalion\s+)?groups$/i, "")
    .replace(/\s+battalion\s+groups$/i, "")
    .replace(/\s+groups$/i, "")
    .replace(/\s+regiments$/i, "")
    .replace(/\s+columns$/i, "")
    .trim();
}

/** Resolves one stable presentation without changing formation identity or rules state. */
export function resolveCampaignFormationPresentation(
  input: CampaignFormationPresentationInput
): CampaignFormationPresentation {
  const legacyLabel = input.legacyLabel?.trim() || null;
  const ordinal = Math.max(0, input.legacyOrdinal ?? 0);
  const commands = legacyLabel ? AUTHORED_COMMANDS[legacyLabel] : undefined;
  if (commands) {
    let remaining = ordinal;
    for (const command of commands) {
      if (remaining < command.formationNames.length) {
        return {
          formationName: command.formationNames[remaining]!,
          commandLabel: command.commandLabel,
          typeLabel: command.typeLabel,
          hasAuthoredSubordinateIdentity: true
        };
      }
      remaining -= command.formationNames.length;
    }
  }

  const commandLabel = (legacyLabel ? ABSTRACT_COMMAND_LABELS[legacyLabel] : undefined)
    ?? normalizeCommandLabel(legacyLabel, input.unitType);
  return {
    formationName: commandLabel,
    commandLabel,
    typeLabel: formatFormationType(input.unitType),
    hasAuthoredSubordinateIdentity: false
  };
}

/** Resolves the concise command identity used by aggregate map disclosures. */
export function resolveCampaignForceGroupCommandLabel(
  legacyLabel: string | null | undefined,
  unitType: string
): string {
  const commands = legacyLabel?.trim() ? AUTHORED_COMMANDS[legacyLabel.trim()] : undefined;
  if (commands?.length === 1) return commands[0]!.commandLabel;
  if (commands && commands.length > 1) return commands.map((command) => command.commandLabel).join(" / ");
  return (legacyLabel?.trim() ? ABSTRACT_COMMAND_LABELS[legacyLabel.trim()] : undefined)
    ?? normalizeCommandLabel(legacyLabel, unitType);
}

/** Returns the period headquarters identity represented by one scale-consolidated friendly base. */
export function resolveCampaignBaseCommandLabel(baseName: string): string | null {
  return BASE_COMMAND_LABELS[baseName.trim()] ?? null;
}
