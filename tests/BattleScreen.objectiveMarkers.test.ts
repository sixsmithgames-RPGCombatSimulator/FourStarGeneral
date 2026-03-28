import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

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
