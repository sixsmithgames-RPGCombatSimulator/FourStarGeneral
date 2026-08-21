import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { CampaignMapRenderer } from "../src/rendering/CampaignMapRenderer";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignMapViewModel } from "../src/core/campaignIntelTypes";
import campaignScenarioData from "../src/data/campaign01.json";

registerTest("CAMPAIGN_RENDERER_RENDERS_LAYERS", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  canvas.id = "campaignMapCanvas";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "campaignHexMap";
  canvas.appendChild(svg);
  document.body.appendChild(canvas);

  const scenario: CampaignScenarioData = {
    key: "t1",
    title: "Test Theater",
    description: "Renderer sanity checks",
    hexScaleKm: 5,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      base: { role: "airbase", factionControl: "Player", spriteKey: "airbase" }
    },
    tiles: [{ tile: "base", hex: { q: 0, r: 0 } }],
    fronts: [
      {
        key: "f1",
        label: "Front One",
        hexKeys: [CoordinateSystem.makeHexKey(0, 0), CoordinateSystem.makeHexKey(1, 0)],
        initiative: "Player"
      }
    ],
    objectives: [],
    economies: [{ faction: "Player", manpower: 0, supplies: 0, fuel: 0, ammo: 0, airPower: 0, navalPower: 0, intelCoverage: 0 }]
  };

  const renderer = new CampaignMapRenderer();
  const viewModel: CampaignMapViewModel = {
    observerFaction: "Player",
    scenario,
    enemyContacts: [],
    coverage: [],
    capacity: { total: 2, committed: 0, available: 2 },
    unreadReportCount: 0,
    currentSegment: 0
  };

  await Given("a minimal campaign scenario and DOM targets", async () => {
    renderer.render(svg, canvas as HTMLDivElement, viewModel);
  });

  await Then("background, hexes, sprites, and fronts are present", async () => {
    const bg = svg.querySelector("#campaign-map-background-image");
    if (!bg) throw new Error("Background image layer missing");

    const hexes = svg.querySelectorAll(".campaign-hex:not(.campaign-hex-padding)");
    if (hexes.length !== scenario.dimensions.cols * scenario.dimensions.rows) {
      throw new Error(`Expected ${scenario.dimensions.cols * scenario.dimensions.rows} hexes, found ${hexes.length}`);
    }

    const sprites = svg.querySelectorAll(".campaign-sprite");
    if (sprites.length !== scenario.tiles.length) {
      throw new Error(`Expected ${scenario.tiles.length} sprites, found ${sprites.length}`);
    }

    const front = svg.querySelector(".campaign-front.front-f1");
    if (!front) throw new Error("Front polyline not rendered");
  });

  await When("a campaign hex is clicked", async () => {
    let clicked = 0;
    renderer.onHexClick(() => {
      clicked += 1;
    });
    const anyHex = svg.querySelector<SVGGElement>(".campaign-hex:not(.campaign-hex-padding)");
    if (!anyHex) throw new Error("No campaign hex rendered for click test");
    // Dispatch from child polygon so closest('.campaign-hex') resolution is exercised
    const poly = anyHex.querySelector("polygon") ?? anyHex;
    poly.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    if (clicked !== 1) {
      throw new Error(`Click handler should have fired once, observed ${clicked}`);
    }
  });
});

