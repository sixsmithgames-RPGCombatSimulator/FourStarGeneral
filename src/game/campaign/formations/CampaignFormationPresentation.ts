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
  /**
   * Distinguishes a real selectable formation from an intentionally aggregate strength step
   * and a legacy capacity record. Consumers must never infer this from the display name.
   */
  readonly operationalRepresentation: "formation" | "strengthStep" | "capacity";
}

/** Minimal persistent identity source shared by runtime, save migration, and presentation callers. */
export interface CampaignFormationRecordPresentationSource {
  readonly campaignUnitType: string;
  readonly origin: {
    readonly legacyLabel: string | null | undefined;
    readonly legacyOrdinal: number | null | undefined;
  };
}

interface AuthoredCommand {
  readonly commandLabel: string;
  readonly typeLabel: string;
  readonly formationTypeLabels?: readonly string[];
  readonly formationNames: readonly string[];
  readonly hasSubordinateIdentity?: boolean;
}

interface AbstractCommandPresentation {
  readonly commandLabel: string;
  readonly typeLabel: string;
  readonly operationalRepresentation: "strengthStep" | "capacity";
}

const AUTHORED_COMMANDS: Readonly<Record<string, readonly AuthoredCommand[]>> = Object.freeze({
  // Exact ground order-of-battle identities are source-traced in docs/NORMANDY_DPLUS1_OOB_MANIFEST.md.
  "U.S. 4th Infantry Division battalions": [
    {
      commandLabel: "8th Infantry Regiment",
      typeLabel: "Infantry battalion",
      formationNames: [
        "1st Battalion, 8th Infantry Regiment",
        "2d Battalion, 8th Infantry Regiment",
        "3d Battalion, 8th Infantry Regiment"
      ]
    },
    {
      commandLabel: "12th Infantry Regiment",
      typeLabel: "Infantry battalion",
      formationNames: [
        "1st Battalion, 12th Infantry Regiment",
        "2d Battalion, 12th Infantry Regiment",
        "3d Battalion, 12th Infantry Regiment"
      ]
    },
    {
      commandLabel: "22d Infantry Regiment",
      typeLabel: "Infantry battalion",
      formationNames: [
        "1st Battalion, 22d Infantry Regiment",
        "2d Battalion, 22d Infantry Regiment",
        "3d Battalion, 22d Infantry Regiment"
      ]
    }
  ],
  "VII Corps engineer groups": [
    {
      commandLabel: "VII Corps Engineers",
      typeLabel: "Engineer formation",
      formationTypeLabels: ["Engineer special brigade", "Engineer combat battalion"],
      formationNames: ["1st Engineer Special Brigade", "4th Engineer Combat Battalion"]
    }
  ],
  "U.S. 1st Infantry Division battalions": [
    {
      commandLabel: "16th Infantry Regiment",
      typeLabel: "Infantry battalion strength step",
      formationNames: ["16th Infantry Regiment", "16th Infantry Regiment", "16th Infantry Regiment"],
      hasSubordinateIdentity: false
    },
    {
      commandLabel: "18th Infantry Regiment",
      typeLabel: "Infantry battalion strength step",
      formationNames: ["18th Infantry Regiment", "18th Infantry Regiment", "18th Infantry Regiment"],
      hasSubordinateIdentity: false
    },
    {
      commandLabel: "26th Infantry Regiment",
      typeLabel: "Infantry regimental advance element",
      formationNames: ["26th Infantry Regiment advance element"],
      hasSubordinateIdentity: false
    }
  ],
  "U.S. 29th Infantry Division battalions": [
    {
      commandLabel: "116th Infantry Regiment",
      typeLabel: "Infantry battalion strength step",
      formationNames: ["116th Infantry Regiment", "116th Infantry Regiment", "116th Infantry Regiment"],
      hasSubordinateIdentity: false
    },
    {
      commandLabel: "115th Infantry Regiment",
      typeLabel: "Infantry battalion strength step",
      formationNames: ["115th Infantry Regiment", "115th Infantry Regiment"],
      hasSubordinateIdentity: false
    }
  ],
  "V Corps engineer groups": [
    {
      commandLabel: "V Corps Engineer Special Brigades",
      typeLabel: "Engineer special brigade",
      formationNames: ["5th Engineer Special Brigade", "6th Engineer Special Brigade"]
    }
  ],
  "British 50th Infantry Division battalions": [
    {
      commandLabel: "69th Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "5th Battalion, East Yorkshire Regiment",
        "6th Battalion, Green Howards",
        "7th Battalion, Green Howards"
      ]
    },
    {
      commandLabel: "151st Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "6th Battalion, Durham Light Infantry",
        "8th Battalion, Durham Light Infantry",
        "9th Battalion, Durham Light Infantry"
      ]
    },
    {
      commandLabel: "231st Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "1st Battalion, Hampshire Regiment",
        "1st Battalion, Dorsetshire Regiment",
        "2nd Battalion, Devonshire Regiment"
      ]
    }
  ],
  "British 8th Armoured Brigade regiments": [
    {
      commandLabel: "8th Armoured Brigade",
      typeLabel: "Sherman armoured regiment",
      formationNames: [
        "4th/7th Royal Dragoon Guards",
        "Nottinghamshire Yeomanry (Sherwood Rangers)",
        "24th Lancers"
      ]
    }
  ],
  "British 22nd Armoured Brigade advance groups": [
    {
      commandLabel: "22nd Armoured Brigade, 7th Armoured Division",
      typeLabel: "Cromwell armoured regiment",
      formationNames: [
        "1st Royal Tank Regiment",
        "5th Royal Tank Regiment",
        "4th County of London Yeomanry (Sharpshooters)"
      ]
    }
  ],
  "3rd Canadian Infantry Division battalions": [
    {
      commandLabel: "7th Canadian Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "Royal Winnipeg Rifles",
        "Regina Rifle Regiment",
        "Canadian Scottish Regiment"
      ]
    },
    {
      commandLabel: "8th Canadian Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "Queen's Own Rifles of Canada",
        "Le Régiment de la Chaudière",
        "North Shore (New Brunswick) Regiment"
      ]
    },
    {
      commandLabel: "9th Canadian Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "Highland Light Infantry of Canada",
        "Stormont, Dundas and Glengarry Highlanders",
        "North Nova Scotia Highlanders"
      ]
    }
  ],
  "2nd Canadian Armoured Brigade regiments": [
    {
      commandLabel: "2nd Canadian Armoured Brigade",
      typeLabel: "Sherman armoured regiment",
      formationNames: [
        "6th Armoured Regiment (1st Hussars)",
        "10th Armoured Regiment (The Fort Garry Horse)",
        "27th Armoured Regiment (The Sherbrooke Fusiliers Regiment)"
      ]
    }
  ],
  "British 3rd Infantry Division battalions": [
    {
      commandLabel: "8th Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "1st Battalion, Suffolk Regiment",
        "2nd Battalion, East Yorkshire Regiment",
        "1st Battalion, South Lancashire Regiment"
      ]
    },
    {
      commandLabel: "9th Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "2nd Battalion, Lincolnshire Regiment",
        "1st Battalion, King's Own Scottish Borderers",
        "2nd Battalion, Royal Ulster Rifles"
      ]
    },
    {
      commandLabel: "185th Infantry Brigade",
      typeLabel: "Infantry battalion",
      formationNames: [
        "2nd Battalion, Royal Warwickshire Regiment",
        "1st Battalion, Royal Norfolk Regiment",
        "2nd Battalion, King's Shropshire Light Infantry"
      ]
    }
  ],
  "British 27th Armoured Brigade regiments": [
    {
      commandLabel: "27th Armoured Brigade",
      typeLabel: "Sherman armoured regiment",
      formationNames: [
        "13th/18th Royal Hussars (Queen Mary's Own)",
        "Staffordshire Yeomanry (Queen's Own Royal Regiment)",
        "East Riding Yeomanry"
      ]
    }
  ],
  "British 6th Airborne Division groups": [
    {
      commandLabel: "3rd Parachute Brigade",
      typeLabel: "Parachute infantry battalion",
      formationNames: [
        "8th (Midlands) Battalion, Parachute Regiment",
        "9th (Eastern and Home Counties) Battalion, Parachute Regiment",
        "1st Canadian Parachute Battalion"
      ]
    },
    {
      commandLabel: "5th Parachute Brigade",
      typeLabel: "Parachute infantry battalion",
      formationNames: [
        "7th (Light Infantry) Battalion, Parachute Regiment",
        "12th (Yorkshire) Battalion, Parachute Regiment",
        "13th (Lancashire) Battalion, Parachute Regiment"
      ]
    }
  ],
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
      commandLabel: "No. 137 Wing RAF",
      typeLabel: "Boston and Mitchell bomber squadron",
      formationTypeLabels: [
        "Boston light-bomber squadron",
        "Boston light-bomber squadron",
        "Mitchell medium-bomber squadron"
      ],
      formationNames: [
        "No. 88 Squadron RAF",
        "No. 342 (Lorraine) Squadron RAF",
        "No. 226 Squadron RAF"
      ]
    },
    {
      commandLabel: "No. 139 Wing RAF",
      typeLabel: "Mitchell bomber squadron",
      formationNames: [
        "No. 98 Squadron RAF"
      ]
    }
  ],
  "Western medium bomber groups": [
    {
      commandLabel: "No. 139 Wing RAF",
      typeLabel: "Mitchell bomber squadron",
      formationNames: [
        "No. 180 Squadron RAF",
        "No. 320 (Netherlands) Squadron RAF"
      ]
    },
    {
      commandLabel: "No. 138 Wing RAF",
      typeLabel: "Mosquito light-bomber squadron",
      formationNames: [
        "No. 107 Squadron RAF",
        "No. 305 (Polish) Squadron RAF"
      ]
    }
  ]
});

