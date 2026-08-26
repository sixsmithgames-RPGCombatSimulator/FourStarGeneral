import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { CampaignMapRenderer } from "../src/rendering/CampaignMapRenderer";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignMapViewModel } from "../src/core/campaignIntelTypes";
import { buildCampaignMapView, createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
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
    knownStrategicSites: [{
      id: "known-site",
      locationHexKey: "1,0",
      label: "Charted airfield",
      role: "airbase",
      summary: "The airfield location is known; current status is unconfirmed.",
      sourceLabel: "Pre-operation aerial survey",
      spriteKey: "airbase"
    }],
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

    const knownSite = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="known-site"]');
    const hexLayerTransform = svg.querySelector<SVGGElement>("#campaign-map-hexes")?.getAttribute("transform");
    const knownSiteLayerTransform = svg.querySelector<SVGGElement>("#campaign-map-known-sites")?.getAttribute("transform");
    if (!knownSite
      || knownSite.getAttribute("data-hex") !== "1,0"
      || !knownSite.querySelector(".campaign-known-site__sprite")
      || !knownSite.getAttribute("aria-label")?.includes("current control and status unconfirmed")
      || !hexLayerTransform
      || knownSiteLayerTransform !== hexLayerTransform) {
      throw new Error("Briefed strategic site did not render as a safe selectable fixed-site marker.");
    }
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

