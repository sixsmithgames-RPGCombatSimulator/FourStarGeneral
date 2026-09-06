import "./domEnvironment.js";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import { CampaignMapRenderer } from "../src/rendering/CampaignMapRenderer";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { MapViewport } from "../src/ui/controls/MapViewport";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignMapViewModel } from "../src/core/campaignIntelTypes";
import { buildCampaignMapView, createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import campaignScenarioData from "../src/data/campaign01.json";

type MapRect = { left: number; right: number; top: number; bottom: number };

function rectsIntersect(left: MapRect, right: MapRect): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function imageRect(image: SVGImageElement, scale = 1): MapRect {
  const x = Number(image.getAttribute("x"));
  const y = Number(image.getAttribute("y"));
  const width = Number(image.getAttribute("width"));
  const height = Number(image.getAttribute("height"));
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return {
    left: centerX - width * scale / 2,
    right: centerX + width * scale / 2,
    top: centerY - height * scale / 2,
    bottom: centerY + height * scale / 2
  };
}

function circleRect(circle: SVGCircleElement, scale = 1): MapRect {
  const cx = Number(circle.getAttribute("cx"));
  const cy = Number(circle.getAttribute("cy"));
  const radius = Number(circle.getAttribute("r")) * scale;
  return { left: cx - radius, right: cx + radius, top: cy - radius, bottom: cy + radius };
}

function textRect(text: SVGTextElement): MapRect {
  const x = Number(text.getAttribute("x"));
  const baseline = Number(text.getAttribute("y"));
  const fontSize = Number(text.getAttribute("font-size"));
  const width = fontSize * ((text.textContent?.length ?? 0) * 0.61 + 0.8);
  const height = fontSize * 1.2;
  const padding = fontSize * 0.38;
  const anchor = text.getAttribute("text-anchor");
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return {
    left: left - padding,
    right: left + width + padding,
    top: baseline - height - padding,
    bottom: baseline + padding
  };
}

function circleStaysInsideFlatTopHex(
  center: { cx: number; cy: number },
  hexRadius: number,
  circle: SVGCircleElement,
  circleScale: number
): boolean {
  const dx = Math.abs(Number(circle.getAttribute("cx")) - center.cx);
  const dy = Math.abs(Number(circle.getAttribute("cy")) - center.cy);
  const radius = Number(circle.getAttribute("r")) * circleScale;
  return dx + radius <= hexRadius + 0.001
    && Math.sqrt(3) * dx + dy + 2 * radius <= Math.sqrt(3) * hexRadius + 0.001;
}

function imageStaysInsideFlatTopHex(
  center: { cx: number; cy: number },
  hexRadius: number,
  image: SVGImageElement,
  imageScale: number
): boolean {
  const rect = imageRect(image, imageScale);
  return [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.left, rect.bottom],
    [rect.right, rect.bottom]
  ].every(([x, y]) => {
    const dx = Math.abs(x - center.cx);
    const dy = Math.abs(y - center.cy);
    return dx <= hexRadius + 0.001
      && Math.sqrt(3) * dx + dy <= Math.sqrt(3) * hexRadius + 0.001;
  });
}

