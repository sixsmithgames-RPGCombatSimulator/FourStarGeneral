import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { getSpriteForAllocationKey, getSpriteForScenarioType } from "../src/data/unitSpriteCatalog";
registerTest("UNITSPRITECATALOG_USES_FACTION_SPECIFIC_AIRCRAFT_ART", async ({ When, Then }) => {
    const resolved = {};
    await When("aircraft sprites are requested for both factions and player allocation cards", async () => {
        resolved.playerBomber = getSpriteForScenarioType("Bomber", "Player");
        resolved.botBomber = getSpriteForScenarioType("Bomber", "Bot");
        resolved.playerGroundAttack = getSpriteForScenarioType("Ground_Attack", "Player");
        resolved.botInterceptor = getSpriteForScenarioType("Interceptor", "Bot");
        resolved.playerEscort = getSpriteForScenarioType("Fighter", "Player");
        resolved.playerAllocationEscort = getSpriteForAllocationKey("fighter", "Player");
        resolved.groundFallback = getSpriteForScenarioType("Recon_Bike", "Bot");
    });
    await Then("the catalog should resolve the new faction-specific aircraft files while leaving ground art unchanged", async () => {
        if (!resolved.playerBomber?.includes("Aircraft_USA_B17.png")) {
            throw new Error(`Expected player bomber sprite to use B17 art, saw ${String(resolved.playerBomber)}.`);
        }
        if (!resolved.botBomber?.includes("Aircraft_German_HE177.png")) {
            throw new Error(`Expected enemy bomber sprite to use HE177 art, saw ${String(resolved.botBomber)}.`);
        }
        if (!resolved.playerGroundAttack?.includes("Aircraft_USA_B25.png")) {
            throw new Error(`Expected player strike aircraft sprite to use B25 art, saw ${String(resolved.playerGroundAttack)}.`);
        }
        if (!resolved.botInterceptor?.includes("Aircraft_German_FW190.png")) {
            throw new Error(`Expected enemy interceptor sprite to use FW190 art, saw ${String(resolved.botInterceptor)}.`);
        }
        if (!resolved.playerEscort?.includes("Aircraft_USA_P51.png")) {
            throw new Error(`Expected player escort sprite to use P51 art, saw ${String(resolved.playerEscort)}.`);
        }
        if (!resolved.playerAllocationEscort?.includes("Aircraft_USA_P51.png")) {
            throw new Error(`Expected player fighter allocation card to use P51 art, saw ${String(resolved.playerAllocationEscort)}.`);
        }
        if (!resolved.groundFallback?.includes("Recon_Bike.png")) {
            throw new Error(`Expected non-aircraft sprite lookup to remain unchanged, saw ${String(resolved.groundFallback)}.`);
        }
    });
});