registerTest("CAMPAIGN_RENDERER_REVEALS_FRIENDLY_BASES_WITHOUT_PERMANENT_LABEL_CLUTTER", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: CampaignScenarioData = {
    key: "base-disclosure",
    title: "Base Disclosure",
    description: "Friendly bases use progressive disclosure.",
    dimensions: { cols: 6, rows: 4 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      bristol: {
        role: "logisticsHub",
        factionControl: "Player",
        mapLabel: "Bristol",
        spriteKey: "logisticsHub",
        supplyValue: 3
      },
      portsmouth: {
        role: "logisticsHub",
        factionControl: "Player",
        mapLabel: "Portsmouth",
        spriteKey: "logisticsHub",
        supplyValue: 4
      },
      england: { role: "region", factionControl: "Player", mapLabel: "Southern England" }
    },
    tiles: [
      { tile: "bristol", hex: CoordinateSystem.offsetToAxial(1, 1) },
      {
        tile: "portsmouth",
        hex: CoordinateSystem.offsetToAxial(4, 1),
        forces: [{ unitType: "Supply_Truck", count: 2, label: "Sword supply columns" }]
      },
      { tile: "england", hex: CoordinateSystem.offsetToAxial(2, 2) }
    ],
    fronts: [],
    objectives: [],
    economies: [{ faction: "Player", manpower: 0, supplies: 0, fuel: 0, ammo: 0, airPower: 0, navalPower: 0, intelCoverage: 0 }]
  };
  const renderer = new CampaignMapRenderer();

  await Given("two friendly historical bases and one genuine geographic label", () => {
    renderer.render(svg, canvas as HTMLDivElement, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [],
      knownStrategicSites: [],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("the player points, focuses, clicks, or keyboard-activates a base", () => {});

  await Then("base identity expands from one bounded focusable marker while permanent labels remain geographic", () => {
    const persistentLabels = Array.from(svg.querySelectorAll(".campaign-map-location-label"))
      .map((entry) => entry.textContent?.trim() ?? "");
    const markers = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-base-marker"));
    const bristol = svg.querySelector<SVGGElement>('.campaign-base-marker[data-base-name="Bristol"]');
    const portsmouth = svg.querySelector<SVGGElement>('.campaign-base-marker[data-base-name="Portsmouth"]');
    const bristolCard = bristol?.querySelector<SVGGElement>(".campaign-base-disclosure");
    const portsmouthCard = portsmouth?.querySelector<SVGGElement>(".campaign-base-disclosure");
    const bristolHitRadius = Number(bristol?.querySelector<SVGCircleElement>(".campaign-base-marker__hit-target")?.getAttribute("r"));
    const cardsStayInsideMap = [bristolCard, portsmouthCard].every((card) => {
      const rect = card?.querySelector<SVGRectElement>("rect");
      if (!rect) return false;
      const x = Number(rect.getAttribute("x"));
      const y = Number(rect.getAttribute("y"));
      const width = Number(rect.getAttribute("width"));
      const height = Number(rect.getAttribute("height"));
      const [, , mapWidth = 0, mapHeight = 0] = (svg.getAttribute("viewBox") ?? "")
        .split(/\s+/)
        .map(Number);
      return x >= 0 && y >= 0 && x + width <= mapWidth && y + height <= mapHeight;
    });
    if (persistentLabels.includes("Bristol")
      || persistentLabels.includes("Portsmouth")
      || !persistentLabels.includes("Southern England")
      || markers.length !== 2
      || bristol?.getAttribute("role") !== "button"
      || bristol.getAttribute("tabindex") !== "0"
      || !bristol.getAttribute("aria-label")?.includes("Bristol, Logistics Hub, no formations currently ready")
      || bristolHitRadius < 16
      || !bristolCard?.textContent?.includes("No formations currently ready")
      || !portsmouthCard?.textContent?.includes("Sword supply columns · 2")
      || !cardsStayInsideMap) {
      throw new Error("Friendly-base disclosure lost historical identity, accessibility, bounded geometry, or decluttering.");
    }

    const activations: string[] = [];
    renderer.onHexClick((hexKey) => activations.push(hexKey));
    bristol.querySelector(".campaign-base-marker__hit-target")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    bristol.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    bristol.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    if (activations.join("|") !== "1,1|1,1|1,1") {
      throw new Error(`Pointer and keyboard base activation diverged: ${activations.join("|")}.`);
    }
  });
});

registerTest("CAMPAIGN_RENDERER_COMPLETE_THEATER_MARKERS_STAY_LITERATE_SAFE_AND_ACTIONABLE", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const view = buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0);
  const renderer = new CampaignMapRenderer();

  await Given("the complete Player-safe Normandy theater projection", () => {
    renderer.render(svg, canvas as HTMLDivElement, view);
  });

  await When("the theater is presented through bounded progressive-disclosure markers", () => {});

  await Then("all friendly bases and briefed sites have physical icons and hit targets without permanent text clutter", () => {
    const baseMarkers = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-base-marker"));
    const knownSiteMarkers = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-known-site"));
    const baseNames = new Set(baseMarkers.map((marker) => marker.dataset.baseName));
    const expectedBases = ["Bristol", "Exeter", "Plymouth", "Portland", "Portsmouth", "Southampton", "Tangmere"];
    const permanentLabels = new Set(Array.from(svg.querySelectorAll(".campaign-map-location-label"))
      .map((entry) => entry.textContent?.trim() ?? ""));
    const expectedKnownLabels = new Set((view.knownStrategicSites ?? []).map((site) => site.label));
    const baseMarkerContractHolds = baseMarkers.every((marker) => (
      marker.getAttribute("role") === "button"
      && marker.getAttribute("tabindex") === "0"
      && Boolean(marker.querySelector(".campaign-base-marker__badge .campaign-base-marker__icon"))
      && Number(marker.querySelector(".campaign-base-marker__hit-target")?.getAttribute("r")) >= 18
      && Boolean(marker.querySelector(".campaign-base-disclosure"))
    ));
    const siteMarkerContractHolds = knownSiteMarkers.every((marker) => (
      marker.getAttribute("role") === "button"
      && marker.getAttribute("tabindex") === "0"
      && Boolean(marker.querySelector(".campaign-known-site__badge-ring"))
      && Boolean(marker.querySelector(".campaign-known-site__sprite"))
      && Number(marker.querySelector(".campaign-known-site__hit-target")?.getAttribute("r")) >= 18
      && marker.querySelector(".campaign-known-site-disclosure")?.textContent?.includes("Current control and status unconfirmed")
    ));
    if (baseMarkers.length !== 7
      || knownSiteMarkers.length !== 13
      || expectedBases.some((label) => !baseNames.has(label) || permanentLabels.has(label))
      || [...expectedKnownLabels].some((label) => permanentLabels.has(label))
      || !baseMarkerContractHolds
      || !siteMarkerContractHolds) {
      throw new Error(`Complete-theater marker literacy regressed: bases=${baseMarkers.length} sites=${knownSiteMarkers.length}.`);
    }
  });

  await Then("Douvres uses safe recon presentation and every marker preserves pointer and keyboard selection parity", () => {
    const douvres = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="briefed_douvres"]');
    const douvresSprite = douvres?.querySelector<SVGImageElement>(".campaign-known-site__sprite");
    const firstBase = svg.querySelector<SVGGElement>(".campaign-base-marker");
    const activations: Array<{ hexKey: string; hasTile: boolean }> = [];
    renderer.onHexClick((hexKey, tile) => activations.push({ hexKey, hasTile: Boolean(tile) }));
    firstBase?.querySelector(".campaign-base-marker__hit-target")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    douvres?.querySelector(".campaign-known-site__hit-target")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    douvres?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    douvres?.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    if (!douvres
      || douvres.dataset.markerSpriteKey !== "intelNode"
      || !douvresSprite?.getAttribute("href")?.includes("Recon_Icon.png")
      || douvresSprite.getAttribute("href")?.includes("Airbase")
      || !douvres.getAttribute("aria-label")?.includes("briefed intel node")
      || activations.length !== 4
      || activations[0]?.hasTile !== true
      || activations.slice(1).some((activation) => activation.hexKey !== douvres.dataset.hex || activation.hasTile)) {
      throw new Error(`Overview activation or Douvres presentation diverged: ${JSON.stringify({ activations, marker: douvres?.outerHTML })}.`);
    }
    if (svg.outerHTML.includes("716th surviving coastal artillery group")) {
      throw new Error("A hidden Douvres runtime formation leaked through the safe known-site marker.");
    }
  });
});

