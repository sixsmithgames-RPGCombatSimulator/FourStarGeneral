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
  AT_Gun_50mm: { ammo: 5, fuel: 0 },
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
    facing: "S",
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
  makeUnit("Howitzer_105", [0, 15], { entrench: 1 }),
  makeUnit("Howitzer_105", [2, 15], { entrench: 1 }),
  makeUnit("Howitzer_105", [4, 15], { entrench: 1 }),
  makeUnit("Panzer_IV", [6, 15]),
  makeUnit("SP_Artillery", [8, 15]),
  makeUnit("Flak_88", [1, 14], { entrench: 1 }),
  makeUnit("Fighter", [2, 14]),
  makeUnit("Flak_88", [3, 14], { entrench: 1 }),
  makeUnit("Bomber", [4, 14]),
  makeUnit("SP_Artillery", [5, 14]),
  makeUnit("Panzer_IV", [7, 14]),
  makeUnit("Infantry_42", [0, 13], { entrench: 1 }),
  makeUnit("Recon_Bike", [1, 13]),
  makeUnit("Engineer", [3, 13], { entrench: 1 }),
  makeUnit("Panzer_IV", [4, 13]),
  makeUnit("Panzer_IV", [6, 13]),
  makeUnit("Heavy_Tank", [7, 13]),
  makeUnit("Recon_ArmoredCar", [8, 13]),
  makeUnit("Recon_ArmoredCar", [0, 12]),
  makeUnit("Tank_Destroyer", [1, 12], { entrench: 1 }),
  makeUnit("AT_Gun_50mm", [2, 12], { entrench: 1 }),
  makeUnit("Panzer_IV", [3, 12]),
  makeUnit("Heavy_Tank", [4, 12]),
  makeUnit("Panzer_IV", [5, 12]),
  makeUnit("Heavy_Tank", [6, 12]),
  makeUnit("Heavy_Tank", [8, 12]),
  makeUnit("Infantry_42", [0, 11], { entrench: 1 }),
  makeUnit("Recon_ArmoredCar", [1, 11]),
  makeUnit("Assault_Gun", [2, 11]),
  makeUnit("AT_Gun_50mm", [4, 11], { entrench: 1 }),
  makeUnit("Tank_Destroyer", [5, 11]),
  makeUnit("Assault_Gun", [6, 11]),
  makeUnit("Tank_Destroyer", [7, 11]),
  makeUnit("Assault_Gun", [8, 11]),
  makeUnit("Engineer", [0, 10]),
  makeUnit("Recon_Bike", [1, 10]),
  makeUnit("Recon_ArmoredCar", [2, 10]),
  makeUnit("AT_Gun_50mm", [3, 10], { entrench: 1 }),
  makeUnit("Infantry_42", [4, 10]),
  makeUnit("Infantry_42", [6, 10]),
  makeUnit("Heavy_Tank", [9, 10]),
  makeUnit("Panzer_IV", [4, 9]),
  makeUnit("Infantry_42", [5, 9], { entrench: 1 })
];

const allyUnits = [
  makeUnit("Infantry_42", [13, 4], { entrench: 1, facing: "S" }),
  makeUnit("Engineer", [15, 4], { entrench: 1, facing: "S" }),
  makeUnit("AT_Gun_50mm", [12, 5], { entrench: 1, facing: "S" }),
  makeUnit("Recon_Bike", [16, 4], { facing: "S" })
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
