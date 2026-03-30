import baseScenario from "./scenario01.json";

type AuthoredUnit = {
  readonly type: string;
  readonly hex: readonly [number, number];
  readonly strength?: number;
  readonly experience?: number;
  readonly ammo?: number;
  readonly fuel?: number;
  readonly entrench?: number;
  readonly facing?: string;
  readonly preDeployed?: boolean;
};

const loadoutByType: Record<string, { ammo: number; fuel: number }> = {
  Infantry_42: { ammo: 6, fuel: 0 },
  Engineer: { ammo: 5, fuel: 0 },
  AT_Gun_50mm: { ammo: 6, fuel: 0 },
  Howitzer_105: { ammo: 6, fuel: 0 },
  Rocket_Artillery: { ammo: 4, fuel: 40 },
  Panzer_IV: { ammo: 7, fuel: 40 },
  Heavy_Tank: { ammo: 6, fuel: 35 },
  Tank_Destroyer: { ammo: 6, fuel: 40 },
  Assault_Gun: { ammo: 6, fuel: 40 },
  Recon_ArmoredCar: { ammo: 6, fuel: 45 },
  Recon_Bike: { ammo: 5, fuel: 30 },
  Flak_88: { ammo: 6, fuel: 0 },
  SP_Artillery: { ammo: 6, fuel: 45 },
  Fighter: { ammo: 6, fuel: 50 },
  Bomber: { ammo: 4, fuel: 60 }
};

function makeUnit(type: string, hex: readonly [number, number], overrides: Omit<AuthoredUnit, "type" | "hex"> = {}) {
  const loadout = loadoutByType[type] ?? { ammo: 6, fuel: 0 };
  return {
    type,
    hex: [hex[0], hex[1]] as [number, number],
    strength: 100,
    experience: 0,
    ammo: loadout.ammo,
    fuel: loadout.fuel,
    entrench: 0,
    facing: "SE",
    ...overrides
  };
}

const playerDeploymentHexes: Array<[number, number]> = [
  [14, 2],
  [15, 2],
  [14, 1],
  [15, 1],
  [13, 2],
  [13, 1],
  [14, 0],
  [15, 0],
  [16, 2],
  [16, 1],
  [16, 0],
  [13, 0],
  [12, 2],
  [12, 1],
  [12, 0],
  [11, 2],
  [11, 3],
  [12, 3],
  [13, 3],
  [14, 3]
];

const botUnits = [
  makeUnit("Recon_Bike", [4, 11]),
  makeUnit("Recon_Bike", [5, 11]),
  // Infantry front line (closest to player)
  makeUnit("Infantry_42", [2, 12], { entrench: 0 }),
  makeUnit("Infantry_42", [3, 12], { entrench: 0 }),
  makeUnit("Infantry_42", [4, 13], { entrench: 0 }),
  makeUnit("Infantry_42", [5, 13], { entrench: 0 }),
  makeUnit("Infantry_42", [6, 14], { entrench: 0 }),
  makeUnit("Infantry_42", [7, 14], { entrench: 0 }),
  makeUnit("AT_Infantry", [8, 15], { entrench: 0 }),
  makeUnit("AT_Infantry", [9, 15], { entrench: 0 }),

  // Second line - supporting infantry and recon
  makeUnit("Engineer", [2, 12], { entrench: 0 }),
  makeUnit("AT_Infantry", [3, 13], { entrench: 0 }),
  makeUnit("AT_Gun_50mm", [4, 14]),
  makeUnit("AT_Infantry", [5, 14]),
  makeUnit("Engineer", [6, 14], { entrench: 0 }),
  makeUnit("AT_Infantry", [7, 15]),
  makeUnit("AT_Infantry", [4, 14]),
  makeUnit("Engineer", [4, 13], { entrench: 0 }),
// Third line - AT guns and more infantry
  // Fourth line - armor and tanks
  makeUnit("Tank_Destroyer", [1, 13]),
  makeUnit("Panzer_IV", [1, 13]),
  makeUnit("Panzer_IV", [2, 14]),
  makeUnit("Heavy_Tank", [2, 14]),
  makeUnit("Tank_Destroyer", [3, 14]),
  makeUnit("Assault_Gun", [3, 14]),
  makeUnit("Panzer_IV", [4, 15]),
  makeUnit("Heavy_Tank", [4, 15]),
  makeUnit("Tank_Destroyer", [5, 15]),
  makeUnit("Assault_Gun", [5, 15]),
  makeUnit("Panzer_IV", [0, 14]),
  makeUnit("Heavy_Tank", [0, 14]),
  makeUnit("Tank_Destroyer", [1, 14]),
  makeUnit("Assault_Gun", [1, 14]),
  makeUnit("Flak_88", [2, 15]),

  // Artillery and air support (rear)
  makeUnit("Howitzer_105", [2, 15]),
  makeUnit("SP_Artillery", [3, 15]),
  makeUnit("Howitzer_105", [3, 15]),
  makeUnit("SP_Artillery", [0, 15]),
  makeUnit("Howitzer_105", [0, 15]),
  makeUnit("Flak_88", [1, 15]),
  makeUnit("Fighter", [0, 12]),
  makeUnit("Bomber", [0, 11])
];

const allyUnits = [
  makeUnit("Infantry_42", [13, 4], { entrench: 0, facing: "SE" }),
  makeUnit("Engineer", [15, 4], { entrench: 0, facing: "SE" }),
  makeUnit("AT_Gun_50mm", [12, 5], { facing: "SW" }),
  makeUnit("Recon_Bike", [16, 4], { facing: "SW" })
];

const townDefenseScenario = {
  ...baseScenario,
  name: "Town Defense",
  objectives: [
    { hex: [15, 2], owner: "Player", vp: 250 }
  ],
  deploymentZones: [
    {
      key: "zone-alpha",
      label: "Town Perimeter",
      description: "Forward deployment ring around the northern town and the road junction feeding it.",
      capacity: 20,
      faction: "Player",
      hexes: playerDeploymentHexes
    }
  ],
  playerBudget: 5_000_000,
  turnLimit: 20,
  sides: {
    Player: {
      hq: [15, 2],
      general: { accBonus: 25, dmgBonus: 5, moveBonus: 5, supplyBonus: 15 },
      units: []
    },
    Bot: {
      hq: [2, 13],
      general: { accBonus: 15, dmgBonus: 0, moveBonus: 0, supplyBonus: 10 },
      goal: "Break through the defensive road net and seize the northern town before the defenders can stabilize the line.",
      strategy: "Advance up the road spine with layered armor, keep artillery and flak protected in the rear, and use recon screens to expose the town approaches before committing the main thrust.",
      resources: 900,
      units: botUnits
    },
    Ally: {
      hq: [14, 4],
      general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
      units: allyUnits
    }
  }
};

export default townDefenseScenario;