registerTest("FSG_CAM_101_SHIPPED_COLOCATED_MARKERS_REMAIN_INSIDE_AUTHORED_HEX", () => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "campaignColocatedGeometryMap";
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  try {
    const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
    const knowledge = createCampaignKnowledgeState(scenario, "Player", 0);
    const view = buildCampaignMapView(scenario, knowledge, 0);
    const before = JSON.stringify({ scenario, knowledge, view });
    const renderer = new CampaignMapRenderer();
    renderer.render(svg, canvas, view);
    const root = svg.querySelector<SVGGElement>("#viewportRoot");
    const center = renderer.getHexCenter("29,23")!;
    const contact = view.enemyContacts.find(entry => entry.locationHexKey === "29,23");
    if (!contact || !root) throw new Error("Shipped Douvres co-location prerequisite is missing.");
    const radius = 1024 / (2 + 1.5 * 57);
    const viewport = new MapViewport("#campaignColocatedGeometryMap", null, 0.1);
    viewport.setViewportRoot(root);
    const activations: Array<{ hex: string; contact?: string }> = [];
    renderer.onHexClick((hex, _tile, contactId) => activations.push({ hex, contact: contactId }));
    const site = svg.querySelector<SVGGElement>('[data-known-site-id="briefed_douvres"]')!;
    const siteTarget = site.querySelector<SVGCircleElement>(".campaign-known-site__hit-target")!;
    const siteSprite = site.querySelector<SVGImageElement>(".campaign-known-site__sprite")!;
    const contactMarker = svg.querySelector<SVGGElement>(`[data-contact-id="${contact.id}"]`)!;
    const contactToken = contactMarker.querySelector<SVGCircleElement>("circle:not(.campaign-intel-uncertainty)")!;
    for (const zoom of [0.714, 1, 3.48, 7.5]) {
      viewport.setTransform(zoom, 0, 0);
      const markerScale = Number(root.style.getPropertyValue("--campaign-map-marker-scale"));
      const contactScale = Number(root.style.getPropertyValue("--campaign-map-contact-scale"));
      renderer.setIntelContactsVisible(false);
      if (Number(siteTarget.getAttribute("cx")) !== center.cx
        || Number(siteTarget.getAttribute("cy")) !== center.cy
        || !circleStaysInsideFlatTopHex(center, radius, siteTarget, 1)
        || !imageStaysInsideFlatTopHex(center, radius, siteSprite, markerScale)) {
        throw new Error(`Operational Douvres marker escapes authored Grid 29,23 at zoom ${zoom}.`);
      }
      renderer.setIntelContactsVisible(true);
      if (Number(contactToken.getAttribute("cx")) <= center.cx
        || !circleStaysInsideFlatTopHex(center, radius, contactToken, contactScale)) {
        throw new Error(`Intelligence co-location is not distinct and bounded at zoom ${zoom}.`);
      }
    }
    siteTarget.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    site.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    contactToken.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    contactMarker.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    if (activations.length !== 4
      || activations[0]?.hex !== "29,23" || activations[0]?.contact !== undefined
      || activations[1]?.hex !== "29,23" || activations[1]?.contact !== undefined
      || activations[2]?.hex !== "29,23" || activations[2]?.contact !== contact.id
      || activations[3]?.hex !== "29,23" || activations[3]?.contact !== contact.id) {
      throw new Error(`Co-located selection identities changed: ${JSON.stringify(activations)}`);
    }
    if (JSON.stringify({ scenario, knowledge, view }) !== before) throw new Error("Map presentation mutated campaign knowledge or scenario.");
  } finally { canvas.remove(); }
});

registerTest("FSG_CAM_102_DETAIL_ZOOM_CAPS_CAMPAIGN_SYMBOL_FOOTPRINTS", () => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "campaignSymbolScaleMap";
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  try {
    const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
    const rotatedSymbolTile = scenario.tiles.find(instance => {
      const { col, row } = CoordinateSystem.axialToOffset(instance.hex.q, instance.hex.r);
      return `${col},${row}` === "24,23";
    });
    if (!rotatedSymbolTile) throw new Error("Shipped Omaha symbol prerequisite is missing.");
    rotatedSymbolTile.rotation = 30;
    const renderer = new CampaignMapRenderer();
    renderer.render(svg, canvas, buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0));
    const root = svg.querySelector<SVGGElement>("#viewportRoot")!;
    const viewport = new MapViewport("#campaignSymbolScaleMap", null, 0.1);
    viewport.setViewportRoot(root);
    const douvres = svg.querySelector<SVGImageElement>('[data-known-site-id="briefed_douvres"] .campaign-known-site__sprite')!;
    const junoSymbol = svg.querySelector<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol[data-hex="28,23"]')!;
    const rotatedSymbol = svg.querySelector<SVGImageElement>('#campaign-map-sprites .campaign-map-tile-symbol[data-hex="24,23"]')!;
    const junoForce = svg.querySelector<SVGCircleElement>('#campaign-map-forces .campaign-force-stack[data-hex="28,23"] .campaign-force-stack__footprint')!;
    const rotatedTaskForces = svg.querySelectorAll<SVGGElement>('.campaign-task-force[data-facing="SW"][transform]');
    const base = svg.querySelector<SVGImageElement>(".campaign-base-marker__sprite")!;
    const baseHex = base?.closest<SVGGElement>(".campaign-base-marker")?.dataset.hex;
    const douvresCenter = renderer.getHexCenter("29,23");
    const junoCenter = renderer.getHexCenter("28,23");
    const baseCenter = baseHex ? renderer.getHexCenter(baseHex) : null;
    const radius = 1024 / (2 + 1.5 * 57);
    if (!douvres || !junoSymbol || !rotatedSymbol || !junoForce || !base || !douvresCenter || !junoCenter || !baseCenter
      || junoSymbol.dataset.symbolTreatment !== "bounded-icon"
      || junoSymbol.getAttribute("transform") !== null
      || junoSymbol.parentElement?.style.transform !== "scale(var(--campaign-map-tile-symbol-scale, 1))"
      || !rotatedSymbol.getAttribute("transform")?.startsWith("rotate(30 ")
      || rotatedSymbol.parentElement?.style.transform !== "scale(var(--campaign-map-tile-symbol-scale, 1))"
      || rotatedTaskForces.length === 0) {
      throw new Error("Shipped Douvres/Juno symbol prerequisites were not rendered with explicit treatment.");
    }
    for (const zoom of [1, 3.48, 7.5]) {
      viewport.setTransform(zoom, 0, 0);
      const markerScale = Number(root.style.getPropertyValue("--campaign-map-marker-scale"));
      const tileScale = Number(root.style.getPropertyValue("--campaign-map-tile-symbol-scale"));
      const forceScale = Number(root.style.getPropertyValue("--campaign-map-force-scale"));
      const douvresWidth = Number(douvres.getAttribute("width")) * zoom * markerScale;
      const junoSymbolWidth = Number(junoSymbol.getAttribute("width")) * zoom * tileScale;
      const junoForceWidth = Number(junoForce.getAttribute("r")) * 2 * zoom * forceScale;
      const baseWidth = Number(base.getAttribute("width")) * zoom * markerScale;
      if (![markerScale, tileScale, forceScale].every(value => Number.isFinite(value) && value > 0)
        || douvresWidth > 44.01
        || junoSymbolWidth > 36.01
        || junoForceWidth > 44.01
        || baseWidth > 44.01
        || !imageStaysInsideFlatTopHex(douvresCenter, radius, douvres, markerScale)
        || !imageStaysInsideFlatTopHex(junoCenter, radius, junoSymbol, tileScale)
        || !circleStaysInsideFlatTopHex(junoCenter, radius, junoForce, forceScale)
        || !imageStaysInsideFlatTopHex(baseCenter, radius, base, markerScale)) {
        throw new Error(`Campaign symbols outgrow their cells at zoom ${zoom}: ${JSON.stringify({ douvresWidth, junoSymbolWidth, junoForceWidth, baseWidth })}`);
      }
    }
  } finally { canvas.remove(); }
});