registerTest("CAMPAIGN_RENDERER_OMITS_UNCONFIRMED_HOSTILE_SITES_FROM_THE_DOM", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const knownHex = CoordinateSystem.offsetToAxial(1, 0);
  const hiddenHex = CoordinateSystem.offsetToAxial(2, 0);
  const scenario: CampaignScenarioData = {
    key: "known-site-dom-boundary",
    title: "Known Site DOM Boundary",
    description: "Only authored briefing data may reach the Player DOM.",
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      player: { role: "region", factionControl: "Player" },
      hostileSite: {
        role: "navalBase",
        factionControl: "Bot",
        spriteKey: "navalBase",
        mapLabel: "Secret runtime port label",
        notes: "Secret runtime port status",
        navalCapacity: 91,
        forces: [{ unitType: "Infantry_Elite", count: 13, label: "Secret runtime garrison" }]
      }
    },
    briefedStrategicSites: [{
      key: "charted-port",
      observerFaction: "Player",
      hex: knownHex,
      label: "Charted port",
      role: "navalBase",
      summary: "The port location is charted; current status is unconfirmed.",
      sourceLabel: "Pre-operation naval survey",
      spriteKey: "navalBase"
    }],
    tiles: [
      { tile: "player", hex: { q: 0, r: 0 }, factionControl: "Player", forces: [] },
      { tile: "hostileSite", hex: knownHex, factionControl: "Bot", forces: [] },
      { tile: "hostileSite", hex: hiddenHex, factionControl: "Bot", forces: [{ unitType: "Infantry_Elite", count: 13, label: "Secret runtime garrison" }] }
    ],
    fronts: [],
    objectives: [],
    economies: []
  };
  const view = buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0);
  const renderer = new CampaignMapRenderer();

  await Given("one briefed hostile location and one wholly unconfirmed hostile runtime site", () => {});
  await When("the sanitized Player view is rendered", () => {
    renderer.render(svg, canvas as HTMLDivElement, view);
  });
  await Then("the DOM contains only the safe briefing marker and none of either runtime site's hidden fields", () => {
    const markup = svg.outerHTML;
    if (!svg.querySelector('.campaign-known-site[data-known-site-id="charted-port"]')
      || svg.querySelector(`.campaign-sprite[data-hex="${CoordinateSystem.makeHexKey(2, 0)}"]`)
      || /Secret runtime port label|Secret runtime port status|Secret runtime garrison|navalCapacity/.test(markup)) {
      throw new Error(`Hostile runtime site crossed into the campaign DOM: ${markup}`);
    }
  });
});

