import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { normalizeFacingDirection } from "../src/core/types";
import { GameEngine } from "../src/game/GameEngine";
registerTest("FACING_DIRECTION_NORMALIZES_LEGACY_SCENARIO_VALUES", async ({ Then }) => {
    await Then("legacy north and south facings convert to the shared edge directions", async () => {
        if (normalizeFacingDirection("N") !== "NW") {
            throw new Error(`Expected legacy N to normalize to NW, received ${normalizeFacingDirection("N")}.`);
        }
        if (normalizeFacingDirection("S") !== "SE") {
            throw new Error(`Expected legacy S to normalize to SE, received ${normalizeFacingDirection("S")}.`);
        }
        if (normalizeFacingDirection("E") !== "E") {
            throw new Error(`Expected edge-based E to remain stable, received ${normalizeFacingDirection("E")}.`);
        }
    });
});
registerTest("GAME_ENGINE_RESOLVE_FACING_TOWARD_USES_EDGE_DIRECTION_LABELS", async ({ Then }) => {
    const resolveFacingToward = GameEngine.prototype.resolveFacingToward;
    await Then("movement headings resolve to the matching edge-facing labels", async () => {
        if (resolveFacingToward.call({}, { q: 0, r: 0 }, { q: 1, r: 0 }) !== "E") {
            throw new Error("Expected eastward movement to resolve to facing E.");
        }
        if (resolveFacingToward.call({}, { q: 0, r: 0 }, { q: 1, r: -1 }) !== "NE") {
            throw new Error("Expected north-east movement to resolve to facing NE.");
        }
        if (resolveFacingToward.call({}, { q: 0, r: 0 }, { q: 0, r: 1 }) !== "SE") {
            throw new Error("Expected south-east movement to resolve to facing SE.");
        }
    });
});