registerTest("FSG_CAM_103_SHIPPED_LABELS_CLEAR_RENDERED_MARKER_FOOTPRINTS", () => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  try {
    const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
    const renderer = new CampaignMapRenderer();
    const view = buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0);
    renderer.render(svg, canvas, view);
    renderer.setIntelContactsVisible(false);
    const labels = Array.from(svg.querySelectorAll<SVGTextElement>(".campaign-map-location-label > text"));
    const expectedLabels = view.scenario.tiles.filter(instance => {
      const palette = view.scenario.tilePalette[instance.tile];
      return Boolean(palette?.mapLabel?.trim())
        && palette.role !== "taskForce"
        && !(palette.factionControl === "Player"
          && (palette.role === "airbase" || palette.role === "logisticsHub" || palette.role === "navalBase"));
    }).map(instance => view.scenario.tilePalette[instance.tile].mapLabel!.trim()).sort();
    const obstacles: MapRect[] = [
      ...Array.from(svg.querySelectorAll<SVGImageElement>("#campaign-map-sprites image")).map(image => imageRect(image)),
      ...Array.from(svg.querySelectorAll<SVGCircleElement>("#campaign-map-forces .campaign-force-stack__footprint")).map(circle => circleRect(circle)),
      ...Array.from(svg.querySelectorAll<SVGImageElement>(".campaign-base-marker__sprite, .campaign-known-site__sprite")).map(image => imageRect(image)),
      ...Array.from(svg.querySelectorAll<SVGCircleElement>(".campaign-intel-contact circle:not(.campaign-intel-uncertainty)")).map(circle => circleRect(circle))
    ];
    const labelRects = labels.map(text => ({ label: text.textContent?.trim() ?? "", rect: textRect(text) }));
    const collisions = labelRects.flatMap(entry => obstacles
      .map((obstacle, index) => rectsIntersect(entry.rect, obstacle) ? `${entry.label}:marker-${index}` : null)
      .filter((value): value is string => value !== null));
    const labelCollisions = labelRects.flatMap((entry, index) => labelRects.slice(index + 1)
      .filter(other => rectsIntersect(entry.rect, other.rect))
      .map(other => `${entry.label}:${other.label}`));
    const rootChildren = Array.from(svg.querySelector("#viewportRoot")?.children ?? []);
    const leaderLayerIndex = rootChildren.findIndex(child => child.id === "campaign-map-location-leaders");
    const labelLayerIndex = rootChildren.findIndex(child => child.id === "campaign-map-location-labels");
    const transientLayerIndex = rootChildren.findIndex(child => child.id === "campaign-map-transient-disclosures");
    const earliestMarkerLayerIndex = Math.min(
      rootChildren.findIndex(child => child.id === "campaign-map-sprites"),
      rootChildren.findIndex(child => child.id === "campaign-map-forces"),
      rootChildren.findIndex(child => child.id === "campaign-map-known-sites"),
      rootChildren.findIndex(child => child.id === "campaign-map-intel-contacts")
    );
    const latestMarkerLayerIndex = Math.max(
      rootChildren.findIndex(child => child.id === "campaign-map-forces"),
      rootChildren.findIndex(child => child.id === "campaign-map-known-sites"),
      rootChildren.findIndex(child => child.id === "campaign-map-intel-contacts")
    );
    const leaders = svg.querySelectorAll("#campaign-map-location-leaders .campaign-map-location-label__leader");
    const renderedLabels = labels.map(label => label.textContent?.trim() ?? "").sort();
    if (JSON.stringify(renderedLabels) !== JSON.stringify(expectedLabels)
      || collisions.length > 0
      || labelCollisions.length > 0
      || leaderLayerIndex < 0
      || leaderLayerIndex >= earliestMarkerLayerIndex
      || labelLayerIndex <= latestMarkerLayerIndex
      || labelLayerIndex >= transientLayerIndex
      || !labels.some(label => label.textContent === "Juno")
      || leaders.length !== labels.length) {
      throw new Error(`Shipped place-label layout remains occluded: ${JSON.stringify({ renderedLabels, expectedLabels, collisions: collisions.slice(0, 12), labelCollisions: labelCollisions.slice(0, 12), leaderLayerIndex, earliestMarkerLayerIndex, labelLayerIndex, latestMarkerLayerIndex, transientLayerIndex, leaderCount: leaders.length })}`);
    }
  } finally { canvas.remove(); }
});