registerTest("CAMPAIGN_RENDERER_DRAWS_DERIVED_FRONTS_AS_OPERATIONAL_RIBBONS", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: CampaignScenarioData = {
    key: "derived-front-render",
    title: "Derived Front Render",
    description: "Shared-border rendering certification.",
    hexScaleKm: 5,
    dimensions: { cols: 4, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: { region: { role: "region", factionControl: "Neutral" } },
    tiles: [],
    fronts: [{
      key: "derived-front",
      label: "Derived Front",
      hexKeys: ["0,0", "2,0"],
      edges: [
        { friendlyHexKey: "0,0", opposingHexKey: "1,0" },
        { friendlyHexKey: "2,0", opposingHexKey: "3,0" }
      ],
      initiative: "Player"
    }],
    objectives: [],
    economies: []
  };
  const renderer = new CampaignMapRenderer();

  await Given("a front defined by sparse exact friendly and opposing shared edges", () => {
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

  await Then("one non-interactive cased ribbon joins the sector while faction color stays on its initiative marker", () => {
    const ribbon = svg.querySelector<SVGGElement>(".campaign-front-ribbon.front-derived-front");
    const zone = ribbon?.querySelector<SVGPathElement>(".campaign-front-ribbon__zone");
    const casing = ribbon?.querySelector<SVGPathElement>(".campaign-front-ribbon__casing");
    const line = ribbon?.querySelector<SVGPathElement>(".campaign-front-ribbon__line");
    const marker = ribbon?.querySelector<SVGGElement>('.campaign-front-ribbon__initiative[data-initiative="Player"]');
    if (!ribbon
      || ribbon.getAttribute("data-front-edges") !== "0,0|1,0 2,0|3,0"
      || ribbon.getAttribute("pointer-events") !== "none"
      || ribbon.getAttribute("role") !== "img"
      || !ribbon.getAttribute("aria-label")?.includes("Derived Front")
      || !ribbon.getAttribute("aria-label")?.includes("Friendly initiative")
      || !zone?.getAttribute("d")
      || casing?.getAttribute("d") !== zone.getAttribute("d")
      || line?.getAttribute("d") !== zone.getAttribute("d")
      || line.getAttribute("stroke") !== "#f0d48a"
      || !marker
      || svg.querySelector("line.campaign-front-edge")
      || svg.querySelector("polyline.front-derived-front")) {
      throw new Error("The derived front did not render as one accessible operational ribbon.");
    }
  });
});

registerTest("CAMPAIGN_RENDERER_REGISTERS_THE_SHIPPED_GRID_TO_THE_NATIVE_BACKGROUND", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const renderer = new CampaignMapRenderer();

  await Given("the native square Central Channel artwork and its 10 km registered lattice", () => {
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

  await When("the complete operational grid is projected", () => {});

  await Then("the artwork keeps its aspect and every official odd-q neighbor uses one regular flat-top spacing", () => {
    const background = svg.querySelector<SVGImageElement>("#campaign-map-background-image");
    const origin = renderer.getHexCenter("20,20");
    const east = renderer.getHexCenter("21,20");
    const south = renderer.getHexCenter("20,21");
    const originPolygon = svg.querySelector<SVGPolygonElement>('.campaign-hex[data-hex="20,20"] polygon');
    const points = originPolygon?.getAttribute("points")?.split(" ").map((point) => point.split(",").map(Number)) ?? [];
    const eastSpacing = origin && east ? Math.hypot(east.cx - origin.cx, east.cy - origin.cy) : Number.NaN;
    const southSpacing = origin && south ? Math.hypot(south.cx - origin.cx, south.cy - origin.cy) : Number.NaN;
    const officialHexes = svg.querySelectorAll(".campaign-hex:not(.campaign-hex-padding)");
    if (!background || !origin || !east || !south
      || canvas.style.width !== "1024px" || canvas.style.height !== "1024px"
      || svg.getAttribute("viewBox") !== "0 0 1024 1024"
      || background.getAttribute("width") !== "1024" || background.getAttribute("height") !== "1024"
      || background.getAttribute("preserveAspectRatio") !== "xMidYMid meet"
      || canvas.dataset.campaignHexScaleKm !== "10"
      || officialHexes.length !== 58 * 50
      || svg.querySelectorAll(".campaign-hex-padding").length !== 0
      || !Number.isFinite(eastSpacing) || Math.abs(eastSpacing - southSpacing) > 0.001
      || points.length !== 6
      || Math.abs(points[0][1] - origin.cy) > 0.001
      || points[0][0] <= origin.cx) {
      throw new Error("The shipped grid is distorted, incomplete, or no longer registered as a regular flat-top lattice on the native image.");
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

  await When("the two historically organized Channel task forces are painted", () => {});

  await Then("each force uses spread directional ship art and no ground counter at its water station", () => {
    const channelOffsetKeys = ["22,20", "26,18"];
    channelOffsetKeys.forEach((channelOffsetKey) => {
      const fleet = svg.querySelector<SVGGElement>(`.campaign-task-force[data-hex="${channelOffsetKey}"]`);
      const ships = fleet?.querySelectorAll<SVGImageElement>(".campaign-task-force__ship") ?? [];
    const shipAssets = Array.from(ships).map((ship) => ship.getAttribute("href") ?? "");
    const station = fleet?.querySelector<SVGCircleElement>(".campaign-task-force__station") ?? null;
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
    const shipRects = Array.from(ships).map((ship) => ({
      x: Number(ship.getAttribute("x")),
      width: Number(ship.getAttribute("width"))
    }));
    const formationWidth = shipRects.length > 0
      ? Math.max(...shipRects.map((rect) => rect.x + rect.width)) - Math.min(...shipRects.map((rect) => rect.x))
      : 0;
    const stationDiameter = station ? Number(station.getAttribute("r")) * 2 : 0;
    const fleetSilhouetteContrast = Array.from(ships).every((ship) => ship.getAttribute("style")?.includes("drop-shadow"));
    const channelHex = svg.querySelector<SVGGElement>(`.campaign-hex[data-hex="${channelOffsetKey}"]`);
    const groundCounters = svg.querySelectorAll(`.campaign-force-icon[data-hex="${channelOffsetKey}"]`);
    if (!fleet
      || ships.length !== 5
      || shipAssets.filter((asset) => asset.includes("Transport_Ship_USA_Southview")).length !== 2
      || shipAssets.filter((asset) => asset.includes("Destroyer_USA_Southview")).length !== 2
      || shipAssets.filter((asset) => asset.includes("Battleship_USA_Southview")).length !== 1
      || shipAssets.some((asset) => asset.includes("task_force.svg"))
      || fleet.dataset.facing !== "SW"
      || fleet.getAttribute("role") !== "img"
      || !fleet.getAttribute("aria-label")?.includes("Naval Task Force supporting")
      || station?.getAttribute("data-authoritative-anchor") !== "true"
      || station?.getAttribute("cx") !== channelHex?.dataset.cx
      || station?.getAttribute("cy") !== channelHex?.dataset.cy
      || !fleetSilhouetteContrast
      || formationWidth <= stationDiameter * 2
      || !supportSilhouettesRemainVisible
      || groundCounters.length !== 0) {
      throw new Error("The Channel fleet still lacks a centered station, readable spread, authored vessel silhouettes, correct facing, or clean naval-only projection.");
    }
    });
    if (svg.querySelectorAll(".campaign-task-force").length !== 2) {
      throw new Error("The D+1 map did not retain distinct Western and Eastern naval support forces.");
    }
    const mapLabels = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-map-location-label"));
    const mapLabelText = mapLabels.map((label) => label.textContent?.trim() ?? "");
    const estimatedBoxes = mapLabels.map((label) => {
      const text = label.querySelector<SVGTextElement>("text");
      const fontSize = Number(text?.getAttribute("font-size"));
      const width = fontSize * ((text?.textContent?.length ?? 0) * 0.61 + 0.8);
      const anchor = text?.getAttribute("text-anchor");
      const x = Number(text?.getAttribute("x"));
      const y = Number(text?.getAttribute("y"));
      const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
      return { label: text?.textContent ?? "", left, right: left + width, top: y - fontSize * 1.2, bottom: y };
    });
    const overlap = estimatedBoxes.some((box, index) => estimatedBoxes.slice(index + 1).some((other) => (
      box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
    )));
    if (mapLabelText.some((label) => /Fleet/i.test(label))
      || !mapLabelText.includes("Sword")
      || !mapLabelText.includes("Orne")
      || overlap) {
      throw new Error(`Formation names leaked into geographic labels or map labels still collide: ${JSON.stringify(estimatedBoxes)}.`);
    }
  });
});

registerTest("CAMPAIGN_RENDERER_CENTERS_STRENGTH_FORMATIONS_INSIDE_AUTHORITATIVE_HEXES", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const renderer = new CampaignMapRenderer();

  await Given("the shipped campaign's player-visible operational forces", () => {
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

  await When("the campaign renderer composes each force as one strategic formation", () => {});

  await Then("actors communicate broad strength inside one centered safe footprint without leaking opposing formations", () => {
    const expectedActorCounts = new Map<string, number>([
      ["21,26", 2],
      ["23,27", 2],
      ["22,24", 4],
      ["24,23", 4]
    ]);

    expectedActorCounts.forEach((expectedActorCount, hexKey) => {
      const hex = svg.querySelector<SVGGElement>(`.campaign-hex[data-hex="${hexKey}"]`);
      const stack = svg.querySelector<SVGGElement>(`.campaign-force-stack[data-hex="${hexKey}"]`);
      const footprint = stack?.querySelector<SVGCircleElement>(".campaign-force-stack__footprint") ?? null;
      const actors = Array.from(stack?.querySelectorAll<SVGImageElement>(".campaign-force-stack__actor") ?? []);
      const cx = Number(hex?.dataset.cx);
      const cy = Number(hex?.dataset.cy);
      const safeRadius = Number(footprint?.getAttribute("r"));
      const allActorCornersStayInside = actors.every((actor) => {
        const x = Number(actor.getAttribute("x"));
        const y = Number(actor.getAttribute("y"));
        const width = Number(actor.getAttribute("width"));
        const height = Number(actor.getAttribute("height"));
        return [
          [x, y],
          [x + width, y],
          [x, y + height],
          [x + width, y + height]
        ].every(([cornerX, cornerY]) => Math.hypot(cornerX - cx, cornerY - cy) <= safeRadius + 0.001);
      });

      if (!hex
        || !stack
        || !footprint
        || stack.getAttribute("role") !== "img"
        || stack.dataset.actorCount !== String(expectedActorCount)
        || actors.length !== expectedActorCount
        || footprint.getAttribute("cx") !== hex.dataset.cx
        || footprint.getAttribute("cy") !== hex.dataset.cy
        || !allActorCornersStayInside) {
        throw new Error(`Force formation at ${hexKey} did not remain centered and contained: ${stack?.outerHTML ?? "missing"}`);
      }
    });

    const beachhead = svg.querySelector<SVGGElement>('.campaign-force-stack[data-hex="24,23"]');
    const exactName = beachhead?.getAttribute("aria-label") ?? "";
    const opposingTruth = svg.querySelector('.campaign-force-stack[data-hex="24,24"]');
    const floatingCounts = svg.querySelectorAll(".campaign-force-count");
    if (!exactName.includes("Friendly force · 14 formations · hex 24,23")
      || !exactName.includes("7 U.S. 1st Infantry Division battalions")
      || !exactName.includes("5 U.S. 29th Infantry Division battalions")
      || !exactName.includes("2 V Corps engineer groups")
      || exactName.includes("Infantry_42")
      || opposingTruth
      || floatingCounts.length !== 0) {
      throw new Error(`Force presentation lost its exact accessible composition, leaked Bot truth, or retained floating counts: '${exactName}'.`);
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
        uncertaintyRadius: 1,
        domain: "ground",
        label: "Infantry formation",
        classificationBand: "Infantry formation",
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

  await Then("a bounded sprite token replaces all map-covering enemy text while preserving useful selection detail", () => {
    const marker = svg.querySelector<SVGGElement>('.campaign-intel-contact[data-contact-id="contact-1"]');
    const visibleText = Array.from(marker?.querySelectorAll("text") ?? []).map((node) => node.textContent ?? "").join("");
    const accessibleName = marker?.getAttribute("aria-label") ?? "";
    const token = marker?.querySelector<SVGCircleElement>("circle:not(.campaign-intel-uncertainty)") ?? null;
    const uncertainty = marker?.querySelector<SVGCircleElement>(".campaign-intel-uncertainty") ?? null;
    const sprite = marker?.querySelector<SVGImageElement>(".campaign-intel-contact__sprite") ?? null;
    const contactCenter = renderer.getHexCenter("1,1");
    const neighborCenter = renderer.getHexCenter("0,1");
    const centerSpacing = contactCenter && neighborCenter
      ? Math.hypot(contactCenter.cx - neighborCenter.cx, contactCenter.cy - neighborCenter.cy)
      : 0;
    let clickedContact = "";
    renderer.onHexClick((_hexKey, _tile, contactId) => { clickedContact = contactId ?? ""; });
    sprite?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const keyboardActivation = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    marker?.dispatchEvent(keyboardActivation);
    renderer.setIntelContactsVisible(false);
    const contactLayer = svg.querySelector<SVGGElement>("#campaign-map-intel-contacts");
    const hiddenOutsideIntel = contactLayer?.style.display === "none";
    renderer.setIntelContactsVisible(true);
    const visibleInIntel = contactLayer?.style.display === "block";
    if (!marker
      || visibleText.trim() !== ""
      || /ENEMY|Ground contact|\bGRD\b|\bNOW\b/i.test(visibleText)
      || marker.getAttribute("role") !== "button"
      || marker.getAttribute("tabindex") !== "0"
      || !token || !sprite || !uncertainty
      || centerSpacing <= 0
      || Number(token.getAttribute("r")) >= centerSpacing * 0.45
      || token.getAttribute("cx") !== String(contactCenter?.cx)
      || token.getAttribute("cy") !== String(contactCenter?.cy)
      || uncertainty.getAttribute("pointer-events") !== "none"
      || uncertainty.getAttribute("aria-hidden") !== "true"
      || clickedContact !== "contact-1"
      || !keyboardActivation.defaultPrevented
      || !hiddenOutsideIntel
      || !visibleInIntel
      || !accessibleName.includes("Infantry formation, identified, medium confidence, light strength, current observation")
      || !accessibleName.includes("within 1 hex")
      || !accessibleName.includes("Select to review")) {
      throw new Error(`Enemy contact presentation remained ambiguous: '${visibleText}' / '${accessibleName}'.`);
    }
  });
});

registerTest("CAMPAIGN_RENDERER_SEPARATES_COLOCATED_SITE_AND_CONTACT_MARKERS", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario: CampaignScenarioData = {
    key: "colocated-intel",
    title: "Colocated intelligence",
    description: "Fixed sites and mobile assessments must remain separately selectable.",
    dimensions: { cols: 2, rows: 2 },
    background: { imageUrl: "about:blank" },
    tilePalette: { region: { role: "region", factionControl: "Neutral" } },
    tiles: [], fronts: [], objectives: [], economies: []
  };
  const renderer = new CampaignMapRenderer();

  await Given("a briefed logistics hub and an assessed formation in the same hex", () => {
    renderer.render(svg, canvas as HTMLDivElement, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [{
        id: "contact-colocated",
        subjectKind: "force",
        level: "identified",
        state: "current",
        confidenceBand: "medium",
        locationHexKey: "1,1",
        uncertaintyRadius: 0,
        domain: "ground",
        label: "Ground formation",
        classificationBand: "Ground formation",
        strengthBand: "light",
        lastObservedSegment: 0,
        ageSegments: 0,
        sourceLabels: ["Air reconnaissance"],
        analystNotes: []
      }],
      knownStrategicSites: [{
        id: "site-colocated",
        locationHexKey: "1,1",
        label: "Charted rail yard",
        role: "logisticsHub",
        summary: "Fixed site; current activity unconfirmed.",
        sourceLabel: "Pre-operation aerial survey",
        spriteKey: "logisticsHub"
      }],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("both intelligence records are rendered", () => {});

  await Then("two bounded markers share the hex without covering each other or exposing a raw role ID", () => {
    const center = renderer.getHexCenter("1,1");
    const contactToken = svg.querySelector<SVGCircleElement>('.campaign-intel-contact[data-contact-id="contact-colocated"] circle:not(.campaign-intel-uncertainty)');
    const site = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="site-colocated"]');
    const siteRing = site?.querySelector<SVGCircleElement>("circle") ?? null;
    const contactX = Number(contactToken?.getAttribute("cx"));
    const siteX = Number(siteRing?.getAttribute("cx"));
    const radiusSum = Number(contactToken?.getAttribute("r")) + Number(siteRing?.getAttribute("r"));
    const accessibleName = site?.getAttribute("aria-label") ?? "";
    if (!center || !contactToken || !siteRing
      || contactX <= center.cx || siteX >= center.cx
      || contactX - siteX < radiusSum
      || !accessibleName.includes("briefed logistics hub")
      || accessibleName.includes("logisticsHub")) {
      throw new Error(`Colocated intelligence remained overlapped or raw: ${JSON.stringify({ contactX, siteX, radiusSum, accessibleName })}.`);
    }
  });
});