registerTest("CAMPAIGN_RENDERER_DRAWS_DERIVED_FRONTS_ON_SHARED_HEX_BORDERS", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: CampaignScenarioData = {
    key: "derived-front-render",
    title: "Derived Front Render",
    description: "Shared-border rendering certification.",
    hexScaleKm: 5,
    dimensions: { cols: 2, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: { region: { role: "region", factionControl: "Neutral" } },
    tiles: [],
    fronts: [{
      key: "derived-front",
      label: "Derived Front",
      hexKeys: ["0,0"],
      edges: [{ friendlyHexKey: "0,0", opposingHexKey: "1,0" }],
      initiative: "Player"
    }],
    objectives: [],
    economies: []
  };
  const renderer = new CampaignMapRenderer();

  await Given("a front defined by exact adjacent friendly and opposing hexes", () => {
    renderer.render(svg, canvas as HTMLDivElement, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("the campaign renderer builds the front layer", () => {});

  await Then("one non-interactive line marks the shared border rather than connecting tile centers", () => {
    const edge = svg.querySelector<SVGLineElement>(".campaign-front-edge.front-derived-front");
    if (!edge
      || edge.getAttribute("data-front-edge") !== "0,0|1,0"
      || edge.getAttribute("pointer-events") !== "none"
      || !edge.hasAttribute("x1") || !edge.hasAttribute("y1")
      || !edge.hasAttribute("x2") || !edge.hasAttribute("y2")
      || svg.querySelector("polyline.front-derived-front")) {
      throw new Error("The derived front did not render as one exact shared-border segment.");
    }
  });
});

registerTest("CAMPAIGN_RENDERER_SHOWS_TASK_FORCE_WITHOUT_GROUND_COUNTER_IN_CHANNEL", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const renderer = new CampaignMapRenderer();

  await Given("the shipped post-landing campaign opening", () => {
    renderer.render(svg, canvas as HTMLDivElement, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("the English Channel marker is painted", () => {});

  await Then("the player sees a directionally authored assault fleet and no infantry counter at that water hex", () => {
    const channelOffsetKey = "20,28";
    const fleet = svg.querySelector<SVGGElement>(`.campaign-task-force[data-hex="${channelOffsetKey}"]`);
    const ships = fleet?.querySelectorAll<SVGImageElement>(".campaign-task-force__ship") ?? [];
    const shipAssets = Array.from(ships).map((ship) => ship.getAttribute("href") ?? "");
    const battleship = fleet?.querySelector<SVGImageElement>(".campaign-task-force__battleship") ?? null;
    const escorts = [
      fleet?.querySelector<SVGImageElement>(".campaign-task-force__transport") ?? null,
      fleet?.querySelector<SVGImageElement>(".campaign-task-force__destroyer") ?? null
    ];
    const overlapFraction = (first: SVGImageElement, second: SVGImageElement): number => {
      const firstRect = {
        x: Number(first.getAttribute("x")),
        y: Number(first.getAttribute("y")),
        width: Number(first.getAttribute("width")),
        height: Number(first.getAttribute("height"))
      };
      const secondRect = {
        x: Number(second.getAttribute("x")),
        y: Number(second.getAttribute("y")),
        width: Number(second.getAttribute("width")),
        height: Number(second.getAttribute("height"))
      };
      const overlapWidth = Math.max(0, Math.min(firstRect.x + firstRect.width, secondRect.x + secondRect.width) - Math.max(firstRect.x, secondRect.x));
      const overlapHeight = Math.max(0, Math.min(firstRect.y + firstRect.height, secondRect.y + secondRect.height) - Math.max(firstRect.y, secondRect.y));
      return (overlapWidth * overlapHeight) / (firstRect.width * firstRect.height);
    };
    const supportSilhouettesRemainVisible = battleship !== null
      && escorts.every((escort) => escort !== null && overlapFraction(escort, battleship) < 0.25);
    const groundCounters = svg.querySelectorAll(`.campaign-force-icon[data-hex="${channelOffsetKey}"]`);
    if (!fleet
      || ships.length !== 3
      || shipAssets.filter((asset) => asset.includes("Transport_Ship_USA_Southview")).length !== 1
      || shipAssets.filter((asset) => asset.includes("Destroyer_USA_Southview")).length !== 1
      || shipAssets.filter((asset) => asset.includes("Battleship_USA_Southview")).length !== 1
      || shipAssets.some((asset) => asset.includes("task_force.svg"))
      || fleet.dataset.facing !== "SE"
      || fleet.getAttribute("role") !== "img"
      || fleet.getAttribute("aria-label") !== "Allied assault fleet on station supporting the Normandy lodgment · hex 20,28"
      || !supportSilhouettesRemainVisible
      || groundCounters.length !== 0) {
      throw new Error("The Channel fleet still uses an abstract marker, hides its support vessels, uses the wrong facing, or projects a ground formation.");
    }
  });
});

registerTest("CAMPAIGN_RENDERER_DISTINGUISHES_ENEMY_INTELLIGENCE_FROM_PHYSICAL_ENTITIES", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: CampaignScenarioData = {
    key: "contact-clarity",
    title: "Contact clarity",
    description: "Enemy reports must look like intelligence.",
    dimensions: { cols: 2, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: { region: { role: "region", factionControl: "Neutral" } },
    tiles: [],
    fronts: [],
    objectives: [],
    economies: []
  };
  const renderer = new CampaignMapRenderer();

  await Given("one current assessed ground contact", () => {
    renderer.render(svg, canvas as HTMLDivElement, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [{
        id: "contact-1",
        subjectKind: "force",
        level: "identified",
        state: "current",
        confidenceBand: "medium",
        locationHexKey: "1,1",
        uncertaintyRadius: 0,
        domain: "ground",
        label: "Infantry formation",
        strengthBand: "light",
        lastObservedSegment: 0,
        ageSegments: 0,
        sourceLabels: ["Recon patrol"],
        analystNotes: []
      }],
      coverage: [],
      capacity: { total: 1, committed: 0, available: 1 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("the intelligence overlay marker is painted", () => {});

  await Then("plain-language domain and recency replace physical-looking shorthand", () => {
    const marker = svg.querySelector<SVGGElement>('.campaign-intel-contact[data-contact-id="contact-1"]');
    const visibleText = marker?.textContent ?? "";
    const accessibleName = marker?.getAttribute("aria-label") ?? "";
    if (!marker
      || !visibleText.includes("ENEMY")
      || !visibleText.includes("Ground contact · current intel")
      || /\bGRD\b|\bNOW\b/.test(visibleText)
      || !accessibleName.includes("Infantry formation, identified, medium confidence, light strength, current observation")) {
      throw new Error(`Enemy contact presentation remained ambiguous: '${visibleText}' / '${accessibleName}'.`);
    }
  });
});