registerTest("FSG_CAM_104_DISCLOSURE_FITS_THE_INTERSECTION_OF_CLIPPING_ANCESTORS", async () => {
  const outer = document.createElement("section");
  outer.style.overflow = "hidden";
  const viewportHost = document.createElement("div");
  viewportHost.style.overflow = "auto";
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewportHost.appendChild(canvas);
  outer.appendChild(viewportHost);
  document.body.appendChild(outer);
  const makeRect = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ""
  } as DOMRect);
  try {
    const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
    const renderer = new CampaignMapRenderer();
    renderer.render(svg, canvas, buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0));
    const root = svg.querySelector<SVGGElement>("#viewportRoot")!;
    const douvres = svg.querySelector<SVGGElement>('[data-known-site-id="briefed_douvres"]')!;
    const disclosure = douvres.querySelector<SVGGElement>(".campaign-known-site-disclosure")!;
    Object.defineProperty(outer, "getBoundingClientRect", { configurable: true, value: () => makeRect(80, 20, 640, 520) });
    Object.defineProperty(viewportHost, "getBoundingClientRect", { configurable: true, value: () => makeRect(100, 40, 600, 460) });
    Object.defineProperty(svg, "getBoundingClientRect", { configurable: true, value: () => makeRect(0, 0, 1024, 768) });
    Object.defineProperty(disclosure, "getBoundingClientRect", { configurable: true, value: () => makeRect(560, 420, 220, 100) });
    Object.defineProperty(root, "getScreenCTM", {
      configurable: true,
      value: () => ({ a: 3.48, b: 0, c: 0, d: 3.48, e: 0, f: 0 })
    });
    for (const event of ["pointerenter", "focus"] as const) {
      douvres.dispatchEvent(event === "focus"
        ? new window.FocusEvent(event)
        : new window.MouseEvent(event, { bubbles: false }));
      await new Promise<void>(resolve => window.setTimeout(resolve, 24));
      const shiftX = Number.parseFloat(disclosure.style.getPropertyValue("--campaign-disclosure-shift-x"));
      const shiftY = Number.parseFloat(disclosure.style.getPropertyValue("--campaign-disclosure-shift-y"));
      if (Math.abs(shiftX - (-88 / 3.48)) > 0.01 || Math.abs(shiftY - (-28 / 3.48)) > 0.01) {
        throw new Error(`${event} disclosure ignored a clipping ancestor: ${JSON.stringify({ shiftX, shiftY })}`);
      }
    }
  } finally { outer.remove(); }
});

