import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";

registerTest("HEXMAP_OBJECTIVE_MARKERS_DO_NOT_BLOCK_HEX_ORDERS", async ({ Given, When, Then }) => {
  const renderer = new HexMapRenderer();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const viewportRoot = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const cell = document.createElementNS("http://www.w3.org/2000/svg", "g");

  await Given("a rendered tactical hex that also carries an objective marker", () => {
    cell.dataset.cx = "120";
    cell.dataset.cy = "96";
    viewportRoot.appendChild(cell);
    svg.appendChild(viewportRoot);
    (renderer as any).svgElement = svg;
    (renderer as any).viewportRoot = viewportRoot;
    (renderer as any).hexElementMap = new Map([["4,5", cell]]);
  });

  await When("the objective marker is mounted above the hex", () => {
    renderer.renderObjectiveMarker("4,5", { status: "unoccupied" });
  });

  await Then("the marker is pointer-transparent so the underlying hex still receives orders", () => {
    const marker = svg.querySelector<SVGGElement>(".objective-marker");
    if (!marker) {
      throw new Error("Expected the tactical objective marker to render.");
    }
    if (marker.getAttribute("pointer-events") !== "none") {
      throw new Error("Objective marker can intercept the underlying hex click.");
    }
  });
});

registerTest("BATTLESCREEN_PATROL_OBJECTIVE_MARKERS_USE_TOWN_STATUS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let clearCalls = 0;
  const renderedMarkers: Array<{ hexKey: string; tooltip?: string; status?: string }> = [];

  await Given("a patrol mission status with explicit town marker metadata", async () => {
    document.body.innerHTML = "<div id=\"battleScreen\"></div>";

    const fakeRenderer = {
      clearObjectiveMarkers() {
        clearCalls += 1;
      },
      renderObjectiveMarker(hexKey: string, options?: { tooltip?: string; status?: "unoccupied" | "player" | "enemy" }) {
        renderedMarkers.push({
          hexKey,
          tooltip: options?.tooltip,
          status: options?.status
        });
      }
    } as any;

    screen = new BattleScreen(
      {} as any,
      {} as any,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      null,
      null,
      null,
      { selectedMission: "patrol" } as any
    );

    (screen as any).scenario = {
      objectives: [{ hex: { q: 14, r: -5 }, owner: "Player", vp: 250 }]
    } as any;
    (screen as any).missionStatus = {
      turn: 3,
      objectives: [
        {
          id: "primary_repel_enemy",
          label: "Repel the enemy assault and keep the town in friendly hands",
          tier: "primary",
          state: "inProgress",
          detail: "Friendly forces are holding the town center."
        }
      ],
      outcome: { state: "inProgress" },
      markers: [
        {
          hex: { q: 14, r: -5 },
          status: "player",
          tooltip: "Town center - Defenders holding."
        }
      ]
    };
  });

  await When("objective markers are refreshed", async () => {
    (screen as any).updateObjectiveMarkers();
  });

  await Then("the renderer uses the town marker metadata instead of ford parsing", async () => {
    if (clearCalls !== 1) {
      throw new Error(`Expected objective markers to clear once, received ${clearCalls}`);
    }
    if (renderedMarkers.length !== 1) {
      throw new Error(`Expected one town objective marker, received ${renderedMarkers.length}`);
    }
    if (renderedMarkers[0]?.hexKey !== "14,2") {
      throw new Error(`Expected town objective marker at offset 14,2, received ${renderedMarkers[0]?.hexKey}`);
    }
    if (!renderedMarkers[0]?.tooltip?.includes("Town")) {
      throw new Error(`Expected town marker tooltip, received ${renderedMarkers[0]?.tooltip ?? "<empty>"}`);
    }
    if (renderedMarkers[0]?.tooltip?.includes("Ford")) {
      throw new Error(`Expected town marker tooltip to avoid ford text, received ${renderedMarkers[0]?.tooltip}`);
    }
  });
});
