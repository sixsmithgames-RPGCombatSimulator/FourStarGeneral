import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
registerTest("BATTLESCREEN_AUTO_SENTRY_APPLIES_TO_EACH_IDLE_STACK_MEMBER_BEFORE_TURN_ADVANCE", async ({ Given, When, Then }) => {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
        root.id = "battleScreen";
        document.body.appendChild(root);
    }
    const enterCalls = [];
    let renderCount = 0;
    let executedAdvance = false;
    const fakeEngine = {
        playerUnits: [
            {
                type: "Infantry_42",
                hex: { q: 3, r: 2 },
                strength: 100,
                experience: 0,
                ammo: 6,
                fuel: 0,
                entrench: 0,
                facing: "NW",
                unitId: "stack-alpha"
            },
            {
                type: "Flak_88",
                hex: { q: 3, r: 2 },
                strength: 100,
                experience: 0,
                ammo: 6,
                fuel: 0,
                entrench: 0,
                facing: "NW",
                unitId: "stack-bravo"
            }
        ],
        enterSentry(_hex, unitId) {
            if (unitId) {
                enterCalls.push(unitId);
            }
            return Boolean(unitId);
        }
    };
    const fakeBattleState = {
        ensureGameEngine: () => fakeEngine,
        getIdlePlayerUnitKeys: () => ["3,2"]
    };
    let screen;
    await Given("an idle warning with two player units stacked on one idle hex", async () => {
        screen = new BattleScreen({}, fakeBattleState, {}, null, null, null, null, null, null, null);
        screen.pendingIdleTurnAdvance = { summary: { phase: "playerTurn" } };
        screen.dismissIdleWarning = () => { };
        screen.renderEngineUnits = () => {
            renderCount += 1;
        };
        screen.executeTurnAdvance = async () => {
            executedAdvance = true;
        };
        screen.completeTutorialPhase = () => { };
    });
    await When("the player confirms the turn advance", async () => {
        screen.finalizeTurnAfterIdleWarning();
    });
    await Then("each stack member should be sentried individually before the turn advances", async () => {
        if (enterCalls.length !== 2) {
            throw new Error(`Expected both idle stack members to enter sentry, saw ${JSON.stringify(enterCalls)}.`);
        }
        if (!enterCalls.includes("stack-alpha") || !enterCalls.includes("stack-bravo")) {
            throw new Error(`Expected stack-specific sentry calls for both units, saw ${JSON.stringify(enterCalls)}.`);
        }
        if (renderCount !== 1) {
            throw new Error(`Expected unit rendering to refresh once after auto-sentry, saw ${renderCount}.`);
        }
        if (!executedAdvance) {
            throw new Error("Expected turn advance to continue after auto-sentry finishes.");
        }
    });
});