registerTest("FSG_CAM_105_RENDERER_RELEASES_DISCLOSURE_AND_INTERACTION_TRACKING", () => {
  const firstOuter = document.createElement("section");
  const firstCanvas = document.createElement("div");
  const firstSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const secondOuter = document.createElement("section");
  const secondCanvas = document.createElement("div");
  const secondSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  firstCanvas.appendChild(firstSvg); firstOuter.appendChild(firstCanvas);
  secondCanvas.appendChild(secondSvg); secondOuter.appendChild(secondCanvas);
  document.body.append(firstOuter, secondOuter);
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalWindowAdd = window.addEventListener.bind(window);
  const originalWindowRemove = window.removeEventListener.bind(window);
  let resizeDisconnects = 0;
  let windowResizeAdds = 0;
  let windowResizeRemoves = 0;
  class AuditResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(_target: Element): void {}
    unobserve(_target: Element): void {}
    disconnect(): void { resizeDisconnects += 1; }
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: AuditResizeObserver });
  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    if (type === "resize") windowResizeAdds += 1;
    originalWindowAdd(type, listener, options);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
    if (type === "resize") windowResizeRemoves += 1;
    originalWindowRemove(type, listener, options);
  }) as typeof window.removeEventListener;
  try {
    const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
    const view = buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0);
    const renderer = new CampaignMapRenderer();
    const activations: string[] = [];
    renderer.render(firstSvg, firstCanvas, view);
    renderer.onHexClick(hexKey => activations.push(hexKey));
    const firstTarget = firstSvg.querySelector<SVGCircleElement>(".campaign-known-site__hit-target")!;
    const expectedHex = firstTarget.dataset.hex;
    firstTarget.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    renderer.render(secondSvg, secondCanvas, view);
    firstSvg.querySelector<SVGCircleElement>(".campaign-known-site__hit-target")!
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    secondSvg.querySelector<SVGCircleElement>(".campaign-known-site__hit-target")!
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    renderer.dispose();
    secondSvg.querySelector<SVGCircleElement>(".campaign-known-site__hit-target")!
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    if (!expectedHex || JSON.stringify(activations) !== JSON.stringify([expectedHex, expectedHex])
      || resizeDisconnects !== 2
      || windowResizeAdds !== 2
      || windowResizeRemoves !== 2) {
      throw new Error(`Renderer lifecycle retained old tracking: ${JSON.stringify({ activations, resizeDisconnects, windowResizeAdds, windowResizeRemoves })}`);
    }
  } finally {
    window.addEventListener = originalWindowAdd;
    window.removeEventListener = originalWindowRemove;
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalResizeObserver });
    firstOuter.remove(); secondOuter.remove();
  }
});

registerTest("FSG_CAM_106_LEADERS_SHARE_LEGACY_GRID_REGISTRATION", () => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg); document.body.appendChild(canvas);
  try {
    const scenario: CampaignScenarioData = {
      key: "legacy-label-registration",
      title: "Legacy label registration",
      description: "Non-registered grid transform contract",
      hexScaleKm: 10,
      dimensions: { cols: 3, rows: 2 },
      background: { imageUrl: "about:blank" },
      tilePalette: { town: { role: "region", factionControl: "Neutral", mapLabel: "Test Town" } },
      tiles: [{ tile: "town", hex: { q: 0, r: 0 } }],
      fronts: [],
      objectives: [],
      economies: []
    };
    const renderer = new CampaignMapRenderer();
    renderer.render(svg, canvas, {
      scenario,
      observerFaction: "Player",
      coverage: [],
      enemyContacts: [],
      knownStrategicSites: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
    const transform = svg.querySelector("#campaign-map-hexes")?.getAttribute("transform");
    const leaderTransform = svg.querySelector("#campaign-map-location-leaders")?.getAttribute("transform");
    const labelTransform = svg.querySelector("#campaign-map-location-labels")?.getAttribute("transform");
    if (!transform || transform === "translate(0.000, 0.000)"
      || leaderTransform !== transform || labelTransform !== transform
      || svg.querySelectorAll("#campaign-map-location-leaders line").length !== 1) {
      throw new Error(`Legacy grid labels and leaders diverged: ${JSON.stringify({ transform, leaderTransform, labelTransform })}`);
    }
  } finally { canvas.remove(); }
});

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
      spriteKey: "airbase",
      category: "enemyInstallation",
      locationPrecision: "fixed",
      relatedLocations: []
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
      || !knownSite.getAttribute("aria-label")?.includes("Current control, condition, and garrison remain unconfirmed")
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

