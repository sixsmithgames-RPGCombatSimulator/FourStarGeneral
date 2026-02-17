import type { CampaignScenarioData } from "../../core/campaignTypes";

const backgroundUrl = new URL("../../assets/campaign/Campaign Map -- Central Channel.png", import.meta.url).href;

export const sampleCampaignScenario: CampaignScenarioData = {
  key: "demo_theater",
  title: "Demo Theater",
  description: "Channel coast theater scaled for the campaign layer's grand-operational scope.",
  hexScaleKm: 5,
  // 78 columns × 5 km per hex ≈ 390 km along the coastline, matching the user's requested reference span.
  dimensions: { cols: 78, rows: 48 },
  background: {
    imageUrl: backgroundUrl,
    attribution: "WWII coastal operations mockup",
    stretchMode: "cover",
    nativeWidth: 1024,
    nativeHeight: 768,
    nominalWidthKm: 390
  },
  tilePalette: {
    baseA: {
      role: "airbase",
      factionControl: "Player",
      spriteKey: "airbase",
      supplyValue: 10,
      airSortieCapacity: 6,
      forces: [{ unitType: "Fighter", count: 3 }, { unitType: "Bomber", count: 2 }]
    },
    portA: {
      role: "navalBase",
      factionControl: "Player",
      spriteKey: "navalBase",
      navalCapacity: 5,
      forces: [{ unitType: "Supply_Truck", count: 2 }]
    },
    hubA: {
      role: "logisticsHub",
      factionControl: "Player",
      spriteKey: "logisticsHub",
      supplyValue: 12,
      forces: [{ unitType: "Infantry_42", count: 4 }, { unitType: "Light_Tank", count: 1 }]
    },
    tfB: {
      role: "taskForce",
      factionControl: "Bot",
      spriteKey: "taskForce",
      forces: [{ unitType: "Heavy_Tank", count: 2 }, { unitType: "Infantry_42", count: 3 }]
    }
  },
  tiles: [
    // PLAYER BASES (Allied forces) - Upper-left quadrant (British/Allied coast)
    // Hex (0,0) is in upper-left, so player bases use LOW col AND LOW row
    // Formula: offset(col,row) = axial(q,r) where col=q, row=r+floor(q/2)

    // Player airbases - British territory (offset cols 2-20, rows 2-15)
    { tile: "baseA", hex: { q: 8, r: 2 } },   // offset(8,6)
    { tile: "baseA", hex: { q: 12, r: 4 } },  // offset(12,10)
    { tile: "baseA", hex: { q: 16, r: 2 } },  // offset(16,10)
    { tile: "baseA", hex: { q: 10, r: 6 } },  // offset(10,11)
    { tile: "baseA", hex: { q: 6, r: 8 } },   // offset(6,11)
    { tile: "baseA", hex: { q: 20, r: 0 } },  // offset(20,10)

    // Player naval ports - British coastline (offset cols 2-18, rows 5-15)
    { tile: "portA", hex: { q: 4, r: 6 } },   // offset(4,8)
    { tile: "portA", hex: { q: 14, r: 6 } },  // offset(14,13)
    { tile: "portA", hex: { q: 8, r: 10 } },  // offset(8,14)
    { tile: "portA", hex: { q: 18, r: 2 } },  // offset(18,11)
    { tile: "portA", hex: { q: 2, r: 8 } },   // offset(2,9)

    // Player logistics hubs - British interior (offset cols 6-22, rows 6-16)
    { tile: "hubA", hex: { q: 10, r: 4 } },   // offset(10,9)
    { tile: "hubA", hex: { q: 14, r: 4 } },   // offset(14,11)
    { tile: "hubA", hex: { q: 18, r: 6 } },   // offset(18,15)
    { tile: "hubA", hex: { q: 12, r: 8 } },   // offset(12,14)
    { tile: "hubA", hex: { q: 22, r: 2 } },   // offset(22,13)
    { tile: "hubA", hex: { q: 16, r: 8 } },   // offset(16,16)
    { tile: "hubA", hex: { q: 6, r: 6 } },    // offset(6,9)

    // CONTESTED MIDDLE GROUND - Channel crossing area (offset cols 30-48, rows 30-40)
    { tile: "hubA", hex: { q: 30, r: 20 } },  // offset(30,35)
    { tile: "hubA", hex: { q: 35, r: 18 } },  // offset(35,35)
    { tile: "baseA", hex: { q: 38, r: 18 } }, // offset(38,37)
    { tile: "tfB", hex: { q: 42, r: 18 } },   // offset(42,39)
    { tile: "tfB", hex: { q: 45, r: 16 } },   // offset(45,38)
    { tile: "tfB", hex: { q: 40, r: 20 } },   // offset(40,40)

    // ENEMY BASES (Axis forces) - Lower-right quadrant (Continental Europe)
    // HIGH col (q: 50-77) requires LOW r to stay within row 0-47
    // Target: offset cols 50-77, rows 32-47
    { tile: "tfB", hex: { q: 50, r: 7 }, forces: [{ unitType: "Heavy_Tank", count: 1 }] },  // offset(50,32)
    { tile: "tfB", hex: { q: 54, r: 7 } },   // offset(54,34)
    { tile: "tfB", hex: { q: 58, r: 8 } },   // offset(58,37)
    { tile: "tfB", hex: { q: 62, r: 7 } },   // offset(62,38)
    { tile: "tfB", hex: { q: 66, r: 7 } },   // offset(66,40)
    { tile: "tfB", hex: { q: 70, r: 7 } },   // offset(70,42)
    { tile: "tfB", hex: { q: 52, r: 12 } },  // offset(52,38)
    { tile: "tfB", hex: { q: 56, r: 12 } },  // offset(56,40)
    { tile: "tfB", hex: { q: 60, r: 12 } },  // offset(60,42)
    { tile: "tfB", hex: { q: 64, r: 12 } },  // offset(64,44)
    { tile: "tfB", hex: { q: 68, r: 12 } },  // offset(68,46)
    { tile: "tfB", hex: { q: 72, r: 8 } },   // offset(72,44)
    { tile: "tfB", hex: { q: 76, r: 8 } }    // offset(76,46)
  ],
  fronts: [
    {
      key: "front_channel",
      label: "Channel Line",
      hexKeys: ["40,38", "41,38", "42,40", "44,40", "46,42"],
      initiative: "Player",
      modifiers: ["mobile"]
    }
  ],
  objectives: [
    {
      key: "obj_port",
      label: "Secure Port",
      description: "Capture the port to open naval supply.",
      hex: { q: 1, r: 4 },
      owner: "Player",
      rewards: ["navalCapacity+2"],
      penalties: []
    }
  ],
  economies: [
    { faction: "Player", manpower: 100, supplies: 200, fuel: 150, ammo: 100, airPower: 40, navalPower: 30, intelCoverage: 60 },
    { faction: "Bot", manpower: 120, supplies: 180, fuel: 140, ammo: 120, airPower: 35, navalPower: 25, intelCoverage: 40 }
  ]
};