const ABSTRACT_COMMANDS: Readonly<Record<string, AbstractCommandPresentation>> = Object.freeze({
  "U.S. 82nd Airborne Division groups": {
    commandLabel: "82d Airborne Division",
    typeLabel: "airborne strength group",
    operationalRepresentation: "strengthStep"
  },
  "U.S. 101st Airborne Division groups": {
    commandLabel: "101st Airborne Division",
    typeLabel: "airborne strength group",
    operationalRepresentation: "strengthStep"
  },
  "U.S. 2nd Infantry Division advance groups": {
    commandLabel: "2d Infantry Division",
    typeLabel: "infantry arrival group",
    operationalRepresentation: "strengthStep"
  },
  "U.S. 90th Infantry Division advance groups": {
    commandLabel: "90th Infantry Division",
    typeLabel: "infantry arrival group",
    operationalRepresentation: "strengthStep"
  },
  "U.S. 2nd Ranger Battalion groups": {
    commandLabel: "2d Ranger Battalion",
    typeLabel: "Ranger strength group",
    operationalRepresentation: "strengthStep"
  },
  "Western embarkation supply columns": {
    commandLabel: "First U.S. Army",
    typeLabel: "Legacy transport capacity",
    operationalRepresentation: "capacity"
  },
  "Omaha embarkation supply columns": {
    commandLabel: "First U.S. Army",
    typeLabel: "Legacy transport capacity",
    operationalRepresentation: "capacity"
  },
  "Solent supply columns": {
    commandLabel: "British Second Army",
    typeLabel: "Legacy transport capacity",
    operationalRepresentation: "capacity"
  },
  "Eastern embarkation supply columns": {
    commandLabel: "British Second Army",
    typeLabel: "Legacy transport capacity",
    operationalRepresentation: "capacity"
  },
  "Utah follow-on battalion groups": {
    commandLabel: "First U.S. Army",
    typeLabel: "follow-on infantry group",
    operationalRepresentation: "strengthStep"
  },
  "Omaha follow-on battalion groups": {
    commandLabel: "First U.S. Army",
    typeLabel: "follow-on infantry group",
    operationalRepresentation: "strengthStep"
  },
  "Gold and Juno follow-on battalion groups": {
    commandLabel: "British Second Army",
    typeLabel: "follow-on infantry group",
    operationalRepresentation: "strengthStep"
  },
  "Sword follow-on battalion groups": {
    commandLabel: "I Corps",
    typeLabel: "follow-on infantry group",
    operationalRepresentation: "strengthStep"
  },
  "British 51st Highland Division advance groups": {
    commandLabel: "51st (Highland) Infantry Division",
    typeLabel: "follow-up infantry group",
    operationalRepresentation: "strengthStep"
  }
});