registerTest("FSG_CAM_041_BASE_DISCLOSURE_DOES_NOT_INFER_READINESS_FROM_AUTHORED_COUNTS", async ({ Given, When, Then }) => {
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
      || !bristol.getAttribute("aria-label")?.includes("Bristol, Logistics Hub. No formations assigned")
      || bristolHitRadius < 18
      || !bristolCard?.textContent?.includes("No formations assigned")
      || !portsmouthCard?.textContent?.includes("British Second Army · 2 formations assigned")
      || /\bready\b/i.test(`${bristolCard?.textContent ?? ""} ${portsmouthCard?.textContent ?? ""}`)
      || Boolean(bristol.querySelector("title"))
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

registerTest("FSG_CAM_036_KNOWN_SITES_USE_ONE_PLAYER_SAFE_DISCLOSURE", async ({ Given, When, Then }) => {
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

  await Then("every briefed site has one physical icon, one disclosure, and no competing native tooltip", () => {
    const knownSiteMarkers = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-known-site"));
    const registeredRadius = 1024 / (2 + 1.5 * (view.scenario.dimensions.cols - 1));
    const permanentLabels = new Set(Array.from(svg.querySelectorAll(".campaign-map-location-label"))
      .map((entry) => entry.textContent?.trim() ?? ""));
    const expectedKnownLabels = new Set((view.knownStrategicSites ?? []).map((site) => site.label));
    const siteMarkerContractHolds = knownSiteMarkers.every((marker) => {
      const center = renderer.getHexCenter(marker.dataset.hex ?? "");
      const hitTarget = marker.querySelector<SVGCircleElement>(".campaign-known-site__hit-target");
      return marker.getAttribute("role") === "button"
        && marker.getAttribute("tabindex") === "0"
        && marker.querySelectorAll(".campaign-known-site__sprite[data-authoritative-anchor='true']").length === 1
        && !marker.querySelector(".campaign-known-site__badge-ring")
        && Boolean(center && hitTarget && Number(hitTarget.getAttribute("r")) > 0
          && circleStaysInsideFlatTopHex(center, registeredRadius, hitTarget, 1))
        && !marker.querySelector("title")
        && !/select for|source:|representative ten-kilometer sector/i.test(
          `${marker.querySelector(".campaign-known-site-disclosure")?.textContent ?? ""} ${marker.getAttribute("aria-label") ?? ""}`
        );
    });
    const siteDisclosureLinesAreBounded = Array.from(
      svg.querySelectorAll<SVGTextElement>(".campaign-known-site-disclosure__line")
    ).every((line) => (line.textContent?.length ?? 0) <= 38);
    if (knownSiteMarkers.length !== 24
      || [...expectedKnownLabels].some((label) => permanentLabels.has(label))
      || !siteMarkerContractHolds
      || !siteDisclosureLinesAreBounded) {
      throw new Error(`Known-site disclosure ownership regressed: ${JSON.stringify({
        sites: knownSiteMarkers.length,
        siteMarkerContractHolds,
        siteDisclosureLinesAreBounded
      })}.`);
    }
  });

  await Then("Douvres uses safe recon presentation and every marker preserves pointer and keyboard selection parity", () => {
    const douvres = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="briefed_douvres"]');
    const douvresSprite = douvres?.querySelector<SVGImageElement>(".campaign-known-site__sprite");
    const activations: Array<{ hexKey: string; hasTile: boolean }> = [];
    renderer.onHexClick((hexKey, tile) => activations.push({ hexKey, hasTile: Boolean(tile) }));
    douvres?.querySelector(".campaign-known-site__hit-target")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    douvres?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    douvres?.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    if (!douvres
      || douvres.dataset.markerSpriteKey !== "intelNode"
      || !douvresSprite?.getAttribute("href")?.includes("Recon_Icon.png")
      || douvresSprite.getAttribute("href")?.includes("Airbase")
      || !douvres.getAttribute("aria-label")?.includes("briefed intel node")
      || activations.length !== 3
      || activations.some((activation) => activation.hexKey !== douvres.dataset.hex || activation.hasTile)) {
      throw new Error(`Overview activation or Douvres presentation diverged: ${JSON.stringify({ activations, marker: douvres?.outerHTML })}.`);
    }
    if (svg.outerHTML.includes("716th surviving coastal artillery group")) {
      throw new Error("A hidden Douvres runtime formation leaked through the safe known-site marker.");
    }
  });

  await Then("sequential pointer and focus disclosures lift above the map, then restore without stacking", async () => {
    const azeville = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="briefed_azeville_crisbecq"]');
    const disclosure = azeville?.querySelector<SVGGElement>(".campaign-known-site-disclosure");
    const longues = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="briefed_longues"]');
    const secondDisclosure = longues?.querySelector<SVGGElement>(".campaign-known-site-disclosure");
    const overlay = svg.querySelector<SVGGElement>("#campaign-map-transient-disclosures");
    const viewportChildren = Array.from(overlay?.parentElement?.children ?? []);
    azeville?.dispatchEvent(new window.MouseEvent("pointerenter", { bubbles: false }));
    const overlayIsLast = viewportChildren[viewportChildren.length - 1] === overlay;
    if (!azeville
      || !disclosure
      || !longues
      || !secondDisclosure
      || disclosure.parentNode !== overlay
      || !disclosure.classList.contains("is-open")
      || !overlayIsLast
      || overlay?.querySelectorAll(".campaign-known-site-disclosure").length !== 1) {
      throw new Error(`Transient disclosure stacking regressed: ${JSON.stringify({
        hasMarker: Boolean(azeville),
        hasDisclosure: Boolean(disclosure),
        overlayIsLast,
        disclosureParent: (disclosure?.parentNode as Element | null)?.id,
        isOpen: disclosure?.classList.contains("is-open"),
        overlayDisclosureCount: overlay?.querySelectorAll(".campaign-known-site-disclosure").length ?? 0
      })}.`);
    }

    azeville.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: false }));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 24));
    if (disclosure.parentNode !== azeville
      || disclosure.classList.contains("is-open")
      || overlay?.querySelector(".campaign-known-site-disclosure")) {
      throw new Error("Pointer disclosure did not collapse back into its owning marker.");
    }

    longues.focus();
    if (secondDisclosure.parentNode !== overlay
      || !secondDisclosure.classList.contains("is-open")
      || overlay?.querySelectorAll(".campaign-known-site-disclosure").length !== 1) {
      throw new Error("Keyboard disclosure did not become the sole top-layer disclosure.");
    }
    longues.blur();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 24));
    if (secondDisclosure.parentNode !== longues
      || secondDisclosure.classList.contains("is-open")
      || overlay?.querySelector(".campaign-known-site-disclosure")) {
      throw new Error("Keyboard disclosure did not restore to its owning marker after blur.");
    }
  });
});

registerTest("FSG_CAM_037_MARKERS_REMAIN_LEGIBLE_CLICKABLE_AND_NON_OVERLAPPING", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "campaignDensityContractMap";
  canvas.appendChild(svg);
  document.body.appendChild(canvas);
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const view = buildCampaignMapView(scenario, createCampaignKnowledgeState(scenario, "Player", 0), 0);
  const renderer = new CampaignMapRenderer();

  await Given("all independently selectable base and known-site markers in the shipped theater", () => {
    renderer.render(svg, canvas as HTMLDivElement, view);
  });

  await When("semantic density tiers are applied across supported overview and detail zooms", () => {});

  await Then("selected and tier-priority markers stay bounded while lower-priority markers leave pointer flow", () => {
    const root = svg.querySelector<SVGGElement>("#viewportRoot");
    const markers = Array.from(svg.querySelectorAll<SVGGElement>(".campaign-base-marker, .campaign-known-site"));
    const selected = markers[0];
    const selectedHex = selected?.dataset.hex;
    if (!root || !selected || !selectedHex) throw new Error("Density contract fixture did not render an addressable campaign marker.");
    renderer.highlightHex(selectedHex, "selected");
    const viewport = new MapViewport("#campaignDensityContractMap", null, 0.1);
    viewport.setViewportRoot(root);
    const registeredRadius = 1024 / (2 + 1.5 * (view.scenario.dimensions.cols - 1));
    const violations: string[] = [];
    let priorVisibleCount = 0;
    for (const zoom of [0.1, 0.34, 0.714, 1, 1.5]) {
      viewport.setTransform(zoom, 0, 0);
      const density = root.dataset.campaignMapDensity;
      const visible = markers.filter((marker) => marker.classList.contains("is-selected")
        || density === "detail"
        || (density === "operational" && marker.dataset.densityTier === "operational"));
      const hidden = markers.filter((marker) => !visible.includes(marker));
      if (!density || markers.some((marker) => !["operational", "detail"].includes(marker.dataset.densityTier ?? ""))) {
        violations.push(`zoom ${zoom}: missing explicit viewport or marker density tier`);
      }
      if (!visible.includes(selected)) violations.push(`zoom ${zoom}: selected marker was density-hidden`);
      if (zoom === 0.1 && (visible.length !== 1 || hidden.length === 0)) {
        violations.push(`zoom ${zoom}: theater tier kept ${visible.length}/${markers.length} independent markers in pointer flow`);
      }
      if (visible.length < priorVisibleCount) violations.push(`zoom ${zoom}: disclosure regressed from ${priorVisibleCount} to ${visible.length}`);
      priorVisibleCount = visible.length;

      const markerScale = Number(root.style.getPropertyValue("--campaign-map-marker-scale"));
      const geometry = visible.map((marker, index) => {
        const sprite = marker.querySelector<SVGImageElement>(".campaign-base-marker__sprite, .campaign-known-site__sprite");
        const target = marker.querySelector<SVGCircleElement>(".campaign-base-marker__hit-target, .campaign-known-site__hit-target");
        const center = renderer.getHexCenter(marker.dataset.hex ?? "");
        const visualDiameter = Number(sprite?.getAttribute("width")) * zoom * markerScale;
        const hitRadius = Number(target?.getAttribute("r")) * zoom;
        if (!center || !sprite || !target || visualDiameter <= 0
          || !imageStaysInsideFlatTopHex(center, registeredRadius, sprite, markerScale)
          || !circleStaysInsideFlatTopHex(center, registeredRadius, target, 1)) {
          violations.push(`zoom ${zoom}: marker ${index} escapes its authored cell`);
        }
        return {
          index,
          identity: marker.dataset.baseName ?? marker.dataset.knownSiteId ?? `marker-${index}`,
          hex: marker.dataset.hex ?? "unknown",
          cx: Number(target?.getAttribute("cx")),
          cy: Number(target?.getAttribute("cy")),
          hitRadius
        };
      });
      geometry.forEach((left, leftIndex) => geometry.slice(leftIndex + 1).forEach((right) => {
        const separation = Math.hypot(left.cx - right.cx, left.cy - right.cy) * zoom;
        if (separation <= Math.max(left.hitRadius, right.hitRadius)) {
          violations.push(`zoom ${zoom}: ${left.identity} (${left.hex}) target captures ${right.identity} (${right.hex}) center at ${separation.toFixed(2)}px`);
        }
      }));
    }

    const shellCss = readFileSync("index.html", "utf8");
    const theaterHidesSecondaryPointerFlow = /data-campaign-map-density="theater"[\s\S]{0,320}display:\s*none;[\s\S]{0,80}pointer-events:\s*none;/.test(shellCss);
    const theaterSelectedMarkerYieldsPointerFlow = /data-campaign-map-density="theater"[\s\S]{0,260}\.campaign-base-marker\.is-selected[\s\S]{0,260}pointer-events:\s*none;/.test(shellCss);
    const operationalHidesDetailPointerFlow = /data-campaign-map-density="operational"[\s\S]{0,240}data-density-tier="detail"[\s\S]{0,240}display:\s*none;[\s\S]{0,80}pointer-events:\s*none;/.test(shellCss);
    const campaignCss = readFileSync("src/ui/campaign/styles/campaign-command.css", "utf8");
    const mapListAlternative = /\.campaign-map-list-entry\s*\{[\s\S]{0,160}min-height:\s*46px/.test(campaignCss);
    if (!theaterHidesSecondaryPointerFlow) violations.push("theater-hidden markers remain in pointer flow");
    if (!theaterSelectedMarkerYieldsPointerFlow) violations.push("theater selected marker still captures neighboring 10 km hexes");
    if (!operationalHidesDetailPointerFlow) violations.push("operational-hidden detail markers remain in pointer flow");
    if (!mapListAlternative) violations.push("bounded overview markers lack a full-size Map list selection path");

    if (markers.length !== 31 || violations.length > 0) {
      throw new Error(`Campaign semantic-zoom density is not first-class: ${JSON.stringify({
        markerCount: markers.length,
        violations: violations.slice(0, 16),
        totalViolations: violations.length
      })}.`);
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
      spriteKey: "navalBase",
      category: "enemyInstallation",
      locationPrecision: "fixed"
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
        spriteKey: "logisticsHub",
        category: "enemyInstallation",
        locationPrecision: "fixed",
        relatedLocations: []
      }],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });

  await When("both intelligence records are rendered", () => {});

  await Then("two bounded markers retain distinct in-cell anchors without exposing a raw role ID", () => {
    const center = renderer.getHexCenter("1,1");
    const contactToken = svg.querySelector<SVGCircleElement>('.campaign-intel-contact[data-contact-id="contact-colocated"] circle:not(.campaign-intel-uncertainty)');
    const site = svg.querySelector<SVGGElement>('.campaign-known-site[data-known-site-id="site-colocated"]');
    const siteRing = site?.querySelector<SVGCircleElement>(".campaign-known-site__hit-target") ?? null;
    const contactX = Number(contactToken?.getAttribute("cx"));
    const siteX = Number(siteRing?.getAttribute("cx"));
    const registeredRadius = 1024 / (2 + 1.5 * (scenario.dimensions.cols - 1));
    const accessibleName = site?.getAttribute("aria-label") ?? "";
    if (!center || !contactToken || !siteRing
      || contactX <= center.cx || Math.abs(siteX - center.cx) > 0.001
      || contactX === siteX
      || !circleStaysInsideFlatTopHex(center, registeredRadius, contactToken, 1)
      || !circleStaysInsideFlatTopHex(center, registeredRadius, siteRing, 1)
      || !accessibleName.includes("briefed logistics hub")
      || accessibleName.includes("logisticsHub")) {
      throw new Error(`Colocated intelligence lost a bounded distinct anchor or safe label: ${JSON.stringify({ contactX, siteX, accessibleName })}.`);
    }
  });
});