const BASE_COMMAND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Bristol: "First U.S. Army",
  Exeter: "Second Tactical Air Force",
  Plymouth: "First U.S. Army",
  Portland: "First U.S. Army",
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
          typeLabel: command.formationTypeLabels?.[remaining] ?? command.typeLabel,
          hasAuthoredSubordinateIdentity: command.hasSubordinateIdentity ?? true,
          operationalRepresentation: command.hasSubordinateIdentity === false ? "strengthStep" : "formation"
        };
      }
      remaining -= command.formationNames.length;
    }
  }

  const abstract = legacyLabel ? ABSTRACT_COMMANDS[legacyLabel] : undefined;
  const commandLabel = abstract?.commandLabel ?? normalizeCommandLabel(legacyLabel, input.unitType);
  return {
    formationName: commandLabel,
    commandLabel,
    typeLabel: abstract?.typeLabel ?? formatFormationType(input.unitType),
    hasAuthoredSubordinateIdentity: false,
    operationalRepresentation: abstract?.operationalRepresentation ?? "strengthStep"
  };
}

/**
 * Canonical record-oriented identity path. Runtime, save migration, planners, and UI adapters
 * should use this instead of reading the persisted presentation snapshot in `formation.name`.
 */
export function resolveCampaignFormationRecordPresentation(
  formation: CampaignFormationRecordPresentationSource
): CampaignFormationPresentation {
  return resolveCampaignFormationPresentation({
    legacyLabel: formation.origin.legacyLabel,
    legacyOrdinal: formation.origin.legacyOrdinal,
    unitType: formation.campaignUnitType
  });
}

/** True only for legacy aggregate records that represent transport capacity rather than a unit. */
export function isCampaignCapacityPresentation(presentation: CampaignFormationPresentation): boolean {
  return presentation.operationalRepresentation === "capacity";
}

/** Resolves the concise command identity used by aggregate map disclosures. */
export function resolveCampaignForceGroupCommandLabel(
  legacyLabel: string | null | undefined,
  unitType: string
): string {
  const commands = legacyLabel?.trim() ? AUTHORED_COMMANDS[legacyLabel.trim()] : undefined;
  if (commands?.length === 1) return commands[0]!.commandLabel;
  if (commands && commands.length > 1) {
    return Array.from(new Set(commands.map((command) => command.commandLabel))).join(" / ");
  }
  return (legacyLabel?.trim() ? ABSTRACT_COMMANDS[legacyLabel.trim()]?.commandLabel : undefined)
    ?? normalizeCommandLabel(legacyLabel, unitType);
}

/** Returns the period headquarters identity represented by one scale-consolidated friendly base. */
export function resolveCampaignBaseCommandLabel(baseName: string): string | null {
  return BASE_COMMAND_LABELS[baseName.trim()] ?? null;
}
